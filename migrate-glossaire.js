#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════
   migrate-glossaire.js — Migration one-shot glossaire.json → Firestore
   Usage : node migrate-glossaire.js [--confirm]

   Sans --confirm : mode simulation, affiche ce qui serait écrit sans
   toucher à Firestore (même pattern que reset-catalogue.js).

   Ce script :
   1. Lit glossaire.json (34→41 termes, format legacy)
   2. Lit la collection Firestore "outils" pour résoudre les noms texte
      libre ("ChatGPT") vers de vrais slugs ("chatgpt") — un nom non
      trouvé dans le catalogue est ignoré avec un avertissement plutôt
      que de bloquer toute la migration.
   3. Écrit chaque terme dans glossaire/{slug} avec status:'brouillon'
      (les champs enrichis pourquoiImportant/enPratique/faq/erreurFrequente
      sont vides — à remplir via generate-glossaire-content.js + relecture
      admin avant publication).
   4. N'écrase jamais un doc déjà migré (skip si le doc existe déjà) —
      relancer le script après une première migration est donc sans danger.
   ═══════════════════════════════════════════════════════ */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const fs = require('fs');

const CONFIRM = process.argv.includes('--confirm');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

function slugify(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function main() {
  console.log(`Mode : ${CONFIRM ? '✍️  ÉCRITURE RÉELLE' : '🔍 SIMULATION (ajoutez --confirm pour écrire)'}\n`);

  // ── 1. Lecture du JSON legacy ──────────────────────────
  const termes = JSON.parse(fs.readFileSync('data/glossaire.json', 'utf8'));
  console.log(`✓ ${termes.length} termes lus depuis data/glossaire.json`);

  // ── 2. Résolution des noms d'outils → slugs réels ──────
  const outilsSnap = await db.collection('outils').get();
  const outilsParNomNormalise = new Map();
  outilsSnap.docs.forEach(d => {
    const data = d.data();
    const cle = slugify(data.name);
    if (cle && !outilsParNomNormalise.has(cle)) outilsParNomNormalise.set(cle, cle);
  });
  console.log(`✓ ${outilsSnap.size} outils Firestore chargés pour résolution des slugs\n`);

  const nomsNonTrouves = new Set();

  // ── 3. Vérification des docs déjà existants (idempotence) ──
  const glossaireExistant = await db.collection('glossaire').get();
  const slugsExistants = new Set(glossaireExistant.docs.map(d => d.id));

  let toWrite = 0, toSkip = 0;
  const batch = db.batch();

  for (const t of termes) {
    if (!t.slug) { console.warn(`⚠️  Terme sans slug ignoré : "${t.terme}"`); continue; }

    if (slugsExistants.has(t.slug)) {
      toSkip++;
      continue;
    }

    // Résolution outils texte libre → slugs
    const outilsSlugs = (t.outils || [])
      .map(nom => {
        const slug = slugify(nom);
        if (!outilsParNomNormalise.has(slug)) { nomsNonTrouves.add(nom); return null; }
        return slug;
      })
      .filter(Boolean);

    const doc = {
      terme:             t.terme,
      slug:              t.slug,
      lettre:            t.lettre || (t.terme?.[0] || '').toUpperCase(),
      niveau:            t.niveau || 'debutant',
      definitionFlash:   t.definition || '',
      exemple:           t.exemple || '',
      tags:              t.tags || [],
      outils:            outilsSlugs,
      // ── Champs enrichis — vides, à générer puis relire avant publication ──
      pourquoiImportant: '',
      enPratique:        '',
      erreurFrequente:   '',
      faq:               [],
      termesConnexes:    [],
      status:            'brouillon',
      createdAt:         FieldValue.serverTimestamp(),
      updatedAt:         FieldValue.serverTimestamp(),
    };

    console.log(`  ${CONFIRM ? '✍️ ' : '👀'} ${t.slug} — outils résolus: [${outilsSlugs.join(', ') || 'aucun'}]`);

    if (CONFIRM) {
      const ref = db.collection('glossaire').doc(t.slug);
      batch.set(ref, doc);
    }
    toWrite++;
  }

  if (CONFIRM && toWrite > 0) {
    await batch.commit();
    console.log(`\n✅ ${toWrite} terme(s) écrit(s) dans Firestore (status: brouillon).`);
  } else if (!CONFIRM) {
    console.log(`\n🔍 ${toWrite} terme(s) seraient écrits — relancez avec --confirm pour appliquer.`);
  }

  console.log(`↷ ${toSkip} terme(s) déjà présents en Firestore, ignorés (idempotent).`);

  if (nomsNonTrouves.size) {
    console.log(`\n⚠️  Noms d'outils non résolus (à vérifier manuellement dans l'admin) :`);
    [...nomsNonTrouves].forEach(n => console.log(`   - "${n}"`));
  }

  console.log(`\n📌 Prochaine étape : passer chaque terme en status:'publie' depuis l'admin`);
  console.log(`   une fois pourquoiImportant/enPratique/faq/erreurFrequente remplis`);
  console.log(`   (via generate-glossaire-content.js + relecture).`);
}

main().catch(err => { console.error('❌ Erreur:', err); process.exit(1); });
