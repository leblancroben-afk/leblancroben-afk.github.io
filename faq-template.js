/* ═══════════════════════════════════════════════════════
   faq-template.js — gabarit FIXE d'une page FAQ Albexia.
   Une page = un sujet ; plusieurs questions, chacune avec sa réponse.

   Modèle Firestore (collection `faq`) :
   titre, slug, categorie, sous_categorie, status ('publie' | 'brouillon'),
   reponse_courte,
   questions : [{ question, reponse }]   (reponse : un paragraphe par ligne ;
                                          une ligne commençant par « - » = puce)
   video : { url, titre, createur, duree, langue, intro }
   decouvrir, savoir_faire (listes, issues de la vidéo) ; retenir (liste)
   outils : [ids de la collection outils]
   questions_associees : [{ question, accroche, slug }]
   translations.en / translations.es : mêmes champs traduits, questions incluses.

   Règles :
   - FR : généré si titre et au moins une question.
   - EN / ES : généré seulement si titre, réponse courte et TOUTES les
     questions ont leur traduction (question et réponse).
   - Aucun repli sur le français pour les textes traduisibles.
   - Libellés fixes : js/i18n.js (clés faq.*).
   ═══════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ul = items => `<ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;

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

// Réponse : paragraphes, et lignes « - » regroupées en liste.
function renderReponse(text) {
  const out = [];
  let list = [];
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('- ')) { list.push(line.slice(2).trim()); continue; }
    if (list.length) { out.push(ul(list)); list = []; }
    out.push(`<p>${esc(line)}</p>`);
  }
  if (list.length) out.push(ul(list));
  return out.join('');
}

function generateFAQPage(doc, { lang = 'fr', toolsById = {}, pagesBySlug = {}, navHTML = () => '', footerHTML = () => '', favicon = '' } = {}) {
  if (!faqLangueDisponible(doc, lang)) return null;     // pas de traduction complète → pas de page
  const txt = textesPour(doc, lang);                     // textes de la langue demandée
  const L = k => t(k, lang);
  const v = doc.video || {};                             // technique : repris du FR
  const vt = txt.video || {};                            // textes vidéo de la langue
  const hasVideo = !!v.url;
  const outils = (doc.outils || []).filter(id => toolsById[id]).map(id => ({ id, ...toolsById[id] }));
  // Texte propre à cette page pour chaque outil : [{id, texte}] (FR dans le document, traduit dans translations)
  const textesOutils = Object.fromEntries((txt.outils_textes || []).map(x => [x.id, x.texte]));
  const questions = txt.questions || [];

  const sections = [
    `<header class="faq-heading"><h1>${esc(txt.titre)}</h1></header>`,
    `<section class="faq-short-answer"><p class="faq-overline">${esc(L('faq.shortAnswer'))}</p><p>${esc(txt.reponse_courte)}</p></section>`,
    ...questions.map((q, i) =>
      `<section class="faq-question"><p class="faq-overline">${esc(L('faq.questionN'))} ${i + 1}</p><h2>${esc(q.question)}</h2>${renderReponse(q.reponse)}</section>`),
    hasVideo && `<section class="faq-section faq-video-section"><h2>${esc(L('faq.videoLead'))}</h2>${vt.intro ? `<p>${esc(vt.intro)}</p>` : ''}<p><strong>${esc(vt.titre)}</strong>${v.createur ? ` · ${esc(v.createur)}` : ''}${v.duree ? ` · ${esc(v.duree)}` : ''}</p><div class="faq-video"><iframe src="${esc(v.url)}" title="${esc(vt.titre)}" loading="lazy" allowfullscreen></iframe></div>${(txt.decouvrir || []).length ? `<h3>${esc(L('faq.discoverVideo'))}</h3>${ul(txt.decouvrir)}` : ''}${(txt.savoir_faire || []).length ? `<h3>${esc(L('faq.canDoVideo'))}</h3>${ul(txt.savoir_faire)}` : ''}</section>`,
    (txt.retenir || []).length && `<section class="faq-section"><h2>${esc(L('faq.takeaway'))}</h2>${ul(txt.retenir)}</section>`,
    outils.length && `<section class="faq-section"><h2>${esc(L('faq.tools'))}</h2>${outils.map(o => `<div class="faq-tool-text"><h3>${esc(o.nom || o.name)}</h3>${textesOutils[o.id] ? `<p>${esc(textesOutils[o.id])}</p>` : ''}<a class="faq-text-link" href="${esc(o.url)}">${esc(L('faq.seeTool'))} ${esc(o.nom || o.name)} →</a></div>`).join('')}</section>`,
    (txt.questions_associees || []).length && `<section class="faq-section"><h2>${esc(L('faq.related'))}</h2>${txt.questions_associees.map(q => { const cible = (pagesBySlug[q.slug] || {})[lang]; if (!cible) return ''; return `<div class="faq-related-card"><strong>${esc(cible.titre || q.question)}</strong><p>${esc(cible.reponse_courte || q.accroche || '')}</p><a class="faq-text-link" href="/pages/${esc(q.slug)}/${lang === 'fr' ? '' : lang + '/'}">${esc(L('faq.readPage'))} →</a></div>`; }).join('')}</section>`,
    `<section class="faq-more"><h2>${esc(L('faq.continue'))}</h2><p><a href="/faq/">${esc(L('faq.back'))}</a></p></section>`,
  ].filter(Boolean);

  const head = `<!DOCTYPE html><html lang="${lang}" data-static-lang="${lang}"><head><script src="/js/theme.js"></script><script src="/js/i18n.js"></script><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(txt.titre)} | Albexia</title><meta name="description" content="${esc(txt.reponse_courte)}"><link rel="canonical" href="https://albexia.com/pages/${esc(doc.slug)}/${lang === 'fr' ? '' : lang + '/'}">${favicon ? `<link rel="icon" type="image/svg+xml" href="${favicon}">` : ''}<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/faq-detail.css"><link rel="stylesheet" href="/css/themes.css"></head><body>`;
  const body = `${navHTML(lang)}<main class="faq-page"><div class="faq-layout"><article class="faq-content">${sections.join('\n')}</article></div></main>${footerHTML(lang)}`;
  return `${head}\n${body}</body></html>`;
}

// Textes d'une page dans une langue donnée (sert aux liens entre pages).
function faqTextes(doc, lang) { return textesPour(doc, lang); }

function faqLanguesPubliees(doc) {
  return ['fr', 'en', 'es'].filter(l => faqLangueDisponible(doc, l));
}

module.exports = { generateFAQPage, faqLangueDisponible, faqLanguesPubliees, faqTextes, renderReponse, t };
