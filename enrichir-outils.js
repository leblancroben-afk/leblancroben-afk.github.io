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

   Fonctionnement EN DEUX ÉTAPES (pas de "grounding" Gemini — quota
   429 rencontré sur google_search, voir historique) :
   1. Google Programmable Search (Custom Search API, gratuit, 100
      requêtes/jour) — trouve l'outil sur le web réellement.
   2. Gemini (generateContent standard, même quota que le glossaire
      et les niches, déjà utilisé sans souci ailleurs dans le projet)
      — structure URL/catégorie/prix/description/tags à partir des
      résultats de recherche, pas depuis sa seule mémoire.

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
const GOOGLE_SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const GOOGLE_SEARCH_CX = process.env.GOOGLE_SEARCH_CX;
const MAX_OUTILS_PAR_RUN = 10;

async function fetchCategories() {
  const snap = await db.collection('categories').get();
  return snap.docs.map(d => d.data().nom).filter(Boolean);
}

// ══════════════════════════════════════
// ÉTAPE 1 — Google Custom Search
// ══════════════════════════════════════
async function chercherOutil(nomOutil) {
  const q = encodeURIComponent(`${nomOutil} outil IA officiel`);
  const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_API_KEY}&cx=${GOOGLE_SEARCH_CX}&q=${q}&num=5`;
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(`Google Search API ${res.status}: ${data?.error?.message || 'erreur inconnue'}`);

  return (data.items || []).map(it => ({
    titre: it.title || '',
    lien: it.link || '',
    extrait: it.snippet || '',
  }));
}

// ══════════════════════════════════════
// ÉTAPE 2 — Gemini structure les champs à partir des résultats
// ══════════════════════════════════════
async function enrichirOutil(nomOutil, resultatsRecherche, categoriesDisponibles) {
  if (!resultatsRecherche.length) return { trouve: false };

  const contexte = resultatsRecherche
    .map((r, i) => `[${i + 1}] ${r.titre}\nURL: ${r.lien}\nExtrait: ${r.extrait}`)
    .join('\n\n');

  const prompt = `Tu structures une fiche pour un annuaire d'outils IA francophone (Albexia). ` +
    `Voici des résultats de recherche web réels pour l'outil "${nomOutil}" :\n\n${contexte}\n\n` +
    `À partir de CES résultats (n'invente rien qui ne soit pas suggéré par eux), identifie le site officiel de l'outil ` +
    `et structure ses informations. Catégorie à choisir OBLIGATOIREMENT dans cette liste exacte (recopie le texte exact) : ` +
    `${JSON.stringify(categoriesDisponibles)}. Si aucune catégorie ne correspond bien, choisis la plus proche — n'en invente jamais une nouvelle. ` +
    `Prix : "free" (gratuit), "freemium" (gratuit avec palier payant), ou "paid" (payant uniquement) — déduis-le du contexte, ou "freemium" si incertain. ` +
    `Description : 150-200 caractères, en français, factuelle, sans superlatifs marketing exagérés. ` +
    `Tags : 3 à 6 mots-clés courts en français. ` +
    `Si les résultats ne parlent clairement PAS du bon outil (nom similaire mais produit différent, page inexistante...), ` +
    `renvoie {"trouve": false} et rien d'autre. ` +
    `Sinon réponds UNIQUEMENT avec un objet JSON valide, sans markdown, avec exactement cette forme :\n` +
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
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${data?.error?.message || 'erreur inconnue'}`);

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
  if (!GOOGLE_SEARCH_API_KEY || !GOOGLE_SEARCH_CX) {
    console.error('✗ GOOGLE_SEARCH_API_KEY et/ou GOOGLE_SEARCH_CX manquant(s) dans les secrets.');
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
      const resultats = await chercherOutil(outil.name);
      await new Promise(r => setTimeout(r, 300));
      const infos = await enrichirOutil(outil.name, resultats, categoriesDisponibles);

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
