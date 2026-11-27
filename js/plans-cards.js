/**
 * ============================================================
 *  ALBEXIA — Cartes de formules (Gratuit / Starter / Featured)
 *  Fichier : js/plans-cards.js
 *  Version : 3.0 — FR/EN/ES, paiement unique par carte (Freda Pay)
 * ============================================================
 *
 *  Source unique de vérité : le doc Firestore config/plans, éditable
 *  depuis admin/index.html (onglet « Plans & Tarifs »). Les valeurs
 *  ci-dessous ne servent que de repli si Firestore est indisponible.
 *
 *  Le Worker de paiement lit le MÊME doc pour le montant facturé :
 *  le prix affiché ici et le prix facturé ne peuvent pas diverger.
 * ============================================================
 */

import { db, doc, getDoc } from './firebase-config.js';

// Interrupteur temporaire des souscriptions payantes.
// Pour rouvrir Starter et Featured : passer simplement à true.
// Les définitions, prix et données Firestore des plans restent inchangés.
export const PLANS_PAYANTS_OUVERTS = false;

const PLANS_DEFAUT = {
  standard: {
    features_fr: ['Fiche outil complète à vie', 'Soumise à validation'],
    features_en: ['Full tool listing for life', 'Subject to review'],
    features_es: ['Ficha completa de por vida', 'Sujeta a validación'],
  },
  starter: {
    prix: 39,
    features_fr: ['Fiche complète avec badge vérifié', 'Jusqu\'à 3 articles de blog liés à la fiche', 'Accès au tableau de suivi', 'Publiée sans mise en avant'],
    features_en: ['Full listing with verified badge', 'Up to 3 blog articles linked to the listing', 'Access to the tracking dashboard', 'Published without spotlight'],
    features_es: ['Ficha completa con insignia verificada', 'Hasta 3 artículos de blog vinculados a la ficha', 'Acceso al panel de seguimiento', 'Publicada sin destacado'],
  },
  featured: {
    prix: 59,
    badge_fr: 'Recommandé', badge_en: 'Recommended', badge_es: 'Recomendado',
    features_fr: ['Fiche complète avec badge vérifié', 'Mise en avant sur l\'accueil, section sponsors', 'Présente dans la newsletter', 'Jusqu\'à 5 articles de blog liés à la fiche', 'Accès au tableau de suivi'],
    features_en: ['Full listing with verified badge', 'Homepage spotlight, sponsors section', 'Featured in the newsletter', 'Up to 5 blog articles linked to the listing', 'Access to the tracking dashboard'],
    features_es: ['Ficha completa con insignia verificada', 'Destacado en la página de inicio, sección de patrocinadores', 'Presente en el boletín', 'Hasta 5 artículos de blog vinculados a la ficha', 'Acceso al panel de seguimiento'],
  },
};

// Textes fixes de l'interface (pas du contenu éditable par l'admin)
export const TEXTES_UI = {
  fr: {
    plansNote: 'Starter et Featured sont temporairement indisponibles. Les outils déjà publiés conservent leur mise en avant active.',
    unavailable: 'Temporairement indisponible',
    std: { desc: 'L\'essentiel pour être découvert', price: '0$', sub: 'à vie', cta: 'Choisir Gratuit' },
    starter: { desc: 'Pour une fiche qui se démarque', sub: 'paiement unique · 6 mois', cta: 'Choisir Starter' },
    featured: { desc: 'Visibilité et mise en avant', sub: 'paiement unique · 12 mois', cta: 'Choisir Featured' },
  },
  en: {
    plansNote: 'Starter and Featured are temporarily unavailable. Already published tools keep their active promotion.',
    unavailable: 'Temporarily unavailable',
    std: { desc: 'The essentials to get discovered', price: '0$', sub: 'for life', cta: 'Choose Free' },
    starter: { desc: 'For a listing that stands out', sub: 'one-time payment · 6 months', cta: 'Choose Starter' },
    featured: { desc: 'Visibility and spotlight', sub: 'one-time payment · 12 months', cta: 'Choose Featured' },
  },
  es: {
    plansNote: 'Starter y Featured no están disponibles temporalmente. Las herramientas ya publicadas conservan su promoción activa.',
    unavailable: 'Temporalmente no disponible',
    std: { desc: 'Lo esencial para ser descubierto', price: '0$', sub: 'de por vida', cta: 'Elegir Gratis' },
    starter: { desc: 'Para una ficha que destaca', sub: 'pago único · 6 meses', cta: 'Elegir Starter' },
    featured: { desc: 'Visibilidad y destacado', sub: 'pago único · 12 meses', cta: 'Elegir Featured' },
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
 * avec repli sur le FR si une langue n'est pas encore traduite.
 *
 * `onSelectFnName` est le nom d'une fonction globale définie par la page
 * hôte, appelée avec le tier ('gratuit'|'starter'|'featured') au clic.
 */
export function rendreCartesPlans(plans, onSelectFnName, langue = 'fr') {
  const l = ['fr', 'en', 'es'].includes(langue) ? langue : 'fr';
  const t = TEXTES_UI[l];
  const li = arr => arr.map(f => `<li>${echapperHtml(f)}</li>`).join('');
  const feat = obj => obj[`features_${l}`]?.length ? obj[`features_${l}`] : obj.features_fr;
  const badge = obj => obj[`badge_${l}`] || obj.badge_fr;

  const carteGratuite = `
    <div class="plan-card">
      <div class="plan-name">Gratuit</div>
      <div class="plan-desc">${t.std.desc}</div>
      <div class="plan-price free">${t.std.price}</div>
      <div class="plan-price-sub">${t.std.sub}</div>
      <ul class="plan-features">${li(feat(plans.standard))}</ul>
      <button type="button" class="btn-plan" onclick="${onSelectFnName}('gratuit')">${t.std.cta}</button>
    </div>`;

  const cartePayante = (tier, obj, textes, estFeatured = false) => {
    const classe = `plan-card${estFeatured ? ' featured' : ''}${!PLANS_PAYANTS_OUVERTS ? ' plan-card-closed' : ''}`;
    const bouton = PLANS_PAYANTS_OUVERTS
      ? `<button type="button" class="btn-plan" onclick="${onSelectFnName}('${tier}')">${textes.cta}</button>`
      : `<button type="button" class="btn-plan" disabled aria-disabled="true">${textes.cta}</button>`;
    return `<div class="${classe}"${!PLANS_PAYANTS_OUVERTS ? ' aria-label="' + echapperHtml(t.unavailable) + '"' : ''}>
      ${!PLANS_PAYANTS_OUVERTS ? `<span class="plan-unavailable-label">${echapperHtml(t.unavailable)}</span>` : ''}
      ${estFeatured ? `<div class="plan-badge">${echapperHtml(badge(obj))}</div>` : ''}
      <div class="plan-name">${estFeatured ? 'Featured' : 'Starter'}</div>
      <div class="plan-desc">${textes.desc}</div>
      <div class="plan-price">${obj.prix}$</div>
      <div class="plan-price-sub">${textes.sub}</div>
      <ul class="plan-features">${li(feat(obj))}</ul>
      ${bouton}
    </div>`;
  };

  return `
    <div class="plans-grid">
      ${carteGratuite}
      ${cartePayante('starter', plans.starter, t.starter)}
      ${cartePayante('featured', plans.featured, t.featured, true)}
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
