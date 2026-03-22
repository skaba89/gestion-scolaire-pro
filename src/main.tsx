import * as React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./i18n/config";
import { initSentry } from "./lib/sentry";

console.log("%c SCHOOLFLOW BOOTSTRAP START ", "background: #222; color: #bada55");
// Safety net for legacy libraries
(window as any).React = React;
console.log("React initialized, current origin:", window.location.origin);

// Initialization of error monitoring
initSentry();

// Force unregister any existing Service Workers that might be caching old code
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
        for (const registration of registrations) {
            registration.unregister();
            console.log('Force unregistered rogue ServiceWorker:', registration);
        }
    });
}

// Global error handling for white screen debugging
const rootElement = document.getElementById("root");

if (!rootElement) {
    console.error("Root element not found");
} else {
    try {
        const root = createRoot(rootElement!);
        root.render(<App />);
    } catch (e) {
        console.error("Render crash:", e);
        const errorDiv = document.createElement("div");
        errorDiv.style.padding = "20px";
        errorDiv.style.color = "red";
        errorDiv.style.background = "white";
        errorDiv.style.position = "fixed";
        errorDiv.style.top = "0";
        errorDiv.style.left = "0";
        errorDiv.style.zIndex = "9999";
        errorDiv.innerText = "Fatal Render Error: " + (e instanceof Error ? e.message : String(e));
        document.body.appendChild(errorDiv);
    }
}

window.addEventListener('error', (event) => {
    const errorMsg = document.createElement("div");
    errorMsg.style.padding = "10px";
    errorMsg.style.color = "white";
    errorMsg.style.background = "rgba(255, 0, 0, 0.8)";
    errorMsg.style.position = "fixed";
    errorMsg.style.bottom = "10px";
    errorMsg.style.right = "10px";
    errorMsg.style.zIndex = "10000";
    errorMsg.style.fontSize = "12px";
    errorMsg.innerText = "Runtime Error: " + event.message;
    document.body.appendChild(errorMsg);
});

