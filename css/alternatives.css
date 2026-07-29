/* ═══════════════════════════════════════
   PAGE ALTERNATIVES
   À ajouter à la fin de style.css
   ═══════════════════════════════════════ */

/* ─── HERO ALTERNATIVES ─── */
.alt-hero {
  padding: 64px 0 48px;
  text-align: center;
}
.alt-hero h1 {
  font-family: 'Syne', sans-serif;
  font-size: clamp(28px, 5vw, 52px);
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.03em;
  margin-bottom: 16px;
}
.alt-hero h1 .grad {
  background: linear-gradient(135deg, #6c63ff 0%, #ff6b9d 50%, #00d4aa 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.alt-hero p {
  font-size: 16px;
  color: var(--text-muted);
  max-width: 560px;
  margin: 0 auto;
  line-height: 1.7;
  font-weight: 300;
}

/* ─── ESTIMATEUR ─── */
.estimateur-block {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 32px;
  margin-bottom: 40px;
}
.estimateur-block h2 {
  font-family: 'Syne', sans-serif;
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 4px;
}
.estimateur-block .est-subtitle {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 24px;
  font-weight: 300;
}
.estimateur-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
  margin-bottom: 24px;
}
.est-tool {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  transition: all .15s;
  user-select: none;
}
.est-tool:hover {
  border-color: var(--border-hover);
}
.est-tool.selected {
  border-color: rgba(255,107,157,0.5);
  background: rgba(255,107,157,0.06);
}
.est-tool img {
  width: 24px;
  height: 24px;
  border-radius: 5px;
  object-fit: contain;
  flex-shrink: 0;
}
.est-tool-info { flex: 1; min-width: 0; }
.est-tool-name {
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Prix éditable */
.est-tool-price-wrap {
  display: flex;
  align-items: center;
  gap: 1px;
  margin-top: 2px;
}
.est-tool-price-label,
.est-tool-price-unit {
  font-size: 11px;
  color: var(--text-dim);
}
.est-tool-price-input {
  width: 44px;
  background: transparent;
  border: none;
  border-bottom: 1px dashed var(--text-dim);
  color: var(--text-dim);
  font-size: 11px;
  font-family: 'DM Sans', sans-serif;
  padding: 0 2px;
  outline: none;
  -moz-appearance: textfield;
  pointer-events: none; /* désactivé tant que non sélectionné */
  transition: color .15s, border-color .15s;
}
.est-tool-price-input::-webkit-outer-spin-button,
.est-tool-price-input::-webkit-inner-spin-button { -webkit-appearance: none; }

/* Quand la tuile est sélectionnée, le champ devient actif */
.est-tool.selected .est-tool-price-input {
  pointer-events: all;
  color: var(--accent2);
  border-bottom-color: var(--accent2);
}
.est-tool.selected .est-tool-price-label,
.est-tool.selected .est-tool-price-unit {
  color: var(--accent2);
}
.est-tool-check {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1.5px solid var(--border-hover);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: transparent;
  transition: all .15s;
}
.est-tool.selected .est-tool-check {
  background: var(--accent2);
  border-color: var(--accent2);
  color: #fff;
}

/* Résultat estimateur */
.est-result {
  background: var(--bg3);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px 24px;
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}
.est-col { flex: 1; min-width: 140px; }
.est-label {
  font-size: 11px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 4px;
}
.est-value {
  font-family: 'Syne', sans-serif;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.5px;
}
.est-value.rouge { color: var(--accent2); }
.est-value.vert  { color: var(--accent3); }
.est-divider {
  width: 1px;
  height: 40px;
  background: var(--border);
  flex-shrink: 0;
}
.est-saving-note {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 3px;
}

@media (max-width: 600px) {
  .estimateur-grid { grid-template-columns: repeat(2, 1fr); }
  .est-result { flex-direction: column; gap: 14px; }
  .est-divider { display: none; }
}

/* ─── RECHERCHE & FILTRES ─── */
.alt-search-section { margin-bottom: 40px; }

/* ─── CATÉGORIES ─── */
.alt-category { margin-bottom: 56px; }
.alt-cat-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 20px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--border);
}
.alt-cat-numero {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-dim);
  letter-spacing: 0.1em;
  font-family: 'DM Sans', sans-serif;
}
.alt-cat-titre {
  font-family: 'Syne', sans-serif;
  font-size: 20px;
  font-weight: 700;
  flex: 1;
}
.alt-cat-focus {
  font-size: 10px;
  color: var(--text-dim);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border);
  padding: 3px 10px;
  border-radius: 20px;
}
.alt-cat-count {
  font-size: 11px;
  color: var(--accent2);
  font-weight: 600;
  white-space: nowrap;
}

/* Guide recommandé — carte */
.guide-card {
  background: var(--bg2);
  border: 1px solid rgba(255,107,157,0.2);
  border-radius: 14px;
  padding: 22px 24px;
  display: flex;
  gap: 18px;
  align-items: flex-start;
  margin-bottom: 16px;
  cursor: pointer;
  transition: all .2s;
  text-decoration: none;
  color: inherit;
  position: relative;
  overflow: hidden;
}
.guide-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  background: linear-gradient(90deg, #ff6b9d, #6c63ff);
}
.guide-card:hover {
  border-color: rgba(255,107,157,0.4);
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
}
.guide-card-logo {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: var(--bg3);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
}
.guide-card-logo img {
  width: 28px;
  height: 28px;
  object-fit: contain;
}
.guide-card-body { flex: 1; min-width: 0; }
.guide-card-label {
  font-size: 10px;
  font-weight: 700;
  color: var(--accent2);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 5px;
}
.guide-card-titre {
  font-family: 'Syne', sans-serif;
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 6px;
  line-height: 1.3;
}
.guide-card-desc {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.6;
  font-weight: 300;
  margin-bottom: 10px;
}
.guide-card-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.guide-card-economie {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent3);
  background: rgba(0,212,170,0.1);
  border: 1px solid rgba(0,212,170,0.2);
  padding: 3px 10px;
  border-radius: 6px;
}
.guide-card-metrique {
  font-size: 11px;
  color: var(--text-dim);
}
.guide-card-cta {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent2);
  white-space: nowrap;
  margin-top: 2px;
  align-self: flex-end;
  flex-shrink: 0;
}
.guide-card-cta::after { content: ' →'; }

/* Alternatives — liste de liens */
.alt-list { list-style: none; padding: 0; margin: 0; }
.alt-list-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 9px 0;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
}
.alt-list-item:last-child { border-bottom: none; }
.alt-list-item a {
  color: var(--text);
  text-decoration: none;
  font-weight: 500;
  transition: color .15s;
}
.alt-list-item a:hover { color: var(--accent2); }
.alt-list-sep {
  color: var(--text-dim);
  font-size: 12px;
}
.alt-list-desc {
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 300;
  flex: 1;
}
.alt-list-tag {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-dim);
  background: rgba(255,255,255,0.04);
  border: 1px solid var(--border);
  padding: 2px 8px;
  border-radius: 5px;
  white-space: nowrap;
  letter-spacing: 0.03em;
  flex-shrink: 0;
}

/* ─── PROTOCOLE DE SÉLECTION ─── */
.protocole-block {
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: 18px;
  padding: 32px;
  margin-bottom: 40px;
}
.protocole-block h2 {
  font-family: 'Syne', sans-serif;
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 4px;
}
.protocole-block .proto-sub {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 24px;
  font-weight: 300;
}
.protocole-list { list-style: none; padding: 0; margin: 0; }
.protocole-list li {
  display: flex;
  gap: 16px;
  padding: 16px 0;
  border-bottom: 1px solid var(--border);
}
.protocole-list li:last-child { border-bottom: none; }
.proto-num {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: rgba(108,99,255,0.12);
  border: 1px solid rgba(108,99,255,0.25);
  color: #a8a3ff;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.proto-body { flex: 1; }
.proto-titre {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 3px;
}
.proto-desc {
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.6;
  font-weight: 300;
}

/* ─── CTA SOUMETTRE ─── */
.alt-cta-block {
  border: 1px solid rgba(108,99,255,0.25);
  background: rgba(108,99,255,0.06);
  border-radius: 14px;
  padding: 28px 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 40px;
  flex-wrap: wrap;
}
.alt-cta-text h3 {
  font-family: 'Syne', sans-serif;
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 5px;
}
.alt-cta-text p {
  font-size: 13px;
  color: var(--text-muted);
  font-weight: 300;
  max-width: 440px;
  line-height: 1.6;
}
.alt-cta-block a.btn-main {
  display: inline-block;
  text-decoration: none;
  white-space: nowrap;
}

/* ─── ASTUCE GLOSSAIRE ─── */
.alt-tip {
  background: rgba(245,166,35,0.07);
  border: 1px solid rgba(245,166,35,0.2);
  border-radius: 12px;
  padding: 14px 20px;
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 60px;
  line-height: 1.6;
}
.alt-tip a {
  color: var(--accent-amber);
  text-decoration: none;
  font-weight: 500;
}
.alt-tip a:hover { text-decoration: underline; }

/* ─── RESPONSIVE ─── */
@media (max-width: 768px) {
  .alt-hero { padding: 40px 0 32px; }
  .estimateur-block { padding: 20px; }
  .protocole-block  { padding: 20px; }
  .alt-cta-block    { padding: 20px; flex-direction: column; align-items: flex-start; }
  .guide-card { flex-direction: column; gap: 12px; }
  .guide-card-cta { align-self: flex-start; }
  .alt-list-item { flex-wrap: wrap; }
}
@media (max-width: 480px) {
  .alt-cat-focus { display: none; }
  .estimateur-block { padding: 16px; }
  .est-value { font-size: 18px; }
}

/* ─── CORRECTIFS DÉBORDEMENT MOBILE ─── */

/* Empêche tout débordement horizontal global sur les blocs de la page */
.alt-hero,
.estimateur-block,
.protocole-block,
.alt-cta-block,
.alt-category,
.alt-search-section,
.alt-tip,
.guide-card,
.est-result {
  box-sizing: border-box;
  max-width: 100%;
}

/* Liste alternatives : empêche les éléments fixes de sortir */
@media (max-width: 480px) {
  .alt-list-item {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-areas:
      "link  tag"
      "desc  desc";
    align-items: start;
    gap: 4px 8px;
  }
  .alt-list-item a       { grid-area: link; }
  .alt-list-sep          { display: none; }
  .alt-list-desc         { grid-area: desc; font-size: 12px; }
  .alt-list-tag          { grid-area: tag; justify-self: end; }

  /* En-tête catégorie : empêche le débordement du badge + compteur */
  .alt-cat-header {
    flex-wrap: wrap;
    gap: 6px 12px;
  }
  .alt-cat-titre { font-size: 17px; }
  .alt-cat-count { width: 100%; }

  /* Estimateur : réduction padding + colonnes 1 seule si très petit */
  .estimateur-block { padding: 14px 12px; }
  .estimateur-grid  { grid-template-columns: 1fr 1fr; gap: 8px; }

  /* Résultat estimateur : colonnes pleine largeur */
  .est-col { min-width: 0; width: 100%; }

  /* Guide card : padding réduit */
  .guide-card { padding: 16px 14px; }

  /* CTA block */
  .alt-cta-block { padding: 16px 14px; }

  /* Protocole */
  .protocole-block { padding: 14px 12px; }
}

/* Sécurité globale contre le scroll horizontal (à placer sur le wrapper principal) */
@media (max-width: 600px) {
  .alt-list-item {
    column-gap: 6px;
  }
  /* Évite que white-space:nowrap sur les tags force un scroll */
  .alt-list-tag {
    font-size: 9px;
    padding: 2px 6px;
  }
}
