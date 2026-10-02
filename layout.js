'use strict';

/* =========================================================
   layout.js — header et footer d'Albexia (côté générateur)

   HEADER — deux systèmes distincts :
   1. Pages générées statiquement (fiches outils, articles, niches,
      catégories, duels, glossaire…) -> navHTML(langue)
      Texte traduit ici, à la génération, écrit en dur dans le HTML.
      Aucun sélecteur de langue, aucune dépendance à i18n.js.
   2. Pages dynamiques qui chargent i18n.js -> navDynamicHTML()
      Header (avec sélecteur de langue) chargé par js/header.js.

   FOOTER — un seul fichier pour tout le site :
      components/footer.html (3 langues dans le fichier), chargé par
      js/footer.js sur toutes les pages. Pour le modifier : éditer ce
      fichier, effet immédiat, sans régénération.
      Ici, footerHTML() / footerDynamicHTML() ne produisent qu'un petit
      footer de secours (copyright + liens légaux) remplacé par js/footer.js.
   ========================================================= */

const R = '/';
const LANGS = ['fr', 'en', 'es'];

const LABELS = {
  fr: {
    home: 'Accueil', tools: 'Outils', blog: 'Blog',
    login: 'Connexion', submitCta: 'Soumettre un outil +', profileTitle: 'Mon profil',
    legalNotice: 'Mentions légales', privacy: 'Confidentialité', contact: 'Contact',
    rights: 'Tous droits réservés'
  },
  en: {
    home: 'Home', tools: 'Tools', blog: 'Blog',
    login: 'Log in', submitCta: 'Submit a tool +', profileTitle: 'My profile',
    legalNotice: 'Legal notice', privacy: 'Privacy', contact: 'Contact',
    rights: 'All rights reserved'
  },
  es: {
    home: 'Inicio', tools: 'Herramientas', blog: 'Blog',
    login: 'Iniciar sesión', submitCta: 'Enviar una herramienta +', profileTitle: 'Mi perfil',
    legalNotice: 'Aviso legal', privacy: 'Privacidad', contact: 'Contacto',
    rights: 'Todos los derechos reservados'
  }
};

const esc = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pick = l => (LANGS.includes(l) ? l : 'fr');

/* ─── HEADER des pages statiques ─── */

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

/* ─── FOOTER : petit footer de secours (HTML) + footer unique (js/footer.js) ─── */

function footerHTML(langue) {
  const t = LABELS[pick(langue)];
  return `<link rel="stylesheet" href="${R}css/footer.css">
<footer id="site-footer">
  <div style="text-align:center;padding:24px;font-size:13px;color:#4a4a6a;border-top:1px solid rgba(255,255,255,0.07)">
    &copy; 2025-2026 <a href="${R}index.html" style="color:#a8a3ff;text-decoration:none">Albexia</a> —
    <a href="${R}mentions-legales.html" style="color:#7a7a9a;text-decoration:none">${esc(t.legalNotice)}</a> ·
    <a href="${R}politique-confidentialite.html" style="color:#7a7a9a;text-decoration:none">${esc(t.privacy)}</a> ·
    <a href="${R}contact.html" style="color:#7a7a9a;text-decoration:none">${esc(t.contact)}</a>
  </div>
</footer>
<script src="${R}js/footer.js" defer></script>`;
}

/* Pages dynamiques : même footer de secours, en français (la langue est
   ensuite choisie par js/footer.js). */
function footerDynamicHTML() {
  return footerHTML('fr');
}

/* ─── HEADER des pages dynamiques (i18n.js) ─── */

/* display:contents : le <nav> sticky reste collé en haut de page
   (sinon il ne colle que dans la hauteur de son conteneur). */
function navDynamicHTML() {
  return `<div id="site-header" style="display:contents"></div>
<script src="${R}js/header.js" defer></script>`;
}

module.exports = { navHTML, footerHTML, navDynamicHTML, footerDynamicHTML, LABELS };
