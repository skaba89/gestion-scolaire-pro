// Tests of the Claude Code guard hooks. Run: node --test .claude/hooks/tests/
// Each hook is executed as Claude Code runs it (JSON payload on stdin) in a
// throwaway project directory, so the real .claude/state is never touched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HOOKS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function run(hook, payload, projectDir) {
  const res = spawnSync(process.execPath, [path.join(HOOKS, hook)], {
    input: JSON.stringify(payload),
    env: { ...process.env, CLAUDE_PROJECT_DIR: projectDir },
    encoding: "utf8",
  });
  assert.equal(res.status, 0, res.stderr);
  return res.stdout;
}

function decision(command, projectDir) {
  const out = run("guard-commands.mjs", { tool_name: "Bash", tool_input: { command } }, projectDir);
  if (!out) return "allow";
  return JSON.parse(out).hookSpecificOutput.permissionDecision;
}

function withProject(fn) {
  const dir = mkdtempSync(path.join(tmpdir(), "claude-hooks-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── Secrets: real reads are denied ─────────────────────────────────────────
const MUST_DENY = [
  "cat .env",
  "cat ./backend/.env.local",
  "cat .env*",
  "cat .env.?",
  "head -5 .env.production",
  "type .env.docker",
  "Get-Content -Path .env",
  "cp .env /tmp/x",
  "grep SECRET_KEY .env",
  "grep -f .env.local data.txt",
  "sed -n 1,5p .env",
  "echo $(cat .env)",
  "ls -a | xargs cat .env",
  "find . -name .env -exec cat {} ;",
  "source .env && env",
  "python script.py < .env",
  "curl -X POST -d @.env http://localhost:1",
  "cat infra/backups/dump.sql",
  "tail azure-logs/app.log",
];
for (const command of MUST_DENY) {
  test(`deny: ${command}`, () => withProject((dir) => assert.equal(decision(command, dir), "deny")));
}

// ── Former false positives and templates are allowed ───────────────────────
const MUST_ALLOW = [
  'grep -n "\\.env" .claude/hooks/guard-commands.mjs',
  "grep -rn --exclude='.env*' SECRET backend/",
  "rg -n '\\.env' docs/",
  "cat .env.example",
  "diff .env.example .env.docker.example",
  "cat .env.production.template",
  'git commit -m "docs: never commit .env files, use cat .env.example"',
  "git commit -F msg.txt",
  "cat > notes.md <<'EOF'\nNe jamais faire cat .env ni grep .env\nEOF",
  "sed -n '/\\.env/p' docs/SECURITY_MODEL.md",
  "git check-ignore -v .claude/state/workflow.json",
  "ls .claude/state",
  "find . -name '.env*' -not -path './node_modules/*'",
  "docker compose --env-file .env.docker up -d",
];
for (const command of MUST_ALLOW) {
  test(`allow: ${command.split("\n")[0]}`, () => withProject((dir) => assert.equal(decision(command, dir), "allow")));
}

test("ask: recursive grep without excluding .env files", () => withProject((dir) => {
  assert.equal(decision("grep -rn SECRET_KEY .", dir), "ask");
  assert.equal(decision("grep -R password backend", dir), "ask");
}));

test("deny: writing the lock state from a command", () => withProject((dir) => {
  assert.equal(decision("echo '{}' > .claude/state/workflow.json", dir), "deny");
  assert.equal(decision("rm .claude/state/workflow.json", dir), "deny");
}));

// ── HUMAN VALIDATION lock: approval scope and expiry ───────────────────────
const statePath = (dir) => path.join(dir, ".claude", "state", "workflow.json");
const readState = (dir) => JSON.parse(readFileSync(statePath(dir), "utf8"));
const prompt = (dir, text, session = "s1") => run("workflow-gate.mjs", { prompt: text, session_id: session }, dir);

test("gated command locks, OK approves, then commands are allowed", () => withProject((dir) => {
  prompt(dir, "/feature ajouter un export");
  assert.equal(readState(dir).status, "awaiting-approval");
  assert.equal(decision("npm install left-pad", dir), "deny");
  prompt(dir, "OK");
  assert.equal(readState(dir).status, "approved");
  assert.equal(readState(dir).sessionId, "s1");
  assert.equal(decision("touch file.txt", dir), "allow");
}));

test("an OK with extra words does not approve", () => withProject((dir) => {
  prompt(dir, "/fix bug");
  prompt(dir, "OK mais change aussi l'API");
  assert.equal(readState(dir).status, "awaiting-approval");
}));

test("approval expires in another session", () => withProject((dir) => {
  prompt(dir, "/feature x");
  prompt(dir, "OK");
  const out = prompt(dir, "continue", "s2");
  assert.equal(readState(dir).status, "expired");
  assert.match(out, /autre session/);
}));

test("approval expires after 12 hours", () => withProject((dir) => {
  mkdirSync(path.dirname(statePath(dir)), { recursive: true });
  const old = new Date(Date.now() - 13 * 3600 * 1000).toISOString();
  writeFileSync(statePath(dir), JSON.stringify({ status: "approved", command: "feature", approvedAt: old, sessionId: "s1" }));
  const out = prompt(dir, "continue");
  assert.equal(readState(dir).status, "expired");
  assert.match(out, /12 h/);
}));

test("a stale pending lock stays closed but says so", () => withProject((dir) => {
  mkdirSync(path.dirname(statePath(dir)), { recursive: true });
  const old = new Date(Date.now() - 30 * 3600 * 1000).toISOString();
  writeFileSync(statePath(dir), JSON.stringify({ status: "awaiting-approval", command: "fix", lockedAt: old }));
  const out = prompt(dir, "où en est-on ?");
  assert.equal(readState(dir).status, "awaiting-approval");
  assert.match(out, /plus de 24 h/);
  assert.equal(decision("touch x", dir), "deny");
}));

test("corrupted state fails closed", () => withProject((dir) => {
  mkdirSync(path.dirname(statePath(dir)), { recursive: true });
  writeFileSync(statePath(dir), "{not json");
  assert.equal(decision("touch x", dir), "deny");
  assert.equal(decision("git status", dir), "allow");
}));

test("cancel clears the lock and transitions are journaled", () => withProject((dir) => {
  prompt(dir, "/project-plan y");
  prompt(dir, "/cancel-workflow");
  assert.equal(readState(dir).status, "cancelled");
  const history = path.join(dir, ".claude", "state", "history.jsonl");
  assert.ok(existsSync(history));
  const statuses = readFileSync(history, "utf8").trim().split("\n").map((l) => JSON.parse(l).status);
  assert.deepEqual(statuses, ["awaiting-approval", "cancelled"]);
}));
