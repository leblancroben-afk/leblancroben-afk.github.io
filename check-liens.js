#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════
   check-liens.js — Vérification des liens outils (quarantaine 404)
   Source : Firestore collection "outils" (docs langue='fr' uniquement,
            l'URL n'est pas dupliquée sur EN/ES — c'est la même URL).
   Écrit  : champs `status` et `failed_checks` sur chaque doc.
   Usage  : node check-liens.js
   Cron   : GitHub Actions, tous les jours (voir .yml associé)

   ── Logique de quarantaine (pas de suppression brutale) ──
   - 200-3xx           → status='active',  failed_checks=0
   - échec (404/timeout/DNS) → failed_checks+1
       - failed_checks >= 3 → status='warning'  (masqué des mises en avant,
                                                   page reste visible)
       - failed_checks >= 7 → status='offline'  (archivé, alternatives à
                                                   afficher manuellement —
                                                   voir note en bas de script)
   Rien n'est jamais supprimé automatiquement. C'est à toi de décider,
   dans l'admin, quoi faire des outils 'offline' (garder pour le SEO avec
   bandeau "outil fermé", ou supprimer).
   ═══════════════════════════════════════════════════════ */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const TIMEOUT_MS = 10000;
const SEUIL_WARNING = 3;
const SEUIL_OFFLINE = 7;

async function verifierUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    // HEAD d'abord (plus léger) ; certains sites le refusent → on retente en GET.
    let res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal });
    if (res.status === 405 || res.status === 403) {
      res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
    }
    return { ok: res.status < 400, statusCode: res.status };
  } catch (err) {
    return { ok: false, statusCode: null, erreur: err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const snap = await db.collection('outils').where('langue', '==', 'fr').get();
  const outils = snap.docs.map(d => ({ ref: d.ref, id: d.id, ...d.data() }));

  console.log(`Vérification de ${outils.length} outils...`);

  let actifs = 0, warnings = 0, offline = 0, recuperes = 0;

  for (const outil of outils) {
    if (!outil.url) continue;

    const resultat = await verifierUrl(outil.url);
    const ancienStatus = outil.status || 'active';
    const updates = { updatedAt: FieldValue.serverTimestamp() };

    if (resultat.ok) {
      updates.status = 'active';
      updates.failed_checks = 0;
      if (ancienStatus !== 'active') recuperes++;
      actifs++;
    } else {
      const failed = (outil.failed_checks || 0) + 1;
      updates.failed_checks = failed;
      if (failed >= SEUIL_OFFLINE) {
        updates.status = 'offline';
        offline++;
      } else if (failed >= SEUIL_WARNING) {
        updates.status = 'warning';
        warnings++;
      } else {
        updates.status = ancienStatus === 'offline' || ancienStatus === 'warning' ? ancienStatus : 'active';
      }
      console.log(`  ⚠ ${outil.name} : échec (${resultat.statusCode || resultat.erreur}) — ${failed} vérif(s) en échec, status=${updates.status}`);
    }

    await outil.ref.update(updates);
    await new Promise(r => setTimeout(r, 200)); // pause pour rester correct
  }

  console.log(`\nTerminé — ${actifs} actifs, ${warnings} en warning, ${offline} offline, ${recuperes} récupérés ce run.`);
  if (offline > 0) {
    console.log(`⚠️  ${offline} outil(s) sont passés 'offline' — pense à vérifier dans l'admin et ajouter des alternatives si besoin.`);
  }
}

main().catch(err => {
  console.error('Erreur fatale :', err);
  process.exit(1);
});
