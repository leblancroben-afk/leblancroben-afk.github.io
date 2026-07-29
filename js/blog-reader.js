/* ═══════════════════════════════════════
   AnnuaireIA — blog-reader.js
   Lecture d'articles en modale plein écran
   ═══════════════════════════════════════ */

'use strict';

function createBlogReader() {
  if (document.getElementById('blog-reader-overlay')) return;

  document.body.insertAdjacentHTML('beforeend', `
    <div id="blog-reader-overlay" role="dialog" aria-modal="true">
      <div id="blog-reader-modal">
        <div id="blog-reader-header">
          <button id="blog-reader-close" aria-label="Fermer">✕ Retour au blog</button>
        </div>
        <article id="blog-reader-content"></article>
      </div>
    </div>
  `);

  injectBlogReaderCSS();

  document.getElementById('blog-reader-close').addEventListener('click', closeBlogReader);
  document.getElementById('blog-reader-overlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeBlogReader();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeBlogReader();
  });
}

function injectBlogReaderCSS() {
  if (document.getElementById('blog-reader-style')) return;
  const s = document.createElement('style');
  s.id = 'blog-reader-style';
  s.textContent = `
    #blog-reader-overlay {
      display: none;
      position: fixed; inset: 0; z-index: 500;
      background: rgba(0,0,0,0.7);
      backdrop-filter: blur(8px);
      align-items: flex-start; justify-content: center;
      overflow-y: auto; padding: 24px 16px 48px;
    }
    #blog-reader-overlay.open { display: flex; animation: brFade .25s ease; }
    @keyframes brFade { from { opacity:0; } to { opacity:1; } }

    #blog-reader-modal {
      background: var(--bg2);
      border: 1px solid var(--border-hover);
      border-radius: 18px;
      width: 100%; max-width: 720px;
      animation: brSlide .25s ease;
    }
    @keyframes brSlide {
      from { opacity:0; transform: translateY(20px); }
      to   { opacity:1; transform: translateY(0); }
    }

    #blog-reader-header {
      padding: 16px 24px;
      border-bottom: 1px solid var(--border);
      display: flex; align-items: center;
    }
    #blog-reader-close {
      background: rgba(255,255,255,0.08);
      border: none; color: var(--text-muted);
      font-size: 13px; padding: 7px 14px;
      border-radius: 8px; cursor: pointer;
      font-family: 'DM Sans', sans-serif;
      transition: background .15s;
    }
    #blog-reader-close:hover { background: rgba(255,255,255,0.15); color: var(--text); }

    #blog-reader-content {
      padding: 36px 40px 48px;
    }

    .br-hero { margin-bottom: 32px; }
    .br-cat {
      display: inline-block; font-size: 12px; font-weight: 500;
      padding: 4px 12px; border-radius: 6px; margin-bottom: 16px;
    }
    .br-title {
      font-family: 'Syne', sans-serif;
      font-size: clamp(22px, 4vw, 32px);
      font-weight: 800; line-height: 1.2;
      letter-spacing: -0.5px;
      margin-bottom: 14px; color: var(--text);
    }
    .br-meta {
      display: flex; align-items: center; gap: 16px;
      font-size: 13px; color: var(--text-dim);
      flex-wrap: wrap;
    }
    .br-meta span { display: flex; align-items: center; gap: 5px; }
    .br-divider {
      border: none; border-top: 1px solid var(--border);
      margin: 28px 0;
    }
    .br-intro {
      font-size: 17px; color: var(--text-muted);
      line-height: 1.8; font-weight: 300;
      border-left: 3px solid var(--accent);
      padding-left: 20px; margin-bottom: 28px;
    }
    .br-h2 {
      font-family: 'Syne', sans-serif;
      font-size: 20px; font-weight: 700;
      margin: 32px 0 14px; color: var(--text);
    }
    .br-p {
      font-size: 15px; color: var(--text-muted);
      line-height: 1.85; margin-bottom: 18px;
      font-weight: 300;
    }
    .br-tip {
      background: rgba(108,99,255,0.1);
      border: 1px solid rgba(108,99,255,0.25);
      border-radius: 10px; padding: 14px 18px;
      font-size: 14px; color: #a8a3ff;
      line-height: 1.7; margin: 20px 0;
    }
    .br-tip::before { content: '💡 '; }
    .br-conclusion {
      background: rgba(0,212,170,0.08);
      border: 1px solid rgba(0,212,170,0.2);
      border-radius: 10px; padding: 18px 20px;
      font-size: 15px; color: #00d4aa;
      line-height: 1.7; margin-top: 28px; font-weight: 400;
    }
    .br-conclusion::before { content: '✅ En résumé — '; font-weight: 600; }
    .br-tags { margin-top: 32px; display: flex; gap: 8px; flex-wrap: wrap; }
    .br-tag {
      font-size: 12px; padding: 4px 12px;
      background: rgba(255,255,255,0.06);
      border: 1px solid var(--border);
      border-radius: 20px; color: var(--text-dim);
    }

    @media (max-width: 600px) {
      #blog-reader-content { padding: 24px 20px 36px; }
      .br-title { font-size: 22px; }
    }
  `;
  document.head.appendChild(s);
}

function openBlogReader(post) {
  const col = window.blogColorsMap ? window.blogColorsMap[post.category] : null;
  const tagBg    = col ? col.tagBg    : 'rgba(255,255,255,0.08)';
  const tagColor = col ? col.tagColor : '#aaa';

  let bodyHtml = '';
  if (post.content && post.content.length) {
    post.content.forEach(block => {
      if      (block.type === 'intro')      bodyHtml += `<p class="br-intro">${block.text}</p>`;
      else if (block.type === 'h2')         bodyHtml += `<h2 class="br-h2">${block.text}</h2>`;
      else if (block.type === 'p')          bodyHtml += `<p class="br-p">${block.text}</p>`;
      else if (block.type === 'tip')        bodyHtml += `<div class="br-tip">${block.text}</div>`;
      else if (block.type === 'conclusion') bodyHtml += `<div class="br-conclusion">${block.text}</div>`;
    });
  } else {
    bodyHtml = `<p class="br-p">${post.excerpt}</p>`;
  }

  const tagsHtml = (post.tags || []).map(t => `<span class="br-tag">#${t}</span>`).join('');

  document.getElementById('blog-reader-content').innerHTML = `
    <div class="br-hero">
      <span class="br-cat" style="background:${tagBg};color:${tagColor}">${post.category}</span>
      <h1 class="br-title">${post.emoji} ${post.title}</h1>
      <div class="br-meta">
        <span>📅 ${post.date}</span>
        <span>⏱ ${post.readTime} de lecture</span>
        <span>✍️ ${post.author}</span>
      </div>
    </div>
    <hr class="br-divider">
    ${bodyHtml}
    <div class="br-tags">${tagsHtml}</div>
  `;

  document.getElementById('blog-reader-overlay').classList.add('open');
  document.getElementById('blog-reader-modal').scrollTop = 0;
  document.body.style.overflow = 'hidden';
}

function closeBlogReader() {
  document.getElementById('blog-reader-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

window.BlogReader = { createBlogReader, openBlogReader };
