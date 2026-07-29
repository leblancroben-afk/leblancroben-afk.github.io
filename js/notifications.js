/**
 * ============================================================
 *  ALBEXIA — Système de Notifications (Toast)
 *  Fichier : js/notifications.js
 *  Version : 2.0
 * ============================================================
 *
 *  INSTALLATION (1 ligne par page HTML, avant </body>) :
 *  <script src="/js/notifications.js" defer></script>
 *
 *  CONFIGURATION : modifier /data/notifications.json uniquement.
 *
 *  COMPORTEMENT :
 *  - Ordre d'affichage  : aléatoire
 *  - Type "guide"       : 5s, pas de bouton [×], disparaît seul
 *  - Type "lien"/"solo"/"groupe" : 20s, bouton [×] disponible
 *  - Clic [×]           : mémorisé en sessionStorage (session en cours)
 *  - Nouvelle session   : toutes les notifications réapparaissent
 *  - Enchaînement       : 10s après disparition → prochaine notification
 *  - Délai initial      : 8s après chargement de la page
 * ============================================================
 */

(function () {
  "use strict";

  /* ─── Constantes ─────────────────────────────────────── */
  const JSON_URL        = "data/notifications.json";
  const SS_PREFIX       = "albexia_notif_dismissed_"; // sessionStorage
  const DELAI_INITIAL   = 8000;   // 8s avant la 1re notification
  const DELAI_ENCHAINE  = 10000;  // 10s entre deux notifications
  const DUREE_GUIDE     = 5000;   // 5s pour les notifications-guide
  const DUREE_LIEN      = 20000;  // 20s pour les notifications avec lien

  /* ─── État global ────────────────────────────────────── */
  let file = [];        // file d'attente mélangée
  let index = 0;        // position courante dans la file
  let encours = false;  // une notification est-elle visible ?

  /* ─── Injection CSS ──────────────────────────────────── */
  function injectStyles() {
    if (document.getElementById("albexia-notif-styles")) return;

    const css = `
      #albexia-toast {
        position: fixed;
        bottom: 28px;
        right: 28px;
        z-index: 9999;
        max-width: 340px;
        width: calc(100vw - 56px);

        background: rgba(26, 26, 30, 0.78);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        border: 1px solid rgba(255, 107, 157, 0.28);
        border-radius: 16px;
        box-shadow:
          0 8px 32px rgba(0, 0, 0, 0.5),
          0 0 0 1px rgba(255, 255, 255, 0.04) inset;

        padding: 14px 16px 14px 14px;
        display: flex;
        align-items: flex-start;
        gap: 12px;
        overflow: hidden;

        opacity: 0;
        transform: translateY(20px) scale(0.96);
        transition:
          opacity 0.35s cubic-bezier(.22,1,.36,1),
          transform 0.35s cubic-bezier(.22,1,.36,1);
        pointer-events: none;
      }

      #albexia-toast.visible {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: all;
      }

      #albexia-toast.hiding {
        opacity: 0;
        transform: translateY(12px) scale(0.94);
        pointer-events: none;
      }

      /* Logos */
      .alb-notif-logos {
        flex-shrink: 0;
        display: flex;
        align-items: center;
      }
      .alb-notif-logos img {
        width: 36px;
        height: 36px;
        border-radius: 8px;
        border: 2px solid rgba(26, 26, 30, 0.9);
        object-fit: cover;
        background: #2a2a30;
        display: block;
      }
      .alb-notif-logos img:not(:first-child) {
        margin-left: -10px;
      }

      /* Corps */
      .alb-notif-body {
        flex: 1;
        min-width: 0;
        text-decoration: none;
      }
      .alb-notif-label {
        font-size: 10px;
        font-weight: 700;
        letter-spacing: .08em;
        text-transform: uppercase;
        color: #ff6b9d;
        margin-bottom: 3px;
        font-family: system-ui, sans-serif;
      }
      .alb-notif-message {
        font-size: 13px;
        line-height: 1.45;
        color: #f0f0f5;
        font-family: system-ui, sans-serif;
        font-weight: 500;
        margin: 0;
      }
      .alb-notif-cta {
        display: inline-block;
        margin-top: 7px;
        font-size: 11px;
        font-weight: 700;
        color: #ff6b9d;
        font-family: system-ui, sans-serif;
        letter-spacing: .03em;
      }
      .alb-notif-cta::after { content: " →"; }

      /* Bouton fermer */
      .alb-notif-close {
        flex-shrink: 0;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        border: none;
        background: rgba(255,255,255,0.08);
        color: rgba(240,240,245,0.55);
        font-size: 14px;
        line-height: 1;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background .2s, color .2s;
        padding: 0;
        margin-top: 1px;
      }
      .alb-notif-close:hover {
        background: rgba(255, 107, 157, 0.22);
        color: #ff6b9d;
      }

      /* Barre de progression */
      .alb-notif-bar {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 3px;
        border-radius: 0 0 16px 16px;
        background: linear-gradient(90deg, #ff6b9d, #ff9dc8);
        width: 100%;
        transform-origin: left center;
        transform: scaleX(1);
      }

      /* Lien cliquable sur tout le toast */
      #albexia-toast.is-lien {
        cursor: pointer;
      }

      @media (max-width: 480px) {
        #albexia-toast {
          bottom: 16px;
          right: 16px;
          left: 16px;
          width: auto;
          max-width: none;
        }
      }
    `;

    const style = document.createElement("style");
    style.id = "albexia-notif-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ─── Mélange aléatoire (Fisher-Yates) ──────────────── */
  function melanger(tableau) {
    const t = tableau.slice();
    for (let i = t.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [t[i], t[j]] = [t[j], t[i]];
    }
    return t;
  }

  /* ─── Vérifier sessionStorage ────────────────────────── */
  function estDismiss(id) {
    try { return !!sessionStorage.getItem(SS_PREFIX + id); }
    catch (e) { return false; }
  }

  function marquerDismiss(id) {
    try { sessionStorage.setItem(SS_PREFIX + id, "1"); }
    catch (e) {}
  }

  /* ─── Construire le DOM du toast ─────────────────────── */
  function buildToast(notif) {
    const toast = document.createElement("div");
    toast.id = "albexia-toast";

    const isLien = notif.type !== "guide";
    if (isLien) toast.classList.add("is-lien");

    /* Barre progression */
    const bar = document.createElement("div");
    bar.className = "alb-notif-bar";
    toast.appendChild(bar);

    /* Zone logo */
    if (notif.type === "groupe" && notif.outils) {
      const logoZone = document.createElement("div");
      logoZone.className = "alb-notif-logos";
      notif.outils.slice(0, 4).forEach(function (outil) {
        const img = document.createElement("img");
        img.src = "https://www.google.com/s2/favicons?domain=" + outil.domaine + "&sz=128";
        img.alt = outil.nom;
        logoZone.appendChild(img);
      });
      toast.appendChild(logoZone);

    } else if ((notif.type === "lien" || notif.type === "solo") && notif.tool) {
      const logoZone = document.createElement("div");
      logoZone.className = "alb-notif-logos";
      const img = document.createElement("img");
      img.src = "https://www.google.com/s2/favicons?domain=" + notif.tool.domaine + "&sz=128";
      img.alt = notif.tool.nom;
      logoZone.appendChild(img);
      toast.appendChild(logoZone);
    }

    /* Corps */
    const body = document.createElement("div");
    body.className = "alb-notif-body";

    const label = document.createElement("div");
    label.className = "alb-notif-label";
    label.textContent =
      notif.type === "guide"  ? "Conseil"         :
      notif.type === "groupe" ? "Nouveautés"       :
                                "Outil en vedette";
    body.appendChild(label);

    const msg = document.createElement("p");
    msg.className = "alb-notif-message";
    msg.textContent = notif.message;
    body.appendChild(msg);

    if (notif.cta) {
      const cta = document.createElement("span");
      cta.className = "alb-notif-cta";
      cta.textContent = notif.cta;
      body.appendChild(cta);
    }

    toast.appendChild(body);

    /* Bouton [×] uniquement pour les notifications avec lien */
    if (isLien) {
      const closeBtn = document.createElement("button");
      closeBtn.className = "alb-notif-close";
      closeBtn.textContent = "×";
      closeBtn.setAttribute("aria-label", "Fermer");
      closeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        marquerDismiss(notif.id);
        fermerToast(toast, false); /* false = pas d'enchaînement */
      });
      toast.appendChild(closeBtn);

      /* Clic sur le toast = navigation */
      toast.addEventListener("click", function () {
        if (notif.lien && notif.lien !== "#") {
          window.location.href = notif.lien;
        }
      });
    }

    return { toast, bar };
  }

  /* ─── Afficher un toast ───────────────────────────────── */
  function afficherNotif(notif) {
    if (encours) return;
    encours = true;

    const { toast, bar } = buildToast(notif);
    document.body.appendChild(toast);

    /* Entrée animée */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        toast.classList.add("visible");
      });
    });

    /* Durée selon le type */
    const duree = notif.type === "guide" ? DUREE_GUIDE : DUREE_LIEN;

    /* Barre de progression */
    bar.style.transition = "transform " + (duree / 1000) + "s linear";
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        bar.style.transform = "scaleX(0)";
      });
    });

    /* Auto-fermeture */
    setTimeout(function () {
      fermerToast(toast, true); /* true = enchaîner */
    }, duree);
  }

  /* ─── Fermer le toast ─────────────────────────────────── */
  function fermerToast(toast, enchainer) {
    toast.classList.remove("visible");
    toast.classList.add("hiding");

    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
      encours = false;

      if (enchainer) {
        /* Attendre 10s puis afficher la prochaine */
        setTimeout(prochaine, DELAI_ENCHAINE);
      }
    }, 400);
  }

  /* ─── Prochaine notification dans la file ─────────────── */
  function prochaine() {
    /* Parcourir la file depuis l'index courant */
    let tentatives = 0;

    while (tentatives < file.length) {
      if (index >= file.length) {
        /* Fin de la file : on mélange à nouveau et on repart */
        file = melanger(file);
        index = 0;
      }

      const notif = file[index];
      index++;
      tentatives++;

      /* Ignorer si dismissed dans cette session */
      if (estDismiss(notif.id)) continue;

      afficherNotif(notif);
      return;
    }

    /* Toutes les notifications ont été dismissées cette session */
    /* On ne fait rien — elles réapparaîtront à la prochaine session */
  }

  /* ─── Point d'entrée ──────────────────────────────────── */
  function init() {
    injectStyles();

    fetch(JSON_URL)
      .then(function (r) {
        if (!r.ok) throw new Error("notifications.json introuvable");
        return r.json();
      })
      .then(function (liste) {
        /* Garder uniquement les notifications actives */
        const actives = liste.filter(function (n) { return n.active; });
        if (!actives.length) return;

        /* Mélanger et préparer la file */
        file = melanger(actives);
        index = 0;

        /* Délai initial avant la 1re notification */
        setTimeout(prochaine, DELAI_INITIAL);
      })
      .catch(function (err) {
        if (typeof console !== "undefined") {
          console.warn("[Albexia Notif]", err.message);
        }
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
