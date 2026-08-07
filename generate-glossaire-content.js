#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════
   generate-glossaire-content.js — Enrichissement Gemini du glossaire
   Usage : node generate-glossaire-content.js [--confirm]

   Sans --confirm : simulation, affiche le JSON généré sans écrire
   dans Firestore (même pattern que migrate-glossaire.js).

   Pour chaque terme glossaire dont pourquoiImportant est encore vide,
   demande à Gemini de générer 4 champs :
     - pourquoiImportant  (2-3 phrases)
     - enPratique         (1 paragraphe)
     - erreurFrequente    (1-2 phrases, confusion courante)
     - faq                (2 questions/réponses)

   Écrit directement dans le doc Firestore existant (update, pas
   overwrite) sans toucher au statut — le terme reste en 'brouillon'
   jusqu'à relecture manuelle et publication depuis l'admin (tab
   📖 Glossaire). Idempotent : un terme déjà enrichi (pourquoiImportant
   non vide) est sauté, donc relancer le script ne coûte rien et
   n'écrase jamais une relecture manuelle déjà faite.
   ═══════════════════════════════════════════════════════ */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const CONFIRM = process.argv.includes('--confirm');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL   = 'gemini-3.5-flash';
const GEMINI_URL     = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// Le tier gratuit de gemini-3.5-flash est limité à 20 requêtes/jour.
// On groupe plusieurs termes par appel (au lieu d'1 requête par terme)
// pour rester très en dessous de ce plafond même avec tout le glossaire.
const BATCH_SIZE   = 6;   // 41 termes ÷ 6 ≈ 7 requêtes/jour, marge confortable sous 20
const PAUSE_MS     = 4000;  // pause entre batches
const MAX_RETRIES  = 3;     // retries sur erreurs transitoires (503) ou JSON tronqué
const sleep = ms => new Promise(r => setTimeout(r, ms));

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function buildBatchPrompt(termes) {
  const listeTermes = termes.map((t, i) => `
${i + 1}. slug: "${t.slug}"
   Terme : "${t.terme}"
   Niveau : ${t.niveau}
   Définition existante : "${t.definitionFlash}"
   Exemple existant : "${t.exemple || 'aucun'}"
   Tags : ${(t.tags || []).join(', ') || 'aucun'}`).join('\n');

  return `Tu es un rédacteur pédagogique expert en IA, écrivant pour un glossaire français destiné à des francophones débutants à avancés (France, Québec, Afrique, Caraïbes).

Voici ${termes.length} termes à enrichir :
${listeTermes}

Génère UNIQUEMENT un tableau JSON (aucun texte hors JSON, aucun Markdown), avec exactement un objet par terme, dans le même ordre, chaque objet ayant ces clés :

[
  {
    "slug": "le slug exact fourni ci-dessus",
    "pourquoiImportant": "2 à 3 phrases expliquant pourquoi ce terme compte concrètement pour quelqu'un qui découvre l'IA — pas une redite de la définition.",
    "enPratique": "1 paragraphe (3-4 phrases) plus technique, orienté 'comment ça marche' ou 'comment s'en servir', pour un niveau intermédiaire/avancé.",
    "erreurFrequente": "1 à 2 phrases sur une confusion courante liée à ce terme, ou chaîne vide si non pertinent.",
    "faq": [
      { "question": "Une question fréquente et naturelle sur ce terme", "reponse": "Réponse claire en 2-3 phrases" },
      { "question": "Une deuxième question différente", "reponse": "Réponse claire en 2-3 phrases" }
    ]
  }
]

Ton : clair, concret, sans jargon inutile, en français neutre (pas de québécismes ni d'anglicismes évitables). Pas de formules creuses type "dans le monde d'aujourd'hui".`;
}

async function callGeminiBatch(termes, tentative = 1) {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildBatchPrompt(termes) }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.6, maxOutputTokens: 8192 },
    }),
  });

  if (!res.ok) {
    const bodyText = await res.text();
    let retryDelaySec = null;
    try {
      const parsed = JSON.parse(bodyText);
      const retryInfo = parsed?.error?.details?.find(d => d['@type']?.includes('RetryInfo'));
      if (retryInfo?.retryDelay) retryDelaySec = parseInt(retryInfo.retryDelay, 10);
    } catch { /* corps non-JSON, on ignore */ }

    if (res.status === 429) {
      // Quota journalier dépassé : retenter dans la même run ne sert à rien
      // au-delà de quelques secondes — si retryDelay dépasse ~60s, c'est le
      // plafond QUOTIDIEN qui est atteint, pas un simple throttle.
      if (retryDelaySec && retryDelaySec <= 60 && tentative <= MAX_RETRIES) {
        console.log(`      ⏳ 429, retry dans ${retryDelaySec}s (tentative ${tentative}/${MAX_RETRIES})...`);
        await sleep((retryDelaySec + 2) * 1000);
        return callGeminiBatch(termes, tentative + 1);
      }
      throw new Error(`QUOTA_EPUISE: quota journalier Gemini atteint — relancer le workflow demain.`);
    }

    if (res.status === 503 && tentative <= MAX_RETRIES) {
      const attente = 5 * tentative;
      console.log(`      ⏳ 503 (surcharge), retry dans ${attente}s (tentative ${tentative}/${MAX_RETRIES})...`);
      await sleep(attente * 1000);
      return callGeminiBatch(termes, tentative + 1);
    }

    throw new Error(`Gemini HTTP ${res.status} : ${bodyText.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Réponse Gemini vide ou inattendue : ' + JSON.stringify(data).slice(0, 300));

  try {
    return JSON.parse(text);
  } catch (parseErr) {
    if (tentative <= MAX_RETRIES) {
      console.log(`      ⏳ JSON tronqué/invalide, retry (tentative ${tentative}/${MAX_RETRIES})...`);
      await sleep(3000);
      return callGeminiBatch(termes, tentative + 1);
    }
    throw new Error(`JSON invalide après ${MAX_RETRIES} tentatives : ${parseErr.message}`);
  }
}

async function main() {
  console.log(`Mode : ${CONFIRM ? '✍️  ÉCRITURE RÉELLE' : '🔍 SIMULATION (ajoutez --confirm pour écrire)'}\n`);

  if (!GEMINI_API_KEY) {
    console.error('❌ Variable GEMINI_API_KEY manquante.');
    process.exit(1);
  }

  const snap = await db.collection('glossaire').get();
  const termes = snap.docs.map(d => d.data());
  console.log(`✓ ${termes.length} termes trouvés en Firestore`);

  const aTraiter = termes.filter(t => !t.pourquoiImportant);
  console.log(`✓ ${aTraiter.length} terme(s) sans contenu enrichi (à traiter), ${termes.length - aTraiter.length} déjà enrichi(s) (sautés)`);

  const batches = chunk(aTraiter, BATCH_SIZE);
  console.log(`✓ Regroupés en ${batches.length} requête(s) Gemini (${BATCH_SIZE} termes/requête)\n`);

  let succes = 0, echecs = 0;

  for (const [idx, batch] of batches.entries()) {
    console.log(`  Batch ${idx + 1}/${batches.length} : ${batch.map(t => t.slug).join(', ')}`);
    try {
      const resultats = await callGeminiBatch(batch);
      if (!Array.isArray(resultats)) throw new Error('Réponse Gemini non conforme (attendu un tableau)');

      for (const item of resultats) {
        const terme = batch.find(t => t.slug === item.slug);
        if (!terme) { console.log(`      ⚠️  slug "${item.slug}" ne correspond à aucun terme du batch, ignoré`); continue; }

        if (CONFIRM) {
          await db.collection('glossaire').doc(terme.slug).update({
            pourquoiImportant: item.pourquoiImportant || '',
            enPratique:        item.enPratique || '',
            erreurFrequente:   item.erreurFrequente || '',
            faq:               Array.isArray(item.faq) ? item.faq : [],
            updatedAt:         FieldValue.serverTimestamp(),
          });
          console.log(`      ✍️  ${terme.slug} écrit`);
        } else {
          console.log(`      👀 ${terme.slug} généré`);
        }
        succes++;
      }
    } catch (err) {
      console.log(`      ❌ ${err.message}`);
      echecs += batch.length;
      if (err.message.startsWith('QUOTA_EPUISE')) {
        console.log(`\n🛑 Quota journalier Gemini atteint — arrêt propre. ${succes} terme(s) déjà traité(s) dans cette run sont conservés.`);
        console.log(`   Relance le même workflow demain : les termes déjà enrichis seront sautés automatiquement (idempotent).`);
        break;
      }
    }
    await sleep(PAUSE_MS);
  }

  console.log(`\n✅ ${succes} terme(s) traité(s) avec succès, ${echecs} échec(s).`);
  if (!CONFIRM) console.log(`🔍 Relancez avec --confirm pour écrire réellement dans Firestore.`);
  console.log(`\n📌 Prochaine étape : relire chaque terme dans l'admin (tab 📖 Glossaire) avant de passer en status:'publie'.`);
}

main().catch(err => { console.error('❌ Erreur:', err); process.exit(1); });
