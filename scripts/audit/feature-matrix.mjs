// Matrice statique page par page : routée ? appels API atteignables (graphe d'imports), appels sans route, couverture E2E.
// Usage : node feature-matrix.mjs <ops.json> <matrice.json> [<FEATURE_MATRIX.md> <commit>]
import fs from 'fs'; import path from 'path';
const [opsFile, outJson, outMd, commit] = process.argv.slice(2);
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
// Classement : un défaut « propre » est dans la page ou dans un module que
// seule cette page atteint ; sinon il est dans un module partagé (la page
// n'utilise peut-être pas la fonction fautive) → À VÉRIFIER.
const users = {};
for (const r of rows) for (const b of r.broken) { const f = b.match(/\(([^)]+)\)$/)[1]; (users[f] = users[f] || new Set()).add(r.page); }
for (const r of rows) {
  r.own = []; r.shared = [];
  for (const b of r.broken) { const f = b.match(/\(([^)]+)\)$/)[1]; (f === 'pages/' + r.page || users[f].size === 1 ? r.own : r.shared).push(b); }
  r.status = !r.portal ? 'NON ROUTÉE' : r.own.length ? 'DÉFECTUEUX' : r.shared.length ? 'À VÉRIFIER' : r.e2e ? 'COMPLET (parcours E2E)' : 'NON VÉRIFIÉ';
}
fs.writeFileSync(outJson, JSON.stringify(rows, null, 1));
const order = ['DÉFECTUEUX', 'À VÉRIFIER', 'NON VÉRIFIÉ', 'COMPLET (parcours E2E)', 'NON ROUTÉE'];
const count = {}; for (const r of rows) count[r.status] = (count[r.status] || 0) + 1;
console.log(JSON.stringify({ pages: rows.length, ...count }));
if (outMd) {
  let md = `# Matrice des écrans — statique, ${new Date().toISOString().slice(0, 10)} (commit \`${commit || '?'}\`)\n\n` +
    'Générée par `scripts/audit/feature-matrix.mjs` (méthode et commande : `docs/audit/AUDIT_GLOBAL.md` § 0.3).\n\n' +
    "**Ce que cette matrice prouve** : pour chaque page de `src/pages/`, si elle est routée, combien d'appels `apiClient` littéraux elle atteint par ses imports, et lesquels ne correspondent à **aucune opération OpenAPI** réelle (chemin + méthode).\n" +
    "**Ce qu'elle ne prouve pas** : le comportement à l'exécution. Une page « NON VÉRIFIÉ » n'a aucun défaut statique détecté, mais n'est jouée par aucun test de parcours. Les URL entièrement dynamiques ne sont pas vérifiées.\n\n" +
    "Statuts : **DÉFECTUEUX** = appel sans route dans la page ou dans un module qu'elle seule utilise · **À VÉRIFIER** = appel sans route dans un module partagé · **NON VÉRIFIÉ** = aucun défaut statique, aucun parcours · **COMPLET (parcours E2E)** = nom de page cité par `tests/e2e/journeys/` (détection par nom : sous-estime la couverture réelle) · **NON ROUTÉE** = page sans route.\n\n" +
    '| Statut | Pages |\n|---|---:|\n' + order.map((st) => `| ${st} | ${count[st] || 0} |`).join('\n') + `\n| **Total** | **${rows.length}** |\n\n`;
  for (const st of order) {
    const rs = rows.filter((r) => r.status === st).sort((a, b) => (a.portal || '').localeCompare(b.portal || '') || a.page.localeCompare(b.page));
    if (!rs.length) continue;
    md += `## ${st} (${rs.length})\n\n| Portail | Page | Appels API | Défauts |\n|---|---|---:|---|\n` +
      rs.map((r) => `| ${r.portal || '—'} | \`${r.page}\` | ${r.api_calls} | ${[...r.own, ...r.shared.map((x) => '(partagé) ' + x)].join('<br>') || '—'} |`).join('\n') + '\n\n';
  }
  fs.writeFileSync(outMd, md);
}
