/* ═══════════════════════════════════════════════════════
   faq-template.js — gabarit FIXE d'une page FAQ Albexia.

   Règles (identiques aux fiches outils) :
   - FR : toujours généré.
   - EN / ES : généré SEULEMENT si la traduction existe
     (translations.en / translations.es avec au moins titre
     ET réponse courte). Sinon : aucune page, rien d'affiché.
   - Textes traduisibles : uniquement ceux de la langue demandée,
     jamais de repli sur le français.
   - Champs techniques (slug, URL vidéo, outils, durée) : repris
     du document FR.
   - Libellés fixes (« Réponse courte », « Retour au centre
     d’aide »…) : dictionnaire UI de js/i18n.js, clés faq.*.
   ═══════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Dictionnaire UI réutilisé tel quel depuis js/i18n.js (source unique).
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

// Texte d'une langue : pour le FR, le document ; pour EN/ES, la traduction seulement.
function textesPour(doc, lang) {
  if (lang === 'fr') return doc;
  const tr = (doc.translations || {})[lang];
  return tr && tr.titre && tr.reponse_courte ? tr : null;
}

// Un document FAQ a-t-il une page dans cette langue ?
function faqLangueDisponible(doc, lang) {
  return lang === 'fr' ? !!doc.titre : !!textesPour(doc, lang);
}

const ul = items => `<ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>`;

function generateFAQPage(doc, { lang = 'fr', toolsById = {}, navHTML = () => '', footerHTML = () => '', favicon = '' } = {}) {
  if (!faqLangueDisponible(doc, lang)) return null; // pas de traduction → pas de page
  const txt = textesPour(doc, lang);
  const fr = doc;                                    // champs techniques
  const outils = (fr.outils || []).map(id => toolsById[id]).filter(Boolean);
  const v = fr.video || {};
  const vt = (txt.video || {});                      // textes vidéo traduits
  const hasVideo = !!v.url;                          // URL technique, repris du FR
  const L = k => t(k, lang);
  let num = 0; const n = () => (num += 1) + '. ';
  const paras = (txt.reponse_paragraphes || []).map(p => `<p>${esc(p)}</p>`).join('');
  const questions = txt.questions_associees || [];

  const sections = [
    `<header class="faq-heading"><h1>${esc(txt.titre)}</h1></header>`,
    `<section class="faq-short-answer"><p class="faq-overline">${esc(L('faq.shortAnswer'))}</p><p>${esc(txt.reponse_courte)}</p></section>`,
    paras && `<section class="faq-section"><h2>${esc(L('faq.detailed'))}</h2>${paras}</section>`,
    hasVideo && `<section class="faq-section faq-video-section"><h2>${esc(L('faq.video'))}</h2>${vt.intro ? `<p>${esc(vt.intro)}</p>` : ''}<p><strong>${esc(vt.titre)}</strong>${v.createur ? ` · ${esc(v.createur)}` : ''}${v.duree ? ` · ${esc(v.duree)}` : ''}</p><div class="faq-video"><iframe src="${esc(v.url)}" title="${esc(vt.titre)}" loading="lazy" allowfullscreen></iframe></div></section>`,
    (txt.decouvrir || []).length && `<section class="faq-section"><h2>${n()}${esc(L('faq.discover'))}</h2>${ul(txt.decouvrir)}</section>`,
    (txt.savoir_faire || []).length && `<section class="faq-section"><h2>${n()}${esc(L('faq.canDo'))}</h2>${ul(txt.savoir_faire)}</section>`,
    (txt.retenir || []).length && `<section class="faq-section"><h2>${n()}${esc(L('faq.takeaway'))}</h2>${ul(txt.retenir)}</section>`,
    outils.length && `<section class="faq-section"><h2>${n()}${esc(L('faq.tools'))}</h2><div class="faq-tool-list">${outils.map(o => `<a class="faq-tool" href="${esc(o.url)}"><span class="faq-tool-mark">${esc((o.nom || o.name || '?').slice(0, 2).toUpperCase())}</span><span class="faq-tool-copy"><strong>${esc(o.nom || o.name)}</strong><small>${esc(o.description || '')}</small></span><span class="faq-tool-arrow">→</span></a>`).join('')}</div></section>`,
    questions.length && `<section class="faq-section"><h2>${n()}${esc(L('faq.related'))}</h2>${questions.map(q => `<a class="faq-tool" href="/pages/${esc(q.slug)}/${lang === 'fr' ? '' : lang + '/'}"><span class="faq-tool-copy"><strong>${esc(q.question)}</strong><small>${esc(q.accroche || '')}</small></span><span class="faq-tool-arrow">→</span></a>`).join('')}</section>`,
    `<section class="faq-more"><h2>${esc(L('faq.continue'))}</h2><p><a href="/faq/">${esc(L('faq.back'))}</a></p></section>`,
  ].filter(Boolean);

  const head = `<!DOCTYPE html><html lang="${lang}" data-static-lang="${lang}"><head><script src="/js/theme.js"></script><script src="/js/i18n.js"></script><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(txt.titre)} | Albexia</title><meta name="description" content="${esc(txt.reponse_courte)}"><link rel="canonical" href="https://albexia.com/pages/${esc(fr.slug)}/${lang === 'fr' ? '' : lang + '/'}">${favicon ? `<link rel="icon" type="image/svg+xml" href="${favicon}">` : ''}<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"><link rel="stylesheet" href="/css/style.css"><link rel="stylesheet" href="/css/faq-detail.css"><link rel="stylesheet" href="/css/themes.css"></head><body>`;
  const body = `${navHTML(lang)}<main class="faq-page"><div class="faq-layout"><article class="faq-content">${sections.join('\n')}</article></div></main>${footerHTML(lang)}`;
  return `${head}\n${body}</body></html>`;
}

// Langues réellement publiées pour un document (sert aux liens entre langues).
function faqLanguesPubliees(doc) {
  return ['fr', 'en', 'es'].filter(l => faqLangueDisponible(doc, l));
}

module.exports = { generateFAQPage, faqLangueDisponible, faqLanguesPubliees, t };
