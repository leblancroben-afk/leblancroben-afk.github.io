#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════
   backfill-descriptions-videos.js — Rattrapage des descriptions vidéo
   Remplace `description_video` (vide ou identique au titre) par la
   description YouTube réelle (snippet.description), résumée à 300 caractères.
   Coût : 1 unité YouTube pour 50 vidéos. Aucun appel Gemini.
   Usage : node backfill-descriptions-videos.js   (DRY_RUN=1 pour simuler)
   ═══════════════════════════════════════════════════════ */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const DRY_RUN = process.env.DRY_RUN === '1';
const pause = ms => new Promise(r => setTimeout(r, ms));

// Même règle que generer-videos.js : 300 caractères max, coupure à la fin d'une phrase
function resumerDescription(texte, max = 300) {
  const propre = String(texte || '').replace(/\s+/g, ' ').trim();
  if (!propre) return '';
  if (propre.length <= max) return propre;
  const coupe = propre.slice(0, max);
  const fin = Math.max(coupe.lastIndexOf('. '), coupe.lastIndexOf('! '), coupe.lastIndexOf('? '));
  if (fin > 80) return coupe.slice(0, fin + 1);
  const mot = coupe.lastIndexOf(' ');
  return (mot > 80 ? coupe.slice(0, mot) : coupe) + '…';
}

// Une vidéo a besoin d'une description si elle est vide ou identique à son titre
const aCorriger = v => v && v.youtube_id && (!v.description_video || v.description_video.trim() === (v.titre || '').trim());

async function main() {
  if (!YOUTUBE_API_KEY) {
    console.error('✗ YOUTUBE_API_KEY manquant dans les secrets.');
    process.exit(1);
  }

  const snap = await db.collection('outils').where('langue', '==', 'fr').get();
  const outils = snap.docs
    .map(d => ({ ref: d.ref, name: d.data().name || d.id, videotheque: d.data().videotheque }))
    .filter(o => Array.isArray(o.videotheque) && o.videotheque.some(aCorriger));

  const ids = [...new Set(outils.flatMap(o => o.videotheque.filter(aCorriger).map(v => v.youtube_id)))];
  console.log(`${outils.length} outils concernés, ${ids.length} vidéos à compléter.`);

  // Descriptions par lots de 50 identifiants
  const descriptions = new Map();
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
      descriptions.set(item.id, resumerDescription(item.snippet?.description || ''));
    }
    await pause(200);
  }
  console.log(`${descriptions.size} descriptions récupérées sur YouTube.`);

  let maj = 0, vides = 0, introuvables = 0;
  for (const o of outils) {
    let change = false;
    const nouvelle = o.videotheque.map(v => {
      if (!aCorriger(v)) return v;
      if (!descriptions.has(v.youtube_id)) { introuvables++; return v; }
      const d = descriptions.get(v.youtube_id);
      if (!d) vides++;
      change = true;
      return { ...v, description_video: d };
    });
    if (!change) continue;
    maj++;
    console.log(`  ${DRY_RUN ? '[simulé] ' : ''}✓ ${o.name}`);
    if (!DRY_RUN) await o.ref.update({ videotheque: nouvelle });
  }

  console.log(`Terminé : ${maj} outils mis à jour, ${vides} vidéos sans description sur YouTube, ${introuvables} vidéos introuvables.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
