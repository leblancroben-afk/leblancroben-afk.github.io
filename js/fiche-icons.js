/* =========================================================
   fiche-icons.js — bibliothèque d'icônes SVG de la fiche outil
   Source UNIQUE, partagée par :
     - fiche-outil.js (génération, Node)      → require('./js/fiche-icons.js')
     - admin/index.html (sélecteur d'icônes)  → <script src="/js/fiche-icons.js">
   Aucun emoji : tout est dessiné en SVG.
   ========================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FICHE_ICONS = factory();
}(typeof self !== 'undefined' ? self : this, function () {

  // Icônes « trait » (viewBox 24) — proposées dans l'admin pour les fonctionnalités
  const STROKE = {
    pen:       ['Rédaction',     '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'],
    wand:      ['Magie / IA',    '<path d="M15 4l5 5L9 20l-5-5L15 4zM5 3v4M3 5h4M19 15v4M17 17h4"/>'],
    sparkles:  ['Étincelles',    '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>'],
    file:      ['Document',      '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'],
    bulb:      ['Idée',          '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z"/>'],
    language:  ['Traduction',    '<path d="M4 5h9M8.5 3v2M6 5c0 4 3 7 6 8M11 5c0 3-3 7-7 9M13 20l4-9 4 9M14.5 17h5"/>'],
    gears:     ['Automatisation','<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'],
    image:     ['Image',         '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>'],
    video:     ['Vidéo',         '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3"/>'],
    music:     ['Audio / musique','<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'],
    mic:       ['Voix',          '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'],
    camera:    ['Photo',         '<path d="M4 8h3l2-3h6l2 3h3v12H4z"/><circle cx="12" cy="13" r="3.5"/>'],
    code:      ['Code',          '<path d="M8 8l-5 4 5 4M16 8l5 4-5 4M14 5l-4 14"/>'],
    chart:     ['Statistiques',  '<path d="M4 20V4M4 20h16M8 16v-5M13 16V8M18 16v-3"/>'],
    table:     ['Tableau',       '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/>'],
    search:    ['Recherche',     '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/>'],
    shield:    ['Sécurité',      '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'],
    lock:      ['Confidentialité','<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'],
    bolt:      ['Rapidité',      '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>'],
    rocket:    ['Lancement',     '<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M14 4c3-1 6-1 6-1s0 3-1 6l-6 6-5-5z"/><circle cx="15" cy="9" r="1.5"/>'],
    users:     ['Équipe',        '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2.2.6 4 2.4 4 5.5"/>'],
    mail:      ['E-mail',        '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'],
    chat:      ['Conversation',  '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>'],
    robot:     ['Assistant IA',  '<rect x="5" y="8" width="14" height="11" rx="3"/><path d="M12 8V5M9 13h.01M15 13h.01M9 17h6"/><circle cx="12" cy="4" r="1"/>'],
    cloud:     ['Cloud',         '<path d="M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18 9.5 4 4 0 0 1 17.5 18z"/>'],
    download:  ['Export',        '<path d="M12 4v11M7 11l5 5 5-5M4 20h16"/>'],
    link:      ['Intégration',   '<path d="M10 14a4 4 0 0 0 5.6 0l3-3a4 4 0 0 0-5.6-5.6l-1 1M14 10a4 4 0 0 0-5.6 0l-3 3a4 4 0 0 0 5.6 5.6l1-1"/>'],
    layers:    ['Calques / modèles','<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5"/>'],
    book:      ['Apprentissage', '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M9 7h6"/>'],
    clock:     ['Gain de temps', '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
    target:    ['Précision',     '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'],
    globe:     ['Web',           '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'],
    check:     ['Validé',        '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>'],
    star:      ['Favori',        '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'],
    heart:     ['Cœur',          '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>'],
  };

  // Icônes d'interface (non proposées pour les fonctionnalités)
  const UI = {
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
    scale: '<path d="M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0L5 7zM19 7l-3 7a3 3 0 0 0 6 0l-3-7zM8 21h8"/>',
    left:  '<path d="M15 6l-6 6 6 6"/>', right: '<path d="M9 6l6 6-6 6"/>',
    ext:   '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    cal:   '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
    user:  '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    up:    '<path d="M7 11v9H4v-9h3zM7 11l4-8c1.5 0 2.5 1 2.5 2.5V9H19a2 2 0 0 1 2 2.3l-1 6.5A2 2 0 0 1 18 20H7"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
    lang:  '<path d="M4 5h9M8.5 3v2M6 5c0 4 3 7 6 8M11 5c0 3-3 7-7 9M13 20l4-9 4 9M14.5 17h5"/>',
  };

  // Logos de marque (pleins, viewBox 24) — plateformes et réseaux sociaux
  const BRAND = {
    web:      ['Web',      null],   // utilise l'icône trait « globe »
    windows:  ['Windows',  '<path d="M3 5.5l7.5-1v7H3zM12 4.3L21 3v8.5h-9zM3 12.5h7.5v7L3 18.5zM12 12.5H21V21l-9-1.3z"/>'],
    apple:    ['Apple (Mac / iOS)', '<path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>'],
    android:  ['Android',  '<path d="M17.523 15.3414c-.5511 0-.9993-.4486-.9993-.9997s.4483-.9993.9993-.9993c.5511 0 .9993.4483.9993.9993.0001.5511-.4482.9997-.9993.9997m-11.046 0c-.5511 0-.9993-.4486-.9993-.9997s.4482-.9993.9993-.9993c.5511 0 .9993.4483.9993.9993 0 .5511-.4483.9997-.9993.9997m11.4045-6.02l1.9973-3.4592a.416.416 0 00-.1521-.5676.416.416 0 00-.5676.1521l-2.0223 3.503C15.5902 8.2439 13.8533 7.8508 12 7.8508s-3.5902.3931-5.1367 1.0989L4.841 5.4467a.4161.4161 0 00-.5677-.1521.4157.4157 0 00-.1521.5676l1.9973 3.4592C2.6889 11.1867.3432 14.6589 0 18.761h24c-.3435-4.1021-2.6892-7.5743-6.1185-9.4396"/>'],
    linkedin: ['LinkedIn', '<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>'],
    youtube:  ['YouTube',  '<path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>'],
    x:        ['X',        '<path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932zM17.61 20.644h2.039L6.486 3.24H4.298z"/>'],
  };

  // Anciennes fiches : l'icône était un emoji → on le traduit en icône SVG (sinon « sparkles »).
  const EMOJI = {
    '✍️':'pen','✏️':'pen','📝':'pen','🖊️':'pen','🪄':'wand','✨':'sparkles','🤖':'robot','🧠':'robot','📄':'file','📃':'file','📑':'file','📚':'book','📖':'book','🎓':'book',
    '💡':'bulb','🌐':'globe','🌍':'globe','🗣️':'language','🔤':'language','⚙️':'gears','🔧':'gears','🛠️':'gears','🖼️':'image','🎨':'image','🎬':'video','🎥':'video','📹':'video',
    '🎵':'music','🎶':'music','🎙️':'mic','🎤':'mic','📷':'camera','📸':'camera','💻':'code','👨‍💻':'code','📊':'chart','📈':'chart','🔍':'search','🔎':'search','🛡️':'shield','🔒':'lock','🔐':'lock',
    '⚡':'bolt','🚀':'rocket','👥':'users','🤝':'users','📧':'mail','✉️':'mail','💬':'chat','🗨️':'chat','☁️':'cloud','⬇️':'download','📥':'download','🔗':'link','🧩':'link',
    '🗂️':'layers','📚️':'book','⏱️':'clock','⏰':'clock','🎯':'target','✅':'check','✔️':'check','⭐':'star','❤️':'heart',
  };

  function svg(name, cls) {
    const c = cls ? ' ' + cls : '';
    if (name === 'web') name = 'globe';
    if (STROKE[name]) return '<svg class="fo-ico' + c + '" viewBox="0 0 24 24" aria-hidden="true">' + STROKE[name][1] + '</svg>';
    if (UI[name])     return '<svg class="fo-ico' + c + '" viewBox="0 0 24 24" aria-hidden="true">' + UI[name] + '</svg>';
    if (BRAND[name] && BRAND[name][1]) return '<svg class="fo-ico fo-ico-fill' + c + '" viewBox="0 0 24 24" aria-hidden="true">' + BRAND[name][1] + '</svg>';
    return '';
  }
  // Clé d'icône pour une fonctionnalité : clé valide, sinon emoji connu, sinon « sparkles ».
  function featureKey(v) {
    const k = String(v || '').trim();
    if (STROKE[k]) return k;
    return EMOJI[k] || EMOJI[k.replace(/\uFE0F/g, '')] || 'sparkles';
  }
  return { STROKE, UI, BRAND, EMOJI, svg, featureKey, FEATURE_KEYS: Object.keys(STROKE) };
}));
