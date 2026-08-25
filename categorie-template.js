// ═══════════════════════════════════════════════════════════
// categorie-template.js
// Génère le HTML complet d'une page catégorie statique
// (/categorie/{slug}/index.html) à intégrer dans gen-fiches.js,
// à côté de genererPagesNiches() / genererPagesComparateur().
//
// Usage prévu depuis gen-fiches.js :
//
//   const { genererPageCategorie } = require('./categorie-template.js');
//   for (const cat of categoriesUniques) {
//     const toolsCat = tousLesOutils.filter(t => t.category === cat.name && t.status !== 'offline');
//     const html = genererPageCategorie(cat, toolsCat);
//     fs.mkdirSync(`categorie/${cat.slug}`, { recursive: true });
//     fs.writeFileSync(`categorie/${cat.slug}/index.html`, html);
//   }
//
// ═══════════════════════════════════════════════════════════

// Icônes + couleur d'accent par catégorie. '_default' sert de repli pour
// toute catégorie ajoutée côté admin sans mise à jour de cette table —
// la page catégorie continue de se générer, juste avec un style neutre.
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

const CATEGORY_DESCRIPTIONS = {
  Tous:            "Découvre tous les outils d'intelligence artificielle disponibles.",
  Juridique:       "Outils IA pour la recherche juridique, l'analyse de contrats et la conformité.",
  Marketing:       "Outils IA pour automatiser vos campagnes et personnaliser vos contenus marketing.",
  SEO:             "Découvrez les meilleurs outils d'intelligence artificielle pour améliorer votre référencement, analyser vos mots-clés, optimiser votre contenu et booster votre visibilité sur les moteurs de recherche.",
  Contenu:         "Outils IA pour générer et éditer du texte, des visuels et des vidéos.",
  Code:            "Outils IA pour écrire, corriger et accélérer le développement logiciel.",
  'Design 3D':     "Outils IA pour créer des visuels, modèles et rendus 3D.",
  Automatisation:  "Outils IA pour connecter vos applications et automatiser vos workflows.",
  Recherche:       "Outils IA pour explorer, synthétiser et vérifier l'information.",
  Vidéo:           "Outils IA pour générer, monter et éditer des vidéos.",
  Productivité:    "Outils IA pour gagner du temps sur vos tâches quotidiennes.",
};

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Génère le HTML complet d'une page catégorie.
 *
 * @param {object} cat  { name, slug?, description?, icon?, color? }
 *   Seul `name` est obligatoire — tout le reste a un repli automatique
 *   basé sur CATEGORY_META / CATEGORY_DESCRIPTIONS / slugify(name).
 * @param {Array}  tools  Outils déjà filtrés sur cette catégorie
 *   (même schéma que les documents Firestore `outils` : name, category,
 *   description, price, tags, favicon, emoji, url, status, plan, id).
 * @param {object} [opts]
 * @param {string} [opts.langue='fr']
 * @param {number} [opts.rootDepth=2]  Nombre de niveaux entre index.html
 *   et cette page (categorie/{slug}/index.html = 2), pour générer les
 *   chemins relatifs vers js/app.js, style.css, etc.
 */
function genererPageCategorie(cat, tools, opts = {}) {
  const langue = opts.langue || 'fr';
  const rootDepth = opts.rootDepth ?? 2;
  const root = '../'.repeat(rootDepth) || './';

  const name  = cat.name;
  const slug  = cat.slug || slugify(name);
  const meta  = CATEGORY_META[name] || CATEGORY_META._default;
  const icon  = cat.icon  || meta.icon;
  const color = cat.color || meta.color;
  const description = cat.description || CATEGORY_DESCRIPTIONS[name]
    || `Outils IA classés dans la catégorie ${name}.`;

  const outilsActifs = tools.filter(t => t.status !== 'offline');
  const count = outilsActifs.length;

  // 12 premières cartes pré-rendues côté serveur pour le SEO/crawlers —
  // le reste (filtres, tri, pagination) est hydraté par categorie-page.js
  // à partir de window.CATEGORY_TOOLS (voir plus bas), sans re-fetch réseau.
  const APERCU_SSR = 12;
  const cartesInitiales = outilsActifs.slice(0, APERCU_SSR)
    .map(t => buildToolCardSSR(t)).join('\n');

  const toolsJson = JSON.stringify(outilsActifs).replace(/</g, '\\u003c');

  const title = `${name} — ${count} outils IA | Albexia`;
  const metaDesc = description.length > 155 ? description.slice(0, 152) + '…' : description;

  return `<!DOCTYPE html>
<html lang="${langue}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(title)}</title>
<meta name="description" content="${escHtml(metaDesc)}">
<link rel="canonical" href="https://albexia.com/categorie/${slug}/">
<meta property="og:title" content="${escHtml(title)}">
<meta property="og:description" content="${escHtml(metaDesc)}">
<meta property="og:type" content="website">
<link rel="stylesheet" href="${root}css/style.css">
<link rel="stylesheet" href="${root}css/categorie.css">
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
      { "@type": "ListItem", "position": 1, "name": "Accueil", "item": "https://albexia.com/" },
      { "@type": "ListItem", "position": 2, "name": "Catégories", "item": "https://albexia.com/outils/" },
      { "@type": "ListItem", "position": 3, "name": ${JSON.stringify(name)} }
    ]
  }
}
</script>
</head>
<body>

${genererNav(root)}

<main class="cat-page">
  <div class="container">

    <!-- Fil d'Ariane -->
    <nav class="cat-breadcrumb" aria-label="Fil d'Ariane">
      <a href="${root}index.html">⌂ Accueil</a>
      <span>›</span>
      <a href="${root}index.html#tools">Catégories</a>
      <span>›</span>
      <span aria-current="page">${escHtml(name)}</span>
    </nav>

    <!-- Hero -->
    <section class="cat-hero" style="--cat-color:${color}">
      <div class="cat-hero-main">
        <div class="cat-hero-icon">${icon}</div>
        <div class="cat-hero-body">
          <span class="cat-hero-badge">CATÉGORIE</span>
          <h1 class="cat-hero-title">${escHtml(name)}</h1>
          <p class="cat-hero-count">${count} outils</p>
          <p class="cat-hero-desc">${escHtml(description)}</p>
          <div class="cat-hero-actions">
            <a href="#tools-grid" class="btn-main">Voir tous les outils ${escHtml(name)} →</a>
            <button class="btn-outline" onclick="partagerPage()">Partager ⤴</button>
          </div>
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

    <!-- Stats -->
    <div class="cat-stats-bar">
      <div class="cat-stat">
        <span class="cat-stat-ico">★</span>
        <div><strong>${count}</strong><span>Outils disponibles</span></div>
      </div>
      <div class="cat-stat cat-stat-muted" title="Bientôt disponible">
        <span class="cat-stat-ico">◷</span>
        <div><strong>Auto</strong><span>Mise à jour continue</span></div>
      </div>
    </div>

    <!-- Recherche + tri + filtres (hydratés par categorie-page.js) -->
    <div class="search-wrap">
      <span class="search-icon">⌕</span>
      <input class="search-input" id="tool-search" type="text" placeholder="Rechercher un outil ${escHtml(name)}..." autocomplete="off">
    </div>
    <div id="tool-secondary-filters"><!-- généré par categorie-page.js --></div>

    <!-- Grille -->
    <div class="tools-grid" id="tools-grid" data-category="${escHtml(name)}">
${cartesInitiales || '<p class="cat-empty">Aucun outil publié dans cette catégorie pour le moment.</p>'}
    </div>
    <div id="tools-grid-pagination"></div>

    <!-- Bloc soumission -->
    <div class="cat-submit-cta">
      <span class="cat-submit-ico">♔</span>
      <div class="cat-submit-text">
        <strong>Vous ne trouvez pas l'outil qu'il vous faut ?</strong>
        <p>Proposez un outil et aidez la communauté à découvrir les meilleures solutions IA.</p>
      </div>
      <a href="${root}index.html#tools" class="btn-main">Soumettre un outil +</a>
    </div>

  </div>
</main>

${genererFooter(root)}

<script>
  // Données embarquées au build par gen-fiches.js — la page fonctionne
  // sans appel Firestore pour la liste d'outils (rapide + indexable).
  window.CATEGORY_TOOLS = ${toolsJson};
  window.CATEGORY_META  = { name: ${JSON.stringify(name)}, slug: ${JSON.stringify(slug)} };
  function partagerPage() {
    if (navigator.share) {
      navigator.share({ title: document.title, url: window.location.href }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(window.location.href);
      alert('Lien copié !');
    }
  }
</script>
<script src="${root}js/i18n.js"></script>
<script src="${root}js/app.js"></script>
</body>
</html>`;
}

// Carte outil pré-rendue côté serveur (SSR) — markup identique à
// buildToolCard() dans app.js, dupliqué ici volontairement : ce fichier
// tourne côté Node (gen-fiches.js) et n'a pas accès à state.langue /
// catColors du navigateur. categorie-page.js remplace ce HTML par un
// rendu identique via buildToolCard() dès que le JS est prêt (hydratation),
// donc toute dérive entre les deux gabarits reste invisible pour l'utilisateur.
function buildToolCardSSR(t) {
  const priceLabel = { free: 'Gratuit', freemium: 'Freemium', paid: 'Payant' };
  const slug = slugify(t.name) || String(t.id || '');
  const iconHtml = t.favicon
    ? `<img src="${escHtml(t.favicon)}" alt="${escHtml(t.name)}" class="tool-favicon">`
    : `<span class="tool-ico-fallback">${t.emoji || '✨'}</span>`;
  const pageUrl = t.slugFiche ? `${slugify(t.name)}.html` : (t.url || '#');

  return `      <article class="tool-card" data-tool-slug="${slug}" onclick="window.location.href='${escHtml(pageUrl)}'">
        <div class="tool-head">
          <div class="tool-ico">${iconHtml}</div>
          <div style="flex:1">
            <div class="tool-name">${escHtml(t.name)}</div>
            <div class="tool-cat">${escHtml(t.category)}</div>
          </div>
        </div>
        <p class="tool-desc">${escHtml(t.description)}</p>
        <div class="tool-foot">
          <span class="price-tag price-${t.price}">${priceLabel[t.price] || ''}</span>
          <span class="tool-rating-badge" data-slug="${slug}"></span>
        </div>
      </article>`;
}

function genererNav(root) {
  return `<nav>
  <div class="logo">
    <a href="${root}index.html" style="display:flex;align-items:center;gap:8px;text-decoration:none">
      <svg viewBox="0 0 130 36" xmlns="http://www.w3.org/2000/svg" height="32" aria-label="Albexia">
        <polygon points="2,10 14,32 10,32" fill="#ff6b9d"/>
        <polygon points="14,2 18,12 10,12" fill="#ff6b9d" opacity="0.6"/>
        <polygon points="26,10 14,32 18,32" fill="#ff6b9d"/>
        <text x="36" y="26" font-family="Georgia, serif" font-size="20" font-weight="700" fill="#f0f0f5" letter-spacing="-0.5">Albe<tspan fill="#ff6b9d">x</tspan>ia</text>
      </svg>
    </a>
  </div>
  <div class="nav-links">
    <a href="${root}index.html" class="nav-link">Accueil</a>
    <a href="${root}index.html#tools" class="nav-link active">Outils</a>
    <a href="${root}index.html#blog" class="nav-link">Blog</a>
    <a href="${root}index.html#gallery" class="nav-link">Galerie</a>
  </div>
  <div class="lang-selector">
    <button class="lang-btn active">FR</button>
  </div>
  <a href="${root}index.html#tools" class="nav-cta">Soumettre un outil +</a>
</nav>`;
}

function genererFooter(root) {
  return `<footer class="site-footer">
  <div class="footer-top">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <div class="footer-logo">
            <svg viewBox="0 0 160 36" xmlns="http://www.w3.org/2000/svg" height="30" aria-label="Albexia">
              <polygon points="14,2 24,32 4,32" fill="none" stroke="#ff6b9d" stroke-width="2" stroke-linejoin="round"/>
              <polygon points="14,10 21,30 7,30" fill="#ff6b9d" opacity="0.2"/>
              <circle cx="14" cy="24" r="2.5" fill="#ff6b9d"/>
              <text x="32" y="26" font-family="Georgia, serif" font-size="20" font-weight="700" fill="#f0f0f5" letter-spacing="-0.5">Albe<tspan fill="#ff6b9d">x</tspan>ia</text>
            </svg>
          </div>
          <p style="color:var(--text-dim);font-size:13px;max-width:260px">Le meilleur annuaire d'outils IA pour booster votre productivité.</p>
        </div>
        <div class="footer-col">
          <div class="footer-col-title">Plateforme</div>
          <a class="footer-link" href="${root}index.html">Accueil</a>
          <a class="footer-link" href="${root}index.html#tools">Tous les outils</a>
          <a class="footer-link" href="${root}index.html#tools">Catégories</a>
          <a class="footer-link" href="${root}index.html#tools">Soumettre un outil</a>
        </div>
        <div class="footer-col">
          <div class="footer-col-title">Ressources</div>
          <a class="footer-link" href="${root}index.html#blog">Blog</a>
          <a class="footer-link" href="${root}glossaire/">Glossaire</a>
        </div>
        <div class="footer-col">
          <div class="footer-col-title">Entreprise</div>
          <a class="footer-link" href="${root}contact.html">Contact</a>
          <a class="footer-link" href="${root}mentions-legales.html">Mentions légales</a>
          <a class="footer-link" href="${root}politique-confidentialite.html">Confidentialité</a>
        </div>
      </div>
    </div>
  </div>
  <div class="footer-bottom">
    <div class="container footer-bottom-inner">
      <span class="footer-copy">&copy; 2025-2026 Albexia — Tous droits réservés</span>
    </div>
  </div>
</footer>`;
}

module.exports = { genererPageCategorie, CATEGORY_META, CATEGORY_DESCRIPTIONS, slugify };
