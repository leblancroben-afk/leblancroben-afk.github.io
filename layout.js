'use strict';

/* =========================================================
   layout.js — header et footer d'Albexia (côté générateur)

   DEUX SYSTÈMES DISTINCTS :

   1. Pages générées statiquement (fiches outils, articles, niches,
      catégories, duels du comparateur, termes du glossaire…)
      -> navHTML(langue) / footerHTML(langue)
      Tout le texte est traduit ICI, au moment de la génération,
      et écrit en dur dans le HTML. Aucune dépendance à i18n.js,
      aucun sélecteur de langue. La langue de la page est celle de
      sa version (fr / en / es), signalée aux moteurs par <html lang>
      et par les balises hreflang.

   2. Pages dynamiques qui chargent i18n.js (accueil, hubs…)
      -> navDynamicHTML() / footerDynamicHTML()
      Le header (avec sélecteur de langue) et le footer sont chargés
      par js/header.js et js/footer.js, traduits par i18n.js.

   Les libellés ci-dessous (système 1) sont volontairement séparés
   de js/i18n.js (système 2).
   ========================================================= */

const R = '/';
const LANGS = ['fr', 'en', 'es'];

const LABELS = {
  fr: {
    home: 'Accueil', tools: 'Outils', blog: 'Blog',
    login: 'Connexion', submitCta: 'Soumettre un outil +', profileTitle: 'Mon profil',
    tagline: "L'annuaire francophone des outils d'IA, classés par besoin et évalués par la communauté.",
    newsletter: 'Newsletter hebdomadaire', emailPlaceholder: 'votre@email.com', subscribe: "S'abonner",
    badge: '✓ Gratuit · Sans spam · Désabonnement en 1 clic',
    success: '✓ Merci, vous êtes inscrit !', error: 'Une erreur est survenue, réessayez.',
    exploreTitle: 'Explorer', communityTitle: 'Communauté', legalContactTitle: 'Légal & contact',
    toolsLink: 'Outils IA', compare: 'Comparateur', tutorials: 'Tutoriels vidéo', glossary: 'Glossaire IA',
    hub: 'Voir toutes les sections', gallery: 'Galerie', deals: 'Deals & Promos', resources: 'Ressources',
    submit: 'Soumettre un outil', creator: 'Espace créateur',
    legalNotice: 'Mentions légales', privacy: 'Politique de confidentialité', terms: "Conditions d'utilisation",
    cookies: 'Gestion des cookies', contact: 'Nous contacter', partnerships: 'Partenariats',
    rights: 'Tous droits réservés', made: 'Fait avec ❤️ pour la communauté IA'
  },
  en: {
    home: 'Home', tools: 'Tools', blog: 'Blog',
    login: 'Log in', submitCta: 'Submit a tool +', profileTitle: 'My profile',
    tagline: 'The francophone AI tools directory, sorted by need and rated by the community.',
    newsletter: 'Weekly newsletter', emailPlaceholder: 'your@email.com', subscribe: 'Subscribe',
    badge: '✓ Free · No spam · Unsubscribe in 1 click',
    success: '✓ Thanks, you are subscribed!', error: 'Something went wrong, please try again.',
    exploreTitle: 'Explore', communityTitle: 'Community', legalContactTitle: 'Legal & contact',
    toolsLink: 'AI tools', compare: 'Compare', tutorials: 'Video tutorials', glossary: 'AI glossary',
    hub: 'See all sections', gallery: 'Gallery', deals: 'Deals & promos', resources: 'Resources',
    submit: 'Submit a tool', creator: 'Creator space',
    legalNotice: 'Legal notice', privacy: 'Privacy policy', terms: 'Terms of use',
    cookies: 'Cookie settings', contact: 'Contact us', partnerships: 'Partnerships',
    rights: 'All rights reserved', made: 'Made with ❤️ for the AI community'
  },
  es: {
    home: 'Inicio', tools: 'Herramientas', blog: 'Blog',
    login: 'Iniciar sesión', submitCta: 'Enviar una herramienta +', profileTitle: 'Mi perfil',
    tagline: 'El directorio francófono de herramientas de IA, clasificadas por necesidad y valoradas por la comunidad.',
    newsletter: 'Boletín semanal', emailPlaceholder: 'tu@email.com', subscribe: 'Suscribirme',
    badge: '✓ Gratis · Sin spam · Cancela con un clic',
    success: '✓ ¡Gracias, ya estás suscrito!', error: 'Ha ocurrido un error, inténtalo de nuevo.',
    exploreTitle: 'Explorar', communityTitle: 'Comunidad', legalContactTitle: 'Legal y contacto',
    toolsLink: 'Herramientas de IA', compare: 'Comparador', tutorials: 'Tutoriales en vídeo', glossary: 'Glosario de IA',
    hub: 'Ver todas las secciones', gallery: 'Galería', deals: 'Ofertas y promociones', resources: 'Recursos',
    submit: 'Enviar una herramienta', creator: 'Espacio creador',
    legalNotice: 'Aviso legal', privacy: 'Política de privacidad', terms: 'Condiciones de uso',
    cookies: 'Gestión de cookies', contact: 'Contáctanos', partnerships: 'Alianzas',
    rights: 'Todos los derechos reservados', made: 'Hecho con ❤️ para la comunidad IA'
  }
};

/* Colonnes du footer : [clé du libellé, chemin depuis la racine] */
const FOOTER_COLUMNS = [
  { title: 'exploreTitle', links: [
    ['toolsLink', 'index.html#tools'], ['compare', 'comparateur/'], ['tutorials', 'tutoriels/index.html'],
    ['glossary', 'glossaire/'], ['hub', 'hub.html']
  ] },
  { title: 'communityTitle', links: [
    ['blog', 'index.html#blog'], ['gallery', 'index.html#gallery'], ['deals', 'deals/'],
    ['resources', 'ressources.html'], ['submit', 'soumettre/index.html'], ['creator', 'profil.html']
  ] },
  { title: 'legalContactTitle', links: [
    ['legalNotice', 'mentions-legales.html'], ['privacy', 'politique-confidentialite.html'],
    ['terms', 'mentions-legales.html#cgu'], ['cookies', 'mentions-legales.html#cookies'],
    ['contact', 'contact.html'], ['partnerships', null, 'mailto:partenariats@annuaireia.com']
  ] }
];

const esc = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pick = l => (LANGS.includes(l) ? l : 'fr');

/* ─── SYSTÈME 1 : pages statiques ─── */

function navHTML(langue) {
  const t = LABELS[pick(langue)];
  const link = (path, text) =>
    `<a class="nav-link" href="${R}${path}" style="text-decoration:none;display:inline-flex;align-items:center">${esc(text)}</a>`;
  return `<nav>
  <div class="logo"><a href="${R}index.html" aria-label="Albexia" style="display:flex;text-decoration:none">
    <svg viewBox="0 0 130 36" xmlns="http://www.w3.org/2000/svg" height="32" aria-label="Albexia">
      <style>.poly-part{animation:buildIn 1.2s ease-out forwards;opacity:0}.logo-text{animation:fadeIn 1s ease-out 0.8s forwards;opacity:0}@keyframes buildIn{0%{opacity:0;transform:translateY(10px) scale(.8)}100%{opacity:1;transform:translateY(0) scale(1)}}@keyframes fadeIn{0%{opacity:0;transform:translateX(-5px)}100%{opacity:1;transform:translateX(0)}}.part-1{animation-delay:.1s}.part-2{animation-delay:.3s}.part-3{animation-delay:.5s}</style>
      <polygon class="poly-part part-1" points="2,10 14,32 10,32" fill="#ff6b9d"/>
      <polygon class="poly-part part-2" points="14,2 18,12 10,12" fill="#ff6b9d" opacity="0.6"/>
      <polygon class="poly-part part-3" points="26,10 14,32 18,32" fill="#ff6b9d"/>
      <text class="logo-text" x="36" y="26" font-family="Georgia,serif" font-size="20" font-weight="700" fill="#f0f0f5" letter-spacing="-0.5">Albe<tspan fill="#ff6b9d">x</tspan>ia</text>
    </svg>
  </a></div>
  <div class="nav-links">
    ${link('index.html', t.home)}
    ${link('index.html#tools', t.tools)}
    ${link('index.html#blog', t.blog)}
  </div>
  <div class="nav-profile-slot">
    <a href="${R}profil.html" id="nav-profile-btn" class="nav-avatar-link" style="display:none" title="${esc(t.profileTitle)}">
      <div class="nav-avatar" id="nav-avatar">?</div>
    </a>
    <a href="${R}profil.html" id="nav-login-btn" class="nav-link" style="display:none">${esc(t.login)}</a>
  </div>
  <a href="${R}soumettre/" class="nav-cta">${esc(t.submitCta)}</a>
</nav>
<script type="module" src="${R}js/auth-nav.js"></script>`;
}

function footerHTML(langue) {
  const t = LABELS[pick(langue)];
  const cols = FOOTER_COLUMNS.map(col => `
        <div class="footer-col" role="navigation" aria-label="${esc(t[col.title])}">
          <div class="footer-col-title">${esc(t[col.title])}</div>
${col.links.map(([key, path, href]) =>
    `          <a class="footer-link" href="${href || R + path}">${esc(t[key])}</a>`).join('\n')}
        </div>`).join('\n');

  return `<link rel="stylesheet" href="${R}css/footer.css">
<footer class="site-footer" id="site-footer" data-static>
  <div class="footer-top">
    <div class="footer-wrap">
      <div class="footer-grid">

        <div class="footer-brand">
          <a href="${R}index.html" class="footer-logo" aria-label="Albexia">
            <svg viewBox="0 0 160 36" height="30" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <polygon class="fl-outline" points="14,2 24,32 4,32"/>
              <polygon class="fl-fill" points="14,10 21,30 7,30"/>
              <circle class="fl-dot" cx="14" cy="24" r="2.5"/>
              <text class="fl-text" x="32" y="26">Albe<tspan class="fl-x">x</tspan>ia</text>
            </svg>
          </a>
          <p class="footer-tagline">${esc(t.tagline)}</p>
          <form class="footer-newsletter" id="footer-nl-form" action="https://formspree.io/f/xojbojld" method="POST" data-msg-success="${esc(t.success)}" data-msg-error="${esc(t.error)}">
            <label class="footer-nl-label" for="footer-nl-email">${esc(t.newsletter)}</label>
            <div class="footer-nl-row">
              <input type="email" name="email" id="footer-nl-email" class="footer-nl-input" placeholder="${esc(t.emailPlaceholder)}" autocomplete="email" required>
              <input type="hidden" name="_subject" value="Nouvelle inscription newsletter Albexia">
              <button type="submit" class="footer-nl-btn">${esc(t.subscribe)}</button>
            </div>
            <div class="footer-nl-badge" id="footer-nl-feedback" role="status" aria-live="polite">${esc(t.badge)}</div>
          </form>
        </div>
${cols}

      </div>
    </div>
  </div>
  <div class="footer-bottom">
    <div class="footer-wrap footer-bottom-inner">
      <span class="footer-copy">&copy; 2025-2026 Albexia — ${esc(t.rights)}</span>
      <span class="footer-made">${esc(t.made)}</span>
    </div>
  </div>
</footer>
<script src="${R}js/footer.js" defer></script>`;
}

/* ─── SYSTÈME 2 : pages dynamiques (i18n.js) ─── */

/* display:contents : le <nav> sticky reste collé en haut de page
   (sinon il ne colle que dans la hauteur de son conteneur). */
function navDynamicHTML() {
  return `<div id="site-header" style="display:contents"></div>
<script src="${R}js/header.js" defer></script>`;
}

/* Petit footer de repli (si JS désactivé), remplacé par js/footer.js. */
function footerDynamicHTML() {
  return `<footer id="site-footer">
  <div style="text-align:center;padding:24px;font-size:13px;color:#4a4a6a;border-top:1px solid rgba(255,255,255,0.07)">
    &copy; 2025-2026 <a href="${R}index.html" style="color:#a8a3ff;text-decoration:none">Albexia</a> —
    <a href="${R}mentions-legales.html" style="color:#7a7a9a;text-decoration:none">Mentions légales</a> ·
    <a href="${R}politique-confidentialite.html" style="color:#7a7a9a;text-decoration:none">Confidentialité</a> ·
    <a href="${R}contact.html" style="color:#7a7a9a;text-decoration:none">Contact</a>
  </div>
</footer>
<script src="${R}js/footer.js" defer></script>`;
}

module.exports = { navHTML, footerHTML, navDynamicHTML, footerDynamicHTML, LABELS };
