/* ═══════════════════════════════════════
   Albexia — firestore.js
   Collections, historique quiz, profil
   ═══════════════════════════════════════ */

import {
  db, doc, setDoc, getDoc, updateDoc,
  collection, addDoc, getDocs, deleteDoc, query, orderBy,
  where, serverTimestamp, increment, arrayUnion, arrayRemove,
  runTransaction, Timestamp
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

// Petit slugify local — évite de faire dépendre firestore.js d'une
// fonction définie côté page (profil.html a la sienne, gen-fiches.js a la
// sienne aussi) ; les trois doivent juste produire le même résultat pour
// un même nom d'outil, ce qui est le cas ici (même logique partout).
function slugifyLocal(str) {
  return String(str || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Outils qu'un utilisateur peut légitimement associer à un article
// créateur : ses soumissions dont la revendication est validée ET qui
// pointent vers un outil réellement indexé (outil_id). Les données
// affichées (nom, catégorie, favicon) viennent TOUJOURS du document
// "outils" officiel — jamais des champs saisis dans la soumission
// d'origine, qui peuvent dater d'avant validation/modification de la
// fiche par l'admin.
export async function getOutilsCreateur(uid) {
  const ref = collection(db, 'soumissions');
  const snap = await getDocs(query(ref, where('uid', '==', uid), where('revendication.statut', '==', 'validee')));
  const candidats = snap.docs
    .map(d => ({ soumission_id: d.id, ...d.data() }))
    .filter(s => s.outil_id);

  const resolus = await Promise.all(candidats.map(async (s) => {
    try {
      const outilSnap = await getDoc(doc(db, 'outils', String(s.outil_id)));
      if (!outilSnap.exists()) return null;
      const o = outilSnap.data();
      return {
        soumission_id: s.soumission_id,
        outil_id: String(s.outil_id),
        outil_slug: slugifyLocal(o.name),
        nom: o.name,
        categorie: o.category || '',
        favicon: `https://www.google.com/s2/favicons?sz=64&domain=${(o.url || '').replace(/^https?:\/\//, '').split('/')[0]}`,
      };
    } catch { return null; }
  }));
  return resolus.filter(Boolean);
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
// {uid, soumission_id, outil_slug, titre, banniere_url, trimestre, nb_mots, contenu} —
// categorie, extrait, auteur_nom, auteur_bio, sources et mots_cles étaient
// silencieusement perdus alors que profil.html les envoie déjà. On les
// capture tous ici, avec une valeur de repli sûre pour chacun (jamais
// `undefined`, que Firestore refuse d'écrire).
//
// vues et liked_by sont initialisés ici (jamais fournis par l'auteur) —
// voir incrementArticleViews() et toggleLikeArticle() plus bas.
// ── Quota transactionnel (1 article créateur par trimestre, tous outils
// confondus) ──
// Calcule le début du trimestre calendaire (UTC) contenant `date`, avec
// EXACTEMENT la même logique que la fonction jumelle côté règles Firestore
// (debutTrimestreCourant()) — les deux DOIVENT rester strictement
// identiques, sinon le client et les règles ne s'accorderont jamais sur
// la valeur attendue et toute soumission échouera.
function debutTrimestreUTC(date) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1; // 1-12
  const moisDebut = m <= 3 ? 1 : m <= 6 ? 4 : m <= 9 ? 7 : 10;
  return new Date(Date.UTC(y, moisDebut - 1, 1, 0, 0, 0));
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
//
// QUOTA : la création de l'article et la consommation du quota (1 article
// créateur par trimestre, tous outils confondus) se font dans UNE SEULE
// transaction Firestore. Les security rules exigent que la mise à jour du
// quota sur users/{uid} ait bien eu lieu dans la même transaction pour que
// la création de l'article soit acceptée — donc impossible de créer un
// article sans consommer le quota, et impossible de consommer le quota
// deux fois dans le même trimestre (voir règles /users/{userId} et
// /articles_createurs/{articleId}). `fenetre_debut` envoyée ici n'est
// qu'une PROPOSITION du client : les règles la valident indépendamment à
// partir de request.time (temps serveur), jamais depuis l'horloge du
// navigateur — un client malveillant ne peut donc pas mentir dessus.
//
// Si le quota du trimestre est déjà consommé, Firestore rejette la
// transaction (permission-denied) — cette fonction laisse alors l'erreur
// remonter telle quelle à l'appelant (profil.html), qui doit distinguer
// ce cas pour afficher un message clair plutôt qu'une erreur générique.
export async function createArticleCreateur({
  uid, soumission_id, outil_slug, titre, categorie, extrait, banniere_url,
  auteur_nom, auteur_bio, sources, mots_cles, cta_text, trimestre, nb_mots, contenu
}) {
  const userRef = doc(db, 'users', uid);
  const articleRef = doc(collection(db, 'articles_createurs'));
  const fenetreDebut = Timestamp.fromDate(debutTrimestreUTC(new Date()));

  await runTransaction(db, async (tx) => {
    // Lecture AVANT toute écriture — obligatoire dans une transaction
    // Firestore (toutes les lectures doivent précéder les écritures).
    const userSnap = await tx.get(userRef);
    const dejaConsomme = userSnap.exists()
      && userSnap.data().quota_articles_fenetre
      && userSnap.data().quota_articles_fenetre.isEqual(fenetreDebut);

    if (dejaConsomme) {
      // On échoue nous-mêmes ici plutôt que de laisser les règles renvoyer
      // un "permission-denied" générique — message clair et immédiat côté
      // client, sans aller-retour réseau inutile. Les règles restent
      // quand même la vraie barrière de sécurité si ce contrôle client
      // était contourné.
      throw new Error('QUOTA_TRIMESTRE_ATTEINT');
    }

    tx.set(articleRef, {
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
      cta_text: cta_text || '',
      trimestre, // affichage seulement — jamais utilisé pour vérifier le quota
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

    tx.set(userRef, { quota_articles_fenetre: fenetreDebut }, { merge: true });
  });

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
  soumission_id, outil_slug, titre, categorie, extrait, banniere_url,
  auteur_nom, auteur_bio, sources, mots_cles, cta_text, trimestre, nb_mots, contenu
}) {
  const ref = doc(db, 'articles_createurs', articleId);
  await updateDoc(ref, {
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
    cta_text: cta_text || '',
    trimestre,
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
