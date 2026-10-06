/* ═══════════════════════════════════════
   Albexia — avis-outil.js
   Page dédiée aux avis d'un outil
   URL : /tools/avis-outil.html?tool=canva
   ═══════════════════════════════════════ */

import { auth, onAuthStateChanged, db, collection, getDocs, query, where }
  from '/js/firebase-config.js';

import {
  getToolReviews,
  getToolSlugFromPath,
  getUserReview,
  getRatingSummary,
  submitReview,
  deleteUserReview,
  reportReview,
  getUserVote,
  voteReview,
  getToolQuickVotes,
  getUserToolVote,
  voteTool,
  computeUsefulness,
  isPositiveRating,
  isNegativeRating,
} from '/js/reviews.js';

// ── Config depuis URL ─────────────────────────
// ── i18n : système existant (js/i18n.js → window.t / detecterLangue) ──
function lang() {
  return window.detecterLangue ? window.detecterLangue() : 'fr';
}
function tr(key, vars) {
  let str = window.t ? window.t(key, lang()) : key;
  if (vars) {
    Object.keys(vars).forEach(k => {
      str = str.split('{' + k + '}').join(vars[k]);
    });
  }
  return str;
}
const DATE_LOCALES = { fr: 'fr-FR', en: 'en-US', es: 'es-ES' };

const params   = new URLSearchParams(window.location.search);
const TOOL_SLUG = params.get('tool') || '';

if (!TOOL_SLUG) {
  document.getElementById('avo-list').innerHTML =
    `<p style="color:var(--text-muted);padding:40px 0;text-align:center">${tr('avo.toolNotFound')}</p>`;
}

const PAGE_SIZE = 6;

let currentUser = null;
let userReview  = null;
let allReviews  = [];
let filtered    = [];
let currentPage  = 1;
let activeFilter = 'all';
let activeSort   = 'recent';
let userVotes    = {};
let quickVotes   = [];      // votes rapides Oui/Non de l'outil
let userQuickVote = null;   // vote rapide de la personne connectée
let toolMeta     = { name: '', favicon: '', page: '' };
let toolDocs     = [];     // documents Firestore de l'outil (un par langue)
let toolInfo     = null;   // fiche de l'outil (Firestore « outils ») : description, catégorie, tags, site officiel

// ── Init ──────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (TOOL_SLUG) await loadAll();
});

// Même règle que gen-fiches.js (dossier de la fiche = slug du nom)
function slugifyName(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Fiche de l'outil : collection Firestore « outils » (source de gen-fiches.js).
// Un outil existe en plusieurs documents (fr/en/es) : on les garde tous.
async function loadToolDocs() {
  try {
    let docs = [];
    if (toolMeta.name) {
      const snap = await getDocs(query(collection(db, 'outils'), where('name', '==', toolMeta.name)));
      docs = snap.docs.map(d => d.data());
    }
    if (!docs.some(t => slugifyName(t.name) === TOOL_SLUG)) {
      // Pas d'avis (nom inconnu) : recherche par slug dans la collection
      const snap = await getDocs(collection(db, 'outils'));
      docs = snap.docs.map(d => d.data()).filter(t => slugifyName(t.name) === TOOL_SLUG);
    }
    return docs.filter(t => slugifyName(t.name) === TOOL_SLUG);
  } catch (e) {
    console.error('avis-outil: lecture de la fiche outil', e);
    return [];
  }
}

// Document de la langue courante, sinon français, sinon le premier
function pickToolInfo() {
  return toolDocs.find(t => (t.langue || 'fr') === lang())
      || toolDocs.find(t => (t.langue || 'fr') === 'fr')
      || toolDocs[0] || null;
}

async function loadAll() {
  try {
    [allReviews, userReview, quickVotes, userQuickVote] = await Promise.all([
      getToolReviews(TOOL_SLUG),
      currentUser ? getUserReview(currentUser.uid, TOOL_SLUG) : Promise.resolve(null),
      getToolQuickVotes(TOOL_SLUG).catch(() => []),
      currentUser ? getUserToolVote(currentUser.uid, TOOL_SLUG).catch(() => null) : Promise.resolve(null),
    ]);

    if (allReviews.length) {
      const first = allReviews[0];
      toolMeta.name    = first.toolName    || TOOL_SLUG;
      toolMeta.favicon = first.toolFavicon || '';
      toolMeta.page    = first.toolPage    || '';
    }

    if (currentUser && allReviews.length) {
      const results = await Promise.all(
        allReviews.map(r => getUserVote(r.id, currentUser.uid).then(v => ({ id: r.id, vote: v })))
      );
      userVotes = {};
      results.forEach(({ id, vote }) => { userVotes[id] = vote; });
    }
  } catch (e) {
    console.error(e);
  }

  // Fiche de l'outil (Firestore « outils »), après les avis pour connaître le nom exact
  toolDocs = await loadToolDocs();
  toolInfo = pickToolInfo();

  if (toolInfo) {
    toolMeta.name    = toolInfo.name || toolMeta.name;
    toolMeta.favicon = toolInfo.favicon || toolMeta.favicon;
    if (!toolMeta.page) {
      const plan = ['featured', 'starter'].includes(toolInfo.plan) ? toolInfo.plan : 'standard';
      toolMeta.page = `/tools/${plan}/${toolInfo.langue || 'fr'}/${TOOL_SLUG}/`;
    }
  }
  if (toolMeta.name) {
    document.title = tr('avo.pageTitle', { tool: toolMeta.name });
  }

  applyFilterSort();
  renderAll();
}

// ── Filtre + Tri ──────────────────────────────
function applyFilterSort() {
  let list = [...allReviews];

  if (activeFilter === 'positive') list = list.filter(r => isPositiveRating(r.rating));
  else if (activeFilter === 'negative') list = list.filter(r => isNegativeRating(r.rating));
  else if (['5','4','3','2','1'].includes(activeFilter))
    list = list.filter(r => r.rating === parseInt(activeFilter));

  if (activeSort === 'recent') {
    list.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
  } else if (activeSort === 'oldest') {
    list.sort((a, b) => (a.updatedAt?.seconds || 0) - (b.updatedAt?.seconds || 0));
  }

  filtered = list;
}

// ── Rendu ─────────────────────────────────────
function renderAll() {
  renderHeader();
  renderSummary();
  renderControls();
  renderList();
}

function renderHeader() {
  const el = document.getElementById('avo-header');
  const name = toolMeta.name || TOOL_SLUG;
  const tags = (toolInfo?.tags || []).slice(0, 4);
  const site = toolInfo?.url && /^https?:\/\//.test(toolInfo.url) ? toolInfo.url : '';

  el.innerHTML = `
    <div class="avo-header-inner">
      <div class="avo-head-row">
        <div class="avo-tool-info">
          ${toolMeta.favicon
            ? `<img src="${esc(toolMeta.favicon)}" alt="${esc(name)}" class="avo-tool-logo">`
            : `<div class="avo-tool-logo-placeholder">${esc(name.charAt(0).toUpperCase())}</div>`
          }
          <div>
            <div class="avo-tool-name">${esc(name)}</div>
            ${toolInfo?.description ? `<div class="avo-tool-desc">${esc(toolInfo.description)}</div>` : `<div class="avo-tool-sub">${esc(tr('avo.title'))}</div>`}
            ${tags.length ? `<div class="avo-tags">${tags.map(t => `<span class="avo-tag">${esc(t)}</span>`).join('')}</div>` : ''}
          </div>
        </div>
        <div class="avo-actions">
          ${site ? `<a class="avo-btn" href="${esc(site)}" target="_blank" rel="noopener noreferrer">${esc(tr('avo.officialSite'))}</a>` : ''}
          <button type="button" class="avo-btn avo-share" id="avo-share" aria-label="${esc(tr('avo.shareAria', { tool: name }))}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>
            ${esc(tr('avo.share'))}
          </button>
        </div>
      </div>
    </div>`;

  el.querySelector('#avo-share')?.addEventListener('click', shareReviews);

  const logo = el.querySelector('img.avo-tool-logo');
  if (logo) logo.addEventListener('error', () => {
    const ph = document.createElement('div');
    ph.className = 'avo-tool-logo-placeholder';
    ph.textContent = name.charAt(0).toUpperCase();
    logo.replaceWith(ph);
  }, { once: true });
}

// Partage de la page des avis : partage natif en priorité, sinon copie du lien
async function shareReviews() {
  const name  = toolMeta.name || TOOL_SLUG;
  const data  = {
    title: tr('avo.shareTitle', { tool: name }),
    text:  tr('avo.shareText', { tool: name }),
    url:   window.location.href,
  };
  if (navigator.share) {
    try { await navigator.share(data); }
    catch (e) { if (e && e.name !== 'AbortError') copyLink(data.url); }
    return;
  }
  copyLink(data.url);
}

async function copyLink(url) {
  try {
    await navigator.clipboard.writeText(url);
    rvToast(tr('avo.linkCopied'));
  } catch {
    window.prompt(tr('avo.copyPrompt'), url);
  }
}

// Décimale selon la langue : 3,8 (fr, es) / 3.8 (en)
function fmtNum(n) {
  if (Number.isInteger(n)) return String(n);
  const txt = n.toFixed(1);
  return lang() === 'en' ? txt : txt.replace('.', ',');
}

function usefulBlockHTML() {
  const u = computeUsefulness(allReviews, quickVotes);
  if (!u.total) {
    return `<div class="rv-useful">
      <div class="rv-useful-title">${esc(tr('avo.usefulTitle'))}</div>
      <div class="rv-useful-empty">${esc(tr('avo.usefulEmpty'))}</div>
    </div>`;
  }
  return `<div class="rv-useful">
    <div class="rv-useful-title">${esc(tr('avo.usefulTitle'))}</div>
    <div class="rv-useful-pct">👍 ${esc(tr('avo.usefulPct', { n: u.percent }))}</div>
    <div class="rv-useful-counts">${esc(tr('avo.usefulCounts', { yes: fmtNum(u.yes), no: fmtNum(u.no), total: u.total }))}</div>
    <div class="rv-useful-bar"><div class="rv-useful-bar-fill" style="width:${u.percent}%"></div></div>
    <div class="rv-useful-note">${esc(
      u.percent > 50 ? tr('avo.usefulMajorityYes')
      : u.percent < 50 ? tr('avo.usefulMajorityNo')
      : tr('avo.usefulSplit')
    )}</div>
  </div>`;
}

function quickVoteBlockHTML() {
  if (userReview) {
    return `<div class="rv-quick">
      <div class="rv-quick-q">${esc(tr('avo.quickHasReview'))}</div>
    </div>`;
  }
  return `<div class="rv-quick">
    <div class="rv-quick-q">${esc(tr('avo.quickQuestion'))}</div>
    <div class="rv-quick-btns">
      <button class="rv-quick-btn yes" data-quick="yes" aria-pressed="${userQuickVote === 'yes'}">${esc(tr('avo.quickYes'))}</button>
      <button class="rv-quick-btn no"  data-quick="no"  aria-pressed="${userQuickVote === 'no'}">${esc(tr('avo.quickNo'))}</button>
    </div>
  </div>`;
}

function renderSummary() {
  const el = document.getElementById('avo-summary');

  let ratingHtml = '';
  let distHtml   = '';
  if (allReviews.length) {
    const counts = {1:0,2:0,3:0,4:0,5:0};
    allReviews.forEach(r => { if (counts[r.rating] !== undefined) counts[r.rating]++; });
    const total = allReviews.length;
    const avg   = (allReviews.reduce((s, r) => s + r.rating, 0) / total).toFixed(1);
    const full  = Math.round(parseFloat(avg));

    const starsHtml = [1,2,3,4,5].map(i =>
      `<span class="${i <= full ? 'on' : 'off'}">★</span>`
    ).join('');

    const bars = [5,4,3,2,1].map(n => {
      const count = counts[n];
      const pct   = Math.round((count / total) * 100);
      return `
      <button class="rv-dist-row ${activeFilter === String(n) ? 'active' : ''}"
              data-filter="${n}">
        <span class="rv-dist-label">${esc(tr('avo.filterStars', { n }))}</span>
        <div class="rv-dist-bar-bg">
          <div class="rv-dist-bar-fill" style="width:${pct}%"></div>
        </div>
        <span class="rv-dist-count">${count}</span>
      </button>`;
    }).join('');

    ratingHtml = `
        <div class="rv-avg-score">${lang() === 'en' ? avg : avg.replace('.', ',')}</div>
        <div class="rv-avg-stars">${starsHtml}</div>
        <div class="rv-avg-count">${esc(tr(total === 1 ? 'avo.reviewCountOne' : 'avo.reviewCountMany', { n: total }))}</div>`;
    distHtml = `<div class="rv-dist-bars">${bars}</div>`;
  }

  el.innerHTML = `
    <div class="rv-summary">
      <div class="rv-summary-left">
        ${ratingHtml}
        ${quickVoteBlockHTML()}
      </div>
      ${distHtml}
      ${usefulBlockHTML()}
    </div>`;

  el.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = activeFilter === btn.dataset.filter ? 'all' : btn.dataset.filter;
      currentPage = 1;
      applyFilterSort();
      renderSummary();
      renderControls();
      renderList();
    });
  });

  el.querySelectorAll('[data-quick]').forEach(btn => {
    btn.addEventListener('click', () => handleQuickVote(btn.dataset.quick));
  });
}

async function handleQuickVote(value) {
  if (!currentUser) { rvToast(tr('avo.loginToVote')); return; }
  if (userReview)   { rvToast(tr('avo.quickHasReview')); return; }
  try {
    userQuickVote = await voteTool(currentUser.uid, TOOL_SLUG, value);
    quickVotes = await getToolQuickVotes(TOOL_SLUG);
    renderSummary();
  } catch (e) {
    if (e?.code === 'has-review') {
      userReview = await getUserReview(currentUser.uid, TOOL_SLUG).catch(() => null);
      renderSummary();
      rvToast(tr('avo.quickHasReview'));
    } else {
      rvToast('⚠ ' + (e?.code || e?.message || String(e)));
    }
  }
}

function renderControls() {
  const el = document.getElementById('avo-controls');
  if (!allReviews.length) { el.innerHTML = ''; return; }

  const count = (fn) => allReviews.filter(fn).length;
  const filters = [
    { key: 'all',      label: tr('avo.filterAll'),      n: allReviews.length },
    { key: 'positive', label: tr('avo.filterPositive'), n: count(r => isPositiveRating(r.rating)) },
    { key: 'negative', label: tr('avo.filterNegative'), n: count(r => isNegativeRating(r.rating)) },
    ...[5, 4, 3, 2, 1].map(n => ({ key: String(n), label: tr('avo.filterStars', { n }), n: count(r => r.rating === n) })),
  ];
  const sorts = [
    { key: 'recent', label: tr('avo.sortRecent') },
    { key: 'oldest', label: tr('avo.sortOldest') },
  ];

  el.innerHTML = `
    <div class="rv-controls">
      <div class="rv-filter-group" role="group" aria-label="${esc(tr('avo.filterGroup'))}">
        ${filters.map(f =>
          `<button class="rv-ctrl-btn ${activeFilter === f.key ? 'active' : ''}"
                   data-filter="${f.key}" aria-pressed="${activeFilter === f.key}">
             ${esc(f.label)}<span class="rv-ctrl-count">${f.n}</span>
           </button>`
        ).join('')}
      </div>
      <div class="rv-sort-group" role="group" aria-label="${esc(tr('avo.sortGroup'))}">
        ${sorts.map(s =>
          `<button class="rv-sort-btn ${activeSort === s.key ? 'active' : ''}"
                   data-sort="${s.key}" aria-pressed="${activeSort === s.key}">${esc(s.label)}</button>`
        ).join('')}
      </div>
    </div>`;

  el.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      currentPage = 1;
      applyFilterSort();
      renderSummary();
      renderControls();
      renderList();
    });
  });

  el.querySelectorAll('[data-sort]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeSort = btn.dataset.sort;
      currentPage = 1;
      applyFilterSort();
      renderControls();
      renderList();
    });
  });
}

function renderList() {
  const el      = document.getElementById('avo-list');
  const pages   = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  if (currentPage > pages) currentPage = pages;
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (!filtered.length) {
    el.innerHTML = `<div class="rv-empty">${
      esc(allReviews.length ? tr('avo.emptyFilter') : tr('avo.empty'))
    }</div>`;
    return;
  }

  const cards = visible.map(r => buildCardHTML(r)).join('');

  const nums = [];
  for (let n = 1; n <= pages; n++) {
    if (n === 1 || n === pages || Math.abs(n - currentPage) <= 1) nums.push(n);
    else if (nums[nums.length - 1] !== '…') nums.push('…');
  }
  const pager = pages > 1 ? `
    <nav class="rv-pager" aria-label="${esc(tr('avo.pagesAria'))}">
      <button class="rv-page" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''} aria-label="${esc(tr('avo.pagePrev'))}">‹</button>
      ${nums.map(n => n === '…'
        ? '<span class="rv-page-gap">…</span>'
        : `<button class="rv-page ${n === currentPage ? 'active' : ''}" data-page="${n}">${n}</button>`).join('')}
      <button class="rv-page" data-page="${currentPage + 1}" ${currentPage === pages ? 'disabled' : ''} aria-label="${esc(tr('avo.pageNext'))}">›</button>
    </nav>` : '';

  el.innerHTML = `<div class="rv-list">${cards}</div>${pager}`;

  el.querySelectorAll('.rv-vote-btn').forEach(btn => {
    btn.addEventListener('click', () => handleVote(btn));
  });
  el.querySelectorAll('.rv-report-btn').forEach(btn => {
    btn.addEventListener('click', () => handleReport(btn));
  });
  el.querySelectorAll('.rv-page').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPage = parseInt(btn.dataset.page, 10);
      renderList();
      document.getElementById('avo-controls')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

// ── Carte avis ────────────────────────────────
function buildCardHTML(r) {
  const initial = (r.displayName || '?').charAt(0).toUpperCase();
  const avatar  = r.avatarUrl
    ? `<img src="${r.avatarUrl}" alt="${esc(r.displayName)}" onerror="this.parentElement.textContent='${initial}'">`
    : initial;

  const date = r.updatedAt?.seconds
    ? new Date(r.updatedAt.seconds * 1000).toLocaleDateString(DATE_LOCALES[lang()] || 'fr-FR', {
        day: 'numeric', month: 'long', year: 'numeric'
      })
    : '';

  const stars = [1,2,3,4,5].map(i =>
    `<span class="${i <= r.rating ? '' : 'off'}">★</span>`
  ).join('');

  const isOwn    = currentUser?.uid === r.uid;
  const myVote   = userVotes[r.id] || null;
  const yesCount = r.helpful_yes || 0;
  const noCount  = r.helpful_no  || 0;

  const profileUrl = r.uid ? `/profil-public.html?id=${encodeURIComponent(r.uid)}` : null;

  return `
    <div class="rv-card" data-review-id="${r.id}">
      <div class="rv-card-head">
        ${profileUrl
          ? `<a class="rv-avatar" href="${profileUrl}" aria-label="${esc(tr('avo.viewProfile', { name: r.displayName }))}">${avatar}</a>`
          : `<div class="rv-avatar">${avatar}</div>`
        }
        <div class="rv-meta">
          ${profileUrl
            ? `<a class="rv-author" href="${profileUrl}">${esc(r.displayName)}</a>`
            : `<div class="rv-author">${esc(r.displayName)}</div>`
          }
          <div class="rv-date">${date}</div>
        </div>
        <div class="rv-stars-display">${stars}</div>
      </div>
      ${r.comment ? `<p class="rv-comment">${esc(r.comment)}</p>` : ''}
      <div class="rv-vote-row">
        <span class="rv-vote-label">${esc(tr('reviews.helpfulLabel'))}</span>
        ${!isOwn ? `
          <button class="rv-vote-btn rv-vote-yes ${myVote === 'yes' ? 'voted' : ''}"
                  data-review-id="${r.id}" data-value="yes"
                  ${!currentUser ? `title="${esc(tr('avo.loginToVoteTitle'))}"` : ''}>
            👍 <span class="rv-vote-num">${yesCount}</span>
          </button>
          <button class="rv-vote-btn rv-vote-no ${myVote === 'no' ? 'voted' : ''}"
                  data-review-id="${r.id}" data-value="no"
                  ${!currentUser ? `title="${esc(tr('avo.loginToVoteTitle'))}"` : ''}>
            👎 <span class="rv-vote-num">${noCount}</span>
          </button>
          <button class="rv-report-btn" data-review-id="${r.id}">${esc(tr('reviews.reportBtn'))}</button>
        ` : `
          <span class="rv-vote-own">👍 ${yesCount} · 👎 ${noCount}</span>
        `}
      </div>
    </div>`;
}

// ── Handlers vote / signaler ──────────────────
async function handleVote(btn) {
  if (!currentUser) { rvToast(tr('avo.loginToVote')); return; }

  const reviewId = btn.dataset.reviewId;
  const value    = btn.dataset.value;
  const card     = btn.closest('.rv-card');
  const allBtns  = card?.querySelectorAll('.rv-vote-btn');
  allBtns?.forEach(b => { b.disabled = true; });

  try {
    const prevVote = userVotes[reviewId] || null;  // lire AVANT écrasement
    const newVote = await voteReview(reviewId, currentUser.uid, value);
    userVotes[reviewId] = newVote;

    // FIX 2 : mise à jour chirurgicale du DOM (sans re-render brutal)
    const yesBtn = card?.querySelector('.rv-vote-yes');
    const noBtn  = card?.querySelector('.rv-vote-no');
    const yesNum = yesBtn?.querySelector('.rv-vote-num');
    const noNum  = noBtn?.querySelector('.rv-vote-num');

    let yes = parseInt(yesNum?.textContent || '0');
    let no  = parseInt(noNum?.textContent  || '0');

    if (newVote === null) {
      // Toggle off — retirer le vote
      if (value === 'yes') yes = Math.max(0, yes - 1);
      else                  no  = Math.max(0, no  - 1);
    } else {
      // Nouveau vote
      if (newVote === 'yes') yes++;
      else                    no++;
      // Retirer l'ancien si changement de camp
      if (prevVote === 'yes') yes = Math.max(0, yes - 1);
      else if (prevVote === 'no') no = Math.max(0, no - 1);
    }

    if (yesNum) yesNum.textContent = yes;
    if (noNum)  noNum.textContent  = no;
    yesBtn?.classList.toggle('voted', newVote === 'yes');
    noBtn?.classList.toggle('voted',  newVote === 'no');
    allBtns?.forEach(b => { b.disabled = false; });

    // Sync allReviews en mémoire — évite le drift au changement de filtre/tri
    const review = allReviews.find(r => r.id === reviewId);
    if (review) {
      review.helpful_yes = yes;
      review.helpful_no  = no;
    }

  } catch(e) {
    rvToast('⚠ ' + (e?.code || e?.message || String(e)));
    allBtns?.forEach(b => { b.disabled = false; });
  }
}

async function handleReport(btn) {
  if (!currentUser) { rvToast(tr('avo.loginToReport')); return; }
  if (!confirm(tr('reviews.confirmReport'))) return;
  const reviewId = btn.dataset.reviewId;
  btn.disabled = true;
  try {
    await reportReview(reviewId, currentUser.uid, 'Contenu inapproprié');
    btn.textContent = tr('reviews.reportBtnDone');
    rvToast(tr('reviews.toastReported'));
  } catch {
    btn.disabled = false;
    rvToast(tr('reviews.toastReportError'));
  }
}

// ── Toast ─────────────────────────────────────
let _timer = null;
function rvToast(msg) {
  let el = document.getElementById('rv-toast');
  if (!el) { el = document.createElement('div'); el.id = 'rv-toast'; el.className = 'rv-toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_timer);
  _timer = setTimeout(() => el.classList.remove('show'), 2500);
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Changement de langue (hook de js/i18n.js › changerLangueGlobale) ──
window.onLangueChange = () => {
  toolInfo = pickToolInfo();
  if (toolMeta.name) document.title = tr('avo.pageTitle', { tool: toolMeta.name });
  renderAll();
};
