#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════
   enrichir-outils.js — Complète automatiquement un outil créé
   en "ajout rapide" dans l'admin (nom + plan seulement).

   Source : Firestore "outils" où status === 'a_enrichir'
   Écrit  : url, category, price, description, tags, maker,
            plateformes, ideal_pour, favicon, emoji, puis bascule
            status='active' et generer_fiche=true (publication).
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
async function enrichirOutil(nomOutil, categoriesDisponibles, _retry = false) {
  const prompt = `Tu structures une fiche pour un annuaire d'outils IA francophone (Albexia), à partir de ` +
    `l'outil nommé "${nomOutil}". Tu n'as PAS accès à une recherche web en temps réel — utilise uniquement ` +
    `ce que tu sais avec certitude sur cet outil précis. ` +
    `RÈGLE ABSOLUE : si tu n'es pas sûr à un niveau élevé de confiance de l'identité exacte de cet outil ` +
    `(nom ambigu, outil trop récent ou trop obscur pour que tu le connaisses fiablement, ou risque de confusion ` +
    `avec un outil similaire), réponds UNIQUEMENT {"trouve": false} — n'invente JAMAIS une URL, un prix ou une ` +
    `description plausibles pour un outil que tu ne connais pas avec certitude. Une réponse honnête "je ne sais pas" ` +
    `vaut infiniment mieux qu'une information inventée qui semble crédible. ` +
    `Si tu connais l'outil avec certitude : catégorie à choisir OBLIGATOIREMENT dans cette liste exacte ` +
    `(recopie le texte exact) : ${JSON.stringify(categoriesDisponibles)} — si aucune ne correspond bien, choisis ` +
    `la plus proche, n'en invente jamais une nouvelle. ` +
    `Prix : "free" (gratuit), "freemium" (gratuit avec palier payant), ou "paid" (payant uniquement). ` +
    `Description : 150-200 caractères, en français, factuelle, sans superlatifs marketing exagérés. ` +
    `Tags : 3 à 6 mots-clés courts en français. ` +
    `Réponds UNIQUEMENT avec un objet JSON valide, sans markdown, avec exactement cette forme :\n` +
    `{"trouve": true, "url": "https://...", "category": "...", "price": "free|freemium|paid", ` +
    `"description": "...", "tags": ["...","..."], "maker": "...", "plateformes": "...", "ideal_pour": "...", "emoji": "🤖"}`;

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
    // un seul retry après une pause suffit dans l'immense majorité des cas.
    if (res.status === 503 && !_retry) {
      await new Promise(r => setTimeout(r, 5000));
      return enrichirOutil(nomOutil, categoriesDisponibles, true);
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
      const infos = await enrichirOutil(outil.name, categoriesDisponibles);

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
