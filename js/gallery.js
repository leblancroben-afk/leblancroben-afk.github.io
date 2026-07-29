/* ═══════════════════════════════════════
   AnnuaireIA — gallery.js  v2
   Logique pure : open/close/navigate/zoom
   Le HTML est dans index.html, le CSS dans style.css
   ═══════════════════════════════════════ */

'use strict';

// ─── ÉTAT ────────────────────────────────
const lb = {
  items:    [],
  index:    0,
  zoom:     1,
  dragging: false,
  startX:   0, startY:   0,
  panX:     0, panY:     0,
  lastPanX: 0, lastPanY: 0,
};

// ─── OUVRIR ──────────────────────────────
function openLightbox(items, index) {
  lb.items = items;
  lb.index = index;
  resetZoom();
  document.getElementById('lb-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  loadItem();
}

// ─── FERMER ──────────────────────────────
function closeLightbox() {
  document.getElementById('lb-overlay').classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('lb-video').pause();
  document.getElementById('lb-audio').pause();
}

// ─── CHARGER UN MÉDIA ────────────────────
function loadItem() {
  const item = lb.items[lb.index];
  if (!item) return;

  const img       = document.getElementById('lb-img');
  const video     = document.getElementById('lb-video');
  const audioWrap = document.getElementById('lb-audio-wrap');
  const audio     = document.getElementById('lb-audio');

  // Reset
  img.classList.remove('active');
  video.classList.remove('active');
  audioWrap.classList.remove('active');
  video.pause(); video.src = '';
  audio.pause(); audio.src = '';
  resetZoom();

  // Infos
  document.getElementById('lb-title').textContent = item.title;
  document.getElementById('lb-tool').textContent  = item.tool;
  document.getElementById('lb-counter').textContent =
    `${lb.index + 1} / ${lb.items.length}`;

  // Flèches
  const showNav = lb.items.length > 1;
  document.getElementById('lb-prev').style.display = showNav ? '' : 'none';
  document.getElementById('lb-next').style.display = showNav ? '' : 'none';

  // Zoom uniquement pour images
  document.getElementById('lb-zoom-controls').style.display =
    item.type === 'image' ? '' : 'none';

  // Charger le média
  if (item.type === 'image') {
    img.src = item.src;
    img.classList.add('active');
  } else if (item.type === 'vidéo') {
    video.src = item.src;
    video.classList.add('active');
    video.load();
  } else if (item.type === 'musique') {
    document.getElementById('lb-audio-art').textContent   = '🎵';
    document.getElementById('lb-audio-title').textContent = item.title;
    audio.src = item.src;
    audioWrap.classList.add('active');
  }
}

// ─── NAVIGATION ──────────────────────────
function lbPrev() {
  lb.index = (lb.index - 1 + lb.items.length) % lb.items.length;
  loadItem();
}
function lbNext() {
  lb.index = (lb.index + 1) % lb.items.length;
  loadItem();
}

// ─── ZOOM ────────────────────────────────
function resetZoom() {
  lb.zoom = 1; lb.panX = 0; lb.panY = 0;
  lb.lastPanX = 0; lb.lastPanY = 0;
  applyTransform();
}

function setZoom(z) {
  lb.zoom = Math.min(5, Math.max(1, z));
  if (lb.zoom === 1) { lb.panX = 0; lb.panY = 0; }
  applyTransform();
}

function applyTransform() {
  const img = document.getElementById('lb-img');
  if (!img) return;
  img.style.transform =
    `scale(${lb.zoom}) translate(${lb.panX / lb.zoom}px, ${lb.panY / lb.zoom}px)`;
  document.getElementById('lb-zoom-level').textContent =
    Math.round(lb.zoom * 100) + '%';
}

// ─── ÉVÉNEMENTS ──────────────────────────
function bindLightboxEvents() {
  const overlay = document.getElementById('lb-overlay');
  const wrap    = document.getElementById('lb-media-wrap');
  const img     = document.getElementById('lb-img');
  if (!overlay) return;

  // Fermer
  document.getElementById('lb-close').addEventListener('click', closeLightbox);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeLightbox();
  });

  // Navigation
  document.getElementById('lb-prev').addEventListener('click', lbPrev);
  document.getElementById('lb-next').addEventListener('click', lbNext);

  // Zoom boutons
  document.getElementById('lb-zoom-in')
    .addEventListener('click', () => setZoom(lb.zoom + 0.5));
  document.getElementById('lb-zoom-out')
    .addEventListener('click', () => setZoom(lb.zoom - 0.5));
  document.getElementById('lb-zoom-reset')
    .addEventListener('click', () => resetZoom());

  // Double-clic → zoom rapide
  img.addEventListener('dblclick', () => {
    lb.zoom === 1 ? setZoom(2.5) : resetZoom();
  });

  // Molette → zoom
  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    setZoom(lb.zoom + (e.deltaY > 0 ? -0.25 : 0.25));
  }, { passive: false });

  // Drag (pan quand zoomé) — souris
  wrap.addEventListener('mousedown', e => {
    if (lb.zoom <= 1) return;
    lb.dragging = true;
    lb.startX = e.clientX - lb.lastPanX;
    lb.startY = e.clientY - lb.lastPanY;
    wrap.classList.add('dragging');
  });
  window.addEventListener('mousemove', e => {
    if (!lb.dragging) return;
    lb.panX = e.clientX - lb.startX;
    lb.panY = e.clientY - lb.startY;
    applyTransform();
  });
  window.addEventListener('mouseup', () => {
    if (!lb.dragging) return;
    lb.dragging = false;
    lb.lastPanX = lb.panX;
    lb.lastPanY = lb.panY;
    wrap.classList.remove('dragging');
  });

  // ── TACTILE ────────────────────────────
  let touchStartX = 0, touchStartY = 0;
  let initDist = 0, initZoom = 1;

  overlay.addEventListener('touchstart', e => {
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
    if (e.touches.length === 2) {
      initDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      initZoom = lb.zoom;
    }
  }, { passive: true });

  overlay.addEventListener('touchmove', e => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      setZoom(initZoom * (dist / initDist));
      return;
    }
    if (lb.zoom > 1 && e.touches.length === 1) {
      lb.panX = lb.lastPanX + (e.touches[0].clientX - touchStartX);
      lb.panY = lb.lastPanY + (e.touches[0].clientY - touchStartY);
      applyTransform();
    }
  }, { passive: true });

  overlay.addEventListener('touchend', e => {
    const dx    = e.changedTouches[0].clientX - touchStartX;
    const dy    = e.changedTouches[0].clientY - touchStartY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (lb.zoom > 1) {
      lb.lastPanX = lb.panX;
      lb.lastPanY = lb.panY;
      return;
    }
    if (absDx > 50 && absDx > absDy) { dx < 0 ? lbNext() : lbPrev(); }
    else if (dy > 80 && absDy > absDx) { closeLightbox(); }
  }, { passive: true });

  // Clavier
  document.addEventListener('keydown', e => {
    if (!overlay.classList.contains('open')) return;
    const map = {
      ArrowLeft:  lbPrev,
      ArrowRight: lbNext,
      Escape:     closeLightbox,
      '+': () => setZoom(lb.zoom + 0.5),
      '-': () => setZoom(lb.zoom - 0.5),
    };
    if (map[e.key]) map[e.key]();
  });
}

// ─── INIT (appelé depuis app.js au DOMContentLoaded) ─
function initLightbox() {
  bindLightboxEvents();
}

// ─── EXPORT ──────────────────────────────
window.GalleryLightbox = { initLightbox, openLightbox };
