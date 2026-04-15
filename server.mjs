// =============================================================================
// SchoolFlow Pro — Production SPA Server for Render
// =============================================================================
// Serves the Vite build output with reliable SPA fallback AND API proxy.
// Usage: node server.mjs
// =============================================================================

import { createServer } from "http";
import { readFile, stat, writeFile } from "fs/promises";
import { join, extname, posix } from "path";

const DIST_DIR = new URL("./dist", import.meta.url).pathname;
const PORT = process.env.PORT || 3000;

// Backend API URL (resolved from env or Render service discovery)
let BACKEND_URL = "";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".pdf": "application/pdf",
  ".wasm": "application/wasm",
  ".xml": "application/xml",
  ".webmanifest": "application/manifest+json",
};

const FALLBACK = join(DIST_DIR, "index.html");

// ─── API Proxy ───────────────────────────────────────────────────────────────
// Proxy /api/* and /api-proxy/* requests to the backend.
// This avoids CORS issues when the frontend and API are on different domains.

async function proxyRequest(req, res, urlPath) {
  if (!BACKEND_URL) {
    // No backend URL configured — return 502
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ detail: "Backend API not configured. Set VITE_API_URL environment variable." }));
    return;
  }

  // Build the backend URL: strip /api/ or /api-proxy/ prefix
  let backendPath = urlPath;
  if (backendPath.startsWith("/api/")) {
    backendPath = backendPath.slice(4); // remove "/api"
  } else if (backendPath.startsWith("/api-proxy/")) {
    backendPath = backendPath.slice(11); // remove "/api-proxy"
  } else if (backendPath === "/api" || backendPath === "/api-proxy") {
    backendPath = "/";
  }

  // Ensure path starts with /
  if (!backendPath.startsWith("/")) {
    backendPath = "/" + backendPath;
  }

  const targetUrl = new URL(backendPath, BACKEND_URL);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const headers = { ...req.headers };
    delete headers.host;
    // Forward original hostname so backend can generate correct CORS headers
    headers["x-forwarded-host"] = req.headers.host || "";
    headers["x-forwarded-proto"] = req.headers["x-forwarded-proto"] || "https";

    const response = await fetch(targetUrl.toString(), {
      method: req.method,
      headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? await drainBody(req) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    // Copy response headers
    const respHeaders = {};
    response.headers.forEach((value, key) => {
      // Skip hop-by-hop headers
      if (!["connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade"].includes(key)) {
        respHeaders[key] = value;
      }
    });

    // Add CORS headers for the browser
    const origin = req.headers.origin || "";
    if (origin) {
      respHeaders["access-control-allow-origin"] = origin;
      respHeaders["vary"] = "Origin";
      respHeaders["access-control-allow-credentials"] = "true";
    }

    res.writeHead(response.status, respHeaders);
    const body = await response.arrayBuffer();
    res.end(Buffer.from(body));
  } catch (err) {
    if (err.name === "AbortError") {
      res.writeHead(504, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ detail: "Backend request timed out" }));
    } else {
      console.error(`[proxy] Error proxying ${req.method} ${urlPath}:`, err.message);
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ detail: "Backend proxy error" }));
    }
  }
}

function drainBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", () => resolve(Buffer.alloc(0)));
  });
}

// ─── Static File Server ───────────────────────────────────────────────────────

async function serveStatic(req, res) {
  let urlPath = req.url.split("?")[0]; // strip query string

  // Decode and normalize
  try {
    urlPath = decodeURIComponent(urlPath);
  } catch {
    // keep as-is if decode fails
  }

  // ── API Proxy: intercept /api/* and /api-proxy/* ─────────────────────────
  if (urlPath.startsWith("/api/") || urlPath.startsWith("/api-proxy")) {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      const origin = req.headers.origin || "*";
      res.writeHead(204, {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, X-Tenant-ID, Content-Type, X-Request-ID, Accept",
        "Access-Control-Max-Age": "86400",
        "Access-Control-Allow-Credentials": "true",
        "Vary": "Origin",
      });
      res.end();
      return;
    }
    return proxyRequest(req, res, urlPath);
  }

  // ── Static Files ───────────────────────────────────────────────────────────
  // Prevent directory traversal
  const resolvedPath = posix.join("/", urlPath); // normalize to absolute path
  const filePath = join(DIST_DIR, resolvedPath);

  // Security: ensure filePath stays within DIST_DIR
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(filePath);

    if (fileStat.isDirectory()) {
      // Try index.html inside directory first
      const indexPath = join(filePath, "index.html");
      try {
        await stat(indexPath);
        await serveFile(indexPath, res);
        return;
      } catch {
        // Directory exists but no index.html → SPA fallback
      }
    } else {
      await serveFile(filePath, res);
      return;
    }
  } catch {
    // File/directory not found → SPA fallback
  }

  // SPA fallback: serve index.html for all unknown routes
  await serveFile(FALLBACK, res);
}

async function serveFile(filePath, res) {
  try {
    const content = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": ext === ".html" ? "no-cache, no-store, must-revalidate" : "public, max-age=31536000, immutable",
      // Security headers
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    });
    res.end(content);
  } catch (err) {
    console.error(`Error serving ${filePath}:`, err.message);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
}

// ─── Runtime Config ──────────────────────────────────────────────────────────

/**
 * Resolve the backend API URL from environment variables.
 * Supports: full URL, bare hostname, or Render service discovery.
 * Also generates dist/config.js for the frontend runtime config.
 */
function resolveBackendUrl() {
  const candidates = [
    process.env.VITE_API_URL,
    process.env.RENDER_EXTERNAL_URL,
    process.env.BACKEND_INTERNAL_URL,
  ].filter(Boolean);

  // Priority 1: Full URL (starts with http)
  let url = candidates.find(u => u.startsWith("http")) || "";

  // Priority 2: Bare hostname (e.g. from Render fromService.host)
  if (!url) {
    const bareHost = candidates.find(u => u.includes("."));
    if (bareHost) {
      url = `https://${bareHost.replace(/^https?:\/\//, "")}`;
    }
  }

  // Strip trailing slash
  if (url.endsWith("/")) {
    url = url.slice(0, -1);
  }

  BACKEND_URL = url;
  return url;
}

async function generateRuntimeConfig() {
  const apiUrl = resolveBackendUrl();

  // Also generate config.js for frontend runtime config (window.__SCHOOLFLOW_CONFIG__)
  // Use /api as the API_URL so the frontend sends requests through our proxy
  const configUrl = BACKEND_URL ? "/api" : "";

  if (configUrl) {
    const configPath = join(DIST_DIR, "config.js");
    const content = `// Auto-generated by server.mjs at startup — do not edit manually
window.__SCHOOLFLOW_CONFIG__ = {
  API_URL: "${configUrl}",
};
`;
    await writeFile(configPath, content, "utf-8");
    console.log(`[config] Runtime API_URL set to: ${configUrl} (backend proxy: ${BACKEND_URL})`);
  } else {
    console.warn("[config] WARNING: No VITE_API_URL set — API calls will fail!");
  }
}

// ─── Server Startup ──────────────────────────────────────────────────────────

const server = createServer(serveStatic);

server.listen(PORT, "0.0.0.0", async () => {
  await generateRuntimeConfig();
  console.log(`SchoolFlow Pro frontend serving on http://0.0.0.0:${PORT}`);
  console.log(`Backend proxy: ${BACKEND_URL || "(not configured)"}`);
  console.log(`SPA fallback enabled — all routes serve ${FALLBACK}`);
});
