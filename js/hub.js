/* ════════════════════════════════════════
   HUB.JS — Carte Outil Vedette (Spotlight)
   Albexia · js/hub.js
   ════════════════════════════════════════ */

(function () {
  'use strict';

  // ── CONFIG ──────────────────────────────
  const TOOLS_JSON   = 'data/tools.json';  // chemin depuis la racine
  const DISPLAY_MS   = 6000;               // durée d'affichage (ms)
  const CONTAINER_ID = 'hub-spotlight';

  // Types de questions générées automatiquement
  const QUESTION_TYPES = [
    (t) => `Qu'est-ce que ${t.name} ?`,
    (t) => `Saviez-vous que ${t.name} peut ${t.description.split('.')[0].toLowerCase()} ?`,
    (t) => `Pourquoi utiliser ${t.name} aujourd'hui ?`,
    (t) => `${t.name} : l'outil idéal pour ${t.category.toLowerCase()} ?`,
    (t) => `Avez-vous déjà essayé ${t.name} pour votre travail ?`,
  ];

  // ── ÉTAT ────────────────────────────────
  let tools      = [];
  let usedIndex  = new Set();
  let timer      = null;
  let container  = null;
  let spotEl     = null;

  // ── INIT ────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    container = document.getElementById(CONTAINER_ID);
    if (!container) return;

    try {
      const res  = await fetch(TOOLS_JSON);
      const data = await res.json();
      // Garder uniquement les outils français avec une page dédiée
      tools = data.filter(t =>
        t.langue === 'fr' &&
        t.name && t.description && t.category
      );
      if (tools.length === 0) return;
      showNext();
    } catch (e) {
      // Silencieux en cas d'erreur réseau
      console.warn('[hub.js] Impossible de charger tools.json', e);
    }
  }

  // ── PIOCHER UN OUTIL ALÉATOIRE ──────────
  function pickRandom() {
    if (usedIndex.size >= tools.length) usedIndex.clear();
    let idx;
    do {
      idx = Math.floor(Math.random() * tools.length);
    } while (usedIndex.has(idx));
    usedIndex.add(idx);
    return tools[idx];
  }

  // ── GÉNÉRER LA QUESTION ─────────────────
  function buildQuestion(tool) {
    const fn = QUESTION_TYPES[Math.floor(Math.random() * QUESTION_TYPES.length)];
    return fn(tool);
  }

  // ── CONSTRUIRE LE HTML DE LA CARTE ──────
  function buildCard(tool) {
    const question = buildQuestion(tool);
    const dest     = tool.page ? tool.page : `index.html`;
    const priceMap = {
      free:     { label: 'Gratuit',  cls: 'price-free'     },
      freemium: { label: 'Freemium', cls: 'price-freemium' },
      paid:     { label: 'Payant',   cls: 'price-paid'     },
    };
    const price = priceMap[tool.price] || priceMap['freemium'];

    // Favicon ou emoji
    const icoHTML = tool.favicon
      ? `<img src="${tool.favicon}" alt="${tool.name}" onerror="this.parentElement.textContent='${tool.emoji || '🤖'}';">`
      : `${tool.emoji || '🤖'}`;

    const card = document.createElement('div');
    card.className = 'hub-spotlight entering';
    card.setAttribute('role', 'complementary');
    card.setAttribute('aria-label', `Outil vedette : ${tool.name}`);
    card.innerHTML = `
      <div class="hub-spot-label">✨ Outil à découvrir</div>
      <div class="hub-spot-body">
        <div class="hub-spot-ico">${icoHTML}</div>
        <div class="hub-spot-info">
          <div class="hub-spot-name">${tool.name}</div>
          <div class="hub-spot-type">${tool.category}</div>
        </div>
      </div>
      <div class="hub-spot-question">${question}</div>
      <div class="hub-spot-footer">
        <div class="hub-spot-progress">
          <div class="hub-spot-bar" id="spot-bar"></div>
        </div>
        <button class="hub-spot-skip" id="spot-skip" aria-label="Passer au suivant">Suivant →</button>
      </div>
    `;

    // Clic sur la carte → ouvrir la page de l'outil
    card.addEventListener('click', (e) => {
      if (e.target.id === 'spot-skip' || e.target.closest('#spot-skip')) return;
      window.location.href = dest;
    });

    // Bouton skip
    card.querySelector('#spot-skip').addEventListener('click', (e) => {
      e.stopPropagation();
      scheduleNext(true);
    });

    return card;
  }

  // ── AFFICHER LA PROCHAINE CARTE ─────────
  function showNext() {
    const tool = pickRandom();
    const newCard = buildCard(tool);

    if (spotEl) {
      // Animation sortie de l'ancienne carte
      spotEl.classList.remove('entering');
      spotEl.classList.add('leaving');
      const oldCard = spotEl;
      setTimeout(() => {
        if (container.contains(oldCard)) container.removeChild(oldCard);
      }, 350);
    }

    container.appendChild(newCard);
    spotEl = newCard;

    // Démarrer le timer
    clearTimeout(timer);
    scheduleNext(false);
  }

  function scheduleNext(immediate) {
    clearTimeout(timer);
    const delay = immediate ? 0 : DISPLAY_MS;
    if (immediate) {
      showNext();
    } else {
      // Relancer la barre de progression en recréant l'élément
      const bar = spotEl ? spotEl.querySelector('#spot-bar') : null;
      if (bar) {
        bar.style.animation = 'none';
        bar.offsetHeight; // reflow
        bar.style.animation = `hub-spot-countdown ${DISPLAY_MS / 1000}s linear forwards`;
      }
      timer = setTimeout(showNext, delay);
    }
  }

})();
