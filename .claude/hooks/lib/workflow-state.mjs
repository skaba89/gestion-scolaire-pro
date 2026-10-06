// HUMAN VALIDATION lock state, shared by the hooks.
// Written ONLY by workflow-gate.mjs (UserPromptSubmit = a real human message).
// Claude itself is denied any write to .claude/state/ (guard-files / guard-commands).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export function projectDir(payload = {}) {
  return process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
}

export function statePath(payload) {
  return path.join(projectDir(payload), ".claude", "state", "workflow.json");
}

export function readState(payload) {
  try {
    const p = statePath(payload);
    if (!existsSync(p)) return null;
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    // Unreadable state = fail closed: treat as awaiting approval.
    return { status: "awaiting-approval", command: "unknown", corrupted: true };
  }
}

export function writeState(payload, state) {
  const p = statePath(payload);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2));
}

export function isLocked(payload) {
  const s = readState(payload);
  return Boolean(s && s.status === "awaiting-approval");
}

export const LOCK_MESSAGE =
  "Verrou HUMAN VALIDATION actif : un plan est en attente de validation humaine. " +
  "Aucune modification n'est possible tant que l'utilisateur n'a pas répondu « OK » (ou /approve-plan). " +
  "Pour abandonner : /cancel-workflow.";
