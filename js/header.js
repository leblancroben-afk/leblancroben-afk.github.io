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

    document.dispatchEvent(new CustomEvent('albexia:header-ready'));

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
