#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════
   compter-outils.js — Diagnostic en LECTURE SEULE
   Compte les outils français par statut et liste ceux en échec
   d'enrichissement, avec leur motif. N'écrit rien dans Firestore.
   ═══════════════════════════════════════════════════════ */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
  const snap = await db.collection('outils').where('langue', '==', 'fr').get();
  const outils = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const total = outils.length;
  const enEchec = outils.filter(o => o.enrichissement_echec !== undefined);
  const actifs = outils.filter(o => o.status === 'active');
  const sansStatut = outils.filter(o => o.status === undefined || o.status === null || o.status === '');
  const offline = outils.filter(o => o.status === 'offline');
  const autresStatuts = outils.filter(o => !['active', 'offline'].includes(o.status) && !sansStatut.includes(o));
  const actifsEtEchec = outils.filter(o => o.status === 'active' && o.enrichissement_echec !== undefined);
  const affichesSansActiveNiEchec = outils.filter(o => o.status !== 'offline' && o.status !== 'active' && o.enrichissement_echec === undefined);

  console.log(`Outils français au total : ${total}`);
  console.log(`  status = active        : ${actifs.length}`);
  console.log(`  status = offline       : ${offline.length}`);
  console.log(`  sans statut            : ${sansStatut.length}`);
  console.log(`  autre statut           : ${autresStatuts.length}`);
  console.log(`  avec enrichissement_echec : ${enEchec.length}`);
  console.log(`  active ET en échec     : ${actifsEtEchec.length}`);
  console.log(`  affichés (non offline) sans active ni échec : ${affichesSansActiveNiEchec.length}`);

  console.log(`\n--- Outils en échec d'enrichissement (${enEchec.length}) ---`);
  for (const o of enEchec.slice(0, 200)) {
    console.log(`  ${o.id} | ${o.name || '(sans nom)'} | status=${o.status ?? 'vide'} | motif=${o.enrichissement_echec_motif ?? '?'}`);
  }

  console.log(`\n--- Outils affichés sans active ni échec (${affichesSansActiveNiEchec.length}) ---`);
  for (const o of affichesSansActiveNiEchec.slice(0, 200)) {
    console.log(`  ${o.id} | ${o.name || '(sans nom)'} | status=${o.status ?? 'vide'}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
