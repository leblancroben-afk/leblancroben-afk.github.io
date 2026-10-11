/* =========================================================
   Albexia — notifications.js  (v3)
   UNE seule source : collection Firestore « notifications_site »,
   gérée depuis admin/index.html (onglet Notifications).
   Plus aucun fichier JSON.

   - Cloche + compteur + panneau dans le header (avant le bouton de thème).
   - Toasts discrets : mêmes données que le panneau, donc aucun doublon.
   - Langue : champs titre_fr/en/es et message_fr/en/es, choisis selon la
     langue du visiteur (repli sur le français). Ne passe PAS par i18n.js ;
     seuls les libellés d'interface ci-dessous sont intégrés au module
     (même principe que js/theme.js).
   - État « lu » : compte (users/{uid}.notifsLues) si connecté, et toujours
     en copie locale (localStorage) ; sinon appareil seulement.
   - Temps réel : onSnapshot → une notification publiée, modifiée, dépubliée ou
     supprimée par l'admin apparaît / change / disparaît sans recharger la page.
   - Langue : suit le changement de langue du site en direct (sans rechargement).
   - Suppression : « × » et « Tout supprimer » ne touchent QUE la liste personnelle
     du visiteur (users/{uid}.notifsSupprimees + copie locale) ; la notification
     globale n'est jamais supprimée pour les autres.
   - Toasts : jamais deux fois le même (localStorage), jamais une
     notification déjà lue ou supprimée, désactivables depuis le panneau.
   - Couleurs : uniquement les variables CSS du site → suit le thème
     sombre/clair sans rechargement.
   ========================================================= */
import { auth, db, doc, getDoc, setDoc, collection, onSnapshot, query, where, onAuthStateChanged }
  from '/js/firebase-config.js';

if (!window.__albexiaNotifs) {
  window.__albexiaNotifs = true;

  var LS_READ = 'albexia_notif_lues';
  var LS_TOASTED = 'albexia_notif_toasted';
  var LS_DELETED = 'albexia_notif_supprimees';
  var LS_TOAST_PREF = 'albexia_notif_toasts';   // 'off' = toasts désactivés
  var LANG_KEY = 'albexia_langue';
  var COLLECTION = 'notifications_site';
  var TOAST_DELAY = 4000, TOAST_DURATION = 9000, MAX_TOASTS_PER_PAGE = 3;

  var UI = {
    fr: { bell: 'Notifications', title: 'Notifications', empty: 'Aucune notification pour le moment.',
          markAll: 'Tout marquer comme lu', toasts: 'Toasts', close: 'Fermer', open: 'Voir',
          del: 'Supprimer de ma liste', delAll: 'Tout supprimer',
          confirmAll: 'Supprimer toutes les notifications de ta liste ? Elles restent disponibles pour les autres visiteurs.',
          cat: { annonce: 'Annonce', nouveaute: 'Nouveauté', outil: 'Outil', conseil: 'Conseil', evenement: 'Événement' } },
    en: { bell: 'Notifications', title: 'Notifications', empty: 'No notifications yet.',
          markAll: 'Mark all as read', toasts: 'Toasts', close: 'Close', open: 'View',
          del: 'Remove from my list', delAll: 'Delete all',
          confirmAll: 'Delete all notifications from your list? They stay available for other visitors.',
          cat: { annonce: 'Announcement', nouveaute: 'What\'s new', outil: 'Tool', conseil: 'Tip', evenement: 'Event' } },
    es: { bell: 'Notificaciones', title: 'Notificaciones', empty: 'Aún no hay notificaciones.',
          markAll: 'Marcar todo como leído', toasts: 'Avisos', close: 'Cerrar', open: 'Ver',
          del: 'Quitar de mi lista', delAll: 'Borrar todo',
          confirmAll: '¿Borrar todas las notificaciones de tu lista? Seguirán disponibles para los demás visitantes.',
          cat: { annonce: 'Anuncio', nouveaute: 'Novedad', outil: 'Herramienta', conseil: 'Consejo', evenement: 'Evento' } }
  };

  var root = document.documentElement;
  var rawItems = [];         // notifications publiées reçues de Firestore
  var items = [];            // rawItems dont la date est passée, plus récentes d'abord
  var deletedSet = {};       // id -> true : supprimées de LA liste de ce visiteur
  var knownIds = {}, firstBuild = true, firstBuildToast = true, lastLang = '';
  var readSet = {};          // id -> true
  var toastedSet = {};
  var currentUid = null;
  var toastsShown = 0, toastTimer = null;

  /* ─── utilitaires ─── */
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsSet_(k) { var o = {}; try { (JSON.parse(lsGet(k) || '[]')).forEach(function (i) { o[i] = true; }); } catch (e) {} return o; }
  function saveSet(k, o) { lsSet(k, JSON.stringify(Object.keys(o))); }

  function lang() {
    var l = '';
    if (root.hasAttribute('data-static-lang')) l = (root.lang || '').slice(0, 2).toLowerCase();
    else if (typeof window.detecterLangue === 'function') { try { l = window.detecterLangue(); } catch (e) {} }
    if (!UI[l]) l = lsGet(LANG_KEY) || '';
    if (!UI[l]) l = (root.lang || '').slice(0, 2).toLowerCase();
    return UI[l] ? l : 'fr';
  }
  function field(n, name) {
    var l = lang();
    return (n[name + '_' + l] || '').trim() || (n[name + '_fr'] || '').trim();
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function safeLink(u) { u = (u || '').trim(); return /^(https?:\/\/|\/|#)/.test(u) ? u : ''; }
  function visible() { return items.filter(function (n) { return !deletedSet[n.id]; }); }
  function unreadCount() { return visible().filter(function (n) { return !readSet[n.id]; }).length; }
  function fmtDate(d) {
    try { return d.toLocaleDateString(lang() === 'fr' ? 'fr-FR' : lang() === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch (e) { return ''; }
  }

  /* ─── styles (variables du site uniquement) ─── */
  function injectStyles() {
    if (document.getElementById('albexia-notif-styles')) return;
    var css =
'.notif-wrap{position:relative;display:inline-flex;align-items:center;margin-left:10px;flex-shrink:0}' +
'.notif-bell{position:relative;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;flex-shrink:0;border:1px solid var(--border);border-radius:var(--radius-sm,3px);background:transparent;color:var(--text);cursor:pointer;transition:background .2s,border-color .2s;-webkit-tap-highlight-color:transparent}' +
'.notif-bell:hover{border-color:var(--border-hover);background:color-mix(in srgb,var(--text) 8%,transparent)}' +
'.notif-bell:focus-visible{outline:2px solid var(--accent);outline-offset:2px}' +
'.notif-bell svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}' +
'.notif-badge{position:absolute;top:-6px;right:-6px;min-width:16px;height:16px;padding:0 4px;border-radius:8px;background:var(--accent);color:#fff;font:700 10px/16px var(--sans,system-ui,sans-serif);text-align:center;box-sizing:border-box}' +
'.notif-badge[hidden]{display:none}' +
'.notif-panel{position:absolute;top:calc(100% + 10px);right:0;z-index:1000;width:360px;max-width:calc(100vw - 24px);max-height:70vh;display:none;flex-direction:column;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:var(--radius,4px);box-shadow:0 16px 48px rgba(0,0,0,.35);font-family:var(--sans,system-ui,sans-serif)}' +
'.notif-wrap.open .notif-panel{display:flex}' +
'.notif-panel-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:12px 14px;border-bottom:1px solid var(--border)}' +
'.notif-panel-title{font-size:13px;font-weight:700;margin:0}' +
'.notif-link-btn{background:none;border:none;padding:4px;color:var(--text-muted);font:500 12px var(--sans,system-ui,sans-serif);cursor:pointer}' +
'.notif-link-btn:hover{color:var(--text)}' +
'.notif-list{overflow-y:auto;overscroll-behavior:contain}' +
'.notif-item{position:relative;border-bottom:1px solid var(--border);color:inherit}' +
'.notif-main{display:block;padding:12px 40px 12px 28px;color:inherit;text-decoration:none}' +
'.notif-item:last-child{border-bottom:none}' +
'a.notif-main:hover{background:color-mix(in srgb,var(--text) 5%,transparent)}' +
'.notif-del{position:absolute;top:8px;right:8px;width:22px;height:22px;padding:0;border:none;border-radius:50%;background:transparent;color:var(--text-dim,var(--text-muted));font-size:16px;line-height:1;cursor:pointer}' +
'.notif-del:hover{background:color-mix(in srgb,var(--text) 10%,transparent);color:var(--text)}' +
'.notif-item.unread::before{content:"";position:absolute;left:12px;top:17px;width:7px;height:7px;border-radius:50%;background:var(--accent)}' +
'.notif-cat{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--accent-ink,var(--accent))}' +
'.notif-item-title{font-size:13px;font-weight:600;margin:2px 0;color:var(--text)}' +
'.notif-item-msg{font-size:12px;line-height:1.45;color:var(--text-muted);margin:0}' +
'.notif-item-date{font-size:11px;color:var(--text-dim);margin-top:4px}' +
'.notif-empty{padding:28px 14px;text-align:center;font-size:13px;color:var(--text-muted)}' +
'.notif-panel-foot{padding:8px 14px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;color:var(--text-muted)}' +
'.notif-panel-foot label{display:flex;align-items:center;gap:6px;cursor:pointer}' +
'#albexia-toast{position:fixed;bottom:24px;right:24px;z-index:9999;width:340px;max-width:calc(100vw - 32px);box-sizing:border-box;display:flex;gap:10px;align-items:flex-start;padding:12px 14px;background:var(--bg2);color:var(--text);border:1px solid var(--border-hover);border-left:3px solid var(--accent);border-radius:var(--radius,4px);box-shadow:0 8px 32px rgba(0,0,0,.35);font-family:var(--sans,system-ui,sans-serif);opacity:0;transform:translateY(12px);transition:opacity .3s,transform .3s;pointer-events:none}' +
'#albexia-toast.visible{opacity:1;transform:none;pointer-events:auto}' +
'#albexia-toast .notif-toast-body{flex:1;min-width:0;color:inherit;text-decoration:none}' +
'#albexia-toast .notif-toast-close{flex-shrink:0;width:22px;height:22px;border:none;border-radius:50%;background:color-mix(in srgb,var(--text) 10%,transparent);color:var(--text-muted);cursor:pointer;font-size:14px;line-height:1;padding:0}' +
'#albexia-toast .notif-toast-close:hover{color:var(--text)}' +
'@media(pointer:coarse){.notif-bell,.theme-toggle{width:36px;height:36px}.notif-del{width:30px;height:30px;top:5px;right:5px}}' +
'@media(max-width:768px){.notif-wrap{position:static}.notif-panel{position:absolute;top:100%;margin-top:6px;left:12px;right:12px;width:auto;max-width:none}#albexia-toast{left:12px;right:12px;bottom:16px;width:auto;max-width:none}}';
    var s = document.createElement('style');
    s.id = 'albexia-notif-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* ─── état « lu » ─── */
  function markRead(ids) {
    var changed = [];
    ids.forEach(function (id) { if (!readSet[id]) { readSet[id] = true; changed.push(id); } });
    if (!changed.length) return;
    saveSet(LS_READ, readSet);
    render();
    if (currentUid) {
      var map = {};
      changed.forEach(function (id) { map[id] = true; });
      setDoc(doc(db, 'users', currentUid), { notifsLues: map }, { merge: true })
        .catch(function (e) { console.warn('[Albexia Notif] état lu non enregistré sur le compte :', e.message); });
    }
  }

  function removeFromMyList(ids) {
    var changed = [];
    ids.forEach(function (id) { if (!deletedSet[id]) { deletedSet[id] = true; changed.push(id); } });
    if (!changed.length) return;
    saveSet(LS_DELETED, deletedSet);
    markRead(changed);            /* un élément retiré ne compte plus jamais comme non lu */
    render();
    if (currentUid) {
      var map = {};
      changed.forEach(function (id) { map[id] = true; });
      setDoc(doc(db, 'users', currentUid), { notifsSupprimees: map }, { merge: true })
        .catch(function (e) { console.warn('[Albexia Notif] suppression non enregistrée sur le compte :', e.message); });
    }
  }

  /* ─── cloche + panneau ─── */
  var wrap, bell, badge, panel, list, toastCheck;

  function bellSVG() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>';
  }

  function mountBell() {
    if (wrap && document.body.contains(wrap)) return true;
    var nav = document.querySelector('body > nav') || document.querySelector('nav');
    if (!nav) return false;
    injectStyles();
    wrap = document.createElement('div');
    wrap.className = 'notif-wrap';
    wrap.innerHTML =
      '<button type="button" class="notif-bell" aria-haspopup="true" aria-expanded="false">' + bellSVG() + '<span class="notif-badge" hidden></span></button>' +
      '<div class="notif-panel" role="dialog">' +
        '<div class="notif-panel-head"><h2 class="notif-panel-title"></h2><button type="button" class="notif-link-btn notif-markall"></button></div>' +
        '<div class="notif-list"></div>' +
        '<div class="notif-panel-foot"><label><input type="checkbox" class="notif-toast-pref"><span class="notif-toast-label"></span></label><button type="button" class="notif-link-btn notif-delall"></button></div>' +
      '</div>';
    var before = nav.querySelector('[data-theme-toggle]') || nav.querySelector('.nav-profile-slot') || nav.querySelector('.nav-cta');
    if (before && before.parentNode === nav) nav.insertBefore(wrap, before); else nav.appendChild(wrap);

    bell = wrap.querySelector('.notif-bell');
    badge = wrap.querySelector('.notif-badge');
    panel = wrap.querySelector('.notif-panel');
    list = wrap.querySelector('.notif-list');
    toastCheck = wrap.querySelector('.notif-toast-pref');
    toastCheck.checked = lsGet(LS_TOAST_PREF) !== 'off';
    toastCheck.addEventListener('change', function () { lsSet(LS_TOAST_PREF, toastCheck.checked ? 'on' : 'off'); });
    wrap.querySelector('.notif-markall').addEventListener('click', function () { markRead(visible().map(function (n) { return n.id; })); });
    wrap.querySelector('.notif-delall').addEventListener('click', function () {
      if (!visible().length) return;
      if (window.confirm(UI[lang()].confirmAll)) removeFromMyList(visible().map(function (n) { return n.id; }));
    });
    bell.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = wrap.classList.toggle('open');
      bell.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    panel.addEventListener('click', function (e) {
      var d = e.target.closest('.notif-del');
      if (d) { e.preventDefault(); removeFromMyList([d.getAttribute('data-nid')]); return; }
      var a = e.target.closest('a[data-nid]');
      if (a) markRead([a.getAttribute('data-nid')]);
    });
    document.addEventListener('click', function (e) { if (wrap && !wrap.contains(e.target)) closePanel(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePanel(); });
    render();
    return true;
  }
  function closePanel() { if (wrap) { wrap.classList.remove('open'); bell.setAttribute('aria-expanded', 'false'); } }

  function render() {
    if (!wrap) return;
    lastLang = lang();
    var t = UI[lastLang], n = unreadCount(), list_ = visible();
    bell.setAttribute('aria-label', t.bell + (n ? ' (' + n + ')' : ''));
    bell.title = t.bell;
    badge.hidden = n === 0;
    badge.textContent = n > 9 ? '9+' : String(n);
    wrap.querySelector('.notif-panel-title').textContent = t.title;
    wrap.querySelector('.notif-markall').textContent = t.markAll;
    wrap.querySelector('.notif-markall').hidden = n === 0;
    wrap.querySelector('.notif-toast-label').textContent = t.toasts;
    var da = wrap.querySelector('.notif-delall');
    da.textContent = t.delAll; da.hidden = list_.length === 0;
    if (!list_.length) { list.innerHTML = '<div class="notif-empty">' + esc(t.empty) + '</div>'; return; }
    list.innerHTML = list_.map(function (it) {
      var link = safeLink(it.lien), unread = !readSet[it.id];
      var inner =
        '<div class="notif-cat">' + esc(t.cat[it.categorie] || '') + '</div>' +
        '<div class="notif-item-title">' + esc(field(it, 'titre')) + '</div>' +
        '<p class="notif-item-msg">' + esc(field(it, 'message')) + '</p>' +
        '<div class="notif-item-date">' + esc(fmtDate(it.date)) + '</div>';
      var main = link
        ? '<a class="notif-main" data-nid="' + esc(it.id) + '" href="' + esc(link) + '">' + inner + '</a>'
        : '<div class="notif-main">' + inner + '</div>';
      return '<div class="notif-item' + (unread ? ' unread' : '') + '">' + main +
        '<button type="button" class="notif-del" data-nid="' + esc(it.id) + '" aria-label="' + esc(t.del) + '" title="' + esc(t.del) + '">×</button></div>';
    }).join('');
  }
  /* langue changée sur le site → le panneau suit immédiatement */
  function langMaybeChanged() { if (lang() !== lastLang) render(); }

  /* ─── toasts ─── */
  function nextToastCandidate() {
    if (lsGet(LS_TOAST_PREF) === 'off') return null;
    var vis = visible();
    for (var i = 0; i < vis.length; i++) {
      var n = vis[i];
      if (n.toast !== false && !readSet[n.id] && !toastedSet[n.id]) return n;
    }
    return null;
  }
  function scheduleToast(delay) {
    if (toastTimer || toastsShown >= MAX_TOASTS_PER_PAGE) return;
    toastTimer = setTimeout(function () { toastTimer = null; showToast(); }, delay);
  }
  function showToast() {
    var n = nextToastCandidate();
    if (!n || document.getElementById('albexia-toast')) return;
    injectStyles();
    toastsShown++;
    toastedSet[n.id] = true; saveSet(LS_TOASTED, toastedSet);   // ne reviendra pas à la navigation suivante
    var t = UI[lang()], link = safeLink(n.lien);
    var el = document.createElement('div');
    el.id = 'albexia-toast';
    el.setAttribute('role', 'status');
    var body = '<div class="notif-cat">' + esc(t.cat[n.categorie] || '') + '</div>' +
      '<div class="notif-item-title">' + esc(field(n, 'titre')) + '</div>' +
      '<p class="notif-item-msg">' + esc(field(n, 'message')) + '</p>';
    el.innerHTML = (link ? '<a class="notif-toast-body" href="' + esc(link) + '">' : '<div class="notif-toast-body">') + body + (link ? '</a>' : '</div>') +
      '<button type="button" class="notif-toast-close" aria-label="' + esc(t.close) + '">×</button>';
    document.body.appendChild(el);
    requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('visible'); }); });
    var done = false;
    function hide() {
      if (done) return; done = true;
      el.classList.remove('visible');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); scheduleToast(6000); }, 350);
    }
    el.querySelector('.notif-toast-close').addEventListener('click', hide);
    var a = el.querySelector('a.notif-toast-body');
    if (a) a.addEventListener('click', function () { markRead([n.id]); });
    setTimeout(hide, TOAST_DURATION);
  }

  /* ─── chargement TEMPS RÉEL (une seule source pour cloche ET toasts) ─── */
  function rebuild() {
    var now = Date.now();
    items = rawItems.filter(function (x) { return x.date.getTime() <= now; })
      .sort(function (a, b) { return b.date - a.date; });
    var fresh = false;
    items.forEach(function (x) { if (!knownIds[x.id]) { knownIds[x.id] = true; if (!firstBuild) fresh = true; } });
    firstBuild = false;
    mountBell(); render();
    if (fresh) {
      toastsShown = Math.min(toastsShown, MAX_TOASTS_PER_PAGE - 1);
      if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }   /* le toast du direct passe avant l'attente initiale */
      scheduleToast(900);
    }
  }
  function subscribe() {
    onSnapshot(query(collection(db, COLLECTION), where('publie', '==', true)), function (snap) {
      rawItems = snap.docs.map(function (d) {
        var x = d.data();
        x.date = x.datePublication && x.datePublication.toDate ? x.datePublication.toDate() : new Date(0);
        x.id = d.id; return x;
      });
      rebuild();
      if (firstBuildToast) { firstBuildToast = false; scheduleToast(TOAST_DELAY); }
    }, function (e) { console.warn('[Albexia Notif]', e.message); });
  }
  function loadAccountRead(uid) {
    return getDoc(doc(db, 'users', uid)).then(function (s) {
      var m = (s.exists() && s.data().notifsLues) || {};
      var dm = (s.exists() && s.data().notifsSupprimees) || {};
      Object.keys(m).forEach(function (id) { if (m[id]) readSet[id] = true; });
      Object.keys(dm).forEach(function (id) { if (dm[id]) deletedSet[id] = true; });
      saveSet(LS_READ, readSet); saveSet(LS_DELETED, deletedSet);
      /* l'état local « lu » avant connexion est reporté sur le compte */
      var local = Object.keys(readSet).filter(function (id) { return !m[id]; });
      var localDel = Object.keys(deletedSet).filter(function (id) { return !dm[id]; });
      if (local.length || localDel.length) {
        var add = {}, addDel = {};
        local.forEach(function (id) { add[id] = true; });
        localDel.forEach(function (id) { addDel[id] = true; });
        var payload = {};
        if (local.length) payload.notifsLues = add;
        if (localDel.length) payload.notifsSupprimees = addDel;
        return setDoc(doc(db, 'users', uid), payload, { merge: true }).catch(function () {});
      }
    }).catch(function (e) { console.warn('[Albexia Notif] lecture du compte impossible :', e.message); });
  }

  function hookLangCallback() {
    var cur = window.onLangueChange;
    if (cur && cur.__albexiaNotif) return;
    var f = function () {
      var r = typeof cur === 'function' ? cur.apply(this, arguments) : undefined;
      langMaybeChanged();
      return r;
    };
    f.__albexiaNotif = true;
    window.onLangueChange = f;
  }

  function init() {
    readSet = lsSet_(LS_READ); toastedSet = lsSet_(LS_TOASTED); deletedSet = lsSet_(LS_DELETED);
    subscribe();

    onAuthStateChanged(auth, function (user) {
      currentUid = user ? user.uid : null;
      if (user) loadAccountRead(user.uid).then(function () { render(); });
    });

    /* le header dynamique arrive après : on monte la cloche quand il est prêt */
    document.addEventListener('albexia:header-ready', function () { hookLangCallback(); if (mountBell()) render(); });
    hookLangCallback();

    /* changement de langue en direct : 4 filets de sécurité, tous idempotents */
    new MutationObserver(langMaybeChanged).observe(root, { attributes: true, attributeFilter: ['lang'] });
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.lang-btn,[data-lang]')) [0, 80, 300, 800].forEach(function (d) { setTimeout(langMaybeChanged, d); });
    }, true);
    window.addEventListener('storage', function (e) {
      if (e.key === LANG_KEY) langMaybeChanged();
      if (e.key === LS_READ) { readSet = lsSet_(LS_READ); render(); }
      if (e.key === LS_DELETED) { deletedSet = lsSet_(LS_DELETED); render(); }
    });
    /* une notification programmée devient visible à sa date, sans recharger */
    setInterval(function () { rebuild(); langMaybeChanged(); }, 30000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}
