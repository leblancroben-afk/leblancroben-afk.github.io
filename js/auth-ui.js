/* =========================================================
   AUTH UI — Avatar / Connexion dans le header partagé
   ========================================================= */

import {
  auth,
  db,
  doc,
  getDoc,
  onAuthStateChanged
} from '/js/firebase-config.js';

function initAuthUI() {

  const profileBtn = document.getElementById('nav-profile-btn');
  const loginBtn   = document.getElementById('nav-login-btn');

  if (!profileBtn || !loginBtn) return;

  loginBtn.style.display = 'none';

  function setNavAvatar(photoURL, initial) {

    const navAvatar = document.getElementById('nav-avatar');

    profileBtn.style.display = 'inline-flex';
    loginBtn.style.display   = 'none';

    if (!navAvatar) return;

    if (photoURL) {

      const img = document.createElement('img');

      img.src = photoURL;
      img.alt = 'Profil';

      img.style.cssText =
        'width:100%;height:100%;object-fit:cover;border-radius:50%';

      img.onerror = () => {
        navAvatar.textContent = initial;
      };

      navAvatar.innerHTML = '';
      navAvatar.appendChild(img);

    } else {

      navAvatar.textContent = initial;

    }
  }

  function setNavLoggedOut() {

    profileBtn.style.display = 'none';
    loginBtn.style.display   = 'inline-flex';

  }

  onAuthStateChanged(auth, async (user) => {

    window._firebaseUser = user || null;

    if (user) {

      const initial =
        (user.displayName || user.email || 'U')
          .charAt(0)
          .toUpperCase();

      setNavAvatar(user.photoURL || null, initial);

      try {

        const snap =
          await getDoc(doc(db, 'users', user.uid));

        if (
          snap.exists() &&
          snap.data().photoURL
        ) {

          setNavAvatar(
            snap.data().photoURL,
            initial
          );

        }

      } catch (e) {
        console.warn('[Albexia] Impossible de récupérer la photo du profil.', e);
      }

      const zoneLogin =
        document.getElementById('zone-login-requis');

      if (zoneLogin) {
        zoneLogin.classList.remove('show');
      }

    } else {

      setNavLoggedOut();

    }

  });
}


/* =========================================================
   ATTENDRE QUE LE HEADER PARTAGÉ SOIT CHARGÉ
   ========================================================= */

if (document.getElementById('nav-profile-btn')) {

  initAuthUI();

} else {

  document.addEventListener(
    'albexia:header-ready',
    initAuthUI,
    { once: true }
  );

}
