#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════
   backfill-dates-videos.js — Rattrapage des dates de publication
   Ajoute `date_publication` (YouTube snippet.publishedAt) aux vidéos
   déjà présentes dans la vidéothèque (collection "outils", langue fr).
   Coût : 1 unité YouTube pour 50 vidéos. Aucun appel Gemini.
   Usage : node backfill-dates-videos.js   (DRY_RUN=1 pour simuler)
   ═══════════════════════════════════════════════════════ */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const DRY_RUN = process.env.DRY_RUN === '1';
const pause = ms => new Promise(r => setTimeout(r, ms));

const sansDate = v => v && v.youtube_id && !v.date_publication;

async function main() {
  if (!YOUTUBE_API_KEY) {
    console.error('✗ YOUTUBE_API_KEY manquant dans les secrets.');
    process.exit(1);
  }

  const snap = await db.collection('outils').where('langue', '==', 'fr').get();
  const outils = snap.docs
    .map(d => ({ ref: d.ref, name: d.data().name || d.id, videotheque: d.data().videotheque }))
    .filter(o => Array.isArray(o.videotheque) && o.videotheque.some(sansDate));

  const ids = [...new Set(outils.flatMap(o => o.videotheque.filter(sansDate).map(v => v.youtube_id)))];
  console.log(`${outils.length} outils concernés, ${ids.length} vidéos sans date.`);

  // Dates par lots de 50 identifiants
  const dates = new Map();
  for (let i = 0; i < ids.length; i += 50) {
    const lot = ids.slice(i, i + 50);
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${lot.join(',')}&key=${YOUTUBE_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!res.ok) {
      console.error(`✗ YouTube API ${res.status} : ${data?.error?.message || 'erreur inconnue'}`);
      break;
    }
    for (const item of data.items || []) {
      if (item.snippet?.publishedAt) dates.set(item.id, item.snippet.publishedAt);
    }
    await pause(200);
  }
  console.log(`${dates.size} dates récupérées sur YouTube.`);

  // Mise à jour des documents
  let maj = 0, introuvables = 0;
  for (const o of outils) {
    let change = false;
    const nouvelle = o.videotheque.map(v => {
      if (!sansDate(v)) return v;
      const d = dates.get(v.youtube_id);
      if (!d) { introuvables++; return v; }
      change = true;
      return { ...v, date_publication: d };
    });
    if (!change) continue;
    maj++;
    console.log(`  ${DRY_RUN ? '[simulé] ' : ''}✓ ${o.name}`);
    if (!DRY_RUN) await o.ref.update({ videotheque: nouvelle });
  }

  console.log(`Terminé : ${maj} outils mis à jour, ${introuvables} vidéos sans date (supprimées ou privées sur YouTube).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
