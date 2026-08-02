/* ═══════════════════════════════════════
   tutoriels.js — Albexia
   Page vitrine vidéothèque (tutoriels/index.html)

   Contrairement à l'ancienne version, ce fichier ne fetch plus
   data/tutoriels.json : toutes les cartes, vidéos, FAQ et le select de
   soumission sont déjà présents dans le HTML, générés par gen-fiches.js
   à partir de Firestore. Ce script ne gère plus que l'INTERACTION
   (accordéon, lecteur, modal soumission, FAQ, deep-link) — 100% des
   fonctionnalités de l'ancienne version sont conservées.
   ═══════════════════════════════════════ */

'use strict';

const TUTO = {
  carteOuverte: null,   // id de la carte actuellement dépliée (une seule à la fois)
  modalOuverte: false,
};

/* ─── INIT ─── */
document.addEventListener('DOMContentLoaded', () => {
  bindSoumission();
  bindEscape();
  lireHashURL();
});

/* ─── ACCORDÉON CARTE (aperçu 5 vidéos) ─── */
function toggleCarte(id) {
  const expand = document.getElementById(`expand-${id}`);
  const btn    = document.querySelector(`.tuto-btn-voir[data-id="${id}"]`);
  if (!expand) return;

  const ouvert = TUTO.carteOuverte === id;

  /* Fermer la carte précédemment ouverte, s'il y en a une autre */
  if (TUTO.carteOuverte && TUTO.carteOuverte !== id) {
    const prevExpand = document.getElementById(`expand-${TUTO.carteOuverte}`);
    const prevBtn     = document.querySelector(`.tuto-btn-voir[data-id="${TUTO.carteOuverte}"]`);
    prevExpand?.classList.remove('open');
    prevBtn?.classList.remove('actif');
  }

  if (ouvert) {
    expand.classList.remove('open');
    btn?.classList.remove('actif');
    TUTO.carteOuverte = null;
  } else {
    expand.classList.add('open');
    btn?.classList.add('actif');
    TUTO.carteOuverte = id;
    expand.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/* ─── DEEP-LINK PAR HASH (#chatgpt → ouvre directement la carte) ─── */
function lireHashURL() {
  const hash = window.location.hash.replace('#', '');
  if (!hash) return;
  const carte = document.getElementById(`carte-${hash}`);
  if (!carte) return;
  setTimeout(() => {
    carte.scrollIntoView({ behavior: 'smooth', block: 'center' });
    toggleCarte(hash);
  }, 300);
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
  TUTO.modalOuverte = true;
}

function fermerPlayer() {
  const modal  = document.getElementById('tuto-player-modal');
  const iframe = document.getElementById('tuto-player-iframe');
  if (!modal) return;
  modal.classList.remove('open');
  if (iframe) iframe.src = '';
  document.body.style.overflow = '';
  TUTO.modalOuverte = false;
}

/* Clic sur le fond (backdrop) pour fermer */
document.addEventListener('click', e => {
  if (e.target.id === 'tuto-player-modal')     fermerPlayer();
  if (e.target.id === 'tuto-modal-soumission') fermerModalSoumission();
});

function bindEscape() {
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (TUTO.modalOuverte) fermerPlayer();
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

/* ─── FAQ ─── */
function toggleFAQ(i) {
  const item = document.getElementById(`faq-${i}`);
  const rep  = document.getElementById(`faq-rep-${i}`);
  const btn  = item?.querySelector('.faq-question');
  if (!item || !rep) return;
  const ouvert = item.classList.contains('active');
  if (ouvert) {
    item.classList.remove('active');
    rep.style.maxHeight = '0';
    btn?.setAttribute('aria-expanded', 'false');
  } else {
    item.classList.add('active');
    rep.style.maxHeight = rep.scrollHeight + 'px';
    btn?.setAttribute('aria-expanded', 'true');
  }
}

/* ─── EXPORTS GLOBAUX ─── */
window.toggleCarte           = toggleCarte;
window.ouvrirPlayer          = ouvrirPlayer;
window.fermerPlayer          = fermerPlayer;
window.ouvrirModalSoumission = ouvrirModalSoumission;
window.fermerModalSoumission = fermerModalSoumission;
window.toggleFAQ             = toggleFAQ;
