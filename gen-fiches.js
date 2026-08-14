#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════
   gen-fiches.js — Générateur de fiches outils Albexia
   Source : Firestore collections "outils", "articles", "comparaisons"
   Sortie : tools/{plan}/{langue}/{slug}/index.html
            articles/{langue}/{slug}/index.html
            comparateur/{slug}/index.html
   Usage  : node gen-fiches.js

   ── Génération incrémentale ──
   Chaque doc lu est hashé (SHA-256 de son contenu). L'état
   (hash + updatedAt par doc) est persisté dans .gen-state.json,
   committé dans le repo avec le reste. Un doc dont le hash n'a
   pas changé depuis le dernier run n'est PAS réécrit sur disque
   — ça évite du bruit Git et du travail inutile.

   Important : ceci NE réduit PAS le nombre de lectures Firestore
   (chaque doc doit être lu pour calculer son hash et détecter les
   suppressions), seulement le nombre d'écritures fichier/Git.
   Réduire les lectures elles-mêmes demanderait des requêtes
   partielles (where updatedAt > lastRun) qui manqueraient les
   suppressions et les docs jamais resauvegardés — jugé trop
   fragile pour l'instant.

   Cascade : si un outil référencé par une comparaison a changé
   (note, prix, etc.), la comparaison est régénérée même si son
   propre contenu n'a pas bougé, pour rester synchronisée.
   ═══════════════════════════════════════════════════════ */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore }        = require('firebase-admin/firestore');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ── Init Firebase Admin ──────────────────────────────────
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// ── État de génération incrémentale ──────────────────────
const STATE_PATH = '.gen-state.json';

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    // Premier run, ou fichier absent/corrompu : état vide, tout sera généré.
    return { outils: {}, articles: {}, comparaisons: {}, niches: {} };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

// Hash stable du contenu d'un doc (indépendant de l'ordre des clés).
// On exclut updatedAt du hash : c'est un timestamp serveur qui change
// à chaque save même si le contenu réel est identique (ex: ré-ouverture
// puis fermeture d'un formulaire sans modif) — l'inclure ferait
// régénérer inutilement à chaque simple resauvegarde.
function hashDoc(data) {
  const { updatedAt, ...rest } = data;
  const sorted = JSON.stringify(rest, Object.keys(rest).sort());
  return crypto.createHash('sha256').update(sorted).digest('hex');
}

function updatedAtMs(data) {
  const u = data.updatedAt;
  if (!u) return 0;
  // Firestore Timestamp (admin SDK) expose toMillis()
  if (typeof u.toMillis === 'function') return u.toMillis();
  if (u instanceof Date) return u.getTime();
  return 0;
}

// ── Helpers ──────────────────────────────────────────────
function slugify(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Un même outil existe comme plusieurs documents Firestore distincts (un par
// langue : fr/en/es). On déduplique par nom plutôt que de compter sur la
// fiabilité du champ "langue" sur chaque variante — plus robuste, peu
// importe la cause exacte d'un éventuel doublon (langue mal renseignée,
// vraie duplication accidentelle, etc.). En cas de plusieurs variantes du
// même nom, on garde en priorité celle en français.
function deduplicateParNom(tools) {
  const parNom = new Map();
  for (const t of tools) {
    const key = slugify(t.name);
    if (!key) continue;
    const existant = parNom.get(key);
    if (!existant) { parNom.set(key, t); continue; }
    const existantEstFr = !existant.langue || existant.langue === 'fr';
    const candidatEstFr = !t.langue || t.langue === 'fr';
    if (!existantEstFr && candidatEstFr) parNom.set(key, t); // remplace par la version FR
  }
  return [...parNom.values()];
}

function badgePrice(price, langue) {
  const labels = {
    fr: { gratuit:'Gratuit', freemium:'Freemium', payant:'Payant' },
    en: { gratuit:'Free',    freemium:'Freemium', payant:'Paid'   },
    es: { gratuit:'Gratis',  freemium:'Freemium', payant:'De pago'},
  };
  const l = labels[langue] || labels.fr;
  const map = {
    gratuit:  `<span class="tool-badge badge-hot">${l.gratuit}</span>`,
    freemium: `<span class="tool-badge badge-freemium">${l.freemium}</span>`,
    payant:   `<span class="tool-badge badge-cat">${l.payant}</span>`,
  };
  return map[price] || '';
}

function stars(note, langue = 'fr') {
  const n = Math.round(note || 0);
  const newLabel = { fr: 'Nouveau', en: 'New', es: 'Nuevo' }[langue] || 'Nouveau';
  return Array.from({length:5}, (_,i) =>
    `<span class="star ${i < n ? 'on' : ''}">★</span>`
  ).join('') + `<span class="star-label">${note ? note+'/5' : newLabel}</span>`;
}

// R = chemin absolu vers la racine du site (site servi à la racine du domaine)
const R = '/';
const SITE_ORIGIN = 'https://albexia.com';

function navHTML(langue) {
  const homeLabel = { fr:'Accueil', en:'Home',  es:'Inicio' }[langue] || 'Accueil';
  const toolLabel = { fr:'Outils',  en:'Tools', es:'Herramientas' }[langue] || 'Outils';
  const blogLabel = { fr:'Blog',    en:'Blog',  es:'Blog' }[langue] || 'Blog';
  return `<nav>
  <div class="logo">
    <svg viewBox="0 0 130 36" xmlns="http://www.w3.org/2000/svg" height="32" aria-label="Albexia">
      <style>.poly-part{animation:buildIn 1.2s ease-out forwards;opacity:0}.logo-text{animation:fadeIn 1s ease-out 0.8s forwards;opacity:0}@keyframes buildIn{0%{opacity:0;transform:translateY(10px) scale(.8)}100%{opacity:1;transform:translateY(0) scale(1)}}@keyframes fadeIn{0%{opacity:0;transform:translateX(-5px)}100%{opacity:1;transform:translateX(0)}}.part-1{animation-delay:.1s}.part-2{animation-delay:.3s}.part-3{animation-delay:.5s}</style>
      <polygon class="poly-part part-1" points="2,10 14,32 10,32" fill="#ff6b9d"/>
      <polygon class="poly-part part-2" points="14,2 18,12 10,12" fill="#ff6b9d" opacity="0.6"/>
      <polygon class="poly-part part-3" points="26,10 14,32 18,32" fill="#ff6b9d"/>
      <text class="logo-text" x="36" y="26" font-family="Georgia,serif" font-size="20" font-weight="700" fill="#f0f0f5" letter-spacing="-0.5">Albe<tspan fill="#ff6b9d">x</tspan>ia</text>
    </svg>
  </div>
  <div class="nav-links">
    <button class="nav-link" onclick="window.location.href='${R}index.html'">${homeLabel}</button>
    <button class="nav-link" onclick="window.location.href='${R}index.html#tools'">${toolLabel}</button>
    <button class="nav-link" onclick="window.location.href='${R}index.html#blog'">${blogLabel}</button>
  </div>
  <div class="kebab-wrap" id="kebab-wrap">
    <button class="kebab-btn" id="kebab-btn" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button>
    <div class="kebab-menu" id="kebab-menu" role="menu">
      <a href="${R}glossaire/" class="kebab-item" role="menuitem"><span class="kebab-ico">📖</span><div><div class="kebab-item-name">Glossaire IA</div></div></a>
      <a href="${R}tutoriels/index.html" class="kebab-item" role="menuitem"><span class="kebab-ico">🎬</span><div><div class="kebab-item-name">Tutoriels vidéo</div></div></a>
      <a href="${R}comparateur/" class="kebab-item" role="menuitem"><span class="kebab-ico">⚖️</span><div><div class="kebab-item-name">Comparateur</div></div></a>
      <a href="${R}deals/" class="kebab-item" role="menuitem"><span class="kebab-ico">🔥</span><div><div class="kebab-item-name">Deals &amp; Promos</div></div></a>
      <div class="kebab-divider"></div>
      <a href="${R}hub.html" class="kebab-item" role="menuitem"><span class="kebab-ico">📂</span><div><div class="kebab-item-name">Toutes les sections →</div></div></a>
    </div>
  </div>
</nav>`;
}

function footerHTML() {
  return `<footer>
  <div style="text-align:center;padding:24px;font-size:13px;color:#4a4a6a;border-top:1px solid rgba(255,255,255,0.07)">
    &copy; 2025-2026 <a href="${R}index.html" style="color:#a8a3ff;text-decoration:none">Albexia</a> —
    <a href="${R}mentions-legales.html" style="color:#7a7a9a;text-decoration:none">Mentions légales</a> ·
    <a href="${R}politique-confidentialite.html" style="color:#7a7a9a;text-decoration:none">Confidentialité</a> ·
    <a href="${R}contact.html" style="color:#7a7a9a;text-decoration:none">Contact</a>
  </div>
</footer>`;
}

function sharedJS() {
  return `<script>
  const kb = document.getElementById('kebab-btn'), km = document.getElementById('kebab-menu');
  if (kb && km) {
    kb.addEventListener('click', e => { e.stopPropagation(); const o = km.classList.toggle('open'); kb.setAttribute('aria-expanded', o); });
    document.addEventListener('click', () => { km.classList.remove('open'); kb.setAttribute('aria-expanded','false'); });
    km.addEventListener('click', e => e.stopPropagation());
  }
</script>`;
}

function faqJS() {
  return `<script>
  document.querySelectorAll('.faq-q').forEach(q => {
    q.addEventListener('click', () => q.parentElement.classList.toggle('open'));
  });
</script>`;
}

function tutorialJS() {
  return `<script>
  function toggleTutorial(id) {
    const item = document.getElementById(id);
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.tutorial-item.open').forEach(el => {
      if (el.id !== id) { el.classList.remove('open'); const f = el.querySelector('iframe'); if (f) f.src=''; }
    });
    if (isOpen) { item.classList.remove('open'); const f = item.querySelector('iframe'); if (f) f.src=''; }
    else { item.classList.add('open'); const f = item.querySelector('iframe[data-src]'); if (f && !f.src) f.src=f.dataset.src; }
  }
</script>`;
}

// ── Alternatives ──────────────────────────────────────────
function altsHTML(alternatives, name, langue) {
  const moreLabel = { fr:'Voir tous les outils →', en:'See all tools →', es:'Ver todas las herramientas →' }[langue] || 'Voir tous les outils →';
  if (!alternatives || !alternatives.length) return '';
  const items = alternatives.map(a => {
    // Format : "nom|domaine|description" ou juste "nom"
    const [nom, domaine, desc] = (typeof a === 'string' ? a : `${a.nom}|${a.domaine||''}|${a.desc||''}`).split('|');
    const domain = domaine || slugify(nom) + '.com';
    const favicon = `https://www.google.com/s2/favicons?sz=32&domain=${domain}`;
    const siteUrl = domaine ? (domaine.startsWith('http') ? domaine : `https://${domaine}`) : `https://${domain}`;
    return `<a href="${siteUrl}" target="_blank" rel="noopener" class="alt-item">
      <img src="${favicon}" alt="${nom}" onerror="this.style.display='none'">
      <div><div class="alt-name">${nom}</div><div class="alt-desc">${desc || `Alternative à ${name}`}</div></div>
    </a>`;
  }).join('');
  return `<div class="sidebar-card">
    <div class="sc-title">${{fr:'Alternatives', en:'Alternatives', es:'Alternativas'}[langue]||'Alternatives'}</div>
    ${items}
    <a href="${R}index.html#tools" class="alt-more">${moreLabel}</a>
  </div>`;
}

// ── Infos rapides sidebar ─────────────────────────────────
function infosSidebar(tool, langue) {
  const labels = {
    fr: { cat:'Catégorie', prix:'Prix', ideal:'Idéal pour', dev:'Développeur', plateformes:'Plateformes', api:'API', ifr:'Interface FR', essai:'Essai gratuit', oui:'✓ Oui' },
    en: { cat:'Category',  prix:'Price', ideal:'Ideal for', dev:'Developer',   plateformes:'Platforms',   api:'API', ifr:'FR Interface',  essai:'Free trial',   oui:'✓ Yes' },
    es: { cat:'Categoría', prix:'Precio', ideal:'Ideal para', dev:'Desarrollador', plateformes:'Plataformas', api:'API', ifr:'Interfaz FR', essai:'Prueba gratis', oui:'✓ Sí' },
  }[langue] || {};
  const price = tool.price || 'freemium';
  const priceLabel = { fr:{gratuit:'Gratuit',freemium:'Freemium',payant:'Payant'}, en:{gratuit:'Free',freemium:'Freemium',payant:'Paid'}, es:{gratuit:'Gratis',freemium:'Freemium',payant:'De pago'} }[langue]?.[price] || price;
  return `<div class="sidebar-card sidebar-card-featured-highlight">
    <div class="sc-title">${{fr:'Infos rapides',en:'Quick info',es:'Info rápida'}[langue]||'Infos rapides'}</div>
    ${tool.maker ? `<div class="sc-row"><span class="sc-label">${labels.dev}</span><span class="sc-val">${tool.maker}</span></div>` : ''}
    <div class="sc-row"><span class="sc-label">${labels.cat}</span><span class="sc-val">${tool.category||''}</span></div>
    <div class="sc-row"><span class="sc-label">${labels.prix}</span><span class="sc-val-green sc-val">${priceLabel}</span></div>
    ${tool.ideal_pour ? `<div class="sc-row"><span class="sc-label">${labels.ideal}</span><span class="sc-val">${tool.ideal_pour}</span></div>` : ''}
    ${tool.plateformes ? `<div class="sc-row"><span class="sc-label">${labels.plateformes}</span><span class="sc-val">${tool.plateformes}</span></div>` : ''}
    ${tool.api ? `<div class="sc-row"><span class="sc-label">${labels.api}</span><span class="sc-val">${labels.oui}</span></div>` : ''}
    ${tool.interface_fr ? `<div class="sc-row"><span class="sc-label">${labels.ifr}</span><span class="sc-val-green sc-val">${labels.oui}</span></div>` : ''}
    ${tool.essai_gratuit ? `<div class="sc-row"><span class="sc-label">${labels.essai}</span><span class="sc-val-green sc-val">${labels.oui} · ${tool.duree_essai||''}</span></div>` : ''}
  </div>`;
}

// ════════════════════════════════════════════════════════════
// BALISES SEO MULTILINGUES (canonical, hreflang, og:locale)
// Fonction commune réutilisée par les fiches outils ET les articles,
// pour ne jamais dupliquer ni faire diverger cette logique sensible au SEO.
// ════════════════════════════════════════════════════════════
function seoHeadTags(langue, langueUrls) {
  const canonicalUrl = langueUrls[langue];

  // Le x-default pointe vers le FR si disponible, sinon la langue courante —
  // jamais vers une langue absente (éviterait un hreflang -> 404).
  const xDefaultUrl = langueUrls.fr || canonicalUrl;

  const hreflangTags = Object.entries(langueUrls)
    .map(([langCode, u]) => `  <link rel="alternate" hreflang="${langCode}" href="${u}" />`)
    .join('\n') + `\n  <link rel="alternate" hreflang="x-default" href="${xDefaultUrl}" />`;

  const ogLocales = { fr: 'fr_FR', en: 'en_US', es: 'es_ES' };
  const ogLocale = ogLocales[langue] || 'fr_FR';
  const ogLocaleAlternates = Object.keys(langueUrls)
    .filter(l => l !== langue)
    .map(l => `  <meta property="og:locale:alternate" content="${ogLocales[l] || l}" />`)
    .join('\n');

  return { canonicalUrl, hreflangTags, ogLocale, ogLocaleAlternates };
}

// Construit la map {langue: url} pour un outil, en résolvant ses traductions
// (qui référencent des IDs) vers les URLs réelles des fiches correspondantes.
function toolLangueUrls(tool, allTools) {
  const slug = slugify(tool.name);
  const folder = tool.plan === 'featured' ? 'featured' : tool.plan === 'starter' ? 'starter' : 'standard';
  const langue = tool.langue || 'fr';
  const canonicalUrl = `${SITE_ORIGIN}/tools/${folder}/${langue}/${slug}/`;
  const langueUrls = { [langue]: canonicalUrl };

  for (const [langCode, relId] of Object.entries(tool.traductions || {})) {
    const rel = allTools.find(t => String(t.id) === String(relId));
    if (rel) {
      const relSlug = slugify(rel.name);
      const relFolder = rel.plan === 'featured' ? 'featured' : rel.plan === 'starter' ? 'starter' : 'standard';
      const relLangue = rel.langue || langCode;
      if (relSlug) langueUrls[relLangue] = `${SITE_ORIGIN}/tools/${relFolder}/${relLangue}/${relSlug}/`;
    }
  }
  return langueUrls;
}

// ════════════════════════════════════════════════════════════
// GÉNÉRATEUR STANDARD
// ════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════
// GÉNÉRATEUR — TAKEOVER OUTIL HORS LIGNE
// (status='offline' écrit par check-liens.js, 7+ échecs consécutifs)
// Reprend le langage visuel de 404.html (voir css/tool-detail.css,
// bloc "OFFLINE TAKEOVER"). La fiche continue d'être servie à son
// URL habituelle — le SEO résiduel (recherches sur le nom de l'outil)
// n'est pas perdu — mais tout le contenu commercial (hero, tarifs,
// fonctionnalités) est remplacé par cette page neutre + alternatives.
// ════════════════════════════════════════════════════════════
function toolFicheUrl(t) {
  const folder = t.plan === 'featured' ? 'featured' : t.plan === 'starter' ? 'starter' : 'standard';
  return `${R}tools/${folder}/${t.langue || 'fr'}/${slugify(t.name)}/`;
}

function generateOfflineTakeover(tool, allTools = []) {
  const { name, description = '', category = '', langue = 'fr' } = tool;
  const titres = {
    fr: `${name} — Outil hors ligne | Albexia`,
    en: `${name} — Tool offline | Albexia`,
    es: `${name} — Herramienta fuera de línea | Albexia`,
  };
  const metaDesc = {
    fr: `${name} ne semble plus être en ligne. Découvrez des alternatives actives dans la même catégorie sur Albexia.`,
    en: `${name} no longer appears to be online. Discover active alternatives in the same category on Albexia.`,
    es: `${name} ya no parece estar en línea. Descubre alternativas activas en la misma categoría en Albexia.`,
  }[langue] || `${name} ne semble plus être en ligne.`;
  const { canonicalUrl, hreflangTags, ogLocale, ogLocaleAlternates } = seoHeadTags(langue, toolLangueUrls(tool, allTools));

  const dateVerif = tool.updatedAt && typeof tool.updatedAt.toDate === 'function'
    ? tool.updatedAt.toDate().toLocaleDateString(langue === 'en' ? 'en-GB' : langue === 'es' ? 'es-ES' : 'fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  // Alternatives calculées au build : même catégorie, actives uniquement,
  // jamais un autre outil mort. Triées par note.
  const alternatives = allTools
    .filter(t => t.langue === langue && t.category === category && t.name !== name && t.status !== 'offline' && t.status !== 'warning')
    .sort((a, b) => (b.note || b.rating || 0) - (a.note || a.rating || 0))
    .slice(0, 3);

  const labels = {
    fr: { headline: 'est', word: 'hors ligne', body: `Nous vérifions ce lien régulièrement, et il ne répond plus depuis un moment. L'outil a peut-être fermé, changé de nom, ou déménagé sans laisser d'adresse.`,
          verif: dateVerif ? `Dernière vérification le ${dateVerif}.` : '', altLabel: 'Alternative', linksLabel: 'Dans la même catégorie', foot: 'OUTIL HORS LIGNE',
          about: `${name} était référencé dans la catégorie ${category || 'outils IA'} sur Albexia.` },
    en: { headline: 'is', word: 'offline', body: `We check this link regularly, and it hasn't responded in a while. The tool may have shut down, rebranded, or moved without a trace.`,
          verif: dateVerif ? `Last checked on ${dateVerif}.` : '', altLabel: 'Alternative', linksLabel: 'In the same category', foot: 'TOOL OFFLINE',
          about: `${name} was listed in the ${category || 'AI tools'} category on Albexia.` },
    es: { headline: 'está', word: 'fuera de línea', body: `Verificamos este enlace regularmente, y no responde desde hace un tiempo. La herramienta puede haber cerrado, cambiado de nombre o mudado sin dejar rastro.`,
          verif: dateVerif ? `Última verificación el ${dateVerif}.` : '', altLabel: 'Alternativa', linksLabel: 'En la misma categoría', foot: 'HERRAMIENTA FUERA DE LÍNEA',
          about: `${name} estaba listada en la categoría ${category || 'herramientas IA'} en Albexia.` },
  };
  const t = labels[langue] || labels.fr;

  const altLinksHTML = alternatives.map(alt => `
    <a href="${toolFicheUrl(alt)}" class="offline-link-item">
      <div>
        <span class="offline-link-label">${t.altLabel}</span>
        <span class="offline-link-main">${alt.emoji || '🤖'} ${alt.name}</span>
        <span class="offline-link-sub">${(alt.description || '').slice(0, 90)}</span>
      </div>
      <span class="offline-link-arrow">→</span>
    </a>`).join('');

  return `<!DOCTYPE html>
<html lang="${langue}">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titres[langue] || titres.fr}</title>
  <meta name="description" content="${metaDesc}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${canonicalUrl}">
${hreflangTags}
  <meta property="og:title" content="${titres[langue] || titres.fr}">
  <meta property="og:description" content="${metaDesc}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:locale" content="${ogLocale}">
${ogLocaleAlternates}
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpolygon points='16,2 28,30 4,30' fill='none' stroke='%23ff6b9d' stroke-width='2.5' stroke-linejoin='round'/%3E%3Ccircle cx='16' cy='22' r='3' fill='%23ff6b9d'/%3E%3C/svg%3E">
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${R}css/style.css">
  <link rel="stylesheet" href="${R}css/tool-detail.css">
</head>
<body>
${navHTML(langue)}
<main><div class="container">
  <div class="tool-breadcrumb"><div class="container">
    <a href="${R}index.html#tools">${{fr:'Outils',en:'Tools',es:'Herramientas'}[langue]||'Outils'}</a> ›
    <a href="${R}index.html#tools">${category}</a> › <span>${name}</span>
  </div></div>

  <div class="offline-page"><div class="offline-container">
    <div class="offline-giant">${name}</div>
    <h1 class="offline-headline">${name} ${t.headline} <span class="word-h">${t.word}</span>.</h1>
    <p class="offline-body-text">${t.body}${t.verif ? ` <span class="em">${t.verif}</span>` : ''}</p>

    <div class="offline-about">
      <strong>${name}</strong> — ${t.about} ${description ? description : ''}
    </div>

    ${altLinksHTML ? `
    <div class="offline-divider"></div>
    <div class="offline-links-label">${t.linksLabel}</div>
    <div class="offline-links">${altLinksHTML}</div>` : ''}

    <p class="offline-foot">${t.foot} · <span>${name.toUpperCase()}</span></p>
  </div></div>
</div></main>
${footerHTML()}
${sharedJS()}
</body>
</html>`;
}

function generateStandard(tool, allTools=[]) {
  const { name, description='', price='freemium', category='', url='#', favicon, emoji='🤖', langue='fr' } = tool;
  const fav = favicon || `https://www.google.com/s2/favicons?sz=128&domain=${new URL(url).hostname}`;
  const slug = tool.slug_articles || slugify(name);

  const pointsForts = (tool.points_forts || []).map(p =>
    `<div class="feature-item"><div class="fi-icon">✓</div><div class="fi-title">${p}</div></div>`
  ).join('');

  const limiteHTML = tool.limite ? `
    <div class="feature-item" style="border-color:rgba(245,166,35,0.2)">
      <div class="fi-icon">⚠️</div>
      <div class="fi-title">${{fr:'Limite principale',en:'Main limitation',es:'Limitación principal'}[langue]||'Limite'}</div>
      <div class="fi-desc">${tool.limite}</div>
    </div>` : '';

  const titres = {
    fr: `${name} — Avis, Prix & Alternatives 2026 | Albexia`,
    en: `${name} — Review, Pricing & Alternatives 2026 | Albexia`,
    es: `${name} — Reseña, Precios & Alternativas 2026 | Albexia`,
  };
  const metaDesc = tool.meta_description || description.slice(0, 155);
  const { canonicalUrl, hreflangTags, ogLocale, ogLocaleAlternates } = seoHeadTags(langue, toolLangueUrls(tool, allTools));

  return `<!DOCTYPE html>
<html lang="${langue}">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titres[langue] || titres.fr}</title>
  <meta name="description" content="${metaDesc}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${canonicalUrl}">
${hreflangTags}
  <meta property="og:title" content="${titres[langue] || titres.fr}">
  <meta property="og:description" content="${metaDesc}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:locale" content="${ogLocale}">
${ogLocaleAlternates}
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpolygon points='16,2 28,30 4,30' fill='none' stroke='%23ff6b9d' stroke-width='2.5' stroke-linejoin='round'/%3E%3Ccircle cx='16' cy='22' r='3' fill='%23ff6b9d'/%3E%3C/svg%3E">
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${R}css/style.css">
  <link rel="stylesheet" href="${R}css/tool-detail.css">
</head>
<body>
${navHTML(langue)}
<main><div class="container">
  <div class="tool-hero">
    <div class="hero-glow"></div>
    <div class="tool-hero-left">
      <div class="tool-logo-wrap">
        <img src="${fav}" alt="${name} logo" class="tool-logo-img">
      </div>
      <div class="tool-hero-info">
        <div class="tool-hero-badges">
          <span class="tool-badge badge-cat">${category}</span>
          ${badgePrice(price, langue)}
        </div>
        <h1 class="tool-hero-title">${name}</h1>
        <div class="tool-hero-stars">${stars(tool.note || tool.rating || 0, langue)}</div>
        <p class="tool-hero-desc">${description}</p>
        <div class="tool-hero-actions">
          <a href="${url}" target="_blank" rel="noopener" class="btn-try">${{fr:'Essayer',en:'Try it',es:'Probar'}[langue]||'Essayer'} ${emoji} →</a>
        </div>
      </div>
    </div>
  </div>
  <div class="tool-content">
    <div class="tool-main">
      ${pointsForts || limiteHTML ? `
      <section class="tool-section">
        <h2>${{fr:"Ce qu'on retient",en:'Key takeaways',es:'Lo destacado'}[langue]||"Ce qu'on retient"}</h2>
        <div class="feature-grid">${pointsForts}${limiteHTML}</div>
      </section>` : ''}
      <div id="reviews-section"></div>
    </div>
    <aside class="tool-sidebar">
      ${infosSidebar(tool, langue)}
      ${altsHTML(tool.alternatives, name, langue)}
      <div class="sidebar-card sidebar-card-cta">
        <div class="sc-title">${{fr:`Essayer ${name}`,en:`Try ${name}`,es:`Probar ${name}`}[langue]||`Essayer ${name}`}</div>
        <p>${tool.ideal_pour || ''}</p>
        <a href="${url}" target="_blank" rel="noopener" class="btn-try-full">${{fr:`Aller sur ${name}`,en:`Go to ${name}`,es:`Ir a ${name}`}[langue]||`Aller sur ${name}`} →</a>
      </div>
    </aside>
  </div>
</div></main>
${footerHTML()}
${sharedJS()}
<script type="module" src="${R}js/reviews-widget.js"></script>
</body>
</html>`;
}

// ════════════════════════════════════════════════════════════
// GÉNÉRATEUR STARTER
// ════════════════════════════════════════════════════════════
function generateStarter(tool, allTools=[]) {
  const { name, description='', price='freemium', category='', url='#', favicon, emoji='🤖', langue='fr' } = tool;
  const fav  = favicon || `https://www.google.com/s2/favicons?sz=128&domain=${new URL(url).hostname}`;
  const slug = tool.slug_articles || slugify(name);

  const statsHTML = (tool.stats||[]).slice(0,4).map(s =>
    `<div class="tool-stat"><div class="ts-n">${s.valeur}</div><div class="ts-l">${s.label}</div></div>`
  ).join('');

  // Starter : 3 fonctionnalités max, 2 FAQ max — cf. hiérarchie éditoriale par plan.
  const featuresHTML = (tool.fonctionnalites||[]).slice(0,3).map(f =>
    `<div class="feature-item">
      <div class="fi-icon">${f.icon||'✦'}</div>
      <div class="fi-title">${f.titre}</div>
      <div class="fi-desc">${f.desc||''}</div>
    </div>`
  ).join('');

  const faqHTML = (tool.faq||[]).slice(0,2).map(f =>
    `<div class="faq-item">
      <button class="faq-q">${f.q}</button>
      <div class="faq-a">${f.a}</div>
    </div>`
  ).join('');

  const titres = {
    fr: `${name} — Guide, Tarifs & Avis 2026 | Albexia`,
    en: `${name} — Guide, Pricing & Reviews 2026 | Albexia`,
    es: `${name} — Guía, Precios & Reseñas 2026 | Albexia`,
  };

  // Articles sidebar selon langue
  const articlesSidebar = langue === 'fr'
    ? `<div class="sidebar-card">
        <div class="sc-title">Articles liés</div>
        <div id="articles-sidebar-starter"></div>
      </div>`
    : '';
  const articlesScript = langue === 'fr'
    ? `<script src="${R}js/articles-loader.js" data-outil="${slug}" data-plan="starter"></script>`
    : '';

  const metaDescStarter = (tool.meta_description||description).slice(0,155);
  const { canonicalUrl, hreflangTags, ogLocale, ogLocaleAlternates } = seoHeadTags(langue, toolLangueUrls(tool, allTools));

  return `<!DOCTYPE html>
<html lang="${langue}">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titres[langue]||titres.fr}</title>
  <meta name="description" content="${metaDescStarter}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${canonicalUrl}">
${hreflangTags}
  <meta property="og:title" content="${titres[langue]||titres.fr}">
  <meta property="og:description" content="${metaDescStarter}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:locale" content="${ogLocale}">
${ogLocaleAlternates}
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpolygon points='16,2 28,30 4,30' fill='none' stroke='%23ff6b9d' stroke-width='2.5' stroke-linejoin='round'/%3E%3Ccircle cx='16' cy='22' r='3' fill='%23ff6b9d'/%3E%3C/svg%3E">
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${R}css/style.css">
  <link rel="stylesheet" href="${R}css/tool-detail.css">
</head>
<body>
${navHTML(langue)}
<main><div class="container">
  <div class="tool-hero">
    <div class="hero-glow"></div>
    <div class="tool-hero-left">
      <div class="tool-logo-wrap">
        <img src="${fav}" alt="${name} logo" class="tool-logo-img">
      </div>
      <div class="tool-hero-info">
        <div class="tool-hero-badges">
          <span class="tool-badge badge-cat">${category}</span>
          ${badgePrice(price, langue)}
          ${tool.interface_fr ? `<span class="tool-badge badge-hot">🌍 ${langue==='fr'?'Interface en français':langue==='en'?'French interface':'Interfaz en francés'}</span>` : ''}
        </div>
        <h1 class="tool-hero-title">${name}</h1>
        ${tool.maker ? `<p class="tool-hero-maker">par <strong>${tool.maker}</strong></p>` : ''}
        <div class="tool-hero-stars">${stars(tool.note||tool.rating||0, langue)}</div>
        <p class="tool-hero-desc">${description}</p>
        <div class="tool-hero-actions">
          <a href="${url}" target="_blank" rel="noopener" class="btn-try">${{fr:'Essayer',en:'Try it',es:'Probar'}[langue]||'Essayer'} →</a>
          ${tool.url_tarifs ? `<a href="${tool.url_tarifs}" target="_blank" rel="noopener" class="btn-pricing">${{fr:'Voir les tarifs',en:'See pricing',es:'Ver precios'}[langue]||'Voir les tarifs'}</a>` : ''}
        </div>
      </div>
    </div>
  </div>
  ${statsHTML ? `<div class="tool-stats">${statsHTML}</div>` : ''}
  <div class="tool-content">
    <div class="tool-main">
      ${featuresHTML ? `
      <section class="tool-section">
        <h2>${{fr:'Fonctionnalités clés',en:'Key features',es:'Funcionalidades clave'}[langue]||'Fonctionnalités'}</h2>
        <div class="feature-grid">${featuresHTML}</div>
      </section>` : ''}
      ${faqHTML ? `
      <section class="tool-section">
        <h2>${{fr:'Questions fréquentes',en:'FAQ',es:'Preguntas frecuentes'}[langue]||'FAQ'}</h2>
        <div class="faq-list">${faqHTML}</div>
      </section>` : ''}
      <div id="reviews-section"></div>
    </div>
    <aside class="tool-sidebar">
      ${infosSidebar(tool, langue)}
      ${articlesSidebar}
      ${altsHTML(tool.alternatives, name, langue)}
      <div class="sidebar-card sidebar-card-cta">
        <div class="sc-title">${{fr:`Essayer ${name}`,en:`Try ${name}`,es:`Probar ${name}`}[langue]||`Essayer ${name}`}</div>
        <p>${tool.ideal_pour||''}</p>
        <a href="${url}" target="_blank" rel="noopener" class="btn-try-full">${{fr:`Aller sur ${name}`,en:`Go to ${name}`,es:`Ir a ${name}`}[langue]||`Aller sur ${name}`} →</a>
      </div>
    </aside>
  </div>
</div></main>
${footerHTML()}
${faqHTML ? faqJS() : ''}
${sharedJS()}
${articlesScript}
<script type="module" src="${R}js/reviews-widget.js"></script>
</body>
</html>`;
}

// ════════════════════════════════════════════════════════════
// GÉNÉRATEUR FEATURED
// ════════════════════════════════════════════════════════════
function generateFeatured(tool, allTools=[]) {
  const { name, description='', price='freemium', category='', url='#', favicon, emoji='🤖', langue='fr' } = tool;
  const fav  = favicon || `https://www.google.com/s2/favicons?sz=128&domain=${new URL(url).hostname}`;
  const slug = tool.slug_articles || slugify(name);

  const statsHTML = (tool.stats||[]).slice(0,4).map(s =>
    `<div class="tool-stat"><div class="ts-n">${s.valeur}</div><div class="ts-l">${s.label}</div></div>`
  ).join('');

  // Featured : 4 fonctionnalités max, 1 seul tutoriel, 4 FAQ max — cf. hiérarchie
  // éditoriale par plan (Featured reste plus complet que Starter/Standard,
  // mais sans dupliquer le contenu sous plusieurs formes).
  const featuresHTML = (tool.fonctionnalites||[]).slice(0,4).map(f =>
    `<div class="feature-item">
      <div class="fi-icon">${f.icon||'✦'}</div>
      <div class="fi-title">${f.titre}</div>
      <div class="fi-desc">${f.desc||''}</div>
    </div>`
  ).join('');

  const tutorielsHTML = (tool.tutoriels||[]).slice(0,1).map((t,i) => {
    const id = `tuto-${i}`;
    return `<div class="tutorial-item" id="${id}">
      <div class="tutorial-header" onclick="toggleTutorial('${id}')">
        <div class="tutorial-thumb">
          <img src="https://img.youtube.com/vi/${t.youtube_id}/mqdefault.jpg" alt="${t.titre}" loading="lazy">
          <div class="tutorial-thumb-play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
        </div>
        <div class="tutorial-meta">
          <div class="tutorial-title">${t.titre}</div>
          ${t.duree ? `<div class="tutorial-duration">${t.duree}</div>` : ''}
        </div>
        <button class="tutorial-toggle">▾</button>
      </div>
      <div class="tutorial-video">
        <div class="tutorial-video-inner">
          <iframe data-src="https://www.youtube.com/embed/${t.youtube_id}" frameborder="0" allowfullscreen style="width:100%;aspect-ratio:16/9;border-radius:8px;display:block;"></iframe>
        </div>
      </div>
    </div>`;
  }).join('');

  const faqHTML = (tool.faq||[]).slice(0,4).map(f =>
    `<div class="faq-item">
      <button class="faq-q">${f.q}</button>
      <div class="faq-a">${f.a}</div>
    </div>`
  ).join('');

  const screenshotHTML = tool.screenshot_url ? `
    <section class="tool-section">
      <h2>${{fr:"Interface de l'outil",en:'Tool interface',es:'Interfaz del tool'}[langue]||"Interface"}</h2>
      <div class="screenshot-wrap">
        <img src="${tool.screenshot_url}" alt="Interface ${name}" loading="lazy">
        <div class="screenshot-label">Interface ${name} — 2026</div>
      </div>
    </section>` : '';

  const presentationHTML = tool.presentation ? `
    <section class="tool-section">
      <h2>${{fr:`Qu'est-ce que ${name} ?`,en:`What is ${name}?`,es:`¿Qué es ${name}?`}[langue]||`Qu'est-ce que ${name} ?`}</h2>
      ${tool.presentation.split('\n').filter(Boolean).map(p=>`<p>${p}</p>`).join('')}
    </section>` : '';

  // Verdict et grille "Articles liés" du main retirés du template Featured :
  // le verdict reformulait sans info nouvelle le hero + les features, et la
  // grille d'articles faisait doublon avec la version sidebar juste en dessous
  // (une seule suffit — cf. décision éditoriale sur la densité des fiches).

  // Articles : uniquement si langue FR (articles.json est en français) —
  // affichés uniquement en sidebar sur Featured, plus de grille dans le main.
  const articlesSidebar = langue === 'fr' ? `
    <div class="sidebar-card">
      <div class="sc-title">Articles liés</div>
      <div id="articles-sidebar-all"></div>
    </div>` : '';

  const articlesScript = langue === 'fr'
    ? `<script src="${R}js/articles-loader.js" data-outil="${slug}" data-plan="featured"></script>`
    : '';

  const titres = {
    fr: `${name} — Guide complet, Tarifs & Tutoriels 2026 | Albexia`,
    en: `${name} — Complete Guide, Pricing & Tutorials 2026 | Albexia`,
    es: `${name} — Guía completa, Precios & Tutoriales 2026 | Albexia`,
  };

  const metaDescFeatured = (tool.meta_description||description).slice(0,155);
  const { canonicalUrl, hreflangTags, ogLocale, ogLocaleAlternates } = seoHeadTags(langue, toolLangueUrls(tool, allTools));

  return `<!DOCTYPE html>
<html lang="${langue}">
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titres[langue]||titres.fr}</title>
  <meta name="description" content="${metaDescFeatured}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${canonicalUrl}">
${hreflangTags}
  <meta property="og:title" content="${titres[langue]||titres.fr}">
  <meta property="og:description" content="${metaDescFeatured}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:locale" content="${ogLocale}">
${ogLocaleAlternates}
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpolygon points='16,2 28,30 4,30' fill='none' stroke='%23ff6b9d' stroke-width='2.5' stroke-linejoin='round'/%3E%3Ccircle cx='16' cy='22' r='3' fill='%23ff6b9d'/%3E%3C/svg%3E">
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${R}css/style.css">
  <link rel="stylesheet" href="${R}css/tool-detail.css">
</head>
<body>
${navHTML(langue)}
<main><div class="container">
  <div class="tool-hero">
    <div class="hero-glow"></div>
    <div class="tool-hero-left">
      <div class="tool-logo-wrap">
        <img src="${fav}" alt="${name} logo" class="tool-logo-img">
      </div>
      <div class="tool-hero-info">
        <div class="tool-hero-badges">
          <span class="tool-badge badge-cat">${category}</span>
          ${badgePrice(price, langue)}
          ${tool.interface_fr ? `<span class="tool-badge badge-hot">🌍 ${langue==='fr'?'Interface en français':langue==='en'?'French interface':'Interfaz en francés'}</span>` : ''}
        </div>
        <h1 class="tool-hero-title">${name}</h1>
        ${tool.maker ? `<p class="tool-hero-maker">par <strong>${tool.maker}</strong></p>` : ''}
        <div class="tool-hero-stars">${stars(tool.note||tool.rating||0, langue)}</div>
        <p class="tool-hero-desc">${description}</p>
        <div class="tool-hero-actions">
          <a href="${url}" target="_blank" rel="noopener" class="btn-try">${{fr:'Essayer',en:'Try it',es:'Probar'}[langue]||'Essayer'} →</a>
          ${tool.url_tarifs ? `<a href="${tool.url_tarifs}" target="_blank" rel="noopener" class="btn-pricing">${{fr:'Voir les tarifs',en:'See pricing',es:'Ver precios'}[langue]||'Voir les tarifs'}</a>` : ''}
        </div>
      </div>
    </div>
  </div>
  ${statsHTML ? `<div class="tool-stats">${statsHTML}</div>` : ''}
  <div class="tool-content">
    <div class="tool-main">
      ${presentationHTML}
      ${screenshotHTML}
      ${featuresHTML ? `
      <section class="tool-section">
        <h2>${{fr:'Fonctionnalités clés',en:'Key features',es:'Funcionalidades clave'}[langue]||'Fonctionnalités'}</h2>
        <div class="feature-grid">${featuresHTML}</div>
      </section>` : ''}
      ${tutorielsHTML ? `
      <section class="tool-section">
        <h2>${{fr:'Tutoriels vidéo',en:'Video tutorials',es:'Tutoriales en vídeo'}[langue]||'Tutoriels'}</h2>
        <div class="tutorials-list">${tutorielsHTML}</div>
      </section>` : ''}
      ${faqHTML ? `
      <section class="tool-section">
        <h2>${{fr:'Questions fréquentes',en:'FAQ',es:'Preguntas frecuentes'}[langue]||'FAQ'}</h2>
        <div class="faq-list">${faqHTML}</div>
      </section>` : ''}
      <div id="reviews-section"></div>
    </div>
    <aside class="tool-sidebar">
      ${infosSidebar(tool, langue)}
      ${articlesSidebar}
      ${altsHTML(tool.alternatives, name, langue)}
      <div class="sidebar-card sidebar-card-cta">
        <div class="sc-title">${{fr:`Essayer ${name}`,en:`Try ${name}`,es:`Probar ${name}`}[langue]||`Essayer ${name}`}</div>
        <p>${tool.ideal_pour||''}</p>
        <a href="${url}" target="_blank" rel="noopener" class="btn-try-full">${{fr:`Aller sur ${name}`,en:`Go to ${name}`,es:`Ir a ${name}`}[langue]||`Aller sur ${name}`} →</a>
      </div>
    </aside>
  </div>
</div></main>
${footerHTML()}
${faqHTML ? faqJS() : ''}
${tutorielsHTML ? tutorialJS() : ''}
${sharedJS()}
${articlesScript}
<script type="module" src="${R}js/reviews-widget.js"></script>
</body>
</html>`;
}

// ════════════════════════════════════════════════════════════
// GÉNÉRATEUR ARTICLES (blog)
// Source : Firestore collection "articles"
// Sortie : articles/{langue}/{slug}/index.html
// ════════════════════════════════════════════════════════════
function articleNavHTML(langue) {
  // Nav identique à navHTML() mais depuis un fichier à 3 niveaux de profondeur
  // (articles/{langue}/{slug}/index.html) — on réutilise navHTML() telle quelle
  // car R est un chemin absolu ('/'), donc la profondeur du fichier n'a aucune
  // incidence sur les liens : c'est tout l'intérêt des chemins absolus.
  return navHTML(langue);
}

// ═══════════════════════════════════════════════════════
//  ARTICLES CRÉATEURS — rendu sécurisé depuis contenu[] structuré
//  (jamais de HTML fourni par le créateur, voir schéma articles_createurs)
// ═══════════════════════════════════════════════════════

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Transforme **gras** et *italique* en <strong>/<em> — appliqué UNIQUEMENT
// sur du texte déjà passé par escHtml(). Les astérisques ne font pas partie
// des caractères échappés, donc cette regex ne peut produire que ces deux
// balises fermées à partir de texte déjà neutralisé — aucune injection possible.
function appliquerMarkdownLite(texteEchappe) {
  return texteEchappe
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

function renderContenuBloc(bloc) {
  if (!bloc || typeof bloc !== 'object') return '';
  switch (bloc.type) {
    case 'paragraph':
      return `<p>${appliquerMarkdownLite(escHtml(bloc.text))}</p>`;
    case 'heading': {
      const lvl = bloc.level === 3 ? 3 : 2;
      return `<h${lvl}>${escHtml(bloc.text)}</h${lvl}>`;
    }
    case 'list':
      return `<ul>${(Array.isArray(bloc.items) ? bloc.items : []).map(i => `<li>${escHtml(i)}</li>`).join('')}</ul>`;
    case 'quote':
      return `<blockquote>${appliquerMarkdownLite(escHtml(bloc.text))}</blockquote>`;
    case 'callout':
      return `<div class="pv-callout">💡 ${appliquerMarkdownLite(escHtml(bloc.text))}</div>`;
    case 'divider':
      return `<hr>`;
    case 'link': {
      // URL validée minimalement : doit démarrer par http(s) — sinon le lien
      // est rendu en texte brut plutôt que cliquable (évite javascript:, data:, etc.)
      const url = String(bloc.url || '');
      const isHttp = /^https?:\/\//i.test(url);
      if (!isHttp) return `<span>${escHtml(bloc.text)}</span>`;
      return `<a href="${escHtml(url)}" rel="nofollow noopener" target="_blank">${escHtml(bloc.text)}</a>`;
    }
    case 'cta': {
      const url = String(bloc.url || '');
      const isHttp = /^https?:\/\//i.test(url);
      if (!isHttp) return '';
      return `<a class="pv-cta" href="${escHtml(url)}" rel="nofollow noopener" target="_blank">${escHtml(bloc.text)}</a>`;
    }
    case 'image': {
      const url = String(bloc.url || '');
      const isHttp = /^https?:\/\//i.test(url);
      if (!isHttp) return '';
      const img = `<img src="${escHtml(url)}" alt="${escHtml(bloc.alt || '')}" loading="lazy" />`;
      return bloc.caption
        ? `<figure>${img}<figcaption>${escHtml(bloc.caption)}</figcaption></figure>`
        : img;
    }
    default:
      // Type inconnu (bug, contournement, champ corrompu) → jamais rendu.
      // C'est la vraie garantie de sécurité : même si une donnée invalide
      // franchit les Firestore security rules, elle ne produit aucune sortie HTML.
      return '';
  }
}

function renderContenuComplet(contenu) {
  if (!Array.isArray(contenu)) return '';
  return contenu.map(renderContenuBloc).join('\n');
}

// Extrait un texte brut (pour meta description / excerpt) à partir du
// premier bloc paragraph — jamais de HTML dans les balises <meta>.
function extraireExcerpt(contenu, maxLen = 155) {
  const premierParagraphe = (contenu || []).find(b => b.type === 'paragraph');
  const texte = premierParagraphe ? String(premierParagraphe.text || '') : '';
  return texte.length > maxLen ? texte.slice(0, maxLen - 1) + '…' : texte;
}

// Récupère l'image og:image d'un site officiel, pour servir de bannière
// automatique quand le créateur n'a pas fourni d'URL manuelle. Échoue
// silencieusement (retourne '') dans tous les cas problématiques — un site
// injoignable, lent, sans balise og:image, ou bloquant les robots ne doit
// jamais faire planter la génération : juste un repli sur l'emoji ✍️.
async function recupererOgImage(urlOutil) {
  if (!urlOutil || !/^https?:\/\//i.test(urlOutil)) return '';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(urlOutil, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AlbexiaBot/1.0)' }
    });
    clearTimeout(timeout);
    if (!res.ok) return '';
    const html = await res.text();
    const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
               || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    const imageUrl = match ? match[1] : '';
    return /^https?:\/\//i.test(imageUrl) ? imageUrl : '';
  } catch {
    return ''; // timeout, réseau, parsing — peu importe la cause, on continue sans bannière
  }
}

async function generateArticleCreateur(article, outilsMap) {
  const { id, titre, outil_slug, contenu, created_at } = article;
  if (!titre || !outil_slug) return null;

  // Slug propre + suffixe court de l'id doc pour garantir l'unicité
  // sans jamais entrer en collision avec un article admin classique.
  const slugBase = slugify(titre);
  const slug = `${slugBase}-${String(id).slice(0, 6)}`;
  const langue = 'fr'; // les articles créateurs sont FR uniquement pour l'instant
  const canonicalUrl = `${SITE_ORIGIN}/articles/${langue}/${slug}/index.html`;

  const dateAffichage = created_at?.toDate
    ? created_at.toDate().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  const metaDesc = extraireExcerpt(contenu);
  const bodyHTML = renderContenuComplet(contenu);
  const titleTag = `${escHtml(titre)} | Albexia`;
  const nbMots = article.nb_mots || (contenu || []).reduce((acc, b) => acc + String(b.text || '').split(/\s+/).filter(Boolean).length, 0);
  const tempsLecture = Math.max(1, Math.round(nbMots / 200));

  const outil = outilsMap?.get(outil_slug);
  const outilLienHTML = outil
    ? `<p class="article-createur-badge">✍️ Article rédigé par l'équipe de <a href="${R}tools/${outil.dossierPlan}/${langue}/${outil_slug}/index.html">${escHtml(outil.nom)}</a></p>`
    : '';

  // Bannière : priorité à l'URL fournie manuellement par le créateur ;
  // sinon tentative de récupération automatique depuis le site officiel
  // de l'outil (og:image) — échoue silencieusement si indisponible.
  let banniere_url = article.banniere_url && /^https?:\/\//i.test(article.banniere_url)
    ? article.banniere_url
    : '';
  if (!banniere_url && outil?.url_outil) {
    banniere_url = await recupererOgImage(outil.url_outil);
  }

  const bannerTag = banniere_url && /^https?:\/\//i.test(banniere_url)
    ? `<meta property="og:image" content="${escHtml(banniere_url)}" />`
    : '';

  return `<!DOCTYPE html>
<html lang="${langue}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titleTag}</title>
  <meta name="description" content="${escHtml(metaDesc)}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${canonicalUrl}" />
  <meta property="og:title" content="${escHtml(titre)} | Albexia" />
  <meta property="og:description" content="${escHtml(metaDesc)}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${canonicalUrl}" />
${bannerTag}
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${R}css/style.css" />
  <link rel="stylesheet" href="${R}css/article.css" />
  <style>
    /* Styles des nouveaux blocs créateurs — inline ici pour ne pas dépendre
       d'un ajout manuel dans article.css (peut être déplacé plus tard). */
    .article-body p:first-of-type { font-size: 1.1em; }
    .article-body blockquote { border-left: 3px solid #6c63ff; padding: 8px 20px; margin: 20px 0; font-style: italic; color: #c8c8d0; }
    .pv-callout { background: rgba(255,157,108,.08); border: 1px solid rgba(255,157,108,.25); border-left: 3px solid #ff9d6c; border-radius: 8px; padding: 16px 18px; margin: 20px 0; }
    .pv-cta { display: block; text-align: center; background: #00d4aa; color: #0a0a12; font-weight: 700; text-decoration: none; padding: 16px 24px; border-radius: 10px; margin: 24px 0; text-transform: uppercase; font-size: .85rem; letter-spacing: .03em; }
    .article-body hr { border: none; border-top: 1px solid rgba(255,255,255,.1); margin: 32px 0; }
    .article-body figure { margin: 20px 0; }
    .article-body figcaption { font-size: .8rem; color: #8a8a9a; text-align: center; margin-top: 8px; }
  </style>
</head>
<body>

${articleNavHTML(langue)}

<main class="article-main">
<div class="article-container">

  <header class="article-header">
    <div class="article-meta-top">
      <span class="article-cat fond">Actualité créateur</span>
      <span class="dot"></span>
      <span class="article-date">${dateAffichage}</span>
      <span class="dot"></span>
      <span class="article-readtime">${tempsLecture} min</span>
    </div>
    <h1 class="article-title">${escHtml(titre)}</h1>
    ${outilLienHTML}
  </header>

  <div class="article-body">
${bodyHTML}
  </div>

</div>
</main>

${footerHTML()}
${sharedJS()}
</body>
</html>`;
}

function generateArticle(article, allArticles) {
  const {
    title, category='', emoji='📝', date='', readTime='', excerpt='',
    author='Équipe Albexia', tags=[], slug, langue='fr',
    traductions={}, corps_html='', meta_description='', og_image='', cta=null
  } = article;

  if (!slug) return null; // sécurité : jamais générer sans slug (URL invalide)

  const canonicalUrl = `${SITE_ORIGIN}/articles/${langue}/${slug}/index.html`;

  // Construit dynamiquement le bloc hreflang : uniquement pour les langues qui
  // existent RÉELLEMENT (article FR lui-même + traductions renseignées dans
  // Firestore). On ne référence jamais une langue absente pour éviter un
  // hreflang pointant vers une page 404 — c'est ce qui pénalise le plus en SEO.
  const langueUrls = { [langue]: canonicalUrl };
  for (const [langCode, relId] of Object.entries(traductions || {})) {
    const rel = allArticles.find(a => String(a.id) === String(relId));
    if (rel && rel.slug) {
      langueUrls[langCode] = `${SITE_ORIGIN}/articles/${langCode}/${rel.slug}/index.html`;
    }
  }
  // Le x-default pointe toujours vers la version FR si elle existe, sinon
  // vers la langue courante (cas d'un article publié directement en EN/ES
  // sans version FR — rare mais possible).
  const xDefaultUrl = langueUrls.fr || canonicalUrl;

  const hreflangTags = Object.entries(langueUrls)
    .map(([langCode, u]) => `  <link rel="alternate" hreflang="${langCode}" href="${u}" />`)
    .join('\n') + `\n  <link rel="alternate" hreflang="x-default" href="${xDefaultUrl}" />`;

  const ogLocales = { fr: 'fr_FR', en: 'en_US', es: 'es_ES' };
  const ogLocale = ogLocales[langue] || 'fr_FR';
  const ogLocaleAlternates = Object.keys(langueUrls)
    .filter(l => l !== langue)
    .map(l => `  <meta property="og:locale:alternate" content="${ogLocales[l] || l}" />`)
    .join('\n');

  const metaDesc = meta_description || excerpt.slice(0, 155);
  const ogImageTag = og_image ? `  <meta property="og:image" content="${og_image}" />\n  <meta name="twitter:image" content="${og_image}" />\n` : '';
  const ogImageJsonLd = og_image ? `,\n    "image": "${og_image}"` : '';

  const workTranslations = Object.entries(langueUrls)
    .filter(([l]) => l !== langue)
    .map(([l, u]) => `      { "@type": "Article", "inLanguage": "${l}", "url": "${u}" }`)
    .join(',\n');

  const titleTag = `${title} | Albexia`;

  // Navigation article précédent/suivant : dans la même langue uniquement,
  // en se basant sur l'ordre des articles de cette langue triés par date brute
  // Firestore (le champ "date" est une chaîne d'affichage, donc on trie sur
  // l'ID à défaut d'un champ date ISO dédié — voir note dans le README du repo).
  const sameLang = allArticles.filter(a => (a.langue || 'fr') === langue && a.slug).sort((a,b) => Number(String(a.id).split('-')[0]) - Number(String(b.id).split('-')[0]));
  const idx = sameLang.findIndex(a => String(a.id) === String(article.id));
  const prevArticle = idx > 0 ? sameLang[idx - 1] : null;
  const nextArticle = (idx >= 0 && idx < sameLang.length - 1) ? sameLang[idx + 1] : null;

  const navBottomHTML = (prevArticle || nextArticle) ? `
  <nav class="article-nav-bottom" aria-label="Navigation articles">
    ${prevArticle ? `<a href="${R}articles/${langue}/${prevArticle.slug}/index.html" class="article-nav-btn">← ${prevArticle.title}</a>` : ''}
    ${nextArticle ? `<a href="${R}articles/${langue}/${nextArticle.slug}/index.html" class="article-nav-btn">${nextArticle.title} →</a>` : ''}
  </nav>` : '';

  const tagsHTML = (tags || []).map(t => `<a href="#" class="article-tag">#${t}</a>`).join('\n      ');

  // Bloc CTA de fin d'article : entièrement optionnel, personnalisable par
  // article depuis l'admin. Absent si "cta" n'est pas renseigné en Firestore
  // (pas de bloc générique par défaut, pour éviter un CTA hors-sujet).
  const ctaHTML = (cta && cta.texte && cta.lien_principal_url && cta.lien_principal_label) ? `
    <div class="analyse-cta">
      <p>${cta.texte}</p>
      <div class="analyse-cta-links">
        <a href="${cta.lien_principal_url}" class="btn-cta-primary">${cta.lien_principal_label}</a>
        ${cta.lien_secondaire_url && cta.lien_secondaire_label ? `<a href="${cta.lien_secondaire_url}" class="btn-cta-secondary">${cta.lien_secondaire_label}</a>` : ''}
      </div>
    </div>` : '';

  return `<!DOCTYPE html>
<html lang="${langue}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titleTag}</title>
  <meta name="description" content="${metaDesc}" />
  <meta name="robots" content="index, follow" />

  <link rel="canonical" href="${canonicalUrl}" />

${hreflangTags}

  <meta property="og:title"       content="${title} | Albexia" />
  <meta property="og:description" content="${metaDesc}" />
  <meta property="og:type"        content="article" />
  <meta property="og:url"         content="${canonicalUrl}" />
${ogImageTag}  <meta property="og:locale"           content="${ogLocale}" />
${ogLocaleAlternates}
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="${title} | Albexia" />
  <meta name="twitter:description" content="${metaDesc}" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "${title}",
    "description": "${metaDesc}",
    "inLanguage": "${langue}",
    "datePublished": "${date}",
    "dateModified": "${date}",
    "author": { "@type": "Organization", "name": "Albexia" },
    "publisher": { "@type": "Organization", "name": "Albexia", "url": "${SITE_ORIGIN}" }${ogImageJsonLd},
    "mainEntityOfPage": { "@type": "WebPage", "@id": "${canonicalUrl}" }${workTranslations ? `,
    "workTranslation": [
${workTranslations}
    ]` : ''}
  }
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${R}css/style.css" />
  <link rel="stylesheet" href="${R}css/article.css" />
</head>
<body>

${articleNavHTML(langue)}

<main class="article-main">
<div class="article-container">

  <header class="article-header">
    <div class="article-meta-top">
      <span class="article-cat fond">${category}</span>
      <span class="dot"></span>
      <span class="article-date">${date}</span>
      <span class="dot"></span>
      <span class="article-read-time">⏱ ${readTime}</span>
    </div>
    <h1 class="article-title">${title}</h1>
    <p class="article-intro">${excerpt}</p>
  </header>

  <div class="article-body">
${corps_html}
    <div class="article-tags">
      ${tagsHTML}
    </div>
${ctaHTML}
  </div>
${navBottomHTML}

</div>
</main>

${footerHTML()}
${sharedJS()}
</body>
</html>`;
}

// ════════════════════════════════════════════════════════════
// GÉNÉRATEUR COMPARATEUR (X vs Y)
// Source : Firestore collection "comparaisons"
// Sortie : comparateur/{slug}/index.html
//
// Chaque doc comparaison référence deux outils par slug
// (outil_a_slug / outil_b_slug). Au build, on va chercher
// note/prix/favicon/lien dans la vraie collection "outils"
// (déjà en mémoire — voir main()) pour rester synchronisé.
// Si l'outil référencé n'existe pas (pas encore indexé, ou
// volontairement hors-catalogue), on retombe sur les champs
// de fallback saisis à la main dans le doc comparaison
// (nom_fallback, emoji_fallback, lien_fallback, etc.) — la
// comparaison ne casse jamais silencieusement.
// ════════════════════════════════════════════════════════════

// Résout un "côté" (a ou b) de la comparaison : cherche l'outil
// référencé dans la collection outils (même langue si possible,
// sinon n'importe laquelle), sinon utilise le fallback manuel.
function resoudreOutilComparaison(side, comp, tools, langue) {
  const slugRef   = comp[`outil_${side}_slug`] || '';
  const nomFallback = comp[`outil_${side}_nom_fallback`] || comp[`outil_${side}_nom`] || '';
  const winnerSlug = comp.gagnant_slug || '';

  let found = null;
  if (slugRef) {
    found = tools.find(t => slugify(t.name) === slugRef && (t.langue || 'fr') === langue)
         || tools.find(t => slugify(t.name) === slugRef);
  }

  if (found) {
    const priceLabel = { gratuit:'Freemium', freemium:'Freemium', payant:'Payant', free:'Gratuit', paid:'Payant' }[found.price] || 'Freemium';
    return {
      nom: found.name,
      slug: slugify(found.name),
      emoji: found.emoji || '🤖',
      favicon: `https://www.google.com/s2/favicons?sz=64&domain=${(found.url||'').replace(/^https?:\/\//,'').split('/')[0]}`,
      categorie: found.category || '',
      note: typeof found.note === 'number' ? found.note : (found.note ? Number(found.note) : 4.5),
      lien: found.url || comp[`outil_${side}_lien_fallback`] || '#',
      priceLabel,
      winner: slugRef === winnerSlug,
      _resolved: true,
    };
  }

  // Fallback manuel (outil pas encore indexé dans "outils")
  // Le favicon n'est jamais saisi à la main dans l'admin (pas de champ pour
  // ça) — on le dérive automatiquement du lien de secours, comme pour les
  // outils résolus, plutôt que de dépendre d'un champ qui n'existe pas.
  const lienFallback = comp[`outil_${side}_lien_fallback`] || '';
  const faviconFallback = lienFallback
    ? `https://www.google.com/s2/favicons?sz=64&domain=${lienFallback.replace(/^https?:\/\//,'').split('/')[0]}`
    : '';
  return {
    nom: nomFallback || (side === 'a' ? 'Outil A' : 'Outil B'),
    slug: slugRef || slugify(nomFallback),
    emoji: comp[`outil_${side}_emoji_fallback`] || '🤖',
    favicon: faviconFallback,
    categorie: comp[`outil_${side}_categorie_fallback`] || '',
    note: comp[`outil_${side}_note_fallback`] ? Number(comp[`outil_${side}_note_fallback`]) : 4.5,
    lien: lienFallback || '#',
    priceLabel: comp[`outil_${side}_prix_fallback`] || '',
    winner: slugRef && slugRef === winnerSlug,
    _resolved: false,
  };
}

function noteClasseComp(note) {
  if (note >= 4.7) return 'note-top';
  if (note >= 4.4) return 'note-bon';
  return 'note-ok';
}

function logoHTMLComp(outil, classeImg, classeFallback) {
  if (outil.favicon) {
    return `<img src="${outil.favicon}" alt="${outil.nom}" class="${classeImg}"
              onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <span class="${classeFallback}" style="display:none">${outil.emoji}</span>`;
  }
  return `<span class="${classeFallback}">${outil.emoji}</span>`;
}

function logoInlineComp(outil) {
  return outil.favicon
    ? `<img src="${outil.favicon}" alt="${outil.nom}" onerror="this.style.display='none'">`
    : outil.emoji;
}

// ── Page listing paginée : comparateur/index.html, comparateur/page/2/index.html, ... ──
const COMPARATEUR_PAR_PAGE = 12;

// Réutilise les classes .paire-link/.paire-logos/.paire-vs déjà stylées dans
// css/style.css (existantes sur le site depuis l'ancien comparateur.html) —
// pas de CSS à dupliquer pour cette partie. Repli emoji si aucun favicon
// n'est disponible (ex: comparaison créée via secours sans lien renseigné).
function comparateurItemHTML(comp, tools) {
  const langue = comp.langue || 'fr';
  const a = resoudreOutilComparaison('a', comp, tools, langue);
  const b = resoudreOutilComparaison('b', comp, tools, langue);
  const logo = (outil) => outil.favicon
    ? `<img src="${outil.favicon}" alt="${outil.nom}" onerror="this.style.display='none';this.nextElementSibling.style.display='inline'"><span style="display:none">${outil.emoji}</span>`
    : `<span>${outil.emoji}</span>`;
  return `<a href="${R}comparateur/${comp.slug}/index.html" class="paire-link">
    <div class="paire-logos">
      ${logo(a)}
      <span class="paire-vs">VS</span>
      ${logo(b)}
    </div>
    <span style="flex:1;font-size:12px">${a.nom} vs ${b.nom}</span>
    <span style="color:var(--text-dim);font-size:11px">→</span>
  </a>`;
}

// Construit le tableau TOOLS_DATA injecté au build pour le picker interactif,
// depuis la collection "outils" déjà en mémoire (zéro lecture Firestore côté
// visiteur). Seuls les outils FR sont inclus — c'est un annuaire francophone,
// et TOOLS_DATA original ne mélangeait pas les variantes de langue.
//
// triEtat : distingue "vrai" / "faux" / "jamais renseigné" plutôt que de tout
// forcer en booléen strict. Un champ jamais coché dans l'admin (undefined)
// affichait sinon une croix rouge trompeuse, identique à un vrai "non" —
// alors que "—" (inconnu) est le signal honnête tant que la donnée n'a pas
// été saisie. afficherComparaison() sait déjà gérer ce 3e état (val===true /
// val===false / sinon "—") ; seul le cast en amont ici les confondait.
function triEtat(val) {
  if (val === true) return true;
  if (val === false) return false;
  return null; // jamais renseigné
}

function buildToolsDataJSON(tools) {
  const fr = deduplicateParNom(tools.filter(t => t.name));
  const data = fr.map(t => ({
    id: t.id,
    name: t.name,
    emoji: t.emoji || '🤖',
    favicon: `https://www.google.com/s2/favicons?sz=64&domain=${(t.url||'').replace(/^https?:\/\//,'').split('/')[0]}`,
    category: t.category || '',
    price: t.price || '',
    essai_gratuit: triEtat(t.essai_gratuit),
    duree_essai: t.duree_essai || null,
    langue_fr: triEtat(t.interface_fr),
    api: triEtat(t.api),
    mobile: triEtat(t.mobile),
    ideal_pour: t.ideal_pour || '',
    note: typeof t.note === 'number' ? t.note : (typeof t.rating === 'number' ? t.rating : null),
    lien_affilie: t.url || '#',
  }));
  return JSON.stringify(data);
}

function paginationHTML(currentPage, totalPages) {
  if (totalPages <= 1) return '';
  const pageUrl = (n) => n === 1 ? `${R}comparateur/index.html` : `${R}comparateur/page/${n}/index.html`;
  let links = '';

  links += currentPage > 1
    ? `<a href="${pageUrl(currentPage-1)}" class="cpl-page-link">← Précédent</a>`
    : `<span class="cpl-page-link disabled">← Précédent</span>`;

  for (let n = 1; n <= totalPages; n++) {
    links += `<a href="${pageUrl(n)}" class="cpl-page-link${n===currentPage?' active':''}">${n}</a>`;
  }

  links += currentPage < totalPages
    ? `<a href="${pageUrl(currentPage+1)}" class="cpl-page-link">Suivant →</a>`
    : `<span class="cpl-page-link disabled">Suivant →</span>`;

  return `<div class="cpl-pagination">${links}</div>`;
}

// comparaisonsTriees : déjà triées (plus récentes en premier) par l'appelant
function generateComparateurIndexPage(comparaisonsTriees, tools, pageNum, totalPages) {
  const langue = 'fr';
  const start = (pageNum - 1) * COMPARATEUR_PAR_PAGE;
  const pageItems = comparaisonsTriees.slice(start, start + COMPARATEUR_PAR_PAGE);

  const canonicalUrl = pageNum === 1
    ? `${SITE_ORIGIN}/comparateur/index.html`
    : `${SITE_ORIGIN}/comparateur/page/${pageNum}/index.html`;

  const titleTag = pageNum === 1
    ? `Comparateur d'outils IA — Comparaisons détaillées | Albexia`
    : `Comparateur d'outils IA — Page ${pageNum} | Albexia`;
  const metaDesc = `Comparez les meilleurs outils IA côte à côte : fonctionnalités, prix, avis. ${comparaisonsTriees.length} comparaisons détaillées sur Albexia.`;

  const listHTML = pageItems.length
    ? pageItems.map(c => comparateurItemHTML(c, tools)).join('\n')
    : `<div class="cpl-empty">Aucune comparaison publiée pour le moment.</div>`;

  // La pagination 2+ est en noindex : évite le contenu quasi-dupliqué en SERP
  // tout en gardant ces pages crawlables (follow) pour que Google découvre
  // les comparaisons individuelles au fil des pages suivantes.
  const robotsTag = pageNum === 1 ? 'index, follow' : 'noindex, follow';
  const prevUrl = pageNum === 2 ? `${SITE_ORIGIN}/comparateur/index.html` : `${SITE_ORIGIN}/comparateur/page/${pageNum-1}/index.html`;
  const nextUrl = `${SITE_ORIGIN}/comparateur/page/${pageNum+1}/index.html`;

  return `<!DOCTYPE html>
<html lang="${langue}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titleTag}</title>
  <meta name="description" content="${metaDesc}" />
  <meta name="robots" content="${robotsTag}" />

  <link rel="canonical" href="${canonicalUrl}" />
  ${pageNum > 1 ? `<link rel="prev" href="${prevUrl}" />` : ''}
  ${pageNum < totalPages ? `<link rel="next" href="${nextUrl}" />` : ''}

  <meta property="og:title"       content="${titleTag}" />
  <meta property="og:description" content="${metaDesc}" />
  <meta property="og:type"        content="website" />
  <meta property="og:url"         content="${canonicalUrl}" />

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${R}css/style.css" />
  <link rel="stylesheet" href="${R}css/comparer.css" />
</head>
<body>

${navHTML(langue)}

<section class="comp-hero">
  <div class="comp-badge">⚖️ Comparez les outils IA</div>
  <h1>Trouvez <span class="grad">le meilleur outil</span><br>pour vous</h1>
  <p>Sélectionnez 2 ou 3 outils et comparez-les côte à côte en quelques secondes.</p>
</section>

<div class="comp-selection">
  <div class="comp-search">
    <span class="comp-search-icon">🔍</span>
    <input type="text" id="comp-search-input" placeholder="Rechercher un outil… (ex: Jasper, Canva, Runway)">
  </div>
  <div class="comp-cat-filters" id="comp-cats"></div>
  <div class="tools-picker" id="tools-picker"></div>
</div>

<div class="selected-bar">
  <div class="selected-bar-inner">
    <div class="selected-chips" id="selected-chips">
      <span class="selected-hint" id="selected-hint">Sélectionnez 2 ou 3 outils ci-dessus</span>
    </div>
    <button class="comp-btn" id="comp-btn" disabled onclick="afficherComparaison()">Comparer →</button>
  </div>
</div>

<div class="comp-result" id="comp-result">
  <div class="comp-result-title" id="comp-result-title"></div>
  <div class="comp-table-wrap">
    <table class="comp-table" id="comp-table"></table>
  </div>
  <div class="comp-cta-row" id="comp-cta-row"></div>
  <span class="comp-reset" onclick="resetComparaison()">← Nouvelle comparaison</span>
</div>

<div class="paires-section">
  <div class="paires-title">${pageNum === 1 ? 'Comparaisons populaires' : `Comparaisons populaires — Page ${pageNum}`} (${comparaisonsTriees.length})</div>
  <div class="paires-grid" id="paires-grid">
${listHTML}
  </div>
  ${paginationHTML(pageNum, totalPages)}
</div>

${footerHTML()}
<script>
const TOOLS_DATA = ${buildToolsDataJSON(tools)};

let selected = [], filteredTools = [...TOOLS_DATA], activeCategory = 'Tous';

function normaliser(s){ return (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim(); }

function initCats(){
  const cats = ['Tous', ...new Set(TOOLS_DATA.map(t=>t.category).filter(Boolean))];
  const el = document.getElementById('comp-cats');
  el.innerHTML = cats.map(c=>\`<button class="comp-cat-btn\${c==='Tous'?' active':''}" data-cat="\${c}">\${c}</button>\`).join('');
  el.querySelectorAll('.comp-cat-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      activeCategory=btn.dataset.cat;
      el.querySelectorAll('.comp-cat-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      applyFilters();
    });
  });
}

function applyFilters(){
  const q=normaliser(document.getElementById('comp-search-input').value);
  filteredTools=TOOLS_DATA.filter(t=>{
    const matchCat=activeCategory==='Tous'||t.category===activeCategory;
    const matchQ=!q||normaliser(t.name).includes(q)||normaliser(t.category).includes(q);
    return matchCat&&matchQ;
  });
  renderPicker();
}

function renderPicker(){
  document.getElementById('tools-picker').innerHTML=filteredTools.map(t=>{
    const isSel=selected.includes(t.id), isDisabled=!isSel&&selected.length>=3;
    const logo = t.favicon
      ? \`<img src="\${t.favicon}" alt="\${t.name}" class="picker-logo" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="picker-logo-fallback" style="display:none">\${t.emoji}</span>\`
      : \`<span class="picker-logo-fallback">\${t.emoji}</span>\`;
    return \`<div class="picker-card\${isSel?' selected':''}\${isDisabled?' disabled':''}" onclick="toggleTool(\${t.id})">
      \${logo}<span class="picker-name">\${t.name}</span><span class="picker-check">✓</span>
    </div>\`;
  }).join('');
}

function toggleTool(id){
  const idx=selected.indexOf(id);
  if(idx>-1){ selected.splice(idx,1); } else if(selected.length<3){ selected.push(id); }
  renderPicker(); renderChips();
}

function renderChips(){
  const hint=document.getElementById('selected-hint');
  const chips=document.getElementById('selected-chips');
  const btn=document.getElementById('comp-btn');
  chips.querySelectorAll('.selected-chip').forEach(e=>e.remove());
  if(selected.length===0){ hint.style.display='inline'; }
  else {
    hint.style.display='none';
    selected.forEach(id=>{
      const t=TOOLS_DATA.find(x=>x.id===id); if(!t) return;
      const chip=document.createElement('div'); chip.className='selected-chip';
      const logoEl = t.favicon ? \`<img src="\${t.favicon}" alt="" style="width:14px;height:14px;border-radius:3px;object-fit:contain" onerror="this.style.display='none'">\` : t.emoji;
      chip.innerHTML=\`\${logoEl} \${t.name} <span class="chip-remove" onclick="toggleTool(\${id})">×</span>\`;
      chips.appendChild(chip);
    });
  }
  btn.disabled=selected.length<2;
}

function afficherComparaison(){
  const outils=selected.map(id=>TOOLS_DATA.find(t=>t.id===id)).filter(Boolean);
  if(outils.length<2) return;
  const result=document.getElementById('comp-result');
  document.getElementById('comp-result-title').textContent=outils.map(t=>t.name).join(' vs ');
  const criteres=[
    ['Prix de base',       t=>t.price||'—',                    false],
    ['Essai gratuit',      t=>t.essai_gratuit,                 true],
    ["Durée d'essai",      t=>t.duree_essai||'—',              false],
    ['Support français',   t=>t.langue_fr,                     true],
    ['API disponible',     t=>t.api,                           true],
    ['App mobile',         t=>t.mobile,                        true],
    ['Idéal pour',         t=>t.ideal_pour||'—',               false],
    ['Note Albexia',       t=>t.note?t.note+'/5':'—',          false],
  ];
  let thead='<thead><tr><th>Critère</th>';
  outils.forEach(t=>{
    const logoEl = t.favicon
      ? \`<img src="\${t.favicon}" alt="\${t.name}" class="th-logo" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="th-logo-fallback" style="display:none">\${t.emoji}</span>\`
      : \`<span class="th-logo-fallback">\${t.emoji}</span>\`;
    thead+=\`<th class="tool-col">\${logoEl}\${t.name}</th>\`;
  });
  thead+='</tr></thead>';
  let tbody='<tbody>';
  criteres.forEach(([label,fn,isBool])=>{
    tbody+=\`<tr><td class="crit-col">\${label}</td>\`;
    outils.forEach(t=>{
      const val=fn(t);
      if(isBool){ tbody+=val===true?'<td><span class="yes">✓</span></td>':val===false?'<td><span class="no">✗</span></td>':'<td><span style="color:var(--text-dim)">—</span></td>'; }
      else { tbody+=\`<td>\${val}</td>\`; }
    });
    tbody+='</tr>';
  });
  tbody+='</tbody>';
  document.getElementById('comp-table').innerHTML=thead+tbody;
  document.getElementById('comp-cta-row').innerHTML=outils.map(t=>{
    const logoEl = t.favicon ? \`<img src="\${t.favicon}" alt="">\` : '';
    return \`<a href="\${t.lien_affilie}" target="_blank" rel="noopener" class="comp-cta-btn">\${logoEl} Essayer \${t.name} →</a>\`;
  }).join('');
  result.classList.add('show');
  result.scrollIntoView({behavior:'smooth',block:'start'});
}

function resetComparaison(){
  selected=[]; renderPicker(); renderChips();
  document.getElementById('comp-result').classList.remove('show');
  window.scrollTo({top:0,behavior:'smooth'});
}

document.getElementById('comp-search-input').addEventListener('input',applyFilters);
initCats(); applyFilters();
</script>
${sharedJS()}
</body>
</html>`;
}

function generateComparaison(comp, tools, allComparaisons) {
  const langue = comp.langue || 'fr';
  const slug   = comp.slug;
  if (!slug) return null;

  const a = resoudreOutilComparaison('a', comp, tools, langue);
  const b = resoudreOutilComparaison('b', comp, tools, langue);

  const canonicalUrl = `${SITE_ORIGIN}/comparateur/${slug}/index.html`;
  const titleTag = comp.meta_title || `${a.nom} vs ${b.nom} — Comparaison complète | Albexia`;
  const metaDesc = comp.meta_description || comp.resume?.slice(0, 155) || `${a.nom} ou ${b.nom} ? Comparaison détaillée. Notre verdict Albexia.`;

  // Hreflang : uniquement les langues où une traduction existe réellement
  const langueUrls = { [langue]: canonicalUrl };
  for (const [langCode, relSlug] of Object.entries(comp.traductions || {})) {
    const rel = allComparaisons.find(c => c.slug === relSlug || String(c.id) === String(relSlug));
    if (rel && rel.slug) {
      langueUrls[langCode] = `${SITE_ORIGIN}/comparateur/${rel.slug}/index.html`;
    }
  }
  const xDefaultUrl = langueUrls.fr || canonicalUrl;
  const hreflangTags = Object.entries(langueUrls)
    .map(([langCode, u]) => `  <link rel="alternate" hreflang="${langCode}" href="${u}" />`)
    .join('\n') + `\n  <link rel="alternate" hreflang="x-default" href="${xDefaultUrl}" />`;

  const ogLocales = { fr: 'fr_FR', en: 'en_US', es: 'es_ES' };
  const ogLocale = ogLocales[langue] || 'fr_FR';
  const ogLocaleAlternates = Object.keys(langueUrls)
    .filter(l => l !== langue)
    .map(l => `  <meta property="og:locale:alternate" content="${ogLocales[l] || l}" />`)
    .join('\n');

  // ── Hero ──
  const heroHTML = `<section class="cp-hero">
  <div class="cp-vs-badge">${{fr:'Comparaison',en:'Comparison',es:'Comparación'}[langue]||'Comparaison'}</div>
  <h1>${a.nom} <span class="vs-sep">vs</span> ${b.nom}</h1>
  <p class="cp-resume">${comp.resume || ''}</p>
</section>`;


  // ── Header outils ──
  const toolsHeaderHTML = `<div class="cp-tools-header">
  <div class="cp-tool-card${a.winner ? ' winner' : ''}">
    ${logoHTMLComp(a, 'cp-tool-logo', 'cp-tool-logo-fallback')}
    <div class="cp-tool-name">${a.nom}</div>
    <div class="cp-tool-cat">${a.categorie}</div>
    <span class="cp-tool-note ${noteClasseComp(a.note)}">${a.note} / 5</span>
  </div>
  <div class="cp-vs-divider">VS</div>
  <div class="cp-tool-card${b.winner ? ' winner' : ''}">
    ${logoHTMLComp(b, 'cp-tool-logo', 'cp-tool-logo-fallback')}
    <div class="cp-tool-name">${b.nom}</div>
    <div class="cp-tool-cat">${b.categorie}</div>
    <span class="cp-tool-note ${noteClasseComp(b.note)}">${b.note} / 5</span>
  </div>
</div>`;

  // ── Tableau critères ──
  const criteres = comp.criteres || [];
  let lignes = '';
  criteres.forEach(c => {
    const cellA = c.bool
      ? (c.a === true  ? '<span class="check-yes">✓</span>'
       : c.a === false ? '<span class="check-no">✗</span>'
       : '<span class="check-na">—</span>')
      : `<span style="color:var(--text);font-size:13px">${c.a}</span>`;
    const cellB = c.bool
      ? (c.b === true  ? '<span class="check-yes">✓</span>'
       : c.b === false ? '<span class="check-no">✗</span>'
       : '<span class="check-na">—</span>')
      : `<span style="color:var(--text);font-size:13px">${c.b}</span>`;
    lignes += `<tr>
      <td class="td-label">${c.label}</td>
      <td>${cellA}</td>
      <td>${cellB}</td>
    </tr>`;
  });
  const tableauHTML = `<table class="cp-table">
  <thead>
    <tr>
      <th>${{fr:'Critère',en:'Criteria',es:'Criterio'}[langue]||'Critère'}</th>
      <th class="th-tool">${logoInlineComp(a)} ${a.nom}</th>
      <th class="th-tool">${logoInlineComp(b)} ${b.nom}</th>
    </tr>
  </thead>
  <tbody>${lignes}</tbody>
</table>`;

  // ── Avantages / inconvénients ──
  const avA  = comp.avantages?.a || [];
  const avB  = comp.avantages?.b || [];
  const incA = comp.inconvenients?.a || [];
  const incB = comp.inconvenients?.b || [];
  const listeHTML = (items, estPros) =>
    `<ul class="cp-pros-list${estPros ? '' : ' cp-cons-list'}">${(items||[]).map(i => `<li>${i}</li>`).join('')}</ul>`;

  const avantagesHTML = `<div class="cp-pros-cons">
  <div class="cp-pros-card">
    <div class="cp-pros-card-title">${logoInlineComp(a)} ${a.nom} — Points forts</div>
    ${listeHTML(avA, true)}
  </div>
  <div class="cp-pros-card">
    <div class="cp-pros-card-title">${logoInlineComp(b)} ${b.nom} — Points forts</div>
    ${listeHTML(avB, true)}
  </div>
  <div class="cp-pros-card">
    <div class="cp-pros-card-title" style="color:var(--text-muted)">${a.nom} — Limites</div>
    ${listeHTML(incA, false)}
  </div>
  <div class="cp-pros-card">
    <div class="cp-pros-card-title" style="color:var(--text-muted)">${b.nom} — Limites</div>
    ${listeHTML(incB, false)}
  </div>
</div>`;

  // ── Cas d'usage ──
  const casUsageHTML = comp.cas_usage ? `<div class="cp-cas-grid">
  <div class="cp-cas-card card-a">
    <div class="cp-cas-label">Choisissez</div>
    <div class="cp-cas-title">${logoInlineComp(a)} ${a.nom}</div>
    <p class="cp-cas-text">${comp.cas_usage.choisir_a || ''}</p>
  </div>
  <div class="cp-cas-card card-b">
    <div class="cp-cas-label">Choisissez</div>
    <div class="cp-cas-title">${logoInlineComp(b)} ${b.nom}</div>
    <p class="cp-cas-text">${comp.cas_usage.choisir_b || ''}</p>
  </div>
</div>` : '';

  // ── Verdict ──
  const gagnantNom = comp.verdict?.gagnant || a.nom;
  const gagnantObj = gagnantNom === b.nom ? b : a;
  const verdictHTML = comp.verdict ? `<div class="cp-verdict-card">
  <div class="cp-verdict-label">Notre verdict Albexia</div>
  <div class="cp-verdict-title">${logoInlineComp(gagnantObj)} 🏆 ${gagnantNom} recommandé</div>
  <p class="cp-verdict-text">${comp.verdict.texte || ''}</p>
</div>` : '';

  // ── FAQ ──
  const faqItems = comp.faq || [];
  const faqHTML = faqItems.length ? `<div class="cp-faq">
  ${faqItems.map((f, i) => `<div class="cp-faq-item" id="faq-${i}">
    <button class="cp-faq-question" onclick="toggleFAQ(${i})">
      <span>${f.question}</span>
      <span class="cp-faq-arrow">▼</span>
    </button>
    <div class="cp-faq-answer">${f.reponse}</div>
  </div>`).join('')}
</div>` : '';

  const faqJsonLd = faqItems.length ? `
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
${faqItems.map(f => `      {
        "@type": "Question",
        "name": ${JSON.stringify(f.question)},
        "acceptedAnswer": { "@type": "Answer", "text": ${JSON.stringify(f.reponse.replace(/<[^>]+>/g,''))} }
      }`).join(',\n')}
    ]
  }
  </script>` : '';

  // ── CTA ──
  const ctaHTML = `<div class="cp-cta-wrap">
  <a href="${a.lien}" target="_blank" rel="noopener" class="cp-cta-btn cp-cta-a">
    ${a.favicon ? `<img src="${a.favicon}" alt="${a.nom}" onerror="this.style.display='none'">` : ''}<span>Essayer ${a.nom}</span><span>→</span>
  </a>
  <a href="${b.lien}" target="_blank" rel="noopener" class="cp-cta-btn cp-cta-b">
    ${b.favicon ? `<img src="${b.favicon}" alt="${b.nom}" onerror="this.style.display='none'">` : ''}<span>Essayer ${b.nom}</span><span>→</span>
  </a>
</div>`;

  const comparisonJsonLd = `
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": ${JSON.stringify(`${a.nom} vs ${b.nom}`)},
    "description": ${JSON.stringify(metaDesc)},
    "inLanguage": "${langue}",
    "author": { "@type": "Organization", "name": "Albexia" },
    "publisher": { "@type": "Organization", "name": "Albexia", "url": "${SITE_ORIGIN}" },
    "mainEntityOfPage": { "@type": "WebPage", "@id": "${canonicalUrl}" }
  }
  </script>`;

  return `<!DOCTYPE html>
<html lang="${langue}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titleTag}</title>
  <meta name="description" content="${metaDesc}" />
  <meta name="robots" content="index, follow" />

  <link rel="canonical" href="${canonicalUrl}" />

${hreflangTags}

  <meta property="og:title"       content="${titleTag}" />
  <meta property="og:description" content="${metaDesc}" />
  <meta property="og:type"        content="website" />
  <meta property="og:url"         content="${canonicalUrl}" />
  <meta property="og:locale"      content="${ogLocale}" />
${ogLocaleAlternates}
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="${titleTag}" />
  <meta name="twitter:description" content="${metaDesc}" />
${comparisonJsonLd}
${faqJsonLd}
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${R}css/style.css" />
  <link rel="stylesheet" href="${R}css/comparer.css" />
</head>
<body>

${navHTML(langue)}

${heroHTML}

${toolsHeaderHTML}

<div class="cp-section">
  <div class="cp-section-title">${{fr:'Comparaison détaillée',en:'Detailed comparison',es:'Comparación detallada'}[langue]||'Comparaison détaillée'}</div>
  ${tableauHTML}
</div>

<div class="cp-section">
  <div class="cp-section-title">${{fr:'Points forts & limites',en:'Strengths & limitations',es:'Puntos fuertes y límites'}[langue]||'Points forts & limites'}</div>
  ${avantagesHTML}
</div>

${casUsageHTML ? `<div class="cp-section">
  <div class="cp-section-title">${{fr:'Qui devrait choisir quoi ?',en:'Who should choose what?',es:'¿Quién debería elegir qué?'}[langue]||'Qui devrait choisir quoi ?'}</div>
  ${casUsageHTML}
</div>` : ''}

${verdictHTML ? `<div class="cp-section">
  <div class="cp-section-title">${{fr:'Verdict Albexia',en:'Albexia verdict',es:'Veredicto Albexia'}[langue]||'Verdict Albexia'}</div>
  ${verdictHTML}
</div>` : ''}

${faqHTML ? `<div class="cp-section">
  <div class="cp-section-title">${{fr:'Questions fréquentes',en:'FAQ',es:'Preguntas frecuentes'}[langue]||'Questions fréquentes'}</div>
  ${faqHTML}
</div>` : ''}

<div class="cp-section">
  ${ctaHTML}
</div>

<a href="${R}comparateur/" class="cp-back">← ${{fr:'Retour au comparateur',en:'Back to comparator',es:'Volver al comparador'}[langue]||'Retour au comparateur'}</a>

${footerHTML()}
${faqHTML ? '<script>function toggleFAQ(i){document.getElementById("faq-"+i).classList.toggle("open");}</script>' : ''}
${sharedJS()}
</body>
</html>`;
}

// ════════════════════════════════════════════════════════════
// GÉNÉRATEUR NICHES (micro-niches SEO par métier)
// Source : Firestore collection "niches"
// Sortie : niches/{slug}/index.html
//
// Seules les niches status==='publie' sont générées — un brouillon
// reste en Firestore mais n'a jamais de page HTML publique tant que
// Damon ne l'a pas validé dans l'admin, quel que soit son contenu.
// ════════════════════════════════════════════════════════════

function nicheToolCardHTML(tool) {
  const fav = `https://www.google.com/s2/favicons?sz=64&domain=${(tool.url||'').replace(/^https?:\/\//,'').split('/')[0]}`;
  const note = typeof tool.note === 'number' ? tool.note : (typeof tool.rating === 'number' ? tool.rating : null);
  const slug = slugify(tool.name);
  const plan = tool.plan === 'featured' ? 'featured' : tool.plan === 'starter' ? 'starter' : 'standard';
  const langue = tool.langue || 'fr';
  const ficheUrl = `${R}tools/${plan}/${langue}/${slug}/`;
  return `<a href="${ficheUrl}" class="niche-tool-card">
  <div class="ntc-top">
    <img src="${fav}" alt="${tool.name}" class="ntc-logo" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
    <span class="ntc-logo-fallback" style="display:none">${tool.emoji||'🤖'}</span>
    <span class="ntc-name">${tool.name}</span>
    ${note ? `<span class="ntc-note">★ ${note}</span>` : ''}
  </div>
  <span class="ntc-cat">${tool.category||''}</span>
  <span class="ntc-cta">Voir la fiche →</span>
</a>`;
}

function generateNichePage(niche, tools, allNiches) {
  const langue = 'fr';
  const slug = niche.slug;
  if (!slug) return null;

  // "tools" est déjà déduplié par nom en amont (voir toolsUniques dans main()) —
  // pas besoin de refiltrer sur la langue ici, ce qui exclurait à tort un
  // outil qui n'existerait qu'en anglais (aucune variante FR disponible).
  // On déduplique aussi outils_slugs lui-même : des niches enregistrées avant
  // le correctif de l'admin peuvent contenir le même slug plusieurs fois
  // (ex: "chatgpt" répété 3 fois) — un tools dédupliqué ne suffit pas si on
  // itère 3 fois sur la même référence.
  const slugsUniques = [...new Set(niche.outils_slugs || [])];
  const outilsMatches = slugsUniques
    .map(s => tools.find(t => slugify(t.name) === s))
    .filter(Boolean);

  const canonicalUrl = `${SITE_ORIGIN}/niches/${slug}/index.html`;
  const titleTag = niche.meta_title || `Meilleurs outils IA pour ${niche.metier} en 2026 | Albexia`;
  const metaDesc = niche.meta_description || niche.intro_ia?.slice(0, 155) || `Découvrez les meilleurs outils IA sélectionnés pour ${niche.metier}. Comparatif et conseils Albexia.`;

  const toolsGridHTML = outilsMatches.length
    ? outilsMatches.map(nicheToolCardHTML).join('\n')
    : `<p style="color:var(--text-dim);font-size:14px;">Aucun outil sélectionné pour l'instant.</p>`;

  const conseilsHTML = niche.conseils_ia ? `<div class="niche-section">
  <div class="niche-section-title">Comment choisir ?</div>
  <div class="niche-conseils">${niche.conseils_ia}</div>
</div>` : '';

  const faqItems = niche.faq || [];
  const faqHTML = faqItems.length ? `<div class="niche-section">
  <div class="niche-section-title">Questions fréquentes</div>
  <div class="niche-faq">
    ${faqItems.map((f, i) => `<div class="niche-faq-item" id="nfaq-${i}">
      <button class="niche-faq-question" onclick="toggleNicheFAQ(${i})">
        <span>${f.question}</span>
        <span class="niche-faq-arrow">▼</span>
      </button>
      <div class="niche-faq-answer">${f.reponse}</div>
    </div>`).join('')}
  </div>
</div>` : '';

  const faqJsonLd = faqItems.length ? `
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
${faqItems.map(f => `      {
        "@type": "Question",
        "name": ${JSON.stringify(f.question)},
        "acceptedAnswer": { "@type": "Answer", "text": ${JSON.stringify(f.reponse.replace(/<[^>]+>/g,''))} }
      }`).join(',\n')}
    ]
  }
  </script>` : '';

  // Maillage interne : autres niches publiées de la même super-catégorie
  const nichesLiees = allNiches.filter(n => n.status === 'publie' && n.super_categorie === niche.super_categorie && n.slug !== slug).slice(0, 8);
  const relatedHTML = nichesLiees.length ? `<div class="niche-section">
  <div class="niche-section-title">Autres métiers en ${niche.super_categorie}</div>
  <div class="niche-related">
    ${nichesLiees.map(n => `<a href="${R}niches/${n.slug}/index.html" class="niche-related-link">${n.metier}</a>`).join('')}
  </div>
</div>` : '';

  const articleJsonLd = `
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": ${JSON.stringify(`Meilleurs outils IA pour ${niche.metier}`)},
    "description": ${JSON.stringify(metaDesc)},
    "inLanguage": "${langue}",
    "author": { "@type": "Organization", "name": "Albexia" },
    "publisher": { "@type": "Organization", "name": "Albexia", "url": "${SITE_ORIGIN}" },
    "mainEntityOfPage": { "@type": "WebPage", "@id": "${canonicalUrl}" }
  }
  </script>`;

  return `<!DOCTYPE html>
<html lang="${langue}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titleTag}</title>
  <meta name="description" content="${metaDesc}" />
  <meta name="robots" content="index, follow" />

  <link rel="canonical" href="${canonicalUrl}" />

  <meta property="og:title"       content="${titleTag}" />
  <meta property="og:description" content="${metaDesc}" />
  <meta property="og:type"        content="website" />
  <meta property="og:url"         content="${canonicalUrl}" />
${articleJsonLd}
${faqJsonLd}
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${R}css/style.css" />
  <link rel="stylesheet" href="${R}css/niche.css" />
</head>
<body>

${navHTML(langue)}

<section class="niche-hero">
  <div class="niche-hero-glow"></div>
  <div class="niche-badge">${niche.super_categorie}</div>
  <h1>Meilleurs outils IA pour ${niche.metier}</h1>
  <p>${niche.intro_ia || ''}</p>
</section>

<div class="niche-section">
  <div class="niche-section-title">Notre sélection (${outilsMatches.length})</div>
  <div class="niche-tools-grid">
${toolsGridHTML}
  </div>
</div>

${conseilsHTML}

${faqHTML}

${relatedHTML}

<div class="niche-cta-wrap">
  <a href="${R}index.html#tools" class="niche-cta-btn">Explorer tout le catalogue →</a>
</div>

<a href="${R}index.html#tools" class="niche-back">← Retour au catalogue</a>

${footerHTML()}
${faqHTML ? '<script>function toggleNicheFAQ(i){document.getElementById("nfaq-"+i).classList.toggle("open");}</script>' : ''}
${sharedJS()}
</body>
</html>`;
}

// ════════════════════════════════════════════════════════════
// GLOSSAIRE IA (pages dédiées /glossaire/{slug}/, cibles Position 0)
// ════════════════════════════════════════════════════════════
// Réutilise les classes .niche-* existantes (niche.css) — aucun nouveau
// fichier CSS nécessaire. Seuls le badge de niveau et les 2 callouts
// (définition flash / erreur fréquente) ont un <style> scopé en page.

const GLOSSAIRE_NIVEAUX = {
  debutant:      { emoji: '🌱', label: 'Débutant',      couleur: '#00d4aa' },
  intermediaire: { emoji: '🌿', label: 'Intermédiaire', couleur: '#f5a623' },
  avance:        { emoji: '🌳', label: 'Avancé',        couleur: '#ff6b9d' },
};

function glossaireNiveauBadgeHTML(niveau) {
  const n = GLOSSAIRE_NIVEAUX[niveau] || GLOSSAIRE_NIVEAUX.debutant;
  return `<span class="glossaire-niveau-badge" style="color:${n.couleur};border-color:${n.couleur}66;background:${n.couleur}1a">${n.emoji} ${n.label}</span>`;
}

function generateGlossaireHub(termes, tools) {
  const langue = 'fr';
  const canonicalUrl = `${SITE_ORIGIN}/glossaire/`;
  const titleTag = `Glossaire IA — Tous les termes de l'intelligence artificielle expliqués | Albexia`;
  const metaDesc = `Définitions claires des termes de l'IA : LLM, prompt, agent IA, RAG... Comprenez le vocabulaire de l'intelligence artificielle en français.`;

  // Données embarquées statiquement — plus de fetch() séparé, donc plus de
  // risque de casse si un fichier JSON bouge d'endroit. Chaque terme est
  // enrichi avec le libellé + lien réel de ses outils, résolus une fois ici.
  const dataJS = termes.map(t => {
    const outilsResolus = (t.outils || [])
      .map(s => tools.find(x => slugify(x.name) === s))
      .filter(Boolean)
      .map(tool => {
        const plan = tool.plan === 'featured' ? 'featured' : tool.plan === 'starter' ? 'starter' : 'standard';
        return { nom: tool.name, url: `${R}tools/${plan}/${tool.langue||'fr'}/${slugify(tool.name)}/` };
      });
    return {
      terme: t.terme,
      slug: t.slug,
      lettre: (t.lettre || t.terme?.[0] || '').toUpperCase(),
      niveau: t.niveau || 'debutant',
      definition: t.definitionFlash || '',
      exemple: t.exemple || '',
      outils: outilsResolus,
      publie: t.status === 'publie',
    };
  });

  return `<!DOCTYPE html>
<html lang="${langue}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titleTag}</title>
  <meta name="description" content="${metaDesc}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${canonicalUrl}" />
  <meta property="og:title" content="${titleTag}" />
  <meta property="og:description" content="${metaDesc}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${canonicalUrl}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Syne:wght@600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${R}css/style.css" />
  <style>
    .glossaire-hero{padding:64px 32px 48px;text-align:center;max-width:1100px;margin:0 auto;position:relative}
    .glossaire-hero::before{content:'';position:absolute;top:0;left:50%;transform:translateX(-50%);width:600px;height:300px;background:radial-gradient(ellipse at center,rgba(108,99,255,0.12) 0%,transparent 70%);pointer-events:none}
    .glossaire-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(108,99,255,0.1);border:1px solid rgba(108,99,255,0.3);color:#a8a3ff;font-size:12px;font-weight:600;padding:5px 16px;border-radius:20px;margin-bottom:24px;letter-spacing:0.08em;text-transform:uppercase}
    .glossaire-hero h1{font-family:'Syne',sans-serif;font-size:clamp(32px,5vw,56px);font-weight:800;line-height:1.05;letter-spacing:-0.03em;margin-bottom:16px}
    .glossaire-hero h1 .grad-purple{background:linear-gradient(135deg,#6c63ff 0%,#00d4aa 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
    .glossaire-hero p{font-size:16px;color:var(--text-muted);max-width:480px;margin:0 auto 32px;font-weight:300;line-height:1.7}
    .terme-jour-wrap{max-width:1100px;margin:0 auto;padding:0 32px 28px}
    .terme-jour{background:linear-gradient(135deg,rgba(108,99,255,0.1) 0%,rgba(0,212,170,0.06) 100%);border:1px solid rgba(108,99,255,0.25);border-radius:16px;padding:24px 28px;display:flex;align-items:flex-start;gap:20px}
    .terme-jour-ico{font-size:32px;flex-shrink:0;line-height:1}
    .terme-jour-label{font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#a8a3ff;margin-bottom:4px}
    .terme-jour-nom{font-family:'Syne',sans-serif;font-size:20px;font-weight:700;margin-bottom:6px}
    .terme-jour-def{font-size:13px;color:var(--text-muted);line-height:1.6;font-weight:300}
    .glossaire-controls{max-width:1100px;margin:0 auto;padding:0 32px 28px}
    .glossaire-search-wrap{position:relative;margin-bottom:16px}
    .glossaire-search-icon{position:absolute;left:16px;top:50%;transform:translateY(-50%);color:var(--text-dim);font-size:17px;pointer-events:none}
    .glossaire-search{width:100%;padding:14px 16px 14px 48px;background:var(--bg2);border:1px solid var(--border);color:var(--text);font-size:14px;border-radius:12px;font-family:'DM Sans',sans-serif;outline:none;transition:border-color .2s}
    .glossaire-search::placeholder{color:var(--text-dim)}
    .glossaire-search:focus{border-color:rgba(108,99,255,0.5)}
    .alpha-nav{display:flex;gap:3px;flex-wrap:wrap}
    .alpha-btn{width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;border:1px solid var(--border);border-radius:7px;background:transparent;color:var(--text-muted);cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .15s}
    .alpha-btn:hover{border-color:rgba(108,99,255,0.4);color:#a8a3ff;background:rgba(108,99,255,0.08)}
    .alpha-btn.has-terms{color:var(--text)}
    .alpha-btn.inactive{opacity:0.3;cursor:default;pointer-events:none}
    .niveau-filters{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}
    .niveau-filter{padding:5px 14px;font-size:12px;font-weight:500;border:1px solid var(--border);border-radius:20px;background:transparent;color:var(--text-muted);cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .15s}
    .niveau-filter:hover{border-color:var(--border-hover);color:var(--text)}
    .niveau-filter.active{background:rgba(108,99,255,0.12);border-color:rgba(108,99,255,0.4);color:#a8a3ff}
    .niveau-filter[data-niveau="debutant"].active{background:rgba(0,212,170,0.1);border-color:rgba(0,212,170,0.4);color:#00d4aa}
    .niveau-filter[data-niveau="intermediaire"].active{background:rgba(245,166,35,0.1);border-color:rgba(245,166,35,0.4);color:#f5a623}
    .niveau-filter[data-niveau="avance"].active{background:rgba(255,107,157,0.1);border-color:rgba(255,107,157,0.4);color:#ff6b9d}
    .glossaire-body{max-width:1100px;margin:0 auto;padding:0 32px 64px}
    .letter-section{margin-bottom:40px}
    .letter-anchor{display:flex;align-items:center;gap:16px;margin-bottom:16px}
    .letter-char{font-family:'Syne',sans-serif;font-size:36px;font-weight:800;color:rgba(108,99,255,0.5);line-height:1;min-width:36px}
    .letter-line{flex:1;height:1px;background:var(--border)}
    .terms-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:10px}
    .term-card{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:18px 20px;transition:all .2s;position:relative}
    .term-card:hover{border-color:rgba(108,99,255,0.35);transform:translateY(-2px);box-shadow:0 8px 24px rgba(108,99,255,0.06)}
    .term-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px}
    .term-nom{font-family:'Syne',sans-serif;font-size:15px;font-weight:700}
    .term-nom-link{color:var(--text);text-decoration:none}
    .term-nom-link:hover{color:#a8a3ff}
    .term-niveau{font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:2px 8px;border-radius:5px;flex-shrink:0}
    .niveau-debutant{background:rgba(0,212,170,0.1);color:#00d4aa;border:1px solid rgba(0,212,170,0.2)}
    .niveau-intermediaire{background:rgba(245,166,35,0.1);color:#f5a623;border:1px solid rgba(245,166,35,0.2)}
    .niveau-avance{background:rgba(255,107,157,0.1);color:#ff6b9d;border:1px solid rgba(255,107,157,0.2)}
    .term-def{font-size:13px;color:var(--text-muted);line-height:1.6;font-weight:300;margin-bottom:10px}
    .term-toggle{font-size:11px;color:#a8a3ff;background:none;border:none;cursor:pointer;font-family:'DM Sans',sans-serif;padding:0;margin-bottom:0;transition:color .15s}
    .term-toggle:hover{color:#fff}
    .term-extra{display:none;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)}
    .term-extra.open{display:block}
    .term-exemple{font-size:12px;color:var(--text-dim);line-height:1.6;font-style:italic;margin-bottom:10px;padding:10px 14px;background:var(--bg3);border-radius:8px;border-left:2px solid rgba(108,99,255,0.4)}
    .term-exemple::before{content:'💡 Exemple : ';font-style:normal;font-weight:500;color:#a8a3ff}
    .term-outils{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
    .term-outil-tag{font-size:11px;padding:3px 10px;background:rgba(255,107,157,0.08);border:1px solid rgba(255,107,157,0.2);border-radius:6px;color:#ff6b9d;text-decoration:none;transition:all .15s}
    .term-outil-tag:hover{background:rgba(255,107,157,0.15)}
    .term-fiche-link{display:inline-block;font-size:11px;font-weight:600;color:#00d4aa;text-decoration:none}
    .term-fiche-link:hover{text-decoration:underline}
    .term-brouillon-tag{font-size:10px;color:var(--text-dim);font-style:italic}
    .glossaire-cta{max-width:1100px;margin:0 auto 16px;padding:0 32px}
    .glossaire-cta-card{background:var(--bg2);border:1px solid var(--border);border-radius:16px;padding:24px 28px;display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap}
    .glossaire-cta-text{font-size:14px;font-weight:500}
    .glossaire-cta-text span{color:var(--text-muted);font-weight:300;display:block;font-size:12px;margin-top:2px}
    .glossaire-cta-tools{display:flex;gap:8px;flex-wrap:wrap}
    .cta-tool-btn{padding:7px 16px;font-size:12px;font-weight:500;border:1px solid var(--border);border-radius:8px;background:transparent;color:var(--text-muted);cursor:pointer;font-family:'DM Sans',sans-serif;transition:all .2s;text-decoration:none}
    .cta-tool-btn:hover{border-color:rgba(255,107,157,0.4);color:#ff6b9d;background:rgba(255,107,157,0.06)}
    .no-results{text-align:center;padding:64px 32px;color:var(--text-muted);font-size:15px}
    .no-results .no-results-ico{font-size:40px;margin-bottom:12px}
    html,body{overflow-x:hidden;width:100%;position:relative}
    @media (max-width:768px){
      .glossaire-hero,.terme-jour-wrap,.glossaire-controls,.glossaire-body,.glossaire-cta{padding-left:20px;padding-right:20px}
      .glossaire-hero::before{width:100%;height:200px}
      .glossaire-hero div[style*="display:flex"]{flex-direction:column;gap:20px!important}
      .terms-list{grid-template-columns:1fr}
      .terme-jour{flex-direction:column;align-items:center;text-align:center}
      .glossaire-cta-card{flex-direction:column;text-align:center}
      .glossaire-cta-tools{justify-content:center;width:100%}
      .cta-tool-btn{flex:1;text-align:center}
    }
  </style>
</head>
<body>

${navHTML(langue)}

<section class="glossaire-hero">
  <div class="glossaire-badge">📖 Référence francophone</div>
  <h1>Glossaire de <span class="grad-purple">l'IA</span></h1>
  <p>Tous les termes de l'intelligence artificielle expliqués simplement en français — pour débutants et professionnels.</p>
  <div style="display:flex;gap:32px;justify-content:center;margin-top:32px;padding-top:28px;border-top:1px solid var(--border)">
    <div>
      <div style="font-family:'Syne',sans-serif;font-size:28px;font-weight:800;color:#6c63ff">${dataJS.length}</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:2px">termes définis</div>
    </div>
    <div>
      <div style="font-family:'Syne',sans-serif;font-size:28px;font-weight:800;color:#00d4aa">3</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:2px">niveaux</div>
    </div>
    <div>
      <div style="font-family:'Syne',sans-serif;font-size:28px;font-weight:800;color:#ff6b9d">FR</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:2px">100% en français</div>
    </div>
  </div>
</section>

<div class="terme-jour-wrap">
  <div class="terme-jour" id="terme-jour">
    <div class="terme-jour-ico">💡</div>
    <div>
      <div class="terme-jour-label">Terme du jour</div>
      <div class="terme-jour-nom" id="tdj-nom">Chargement…</div>
      <div class="terme-jour-def" id="tdj-def"></div>
    </div>
  </div>
</div>

<div class="glossaire-controls">
  <div class="glossaire-search-wrap">
    <span class="glossaire-search-icon">🔍</span>
    <input type="text" class="glossaire-search" id="glossaire-search" placeholder="Rechercher un terme… (ex: LLM, prompt, token)">
  </div>
  <div class="alpha-nav" id="alpha-nav"></div>
  <div class="niveau-filters">
    <button class="niveau-filter active" data-niveau="Tous">Tous les niveaux</button>
    <button class="niveau-filter" data-niveau="debutant">🌱 Débutant</button>
    <button class="niveau-filter" data-niveau="intermediaire">🌿 Intermédiaire</button>
    <button class="niveau-filter" data-niveau="avance">🌳 Avancé</button>
  </div>
</div>

<div class="glossaire-cta">
  <div class="glossaire-cta-card">
    <div class="glossaire-cta-text">
      Vous découvrez l'IA ? Commencez gratuitement.
      <span>Ces outils ont un plan gratuit — aucune carte requise.</span>
    </div>
    <div class="glossaire-cta-tools">
      <a class="cta-tool-btn" href="https://chat.openai.com" target="_blank" rel="noopener">ChatGPT →</a>
      <a class="cta-tool-btn" href="https://writesonic.com" target="_blank" rel="noopener">Writesonic →</a>
      <a class="cta-tool-btn" href="https://canva.com" target="_blank" rel="noopener">Canva IA →</a>
    </div>
  </div>
</div>

<div class="glossaire-body" id="glossaire-body"><!-- injecté par JS --></div>

${footerHTML()}

<script>
'use strict';
const allTermes = ${JSON.stringify(dataJS)};
let activeNiveau = 'Tous';
let activeLettre = null;
let searchQuery = '';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function initTermeDuJour() {
  const idx = new Date().getDate() % allTermes.length;
  const t = allTermes[idx];
  document.getElementById('tdj-nom').textContent = t.terme;
  document.getElementById('tdj-def').textContent = t.definition;
}
function initAlpha() {
  const lettresPresentes = new Set(allTermes.map(t => t.lettre));
  const nav = document.getElementById('alpha-nav');
  nav.innerHTML = ALPHABET.map(l => {
    const has = lettresPresentes.has(l);
    return '<button class="alpha-btn' + (has ? ' has-terms' : ' inactive') + '" data-lettre="' + l + '">' + l + '</button>';
  }).join('');
  nav.querySelectorAll('.alpha-btn.has-terms').forEach(btn => {
    btn.addEventListener('click', () => {
      activeLettre = activeLettre === btn.dataset.lettre ? null : btn.dataset.lettre;
      searchQuery = '';
      document.getElementById('glossaire-search').value = '';
      nav.querySelectorAll('.alpha-btn').forEach(b => { b.style.background=''; b.style.borderColor=''; b.style.color=''; });
      if (activeLettre) { btn.style.background='rgba(108,99,255,0.2)'; btn.style.borderColor='rgba(108,99,255,0.5)'; btn.style.color='#a8a3ff'; }
      renderGlossaire();
      if (activeLettre) { const s = document.getElementById('section-'+activeLettre); if (s) s.scrollIntoView({behavior:'smooth',block:'start'}); }
    });
  });
}
function initNiveaux() {
  document.querySelectorAll('.niveau-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      activeNiveau = btn.dataset.niveau;
      document.querySelectorAll('.niveau-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderGlossaire();
    });
  });
}
function initSearch() {
  document.getElementById('glossaire-search').addEventListener('input', e => {
    searchQuery = normaliser(e.target.value);
    activeLettre = null;
    document.querySelectorAll('.alpha-btn').forEach(b => { b.style.background=''; b.style.borderColor=''; b.style.color=''; });
    renderGlossaire();
  });
}
function normaliser(str) { return str.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().trim(); }
function filtrerTermes() {
  let termes = [...allTermes];
  if (activeNiveau !== 'Tous') termes = termes.filter(t => t.niveau === activeNiveau);
  if (activeLettre) termes = termes.filter(t => t.lettre === activeLettre);
  if (searchQuery) termes = termes.filter(t => normaliser(t.terme).includes(searchQuery) || normaliser(t.definition).includes(searchQuery));
  return termes;
}
function niveauLabel(n) { return { debutant:'Débutant', intermediaire:'Intermédiaire', avance:'Avancé' }[n] || n; }
function renderGlossaire() {
  const termes = filtrerTermes();
  const body = document.getElementById('glossaire-body');
  if (!termes.length) {
    body.innerHTML = '<div class="no-results"><div class="no-results-ico">🔍</div><p>Aucun terme trouvé pour "<strong>'+(searchQuery||activeLettre||activeNiveau)+'</strong>".</p><p style="margin-top:8px;font-size:13px">Essayez un autre mot-clé ou <a href="#" onclick="resetFilters();return false;" style="color:#a8a3ff">réinitialisez les filtres</a>.</p></div>';
    return;
  }
  const byLetter = {};
  termes.forEach(t => { (byLetter[t.lettre] ||= []).push(t); });
  body.innerHTML = Object.keys(byLetter).sort().map(l =>
    '<div class="letter-section" id="section-'+l+'"><div class="letter-anchor"><span class="letter-char">'+l+'</span><span class="letter-line"></span></div><div class="terms-list">'+byLetter[l].map(termCardHTML).join('')+'</div></div>'
  ).join('');
  body.querySelectorAll('.term-toggle').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const extra = btn.nextElementSibling;
      const isOpen = extra.classList.toggle('open');
      btn.textContent = isOpen ? '▲ Masquer l\\'exemple' : '▼ Voir exemple';
    });
  });
}
function termCardHTML(t) {
  const outilsHTML = t.outils.length ? '<div class="term-outils">'+t.outils.map(o => '<a href="'+o.url+'" class="term-outil-tag">'+o.nom+'</a>').join('')+'</div>' : '';
  const ficheLink = t.publie ? '<a href="/glossaire/'+t.slug+'/" class="term-fiche-link">Voir la fiche complète →</a>' : '<span class="term-brouillon-tag">Fiche détaillée bientôt disponible</span>';
  const nomHTML = t.publie ? '<a href="/glossaire/'+t.slug+'/" class="term-nom-link">'+t.terme+'</a>' : t.terme;
  const exempleHTML = t.exemple
    ? '<button class="term-toggle">▼ Voir exemple</button><div class="term-extra"><div class="term-exemple">'+t.exemple+'</div>'+outilsHTML+ficheLink+'</div>'
    : (outilsHTML + ficheLink);
  return '<div class="term-card"><div class="term-head"><div class="term-nom">'+nomHTML+'</div><span class="term-niveau niveau-'+t.niveau+'">'+niveauLabel(t.niveau)+'</span></div><p class="term-def">'+t.definition+'</p>'+exempleHTML+'</div>';
}
function resetFilters() {
  activeNiveau='Tous'; activeLettre=null; searchQuery='';
  document.getElementById('glossaire-search').value='';
  document.querySelectorAll('.niveau-filter').forEach(b => b.classList.remove('active'));
  document.querySelector('.niveau-filter[data-niveau="Tous"]').classList.add('active');
  document.querySelectorAll('.alpha-btn').forEach(b => { b.style.background=''; b.style.borderColor=''; b.style.color=''; });
  renderGlossaire();
}
window.resetFilters = resetFilters;
initTermeDuJour(); initAlpha(); initNiveaux(); initSearch(); renderGlossaire();
</script>
${sharedJS()}
</body>
</html>`;
}

function generateGlossaireTermePage(terme, tools, allTermes) {
  const langue = 'fr';
  const slug = terme.slug;
  if (!slug) return null;

  const canonicalUrl = `${SITE_ORIGIN}/glossaire/${slug}/`;
  const titleTag = `C'est quoi ${/^[aeiouhAEIOUH]/.test(terme.terme) ? "l'" : "un "}${terme.terme} ? Définition IA | Albexia`;
  const defFlash = terme.definitionFlash || terme.definition || '';
  const metaDesc = defFlash.slice(0, 155);

  const outilsSlugs = [...new Set(terme.outils || [])];
  const outilsMatches = outilsSlugs.map(s => tools.find(t => slugify(t.name) === s)).filter(Boolean);
  const outilsHTML = outilsMatches.length
    ? `<div class="niche-section">
  <div class="niche-section-title">🛠️ Outils IA pour pratiquer</div>
  <div class="niche-tools-grid">
    ${outilsMatches.map(nicheToolCardHTML).join('\n    ')}
  </div>
</div>`
    : '';

  const pourquoiHTML = terme.pourquoiImportant ? `<div class="niche-section">
  <div class="niche-section-title">🎯 Pourquoi c'est important</div>
  <div class="niche-conseils">${terme.pourquoiImportant}</div>
</div>` : '';

  const enPratiqueHTML = terme.enPratique ? `<div class="niche-section">
  <div class="niche-section-title">⚙️ En pratique</div>
  <div class="niche-conseils">${terme.enPratique}</div>
</div>` : '';

  const exempleHTML = terme.exemple ? `<div class="niche-section">
  <div class="niche-section-title">💡 Exemple concret</div>
  <div class="niche-conseils" style="font-style:italic">${terme.exemple}</div>
</div>` : '';

  const erreurHTML = terme.erreurFrequente ? `<div class="niche-section">
  <div class="glossaire-erreur-box"><strong>Erreur fréquente :</strong> ${terme.erreurFrequente}</div>
</div>` : '';

  const faqItems = terme.faq || [];
  const faqHTML = faqItems.length ? `<div class="niche-section">
  <div class="niche-section-title">❓ Questions fréquentes</div>
  <div class="niche-faq">
    ${faqItems.map((f, i) => `<div class="niche-faq-item" id="gfaq-${i}">
      <button class="niche-faq-question" onclick="toggleGlossaireFAQ(${i})">
        <span>${f.question}</span>
        <span class="niche-faq-arrow">▼</span>
      </button>
      <div class="niche-faq-answer">${f.reponse}</div>
    </div>`).join('')}
  </div>
</div>` : '';

  const connexesSlugs = [...new Set(terme.termesConnexes || [])];
  const connexesMatches = connexesSlugs
    .map(s => allTermes.find(t => t.slug === s && t.status === 'publie'))
    .filter(Boolean);
  const connexesHTML = connexesMatches.length ? `<div class="niche-section">
  <div class="niche-section-title">🔗 Termes connexes</div>
  <div class="niche-related">
    ${connexesMatches.map(t => `<a href="${R}glossaire/${t.slug}/" class="niche-related-link">${t.terme}</a>`).join('')}
  </div>
</div>` : '';

  const jsonLdGraph = [
    {
      '@type': 'DefinedTerm',
      name: terme.terme,
      description: defFlash,
      inDefinedTermSet: { '@type': 'DefinedTermSet', name: 'Glossaire IA Albexia', url: `${SITE_ORIGIN}/glossaire/` },
      url: canonicalUrl,
    },
  ];
  if (faqItems.length) {
    jsonLdGraph.push({
      '@type': 'FAQPage',
      mainEntity: faqItems.map(f => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: (f.reponse || '').replace(/<[^>]+>/g, '') },
      })),
    });
  }
  const jsonLdHTML = `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': jsonLdGraph })}</script>`;

  return `<!DOCTYPE html>
<html lang="${langue}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titleTag}</title>
  <meta name="description" content="${metaDesc}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${canonicalUrl}" />
  <meta property="og:title" content="${terme.terme} — Glossaire IA Albexia" />
  <meta property="og:description" content="${metaDesc}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${canonicalUrl}" />
  ${jsonLdHTML}
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${R}css/style.css" />
  <link rel="stylesheet" href="${R}css/niche.css" />
  <style>
    .glossaire-niveau-badge{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;padding:3px 10px;border-radius:14px;border:1px solid;margin-bottom:16px}
    .glossaire-erreur-box{background:rgba(255,107,157,0.06);border:1px solid rgba(255,107,157,0.25);border-radius:12px;padding:16px 20px;font-size:14px;line-height:1.7;color:var(--text)}
    .glossaire-erreur-box strong{color:#ff6b9d}
  </style>
</head>
<body>

${navHTML(langue)}

<section class="niche-hero">
  <div class="niche-hero-glow"></div>
  ${glossaireNiveauBadgeHTML(terme.niveau)}
  <h1>${terme.terme}</h1>
  <p style="font-size:17px">${defFlash}</p>
</section>

${pourquoiHTML}
${exempleHTML}
${enPratiqueHTML}
${erreurHTML}
${faqHTML}
${outilsHTML}
${connexesHTML}

<a href="${R}glossaire/" class="niche-back">← Retour au glossaire complet</a>

${footerHTML()}
${faqHTML ? '<script>function toggleGlossaireFAQ(i){document.getElementById("gfaq-"+i).classList.toggle("open");}</script>' : ''}
${sharedJS()}
</body>
</html>`;
}

// ════════════════════════════════════════════════════════════
// VIDÉOTHÈQUE (tutoriels vidéo par outil)
// ════════════════════════════════════════════════════════════
// Reproduit EXACTEMENT la structure et le CSS de tutoriels.html /
// tutoriel-outil.html (déjà présents dans style.css : .tuto-*, .outil-*,
// .filtre-*, .duree-*, .faq-*, .btn-save-video...). Seule différence :
// les données viennent de Firestore (`outils/{id}.videotheque[]`) et
// sont injectées au moment de la génération plutôt que fetchées en
// runtime depuis tutoriels.json. js/tutoriels.js et js/tutoriel-outil.js
// ne gèrent donc plus que l'interaction (accordéon, filtres, modals),
// plus aucune logique de fetch/render — ils sont 100% génériques et
// partagés par toutes les pages générées.

const VIDEOTHEQUE_FAQ = [
  { q: "Est-il légal de visionner ces vidéos sur votre site ?", a: "Oui, absolument. Nous utilisons le lecteur officiel de YouTube, en respectant les conditions d'utilisation de la plateforme. L'auteur original conserve tous ses droits, sa publicité et ses vues. Chaque visionnage depuis Albexia est comptabilisé dans les statistiques du créateur." },
  { q: "Comment sont sélectionnées les vidéos pour chaque outil ?", a: "Notre équipe éditoriale analyse chaque soumission. Nous vérifions la qualité du son, de l'image, mais surtout la pertinence pédagogique. Une vidéo doit apporter une réelle valeur ajoutée (tutoriel, cas pratique, comparatif) pour être validée et apparaître dans notre annuaire." },
  { q: "Pourquoi filtrer par durée ?", a: "Tout le monde n'a pas le même besoin ni le même temps disponible. Si vous voulez juste un aperçu, une vidéo de 5 minutes suffit. Si vous souhaitez configurer l'outil pour votre entreprise, vous aurez besoin d'une formation de 30 à 40 minutes. Le filtre vous permet de trouver exactement le contenu adapté à votre situation." },
  { q: "Je suis YouTubeur, pourquoi soumettre ma vidéo ?", a: "Soumettre votre vidéo vous permet d'apparaître devant une audience ultra-ciblée. Un utilisateur qui consulte la fiche d'une IA est déjà convaincu d'utiliser cet outil — c'est l'endroit idéal pour gagner des abonnés qualifiés et renforcer votre autorité dans le domaine de l'IA francophone." },
  { q: "Que se passe-t-il si un outil change d'interface ?", a: "C'est l'avantage de notre système communautaire. Si une vidéo devient obsolète suite à une mise à jour, la communauté peut en signaler de plus récentes. Nous actualisons régulièrement les tutoriels pour qu'ils correspondent aux versions actuelles des logiciels." },
  { q: "Est-ce gratuit d'utiliser l'annuaire et de regarder les vidéos ?", a: "Oui, l'accès à notre plateforme et le visionnage des vidéos sont entièrement gratuits. Nous nous finançons par des partenariats affiliés avec les outils référencés pour garantir que l'apprentissage de l'IA reste accessible à tous, en particulier dans les pays francophones." },
];

const VIDEOTHEQUE_EDITORIAL = `
<h3>La vidéo : le support ultime de l'apprentissage technologique</h3>
<p>Pourquoi avoir choisi de placer la vidéo au cœur de notre annuaire ? Parce que dans le domaine de l'IA, une image vaut réellement mille mots. Lire une documentation technique sur un nouveau modèle de génération d'images comme Midjourney ou un outil d'automatisation comme Make peut s'avérer fastidieux. À l'inverse, regarder un expert manipuler l'interface, ajuster ses prompts et montrer les erreurs à éviter offre une courbe d'apprentissage fulgurante.</p>
<p>La vidéo permet de capturer la subtilité du « flux de travail » (workflow). Elle montre le temps de rendu réel, la réactivité de l'interface et, surtout, le résultat concret. En intégrant des tutoriels YouTube directement sous nos fiches outils, nous créons un écosystème d'apprentissage immédiat.</p>
<h3>Une diversité de formats pour tous les besoins</h3>
<p>Nous avons structuré notre vidéothèque pour répondre à la diversité des usages modernes. Nos filtres de durée vous permettent d'accéder à de véritables formations gratuites : une vidéo de 40 ou 50 minutes n'est pas qu'une simple démo, c'est un cours magistral où le créateur prend le temps de creuser les paramètres avancés. En filtrant les vidéos par durée, nous vous redonnons le contrôle sur votre temps de formation.</p>
<h3>Le soutien aux créateurs : une relation gagnant-gagnant</h3>
<p>Notre plateforme repose sur un principe éthique fondamental : le respect du droit d'auteur et le soutien aux créateurs de contenu. En utilisant l'intégration officielle via le lecteur YouTube, nous garantissons que chaque vue générée sur notre annuaire compte pour le créateur original. Nous encourageons les auteurs de vidéos à soumettre eux-mêmes leurs contenus pour renforcer leur autorité auprès d'un public qualifié.</p>`;

// "12:34" ou "1:08:30" → secondes (pour le filtre durée côté client)
function dureeVersSecondes(duree) {
  if (!duree) return 0;
  const parts = String(duree).split(':').map(n => parseInt(n, 10) || 0);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function toolVideothequeFolder(tool) {
  const plan   = tool.plan === 'featured' ? 'featured' : tool.plan === 'starter' ? 'starter' : 'standard';
  const langue = tool.langue || 'fr';
  const slug   = slugify(tool.name);
  if (!slug) return null;
  return { plan, langue, slug, folder: path.join('tools', plan, langue, slug, 'tutoriels') };
}

// ── Nav classique (identique à tutoriels.html/tutoriel-outil.html, PAS la navHTML() du reste du site) ──
// Adaptation : les hrefs Blog/Galerie pointent vers les ancres actuelles de
// index.html (blog.html/galerie.html n'existent plus en fichiers séparés
// aujourd'hui) ; tout le reste (markup, classes) est repris à l'identique.
function tutoNavHTML(outilId, outilNom) {
  const onclickSoumettre = `ouvrirModalSoumission('${outilId||''}','${(outilNom||'').replace(/'/g,"&#39;")}')`;
  return `<nav>
  <a href="${R}index.html" class="logo" style="text-decoration:none;color:inherit;">
    <svg viewBox="0 0 130 36" xmlns="http://www.w3.org/2000/svg" height="32" aria-label="Albexia">
      <polygon points="2,10 14,32 10,32" fill="#ff6b9d"/>
      <polygon points="14,2 18,12 10,12" fill="#ff6b9d" opacity="0.6"/>
      <polygon points="26,10 14,32 18,32" fill="#ff6b9d"/>
      <text x="36" y="26" font-family="Georgia,serif" font-size="20" font-weight="700" fill="#f0f0f5" letter-spacing="-0.5">Albe<tspan fill="#ff6b9d">x</tspan>ia</text>
    </svg>
  </a>
  <div class="nav-links">
    <a href="${R}index.html#tools" class="nav-link" style="text-decoration:none;">Outils</a>
    <a href="${R}index.html#blog" class="nav-link" style="text-decoration:none;">Blog</a>
    <a href="${R}index.html#gallery" class="nav-link" style="text-decoration:none;">Galerie</a>
    <a href="${R}tutoriels/index.html" class="nav-link active" style="text-decoration:none;">Tutoriels</a>
    <a href="${R}comparateur/" class="nav-link" style="text-decoration:none;">Comparateur</a>
    <a href="${R}ressources.html" class="nav-link" style="text-decoration:none;">Ressources</a>
  </div>
  <button class="nav-cta" onclick="${onclickSoumettre}">↑ Soumettre un tutoriel</button>
</nav>`;
}

// ── Footer propre à ces deux pages (identique à l'original, pas footerHTML() du reste du site) ──
function tutoFooterHTML() {
  return `<footer style="border-top:1px solid var(--border);padding:32px;text-align:center;color:var(--text-dim);font-size:12px;margin-top:auto;">
  <p style="margin-bottom:8px;">
    <a href="${R}index.html#tools" style="color:var(--text-dim);text-decoration:none;margin:0 10px;">Outils</a>
    <a href="${R}index.html#blog" style="color:var(--text-dim);text-decoration:none;margin:0 10px;">Blog</a>
    <a href="${R}tutoriels/index.html" style="color:var(--accent2);text-decoration:none;margin:0 10px;">Tutoriels</a>
    <a href="${R}mentions-legales.html" style="color:var(--text-dim);text-decoration:none;margin:0 10px;">Mentions légales</a>
    <a href="${R}politique-confidentialite.html" style="color:var(--text-dim);text-decoration:none;margin:0 10px;">Confidentialité</a>
  </p>
  <p>© 2025-2026 Albexia · L'annuaire IA francophone de référence</p>
</footer>`;
}

// ── Modal lecteur YouTube plein écran (identique à l'original) ──
function tutoPlayerModalHTML() {
  return `<div id="tuto-player-modal" class="tuto-player-modal" role="dialog" aria-modal="true" aria-label="Lecteur vidéo">
  <div class="tuto-player-inner">
    <div class="tuto-player-top">
      <p id="tuto-player-titre" class="tuto-player-titre"></p>
      <button class="tuto-player-close" onclick="fermerPlayer()" aria-label="Fermer le lecteur">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
    <div class="tuto-player-frame">
      <iframe id="tuto-player-iframe" src="" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen title="Tutoriel vidéo"></iframe>
    </div>
  </div>
</div>`;
}

// ── Modal soumission d'une vidéo (identique à l'original, select peuplé au build) ──
function tutoSoumissionModalHTML(toolsAvecVideo) {
  const options = toolsAvecVideo.map(t =>
    `<option value="${String(t.id||slugify(t.name))}">${t.name}</option>`
  ).join('\n          ');
  return `<div id="tuto-modal-soumission" class="tuto-modal-soumission" role="dialog" aria-modal="true" aria-label="Soumettre un tutoriel">
  <div class="tuto-modal-inner">
    <button class="tuto-modal-close" id="soumission-fermer" aria-label="Fermer">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
    <div class="tuto-modal-ico">🎬</div>
    <h2 class="tuto-modal-titre">Soumettre un tutoriel</h2>
    <p class="tuto-modal-sub">Proposez une vidéo pour <strong id="soumission-outil-nom">cet outil</strong>. Notre équipe éditoriale l'examinera sous 48h.</p>
    <form id="form-soumission" novalidate>
      <input type="hidden" id="soumission-outil-id" name="outil_id" value="">
      <div class="tuto-form-field">
        <label class="tuto-form-label" for="s-url">URL de la vidéo YouTube *</label>
        <input class="tuto-form-input" type="url" id="s-url" name="url" placeholder="https://www.youtube.com/watch?v=..." required>
      </div>
      <div class="tuto-form-field">
        <label class="tuto-form-label" for="s-outil">Outil concerné</label>
        <select class="tuto-form-select" id="s-outil" name="outil">
          <option value="">Sélectionner un outil…</option>
          ${options}
          <option value="autre">Autre outil IA</option>
        </select>
      </div>
      <div class="tuto-form-field">
        <label class="tuto-form-label" for="s-nom">Votre nom ou pseudo (optionnel)</label>
        <input class="tuto-form-input" type="text" id="s-nom" name="nom" placeholder="Jean-Michel ou @MonCanal">
      </div>
      <div class="tuto-form-field">
        <label class="tuto-form-label" for="s-email">Votre email (pour notification)</label>
        <input class="tuto-form-input" type="email" id="s-email" name="email" placeholder="vous@exemple.com">
      </div>
      <button type="submit" class="tuto-form-submit" id="soumission-submit">Soumettre la vidéo →</button>
      <p class="tuto-form-note">Soumission gratuite · Réponse sous 48h · Droit d'auteur respecté</p>
    </form>
  </div>
</div>`;
}

// ── FAQ (classes .faq-item/.faq-question/.faq-icone/.faq-reponse — identique à renderFAQ()) ──
function tutoFaqHTML() {
  const items = VIDEOTHEQUE_FAQ.map((f, i) => `<div class="faq-item" id="faq-${i}">
      <button class="faq-question" onclick="toggleFAQ(${i})" aria-expanded="false">
        <span>${f.q}</span>
        <svg class="faq-icone" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div class="faq-reponse" id="faq-rep-${i}">
        <p>${f.a}</p>
      </div>
    </div>`).join('\n');
  return `<section class="tuto-faq-wrap">
  <div class="tuto-faq-head"><h2>Questions fréquentes</h2></div>
  <div class="faq-list" id="tuto-faq-list">${items}</div>
</section>`;
}

function tutoEditorialHTML() {
  return `<section class="tuto-editorial-wrap">
  <div class="tuto-editorial-head">
    <h2>Pourquoi la vidéo est-elle le meilleur moyen de maîtriser l'IA&nbsp;?</h2>
  </div>
  <div class="tuto-editorial-body">${VIDEOTHEQUE_EDITORIAL}</div>
</section>`;
}

// ── Miniature vidéo dans l'aperçu accordéon d'une carte (page vitrine) — identique à miniatureHTML() ──
function miniatureHTML(v, tool) {
  const outilId = String(tool.id || slugify(tool.name));
  const videoData = JSON.stringify({
    videoId: v.youtube_id, outilId, outilNom: tool.name,
    outilPage: `${R}${toolVideothequeFolder(tool).folder}/`.replace(/\\/g,'/'),
    titre: v.titre, canal: v.canal||'', duree: v.duree||'', youtubeId: v.youtube_id,
  }).replace(/"/g, '&quot;');
  const titreEsc = v.titre.replace(/'/g, "&#39;");
  return `<div class="tuto-thumb" title="${v.titre}">
    <div class="tuto-thumb-img" onclick="ouvrirPlayer('${v.youtube_id}','${titreEsc}')">
      <img src="https://img.youtube.com/vi/${v.youtube_id}/mqdefault.jpg" alt="${v.titre}" loading="lazy" onerror="this.src='${R}assets/placeholder-video.svg'">
      <div class="thumb-play"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
      <span class="thumb-badge badge-video">▶ Vidéo</span>
      <span class="thumb-duree">${v.duree||''}</span>
    </div>
    <div class="tuto-thumb-footer">
      <div onclick="ouvrirPlayer('${v.youtube_id}','${titreEsc}')">
        <p class="thumb-titre">${v.titre}</p>
        <p class="thumb-canal">${v.canal||''}</p>
      </div>
      <button class="btn-save-video" data-video-id="${v.youtube_id}" title="Sauvegarder cette vidéo" aria-label="Sauvegarder cette vidéo"
        onclick="event.stopPropagation(); window._toggleSaveVideo(this, JSON.parse(this.dataset.videoData));"
        data-video-data="${videoData}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
      </button>
    </div>
  </div>`;
}

// ── Carte outil (page vitrine) — identique à carteHTML() de l'ancien tutoriels.js ──
// Compromis assumé : le doc Firestore `outils` n'a pas de champ `couleur` par
// outil (existait dans tutoriels.json). Le logo utilise donc un fond neutre
// + l'emoji de l'outil au lieu de la couleur de marque individuelle.
function tutoCardHTML(tool, allTools) {
  const info = toolVideothequeFolder(tool);
  if (!info) return '';
  const outilId = String(tool.id || info.slug);
  const videos = tool.videotheque || [];
  const pageUrl = `${R}tools/${info.plan}/${info.langue}/${info.slug}/tutoriels/`;
  const apercu = videos.slice(0, 5).map(v => miniatureHTML(v, tool)).join('');
  const tags = (tool.tags||[]).map(t => `<span class="tuto-tag">${t}</span>`).join('');

  return `<article class="tuto-card" id="carte-${info.slug}" data-id="${info.slug}">
    <div class="tuto-card-header">
      <div class="tuto-card-identity">
        <div class="tuto-card-logo" style="background:var(--bg3);color:var(--text);overflow:hidden;padding:0;">
          <img src="https://www.google.com/s2/favicons?sz=64&domain=${(tool.url||'').replace(/^https?:\/\//,'').split('/')[0]}" alt="${tool.name}" width="24" height="24" loading="lazy" style="display:block;" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${tool.emoji||'🤖'}'}))">
        </div>
        <div>
          <h3 class="tuto-card-nom">${tool.name}</h3>
          <span class="tuto-card-cat">${tool.category||''}</span>
        </div>
      </div>
      <div class="tuto-card-meta">
        <div class="tuto-card-note" id="note-${info.slug}"></div>
        <span class="tuto-card-avis" id="avis-${info.slug}"></span>
        <span class="tuto-card-badge-count">${videos.length} vidéo${videos.length>1?'s':''}</span>
      </div>
    </div>

    <p class="tuto-card-desc-courte">${tool.description||''}</p>

    <div class="tuto-card-tags">${tags}</div>

    <div class="tuto-card-actions">
      <button class="tuto-card-btn tuto-btn-voir" data-id="${info.slug}" onclick="toggleCarte('${info.slug}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        Voir les tutoriels
      </button>
      <button class="tuto-btn-soumettre" onclick="ouvrirModalSoumission('${outilId}','${tool.name.replace(/'/g,"&#39;")}')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        Soumettre
      </button>
    </div>

    <div class="tuto-card-expand" id="expand-${info.slug}">
      <div class="tuto-expand-inner">
        <p class="tuto-desc-longue">${tool.presentation||tool.description||''}</p>
        <div class="tuto-section-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          Tutoriels vidéo pour comprendre et utiliser ${tool.name}
        </div>
        <div class="tuto-video-grid">${apercu}</div>
        <a href="${pageUrl}" class="tuto-voir-tout">
          Voir tous les tutoriels pour ${tool.name}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </a>
      </div>
    </div>
  </article>`;
}

// ── Carte vidéo (grille complète, page par outil) — identique à carteVideoHTML() ──
function carteVideoHTML(v, tool) {
  const outilId = String(tool.id || slugify(tool.name));
  const secondes = dureeVersSecondes(v.duree);
  const titreEsc = v.titre.replace(/'/g, "&#39;");
  const videoData = JSON.stringify({
    videoId: v.youtube_id, outilId, outilNom: tool.name,
    outilPage: `${R}${toolVideothequeFolder(tool).folder}/`.replace(/\\/g,'/'),
    titre: v.titre, canal: v.canal||'', duree: v.duree||'', youtubeId: v.youtube_id,
  }).replace(/"/g, '&quot;');
  return `<div class="outil-video-card" title="${v.titre}" data-secondes="${secondes}">
    <div class="outil-video-thumb" onclick="ouvrirPlayer('${v.youtube_id}','${titreEsc}')">
      <img src="https://img.youtube.com/vi/${v.youtube_id}/mqdefault.jpg" alt="${v.titre}" loading="lazy" onerror="this.src='${R}assets/placeholder-video.svg'">
      <div class="outil-thumb-overlay">
        <div class="outil-play-btn"><svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
      </div>
      <span class="thumb-badge badge-video">▶ Vidéo</span>
      <span class="thumb-duree">${v.duree||''}</span>
    </div>
    <div class="outil-video-info">
      <p class="outil-video-titre" onclick="ouvrirPlayer('${v.youtube_id}','${titreEsc}')">${v.titre}</p>
      <div class="outil-video-footer">
        <p class="outil-video-canal">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          ${v.canal||''}
        </p>
        <button class="btn-save-video" data-video-id="${v.youtube_id}" title="Sauvegarder cette vidéo" aria-label="Sauvegarder cette vidéo"
          onclick="event.stopPropagation(); window._toggleSaveVideo(this, JSON.parse(this.dataset.videoData));"
          data-video-data="${videoData}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </button>
      </div>
    </div>
  </div>`;
}

// ── Module Firestore inline (note réelle + save vidéo) — identique à l'original, juste des chemins absolus ──
function tutoFirestoreModuleHTML(mode) {
  const noteFn = mode === 'hub' ? `
  /* Charger la note réelle pour un outil — appelée pour chaque carte de la vitrine */
  window._chargerNoteOutil = async function(outilId, noteEl, avisEl) {
    try {
      const { ratingAverage, ratingCount } = await getRatingSummary(outilId);
      if (!ratingCount) { if (noteEl) noteEl.style.display='none'; if (avisEl) avisEl.style.display='none'; return; }
      const plein = Math.floor(ratingAverage), demi = (ratingAverage % 1) >= 0.5 ? 1 : 0, vide = 5 - plein - demi;
      const etoiles = '★'.repeat(plein) + (demi?'½':'') + '☆'.repeat(vide);
      if (noteEl) noteEl.innerHTML = \`\${etoiles} <span>\${ratingAverage}</span>\`;
      if (avisEl) avisEl.textContent = \`\${ratingCount} avis\`;
    } catch { if (noteEl) noteEl.style.display='none'; if (avisEl) avisEl.style.display='none'; }
  };
  document.querySelectorAll('[id^="carte-"]').forEach(carte => {
    const slug = carte.id.replace('carte-','');
    window._chargerNoteOutil(slug, document.getElementById('note-'+slug), document.getElementById('avis-'+slug));
  });` : `
  /* Note réelle pour la page d'un seul outil */
  window._chargerNoteReelle = async function(toolSlug) {
    const noteEl = document.getElementById('outil-note');
    try {
      const { ratingAverage, ratingCount } = await getRatingSummary(toolSlug);
      if (!noteEl) return;
      if (!ratingCount) { noteEl.innerHTML = ''; return; }
      const plein = Math.floor(ratingAverage), demi = (ratingAverage % 1) >= 0.5 ? 1 : 0, vide = 5 - plein - demi;
      const etoiles = '★'.repeat(plein) + (demi?'½':'') + '☆'.repeat(vide);
      noteEl.innerHTML = \`\${etoiles} <strong>\${ratingAverage}</strong> <span>(\${ratingCount} avis)</span>\`;
    } catch { if (noteEl) noteEl.innerHTML = ''; }
  };
  window._chargerNoteReelle('__OUTIL_ID__');`;

  return `<script type="module">
  import { getRatingSummary } from '${R}js/reviews.js';
  import { auth } from '${R}js/firebase-config.js';
  import { saveVideo, unsaveVideo, getSavedVideos } from '${R}js/firestore.js';
  import { onAuthStateChanged } from '${R}js/firebase-config.js';

  let _currentUser = null;
  let _savedVideoIds = new Set();

  onAuthStateChanged(auth, async (user) => {
    _currentUser = user;
    if (user) {
      const saved = await getSavedVideos(user.uid);
      _savedVideoIds = new Set(saved.map(v => v.videoId));
    } else { _savedVideoIds = new Set(); }
    window._refreshSaveBtns?.(); window._refreshSaveBtnsTuto?.();
  });
${noteFn}

  window._toggleSaveVideo = async function(btn, videoData) {
    if (!_currentUser) { window.location.href = '${R}profil.html'; return; }
    const uid = _currentUser.uid, videoId = videoData.videoId;
    const saving = !_savedVideoIds.has(videoId);
    btn.disabled = true;
    try {
      if (saving) { await saveVideo(uid, videoData); _savedVideoIds.add(videoId); btn.classList.add('saved'); btn.title='Retirer des vidéos sauvegardées'; }
      else { await unsaveVideo(uid, videoId); _savedVideoIds.delete(videoId); btn.classList.remove('saved'); btn.title='Sauvegarder cette vidéo'; }
    } catch (e) { console.error('[Albexia] save vidéo :', e); }
    btn.disabled = false;
  };

  window._refreshSaveBtns = window._refreshSaveBtnsTuto = function() {
    document.querySelectorAll('.btn-save-video[data-video-id]').forEach(btn => {
      const saved = _savedVideoIds.has(btn.dataset.videoId);
      btn.classList.toggle('saved', saved);
      btn.title = saved ? 'Retirer des vidéos sauvegardées' : 'Sauvegarder cette vidéo';
    });
  };
</script>`;
}

// ── Page vitrine : tutoriels/index.html (structure identique à l'ancien tutoriels.html) ──
function generateVideothequeHub(toolsAvecVideos) {
  const canonicalUrl = `${SITE_ORIGIN}/tutoriels/index.html`;
  const titleTag = `Tutoriels vidéo IA : apprendre ChatGPT, Midjourney et plus | Albexia`;
  const metaDesc = `Toute la vidéothèque Albexia : des tutoriels vidéo gratuits, en français, pour apprendre à utiliser les meilleurs outils IA.`;
  const totalVideos = toolsAvecVideos.reduce((s, t) => s + (t.videotheque||[]).length, 0);
  const cartesHTML = toolsAvecVideos.map(t => tutoCardHTML(t, toolsAvecVideos)).join('\n');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titleTag}</title>
  <meta name="description" content="${metaDesc}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${canonicalUrl}" />
  <meta property="og:title"       content="${titleTag}" />
  <meta property="og:description" content="${metaDesc}" />
  <meta property="og:type"        content="website" />
  <meta property="og:url"         content="${canonicalUrl}" />
  <script type="application/ld+json">
  { "@context": "https://schema.org", "@type": "CollectionPage", "name": "Tutoriels IA en vidéo – Albexia", "publisher": { "@type": "Organization", "name": "Albexia", "url": "${SITE_ORIGIN}" } }
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${R}css/style.css" />
</head>
<body>

${tutoNavHTML("","")}

<section class="tuto-hero">
  <div class="tuto-badge"><span class="pulse"></span>Vidéothèque francophone</div>
  <h1>Explorez le futur de l'IA<br>avec nos <span class="grad-pink">tutoriels experts</span></h1>
  <p>Plus de ${toolsAvecVideos.length} outils répertoriés et expliqués en vidéo par la communauté. Gratuit, en français, pour tous les niveaux.</p>
  <div class="tuto-hero-actions">
    <button class="btn-main" onclick="document.getElementById('tuto-grille').scrollIntoView({behavior:'smooth'})">Explorer les tutoriels</button>
    <button class="tuto-btn-hero-soumettre" onclick="ouvrirModalSoumission('','')">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      Soumettre un tutoriel
    </button>
  </div>
  <div id="tuto-hero-stats" class="tuto-hero-stats">
    <div class="tuto-stat"><span class="tuto-stat-n">${toolsAvecVideos.length}</span><span class="tuto-stat-l">Outils référencés</span></div>
    <div class="tuto-stat"><span class="tuto-stat-n">${totalVideos}</span><span class="tuto-stat-l">Tutoriels sélectionnés</span></div>
    <div class="tuto-stat"><span class="tuto-stat-n">100%</span><span class="tuto-stat-l">Accès gratuit</span></div>
  </div>
</section>

<div class="tuto-grille-wrap">
  <div id="tuto-grille" class="tuto-grille">
${cartesHTML}
  </div>
</div>

${tutoEditorialHTML()}
${tutoFaqHTML()}
${tutoPlayerModalHTML()}
${tutoSoumissionModalHTML(toolsAvecVideos)}

${tutoFooterHTML()}
${sharedJS()}
${tutoFirestoreModuleHTML('hub')}
<script src="${R}js/tutoriels.js"></script>
</body>
</html>`;
}

// ── Page dédiée : vidéothèque d'un outil (structure identique à tutoriel-outil.html) ──
function generateVideothequePage(tool, allToolsAvecVideo) {
  const info = toolVideothequeFolder(tool);
  if (!info) return null;
  const videos = tool.videotheque || [];
  if (!videos.length) return null;

  const { plan, langue, slug } = info;
  const toolId = String(tool.id || slug);
  const ficheUrl = `${R}tools/${plan}/${langue}/${slug}/`;
  const canonicalUrl = `${SITE_ORIGIN}/tools/${plan}/${langue}/${slug}/tutoriels/`;
  const titleTag = `Maîtrisez ${tool.name} : La vidéothèque complète | Albexia`;
  const metaDesc = `Tous les tutoriels vidéo pour apprendre et maîtriser ${tool.name}. ${videos.length} vidéos sélectionnées, filtrables par durée. Gratuit, en français.`;
  const videosHTML = videos.map(v => carteVideoHTML(v, tool)).join('');
  const tagsHTML = (tool.tags||[]).map(t => `<span class="tuto-tag">${t}</span>`).join('');

  // Module Firestore : injecte l'id réel de l'outil dans _chargerNoteReelle()
  const firestoreModule = tutoFirestoreModuleHTML('tool').replace('__OUTIL_ID__', toolId);

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${titleTag}</title>
  <meta name="description" content="${metaDesc}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="${canonicalUrl}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Albexia" />
  <meta property="og:title" content="${titleTag}" />
  <meta property="og:description" content="${metaDesc}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": ${JSON.stringify(`Tutoriels vidéo ${tool.name}`)},
    "itemListElement": [
${videos.map((v, i) => `      { "@type": "VideoObject", "position": ${i+1}, "name": ${JSON.stringify(v.titre)}, "thumbnailUrl": "https://img.youtube.com/vi/${v.youtube_id}/mqdefault.jpg", "embedUrl": "https://www.youtube.com/embed/${v.youtube_id}" }`).join(',\n')}
    ]
  }
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${R}css/style.css" />
</head>
<body>

${tutoNavHTML(toolId, tool.name)}

<div class="outil-breadcrumb">
  <a href="${R}index.html">Accueil</a>
  <span class="bc-sep">›</span>
  <a href="${R}tutoriels/index.html">Tutoriels</a>
  <span class="bc-sep">›</span>
  <span id="bc-outil">${tool.name}</span>
</div>

<section class="outil-hero">
  <a href="${ficheUrl}" id="lien-retour" class="outil-retour">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
    Voir la fiche complète de ${tool.name}
  </a>
  <div class="outil-hero-inner">
    <div class="outil-logo-wrap">
      <div id="outil-logo" class="outil-logo-grand" style="background:var(--bg3);color:var(--text);overflow:hidden;padding:0;">
        <img src="https://www.google.com/s2/favicons?sz=128&domain=${(tool.url||'').replace(/^https?:\/\//,'').split('/')[0]}" alt="${tool.name}" width="48" height="48" loading="lazy" style="display:block;" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${tool.emoji||'🤖'}'}))">
      </div>
    </div>
    <div class="outil-hero-infos">
      <div class="outil-hero-top">
        <span id="outil-cat" class="outil-cat-badge">${tool.category||''}</span>
        <span id="outil-count" class="outil-count-badge">${videos.length} tutoriel${videos.length>1?'s':''}</span>
      </div>
      <h1 id="outil-h1" class="outil-h1">Maîtrisez ${tool.name} : La vidéothèque complète</h1>
      <p id="outil-sous-titre" class="outil-sous-titre">${tool.description||''}</p>
      <div id="outil-note" class="outil-note"></div>
      <div id="outil-tags" class="tuto-card-tags" style="margin-top:14px;padding:0;">${tagsHTML}</div>
    </div>
  </div>
</section>

<div class="outil-filtres-wrap">
  <div class="outil-filtres-bar">
    <div class="filtres-groupe">
      <button id="filtre-tout" class="filtre-btn actif" onclick="setFiltreType('tout')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        Tout
      </button>
      <button id="filtre-video" class="filtre-btn" onclick="setFiltreType('video')">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
        Vidéos
      </button>
    </div>
    <div id="wrap-duree" class="filtres-duree-wrap" style="display:none;">
      <div class="duree-container">
        <button id="btn-duree-dropdown" class="filtre-btn filtre-btn-duree" onclick="toggleDureeDropdown()">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          <span id="btn-duree-label">Durée</span>
          <svg class="duree-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div id="duree-dropdown" class="duree-dropdown">
          <button class="duree-option actif" data-min="0" data-max="999999" onclick="setFiltreDuree(0,999999,this,'Tout')">Tout</button>
          <button class="duree-option" data-min="0" data-max="600" onclick="setFiltreDuree(0,600,this,'&lt; 10 min')">&lt; 10 min</button>
          <button class="duree-option" data-min="600" data-max="1200" onclick="setFiltreDuree(600,1200,this,'10 – 20 min')">10 – 20 min</button>
          <button class="duree-option" data-min="1200" data-max="1800" onclick="setFiltreDuree(1200,1800,this,'20 – 30 min')">20 – 30 min</button>
          <button class="duree-option" data-min="1800" data-max="2700" onclick="setFiltreDuree(1800,2700,this,'30 – 45 min')">30 – 45 min</button>
          <button class="duree-option" data-min="2700" data-max="3600" onclick="setFiltreDuree(2700,3600,this,'45 min – 1h')">45 min – 1h</button>
          <button class="duree-option" data-min="3600" data-max="999999" onclick="setFiltreDuree(3600,999999,this,'1h+')">1h+</button>
        </div>
      </div>
    </div>
    <span id="outil-video-count" class="filtres-count">${videos.length} résultat${videos.length>1?'s':''}</span>
    <button class="tuto-btn-soumettre filtre-soumettre" onclick="ouvrirModalSoumission('${toolId}','${tool.name.replace(/'/g,"&#39;")}')">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      Soumettre une vidéo
    </button>
  </div>
</div>

<div class="outil-grille-wrap">
  <div id="outil-video-grille" class="outil-video-grille">
${videosHTML}
  </div>
</div>

<section class="outil-cta-section">
  <div class="outil-cta-inner">
    <div class="outil-cta-ico">🎬</div>
    <h2 class="outil-cta-titre">Vous connaissez un excellent tutoriel&nbsp;?</h2>
    <p class="outil-cta-sub">Enrichissez la bibliothèque de la communauté francophone. Soumettez une vidéo et atteignez une audience ultra-ciblée.</p>
    <button class="btn-main" onclick="ouvrirModalSoumission('${toolId}','${tool.name.replace(/'/g,"&#39;")}')">Soumettre un tutoriel →</button>
  </div>
</section>

${tutoPlayerModalHTML()}
${tutoSoumissionModalHTML(allToolsAvecVideo)}

${tutoFooterHTML()}
${sharedJS()}
${firestoreModule}
<script src="${R}js/tutoriel-outil.js"></script>
</body>
</html>`;
}

// ════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════
async function main() {
  const state = loadState();
  const newState = { outils: {}, articles: {}, comparaisons: {}, niches: {}, videotheques: {}, glossaire: {} };

  console.log('📥 Lecture de Firestore (outils)...');
  const snap  = await db.collection('outils').get();
  const tools = snap.docs.map(d => d.data());
  console.log(`✓ ${tools.length} documents trouvés`);

  let generated = 0, skipped = 0, noFiche = 0, unchanged = 0;
  const changedToolIds = new Set(); // pour la cascade vers comparaisons

  for (const tool of tools) {
    const toolHash = hashDoc(tool);
    const toolId   = String(tool.id || slugify(tool.name));
    newState.outils[toolId] = { hash: toolHash, updatedAtMs: updatedAtMs(tool) };

    const previousHash = state.outils?.[toolId]?.hash;
    const hasChanged = previousHash !== toolHash;
    if (hasChanged) changedToolIds.add(toolId);

    // Toggle générer_fiche
    if (tool.generer_fiche === false) { noFiche++; continue; }

    const plan   = tool.plan || '';
    const langue = tool.langue || 'fr';
    const slug   = slugify(tool.name);
    if (!slug) { skipped++; continue; }

    let folder;
    if (plan === 'featured') folder = path.join('tools', 'featured', langue, slug);
    else if (plan === 'starter') folder = path.join('tools', 'starter', langue, slug);
    else folder = path.join('tools', 'standard', langue, slug);

    const filePath = path.join(folder, 'index.html');

    // Skip l'écriture si rien n'a changé ET le fichier existe déjà sur disque
    // (le fichier peut manquer après un nettoyage manuel ou un premier run partiel).
    if (!hasChanged && fs.existsSync(filePath)) { unchanged++; continue; }

    let html;
    if (tool.status === 'offline')     html = generateOfflineTakeover(tool, tools);
    else if (plan === 'featured')      html = generateFeatured(tool, tools);
    else if (plan === 'starter')       html = generateStarter(tool, tools);
    else                                html = generateStandard(tool, tools);

    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(filePath, html, 'utf8');
    generated++;

    if (generated % 50 === 0) console.log(`  → ${generated} fiches générées...`);
  }

  console.log(`\n✅ Outils — ${generated} régénérée(s), ${unchanged} inchangée(s) (skip), ${noFiche} ignorée(s) (generer_fiche=false), ${skipped} slug vide(s).`);
  console.log(`\nStructure :`);
  console.log(`  tools/featured/fr/{slug}/index.html`);
  console.log(`  tools/featured/en/{slug}/index.html`);
  console.log(`  tools/featured/es/{slug}/index.html`);
  console.log(`  tools/starter/{langue}/{slug}/index.html`);
  console.log(`  tools/standard/{langue}/{slug}/index.html`);

  // ─── NETTOYAGE DES FICHES OUTILS ORPHELINES ───
  console.log(`\n🧹 Nettoyage des fiches outils orphelines...`);

  const validToolPaths = new Set();
  for (const tool of tools) {
    if (tool.generer_fiche === false) continue;
    const plan   = tool.plan === 'featured' ? 'featured' : tool.plan === 'starter' ? 'starter' : 'standard';
    const langue = tool.langue || 'fr';
    const slug   = slugify(tool.name);
    if (!slug) continue;
    validToolPaths.add(path.join('tools', plan, langue, slug));
  }

  let removedTools = 0;
  for (const plan of ['featured', 'starter', 'standard']) {
    const planDir = path.join('tools', plan);
    if (!fs.existsSync(planDir)) continue;
    for (const langue of fs.readdirSync(planDir)) {
      const langueDir = path.join(planDir, langue);
      if (!fs.statSync(langueDir).isDirectory()) continue;
      for (const slugDir of fs.readdirSync(langueDir)) {
        const fullPath = path.join(langueDir, slugDir);
        if (!fs.statSync(fullPath).isDirectory()) continue;
        if (!validToolPaths.has(fullPath)) {
          fs.rmSync(fullPath, { recursive: true, force: true });
          console.log(`  🗑️  Supprimé : ${fullPath}`);
          removedTools++;
        }
      }
    }
  }
  console.log(`✓ ${removedTools} dossier(s) outil orphelin(s) supprimé(s).`);

  // ════════════════════════════════════════════════════════════
  // VIDÉOTHÈQUE (tutoriels vidéo — indépendant des plans)
  // ════════════════════════════════════════════════════════════
  console.log(`\n🎬 Génération des pages vidéothèque...`);

  let vtGenerated = 0, vtUnchanged = 0, vtSkipped = 0;
  const toolsAvecVideos = [];

  // Passe 1 — collecter tous les outils avec vidéothèque AVANT de générer quoi
  // que ce soit, pour que le <select> du modal soumission liste la bonne liste
  // complète sur chaque page (pas seulement les outils déjà traités dans la boucle).
  for (const tool of tools) {
    const videos = tool.videotheque || [];
    if (!videos.length) continue;
    if (tool.generer_fiche === false) continue;
    if (!toolVideothequeFolder(tool)) continue;
    toolsAvecVideos.push(tool);
  }

  // Passe 2 — générer les pages
  for (const tool of toolsAvecVideos) {
    const toolId = String(tool.id || slugify(tool.name));
    const info = toolVideothequeFolder(tool);

    newState.videotheques[toolId] = { hash: hashDoc(tool), updatedAtMs: updatedAtMs(tool) };

    const hasChanged = changedToolIds.has(toolId);
    const filePath = path.join(info.folder, 'index.html');

    if (!hasChanged && fs.existsSync(filePath)) { vtUnchanged++; continue; }

    const html = generateVideothequePage(tool, toolsAvecVideos);
    if (!html) { vtSkipped++; continue; }

    fs.mkdirSync(info.folder, { recursive: true });
    fs.writeFileSync(filePath, html, 'utf8');
    vtGenerated++;
  }

  console.log(`✅ Vidéothèques outil — ${vtGenerated} régénérée(s), ${vtUnchanged} inchangée(s) (skip), ${vtSkipped} ignorée(s).`);
  console.log(`  tools/{plan}/{langue}/{slug}/tutoriels/index.html`);

  // ── Page vitrine (hub) — un seul fichier, régénéré à chaque run ──
  // Coût négligeable (une seule écriture) et évite de suivre un hash
  // séparé rien que pour la liste agrégée des outils avec vidéothèque.
  const toolsAvecVideosUniques = deduplicateParNom(toolsAvecVideos)
    .sort((a, b) => (b.videotheque||[]).length - (a.videotheque||[]).length);

  fs.mkdirSync('tutoriels', { recursive: true });
  fs.writeFileSync(path.join('tutoriels', 'index.html'), generateVideothequeHub(toolsAvecVideosUniques), 'utf8');
  console.log(`✅ Page vitrine — tutoriels/index.html (${toolsAvecVideosUniques.length} outils, régénérée à chaque run).`);

  // ── Nettoyage des vidéothèques orphelines (outil supprimé ou vidéos retirées) ──
  const validVideothequePaths = new Set(toolsAvecVideos.map(t => toolVideothequeFolder(t)?.folder).filter(Boolean));
  let removedVideotheques = 0;
  for (const plan of ['featured', 'starter', 'standard']) {
    const planDir = path.join('tools', plan);
    if (!fs.existsSync(planDir)) continue;
    for (const langue of fs.readdirSync(planDir)) {
      const langueDir = path.join(planDir, langue);
      if (!fs.statSync(langueDir).isDirectory()) continue;
      for (const slugDir of fs.readdirSync(langueDir)) {
        const tutorielsDir = path.join(langueDir, slugDir, 'tutoriels');
        if (!fs.existsSync(tutorielsDir)) continue;
        if (!validVideothequePaths.has(tutorielsDir)) {
          fs.rmSync(tutorielsDir, { recursive: true, force: true });
          console.log(`  🗑️  Supprimé : ${tutorielsDir}`);
          removedVideotheques++;
        }
      }
    }
  }
  console.log(`✓ ${removedVideotheques} vidéothèque(s) orpheline(s) ou vidée(s) supprimée(s).`);

  // ════════════════════════════════════════════════════════════
  // ARTICLES (blog)
  // ════════════════════════════════════════════════════════════
  console.log(`\n📥 Lecture de Firestore (articles)...`);
  const articlesSnap = await db.collection('articles').get();
  const articles = articlesSnap.docs.map(d => d.data());
  console.log(`✓ ${articles.length} documents trouvés`);

  let articlesGenerated = 0, articlesSkippedNoSlug = 0, articlesSkippedNoCorps = 0, articlesUnchanged = 0;

  for (const article of articles) {
    const articleHash = hashDoc(article);
    const articleId    = String(article.id || article.slug);
    newState.articles[articleId] = { hash: articleHash, updatedAtMs: updatedAtMs(article) };
    const hasChanged = state.articles?.[articleId]?.hash !== articleHash;

    const langue = article.langue || 'fr';
    const slug   = article.slug || slugify(article.title);

    if (!slug) { articlesSkippedNoSlug++; continue; }
    // Un article sans corps_html ne doit jamais être publié : ça produirait
    // une page quasi vide, mauvaise pour le SEO et l'expérience utilisateur.
    // (C'est le cas typique juste après la migration depuis blog.json.)
    if (!article.corps_html || !article.corps_html.trim()) { articlesSkippedNoCorps++; continue; }

    const folder   = path.join('articles', langue, slug);
    const filePath = path.join(folder, 'index.html');

    if (!hasChanged && fs.existsSync(filePath)) { articlesUnchanged++; continue; }

    const html = generateArticle(article, articles);
    if (!html) { articlesSkippedNoSlug++; continue; }

    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(filePath, html, 'utf8');
    articlesGenerated++;
  }

  console.log(`\n✅ Articles — ${articlesGenerated} régénéré(s), ${articlesUnchanged} inchangé(s) (skip), ${articlesSkippedNoCorps} ignoré(s) (corps_html vide), ${articlesSkippedNoSlug} slug vide.`);
  console.log(`\nStructure :`);
  console.log(`  articles/fr/{slug}/index.html`);
  console.log(`  articles/en/{slug}/index.html`);
  console.log(`  articles/es/{slug}/index.html`);

  // ════════════════════════════════════════════════════════════
  //  ARTICLES CRÉATEURS (revendication + rédaction, voir schéma dédié)
  // ════════════════════════════════════════════════════════════
  console.log(`\n📥 Lecture de Firestore (articles_createurs)...`);
  const articlesCreateursSnap = await db.collection('articles_createurs')
    .where('statut', '==', 'publie')
    .get();
  const articlesCreateurs = articlesCreateursSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`✓ ${articlesCreateurs.length} article(s) créateur(s) publié(s)`);

  // outilsMap : nom, dossier de plan et url officielle par slug — cette
  // dernière sert au fallback automatique og:image (voir recupererOgImage)
  // quand le créateur n'a pas fourni de bannière manuelle.
  const outilsMap = new Map(
    tools.map(o => [o.slug, {
      nom: o.nom,
      dossierPlan: o.plan === 'featured' ? 'featured' : o.plan === 'starter' ? 'starter' : 'standard',
      url_outil: o.url || ''
    }])
  );

  let articlesCreateursGeneres = 0;
  for (const article of articlesCreateurs) {
    // await ici est volontaire : la boucle reste séquentielle plutôt que
    // Promise.all, pour ne jamais envoyer plusieurs requêtes simultanées
    // vers des sites tiers pendant le build (poli envers leurs serveurs,
    // et plus facile à débugger si un site bloque le run).
    const html = await generateArticleCreateur(article, outilsMap);
    if (!html) continue;

    const slugBase = slugify(article.titre);
    const slug = `${slugBase}-${String(article.id).slice(0, 6)}`;
    const folder = path.join('articles', 'fr', slug);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, 'index.html'), html, 'utf8');
    articlesCreateursGeneres++;
  }
  console.log(`✅ Articles créateurs — ${articlesCreateursGeneres} généré(s).`);

  // ─── NETTOYAGE DES ARTICLES ORPHELINS ───
  console.log(`\n🧹 Nettoyage des articles orphelins...`);

  const validArticlePaths = new Set();
  for (const article of articles) {
    const langue = article.langue || 'fr';
    const slug   = article.slug || slugify(article.title);
    if (!slug || !article.corps_html || !article.corps_html.trim()) continue;
    validArticlePaths.add(path.join('articles', langue, slug));
  }
  // Les articles créateurs vivent dans le même dossier articles/{langue}/{slug}/
  // mais viennent d'une collection Firestore séparée (articles_createurs) —
  // sans cette ligne, le nettoyage ci-dessous les traite comme orphelins
  // et les supprime juste après les avoir générés.
  for (const article of articlesCreateurs) {
    const slugBase = slugify(article.titre);
    const slug = `${slugBase}-${String(article.id).slice(0, 6)}`;
    validArticlePaths.add(path.join('articles', 'fr', slug));
  }

  let removedArticles = 0;
  if (fs.existsSync('articles')) {
    for (const langue of fs.readdirSync('articles')) {
      const langueDir = path.join('articles', langue);
      if (!fs.statSync(langueDir).isDirectory()) continue;
      for (const slugDir of fs.readdirSync(langueDir)) {
        const fullPath = path.join(langueDir, slugDir);
        if (!fs.statSync(fullPath).isDirectory()) continue;
        if (!validArticlePaths.has(fullPath)) {
          fs.rmSync(fullPath, { recursive: true, force: true });
          console.log(`  🗑️  Supprimé : ${fullPath}`);
          removedArticles++;
        }
      }
    }
  }
  console.log(`✓ ${removedArticles} dossier(s) article orphelin(s) supprimé(s).`);

  // ════════════════════════════════════════════════════════════
  // COMPARATEUR (X vs Y)
  // ════════════════════════════════════════════════════════════
  console.log(`\n📥 Lecture de Firestore (comparaisons)...`);
  const comparaisonsSnap = await db.collection('comparaisons').get();
  const comparaisons = comparaisonsSnap.docs.map(d => d.data());
  console.log(`✓ ${comparaisons.length} documents trouvés`);

  let compGenerated = 0, compSkippedNoSlug = 0, compUnchanged = 0, compCascade = 0;

  for (const comp of comparaisons) {
    const compHash = hashDoc(comp);
    const compId   = String(comp.id || comp.slug);
    newState.comparaisons[compId] = { hash: compHash, updatedAtMs: updatedAtMs(comp) };

    const ownHasChanged = state.comparaisons?.[compId]?.hash !== compHash;

    // Cascade : régénérer aussi si l'un des deux outils référencés a changé,
    // pour que note/prix/logo affichés restent synchronisés avec "outils".
    const refA = comp.outil_a_slug;
    const refB = comp.outil_b_slug;
    const referencedToolChanged =
      (refA && changedToolIds.has(refA)) ||
      (refB && changedToolIds.has(refB)) ||
      // Fallback : si les IDs Firestore des outils diffèrent des slugs
      // (selon comment "id" est stocké), on vérifie aussi par nom résolu.
      tools.some(t => (slugify(t.name) === refA || slugify(t.name) === refB)
                    && changedToolIds.has(String(t.id || slugify(t.name))));

    const hasChanged = ownHasChanged || referencedToolChanged;
    if (!ownHasChanged && referencedToolChanged) compCascade++;

    const slug = comp.slug;
    if (!slug) { compSkippedNoSlug++; continue; }

    const folder   = path.join('comparateur', slug);
    const filePath = path.join(folder, 'index.html');

    if (!hasChanged && fs.existsSync(filePath)) { compUnchanged++; continue; }

    const html = generateComparaison(comp, tools, comparaisons);
    if (!html) { compSkippedNoSlug++; continue; }

    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(filePath, html, 'utf8');
    compGenerated++;
  }

  console.log(`\n✅ Comparateur — ${compGenerated} régénérée(s) (dont ${compCascade} via cascade outil modifié), ${compUnchanged} inchangée(s) (skip), ${compSkippedNoSlug} ignorée(s) (slug vide).`);
  console.log(`\nStructure :`);
  console.log(`  comparateur/{slug}/index.html`);

  // ─── NETTOYAGE DES COMPARAISONS ORPHELINES ───
  console.log(`\n🧹 Nettoyage des pages comparateur orphelines...`);

  const validComparaisonPaths = new Set();
  for (const comp of comparaisons) {
    if (!comp.slug) continue;
    validComparaisonPaths.add(path.join('comparateur', comp.slug));
  }

  let removedComparaisons = 0;
  if (fs.existsSync('comparateur')) {
    for (const slugDir of fs.readdirSync('comparateur')) {
      if (slugDir === 'page') continue; // dossier de pagination, pas une comparaison
      const fullPath = path.join('comparateur', slugDir);
      if (!fs.statSync(fullPath).isDirectory()) continue;
      if (!validComparaisonPaths.has(fullPath)) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log(`  🗑️  Supprimé : ${fullPath}`);
        removedComparaisons++;
      }
    }
  }
  console.log(`✓ ${removedComparaisons} dossier(s) comparateur orphelin(s) supprimé(s).`);

  // ════════════════════════════════════════════════════════════
  // COMPARATEUR — PAGE LISTING PAGINÉE (comparateur/index.html)
  // ════════════════════════════════════════════════════════════
  // Régénérée si : une comparaison a été ajoutée/modifiée/supprimée
  // (le nombre total ou le hash de l'ensemble a changé), ou si le
  // nombre de pages change suite à ça. On la reconstruit entièrement
  // à chaque fois qu'un changement est détecté côté comparaisons —
  // c'est une liste globale, pas un doc individuel qu'on peut hasher
  // isolément de la même façon.
  const comparaisonsValides = comparaisons.filter(c => c.slug);
  // Tri : plus récentes en premier (fallback ordre Firestore si pas de updatedAt)
  const comparaisonsTriees = [...comparaisonsValides].sort((a, b) => updatedAtMs(b) - updatedAtMs(a));
  const totalPages = Math.max(1, Math.ceil(comparaisonsTriees.length / COMPARATEUR_PAR_PAGE));

  // Détection de changement au niveau de la liste : le run a-t-il généré,
  // supprimé, ou fait cascader au moins une comparaison ? Ou bien un outil
  // a-t-il changé (TOOLS_DATA, embarqué dans cette page pour le picker
  // interactif, dépend de TOUS les outils FR, pas seulement ceux référencés
  // par une comparaison) ? Si l'une de ces conditions est vraie, la page
  // doit être reconstruite.
  const listeAChange = compGenerated > 0 || removedComparaisons > 0 || changedToolIds.size > 0;
  const indexExists = fs.existsSync(path.join('comparateur', 'index.html'));

  let listPagesGenerated = 0;
  if (listeAChange || !indexExists) {
    for (let p = 1; p <= totalPages; p++) {
      const html = generateComparateurIndexPage(comparaisonsTriees, tools, p, totalPages);
      const folder = p === 1 ? 'comparateur' : path.join('comparateur', 'page', String(p));
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(path.join(folder, 'index.html'), html, 'utf8');
      listPagesGenerated++;
    }
    console.log(`\n✅ Page listing comparateur — ${listPagesGenerated} page(s) générée(s) (${comparaisonsTriees.length} comparaisons, ${totalPages} page(s) au total).`);
  } else {
    console.log(`\n✅ Page listing comparateur — inchangée, régénération non nécessaire.`);
  }

  // ─── NETTOYAGE DES PAGES DE PAGINATION EXCÉDENTAIRES ───
  // Si le nombre de comparaisons diminue, il faut supprimer les anciennes
  // pages de pagination devenues excédentaires (ex: on avait 3 pages, il
  // n'en faut plus que 2 → comparateur/page/3/ doit disparaître).
  const pageDir = path.join('comparateur', 'page');
  let removedPages = 0;
  if (fs.existsSync(pageDir)) {
    for (const pDir of fs.readdirSync(pageDir)) {
      const pNum = Number(pDir);
      const fullPath = path.join(pageDir, pDir);
      if (!fs.statSync(fullPath).isDirectory()) continue;
      if (isNaN(pNum) || pNum > totalPages || pNum < 2) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log(`  🗑️  Page de pagination excédentaire supprimée : ${fullPath}`);
        removedPages++;
      }
    }
  }
  if (removedPages > 0) console.log(`✓ ${removedPages} page(s) de pagination excédentaire(s) supprimée(s).`);

  // ─── REDIRECTION DEPUIS L'ANCIEN CHEMIN tools/comparateur.html ───
  // L'ancienne page (fetch JS runtime) est remplacée par la génération
  // statique ci-dessus. On garde un fichier de redirection à l'ancien
  // chemin pour ne pas casser les liens externes/backlinks existants.
  const redirectFolder = 'tools';
  fs.mkdirSync(redirectFolder, { recursive: true });
  fs.writeFileSync(path.join(redirectFolder, 'comparateur.html'), `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Redirection — Comparateur | Albexia</title>
  <meta name="robots" content="noindex, follow" />
  <link rel="canonical" href="${SITE_ORIGIN}/comparateur/index.html" />
  <meta http-equiv="refresh" content="0; url=${R}comparateur/index.html" />
  <script>window.location.replace('${R}comparateur/index.html');</script>
</head>
<body>
  <p>Cette page a été déplacée. Si vous n'êtes pas redirigé automatiquement,
  <a href="${R}comparateur/index.html">cliquez ici</a>.</p>
</body>
</html>`, 'utf8');
  console.log(`\n↪️  Redirection tools/comparateur.html → comparateur/index.html écrite.`);

  // ════════════════════════════════════════════════════════════
  // NICHES (micro-niches SEO par métier)
  // ════════════════════════════════════════════════════════════
  // Seules les niches status==='publie' génèrent une page HTML publique —
  // un brouillon reste en Firestore, visible dans l'admin, mais jamais
  // exposé publiquement tant qu'il n'est pas validé.
  console.log(`\n📥 Lecture de Firestore (niches)...`);
  const nichesSnap = await db.collection('niches').get();
  const niches = nichesSnap.docs.map(d => d.data());
  console.log(`✓ ${niches.length} documents trouvés`);

  // Calculé une seule fois pour tout le run (pas par niche) : les pages
  // niches veulent une seule entrée par outil, jamais les 3 variantes de
  // langue — contrairement à la boucle "tools" plus haut qui, elle, a
  // justement besoin de chaque variante pour générer une fiche par langue.
  const toolsUniques = deduplicateParNom(tools);

  let nichesGenerated = 0, nichesSkippedNoSlug = 0, nichesSkippedBrouillon = 0, nichesUnchanged = 0, nichesCascade = 0;

  for (const niche of niches) {
    const nicheHash = hashDoc(niche);
    const nicheId   = String(niche.id || niche.slug);
    newState.niches[nicheId] = { hash: nicheHash, updatedAtMs: updatedAtMs(niche) };

    const ownHasChanged = state.niches?.[nicheId]?.hash !== nicheHash;

    // Cascade : régénérer aussi si l'un des outils référencés a changé
    // (note, favicon, etc.), même si la niche elle-même n'a pas bougé —
    // même logique que pour le comparateur.
    const outilsRefs = niche.outils_slugs || [];
    const referencedToolChanged = outilsRefs.some(slugRef =>
      changedToolIds.has(slugRef) ||
      tools.some(t => slugify(t.name) === slugRef && changedToolIds.has(String(t.id || slugify(t.name))))
    );

    const hasChanged = ownHasChanged || referencedToolChanged;

    const slug = niche.slug;
    if (!slug) { nichesSkippedNoSlug++; continue; }

    const folder   = path.join('niches', slug);
    const filePath = path.join(folder, 'index.html');

    if (niche.status !== 'publie') {
      nichesSkippedBrouillon++;
      // Un brouillon qui a été DÉPUBLIÉ (existait publié avant, repassé en
      // brouillon) doit voir sa page retirée — pas seulement les nouveaux
      // brouillons jamais publiés. On laisse le nettoyage orphelin plus bas
      // s'en charger, puisqu'un brouillon n'est jamais dans validNichePaths.
      continue;
    }

    // Comptée seulement ici (après le filtre brouillon) pour que le nombre
    // reflète des pages RÉELLEMENT régénérées par cascade, pas des niches
    // brouillon qui référencent aussi un outil modifié sans jamais publier.
    if (!ownHasChanged && referencedToolChanged) nichesCascade++;

    if (!hasChanged && fs.existsSync(filePath)) { nichesUnchanged++; continue; }

    const html = generateNichePage(niche, toolsUniques, niches);
    if (!html) { nichesSkippedNoSlug++; continue; }

    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(filePath, html, 'utf8');
    nichesGenerated++;
  }

  console.log(`\n✅ Niches — ${nichesGenerated} régénérée(s) (dont ${nichesCascade} via cascade outil modifié), ${nichesUnchanged} inchangée(s) (skip), ${nichesSkippedBrouillon} en brouillon (non générées), ${nichesSkippedNoSlug} ignorée(s) (slug vide).`);
  console.log(`\nStructure :`);
  console.log(`  niches/{slug}/index.html`);

  // ─── NETTOYAGE DES NICHES ORPHELINES OU DÉPUBLIÉES ───
  console.log(`\n🧹 Nettoyage des pages niches orphelines ou dépubliées...`);

  const validNichePaths = new Set();
  for (const niche of niches) {
    if (!niche.slug || niche.status !== 'publie') continue;
    validNichePaths.add(path.join('niches', niche.slug));
  }

  let removedNiches = 0;
  if (fs.existsSync('niches')) {
    for (const slugDir of fs.readdirSync('niches')) {
      const fullPath = path.join('niches', slugDir);
      if (!fs.statSync(fullPath).isDirectory()) continue;
      if (!validNichePaths.has(fullPath)) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log(`  🗑️  Supprimé : ${fullPath}`);
        removedNiches++;
      }
    }
  }
  console.log(`✓ ${removedNiches} dossier(s) niche orphelin(s) ou dépublié(s) supprimé(s).`);

  // ════════════════════════════════════════════════════════════
  // GLOSSAIRE IA
  // ════════════════════════════════════════════════════════════
  // Comme les niches : seuls les termes status==='publie' génèrent une
  // page HTML publique. Un terme en brouillon reste visible dans le hub
  // (grille A-Z complète, cohérence pédagogique) mais sous forme de carte
  // NON cliquable — pas de lien vers une page qui n'existe pas.
  console.log(`\n📥 Lecture de Firestore (glossaire)...`);
  const glossaireSnap = await db.collection('glossaire').get();
  const termesGlossaire = glossaireSnap.docs.map(d => d.data());
  console.log(`✓ ${termesGlossaire.length} documents trouvés`);

  let glossGenerated = 0, glossSkippedNoSlug = 0, glossSkippedBrouillon = 0, glossUnchanged = 0, glossCascade = 0;
  let glossaireAnyChange = false;

  for (const terme of termesGlossaire) {
    const termeHash = hashDoc(terme);
    const termeId = String(terme.id || terme.slug);
    newState.glossaire[termeId] = { hash: termeHash, updatedAtMs: updatedAtMs(terme) };

    const ownHasChanged = state.glossaire?.[termeId]?.hash !== termeHash;

    const outilsRefs = terme.outils || [];
    const referencedToolChanged = outilsRefs.some(slugRef =>
      changedToolIds.has(slugRef) ||
      tools.some(t => slugify(t.name) === slugRef && changedToolIds.has(String(t.id || slugify(t.name))))
    );

    const hasChanged = ownHasChanged || referencedToolChanged;
    if (hasChanged) glossaireAnyChange = true;

    const slug = terme.slug;
    if (!slug) { glossSkippedNoSlug++; continue; }

    const folder   = path.join('glossaire', slug);
    const filePath = path.join(folder, 'index.html');

    if (terme.status !== 'publie') {
      glossSkippedBrouillon++;
      continue; // le nettoyage orphelin plus bas retire la page si dépublié
    }

    if (!ownHasChanged && referencedToolChanged) glossCascade++;

    if (!hasChanged && fs.existsSync(filePath)) { glossUnchanged++; continue; }

    const html = generateGlossaireTermePage(terme, toolsUniques, termesGlossaire);
    if (!html) { glossSkippedNoSlug++; continue; }

    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(filePath, html, 'utf8');
    glossGenerated++;
  }

  console.log(`\n✅ Glossaire — ${glossGenerated} régénéré(s) (dont ${glossCascade} via cascade outil modifié), ${glossUnchanged} inchangé(s) (skip), ${glossSkippedBrouillon} en brouillon (non générés), ${glossSkippedNoSlug} ignoré(s) (slug vide).`);
  console.log(`\nStructure :`);
  console.log(`  glossaire/{slug}/index.html`);
  console.log(`  glossaire/index.html (hub)`);

  // ─── NETTOYAGE DES PAGES GLOSSAIRE ORPHELINES OU DÉPUBLIÉES ───
  console.log(`\n🧹 Nettoyage des pages glossaire orphelines ou dépubliées...`);
  const validGlossairePaths = new Set();
  for (const terme of termesGlossaire) {
    if (!terme.slug || terme.status !== 'publie') continue;
    validGlossairePaths.add(path.join('glossaire', terme.slug));
  }
  let removedGlossaire = 0;
  if (fs.existsSync('glossaire')) {
    for (const slugDir of fs.readdirSync('glossaire')) {
      const fullPath = path.join('glossaire', slugDir);
      if (!fs.statSync(fullPath).isDirectory()) continue;
      if (!validGlossairePaths.has(fullPath)) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log(`  🗑️  Supprimé : ${fullPath}`);
        removedGlossaire++;
      }
    }
  }
  console.log(`✓ ${removedGlossaire} dossier(s) glossaire orphelin(s) ou dépublié(s) supprimé(s).`);

  // ─── HUB GLOSSAIRE (grille A-Z, tous statuts) ───
  const hubPath = path.join('glossaire', 'index.html');
  if (glossaireAnyChange || removedGlossaire > 0 || !fs.existsSync(hubPath)) {
    const hubHtml = generateGlossaireHub(termesGlossaire.filter(t => t.slug), toolsUniques);
    fs.mkdirSync('glossaire', { recursive: true });
    fs.writeFileSync(hubPath, hubHtml, 'utf8');
    console.log(`✅ Hub glossaire régénéré.`);
  } else {
    console.log(`✅ Hub glossaire — inchangé, régénération non nécessaire.`);
  }

  // ─── SAUVEGARDE DE L'ÉTAT DE GÉNÉRATION ───
  // newState ne contient que les docs actuellement en base : un doc supprimé
  // de Firestore disparaît automatiquement de l'état au prochain run.
  saveState(newState);
  console.log(`\n💾 État de génération sauvegardé dans ${STATE_PATH} (à committer avec le reste).`);
}

main().catch(err => { console.error('❌ Erreur:', err); process.exit(1); });
