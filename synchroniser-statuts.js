#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════
   synchroniser-statuts.js — Remet en « active » les versions -en et -es
   restées en « a_enrichir » alors que la version française est publiée.
   Condition : la version traduite doit avoir une description, une URL
   et une fiche générée ; sinon elle est listée « à vérifier » et laissée telle quelle.
   Par défaut (DRY_RUN=1) : liste seulement, n'écrit rien.
   Pour écrire : DRY_RUN=0. Sauvegarder Firestore avant.
   ═══════════════════════════════════════════════════════ */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const DRY_RUN = process.env.DRY_RUN !== '0';

async function main() {
  const fr = await db.collection('outils').where('langue', '==', 'fr').where('status', '==', 'active').get();
  const aCorriger = [];
  const aVerifier = [];

  for (const doc of fr.docs) {
    for (const langue of ['en', 'es']) {
      const ref = db.collection('outils').doc(`${doc.id}-${langue}`);
      const snap = await ref.get();
      if (!snap.exists) continue;
      const d = snap.data();
      // Statut absent (ancien document traduit) ou resté « a_enrichir » : les deux cas sont à corriger.
      if (d.status && d.status !== 'a_enrichir') continue;
      const complet = !!(d.description && String(d.description).trim() && d.url && d.fiche_generee === true);
      (complet ? aCorriger : aVerifier).push({ ref, id: ref.id, nom: d.name || '(sans nom)' });
    }
  }

  console.log(`${aCorriger.length} version(s) prête(s) à passer en active.`);
  for (const e of aCorriger) console.log(`  ${DRY_RUN ? '[simulé] ' : ''}${e.id} | ${e.nom}`);
  console.log(`${aVerifier.length} version(s) incomplète(s) : à vérifier, non modifiées.`);
  for (const e of aVerifier) console.log(`  ${e.id} | ${e.nom}`);

  if (DRY_RUN) {
    console.log("\nSimulation : rien n'a été modifié. Relancer avec DRY_RUN=0 pour appliquer.");
    return;
  }
  for (const e of aCorriger) {
    await e.ref.update({ status: 'active', updatedAt: new Date() });
  }
  console.log(`${aCorriger.length} document(s) mis à jour.`);
}

main().catch(err => { console.error(err); process.exit(1); });
