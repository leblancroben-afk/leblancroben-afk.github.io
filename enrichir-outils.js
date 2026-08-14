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

   Moteur : Gemini avec l'outil de recherche Google (grounding) —
   nécessaire ici car, contrairement à traduire-fiches.js, il ne
   s'agit pas de traduire du contenu existant mais de RECHERCHER
   des faits (URL officielle, prix réel...) sur le web.

   ⚠️ À vérifier après premier run : la syntaxe exacte du tool
   "google_search" dépend de la version d'API Gemini disponible au
   moment où tu lances ce script — si l'appel échoue avec une erreur
   sur le champ "tools", consulte la doc Gemini à jour (elle peut
   avoir changé depuis l'écriture de ce script) et ajuste le bloc
   GEMINI_TOOLS ci-dessous en conséquence.

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
const MAX_OUTILS_PAR_RUN = 10; // recherche web = plus coûteux/lent qu'une simple traduction

// Déclaration de l'outil de recherche Google pour Gemini (grounding).
// Voir avertissement en tête de fichier si ça échoue.
const GEMINI_TOOLS = [{ google_search: {} }];

async function fetchCategories() {
  const snap = await db.collection('categories').get();
  return snap.docs.map(d => d.data().nom).filter(Boolean);
}

async function enrichirOutil(nomOutil, categoriesDisponibles) {
  const prompt = `Tu es un assistant de recherche pour un annuaire d'outils IA francophone (Albexia). ` +
    `Recherche l'outil nommé "${nomOutil}" sur le web et renvoie ses informations réelles et actuelles. ` +
    `Catégorie à choisir OBLIGATOIREMENT dans cette liste exacte (recopie le texte exact) : ${JSON.stringify(categoriesDisponibles)}. ` +
    `Si aucune catégorie ne correspond bien, choisis la plus proche de cette liste — n'en invente jamais une nouvelle. ` +
    `Prix : "free" (gratuit), "freemium" (gratuit avec palier payant), ou "paid" (payant uniquement). ` +
    `Description : 150-200 caractères, en français, factuelle, sans superlatifs marketing exagérés. ` +
    `Tags : 3 à 6 mots-clés courts en français. ` +
    `Si tu ne trouves pas l'outil avec certitude, renvoie {"trouve": false} et rien d'autre. ` +
    `Sinon réponds UNIQUEMENT avec un objet JSON valide, sans markdown, avec exactement cette forme :\n` +
    `{"trouve": true, "url": "https://...", "category": "...", "price": "free|freemium|paid", ` +
    `"description": "...", "tags": ["...","..."], "maker": "...", "plateformes": "...", "ideal_pour": "...", "emoji": "🤖"}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: GEMINI_TOOLS,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${data?.error?.message || 'erreur inconnue'}`);

  const texte = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  const jsonMatch = texte.match(/\{[\s\S]*\}/); // au cas où le modèle ajoute du texte autour malgré la consigne
  if (!jsonMatch) throw new Error('Réponse Gemini sans JSON exploitable : ' + texte.slice(0, 200));

  return JSON.parse(jsonMatch[0]);
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
      await new Promise(r => setTimeout(r, 800)); // pause entre recherches web
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
