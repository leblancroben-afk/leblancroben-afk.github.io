/* =========================================================
   HEADER DYNAMIQUE — pages qui utilisent i18n.js
   Charge /components/header.html (logo, navigation, sélecteur de
   langue, profil, bouton « Soumettre »).

   Montage : sur <div id="site-header">, ou à défaut en remplaçant le
   <nav> de haut de page. Les pages générées statiquement n'utilisent
   PAS ce script : elles ont leur propre header traduit à la génération.

   Règle de sécurité : si i18n.js n'est pas chargé sur la page, le
   sélecteur de langue est retiré (il ne pourrait rien traduire).
   ========================================================= */
document.addEventListener('DOMContentLoaded', async () => {

  /* Pages générées (layout.js) : la nav est déjà en HTML, on initialise seulement la recherche. */
  if (document.getElementById('search-open') && !document.getElementById('site-header') && document.querySelector('body > nav')) {
    initHeaderSearch();
    return;
  }

  let container = document.getElementById('site-header');
  const legacyNav = container ? null : document.querySelector('body > nav');

  if (!container && !legacyNav) return;

  try {

    const response = await fetch('/components/header.html', {
      cache: 'no-cache'
    });

    if (!response.ok) {
      throw new Error(`Erreur HTTP ${response.status}`);
    }

    const html = await response.text();

    if (!container) {
      container = document.createElement('div');
      container.id = 'site-header';
      legacyNav.replaceWith(container);
    }

    /* Le <nav> est sticky : le conteneur ne doit pas créer de boîte. */
    container.style.display = 'contents';
    container.innerHTML = html;

    const i18nActif =
      typeof window.detecterLangue === 'function' ||
      typeof window.changerLangueGlobale === 'function';

    if (!i18nActif) {
      const selecteur = document.getElementById('lang-selector');
      if (selecteur) selecteur.remove();
    }

    /* Applique la langue enregistrée au header qui vient d'arriver. */
    if (typeof window.appliquerTraductionsStatiques === 'function') {

      const lang =
        typeof window.detecterLangue === 'function'
          ? window.detecterLangue()
          : (localStorage.getItem('albexia_langue') || 'fr');

      window.appliquerTraductionsStatiques(lang);

    }

    initHeaderLanguage();
    initHeaderSearch();

    document.dispatchEvent(new CustomEvent('albexia:header-ready'));

    /* Cloche + toasts de notifications (source unique : Firestore). */
    import('/js/notifications.js').catch((e) => {
      console.error('[Albexia] notifications.js : ', e);
    });

    /* Avatar / Connexion : le module a besoin que le header existe déjà. */
    import('/js/auth-nav.js').catch((e) => {
      console.error('[Albexia] auth-nav.js : ', e);
      const login = document.getElementById('nav-login-btn');
      if (login) login.style.display = 'inline-flex';
    });

  } catch (error) {

    console.error('[Albexia] Impossible de charger le header :', error);

  }

});


/* =========================================================
   SÉLECTEUR DE LANGUE
   ========================================================= */

function initHeaderLanguage() {

  const selector =
    document.getElementById('lang-selector');

  const current =
    document.getElementById('lang-current');

  const label =
    document.getElementById('lang-current-label');

  if (!selector || !current) return;


  /*
   * Langue utilisée par ton système i18n.js.
   */
  const STORAGE_KEY = 'albexia_langue';


  function getCurrentLanguage() {

    try {

      return (
        localStorage.getItem(STORAGE_KEY) ||
        'fr'
      );

    } catch (error) {

      return 'fr';

    }

  }


  function updateLanguageButton(lang) {

    if (label) {

      label.textContent =
        lang.toUpperCase();

    }

    selector
      .querySelectorAll('.lang-btn')
      .forEach(button => {

        button.classList.toggle(
          'active',
          button.dataset.lang === lang
        );

      });

  }


  function closeLanguageMenu() {

    selector.classList.remove('open');

    current.setAttribute(
      'aria-expanded',
      'false'
    );

  }


  current.addEventListener('click', event => {

    event.stopPropagation();

    const isOpen =
      selector.classList.toggle('open');

    current.setAttribute(
      'aria-expanded',
      isOpen ? 'true' : 'false'
    );

  });


  selector
    .querySelectorAll('.lang-btn')
    .forEach(button => {

      button.addEventListener(
        'click',
        event => {

          event.stopPropagation();

          const lang =
            button.dataset.lang;

          if (!lang) return;


          /*
           * Utilise la fonction globale
           * réellement fournie par i18n.js.
           */
          if (
            typeof window.changerLangueGlobale ===
            'function'
          ) {

            window.changerLangueGlobale(lang);

          } else {

            /*
             * Sécurité : mémorisation locale
             * si i18n.js n'est pas encore prêt.
             */
            try {

              localStorage.setItem(
                STORAGE_KEY,
                lang
              );

            } catch (error) {}

          }


          /*
           * Met immédiatement à jour
           * le bouton du sélecteur.
           */
          updateLanguageButton(lang);

          closeLanguageMenu();

        }
      );

    });


  document.addEventListener('click', event => {

    if (!selector.contains(event.target)) {

      closeLanguageMenu();

    }

  });


  document.addEventListener('keydown', event => {

    if (event.key === 'Escape') {

      closeLanguageMenu();

    }

  });


  /*
   * Afficher la langue actuellement enregistrée.
   */
  updateLanguageButton(
    getCurrentLanguage()
  );

}

window.addEventListener('storage', event => {

  if (event.key !== 'albexia_langue') return;

  const lang = event.newValue || 'fr';

  if (
    typeof window.appliquerTraductionsStatiques ===
    'function'
  ) {

    window.appliquerTraductionsStatiques(lang);

  }

  const label =
    document.getElementById('lang-current-label');

  if (label) {
    label.textContent = lang.toUpperCase();
  }

  document
    .querySelectorAll('.lang-btn')
    .forEach(button => {

      button.classList.toggle(
        'active',
        button.dataset.lang === lang
      );

    });

});


/* =========================================================
   NAVIGATION INDEX — sections internes
   Le header étant injecté dynamiquement, la navigation doit
   être gérée après son injection.
   ========================================================= */

document.addEventListener('click', event => {

  const link = event.target.closest(
    '.nav-link[data-nav-page]'
  );

  if (!link) return;

  const pageId = link.dataset.navPage;

  if (!pageId) return;

  const page = document.getElementById(pageId);

  /*
   * On n'intercepte le clic que si la section existe
   * sur la page actuelle.
   */
  if (!page) return;

  /*
   * showPage() est fourni par app.js.
   */
  if (typeof window.showPage !== 'function') {
    console.warn(
      '[Albexia] showPage() est introuvable.'
    );
    return;
  }

  event.preventDefault();

  window.showPage(pageId);

  /*
   * Met à jour l'URL sans recharger la page.
   */
  history.replaceState(
    null,
    '',
    `/index.html#${pageId}`
  );

});


/* =========================================================
   RECHERCHE GLOBALE (intégrée au header)
   Index : /data/search-index.json (généré par build-search-index.js).
   Trois langues : fr, en, es. Seuls les résultats de la langue
   active sont affichés (aucun repli vers une autre langue).
   ========================================================= */

const SEARCH_INDEX_URL = '/data/search-index.json';
const SEARCH_TYPES = ['outil', 'video', 'article', 'glossaire', 'comparaison', 'galerie'];
const SEARCH_MAX_PAR_TYPE = 6;
let searchIndexPromise = null;

function searchLangue() {
  const root = document.documentElement;
  if (root.hasAttribute('data-static-lang') && ['fr', 'en', 'es'].includes(root.lang)) return root.lang;
  try {
    return localStorage.getItem('albexia_langue') || 'fr';
  } catch (e) {
    return 'fr';
  }
}

function searchTr(key) {
  return typeof window.t === 'function' ? window.t(key, searchLangue()) : key;
}

function searchNormaliser(str) {
  return (str || '').toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function searchEchapper(str) {
  return String(str || '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function chargerSearchIndex() {
  if (!searchIndexPromise) {
    searchIndexPromise = fetch(SEARCH_INDEX_URL, { cache: 'no-cache' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(data => Array.isArray(data) ? data : (data.entries || []))
      .catch(err => {
        console.error('[Albexia] index de recherche indisponible :', err);
        searchIndexPromise = null;
        return [];
      });
  }
  return searchIndexPromise;
}

function rechercherDansIndex(entries, requete) {
  const q = searchNormaliser(requete);
  if (!q) return {};
  const lang = searchLangue();
  const mots = q.split(/\s+/).filter(Boolean);

  const filtrer = langue => entries.filter(e => e.lang === langue).filter(e => {
    const cible = searchNormaliser([e.title, e.subtitle, (e.keywords || []).join(' ')].join(' '));
    return mots.every(m => cible.includes(m));
  });

  const trouves = filtrer(lang); // pas de repli : sans traduction, pas de résultat

  const groupes = {};
  for (const e of trouves) {
    const type = SEARCH_TYPES.includes(e.type) ? e.type : 'article';
    (groupes[type] = groupes[type] || []).push(e);
  }
  for (const type of Object.keys(groupes)) {
    groupes[type] = groupes[type].slice(0, SEARCH_MAX_PAR_TYPE);
  }
  return groupes;
}

function afficherSuggestions(zone, onPick) {
  const pastilles = [1, 2, 3, 4, 5, 6].map(i => {
    const label = searchTr('search.sug' + i);
    return `<button type="button" class="search-chip" data-q="${searchEchapper(label)}">${searchEchapper(label)}</button>`;
  }).join('');
  zone.innerHTML = `
    <p class="search-empty">${searchEchapper(searchTr('search.empty'))}</p>
    <div class="search-chips">${pastilles}</div>`;
  zone.querySelectorAll('.search-chip').forEach(b =>
    b.addEventListener('click', () => onPick(b.dataset.q)));
}

function afficherResultats(zone, groupes) {
  const types = Object.keys(groupes);
  if (types.length === 0) {
    zone.innerHTML = `<p class="search-empty">${searchEchapper(searchTr('search.noResult'))}</p>`;
    return;
  }
  zone.innerHTML = types.map(type => `
    <section class="search-group">
      <h3 class="search-group-title">${searchEchapper(searchTr('search.type.' + type))}</h3>
      ${groupes[type].map(e => `
        <a class="search-item" href="${searchEchapper(e.url)}">
          <span class="search-item-title">${searchEchapper(e.title)}</span>
          ${e.subtitle ? `<span class="search-item-sub">${searchEchapper(e.subtitle)}</span>` : ''}
        </a>`).join('')}
    </section>`).join('');
}

function initHeaderSearch() {
  const openBtn = document.getElementById('search-open');
  const overlay = document.getElementById('search-overlay');
  const form = document.getElementById('search-form');
  const input = document.getElementById('search-input');
  const closeBtn = document.getElementById('search-close');
  const results = document.getElementById('search-results');
  if (!openBtn || !overlay || !form || !input || !results) return;

  let entries = [];

  function ouvrir() {
    overlay.hidden = false;
    document.body.classList.add('search-open');
    input.value = '';
    afficherSuggestions(results, lancer);
    setTimeout(() => input.focus(), 30);
    results.innerHTML = `<p class="search-empty">${searchEchapper(searchTr('search.loading'))}</p>`;
    chargerSearchIndex().then(data => {
      entries = data;
      afficherSuggestions(results, lancer);
    });
  }

  function fermer() {
    overlay.hidden = true;
    document.body.classList.remove('search-open');
  }

  function lancer(requete) {
    input.value = requete;
    const q = requete.trim();
    if (!q) {
      afficherSuggestions(results, lancer);
      return;
    }
    chargerSearchIndex().then(data => {
      entries = data;
      afficherResultats(results, rechercherDansIndex(entries, q));
    });
  }

  openBtn.addEventListener('click', ouvrir);
  closeBtn.addEventListener('click', fermer);
  form.addEventListener('submit', e => { e.preventDefault(); lancer(input.value); });
  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (!q) afficherSuggestions(results, lancer);
    else lancer(q);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !overlay.hidden) fermer();
  });
}
