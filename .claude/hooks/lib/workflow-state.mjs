// HUMAN VALIDATION lock state, shared by the hooks.
// Written ONLY by workflow-gate.mjs (UserPromptSubmit = a real human message).
// Claude itself is denied any write to .claude/state/ (guard-files / guard-commands).
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// An approval is valid for the session that gave it and at most this long.
export const APPROVAL_TTL_MS = 12 * 60 * 60 * 1000;
// A pending lock older than this is reported as stale (it stays closed).
export const STALE_LOCK_MS = 24 * 60 * 60 * 1000;

export function projectDir(payload = {}) {
  return process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
}

export function statePath(payload) {
  return path.join(projectDir(payload), ".claude", "state", "workflow.json");
}

export function historyPath(payload) {
  return path.join(projectDir(payload), ".claude", "state", "history.jsonl");
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
  const record = { ...state, sessionId: payload.session_id ?? null, updatedAt: new Date().toISOString() };
  writeFileSync(p, JSON.stringify(record, null, 2));
  // Local audit trail (never versioned: .claude/state/ is git-ignored).
  try {
    appendFileSync(historyPath(payload), JSON.stringify(record) + "\n");
  } catch {
    // The audit trail must never block the gate itself.
  }
}

export function isLocked(payload) {
  const s = readState(payload);
  return Boolean(s && s.status === "awaiting-approval");
}

/** Why an approval no longer applies, or null while it is valid. */
export function approvalExpiryReason(state, payload, now = Date.now()) {
  if (!state || state.status !== "approved") return null;
  const approvedAt = Date.parse(state.approvedAt || "");
  if (!Number.isFinite(approvedAt) || now - approvedAt > APPROVAL_TTL_MS) return "validation de plus de 12 h";
  if (state.sessionId && payload.session_id && state.sessionId !== payload.session_id) return "validation donnée dans une autre session";
  return null;
}

export function isStaleLock(state, now = Date.now()) {
  if (!state || state.status !== "awaiting-approval") return false;
  const lockedAt = Date.parse(state.lockedAt || "");
  return Number.isFinite(lockedAt) && now - lockedAt > STALE_LOCK_MS;
}

export const LOCK_MESSAGE =
  "Verrou HUMAN VALIDATION actif : un plan est en attente de validation humaine. " +
  "Aucune modification n'est possible tant que l'utilisateur n'a pas répondu « OK » (ou /approve-plan). " +
  "Pour abandonner : /cancel-workflow.";
