#!/usr/bin/env node
// PreToolUse guard for Bash / PowerShell commands.
// - deny : printing/copying secret env files, force push to main/master, --no-verify
// - ask  : destructive Git, migrations, destructive SQL, data/volume deletion,
//          cloud / deployment commands, mutating HTTP calls to non-local hosts
// No dependencies; reads the hook payload on stdin, answers with hookSpecificOutput JSON.
import { readFileSync } from "node:fs";
import { isReadOnlyCommand } from "./lib/readonly.mjs";
import { analyseSecretAccess } from "./lib/secrets.mjs";
import { isLocked, LOCK_MESSAGE } from "./lib/workflow-state.mjs";

function respond(decision, reasons) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision,
      permissionDecisionReason: reasons.join(" | "),
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
const cmd = String((payload.tool_input || {}).command || "");
if (!cmd.trim()) process.exit(0);

const deny = [];
const ask = [];
const has = (re) => re.test(cmd);

// ── HUMAN VALIDATION lock ──────────────────────────────────────────────────
// Reading the state (ls, cat, git check-ignore…) is harmless; only a command
// that is not read-only and names .claude/state is refused.
const readOnly = isReadOnlyCommand(cmd);
if (has(/\.claude[\/\\]+state/) && !readOnly.ok) deny.push("L'état du verrou HUMAN VALIDATION (.claude/state/) ne peut être modifié que par un message de l'utilisateur");
if (isLocked(payload) && !readOnly.ok) deny.push(`${LOCK_MESSAGE} (${readOnly.reason})`);

// ── Secrets ────────────────────────────────────────────────────────────────
// Analysed per command segment, on the program actually run and its
// arguments — not on free text (commit/PR messages, heredoc bodies, regex
// patterns such as "\.env"), which produced false positives.
const secrets = analyseSecretAccess(cmd);
deny.push(...secrets.deny);
ask.push(...secrets.ask);

// ── Git ────────────────────────────────────────────────────────────────────
if (has(/--no-verify\b/)) deny.push("--no-verify interdit : ne jamais contourner les hooks Git");
if (has(/\bgit\b[^|;&]*\bpush\b/)) {
  const force = has(/\bpush\b[^|;&]*(--force\b|--force-with-lease|\s-f\b|\s\+[\w./-]+)/);
  if (force && has(/\b(main|master)\b/)) deny.push("Force push vers main/master interdit");
  else if (force) ask.push("Force push (réécriture d'historique distant)");
  else if (has(/\bpush\b[^|;&]*(--delete\b|\s-d\b|\s:[\w./-]+)/)) ask.push("Suppression de branche/tag distant");
  else ask.push("git push (publication vers le dépôt distant)");
}
const GIT_ASK = [
  [/\bgit\b[^|;&]*\bbranch\b[^|;&]*(\s-d\b|\s-D\b|--delete\b)/, "suppression de branche locale"],
  [/\bgit\b[^|;&]*\breset\b[^|;&]*--hard\b/, "git reset --hard (perte de modifications)"],
  [/\bgit\b[^|;&]*\bclean\b[^|;&]*\s-[a-z]*f/i, "git clean (suppression de fichiers non suivis)"],
  [/\bgit\b[^|;&]*\bcheckout\b[^|;&]*(\s--\s|\s\.\s*$|\s\.(?=\s|$))/, "git checkout -- (écrasement de modifications locales)"],
  [/\bgit\b[^|;&]*\brestore\b(?![^|;&]*--staged)/, "git restore (écrasement de modifications locales)"],
  [/\bgit\b[^|;&]*\brebase\b/, "git rebase (réécriture d'historique)"],
  [/\bgit\b[^|;&]*\bcommit\b[^|;&]*--amend\b/, "git commit --amend (réécriture d'historique)"],
  [/\bgit\b[^|;&]*\bstash\b[^|;&]*\b(drop|clear)\b/, "suppression de stash"],
  [/\bgit\b[^|;&]*\b(filter-branch|filter-repo|update-ref\s+-d|reflog\s+expire)\b/, "réécriture/suppression d'historique"],
  [/\bgit\b[^|;&]*\bgc\b[^|;&]*--prune/, "git gc --prune"],
  [/\bgit\b[^|;&]*\btag\b[^|;&]*(\s-d\b|--delete\b)/, "suppression de tag"],
  [/\bgit\b[^|;&]*\bworktree\b[^|;&]*\bremove\b/, "suppression de worktree"],
];
for (const [re, why] of GIT_ASK) if (has(re)) ask.push(why);

// ── GitHub CLI ─────────────────────────────────────────────────────────────
if (has(/\bgh\s+(pr\s+merge|repo\s+(delete|rename|edit)|workflow\s+run|run\s+rerun|release\s+(create|delete|edit)|secret\s+|variable\s+(set|delete)|api\b[^|;&]*-X\s*(POST|PUT|PATCH|DELETE))/i)) {
  ask.push("Action GitHub à effet externe (merge, workflow, release, secret, API mutante)");
}

// ── Migrations & destructive SQL ───────────────────────────────────────────
if (has(/\balembic\b[^|;&]*\b(upgrade|downgrade|stamp)\b/)) ask.push("Exécution de migration Alembic (vérifiez la base ciblée : jamais une base distante sans accord)");
if (has(/\b(psql|sqlite3|pg_restore|mysql|docker\s+(compose\s+)?exec|python3?\s+-c)\b/) && has(/\b(DROP\s+(TABLE|DATABASE|SCHEMA|COLUMN|ROLE|POLICY)|TRUNCATE|DELETE\s+FROM|ALTER\s+TABLE[^;]*\bDROP\b|UPDATE\s+\w+\s+SET)\b/i)) {
  ask.push("SQL destructif ou mutant (DROP/TRUNCATE/DELETE/UPDATE)");
}
if (has(/restore-database\.sh|\bpg_restore\b|\bdropdb\b/)) ask.push("Restauration/suppression de base de données");

// ── Data / filesystem deletion ─────────────────────────────────────────────
if (has(/\bdocker\b[^|;&]*\b(down\b[^|;&]*(\s-v\b|--volumes)|volume\s+(rm|prune)|system\s+prune|rm\s+-f)/)) ask.push("Suppression de volumes/conteneurs Docker (perte de données)");
if (has(/\brm\s+(-[a-z]*r[a-z]*|--recursive)\b/i) || has(/\bRemove-Item\b[^|;&]*-Recurse/i) || has(/\b(rmdir|rd)\s+\/s\b/i) || has(/\bdel\s+\/s\b/i)) ask.push("Suppression récursive de fichiers");

// ── Cloud / deployment ─────────────────────────────────────────────────────
if (has(/(^|[\s;&|(])(az|aws|gcloud|kubectl|helm|flyctl|vercel|doctl)\s/) || has(/\bterraform\s+(apply|destroy|import|state)\b/) || has(/\b(netlify|render)\s+deploy\b/) || has(/\bnpm\s+publish\b/)) {
  ask.push("Commande cloud / déploiement / publication (environnement potentiellement de production)");
}

// ── Mutating HTTP calls to non-local hosts ─────────────────────────────────
const httpTool = has(/\b(curl|wget|Invoke-WebRequest|Invoke-RestMethod|iwr|irm|http)\b/i);
const mutating = has(/(-X\s*(POST|PUT|PATCH|DELETE)\b|--request\s+(POST|PUT|PATCH|DELETE)|\s(-d|--data[\w-]*|-F|--form)\s|-Method\s+(Post|Put|Patch|Delete))/i);
const remote = has(/https?:\/\/(?!(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?[\/\s'"]|(localhost|127\.0\.0\.1)$)/i);
if (httpTool && mutating && remote) ask.push("Requête HTTP mutante vers un hôte non local (possible environnement de production)");

if (deny.length) respond("deny", deny);
if (ask.length) respond("ask", ["Validation explicite requise", ...ask]);
process.exit(0);
