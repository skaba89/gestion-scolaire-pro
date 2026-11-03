// Compare apiClient.<verb>(<littéral>) de src/ aux opérations OpenAPI réelles.
import fs from 'fs'; import path from 'path';
const [opsFile, srcDir] = process.argv.slice(2);
const ops = JSON.parse(fs.readFileSync(opsFile, 'utf8')).map(([m, p]) => ({ m, re: new RegExp('^' + p.replace(/^\/api\/v1/, '').replace(/\/+$/, '').replace(/\{[^}]+\}/g, '[^/]+') + '$') }));
const files = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (!/__tests__|node_modules/.test(f)) walk(f); } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) files.push(f); } })(srcDir);
const callRe = /apiClient\s*\.\s*(get|post|put|patch|delete)\s*(?:<[^>()]*(?:<[^>]*>)?[^>()]*>)?\s*\(\s*(`[^`]*`|'[^']*'|"[^"]*")/g;
let total = 0, dyn = 0; const missing = [], methodOnly = [];
for (const f of files) { const s = fs.readFileSync(f, 'utf8'); let m; while ((m = callRe.exec(s))) { total++;
  let url = m[2].slice(1, -1); const verb = m[1].toUpperCase();
  if (/^\$\{[^}]+\}$/.test(url) || url.startsWith('${')) { dyn++; continue; }   // URL entièrement dynamique : non vérifiable statiquement
  url = url.split('?')[0].replace(/\$\{[^}]+\}/g, 'X').replace(/\/+$/, '');
  if (!url.startsWith('/')) url = '/' + url;
  const line = s.slice(0, m.index).split('\n').length;
  const pathHits = ops.filter(o => o.re.test(url));
  if (!pathHits.length) missing.push(`${verb} ${url}  (${path.relative(process.cwd(), f)}:${line})`);
  else if (!pathHits.some(o => o.m === verb)) methodOnly.push(`${verb} ${url} [route existe: ${[...new Set(pathHits.map(o=>o.m))].join(',')}]  (${path.relative(process.cwd(), f)}:${line})`);
} }
console.log(JSON.stringify({ total, dynamic_unverifiable: dyn, missing_path: missing.length, wrong_method: methodOnly.length }));
fs.writeFileSync(process.argv[4], ['## Chemin absent', ...missing.sort(), '', '## Méthode absente (chemin existe)', ...methodOnly.sort()].join('\n'));
