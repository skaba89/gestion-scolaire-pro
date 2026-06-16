#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const LOCALES_DIR = path.join(SRC_DIR, 'i18n', 'locales');
const LOCALES = ['fr', 'en', 'es', 'ar'];
const ALLOWED_MISSING_PREFIXES = new Set([
  // Some keys can be generated at runtime and are protected by readable fallbacks.
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

  if (prefix) {
    output.add(prefix);
  }
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
    if (sourceExtensions.has(path.extname(entry.name))) {
      output.push(fullPath);
    }
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
    while ((match = pattern.exec(source)) !== null) {
      keys.add(match[1]);
    }
  }

  return keys;
}

function isAllowedMissing(key) {
  for (const prefix of ALLOWED_MISSING_PREFIXES) {
    if (key === prefix || key.startsWith(`${prefix}.`)) return true;
  }
  return false;
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

const requiredLocales = ['fr'];
const missing = [];

for (const [key, files] of [...usedKeys.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  if (isAllowedMissing(key)) continue;

  for (const locale of requiredLocales) {
    if (!localeKeys.get(locale).has(key)) {
      missing.push({ key, locale, files: [...files].slice(0, 5) });
    }
  }
}

if (missing.length > 0) {
  console.error(`ERROR: ${missing.length} required i18n key(s) missing.`);
  for (const item of missing) {
    console.error(`- [${item.locale}] ${item.key}`);
    for (const file of item.files) console.error(`  used in: ${file}`);
  }
  console.error('\nAdd the missing keys to src/i18n/locales/fr.json or remove the unused t(...) calls.');
  process.exit(1);
}

console.log(`OK: ${usedKeys.size} translation key(s) used in source files are present in fr.json.`);

const softMissing = [];
for (const [key, files] of [...usedKeys.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  for (const locale of LOCALES.filter((item) => item !== 'fr')) {
    if (!localeKeys.get(locale).has(key)) {
      softMissing.push({ key, locale, files: [...files].slice(0, 3) });
    }
  }
}

if (softMissing.length > 0) {
  console.warn(`WARN: ${softMissing.length} non-French translation key(s) missing. French fallback will be used.`);
  for (const item of softMissing.slice(0, 80)) {
    console.warn(`- [${item.locale}] ${item.key}`);
  }
  if (softMissing.length > 80) {
    console.warn(`...and ${softMissing.length - 80} more.`);
  }
}
