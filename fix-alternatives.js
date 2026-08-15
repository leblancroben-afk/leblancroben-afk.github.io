#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════
   fix-alternatives.js — Script PONCTUEL, à lancer une seule fois.
   Corrige tout doc "outils" où `alternatives` est une chaîne de
   texte (bug de l'ancienne version d'enrichir-outils.js) plutôt
   qu'un tableau — c'est ce qui fait planter gen-fiches.js en entier
   (altsHTML attend un array, "chaîne".map n'existe pas).

   ⚠️ À supprimer du repo après usage, comme reset-videotheque.js.

   Usage : node fix-alternatives.js
   ═══════════════════════════════════════════════════════ */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const snap = await db.collection('outils').get();
  let n = 0;
  for (const docSnap of snap.docs) {
    const outil = docSnap.data();
    if (typeof outil.alternatives === 'string') {
      const corrige = outil.alternatives.split(',').map(s => s.trim()).filter(Boolean);
      await docSnap.ref.update({ alternatives: corrige, updatedAt: FieldValue.serverTimestamp() });
      console.log(`  ✓ ${outil.name} — alternatives corrigé : [${corrige.join(', ')}]`);
      n++;
    }
  }
  console.log(`\nTerminé — ${n} outil(s) corrigé(s). Relance maintenant gen-fiches.js.`);
}

main().catch(err => { console.error(err); process.exit(1); });
