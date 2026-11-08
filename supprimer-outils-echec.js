#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════
   supprimer-outils-echec.js — Suppression des outils en échec d'enrichissement
   Cible : documents FR avec status === 'a_enrichir', plus leurs versions -en et -es.
   Par défaut (DRY_RUN=1) : liste seulement, n'écrit rien.
   Pour supprimer réellement : DRY_RUN=0. Irréversible : sauvegarder avant.
   ═══════════════════════════════════════════════════════ */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const DRY_RUN = process.env.DRY_RUN !== '0';

async function main() {
  const snap = await db.collection('outils').where('langue', '==', 'fr').where('status', '==', 'a_enrichir').get();
  const cibles = snap.docs.map(d => d.id);

  const refs = [];
  for (const id of cibles) {
    for (const suffixe of ['', '-en', '-es']) {
      refs.push(db.collection('outils').doc(id + suffixe));
    }
  }

  const existants = [];
  for (const ref of refs) {
    const d = await ref.get();
    if (d.exists) existants.push({ ref, nom: d.data().name || '(sans nom)', id: ref.id });
  }

  console.log(`${cibles.length} outils FR en échec, ${existants.length} documents existants à supprimer (FR + -en + -es).`);
  for (const e of existants) console.log(`  ${DRY_RUN ? '[simulé] ' : ''}${e.id} | ${e.nom}`);

  if (DRY_RUN) {
    console.log('\nSimulation : rien n\'a été supprimé. Relancer avec DRY_RUN=0 pour supprimer.');
    return;
  }

  let n = 0;
  for (const e of existants) {
    await e.ref.delete();
    n++;
  }
  console.log(`\nSuppression effectuée : ${n} documents supprimés.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
