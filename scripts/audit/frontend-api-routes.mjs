// Compare apiClient.<verb>(<littéral>) de src/ aux opérations OpenAPI réelles.
// Usage : node frontend-api-routes.mjs <ops.json> <src> <rapport.txt> [--baseline <gaps.json>] [--update-baseline]
// Avec --baseline : échoue (code 1) si un appel sans route n'est PAS dans la
// référence — cliquet comme ts-baseline.json : la dette ne peut que baisser.
import fs from 'fs'; import path from 'path';
const args = process.argv.slice(2);
const [opsFile, srcDir] = args;
const baselineIdx = args.indexOf('--baseline');
const baselineFile = baselineIdx >= 0 ? args[baselineIdx + 1] : null;
const updateBaseline = args.includes('--update-baseline');
const ops = JSON.parse(fs.readFileSync(opsFile, 'utf8')).map(([m, p]) => ({ m, segs: p.replace(/^\/api\/v1/, '').replace(/\/+$/, '').split('/') }));
// Correspondance segment par segment. Un segment LITTÉRAL du frontend face à
// un paramètre « {…} » du backend n'est pas une vraie route : le serveur le
// prend pour un identifiant (ex. /students/classes/ → /students/{student_id}/,
// 422). 2026-11-12 (AUD-ROUTES) : ces appels passaient inaperçus.
// 'X' = partie dynamique du frontend (${…}), qui peut remplir un paramètre.
function match(op, segs) {
  if (op.segs.length !== segs.length) return null;
  let captured = false;
  for (let i = 0; i < segs.length; i++) {
    const b = op.segs[i], f = segs[i];
    if (b === f) continue;
    if (/^\{[^}]+\}$/.test(b)) { if (!f.includes('X')) captured = true; continue; }
    return null;
  }
  return captured ? 'captured' : 'exact';
}
const files = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (!/__tests__|node_modules/.test(f)) walk(f); } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) files.push(f); } })(srcDir);
const callRe = /apiClient\s*\.\s*(get|post|put|patch|delete)\s*(?:<[^>()]*(?:<[^>]*>)?[^>()]*>)?\s*\(\s*(`[^`]*`|'[^']*'|"[^"]*")/g;
let total = 0, dyn = 0; const missing = [], methodOnly = [];
for (const f of files) { const s = fs.readFileSync(f, 'utf8'); let m; while ((m = callRe.exec(s))) { total++;
  let url = m[2].slice(1, -1); const verb = m[1].toUpperCase();
  if (/^\$\{[^}]+\}$/.test(url) || url.startsWith('${')) { dyn++; continue; }   // URL entièrement dynamique : non vérifiable statiquement
  // Gabarits remplacés AVANT de couper la chaîne de requête : `${a?.b}` contient un « ? ».
  url = url.replace(/\$\{[^}]+\}/g, 'X').split('?')[0].replace(/\/+$/, '');
  if (!url.startsWith('/')) url = '/' + url;
  const line = s.slice(0, m.index).split('\n').length;
  const segs = url.split('/');
  const pathHits = ops.filter(o => match(o, segs) === 'exact');
  const capturedBy = ops.find(o => o.m === verb && match(o, segs) === 'captured');
  if (!pathHits.length) missing.push(`${verb} ${url}${capturedBy ? ` [capturé par ${capturedBy.segs.join('/')}]` : ''}  (${path.relative(process.cwd(), f)}:${line})`);
  else if (!pathHits.some(o => o.m === verb)) methodOnly.push(`${verb} ${url} [route existe: ${[...new Set(pathHits.map(o=>o.m))].join(',')}]  (${path.relative(process.cwd(), f)}:${line})`);
} }
console.log(JSON.stringify({ total, dynamic_unverifiable: dyn, missing_path: missing.length, wrong_method: methodOnly.length }));
fs.writeFileSync(args[2], ['## Chemin absent', ...missing.sort(), '', '## Méthode absente (chemin existe)', ...methodOnly.sort()].join('\n'));

if (baselineFile) {
  // Clé stable : « VERBE /chemin » (sans numéro de ligne, qui bouge à chaque modification).
  const key = (line) => line.split('  (')[0].replace(/ \[(route existe|capturé par).*$/, '');
  const current = [...new Set([...missing, ...methodOnly].map(key))].sort();
  if (updateBaseline) {
    fs.writeFileSync(baselineFile, JSON.stringify(current, null, 2) + '\n');
    console.log(`Référence mise à jour : ${current.length} appel(s) sans route.`);
    process.exit(0);
  }
  const known = new Set(JSON.parse(fs.readFileSync(baselineFile, 'utf8')));
  const added = current.filter((k) => !known.has(k));
  const fixed = [...known].filter((k) => !current.includes(k));
  if (fixed.length) console.log(`Corrigé(s) depuis la référence (${fixed.length}) — abaisser avec --update-baseline :\n  ${fixed.join('\n  ')}`);
  if (added.length) {
    console.error(`::error::${added.length} nouvel(s) appel(s) frontend sans route backend :`);
    for (const k of added) console.error(`  ${[...missing, ...methodOnly].filter((l) => key(l) === k).join('\n  ')}`);
    process.exit(1);
  }
  console.log(`OK : aucun nouvel appel sans route (${current.length} connus, référence ${known.size}).`);
}
