/* ═══════════════════════════════════════════════════════
   build-search-index.js — Construit data/search-index.json.

   Aucune lecture Firestore ici : ce module reçoit les documents
   lus par gen-fiches.js (outils, articles, glossaire, comparaisons,
   galerie). Il ne lit aucun fichier JSON du dépôt.

   Trois langues : fr, en, es. Les tutoriels (vidéothèque, saisie
   sur le document FR) sont indexés dans chaque langue où l'outil
   existe, avec le même titre.
   ═══════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const LANGUES = ['fr', 'en', 'es'];
const SORTIE = path.join(__dirname, 'data', 'search-index.json');

function slugify(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
// Même règle que buildToolPageUrl() dans js/firestore.js
function urlOutil(t) {
  if (t.generer_fiche === false) return null;
  const slug = slugify(t.name);
  if (!slug) return null;
  const folder = t.plan === 'featured' ? 'featured' : t.plan === 'starter' ? 'starter' : 'standard';
  return `/tools/${folder}/${t.langue || 'fr'}/${slug}/`;
}
const langueOk = d => LANGUES.includes(d.langue || 'fr');
const langueDe = d => (LANGUES.includes(d.langue) ? d.langue : 'fr');

// Identifiant du document FR d'un outil (versions en/es : id "{fr}-en")
function idFrancais(t) {
  if (t.traductions?.fr) return t.traductions.fr;
  if (t.langue && t.langue !== 'fr' && t.id.endsWith('-' + t.langue)) return t.id.slice(0, -(t.langue.length + 1));
  return t.id;
}

/**
 * @param {{outils: object[], articles: object[], glossaire: object[], comparaisons: object[], galerie: object[]}} sources
 *        Documents Firestore déjà lus, avec le champ `id` pour les outils.
 */
function buildSearchIndex(sources) {
  const entries = [];
  const outils = (sources.outils || []).filter(t => t.status !== 'a_enrichir');
  const parId = Object.fromEntries(outils.map(t => [t.id, t]));

  for (const t of outils) {
    if (!langueOk(t)) continue;
    const url = urlOutil(t);
    if (!url) continue;
    const lang = langueDe(t);
    entries.push({
      type: 'outil', lang, title: t.name || '', url,
      subtitle: t.description || '',
      keywords: [t.category, ...(t.tags || [])].filter(Boolean),
    });

    // Tutoriels : saisis sur le document FR, indexés dans chaque langue
    const videos = (parId[idFrancais(t)] && parId[idFrancais(t)].videotheque) || [];
    for (const v of videos) {
      if (!v.titre) continue;
      entries.push({
        type: 'video', lang, title: v.titre, url: url + 'tutoriels/',
        subtitle: [t.name, v.canal, v.duree].filter(Boolean).join(' · '),
        keywords: [t.name, v.canal].filter(Boolean),
      });
    }
  }

  // Articles : champs vérifiés dans gen-fiches.js (title, slug, langue)
  // URL vérifiée : /articles/{langue}/{slug}/
  for (const a of sources.articles || []) {
    if (!a.slug || !a.title) continue;
    const lang = langueDe(a);
    entries.push({
      type: 'article', lang, title: a.title,
      url: `/articles/${lang}/${a.slug}/`,
      subtitle: a.excerpt || '', keywords: a.tags || [], // tags vérifiés dans admin/index.html (a-tags)
    });
  }

  // Glossaire : champs vérifiés (terme / definitionFlash en fr,
  // terme_en / definitionFlash_en, terme_es / definitionFlash_es).
  // Une entrée par langue seulement si la traduction existe.
  // URL vérifiée : /glossaire/{slug}/ (fr), /glossaire/{slug}/en/, /glossaire/{slug}/es/
  for (const g of sources.glossaire || []) {
    if (!g.slug) continue;
    if (g.terme) entries.push({
      type: 'glossaire', lang: 'fr', title: g.terme,
      url: `/glossaire/${g.slug}/`, subtitle: g.definitionFlash || '', keywords: g.tags || [], // gc-tags vérifié
    });
    if (g.terme_en) entries.push({
      type: 'glossaire', lang: 'en', title: g.terme_en,
      url: `/glossaire/${g.slug}/en/`, subtitle: g.definitionFlash_en || '', keywords: g.tags || [],
    });
    if (g.terme_es) entries.push({
      type: 'glossaire', lang: 'es', title: g.terme_es,
      url: `/glossaire/${g.slug}/es/`, subtitle: g.definitionFlash_es || '', keywords: g.tags || [],
    });
  }

  // Comparaisons : pas de champ titre dans gen-fiches.js. Le titre est
  // reconstruit à partir des slugs des deux outils (outil_a_slug, outil_b_slug).
  // URL vérifiée : /comparateur/{slug}/ (fr) ou /comparateur/{langue}/{slug}/
  const humain = slug => (slug || '').split('-').filter(Boolean)
    .map(m => m.charAt(0).toUpperCase() + m.slice(1)).join(' ');
  for (const c of sources.comparaisons || []) {
    if (!c.slug || !c.outil_a_slug || !c.outil_b_slug) continue;
    const lang = langueDe(c); // champ `langue` vérifié (comp.langue || 'fr')
    entries.push({
      type: 'comparaison', lang,
      title: `${humain(c.outil_a_slug)} vs ${humain(c.outil_b_slug)}`,
      url: lang === 'fr' ? `/comparateur/${c.slug}/` : `/comparateur/${lang}/${c.slug}/`,
      subtitle: '', keywords: [c.outil_a_slug, c.outil_b_slug],
    });
  }

  // Galerie : pas de champ langue dans admin/index.html, contenu non traduit.
  // Chaque œuvre est indexée dans les trois langues (même logique que les tutoriels).
  // Champs vérifiés : title, tool, type, author.
  for (const g of sources.galerie || []) {
    if (!g.title) continue;
    for (const lang of LANGUES) entries.push({
      type: 'galerie', lang, title: g.title,
      url: '/index.html#gallery', subtitle: g.tool || '', keywords: [g.tool, g.author].filter(Boolean),
    });
  }

  const propres = entries.filter(e => e.title);
  fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
  fs.writeFileSync(SORTIE, JSON.stringify({ generated: new Date().toISOString(), entries: propres }));
  console.log('[Albexia] Index de recherche :', propres.length, 'entrées');
  return propres.length;
}

module.exports = { buildSearchIndex };
