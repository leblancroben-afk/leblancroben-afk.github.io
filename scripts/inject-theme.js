#!/usr/bin/env node
/* =========================================================
   scripts/inject-theme.js
   Branche le système de thèmes sur le site :
     1. <script src="/js/theme.js"></script> juste après <meta charset>
        (premier script de la page → pas de flash de thème) ;
     2. <link rel="stylesheet" href="/css/themes.css"> juste avant </head>
        (dernier CSS → ses surcharges l'emportent).
   Appliqué :
     - à toutes les pages .html (sauf components/, admin/, backups/ et
       les pages qui n'utilisent pas css/style.css) ;
     - aux gabarits des générateurs (gen-fiches.js, categorie-template.js,
       fiche-outil.js) pour que les pages futures l'incluent aussi.
   Idempotent : relancer ne change rien. Aucune suppression de contenu.

   Usage :  node scripts/inject-theme.js          (applique)
            node scripts/inject-theme.js --dry    (liste seulement)
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DRY = process.argv.includes('--dry');

const GENERATORS = ['gen-fiches.js', 'categorie-template.js', 'fiche-outil.js'];
const SKIP_DIRS = new Set(['.git', 'node_modules', 'components', 'admin', 'backups']);

const CHARSET_RE = /<meta\s+charset=["']?[^>]*>/gi;

function inject(text, prefix, all) {
  if (/js\/theme\.js/.test(text)) return null; // déjà fait
  const script = `<script src="${prefix}js/theme.js"></script>`;
  const link = `<link rel="stylesheet" href="${prefix}css/themes.css">`;
  let out = text, n = 0;

  const putScript = (re) => {
    out = out.replace(re, (m) => { n++; return `${m}\n  ${script}`; });
  };

  if (all) {
    putScript(CHARSET_RE);
  } else {
    const first = new RegExp(CHARSET_RE.source, 'i');
    if (first.test(out)) putScript(first);
    else out = out.replace(/<head[^>]*>/i, (m) => { n++; return `${m}\n  ${script}`; });
  }
  if (!n) return null;

  const headClose = all ? /<\/head>/gi : /<\/head>/i;
  out = out.replace(headClose, `  ${link}\n</head>`);
  return out;
}

function walk(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(path.join(dir, e.name), acc); }
    else if (e.name.endsWith('.html')) acc.push(path.join(dir, e.name));
  }
  return acc;
}

const res = { pages: 0, already: 0, noStyle: [], noHead: [], gens: [] };

for (const f of walk(ROOT, [])) {
  const rel = path.relative(ROOT, f);
  const src = fs.readFileSync(f, 'utf8');
  if (/js\/theme\.js/.test(src)) { res.already++; continue; }
  if (!/css\/style\.css/.test(src)) { res.noStyle.push(rel); continue; }
  if (!/<\/head>/i.test(src)) { res.noHead.push(rel); continue; }
  const out = inject(src, '/', false);
  if (!out) { res.noHead.push(rel); continue; }
  if (!DRY) fs.writeFileSync(f, out);
  res.pages++;
}

for (const g of GENERATORS) {
  const f = path.join(ROOT, g);
  if (!fs.existsSync(f)) continue;
  const src = fs.readFileSync(f, 'utf8');
  const heads = (src.match(/<\/head>/gi) || []).length;
  const charsets = (src.match(CHARSET_RE) || []).length;
  if (heads !== charsets) { res.gens.push(`${g} : ${charsets} charset ≠ ${heads} </head> → NON modifié`); continue; }
  const out = inject(src, '${R}', true);
  if (!out) { res.gens.push(`${g} : déjà branché`); continue; }
  if (!DRY) fs.writeFileSync(f, out);
  res.gens.push(`${g} : ${heads} gabarits`);
}

console.log(`${DRY ? '[SIMULATION] ' : ''}Pages HTML modifiées : ${res.pages} · déjà branchées : ${res.already}`);
if (res.noStyle.length) console.log(`Ignorées (pas de css/style.css) : ${res.noStyle.join(', ')}`);
if (res.noHead.length) console.log(`Ignorées (pas de <head> exploitable) : ${res.noHead.join(', ')}`);
console.log('Générateurs :\n  ' + (res.gens.join('\n  ') || '—'));
