// Matrice statique page par page : routée ? appels API atteignables (graphe d'imports), appels sans route, couverture E2E.
import fs from 'fs'; import path from 'path';
const [opsFile, outJson] = process.argv.slice(2);
const ops = JSON.parse(fs.readFileSync(opsFile, 'utf8')).map(([m, p]) => ({ m, re: new RegExp('^' + p.replace(/^\/api\/v1/, '').replace(/\/+$/, '').replace(/\{[^}]+\}/g, '[^/]+') + '$') }));
const exts = ['.tsx', '.ts', '/index.tsx', '/index.ts'];
function resolve(from, spec) {
  let base; if (spec.startsWith('@/')) base = path.join('src', spec.slice(2)); else if (spec.startsWith('.')) base = path.join(path.dirname(from), spec); else return null;
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
  for (const e of exts) if (fs.existsSync(base + e)) return base + e; return null;
}
const cache = new Map();
function info(f) { if (cache.has(f)) return cache.get(f); const s = fs.readFileSync(f, 'utf8');
  const deps = [...s.matchAll(/(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => resolve(f, m[1] || m[2])).filter(Boolean);
  const calls = []; for (const m of s.matchAll(/apiClient\s*\.\s*(get|post|put|patch|delete)\s*(?:<[^>()]*(?:<[^>]*>)?[^>()]*>)?\s*\(\s*(`[^`]*`|'[^']*'|"[^"]*")/g)) {
    let url = m[2].slice(1, -1); if (url.startsWith('${')) continue; const verb = m[1].toUpperCase();
    url = url.split('?')[0].replace(/\$\{[^}]+\}/g, 'X').replace(/\/+$/, ''); if (!url.startsWith('/')) url = '/' + url;
    const hits = ops.filter(o => o.re.test(url)); const ok = hits.some(o => o.m === verb);
    calls.push({ verb, url, ok, file: f }); }
  const r = { deps, calls }; cache.set(f, r); return r; }
function reach(f) { const seen = new Set(); const st = [f]; while (st.length) { const x = st.pop(); if (seen.has(x)) continue; seen.add(x); for (const d of info(x).deps) if (d.startsWith('src/') && !/components\/ui\//.test(d)) st.push(d); } return seen; }
const routeSrc = ['src/App.tsx', ...fs.readdirSync('src/routes').map(f => 'src/routes/' + f)];
const routed = new Map(); for (const r of routeSrc) { const s = fs.readFileSync(r, 'utf8'); for (const m of s.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) { const p = resolve(r, m[1]); if (p) routed.set(p, path.basename(r, '.tsx').replace('Routes', '')); } }
const e2e = fs.readdirSync('tests/e2e/journeys').filter(f => f.endsWith('.spec.ts')).map(f => fs.readFileSync('tests/e2e/journeys/' + f, 'utf8')).join('\n');
const pages = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (!/__tests__/.test(f)) walk(f); } else if (/\.tsx$/.test(e.name) && !/\.test\./.test(e.name)) pages.push(f); } })('src/pages');
const rows = pages.map(p => { const files = reach(p); const calls = [...files].flatMap(f => info(f).calls); const uniq = new Map(calls.map(c => [c.verb + ' ' + c.url, c]));
  const broken = [...uniq.values()].filter(c => !c.ok); const name = path.basename(p, '.tsx');
  return { page: p.replace('src/pages/', ''), portal: routed.get(p) || null, api_calls: uniq.size, broken: broken.map(c => `${c.verb} ${c.url} (${c.file.replace('src/', '')})`), e2e: e2e.includes(name) }; });
fs.writeFileSync(outJson, JSON.stringify(rows, null, 1));
const s = { pages: rows.length, routed: rows.filter(r => r.portal).length, unrouted: rows.filter(r => !r.portal).length, routed_with_broken: rows.filter(r => r.portal && r.broken.length).length, e2e: rows.filter(r => r.e2e).length };
console.log(JSON.stringify(s));
