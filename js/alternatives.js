/* ═══════════════════════════════════════
   alternatives.js
   /assets/js/alternatives.js
   ═══════════════════════════════════════ */

// ── État global ──
let activeFilter = 'tout';
let searchQuery  = '';
let DATA         = null;

// ── Correspondance filtres → tags ──
const filterMap = {
  'gratuit':    ['100% Gratuit', 'Gratuit'],
  'opensource': ['Open-Source dispos', 'No-Code', 'Self-Hosted', 'Web Tools'],
  'payasyougo': ['Pay-As-You-Go', 'API Hacks', 'Freemium']
};

// ── Chargement des données ──
fetch('../data/alternatives-data.json')
  .then(r => r.json())
  .then(data => {
    DATA = data;
    buildEstimateur(data.estimateur);
    buildCategories(data.categories);
  })
  .catch(err => {
    console.warn('alternatives-data.json introuvable :', err);
  });

// ═══════════════════════════════════════
// ESTIMATEUR
// ═══════════════════════════════════════

function buildEstimateur(outils) {
  const grid = document.getElementById('est-grid');
  grid.innerHTML = outils.map(o => `
    <div class="est-tool" data-prix="${o.prix}" data-prix-defaut="${o.prix}" onclick="toggleTool(event, this)">
      <img src="${o.logo}" alt="${o.nom}" onerror="this.style.display='none'" />
      <div class="est-tool-info">
        <div class="est-tool-name">${o.nom}</div>
        <div class="est-tool-price-wrap">
          <span class="est-tool-price-label">$</span>
          <input
            class="est-tool-price-input"
            type="number"
            min="0"
            step="0.01"
            value="${o.prix}"
            onclick="event.stopPropagation()"
            oninput="onPrixChange(event, this)"
            tabindex="-1"
          />
          <span class="est-tool-price-unit">/mois</span>
        </div>
      </div>
      <div class="est-tool-check">✓</div>
    </div>
  `).join('');
}

// Clic sur la tuile — toggle sélection
function toggleTool(event, el) {
  // Ne pas toggler si le clic vient de l'input
  if (event.target.classList.contains('est-tool-price-input')) return;
  el.classList.toggle('selected');
  // Activer la saisie quand sélectionné
  const input = el.querySelector('.est-tool-price-input');
  if (el.classList.contains('selected')) {
    input.removeAttribute('tabindex');
  } else {
    input.setAttribute('tabindex', '-1');
    // Remettre le prix par défaut si désélectionné
    input.value = el.dataset.prixDefaut;
    el.dataset.prix = el.dataset.prixDefaut;
  }
  updateEstimateur();
}

// Modification du prix dans l'input
function onPrixChange(event, input) {
  const tuile = input.closest('.est-tool');
  const val = parseFloat(input.value);
  tuile.dataset.prix = isNaN(val) || val < 0 ? 0 : val;
  updateEstimateur();
}

// Recalcul en temps réel
function updateEstimateur() {
  const selected = document.querySelectorAll('.est-tool.selected');
  let total = 0;
  selected.forEach(el => {
    total += parseFloat(el.dataset.prix) || 0;
  });
  const annuel = total * 12;

  document.getElementById('est-mensuel').textContent  = `$${total.toFixed(2)} / mois`;
  document.getElementById('est-annuel').textContent   = `$${annuel.toFixed(2)} / an`;
  document.getElementById('est-alt').textContent      = total > 0 ? `$0.00 – $4.50 / mois` : `$0.00`;
  document.getElementById('est-saving').textContent   = `$${annuel.toFixed(2)} / an`;
  document.getElementById('est-saving-note').textContent = total > 0
    ? `Économie potentielle maximale`
    : `Sélectionnez vos abonnements`;
}

// ═══════════════════════════════════════
// CATÉGORIES
// ═══════════════════════════════════════

function buildCategories(categories) {
  const container = document.getElementById('categories-container');
  container.innerHTML = categories.map(cat => buildCat(cat)).join('');
}

function buildCat(cat) {
  const alts = cat.alternatives.map(a => `
    <li class="alt-list-item" data-tag="${a.tag}">
      <a href="${a.url}">Alternatives à ${a.outil}</a>
      <span class="alt-list-sep">—</span>
      <span class="alt-list-desc">${a.description}</span>
      <span class="alt-list-tag">${a.tag}</span>
    </li>
  `).join('');

  const total = cat.alternatives.length + 1;

  return `
    <section class="alt-category" data-cat="${cat.id}">
      <div class="alt-cat-header">
        <span class="alt-cat-numero">${cat.emoji} ${cat.numero}</span>
        <h2 class="alt-cat-titre">${cat.titre}</h2>
        <span class="alt-cat-focus">${cat.focus}</span>
        <span class="alt-cat-count">${total} guides</span>
      </div>

      <a href="${cat.guide.url}" class="guide-card">
        <div class="guide-card-logo">
          <img src="${cat.guide.logo}" alt="${cat.guide.outil}" onerror="this.style.display='none'" />
        </div>
        <div class="guide-card-body">
          <div class="guide-card-label">Guide recommandé — ${cat.guide.outil}</div>
          <div class="guide-card-titre">${cat.guide.titre}</div>
          <div class="guide-card-desc">${cat.guide.description}</div>
          <div class="guide-card-meta">
            <span class="guide-card-economie">Économisez ${cat.guide.economie}</span>
            <span class="guide-card-metrique">${cat.guide.metrique}</span>
          </div>
        </div>
        <div class="guide-card-cta">Lire le guide</div>
      </a>

      <ul class="alt-list">${alts}</ul>
    </section>
  `;
}

// ═══════════════════════════════════════
// FILTRES & RECHERCHE
// ═══════════════════════════════════════

function setFilter(btn, filter) {
  document.querySelectorAll('#alt-filters .filter')
    .forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  activeFilter = filter;
  applyFilters();
}

function filterAlts() {
  searchQuery = document.getElementById('alt-search').value
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  applyFilters();
}

function applyFilters() {
  if (!DATA) return;

  document.querySelectorAll('.alt-category').forEach(catEl => {
    const cat = DATA.categories.find(c => c.id === catEl.dataset.cat);
    if (!cat) return;

    let visibleCount = 0;

    // Alternatives
    catEl.querySelectorAll('.alt-list-item').forEach(item => {
      const tag  = item.dataset.tag || '';
      const text = item.textContent.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      const matchFilter = activeFilter === 'tout'
        || (filterMap[activeFilter] || []).some(t =>
            tag.toLowerCase().includes(t.toLowerCase())
          );
      const matchSearch = !searchQuery || text.includes(searchQuery);

      item.style.display = (matchFilter && matchSearch) ? '' : 'none';
      if (matchFilter && matchSearch) visibleCount++;
    });

    // Carte guide
    const guideCard = catEl.querySelector('.guide-card');
    const guideText = (cat.guide.titre + ' ' + cat.guide.outil).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const guideVisible = !searchQuery || guideText.includes(searchQuery);
    guideCard.style.display = guideVisible ? '' : 'none';
    if (guideVisible) visibleCount++;

    catEl.style.display = visibleCount === 0 ? 'none' : '';
  });
}
