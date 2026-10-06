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
  startX:   0, startY: 0,
  panX:     0, panY:    0,
};

const ZOOM_MIN = 1, ZOOM_MAX = 5;

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
    document.getElementById('lb-audio-art').textContent   = '♪';
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
  applyTransform(true);
}

function setZoom(z, animate = true) {
  lb.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
  if (lb.zoom === 1) { lb.panX = 0; lb.panY = 0; }
  clampPan();
  applyTransform(animate);
}

// Borde le déplacement pour ne jamais perdre l'image hors du cadre
function clampPan() {
  const wrap = document.getElementById('lb-media-wrap');
  const img  = document.getElementById('lb-img');
  if (!wrap || !img) return;
  const rect = wrap.getBoundingClientRect();
  const w = (img.offsetWidth  || rect.width)  * lb.zoom;
  const h = (img.offsetHeight || rect.height) * lb.zoom;
  const maxX = Math.max(0, (w - rect.width)  / 2);
  const maxY = Math.max(0, (h - rect.height) / 2);
  lb.panX = Math.min(maxX, Math.max(-maxX, lb.panX));
  lb.panY = Math.min(maxY, Math.max(-maxY, lb.panY));
}

function applyTransform(animate = false) {
  const img = document.getElementById('lb-img');
  if (!img) return;
  // Transition uniquement pour les actions ponctuelles (boutons, double-tap) ;
  // pendant un geste tactile/souris : aucune transition, suivi immédiat.
  img.style.transition = animate ? 'transform .22s ease-out' : 'none';
  img.style.transform  = `translate(${lb.panX}px, ${lb.panY}px) scale(${lb.zoom})`;
  document.getElementById('lb-zoom-level').textContent =
    Math.round(lb.zoom * 100) + '%';
}

function toggleZoom() {
  lb.zoom > 1 ? resetZoom() : setZoom(2.5);
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

  // Double-clic → zoom (sur la ZONE, car lb-img a pointer-events:none)
  wrap.addEventListener('dblclick', e => {
    if (!img.classList.contains('active')) return;
    if (e.target.closest('#lb-prev') || e.target.closest('#lb-next')) return;
    toggleZoom();
  });

  // Molette → zoom
  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    setZoom(lb.zoom + (e.deltaY > 0 ? -0.25 : 0.25), false);
  }, { passive: false });

  // Drag (pan quand zoomé) — souris
  wrap.addEventListener('mousedown', e => {
    if (lb.zoom <= 1) return;
    e.preventDefault();
    lb.dragging = true;
    lb.startX = e.clientX - lb.panX;
    lb.startY = e.clientY - lb.panY;
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
    clampPan();
    applyTransform();
    wrap.classList.remove('dragging');
  });

  // ── TACTILE ────────────────────────────
  let touchStartX = 0, touchStartY = 0;
  let initDist = 0, initZoom = 1;
  let pinchFX = 0, pinchFY = 0;   // point focal du pinch (centré sur wrap)
  let startPanX = 0, startPanY = 0;
  let lastTap = 0;

  function pinchCenter(t0, t1) {
    const r = wrap.getBoundingClientRect();
    return [
      (t0.clientX + t1.clientX) / 2 - (r.left + r.width  / 2),
      (t0.clientY + t1.clientY) / 2 - (r.top  + r.height / 2),
    ];
  }

  wrap.addEventListener('touchstart', e => {
    if (!img.classList.contains('active')) return;
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      startPanX = lb.panX; startPanY = lb.panY;
    }
    if (e.touches.length === 2) {
      initDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      ) || 1;
      initZoom  = lb.zoom;
      startPanX = lb.panX; startPanY = lb.panY;
      [pinchFX, pinchFY] = pinchCenter(e.touches[0], e.touches[1]);
    }
  }, { passive: true });

  wrap.addEventListener('touchmove', e => {
    if (!img.classList.contains('active')) return;
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, initZoom * (dist / initDist)));
      // Ancre le zoom au point central des deux doigts : ce point reste
      // exactement sous les doigts pendant tout le geste (aucun saut).
      const px = (pinchFX - startPanX) / initZoom;
      const py = (pinchFY - startPanY) / initZoom;
      lb.zoom = newZoom;
      lb.panX = pinchFX - px * newZoom;
      lb.panY = pinchFY - py * newZoom;
      clampPan();
      applyTransform();
      return;
    }
    if (lb.zoom > 1 && e.touches.length === 1) {
      e.preventDefault();
      lb.panX = startPanX + (e.touches[0].clientX - touchStartX);
      lb.panY = startPanY + (e.touches[0].clientY - touchStartY);
      applyTransform();
    }
  }, { passive: false });

  wrap.addEventListener('touchend', e => {
    if (!img.classList.contains('active')) return;
    // Double-tap → zoom (la zone média porte l'écoute, pas l'img)
    if (e.touches.length === 0) {
      const now = Date.now();
      if (now - lastTap < 300) { toggleZoom(); lastTap = 0; return; }
      lastTap = now;
    }
    // En zoom : on navigue par pan, pas par swipe
    if (lb.zoom > 1) return;
    const dx    = e.changedTouches[0].clientX - touchStartX;
    const dy    = e.changedTouches[0].clientY - touchStartY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
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
