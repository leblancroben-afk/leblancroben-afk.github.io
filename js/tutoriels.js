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
  bindFiltres();
  bindEscape();
  lireHashURL();
});

/* ─── ACCORDÉON CARTE (aperçu 5 vidéos) ─── */
function toggleCarte(id) {
  const expand = document.getElementById(`expand-${id}`);
  const btn    = document.querySelector(`.tuto-card-btn[data-id="${id}"]`);
  const card   = document.getElementById(`carte-${id}`);
  if (!expand) return;

  const estOuverte = expand.classList.contains('open');

  /* Fermer la carte précédemment ouverte, s'il y en a une autre */
  if (TUTO.carteOuverte && TUTO.carteOuverte !== id) {
    const ancien    = document.getElementById(`expand-${TUTO.carteOuverte}`);
    const ancienBtn = document.querySelector(`.tuto-card-btn[data-id="${TUTO.carteOuverte}"]`);
    const ancienCard = document.getElementById(`carte-${TUTO.carteOuverte}`);
    if (ancien) { ancien.style.maxHeight = '0'; ancien.classList.remove('open'); }
    ancienBtn?.classList.remove('actif');
    ancienCard?.classList.remove('actif');
  }

  if (!estOuverte) {
    expand.classList.add('open');
    expand.style.maxHeight = expand.scrollHeight + 80 + 'px';
    btn?.classList.add('actif');
    card?.classList.add('actif');
    TUTO.carteOuverte = id;
    setTimeout(() => card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 200);
  } else {
    expand.style.maxHeight = '0';
    expand.classList.remove('open');
    btn?.classList.remove('actif');
    card?.classList.remove('actif');
    TUTO.carteOuverte = null;
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


/* ─── CATALOGUE : recherche, catégories (6 + toggle), pagination par lots ─── */
function bindFiltres() {
  const grille = document.getElementById('tuto-grille');
  if (!grille) return;
  const LOT = 20, CATS_VISIBLES = 6;
  const $ = (id) => document.getElementById(id);
  const cartes = Array.from(grille.querySelectorAll('.th-card'));
  const pills  = Array.from(document.querySelectorAll('.th-pill'));
  const champ  = $('tuto-recherche');
  const etat   = { cat: 'all', q: '', visibles: LOT, toutesCats: false };

  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const langue = () => (window.detecterLangue ? window.detecterLangue() : 'fr');
  const tr = (cle, defaut, vars) => {
    let s = window.t ? window.t(cle, langue()) : defaut;
    if (!s || s === cle) s = defaut;
    Object.keys(vars || {}).forEach((k) => { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  };

  function rendre() {
    const q = norm(etat.q);
    const ok = cartes.filter((c) =>
      (etat.cat === 'all' || c.dataset.cat === etat.cat) && (!q || norm(c.dataset.nom).includes(q)));
    const montrees = new Set(ok.slice(0, etat.visibles));
    cartes.forEach((c) => { c.hidden = !montrees.has(c); });

    /* Catégories : 6 premières, le reste derrière « Plus de catégories (+N) » */
    pills.forEach((p, i) => {
      p.classList.toggle('actif', p.dataset.cat === etat.cat);
      p.hidden = !etat.toutesCats && i >= CATS_VISIBLES && p.dataset.cat !== etat.cat;
    });
    const reste = pills.length - CATS_VISIBLES;
    const plus = $('th-more');
    if (plus) {
      plus.hidden = reste <= 0;
      plus.setAttribute('aria-expanded', String(etat.toutesCats));
      plus.querySelector('span').textContent = etat.toutesCats
        ? tr('tuto.lessCats', 'Voir moins')
        : tr('tuto.moreCats', 'Plus de catégories (+{n})', { n: reste });
    }
    const actif = pills.find((p) => p.dataset.cat === etat.cat);
    const lab = $('th-active');
    if (lab && actif) lab.textContent = tr('tuto.display', 'Affichage : {x}', { x: actif.querySelector('span').textContent });

    /* Compteurs et boutons */
    const res = $('th-results');
    if (res) res.textContent = ok.length > 1
      ? tr('tuto.resultMany', '{n} résultats', { n: ok.length })
      : tr('tuto.resultOne', '{n} résultat', { n: ok.length });
    const info = $('th-info');
    if (info) info.textContent = tr('tuto.showing', 'Affichage de {a} sur {b} outils', { a: montrees.size, b: ok.length });
    const restant = ok.length - montrees.size;
    const plusBtn = $('th-loadmore');
    if (plusBtn) {
      plusBtn.hidden = restant <= 0;
      plusBtn.querySelector('span').textContent = tr('tuto.loadMore', 'Charger {n} de plus', { n: Math.min(LOT, restant) });
    }
    const moinsBtn = $('th-less');
    if (moinsBtn) {
      moinsBtn.hidden = !(etat.visibles > LOT && ok.length > LOT);
      moinsBtn.querySelector('span').textContent = tr('tuto.backTop', 'Revenir au début ({n})', { n: LOT });
    }
    const vide = $('tuto-vide');
    if (vide) vide.hidden = ok.length > 0;
    grille.hidden = ok.length === 0;
    const pager = $('th-pager');
    if (pager) pager.hidden = ok.length === 0;
  }

  pills.forEach((p) => p.addEventListener('click', () => { etat.cat = p.dataset.cat; etat.visibles = LOT; rendre(); }));
  const plus = $('th-more');
  if (plus) plus.addEventListener('click', () => { etat.toutesCats = !etat.toutesCats; rendre(); });
  if (champ) champ.addEventListener('input', () => { etat.q = champ.value.trim(); etat.visibles = LOT; rendre(); });
  const plusBtn = $('th-loadmore');
  if (plusBtn) plusBtn.addEventListener('click', () => { etat.visibles += LOT; rendre(); });
  const moinsBtn = $('th-less');
  if (moinsBtn) moinsBtn.addEventListener('click', () => {
    etat.visibles = LOT; rendre();
    const sec = $('catalogue-section');
    if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  const reset = $('th-reset');
  if (reset) reset.addEventListener('click', () => {
    etat.cat = 'all'; etat.q = ''; etat.visibles = LOT;
    if (champ) champ.value = '';
    rendre();
  });

  /* Lien direct #outil : affiche la carte même si elle est hors du premier lot */
  const reveler = () => {
    const c = document.getElementById('carte-' + location.hash.slice(1));
    if (!c || !c.hidden) return;
    etat.cat = 'all'; etat.q = ''; etat.visibles = cartes.length;
    if (champ) champ.value = '';
    rendre();
  };
  window.addEventListener('hashchange', reveler);
  reveler();

  /* Tutoriel du jour : lecture + enregistrement (stockage local, par appareil) */
  [$('th-play'), $('th-watch')].forEach((b) => {
    if (b) b.addEventListener('click', () => ouvrirPlayer(b.dataset.yt, b.dataset.titre));
  });
  const CLE = 'albexia_tuto_saves';
  const lire = () => { try { return JSON.parse(localStorage.getItem(CLE) || '[]'); } catch (e) { return []; } };
  const ecrire = (a) => { try { localStorage.setItem(CLE, JSON.stringify(a)); } catch (e) {} };
  const bSave = $('th-save');
  const majSave = () => {
    if (!bSave) return;
    const on = lire().indexOf(bSave.dataset.yt) !== -1;
    bSave.classList.toggle('actif', on);
    bSave.setAttribute('aria-pressed', String(on));
    $('th-save-l').textContent = on ? tr('tuto.saved', 'Enregistré') : tr('tuto.save', 'Enregistrer');
  };
  if (bSave) bSave.addEventListener('click', () => {
    const l = lire(), i = l.indexOf(bSave.dataset.yt);
    if (i === -1) l.push(bSave.dataset.yt); else l.splice(i, 1);
    ecrire(l); majSave();
  });

  window.thRender = () => { rendre(); majSave(); };
  window.thRender();
}
