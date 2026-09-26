#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════
   traduire-fiches.js — Traduction automatique EN/ES des fiches
   Source : Firestore collection "outils" (docs langue='fr' dont le
            champ `traductions.en` ou `traductions.es` est absent).
   Écrit  : crée/complète les docs outils/{id}-en et outils/{id}-es,
            met à jour `traductions` sur le doc FR principal.

   Utilise EXACTEMENT le même moteur que le bouton "🌐 Traduire depuis
   le FR" déjà présent dans l'admin (admin-index-2.html) : LibreTranslate
   auto-hébergé sur Hugging Face Space. Même logique de parsing pour ne
   jamais casser les séparateurs "|" (fonctionnalités) et "||" (FAQ).

   IMPORTANT : ce script NE RÉDIGE RIEN — il traduit fidèlement le
   contenu FR que tu as écrit toi-même. Aucune information n'est
   inventée. Les champs non-textuels (prix, tags, url, catégorie,
   emoji, favicon, stats, tutoriels...) sont recopiés à l'identique,
   jamais traduits (cohérent avec le comportement actuel de l'admin).

   Usage : node traduire-fiches.js
   Cron  : GitHub Actions, nocturne + déclenchement manuel possible
           (workflow_dispatch dans l'onglet Actions)
   ═══════════════════════════════════════════════════════ */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const LIBRETRANSLATE_URL = 'https://damon-albexia-albexia-libretranslate.hf.space/translate';
const MAX_OUTILS_PAR_RUN = 15;

function pause(ms) { return new Promise(r => setTimeout(r, ms)); }

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ══════════════════════════════════════
// LIBRETRANSLATE — même fonction que dans admin-index-2.html
// ══════════════════════════════════════

async function translateText(text, targetLang, _retry = false) {
  if (!text || !text.trim()) return '';
  const res = await fetch(LIBRETRANSLATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source: 'fr', target: targetLang, format: 'text' }),
  });
  if (!res.ok) {
    let details = '';
    try { details = (await res.json()).error || ''; } catch {}
    if (!_retry) {
      await pause(1500);
      return translateText(text, targetLang, true);
    }
    throw new Error(`LibreTranslate ${res.status}${details ? ' — ' + details : ''}`);
  }
  const data = await res.json();
  return data.translatedText || '';
}

// fonctionnalites : [{icon, titre, desc}] — icon jamais traduit
async function translateFonctionnalites(items, targetLang) {
  const resultats = [];
  for (const f of items || []) {
    const titreT = await translateText((f.titre || '').trim(), targetLang);
    await pause(400);
    const descT = (f.desc || '').trim() ? await translateText(f.desc.trim(), targetLang) : '';
    await pause(400);
    resultats.push({ icon: f.icon || '✨', titre: titreT, desc: descT });
  }
  return resultats;
}

// faq : [{q, a}]
async function translateFaq(items, targetLang) {
  const resultats = [];
  for (const f of items || []) {
    const qT = await translateText((f.q || '').trim(), targetLang);
    await pause(400);
    const aT = (f.a || '').trim() ? await translateText(f.a.trim(), targetLang) : '';
    await pause(400);
    resultats.push({ q: qT, a: aT });
  }
  return resultats;
}

// Traduit tous les champs textuels d'un outil vers une langue cible,
// dans le même ordre/pause que le bouton admin pour rester cohérent
// avec le comportement déjà connu du service (rate-limit Render 0.1 CPU).
async function traduireContenu(outil, langueCible) {
  const name = await translateText(outil.name || '', langueCible); await pause(400);
  const description = await translateText(outil.description || '', langueCible); await pause(400);
  const ideal_pour = await translateText(outil.ideal_pour || '', langueCible); await pause(400);
  const presentation = await translateText(outil.presentation || '', langueCible); await pause(400);
  const meta_description = await translateText(outil.meta_description || '', langueCible); await pause(400);
  const fonctionnalites = await translateFonctionnalites(outil.fonctionnalites, langueCible);
  const faq = await translateFaq(outil.faq, langueCible);

  return { name, description, ideal_pour, presentation, meta_description, fonctionnalites, faq };
}

// ══════════════════════════════════════
// CONSTRUCTION DU DOC TRADUIT (même forme que admin-index-2.html)
// ══════════════════════════════════════

function construireDocTraduit(outil, mainId, langue, traduit, folder) {
  const slug = slugify(outil.name);
  return {
    id: `${mainId}-${langue}`,
    name: traduit.name || outil.name,
    category: outil.category,
    emoji: outil.emoji,
    favicon: outil.favicon,
    description: traduit.description || outil.description,
    price: outil.price,
    rating: 0,
    url: outil.url,
    tags: outil.tags || [],
    page: `tools/${folder}/${langue}/${slug}/index.html`,
    plan: outil.plan,
    langue,
    traductions: { fr: mainId },
    ideal_pour: traduit.ideal_pour || '',
    fonctionnalites: traduit.fonctionnalites || [],
    faq: traduit.faq || [],
    presentation: traduit.presentation || '',
    meta_description: traduit.meta_description || '',
    maker: outil.maker || '',
    plateformes: outil.plateformes || '',
    url_tarifs: outil.url_tarifs || '',
    interface_fr: outil.interface_fr,
    api: outil.api,
    mobile: outil.mobile,
    stats: outil.stats || [],
    tutoriels: outil.tutoriels || [], // jamais traduits — vidéos en FR
    alternatives: outil.alternatives || [],
    screenshot_url: outil.screenshot_url || '',
    generer_fiche: outil.generer_fiche,
    slug_articles: outil.slug_articles || null,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

// ══════════════════════════════════════
// SCRIPT PRINCIPAL
// ══════════════════════════════════════

async function traduireOutils() {
  const snap = await db.collection('outils').where('langue', '==', 'fr').get();
  const tousLesOutils = snap.docs.map(d => ({ ref: d.ref, id: d.id, ...d.data() }));

  const aTraiter = tousLesOutils.filter(o => {
    const manqueEn = !o.traductions?.en;
    const manqueEs = !o.traductions?.es;
    return manqueEn || manqueEs;
  }).slice(0, MAX_OUTILS_PAR_RUN);

  console.log(`${tousLesOutils.length} outils au total, ${aTraiter.length} à traduire ce run.`);

  let succes = 0, echecs = 0;

  for (const outil of aTraiter) {
    const folder = outil.plan === 'featured' ? 'featured' : 'standard';
    const mainId = outil.id;
    const traductionsMaj = { ...(outil.traductions || {}) };
    const erreursOutil = [];

    for (const langue of ['en', 'es']) {
      if (outil.traductions?.[langue]) continue; // déjà traduit

      try {
        const traduit = await traduireContenu(outil, langue);
        const docId = `${mainId}-${langue}`;
        const docTraduit = construireDocTraduit(outil, mainId, langue, traduit, folder);
        await db.collection('outils').doc(docId).set(docTraduit, { merge: true });
        traductionsMaj[langue] = docId;
        console.log(`  ✓ ${outil.name} → ${langue.toUpperCase()}`);
      } catch (err) {
        console.error(`  ✗ ${outil.name} → ${langue.toUpperCase()} : ${err.message}`);
        erreursOutil.push(langue);
      }
    }

    if (Object.keys(traductionsMaj).length > Object.keys(outil.traductions || {}).length) {
      await outil.ref.update({ traductions: traductionsMaj, updatedAt: FieldValue.serverTimestamp() });
      succes++;
    }
    if (erreursOutil.length) echecs++;
  }

  console.log(`\nOutils — ${succes} mis à jour, ${echecs} avec au moins une erreur.`);
}

// ══════════════════════════════════════
// GLOSSAIRE — traduction inline sur le MÊME document Firestore
// (contrairement aux outils : pas de docs séparés par langue, car la
// page glossaire/index.html affiche les 3 langues depuis un seul
// tableau généré par gen-fiches.js, avec bascule côté client).
// Champs traduits : terme, definitionFlash, exemple (les 3 seuls
// utilisés sur les cartes du hub). Écrits sous la forme
// terme_en/terme_es, definitionFlash_en/es, exemple_en/es.
// ══════════════════════════════════════

const MAX_TERMES_PAR_RUN = 15;

// faq glossaire : [{question, reponse}] — même logique que translateFaq
// (outils) mais noms de champs différents (français, pas q/a).
async function translateGlossaireFaq(items, targetLang) {
  const resultats = [];
  for (const f of items || []) {
    const questionT = await translateText((f.question || '').trim(), targetLang);
    await pause(400);
    const reponseT = (f.reponse || '').trim() ? await translateText(f.reponse.trim(), targetLang) : '';
    await pause(400);
    resultats.push({ question: questionT, reponse: reponseT });
  }
  return resultats;
}

async function traduireTerme(terme, langueCible) {
  const t   = await translateText(terme.terme || '', langueCible); await pause(400);
  const d   = await translateText(terme.definitionFlash || '', langueCible); await pause(400);
  const e   = terme.exemple ? await translateText(terme.exemple, langueCible) : '';
  if (terme.exemple) await pause(400);
  const p   = terme.pourquoiImportant ? await translateText(terme.pourquoiImportant, langueCible) : '';
  if (terme.pourquoiImportant) await pause(400);
  const ep  = terme.enPratique ? await translateText(terme.enPratique, langueCible) : '';
  if (terme.enPratique) await pause(400);
  const err = terme.erreurFrequente ? await translateText(terme.erreurFrequente, langueCible) : '';
  if (terme.erreurFrequente) await pause(400);
  const faq = await translateGlossaireFaq(terme.faq, langueCible);
  return { terme: t, definitionFlash: d, exemple: e, pourquoiImportant: p, enPratique: ep, erreurFrequente: err, faq };
}

async function traduireGlossaire() {
  const snap = await db.collection('glossaire').get();
  const tousLesTermes = snap.docs.map(d => ({ ref: d.ref, id: d.id, ...d.data() }));

  const aTraiter = tousLesTermes.filter(t => {
    const manqueEn = !t.terme_en || !t.definitionFlash_en;
    const manqueEs = !t.terme_es || !t.definitionFlash_es;
    return manqueEn || manqueEs;
  }).slice(0, MAX_TERMES_PAR_RUN);

  console.log(`\n${tousLesTermes.length} terme(s) glossaire au total, ${aTraiter.length} à traduire ce run.`);

  let succes = 0, echecs = 0;

  for (const terme of aTraiter) {
    const maj = {};
    const erreursTerme = [];

    for (const langue of ['en', 'es']) {
      if (terme[`terme_${langue}`] && terme[`definitionFlash_${langue}`]) continue; // déjà traduit

      try {
        const traduit = await traduireTerme(terme, langue);
        maj[`terme_${langue}`] = traduit.terme;
        maj[`definitionFlash_${langue}`] = traduit.definitionFlash;
        maj[`exemple_${langue}`] = traduit.exemple;
        maj[`pourquoiImportant_${langue}`] = traduit.pourquoiImportant;
        maj[`enPratique_${langue}`] = traduit.enPratique;
        maj[`erreurFrequente_${langue}`] = traduit.erreurFrequente;
        maj[`faq_${langue}`] = traduit.faq;
        console.log(`  ✓ ${terme.terme} → ${langue.toUpperCase()}`);
      } catch (err) {
        console.error(`  ✗ ${terme.terme} → ${langue.toUpperCase()} : ${err.message}`);
        erreursTerme.push(langue);
      }
    }

    if (Object.keys(maj).length) {
      maj.updatedAt = FieldValue.serverTimestamp();
      await terme.ref.set(maj, { merge: true });
      succes++;
    }
    if (erreursTerme.length) echecs++;
  }

  console.log(`Glossaire — ${succes} terme(s) mis à jour, ${echecs} avec au moins une erreur.`);
}

// ══════════════════════════════════════
// SCRIPT PRINCIPAL
// ══════════════════════════════════════

async function main() {
  await traduireOutils();
  await traduireGlossaire();
  console.log('\n⚠️  Relance gen-fiches.js pour publier les nouvelles fiches EN/ES en HTML statique.');
}

main().catch(err => {
  console.error('Erreur fatale :', err);
  process.exit(1);
});
