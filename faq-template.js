/* ═══════════════════════════════════════════════════════
   faq-template.js — gabarit FIXE d'une page FAQ Albexia.
   Une page = un sujet ; plusieurs questions, chacune avec sa réponse.
   Chaque langue a son dossier : /pages/<slug>/fr/, /en/, /es/.
   /pages/<slug>/ redirige vers /fr/.
   ═══════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SITE = 'https://albexia.com';
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ul = items => `<ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;
const pageUrl = (slug, lang) => `/pages/${slug}/${lang}/`;

// Dictionnaire UI : source unique js/i18n.js
let UI = null;
function loadUI() {
  if (UI) return UI;
  const src = fs.readFileSync(path.join(__dirname, 'js', 'i18n.js'), 'utf8');
  const noop = () => {};
  const ctx = { window: {}, document: { documentElement: {}, addEventListener: noop, querySelectorAll: () => [] },
                localStorage: { getItem: () => null }, navigator: { language: 'fr' } };
  UI = vm.runInNewContext(src + '\n;UI_TRANSLATIONS', ctx);
  return UI;
}
const t = (key, lang) => { const u = loadUI(); return (u[lang] || {})[key] ?? u.fr[key] ?? key; };

// Textes d'une langue. FR = le document ; EN/ES = la traduction, seulement si complète.
function textesPour(doc, lang) {
  if (lang === 'fr') return doc;
  const tr = (doc.translations || {})[lang];
  if (!tr || !tr.titre || !tr.reponse_courte) return null;
  const frQ = (doc.questions || []).length;
  const trQ = tr.questions || [];
  if (!frQ || trQ.length !== frQ) return null;
  if (!trQ.every(q => q.question && q.reponse)) return null;
  return tr;
}

function faqLangueDisponible(doc, lang) {
  return lang === 'fr' ? !!(doc.titre && (doc.questions || []).length) : !!textesPour(doc, lang);
}

function faqLanguesPubliees(doc) {
  return ['fr', 'en', 'es'].filter(l => faqLangueDisponible(doc, l));
}

// Identifiant YouTube, quelle que soit la forme du lien.
function ytId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : '';
}

// Mise en forme inline, appliquée APRÈS échappement HTML :
//   **gras**   →  <strong>
//   [texte](https://…) ou [texte](/…)  →  lien
function inline(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g, '<a href="$2">$1</a>');
}

// Réponse : paragraphes ; « - texte » ou « -texte » = puces ; « 1. texte » = liste numérotée ;
// cellules collées (tabulations) = puces.
function renderReponse(text) {
  const out = [];
  let list = [], olist = [];
  const flushUl = () => { if (list.length) { out.push(`<ul>${list.map(i => `<li>${inline(i)}</li>`).join('')}</ul>`); list = []; } };
  const flushOl = () => { if (olist.length) { out.push(`<ol>${olist.map(i => `<li>${inline(i)}</li>`).join('')}</ol>`); olist = []; } };
  const flush = () => { flushUl(); flushOl(); };
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (line.includes('\t')) {
      flushOl();
      line.split('\t').map(c => c.trim().replace(/^-\s*/, '')).filter(Boolean).forEach(c => list.push(c));
      continue;
    }
    if (/^-/.test(line)) { flushOl(); list.push(line.replace(/^-\s*/, '')); continue; }
    if (/^\d+\.\s+/.test(line)) { flushUl(); olist.push(line.replace(/^\d+\.\s+/, '')); continue; }
    flush();
    out.push(`<p>${inline(line)}</p>`);
  }
  flush();
  return out.join('');
}

// ── Données structurées (schema.org) ─────────────────────────────
// Texte brut d'une réponse (sans balises), identique au texte visible.
function plainText(reponse) {
  return String(reponse || '').split('\n')
    .map(l => l.trim().replace(/^-\s*/, '').replace(/^\d+\.\s+/, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'))
    .filter(Boolean).join(' ');
}
// JSON échappé pour une balise <script> (aucun « </script> » possible).
function jsonLdScript(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
}
// FAQPage (questions visibles sur la page) + fil d'Ariane.
function faqJsonLd(doc, lang, txt) {
  const url = `${SITE}${pageUrl(doc.slug, lang)}`;
  const faqPage = {
    '@context': 'https://schema.org', '@type': 'FAQPage', '@id': url + '#faq', url, inLanguage: lang,
    name: txt.titre,
    mainEntity: (txt.questions || []).map(q => ({ '@type': 'Question', name: q.question,
      acceptedAnswer: { '@type': 'Answer', text: plainText(q.reponse) } })),
  };
  const fil = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Albexia', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'FAQ', item: `${SITE}/faq/` },
      { '@type': 'ListItem', position: 3, name: txt.titre, item: url },
    ],
  };
  return jsonLdScript(faqPage) + jsonLdScript(fil);
}
// Hub /faq/ : liste des pages publiées (CollectionPage + ItemList).
function faqHubJsonLd(docs) {
  const hub = {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Questions fréquentes sur l’IA', url: `${SITE}/faq/`, inLanguage: 'fr',
    mainEntity: { '@type': 'ItemList', itemListElement: docs.map((d, i) => ({ '@type': 'ListItem', position: i + 1,
      url: `${SITE}${pageUrl(d.slug, 'fr')}`, name: d.titre })) },
  };
  return jsonLdScript(hub);
}

// Page de redirection : /pages/<slug>/ → /pages/<slug>/fr/
function faqRedirectHTML(slug) {
  const u = pageUrl(slug, 'fr');
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta http-equiv="refresh" content="0; url=${u}"><link rel="canonical" href="${SITE}${u}"><title>Albexia</title></head><body><a href="${u}">${u}</a></body></html>`;
}

function generateFAQPage(doc, { lang = 'fr', toolsById = {}, pagesBySlug = {}, plusLoin = [], navHTML = () => '', footerHTML = () => '', favicon = '' } = {}) {
  if (!faqLangueDisponible(doc, lang)) return null;     // pas de traduction complète → pas de page
  const txt = textesPour(doc, lang);
  const L = k => t(k, lang);
  const v = doc.video || {};                             // technique : repris du FR
  const vt = txt.video || {};                            // textes vidéo de la langue
  const hasVideo = !!v.url;
  const idYt = ytId(v.url);
  const outils = (doc.outils || []).filter(id => toolsById[id]).map(id => ({ id, ...toolsById[id] }));
  const textesOutils = Object.fromEntries((txt.outils_textes || []).map(x => [x.id, x.texte]));
  const questions = txt.questions || [];

  const videoBlock = hasVideo && `<section class="faq-section faq-video-section"><h2>${esc(L('faq.videoLead'))}</h2>${vt.intro ? `<p>${esc(vt.intro)}</p>` : ''}<p><strong>${esc(vt.titre)}</strong>${v.createur ? ` · ${esc(v.createur)}` : ''}${v.duree ? ` · ${esc(v.duree)}` : ''}</p>${idYt ? `<div class="faq-yt" data-yt="${esc(idYt)}" role="button" tabindex="0" aria-label="${esc(vt.titre)}"><img src="https://img.youtube.com/vi/${esc(idYt)}/hqdefault.jpg" alt="${esc(vt.titre)}" loading="lazy"><span class="faq-yt-play" aria-hidden="true">▶</span><span class="faq-yt-bar">${esc(L('faq.watchYt'))}</span></div><a class="faq-text-link" href="https://www.youtube.com/watch?v=${esc(idYt)}" target="_blank" rel="noopener">${esc(L('faq.watchYt'))} →</a>` : ''}${(txt.decouvrir || []).length ? `<div class="faq-learning-card"><span class="faq-learning-num">01</span><h3>${esc(L('faq.discover'))}</h3>${ul(txt.decouvrir)}</div>` : ''}${(txt.savoir_faire || []).length ? `<div class="faq-learning-card"><span class="faq-learning-num">02</span><h3>${esc(L('faq.canDo'))}</h3>${ul(txt.savoir_faire)}</div>` : ''}</section>`;

  const sections = [
    `<header class="faq-heading"><h1>${esc(txt.titre)}</h1></header>`,
    `<section class="faq-short-answer"><p class="faq-overline">${esc(L('faq.shortAnswer'))}</p><p>${esc(txt.reponse_courte)}</p></section>`,
    ...questions.map((q, i) =>
      `<section class="faq-qa"><h2>${esc(q.question)}</h2>${renderReponse(q.reponse)}</section>`),
    videoBlock,
    (txt.retenir || []).length && `<section class="faq-section"><h2>${esc(L('faq.takeaway'))}</h2>${ul(txt.retenir)}</section>`,
    outils.length && `<section class="faq-section"><h2>${esc(L('faq.tools'))}</h2>${outils.map(o => `<div class="faq-tool-text"><h3>${esc(o.nom || o.name)}</h3>${textesOutils[o.id] ? `<p>${esc(textesOutils[o.id])}</p>` : ''}<a class="faq-text-link" href="${esc(o.url)}">${esc(L('faq.seeTool'))} ${esc(o.nom || o.name)} →</a></div>`).join('')}</section>`,
    (txt.questions_associees || []).length && `<section class="faq-section"><h2>${esc(L('faq.related'))}</h2>${txt.questions_associees.map(q => { const cible = (pagesBySlug[q.slug] || {})[lang]; if (!cible) return ''; return `<div class="faq-related-card"><strong>${esc(cible.titre || q.question)}</strong><p>${esc(cible.reponse_courte || q.accroche || '')}</p><a class="faq-text-link" href="${pageUrl(q.slug, lang)}">${esc(L('faq.readPage'))} →</a></div>`; }).join('')}</section>`,
    plusLoin.length && `<section class="faq-section faq-more-links"><h2>${esc(L('faq.moreLinks'))}</h2>${plusLoin.slice(0, 5).map(p => `<a href="${pageUrl(p.slug, lang)}"><span>${esc(p.question)}</span><span aria-hidden="true">↗</span></a>`).join('')}</section>`,
    `<section class="faq-more"><h2>${esc(L('faq.continue'))}</h2><p><a href="/faq/">${esc(L('faq.back'))}</a></p></section>`,
  ].filter(Boolean);

  // hreflang : uniquement les langues réellement publiées ; x-default = français
  const langs = faqLanguesPubliees(doc);
  const hreflang = langs.map(l => `<link rel="alternate" hreflang="${l}" href="${SITE}${pageUrl(doc.slug, l)}">`).join('') +
    (langs.includes('fr') ? `<link rel="alternate" hreflang="x-default" href="${SITE}${pageUrl(doc.slug, 'fr')}">` : '');

  const yt = idYt ? `<script>document.querySelectorAll('.faq-yt').forEach(function(el){function go(){var f=document.createElement('iframe');f.src='https://www.youtube-nocookie.com/embed/'+el.dataset.yt+'?autoplay=1';f.allow='autoplay; encrypted-media; picture-in-picture';f.allowFullscreen=true;f.style.cssText='position:absolute;inset:0;width:100%;height:100%;border:0';el.innerHTML='';el.appendChild(f);el.removeAttribute('role');}el.addEventListener('click',go);el.addEventListener('keydown',function(e){if(e.key==='Enter')go();});});</script>` : '';

  const head = `<!DOCTYPE html><html lang="${lang}" data-static-lang="${lang}"><head><script src="/js/theme.js"></script><script src="/js/i18n.js"></script><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(txt.titre)} | Albexia</title><meta name="description" content="${esc(txt.reponse_courte)}"><link rel="canonical" href="${SITE}${pageUrl(doc.slug, lang)}">${hreflang}${faqJsonLd(doc, lang, txt)}${favicon ? `<link rel="icon" type="image/png" sizes="512x512" href="${favicon}"><link rel="apple-touch-icon" href="${favicon}">` : ''}<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/faq-detail.css"><link rel="stylesheet" href="/css/themes.css"></head><body>`;
  const body = `${navHTML(lang)}<main class="faq-page"><div class="faq-layout"><article class="faq-content">${sections.join('\n')}</article></div></main>${yt}${footerHTML(lang)}`;
  return `${head}\n${body}</body></html>`;
}

module.exports = { generateFAQPage, faqLangueDisponible, faqLanguesPubliees, faqRedirectHTML, faqTextes: textesPour, renderReponse, ytId, plainText, faqHubJsonLd, t };
