#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen_faq.py — Albexia
Génère les 40 pages FAQ statiques depuis data/faq.json + pages/faq-single.html
Chaque question produit : faq/<id>/index.html

Usage :
    python gen_faq.py

Structure attendue du dépôt :
    data/faq.json
    pages/faq-single.html
    faq/                  ← créé automatiquement
"""

import json
import os
import re
import shutil
from pathlib import Path

# ─── CHEMINS ───────────────────────────────────────────────────────────────
ROOT        = Path(__file__).parent
FAQ_JSON    = ROOT / "data" / "faq.json"
TEMPLATE    = ROOT / "pages" / "faq-single.html"
OUTPUT_DIR  = ROOT / "faq"

# ─── CONTENU PAR DÉFAUT PAR QUESTION ───────────────────────────────────────
# Clé : id de la question
# Si une question n'est pas dans ce dict, un contenu générique est utilisé.
# Remplacez chaque valeur par le vrai contenu éditorial.

CONTENT = {
    "cest-quoi-ia-generative": {
        "title":       "C'est quoi l'IA générative ?",
        "description": "L'IA générative désigne les systèmes capables de créer du contenu original : texte, image, audio ou vidéo. Découvrez comment elle fonctionne et pourquoi elle change tout.",
        "answer":      "L'IA générative désigne des systèmes capables de <strong>créer du contenu original</strong> — texte, image, code, audio ou vidéo — à partir d'une instruction. Contrairement aux IA classiques qui analysent ou classifient, elle <strong>produit</strong> quelque chose de nouveau à chaque requête.",
        "answer_schema": "L'IA générative désigne des systèmes capables de créer du contenu original — texte, image, code, audio ou vidéo — à partir d'une instruction. Contrairement aux IA classiques qui analysent ou classifient, elle produit quelque chose de nouveau à chaque requête.",
        "sections": [
            {
                "h2": "Comment fonctionne l'IA générative ?",
                "body": """<p>Ces systèmes sont entraînés sur des milliards d'exemples (textes, images, sons) pour apprendre les patterns du langage et du visuel. Lors d'une requête, ils génèrent une réponse probable et cohérente basée sur cet apprentissage.</p>
<ul>
  <li><strong>Grands modèles de langage (LLM) :</strong> spécialisés dans le texte — ChatGPT, Claude, Gemini.</li>
  <li><strong>Modèles de diffusion :</strong> spécialisés dans l'image — Midjourney, DALL-E 3, Stable Diffusion.</li>
  <li><strong>Modèles vidéo :</strong> Sora, Veo, Runway Gen-3.</li>
</ul>"""
            },
            {
                "h2": "Pourquoi c'est important pour vous ?",
                "body": """<p>L'IA générative rend accessibles des tâches qui demandaient auparavant des compétences spécialisées : rédiger un article, créer un logo, générer du code ou traduire une vidéo. Pour les francophones, des outils comme ceux répertoriés sur Albexia permettent de travailler entièrement en français.</p>"""
            }
        ],
        "related": [
            ("cest-quoi-un-llm",             "C'est quoi un LLM ?"),
            ("cest-quoi-un-prompt",          "C'est quoi un prompt ?"),
            ("cest-quoi-une-ia-multimodale", "Qu'est-ce qu'une IA multimodale ?"),
            ("pourquoi-ia-invente-fausses-infos", "Pourquoi l'IA invente-t-elle de fausses informations ?"),
        ],
        "cta_title":  "Explorez les meilleurs outils IA",
        "cta_sub":    "Catalogue francophone classé par catégorie et usage.",
        "cta_url":    "/outils/",
        "cta_btn":    "Voir le catalogue",
    },

    "chatgpt-est-il-gratuit": {
        "title":       "ChatGPT est-il gratuit ?",
        "description": "ChatGPT propose une version gratuite avec des limitations. Découvrez la différence entre la version gratuite et ChatGPT Plus, et quand passer à la version payante.",
        "answer":      "Oui, <strong>ChatGPT est disponible gratuitement</strong> sans abonnement. La version gratuite donne accès au modèle GPT-4o mini avec des limitations de débit. Pour GPT-4o complet, la génération d'images et les GPTs avancés, l'abonnement <strong>ChatGPT Plus à 20 $/mois</strong> est nécessaire.",
        "answer_schema": "Oui, ChatGPT est disponible gratuitement. La version gratuite donne accès au modèle GPT-4o mini avec des limitations de débit. Pour GPT-4o complet, la génération d'images et les GPTs avancés, l'abonnement ChatGPT Plus à 20 $/mois est nécessaire.",
        "sections": [
            {
                "h2": "Ce que vous obtenez avec la version gratuite",
                "body": """<p>La version gratuite est accessible sans carte bancaire. Elle couvre la majorité des tâches quotidiennes : rédaction, résumés, code simple, traduction.</p>
<ul>
  <li><strong>Modèle :</strong> GPT-4o mini</li>
  <li><strong>Accès web :</strong> limité</li>
  <li><strong>Génération d'images :</strong> non disponible</li>
  <li><strong>Analyse de fichiers :</strong> non disponible</li>
  <li><strong>Quota :</strong> limité par jour</li>
</ul>"""
            },
            {
                "h2": "Ce que ChatGPT Plus débloque",
                "body": """<p>À 20 $/mois, ChatGPT Plus s'adresse aux utilisateurs réguliers ou professionnels.</p>
<ul>
  <li><strong>GPT-4o complet :</strong> raisonnement plus profond, meilleure gestion des textes longs</li>
  <li><strong>DALL-E 3 intégré :</strong> génération d'images dans le chat</li>
  <li><strong>Navigation web :</strong> accès aux informations récentes</li>
  <li><strong>Analyse de fichiers :</strong> PDF, CSV, Excel</li>
  <li><strong>Mode voix avancé :</strong> conversation audio naturelle</li>
</ul>"""
            },
            {
                "h2": "Tableau comparatif",
                "body": """<div class="faq-table-wrap">
<table class="faq-table">
  <thead><tr><th>Fonctionnalité</th><th>Gratuit</th><th>Plus (20 $/mois)</th></tr></thead>
  <tbody>
    <tr><td>Modèle principal</td><td>GPT-4o mini</td><td><strong>GPT-4o complet</strong></td></tr>
    <tr><td>Génération d'images</td><td>Non</td><td><strong>Oui (DALL-E 3)</strong></td></tr>
    <tr><td>Navigation web</td><td>Limitée</td><td><strong>Illimitée</strong></td></tr>
    <tr><td>Analyse de fichiers</td><td>Non</td><td><strong>Oui</strong></td></tr>
    <tr><td>Quota journalier</td><td>Limité</td><td><strong>Élevé</strong></td></tr>
  </tbody>
</table>
</div>"""
            }
        ],
        "related": [
            ("difference-gratuit-payant-chatgpt", "Quelle est la différence entre la version gratuite et payante de ChatGPT ?"),
            ("chatgpt-ou-gemini-lequel-choisir",  "ChatGPT ou Gemini : lequel choisir ?"),
            ("claude-ou-chatgpt-lequel-meilleur", "Claude ou ChatGPT : lequel est le meilleur ?"),
            ("utiliser-chatgpt-sans-compte",      "Peut-on utiliser ChatGPT sans créer de compte ?"),
        ],
        "cta_title": "Comparez tous les outils IA",
        "cta_sub":   "Trouvez l'alternative gratuite ou payante qui correspond à votre usage.",
        "cta_url":   "/outils/",
        "cta_btn":   "Voir le catalogue",
    },
}

# ─── TEMPLATE PAR DÉFAUT (questions sans contenu éditorial défini) ──────────
def default_content(item, cat_label):
    """Génère un contenu minimal pour les questions sans entrée dans CONTENT."""
    return {
        "title":         item["question"],
        "description":   f"Réponse claire et détaillée à la question : {item['question']} — FAQ Albexia, l'annuaire IA francophone.",
        "answer":        f"<strong>Cette page est en cours de rédaction.</strong> Revenez bientôt pour une réponse complète à cette question sur {cat_label.lower()}.",
        "answer_schema": f"Cette page est en cours de rédaction. Revenez bientôt pour une réponse complète.",
        "sections": [
            {
                "h2":  "Pourquoi cette question est importante",
                "body": f"<p>La question « {item['question']} » revient fréquemment parmi les utilisateurs francophones d'outils IA. Nous préparons une réponse approfondie avec des exemples concrets et des comparatifs.</p>"
            }
        ],
        "related": [],
        "cta_title": "Explorez nos outils IA",
        "cta_sub":   "Catalogue francophone classé par catégorie et usage.",
        "cta_url":   "/outils/",
        "cta_btn":   "Voir le catalogue",
    }

# ─── GÉNÉRATEUR HTML ────────────────────────────────────────────────────────
def render_sections(sections):
    parts = []
    for s in sections:
        parts.append(f'      <h2>{s["h2"]}</h2>')
        parts.append(f'      {s["body"]}')
    return "\n".join(parts)

def render_related(related):
    if not related:
        return ""
    items = "\n".join(
        f'        <li><a href="/faq/{rid}/">{rlabel}</a></li>'
        for rid, rlabel in related
    )
    return f"""
    <nav class="faq-related" aria-label="Questions liées">
      <p class="faq-related-title">Questions liées</p>
      <ul class="faq-related-list">
{items}
      </ul>
    </nav>"""

def build_page(item, cat_label, cat_emoji):
    qid = item["id"]
    c   = CONTENT.get(qid, default_content(item, cat_label))

    breadcrumb_current = c["title"]
    sections_html      = render_sections(c["sections"])
    related_html       = render_related(c["related"])

    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{c['title']} — FAQ Albexia</title>
  <meta name="description" content="{c['description']}" />

  <!-- Open Graph -->
  <meta property="og:title"       content="{c['title']} — FAQ Albexia" />
  <meta property="og:description" content="{c['description']}" />
  <meta property="og:type"        content="article" />
  <meta property="og:url"         content="https://albexia.com/faq/{qid}/" />
  <meta property="og:image"       content="/assets/preview.jpg" />

  <!-- hreflang -->
  <link rel="alternate" hreflang="fr" href="https://albexia.com/faq/{qid}/" />

  <!-- Schema.org -->
  <script type="application/ld+json">
  {{
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [{{
      "@type": "Question",
      "name": "{c['title']}",
      "acceptedAnswer": {{
        "@type": "Answer",
        "text": "{c['answer_schema']}"
      }}
    }}]
  }}
  </script>

  <link rel="stylesheet" href="/style.css" />
  <link rel="stylesheet" href="/css/faq.css" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet" />
</head>
<body>

  <nav>
    <a href="/" class="logo">Albexia<span class="dot">.</span></a>
    <div class="nav-links">
      <a href="/outils/"  class="nav-link">Outils</a>
      <a href="/blog/"    class="nav-link">Blog</a>
      <a href="/galerie/" class="nav-link">Galerie</a>
      <a href="/faq/"     class="nav-link active">FAQ</a>
    </div>
  </nav>

  <main class="container">

    <nav class="breadcrumb" aria-label="Fil d'Ariane">
      <a href="/">Accueil</a>
      <span class="breadcrumb-sep">›</span>
      <a href="/faq/">FAQ</a>
      <span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-current">{breadcrumb_current}</span>
    </nav>

    <header class="faq-page-header">
      <h1>{c['title']}</h1>
    </header>

    <div class="faq-answer-box" role="note" aria-label="Réponse rapide">
      <div class="faq-answer-label">Réponse rapide</div>
      <p>{c['answer']}</p>
    </div>

    <article class="faq-content">
{sections_html}
    </article>
{related_html}
    <div class="faq-cta-block">
      <div class="faq-cta-text">
        <h3>{c['cta_title']}</h3>
        <p>{c['cta_sub']}</p>
      </div>
      <a href="{c['cta_url']}" class="btn-main">{c['cta_btn']}</a>
    </div>

  </main>

  <footer>
    <p>© 2025 Albexia · <a href="/mentions-legales.html">Mentions légales</a> · <a href="/confidentialite.html">Confidentialité</a></p>
  </footer>

</body>
</html>"""

# ─── MAIN ───────────────────────────────────────────────────────────────────
def main():
    # Charger le JSON
    with open(FAQ_JSON, encoding="utf-8") as f:
        data = json.load(f)

    # Préparer le dossier de sortie
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    total = 0
    for cat in data:
        cat_label = cat["label"]
        cat_emoji = cat["emoji"]
        for item in cat["questions"]:
            qid      = item["id"]
            dest_dir = OUTPUT_DIR / qid
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest_file = dest_dir / "index.html"

            html = build_page(item, cat_label, cat_emoji)
            dest_file.write_text(html, encoding="utf-8")
            print(f"  ✓  faq/{qid}/index.html")
            total += 1

    print(f"\n{total} pages générées dans {OUTPUT_DIR}/")

if __name__ == "__main__":
    main()
