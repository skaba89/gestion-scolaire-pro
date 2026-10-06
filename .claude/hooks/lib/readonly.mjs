// Shared allowlist of non-destructive shell commands (inspection, git read, tests, lint).
// Used by read-only review agents and by the HUMAN VALIDATION lock.
// Strict by design: anything not recognised is refused.

const SAFE_REDIRECT = /^\s*(\/dev\/null|&[12]|NUL\b|\$null)/i;

function hasUnsafeRedirect(cmd) {
  const re = />>?/g;
  let m;
  while ((m = re.exec(cmd)) !== null) {
    const after = cmd.slice(m.index + m[0].length);
    if (!SAFE_REDIRECT.test(after)) return true;
  }
  return false;
}

const GIT_READ = new Set([
  "status", "diff", "log", "show", "ls-files", "blame", "rev-parse", "merge-base",
  "grep", "shortlog", "describe", "cat-file", "ls-tree", "remote", "config",
]);

const PLAIN_READ = new Set([
  "grep", "rg", "ls", "cat", "head", "tail", "wc", "sort", "uniq", "cut", "tr", "echo",
  "printf", "pwd", "cd", "test", "which", "diff", "file", "stat", "du", "tree", "jq",
  "basename", "dirname", "realpath", "true", "sed", "awk", "find", "date", "env",
  // PowerShell read cmdlets
  "get-content", "gc", "get-childitem", "gci", "dir", "select-string", "get-item",
  "test-path", "measure-object", "select-object", "where-object", "sort-object",
  "format-table", "format-list", "write-output", "set-location", "get-location", "type",
]);

function segmentIsReadOnly(seg) {
  let s = seg.trim();
  if (!s) return true;
  // strip leading VAR=value assignments
  while (/^[A-Za-z_][A-Za-z0-9_]*=\S*\s+/.test(s)) s = s.replace(/^[A-Za-z_][A-Za-z0-9_]*=\S*\s+/, "");
  const tokens = s.split(/\s+/);
  const prog = tokens[0].replace(/^["']|["']$/g, "").toLowerCase().replace(/\.exe$/, "");
  const rest = tokens.slice(1).join(" ");

  if (prog === "git") {
    const sub = (tokens.find((t, i) => i > 0 && !t.startsWith("-")) || "").toLowerCase();
    if (sub === "branch") return !/(\s|^)(-d|-D|--delete|-m|-M|--move|-c|-C|--copy|-f|--force)(\s|$)/.test(rest);
    if (sub === "remote") return /^\s*(-v|show|get-url)?\b/.test(rest.replace(/^remote\s*/, "")) && !/\b(add|remove|rm|rename|set-url|prune)\b/.test(rest);
    if (sub === "config") return /(--get|--list|-l)\b/.test(rest);
    if (sub === "stash") return /\bstash\s+(list|show)\b/.test(rest);
    return GIT_READ.has(sub);
  }
  if (prog === "find") return !/(\s|^)-(delete|exec|execdir|ok|okdir|fprint\w*|fls)\b/.test(rest);
  if (prog === "sed") return !/(\s|^)(-i|--in-place)/.test(rest) && !/\bw\s+\S/.test(rest);
  if (prog === "awk") return !/system\s*\(|print\s*>/.test(rest);
  if (prog === "env") return tokens.length === 1;
  if (PLAIN_READ.has(prog)) return true;

  if (prog === "python" || prog === "python3" || prog === "py") {
    return /^-m\s+(pytest|py_compile|json\.tool|compileall\s+-q)\b/.test(rest) && !/--snapshot-update|--update-snapshots/.test(rest);
  }
  if (prog === "pytest") return true;
  if (prog === "alembic") return /^(heads|history|current|show|branches)\b/.test(rest);
  if (prog === "node") return /^--check\b/.test(rest);
  if (prog === "npm") return /^(run\s+(lint|type-check|check:i18n|check:i18n:strict|test|build)\b|test\b|ls\b|list\b|audit\b(?!\s+fix))/.test(rest) && !/--fix\b/.test(rest);
  if (prog === "npx") {
    if (/(^|\s)(--fix|-u|--update|--write)(\s|$)/.test(rest)) return false;
    return /^(vitest\s+run|eslint|tsc\s+--noEmit|playwright\s+test)\b/.test(rest);
  }
  if (prog === "gh") return /^(pr\s+(view|diff|list|checks|status)|run\s+(list|view)|issue\s+(view|list)|repo\s+view)\b/.test(rest);
  return false;
}

/** Returns { ok: boolean, reason?: string } */
export function isReadOnlyCommand(cmd) {
  if (/`|\$\(|<\(/.test(cmd)) return { ok: false, reason: "substitution de commande non autorisée en mode lecture seule" };
  if (hasUnsafeRedirect(cmd)) return { ok: false, reason: "redirection vers un fichier non autorisée en mode lecture seule" };
  if (/\|\s*(sh|bash|zsh|pwsh|powershell|iex|invoke-expression|xargs|tee|python3?|node)\b/i.test(cmd)) {
    return { ok: false, reason: "pipe vers un interpréteur/tee/xargs non autorisé en mode lecture seule" };
  }
  const segments = cmd.split(/&&|\|\||;|\||\r?\n/);
  for (const seg of segments) {
    if (!segmentIsReadOnly(seg)) return { ok: false, reason: `commande non autorisée en mode lecture seule : « ${seg.trim().slice(0, 80)} »` };
  }
  return { ok: true };
}

const TEST_PATHS = [
  /^backend\/tests\//,
  /^tests\//,
  /^src\/(.+\/)?__tests__\//,
  /^src\/.+\.(test|spec)\.(ts|tsx|js|jsx)$/,
];
export function isTestPath(rel) {
  return TEST_PATHS.some((re) => re.test(rel));
}
