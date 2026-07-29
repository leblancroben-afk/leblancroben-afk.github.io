/* ═══════════════════════════════════════════════════════
   Albexia — js/supabase.js
   Fichier partagé entre toutes les pages
   À inclure dans chaque HTML AVANT les autres scripts
   ═══════════════════════════════════════════════════════ */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

/* ─── CONFIG ─── */
const SUPABASE_URL  = 'https://cqjmczfjzosnnrlmfbmm.supabase.co';
const SUPABASE_ANON = 'sb_publishable_L7WRDMPd0mfYo7YC49cxsA_lz62Bb10';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

/* Exposé globalement pour app.js (non-module) */
window._supabase = supabase;

/* ─── Exposer _sbUser dès que possible + maintenir à jour ─── */
supabase.auth.getUser().then(({ data: { user } }) => {
  window._sbUser = user || null;
});
supabase.auth.onAuthStateChange((_event, session) => {
  window._sbUser = session?.user || null;
});

/* ════════════════════════════════════════
   AUTH
   ════════════════════════════════════════ */

/** Retourne l'utilisateur connecté ou null */
export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/** Inscription email/mot de passe */
export async function signUp(email, password, username) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } }
  });
  if (error) throw error;

  /* Créer le profil */
  if (data.user) {
    await supabase.from('profiles').insert({
      id:       data.user.id,
      username: username || email.split('@')[0],
      email
    });
  }
  return data;
}

/** Connexion email/mot de passe */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

/** Connexion Google */
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options:  { redirectTo: window.location.origin + 'https://ia-directory.github.io/profile.html' }
  });
  if (error) throw error;
}

/** Déconnexion */
export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = 'index.html';
}

/* ════════════════════════════════════════
   PROFIL
   ════════════════════════════════════════ */

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  /* Profil absent (Google OAuth sans signUp) → création automatique */
  if (error && error.code === 'PGRST116') {
    const { data: { user } } = await supabase.auth.getUser();
    const username = user?.user_metadata?.full_name
      || user?.user_metadata?.name
      || user?.email?.split('@')[0]
      || 'utilisateur';
    const { data: created, error: createErr } = await supabase
      .from('profiles')
      .insert({ id: userId, username, email: user?.email })
      .select()
      .single();
    if (createErr) throw createErr;
    return created;
  }

  if (error) throw error;
  return data;
}

export async function updateProfile(userId, updates) {
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);
  if (error) throw error;
}

/* ════════════════════════════════════════
   FAVORIS
   ════════════════════════════════════════ */

export async function getFavorites(userId) {
  const { data, error } = await supabase
    .from('favorites')
    .select('tool_id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function addFavorite(userId, toolId) {
  const { error } = await supabase
    .from('favorites')
    .insert({ user_id: userId, tool_id: toolId });
  if (error && error.code !== '23505') throw error; /* Ignore doublon */
}

export async function removeFavorite(userId, toolId) {
  const { error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', userId)
    .eq('tool_id', toolId);
  if (error) throw error;
}

export async function isFavorite(userId, toolId) {
  const { data } = await supabase
    .from('favorites')
    .select('tool_id')
    .eq('user_id', userId)
    .eq('tool_id', toolId)
    .single();
  return !!data;
}

/* ════════════════════════════════════════
   COLLECTIONS
   ════════════════════════════════════════ */

export async function getCollections(userId) {
  const { data, error } = await supabase
    .from('collections')
    .select('*, collection_tools(tool_id)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createCollection(userId, name) {
  const { data, error } = await supabase
    .from('collections')
    .insert({ user_id: userId, name })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCollection(collectionId, userId) {
  const { error } = await supabase
    .from('collections')
    .delete()
    .eq('id', collectionId)
    .eq('user_id', userId);
  if (error) throw error;
}

export async function addToolToCollection(collectionId, toolId) {
  const { error } = await supabase
    .from('collection_tools')
    .insert({ collection_id: collectionId, tool_id: toolId });
  if (error && error.code !== '23505') throw error;
}

export async function removeToolFromCollection(collectionId, toolId) {
  const { error } = await supabase
    .from('collection_tools')
    .delete()
    .eq('collection_id', collectionId)
    .eq('tool_id', toolId);
  if (error) throw error;
}

/* ════════════════════════════════════════
   HISTORIQUE
   ════════════════════════════════════════ */

export async function addToHistory(userId, toolId) {
  /* On ne duplique pas la même entrée dans la même heure */
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  const { data: existing } = await supabase
    .from('history')
    .select('id')
    .eq('user_id', userId)
    .eq('tool_id', toolId)
    .gte('visited_at', oneHourAgo)
    .limit(1);

  if (!existing || existing.length === 0) {
    await supabase.from('history').insert({ user_id: userId, tool_id: toolId });
  }
}

export async function getHistory(userId, limit = 50) {
  const { data, error } = await supabase
    .from('history')
    .select('tool_id, visited_at')
    .eq('user_id', userId)
    .order('visited_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

export async function clearHistory(userId) {
  const { error } = await supabase
    .from('history')
    .delete()
    .eq('user_id', userId);
  if (error) throw error;
}

/* ════════════════════════════════════════
   UI HELPER — Bouton nav profil
   Injecte "Connexion" ou avatar dans .nav-profile-slot
   ════════════════════════════════════════ */

export async function initNavProfile() {
  const slot = document.querySelector('.nav-profile-slot');
  if (!slot) return;

  const user = await getUser();

  if (!user) {
    slot.innerHTML = `
      <a href="auth.html" class="btn-nav-auth">Connexion</a>`;
    return;
  }

  let profile = null;
  try { profile = await getProfile(user.id); } catch {}

  const initial = (profile?.username || user.email || '?')[0].toUpperCase();
  slot.innerHTML = `
    <div class="nav-avatar-wrap" id="nav-avatar-wrap">
      <button class="nav-avatar" id="nav-avatar-btn" aria-label="Mon compte">
        ${initial}
      </button>
      <div class="nav-avatar-menu" id="nav-avatar-menu">
        <div class="nav-avatar-name">${profile?.username || 'Mon compte'}</div>
        <a href="profile.html"            class="nav-avatar-item">👤 Mon profil</a>
        <a href="profile.html#favorites"  class="nav-avatar-item">❤️ Favoris</a>
        <a href="profile.html#collections"class="nav-avatar-item">📁 Collections</a>
        <a href="profile.html#history"    class="nav-avatar-item">🕒 Historique</a>
        <a href="profile.html#notifications" class="nav-avatar-item">🔔 Notifications</a>
        <div class="nav-avatar-divider"></div>
        <button class="nav-avatar-item nav-avatar-logout" id="nav-logout">Déconnexion</button>
      </div>
    </div>`;

  /* Toggle menu */
  const btn  = document.getElementById('nav-avatar-btn');
  const menu = document.getElementById('nav-avatar-menu');
  btn.addEventListener('click', e => {
    e.stopPropagation();
    menu.classList.toggle('open');
  });
  document.addEventListener('click', () => menu.classList.remove('open'));
  menu.addEventListener('click', e => e.stopPropagation());

  document.getElementById('nav-logout').addEventListener('click', signOut);
}
