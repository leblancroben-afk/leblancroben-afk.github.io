#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════
   enrichir-outils.js — Complète les outils créés en « ajout rapide »
   dans l'admin (nom + plan seulement).

   Source : Firestore « outils » où status === 'a_enrichir'
   Écrit  : url, category, price, description, tags, maker, plateformes,
            ideal_pour, favicon, emoji, alternatives, fonctionnalites, faq,
            tarifs (non vérifiés), presentation, meta_description, etc.
            puis status='active', generer_fiche=true, enrichi_ia=true.

   LOTS : 6 outils par requête Gemini (TAILLE_LOT). Les règles de
   rédaction sont envoyées une seule fois dans systemInstruction.

   QUOTA PARTAGÉ : le quota gratuit Gemini est commun à tous les scripts.
   Ce script s'arrête après MAX_REQUETES_PAR_RUN requêtes (variable
   d'environnement GEMINI_MAX_REQUETES_PAR_RUN, 3 par défaut, soit 18 outils).
   Les nouvelles tentatives (503) comptent dans ce budget.

   ÉTATS :
   - Réponse complète           → publié (status 'active').
   - trouve: false ou incomplet → enrichissement_echec=true : l'outil sort
     de la file, il n'est plus renvoyé à chaque run. Pour le relancer à la
     main, supprimer ce champ dans Firestore.
   - Absent de la réponse, lot tronqué ou JSON invalide → rien d'écrit,
     l'outil reste dans la file pour le run suivant.

   Usage : node enrichir-outils.js
   ═══════════════════════════════════════════════════════ */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-3.5-flash';
const TAILLE_LOT = 6;
const MAX_REQUETES_PAR_RUN = parseInt(process.env.GEMINI_MAX_REQUETES_PAR_RUN || '3', 10);
const MAX_TOKENS_SORTIE = 16384;
// Catégorie générique : jamais proposée à Gemini (elle sert de choix par défaut).
// Elle reste utilisable si l'admin la choisit explicitement.
const CATEGORIES_EXCLUES_IA = ['Outils IA'];
// Hébergeurs de code : leur icône est celle de la plateforme, pas celle de l'outil.
const HEBERGEURS_CODE = ['github.com', 'gitlab.com', 'huggingface.co', 'replit.com', 'kaggle.com'];

const ICON_KEYS = require('./js/fiche-icons.js').FEATURE_KEYS;

// Compteur de requêtes envoyées pendant ce run (retries inclus).
let requetesUtilisees = 0;

// Catégories d'OUTILS : collection Firestore « categories » (celle de l'admin).
// Ne pas confondre avec js/categories-articles.js, qui ne sert qu'aux articles.
async function fetchCategoriesOutils() {
  const snap = await db.collection('categories').get();
  return snap.docs.map(d => d.data().nom).filter(Boolean);
}

// Catégorie finale. Le choix de l'admin prime, même s'il a été retiré de la liste.
// Sinon la proposition de Gemini, si elle figure dans la liste des outils. Sinon ''.
function categorieFinale(categorieAdmin, propositionIA, categoriesOutils) {
  const admin = String(categorieAdmin || '').trim();
  if (admin) return admin;
  const ia = String(propositionIA || '').trim();
  return categoriesOutils.includes(ia) ? ia : '';
}

// Règles communes à tous les outils du lot (envoyées une seule fois).
function construireInstruction(categories) {
  return `Tu structures des fiches complètes pour un annuaire d'outils IA francophone (Albexia).
Tu n'as PAS accès à une recherche web : utilise uniquement ce que tu sais avec certitude.

RÈGLE ABSOLUE : si tu n'es pas sûr de l'identité exacte d'un outil (nom ambigu, outil trop récent ou trop
obscur, risque de confusion avec un outil similaire), réponds {"trouve": false} pour cet outil. N'invente
JAMAIS une information plausible. Cette règle vaut champ par champ : si tu ne connais pas un détail précis,
mets null pour ce champ et remplis le reste.

Par outil :
- category : UNE valeur exacte choisie dans cette liste (recopie le texte) : ${JSON.stringify(categories)}. Si aucune ne convient, prends la plus proche, n'en invente jamais.
- price : "free" (gratuit), "freemium" (gratuit avec palier payant) ou "paid" (payant uniquement).
- description : 150 à 200 caractères, en français, factuelle, sans superlatifs exagérés.
- tags : 3 à 6 mots-clés courts en français.
- alternatives : 2 à 3 concurrents réellement comparables, séparés par des virgules.
- fonctionnalites : 3 à 4 entrées {icon, titre, desc}. icon doit être EXACTEMENT une de ces clés : ${ICON_KEYS.join(', ')} (jamais d'emoji).
- faq : 2 à 3 entrées {q, a}. Chaque réponse (a) fait 2 à 3 phrases courtes, 300 caractères maximum. Ne répète jamais une phrase ni une expression : une réponse qui tourne en boucle est rejetée.
- presentation : 2 à 3 paragraphes factuels séparés par un retour à la ligne.
- meta_description : 155 caractères maximum.
- tarifs : 2 à 4 formules publiques {nom, prix, periode, desc}. Si le montant exact est incertain, prix et periode à "" (chaîne vide). Un tableau vide vaut mieux qu'un tarif inventé.
- interface_fr, api, mobile, essai_gratuit : true, false ou null si incertain.
- modele : "proprietaire" ou "open_source", null si incertain. annee_creation : entier ou null.
- url_tarifs, duree_essai, sous_categorie, support, type_outil, langues_disponibles, maker, plateformes, ideal_pour, emoji : chaîne ou null si incertain.

Réponds UNIQUEMENT avec un tableau JSON, une entrée par outil demandé, en gardant le même "index".
Aucune prose, aucun markdown.`;
}

// Schéma de sortie : Gemini doit renvoyer exactement cette forme.
const SCHEMA_LOT = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      index: { type: 'INTEGER' },
      trouve: { type: 'BOOLEAN' },
      url: { type: 'STRING', nullable: true },
      category: { type: 'STRING', nullable: true },
      price: { type: 'STRING', nullable: true },
      description: { type: 'STRING', nullable: true },
      tags: { type: 'ARRAY', items: { type: 'STRING' }, nullable: true },
      maker: { type: 'STRING', nullable: true },
      plateformes: { type: 'STRING', nullable: true },
      ideal_pour: { type: 'STRING', nullable: true },
      emoji: { type: 'STRING', nullable: true },
      alternatives: { type: 'STRING', nullable: true },
      fonctionnalites: {
        type: 'ARRAY', nullable: true,
        items: {
          type: 'OBJECT',
          properties: {
            icon: { type: 'STRING' },
            titre: { type: 'STRING' },
            desc: { type: 'STRING' },
          },
        },
      },
      faq: {
        type: 'ARRAY', nullable: true,
        items: {
          type: 'OBJECT',
          properties: { q: { type: 'STRING' }, a: { type: 'STRING' } },
        },
      },
      presentation: { type: 'STRING', nullable: true },
      meta_description: { type: 'STRING', nullable: true },
      sous_categorie: { type: 'STRING', nullable: true },
      modele: { type: 'STRING', nullable: true },
      annee_creation: { type: 'INTEGER', nullable: true },
      support: { type: 'STRING', nullable: true },
      tarifs: {
        type: 'ARRAY', nullable: true,
        items: {
          type: 'OBJECT',
          properties: {
            nom: { type: 'STRING' },
            prix: { type: 'STRING' },
            periode: { type: 'STRING' },
            desc: { type: 'STRING' },
          },
        },
      },
      interface_fr: { type: 'BOOLEAN', nullable: true },
      api: { type: 'BOOLEAN', nullable: true },
      mobile: { type: 'BOOLEAN', nullable: true },
      url_tarifs: { type: 'STRING', nullable: true },
      essai_gratuit: { type: 'BOOLEAN', nullable: true },
      duree_essai: { type: 'STRING', nullable: true },
      type_outil: { type: 'STRING', nullable: true },
      langues_disponibles: { type: 'STRING', nullable: true },
    },
    required: ['index', 'trouve'],
  },
};

// Un appel = un lot. Renvoie une Map index-local -> infos.
// Lève une erreur avec err.quota = true si le quota est épuisé (arrêt du run).
async function appelerGeminiLot(lot, categories, tentative = 0) {
  if (requetesUtilisees >= MAX_REQUETES_PAR_RUN) {
    const err = new Error('Budget de requêtes Gemini du run atteint.');
    err.quota = true;
    throw err;
  }

  const contenu = `Outils à structurer :\n${JSON.stringify(
    lot.map((o, i) => ({ index: i, nom: o.nom, plan: o.plan })), null, 2
  )}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  requetesUtilisees++;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: construireInstruction(categories) }] },
      contents: [{ role: 'user', parts: [{ text: contenu }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: SCHEMA_LOT,
        maxOutputTokens: MAX_TOKENS_SORTIE,
        temperature: 0.2,
        frequencyPenalty: 0.8, // limite les répétitions en boucle
      },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    // 503 = surcharge temporaire : une seule nouvelle tentative, qui compte dans le budget.
    if (res.status === 503 && tentative < 1) {
      await new Promise(r => setTimeout(r, 30000)); // surcharge temporaire : attendre davantage
      return appelerGeminiLot(lot, categories, tentative + 1);
    }
    const err = new Error(`Gemini API ${res.status}: ${data?.error?.message || 'erreur inconnue'}`);
    err.quota = res.status === 429 || data?.error?.status === 'RESOURCE_EXHAUSTED';
    // 503 après relance : le service est saturé, inutile de continuer à consommer le budget.
    err.arret = res.status === 503;
    throw err;
  }

  const candidat = data?.candidates?.[0];
  if (candidat?.finishReason === 'MAX_TOKENS') {
    throw new Error('Réponse Gemini tronquée (MAX_TOKENS) : lot ignoré, outils restent en file.');
  }
  const texte = candidat?.content?.parts?.[0]?.text;
  if (!texte) throw new Error('Réponse Gemini vide ou inattendue.');

  let tableau;
  try {
    tableau = JSON.parse(texte);
  } catch {
    throw new Error('JSON Gemini invalide : lot ignoré, outils restent en file.');
  }
  if (!Array.isArray(tableau)) throw new Error('Réponse Gemini non conforme (tableau attendu).');

  const parIndex = new Map();
  for (const item of tableau) {
    if (item && Number.isInteger(item.index)) parIndex.set(item.index, item);
  }
  return parIndex;
}

// Détecte une FAQ bouclée : réponse trop longue, ou phrase répétée.
function faqInvalide(faq) {
  if (!Array.isArray(faq)) return false;
  for (const f of faq) {
    const a = String(f?.a || '');
    if (a.length > 600) return true;
    const vues = new Set();
    for (const p of a.split(/[.!?]+/).map(x => x.trim().toLowerCase()).filter(x => x.length >= 20)) {
      if (vues.has(p)) return true;
      vues.add(p);
    }
  }
  return false;
}

function faviconPourUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (HEBERGEURS_CODE.some(h => host === h || host.endsWith('.' + h))) return '';
    return `https://www.google.com/s2/favicons?sz=64&domain=${host}`;
  } catch { return ''; }
}

function construireMiseAJour(outil, infos, categorie) {
  // Logo saisi dans l'admin en priorité ; sinon icône du site officiel.
  const favicon = outil.logo_url || faviconPourUrl(infos.url);

  return {
    url: infos.url,
    category: categorie,
    price: infos.price || 'freemium',
    description: infos.description || '',
    tags: Array.isArray(infos.tags) ? infos.tags : [],
    maker: infos.maker || '',
    plateformes: infos.plateformes || '',
    ideal_pour: infos.ideal_pour || '',
    emoji: infos.emoji || '🤖',
    favicon,
    alternatives: (infos.alternatives || '').split(',').map(s => s.trim()).filter(Boolean),
    fonctionnalites: Array.isArray(infos.fonctionnalites)
      ? infos.fonctionnalites.map(f => ({ ...f, icon: ICON_KEYS.includes(f && f.icon) ? f.icon : 'sparkles' }))
      : [],
    faq: Array.isArray(infos.faq) ? infos.faq : [],
    // null volontaire (incertain) : le champ n'est pas écrit → « Non renseigné » dans l'admin.
    ...(infos.interface_fr !== null && infos.interface_fr !== undefined ? { interface_fr: infos.interface_fr } : {}),
    ...(infos.api !== null && infos.api !== undefined ? { api: infos.api } : {}),
    ...(infos.mobile !== null && infos.mobile !== undefined ? { mobile: infos.mobile } : {}),
    ...(infos.url_tarifs ? { url_tarifs: infos.url_tarifs } : {}),
    ...(infos.essai_gratuit !== null && infos.essai_gratuit !== undefined ? { essai_gratuit: infos.essai_gratuit } : {}),
    ...(infos.duree_essai ? { duree_essai: infos.duree_essai } : {}),
    ...(infos.type_outil ? { type_outil: infos.type_outil } : {}),
    ...(infos.langues_disponibles ? { langues_disponibles: infos.langues_disponibles } : {}),
    ...(infos.presentation ? { presentation: infos.presentation } : {}),
    ...(infos.sous_categorie ? { sous_categorie: infos.sous_categorie } : {}),
    ...(infos.modele === 'proprietaire' || infos.modele === 'open_source' ? { modele: infos.modele } : {}),
    ...(Number.isInteger(infos.annee_creation) ? { annee_creation: infos.annee_creation } : {}),
    ...(infos.support ? { support: infos.support } : {}),
    // Tarifs IA : jamais affichés tant que l'admin ne les a pas vérifiés.
    tarifs: Array.isArray(infos.tarifs)
      ? infos.tarifs.filter(t => t && t.nom).slice(0, 4).map(t => ({
          nom: String(t.nom), prix: String(t.prix || ''), periode: String(t.periode || ''), desc: String(t.desc || ''),
        }))
      : [],
    tarifs_verifie: false,
    ...(infos.meta_description ? { meta_description: infos.meta_description } : {}),
    status: 'active',
    generer_fiche: true,
    enrichi_ia: true,
    enrichi_ia_le: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

async function main() {
  if (!GEMINI_API_KEY) {
    console.error('✗ GEMINI_API_KEY manquant dans les secrets.');
    process.exit(1);
  }

  const categories = (await fetchCategoriesOutils()).filter(c => !CATEGORIES_EXCLUES_IA.includes(c));
  if (!categories.length) {
    console.error('✗ Aucune catégorie d\'outil dans Firestore (collection « categories »). Abandon.');
    process.exit(1);
  }

  const snap = await db.collection('outils').where('status', '==', 'a_enrichir').get();
  // Les outils déjà marqués en échec sortent de la file : ils ne consomment plus de requête.
  // Les outils sans catégorie ont un horodatage « dernier_essai_le » : ils passent
  // après les autres, pour ne pas bloquer la file à chaque run.
  const file = snap.docs
    .filter(d => d.data().enrichissement_echec !== true)
    .sort((a, b) => (a.data().dernier_essai_le?.toMillis?.() || 0) - (b.data().dernier_essai_le?.toMillis?.() || 0));
  const capacite = TAILLE_LOT * MAX_REQUETES_PAR_RUN;
  const aTraiter = file.slice(0, capacite);

  console.log(`${file.length} outil(s) en file, ${aTraiter.length} traité(s) ce run `
    + `(${MAX_REQUETES_PAR_RUN} requête(s) max, lots de ${TAILLE_LOT}).`);

  let succes = 0, nonTrouves = 0, incomplets = 0, categorieAbsente = 0, faqInvalides = 0, nonRepondus = 0, echecs = 0, quotaEpuise = false;

  for (let debut = 0; debut < aTraiter.length && !quotaEpuise; debut += TAILLE_LOT) {
    const lot = aTraiter.slice(debut, debut + TAILLE_LOT);
    const entrees = lot.map(d => ({ nom: d.data().name, plan: d.data().plan || 'standard' }));

    let reponses;
    try {
      reponses = await appelerGeminiLot(entrees, categories);
    } catch (err) {
      console.error(`  ✗ Lot de ${lot.length} : ${err.message}`);
      echecs += lot.length;
      if (err.quota || err.arret) {
        quotaEpuise = true;
        console.log('::warning::Arrêt du run : quota Gemini épuisé, service saturé (503) ou budget du run atteint. Les outils restants restent en file.');
        break;
      }
      continue; // lot non traité : les outils restent en file, sans marquage
    }

    for (let k = 0; k < lot.length; k++) {
      const docSnap = lot[k];
      const outil = docSnap.data();
      const infos = reponses.get(k);

      if (!infos) {
        console.log(`  – ${outil.name} : absent de la réponse, reste en file.`);
        nonRepondus++;
        continue;
      }

      if (!infos.trouve) {
        await docSnap.ref.update({ enrichissement_echec: true, enrichissement_echec_le: FieldValue.serverTimestamp(), enrichissement_echec_motif: 'introuvable' });
        console.log(`  – ${outil.name} : introuvable par l'IA, sorti de la file (vérification manuelle).`);
        nonTrouves++;
        continue;
      }

      const categorie = categorieFinale(outil.category, infos.category, categories);
      if (!categorie) {
        // Reste en file, sans marquage définitif : motif consigné, traité après les autres.
        await docSnap.ref.update({
          categorie_absente_le: FieldValue.serverTimestamp(),
          dernier_essai_le: FieldValue.serverTimestamp(),
        });
        console.log(`  – ${outil.name} : catégorie absente (ni admin, ni réponse valide), reste en file.`);
        categorieAbsente++;
        continue;
      }

      if (faqInvalide(infos.faq)) {
        // Reste en file, sans publication : la FAQ sera regénérée au prochain passage.
        await docSnap.ref.update({
          faq_invalide_le: FieldValue.serverTimestamp(),
          dernier_essai_le: FieldValue.serverTimestamp(),
        });
        console.log(`  – ${outil.name} : FAQ trop longue ou répétitive, reste en file.`);
        faqInvalides++;
        continue;
      }

      if (!infos.url || !infos.description) {
        await docSnap.ref.update({ enrichissement_echec: true, enrichissement_echec_le: FieldValue.serverTimestamp(), enrichissement_echec_motif: 'incomplet' });
        console.log(`  – ${outil.name} : réponse incomplète (url/description/catégorie), sorti de la file.`);
        incomplets++;
        continue;
      }

      await docSnap.ref.update(construireMiseAJour(outil, infos, categorie));
      console.log(`  ✓ ${outil.name} → ${categorie} / ${infos.price} / ${infos.url}`);
      succes++;
    }
  }

  console.log(`\nTerminé — ${succes} publié(s), ${nonTrouves} introuvable(s), ${incomplets} incomplet(s), `
    + `${categorieAbsente} sans catégorie (restent en file), ${faqInvalides} FAQ invalide(s) (restent en file), ${nonRepondus} sans réponse (restent en file), ${echecs} en erreur de lot. `
    + `Requêtes Gemini utilisées : ${requetesUtilisees}/${MAX_REQUETES_PAR_RUN}.`
    + (quotaEpuise ? ' (arrêt : quota ou budget)' : ''));
  if (succes > 0) console.log('⚠️  gen-fiches.js doit tourner pour publier les nouvelles fiches HTML.');
}

main().catch(err => {
  console.error('Erreur fatale :', err);
  process.exit(1);
});
