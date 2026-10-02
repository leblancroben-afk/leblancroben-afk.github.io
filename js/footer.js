/* =========================================================
   FOOTER PARTAGÉ — Albexia
   Charge /components/footer.html et remplace le footer de la page
   (ou l'ajoute en fin de <body> s'il n'y en a pas).
   Si le chargement échoue, le footer d'origine reste en place.

   MODE STATIQUE : si la page contient déjà <footer id="site-footer" data-static>
   (pages générées par gen-fiches.js, déjà traduites), rien n'est chargé ni
   traduit : le script se contente d'activer le formulaire newsletter.
   ========================================================= */
(function () {
  'use strict';

  if (window.__albexiaFooterLoaded) return;
  window.__albexiaFooterLoaded = true;

  var FOOTER_URL = '/components/footer.html';
  var CSS_URL = '/css/footer.css';
  var LS_LANG_KEY = 'albexia_langue';

  function currentLang() {
    if (typeof window.detecterLangue === 'function') {
      try { return window.detecterLangue(); } catch (e) { /* on retombe sur localStorage */ }
    }
    try { return localStorage.getItem(LS_LANG_KEY) || 'fr'; } catch (e) { return 'fr'; }
  }

  function tr(key) {
    return typeof window.t === 'function' ? window.t(key, currentLang()) : null;
  }

  function ensureCss() {
    if (document.getElementById('albexia-footer-css')) return;
    var link = document.createElement('link');
    link.id = 'albexia-footer-css';
    link.rel = 'stylesheet';
    link.href = CSS_URL;
    document.head.appendChild(link);
  }

  /* Footer de page à remplacer : #site-footer, sinon le dernier <footer>
     qui n'est pas imbriqué dans un article / une section. */
  function findTarget() {
    var byId = document.getElementById('site-footer');
    if (byId) return byId;
    var list = Array.prototype.filter.call(
      document.querySelectorAll('footer'),
      function (f) { return !f.closest('article, aside, section, main'); }
    );
    return list.length ? list[list.length - 1] : null;
  }

  /* Traduit uniquement les éléments du footer (pas tout le document).
     Si une clé manque dans i18n.js, t() renvoie la clé elle-même :
     dans ce cas on garde le texte français déjà présent dans le HTML. */
  function translateFooter(root) {
    if (typeof window.t !== 'function') return false;
    var lang = currentLang();
    function val(key) {
      var v = window.t(key, lang);
      return v && v !== key ? v : null;
    }
    root.querySelectorAll('[data-i18n]').forEach(function (el) {
      var v = val(el.getAttribute('data-i18n'));
      if (v !== null) el.textContent = v;
    });
    root.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var v = val(el.getAttribute('data-i18n-html'));
      if (v !== null) el.innerHTML = v;
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var v = val(el.getAttribute('data-i18n-placeholder'));
      if (v !== null) el.setAttribute('placeholder', v);
    });
    return true;
  }

  function initNewsletter(root) {
    var form = root.querySelector('#footer-nl-form');
    var feedback = root.querySelector('#footer-nl-feedback');
    if (!form || !feedback) return;

    function setFeedback(key, state) {
      feedback.classList.remove('is-success', 'is-error');
      if (state) feedback.classList.add('is-' + state);

      /* Mode statique : messages déjà traduits dans le HTML. */
      var staticMsg = form.getAttribute(state === 'success' ? 'data-msg-success' : 'data-msg-error');
      if (staticMsg) { feedback.textContent = staticMsg; return; }

      feedback.setAttribute('data-i18n', key);
      var txt = tr(key);
      if (txt && txt !== key) feedback.textContent = txt;
      else feedback.textContent = state === 'success'
        ? '✓ Merci, vous êtes inscrit !'
        : 'Une erreur est survenue, réessayez.';
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
          setFeedback('footer.newsletterSuccess', 'success');
        })
        .catch(function () {
          setFeedback('footer.newsletterError', 'error');
        })
        .then(function () {
          if (btn) btn.disabled = false;
        });
    });
  }

  async function loadFooter() {
    var existing = document.getElementById('site-footer');
    if (existing && existing.hasAttribute('data-static')) {
      initNewsletter(existing);
      document.dispatchEvent(new CustomEvent('albexia:footer-ready'));
      return;
    }
    try {
      var res = await fetch(FOOTER_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);

      var tpl = document.createElement('template');
      tpl.innerHTML = (await res.text()).trim();
      var node = tpl.content.firstElementChild;
      if (!node || node.tagName !== 'FOOTER') throw new Error('footer.html invalide');

      ensureCss();

      var target = findTarget();
      if (target) target.replaceWith(node);
      else document.body.appendChild(node);

      /* Si i18n.js n'est pas encore prêt, on réessaie une fois au "load".
         Les changements de langue ultérieurs sont gérés par i18n.js
         (appliquerTraductionsStatiques parcourt tout le document). */
      if (!translateFooter(node)) {
        window.addEventListener('load', function () { translateFooter(node); }, { once: true });
      }

      initNewsletter(node);
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
