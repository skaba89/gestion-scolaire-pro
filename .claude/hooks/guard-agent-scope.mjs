#!/usr/bin/env node
// PreToolUse hook declared in an agent's frontmatter — enforces least privilege
// for that agent only (in addition to the project-wide guards).
//   mode "readonly" (review agents): no file edits at all; Bash/PowerShell limited
//                                    to the read-only allowlist (git read, grep, tests, lint…)
//   mode "tests"    (test-engineer):  edits limited to test files; same Bash allowlist
import { readFileSync } from "node:fs";
import path from "node:path";
import { isReadOnlyCommand, isTestPath } from "./lib/readonly.mjs";
import { projectDir } from "./lib/workflow-state.mjs";

const mode = process.argv[2] || "readonly";

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason },
  }));
  process.exit(0);
}

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  deny("Charge utile de hook illisible — refus par sécurité (agent à privilèges restreints).");
}
const tool = payload.tool_name || "";
const input = payload.tool_input || {};

if (["Edit", "Write", "MultiEdit", "NotebookEdit"].includes(tool)) {
  if (mode !== "tests") deny(`Agent de revue en lecture seule : l'outil ${tool} est interdit.`);
  const dir = projectDir(payload);
  const rel = path.relative(dir, path.resolve(dir, input.file_path || input.notebook_path || "")).split(path.sep).join("/");
  if (rel.startsWith("..") || !isTestPath(rel)) {
    deny(`test-engineer ne peut modifier que des fichiers de test (backend/tests/, tests/, src/**/__tests__/, *.test.*) — refusé : ${rel}`);
  }
  process.exit(0);
}

if (tool === "Bash" || tool === "PowerShell") {
  const verdict = isReadOnlyCommand(String(input.command || ""));
  if (!verdict.ok) deny(`Agent à privilèges restreints (${mode}) : ${verdict.reason}. Commandes permises : git status/diff/log/show, grep/rg/ls/cat, pytest, vitest run, eslint (sans --fix), tsc --noEmit, npm run lint/type-check/check:i18n/test/build, alembic heads/history.`);
}
process.exit(0);
