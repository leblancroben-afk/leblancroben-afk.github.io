/* =========================================================
   FOOTER UNIQUE — Albexia
   Charge /components/footer.html sur TOUTES les pages (statiques et
   dynamiques) : un seul fichier à modifier, effet immédiat.

   - Remplace le <footer id="site-footer"> de la page (petit footer de
     secours écrit dans le HTML), ou le dernier <footer> de premier
     niveau, ou s'ajoute en fin de <body> s'il n'y en a pas.
   - Si le chargement échoue, le footer de secours reste en place.

   TRADUCTION (sans i18n.js) : chaque texte de footer.html porte ses
   3 versions : data-fr / data-en / data-es (placeholder : data-ph-*,
   messages du formulaire : data-ok-* / data-err-*).

   Langue affichée :
   - page statique (<html data-static-lang>, ou sans i18n.js) : la
     langue de la page, <html lang>
   - page dynamique (i18n.js) : la langue choisie par le visiteur ;
     le footer suit les changements de langue.
   ========================================================= */
(function () {
  'use strict';

  if (window.__albexiaFooterLoaded) return;
  window.__albexiaFooterLoaded = true;

  var FOOTER_URL = '/components/footer.html';
  var CSS_URL = '/css/footer.css';
  var LANGS = ['fr', 'en', 'es'];
  var LS_LANG_KEY = 'albexia_langue';

  /* ─── Langue ─── */
  function currentLang() {
    var l = '';

    /* i18n.js gère déjà le cas « page statique » (renvoie <html lang>). */
    if (typeof window.detecterLangue === 'function') {
      try { l = window.detecterLangue(); } catch (e) { l = ''; }
    }

    if (LANGS.indexOf(l) === -1) {
      l = (document.documentElement.lang || '').slice(0, 2).toLowerCase();
    }

    if (LANGS.indexOf(l) === -1) {
      try { l = localStorage.getItem(LS_LANG_KEY) || ''; } catch (e) { l = ''; }
    }

    return LANGS.indexOf(l) === -1 ? 'fr' : l;
  }

  /* ─── Traduction du footer ─── */
  function translate(root) {
    var lang = currentLang();

    root.querySelectorAll('[data-fr]').forEach(function (el) {
      var txt = el.getAttribute('data-' + lang) || el.getAttribute('data-fr');
      if (txt !== null) el.textContent = txt;
    });

    root.querySelectorAll('[data-ph-fr]').forEach(function (el) {
      var ph = el.getAttribute('data-ph-' + lang) || el.getAttribute('data-ph-fr');
      if (ph !== null) el.setAttribute('placeholder', ph);
    });

    /* Étiquette accessible de chaque colonne = son titre. */
    root.querySelectorAll('.footer-col').forEach(function (col) {
      var title = col.querySelector('.footer-col-title');
      if (title) col.setAttribute('aria-label', title.textContent.trim());
    });

    return lang;
  }

  /* ─── Feuille de style (chargée avant d'afficher, pour éviter un flash) ─── */
  function ensureCss() {
    return new Promise(function (resolve) {
      var existing = document.querySelector('link[href$="/css/footer.css"], link[href="' + CSS_URL + '"]');
      var link = existing;

      if (!link) {
        link = document.createElement('link');
        link.id = 'albexia-footer-css';
        link.rel = 'stylesheet';
        link.href = CSS_URL;
        document.head.appendChild(link);
      }

      if (link.sheet) return resolve();
      link.addEventListener('load', resolve, { once: true });
      link.addEventListener('error', resolve, { once: true });
      setTimeout(resolve, 1500);
    });
  }

  /* ─── Footer de la page à remplacer ─── */
  function findTarget() {
    var byId = document.getElementById('site-footer');
    if (byId) return byId;
    var list = Array.prototype.filter.call(
      document.querySelectorAll('footer'),
      function (f) { return !f.closest('article, aside, section, main'); }
    );
    return list.length ? list[list.length - 1] : null;
  }

  /* ─── Newsletter ─── */
  function initNewsletter(root) {
    var form = root.querySelector('#footer-nl-form');
    var feedback = root.querySelector('#footer-nl-feedback');
    if (!form || !feedback) return;

    function setFeedback(kind, state) {
      var lang = currentLang();
      var txt = form.getAttribute('data-' + kind + '-' + lang) ||
                form.getAttribute('data-' + kind + '-fr');
      if (txt) feedback.textContent = txt;
      feedback.removeAttribute('data-fr');          /* ne plus être retraduit */
      feedback.classList.remove('is-success', 'is-error');
      feedback.classList.add('is-' + (kind === 'ok' ? 'success' : 'error'));
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      if (btn) btn.disabled = true;

      fetch(form.action, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: new FormData(form)
      })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          form.reset();
          setFeedback('ok');
        })
        .catch(function () {
          setFeedback('err');
        })
        .then(function () {
          if (btn) btn.disabled = false;
        });
    });
  }

  /* ─── Chargement ─── */
  async function loadFooter() {
    try {
      var res = await fetch(FOOTER_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);

      var tpl = document.createElement('template');
      tpl.innerHTML = (await res.text()).trim();
      var node = tpl.content.querySelector('footer');
      if (!node) throw new Error('footer.html invalide');

      await ensureCss();
      translate(node);

      var target = findTarget();
      if (target) target.replaceWith(node);
      else document.body.appendChild(node);

      initNewsletter(node);

      /* Pages dynamiques : i18n.js met à jour <html lang> à chaque
         changement de langue, le footer suit. */
      new MutationObserver(function () { translate(node); })
        .observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

      /* Si i18n.js arrive après coup, on réapplique la bonne langue. */
      window.addEventListener('load', function () { translate(node); }, { once: true });

      document.dispatchEvent(new CustomEvent('albexia:footer-ready'));
    } catch (error) {
      console.error('[Albexia] Impossible de charger le footer :', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadFooter);
  } else {
    loadFooter();
  }
})();
