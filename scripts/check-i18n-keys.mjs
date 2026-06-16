#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const LOCALES_DIR = path.join(SRC_DIR, 'i18n', 'locales');
const LOCALES = ['fr', 'en', 'es', 'ar'];

// The project still contains many historical pages. During the Phase 5 hardening,
// the default check is progressive: it blocks only on high-visibility namespaces
// that caused raw labels in the UI, and reports the rest as warnings.
// Use I18N_STRICT=true npm run check:i18n to block on every missing French key.
const STRICT_MODE = process.env.I18N_STRICT === 'true' || process.argv.includes('--strict');
const BLOCKING_PREFIXES = new Set([
  'nav',
  'portal',
  'dashboard',
  'messages',
  'ministryDashboard',
  'decision',
  'common',
  'search',
  'chatbot',
  'accessibility',
  'privacy',
  'settings.accessibility',
]);

const sourceExtensions = new Set(['.ts', '.tsx']);
const ignoredDirs = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '.next']);

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.error(`ERROR: cannot read JSON ${filePath}: ${error.message}`);
    process.exit(1);
  }
}

function flattenKeys(value, prefix = '', output = new Set()) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      flattenKeys(child, nextPrefix, output);
    }
    return output;
  }

  if (prefix) output.add(prefix);
  return output;
}

function walk(dir, output = []) {
  if (!fs.existsSync(dir)) return output;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, output);
      continue;
    }
    if (sourceExtensions.has(path.extname(entry.name))) output.push(fullPath);
  }

  return output;
}

function extractTranslationKeys(source) {
  const keys = new Set();
  const patterns = [
    /\bt\(\s*['"`]([A-Za-z0-9_.:-]+)['"`]/g,
    /\bi18n\.t\(\s*['"`]([A-Za-z0-9_.:-]+)['"`]/g,
    /<Trans\s+[^>]*i18nKey=['"`]([A-Za-z0-9_.:-]+)['"`]/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) keys.add(match[1]);
  }

  return keys;
}

function shouldBlock(key) {
  if (STRICT_MODE) return true;
  for (const prefix of BLOCKING_PREFIXES) {
    if (key === prefix || key.startsWith(`${prefix}.`)) return true;
  }
  return false;
}

function groupByPrefix(items) {
  const grouped = new Map();
  for (const item of items) {
    const prefix = item.key.split('.').slice(0, 2).join('.');
    grouped.set(prefix, (grouped.get(prefix) || 0) + 1);
  }
  return [...grouped.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const localeKeys = new Map();
for (const locale of LOCALES) {
  const localePath = path.join(LOCALES_DIR, `${locale}.json`);
  localeKeys.set(locale, flattenKeys(readJson(localePath)));
}

const usedKeys = new Map();
for (const filePath of walk(SRC_DIR)) {
  const content = fs.readFileSync(filePath, 'utf8');
  for (const key of extractTranslationKeys(content)) {
    if (!usedKeys.has(key)) usedKeys.set(key, new Set());
    usedKeys.get(key).add(path.relative(ROOT, filePath));
  }
}

const missingFrench = [];
for (const [key, files] of [...usedKeys.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  if (!localeKeys.get('fr').has(key)) {
    missingFrench.push({ key, locale: 'fr', files: [...files].slice(0, 5) });
  }
}

const blockingMissing = missingFrench.filter((item) => shouldBlock(item.key));
const nonBlockingMissing = missingFrench.filter((item) => !shouldBlock(item.key));

if (blockingMissing.length > 0) {
  console.error(`ERROR: ${blockingMissing.length} blocking i18n key(s) missing in fr.json.`);
  for (const item of blockingMissing) {
    console.error(`- [${item.locale}] ${item.key}`);
    for (const file of item.files) console.error(`  used in: ${file}`);
  }
  console.error('\nFix these high-visibility labels first, or run I18N_STRICT=true npm run check:i18n for the full strict audit.');
  process.exit(1);
}

console.log(`OK: no blocking French i18n key is missing.`);
console.log(`INFO: ${usedKeys.size} translation key(s) detected in source files.`);

if (nonBlockingMissing.length > 0) {
  console.warn(`WARN: ${nonBlockingMissing.length} non-blocking French key(s) are still missing.`);
  console.warn('Top missing namespaces:');
  for (const [prefix, count] of groupByPrefix(nonBlockingMissing).slice(0, 20)) {
    console.warn(`- ${prefix}: ${count}`);
  }
  console.warn('These pages are covered by the readable fallback today, but should be translated progressively.');
}

const softMissing = [];
for (const [key, files] of [...usedKeys.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  for (const locale of LOCALES.filter((item) => item !== 'fr')) {
    if (!localeKeys.get(locale).has(key)) softMissing.push({ key, locale, files: [...files].slice(0, 3) });
  }
}

if (softMissing.length > 0) {
  console.warn(`WARN: ${softMissing.length} non-French translation key(s) missing. French fallback will be used.`);
  for (const item of softMissing.slice(0, 60)) console.warn(`- [${item.locale}] ${item.key}`);
  if (softMissing.length > 60) console.warn(`...and ${softMissing.length - 60} more.`);
}
