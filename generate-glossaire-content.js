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

// Pause entre appels Gemini — évite le rate-limiting sur ~40 termes
// traités séquentiellement (plus simple et plus sûr qu'un vrai batch
// parallèle pour un run occasionnel via workflow_dispatch).
const PAUSE_MS = 1200;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function buildPrompt(terme) {
  return `Tu es un rédacteur pédagogique expert en IA, écrivant pour un glossaire français destiné à des francophones débutants à avancés (France, Québec, Afrique, Caraïbes).

Terme : "${terme.terme}"
Niveau : ${terme.niveau}
Définition existante : "${terme.definitionFlash}"
Exemple existant : "${terme.exemple || 'aucun'}"
Tags : ${(terme.tags || []).join(', ') || 'aucun'}

Génère UNIQUEMENT un objet JSON avec exactement ces clés (aucun texte hors JSON, aucun Markdown) :

{
  "pourquoiImportant": "2 à 3 phrases expliquant pourquoi ce terme compte concrètement pour quelqu'un qui découvre l'IA — pas une redite de la définition.",
  "enPratique": "1 paragraphe (3-4 phrases) plus technique, orienté 'comment ça marche' ou 'comment s'en servir', pour un niveau intermédiaire/avancé.",
  "erreurFrequente": "1 à 2 phrases sur une confusion courante liée à ce terme (ex: terme proche qu'on confond souvent), ou chaîne vide si non pertinent.",
  "faq": [
    { "question": "Une question fréquente et naturelle sur ce terme", "reponse": "Réponse claire en 2-3 phrases" },
    { "question": "Une deuxième question différente", "reponse": "Réponse claire en 2-3 phrases" }
  ]
}

Ton : clair, concret, sans jargon inutile, en français neutre (pas de québécismes ni d'anglicismes évitables). Pas de formules creuses type "dans le monde d'aujourd'hui".`;
}

async function callGemini(terme) {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(terme) }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.6 },
    }),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status} : ${await res.text()}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Réponse Gemini vide ou inattendue : ' + JSON.stringify(data).slice(0, 300));
  return JSON.parse(text);
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
  console.log(`✓ ${aTraiter.length} terme(s) sans contenu enrichi (à traiter), ${termes.length - aTraiter.length} déjà enrichi(s) (sautés)\n`);

  let succes = 0, echecs = 0;

  for (const terme of aTraiter) {
    process.stdout.write(`  → ${terme.slug}... `);
    try {
      const contenu = await callGemini(terme);

      if (CONFIRM) {
        await db.collection('glossaire').doc(terme.slug).update({
          pourquoiImportant: contenu.pourquoiImportant || '',
          enPratique:        contenu.enPratique || '',
          erreurFrequente:   contenu.erreurFrequente || '',
          faq:               Array.isArray(contenu.faq) ? contenu.faq : [],
          updatedAt:         FieldValue.serverTimestamp(),
        });
        console.log('✍️  écrit');
      } else {
        console.log('👀 généré (aperçu ci-dessous)');
        console.log(JSON.stringify(contenu, null, 2).split('\n').map(l => '      ' + l).join('\n'));
      }
      succes++;
    } catch (err) {
      console.log(`❌ ${err.message}`);
      echecs++;
    }
    await sleep(PAUSE_MS);
  }

  console.log(`\n✅ ${succes} terme(s) traité(s) avec succès, ${echecs} échec(s).`);
  if (!CONFIRM) console.log(`🔍 Relancez avec --confirm pour écrire réellement dans Firestore.`);
  console.log(`\n📌 Prochaine étape : relire chaque terme dans l'admin (tab 📖 Glossaire) avant de passer en status:'publie'.`);
}

main().catch(err => { console.error('❌ Erreur:', err); process.exit(1); });
