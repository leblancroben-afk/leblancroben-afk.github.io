#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════
   generer-videos.js — Attribution automatique de vidéos YouTube
   Source : Firestore collection "outils" (docs langue='fr' uniquement,
            les tutoriels/vidéothèque ne sont pas dupliqués sur EN/ES)
   Sortie : écrit les champs `tutoriels` et/ou `videotheque` sur les
            docs Firestore qui en manquent. Ne touche à AUCUN autre
            champ (description, prix, tags, etc. restent 100% manuels).
   Usage  : node generer-videos.js
   Cron   : GitHub Actions, tous les jours à minuit (voir .yml associé)

   ── Logique ──
   - videotheque : indépendant du plan, rempli si vide (jusqu'à 5 vidéos).
   - tutoriels   : rempli uniquement si plan === 'featured' et vide
                   (1 seule vidéo, car seule la 1ère ligne est utilisée
                   par gen-fiches.js pour la fiche Featured).
   - Filtre les vidéos < 90s (shorts) et trie par nombre de vues.
   - Limite de traitement par run (MAX_OUTILS_PAR_RUN) pour rester très
     large sous le quota gratuit YouTube (10 000 unités/jour ; une
     recherche = 100 unités, un videos.list = ~1 unité).
   ═══════════════════════════════════════════════════════ */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// ── Init Firebase Admin (même pattern que gen-fiches.js) ──
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-3.5-flash';
const MAX_OUTILS_PAR_RUN = 25; // marge large sous le quota gratuit (10 000 unités/jour)
const DUREE_MIN_SECONDES = 90; // exclut les Shorts

// ══════════════════════════════════════
// UTILITAIRES
// ══════════════════════════════════════

// Convertit une durée ISO 8601 YouTube ("PT12M34S") en "mm:ss" ou "hh:mm:ss"
// — même format que celui attendu par dureeVersSecondes() dans gen-fiches.js
function isoDureeVersMMSS(iso) {
  const m = String(iso || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return '';
  const h = parseInt(m[1] || '0', 10);
  const mi = parseInt(m[2] || '0', 10);
  const s = parseInt(m[3] || '0', 10);
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(mi)}:${pad(s)}` : `${mi}:${pad(s)}`;
}

function isoDureeVersSecondes(iso) {
  const m = String(iso || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const h = parseInt(m[1] || '0', 10);
  const mi = parseInt(m[2] || '0', 10);
  const s = parseInt(m[3] || '0', 10);
  return h * 3600 + mi * 60 + s;
}

async function fetchJSON(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`YouTube API ${res.status}: ${data?.error?.message || 'erreur inconnue'}`);
  }
  return data;
}

// Cherche des vidéos pertinentes pour un outil et retourne une liste
// triée par vues décroissantes, déjà filtrée (pas de Shorts).
async function chercherVideos(nomOutil, max = 8) {
  const q = encodeURIComponent(`${nomOutil} outil IA tutoriel`);
  const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${q}` +
    `&type=video&order=relevance&relevanceLanguage=fr&maxResults=${max}&safeSearch=moderate&key=${YOUTUBE_API_KEY}`;

  const searchData = await fetchJSON(searchUrl);
  const ids = (searchData.items || []).map(it => it.id?.videoId).filter(Boolean);
  if (ids.length === 0) return [];

  const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics,snippet` +
    `&id=${ids.join(',')}&key=${YOUTUBE_API_KEY}`;
  const detailsData = await fetchJSON(detailsUrl);

  return (detailsData.items || [])
    .map(v => ({
      youtube_id: v.id,
      titre: v.snippet?.title || '',
      canal: v.snippet?.channelTitle || '',
      description_video: (v.snippet?.description || '').slice(0, 200),
      duree: isoDureeVersMMSS(v.contentDetails?.duration),
      secondes: isoDureeVersSecondes(v.contentDetails?.duration),
      vues: parseInt(v.statistics?.viewCount || '0', 10),
    }))
    .filter(v => v.titre && v.youtube_id && v.secondes >= DUREE_MIN_SECONDES)
    .sort((a, b) => b.vues - a.vues);
}

// Filtre par pertinence via Gemini : un nom d'outil ambigu (ex. "Mutiny",
// "Albert") ramène souvent des vidéos hors-sujet (jeux vidéo, musique...)
// si on ne trie QUE par nombre de vues. Gemini reçoit la description réelle
// de l'outil + les candidats et ne garde que ceux qui en parlent vraiment.
async function filtrerPertinence(nomOutil, descriptionOutil, candidats) {
  if (!candidats.length) return [];

  const liste = candidats.map((v, i) =>
    `[${i}] Titre: ${v.titre}\nChaîne: ${v.canal}\nDescription: ${v.description_video}`).join('\n\n');

  const prompt = `Un annuaire d'outils IA cherche des tutoriels YouTube pour l'outil "${nomOutil}", décrit ainsi : ` +
    `"${descriptionOutil || 'pas de description disponible'}". ` +
    `Voici des vidéos candidates trouvées sur YouTube :\n\n${liste}\n\n` +
    `Certaines peuvent être hors-sujet si "${nomOutil}" est un mot ambigu (jeu vidéo, film, chanson, produit sans rapport...). ` +
    `Renvoie UNIQUEMENT un tableau JSON des index (nombres) des vidéos qui parlent RÉELLEMENT de cet outil IA précis, ` +
    `dans l'ordre où tu les recommanderais. Exemple : [2, 0, 4]. Si aucune ne correspond, renvoie [].`;

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
  const indices = JSON.parse(texte || '[]');
  return indices.map(i => candidats[i]).filter(Boolean);
}

// ══════════════════════════════════════
// SCRIPT PRINCIPAL
// ══════════════════════════════════════

async function main() {
  if (!YOUTUBE_API_KEY) {
    console.error('✗ YOUTUBE_API_KEY manquant dans les secrets.');
    process.exit(1);
  }
  if (!GEMINI_API_KEY) {
    console.error('✗ GEMINI_API_KEY manquant dans les secrets.');
    process.exit(1);
  }

  const snap = await db.collection('outils').where('langue', '==', 'fr').get();
  const tousLesOutils = snap.docs.map(d => ({ ref: d.ref, id: d.id, ...d.data() }));

  const aTraiter = tousLesOutils.filter(o => {
    const manqueVideotheque = !Array.isArray(o.videotheque) || o.videotheque.length === 0;
    const manqueTutoriel = o.plan === 'featured' && (!Array.isArray(o.tutoriels) || o.tutoriels.length === 0);
    return manqueVideotheque || manqueTutoriel;
  }).slice(0, MAX_OUTILS_PAR_RUN);

  console.log(`${tousLesOutils.length} outils au total, ${aTraiter.length} à traiter ce run.`);

  let succes = 0, echecs = 0, sansResultat = 0;

  for (const outil of aTraiter) {
    try {
      const candidats = await chercherVideos(outil.name, 10); // pool plus large, Gemini trie ensuite
      await new Promise(r => setTimeout(r, 300));
      const videos = await filtrerPertinence(outil.name, outil.description, candidats);

      if (videos.length === 0) {
        console.log(`  – ${outil.name} : aucune vidéo pertinente trouvée (${candidats.length} candidate(s) écartée(s) comme hors-sujet), ignoré.`);
        sansResultat++;
        continue;
      }

      const updates = { updatedAt: FieldValue.serverTimestamp() };

      const manqueVideotheque = !Array.isArray(outil.videotheque) || outil.videotheque.length === 0;
      if (manqueVideotheque) {
        updates.videotheque = videos.slice(0, 5).map(({ youtube_id, titre, canal, duree }) =>
          ({ youtube_id, titre, canal, duree }));
      }

      const manqueTutoriel = outil.plan === 'featured' && (!Array.isArray(outil.tutoriels) || outil.tutoriels.length === 0);
      if (manqueTutoriel) {
        const meilleure = videos[0];
        updates.tutoriels = [{ youtube_id: meilleure.youtube_id, titre: meilleure.titre, duree: meilleure.duree }];
      }

      await outil.ref.update(updates);
      console.log(`  ✓ ${outil.name} : ${manqueVideotheque ? (updates.videotheque.length + ' vidéo(s) vidéothèque ') : ''}${manqueTutoriel ? '+ 1 tutoriel fiche' : ''}`);
      succes++;

      // Petite pause pour rester correct vis-à-vis de l'API
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.error(`  ✗ ${outil.name} : ${err.message}`);
      echecs++;
    }
  }

  console.log(`\nTerminé — ${succes} mis à jour, ${sansResultat} sans résultat, ${echecs} en erreur.`);
  console.log('⚠️  Relancez gen-fiches.js pour publier les changements sur les fiches HTML statiques.');
}

main().catch(err => {
  console.error('Erreur fatale :', err);
  process.exit(1);
});
