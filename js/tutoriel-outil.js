/* ═══════════════════════════════════════
   tutoriel-outil.js — Albexia
   Page vidéothèque d'un outil (tools/{plan}/{langue}/{slug}/tutoriels/)

   Contrairement à l'ancienne version, ce fichier ne fetch plus
   data/tutoriels.json et ne prend plus l'outil via ?outil=... : toutes
   les cartes vidéo sont déjà présentes dans le HTML (générées par
   gen-fiches.js depuis Firestore). Le filtre type/durée agit donc
   directement sur les cartes déjà dans le DOM (affichage/masquage),
   au lieu de reconstruire la grille depuis un tableau — comportement
   visible strictement identique, implémentation adaptée à la donnée
   pré-rendue.
   ═══════════════════════════════════════ */

'use strict';

const OUTIL = {
  filtreType: 'tout',          // 'tout' | 'video'
  filtreDureeMin: 0,
  filtreDureeMax: 999999,
  dropdownOuvert: false,
  modalOuverte: false,
};

/* ─── INIT ─── */
document.addEventListener('DOMContentLoaded', () => {
  bindFiltres();
  bindSoumission();
  bindEscape();
  appliquerFiltres();
});

/* ─── FILTRES ─── */
function bindFiltres() {
  const btnDuree = document.getElementById('btn-duree-dropdown');
  const dropdown = document.getElementById('duree-dropdown');

  btnDuree?.addEventListener('click', e => {
    e.stopPropagation();
    OUTIL.dropdownOuvert = !OUTIL.dropdownOuvert;
    dropdown?.classList.toggle('open', OUTIL.dropdownOuvert);
    btnDuree.classList.toggle('actif', OUTIL.dropdownOuvert);
  });

  document.addEventListener('click', () => {
    if (OUTIL.dropdownOuvert) {
      OUTIL.dropdownOuvert = false;
      dropdown?.classList.remove('open');
      btnDuree?.classList.remove('actif');
    }
  });
}

function toggleDureeDropdown() {
  const btn = document.getElementById('btn-duree-dropdown');
  const dropdown = document.getElementById('duree-dropdown');
  OUTIL.dropdownOuvert = !OUTIL.dropdownOuvert;
  dropdown?.classList.toggle('open', OUTIL.dropdownOuvert);
  btn?.classList.toggle('actif', OUTIL.dropdownOuvert);
}

function setFiltreType(type) {
  OUTIL.filtreType = type;

  ['tout', 'video'].forEach(t => {
    document.getElementById(`filtre-${t}`)?.classList.toggle('actif', t === type);
  });

  const wrapDuree = document.getElementById('wrap-duree');
  if (wrapDuree) wrapDuree.style.display = type === 'video' ? 'flex' : 'none';

  if (type !== 'video') {
    OUTIL.filtreDureeMin = 0;
    OUTIL.filtreDureeMax = 999999;
    const labelEl = document.getElementById('btn-duree-label');
    if (labelEl) labelEl.textContent = 'Durée';
    document.querySelectorAll('.duree-option').forEach((el, i) => el.classList.toggle('actif', i === 0));
  }

  appliquerFiltres();
}

function setFiltreDuree(min, max, el, label) {
  OUTIL.filtreDureeMin = min;
  OUTIL.filtreDureeMax = max;

  document.querySelectorAll('.duree-option').forEach(o => o.classList.remove('actif'));
  el.classList.add('actif');
  const labelEl = document.getElementById('btn-duree-label');
  if (labelEl) labelEl.textContent = (label === 'Tout') ? 'Durée' : label;

  OUTIL.dropdownOuvert = false;
  document.getElementById('duree-dropdown')?.classList.remove('open');
  document.getElementById('btn-duree-dropdown')?.classList.remove('actif');

  appliquerFiltres();
}

/* Filtre les cartes déjà présentes dans le DOM (data-secondes posé au
   build par carteVideoHTML()) au lieu de reconstruire la grille. */
function appliquerFiltres() {
  const cartes   = document.querySelectorAll('.outil-video-card[data-secondes]');
  const compteur = document.getElementById('outil-video-count');
  let visibles = 0;

  cartes.forEach(carte => {
    const secondes = Number(carte.dataset.secondes);
    const ok = OUTIL.filtreType === 'video'
      ? (secondes >= OUTIL.filtreDureeMin && secondes <= OUTIL.filtreDureeMax)
      : true;
    carte.style.display = ok ? '' : 'none';
    if (ok) visibles++;
  });

  if (compteur) compteur.textContent = `${visibles} résultat${visibles > 1 ? 's' : ''}`;

  const grille = document.getElementById('outil-video-grille');
  let videEl = document.getElementById('outil-vide');
  if (visibles === 0) {
    if (!videEl) {
      videEl = document.createElement('div');
      videEl.id = 'outil-vide';
      videEl.className = 'outil-vide';
      videEl.innerHTML = `
        <span class="outil-vide-ico">🎬</span>
        <p>Aucune vidéo ne correspond à ce filtre.</p>
        <button class="tuto-card-btn" onclick="setFiltreType('tout')">Voir toutes les vidéos</button>`;
      grille?.appendChild(videEl);
    }
    videEl.style.display = '';
  } else if (videEl) {
    videEl.style.display = 'none';
  }
}

/* ─── PLAYER MODAL ─── */
function ouvrirPlayer(youtubeId, titre) {
  const modal   = document.getElementById('tuto-player-modal');
  const iframe  = document.getElementById('tuto-player-iframe');
  const titreEl = document.getElementById('tuto-player-titre');
  if (!modal || !iframe) return;
  iframe.src = `https://www.youtube.com/embed/${youtubeId}?autoplay=1&rel=0`;
  if (titreEl) titreEl.textContent = titre;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  OUTIL.modalOuverte = true;
}

function fermerPlayer() {
  const modal  = document.getElementById('tuto-player-modal');
  const iframe = document.getElementById('tuto-player-iframe');
  if (!modal) return;
  modal.classList.remove('open');
  if (iframe) iframe.src = '';
  document.body.style.overflow = '';
  OUTIL.modalOuverte = false;
}

document.addEventListener('click', e => {
  if (e.target.id === 'tuto-player-modal')     fermerPlayer();
  if (e.target.id === 'tuto-modal-soumission') fermerModalSoumission();
});

function bindEscape() {
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (OUTIL.modalOuverte) fermerPlayer();
    if (document.getElementById('tuto-modal-soumission')?.classList.contains('open')) fermerModalSoumission();
  });
}

/* ─── MODAL SOUMISSION ─── */
function ouvrirModalSoumission(outilId, outilNom) {
  const modal = document.getElementById('tuto-modal-soumission');
  const nomEl = document.getElementById('soumission-outil-nom');
  const idEl  = document.getElementById('soumission-outil-id');
  if (!modal) return;
  if (nomEl) nomEl.textContent = outilNom || 'cet outil';
  if (idEl)  idEl.value = outilId || '';
  const sel = document.getElementById('s-outil');
  if (sel && outilId) sel.value = outilId;
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function fermerModalSoumission() {
  const modal = document.getElementById('tuto-modal-soumission');
  if (modal) { modal.classList.remove('open'); document.body.style.overflow = ''; }
}

function bindSoumission() {
  document.getElementById('soumission-fermer')?.addEventListener('click', fermerModalSoumission);

  document.getElementById('form-soumission')?.addEventListener('submit', e => {
    e.preventDefault();
    const btn  = document.getElementById('soumission-submit');
    const form = document.getElementById('form-soumission');
    if (btn) { btn.textContent = 'Envoi…'; btn.disabled = true; }

    fetch('https://formspree.io/f/xvzyjkaa', {
      method:  'POST',
      body:    new FormData(form),
      headers: { 'Accept': 'application/json' }
    }).then(() => {
      if (btn) { btn.textContent = 'Envoyé ✓'; btn.classList.add('success'); }
      setTimeout(() => {
        fermerModalSoumission();
        if (btn) { btn.textContent = 'Soumettre la vidéo →'; btn.disabled = false; btn.classList.remove('success'); }
        form.reset();
      }, 2000);
    }).catch(() => {
      if (btn) { btn.textContent = 'Erreur — Réessayez'; btn.disabled = false; }
    });
  });
}

/* ─── EXPORTS GLOBAUX ─── */
window.ouvrirPlayer          = ouvrirPlayer;
window.fermerPlayer          = fermerPlayer;
window.ouvrirModalSoumission = ouvrirModalSoumission;
window.fermerModalSoumission = fermerModalSoumission;
window.setFiltreType         = setFiltreType;
window.setFiltreDuree        = setFiltreDuree;
window.toggleDureeDropdown   = toggleDureeDropdown;
