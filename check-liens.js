#!/usr/bin/env node

/* ═══════════════════════════════════════════════════════
check-liens.js — Vérification des liens outils (version corrigée)

Source : Firestore collection "outils" (docs langue='fr' uniquement)
Écrit : status, failed_checks, last_http_code, last_failed_date

Règles :
- 2xx/3xx                      → ok, status='active', compteur remis à 0
- 401, 403, 429, 5xx, bot-block → incertain, aucun compteur modifié
- 404, 410, 400, timeout, DNS   → échec, compté UNE fois par jour
- failed_checks >= 3 → 'warning'
- failed_checks >= 7 → 'offline'
Rien n'est jamais supprimé automatiquement.
═══════════════════════════════════════════════════════ */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const TIMEOUT_MS = 15000;
const SEUIL_WARNING = 3;
const SEUIL_OFFLINE = 7;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function verifierUrl(url) {
  for (let tentative = 1; tentative <= 2; tentative++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
          'Accept-Language': 'fr,en;q=0.8'
        }
      });
      try { await res.body?.cancel(); } catch (_) {}
      return { code: res.status };
    } catch (err) {
      if (tentative === 2) {
        return { code: null, erreur: err.name === 'AbortError' ? 'timeout' : err.message };
      }
      await new Promise(r => setTimeout(r, 3000));
    } finally {
      clearTimeout(timer);
    }
  }
}

function classer(code) {
  if (code !== null && code < 400) return 'ok';
  if (code === 401 || code === 403 || code === 429 || (code !== null && code >= 500)) return 'incertain';
  return 'echec';
}

async function main() {
  const snap = await db.collection('outils').where('langue', '==', 'fr').get();
  const outils = snap.docs.map(d => ({ ref: d.ref, id: d.id, ...d.data() }));
  const aujourdhui = new Date().toISOString().slice(0, 10);

  console.log(`Vérification de ${outils.length} outils...`);
  let actifs = 0, warnings = 0, offline = 0, incertains = 0, recuperes = 0;

  for (const outil of outils) {
    if (!outil.url) continue;

    const resultat = await verifierUrl(outil.url);
    const verdict = classer(resultat.code);
    const ancienStatus = outil.status || 'active';
    const updates = {
      updatedAt: FieldValue.serverTimestamp(),
      last_http_code: resultat.code ?? null
    };

    if (verdict === 'ok') {
      updates.status = 'active';
      updates.failed_checks = 0;
      if (ancienStatus !== 'active') recuperes++;
      actifs++;
    } else if (verdict === 'incertain') {
      // Blocage probable (bot, rate limit) : on ne touche à aucun compteur.
      // Si la fiche était masquée à cause d'anciens faux positifs, on la rétablit.
      updates.status = 'active';
      updates.failed_checks = 0;
      if (ancienStatus !== 'active') recuperes++;
      incertains++;
      console.log(`  ? ${outil.name} : réponse ${resultat.code} (incertain, non compté)`);
    } else {
      // Échec réel : compté une seule fois par jour.
      if (outil.last_failed_date === aujourdhui) {
        updates.status = ancienStatus;
        updates.failed_checks = outil.failed_checks || 0;
      } else {
        const failed = (outil.failed_checks || 0) + 1;
        updates.failed_checks = failed;
        updates.last_failed_date = aujourdhui;
        if (failed >= SEUIL_OFFLINE) { updates.status = 'offline'; offline++; }
        else if (failed >= SEUIL_WARNING) { updates.status = 'warning'; warnings++; }
        else { updates.status = 'active'; }
        console.log(`  ⚠ ${outil.name} : échec (${resultat.code ?? resultat.erreur}) — ${failed} jour(s), status=${updates.status}`);
      }
    }

    await outil.ref.update(updates);
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\nTerminé — ${actifs} actifs, ${incertains} incertains, ${warnings} warning, ${offline} offline, ${recuperes} récupérés.`);
  if (offline > 0) {
    console.log(`⚠️ ${offline} outil(s) offline — vérifiez-les dans l'admin.`);
  }
}

main().catch(err => {
  console.error('Erreur fatale :', err);
  process.exit(1);
});
