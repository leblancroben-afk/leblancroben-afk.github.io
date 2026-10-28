#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════
   generer-videos.js — Attribution automatique de vidéos YouTube
   Source : Firestore collection "outils" (docs langue='fr' uniquement)
   Sortie : complète le champ `videotheque` (jusqu'à MAX_VIDEOS vidéos).
            Ne touche à AUCUN autre champ.
   Usage  : node generer-videos.js
   Cron   : GitHub Actions, chaque nuit (voir videos-nocturnes.yml)

   ── Logique ──
   - Priorité : les outils qui ont le moins de vidéos passent en premier
     (0 vidéo, puis 1, 2, ...). Limite : MAX_OUTILS_PAR_RUN outils par run.
   - Pour chaque outil : recherche YouTube (coût : ~100 unités par recherche),
     filtre les Shorts (< 90 s) et les vidéos déjà présentes.
   - Tri pertinence par Gemini, par GROUPES de GROUPE_GEMINI outils :
     une seule requête pour 5 outils. Chaque vidéo n'est rattachée qu'à
     l'outil dont elle faisait partie des candidats. Les index renvoyés
     hors limites sont ignorés.
   - Ajoute les vidéos retenues à la suite des existantes, sans dépasser
     MAX_VIDEOS. Les vidéos existantes ne sont jamais supprimées.
   - Sur quota Gemini (429) ou YouTube épuisé, le run s'arrête proprement :
     ce qui est déjà écrit est conservé.
   - Écrit `ajoutees=N` dans GITHUB_OUTPUT : le workflow ne régénère les
     fiches que si N > 0.
   ═══════════════════════════════════════════════════════ */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const fs = require('fs');

// ── Init Firebase Admin (même pattern que gen-fiches.js) ──
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-3.5-flash';
const MAX_VIDEOS = 10;               // vidéos par outil
const MAX_OUTILS_PAR_RUN = parseInt(process.env.MAX_OUTILS || '25', 10); // outils par run (quota YouTube)
const DRY_RUN = process.env.DRY_RUN === '1'; // mode test : rien n'est écrit dans Firestore
const GROUPE_GEMINI = 5;             // outils analysés par requête Gemini
const CANDIDATS_PAR_OUTIL = 10;      // résultats YouTube demandés par outil
const DUREE_MIN_SECONDES = 90;       // exclut les Shorts

const pause = ms => new Promise(r => setTimeout(r, ms));

// ══════════════════════════════════════
// UTILITAIRES
// ══════════════════════════════════════

// Convertit une durée ISO 8601 YouTube ("PT12M34S") en "mm:ss" ou "hh:mm:ss"
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

function nbVideos(outil) {
  return Array.isArray(outil.videotheque) ? outil.videotheque.length : 0;
}

async function fetchJSON(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(`YouTube API ${res.status}: ${data?.error?.message || 'erreur inconnue'}`);
    err.quota = /quota/i.test(data?.error?.message || '') || data?.error?.errors?.some(e => /quota/i.test(e.reason || ''));
    throw err;
  }
  return data;
}

// Requêtes de recherche par outil (deux formulations pour élargir le pool).
const REQUETES = (nom) => [`${nom} tutoriel`, `comment utiliser ${nom}`];

// Cherche des vidéos pour un outil sur plusieurs requêtes, fusionne les doublons,
// écarte les Shorts. Renvoie une liste triée par vues.
async function chercherVideos(nomOutil, max) {
  const trouvees = new Map();
  for (const requete of REQUETES(nomOutil)) {
    const q = encodeURIComponent(requete);
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${q}` +
      `&type=video&order=relevance&maxResults=${max}&safeSearch=moderate&key=${YOUTUBE_API_KEY}`;
    const searchData = await fetchJSON(searchUrl);
    const ids = (searchData.items || []).map(it => it.id?.videoId).filter(Boolean)
      .filter(id => !trouvees.has(id));
    if (ids.length === 0) continue;

    const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics,snippet` +
      `&id=${ids.join(',')}&key=${YOUTUBE_API_KEY}`;
    const detailsData = await fetchJSON(detailsUrl);
    for (const v of detailsData.items || []) {
      trouvees.set(v.id, {
        youtube_id: v.id,
        titre: v.snippet?.title || '',
        canal: v.snippet?.channelTitle || '',
        description_video: (v.snippet?.description || '').slice(0, 200),
        duree: isoDureeVersMMSS(v.contentDetails?.duration),
        secondes: isoDureeVersSecondes(v.contentDetails?.duration),
        vues: parseInt(v.statistics?.viewCount || '0', 10),
      });
    }
    await pause(200);
  }
  return [...trouvees.values()]
    .filter(v => v.titre && v.youtube_id && v.secondes >= DUREE_MIN_SECONDES)
    .sort((a, b) => b.vues - a.vues);
}

// ══════════════════════════════════════
// TRI DE PERTINENCE GEMINI (un groupe d'outils par requête)
// ══════════════════════════════════════

// groupe : [{ nom, description, candidats }]
// Renvoie une Map : index de l'outil dans le groupe -> vidéos retenues.
// Une vidéo n'est jamais rattachée à un autre outil que celui dont elle
// était candidate.
async function filtrerPertinenceGroupe(groupe) {
  const blocs = groupe.map((o, k) => {
    const liste = o.candidats
      .map((v, i) => `  [${i}] Titre: ${v.titre} | Chaîne: ${v.canal} | Description: ${v.description_video}`)
      .join('\n');
    return `OUTIL ${k} : "${o.nom}" — ${o.description || 'pas de description disponible'}\nCandidats :\n${liste}`;
  }).join('\n\n');

  const prompt = `Un annuaire d'outils IA cherche des tutoriels YouTube. Pour chaque outil ci-dessous, ` +
    `ne retiens que les vidéos candidates qui parlent de cet outil IA précis (présentation, usage, démonstration ou tutoriel suffisent). ` +
    `Un nom ambigu (jeu vidéo, film, chanson, produit sans rapport...) ramène souvent du hors-sujet : écarte-le. ` +
    `Une vidéo ne peut être retenue que pour l'outil dont elle figure dans la liste de candidats.\n\n${blocs}\n\n` +
    `Réponds UNIQUEMENT avec un tableau JSON, un élément par outil, de la forme ` +
    `[{"outil": 0, "videos": [2, 0]}, {"outil": 1, "videos": []}]. ` +
    `"videos" contient les index des candidats retenus, dans l'ordre de recommandation. ` +
    `Si aucune ne convient, "videos": [].`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  const corps = JSON.stringify({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
  });
  let res, data;
  for (let essai = 0; essai < 4; essai++) {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corps });
    data = await res.json();
    if (res.status !== 503) break;
    if (essai < 3) {
      const attente = 30 * 2 ** essai;
      console.log(`  … Gemini 503 (surcharge), nouvelle tentative dans ${attente} s`);
      await pause(attente * 1000);
    }
  }
  if (!res.ok) {
    const err = new Error(`Gemini API ${res.status}: ${data?.error?.message || 'erreur inconnue'}`);
    err.quota = res.status === 429 || data?.error?.status === 'RESOURCE_EXHAUSTED';
    throw err;
  }

  const texte = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!texte) console.log(`  [debug] Gemini : réponse vide. Détail : ${JSON.stringify(data).slice(0, 300)}`);
  let parsed;
  try {
    parsed = JSON.parse(texte || '[]');
  } catch {
    throw new Error('JSON Gemini invalide pour ce groupe.');
  }

  const resultats = new Map();
  for (const item of Array.isArray(parsed) ? parsed : []) {
    const k = item?.outil;
    if (!Number.isInteger(k) || k < 0 || k >= groupe.length) continue;
    const cands = groupe[k].candidats;
    const retenus = (Array.isArray(item.videos) ? item.videos : [])
      .filter(i => Number.isInteger(i) && i >= 0 && i < cands.length)
      .map(i => cands[i]);
    resultats.set(k, retenus);
  }
  const total = [...resultats.values()].reduce((n, l) => n + l.length, 0);
  if (total === 0) console.log(`  [debug] Gemini n'a rien retenu pour ce groupe. Réponse brute : ${String(texte || '').slice(0, 500)}`);
  return resultats;
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

  // Les outils avec le moins de vidéos d'abord, puis limite par run.
  const aTraiter = tousLesOutils
    .filter(o => nbVideos(o) < MAX_VIDEOS)
    .sort((a, b) => nbVideos(a) - nbVideos(b))
    .slice(0, MAX_OUTILS_PAR_RUN);

  console.log(`${tousLesOutils.length} outils au total, ${aTraiter.length} à compléter ce run (objectif : ${MAX_VIDEOS} vidéos par outil).`);

  let ajoutees = 0, simulees = 0, sansResultat = 0, echecs = 0, arret = false;

  // ── Étape 1 : candidats YouTube pour chaque outil ──
  const prepares = [];
  for (const outil of aTraiter) {
    try {
      const candidats = await chercherVideos(outil.name, CANDIDATS_PAR_OUTIL);
      const dejaLa = new Set((outil.videotheque || []).map(v => v.youtube_id));
      const nouveaux = candidats.filter(v => !dejaLa.has(v.youtube_id));
      prepares.push({ outil, candidats: nouveaux });
    } catch (err) {
      console.error(`  ✗ ${outil.name} (YouTube) : ${err.message}`);
      echecs++;
      if (err.quota) {
        arret = true;
        console.log('::warning::Quota YouTube épuisé : arrêt de la recherche. Les outils restants restent à compléter.');
        break;
      }
    }
    await pause(300);
  }

  // ── Étape 2 : tri Gemini par groupes ──
  for (let debut = 0; debut < prepares.length && !arret; debut += GROUPE_GEMINI) {
    const groupe = prepares.slice(debut, debut + GROUPE_GEMINI);

    // Outils sans aucun candidat nouveau : rien à analyser.
    const aAnalyser = groupe.filter(g => {
      if (g.candidats.length === 0) {
        console.log(`  – ${g.outil.name} : aucun nouveau candidat sur YouTube.`);
        sansResultat++;
        return false;
      }
      return true;
    });
    if (aAnalyser.length === 0) continue;

    let resultats;
    try {
      resultats = await filtrerPertinenceGroupe(
        aAnalyser.map(g => ({ nom: g.outil.name, description: g.outil.description, candidats: g.candidats }))
      );
    } catch (err) {
      console.error(`  ✗ Groupe de ${aAnalyser.length} (Gemini) : ${err.message}`);
      echecs += aAnalyser.length;
      if (err.quota) {
        arret = true;
        console.log('::warning::Quota Gemini épuisé : arrêt du tri. Les outils restants restent à compléter.');
        break;
      }
      continue;
    }

    for (let k = 0; k < aAnalyser.length; k++) {
      const { outil } = aAnalyser[k];
      const retenus = resultats.get(k) || [];
      if (retenus.length === 0) {
        console.log(`  – ${outil.name} : aucune vidéo pertinente parmi ${aAnalyser[k].candidats.length} candidate(s).`);
        sansResultat++;
        continue;
      }

      const existantes = Array.isArray(outil.videotheque) ? outil.videotheque : [];
      const place = MAX_VIDEOS - existantes.length;
      const ajout = retenus.slice(0, place).map(({ youtube_id, titre, canal, duree }) =>
        ({ youtube_id, titre, canal, duree }));

      if (DRY_RUN) {
        console.log(`  [TEST] ${outil.name} : ajouterait ${ajout.length} vidéo(s) → ${ajout.map(v => v.titre).join(' | ')}`);
        simulees += ajout.length;
        continue;
      }

      try {
        await outil.ref.update({
          videotheque: [...existantes, ...ajout],
          updatedAt: FieldValue.serverTimestamp(),
        });
        ajoutees += ajout.length;
        console.log(`  ✓ ${outil.name} : +${ajout.length} vidéo(s), total ${existantes.length + ajout.length}/${MAX_VIDEOS}`);
      } catch (err) {
        console.error(`  ✗ ${outil.name} (écriture) : ${err.message}`);
        echecs++;
      }
    }
    await pause(300);
  }

  console.log(`\nTerminé — ${ajoutees} vidéo(s) ajoutée(s), ${sansResultat} sans nouveau résultat, ${echecs} en erreur.`);
  if (arret) console.log('(arrêt anticipé : quota)');
  if (DRY_RUN) console.log(`MODE TEST : ${simulees} vidéo(s) simulée(s), rien écrit dans Firestore.`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `ajoutees=${ajoutees}\n`);
}

main().catch(err => {
  console.error('Erreur fatale :', err);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `ajoutees=0\n`);
  process.exit(1);
});
