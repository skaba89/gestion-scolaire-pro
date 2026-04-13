import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n/config";
import { initSentry } from "./lib/sentry";

// =============================================================================
// Trusted Types Policy — must be before any SW registration or script injection
// =============================================================================
// Creates a default Trusted Types policy that passes through URLs/HTML as-is.
// This replaces the CSP "require-trusted-types-for 'script'" directive (which
// blocked ServiceWorker registration) while maintaining DOM XSS protection.
// =============================================================================
if (
  typeof window !== "undefined" &&
  window.trustedTypes &&
  !window.trustedTypes.defaultPolicy
) {
  window.trustedTypes.createPolicy("default", {
    createScriptURL: (url: string) => {
      // Only allow same-origin and localhost script URLs
      if (url.startsWith('/') || url.startsWith(window.location.origin) || /^https?:\/\/localhost(:\d+)?\//.test(url)) {
        return url;
      }
      throw new Error(`Trusted Types: blocked script URL: ${url}`);
    },
    createHTML: (html: string) => {
      // SECURITY: Sanitize HTML through DOMPurify when available to prevent XSS
      if (window.DOMPurify) {
        return window.DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
      }
      // Fallback: strip all tags if DOMPurify is not loaded
      return html.replace(/<[^>]*>/g, '');
    },
  });
}

const enableBootstrapDebug =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_BOOTSTRAP_DEBUG === "true";
const forceServiceWorkerReset =
  import.meta.env.VITE_FORCE_SW_RESET === "true" ||
  (!import.meta.env.DEV && window.location.hostname.endsWith("onrender.com"));

function debugLog(..._args: unknown[]): void {
  // intentionally empty — debug logging removed
}

function renderRuntimeOverlay(message: string) {
  if (!enableBootstrapDebug) {
    return;
  }

  const existingOverlay = document.getElementById("schoolflow-runtime-error-overlay");
  if (existingOverlay) {
    existingOverlay.textContent = message;
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = "schoolflow-runtime-error-overlay";
  overlay.style.padding = "12px";
  overlay.style.color = "white";
  overlay.style.background = "rgba(220, 38, 38, 0.92)";
  overlay.style.position = "fixed";
  overlay.style.bottom = "12px";
  overlay.style.right = "12px";
  overlay.style.zIndex = "10000";
  overlay.style.fontSize = "12px";
  overlay.style.maxWidth = "420px";
  overlay.style.borderRadius = "8px";
  overlay.textContent = message;
  document.body.appendChild(overlay);
}

initSentry();

if (enableBootstrapDebug) {
  (window as Window & { React?: unknown }).React = StrictMode;
  debugLog("[SchoolFlow] bootstrap start", window.location.origin);
}

if (forceServiceWorkerReset && "serviceWorker" in navigator) {
  // Register the killer SW to replace any leftover Workbox/PWA SW.
  // It will skipWaiting(), claim clients, clear all caches, and self-unregister.
  navigator.serviceWorker
    .register("/sw.js", { scope: "/" })
    .then((reg) => {
      debugLog("[SchoolFlow] killer SW registered, will clean up caches");
    })
    .catch(() => {
      // If registration fails, fall through to manual cleanup
    });

  // Also directly unregister all existing SWs as a fallback
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
      debugLog("[SchoolFlow] unregistered service worker", registration.scope);
    }
  });

  if (window.caches) {
    window.caches.keys().then((keys) => Promise.all(keys.map((key) => window.caches.delete(key))));
  }
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  const message = "Root element not found";
  console.error(message);
  renderRuntimeOverlay(message);
} else {
  try {
    const root = createRoot(rootElement);
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  } catch (error) {
    const message = `Fatal render error: ${error instanceof Error ? error.message : String(error)}`;
    console.error(message, error);
    renderRuntimeOverlay(message);
  }
}

window.addEventListener("error", (event) => {
  if (!enableBootstrapDebug) {
    return;
  }

  renderRuntimeOverlay(`Runtime error: ${event.message}`);
});
