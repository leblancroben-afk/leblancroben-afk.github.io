#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════
   gen-sitemap.js — Génère sitemap.xml et robots.txt (Albexia)

   Indépendant de gen-fiches.js : ne lit pas Firestore, ne modifie
   aucune page. Il lit les fichiers HTML présents dans le dépôt.

   1) Pages générées : il parcourt les dossiers listés dans "scan"
      (sitemap-pages.json), lit le <link rel="canonical"> et la balise
      robots de chaque index.html. Une page est ajoutée si :
        - elle a un canonical sur le bon domaine,
        - ce canonical correspond bien à l'emplacement du fichier,
        - elle n'est pas en noindex,
        - ce n'est pas une fiche outil "hors ligne",
        - elle n'est pas dans "exclude".
   2) Pages manuelles : la liste "pages" de sitemap-pages.json.
      Le fichier doit exister, sinon le build échoue.
   3) hreflang : repris du HTML, mais seulement vers des URLs
      qui sont elles-mêmes dans le sitemap (jamais vers une 404).

   Usage : node gen-sitemap.js      (depuis la racine du dépôt)
   ═══════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const CONFIG_PATH  = 'sitemap-pages.json';
const SITEMAP_PATH = 'sitemap.xml';
const ROBOTS_PATH  = 'robots.txt';
const MAX_URLS     = 50000; // limite du protocole sitemap

const errors   = [];
const warnings = [];

// ── Configuration ────────────────────────────────────────
let config;
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (e) {
  console.error(`❌ Impossible de lire ${CONFIG_PATH} : ${e.message}`);
  process.exit(1);
}
const ORIGIN   = (config.origin || 'https://albexia.com').replace(/\/+$/, '');
const SCAN     = config.scan || ['tools', 'articles', 'comparateur', 'niches', 'glossaire', 'categorie', 'tutoriels'];
const PAGES    = config.pages || [];
const DISALLOW = (config.robots && config.robots.disallow) || [];
const INCLUDE_OFFLINE = config.includeOffline === true; // fiches outils "hors ligne" : exclues par défaut

// "dossier/" = préfixe ; "a/*.html" = joker ; sinon chemin exact
function toMatcher(pattern) {
  if (pattern.endsWith('/')) return (f) => f.startsWith(pattern);
  if (pattern.includes('*')) {
    const re = new RegExp('^' + pattern.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    return (f) => re.test(f);
  }
  return (f) => f === pattern;
}
const excluders = (config.exclude || []).map(toMatcher);
const isExcluded = (relFile) => excluders.some(fn => fn(relFile));

// ── Lecture du HTML ──────────────────────────────────────
function attr(tag, name) {
  const m = tag.match(new RegExp('\\b' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\')', 'i'));
  return m ? (m[1] !== undefined ? m[1] : m[2]) : null;
}

function readPage(file) {
  const html = fs.readFileSync(file, 'utf8');
  const headEnd = html.search(/<\/head>/i);
  const head = headEnd > -1 ? html.slice(0, headEnd) : html.slice(0, 30000);

  let canonical = null;
  const alternates = [];
  for (const tag of head.match(/<link\b[^>]*>/gi) || []) {
    const rel = (attr(tag, 'rel') || '').toLowerCase();
    if (rel === 'canonical' && !canonical) canonical = (attr(tag, 'href') || '').trim() || null;
    if (rel === 'alternate' && attr(tag, 'hreflang') && attr(tag, 'href')) {
      alternates.push({ lang: attr(tag, 'hreflang'), href: attr(tag, 'href').trim() });
    }
  }
  let robots = '';
  for (const tag of head.match(/<meta\b[^>]*>/gi) || []) {
    if ((attr(tag, 'name') || '').toLowerCase() === 'robots') robots += ',' + (attr(tag, 'content') || '');
  }
  return {
    canonical,
    alternates,
    noindex: /noindex|none/i.test(robots),
    // fiche outil "hors ligne" (gen-fiches.js → generateOfflineTakeover)
    offline: /class\s*=\s*"[^"]*\boffline-page\b/.test(html),
  };
}

function* walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const p = path.posix.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name === 'index.html') yield p;
  }
}

// ── Collecte ─────────────────────────────────────────────
const entries = new Map(); // url -> { url, source, file, alternates, changefreq, priority }
const skipped = {};        // raison -> [fichiers]
const skip = (reason, file) => { (skipped[reason] = skipped[reason] || []).push(file); };

// 1) Pages manuelles
for (const p of PAGES) {
  if (!p.path || !p.path.startsWith('/')) { errors.push(`Page manuelle invalide (path doit commencer par "/") : ${JSON.stringify(p)}`); continue; }
  const file = p.file || (p.path.endsWith('/') ? p.path.slice(1) + 'index.html' : p.path.slice(1));
  if (!fs.existsSync(file)) { errors.push(`Page manuelle introuvable dans le dépôt : ${p.path} (fichier attendu : ${file})`); continue; }
  const url = ORIGIN + p.path;
  const info = readPage(file);
  if (info.noindex) warnings.push(`${p.path} est listée dans "pages" mais porte une balise noindex.`);
  if (info.canonical && info.canonical !== url) warnings.push(`${p.path} : canonical du fichier = ${info.canonical} (différent de ${url}).`);
  if (!info.canonical) warnings.push(`${p.path} : pas de <link rel="canonical"> (recommandé d'en ajouter un).`);
  entries.set(url, { url, source: 'manuel', file, alternates: info.alternates, changefreq: p.changefreq, priority: p.priority });
}

// 2) Pages générées (scan)
const scannedCount = {};
for (const dir of SCAN) {
  if (!fs.existsSync(dir)) { warnings.push(`Dossier à scanner absent : ${dir}/`); continue; }
  for (const file of walk(dir)) {
    if (isExcluded(file)) { skip('exclu (sitemap-pages.json)', file); continue; }
    const info = readPage(file);
    if (!info.canonical)                       { skip('sans canonical', file); continue; }
    if (info.noindex)                          { skip('noindex', file); continue; }
    if (info.offline && !INCLUDE_OFFLINE)       { skip('fiche outil hors ligne', file); continue; }
    if (!info.canonical.startsWith(ORIGIN + '/')) { skip('canonical sur un autre domaine', file); continue; }
    const d = path.posix.dirname(file);
    const ok = [`${ORIGIN}/${d}/`, `${ORIGIN}/${d}/index.html`];
    if (!ok.includes(info.canonical))          { skip('canonical pointe vers une autre URL', file); continue; }
    if (entries.has(info.canonical))           { skip('déjà présente (liste manuelle)', file); continue; }
    entries.set(info.canonical, { url: info.canonical, source: 'auto', file, alternates: info.alternates });
    scannedCount[dir] = (scannedCount[dir] || 0) + 1;
  }
}

// 3) hreflang : uniquement vers des URLs présentes dans le sitemap
const known = new Set(entries.keys());
for (const e of entries.values()) {
  const kept = e.alternates.filter(a => known.has(a.href));
  e.alternates = kept.length >= 2 ? kept : [];
}

// ── Garde-fous ───────────────────────────────────────────
const urls = [...entries.keys()].sort();
if (urls.length > MAX_URLS) errors.push(`${urls.length} URLs : dépasse la limite de ${MAX_URLS} par sitemap (il faudra un index de sitemaps).`);
if (!Object.keys(scannedCount).length) errors.push('Aucune page générée trouvée dans les dossiers scannés : sitemap non écrit pour éviter de publier un sitemap quasi vide.');

if (fs.existsSync(SITEMAP_PATH) && !process.env.SITEMAP_FORCE) {
  const previous = (fs.readFileSync(SITEMAP_PATH, 'utf8').match(/<loc>/g) || []).length;
  if (previous >= 20 && urls.length < previous * 0.5) {
    errors.push(`Le sitemap passerait de ${previous} à ${urls.length} URLs (perte > 50 %). Vérifier gen-fiches.js ; pour forcer : relancer le workflow avec "force" coché.`);
  }
}

// ── Rapport ──────────────────────────────────────────────
console.log('🗺️  Sitemap Albexia');
console.log(`  Pages manuelles : ${[...entries.values()].filter(e => e.source === 'manuel').length}`);
for (const d of SCAN) console.log(`  ${d}/ : ${scannedCount[d] || 0}`);
console.log(`  TOTAL : ${urls.length} URL(s)`);
for (const [reason, files] of Object.entries(skipped)) {
  console.log(`  ↳ ignorées — ${reason} : ${files.length}` + (files.length <= 3 ? ` (${files.join(', ')})` : ` (ex. ${files[0]})`));
}
for (const w of warnings) console.log(`  ⚠️  ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`  ❌ ${e}`);
  process.exit(1);
}

// ── Écriture ─────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const xml = ['<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'];
for (const url of urls) {
  const e = entries.get(url);
  xml.push('  <url>');
  xml.push(`    <loc>${esc(url)}</loc>`);
  if (e.changefreq) xml.push(`    <changefreq>${esc(e.changefreq)}</changefreq>`);
  if (e.priority !== undefined) xml.push(`    <priority>${esc(e.priority)}</priority>`);
  for (const a of e.alternates) xml.push(`    <xhtml:link rel="alternate" hreflang="${esc(a.lang)}" href="${esc(a.href)}"/>`);
  xml.push('  </url>');
}
xml.push('</urlset>', '');
fs.writeFileSync(SITEMAP_PATH, xml.join('\n'), 'utf8');

const robots = ['# Fichier généré automatiquement par gen-sitemap.js — ne pas modifier à la main.',
  '# Modifier sitemap-pages.json (section "robots") puis relancer le workflow.',
  'User-agent: *', 'Allow: /', ...DISALLOW.map(p => `Disallow: ${p}`), '',
  `Sitemap: ${ORIGIN}/sitemap.xml`, ''];
fs.writeFileSync(ROBOTS_PATH, robots.join('\n'), 'utf8');

console.log(`✅ ${SITEMAP_PATH} (${urls.length} URLs) et ${ROBOTS_PATH} écrits.`);
