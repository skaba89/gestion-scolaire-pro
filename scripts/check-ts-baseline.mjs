#!/usr/bin/env node
/**
 * TypeScript ratchet (CI "Type-check" step).
 *
 * `tsc --noEmit` on tsconfig.json checked nothing ("files": [] + references)
 * so type errors — including real runtime bugs (undefined names, missing
 * exports) — never failed CI. Strict mode on tsconfig.app.json reports a
 * pre-existing debt; this script turns it into a ratchet, like the ESLint
 * warning budget:
 *
 *   - tsconfig.node.json (vite.config.ts) must have zero errors;
 *   - for tsconfig.app.json, the error count of every file is compared with
 *     ts-baseline.json: any file above its baseline (or a file absent from
 *     the baseline with errors) fails the check;
 *   - files below their baseline are reported: run with --update to lower
 *     the baseline in the same PR (it can only go down).
 *
 * Usage: node scripts/check-ts-baseline.mjs [--update]
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = path.join(ROOT, "ts-baseline.json");
const TSC = require.resolve("typescript/bin/tsc");
const update = process.argv.includes("--update");

function runTsc(project) {
  const res = spawnSync(process.execPath, [TSC, "--noEmit", "--pretty", "false", "-p", project], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = `${res.stdout || ""}${res.stderr || ""}`;
  const errors = out.split(/\r?\n/).filter((l) => /error TS\d+/.test(l));
  if (res.status !== 0 && errors.length === 0) {
    console.error(out);
    throw new Error(`tsc failed to run on ${project}`);
  }
  return errors;
}

function countByFile(lines) {
  const counts = {};
  for (const line of lines) {
    const m = /^(.+?)\(\d+,\d+\): error TS\d+/.exec(line);
    const file = (m ? m[1] : "<global>").replace(/\\/g, "/");
    counts[file] = (counts[file] || 0) + 1;
  }
  return counts;
}

const nodeErrors = runTsc("tsconfig.node.json");
if (nodeErrors.length) {
  console.error("tsconfig.node.json must have no type error:\n" + nodeErrors.join("\n"));
  process.exit(1);
}

const appErrors = runTsc("tsconfig.app.json");
const current = countByFile(appErrors);
const total = appErrors.length;

if (update) {
  const sorted = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`ts-baseline.json written: ${total} errors in ${Object.keys(sorted).length} files.`);
  process.exit(0);
}

if (!existsSync(BASELINE)) {
  console.error("ts-baseline.json missing — run: npm run type-check:update-baseline");
  process.exit(1);
}
const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
const baselineTotal = Object.values(baseline).reduce((a, b) => a + b, 0);

const regressions = [];
const improvements = [];
for (const [file, count] of Object.entries(current)) {
  const allowed = baseline[file] || 0;
  if (count > allowed) regressions.push({ file, count, allowed });
}
for (const [file, allowed] of Object.entries(baseline)) {
  const count = current[file] || 0;
  if (count < allowed) improvements.push({ file, count, allowed });
}

if (regressions.length) {
  console.error(`✖ New TypeScript errors (baseline ${baselineTotal}, now ${total}):`);
  for (const r of regressions) {
    console.error(`  ${r.file}: ${r.count} (baseline ${r.allowed})`);
    for (const line of appErrors.filter((l) => l.replace(/\\/g, "/").startsWith(r.file + "("))) {
      console.error(`    ${line}`);
    }
  }
  process.exit(1);
}

console.log(`✓ TypeScript: ${total} errors, baseline ${baselineTotal} — no new error.`);
if (improvements.length) {
  console.log(`  ${improvements.length} file(s) below baseline — lower it: npm run type-check:update-baseline`);
  for (const i of improvements) console.log(`  ${i.file}: ${i.count} (baseline ${i.allowed})`);
}
