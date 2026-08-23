/**
 * ============================================================
 *  ALBEXIA — Vérification d'expiration des notifications
 *  Fichier : scripts/verifier-expiration-notifications.js
 *  Version : 1.0
 * ============================================================
 *
 *  RÔLE :
 *  Parcourt data/notifications.json et désactive (active:false)
 *  toute notification dont le champ "expire_le" est dépassé.
 *  Pensé pour les notifications "tier: featured" (slot payant),
 *  mais fonctionne pour n'importe quelle entrée ayant ce champ.
 *
 *  DÉCLENCHEMENT :
 *  GitHub Actions, tous les jours à minuit (voir workflow associé
 *  .github/workflows/verifier-expiration-notifications.yml).
 *
 *  COMPORTEMENT :
 *  - N'écrit le fichier QUE si au moins une notif a été désactivée
 *    (évite les commits vides).
 *  - Les entrées sans "expire_le" ne sont jamais touchées.
 *  - Log clair dans la console pour suivi dans l'onglet Actions.
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

const CHEMIN_JSON = path.join(__dirname, '..', 'data', 'notifications.json');

function verifierExpirations() {
  if (!fs.existsSync(CHEMIN_JSON)) {
    console.error(`[verif-expiration] Fichier introuvable : ${CHEMIN_JSON}`);
    process.exit(1);
  }

  const brut = fs.readFileSync(CHEMIN_JSON, 'utf8');
  let notifications;
  try {
    notifications = JSON.parse(brut);
  } catch (err) {
    console.error('[verif-expiration] JSON invalide :', err.message);
    process.exit(1);
  }

  const aujourdHui = new Date();
  aujourdHui.setHours(0, 0, 0, 0); // comparaison par jour, pas par heure

  let nbDesactivees = 0;
  const rapport = [];

  notifications.forEach(notif => {
    if (!notif.expire_le) return; // pas de date = jamais touché
    if (notif.active === false) return; // déjà désactivée

    const dateExpiration = new Date(notif.expire_le);
    if (isNaN(dateExpiration.getTime())) {
      console.warn(`[verif-expiration] Date invalide sur ${notif.id} : "${notif.expire_le}" — ignorée`);
      return;
    }

    if (dateExpiration < aujourdHui) {
      notif.active = false;
      nbDesactivees++;
      rapport.push(`  - ${notif.id} (expirait le ${notif.expire_le})${notif.tool ? ' — ' + notif.tool.nom : ''}`);
    }
  });

  if (nbDesactivees === 0) {
    console.log('[verif-expiration] Aucune notification expirée. Rien à faire.');
    return;
  }

  fs.writeFileSync(CHEMIN_JSON, JSON.stringify(notifications, null, 2) + '\n', 'utf8');

  console.log(`[verif-expiration] ${nbDesactivees} notification(s) désactivée(s) :`);
  console.log(rapport.join('\n'));

  // Signal pour le workflow GitHub Actions : indique qu'il faut committer
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `changements=true\n`);
  }
}

verifierExpirations();
