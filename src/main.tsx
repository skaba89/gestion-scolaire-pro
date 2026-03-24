import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n/config";
import { initSentry } from "./lib/sentry";

const enableBootstrapDebug =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_BOOTSTRAP_DEBUG === "true";
const forceServiceWorkerReset = import.meta.env.VITE_FORCE_SW_RESET === "true";

function debugLog(...args: unknown[]) {
  if (enableBootstrapDebug) {
    console.log(...args);
  }
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
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
      debugLog("[SchoolFlow] unregistered service worker", registration.scope);
    }
  });
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
