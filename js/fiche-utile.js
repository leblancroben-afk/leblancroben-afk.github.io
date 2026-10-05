/* ═══════════════════════════════════════
   Albexia — fiche-utile.js
   Vote rapide « Cet outil vous a été utile ? » sur la fiche d'un outil.
   Un vote = tool_votes/{toolSlug}_{uid} (js/reviews.js › voteTool).
   - Une personne qui a déjà un avis ne vote pas (son avis compte déjà).
   - Écrire un avis supprime son vote rapide (géré par submitReview).
   Indépendant de la note ⭐ et du « Utile ? » sous chaque avis.
   ═══════════════════════════════════════ */

import { auth, onAuthStateChanged } from '/js/firebase-config.js';
import { getToolSlugFromPath, getUserReview, getUserToolVote, voteTool } from '/js/reviews.js';

const foot = document.querySelector('.fo-foot');
if (foot) {
  const SLUG  = getToolSlugFromPath(window.location.pathname);
  const LANG  = (document.documentElement.lang || 'fr').slice(0, 2);
  const MSG = {
    fr: { login: 'Connectez-vous pour voter', hasReview: 'Votre avis compte déjà', error: 'Une erreur est survenue' },
    en: { login: 'Sign in to vote',          hasReview: 'Your review already counts', error: 'Something went wrong' },
    es: { login: 'Inicia sesión para votar', hasReview: 'Tu opinión ya cuenta',       error: 'Ha ocurrido un error' },
  }[LANG] || null;
  const M = MSG || { login: 'Connectez-vous pour voter', hasReview: 'Votre avis compte déjà', error: 'Une erreur est survenue' };

  const buttons = foot.querySelectorAll('[data-fo-vote]');
  const note    = foot.querySelector('[data-fo-thanks]');
  const toValue = (b) => (b.getAttribute('data-fo-vote') === 'up' ? 'yes' : 'no');

  let user = null;
  let hasReview = false;
  let current = null;

  function say(text) { if (note) { note.textContent = text; note.hidden = !text; } }

  function paint() {
    buttons.forEach(b => b.setAttribute('aria-pressed', String(toValue(b) === current)));
    // Un avis existant tient lieu de vote : on retire les boutons
    buttons.forEach(b => { b.hidden = hasReview; });
    if (hasReview) say(M.hasReview);
  }

  async function refresh() {
    hasReview = false;
    current = null;
    if (user) {
      try {
        const [rev, vote] = await Promise.all([
          getUserReview(user.uid, SLUG),
          getUserToolVote(user.uid, SLUG),
        ]);
        hasReview = !!rev;
        current = vote;
      } catch (e) { console.error('fiche-utile: lecture', e); }
    }
    paint();
    if (!hasReview) say('');
  }

  buttons.forEach(b => b.addEventListener('click', async () => {
    if (!user) { say(M.login); return; }
    if (hasReview) { paint(); return; }
    buttons.forEach(x => { x.disabled = true; });
    try {
      current = await voteTool(user.uid, SLUG, toValue(b));
      paint();
      // « Merci pour votre retour » : texte d'origine, conservé dans la fiche
      if (note) { note.textContent = note.getAttribute('data-thanks') || note.textContent; note.hidden = current === null; }
    } catch (e) {
      if (e && e.code === 'has-review') { hasReview = true; paint(); }
      else { console.error('fiche-utile: vote', e); say(M.error); }
    } finally {
      buttons.forEach(x => { x.disabled = false; });
    }
  }));

  // Texte « Merci » d'origine (fiche générée) mémorisé avant toute réécriture
  if (note) note.setAttribute('data-thanks', note.textContent);

  onAuthStateChanged(auth, (u) => { user = u; refresh(); });
  window.addEventListener('albexia:review-changed', refresh);
}
