'use strict';

/* =========================================================
   fiche-outil.js — générateur UNIQUE de fiche outil (Albexia)

   1 outil → 1 fiche → 1 remplissage.
   Remplace generateStandard / generateStarter / generateFeatured.
   Les données sont communes ; PLAN_RULES (ci-dessous) est le SEUL
   endroit qui dit ce que chaque offre affiche en plus ou en moins.

   Header et footer : navHTML() / footerHTML() de layout.js (inchangés).
   Les URLs restent tools/{plan}/{langue}/{slug}/ (calculées dans gen-fiches.js).
   ========================================================= */

// ── Différences entre offres (reprend le fonctionnement actuel) ──
//  takeaways : bloc « Ce qu'on retient » (points forts + limite)
//  features  : nb max de fonctionnalités   faq : nb max de questions
//  stats     : nb max de stats             aboutLong : « À propos » long (presentation)
//  gallery   : nb max de captures          tutoriels : nb max de tutoriels YouTube
//  tarifs    : bloc tarifs de l'outil      extras : API / mises à jour
//  articles  : nb d'articles liés (sidebar, FR)  maker/urlTarifs/interfaceFr : éléments Starter+
//  badge     : badge d'offre dans le hero
const PLAN_RULES = {
  standard: { takeaways: true,  features: 0, faq: 0, stats: 0, aboutLong: false, gallery: 0, tutoriels: 0,
              tarifs: false, extras: 0, articles: 0, maker: false, urlTarifs: false, interfaceFr: false, badge: null },
  starter:  { takeaways: false, features: 3, faq: 2, stats: 4, aboutLong: false, gallery: 0, tutoriels: 0,
              tarifs: true,  extras: 1, articles: 1, maker: true,  urlTarifs: true,  interfaceFr: true,  badge: 'partner' },
  featured: { takeaways: false, features: 4, faq: 4, stats: 4, aboutLong: true,  gallery: 5, tutoriels: 1,
              tarifs: true,  extras: 2, articles: 2, maker: true,  urlTarifs: true,  interfaceFr: true,  badge: 'recommended' },
};
// extras : 1 = API ; 2 = + mises à jour   (les sections « Statistiques clés » et « Intégrations » n'existent plus)

const planOf = (t) => (t.plan === 'featured' ? 'featured' : t.plan === 'starter' ? 'starter' : 'standard');

const FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpolygon points='16,2 28,30 4,30' fill='none' stroke='%23ff6b9d' stroke-width='2.5' stroke-linejoin='round'/%3E%3Ccircle cx='16' cy='22' r='3' fill='%23ff6b9d'/%3E%3C/svg%3E";

// ── Textes (FR / EN / ES) ──
const L = {
  fr: {
    home: 'Accueil', share: 'Partager', fav: 'Ajouter aux favoris', favOn: 'Dans vos favoris', copied: 'Lien copié',
    verified: 'Vérifié', partner: 'Partenaire Albexia', recommended: 'Recommandé', newTool: 'Nouveau',
    visit: 'Visiter le site', compare: 'Comparer', seePricing: 'Voir tous les tarifs',
    tabs: { presentation: 'Présentation', features: 'Fonctionnalités', pricing: 'Tarifs', reviews: 'Avis', alternatives: 'Alternatives', integrations: 'Intégrations', api: 'API', updates: 'Mises à jour' },
    about: (n) => `À propos de ${n}`, site: 'Site officiel', language: 'Langue', created: 'Créé en', type: 'Type',
    takeaways: "Ce qu'on retient", limit: 'Limite principale', mainFeatures: 'Fonctionnalités principales', shots: "Captures d'écran",
    tutorials: 'Tutoriels vidéo', faq: 'Questions fréquentes', integrations: 'Intégrations', apiT: 'API', apiDoc: "Documentation de l'API", updates: 'Mises à jour',
    reviews: 'Avis des utilisateurs', keyInfo: 'Informations clés', dev: 'Développeur', cat: 'Catégorie', sub: 'Sous-catégorie', model: 'Modèle',
    pricing: 'Tarification', ideal: 'Idéal pour', trial: 'Essai gratuit', from: 'À partir de', platforms: 'Plateformes', api: 'API', mobile: 'App mobile',
    ifr: 'Interface FR', support: 'Support', social: 'Réseaux sociaux', yes: 'Oui', pricingT: 'Tarification', start: 'Commencer', tryFree: 'Essayer gratuitement', seeOffer: "Voir l'offre",
    alts: 'Alternatives populaires', seeMore: 'Voir plus', altsMore: 'Comparer les alternatives', altsFor: (n) => `Alternative à ${n}`, articles: 'Articles liés',
    helpful: 'Cet outil vous a été utile ?', no: 'Non', thanks: 'Merci pour votre retour', know: 'Vous connaissez un autre outil ?', knowSub: 'Soumettez-le pour aider la communauté', submit: 'Soumettre un outil',
    price: { free: 'Gratuit', freemium: 'Freemium', paid: 'Payant' }, models: { proprietaire: 'Propriétaire', open_source: 'Open source' },
    interfaceBadge: 'Interface en français', titles: ['Avis, Prix & Alternatives 2026', 'Guide, Tarifs & Avis 2026', 'Guide complet, Tarifs & Tutoriels 2026'],
    previewHint: "Aperçu de l'outil", shotsAlt: 'Capture',
  },
  en: {
    home: 'Home', share: 'Share', fav: 'Add to favorites', favOn: 'In your favorites', copied: 'Link copied',
    verified: 'Verified', partner: 'Albexia Partner', recommended: 'Recommended', newTool: 'New',
    visit: 'Visit website', compare: 'Compare', seePricing: 'See all pricing',
    tabs: { presentation: 'Overview', features: 'Features', pricing: 'Pricing', reviews: 'Reviews', alternatives: 'Alternatives', integrations: 'Integrations', api: 'API', updates: 'Updates' },
    about: (n) => `About ${n}`, site: 'Official website', language: 'Language', created: 'Created in', type: 'Type',
    takeaways: 'Key takeaways', limit: 'Main limitation', mainFeatures: 'Key features', shots: 'Screenshots',
    tutorials: 'Video tutorials', faq: 'FAQ', integrations: 'Integrations', apiT: 'API', apiDoc: 'API documentation', updates: 'Updates',
    reviews: 'User reviews', keyInfo: 'Key information', dev: 'Developer', cat: 'Category', sub: 'Subcategory', model: 'Model',
    pricing: 'Pricing', ideal: 'Ideal for', trial: 'Free trial', from: 'Starting at', platforms: 'Platforms', api: 'API', mobile: 'Mobile app',
    ifr: 'FR interface', support: 'Support', social: 'Social media', yes: 'Yes', pricingT: 'Pricing', start: 'Get started', tryFree: 'Try for free', seeOffer: 'View plan',
    alts: 'Popular alternatives', seeMore: 'See more', altsMore: 'Compare alternatives', altsFor: (n) => `Alternative to ${n}`, articles: 'Related articles',
    helpful: 'Was this tool useful?', no: 'No', thanks: 'Thanks for your feedback', know: 'Know another tool?', knowSub: 'Submit it to help the community', submit: 'Submit a tool',
    price: { free: 'Free', freemium: 'Freemium', paid: 'Paid' }, models: { proprietaire: 'Proprietary', open_source: 'Open source' },
    interfaceBadge: 'French interface', titles: ['Review, Pricing & Alternatives 2026', 'Guide, Pricing & Reviews 2026', 'Complete Guide, Pricing & Tutorials 2026'],
    previewHint: 'Tool preview', shotsAlt: 'Screenshot',
  },
  es: {
    home: 'Inicio', share: 'Compartir', fav: 'Añadir a favoritos', favOn: 'En tus favoritos', copied: 'Enlace copiado',
    verified: 'Verificado', partner: 'Socio Albexia', recommended: 'Recomendado', newTool: 'Nuevo',
    visit: 'Visitar el sitio', compare: 'Comparar', seePricing: 'Ver todos los precios',
    tabs: { presentation: 'Presentación', features: 'Funcionalidades', pricing: 'Precios', reviews: 'Reseñas', alternatives: 'Alternativas', integrations: 'Integraciones', api: 'API', updates: 'Novedades' },
    about: (n) => `Acerca de ${n}`, site: 'Sitio oficial', language: 'Idioma', created: 'Creado en', type: 'Tipo',
    takeaways: 'Lo destacado', limit: 'Limitación principal', mainFeatures: 'Funcionalidades principales', shots: 'Capturas de pantalla',
    tutorials: 'Tutoriales en vídeo', faq: 'Preguntas frecuentes', integrations: 'Integraciones', apiT: 'API', apiDoc: 'Documentación de la API', updates: 'Novedades',
    reviews: 'Reseñas de usuarios', keyInfo: 'Información clave', dev: 'Desarrollador', cat: 'Categoría', sub: 'Subcategoría', model: 'Modelo',
    pricing: 'Precios', ideal: 'Ideal para', trial: 'Prueba gratis', from: 'Desde', platforms: 'Plataformas', api: 'API', mobile: 'App móvil',
    ifr: 'Interfaz FR', support: 'Soporte', social: 'Redes sociales', yes: 'Sí', pricingT: 'Precios', start: 'Empezar', tryFree: 'Probar gratis', seeOffer: 'Ver plan',
    alts: 'Alternativas populares', seeMore: 'Ver más', altsMore: 'Comparar alternativas', altsFor: (n) => `Alternativa a ${n}`, articles: 'Artículos relacionados',
    helpful: '¿Te ha sido útil esta herramienta?', no: 'No', thanks: 'Gracias por tu opinión', know: '¿Conoces otra herramienta?', knowSub: 'Envíala para ayudar a la comunidad', submit: 'Enviar una herramienta',
    price: { free: 'Gratis', freemium: 'Freemium', paid: 'De pago' }, models: { proprietaire: 'Propietario', open_source: 'Código abierto' },
    interfaceBadge: 'Interfaz en francés', titles: ['Reseña, Precios & Alternativas 2026', 'Guía, Precios & Reseñas 2026', 'Guía completa, Precios & Tutoriales 2026'],
    previewHint: 'Vista de la herramienta', shotsAlt: 'Captura',
  },
};

// ── Icônes SVG : bibliothèque partagée avec l'admin (js/fiche-icons.js) — aucun emoji ──
const FI = require('./js/fiche-icons.js');
const ic = (n, cls = '') => FI.svg(n, cls);
const STAR = '<svg class="fo-ico fo-ico-fill" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>';

// Thème de la fiche : 'template' = couleurs exactes de la maquette (page claire, bandeau bleu nuit)
//                     'albexia'  = couleurs sombres du site. Un seul mot à changer.
const FICHE_THEME = 'template';

const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '');
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const nonEmpty = (v) => !(v == null || v === '' || (Array.isArray(v) && !v.length));

// Champs qui doivent être saisis dans CHAQUE langue (pas de repli sur le FR :
// on ne veut pas de texte français sur une page EN/ES). Tous les autres
// champs sont communs et repris du document FR si la langue n'a pas le sien.
const TRADUISIBLES = new Set(['name', 'description', 'ideal_pour', 'presentation', 'meta_description',
  'points_forts', 'limite', 'fonctionnalites', 'faq', 'stats', 'tarifs']);

function generateFiche(tool, allTools = [], deps) {
  const { esc, slugify, seoHeadTags, toolLangueUrls, toolFicheUrl, navHTML, footerHTML, faqJS, tutorialJS, sharedJS, R } = deps;
  const langue = ['fr', 'en', 'es'].includes(tool.langue) ? tool.langue : 'fr';
  const T = L[langue];
  const plan = planOf(tool);
  const rules = PLAN_RULES[plan];

  const frDoc = (langue !== 'fr' && tool.traductions && tool.traductions.fr != null)
    ? allTools.find((t) => String(t.id) === String(tool.traductions.fr)) : null;
  const g = (k) => {
    const v = tool[k];
    if (nonEmpty(v) || typeof v === 'boolean' || typeof v === 'number') return v;
    if (!frDoc || TRADUISIBLES.has(k)) return v;
    return frDoc[k];
  };
  const E = (s) => esc(s == null ? '' : s);

  const name = tool.name || '';
  const description = tool.description || '';
  const url = safeUrl(tool.url) || '#';
  const category = tool.category || '';
  const slug = tool.slug_articles || slugify(name);
  const fav = tool.favicon || (safeUrl(url) ? `https://www.google.com/s2/favicons?sz=128&domain=${hostOf(url)}` : '');
  const note = Number(tool.note || tool.rating || 0) || 0;
  const pk = { free: 'free', gratuit: 'free', freemium: 'freemium', paid: 'paid', payant: 'paid' }[String(tool.price || 'freemium').toLowerCase()] || 'freemium';
  const tarifsUrl = safeUrl(g('url_tarifs'));

  // ── Données normalisées ──
  const tags = (tool.tags || g('tags') || []).slice(0, 4);
  const maker = g('maker');
  const plateformes = g('plateformes');
  const reseaux = g('reseaux') || {};
  const alternatives = g('alternatives') || [];
  const features = (g('fonctionnalites') || []).slice(0, rules.features);
  const faq = (g('faq') || []).slice(0, rules.faq);
  const tutoriels = (g('tutoriels') || []).slice(0, rules.tutoriels);
  const changelog = (g('changelog') || []).filter((c) => c && (c.titre || c.desc));
  const apiUrl = safeUrl(g('api_url'));
  const tarifsRaw = Array.isArray(g('tarifs')) ? g('tarifs').filter((p) => p && p.nom) : [];
  // Tarifs remplis par l'IA : affichés seulement après vérification par l'admin.
  const tarifsOk = rules.tarifs && tarifsRaw.length && tool.tarifs_verifie !== false;

  let galerie = (g('galerie') || []).map((x) => (typeof x === 'string' ? { url: x } : x)).filter((x) => x && safeUrl(x.url));
  if (!galerie.length && safeUrl(g('screenshot_url'))) galerie = [{ url: g('screenshot_url'), legende: '' }];
  galerie = galerie.slice(0, rules.gallery);

  // ── Hero ──
  const starsHTML = Array.from({ length: 5 }, (_, i) => `<span class="${i < Math.round(note) ? 'on' : ''}">${STAR}</span>`).join('');
  // Étoiles + note + nombre d'avis : mis à jour par js/reviews-widget.js dès que les avis sont chargés.
  const ratingHTML = `<span class="fo-stars" data-fo-stars aria-hidden="true"${note ? '' : ' hidden'}>${starsHTML}</span>`
    + `<span class="fo-score" data-fo-score${note ? '' : ' hidden'}>${note ? note.toFixed(1) : ''}</span>`
    + (note ? '' : `<span class="fo-badge fo-badge-new" data-fo-new>${E(T.newTool)}</span>`);
  const planBadge = rules.badge ? `<span class="fo-badge fo-badge-plan">${E(T[rules.badge])}</span>` : '';
  const verifBadge = tool.verifie === true || (frDoc && frDoc.verifie === true)
    ? `<span class="fo-badge fo-badge-ok">${ic('check')} ${E(T.verified)}</span>` : '';

  const previewImg = galerie[0];
  const previewBlock = previewImg
    ? `<div class="fo-preview has-img"><div class="fo-preview-bar"><div class="fo-dots"><i></i><i></i><i></i></div><span class="fo-preview-mono" id="fo-preview-cap">${E(previewImg.legende || name)}</span></div>
        <img id="fo-preview-img" src="${E(safeUrl(previewImg.url))}" alt="${E(name)}"></div>`
    : `<div class="fo-preview"><div class="fo-preview-bar"><div class="fo-dots"><i></i><i></i><i></i></div><span class="fo-preview-mono">${E(name)}</span></div>
        <div class="fo-preview-body"><h3>${E(name)}</h3><p>${E(description)}</p>
        </div></div>`;
  const thumbsBlock = galerie.length > 1
    ? `<div class="fo-thumbs">${galerie.map((x, i) => `<button type="button" class="fo-thumb${i === 0 ? ' active' : ''}" data-fo-thumb data-src="${E(safeUrl(x.url))}" data-cap="${E(x.legende || name)}" aria-label="${E(T.shotsAlt)} ${i + 1}"><img src="${E(safeUrl(x.url))}" alt="" loading="lazy"></button>`).join('')}</div>` : '';

  const hero = `
<header class="fo-hero">
  <div class="fo-wrap">
    <div class="fo-topbar">
      <div class="fo-actions-top">
        <button type="button" class="fo-pill" data-fo-share data-copied="${E(T.copied)}">${ic('share')}<span>${E(T.share)}</span></button>
        <button type="button" class="fo-pill" data-fo-fav aria-pressed="false" data-on="${E(T.favOn)}" data-off="${E(T.fav)}">${ic('heart')}<span>${E(T.fav)}</span></button>
      </div>
    </div>
    <div class="fo-hero-grid">
      <div class="fo-hero-left">
        <div class="fo-id">
          <div class="fo-logo">${fav ? `<img src="${E(fav)}" alt="${E(name)} logo">` : ''}</div>
          <div class="fo-id-info">
            <h1 class="fo-title">${E(name)}</h1>
            <p class="fo-short">${E(description)}</p>
            <div class="fo-rating">${ratingHTML}${verifBadge}${planBadge}</div>
          </div>
        </div>
        ${tags.length ? `<div class="fo-tags">${tags.map((t) => `<span class="fo-tag">${E(t)}</span>`).join('')}</div>` : ''}
        <div class="fo-hero-btns">
          <a href="${E(url)}" target="_blank" rel="noopener" class="fo-btn fo-btn-primary"><span>${E(T.visit)}</span>${ic('ext')}</a>
          <a href="${R}comparateur/index.html" class="fo-btn fo-btn-ghost">${ic('scale')}<span>${E(T.compare)}</span></a>
        </div>
      </div>
      <div class="fo-hero-right">${previewBlock}${thumbsBlock}</div>
    </div>
  </div>
</header>`;

  // ── À propos ──
  const aboutParas = (rules.aboutLong && tool.presentation)
    ? String(tool.presentation).split('\n').filter(Boolean).map((p) => `<p>${E(p)}</p>`).join('')
    : `<p>${E(description)}</p>`;
  const typeOutil = g('type_outil') || g('sous_categorie');
  const dash = '<span>—</span>';
  const metaCards = [
    ['globe', T.site, hostOf(url) ? `<a href="${E(url)}" target="_blank" rel="noopener">${E(hostOf(url))}</a>` : dash],
    ['lang', T.language, g('langues_disponibles') ? `<span>${E(g('langues_disponibles'))}</span>` : dash],
    ['cal', T.created, g('annee_creation') ? `<span>${E(g('annee_creation'))}</span>` : dash],
    ['user', T.type, typeOutil ? `<span>${E(typeOutil)}</span>` : dash],
  ].map(([i, l, v]) => `<div class="fo-meta-item"><div class="fo-meta-ico">${ic(i)}</div><div><small>${E(l)}</small>${v}</div></div>`).join('');

  const aboutSection = `
<section class="fo-card" id="fo-presentation">
  <h2>${E(T.about(name))}</h2>
  <div class="fo-text">${aboutParas}</div>
  <div class="fo-meta">${metaCards}</div>
</section>`;

  // ── Ce qu'on retient (Standard) ──
  const pf = (g('points_forts') || []).slice(0, 4);
  const limite = g('limite') || g('limite_principale');
  const takeawaysSection = rules.takeaways && (pf.length || limite) ? `
<section class="fo-card" id="fo-retenir">
  <h2>${E(T.takeaways)}</h2>
  <div class="fo-feat-grid">
    ${pf.map((p) => `<div class="fo-feat is-ok"><div class="fo-feat-ico">${ic('check')}</div><div><h3>${E(p)}</h3></div></div>`).join('')}
    ${limite ? `<div class="fo-feat is-warn"><div class="fo-feat-ico">${ic('alert')}</div><div><h3>${E(T.limit)}</h3><p>${E(limite)}</p></div></div>` : ''}
  </div>
</section>` : '';

  // ── Fonctionnalités ──
  const featuresSection = features.length ? `
<section class="fo-card" id="fo-fonctionnalites">
  <h2>${E(T.mainFeatures)}</h2>
  <div class="fo-feat-grid">${features.map((f) => `<div class="fo-feat"><div class="fo-feat-ico">${ic(FI.featureKey(f.icon))}</div><div><h3>${E(f.titre)}</h3><p>${E(f.desc || '')}</p></div></div>`).join('')}</div>
</section>` : '';

  // ── Captures (Featured) ──
  const shotsSection = galerie.length ? `
<section class="fo-card" id="fo-captures">
  <div class="fo-card-head"><h2>${E(T.shots)}</h2></div>
  <div class="fo-car" data-fo-car>
    ${galerie.length > 3 ? `<button type="button" class="fo-car-arrow fo-car-prev" data-fo-prev aria-label="‹">${ic('left')}</button>` : ''}
    <div class="fo-car-track" data-fo-track>${galerie.map((x, i) => `<figure class="fo-shot"><img src="${E(safeUrl(x.url))}" alt="${E(x.legende || name)} — ${i + 1}" loading="lazy">${x.legende ? `<figcaption>${E(x.legende)}</figcaption>` : ''}</figure>`).join('')}</div>
    ${galerie.length > 3 ? `<button type="button" class="fo-car-arrow fo-car-next" data-fo-next aria-label="›">${ic('right')}</button>` : ''}
  </div>
  ${galerie.length > 3 ? `<div class="fo-car-dots" data-fo-dots>${galerie.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>` : ''}
</section>` : '';

  // ── Tutoriel YouTube (Featured, 1 seul) ──
  const tutoHTML = tutoriels.map((t, i) => {
    const id = `tuto-${i}`;
    return `<div class="tutorial-item" id="${id}">
      <div class="tutorial-header" onclick="toggleTutorial('${id}')">
        <div class="tutorial-thumb"><img src="https://img.youtube.com/vi/${E(t.youtube_id)}/mqdefault.jpg" alt="${E(t.titre)}" loading="lazy">
          <div class="tutorial-thumb-play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div></div>
        <div class="tutorial-meta"><div class="tutorial-title">${E(t.titre)}</div>${t.duree ? `<div class="tutorial-duration">${E(t.duree)}</div>` : ''}</div>
        <button class="tutorial-toggle">▾</button>
      </div>
      <div class="tutorial-video"><div class="tutorial-video-inner">
        <iframe data-src="https://www.youtube.com/embed/${E(t.youtube_id)}" frameborder="0" allowfullscreen style="width:100%;aspect-ratio:16/9;border-radius:8px;display:block;"></iframe>
      </div></div>
    </div>`;
  }).join('');
  const tutoSection = tutoHTML ? `<section class="fo-card" id="fo-tutoriels"><h2>${E(T.tutorials)}</h2><div class="tutorials-list">${tutoHTML}</div></section>` : '';

  // ── FAQ ──
  const faqHTML = faq.map((f) => `<div class="faq-item"><button class="faq-q">${E(f.q)}</button><div class="faq-a">${E(f.a)}</div></div>`).join('');
  const faqSection = faqHTML ? `<section class="fo-card" id="fo-faq"><h2>${E(T.faq)}</h2><div class="faq-list">${faqHTML}</div></section>` : '';

  // ── API / Mises à jour ──
  const apiSection = rules.extras >= 1 && g('api') === true && apiUrl ? `
<section class="fo-card" id="fo-api"><h2>${E(T.apiT)}</h2>
  <a href="${E(apiUrl)}" target="_blank" rel="noopener" class="fo-btn fo-btn-soft">${E(T.apiDoc)} ${ic('ext')}</a></section>` : '';
  const updatesSection = rules.extras >= 2 && changelog.length ? `
<section class="fo-card" id="fo-maj"><h2>${E(T.updates)}</h2><ul class="fo-log">${changelog.slice(0, 6).map((c) =>
    `<li>${c.date ? `<time>${E(c.date)}</time>` : ''}<h3>${E(c.titre || '')}</h3>${c.desc ? `<p>${E(c.desc)}</p>` : ''}</li>`).join('')}</ul></section>` : '';

  const reviewsSection = `<section class="fo-card" id="fo-avis"><div id="reviews-section"><div class="fo-card-head"><h2>${E(T.reviews)}</h2></div></div></section>`;

  // ── Sidebar : informations clés ──
  const PLAT_KEYS = ['web', 'windows', 'apple', 'android'];
  let platIcons = Array.isArray(g('plateformes_icones')) ? g('plateformes_icones').filter((k) => PLAT_KEYS.includes(k)) : [];
  if (!platIcons.length && plateformes) {   // anciennes fiches : on déduit les icônes du texte saisi
    const t = String(plateformes).toLowerCase();
    platIcons = [[/web|navigateur|browser/, 'web'], [/windows/, 'windows'], [/mac|ios|iphone|ipad|apple/, 'apple'], [/android/, 'android']].filter(([re]) => re.test(t)).map(([, k]) => k);
  }
  const platChips = platIcons.length
    ? platIcons.map((k) => `<span class="fo-plat" title="${E(FI.BRAND[k][0])}" role="img" aria-label="${E(FI.BRAND[k][0])}">${ic(k)}</span>`).join('')
    : (plateformes ? `<span class="fo-chip">${E(plateformes)}</span>` : '');
  const soc = ['x', 'linkedin', 'youtube'].filter((k) => safeUrl(reseaux[k]))
    .map((k) => `<a href="${E(safeUrl(reseaux[k]))}" target="_blank" rel="noopener nofollow" aria-label="${E(FI.BRAND[k][0])}" title="${E(FI.BRAND[k][0])}">${ic(k)}</a>`).join('');
  const modelKey = g('modele');
  const row = (label, val, cls = '') => (val ? `<div><dt>${E(label)}</dt><dd class="${cls}">${val}</dd></div>` : '');
  // Informations clés : uniquement ces champs, dans cet ordre (une ligne sans donnée n'est pas affichée).
  const yn = (v) => (v === true ? E(T.yes) : v === false ? E(T.no) : '');
  const infoRows = [
    row(T.cat, E(category)),
    row(T.sub, E(g('sous_categorie'))),
    row(T.model, modelKey && T.models[modelKey] ? E(T.models[modelKey]) : ''),
    row(T.pricing, E(T.price[pk])),
    row(T.trial, yn(g('essai_gratuit'))),
    row(T.from, E(g('a_partir_de')), 'is-strong'),
    row(T.platforms, platChips ? `<div class="fo-plats">${platChips}</div>` : ''),
    row(T.api, yn(g('api'))),
    row(T.support, E(g('support'))),
    row(T.social, soc ? `<div class="fo-socials">${soc}</div>` : ''),
  ].join('');
  const infoCard = `<section class="fo-card" id="fo-infos"><h3 class="fo-h3">${E(T.keyInfo)}</h3><dl class="fo-info">${infoRows}</dl></section>`;

  // ── Sidebar : tarifs de l'outil ──
  const isFree = (p) => /^\s*[$€£]?\s*(0([.,]0+)?(?![\d])|gratuit|free|gratis)/i.test(String(p.prix || ''));
  const planBtn = (p) => (isFree(p) ? T.start : (g('essai_gratuit') === true ? T.tryFree : T.seeOffer));
  const tarifsCard = tarifsOk ? `
<section class="fo-card" id="fo-tarifs">
  <div class="fo-card-head"><h3 class="fo-h3">${E(T.pricingT)}</h3>${tarifsUrl ? `<a class="fo-link" href="${E(tarifsUrl)}" target="_blank" rel="noopener">${E(T.seePricing)}</a>` : ''}</div>
  <div class="fo-plans">${tarifsRaw.slice(0, 4).map((p) => `<div class="fo-plan"><div><b>${E(p.nom)}</b>
    ${p.prix ? `<strong>${E(p.prix)}${p.periode ? ` <small>${E(p.periode)}</small>` : ''}</strong>` : ''}${p.desc ? `<em>${E(p.desc)}</em>` : ''}</div>
    <a class="fo-btn ${isFree(p) ? 'fo-btn-outline' : 'fo-btn-softsm'}" href="${E(tarifsUrl || url)}" target="_blank" rel="noopener">${E(planBtn(p))}</a></div>`).join('')}</div>
</section>` : '';
  const pricingBtnOnly = !tarifsCard && rules.urlTarifs && tarifsUrl
    ? `<section class="fo-card"><a class="fo-btn fo-btn-soft" style="width:100%" href="${E(tarifsUrl)}" target="_blank" rel="noopener">${E(T.seePricing)} ${ic('ext')}</a></section>` : '';

  // ── Sidebar : alternatives (données Albexia : note et catégorie lues dans la base si l'outil y figure) ──
  const altItems = alternatives.map((a, idx) => {   // couleurs dans l'ordre : vert, rose, turquoise… comme la maquette
    const [nom, domaine, desc] = (typeof a === 'string' ? a : `${a.nom}|${a.domaine || ''}|${a.desc || ''}`).split('|');
    if (!nom || !nom.trim()) return '';
    const known = allTools.find((t) => (t.langue || 'fr') === langue && String(t.name).toLowerCase() === nom.trim().toLowerCase());
    const dom = (domaine || '').replace(/^https?:\/\//, '') || (known ? hostOf(known.url) : `${slugify(nom)}.com`);
    const hasPage = known && known.generer_fiche !== false;
    const href = hasPage ? toolFicheUrl(known) : `https://${dom}`;
    const kNote = known ? Number(known.note || known.rating || 0) : 0;
    return `<a class="fo-alt" href="${E(href)}"${hasPage ? '' : ' target="_blank" rel="noopener"'}>
      <div class="fo-alt-id"><div class="fo-alt-logo fo-av${idx % 6}" aria-hidden="true">${E(nom.trim().charAt(0).toUpperCase())}</div>
        <div><b>${E(nom.trim())}</b><small>${E((known && known.category) || desc || T.altsFor(name))}</small></div></div>
      ${kNote ? `<div class="fo-alt-note">${kNote.toFixed(1)} ${STAR}</div>` : ''}</a>`;
  }).join('');
  const altsCard = altItems ? `
<section class="fo-card" id="fo-alternatives"><div class="fo-card-head"><h3 class="fo-h3">${E(T.alts)}</h3><a class="fo-link" href="${R}index.html#tools">${E(T.seeMore)}</a></div>
  <div class="fo-alts">${altItems}</div><a class="fo-btn fo-btn-block" href="${R}comparateur/index.html">${E(T.altsMore)}</a></section>` : '';

  // ── Sidebar : articles liés (FR uniquement, selon l'offre) ──
  const artId = plan === 'featured' ? 'articles-sidebar-all' : 'articles-sidebar-starter';
  const articlesCard = langue === 'fr' && rules.articles ? `
<section class="fo-card fo-articles"><h3 class="fo-h3">${E(T.articles)}</h3><div id="${artId}"></div></section>` : '';
  const articlesScript = langue === 'fr' && rules.articles
    ? `<script src="${R}js/articles-loader.js" data-outil="${E(slug)}" data-plan="${plan}"></script>` : '';

  // ── Onglets ──
  const tabs = [
    ['fo-presentation', T.tabs.presentation, true],
    ['fo-fonctionnalites', T.tabs.features, !!featuresSection || !!takeawaysSection],
    ['fo-tarifs', T.tabs.pricing, !!tarifsCard],
    ['fo-avis', T.tabs.reviews, true],
    ['fo-alternatives', T.tabs.alternatives, !!altsCard],
    ['fo-api', T.tabs.api, !!apiSection],
    ['fo-maj', T.tabs.updates, !!updatesSection],
  ].filter((t) => t[2]);
  const tabsNav = `<div class="fo-tabs"><div class="fo-wrap"><nav aria-label="${E(name)}">${tabs.map(([id, l], i) => `<a href="#${id}" class="fo-tab${i === 0 ? ' active' : ''}" data-label="${E(l)}">${E(l)}</a>`).join('')}</nav></div></div>`;
  // ancre « Fonctionnalités » : Standard → bloc « Ce qu'on retient »
  const takeFix = !featuresSection && takeawaysSection ? takeawaysSection.replace('id="fo-retenir"', 'id="fo-fonctionnalites"') : takeawaysSection;

  // ── Pied de fiche ──
  const foot = `
<div class="fo-foot">
  <div class="fo-foot-l"><span class="t">${E(T.helpful)}</span>
    <button type="button" class="fo-vote" data-fo-vote="up" aria-pressed="false">${ic('up')}<span>${E(T.yes)}</span></button>
    <button type="button" class="fo-vote down" data-fo-vote="down" aria-pressed="false">${ic('up')}<span>${E(T.no)}</span></button>
    <span class="t" data-fo-thanks hidden>${E(T.thanks)}</span></div>
</div>`;

  // ── SEO ──
  const titre = `${name} — ${T.titles[plan === 'standard' ? 0 : plan === 'starter' ? 1 : 2]} | Albexia`;
  const metaDesc = E(((tool.meta_description || description) || '').slice(0, 155));
  const { canonicalUrl, hreflangTags, ogLocale, ogLocaleAlternates } = seoHeadTags(langue, toolLangueUrls(tool, allTools));

  const INLINE_JS = String.raw`
(function(){
  var d=document, root=d.documentElement;
  function setH(){var n=d.querySelector('nav:not(.fo-tabs nav)'); if(n) root.style.setProperty('--fo-nav-h', n.offsetHeight+'px');}
  setH(); addEventListener('resize', setH);
  var page=d.querySelector('[data-fo-id]'); var id=page?page.getAttribute('data-fo-id'):'';
  function ls(k,v){try{ if(v===undefined) return localStorage.getItem(k); localStorage.setItem(k,v);}catch(e){return null;}}

  // Aperçu : miniatures
  d.querySelectorAll('[data-fo-thumb]').forEach(function(b){
    b.addEventListener('click',function(){
      var im=d.getElementById('fo-preview-img'), cap=d.getElementById('fo-preview-cap');
      if(im) im.src=b.getAttribute('data-src'); if(cap) cap.textContent=b.getAttribute('data-cap');
      d.querySelectorAll('[data-fo-thumb]').forEach(function(x){x.classList.remove('active');}); b.classList.add('active');
    });
  });

  // Onglets : surbrillance selon la section visible
  var links=[].slice.call(d.querySelectorAll('.fo-tab'));
  if('IntersectionObserver' in window && links.length){
    var io=new IntersectionObserver(function(es){
      es.forEach(function(e){ if(e.isIntersecting){ links.forEach(function(l){ l.classList.toggle('active', l.getAttribute('href')==='#'+e.target.id); }); } });
    },{rootMargin:'-140px 0px -60% 0px'});
    links.forEach(function(l){var s=d.getElementById(l.getAttribute('href').slice(1)); if(s) io.observe(s);});
  }

  // Partager
  var sh=d.querySelector('[data-fo-share]');
  if(sh) sh.addEventListener('click',function(){
    var u=location.href, t=d.title;
    if(navigator.share){ navigator.share({title:t,url:u}).catch(function(){}); return; }
    var lab=sh.querySelector('span'), old=lab.textContent;
    (navigator.clipboard?navigator.clipboard.writeText(u):Promise.reject()).then(function(){ lab.textContent=sh.getAttribute('data-copied'); setTimeout(function(){lab.textContent=old;},2000); }).catch(function(){});
  });

  // Favoris (stockage local, par navigateur)
  var fv=d.querySelector('[data-fo-fav]');
  if(fv){
    var list=[]; try{list=JSON.parse(ls('albexia_fiche_favoris')||'[]');}catch(e){}
    function paint(on){ fv.setAttribute('aria-pressed',on); fv.querySelector('span').textContent=fv.getAttribute(on?'data-on':'data-off'); }
    paint(list.indexOf(id)>-1);
    fv.addEventListener('click',function(){
      var i=list.indexOf(id); if(i>-1) list.splice(i,1); else list.push(id);
      ls('albexia_fiche_favoris', JSON.stringify(list)); paint(i===-1);
    });
  }

  // Carrousel de captures
  d.querySelectorAll('[data-fo-car]').forEach(function(c){
    var tr=c.querySelector('[data-fo-track]'), dots=c.parentNode.querySelectorAll('[data-fo-dots] i');
    function by(dir){ tr.scrollBy({left:dir*tr.clientWidth*0.9, behavior:'smooth'}); }
    var p=c.querySelector('[data-fo-prev]'), n=c.querySelector('[data-fo-next]');
    if(p) p.addEventListener('click',function(){by(-1);}); if(n) n.addEventListener('click',function(){by(1);});
    tr.addEventListener('scroll',function(){
      if(!dots.length) return; var i=Math.round(tr.scrollLeft/(tr.scrollWidth/dots.length));
      dots.forEach(function(x,k){x.classList.toggle('on',k===Math.min(i,dots.length-1));});
    },{passive:true});
  });

  // Masque la carte « Articles liés » si le chargeur n'a rien injecté
  setTimeout(function(){ d.querySelectorAll('.fo-articles').forEach(function(c){ var b=c.querySelector('[id^="articles-sidebar"]'); if(b && !b.children.length) c.style.display='none'; }); }, 2500);

  // « Utile ? » (choix mémorisé localement)
  var votes=d.querySelectorAll('[data-fo-vote]'), th=d.querySelector('[data-fo-thanks]');
  var prev=ls('albexia_fiche_utile_'+id);
  function mark(v){ votes.forEach(function(b){b.setAttribute('aria-pressed', b.getAttribute('data-fo-vote')===v);}); if(th) th.hidden=false; }
  if(prev) mark(prev);
  votes.forEach(function(b){ b.addEventListener('click',function(){ var v=b.getAttribute('data-fo-vote'); ls('albexia_fiche_utile_'+id,v); mark(v); }); });
})();`;

  return `<!DOCTYPE html>
<html lang="${langue}" data-static-lang>
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${E(titre)}</title>
  <meta name="description" content="${metaDesc}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${canonicalUrl}">
${hreflangTags}
  <meta property="og:title" content="${E(titre)}">
  <meta property="og:description" content="${metaDesc}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:locale" content="${ogLocale}">
${ogLocaleAlternates}
  <link rel="icon" type="image/svg+xml" href="${FAVICON}">
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${R}css/style.css">
  <link rel="stylesheet" href="${R}css/tool-detail.css">
  <link rel="stylesheet" href="${R}css/fiche-outil.css">
</head>
<body>
${navHTML(langue)}
<main class="fo-page fo-theme-${FICHE_THEME}" data-fo-id="${E(tool.id)}">
${hero}
${tabsNav}
<div class="fo-body"><div class="fo-wrap">
  <div class="fo-grid">
    <div class="fo-col-main">
      ${aboutSection}
      ${takeFix}
      ${featuresSection}
      ${shotsSection}
      ${tutoSection}
      ${faqSection}
      ${apiSection}
      ${updatesSection}
      ${reviewsSection}
    </div>
    <aside class="fo-col-side">
      ${infoCard}
      ${tarifsCard}${pricingBtnOnly}
      ${articlesCard}
      ${altsCard}
    </aside>
  </div>
  ${foot}
</div></div>
</main>
${footerHTML(langue)}
${faqHTML ? faqJS() : ''}
${tutoHTML ? tutorialJS() : ''}
${sharedJS()}
${articlesScript}
<script type="module" src="${R}js/reviews-widget.js"></script>
<script src="${R}js/i18n.js"></script>
<script>${INLINE_JS}</script>
</body>
</html>`;
}

module.exports = { generateFiche, PLAN_RULES };
