// ═══════════════════════════════════════════════════════════
// categorie-template.js
// Genere les pages categorie statiques, une par langue :
//   /categorie/{langue}/{slug}/index.html
// (meme schema que /tools/{plan}/{langue}/{slug}/ et /articles/{langue}/{slug}/)
//
// N'a AUCUNE logique dupliquee de nav/footer/SEO — tout est injecte
// depuis gen-fiches.js (navHTML, footerHTML, seoHeadTags, R, SITE_ORIGIN,
// slugify, escHtml existent deja la-bas et sont la source unique de verite
// pour le rendu commun a toutes les pages du site).
//
// Usage prevu depuis gen-fiches.js, dans main() :
//
//   const { genererPagesCategories } = require('./categorie-template.js');
//   genererPagesCategories(toolsUniques, {
//     navHTML, footerHTML, seoHeadTags, R, SITE_ORIGIN, slugify, escHtml,
//   });
//
// ═══════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

// Icone + couleur d'accent par categorie (cle = valeur canonique de
// t.category en base, toujours en francais quelle que soit la langue
// de la page). '_default' sert de repli pour toute categorie ajoutee
// cote admin sans mise a jour de cette table.
const CATEGORY_META = {
  Juridique:       { icon: '⚖️', color: '#6c63ff' },
  Marketing:       { icon: '📣', color: '#ff6b9d' },
  SEO:             { icon: '🔍', color: '#6c63ff' },
  Contenu:         { icon: '✍️', color: '#00d4aa' },
  Code:            { icon: '💻', color: '#6c63ff' },
  'Design 3D':     { icon: '🧊', color: '#ff6b9d' },
  Automatisation:  { icon: '⚡', color: '#f5a623' },
  Recherche:       { icon: '🧠', color: '#00d4aa' },
  Vidéo:           { icon: '🎬', color: '#ff6b9d' },
  Productivité:    { icon: '🚀', color: '#f5a623' },
  Texte:           { icon: '📝', color: '#6c63ff' },
  Image:           { icon: '🎨', color: '#ff6b9d' },
  Musique:         { icon: '🎵', color: '#00d4aa' },
  Audio:           { icon: '🎧', color: '#00d4aa' },
  _default:        { icon: '✨', color: '#6c63ff' },
};

// Le SLUG reste toujours derive du nom francais canonique, quelle que
// soit la langue de la page (/categorie/en/juridique/, pas /categorie/en/legal/).
// Ca evite d'avoir a maintenir un slug par langue en plus du nom par langue,
// et garde la correspondance slug <-> categorie triviale a retrouver.
//
// Nom affiche + description, eux, sont traduits. Traductions redigees par
// Claude — a relire/ajuster, ce ne sont pas des donnees extraites de Firestore.
const CATEGORY_I18N = {
  Juridique: {
    fr: { name: 'Juridique', desc: "Outils IA pour la recherche juridique, l'analyse de contrats et la conformité." },
    en: { name: 'Legal',     desc: "AI tools for legal research, contract analysis and compliance." },
    es: { name: 'Legal',     desc: "Herramientas de IA para investigación jurídica, análisis de contratos y cumplimiento normativo." },
  },
  Marketing: {
    fr: { name: 'Marketing', desc: "Outils IA pour automatiser vos campagnes et personnaliser vos contenus marketing." },
    en: { name: 'Marketing', desc: "AI tools to automate your campaigns and personalize your marketing content." },
    es: { name: 'Marketing', desc: "Herramientas de IA para automatizar tus campañas y personalizar tu contenido de marketing." },
  },
  SEO: {
    fr: { name: 'SEO', desc: "Découvrez les meilleurs outils d'intelligence artificielle pour améliorer votre référencement, analyser vos mots-clés, optimiser votre contenu et booster votre visibilité sur les moteurs de recherche." },
    en: { name: 'SEO', desc: "Discover the best AI tools to improve your search rankings, analyze keywords, optimize your content and boost your visibility on search engines." },
    es: { name: 'SEO', desc: "Descubre las mejores herramientas de IA para mejorar tu posicionamiento, analizar palabras clave, optimizar tu contenido e impulsar tu visibilidad en los motores de búsqueda." },
  },
  Contenu: {
    fr: { name: 'Contenu', desc: "Outils IA pour générer et éditer du texte, des visuels et des vidéos." },
    en: { name: 'Content', desc: "AI tools to generate and edit text, visuals and videos." },
    es: { name: 'Contenido', desc: "Herramientas de IA para generar y editar texto, imágenes y vídeos." },
  },
  Code: {
    fr: { name: 'Code', desc: "Outils IA pour écrire, corriger et accélérer le développement logiciel." },
    en: { name: 'Code', desc: "AI tools to write, fix and speed up software development." },
    es: { name: 'Código', desc: "Herramientas de IA para escribir, corregir y acelerar el desarrollo de software." },
  },
  'Design 3D': {
    fr: { name: 'Design 3D', desc: "Outils IA pour créer des visuels, modèles et rendus 3D." },
    en: { name: '3D Design', desc: "AI tools to create 3D visuals, models and renders." },
    es: { name: 'Diseño 3D', desc: "Herramientas de IA para crear visuales, modelos y renders 3D." },
  },
  Automatisation: {
    fr: { name: 'Automatisation', desc: "Outils IA pour connecter vos applications et automatiser vos workflows." },
    en: { name: 'Automation', desc: "AI tools to connect your apps and automate your workflows." },
    es: { name: 'Automatización', desc: "Herramientas de IA para conectar tus aplicaciones y automatizar tus flujos de trabajo." },
  },
  Recherche: {
    fr: { name: 'Recherche', desc: "Outils IA pour explorer, synthétiser et vérifier l'information." },
    en: { name: 'Research', desc: "AI tools to explore, summarize and verify information." },
    es: { name: 'Investigación', desc: "Herramientas de IA para explorar, resumir y verificar información." },
  },
  Vidéo: {
    fr: { name: 'Vidéo', desc: "Outils IA pour générer, monter et éditer des vidéos." },
    en: { name: 'Video', desc: "AI tools to generate, edit and produce videos." },
    es: { name: 'Vídeo', desc: "Herramientas de IA para generar, montar y editar vídeos." },
  },
  Productivité: {
    fr: { name: 'Productivité', desc: "Outils IA pour gagner du temps sur vos tâches quotidiennes." },
    en: { name: 'Productivity', desc: "AI tools to save time on your everyday tasks." },
    es: { name: 'Productividad', desc: "Herramientas de IA para ahorrar tiempo en tus tareas diarias." },
  },
};

// Petites chaines d'interface propres a cette page (hors nav/footer, deja
// geres par navHTML()/footerHTML() de gen-fiches.js).
const UI = {
  category:   { fr: 'CATÉGORIE',              en: 'CATEGORY',              es: 'CATEGORÍA' },
  tools:      { fr: 'outils',                 en: 'tools',                 es: 'herramientas' },
  seeAll:     { fr: 'Voir tous les outils',    en: 'See all',               es: 'Ver todas las herramientas de' },
  share:      { fr: 'Partager',                en: 'Share',                 es: 'Compartir' },
  available:  { fr: 'Outils disponibles',      en: 'Tools available',      es: 'Herramientas disponibles' },
  avgRating:  { fr: 'Note moyenne',            en: 'Average rating',       es: 'Valoración media' },
  popularCats:{ fr: 'Catégories populaires',   en: 'Popular categories',   es: 'Categorías populares' },
  seeAllCats: { fr: 'Voir toutes les catégories →', en: 'See all categories →', es: 'Ver todas las categorías →' },
  autoUpdate: { fr: 'Mise à jour continue',    en: 'Continuously updated', es: 'Actualización continua' },
  search:     { fr: 'Rechercher un outil',     en: 'Search a tool',        es: 'Buscar una herramienta' },
  breadHome:  { fr: '⌂ Accueil',               en: '⌂ Home',               es: '⌂ Inicio' },
  breadCats:  { fr: 'Catégories',              en: 'Categories',           es: 'Categorías' },
  submitTitle:{ fr: "Vous ne trouvez pas l'outil qu'il vous faut ?", en: "Can't find the tool you need?", es: '¿No encuentras la herramienta que necesitas?' },
  submitText: { fr: "Proposez un outil et aidez la communauté à découvrir les meilleures solutions IA.", en: 'Suggest a tool and help the community discover the best AI solutions.', es: 'Propón una herramienta y ayuda a la comunidad a descubrir las mejores soluciones de IA.' },
  submitBtn:  { fr: 'Soumettre un outil +',    en: 'Submit a tool +',      es: 'Enviar una herramienta +' },
  empty:      { fr: 'Aucun outil publié dans cette catégorie pour le moment.', en: 'No tools published in this category yet.', es: 'Aún no hay herramientas publicadas en esta categoría.' },
};
const u = (key, langue) => (UI[key] && (UI[key][langue] || UI[key].fr)) || '';

function slugifyFallback(str) {
  return String(str || '')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function genererPagesCategories(tousLesOutils, helpers) {
  const slugify = helpers.slugify || slugifyFallback;
  const outilsActifs = tousLesOutils.filter(t => t.status !== 'offline');

  const parCategorie = new Map(); // categorie -> Map(langue -> [outils])
  for (const t of outilsActifs) {
    const cat = t.category;
    if (!cat) continue;
    const langue = t.langue || 'fr';
    if (!parCategorie.has(cat)) parCategorie.set(cat, new Map());
    const parLangue = parCategorie.get(cat);
    if (!parLangue.has(langue)) parLangue.set(langue, []);
    parLangue.get(langue).push(t);
  }

  // Slug + URLs de TOUTES les catégories, par langue — nécessaire pour la
  // section "Catégories populaires" (exclut la catégorie courante) et pour
  // la page hub /categorie/{langue}/.
  const slugParCat = new Map([...parCategorie.keys()].map(cat => [cat, slugify(cat)]));
  const parLangueGlobal = new Map(); // langue -> [{ name, slug, count }]
  for (const [cat, parLangue] of parCategorie) {
    for (const [langue, outils] of parLangue) {
      if (!parLangueGlobal.has(langue)) parLangueGlobal.set(langue, []);
      const notesCat = outils.map(t => (typeof t.note === 'number' ? t.note : (typeof t.rating === 'number' ? t.rating : null))).filter(n => n !== null);
      const noteMoyenneCat = notesCat.length ? notesCat.reduce((a, b) => a + b, 0) / notesCat.length : null;
      parLangueGlobal.get(langue).push({ name: cat, slug: slugParCat.get(cat), count: outils.length, noteMoyenne: noteMoyenneCat });
    }
  }

  let genere = 0;
  const languesGenerees = new Set();

  for (const [cat, parLangue] of parCategorie) {
    const slug = slugParCat.get(cat);
    const languesDisponibles = [...parLangue.keys()];
    if (!languesDisponibles.length) continue;

    const langueUrls = {};
    for (const langue of languesDisponibles) {
      langueUrls[langue] = `${helpers.SITE_ORIGIN}/categorie/${langue}/${slug}/`;
    }

    for (const langue of languesDisponibles) {
      const autresCategories = (parLangueGlobal.get(langue) || []).filter(c => c.name !== cat);
      const hubUrl = `/categorie/${langue}/`;
      const html = genererPageCategorie(
        { name: cat, slug },
        parLangue.get(langue),
        { langue, langueUrls, autresCategories, hubUrl, helpers }
      );
      const dir = path.join('categorie', langue, slug);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
      genere++;
      languesGenerees.add(langue);
    }
  }

  // Page hub /categorie/{langue}/ — une par langue ayant au moins 1 catégorie.
  let hubsGeneres = 0;
  for (const [langue, categories] of parLangueGlobal) {
    const html = genererPageHub(langue, categories, helpers);
    const dir = path.join('categorie', langue);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html, 'utf8');
    hubsGeneres++;
  }

  return { genere, langues: languesGenerees.size, hubs: hubsGeneres };
}

function genererPageCategorie(cat, tools, opts = {}) {
  const { navHTML, footerHTML, seoHeadTags, sharedJS, R, SITE_ORIGIN, escHtml } = opts.helpers;
  const langue = opts.langue || 'fr';
  const langueUrls = opts.langueUrls || { [langue]: `${SITE_ORIGIN}/categorie/${langue}/${cat.slug}/` };
  const autresCategories = opts.autresCategories || [];
  const hubUrl = opts.hubUrl || `${R}categorie/${langue}/`;

  const meta = CATEGORY_META[cat.name] || CATEGORY_META._default;
  const i18n = (CATEGORY_I18N[cat.name] && (CATEGORY_I18N[cat.name][langue] || CATEGORY_I18N[cat.name].fr))
    || { name: cat.name, desc: `${cat.name}` };
  const icon  = cat.icon  || meta.icon;
  const color = cat.color || meta.color;
  const name  = i18n.name;
  const description = i18n.desc;

  const count = tools.length;
  // Vraie moyenne (champ t.note déjà en base, utilisé partout ailleurs dans
  // gen-fiches.js) — pas de "2.5K+ utilisateurs" inventé, cette donnée
  // n'existe nulle part dans le système.
  const notes = tools.map(t => (typeof t.note === 'number' ? t.note : (typeof t.rating === 'number' ? t.rating : null))).filter(n => n !== null);
  const noteMoyenne = notes.length ? notes.reduce((a, b) => a + b, 0) / notes.length : 0;

  const APERCU_SSR = 12;
  const cartesInitiales = tools.slice(0, APERCU_SSR).map(t => buildToolCardSSR(t, langue)).join('\n');
  const toolsJson = JSON.stringify(tools).replace(/</g, '\\u003c');

  const title = `${name} — ${count} ${u('tools', langue)} IA | Albexia`;
  const metaDesc = description.length > 155 ? description.slice(0, 152) + '…' : description;

  const { canonicalUrl, hreflangTags, ogLocale, ogLocaleAlternates } = seoHeadTags(langue, langueUrls);

  return `<!DOCTYPE html>
<html lang="${langue}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(title)}</title>
<meta name="description" content="${escHtml(metaDesc)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canonicalUrl}">
${hreflangTags}
<meta property="og:title" content="${escHtml(title)}">
<meta property="og:description" content="${escHtml(metaDesc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonicalUrl}">
<meta property="og:locale" content="${ogLocale}">
${ogLocaleAlternates}
<link rel="stylesheet" href="${R}css/style.css">
<link rel="stylesheet" href="${R}css/categorie.css">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "CollectionPage",
  "name": ${JSON.stringify(title)},
  "description": ${JSON.stringify(metaDesc)},
  "breadcrumb": {
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": ${JSON.stringify(u('breadHome', langue).replace('⌂ ', ''))}, "item": "${SITE_ORIGIN}/" },
      { "@type": "ListItem", "position": 2, "name": ${JSON.stringify(u('breadCats', langue))}, "item": "${SITE_ORIGIN}/${R === '/' ? '' : R}index.html#tools" },
      { "@type": "ListItem", "position": 3, "name": ${JSON.stringify(name)} }
    ]
  }
}
</script>
</head>
<body>

${navHTML(langue)}

<main class="cat-page">
  <div class="container">

    <section class="cat-hero" style="--cat-color:${color}">
      <div class="cat-hero-main">
        <div class="cat-hero-icon">${icon}</div>
        <div class="cat-hero-body">
          <span class="cat-hero-badge">${u('category', langue)}</span>
          <h1 class="cat-hero-title">${escHtml(name)}</h1>
          <p class="cat-hero-desc">${escHtml(description)}</p>
        </div>
      </div>
      <div class="cat-hero-illustration" aria-hidden="true">
        <div class="cat-illu-blob"></div>
        <div class="cat-illu-icon">${icon}</div>
        <div class="cat-illu-bars">
          <span style="height:35%"></span><span style="height:55%"></span>
          <span style="height:40%"></span><span style="height:75%"></span>
          <span style="height:95%"></span>
        </div>
      </div>
    </section>

    <div class="cat-stats-bar">
      <div class="cat-stat">
        <span class="cat-stat-ico">★</span>
        <div><strong>${count}</strong><span>${u('available', langue)}</span></div>
      </div>
      <div class="cat-stat">
        <span class="cat-stat-ico">✦</span>
        <div><strong>${noteMoyenne.toFixed(1)}</strong><span>${u('avgRating', langue)}</span></div>
      </div>
    </div>

    <div class="search-wrap">
      <span class="search-icon">⌕</span>
      <input class="search-input" id="tool-search" type="text" placeholder="${escHtml(u('search', langue))} ${escHtml(name)}..." autocomplete="off">
    </div>
    <div id="tool-secondary-filters"><!-- genere par app.js --></div>

    <div class="tools-grid" id="tools-grid" data-category="${escHtml(cat.name)}">
${cartesInitiales || `<p class="cat-empty">${u('empty', langue)}</p>`}
    </div>
    <div id="tools-grid-pagination"></div>

    <div class="cat-submit-cta">
      <span class="cat-submit-ico">♔</span>
      <div class="cat-submit-text">
        <strong>${u('submitTitle', langue)}</strong>
        <p>${u('submitText', langue)}</p>
      </div>
      <a href="${R}index.html#tools" class="btn-main">${u('submitBtn', langue)}</a>
    </div>

    ${genererCategoriesPopulaires(autresCategories, langue, hubUrl)}

  </div>
</main>

${footerHTML()}
${sharedJS ? sharedJS() : ''}

<script>
  window.CATEGORY_TOOLS = ${toolsJson};
  window.CATEGORY_META  = { name: ${JSON.stringify(cat.name)}, slug: ${JSON.stringify(cat.slug)}, langue: ${JSON.stringify(langue)} };
  function partagerPage() {
    if (navigator.share) {
      navigator.share({ title: document.title, url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(window.location.href);
      alert('✓');
    }
  }
</script>
<script src="${R}js/i18n.js"></script>
<script src="${R}js/app.js"></script>
</body>
</html>`;
}

// Mini-grille "Catégories populaires" en bas de page — jusqu'à 6 autres
// catégories (celle de la page courante exclue), + lien vers le hub complet.
function genererCategoriesPopulaires(autresCategories, langue, hubUrl) {
  if (!autresCategories.length) return '';
  const top = [...autresCategories].sort((a, b) => b.count - a.count).slice(0, 6);
  const tuiles = top.map(c => {
    const meta = CATEGORY_META[c.name] || CATEGORY_META._default;
    const i18n = (CATEGORY_I18N[c.name] && (CATEGORY_I18N[c.name][langue] || CATEGORY_I18N[c.name].fr)) || { name: c.name };
    return `<a class="pop-cat-tile" href="/categorie/${langue}/${c.slug}/">
      <span class="pop-cat-icon">${meta.icon}</span>
      <span class="pop-cat-name">${i18n.name}</span>
      <span class="pop-cat-count">${c.count} ${u('tools', langue)}</span>
    </a>`;
  }).join('');

  return `<section class="cat-popular">
    <div class="cat-popular-head">
      <h2>${u('popularCats', langue)}</h2>
      <a href="${hubUrl}" class="cat-popular-all">${u('seeAllCats', langue)}</a>
    </div>
    <div class="cat-popular-grid">${tuiles}</div>
  </section>`;
}

// Page hub /categorie/{langue}/ — liste TOUTES les catégories de cette
// langue. Statique, pas de dépendance à app.js (juste un filtre de
// recherche client très simple, sans framework).
function genererPageHub(langue, categories, helpers) {
  const { navHTML, footerHTML, seoHeadTags, sharedJS, R, SITE_ORIGIN, escHtml } = helpers;
  const tri = [...categories].sort((a, b) => b.count - a.count);
  const total = tri.reduce((s, c) => s + c.count, 0);

  // Moyenne pondérée par le nombre d'outils de chaque catégorie — vraie
  // donnée calculée depuis t.note, pas un chiffre décoratif.
  const catsAvecNote = tri.filter(c => c.noteMoyenne !== null);
  const noteGlobale = catsAvecNote.length
    ? catsAvecNote.reduce((s, c) => s + c.noteMoyenne * c.count, 0) / catsAvecNote.reduce((s, c) => s + c.count, 0)
    : null;

  const titre = { fr: 'Toutes les catégories', en: 'All categories', es: 'Todas las categorías' }[langue] || 'Toutes les catégories';
  const sousTitre = {
    fr: "Explorez toutes nos catégories d'outils IA",
    en: 'Browse all our AI tool categories',
    es: 'Explora todas nuestras categorías de herramientas de IA',
  }[langue] || '';
  const searchPh = {
    fr: 'Rechercher une catégorie...', en: 'Search a category...', es: 'Buscar una categoría...',
  }[langue] || 'Rechercher une catégorie...';
  const statToolsLabel = { fr: 'Outils au total', en: 'Total tools', es: 'Herramientas en total' }[langue] || 'Outils au total';
  const statCatsLabel  = { fr: 'Catégories', en: 'Categories', es: 'Categorías' }[langue] || 'Catégories';
  const statRatingLabel = { fr: 'Note moyenne', en: 'Average rating', es: 'Valoración media' }[langue] || 'Note moyenne';
  const popularLabel = { fr: 'Catégories populaires', en: 'Popular categories', es: 'Categorías populares' }[langue] || 'Catégories populaires';

  const langueUrls = {};
  // Le hub existe pour chaque langue ayant ≥1 catégorie — on ne peut pas
  // savoir ici lesquelles sans info supplémentaire, donc pas de hreflang
  // multi-langue pour le hub (juste canonical) pour rester simple et honnête.
  langueUrls[langue] = `${SITE_ORIGIN}/categorie/${langue}/`;
  const { canonicalUrl } = seoHeadTags(langue, langueUrls);

  const tuiles = tri.map(c => {
    const meta = CATEGORY_META[c.name] || CATEGORY_META._default;
    const i18n = (CATEGORY_I18N[c.name] && (CATEGORY_I18N[c.name][langue] || CATEGORY_I18N[c.name].fr)) || { name: c.name };
    return `<a class="hub-cat-tile" href="/categorie/${langue}/${c.slug}/" data-name="${escHtml(i18n.name.toLowerCase())}">
      <span class="hub-cat-icon">${meta.icon}</span>
      <span class="hub-cat-name">${escHtml(i18n.name)}</span>
      <span class="hub-cat-count">${c.count} ${u('tools', langue)}</span>
    </a>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="${langue}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(titre)} — Albexia (${total} outils IA)</title>
<meta name="description" content="${escHtml(sousTitre)} — ${total} outils IA classés dans ${tri.length} catégories.">
<link rel="canonical" href="${canonicalUrl}">
<link rel="stylesheet" href="${R}css/style.css">
<link rel="stylesheet" href="${R}css/categorie.css">
<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>

${navHTML(langue)}

<main class="cat-page">
  <div class="container">
    <div class="hub-header">
      <h1>${escHtml(titre)}</h1>
      <p>${escHtml(sousTitre)}</p>
    </div>

    <div class="search-wrap">
      <span class="search-icon">⌕</span>
      <input class="search-input" id="hub-search" type="text" placeholder="${escHtml(searchPh)}" autocomplete="off">
    </div>

    <div class="hub-stats-bar">
      <div class="cat-stat">
        <span class="cat-stat-ico">▦</span>
        <div><strong>${total}</strong><span>${statToolsLabel}</span></div>
      </div>
      <div class="cat-stat">
        <span class="cat-stat-ico">☰</span>
        <div><strong>${tri.length}</strong><span>${statCatsLabel}</span></div>
      </div>
      ${noteGlobale !== null ? `
      <div class="cat-stat">
        <span class="cat-stat-ico">✦</span>
        <div><strong>${noteGlobale.toFixed(1)}</strong><span>${statRatingLabel}</span></div>
      </div>` : ''}
    </div>

    <h2 class="hub-section-title">${popularLabel}</h2>
    <div class="hub-grid" id="hub-grid">
      ${tuiles}
    </div>
  </div>
</main>

${footerHTML()}
${sharedJS ? sharedJS() : ''}
<script>
  const input = document.getElementById('hub-search');
  if (input) {
    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      document.querySelectorAll('#hub-grid .hub-cat-tile').forEach(tile => {
        tile.style.display = tile.dataset.name.includes(q) ? '' : 'none';
      });
    });
  }
</script>
</body>
</html>`;
}

function buildToolCardSSR(t, langue) {
  const priceLabels = {
    fr: { free: 'Gratuit', freemium: 'Freemium', paid: 'Payant' },
    en: { free: 'Free',    freemium: 'Freemium', paid: 'Paid' },
    es: { free: 'Gratis',  freemium: 'Freemium', paid: 'De pago' },
  };
  const priceLabel = priceLabels[langue] || priceLabels.fr;
  const slug = slugifyFallback(t.name) || String(t.id || '');
  const iconHtml = t.favicon
    ? `<img src="${t.favicon}" alt="${t.name}" class="tool-favicon">`
    : `<span class="tool-ico-fallback">${t.emoji || '✨'}</span>`;
  const pageUrl = t.url || '#';

  return `      <article class="tool-card" data-tool-slug="${slug}" onclick="window.location.href='${pageUrl}'">
        <div class="tool-head">
          <div class="tool-ico">${iconHtml}</div>
          <div style="flex:1">
            <div class="tool-name">${t.name}</div>
            <div class="tool-cat">${t.category}</div>
          </div>
        </div>
        <p class="tool-desc">${t.description || ''}</p>
        <div class="tool-foot">
          <span class="price-tag price-${t.price}">${priceLabel[t.price] || ''}</span>
          <span class="tool-rating-badge" data-slug="${slug}"></span>
        </div>
      </article>`;
}

module.exports = {
  genererPagesCategories,
  genererPageCategorie,
  CATEGORY_META,
  CATEGORY_I18N,
};
