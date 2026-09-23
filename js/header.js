document.addEventListener('DOMContentLoaded', async () => {

  const container = document.getElementById('site-header');

  if (!container) return;

  try {

    const response = await fetch('/components/header.html', {
      cache: 'no-cache'
    });

    if (!response.ok) {
      throw new Error(
        `Erreur HTTP ${response.status}`
      );
    }

    container.innerHTML = await response.text();

    /*
     * Le header vient d'être injecté dans le DOM.
     * On applique immédiatement la langue enregistrée.
     */
    if (
      typeof window.appliquerTraductionsStatiques ===
      'function'
    ) {

      window.appliquerTraductionsStatiques(
        typeof window.detecterLangue === 'function'
          ? window.detecterLangue()
          : 'fr'
      );

    }

    initHeaderKebab();
    initHeaderLanguage();

    /*
     * Le header est maintenant présent dans le DOM.
     * On informe les autres scripts.
     */
    document.dispatchEvent(
      new CustomEvent('albexia:header-ready')
    );

  } catch (error) {

    console.error(
      '[Albexia] Impossible de charger le header :',
      error
    );

  }

});


/* =========================================================
   MENU KEBAB
   ========================================================= */

function initHeaderKebab() {

  const wrap =
    document.getElementById('kebab-wrap');

  const btn =
    document.getElementById('kebab-btn');

  const menu =
    document.getElementById('kebab-menu');

  if (!wrap || !btn || !menu) return;


  btn.addEventListener('click', event => {

    event.stopPropagation();

    const isOpen =
      menu.classList.toggle('open');

    btn.classList.toggle('open', isOpen);

    btn.setAttribute(
      'aria-expanded',
      isOpen ? 'true' : 'false'
    );

  });


  document.addEventListener('click', event => {

    if (!wrap.contains(event.target)) {

      menu.classList.remove('open');

      btn.classList.remove('open');

      btn.setAttribute(
        'aria-expanded',
        'false'
      );

    }

  });


  document.addEventListener('keydown', event => {

    if (event.key === 'Escape') {

      menu.classList.remove('open');

      btn.classList.remove('open');

      btn.setAttribute(
        'aria-expanded',
        'false'
      );

    }

  });

}


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
           * On utilise la fonction existante
           * de i18n.js.
           */
          if (
            typeof window.changerLangue ===
            'function'
          ) {

            window.changerLangue(lang);

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
