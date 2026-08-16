#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════
   enrichir-outils.js — Complète automatiquement un outil créé
   en "ajout rapide" dans l'admin (nom + plan seulement).

   Source : Firestore "outils" où status === 'a_enrichir'
   Écrit  : url, category, price, description, tags, maker,
            plateformes, ideal_pour, favicon, emoji, points_forts,
            limite_principale, alternatives, fonctionnalites, faq,
            interface_fr/api/mobile (si connus avec certitude),
            url_tarifs, essai_gratuit, duree_essai, stats — puis
            bascule status='active' et generer_fiche=true (publication).

   ⚠️ STATS INCLUS TEMPORAIREMENT sur demande explicite, en attendant
   le passage à une vraie API de recherche web (Perplexity Sonar ou
   équivalent). C'est le champ le plus exposé à l'hallucination
   silencieuse (chiffres inventés mais plausibles) puisque Gemini
   répond ici depuis sa mémoire d'entraînement, sans vérification en
   temps réel — voir avertissement dans le prompt ci-dessous. Vérifie
   spécifiquement ce champ dans le bandeau "🤖 à vérifier" de l'admin.
   Traductions EN/ES : géré séparément par traduire-fiches.js, workflow
   distinct — pas automatiquement chaîné après un enrichissement.
   Marque : enrichi_ia=true, enrichi_ia_le=<timestamp> — pour que
            l'admin affiche le bandeau "🤖 X outil(s) à vérifier"
            (voir admin-index-2.html / runDiagnosticIA()).

   ⚠️ PAS DE RECHERCHE WEB (voir historique : Google Custom Search
   déprécié, Brave Search API sans tier gratuit, HF Docker verrouillé
   PRO — plus d'option gratuite viable en 2026). Gemini répond depuis
   sa mémoire d'entraînement uniquement. Fiable pour les outils connus
   et établis (ChatGPT, Midjourney, Notion AI...), risqué pour un
   outil très récent ou peu connu — le prompt pousse volontairement
   Gemini à renvoyer {"trouve": false} plutôt que d'inventer une URL
   ou un prix plausibles quand il n'est pas sûr. VÉRIFIE l'URL en
   particulier dans le diagnostic "🤖 Enrichis par IA" de l'admin —
   c'est le champ le plus à risque d'hallucination.

   Usage : node enrichir-outils.js
   Cron  : GitHub Actions, nocturne + déclenchement manuel
   ═══════════════════════════════════════════════════════ */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-3.5-flash';
const MAX_OUTILS_PAR_RUN = 10;

async function fetchCategories() {
  const snap = await db.collection('categories').get();
  return snap.docs.map(d => d.data().nom).filter(Boolean);
}

// ══════════════════════════════════════
// Gemini structure les champs depuis sa mémoire (pas de recherche web)
// ══════════════════════════════════════
async function enrichirOutil(nomOutil, plan, categoriesDisponibles, tentative = 0) {
  const prompt = `Tu structures une fiche complète pour un annuaire d'outils IA francophone (Albexia), à partir de ` +
    `l'outil nommé "${nomOutil}" (plan : "${plan}"). Tu n'as PAS accès à une recherche web en temps réel — utilise uniquement ` +
    `ce que tu sais avec certitude sur cet outil précis. ` +
    `RÈGLE ABSOLUE : si tu n'es pas sûr à un niveau élevé de confiance de l'identité exacte de cet outil ` +
    `(nom ambigu, outil trop récent ou trop obscur pour que tu le connaisses fiablement, ou risque de confusion ` +
    `avec un outil similaire), réponds UNIQUEMENT {"trouve": false} — n'invente JAMAIS une information plausible ` +
    `pour un outil que tu ne connais pas avec certitude. Une réponse honnête "je ne sais pas" vaut infiniment ` +
    `mieux qu'une information inventée qui semble crédible. ` +
    `Cette même règle vaut CHAMP PAR CHAMP si tu connais l'outil globalement mais pas un détail précis (ex. tu sais ` +
    `ce qu'est l'outil mais pas s'il propose une API) : mets alors null pour CE champ précis plutôt que d'inventer, ` +
    `le reste de la fiche peut quand même être rempli. ` +
    `Si tu connais l'outil avec certitude : catégorie à choisir OBLIGATOIREMENT dans cette liste exacte ` +
    `(recopie le texte exact) : ${JSON.stringify(categoriesDisponibles)} — si aucune ne correspond bien, choisis ` +
    `la plus proche, n'en invente jamais une nouvelle. ` +
    `Prix : "free" (gratuit), "freemium" (gratuit avec palier payant), ou "paid" (payant uniquement). ` +
    `Description : 150-200 caractères, en français, factuelle, sans superlatifs marketing exagérés. ` +
    `Tags : 3 à 6 mots-clés courts en français. ` +
    `points_forts : 2 à 4 points forts réels et vérifiables (pas des généralités marketing), courtes phrases. ` +
    `limite_principale : LA limite/faiblesse principale connue de cet outil, une phrase honnête. ` +
    `alternatives : noms de 2-3 outils concurrents réellement comparables, séparés par des virgules. ` +
    `fonctionnalites : 3 à 4 fonctionnalités clés, chacune avec un emoji pertinent dans le champ "icon" (pas "emoji"), un titre court, une description d'une phrase. ` +
    `faq : 2 à 4 questions/réponses réellement utiles pour quelqu'un qui découvre cet outil. ` +
    `presentation : SI le plan est "featured", rédige 2-3 paragraphes de présentation détaillée (séparés par un retour à la ligne), sinon null. ` +
    `meta_description : SI le plan est "featured", une meta-description SEO de 155 caractères maximum, sinon null. ` +
    `interface_fr : true si l'interface existe en français, false sinon, null si tu ne sais pas avec certitude. ` +
    `api : true si l'outil propose une API publique, false sinon, null si incertain. ` +
    `mobile : true si une app mobile existe, false sinon, null si incertain. ` +
    `url_tarifs : URL de la page tarifs si tu la connais avec certitude, sinon null. ` +
    `essai_gratuit : true si l'outil propose un essai gratuit du plan payant, false sinon, null si incertain. ` +
    `duree_essai : durée de l'essai si tu la connais avec certitude (ex. "14 jours"), sinon null. ` +
    `stats : 2 à 4 statistiques chiffrées RÉELLES et vérifiées sur cet outil (ex. nombre de tokens de contexte, ` +
    `version du modèle, taille de la fenêtre de contexte, pourcentage documenté). C'est le champ où une erreur ` +
    `est la plus visible et la plus grave — si tu n'es pas certain à 100% d'un chiffre précis, NE L'INCLUS PAS, ` +
    `un tableau stats plus court (ou vide) vaut infiniment mieux qu'un chiffre inventé. N'arrondis pas et ne ` +
    `déduis pas un chiffre approximatif "au pif" pour remplir la case. ` +
    `Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, avec exactement cette forme :\n` +
    `{"trouve": true, "url": "https://...", "category": "...", "price": "free|freemium|paid", ` +
    `"description": "...", "tags": ["...","..."], "maker": "...", "plateformes": "...", "ideal_pour": "...", "emoji": "🤖", ` +
    `"points_forts": ["...","..."], "limite_principale": "...", "alternatives": "Nom1, Nom2, Nom3", ` +
    `"fonctionnalites": [{"icon":"🚀","titre":"...","desc":"..."}], "faq": [{"q":"...","a":"..."}], ` +
    `"presentation": "..."|null, "meta_description": "..."|null, ` +
    `"interface_fr": true|false|null, "api": true|false|null, "mobile": true|false|null, "url_tarifs": "..."|null, ` +
    `"essai_gratuit": true|false|null, "duree_essai": "..."|null, "stats": [{"valeur":"200k","label":"tokens de contexte"}]}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    // 503 = surcharge temporaire côté Google, pas une erreur de config —
    // jusqu'à 3 tentatives avec délai croissant avant d'abandonner.
    if (res.status === 503 && tentative < 2) {
      const pause = 5000 * (tentative + 1); // 5s, puis 10s
      await new Promise(r => setTimeout(r, pause));
      return enrichirOutil(nomOutil, categoriesDisponibles, tentative + 1);
    }
    throw new Error(`Gemini API ${res.status}: ${data?.error?.message || 'erreur inconnue'}`);
  }

  const texte = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!texte) throw new Error('Réponse Gemini vide ou inattendue.');

  return JSON.parse(texte);
}

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function main() {
  if (!GEMINI_API_KEY) {
    console.error('✗ GEMINI_API_KEY manquant dans les secrets.');
    process.exit(1);
  }

  const categoriesDisponibles = await fetchCategories();
  if (!categoriesDisponibles.length) {
    console.error('✗ Aucune catégorie trouvée dans Firestore (collection "categories"). Abandon.');
    process.exit(1);
  }

  const snap = await db.collection('outils').where('status', '==', 'a_enrichir').get();
  const aTraiter = snap.docs.slice(0, MAX_OUTILS_PAR_RUN);

  console.log(`${snap.docs.length} outil(s) en attente, ${aTraiter.length} traité(s) ce run.`);

  let succes = 0, echecs = 0, nonTrouves = 0;

  for (const docSnap of aTraiter) {
    const outil = docSnap.data();
    try {
      const infos = await enrichirOutil(outil.name, outil.plan || 'standard', categoriesDisponibles);

      if (!infos.trouve) {
        console.log(`  – ${outil.name} : introuvable par l'IA, laissé en 'a_enrichir' pour retraitement ou vérification manuelle.`);
        nonTrouves++;
        continue;
      }

      const favicon = infos.url
        ? `https://www.google.com/s2/favicons?sz=64&domain=${new URL(infos.url).hostname}`
        : '';

      await docSnap.ref.update({
        url: infos.url || '',
        category: infos.category || '',
        price: infos.price || 'freemium',
        description: infos.description || '',
        tags: Array.isArray(infos.tags) ? infos.tags : [],
        maker: infos.maker || '',
        plateformes: infos.plateformes || '',
        ideal_pour: infos.ideal_pour || '',
        emoji: infos.emoji || '🤖',
        favicon,
        points_forts: Array.isArray(infos.points_forts) ? infos.points_forts : [],
        limite_principale: infos.limite_principale || '',
        alternatives: (infos.alternatives || '').split(',').map(s => s.trim()).filter(Boolean),
        fonctionnalites: Array.isArray(infos.fonctionnalites) ? infos.fonctionnalites : [],
        faq: Array.isArray(infos.faq) ? infos.faq : [],
        // null volontaire de Gemini (incertain) → on n'écrit PAS le champ,
        // ce qui laisse "Non renseigné" dans l'admin plutôt qu'une fausse valeur.
        ...(infos.interface_fr !== null && infos.interface_fr !== undefined ? { interface_fr: infos.interface_fr } : {}),
        ...(infos.api !== null && infos.api !== undefined ? { api: infos.api } : {}),
        ...(infos.mobile !== null && infos.mobile !== undefined ? { mobile: infos.mobile } : {}),
        ...(infos.url_tarifs ? { url_tarifs: infos.url_tarifs } : {}),
        ...(infos.essai_gratuit !== null && infos.essai_gratuit !== undefined ? { essai_gratuit: infos.essai_gratuit } : {}),
        ...(infos.duree_essai ? { duree_essai: infos.duree_essai } : {}),
        stats: Array.isArray(infos.stats) ? infos.stats : [],
        ...(infos.presentation ? { presentation: infos.presentation } : {}),
        ...(infos.meta_description ? { meta_description: infos.meta_description } : {}),
        // stats délibérément absent : des chiffres inventés (ex. "200k tokens")
        // sont le risque d'hallucination le plus visible et le plus gênant —
        // reste à remplir à la main si tu veux ce bloc.
        status: 'active',
        generer_fiche: true, // publication — voir garde-fou existant dans gen-fiches.js
        enrichi_ia: true,
        enrichi_ia_le: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      console.log(`  ✓ ${outil.name} → ${infos.category} / ${infos.price} / ${infos.url}`);
      succes++;
      await new Promise(r => setTimeout(r, 500)); // pause entre appels Gemini
    } catch (err) {
      console.error(`  ✗ ${outil.name} : ${err.message}`);
      echecs++;
    }
  }

  console.log(`\nTerminé — ${succes} enrichi(s) et publié(s), ${nonTrouves} introuvable(s), ${echecs} en erreur.`);
  if (succes > 0) console.log('⚠️  gen-fiches.js doit tourner pour publier les nouvelles fiches HTML statiques.');
}

main().catch(err => {
  console.error('Erreur fatale :', err);
  process.exit(1);
});
