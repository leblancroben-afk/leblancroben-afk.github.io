/**
 * ============================================================
 *  ALBEXIA — Cartes de formules (Standard / Starter / Featured)
 *  Fichier : js/plans-cards.js
 *  Version : 2.0 — FR/EN/ES
 * ============================================================
 *
 *  Source unique de vérité : le doc Firestore config/plans, éditable
 *  depuis admin-index.html (onglet "💳 Plans & Tarifs"), avec un
 *  bouton "🌐 Traduire depuis le FR" identique à celui des fiches
 *  outils (LibreTranslate auto-hébergé). Utilisé par soumettre.html
 *  et profil.html pour ne jamais avoir de prix/textes codés en dur.
 *
 *  Le Worker de paiement (worker-paiement-soumissions.js) lit le
 *  MÊME doc pour le montant réellement facturé — donc le prix
 *  affiché ici et le prix facturé ne peuvent jamais diverger.
 * ============================================================
 */

import { db, doc, getDoc } from './firebase-config.js';

const PLANS_DEFAUT = {
  standard: {
    features_fr: ['Fiche basique', 'Position standard dans la catégorie'],
    features_en: ['Basic listing', 'Standard position in category'],
    features_es: ['Ficha básica', 'Posición estándar en la categoría'],
  },
  starter: {
    prix: 9,
    features_fr: ['Fiche complète (description longue, captures, vidéo)', 'Badge Partenaire Albexia', 'Position prioritaire dans la catégorie'],
    features_en: ['Full listing (long description, screenshots, video)', 'Albexia Partner badge', 'Priority position in category'],
    features_es: ['Ficha completa (descripción larga, capturas, vídeo)', 'Insignia de Socio Albexia', 'Posición prioritaria en la categoría'],
  },
  featured: {
    prix: 9,
    badge_fr: 'Recommandé', badge_en: 'Recommended', badge_es: 'Recomendado',
    features_fr: ['Tout Starter, plus :', 'Mise en avant éditoriale', 'Mention newsletter & réseaux sociaux', 'Article de blog dédié (si pertinent)', 'Notification en vedette sur le site'],
    features_en: ['Everything in Starter, plus:', 'Editorial spotlight', 'Newsletter & social media mention', 'Dedicated blog post (if relevant)', 'Featured site notification'],
    features_es: ['Todo lo de Starter, más:', 'Destaque editorial', 'Mención en boletín y redes sociales', 'Artículo de blog dedicado (según relevancia)', 'Notificación destacada en el sitio'],
  },
};

// Textes fixes de l'interface (pas du contenu éditable par l'admin) — un
// petit i18n local, comme le reste du chrome du site.
const TEXTES_UI = {
  fr: {
    plansNote: 'Starter et Featured : paiement en crypto (USDT), lien envoyé après validation de votre soumission.',
    std: { desc: "L'essentiel pour être découvert", price: 'Gratuit', sub: 'toujours', cta: 'Choisir Standard' },
    starter: { desc: 'Pour une fiche qui se démarque', sub: 'paiement unique', cta: 'Choisir Starter' },
    featured: { desc: 'Visibilité continue et mise en avant', sub: '/ mois', cta: 'Choisir Featured' },
  },
  en: {
    plansNote: 'Starter and Featured: crypto payment (USDT), link sent after your submission is approved.',
    std: { desc: 'The essentials to get discovered', price: 'Free', sub: 'always', cta: 'Choose Standard' },
    starter: { desc: 'For a listing that stands out', sub: 'one-time payment', cta: 'Choose Starter' },
    featured: { desc: 'Ongoing visibility and spotlight', sub: '/ month', cta: 'Choose Featured' },
  },
  es: {
    plansNote: 'Starter y Featured: pago en cripto (USDT), enlace enviado tras la validación de tu envío.',
    std: { desc: 'Lo esencial para ser descubierto', price: 'Gratis', sub: 'siempre', cta: 'Elegir Estándar' },
    starter: { desc: 'Para una ficha que destaca', sub: 'pago único', cta: 'Elegir Starter' },
    featured: { desc: 'Visibilidad continua y destaque', sub: '/ mes', cta: 'Elegir Featured' },
  },
};

/** Récupère les plans depuis Firestore, avec repli sur les valeurs par défaut. */
export async function chargerPlans() {
  try {
    const snap = await getDoc(doc(db, 'config', 'plans'));
    if (!snap.exists()) return PLANS_DEFAUT;
    const data = snap.data();
    const pick = (obj, cle, defaut) => (obj?.[cle]?.length ? obj[cle] : defaut);
    return {
      standard: {
        features_fr: pick(data.standard, 'features_fr', PLANS_DEFAUT.standard.features_fr),
        features_en: pick(data.standard, 'features_en', PLANS_DEFAUT.standard.features_en),
        features_es: pick(data.standard, 'features_es', PLANS_DEFAUT.standard.features_es),
      },
      starter: {
        prix: typeof data.starter?.prix === 'number' ? data.starter.prix : PLANS_DEFAUT.starter.prix,
        features_fr: pick(data.starter, 'features_fr', PLANS_DEFAUT.starter.features_fr),
        features_en: pick(data.starter, 'features_en', PLANS_DEFAUT.starter.features_en),
        features_es: pick(data.starter, 'features_es', PLANS_DEFAUT.starter.features_es),
      },
      featured: {
        prix: typeof data.featured?.prix === 'number' ? data.featured.prix : PLANS_DEFAUT.featured.prix,
        badge_fr: data.featured?.badge_fr || PLANS_DEFAUT.featured.badge_fr,
        badge_en: data.featured?.badge_en || PLANS_DEFAUT.featured.badge_en,
        badge_es: data.featured?.badge_es || PLANS_DEFAUT.featured.badge_es,
        features_fr: pick(data.featured, 'features_fr', PLANS_DEFAUT.featured.features_fr),
        features_en: pick(data.featured, 'features_en', PLANS_DEFAUT.featured.features_en),
        features_es: pick(data.featured, 'features_es', PLANS_DEFAUT.featured.features_es),
      },
    };
  } catch (err) {
    console.error('[plans-cards] Erreur de chargement config/plans, repli sur les valeurs par défaut :', err);
    return PLANS_DEFAUT;
  }
}

function echapperHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

/**
 * Génère le HTML des 3 cartes dans la langue demandée ('fr'|'en'|'es'),
 * avec repli automatique sur le FR si une langue n'a jamais été traduite
 * par l'admin (features_en vide, par ex.).
 *
 * `onSelectFnName` est le nom (chaîne) d'une fonction globale déjà
 * définie par la page hôte, appelée avec le tier ('gratuit'|'starter'
 * |'featured') au clic sur le bouton.
 */
export function rendreCartesPlans(plans, onSelectFnName, langue = 'fr') {
  const l = ['fr', 'en', 'es'].includes(langue) ? langue : 'fr';
  const t = TEXTES_UI[l];
  const li = arr => arr.map(f => `<li>${echapperHtml(f)}</li>`).join('');
  const feat = obj => obj[`features_${l}`]?.length ? obj[`features_${l}`] : obj.features_fr;
  const badge = obj => obj[`badge_${l}`] || obj.badge_fr;

  return `
    <div class="plans-grid">
      <div class="plan-card">
        <div class="plan-name">Standard</div>
        <div class="plan-desc">${t.std.desc}</div>
        <div class="plan-price free">${t.std.price}</div>
        <div class="plan-price-sub">${t.std.sub}</div>
        <ul class="plan-features">${li(feat(plans.standard))}</ul>
        <button type="button" class="btn-plan" onclick="${onSelectFnName}('gratuit')">${t.std.cta}</button>
      </div>

      <div class="plan-card">
        <div class="plan-name">Starter</div>
        <div class="plan-desc">${t.starter.desc}</div>
        <div class="plan-price">${plans.starter.prix}$</div>
        <div class="plan-price-sub">${t.starter.sub}</div>
        <ul class="plan-features">${li(feat(plans.starter))}</ul>
        <button type="button" class="btn-plan" onclick="${onSelectFnName}('starter')">${t.starter.cta}</button>
      </div>

      <div class="plan-card featured">
        <div class="plan-badge">${echapperHtml(badge(plans.featured))}</div>
        <div class="plan-name">Featured</div>
        <div class="plan-desc">${t.featured.desc}</div>
        <div class="plan-price">${plans.featured.prix}$</div>
        <div class="plan-price-sub">${t.featured.sub}</div>
        <ul class="plan-features">${li(feat(plans.featured))}</ul>
        <button type="button" class="btn-plan" onclick="${onSelectFnName}('featured')">${t.featured.cta}</button>
      </div>
    </div>
    <p class="plans-note">${t.plansNote}</p>
  `;
}

/** Combine les deux : charge depuis Firestore puis injecte dans le conteneur donné. */
export async function afficherCartesPlans(containerId, onSelectFnName, langue = 'fr') {
  const container = document.getElementById(containerId);
  if (!container) return;
  const plans = await chargerPlans();
  container.innerHTML = rendreCartesPlans(plans, onSelectFnName, langue);
}
