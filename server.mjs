// =============================================================================
// SchoolFlow Pro — Production SPA Server for Render
// =============================================================================
// Serves the Vite build output with reliable SPA fallback.
// Replaces "npx serve dist -s" which has intermittent routing issues.
// Usage: node server.mjs
// =============================================================================

import { createServer } from "http";
import { readFile, stat } from "fs/promises";
import { join, extname, posix } from "path";

const DIST_DIR = new URL("./dist", import.meta.url).pathname;
const PORT = process.env.PORT || 3000;

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

async function serveStatic(req, res) {
  let urlPath = req.url.split("?")[0]; // strip query string

  // Decode and normalize
  try {
    urlPath = decodeURIComponent(urlPath);
  } catch {
    // keep as-is if decode fails
  }

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
    });
    res.end(content);
  } catch (err) {
    console.error(`Error serving ${filePath}:`, err.message);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
}

const server = createServer(serveStatic);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`SchoolFlow Pro frontend serving on http://0.0.0.0:${PORT}`);
  console.log(`SPA fallback enabled — all routes serve ${FALLBACK}`);
});
