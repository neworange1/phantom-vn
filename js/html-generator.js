/**
 * html-generator.js — 暮舟 HTML 生成引擎
 *
 * 将排版面板的内容 + 场景数据生成为独立自包含的 .html 视觉小说文件。
 *
 * 使用方式：
 *   const html = HtmlGenerator.generate({
 *     title: '我的视觉小说',
 *     author: '作者名',
 *     scenes: [...],
 *     template: 'sakura',
 *     mode: 'theater' | 'scroll',
 *     options: { petals, scrollReveal, fontSize, ... }
 *   });
 *   // 然后触发 Blob 下载
 */

const HtmlGenerator = (() => {

  // ══════════════════════════════════════
  // 背景模板配置
  // ══════════════════════════════════════
  const TEMPLATES = {
    sakura: {
      name: '桃花',
      bg: 'linear-gradient(180deg, #fff0f5 0%, #ffe4ec 40%, #fce4ec 100%)',
      textColor: '#4a3040',
      accentColor: '#c06080',
      dialogBg: 'rgba(255,245,248,0.92)',
      fontFamily: '"Noto Serif SC","STSong",Georgia,serif'
    },
    night: {
      name: '夜空',
      bg: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
      textColor: '#e0d8d0',
      accentColor: '#c8a8e0',
      dialogBg: 'rgba(20,20,40,0.90)',
      fontFamily: '"Noto Serif SC","STSong",Georgia,serif'
    },
    parchment: {
      name: '羊皮纸',
      bg: 'linear-gradient(180deg, #f5e6c8 0%, #e8d5a8 50%, #dcc8a0 100%)',
      textColor: '#4a3528',
      accentColor: '#8b6914',
      dialogBg: 'rgba(245,235,220,0.92)',
      fontFamily: '"KaiTi","STKaiti","楷体","Noto Serif SC",serif'
    },
    ink: {
      name: '水墨',
      bg: 'linear-gradient(180deg, #f5f0e8 0%, #e8e0d0 50%, #d8d0c0 100%)',
      textColor: '#2a2018',
      accentColor: '#6a4030',
      dialogBg: 'rgba(248,244,236,0.94)',
      fontFamily: '"KaiTi","STKaiti","楷体","Noto Serif SC",serif'
    },
    starry: {
      name: '星空',
      bg: 'linear-gradient(180deg, #0d1b2a 0%, #1b2838 40%, #2a1a3e 100%)',
      textColor: '#d0c8e0',
      accentColor: '#e0c060',
      dialogBg: 'rgba(15,10,30,0.90)',
      fontFamily: '"Noto Serif SC","STSong",Georgia,serif'
    }
  };

  // ══════════════════════════════════════
  // 生成核心
  // ══════════════════════════════════════
  function generate(params) {
    const {
      title = '未命名视觉小说',
      author = '佚名',
      scenes = [],
      template = 'sakura',
      mode = 'scroll',
      options = {}
    } = params;

    const tpl = TEMPLATES[template] || TEMPLATES.sakura;
    const o = {
      petals: options.petals !== false,
      scrollReveal: options.scrollReveal !== false,
      fontSize: options.fontSize || '16px',
      showSpeaker: options.showSpeaker !== false,
      ...options
    };

    const contentHTML = mode === 'theater'
      ? buildTheaterHTML(scenes, tpl, o)
      : buildScrollHTML(scenes, tpl, o);

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} — Phantom Wild Visual Novel</title>
<meta name="author" content="${esc(author)}">
<meta name="generator" content="Phantom VN HTML Generator">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&family=Noto+Serif+SC:wght@300;400;500;700&family=Noto+Sans+SC:wght@300;400;500&display=swap" rel="stylesheet">
<style>
/* ══════ 全局样式 ══════ */
* { margin:0; padding:0; box-sizing:border-box; }
html { font-size: ${o.fontSize}; }
body {
  font-family: ${tpl.fontFamily};
  color: ${tpl.textColor};
  background: ${tpl.bg};
  min-height: 100vh;
  overflow-x: hidden;
}
body.theater-mode { overflow: hidden; height: 100vh; }

/* Top Bar */
.vn-topbar {
  position: fixed; top:0; left:0; right:0; z-index:100;
  height: 48px; display:flex; align-items:center; justify-content:space-between;
  padding: 0 18px;
  background: rgba(0,0,0,0.15);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.vn-topbar-title {
  font-size: .85rem; font-weight: 500;
  color: ${tpl.textColor}; opacity: .8;
  max-width: 60%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.vn-topbar-actions { display:flex; gap:8px; align-items:center; }
.vn-topbar-btn {
  background: rgba(255,255,255,0.12); border: none;
  color: ${tpl.textColor}; opacity: .7;
  font-size: .75rem; cursor: pointer;
  padding: 4px 10px; border-radius: 6px;
  transition: all .2s;
}
.vn-topbar-btn:hover { opacity: 1; background: rgba(255,255,255,0.2); }
.vn-topbar-btn.active { opacity: 1; background: ${tpl.accentColor}33; }

/* ══════ 滚动模式 ══════ */
.vn-article {
  max-width: 680px; margin: 60px auto 80px;
  padding: 0 24px;
}
.vn-title-block {
  text-align: center; padding: 40px 0 30px;
}
.vn-title-block h1 {
  font-size: 1.8rem; font-weight: 400;
  letter-spacing: 2px; margin-bottom: 8px;
}
.vn-title-block .vn-author {
  font-size: .85rem; opacity: .6;
}
.vn-scene-block {
  margin: 24px 0 32px;
  padding: 20px 16px;
  background: ${tpl.dialogBg};
  border-radius: 10px;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  box-shadow: 0 2px 12px rgba(0,0,0,0.06);
}
.vn-scene-bg-img {
  width: 100%; border-radius: 8px; margin-bottom: 16px;
  display: block; object-fit: cover;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}
.vn-scene-speaker {
  font-size: .85rem; font-weight: 600;
  color: ${tpl.accentColor}; margin-bottom: 8px;
}
.vn-scene-text {
  font-size: 1rem; line-height: 2;
  white-space: pre-wrap;
}
.vn-scene-marker {
  text-align: center; font-size: .9rem;
  color: ${tpl.accentColor}; opacity: .7;
  padding: 16px 0; letter-spacing: 3px;
  border-bottom: 1px dashed ${tpl.accentColor}33;
  margin-bottom: 16px;
}

/* 分支选项 */
.vn-branch-options {
  display: flex; gap: 8px; flex-wrap: wrap;
  margin-top: 12px; padding-top: 10px;
  border-top: 1px dashed ${tpl.accentColor}22;
}
.vn-branch-btn {
  background: ${tpl.accentColor}18;
  border: 1px solid ${tpl.accentColor}44;
  color: ${tpl.accentColor};
  padding: 6px 14px; border-radius: 16px;
  font-size: .8rem; cursor: pointer;
  font-family: inherit;
  transition: all .2s;
}
.vn-branch-btn:hover { background: ${tpl.accentColor}; color: #fff; }

/* 分割线 */
.vn-sep { text-align:center; padding:12px 0; color:${tpl.textColor}; opacity:.4; letter-spacing:3px; font-size:.8rem; }

/* ══════ 剧场模式 ══════ */
.theater-stage {
  position: fixed; inset: 0; z-index: 1;
  display: flex; flex-direction: column;
  justify-content: flex-end;
  background-size: cover; background-position: center;
}
.theater-dialog {
  padding: 20px 24px 30px;
  background: ${tpl.dialogBg};
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 -4px 20px rgba(0,0,0,0.1);
}
.theater-speaker {
  font-size: .85rem; font-weight: 600;
  color: ${tpl.accentColor}; margin-bottom: 10px;
}
.theater-text-wrapper {
  font-size: 1rem; line-height: 2; min-height: 4em;
  white-space: pre-wrap;
}
.theater-progress {
  position: fixed; top: 60px; right: 20px; z-index: 200;
  font-size: .75rem; color: ${tpl.textColor}; opacity: .5;
}
.theater-nav { position: fixed; bottom: 0; left: 0; right: 0; z-index: 200; display:flex; justify-content:center; gap:20px; padding:12px; }
.theater-nav-btn {
  background: ${tpl.accentColor}33; border: none;
  color: ${tpl.textColor}; font-size: 1rem;
  width: 44px; height: 44px; border-radius: 50%;
  cursor: pointer; transition: all .2s;
  display: flex; align-items: center; justify-content: center;
}
.theater-nav-btn:hover { background: ${tpl.accentColor}; color: #fff; }

/* ══════ 花瓣（Canvas）══════ */
#vn-petals { position:fixed; inset:0; z-index:0; pointer-events:none; }

/* ══════ 设置面板 ══════ */
.vn-settings-panel {
  position: fixed; top: 60px; right: 16px; z-index: 300;
  background: ${tpl.dialogBg};
  border-radius: 10px; padding: 16px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 4px 24px rgba(0,0,0,0.12);
  display: none; min-width: 180px;
}
.vn-settings-panel.open { display: block; }
.vn-setting-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 6px 0; font-size: .8rem;
}
.vn-setting-row label { cursor: pointer; }
.vn-setting-row select {
  background: rgba(0,0,0,0.08); border: 1px solid rgba(0,0,0,0.12);
  border-radius: 4px; padding: 2px 6px; font-size: .75rem;
  color: ${tpl.textColor}; font-family: inherit;
}

/* ══════ 响应式 ══════ */
@media (max-width: 768px) {
  .vn-article { padding: 0 16px; margin-top: 50px; }
  .vn-title-block h1 { font-size: 1.4rem; }
  .theater-dialog { padding: 16px 18px 24px; }
}

/* scroll reveal */
.reveal-card { opacity: 0; transform: translateY(20px); transition: opacity .6s ease, transform .6s ease; }
.reveal-card.visible { opacity: 1; transform: translateY(0); }
</style>
</head>
<body>
<canvas id="vn-petals" aria-hidden="true"></canvas>

<!-- Top Bar -->
<div class="vn-topbar">
  <span class="vn-topbar-title">${esc(title)}</span>
  <div class="vn-topbar-actions">
    <button class="vn-topbar-btn" id="btnSettings" title="设置">⚙</button>
    <button class="vn-topbar-btn" id="btnModeToggle" title="切换阅读模式">${mode === 'theater' ? '📜 滚动' : '🎭 剧场'}</button>
    <button class="vn-topbar-btn" id="btnFullscreen" title="全屏">⊞</button>
  </div>
</div>

<!-- 设置面板 -->
<div class="vn-settings-panel" id="settingsPanel">
  <div class="vn-setting-row">
    <label>字号</label>
    <select id="setFontSize">
      <option value="14px"${o.fontSize==='14px'?' selected':''}>小</option>
      <option value="16px"${o.fontSize==='16px'?' selected':''}>中</option>
      <option value="18px"${o.fontSize==='18px'?' selected':''}>大</option>
    </select>
  </div>
  <div class="vn-setting-row">
    <label>花瓣</label>
    <select id="setPetals">
      <option value="on"${o.petals?' selected':''}>开启</option>
      <option value="off"${!o.petals?' selected':''}>关闭</option>
    </select>
  </div>
</div>

<!-- 模式切换 → 刷新页面（因模板结构不同） -->
${mode === 'scroll' ? `<div class="vn-article">${contentHTML}</div>` : `
<div class="theater-stage" id="theaterStage">
  <div class="theater-dialog" id="theaterDialog">
    <div class="theater-speaker" id="theaterSpeaker"></div>
    <div class="theater-text-wrapper" id="theaterText"></div>
  </div>
</div>
<div class="theater-progress" id="theaterProgress"></div>
<div class="theater-nav">
  <button class="theater-nav-btn" id="theaterPrev">◁</button>
  <button class="theater-nav-btn" id="theaterNext">▷</button>
</div>
`}

<script>
// ══════ VN Engine ══════
(function(){
  const SCENES = ${JSON.stringify(scenes.map(s => ({
    speaker: s.speaker || '旁白',
    text: s.text || '',
    bgImage: s.bgImage || null,
    background: s.background || ''
  }))).replace(/<\/script>/gi, '<\\/script>')};  // JSON.stringify 已转义所有 < >，此为冗余安全网

  // ── 花瓣 ──
  ${o.petals ? petalScript(tpl) : ''}

  // ── 滚动渐显 ──
  ${o.scrollReveal ? scrollRevealScript() : ''}

  // ── 设置面板 ──
  document.getElementById('btnSettings').addEventListener('click', () => {
    document.getElementById('settingsPanel').classList.toggle('open');
  });
  document.getElementById('setFontSize').addEventListener('change', e => {
    document.documentElement.style.fontSize = e.target.value;
  });
  document.getElementById('setPetals').addEventListener('change', e => {
    const cv = document.getElementById('vn-petals');
    if (cv) cv.style.display = e.target.value === 'on' ? '' : 'none';
  });

  // ── 全屏 ──
  document.getElementById('btnFullscreen').addEventListener('click', () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  });

  // ── 模式切换 ──
  document.getElementById('btnModeToggle').addEventListener('click', () => {
    const u = new URL(location.href);
    const m = u.searchParams.get('mode') === 'theater' ? 'scroll' : 'theater';
    u.searchParams.set('mode', m);
    location.href = u.toString();
  });

  ${mode === 'theater' ? theaterEngineScript(tpl) : ''}

  // ── 点击空白关闭设置 ──
  document.addEventListener('click', e => {
    const panel = document.getElementById('settingsPanel');
    const btn = document.getElementById('btnSettings');
    if (panel && panel.classList.contains('open') && !panel.contains(e.target) && e.target !== btn) {
      panel.classList.remove('open');
    }
  });
})();
<\/script>
</body>
</html>`;
  }

  // ══════════════════════════════════════
  // 滚动模式 HTML 构建
  // ══════════════════════════════════════
  function buildScrollHTML(scenes, tpl, o) {
    if (!scenes.length) return '<p style="text-align:center;opacity:.5;padding:40px">暂无场景内容</p>';

    const blocks = scenes.map((s, i) => {
      let html = '';
      // 场景标记
      if (s.background && s.background !== `场景${i + 1}`) {
        html += `<div class="vn-scene-marker">◆ ${esc(s.background)}</div>`;
      }
      html += `<div class="vn-scene-block reveal-card">`;
      if (s.bgImage) {
        html += `<img class="vn-scene-bg-img" src="${esc(s.bgImage)}" alt="场景图" loading="lazy" onerror="this.style.display='none'">`;
      }
      if (o.showSpeaker && s.speaker) {
        html += `<div class="vn-scene-speaker">${esc(s.speaker)}</div>`;
      }
      html += `<div class="vn-scene-text">${esc(s.text)}</div>`;
      html += `</div>`;
      return html;
    }).join('\n');

    return blocks;
  }

  // ══════════════════════════════════════
  // 剧场模式 HTML 已内联（theater-stage）
  // ══════════════════════════════════════
  function buildTheaterHTML(scenes, tpl, o) {
    return ''; // theater uses JS engine
  }

  // ══════════════════════════════════════
  // 剧场模式 JS 引擎
  // ══════════════════════════════════════
  function theaterEngineScript(tpl) {
    return `
  let _ti = 0;
  function showScene(i) {
    if (i < 0 || i >= SCENES.length) return;
    _ti = i;
    const s = SCENES[i];
    document.getElementById('theaterSpeaker').textContent = s.speaker || '旁白';
    typewriterText(document.getElementById('theaterText'), s.text || '');
    document.getElementById('theaterProgress').textContent = (i+1) + ' / ' + SCENES.length;
    if (s.bgImage) {
      document.getElementById('theaterStage').style.backgroundImage = 'url(' + s.bgImage + ')';
    }
  }
  function typewriterText(el, text) {
    el.textContent = '';
    let i = 0;
    function type() { if (i < text.length) { el.textContent = text.slice(0, ++i); setTimeout(type, 25 + Math.random() * 18); } }
    type();
  }
  document.getElementById('theaterPrev').addEventListener('click', () => showScene(_ti - 1));
  document.getElementById('theaterNext').addEventListener('click', () => showScene(_ti + 1));
  // 键盘导航
  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); showScene(_ti + 1); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); showScene(_ti - 1); }
  });
  // 点击剧情区域前进
  document.getElementById('theaterStage').addEventListener('click', e => {
    if (!e.target.closest('button')) showScene(_ti + 1);
  });
  showScene(0);`;
  }

  // ══════════════════════════════════════
  // 花瓣 Canvas 脚本
  // ══════════════════════════════════════
  function petalScript(tpl) {
    const isDark = tpl.textColor && (tpl.textColor.includes('e0') || tpl.textColor.includes('d0'));
    const colors = isDark
      ? '["rgba(200,180,220,0.5)","rgba(180,160,200,0.4)","rgba(220,200,240,0.3)","rgba(160,140,200,0.45)"]'
      : '["rgba(248,165,194,0.6)","rgba(244,114,182,0.5)","rgba(232,120,176,0.55)","rgba(252,160,192,0.5)"]';

    return `
  const petalCV = document.getElementById('vn-petals');
  const petalCtx = petalCV.getContext('2d');
  let petalW, petalH, petals = [];
  const COLORS = ${colors};

  function resizePetals() { petalW = petalCV.width = window.innerWidth; petalH = petalCV.height = window.innerHeight; }
  resizePetals();
  window.addEventListener('resize', resizePetals);

  for (let i = 0; i < 30; i++) {
    petals.push({
      x: Math.random() * petalW, y: Math.random() * petalH,
      r: 3 + Math.random() * 6,
      speed: 0.3 + Math.random() * 0.7,
      drift: (Math.random() - 0.5) * 0.4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      angle: Math.random() * Math.PI * 2
    });
  }

  function drawPetals() {
    petalCtx.clearRect(0, 0, petalW, petalH);
    for (const p of petals) {
      petalCtx.save();
      petalCtx.translate(p.x, p.y);
      petalCtx.rotate(p.angle);
      petalCtx.fillStyle = p.color;
      petalCtx.beginPath();
      petalCtx.ellipse(0, 0, p.r, p.r * 1.5, 0, 0, Math.PI * 2);
      petalCtx.fill();
      petalCtx.restore();
      p.y += p.speed;
      p.x += p.drift + Math.sin(p.y * 0.01) * 0.3;
      p.angle += 0.005;
      if (p.y > petalH + 20) { p.y = -20; p.x = Math.random() * petalW; }
      if (p.x > petalW + 20) p.x = -20;
      if (p.x < -20) p.x = petalW + 20;
    }
    requestAnimationFrame(drawPetals);
  }
  drawPetals();`;
  }

  // ══════════════════════════════════════
  // 滚动渐显
  // ══════════════════════════════════════
  function scrollRevealScript() {
    return `
  const revealObs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); revealObs.unobserve(e.target); } });
  }, { threshold: 0.15 });
  document.querySelectorAll('.reveal-card').forEach(el => revealObs.observe(el));`;
  }

  // ══════════════════════════════════════
  // 辅助函数
  // ══════════════════════════════════════
  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ══════════════════════════════════════
  // 下载触发
  // ══════════════════════════════════════
  function download(html, filename) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'visual-novel.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return { generate, download, TEMPLATES };
})();
