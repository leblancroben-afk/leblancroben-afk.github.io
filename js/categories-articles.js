/* Catégories d'articles Albexia — liste unique et obligatoire.
 * Utilisé par : blog (js/app.js), profil.html, admin/index.html, gen-fiches.js.
 * La valeur stockée dans Firestore reste le libellé FR (champ `category` / `categorie`),
 * comme avant : seul ce fichier connaît les libellés EN/ES et les anciennes valeurs. */
(function (root) {
  'use strict';

  var CATEGORIES = [
    { id: 'decouvrir-ia',         fr: "Découvrir l'IA",          en: 'Discover AI',             es: 'Descubrir la IA' },
    { id: 'outils-ia',            fr: 'Outils IA',               en: 'AI Tools',                es: 'Herramientas de IA' },
    { id: 'ia-quotidien',         fr: 'IA au quotidien',         en: 'AI in Everyday Life',     es: 'IA en el día a día' },
    { id: 'productivite-travail', fr: 'Productivité et travail', en: 'Productivity and Work',   es: 'Productividad y trabajo' },
    { id: 'securite-ethique',     fr: 'Sécurité et éthique',     en: 'Safety and Ethics',       es: 'Seguridad y ética' },
    { id: 'guides-tutoriels',     fr: 'Guides et tutoriels',     en: 'Guides and Tutorials',    es: 'Guías y tutoriales' }
  ];

  // Anciennes valeurs (déjà en base ou dans d'anciens formulaires) → id de la nouvelle catégorie.
  // Clés au format « plié » (voir plier()).
  var ANCIENNES = {
    'analyse': 'decouvrir-ia',
    'introduction a l\'ia': 'decouvrir-ia',
    'debutant': 'decouvrir-ia',
    'guide': 'guides-tutoriels',
    'guides': 'guides-tutoriels',
    'tutoriel': 'guides-tutoriels',
    'tutorial': 'guides-tutoriels',
    'comparatif': 'outils-ia',
    'selection': 'outils-ia',
    'actualite createur': 'outils-ia',
    'creator news': 'outils-ia',
    'novedades del creador': 'outils-ia',
    'noticias del creador': 'outils-ia',
    'productivite': 'productivite-travail',
    'securite': 'securite-ethique',
    'quotidien': 'ia-quotidien',
    // anciennes catégories du formulaire créateur (profil.html)
    'redaction et contenu': 'outils-ia',
    'image et design': 'outils-ia',
    'video et audio': 'outils-ia',
    'code et developpement': 'outils-ia',
    'marketing et seo': 'productivite-travail',
    'education': 'guides-tutoriels',
    'sante et bien-etre': 'ia-quotidien',
    'finance et business': 'productivite-travail',
    'autre': 'outils-ia'
  };

  function plier(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[\u2018\u2019\u02bc`]/g, "'")
      .replace(/&/g, ' et ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  var INDEX = {};
  CATEGORIES.forEach(function (c) {
    INDEX[plier(c.id)] = c.id;
    INDEX[plier(c.fr)] = c.id;
    INDEX[plier(c.en)] = c.id;
    INDEX[plier(c.es)] = c.id;
  });
  Object.keys(ANCIENNES).forEach(function (k) { INDEX[k] = ANCIENNES[k]; });

  function parId(id) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i];
    return null;
  }

  // Valeur brute quelconque → libellé FR officiel, ou null si inconnue.
  function normaliser(raw) {
    var id = INDEX[plier(raw)];
    return id ? parId(id).fr : null;
  }

  // Valeur brute → libellé dans la langue demandée (repli : valeur brute).
  function libelle(raw, lang) {
    var id = INDEX[plier(raw)];
    if (!id) return String(raw == null ? '' : raw);
    var c = parId(id);
    return c[lang] || c.fr;
  }

  var api = {
    CATEGORIES: CATEGORIES,
    liste: function () { return CATEGORIES.slice(); },
    normaliser: normaliser,
    libelle: libelle,
    estValide: function (raw) { return CATEGORIES.some(function (c) { return c.fr === raw; }); }
  };

  root.AlbexiaArticleCats = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
