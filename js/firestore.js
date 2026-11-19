/* ═══════════════════════════════════════
   Albexia — firestore.js
   Collections, historique quiz, profil
   ═══════════════════════════════════════ */

import {
  db, doc, setDoc, getDoc, updateDoc,
  collection, addDoc, getDocs, deleteDoc, query, orderBy,
  where, serverTimestamp, increment, arrayUnion, arrayRemove,
  runTransaction, Timestamp, writeBatch,
  collectionGroup, onSnapshot
} from './firebase-config.js';
// ⚠️ Si firebase-config.js ne réexporte pas encore collectionGroup et
// onSnapshot depuis le SDK Firestore, il faut les y ajouter — sinon cet
// import échoue silencieusement (undefined) plutôt que de lever une
// erreur claire.

// ─── SLUG / URL FICHE ────────────────────
// Copie exacte de slugify()/buildToolPageUrl() dans app.js. Le champ
// "page" stocké en Firestore peut être obsolète (commentaire d'origine
// dans app.js) — le site reconstruit donc toujours l'URL à partir de
// name/plan/langue plutôt que de lire "page". Les notifications doivent
// suivre la même règle, sous peine de lien mort (cas Writesonic).
function slugify(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function buildToolPageUrl(t) {
  if (t.generer_fiche === false) return null; // pas de fiche générée pour cet outil
  const slug = slugify(t.name);
  if (!slug) return null;
  const folder = t.plan === 'featured' ? 'featured' : t.plan === 'starter' ? 'starter' : 'standard';
  const langue = t.langue || 'fr';
  return `/tools/${folder}/${langue}/${slug}/`;
}

// ══════════════════════════════════════
// COLLECTIONS D'OUTILS
// ══════════════════════════════════════

export async function getCollections(uid) {
  const ref  = collection(db, 'users', uid, 'collections');
  const snap = await getDocs(query(ref, orderBy('createdAt', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Liste des outils publiés — lecture directe de la collection "outils",
// utilisée par la recherche de revendication dans profil.html. Même
// source que l'accueil (index.html/app.js), filtrée par langue pour
// éviter les doublons fr/en/ht (un outil = plusieurs documents, un par
// langue, comme sur l'accueil).
export async function getOutilsPublics(langue) {
  const snap = await getDocs(collection(db, 'outils'));
  const tous = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return tous.filter(o => !o.langue || o.langue === (langue || 'fr'));
}

export async function createCollection(uid, name) {
  const ref = collection(db, 'users', uid, 'collections');
  const doc = await addDoc(ref, {
    name,
    tools:     [],
    createdAt: new Date().toISOString(),
  });
  return doc.id;
}

export async function renameCollection(uid, colId, newName) {
  const ref = doc(db, 'users', uid, 'collections', colId);
  await updateDoc(ref, { name: newName });
}

export async function deleteCollection(uid, colId) {
  const ref = doc(db, 'users', uid, 'collections', colId);
  await deleteDoc(ref);
}

export async function addToolToCollection(uid, colId, tool) {
  const ref  = doc(db, 'users', uid, 'collections', colId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const tools = snap.data().tools || [];
  const alreadyIn = tools.some(t => String(t.id) === String(tool.id));
  if (alreadyIn) return;

  tools.push({
    id:       tool.id,
    name:     tool.name,
    emoji:    tool.emoji    || '🤖',
    favicon:  tool.favicon  || '',
    category: tool.category || '',
    price:    tool.price    || 'free',
    url:      tool.url      || '',
    page:     tool.page     || '',
    addedAt:  new Date().toISOString(),
  });
  await updateDoc(ref, { tools });

  // Index inverse sur la fiche outil (outils/{id}.saved_by) — c'est ce qui
  // permet à notifyToolChange() de savoir, sans Cloud Function, quels
  // utilisateurs ont cet outil en collection et doivent recevoir une
  // notification "collection_update" quand l'admin le modifie.
  try {
    await updateDoc(doc(db, 'outils', String(tool.id)), { saved_by: arrayUnion(uid) });
  } catch (_) { /* la fiche peut ne pas exister (données de test) — pas bloquant */ }
}

export async function removeToolFromCollection(uid, colId, toolId) {
  const ref  = doc(db, 'users', uid, 'collections', colId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const tools = (snap.data().tools || []).filter(t => String(t.id) !== String(toolId));
  await updateDoc(ref, { tools });

  // Ne retire l'utilisateur de l'index inverse que s'il n'a plus AUCUNE
  // collection contenant cet outil (il peut l'avoir sauvegardé ailleurs).
  try {
    const autres = await getDocs(collection(db, 'users', uid, 'collections'));
    const encoreLa = autres.docs.some(d => d.id !== colId && (d.data().tools || []).some(t => String(t.id) === String(toolId)));
    if (!encoreLa) await updateDoc(doc(db, 'outils', String(toolId)), { saved_by: arrayRemove(uid) });
  } catch (_) { /* pas bloquant */ }
}

// ══════════════════════════════════════
// HISTORIQUE QUIZ
// ══════════════════════════════════════

export async function saveQuizSession(uid, answers, results) {
  const ref = collection(db, 'users', uid, 'quizHistory');
  await addDoc(ref, {
    answers,
    results: results.map(t => ({
      id:       t.id,
      name:     t.name,
      emoji:    t.emoji    || '🤖',
      favicon:  t.favicon  || '',
      category: t.category || '',
      price:    t.price    || 'free',
      url:      t.url      || '',
      page:     t.page     || '',
    })),
    createdAt: new Date().toISOString(),
  });
}

export async function getQuizHistory(uid) {
  const ref  = collection(db, 'users', uid, 'quizHistory');
  const snap = await getDocs(query(ref, orderBy('createdAt', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function deleteQuizSession(uid, sessionId) {
  const ref = doc(db, 'users', uid, 'quizHistory', sessionId);
  await deleteDoc(ref);
}

// ══════════════════════════════════════
// PROFIL UTILISATEUR
// ══════════════════════════════════════

export async function getUserProfile(uid) {
  const ref  = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function updateDisplayName(uid, displayName) {
  const ref = doc(db, 'users', uid);
  await updateDoc(ref, { displayName });
}

export async function updateLangue(uid, langue) {
  const ref = doc(db, 'users', uid);
  await updateDoc(ref, { langue });
}

export async function updateNewsletter(uid, newsletterOk) {
  const ref = doc(db, 'users', uid);
  await updateDoc(ref, { newsletterOk });
}

export async function updatePhotoURL(uid, photoURL) {
  const ref = doc(db, 'users', uid);
  await updateDoc(ref, { photoURL });
}

export async function updateSkipExitModal(uid, value) {
  const ref = doc(db, 'users', uid);
  await updateDoc(ref, { skipExitModal: value });
}

// ── NOUVEAU : Champs profil public ────────────────
// Sauvegarde bio, role/titre, liens sociaux en une seule opération

export async function updatePublicProfile(uid, { bio, role, linkedin, twitter, website }) {
  const ref = doc(db, 'users', uid);
  const payload = {};
  if (bio      !== undefined) payload.bio      = bio;
  if (role     !== undefined) payload.role     = role;
  if (linkedin !== undefined) payload.linkedin = linkedin;
  if (twitter  !== undefined) payload.twitter  = twitter;
  if (website  !== undefined) payload.website  = website;
  await updateDoc(ref, payload);
}

// ══════════════════════════════════════
// PROFIL PUBLIC
// ══════════════════════════════════════

export async function setCollectionPublic(uid, colId, isPublic) {
  const ref = doc(db, 'users', uid, 'collections', colId);
  await updateDoc(ref, { isPublic });
}

export async function getPublicProfile(uid) {
  const ref  = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data();
  // Champs exposés publiquement
  return {
    displayName: data.displayName || 'Utilisateur Albexia',
    photoURL:    data.photoURL    || null,
    bio:         data.bio         || null,
    role:        data.role        || null,
    linkedin:    data.linkedin    || null,
    twitter:     data.twitter     || null,
    website:     data.website     || null,
    isPionnier:  data.isPionnier  || false,
    isVerified:  data.isVerified  || false,
    reviewCount: data.reviewCount || 0,
  };
}

export async function getPublicCollections(uid) {
  const ref  = collection(db, 'users', uid, 'collections');
  const snap = await getDocs(query(ref, orderBy('createdAt', 'desc')));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(c => c.isPublic === true);
}

// ══════════════════════════════════════
// VIDÉOS SAUVEGARDÉES
// ══════════════════════════════════════

export async function saveVideo(uid, videoData) {
  const ref = doc(db, 'users', uid, 'savedVideos', videoData.videoId);
  await setDoc(ref, {
    videoId:   videoData.videoId,
    outilId:   videoData.outilId   || '',
    titre:     videoData.titre     || '',
    canal:     videoData.canal     || '',
    duree:     videoData.duree     || '',
    youtubeId: videoData.youtubeId || '',
    savedAt:   new Date().toISOString(),
  });
}

export async function unsaveVideo(uid, videoId) {
  const ref = doc(db, 'users', uid, 'savedVideos', videoId);
  await deleteDoc(ref);
}

export async function getSavedVideos(uid) {
  const ref  = collection(db, 'users', uid, 'savedVideos');
  const snap = await getDocs(query(ref, orderBy('savedAt', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ══════════════════════════════════════
// SOUMISSIONS D'OUTILS (depuis le profil connecté)
// ══════════════════════════════════════
// Écrit dans la même collection top-level "soumissions" que soumettre.html,
// avec un champ uid en plus pour permettre le filtrage par utilisateur.
// Les soumissions faites via soumettre.html (visiteur non connecté) n'ont
// pas de champ uid et n'apparaîtront donc pas ici (comportement voulu,
// pas de rattachement rétroactif par email pour l'instant).

export async function createSoumission(uid, data) {
  const ref = collection(db, 'soumissions');
  const doc = await addDoc(ref, {
    uid,
    nom_outil:     data.nom_outil     || '',
    url_outil:     data.url_outil     || '',
    categorie:     data.categorie     || '',
    modele_prix:   data.modele_prix   || '',
    tier_demande:  data.tier_demande  || 'gratuit',
    description:   data.description   || '',
    extras:        data.extras        || '',
    status: 'pending',
    created_at: serverTimestamp(),
  });
  return doc.id;
}

export async function getUserSoumissions(uid) {
  const ref  = collection(db, 'soumissions');
  const snap = await getDocs(query(ref, where('uid', '==', uid), orderBy('created_at', 'desc')));
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Pour les soumissions approuvées, résout l'URL réelle de la fiche
  // via le champ "page" du document outils correspondant (outil_id).
  await Promise.all(items.map(async (s) => {
    if (s.status === 'approved' && s.outil_id) {
      try {
        const outilSnap = await getDoc(doc(db, 'outils', String(s.outil_id)));
        if (outilSnap.exists()) s.fiche_page = outilSnap.data().page || null;
      } catch (_) { /* ignore, le lien restera masqué */ }
    }
  }));

  return items;
}

// ══════════════════════════════════════
// REVENDICATION D'OUTIL
// ══════════════════════════════════════
// Le statut est TOUJOURS forcé à 'en_attente' ici — jamais 'validee' —
// conformément aux security rules qui bloquent toute auto-validation
// (seul un admin peut écrire revendication.statut = 'validee'/'refusee').

export async function submitRevendication(soumissionId, { role, email_pro, preuve_url }) {
  const ref = doc(db, 'soumissions', soumissionId);
  await updateDoc(ref, {
    revendication: {
      statut: 'en_attente',
      role,
      email_pro,
      preuve_url,
      date_demande: serverTimestamp(),
      date_traitement: null,
      motif_refus: null
    }
  });
}

export async function cancelRevendication(soumissionId) {
  const ref = doc(db, 'soumissions', soumissionId);
  await updateDoc(ref, {
    revendication: {
      statut: 'aucune',
      role: null,
      email_pro: null,
      preuve_url: null,
      date_demande: null,
      date_traitement: null,
      motif_refus: null
    }
  });
}

// ══════════════════════════════════════
// REVENDICATIONS D'OUTILS — collection "claims" indépendante
// ══════════════════════════════════════
// Remplace l'ancien système où la revendication vivait comme sous-objet
// sur le document "soumissions" (une seule revendication possible par
// soumission → structurellement impossible que deux personnes différentes
// réclament le même outil en parallèle). "claims" est désormais la SEULE
// source de vérité pour le statut créateur d'un outil.
//
// Choix de confidentialité important : cette collection n'est JAMAIS
// lisible publiquement, même pour connaître juste le statut — elle
// contient des preuves personnelles (email professionnel, URL de preuve).
// Pour savoir publiquement "cet outil a-t-il un créateur vérifié", on lit
// un champ minimal dénormalisé sur le document "outils" lui-même
// (verified_creator_uid), déjà public en lecture — jamais la collection
// claims. approuverClaim()/revoquerClaim() maintiennent ce champ à jour.
//
// Invariant "au plus un créateur vérifié actif par outil" : appliqué au
// niveau applicatif (approuverClaim() vérifie et refuse si un autre
// créateur est déjà actif) plutôt que dans les security rules — parce que
// seul un admin peut de toute façon écrire ces statuts (isAdmin() dans les
// règles), et les règles servent à se défendre contre un client
// adversaire, pas contre une erreur d'un admin de confiance.

export async function createClaim(uid, { outil_id, outil_slug, outil_nom, role, email_pro, preuve_url }) {
  const ref = collection(db, 'claims');
  const docRef = await addDoc(ref, {
    uid,
    outil_id,
    outil_slug,
    outil_nom,
    status: 'pending',
    submittedAt: serverTimestamp(),
    verification: { role, email_pro, preuve_url }
  });
  return docRef.id;
}

export async function getUserClaims(uid) {
  const ref = collection(db, 'claims');
  const snap = await getDocs(query(ref, where('uid', '==', uid)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Annulation par l'auteur — uniquement tant que la demande est encore
// "pending" (voir security rules : même contrainte imposée côté serveur).
export async function annulerClaim(claimId) {
  await deleteDoc(doc(db, 'claims', claimId));
}

// Créateur vérifié actif pour un outil (au plus un), ou null — lecture
// publique via le champ dénormalisé, jamais via "claims".
export async function getCreateurVerifie(outilId) {
  const snap = await getDoc(doc(db, 'outils', outilId));
  return snap.exists() ? (snap.data().verified_creator_uid || null) : null;
}

// ── Admin ──

export async function getClaimsEnAttente() {
  const ref = collection(db, 'claims');
  const snap = await getDocs(query(ref, where('status', 'in', ['pending', 'additional_verification'])));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Tous les claims pour un même outil — permet à l'admin de comparer
// plusieurs demandeurs concurrents (voir point 6 de la spec : "Nouvelle
// revendication d'un outil déjà attribué").
export async function getClaimsPourOutil(outilId) {
  const ref = collection(db, 'claims');
  const snap = await getDocs(query(ref, where('outil_id', '==', outilId)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function approuverClaim(claimId, adminUid) {
  const ref = doc(db, 'claims', claimId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Revendication introuvable.');
  const claim = snap.data();

  // Jamais de remplacement automatique et silencieux : si un autre claim
  // est déjà le créateur vérifié actif de cet outil, il faut d'abord le
  // révoquer explicitement (voir revoquerClaim) avant d'en approuver un
  // nouveau.
  const creatorActuel = await getCreateurVerifie(claim.outil_id);
  if (creatorActuel && creatorActuel !== claim.uid) {
    throw new Error('CREATEUR_DEJA_ACTIF');
  }

  const batch = writeBatch(db);
  batch.update(ref, { status: 'approved', verifiedAt: serverTimestamp(), verifiedBy: adminUid });
  batch.update(doc(db, 'outils', claim.outil_id), { verified_creator_uid: claim.uid });
  await batch.commit();
}

export async function rejeterClaim(claimId, adminUid, motif) {
  await updateDoc(doc(db, 'claims', claimId), {
    status: 'rejected', rejectedAt: serverTimestamp(), rejectedBy: adminUid, rejectionReason: motif
  });
}

// Révoque un créateur vérifié — le motif est obligatoire (imposé aussi
// côté appelant/UI admin). Ne touche JAMAIS aux autres claims "pending"
// pour ce même outil : l'admin doit prendre une décision séparée et
// explicite pour chacun (point 10 de la spec) — jamais d'approbation
// automatique en cascade.
export async function revoquerClaim(claimId, adminUid, motif) {
  const ref = doc(db, 'claims', claimId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Revendication introuvable.');
  const claim = snap.data();

  const batch = writeBatch(db);
  batch.update(ref, { status: 'revoked', revokedAt: serverTimestamp(), revokedBy: adminUid, revocationReason: motif });

  // Ne retire le créateur vérifié de la fiche outil QUE si c'était bien ce
  // claim qui y était associé — évite d'écraser par erreur un autre
  // créateur actif si les données étaient déjà dans un état incohérent.
  const outilSnap = await getDoc(doc(db, 'outils', claim.outil_id));
  if (outilSnap.exists() && outilSnap.data().verified_creator_uid === claim.uid) {
    batch.update(doc(db, 'outils', claim.outil_id), { verified_creator_uid: null });
  }
  await batch.commit();
}

export async function demanderVerificationSupplementaire(claimId, adminUid, note) {
  await updateDoc(doc(db, 'claims', claimId), {
    status: 'additional_verification',
    additionalVerificationRequestedAt: serverTimestamp(),
    additionalVerificationBy: adminUid,
    additionalVerificationNote: note || ''
  });
}

// ══════════════════════════════════════
// ARTICLES CRÉATEURS
// ══════════════════════════════════════
// Contenu stocké en blocs structurés (jamais de HTML brut) — voir
// gen-fiches.js pour le rendu sécurisé côté génération statique.

// Petit slugify local — évite de faire dépendre firestore.js d'une
// fonction définie côté page (profil.html a la sienne, gen-fiches.js a la
// sienne aussi) ; les trois doivent juste produire le même résultat pour
// un même nom d'outil, ce qui est le cas ici (même logique partout).
function slugifyLocal(str) {
  return String(str || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Outils appartenant directement à l'utilisateur. Le parcours de revendication
// n'est plus utilisé : owner_uid est la seule source d'autorité côté client,
// et les règles Firestore revérifient ce propriétaire lors de la création.
export async function getOutilsCreateur(uid) {
  if (!uid) return [];
  const ref = collection(db, 'outils');
  const snap = await getDocs(query(ref, where('owner_uid', '==', uid)));
  return snap.docs
    .map(d => {
      const o = d.data();
      const plan = String(o.plan || '').toLowerCase();
      if (!['starter', 'featured'].includes(plan)) return null;
      return {
        claim_id: null, // compatibilité avec les anciens brouillons ; aucune revendication
        outil_id: d.id,
        outil_slug: String(o.outil_slug || slugifyLocal(o.name || '')).trim(),
        nom: o.name || o.nom_outil || '',
        categorie: o.category || o.categorie || '',
        plan,
        favicon: `https://www.google.com/s2/favicons?sz=64&domain=${String(o.url || '').replace(/^https?:\/\//, '').split('/')[0]}`
      };
    })
    .filter(Boolean);
}

export async function getArticlesForSoumission(uid, soumissionId) {
  const ref = collection(db, 'articles_createurs');
  const snap = await getDocs(query(
    ref,
    where('uid', '==', uid),
    where('soumission_id', '==', soumissionId)
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Tous les articles créateurs d'un utilisateur, tous statuts confondus —
// pour la liste "Mes articles" de profil.html.
export async function getArticlesCreateurUtilisateur(uid) {
  const ref = collection(db, 'articles_createurs');
  const snap = await getDocs(query(ref, where('uid', '==', uid)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Un seul article créateur par id — utilisé pour rouvrir l'éditeur en cas
// de reprise après "modifications demandées".
export async function getArticleCreateur(articleId) {
  const snap = await getDoc(doc(db, 'articles_createurs', articleId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// CORRECTIF : la version précédente ne retenait que
// {uid, outil_slug, titre, banniere_url, nb_mots, contenu} —
// categorie, extrait, auteur_nom, auteur_bio, sources et mots_cles étaient
// silencieusement perdus alors que profil.html les envoie déjà. On les
// capture tous ici, avec une valeur de repli sûre pour chacun (jamais
// `undefined`, que Firestore refuse d'écrire).
//
// vues et liked_by sont initialisés ici (jamais fournis par l'auteur) —
// voir incrementArticleViews() et toggleLikeArticle() plus bas.
// CORRECTIF : la version précédente ne retenait que
// {uid, outil_slug, titre, banniere_url, nb_mots, contenu} —
// categorie, extrait, auteur_nom, auteur_bio, sources et mots_cles étaient
// silencieusement perdus alors que profil.html les envoie déjà. On les
// capture tous ici, avec une valeur de repli sûre pour chacun (jamais
// `undefined`, que Firestore refuse d'écrire).
//
// vues et liked_by sont initialisés ici (jamais fournis par l'auteur) —
// voir incrementArticleViews() et toggleLikeArticle() plus bas.
//
// QUOTA : seule la limite permanente liée au plan de l'outil s'applique.
// Starter = 3 articles au total ; Featured = 5 articles au total.
// Aucun quota trimestriel ou annuel n'est appliqué.
export async function createArticleCreateur({
  uid, claim_id, outil_id, outil_slug, titre, categorie, extrait, banniere_url,
  auteur_nom, auteur_bio, sources, mots_cles, cta_text, nb_mots, contenu
}) {
  if (!outil_id) throw new Error('OUTIL_REQUIS');
  const outilRef = doc(db, 'outils', String(outil_id));
  const articleRef = doc(collection(db, 'articles_createurs'));

  // Limite par outil selon son plan : Starter 3, Featured 5, autres 0 (aucun article)
  const LIMITES = { starter: 3, featured: 5 };

  // DIAGNOSTIC TEMPORAIRE : vérifie chaque condition de la règle
  // /articles_createurs avant d'exécuter la transaction.
  let diagnostic = {};
  try {
    const preflightSnap = await getDoc(outilRef);
    if (!preflightSnap.exists()) throw new Error('OUTIL_INTROUVABLE');
    const preflight = preflightSnap.data();
    const planLu = String(preflight.plan || '').toLowerCase();
    const limitePreflight = LIMITES[planLu];
    const compteurPreflight = Number(preflight.articles_count || 0);

    // Valeurs effectives exactes qui seront envoyées à Firestore.
    const article = {
      uid,
      claim_id: claim_id || null,
      outil_id: String(outil_id),
      outil_slug: String(outil_slug || '').trim(),
      titre,
      categorie: categorie || '',
      extrait: extrait || '',
      banniere_url: banniere_url || '',
      auteur_nom: auteur_nom || '',
      auteur_bio: auteur_bio || '',
      sources: sources || [],
      mots_cles: (mots_cles || []).slice(0, 5),
      cta_text: cta_text || '',
      nb_mots,
      statut: 'en_relecture',
      contenu,
      vues: 0,
      liked_by: [],
      rejection_reasons: [],
      admin_comment: ''
    };

    const checks = {
      uid_present: typeof uid === 'string' && uid.length > 0,
      claim_id_valide: article.claim_id === null || typeof article.claim_id === 'string',
      outil_id_chaine: typeof article.outil_id === 'string',
      outil_slug_chaine: typeof article.outil_slug === 'string',
      proprietaire_ok: preflight.owner_uid === uid,
      plan_autorise: ['starter', 'featured'].includes(planLu),
      quota_disponible: !!limitePreflight && compteurPreflight < limitePreflight,
      titre_valide: typeof article.titre === 'string' && article.titre.length > 0 && article.titre.length <= 200,
      categorie_valide: typeof article.categorie === 'string' && article.categorie.length > 0 && article.categorie.length <= 100,
      extrait_valide: typeof article.extrait === 'string' && article.extrait.length <= 250,
      banniere_url_valide: typeof article.banniere_url === 'string',
      auteur_nom_valide: typeof article.auteur_nom === 'string' && article.auteur_nom.length > 0 && article.auteur_nom.length <= 60,
      auteur_bio_valide: typeof article.auteur_bio === 'string' && article.auteur_bio.length <= 160,
      cta_text_valide: typeof article.cta_text === 'string' && article.cta_text.length <= 60,
      sources_valides: Array.isArray(article.sources) && article.sources.length <= 20,
      mots_cles_valides: Array.isArray(article.mots_cles) && article.mots_cles.length <= 5,
      nb_mots_valide: typeof article.nb_mots === 'number' && article.nb_mots >= 500,
      contenu_valide: Array.isArray(article.contenu) && article.contenu.length > 0 && article.contenu.length < 200
    };

    diagnostic = {
      outil_id: String(outil_id),
      uid: uid || null,
      owner_uid: preflight.owner_uid || null,
      plan: preflight.plan || null,
      articles_count: preflight.articles_count ?? '(absent = 0)',
      checks,
      champs: {
        titre: typeof article.titre === 'string' ? article.titre.length + ' caractères' : typeof article.titre,
        categorie: article.categorie,
        extrait: typeof article.extrait === 'string' ? article.extrait.length + ' caractères' : typeof article.extrait,
        auteur_nom: article.auteur_nom,
        auteur_bio: typeof article.auteur_bio === 'string' ? article.auteur_bio.length + ' caractères' : typeof article.auteur_bio,
        sources: Array.isArray(article.sources) ? article.sources.length : typeof article.sources,
        mots_cles: Array.isArray(article.mots_cles) ? article.mots_cles.length : typeof article.mots_cles,
        nb_mots: article.nb_mots,
        contenu_blocs: Array.isArray(article.contenu) ? article.contenu.length : typeof article.contenu
      }
    };
    console.info('[ALBEXIA DIAGNOSTIC ARTICLE] Vérification des règles :', diagnostic);

    const echecs = Object.entries(checks).filter(([, ok]) => !ok).map(([nom]) => nom);
    if (echecs.length) {
      const erreur = new Error('DIAGNOSTIC_CHAMPS_INVALIDES: ' + echecs.join(', '));
      erreur.code = 'albexia/invalid-article-fields';
      erreur.diagnostic = diagnostic;
      throw erreur;
    }
  } catch (preflightError) {
    console.error('[ALBEXIA DIAGNOSTIC ARTICLE] Échec pré-vérification :', preflightError, diagnostic);
    if (preflightError.diagnostic) {
      alert('DIAGNOSTIC AVANT ENREGISTREMENT\n\n' +
        'Certaines conditions ne correspondent pas aux règles Firestore :\n' +
        Object.entries(diagnostic.checks).filter(([, ok]) => !ok).map(([nom]) => '• ' + nom).join('\n') +
        '\n\nAucune écriture n’a été lancée. Envoie une capture.');
    }
    throw preflightError;
  }

  try {
    await runTransaction(db, async (tx) => {
    // Lectures avant écritures (obligatoire dans une transaction Firestore)
    const outilSnap = await tx.get(outilRef);
    if (!outilSnap.exists()) throw new Error('OUTIL_INTROUVABLE');
    const outil = outilSnap.data();
    const limite = LIMITES[outil.plan];
    if (!limite) throw new Error('PLAN_SANS_ARTICLES');
    const dejaPublies = Number(outil.articles_count || 0);
    if (dejaPublies >= limite) throw new Error('LIMITE_ARTICLES_OUTIL');

    tx.set(articleRef, {
      uid,
      claim_id: claim_id || null,
      outil_id: String(outil_id),
      outil_slug: String(outil_slug || '').trim(),
      titre,
      categorie: categorie || '',
      extrait: extrait || '',
      banniere_url: banniere_url || '',
      auteur_nom: auteur_nom || '',
      auteur_bio: auteur_bio || '',
      sources: sources || [],
      mots_cles: (mots_cles || []).slice(0, 5),
      cta_text: cta_text || '',
      nb_mots,
      statut: 'en_relecture',
      contenu,
      vues: 0,
      liked_by: [],
      rejection_reasons: [],
      admin_comment: '',
      created_at: serverTimestamp(),
      updated_at: serverTimestamp()
    });

    // Compteur sur l'outil, incrémenté dans la même transaction que l'article
    tx.update(outilRef, { articles_count: dejaPublies + 1 });
    });
  } catch (transactionError) {
    console.error('[ALBEXIA DIAGNOSTIC ARTICLE] Échec transaction Firestore :', {
      code: transactionError.code || 'inconnu',
      message: transactionError.message || String(transactionError),
      diagnostic
    });
    // Alerte temporaire lisible sur mobile. Le code ne révèle aucun secret.
    if (transactionError.code === 'permission-denied') {
      alert(
        'ÉCHEC FIRESTORE — DIAGNOSTIC\n\n' +
        'Code : ' + (transactionError.code || 'inconnu') + '\n' +
        'Message : ' + (transactionError.message || String(transactionError)) + '\n\n' +
        'Propriétaire correspondant : ' + diagnostic.proprietaire_ok + '\n' +
        'Plan autorisé : ' + diagnostic.plan_ok + '\n' +
        'Quota disponible : ' + diagnostic.quota_ok + '\n\n' +
        'Outil : ' + (diagnostic.outil_id || '') + '\n' +
        'Plan lu : ' + (diagnostic.plan || '') + '\n' +
        'Compteur : ' + (diagnostic.articles_count ?? '') + '\n\n' +
        'Vérifications :\n' + Object.entries(diagnostic.checks || {}).map(([nom, ok]) => nom + ' : ' + (ok ? 'OK' : 'ÉCHEC')).join('\n') + '\n\n' +
        'Tous les champs passent localement : le refus vient alors probablement d’une condition évaluée côté règles ou de l’une des deux écritures de la transaction.\n\n' +
        'Envoie une capture de ce message.'
      );
    }
    throw transactionError;
  }

  return articleRef.id;
}

// ── Reprise après "modifications demandées" ──
// Ne consomme PAS de nouveau quota (l'article existe déjà, on le corrige
// simplement) — donc pas de transaction ici, un simple updateDoc suffit.
// Remet toujours statut à 'en_relecture' : la reprise renvoie
// systématiquement l'article en file de validation admin, jamais en
// publication directe. Les champs modifiables ici correspondent
// exactement à la liste autorisée par les security rules pour l'auteur
// (voir /articles_createurs/{articleId} → allow update, condition
// hasOnly) — toute divergence entre les deux serait rejetée par
// Firestore, pas seulement ignorée.
export async function updateArticleCreateur(articleId, {
  claim_id, outil_slug, titre, categorie, extrait, banniere_url,
  auteur_nom, auteur_bio, sources, mots_cles, cta_text, nb_mots, contenu
}) {
  const ref = doc(db, 'articles_createurs', articleId);
  await updateDoc(ref, {
    claim_id: claim_id || null,
    outil_slug: String(outil_slug || '').trim(),
    titre,
    categorie: categorie || '',
    extrait: extrait || '',
    banniere_url: banniere_url || '',
    auteur_nom: auteur_nom || '',
    auteur_bio: auteur_bio || '',
    sources: sources || [],
    mots_cles: (mots_cles || []).slice(0, 5),
    cta_text: cta_text || '',
    nb_mots,
    contenu,
    statut: 'en_relecture',
    updated_at: serverTimestamp()
  });
}



// ── Vues ──
// Incrémentée une fois par chargement de page (voir le script inline
// injecté par gen-fiches.js dans chaque fiche article créateur générée).
// Écriture non authentifiée, comme le reste du site public : compromis
// assumé — un visiteur déterminé pourrait gonfler le compteur en
// rechargeant la page en boucle, mais c'est un indicateur d'audience,
// pas une donnée sensible ni monétisée. Les security rules Firestore
// doivent limiter cette écriture publique au seul champ "vues" (voir
// note de sécurité fournie séparément).
export async function incrementArticleViews(articleId) {
  const ref = doc(db, 'articles_createurs', articleId);
  await updateDoc(ref, { vues: increment(1) });
}

// ── Likes ──
// Un like par utilisateur connecté, stocké comme tableau d'uids sur le
// doc article lui-même (et non sous users/{uid}, contrairement à
// savedVideos) : on affiche un compteur PUBLIC par article, donc la
// liste doit vivre sur l'article pour être lue en un seul accès par
// n'importe quel visiteur, sans avoir à interroger tous les profils.
// Retourne le nouvel état (true = vient d'être liké, false = un-liké).
export async function toggleLikeArticle(articleId, uid) {
  const ref  = doc(db, 'articles_createurs', articleId);
  const snap = await getDoc(ref);
  const likedBy = snap.exists() ? (snap.data().liked_by || []) : [];
  const dejaLike = likedBy.includes(uid);
  await updateDoc(ref, { liked_by: dejaLike ? arrayRemove(uid) : arrayUnion(uid) });
  return !dejaLike;
}

// Lecture légère des compteurs pour l'affichage initial d'une fiche
// article (vues + nombre de likes + statut liké pour l'utilisateur
// courant si connecté). Un seul accès Firestore.
export async function getArticleCreateurStats(articleId, uid) {
  const ref  = doc(db, 'articles_createurs', articleId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { vues: 0, likesCount: 0, likedByCurrentUser: false };
  const data = snap.data();
  const likedBy = data.liked_by || [];
  return {
    vues: data.vues || 0,
    likesCount: likedBy.length,
    likedByCurrentUser: uid ? likedBy.includes(uid) : false,
  };
}

// ══════════════════════════════════════
// MES ALERTES (déclenchées uniquement depuis l'admin — option 3,
// voir matchAgainstAlerts() plus bas, appelée dans form-outils)
// ══════════════════════════════════════
// Une alerte = un critère de veille défini par l'utilisateur (catégorie +
// éventuellement types de prix / tags). Stockée en sous-collection
// users/{uid}/alerts, jamais lisible/écrivable par un autre utilisateur.

export async function getUserAlerts(uid) {
  const ref  = collection(db, 'users', uid, 'alerts');
  const snap = await getDocs(query(ref, orderBy('createdAt', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createAlert(uid, { name, category, priceTypes, tags }) {
  const ref = collection(db, 'users', uid, 'alerts');
  const docRef = await addDoc(ref, {
    name:       name || '',
    category:   category || '',
    priceTypes: priceTypes && priceTypes.length ? priceTypes : ['free', 'freemium', 'paid'],
    tags:       tags || [],
    active:     true,
    createdAt:  serverTimestamp(),
  });
  return docRef.id;
}

export async function toggleAlertActive(uid, alertId, active) {
  const ref = doc(db, 'users', uid, 'alerts', alertId);
  await updateDoc(ref, { active });
}

export async function deleteAlert(uid, alertId) {
  const ref = doc(db, 'users', uid, 'alerts', alertId);
  await deleteDoc(ref);
}

// ══════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════
// Générées automatiquement par matchAgainstAlerts() (voir plus bas),
// elle-même appelée UNIQUEMENT depuis l'admin (form-outils, à la
// création d'un nouvel outil) — voir Option 3 discutée : pas de Cloud
// Function, pas de trigger Firestore, tout part d'un point de contrôle
// unique et connu (l'admin).

export async function getNotifications(uid, max = 20) {
  const ref  = collection(db, 'notifications', uid, 'items');
  const snap = await getDocs(query(ref, orderBy('createdAt', 'desc')));
  return snap.docs.slice(0, max).map(d => ({ id: d.id, ...d.data() }));
}

// Écoute temps réel pour le badge/panel de notifications (cloche).
// Retourne la fonction unsubscribe (à appeler si le composant se démonte).
export function listenNotifications(uid, callback, max = 20) {
  const ref = collection(db, 'notifications', uid, 'items');
  const q   = query(ref, orderBy('createdAt', 'desc'));
  return onSnapshot(q, snap => {
    const items = snap.docs.slice(0, max).map(d => ({ id: d.id, ...d.data() }));
    callback(items);
  });
}

export async function markNotificationRead(uid, notifId) {
  const ref = doc(db, 'notifications', uid, 'items', notifId);
  await updateDoc(ref, { read: true });
}

export async function markAllNotificationsRead(uid) {
  const ref  = collection(db, 'notifications', uid, 'items');
  const snap = await getDocs(query(ref, where('read', '==', false)));
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.update(d.ref, { read: true }));
  if (snap.docs.length) await batch.commit();
}

// La suppression d'une notification ne supprime JAMAIS l'alerte qui l'a
// générée — seule la trace/l'historique disparaît, l'alerte reste active
// et continuera à générer de nouvelles notifs à l'avenir.

export async function deleteNotification(uid, notifId) {
  const ref = doc(db, 'notifications', uid, 'items', notifId);
  await deleteDoc(ref);
}

export async function deleteAllNotifications(uid) {
  const ref  = collection(db, 'notifications', uid, 'items');
  const snap = await getDocs(ref);
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.delete(d.ref));
  if (snap.docs.length) await batch.commit();
}

// ══════════════════════════════════════
// PRÉFÉRENCES DE NOTIFICATIONS (Paramètres → Notifications)
// ══════════════════════════════════════
// Ce que l'utilisateur AUTORISE à recevoir — distinct des alertes
// personnalisées (ce qu'il SURVEILLE). Sauvegarde automatique, pas de
// bouton "Enregistrer". Stocké dans users/{uid}.settings.notifications.

export async function updateNotificationSetting(uid, key, value) {
  const ref = doc(db, 'users', uid);
  await updateDoc(ref, { [`settings.notifications.${key}`]: value });
}

// ══════════════════════════════════════
// NOTIFICATIONS LIÉES AU COMPTE (soumission / revendication / article
// créateur) — indépendantes des alertes, voir mission refonte. Appelées
// UNIQUEMENT depuis l'admin, aux points de décision existants (approuver/
// refuser une soumission, une revendication, un article). uid manquant
// (ex. soumission anonyme via soumettre.html) → no-op silencieux.
// ══════════════════════════════════════

export async function createAccountNotification(uid, { type, title, message, link, meta }) {
  if (!uid) return;
  const ref = collection(db, 'notifications', uid, 'items');
  await addDoc(ref, {
    type,
    title:     title || '',
    message:   message || '',
    link:      link || '#',
    read:      false,
    createdAt: serverTimestamp(),
    source:    { type: 'account' },
    ...(meta ? { action: meta } : {}),
  });
}

// ══════════════════════════════════════
// MATCHING — SEUL POINT D'ENTRÉE : appelé depuis admin-index__3_.html,
// dans le handler de form-outils, juste après la création d'un nouvel
// outil (jamais sur une simple modification — voir !editingTool côté
// admin). Aucune Cloud Function, aucun trigger serveur : c'est un choix
// assumé pour rester 100% gratuit (plan Spark), le point de contrôle
// étant que Damon est seul à ajouter des outils, via l'admin.
// ══════════════════════════════════════

export async function matchAgainstAlerts(tool) {
  if (!tool || !tool.category) return;

  const q = query(
    collectionGroup(db, 'alerts'),
    where('active', '==', true),
    where('category', '==', tool.category)
  );
  const snap = await getDocs(q);
  if (snap.empty) return;

  const batch = writeBatch(db);
  let count = 0;

  for (const docSnap of snap.docs) {
    const alert = docSnap.data();
    const uid   = docSnap.ref.parent.parent.id; // users/{uid}/alerts/{alertId} → uid

    const priceOk = !alert.priceTypes?.length || alert.priceTypes.includes(tool.price);
    const tagsOk  = !alert.tags?.length || alert.tags.every(t => (tool.tags || []).includes(t));
    if (!priceOk || !tagsOk) continue;

    const notifRef = doc(collection(db, 'notifications', uid, 'items'));
    batch.set(notifRef, {
      type:      'alert_match',
      alertId:   docSnap.id,
      alertName: alert.name || '',
      alertCategory:   alert.category || tool.category || '',
      alertPriceTypes: alert.priceTypes || [],
      toolId:    tool.id,
      toolName:  tool.name,
      favicon:   tool.favicon || '',
      category:  tool.category || '',
      price:     tool.price || '',
      offre:     tool.offre || '',
      toolUrl:   tool.url || '',
      // "params" = ce dont profil.html a besoin pour reconstruire le titre
      // et le message dans la langue de l'utilisateur via i18n.js, au lieu
      // d'une phrase figée en français écrite ici. Ne pas écrire "title"/
      // "message" ici : leur présence signale à profil.html une ancienne
      // notification (pré-i18n) à afficher telle quelle, en français.
      params:    { tool: tool.name, category: tool.category || '', alert: alert.name || '' },
      link:      buildToolPageUrl(tool) || tool.url || '#',
      read:      false,
      createdAt: serverTimestamp(),
      source:    { type: 'alert', alert_id: docSnap.id },
    });
    count++;
  }

  if (count) await batch.commit();
  return count;
}

// ══════════════════════════════════════
// NOTIFICATIONS SUR MODIFICATION D'UN OUTIL EXISTANT — appelée depuis
// l'admin uniquement sur une VRAIE modification (editingTool truthy),
// jamais sur une création (matchAgainstAlerts s'en charge déjà). Deux
// familles distinctes, cumulables pour un même utilisateur :
//  A. alertes actives qui matchent la catégorie/prix de l'outil modifié
//     → price_change / free_offer / tool_updated
//  B. utilisateurs ayant sauvegardé cet outil dans une collection
//     (outils/{id}.saved_by, tenu à jour par add/removeToolFromCollection)
//     → collection_update, quelle que soit une alerte ou non
// ══════════════════════════════════════

export async function notifyToolChange(oldTool, newTool) {
  if (!oldTool || !newTool || !newTool.category) return { alerts: 0, collections: 0 };

  const priceChanged = oldTool.price !== newTool.price;
  const becameFree    = priceChanged && newTool.price === 'free';

  const type = becameFree ? 'free_offer' : priceChanged ? 'price_change' : 'tool_updated';
  const params = { tool: newTool.name };

  let alertsCount = 0;
  const q = query(
    collectionGroup(db, 'alerts'),
    where('active', '==', true),
    where('category', '==', newTool.category)
  );
  const snap = await getDocs(q);

  if (!snap.empty) {
    const batch = writeBatch(db);
    for (const docSnap of snap.docs) {
      const alert = docSnap.data();
      const uid   = docSnap.ref.parent.parent.id;
      const priceOk = !alert.priceTypes?.length || alert.priceTypes.includes(newTool.price);
      if (!priceOk) continue;

      const notifRef = doc(collection(db, 'notifications', uid, 'items'));
      batch.set(notifRef, {
        type, params,
        toolId:    newTool.id,
        toolName:  newTool.name,
        favicon:   newTool.favicon || '',
        category:  newTool.category || '',
        price:     newTool.price || '',
        offre:     newTool.offre || '',
        toolUrl:   newTool.url || '',
        alertId:   docSnap.id,
        alertName: alert.name || '',
        alertCategory:   alert.category || newTool.category || '',
        alertPriceTypes: alert.priceTypes || [],
        link:      buildToolPageUrl(newTool) || newTool.url || '#',
        read:      false,
        createdAt: serverTimestamp(),
        source:    { type: 'alert', alert_id: docSnap.id },
      });
      alertsCount++;
    }
    if (alertsCount) await batch.commit();
  }

  // Notifications "collection" — un ensemble d'utilisateurs distinct
  // (dédoublonné contre les uid déjà notifiés via une alerte, pour ne
  // jamais envoyer deux notifications pour le même événement).
  let collectionsCount = 0;
  const savedBy = newTool.saved_by || oldTool.saved_by || [];
  if (savedBy.length) {
    const alreadyNotified = new Set(snap.docs.map(d => d.ref.parent.parent.id));
    const batch2 = writeBatch(db);
    for (const uid of savedBy) {
      if (alreadyNotified.has(uid)) continue;
      const notifRef = doc(collection(db, 'notifications', uid, 'items'));
      batch2.set(notifRef, {
        type: 'collection_update',
        params: { tool: newTool.name },
        toolId:    newTool.id,
        toolName:  newTool.name,
        favicon:   newTool.favicon || '',
        category:  newTool.category || '',
        price:     newTool.price || '',
        offre:     newTool.offre || '',
        toolUrl:   newTool.url || '',
        link:      buildToolPageUrl(newTool) || newTool.url || '#',
        read:      false,
        createdAt: serverTimestamp(),
        source:    { type: 'collection' },
      });
      collectionsCount++;
    }
    if (collectionsCount) await batch2.commit();
  }

  return { alerts: alertsCount, collections: collectionsCount };
}
