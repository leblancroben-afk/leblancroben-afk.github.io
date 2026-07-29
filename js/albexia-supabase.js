/* ═══════════════════════════════════════════════════════
   Albexia — albexia-supabase.js
   Fichier unique qui gère TOUT : auth, favoris,
   historique, collections, profil, nav avatar
   À inclure dans index.html et profile.html :
     <script type="module" src="js/albexia-supabase.js"></script>
   ═══════════════════════════════════════════════════════ */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

/* ─── CONFIG ─── */
const SUPABASE_URL  = 'https://cqjmczfjzosnnrlmfbmm.supabase.co';
const SUPABASE_ANON = 'sb_publishable_L7WRDMPd0mfYo7YC49cxsA_lz62Bb10';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON);

/* ─── Exposition globale pour app.js (non-module) ─── */
window._supabase = sb;
window._sbUser   = null;

/* ─── Résolution immédiate de l'utilisateur ─── */
sb.auth.getSession().then(({ data: { session } }) => {
  window._sbUser = session?.user || null;
  window.dispatchEvent(new CustomEvent('albexia:userready', { detail: window._sbUser }));
});

sb.auth.onAuthStateChange((_event, session) => {
  window._sbUser = session?.user || null;
  window.dispatchEvent(new CustomEvent('albexia:userready', { detail: window._sbUser }));
});

/* ════════════════════════════════════════
   AUTH
   ════════════════════════════════════════ */

export async function getUser() {
  const { data: { session } } = await sb.auth.getSession();
  return session?.user || null;
}

export async function signOut() {
  await sb.auth.signOut();
  window.location.href = 'index.html';
}

export async function signInWithGoogle() {
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: 'https://ia-directory.github.io/profile.html' }
  });
  if (error) throw error;
}

export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password, username) {
  const { data, error } = await sb.auth.signUp({ email, password, options: { data: { username } } });
  if (error) throw error;
  if (data.user) {
    await sb.from('profiles').upsert({
      id: data.user.id,
      username: username || email.split('@')[0],
      email
    });
  }
  return data;
}

/* ════════════════════════════════════════
   PROFIL
   ════════════════════════════════════════ */

export async function getProfile(userId) {
  const { data, error } = await sb.from('profiles').select('*').eq('id', userId).single();

  if (error && error.code === 'PGRST116') {
    /* Profil absent → création automatique */
    const { data: { user } } = await sb.auth.getUser();
    const username = user?.user_metadata?.full_name
      || user?.user_metadata?.name
      || user?.email?.split('@')[0]
      || 'utilisateur';
    const { data: created, error: ce } = await sb.from('profiles')
      .upsert({ id: userId, username, email: user?.email })
      .select().single();
    if (ce) throw ce;
    return created;
  }
  if (error) throw error;
  return data;
}

export async function updateProfile(userId, updates) {
  const { error } = await sb.from('profiles').update(updates).eq('id', userId);
  if (error) throw error;
}

/* ════════════════════════════════════════
   FAVORIS
   ════════════════════════════════════════ */

export async function getFavorites(userId) {
  const { data, error } = await sb
    .from('favorites').select('tool_id, created_at')
    .eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function addFavorite(userId, toolId) {
  const { error } = await sb.from('favorites')
    .upsert({ user_id: userId, tool_id: String(toolId) }, { onConflict: 'user_id,tool_id' });
  if (error) throw error;
}

export async function removeFavorite(userId, toolId) {
  const { error } = await sb.from('favorites')
    .delete().eq('user_id', userId).eq('tool_id', String(toolId));
  if (error) throw error;
}

export async function isFavorite(userId, toolId) {
  const { data } = await sb.from('favorites').select('tool_id')
    .eq('user_id', userId).eq('tool_id', String(toolId)).maybeSingle();
  return !!data;
}

/* ════════════════════════════════════════
   HISTORIQUE
   ════════════════════════════════════════ */

export async function addToHistory(userId, toolId) {
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  const { data: existing } = await sb.from('history').select('id')
    .eq('user_id', userId).eq('tool_id', String(toolId))
    .gte('visited_at', oneHourAgo).limit(1);
  if (!existing || existing.length === 0) {
    await sb.from('history').insert({ user_id: userId, tool_id: String(toolId) });
  }
}

export async function getHistory(userId, limit = 50) {
  const { data, error } = await sb.from('history').select('tool_id, visited_at')
    .eq('user_id', userId).order('visited_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data || [];
}

export async function clearHistory(userId) {
  const { error } = await sb.from('history').delete().eq('user_id', userId);
  if (error) throw error;
}

/* ════════════════════════════════════════
   COLLECTIONS
   ════════════════════════════════════════ */

export async function getCollections(userId) {
  const { data, error } = await sb.from('collections')
    .select('*, collection_tools(tool_id)').eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createCollection(userId, name) {
  const { data, error } = await sb.from('collections')
    .insert({ user_id: userId, name }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteCollection(collectionId, userId) {
  const { error } = await sb.from('collections')
    .delete().eq('id', collectionId).eq('user_id', userId);
  if (error) throw error;
}

export async function addToolToCollection(collectionId, toolId) {
  const { error } = await sb.from('collection_tools')
    .upsert({ collection_id: collectionId, tool_id: String(toolId) }, { onConflict: 'collection_id,tool_id' });
  if (error) throw error;
}

export async function removeToolFromCollection(collectionId, toolId) {
  const { error } = await sb.from('collection_tools')
    .delete().eq('collection_id', collectionId).eq('tool_id', String(toolId));
  if (error) throw error;
}

/* ════════════════════════════════════════
   NAV AVATAR — injecté dans .nav-profile-slot
   ════════════════════════════════════════ */

export async function initNavProfile() {
  const slot = document.querySelector('.nav-profile-slot');
  if (!slot) return;

  const user = await getUser();

  if (!user) {
    slot.innerHTML = `<a href="auth.html" class="btn-nav-auth">Connexion</a>`;
    return;
  }

  let profile = null;
  try { profile = await getProfile(user.id); } catch {}

  const initial = (profile?.username || user.email || '?')[0].toUpperCase();
  slot.innerHTML = `
    <div class="nav-avatar-wrap" id="nav-avatar-wrap">
      <button class="nav-avatar" id="nav-avatar-btn" aria-label="Mon compte">${initial}</button>
      <div class="nav-avatar-menu" id="nav-avatar-menu">
        <div class="nav-avatar-name">${profile?.username || 'Mon compte'}</div>
        <a href="profile.html"               class="nav-avatar-item">👤 Mon profil</a>
        <a href="profile.html#favorites"     class="nav-avatar-item">❤️ Favoris</a>
        <a href="profile.html#collections"   class="nav-avatar-item">📁 Collections</a>
        <a href="profile.html#history"       class="nav-avatar-item">🕒 Historique</a>
        <a href="profile.html#notifications" class="nav-avatar-item">🔔 Notifications</a>
        <div class="nav-avatar-divider"></div>
        <button class="nav-avatar-item nav-avatar-logout" id="nav-logout">Déconnexion</button>
      </div>
    </div>`;

  const btn  = document.getElementById('nav-avatar-btn');
  const menu = document.getElementById('nav-avatar-menu');
  btn.addEventListener('click', e => { e.stopPropagation(); menu.classList.toggle('open'); });
  document.addEventListener('click', () => menu.classList.remove('open'));
  menu.addEventListener('click', e => e.stopPropagation());
  document.getElementById('nav-logout').addEventListener('click', signOut);
}

/* Exposer les fonctions clés globalement pour app.js (non-module) */
window._albexia = {
  addFavorite,
  removeFavorite,
  addToHistory,
  getCollections,
  createCollection,
  addToolToCollection,
  getFavorites,
};

/* ─── Auto-init nav profil dès que le DOM est prêt ─── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNavProfile);
} else {
  initNavProfile();
}
