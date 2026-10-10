/* =========================================================
   Albexia — theme.js
   UN SEUL système de thèmes pour tout le site (sombre / clair).

   - Sombre = thème par défaut. Le clair n'est activé que si le visiteur
     l'a choisi (ou via ?theme=light pour tester).
   - À charger en TOUT PREMIER dans le <head>, sans defer/async : le
     thème est posé sur <html data-theme="…"> avant le premier affichage
     (aucun flash).
   - Les couleurs vivent dans /css/themes.css (rien n'est stylé ici).
   - Mémorisation : localStorage « albexia_theme » (dark | light).
     N'interfère pas avec « albexia_langue ».
   - Bouton : monté automatiquement dans le <nav> du site (header partagé
     dynamique ET headers statiques). Un élément [data-theme-toggle]
     déjà présent dans la page est réutilisé tel quel.
   - Libellés FR / EN / ES intégrés (fonctionne sans i18n.js).
   ========================================================= */
(function () {
  'use strict';

  /* ► Mettre à true pour AFFICHER le bouton aux visiteurs (étape finale).
       Tant que c'est false : thème sombre pour tous, test possible via
       ?theme=light / ?theme=dark. */
  var SHOW_BUTTON = false;

  var KEY = 'albexia_theme';
  var LANG_KEY = 'albexia_langue';
  var THEMES = ['dark', 'light'];
  var META_COLOR = { dark: '#0a0a0f', light: '#F4F1EA' };
  var LABELS = {
    fr: { toLight: 'Passer en mode clair', toDark: 'Passer en mode sombre' },
    en: { toLight: 'Switch to light mode', toDark: 'Switch to dark mode' },
    es: { toLight: 'Cambiar a modo claro', toDark: 'Cambiar a modo oscuro' }
  };

  var root = document.documentElement;

  function readStored() {
    try {
      var v = localStorage.getItem(KEY);
      return THEMES.indexOf(v) > -1 ? v : null;
    } catch (e) { return null; }
  }

  function store(v) {
    try { localStorage.setItem(KEY, v); } catch (e) { /* stockage indisponible */ }
  }

  function readUrl() {
    try {
      var m = /[?&]theme=(light|dark)(?:&|#|$)/.exec(location.search);
      return m ? m[1] : null;
    } catch (e) { return null; }
  }

  function current() {
    return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  /* ─── Langue (même logique que js/footer.js) ─── */
  function lang() {
    var l = '';
    if (root.hasAttribute('data-static-lang')) {
      l = (root.lang || '').slice(0, 2).toLowerCase();
    } else if (typeof window.detecterLangue === 'function') {
      try { l = window.detecterLangue(); } catch (e) { l = ''; }
    }
    if (!LABELS[l]) {
      try { l = localStorage.getItem(LANG_KEY) || ''; } catch (e) { l = ''; }
    }
    if (!LABELS[l]) l = (root.lang || '').slice(0, 2).toLowerCase();
    return LABELS[l] ? l : 'fr';
  }

  /* ─── Application du thème ─── */
  function setMeta(theme) {
    var head = document.head || document.getElementsByTagName('head')[0];
    if (!head) return;
    var meta = head.querySelector('meta[name="theme-color"]');
    /* Sombre : on ne crée rien (rendu actuel inchangé). Clair : on crée la balise. */
    if (!meta) {
      if (theme !== 'light') return;
      meta = document.createElement('meta');
      meta.setAttribute('name', 'theme-color');
      head.appendChild(meta);
    }
    meta.setAttribute('content', META_COLOR[theme]);
  }

  function refreshButtons() {
    var theme = current();
    var t = LABELS[lang()];
    var label = theme === 'light' ? t.toDark : t.toLight;
    var btns = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-label', label);
      btns[i].setAttribute('title', label);
      btns[i].setAttribute('data-theme-state', theme);
    }
  }

  function apply(theme, persist) {
    if (THEMES.indexOf(theme) === -1) theme = 'dark';
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme === 'light' ? 'light' : ''; /* sombre : rendu actuel inchangé */
    setMeta(theme);
    if (persist) store(theme);
    refreshButtons();
    try {
      document.dispatchEvent(new CustomEvent('albexia:theme-change', { detail: { theme: theme } }));
    } catch (e) { /* CustomEvent indisponible */ }
  }

  function toggle() {
    apply(current() === 'light' ? 'dark' : 'light', true);
  }

  /* ─── Thème initial (exécuté immédiatement) ─── */
  var fromUrl = readUrl();
  if (fromUrl) store(fromUrl);
  apply(fromUrl || readStored() || 'dark', false);

  window.AlbexiaTheme = { get: current, set: function (t) { apply(t, true); }, toggle: toggle };

  /* ─── Bouton ─── */
  var ICONS =
    '<svg class="ic-sun" viewBox="0 0 24 24" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="4"/>' +
      '<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>' +
    '</svg>' +
    '<svg class="ic-moon" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>' +
    '</svg>';

  function mountButton() {
    if (!SHOW_BUTTON) return;
    if (document.querySelector('[data-theme-toggle]')) { refreshButtons(); return; }
    var nav = document.querySelector('body > nav') || document.querySelector('nav');
    if (!nav) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-toggle';
    btn.setAttribute('data-theme-toggle', '');
    btn.innerHTML = ICONS;

    var before =
      nav.querySelector('.nav-profile-slot') ||
      nav.querySelector('.nav-cta');
    if (before && before.parentNode === nav) nav.insertBefore(btn, before);
    else nav.appendChild(btn);

    refreshButtons();
  }

  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-theme-toggle]') : null;
    if (!el) return;
    e.preventDefault();
    toggle();
  });

  /* Autre onglet : suit le changement. */
  window.addEventListener('storage', function (e) {
    if (e.key === KEY && THEMES.indexOf(e.newValue) > -1) apply(e.newValue, false);
    if (e.key === LANG_KEY) refreshButtons();
  });

  /* Header dynamique (js/header.js) : monté après l'injection. */
  document.addEventListener('albexia:header-ready', mountButton);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountButton);
  } else {
    mountButton();
  }
})();
