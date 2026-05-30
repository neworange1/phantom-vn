/**
 * vn-effects.js — 轻视觉小说可复用效果引擎
 * 来源：吻一个人的背影-3.html
 * 
 * 使用方式：
 *   VNEffects.init({
 *     petals: true,        // 花瓣飘落
 *     grain: true,         // 纸质纹理
 *     scrollReveal: true,  // 滚动渐显
 *     shutter: {           // 快门转场
 *       enabled: true,
 *       buttonId: 'btnKa',
 *       modalContent: '...'
 *     },
 *     parallax: true,      // 视差光晕
 *     cursorParticles: false,  // 鼠标跟随粒子（作者可选）
 *     clickRipple: false,      // 点击涟漪（作者可选）
 *     fonts: ['Ma+Shan+Zheng'] // 加载的 Google Fonts
 *   });
 *
 * 暮舟生成 HTML 时直接嵌入此脚本。
 */
var VNEffects = (function() {
  'use strict';

  var config = {};
  var rafPetal = 0;
  var _petalLoopActive = false;

  // ── 加载字体 ──
  function loadFonts(fonts) {
    if (!fonts || !fonts.length) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' + fonts.join('&family=') + '&display=swap';
    document.head.appendChild(link);
  }

  // ── 1. 花瓣飘落 Canvas ──
  function initPetals() {
    var cv = document.getElementById('vn-petals');
    if (!cv) {
      cv = document.createElement('canvas');
      cv.id = 'vn-petals';
      cv.setAttribute('aria-hidden', 'true');
      document.body.appendChild(cv);
    }
    var ctx = cv.getContext('2d');
    var W, H;

    function resize() {
      W = cv.width  = window.innerWidth;
      H = cv.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });

    var COLS = ['#f7c5cf','#f9d4dc','#fce4ec','#f4b8c8','#ffe0ea'];

    function mkPetal(scattered) {
      return {
        x: Math.random() * W,
        y: scattered ? Math.random() * H : -20 - Math.random() * 50,
        sz: 4 + Math.random() * 8,
        vx: (Math.random() - .5) * 1,
        vy: .5 + Math.random() * 1.2,
        angle: Math.random() * Math.PI * 2,
        va: (Math.random() - .5) * .035,
        sw: Math.random() * Math.PI * 2,
        swS: .006 + Math.random() * .01,
        col: COLS[Math.random() * COLS.length | 0],
        a: .32 + Math.random() * .44
      };
    }

    var petals = [];
    for (var i = 0; i < 22; i++) petals.push(mkPetal(true));

    function drawP(p) {
      ctx.save();
      ctx.globalAlpha = p.a;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      for (var j = 0; j < 5; j++) {
        ctx.save();
        ctx.rotate(j / 5 * Math.PI * 2);
        ctx.scale(1, .5);
        ctx.beginPath();
        ctx.ellipse(p.sz * .5, 0, p.sz * .56, p.sz * .27, 0, 0, Math.PI * 2);
        ctx.fillStyle = p.col;
        ctx.fill();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.arc(0, 0, p.sz * .16, 0, Math.PI * 2);
      ctx.fillStyle = '#d98fa4';
      ctx.fill();
      ctx.restore();
    }

    function loop() {
      if (_petalLoopActive) return;  // 防止重复循环
      _petalLoopActive = true;
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < petals.length; i++) {
        var p = petals[i];
        p.sw += p.swS;
        p.x += p.vx + Math.sin(p.sw) * .6;
        p.y += p.vy;
        p.angle += p.va;
        drawP(p);
        if (p.y > H + 36 || p.x < -55 || p.x > W + 55) {
          petals[i] = mkPetal(false);
        }
      }
      if (petals.length < 28 && Math.random() < .015) petals.push(mkPetal(false));
      rafPetal = requestAnimationFrame(loop);
    }
    loop();

    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        cancelAnimationFrame(rafPetal);
        _petalLoopActive = false;
      } else {
        _petalLoopActive = false;
        loop();
      }
    });
  }

  // ── 2. 滚动渐显 (IntersectionObserver) ──
  function initScrollReveal() {
    var items = document.querySelectorAll('[data-vn-reveal], [data-vn-card], [data-vn-polaroid], [data-vn-left]');

    // Mark elements for animation
    items.forEach(function(el) { el.classList.add('will-reveal'); });

    // Stagger paragraphs within sections
    document.querySelectorAll('section').forEach(function(sec) {
      var paras = sec.querySelectorAll('[data-vn-reveal]');
      paras.forEach(function(p, i) {
        p.style.transitionDelay = (i * 0.06) + 's';
      });
    });

    if (!('IntersectionObserver' in window)) {
      items.forEach(function(el) { el.classList.add('revealed'); });
      return;
    }

    var io = new IntersectionObserver(function(entries) {
      entries.forEach(function(e) {
        if (e.isIntersecting) {
          e.target.classList.add('revealed');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.06, rootMargin: '0px 0px -20px 0px' });

    items.forEach(function(el) { io.observe(el); });

    // Safety timeout
    setTimeout(function() {
      items.forEach(function(el) { el.classList.add('revealed'); });
    }, 4000);
  }

  // ── 3. 快门转场 ──
  function initShutter(opts) {
    if (!opts || !opts.buttonId) return;
    var flash  = document.getElementById('vn-flash');
    var bladeT = document.getElementById('vn-bladeT');
    var bladeB = document.getElementById('vn-bladeB');
    var modal  = document.getElementById('vn-modal');

    // Create DOM if not present
    if (!flash) {
      flash = document.createElement('div'); flash.id = 'vn-flash'; document.body.appendChild(flash);
    }
    if (!bladeT) {
      bladeT = document.createElement('div'); bladeT.className = 'vn-blade'; bladeT.id = 'vn-bladeT'; document.body.appendChild(bladeT);
    }
    if (!bladeB) {
      bladeB = document.createElement('div'); bladeB.className = 'vn-blade'; bladeB.id = 'vn-bladeB'; document.body.appendChild(bladeB);
    }
    if (!modal && opts.modalContent) {
      modal = document.createElement('div'); modal.id = 'vn-modal'; modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true');
      modal.innerHTML = '<button class="vn-modal-close" id="vn-mClose" aria-label="关闭">✕</button><div class="vn-modal-pol">' + opts.modalContent + '</div>';
      document.body.appendChild(modal);
    }

    function doShutter() {
      bladeT.style.height = '52vh';
      bladeB.style.height = '52vh';
      setTimeout(function() {
        flash.style.opacity = '1';
        flash.style.transition = 'opacity 0.06s';
        setTimeout(function() {
          flash.style.opacity = '0';
          flash.style.transition = 'opacity 0.7s';
          bladeT.style.height = '0';
          bladeB.style.height = '0';
          if (modal) modal.classList.add('show');
        }, 80);
      }, 220);
    }

    function closeModal() {
      if (modal) modal.classList.remove('show');
    }

    var btn = document.getElementById(opts.buttonId);
    if (btn) btn.addEventListener('click', doShutter);

    var mClose = document.getElementById('vn-mClose');
    if (mClose) mClose.addEventListener('click', closeModal);
    if (modal) {
      modal.addEventListener('click', function(e) {
        if (e.target === modal) closeModal();
      });
    }
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') closeModal();
    });
  }

  // ── 4. 视差光晕 ──
  function initParallax() {
    var glow = document.querySelector('.vn-hero-glow');
    if (!glow) return;
    window.addEventListener('scroll', function() {
      glow.style.transform = 'translateY(' + (window.scrollY * .25) + 'px)';
    }, { passive: true });
  }

  // ── 5. 鼠标跟随粒子 ──
  function initCursorParticles() {
    var throttleTimer = 0;
    var colors = ['#f7c5cf','#f9d4dc','#fce4ec','#d98fa4'];

    document.addEventListener('mousemove', function(e) {
      if (Date.now() - throttleTimer < 50) return;
      throttleTimer = Date.now();

      var p = document.createElement('div');
      p.className = 'vn-cursor-particle';
      p.style.left = e.clientX + 'px';
      p.style.top = e.clientY + 'px';
      p.style.width = (3 + Math.random() * 5) + 'px';
      p.style.height = p.style.width;
      p.style.background = colors[Math.random() * colors.length | 0];
      document.body.appendChild(p);

      setTimeout(function() {
        if (p.parentNode) p.parentNode.removeChild(p);
      }, 800);
    });
  }

  // ── 6. 点击涟漪 ──
  function initClickRipple() {
    document.addEventListener('click', function(e) {
      var r = document.createElement('div');
      r.className = 'vn-click-ripple';
      r.style.left = e.clientX + 'px';
      r.style.top = e.clientY + 'px';
      document.body.appendChild(r);

      setTimeout(function() {
        if (r.parentNode) r.parentNode.removeChild(r);
      }, 600);
    });
  }

  // ── 7. 全屏模式 ──
  function initFullscreen(triggerId, targetId) {
    var btn = document.getElementById(triggerId);
    var target = document.getElementById(targetId);
    if (!btn || !target) return;

    btn.addEventListener('click', function() {
      if (target.classList.contains('vn-fullscreen')) {
        target.classList.remove('vn-fullscreen');
        btn.textContent = '🔆 全屏阅读';
      } else {
        target.classList.add('vn-fullscreen');
        btn.textContent = '🔅 退出全屏';
      }
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && target.classList.contains('vn-fullscreen')) {
        target.classList.remove('vn-fullscreen');
        btn.textContent = '🔆 全屏阅读';
      }
    });
  }

  // ── 主初始化 ──
  function init(opts) {
    config = opts || {};

    // 加载字体
    if (config.fonts) loadFonts(config.fonts);

    // 按顺序初始化各效果
    if (config.petals !== false)    initPetals();
    if (config.scrollReveal !== false) initScrollReveal();
    if (config.shutter && config.shutter.enabled) initShutter(config.shutter);
    if (config.parallax !== false)  initParallax();
    if (config.cursorParticles)     initCursorParticles();
    if (config.clickRipple)         initClickRipple();
    if (config.fullscreen)          initFullscreen(config.fullscreen.triggerId, config.fullscreen.targetId);
  }

  return { init: init };

})();
