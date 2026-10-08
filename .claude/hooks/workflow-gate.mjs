#!/usr/bin/env node
// UserPromptSubmit hook — drives the HUMAN VALIDATION lock.
// Only a real human message reaches this hook, so only the human can unlock.
//   /feature, /fix, /project-plan, /new-endpoint, /new-migration → lock (awaiting-approval)
//   "OK" | "GO" | /approve-plan (while locked)            → approved (unlock)
//   /cancel-workflow                                        → cleared
//   approval older than 12 h or from another session        → expired (no approval in force)
// stdout is added to Claude's context so it knows the current lock state.
import { readFileSync } from "node:fs";
import { approvalExpiryReason, isStaleLock, readState, writeState, LOCK_MESSAGE } from "./lib/workflow-state.mjs";

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  process.exit(0);
}
const prompt = String(payload.prompt || "");

const cmdName = (name) => new RegExp(`(^\\s*/${name}(\\s|$))|(<command-name>\\s*/?${name}\\s*</command-name>)`, "i");
const GATED = ["feature", "fix", "project-plan", "new-endpoint", "new-migration"];

const now = new Date().toISOString();
let current = readState(payload);

// An approval only covers the session that gave it, for at most 12 h: past
// that, no plan counts as validated any more (the next gated command
// re-locks; nothing may rely on an old "OK").
const expiry = approvalExpiryReason(current, payload);
if (expiry) {
  writeState(payload, { status: "expired", command: current.command, approvedAt: current.approvedAt, expiredAt: now, reason: expiry });
  process.stdout.write(
    `Validation du plan /${current.command} expirée (${expiry}) : aucune validation humaine n'est en cours. ` +
    "Un changement important exige un nouveau plan validé explicitement.\n",
  );
  current = readState(payload);
}

if (cmdName("cancel-workflow").test(prompt)) {
  writeState(payload, { status: "cancelled", command: current?.command ?? null, cancelledAt: now });
  process.stdout.write("Workflow annulé par l'utilisateur : verrou HUMAN VALIDATION levé, aucun plan en cours.");
  process.exit(0);
}

const gated = GATED.find((c) => cmdName(c).test(prompt));
if (gated) {
  writeState(payload, { status: "awaiting-approval", command: gated, lockedAt: now });
  process.stdout.write(
    `Verrou HUMAN VALIDATION posé par /${gated} : phases ANALYSIS et PLAN uniquement. ` +
    "Toute modification de fichier du projet et toute commande non lecture-seule seront refusées " +
    "jusqu'à ce que l'utilisateur réponde « OK » (ou /approve-plan).",
  );
  process.exit(0);
}

const isApproval = /^\s*(ok|go)\s*[.!]?\s*$/i.test(prompt) || cmdName("approve-plan").test(prompt);
if (isApproval && current?.status === "awaiting-approval") {
  writeState(payload, { status: "approved", command: current.command, lockedAt: current.lockedAt, approvedAt: now });
  process.stdout.write(
    `Plan validé explicitement par l'utilisateur (${now}) : verrou HUMAN VALIDATION levé pour /${current.command}. ` +
    "Poursuivre avec ARCHITECTURE CHECK puis IMPLEMENTATION, strictement dans le périmètre du plan validé.",
  );
  process.exit(0);
}

if (current?.status === "awaiting-approval") {
  // Any other message keeps the lock (e.g. the user asks for plan changes).
  const stale = isStaleLock(current)
    ? ` Ce verrou date de plus de 24 h (${current.lockedAt}, /${current.command}) : s'il est obsolète, l'utilisateur peut taper /cancel-workflow.`
    : "";
  process.stdout.write(LOCK_MESSAGE + " Si l'utilisateur demande des modifications du plan, présenter le plan révisé et redemander « OK »." + stale);
}
process.exit(0);
