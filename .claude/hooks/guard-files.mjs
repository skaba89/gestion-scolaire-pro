#!/usr/bin/env node
// PreToolUse guard for Read / Edit / Write / MultiEdit / NotebookEdit.
// - deny  : secrets (.env*, keys, backups, cloud logs) and edits to existing Alembic migrations
// - ask   : production-critical files (auth, RBAC, RLS, config, CI, infra, deps, guards)
// No dependencies; reads the hook payload on stdin, answers with hookSpecificOutput JSON.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { isLocked, LOCK_MESSAGE } from "./lib/workflow-state.mjs";

function respond(decision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  process.exit(0);
}

const tool = payload.tool_name || "";
const input = payload.tool_input || {};
const rawPath = input.file_path || input.notebook_path || input.path;
if (!rawPath) process.exit(0);

const projectDir = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
const absPath = path.resolve(projectDir, rawPath);
const rel = path.relative(projectDir, absPath).split(path.sep).join("/");
const base = path.posix.basename(rel).toLowerCase();
const insideProject = rel && !rel.startsWith("..") && !path.isAbsolute(rel);

// ── Secrets: never read or written, wherever they are ──────────────────────
const ENV_TEMPLATES = new Set([".env.example", ".env.docker.example", ".env.production.template", ".env.template"]);
const isEnvFile = /^\.env(\..+)?$/.test(base) && !ENV_TEMPLATES.has(base);
const isKeyFile = /\.(pem|key|p12|pfx)$/.test(base) || ["credentials.json", "firebase-adminsdk.json", "vapid_keys.json", "vapid.json"].includes(base);
const isSensitiveData = insideProject && (
  /^infra\/backups\//.test(rel) ||
  /^azure-logs/.test(rel) ||
  /^azure-log-full\.txt$/.test(rel) ||
  /\.(sql\.gz|dump)$/.test(base)
);
if (isEnvFile || isKeyFile || isSensitiveData) {
  respond("deny", `Fichier sensible protégé (${rel || rawPath}) : secrets, sauvegardes ou journaux cloud ne doivent pas être lus ni modifiés par Claude. Utilisez les templates (.env.example…) ou demandez à l'utilisateur.`);
}

if (tool === "Read" || !insideProject) process.exit(0);

// ── HUMAN VALIDATION lock state is written only by the UserPromptSubmit hook ─
if (/^\.claude\/state(\/|$)/.test(rel)) {
  respond("deny", "L'état du verrou HUMAN VALIDATION (.claude/state/) ne peut être modifié que par un message de l'utilisateur.");
}
if (isLocked(payload)) respond("deny", LOCK_MESSAGE);

// ── Applied migrations are immutable ───────────────────────────────────────
if (/^backend\/alembic\/versions\/[^/]+\.py$/.test(rel)) {
  if (existsSync(absPath)) {
    respond("deny", `Migration existante (${rel}) : une migration déjà écrite peut être appliquée en production et ne doit jamais être modifiée. Créez une nouvelle révision.`);
  }
  respond("ask", `Création d'une nouvelle migration (${rel}) : changement de schéma — confirmez qu'un plan validé couvre cette migration (réversible, idempotente, RLS, une seule head).`);
}

// ── Production-critical files: explicit human confirmation ─────────────────
const CRITICAL = [
  [/^backend\/app\/core\/operational_tables\.py$/, "importé par une migration historique — le modifier change rétroactivement le schéma"],
  [/^backend\/app\/core\/(security|database|tenant_resolution|config|client_ip|ssrf_protection)\.py$/, "auth / RBAC / RLS / configuration de sécurité"],
  [/^backend\/app\/api\/v1\/endpoints\/core\/(auth|mfa)\.py$/, "authentification / MFA"],
  [/^backend\/app\/middlewares\//, "middleware (tenant, quota, métriques)"],
  [/^backend\/alembic\/env\.py$|^backend\/alembic\.ini$/, "configuration Alembic"],
  [/^backend\/(requirements.*\.txt|start\.sh|Dockerfile.*)$/, "dépendances / démarrage backend"],
  [/^src\/lib\/permissions\.ts$/, "matrice RBAC frontend"],
  [/^src\/(contexts\/AuthContext\.tsx|api\/client\.ts)$/, "gestion du token / authentification frontend"],
  [/^\.github\//, "CI/CD"],
  [/^infra\//, "infrastructure"],
  [/^(docker\/|docker-compose[^/]*\.ya?ml$|Dockerfile[^/]*$|\.dockerignore$)/, "Docker / conteneurs"],
  [/^(render\.yaml|netlify\.toml|server\.mjs|capacitor\.config\.ts)$/, "configuration de déploiement"],
  [/^(package\.json|package-lock\.json)$/, "dépendances frontend"],
  [/^\.env\.(example|docker\.example|production\.template)$/, "templates de configuration"],
  [/^\.gitignore$/, "règles d'exclusion Git (risque de commit de secrets)"],
  [/^\.claude\/(settings\.json|hooks\/|agents\/)/, "protections Claude Code elles-mêmes (settings, hooks, restrictions des agents)"],
];
for (const [re, why] of CRITICAL) {
  if (re.test(rel)) {
    respond("ask", `Fichier critique (${rel}) — ${why}. Validation explicite requise : confirmez que cette modification fait partie d'un plan validé.`);
  }
}

process.exit(0);
