/**
 * generate-redirects.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Exécuté après `npm run build` par Netlify.
 * Injecte les règles de proxy API dans dist/_redirects à partir de VITE_API_URL.
 *
 * Pourquoi un script plutôt que netlify.toml ?
 *   netlify.toml ne supporte PAS les variables d'environnement dans les URLs
 *   de redirection. Ce script les injecte au moment du build.
 *
 * Usage (local) :
 *   VITE_API_URL=https://schoolflow-api.onrender.com node scripts/generate-redirects.mjs
 *
 * Netlify Dashboard → Site settings → Env vars :
 *   VITE_API_URL = https://schoolflow-api-xxxx.onrender.com   ← OBLIGATOIRE
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, "..", "dist");
const REDIRECTS_FILE = path.join(DIST_DIR, "_redirects");

const apiUrl = (process.env.VITE_API_URL || "").replace(/\/$/, "");

if (!apiUrl) {
  console.warn(
    "⚠️  VITE_API_URL non défini — les règles de proxy API ne seront pas générées.\n" +
    "   Définis VITE_API_URL dans Netlify Dashboard → Site settings → Env vars.\n" +
    "   Exemple : VITE_API_URL=https://schoolflow-api-xxxx.onrender.com"
  );
}

// Règles proxy — DOIVENT être AVANT le catch-all SPA (/* → /index.html)
// dist/_redirects remplace public/_redirects (Vite le copie au build)
const proxyRules = apiUrl
  ? [
      `# ── API Proxy (généré par generate-redirects.mjs) ──────────────────────`,
      `/api/v1/*   ${apiUrl}/api/v1/:splat   200`,
      `/api-proxy/health   ${apiUrl}/health/   200`,
      `/api-proxy/*   ${apiUrl}/:splat   200`,
      ``,
      `# ── SPA fallback ──────────────────────────────────────────────────────`,
    ].join("\n")
  : `# ⚠️  VITE_API_URL non défini — proxy API désactivé\n`;

// Lire le _redirects existant dans dist/ (copié depuis public/_redirects par Vite)
let existing = "";
try {
  existing = fs.readFileSync(REDIRECTS_FILE, "utf-8");
} catch {
  // Pas encore créé
}

// Insérer les règles proxy AVANT les règles SPA existantes
const finalContent = proxyRules + "\n" + existing;
fs.writeFileSync(REDIRECTS_FILE, finalContent, "utf-8");

console.log("✅ dist/_redirects généré :");
console.log(finalContent.split("\n").slice(0, 10).join("\n"));
if (apiUrl) {
  console.log(`   Backend proxied → ${apiUrl}`);
} else {
  console.log("   ⚠️  Aucun backend configuré (VITE_API_URL vide)");
}
