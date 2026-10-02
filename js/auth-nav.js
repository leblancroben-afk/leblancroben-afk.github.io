/* =========================================================
   AUTH NAV — Avatar / Connexion dans le header
   Partagé par toutes les pages :
   - pages statiques : le header est dans le HTML, ce module est
     chargé par la balise <script type="module"> de navHTML()
   - pages dynamiques : js/header.js l'importe une fois le header
     injecté (l'ancien script inline lisait les éléments avant leur
     création, d'où l'avatar qui n'apparaissait jamais)

   Éléments attendus : #nav-profile-btn, #nav-avatar, #nav-login-btn
   ========================================================= */
import { auth, db, doc, getDoc, onAuthStateChanged } from '/js/firebase-config.js';

if (!window.__albexiaAuthNav) {
  window.__albexiaAuthNav = true;

  let known = false;          // l'état de connexion est-il connu ?
  let user = null;
  let profilePhoto = null;    // photo enregistrée dans Firestore (prioritaire)

  const $ = (id) => document.getElementById(id);

  function render() {
    const profileBtn = $('nav-profile-btn');
    const loginBtn = $('nav-login-btn');
    const avatar = $('nav-avatar');
    if (!profileBtn || !loginBtn) return;

    /* Tant que l'état est inconnu : on n'affiche rien (évite le flash « Connexion »). */
    if (!known) {
      profileBtn.style.display = 'none';
      loginBtn.style.display = 'none';
      return;
    }

    if (!user) {
      profileBtn.style.display = 'none';
      loginBtn.style.display = 'inline-flex';
      return;
    }

    profileBtn.style.display = 'inline-flex';
    loginBtn.style.display = 'none';
    if (!avatar) return;

    const initial = (user.displayName || user.email || 'U').charAt(0).toUpperCase();
    const photo = profilePhoto || user.photoURL || null;

    if (photo) {
      if (avatar.dataset.photo === photo) return;
      avatar.dataset.photo = photo;
      const img = document.createElement('img');
      img.src = photo;
      img.alt = 'Profil';
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%';
      img.onerror = () => { avatar.textContent = initial; delete avatar.dataset.photo; };
      avatar.innerHTML = '';
      avatar.appendChild(img);
    } else {
      avatar.textContent = initial;
    }
  }

  onAuthStateChanged(auth, async (u) => {
    user = u || null;
    known = true;
    window._firebaseUser = user;
    profilePhoto = null;
    render();

    if (user) {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists() && snap.data().photoURL) {
          profilePhoto = snap.data().photoURL;
          render();
        }
      } catch (e) { /* on garde la photo du compte */ }

      /* Fiches Starter/Featured : masque la zone « connexion requise ». */
      const zoneLogin = $('zone-login-requis');
      if (zoneLogin) zoneLogin.classList.remove('show');
    }
  });

  /* Header injecté après coup (pages dynamiques) */
  document.addEventListener('albexia:header-ready', render);

  /* Si Firebase ne répond pas, on ne laisse pas le header sans accès à la connexion. */
  setTimeout(() => {
    if (!known) { known = true; render(); }
  }, 5000);
}
