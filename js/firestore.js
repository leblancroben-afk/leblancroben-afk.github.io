/* ═══════════════════════════════════════
   Albexia — firestore.js
   Collections, historique quiz, profil
   ═══════════════════════════════════════ */

import {
  db, doc, setDoc, getDoc, updateDoc,
  collection, addDoc, getDocs, deleteDoc, query, orderBy,
  where, serverTimestamp, increment, arrayUnion, arrayRemove
} from './firebase-config.js';

// ══════════════════════════════════════
// COLLECTIONS D'OUTILS
// ══════════════════════════════════════

export async function getCollections(uid) {
  const ref  = collection(db, 'users', uid, 'collections');
  const snap = await getDocs(query(ref, orderBy('createdAt', 'desc')));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
}

export async function removeToolFromCollection(uid, colId, toolId) {
  const ref  = doc(db, 'users', uid, 'collections', colId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const tools = (snap.data().tools || []).filter(t => String(t.id) !== String(toolId));
  await updateDoc(ref, { tools });
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
// ARTICLES CRÉATEURS
// ══════════════════════════════════════
// Contenu stocké en blocs structurés (jamais de HTML brut) — voir
// gen-fiches.js pour le rendu sécurisé côté génération statique.

export async function getArticlesForSoumission(uid, soumissionId) {
  const ref = collection(db, 'articles_createurs');
  const snap = await getDocs(query(
    ref,
    where('uid', '==', uid),
    where('soumission_id', '==', soumissionId)
  ));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// CORRECTIF : la version précédente ne retenait que
// {uid, soumission_id, outil_slug, titre, banniere_url, trimestre, nb_mots, contenu} —
// categorie, extrait, auteur_nom, auteur_bio, sources et mots_cles étaient
// silencieusement perdus alors que profil.html les envoie déjà. On les
// capture tous ici, avec une valeur de repli sûre pour chacun (jamais
// `undefined`, que Firestore refuse d'écrire).
//
// vues et liked_by sont initialisés ici (jamais fournis par l'auteur) —
// voir incrementArticleViews() et toggleLikeArticle() plus bas.
export async function createArticleCreateur({
  uid, soumission_id, outil_slug, titre, categorie, extrait, banniere_url,
  auteur_nom, auteur_bio, sources, mots_cles, trimestre, nb_mots, contenu
}) {
  const ref = collection(db, 'articles_createurs');
  const docRef = await addDoc(ref, {
    uid,
    soumission_id: soumission_id || null,
    outil_slug: outil_slug || null,
    titre,
    categorie: categorie || '',
    extrait: extrait || '',
    banniere_url: banniere_url || '',
    auteur_nom: auteur_nom || '',
    auteur_bio: auteur_bio || '',
    sources: sources || [],
    mots_cles: (mots_cles || []).slice(0, 5),
    trimestre,
    nb_mots,
    statut: 'en_relecture',
    contenu,
    vues: 0,
    liked_by: [],
    created_at: serverTimestamp(),
    updated_at: serverTimestamp()
  });
  return docRef.id;
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
