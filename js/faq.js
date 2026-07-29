/* ═══════════════════════════════════════
   Albexia — js/faq.js
   Hub central FAQ
   Dépend de : data/faq.json
   ═══════════════════════════════════════ */

(function () {
  'use strict';

  /* ─── ÉLÉMENTS DOM ─── */
  const container   = document.getElementById('faq-categories');
  const searchInput = document.getElementById('faq-search');
  const noResult    = document.getElementById('faq-no-result');
  const countEl     = document.getElementById('faq-visible-count');

  /* ─── UTILITAIRES ─── */
  function normalize(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function highlight(text, query) {
    if (!query) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
  }

  function buildURL(id) {
    /* Adapter si l'arborescence change */
    return `../faq/${id}/`;
  }

  /* ─── RENDU ─── */
  function render(data, query) {
    const q = normalize(query || '');
    container.innerHTML = '';
    let totalVisible = 0;
    let anyCategoryVisible = false;

    data.forEach(function (cat) {
      const matchingQuestions = cat.questions.filter(function (item) {
        return !q || normalize(item.question).includes(q);
      });

      if (matchingQuestions.length === 0) return;

      anyCategoryVisible = true;
      totalVisible += matchingQuestions.length;

      /* Section catégorie */
      const section = document.createElement('section');
      section.className = 'faq-category';
      section.setAttribute('aria-label', cat.label);

      /* Titre catégorie */
      const title = document.createElement('h2');
      title.className = 'faq-category-title';
      title.innerHTML =
        '<span class="cat-emoji">' + cat.emoji + '</span>' +
        cat.label +
        '<span class="faq-category-count">' + matchingQuestions.length + '</span>';

      /* Liste */
      const ul = document.createElement('ul');
      ul.className = 'faq-list';
      ul.setAttribute('role', 'list');

      matchingQuestions.forEach(function (item) {
        const li = document.createElement('li');
        li.className = 'faq-item';

        const a = document.createElement('a');
        a.href      = buildURL(item.id);
        a.className = 'faq-link';
        a.innerHTML = highlight(item.question, query ? query.trim() : '');

        li.appendChild(a);
        ul.appendChild(li);
      });

      section.appendChild(title);
      section.appendChild(ul);
      container.appendChild(section);
    });

    /* État aucun résultat */
    noResult.classList.toggle('visible', !anyCategoryVisible);

    /* Compteur */
    if (countEl) countEl.textContent = totalVisible;
  }

  /* ─── CHARGEMENT DES DONNÉES ─── */
  fetch('../data/faq.json')
    .then(function (res) {
      if (!res.ok) throw new Error('Erreur chargement faq.json : ' + res.status);
      return res.json();
    })
    .then(function (data) {
      /* Rendu initial */
      render(data, '');

      /* Recherche en temps réel */
      searchInput.addEventListener('input', function () {
        render(data, searchInput.value);
      });
    })
    .catch(function (err) {
      console.error(err);
      container.innerHTML =
        '<p class="faq-no-result visible">Impossible de charger les questions. Veuillez recharger la page.</p>';
    });

})();
