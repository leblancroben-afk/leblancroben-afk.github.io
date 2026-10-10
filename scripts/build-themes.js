#!/usr/bin/env node
/* =========================================================
   scripts/build-themes.js
   Génère css/themes.css = scripts/themes-core.css (jetons + bouton,
   écrits à la main) + surcharges AUTOMATIQUES du thème clair.

   Principe : on lit tous les CSS existants (sans les modifier) et, pour
   chaque règle contenant une couleur codée en dur, on écrit une
   surcharge  html[data-theme="light"] <sélecteur> { … }  avec la
   couleur adaptée au thème papier/encre. Le thème sombre n'a AUCUNE
   règle ici : il reste exactement celui des fichiers actuels.

   Usage :  node scripts/build-themes.js            (écrit css/themes.css)
            node scripts/build-themes.js --report   (rapport seulement)
   ========================================================= */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CORE = path.join(__dirname, 'themes-core.css');
const OUT = path.join(ROOT, 'css', 'themes.css');
const REPORT_ONLY = process.argv.includes('--report');

/* Ordre = ordre de lecture du rapport (style.css d'abord). */
const FILES = [
  'css/style.css', 'css/footer.css', 'css/tool-detail.css', 'css/tool-page.css',
  'css/fiche-outil.css', 'css/article.css', 'css/categorie.css', 'css/niche.css',
  'js/niche.css', 'css/hub.css', 'css/comparateur.css', 'css/comparer.css',
  'css/alternatives.css', 'css/guide-alternatif.css', 'css/faq.css',
  'css/tutoriels-hub.css', 'css/videotheque.css', 'css/profile.css', 'css/auth.css'
];

const INK = '25,23,18'; // #191712

/* ─────────────── Lecture CSS (parseur minimal, sans dépendance) ─────────────── */
function stripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, ''); }

/* Avance jusqu'au caractère `stops` au niveau 0 (hors guillemets / parenthèses). */
function scan(s, i, stops) {
  let depth = 0, q = null;
  for (; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '(') { depth++; continue; }
    if (c === ')') { depth--; continue; }
    if (depth === 0 && stops.includes(c)) return i;
  }
  return -1;
}

function matchBrace(s, open) { // s[open] === '{'
  let depth = 0, q = null, paren = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '(') { paren++; continue; }
    if (c === ')') { paren--; continue; }
    if (paren > 0) continue;
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function splitTop(s, sep) {
  const parts = []; let last = 0, i = 0;
  while ((i = scan(s, i, sep)) !== -1) { parts.push(s.slice(last, i)); last = ++i; }
  parts.push(s.slice(last));
  return parts;
}

function parseDecls(body) {
  const out = [];
  for (const raw of splitTop(body, ';')) {
    const d = raw.trim(); if (!d) continue;
    const k = d.indexOf(':'); if (k < 1) continue;
    out.push({ prop: d.slice(0, k).trim().toLowerCase(), value: d.slice(k + 1).trim() });
  }
  return out;
}

function parseNodes(s) {
  const nodes = []; let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    const stop = scan(s, i, ['{', ';']);
    if (stop === -1) break;
    const prelude = s.slice(i, stop).trim();
    if (s[stop] === ';') { i = stop + 1; continue; } // @import, @charset…
    const end = matchBrace(s, stop);
    if (end === -1) break;
    const body = s.slice(stop + 1, end);
    i = end + 1;
    if (prelude.startsWith('@')) {
      if (/^@(media|supports)\b/i.test(prelude)) nodes.push({ at: prelude, children: parseNodes(body) });
      /* @keyframes, @font-face, @page… ignorés */
    } else {
      nodes.push({ selector: prelude, decls: parseDecls(body) });
    }
  }
  return nodes;
}

/* ─────────────── Correspondances de couleurs ─────────────── */
const TEXT_PROPS = /^(color|fill|stroke|caret-color|text-decoration-color|-webkit-text-fill-color|-webkit-text-stroke-color)$/;
const SHADOW_PROPS = /(shadow|filter)/;

/* Sélecteurs dont le blanc doit rester blanc (par-dessus images / fonds sombres fixes). */
const KEEP_WHITE_SEL = /(#lb-|lightbox|thumb|gallery|[-_]play(?![a-z])|hub-spotlight|badge-short|thumb-duree|\.toast-link-btn|\.lb-)/i;

/* Fond « coloré » : le texte blanc posé dessus reste blanc. */
function coloredBg(bg) {
  if (!bg) return false;
  if (/var\(--(accent|purple|pink|teal|danger)/i.test(bg)) return true;
  if (/gradient\(/i.test(bg)) return true;
  if (/rgba?\(\s*0\s*,\s*0\s*,\s*0/i.test(bg)) return true;
  if (/rgba?\(\s*(255\s*,\s*107|108\s*,\s*99|52\s*,\s*211|0\s*,\s*212)/i.test(bg)) return true;
  const hexes = bg.match(/#[0-9a-f]{3,8}\b/gi) || [];
  return hexes.some(h => !['#fff', '#ffffff', '#f4f1ea'].includes(h.toLowerCase()) && !/^#(0a0a0f|12121a|16161f|1e1e2a)$/i.test(h));
}

function norm(hex) {
  let h = hex.toLowerCase();
  if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  return h;
}

/* ctx = { selector, isText, isShadow, bg, primaryBtn } */
function mapHex(h, ctx) {
  const x = norm(h);
  switch (x) {
    case '#ffffff':
      if (ctx.isText) return keepWhiteText(ctx) ? null : 'var(--text)';
      if (ctx.primaryBtn) return 'var(--text)';
      return null;
    case '#0a0a0f': return ctx.isText ? (ctx.primaryBtn ? 'var(--bg)' : null) : 'var(--bg)';
    case '#12121a': case '#16161f': case '#13131f': return ctx.isText ? null : 'var(--surface)';
    case '#1e1e2a': case '#1a1a2e': return ctx.isText ? null : 'var(--surface2)';
    case '#f0f0f5': return ctx.isText ? 'var(--text)' : null;
    case '#e8e8ee': return ctx.isText ? 'var(--text)' : '#33312a';
    case '#55556e': case '#4a4a6a': return ctx.isText ? 'var(--text-dim)' : null;
    case '#8a8a9e': case '#7a7a9a': case '#9090a8': case '#8888aa': return ctx.isText ? 'var(--text-muted)' : null;
    case '#33334a': return ctx.isText ? null : 'var(--border-strong)';
    case '#26263a': return ctx.isText ? null : 'var(--border)';
    case '#a8a3ff': case '#6c63ff': return ctx.isText ? '#5a50d0' : null;
    case '#ff9dbc': case '#ff4d8b': return ctx.isText ? 'var(--accent-ink)' : null;
    case '#ff6b9d': return ctx.isText ? 'var(--accent-ink)' : 'var(--accent)';
    case '#34d399': case '#00d4aa': case '#00bfa0': case '#009b80': return ctx.isText ? 'var(--accent2)' : null;
    case '#f5a623': case '#e8b84b': return ctx.isText ? '#b45309' : null;
    case '#e05c5c': case '#ff4d4d': case '#f87171': case '#ff6b78': case '#ff7070': return ctx.isText ? 'var(--danger)' : null;
    default: return null;
  }
}

function keepWhiteText(ctx) {
  return KEEP_WHITE_SEL.test(ctx.selector) || coloredBg(ctx.bg);
}

function fmtAlpha(a) { return String(Math.round(a * 100) / 100).replace(/^0\./, '.').replace(/^\./, '0.'); }

function mapRgb(r, g, b, a, ctx) {
  const hasA = a !== undefined;
  const alpha = hasA ? (a.endsWith('%') ? parseFloat(a) / 100 : parseFloat(a)) : 1;
  const out = (rgb, al) => hasA ? `rgba(${rgb},${al})` : `rgb(${rgb})`;
  const key = `${r},${g},${b}`;
  if (key === '255,255,255') {
    if (ctx.isText) return keepWhiteText(ctx) ? null : out(INK, a);
    if (KEEP_WHITE_SEL.test(ctx.selector)) return null;
    return out(INK, a);
  }
  if (key === '0,0,0') {
    return ctx.isShadow && hasA ? out(INK, fmtAlpha(alpha * 0.4)) : null;
  }
  if (key === '10,10,15') return ctx.isText ? null : (hasA ? out('244,241,234', a) : 'var(--bg)');
  if (key === '255,107,157') return out('232,68,124', a);
  if (key === '52,211,153' || key === '0,212,170') return out('14,122,95', a);
  if (key === '245,166,35' || key === '232,184,75') return out('180,83,9', a);
  if (key === '224,92,92' || key === '255,77,77' || key === '255,71,87') return out('194,57,43', a);
  return null;
}

/* Remplace toutes les couleurs d'une valeur ; protège url(...). */
function mapValue(value, ctx) {
  const holes = [];
  let v = value.replace(/url\([^)]*\)/gi, m => { holes.push(m); return `\u0000${holes.length - 1}\u0000`; });

  v = v.replace(/rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)/gi,
    (m, r, g, b, a) => mapRgb(+r, +g, +b, a, ctx) || m);
  v = v.replace(/#[0-9a-fA-F]{3,8}\b/g, m => mapHex(m, ctx) || m);
  v = v.replace(/(^|[\s,(])white(?=$|[\s,;)])/gi, (m, p) => {
    const r = mapHex('#ffffff', ctx); return r ? p + r : m;
  });

  return v.replace(/\u0000(\d+)\u0000/g, (_, i) => holes[+i]);
}

/* ─────────────── Génération des surcharges ─────────────── */
const PREFIX = 'html[data-theme="light"] ';

function prefixSelector(sel) {
  const parts = splitTop(sel, ',').map(s => s.trim()).filter(Boolean);
  const kept = [];
  for (const p of parts) {
    if (/^(html|:root|\*)(?![\w-])/.test(p) && !/^\*\s*\S/.test(p)) continue;
    if (/fo-theme-template/.test(p)) continue; // thème « template » des fiches : traité à part
    kept.push(PREFIX + p);
  }
  return kept;
}

const stats = { rules: 0, decls: 0, perFile: {}, unmapped: {}, residual: {}, residualEx: {}, collisions: [] };
const seenSel = {}; // sélecteur -> fichier (détection de collisions entre fichiers)


/* Couleurs « sensibles au thème » restées telles quelles (très claires, très
   sombres ou grises) : liste de suivi à relire après génération. */
function lumOf(r, g, b) {
  const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function noteResidual(d, selector, file) {
  if (d.prop.startsWith('--')) return;
  if (/fo-theme-template/.test(selector)) return;
  const v = d.value.replace(/url\([^)]*\)/gi, '');
  const lits = [];
  (v.match(/#[0-9a-fA-F]{3,8}\b/g) || []).forEach(h => {
    let x = norm(h); if (x.length < 7) return;
    lits.push([parseInt(x.slice(1, 3), 16), parseInt(x.slice(3, 5), 16), parseInt(x.slice(5, 7), 16)]);
  });
  (v.match(/rgba?\(\s*\d+\s*[, ]\s*\d+\s*[, ]\s*\d+/gi) || []).forEach(m => {
    const n = m.match(/\d+/g).map(Number); if (n[0] === 0 && n[1] === 0 && n[2] === 0) return; lits.push(n);
  });
  const bad = lits.some(([r, g, b]) => { const l = lumOf(r, g, b); const grey = Math.max(r, g, b) - Math.min(r, g, b) < 40; return l > 0.8 || (l < 0.03 && grey); });
  if (!bad) return;
  stats.residual[file] = (stats.residual[file] || 0) + 1;
  (stats.residualEx[file] = stats.residualEx[file] || []).push(`${selector.replace(/\s+/g, ' ').slice(0, 50)} { ${d.prop}: ${d.value.slice(0, 50)} }`);
}

function processRule(node, file, atCtx) {
  const sels = prefixSelector(node.selector);
  if (!sels.length) return null;
  const dmap = {};
  for (const d of node.decls) dmap[d.prop] = d.value;
  const bg = dmap['background'] || dmap['background-color'] || dmap['background-image'] || '';
  const col = (dmap['color'] || '').trim();
  const primaryBtn =
    /^(#fff|#ffffff|white)\b/i.test((dmap['background'] || dmap['background-color'] || '').trim()) &&
    /(btn|cta|pg-|submit|button)/i.test(node.selector) &&
    !/(logo|img|thumb|fo-alt)/i.test(node.selector) &&
    (!col || /^(var\(--bg\)|#0a0a0f)/i.test(col));

  const changed = [];
  for (const d of node.decls) {
    if (d.prop.startsWith('--')) continue;
    const ctx = {
      selector: node.selector, bg, primaryBtn,
      isText: TEXT_PROPS.test(d.prop), isShadow: SHADOW_PROPS.test(d.prop)
    };
    let nv = mapValue(d.value, ctx);

    /* texte en couleur d'accent : version « encre » lisible sur papier */
    if (d.prop === 'color' && /^var\(--(accent|purple|pink)\)(\s*!important)?$/i.test(d.value.trim()) && !coloredBg(bg)) {
      nv = d.value.replace(/var\(--(accent|purple|pink)\)/i, 'var(--accent-ink)');
    }
    if (nv !== d.value) changed.push(`${d.prop}: ${nv}`);
    else noteResidual(d, node.selector, file);
  }
  if (primaryBtn && !col && changed.length) changed.push('color: var(--bg)');
  if (!changed.length) return null;

  for (const s of sels) {
    const k = atCtx + '|' + s;
    if (seenSel[k] && seenSel[k] !== file) stats.collisions.push(`${s} (${seenSel[k]} / ${file})`);
    seenSel[k] = file;
  }
  stats.rules++; stats.decls += changed.length;
  stats.perFile[file] = (stats.perFile[file] || 0) + changed.length;
  return `${sels.join(',\n')} { ${changed.join('; ')}; }`;
}

function processNodes(nodes, file, atCtx) {
  const out = [];
  for (const n of nodes) {
    if (n.children) {
      const inner = processNodes(n.children, file, atCtx + '@' + n.at);
      if (inner.length) out.push(`${n.at} {\n${inner.join('\n')}\n}`);
    } else {
      const r = processRule(n, file, atCtx);
      if (r) out.push(r);
    }
  }
  return out;
}

/* Couleurs restantes (non traitées) : pour le suivi de couverture. */
function countRemaining(nodes, file) {
  const walk = ns => { for (const n of ns) {
    if (n.children) { walk(n.children); continue; }
    if (/fo-theme-template/.test(n.selector)) continue;
    for (const d of n.decls) {
      if (d.prop.startsWith('--')) continue;
      const v = d.value.replace(/url\([^)]*\)/gi, '');
      const m = v.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g);
      if (m) stats.unmapped[file] = (stats.unmapped[file] || 0) + m.length;
    }
  } };
  walk(nodes);
}

/* ─────────────── Exécution ─────────────── */
const blocks = [];
for (const rel of FILES) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { console.warn('⚠ introuvable :', rel); continue; }
  const nodes = parseNodes(stripComments(fs.readFileSync(abs, 'utf8')));
  const rules = processNodes(nodes, rel, '');
  countRemaining(nodes, rel);
  if (rules.length) blocks.push(`/* ── ${rel} ── */\n${rules.join('\n')}`);
}

if (!fs.existsSync(CORE)) { console.error('✖ scripts/themes-core.css manquant'); process.exit(1); }
const core = fs.readFileSync(CORE, 'utf8').trimEnd();
const css =
`${core}

/* ═══════════════════════════════════════════════════════════
   SURCHARGES AUTOMATIQUES DU THÈME CLAIR
   Générées par scripts/build-themes.js — NE PAS ÉDITER À LA MAIN
   (modifier scripts/themes-core.css ou le script, puis relancer).
   Le thème sombre n'a aucune règle ici.
   ═══════════════════════════════════════════════════════════ */

${blocks.join('\n\n')}
`;

console.log(`Règles de surcharge : ${stats.rules} · déclarations : ${stats.decls} · taille : ${(css.length / 1024).toFixed(1)} Ko`);
console.log('Déclarations surchargées par fichier :', stats.perFile);
console.log('À relire — couleurs très claires / très sombres / grises NON surchargées :', stats.residual);
if (process.argv.includes('--examples')) for (const f in stats.residualEx) { console.log('\n' + f); stats.residualEx[f].slice(0, 40).forEach(e => console.log('   ' + e)); }
console.log(`Sélecteurs présents dans plusieurs fichiers avec surcharge : ${stats.collisions.length}`);
if (stats.collisions.length) console.log('  ex. ' + stats.collisions.slice(0, 8).join('\n      '));

if (!REPORT_ONLY) { fs.writeFileSync(OUT, css); console.log('✔ écrit :', path.relative(ROOT, OUT)); }
