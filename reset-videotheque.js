#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════
   reset-videotheque.js — Script PONCTUEL, à lancer une seule fois
   à la main (pas de cron). Vide videotheque[] et tutoriels[] sur
   TOUS les outils FR pour forcer generer-videos.js à tout retraiter
   avec la nouvelle version filtrée par pertinence (Gemini).

   ⚠️ À supprimer du repo après usage — ce n'est pas un script à
   garder ni à laisser tourner en cron, il écraserait des vidéos
   correctes ajoutées manuellement par la suite.

   Usage : node reset-videotheque.js
   ═══════════════════════════════════════════════════════ */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const snap = await db.collection('outils').where('langue', '==', 'fr').get();
  let n = 0;
  for (const docSnap of snap.docs) {
    const outil = docSnap.data();
    if ((outil.videotheque || []).length || (outil.tutoriels || []).length) {
      await docSnap.ref.update({
        videotheque: [],
        tutoriels: [],
        updatedAt: FieldValue.serverTimestamp(),
      });
      console.log(`  ✓ ${outil.name} — vidéothèque vidée`);
      n++;
    }
  }
  console.log(`\nTerminé — ${n} outil(s) réinitialisé(s). Relance maintenant generer-videos.js.`);
}

main().catch(err => { console.error(err); process.exit(1); });
