/* ═══════════════════════════════════════
   Albexia — niche.js
   JS partagé pour les 5 pages de niches
   ═══════════════════════════════════════ */

'use strict';

(async function () {

  // ─── 1. Lire l'id de la niche depuis le <body data-niche="..."> ───
  const NICHE_ID = document.body.dataset.niche;
  if (!NICHE_ID) return;

  // ─── 2. Charger les données en parallèle ───
  let nicheData, tools;
  try {
    const [r1, r2] = await Promise.all([
      fetch('../niches/niches.json'),
      fetch('../data/tools.json')
    ]);
    const allNiches = await r1.json();
    tools           = await r2.json();
    nicheData       = allNiches.find(n => n.id === NICHE_ID);
  } catch (e) {
    console.error('[niche.js] Erreur de chargement :', e);
    return;
  }

  if (!nicheData) {
    console.warn('[niche.js] Niche introuvable :', NICHE_ID);
    return;
  }

  // ─── 3. Filtrer les outils ───
  function normaliser(str) {
    return (str || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ').trim();
  }

  const tagsFiltres = (nicheData.tags_filtres || []).map(normaliser);
  const catsFiltres = (nicheData.categories_filtres || []).map(normaliser);

  let outilsFiltres = tools.filter(t => {
    if (t.langue && t.langue !== 'fr') return false;
    const cat   = normaliser(t.category || '');
    const tags  = (t.tags || []).map(normaliser);
    const desc  = normaliser(t.description || '');
    const matchCat = catsFiltres.includes(cat);
    const matchTag = tagsFiltres.some(tf => tags.includes(tf) || desc.includes(tf));
    return matchCat || matchTag;
  });

  // Trier par note décroissante
  outilsFiltres.sort((a, b) => (b.rating || 0) - (a.rating || 0));

  // Appliquer la limite si définie
  if (nicheData.limite) {
    outilsFiltres = outilsFiltres.slice(0, nicheData.limite);
  }

  // ─── 4. Injecter le badge limite ───
  const badgeEl = document.getElementById('niche-badge');
  if (badgeEl && nicheData.badge) {
    badgeEl.textContent = nicheData.badge;
    badgeEl.style.display = 'inline-flex';
  }

  // ─── 5. Compteur d'outils ───
  const countEl = document.getElementById('niche-tools-count');
  if (countEl) countEl.textContent = outilsFiltres.length;

  // ─── 6. Rendre la grille d'outils ───
  const grid = document.getElementById('niche-tools-grid');
  if (!grid) return;

  const catColors = {
    Texte:        'rgba(108,99,255,0.18)',
    Image:        'rgba(255,107,157,0.18)',
    Musique:      'rgba(0,212,170,0.18)',
    Code:         'rgba(108,99,255,0.18)',
    Vidéo:        'rgba(255,107,157,0.18)',
    Recherche:    'rgba(0,212,170,0.18)',
    Audio:        'rgba(108,99,255,0.18)',
    Productivité: 'rgba(245,166,35,0.18)',
    Autre:        'rgba(255,255,255,0.08)',
  };

  const priceLabel = { free: 'Gratuit', freemium: 'Freemium', paid: 'Payant' };

  function renderStars(r) {
    const n = Math.round(r || 0);
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }

  if (outilsFiltres.length === 0) {
    grid.innerHTML = `<p class="niche-empty">Aucun outil trouvé pour cette niche pour l'instant.</p>`;
    return;
  }

  grid.innerHTML = outilsFiltres.map(t => {
    const bg = catColors[t.category] || 'rgba(255,255,255,0.08)';
    const iconHtml = t.favicon
      ? `<img src="${t.favicon}" alt="${t.name}" class="tool-favicon"
            onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
         <span class="tool-ico-fallback" style="display:none">${t.emoji || '🤖'}</span>`
      : `<span class="tool-ico-fallback">${t.emoji || '🤖'}</span>`;

    const dest = t.page
      ? `window.location.href='../${t.page}'`
      : `window.open('${t.lien_affilie || t.url}','_blank')`;

    const affBadge = t.lien_affilie && t.lien_affilie !== t.url
      ? `<span class="niche-aff-badge">Lien affilié</span>` : '';

    return `
      <article class="tool-card" onclick="${dest}" style="cursor:pointer">
        <div class="tool-head">
          <div class="tool-ico" style="background:${bg}">${iconHtml}</div>
          <div style="flex:1;min-width:0">
            <div class="tool-name">${t.name}</div>
            <div class="tool-cat">${t.category}</div>
          </div>
        </div>
        <p class="tool-desc">${t.description}</p>
        <div class="tool-foot">
          <span class="price-tag price-${t.price}">${priceLabel[t.price] || t.price}</span>
          <span class="stars">${renderStars(t.rating)}</span>
          ${affBadge}
        </div>
      </article>`;
  }).join('');

  // ─── 7. Accordéon guide ───
  const accBtn  = document.getElementById('guide-accordion-btn');
  const accBody = document.getElementById('guide-accordion-body');
  if (accBtn && accBody) {
    accBtn.addEventListener('click', () => {
      const open = accBody.classList.toggle('open');
      accBtn.setAttribute('aria-expanded', open);
      accBtn.querySelector('.acc-chevron').style.transform = open ? 'rotate(180deg)' : 'rotate(0deg)';
    });
  }

  // ─── 8. Injecter le contenu du guide ───
  const guide = nicheData.guide;
  if (!guide) return;

  const guideIntro     = document.getElementById('guide-intro');
  const guideWorkflow  = document.getElementById('guide-workflow');
  const guideRenta     = document.getElementById('guide-rentabilite');
  const guideExpert    = document.getElementById('guide-expert');

  if (guideIntro) guideIntro.textContent = guide.intro;

  if (guideWorkflow && guide.workflow) {
    guideWorkflow.innerHTML = `
      <h3>${guide.workflow.titre}</h3>
      <ol class="guide-steps">
        ${guide.workflow.etapes.map(e => `<li>${e}</li>`).join('')}
      </ol>`;
  }

  if (guideRenta && guide.rentabilite) {
    guideRenta.innerHTML = `
      <h3>${guide.rentabilite.titre}</h3>
      <p>${guide.rentabilite.texte}</p>
      ${guide.rentabilite.avertissement
        ? `<div class="guide-warning">⚠️ ${guide.rentabilite.avertissement}</div>`
        : ''}`;
  }

  if (guideExpert && guide.conseil_expert) {
    guideExpert.innerHTML = `
      <h3>💡 ${guide.conseil_expert.titre}</h3>
      <p>${guide.conseil_expert.texte}</p>`;
  }

  // ─── 9. Articles liés ───
  const articlesWrap = document.getElementById('niche-articles');
  if (articlesWrap && nicheData.articles_lies?.length) {
    articlesWrap.innerHTML = nicheData.articles_lies.map(a => `
      <a href="${a.url}" class="niche-article-link">
        <span>📄 ${a.titre}</span>
        <span>→</span>
      </a>`).join('');
  }

})();
