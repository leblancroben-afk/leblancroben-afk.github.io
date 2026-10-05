/**
 * articles-loader.js — Albexia
 * Charge les articles liés à un outil depuis /data/articles.json et les injecte
 * dans la sidebar de sa fiche.
 *
 * Usage (généré par fiche-outil.js) :
 *   <script src="/js/articles-loader.js" data-outil="stable-diffusion"></script>
 *
 * Le plan de l'outil (Standard / Starter / Featured) n'intervient PLUS :
 * on affiche tous les articles disponibles pour l'outil (MAX_ARTICLES au plus).
 * S'il n'y en a aucun, la carte « Articles liés » est masquée.
 */
(function () {
  const MAX_ARTICLES = 3;   // plafond de sécurité pour la sidebar (2 articles → 2 affichés)

  const script = document.currentScript;
  const outil  = script && script.getAttribute('data-outil');
  if (!outil) return;

  // 'articles-sidebar' = fiches actuelles ; les 2 autres ids = anciennes fiches pas encore régénérées.
  const container = ['articles-sidebar', 'articles-sidebar-all', 'articles-sidebar-starter']
    .map(id => document.getElementById(id)).find(Boolean);
  if (!container) return;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hide = () => { const card = container.closest('.fo-articles'); if (card) card.style.display = 'none'; };

  fetch('/data/articles.json')
    .then(r => r.json())
    .then(data => {
      const articles = ((data[outil] || {}).articles || []).filter(a => a && a.lien && a.titre);
      if (!articles.length) { hide(); return; }

      container.innerHTML = articles.slice(0, MAX_ARTICLES).map(a => `
        <a href="${esc(a.lien)}" class="article-link-card">
          <div class="article-link-thumb">
            <img src="${esc(a.image)}" alt="${esc(a.titre)}" loading="lazy">
          </div>
          <div>
            <div class="article-link-title">${esc(a.titre)}</div>
            <div class="article-link-sub">${esc(a.soustitre)}</div>
          </div>
        </a>`).join('');
    })
    .catch(err => { console.warn('articles-loader : impossible de charger articles.json', err); hide(); });
})();
