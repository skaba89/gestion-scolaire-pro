// Detection of shell commands that read or copy secret files (.env*, cloud
// logs, backups). Used by guard-commands.mjs.
//
// Principle: look at the program actually executed in each command segment
// and at its arguments — never at free text. Commit/PR messages, heredoc
// bodies and regex patterns ("\.env") are removed or ignored first, which
// eliminates the historical false positives, while globs (.env*), command
// substitutions ($(cat .env)), xargs/find -exec and input redirections are
// now caught.

const ENV_TEMPLATES = new Set([".env.example", ".env.docker.example", ".env.production.template", ".env.template"]);

// Programs that print, copy, move, search or load a file given as argument.
const READERS = new Set([
  "cat", "tac", "nl", "type", "more", "less", "head", "tail", "bat", "strings", "od", "xxd", "hexdump",
  "base64", "grep", "egrep", "fgrep", "rg", "ag", "sed", "awk", "cut", "sort", "uniq", "diff", "cmp", "jq",
  "cp", "mv", "scp", "rsync", "tar", "zip", "7z", "source", ".", "dos2unix", "iconv", "openssl", "curl",
  // PowerShell / cmd
  "get-content", "gc", "copy", "copy-item", "cpi", "move", "move-item", "mi", "select-string", "sls",
  "findstr", "import-csv", "out-file",
]);
// Wrappers whose first non-flag argument is the real program.
const WRAPPERS = new Set(["sudo", "env", "time", "nohup", "command", "builtin", "exec", "xargs", "nice", "timeout"]);

const isEnvToken = (token) => {
  const base = token.replace(/^@/, "").split(/[\\/]/).pop().toLowerCase();
  if (!base.startsWith(".env")) return false;
  if (ENV_TEMPLATES.has(base)) return false;
  // .env, .env.local, .env.production, and globs .env* / .env? / .env.[a-z]*
  return /^\.env([.\w-]*)?([*?[].*)?$/.test(base);
};
const isSensitivePath = (token) => /(^|[\\/])(infra[\\/]+backups|azure-logs[^\\/]*|azure-log-full\.txt)([\\/]|$)/i.test(token);

/** Removes free text that is never executed as a file argument. */
export function stripFreeText(cmd) {
  let s = cmd;
  // heredoc bodies: keep the introducing line, drop the body
  s = s.replace(/<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1([^\n]*)\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g, "<<$2$3");
  // message-like options of git / gh / az (quoted values)
  s = s.replace(/(\s(?:-m|--message|--body|--title|--notes|--description|-t|-b))(?:\s+|=)("(?:[^"\\]|\\.)*"|'[^']*')/g, "$1 MSG");
  return s;
}

// Programs whose first positional argument is a pattern/script, not a file.
const PATTERN_FIRST = new Set(["grep", "egrep", "fgrep", "rg", "ag", "sed", "awk", "jq", "findstr", "select-string", "sls"]);
const PATTERN_OPTS = new Set(["-e", "--regexp", "--expression", "-pattern"]);
const FILE_OPTS = new Set(["-f", "--file", "-path", "-literalpath"]);

/** Arguments that designate files read by the program. */
function fileArguments(prog, args) {
  const files = [];
  let patternSeen = !PATTERN_FIRST.has(prog);
  let skipNext = false;
  let nextIsFile = false;
  for (const arg of args) {
    const lower = arg.toLowerCase();
    if (skipNext) { skipNext = false; continue; }
    if (nextIsFile) { files.push(arg); nextIsFile = false; continue; }
    if (PATTERN_OPTS.has(lower)) { skipNext = true; patternSeen = true; continue; }
    if (FILE_OPTS.has(lower)) { nextIsFile = true; continue; }
    const fileOpt = /^(--file|-f)=(.+)$/.exec(arg);
    if (fileOpt) { files.push(fileOpt[2]); continue; }
    if (arg.startsWith("-")) continue;
    if (!patternSeen) { patternSeen = true; continue; }
    files.push(arg);
  }
  return files;
}

const unquote = (t) => t.replace(/^["']+|["'),;]+$/g, "");

function programAndArgs(segment) {
  let tokens = segment.trim().split(/\s+/).filter(Boolean);
  while (tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) tokens = tokens.slice(1);
  while (tokens.length) {
    const prog = unquote(tokens[0]).split(/[\\/]/).pop().toLowerCase().replace(/\.exe$/, "");
    if (!WRAPPERS.has(prog)) return { prog, args: tokens.slice(1).map(unquote) };
    tokens = tokens.slice(1);
    while (tokens.length && tokens[0].startsWith("-")) tokens = tokens.slice(1);
  }
  return { prog: "", args: [] };
}

/** Returns { deny: string[], ask: string[] } for a shell command. */
export function analyseSecretAccess(cmd) {
  const deny = new Set();
  const ask = new Set();
  const text = stripFreeText(String(cmd || ""));

  // input redirection from a secret file, anywhere: `< .env`, `0< .env`
  for (const m of text.matchAll(/(?:^|[^<])<\s*([^\s<>|;&()]+)/g)) {
    const target = unquote(m[1]);
    if (isEnvToken(target)) deny.add("Lecture d'un fichier .env réel interdite (secrets) — utilisez les templates .env.example");
    if (isSensitivePath(target)) deny.add("Lecture de sauvegardes ou journaux cloud interdite (données personnelles / secrets)");
  }

  // command segments, command substitutions and subshells included
  const segments = text.split(/&&|\|\||;|\||\r?\n|\$\(|`|<\(|\(|\)/);
  for (const segment of segments) {
    const { prog, args } = programAndArgs(segment);
    if (!prog) continue;

    const execsReader = prog === "find" && args.some((a) => /^-(exec|execdir|ok|okdir)$/.test(a));
    if (READERS.has(prog) || execsReader) {
      const files = execsReader ? args : fileArguments(prog, args);
      if (files.some(isEnvToken)) deny.add("Lecture/copie d'un fichier .env réel interdite (secrets) — utilisez les templates .env.example");
      if (files.some(isSensitivePath)) deny.add("Lecture de sauvegardes ou journaux cloud interdite (données personnelles / secrets)");
    }

    // Recursive grep reads .env files without naming them (rg and git grep
    // honour .gitignore, which excludes them).
    if (["grep", "egrep", "fgrep"].includes(prog)) {
      const recursive = args.some((a) => /^-[A-Za-z]*[rR][A-Za-z]*$/.test(a) || a === "--recursive" || a === "--dereference-recursive");
      const excludesEnv = args.some((a) => /^--exclude=\.env/.test(a)) || /--exclude[= ]+["']?\.env/.test(segment);
      if (recursive && !excludesEnv) {
        ask.add("grep récursif : peut lire des fichiers .env réels — ajoutez --exclude='.env*' ou utilisez rg / git grep (qui respectent .gitignore)");
      }
    }
  }
  return { deny: [...deny], ask: [...ask] };
}
