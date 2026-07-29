/**
 * comparer.js — Albexia
 * Lit data/comparaisons.json et génère dynamiquement
 * la page de comparaison selon le slug de l'URL.
 *
 * Chemin JSON  : ../data/comparaisons.json
 * Utilisé par  : comparer/[slug].html
 */

'use strict';

// ── UTILITAIRES ──────────────────────────────────────────

function normaliserSlug(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function slugDepuisURL() {
  const fichier = window.location.pathname.split('/').pop().replace('.html', '');
  return fichier;
}

function noteClasse(note) {
  if (note >= 4.7) return 'note-top';
  if (note >= 4.4) return 'note-bon';
  return 'note-ok';
}

function logoHTML(outil, classeImg, classeFallback) {
  if (outil.favicon) {
    return `<img src="${outil.favicon}" alt="${outil.nom}" class="${classeImg}"
              onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <span class="${classeFallback}" style="display:none">${outil.emoji}</span>`;
  }
  return `<span class="${classeFallback}">${outil.emoji}</span>`;
}

// ── RENDU ────────────────────────────────────────────────

function renderMeta(comp) {
  document.title = comp.meta.title;
  document.querySelector('meta[name="description"]').content = comp.meta.description;
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.content = comp.meta.title;
}

function renderHero(comp) {
  const a = comp.outils[0], b = comp.outils[1];
  document.getElementById('cp-badge').textContent = 'Comparaison';
  document.getElementById('cp-titre').innerHTML =
    `${a.nom} <span class="vs-sep">vs</span> ${b.nom}`;
  document.getElementById('cp-resume').textContent = comp.resume;
}

function renderToolsHeader(comp) {
  const a = comp.outils[0], b = comp.outils[1];
  const wrap = document.getElementById('cp-tools-header');

  wrap.innerHTML = `
    <div class="cp-tool-card${a.winner ? ' winner' : ''}">
      ${logoHTML(a, 'cp-tool-logo', 'cp-tool-logo-fallback')}
      <div class="cp-tool-name">${a.nom}</div>
      <div class="cp-tool-cat">${a.categorie}</div>
      <span class="cp-tool-note ${noteClasse(a.note)}">${a.note} / 5</span>
    </div>
    <div class="cp-vs-divider">VS</div>
    <div class="cp-tool-card${b.winner ? ' winner' : ''}">
      ${logoHTML(b, 'cp-tool-logo', 'cp-tool-logo-fallback')}
      <div class="cp-tool-name">${b.nom}</div>
      <div class="cp-tool-cat">${b.categorie}</div>
      <span class="cp-tool-note ${noteClasse(b.note)}">${b.note} / 5</span>
    </div>`;
}

function renderTableau(comp) {
  const a = comp.outils[0], b = comp.outils[1];
  const logoA = a.favicon
    ? `<img src="${a.favicon}" alt="${a.nom}" onerror="this.style.display='none'">`
    : a.emoji;
  const logoB = b.favicon
    ? `<img src="${b.favicon}" alt="${b.nom}" onerror="this.style.display='none'">`
    : b.emoji;

  let lignes = '';
  comp.criteres.forEach(c => {
    const cellA = c.bool
      ? (c.a === true  ? '<span class="check-yes">✓</span>'
       : c.a === false ? '<span class="check-no">✗</span>'
       : '<span class="check-na">—</span>')
      : `<span style="color:var(--text);font-size:13px">${c.a}</span>`;

    const cellB = c.bool
      ? (c.b === true  ? '<span class="check-yes">✓</span>'
       : c.b === false ? '<span class="check-no">✗</span>'
       : '<span class="check-na">—</span>')
      : `<span style="color:var(--text);font-size:13px">${c.b}</span>`;

    lignes += `<tr>
      <td class="td-label">${c.label}</td>
      <td>${cellA}</td>
      <td>${cellB}</td>
    </tr>`;
  });

  document.getElementById('cp-tableau').innerHTML = `
    <table class="cp-table">
      <thead>
        <tr>
          <th>Critère</th>
          <th class="th-tool">${logoA} ${a.nom}</th>
          <th class="th-tool">${logoB} ${b.nom}</th>
        </tr>
      </thead>
      <tbody>${lignes}</tbody>
    </table>`;
}

function renderAvantages(comp) {
  const a = comp.outils[0], b = comp.outils[1];

  // Support du format tableau d'objets ou objet {a, b}
  const avA = Array.isArray(comp.avantages) ? comp.avantages : (comp.avantages.a || []);
  const avB = comp.avantages_b || (comp.avantages.b || []);
  const incA = comp.inconvenients.a || [];
  const incB = comp.inconvenients.b || [];

  function listeHTML(items, estPros) {
    const cls = estPros ? 'cp-pros-list' : 'cp-pros-list cp-cons-list';
    return `<ul class="${cls}">${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
  }

  document.getElementById('cp-avantages').innerHTML = `
    <div class="cp-pros-cons">
      <div class="cp-pros-card">
        <div class="cp-pros-card-title">
          ${a.favicon ? `<img src="${a.favicon}" alt="${a.nom}" onerror="this.style.display='none'">` : a.emoji}
          ${a.nom} — Points forts
        </div>
        ${listeHTML(avA, true)}
      </div>
      <div class="cp-pros-card">
        <div class="cp-pros-card-title">
          ${b.favicon ? `<img src="${b.favicon}" alt="${b.nom}" onerror="this.style.display='none'">` : b.emoji}
          ${b.nom} — Points forts
        </div>
        ${listeHTML(avB, true)}
      </div>
      <div class="cp-pros-card">
        <div class="cp-pros-card-title" style="color:var(--text-muted)">
          ${a.nom} — Limites
        </div>
        ${listeHTML(incA, false)}
      </div>
      <div class="cp-pros-card">
        <div class="cp-pros-card-title" style="color:var(--text-muted)">
          ${b.nom} — Limites
        </div>
        ${listeHTML(incB, false)}
      </div>
    </div>`;
}

function renderCasUsage(comp) {
  const a = comp.outils[0], b = comp.outils[1];
  document.getElementById('cp-cas-usage').innerHTML = `
    <div class="cp-cas-grid">
      <div class="cp-cas-card card-a">
        <div class="cp-cas-label">Choisissez</div>
        <div class="cp-cas-title">
          ${a.favicon ? `<img src="${a.favicon}" alt="${a.nom}" onerror="this.style.display='none'">` : a.emoji}
          ${a.nom}
        </div>
        <p class="cp-cas-text">${comp.cas_usage.choisir_a}</p>
      </div>
      <div class="cp-cas-card card-b">
        <div class="cp-cas-label">Choisissez</div>
        <div class="cp-cas-title">
          ${b.favicon ? `<img src="${b.favicon}" alt="${b.nom}" onerror="this.style.display='none'">` : b.emoji}
          ${b.nom}
        </div>
        <p class="cp-cas-text">${comp.cas_usage.choisir_b}</p>
      </div>
    </div>`;
}

function renderVerdict(comp) {
  const gagnant = comp.outils.find(o => o.nom === comp.verdict.gagnant) || comp.outils[0];
  const logoW = gagnant.favicon
    ? `<img src="${gagnant.favicon}" alt="${gagnant.nom}" onerror="this.style.display='none'">`
    : gagnant.emoji;

  document.getElementById('cp-verdict').innerHTML = `
    <div class="cp-verdict-card">
      <div class="cp-verdict-label">Notre verdict Albexia</div>
      <div class="cp-verdict-title">${logoW} 🏆 ${comp.verdict.gagnant} recommandé</div>
      <p class="cp-verdict-text">${comp.verdict.texte}</p>
    </div>`;
}

function renderFAQ(comp) {
  const items = comp.faq.map((f, i) => `
    <div class="cp-faq-item" id="faq-${i}">
      <button class="cp-faq-question" onclick="toggleFAQ(${i})">
        <span>${f.question}</span>
        <span class="cp-faq-arrow">▼</span>
      </button>
      <div class="cp-faq-answer">${f.reponse}</div>
    </div>`).join('');

  document.getElementById('cp-faq').innerHTML = `<div class="cp-faq">${items}</div>`;
}

function renderCTA(comp) {
  const a = comp.outils[0], b = comp.outils[1];
  const logoA = a.favicon
    ? `<img src="${a.favicon}" alt="${a.nom}" onerror="this.style.display='none'">` : '';
  const logoB = b.favicon
    ? `<img src="${b.favicon}" alt="${b.nom}" onerror="this.style.display='none'">` : '';

  document.getElementById('cp-cta').innerHTML = `
    <div class="cp-cta-wrap">
      <a href="${a.lien}" target="_blank" rel="noopener" class="cp-cta-btn cp-cta-a">
        ${logoA}<span>Essayer ${a.nom}</span><span>→</span>
      </a>
      <a href="${b.lien}" target="_blank" rel="noopener" class="cp-cta-btn cp-cta-b">
        ${logoB}<span>Essayer ${b.nom}</span><span>→</span>
      </a>
    </div>`;
}

// ── FAQ TOGGLE ───────────────────────────────────────────

function toggleFAQ(i) {
  const item = document.getElementById('faq-' + i);
  item.classList.toggle('open');
}

window.toggleFAQ = toggleFAQ;

// ── CHARGEMENT PRINCIPAL ─────────────────────────────────

async function init() {
  const slug = slugDepuisURL();

  try {
    const res = await fetch('../data/comparaisons.json');
    const data = await res.json();
    const comp = data.find(c => c.slug === slug);

    if (!comp) {
      document.body.innerHTML += `
        <div style="text-align:center;padding:80px 32px;color:#9090a8">
          <p style="font-size:18px;margin-bottom:12px">Comparaison introuvable</p>
          <a href="../comparateur.html" style="color:#a8a3ff">← Retour au comparateur</a>
        </div>`;
      return;
    }

    renderMeta(comp);
    renderHero(comp);
    renderToolsHeader(comp);
    renderTableau(comp);
    renderAvantages(comp);
    renderCasUsage(comp);
    renderVerdict(comp);
    renderFAQ(comp);
    renderCTA(comp);

  } catch (e) {
    console.error('Erreur chargement comparaisons.json :', e);
  }
}

document.addEventListener('DOMContentLoaded', init);
