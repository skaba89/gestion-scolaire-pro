/**
 * SchoolFlow Pro — Runtime Configuration
 * ========================================
 * This file is loaded at runtime (NOT bundled by Vite).
 * Edit this file in the `dist/` folder AFTER building to configure
 * the API endpoint for your deployment environment.
 *
 * DO NOT edit the source file — it gets copied to dist/ at build time.
 * Instead, edit dist/config.js on your server or hosting platform.
 *
 * Examples:
 *   Render:     https://schoolflow-api-xxxx.onrender.com
 *   Railway:    https://schoolflow-api.up.railway.app
 *   Local:      http://localhost:8000
 */
window.__SCHOOLFLOW_CONFIG__ = {
  /**
   * Backend API base URL.
   * - Set to your backend URL (e.g. "https://schoolflow-api-xxxx.onrender.com")
   *   to bypass the /api-proxy and call the API directly.
   * - Set to "" (empty) to use the /api-proxy path (requires nginx proxy).
   */
  API_URL: "https://schoolflow-api-z6wt.onrender.com",
};
