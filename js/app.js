/**
 * app.js — 主应用入口
 * 负责：Tab切换、Panel折叠、事件总线、全局工具函数
 */

const App = (() => {

  // 编辑器选区追踪（跨模块共享）
  let _lastEditorRange = null;

  // ── 初始化 ──
  function init() {
    bindTabNav();
    bindTextEditor();
    bindEditorUpgrades();
    bindFileImport();
    bindAgentTabs();
    bindAgentSend();
    bindPanelCollapse();
    bindLayoutPanel();
    bindPublish();
    bindNewProject();
    bindThemeToggle();
    LibraryManager.init();
    Agents.init();
    // 桃花花瓣常驻（默认主题）
    initPetalFall('peach');
    VNEffects.init({ petals: false, scrollReveal: true, parallax: true, cursorParticles: true, clickRipple: true });
    initEncouragement();
    initSitReminder();
    initKonamiCode();
    initEasterEggLogo();
    showToast('Phantom Visual Novel 已就绪', 'success');
  }

  // ── Tab 导航（已移至 Dashboard 内） ──
  function bindTabNav() {
    // Tab buttons now live inside reader/author dashboards
    // No topbar tab-nav to bind
  }

  // ── 文字编辑器 ──
  function bindTextEditor() {
    const editor = document.getElementById('textEditor');
    if (!editor) return;

    editor.addEventListener('input', updateTextStats);
    editor.addEventListener('mouseup', handleTextSelection);
    editor.addEventListener('keyup', handleTextSelection);

    // 粘贴拦截：原文导入仅支持纯文字，拦截图片等非文字内容
    editor.addEventListener('paste', (e) => {
      const cd = e.clipboardData;
      if (!cd) return;

      // 检查是否存在图片等非文字格式
      let hasNonText = false;
      if (cd.items) {
        for (const item of cd.items) {
          if (item.type.startsWith('image/')) {
            hasNonText = true;
            break;
          }
        }
      }
      // 也检查 files（拖拽/粘贴文件场景）
      if (!hasNonText && cd.files && cd.files.length > 0) {
        hasNonText = true;
      }

      if (hasNonText) {
        e.preventDefault();
        showToast('仅支持文字', '');
        return;
      }

      // 获取纯文本，以纯文本方式插入（阻止富文本格式）
      const plainText = cd.getData('text/plain');
      if (plainText) {
        e.preventDefault();
        document.execCommand('insertText', false, plainText);
      }
    });

    // 格式按钮
    document.getElementById('fontSizeSelect')?.addEventListener('change', e => {
      editor.style.fontSize = e.target.value + 'px';
    });
    document.getElementById('fontFamilySelect')?.addEventListener('change', e => {
      editor.style.fontFamily = e.target.value;
    });
    document.getElementById('lineHeightSelect')?.addEventListener('change', e => {
      editor.style.lineHeight = e.target.value;
    });
    // ── 格式按钮（v2：selectionchange 持续追踪选区 + direct execCommand，稳定可靠） ──
    // 核心思路：不再依赖脆弱的 persist-selection span 包裹机制。
    // 用 selectionchange 事件持续把"当前选区"存下，按钮点击时直接恢复并用 execCommand 执行。

    let _formatBtnClicked = false;     // 防抖：标记是否有格式按钮被点击（避免 mouseup 清选区）

    // 持续追踪编辑器内的选区变化
    document.addEventListener('selectionchange', () => {
      // 快速路径：如果活跃元素不在编辑器相关区域内且非格式按钮交互，跳过
      const ae = document.activeElement;
      if (!_formatBtnClicked && ae && !editor.contains(ae)
          && !ae.closest('#formatBar') && !ae.closest('#branchPanel')
          && !ae.closest('#imgInsertPopup') && !ae.classList.contains('fmt-btn')) {
        if (_lastEditorRange) _lastEditorRange = null;
        return;
      }

      const sel = window.getSelection();
      if (!sel || !sel.rangeCount || sel.isCollapsed) {
        // 如果格式按钮/工具栏刚被点击，不要清空快照
        if (_formatBtnClicked) return;
        if (ae && (ae.closest('#formatBar') || ae.closest('#branchPanel') || ae.closest('#imgInsertPopup') || ae.classList.contains('fmt-btn'))) return;
        _lastEditorRange = null;
        return;
      }
      const range = sel.getRangeAt(0);
      if (editor.contains(range.commonAncestorContainer)) {
        _lastEditorRange = range.cloneRange();
      }
    });

    // 通用格式执行器（纯 DOM 操作，不依赖 execCommand）
    function _execFormat(cmd, arg) {
      const sel = window.getSelection();
      editor.focus();

      let range = null;
      if (sel && sel.rangeCount && !sel.isCollapsed) {
        const r = sel.getRangeAt(0);
        if (editor.contains(r.commonAncestorContainer)) {
          range = r;
        }
      }
      if (!range && _lastEditorRange) {
        range = _lastEditorRange;
      }
      if (!range || range.collapsed) {
        // 无选区：尝试对光标所在行应用块格式
        if (cmd === 'formatBlock' && sel.anchorNode && editor.contains(sel.anchorNode)) {
          let line = sel.anchorNode;
          while (line && line !== editor && line.nodeName !== 'P' && line.nodeName !== 'DIV') {
            line = line.parentNode;
          }
          // 绝不可包裹编辑器自身（editor 也是 DIV，会摧毁整个编辑区）
          if (line && line !== editor && (line.nodeName === 'P' || line.nodeName === 'DIV')) {
            _wrapNode(line, arg);
            updateTextStats();
          }
        }
        return;
      }

      sel.removeAllRanges();
      sel.addRange(range);

      if (cmd === 'formatBlock') {
        _applyBlockFormat(range, arg);
      } else {
        _applyInlineFormat(range, cmd);
      }
      updateTextStats();

      // 更新快照
      if (sel.rangeCount) {
        _lastEditorRange = sel.getRangeAt(0).cloneRange();
      }
    }

    // 块格式（H2/H3）
    function _applyBlockFormat(range, tag) {
      const block = document.createElement(tag);
      try {
        // 优先使用 surroundContents（单一块内安全）
        range.surroundContents(block);
      } catch (_e) {
        // 跨块选区回退：extractContents 后再包裹（有 DOM 拆分风险，但无可避免）
        const frag = range.extractContents();
        if (!frag || !frag.firstChild) return;
        block.appendChild(frag);
        range.insertNode(block);
      }
      // 光标移到块后
      range.setStartAfter(block);
      range.collapse(true);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(range);
    }

    function _wrapNode(node, tag) {
      const block = document.createElement(tag);
      block.innerHTML = node.innerHTML;
      node.replaceWith(block);
    }

    // 内联格式（B / I），支持 toggle
    function _applyInlineFormat(range, cmd) {
      const tag = cmd === 'bold' ? 'B' : cmd === 'italic' ? 'I' : null;
      if (!tag) return;

      // 检查是否已在同类型标签内 → toggle off
      let anc = range.commonAncestorContainer;
      while (anc && anc !== editor) {
        if (anc.nodeName === tag) {
          _unwrapNode(anc);
          return;
        }
        anc = anc.parentNode;
      }

      // 检查选区内容是否完全被同标签包裹 → toggle off
      const selContents = range.cloneContents();
      const wrapper = selContents.querySelectorAll(tag.toLowerCase());
      if (wrapper.length === 1 && selContents.childNodes.length === 1
          && selContents.firstChild.nodeName === tag) {
        const text = selContents.firstChild.textContent;
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
        const s = window.getSelection();
        s.removeAllRanges();
        s.addRange(range);
        return;
      }

      // 正常包裹
      const frag = range.extractContents();
      const wrap = document.createElement(tag.toLowerCase());
      wrap.appendChild(frag);
      range.insertNode(wrap);
      range.setStartAfter(wrap);
      range.collapse(true);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(range);
    }

    function _unwrapNode(el) {
      const parent = el.parentNode;
      while (el.firstChild) {
        parent.insertBefore(el.firstChild, el);
      }
      parent.removeChild(el);
    }

    // 绑定按钮（mousedown 触发，阻止默认以保持选区）
    function bindFormatBtn(id, handler) {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('mousedown', e => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.add('fmt-active');
        _formatBtnClicked = true;
        handler();
        // 延迟清除标记，让 selectionchange 有时间拿到新状态
        setTimeout(() => { _formatBtnClicked = false; }, 150);
      });
      // mouseup 和 click 全部拦截，防止编辑器失焦
      btn.addEventListener('mouseup', e => {
        e.preventDefault(); e.stopPropagation();
        btn.classList.remove('fmt-active');
      });
      btn.addEventListener('mouseleave', () => { btn.classList.remove('fmt-active'); });
      btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); });
    }

    bindFormatBtn('fmtBold',   () => _execFormat('bold'));
    bindFormatBtn('fmtItalic', () => _execFormat('italic'));
    bindFormatBtn('fmtH2',     () => _execFormat('formatBlock', 'h2'));
    bindFormatBtn('fmtH3',     () => _execFormat('formatBlock', 'h3'));

    document.getElementById('autoFormatBtn')?.addEventListener('click', () => {
      const raw = editor.innerText;
      const formatted = Parser.autoFormat(raw);
      editor.innerText = formatted;
      updateTextStats();
      showToast('格式已自动整理', 'success');
    });

    // 第一行自动设为标题
    bindFirstLineTitle(editor);

    // 木鱼按钮：点击显示 +1 浮动动画（节流：每帧最多2个，防止内存泄漏）
    // 彩蛋：100次功德闪光 / 1000次图标发光 / 1%概率禅语
    (() => {
      const muyuBtn = document.getElementById('muyuBtn');
      if (!muyuBtn) return;
      let pendingCount = 0;   // 待渲染的+1数量
      let rafId = null;       // requestAnimationFrame id
      let activeCount = 0;    // 当前存活的浮动元素数量
      const MAX_ACTIVE = 12;  // 最多同时存在的浮动元素上限
      let muyuTotal = parseInt(localStorage.getItem('muyuTotal') || '0'); // 跨会话累计

      // 初始化时检查是否达到1000次发光
      if (muyuTotal >= 1000) muyuBtn.classList.add('glowing');

      function spawnPlus(btn) {
        if (activeCount >= MAX_ACTIVE) return;
        const rect = btn.getBoundingClientRect();
        const el = document.createElement('span');
        el.className = 'muyu-plus';
        el.textContent = '+1';
        el.style.left = (rect.left + rect.width / 2 - 12 + (Math.random() - 0.5) * 20) + 'px';
        el.style.top  = (rect.top - 4) + 'px';
        document.body.appendChild(el);
        activeCount++;
        el.addEventListener('animationend', () => {
          el.remove();
          activeCount--;
        });
      }

      function flushPending() {
        rafId = null;
        const batch = Math.min(pendingCount, 2); // 每帧最多弹出2个
        for (let i = 0; i < batch; i++) spawnPlus(muyuBtn);
        pendingCount -= batch;
        if (pendingCount > 0) rafId = requestAnimationFrame(flushPending);
      }

      muyuBtn.addEventListener('click', () => {
        // 木鱼按压动画
        muyuBtn.classList.add('hit');
        setTimeout(() => muyuBtn.classList.remove('hit'), 120);
        pendingCount++;
        if (!rafId) rafId = requestAnimationFrame(flushPending);

        // 累计计数（上限 999999，每10次写一次 localStorage 减少写入）
        muyuTotal++;
        if (muyuTotal <= 999999 && muyuTotal % 10 === 0) {
          localStorage.setItem('muyuTotal', muyuTotal);
        }

        // 彩蛋1：满100次功德闪光
        if (muyuTotal === 100) spawnMeritFlash();

        // 彩蛋2：满1000次图标发光
        if (muyuTotal >= 1000 && !muyuBtn.classList.contains('glowing')) {
          muyuBtn.classList.add('glowing');
        }

        // 彩蛋3：1%概率禅语卡片
        if (Math.random() < 0.01) spawnZenCard(muyuBtn);
      });
    })();


    document.getElementById('clearTextBtn')?.addEventListener('click', () => {
      if (confirm('确认清空文本？')) {
        editor.innerHTML = '';
        updateTextStats();
        showToast('已清空', '');
      }
    });

    // ══════ 自定义撤销栈（替代废弃的 execCommand('undo'/'redo')）══════
    const undoStack = (() => {
      const _stack = [];
      let _index = -1;
      const MAX = 50;
      let _debounce = null;
      let _lastSaved = null;

      function save() {
        const html = editor.innerHTML;
        if (html === _lastSaved) return;
        // 清除当前位置之后的所有 redo
        if (_index < _stack.length - 1) {
          _stack.length = _index + 1;
        }
        _stack.push(html);
        if (_stack.length > MAX) { _stack.shift(); } else { _index++; }
        _lastSaved = html;
      }

      function undo() {
        if (_index <= 0) return false;
        _index--;
        _lastSaved = _stack[_index];
        editor.innerHTML = _lastSaved;
        _restoreCursorToEnd();
        // 触发 input 事件 → updateTextStats + syncLayoutPreview
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }

      function redo() {
        if (_index >= _stack.length - 1) return false;
        _index++;
        _lastSaved = _stack[_index];
        editor.innerHTML = _lastSaved;
        _restoreCursorToEnd();
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }

      function _restoreCursorToEnd() {
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }

      // MutationObserver 防抖保存
      const observer = new MutationObserver(() => {
        clearTimeout(_debounce);
        _debounce = setTimeout(save, 300);
      });
      observer.observe(editor, {
        childList: true, subtree: true, characterData: true,
        attributes: false, attributeOldValue: false
      });

      // 初始快照
      save();

      return { undo, redo, save, _stack, getIndex: () => _index };
    })();

    // 彩蛋 B：关键词触发复古主题（输入"幻影"或"phantom"后回车）
    editor.addEventListener('keydown', e => {
      // Ctrl+A — 仅选中编辑器内容，不透传到页面
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        e.stopPropagation();
        const range = document.createRange();
        range.selectNodeContents(editor);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      // Ctrl+Z 撤销 / Ctrl+Y 重做
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (undoStack.undo()) { return; }
        document.execCommand('undo', false, null);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        if (undoStack.redo()) { return; }
        document.execCommand('redo', false, null);
        return;
      }
      // Enter 触发关键词
      if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
      const sel = window.getSelection();
      if (!sel.rangeCount) return;
      let node = sel.anchorNode;
      if (node.nodeType === 3) node = node.parentElement;
      let block = node;
      while (block && block !== editor && !/^(DIV|P|H[1-6]|LI)$/.test(block.tagName)) {
        block = block.parentElement;
      }
      if (!block || block === editor) return;
      const text = block.innerText || block.textContent || '';
    });
  }

  // ══════════════════════════════════════
  // 编辑器升级：场景标记 + 配图插入 + 分支剧情
  // ══════════════════════════════════════
  function bindEditorUpgrades() {
    const editor = document.getElementById('textEditor');
    if (!editor) return;

    // ── 全局分支数据 ──
    window._branchData = window._branchData || [];

    // ── 获取光标所在段落索引（增强版：兼容多种DOM结构）──
    function getCurrentParagraphIndex() {
      // 优先使用 _lastEditorRange
      let range = _lastEditorRange;
      if (!range) {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return -1;
        range = sel.getRangeAt(0);
      }

      // 获取编辑器中所有可视为"段落"的块级元素
      const blocks = Array.from(editor.querySelectorAll('div, p, .scene-marker'));
      if (blocks.length === 0) return 0; // 编辑器内第一个位置

      // 判断光标所在节点属于哪个块
      let node = range.startContainer;
      while (node && node !== editor) {
        const idx = blocks.indexOf(node);
        if (idx >= 0) return idx;
        node = node.parentNode;
      }

      // 回退：无法定位时返回 -1，调用侧已做 srcIdx < 0 检查
      return -1;
    }

    // ── 更新分支面板显示 ──
    function refreshBranchPanel() {
      const list = document.getElementById('branchList');
      const empty = document.getElementById('branchEmpty');
      const editForm = document.getElementById('branchEditForm');
      if (!list) return;

      const srcIdx = getCurrentParagraphIndex();
      document.getElementById('branchSrcIdx').textContent = srcIdx >= 0 ? srcIdx + 1 : '—';
      const branches = window._branchData.filter(b => b.srcParagraph === srcIdx);

      if (editForm && editForm.style.display !== 'none') return; // 编辑中不刷新

      if (branches.length === 0) {
        list.innerHTML = '';
        list.appendChild(empty);
        empty.style.display = 'block';
      } else {
        if (empty) empty.style.display = 'none';
        list.innerHTML = branches.map((b, i) =>
          '<div class="branch-item">' +
          '<span class="branch-item-option">' + b.text.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>' +
          '<span class="branch-item-arrow">→</span>' +
          '<span class="branch-item-target">段落 #' + (b.targetParagraph + 1) + '</span>' +
          '<span class="branch-item-actions">' +
          '<button class="branch-edit" data-idx="' + i + '">✎</button>' +
          '<button class="branch-del" data-idx="' + i + '">✕</button>' +
          '</span></div>'
        ).join('');

        // 编辑按钮
        list.querySelectorAll('.branch-edit').forEach(btn => {
          btn.addEventListener('click', () => {
            const i = parseInt(btn.dataset.idx);
            const b = branches[i];
            document.getElementById('branchOptionText').value = b.text;
            document.getElementById('branchTargetIdx').value = b.targetParagraph + 1;
            document.getElementById('branchEditForm').style.display = 'block';
            document.getElementById('branchEditForm').dataset.editIdx = window._branchData.indexOf(b);
          });
        });
        // 删除按钮
        list.querySelectorAll('.branch-del').forEach(btn => {
          btn.addEventListener('click', () => {
            const i = parseInt(btn.dataset.idx);
            const b = branches[i];
            window._branchData = window._branchData.filter(x => x !== b);
            refreshBranchPanel();
            showToast('分支已删除', '');
          });
        });
      }
    }

    // ── 1) 场景标记按钮 ──
    document.getElementById('fmtScene')?.addEventListener('click', () => {
      editor.focus();

      // 恢复上次编辑器选区
      let sel = window.getSelection();
      let useSaved = false;
      if ((!sel || !sel.rangeCount || sel.isCollapsed || !editor.contains(sel.getRangeAt(0).commonAncestorContainer)) && _lastEditorRange) {
        useSaved = true;
      }

      if (useSaved) {
        sel.removeAllRanges();
        sel.addRange(_lastEditorRange);
      } else if (!sel || !sel.rangeCount) {
        // 无选区，插入空场景标记
        const marker = makeSceneMarkerDiv();
        editor.appendChild(marker);
        marker.focus();
        updateTextStats();
        showToast('场景标记已插入，输入场景名称', 'success');
        return;
      }

      const range = useSaved ? _lastEditorRange : sel.getRangeAt(0);

      // 检查是否在已有场景标记上
      let node = range.startContainer;
      while (node && node !== editor) {
        if (node.classList && node.classList.contains('scene-marker')) {
          node.focus();
          showToast('点击编辑场景名', '');
          return;
        }
        node = node.parentNode;
      }

      // 如果有选中文字 → 将选区包裹为场景标记
      if (!range.collapsed) {
        const frag = range.extractContents();
        const marker = makeSceneMarkerDiv();
        marker.appendChild(frag);
        range.insertNode(marker);
        // 在标记后插入换行
        const br = document.createElement('div');
        br.innerHTML = '<br>';
        marker.after(br);
        marker.focus();
      } else {
        // 光标处：在当前块前面插入场景标记
        let block = range.startContainer;
        while (block && block !== editor && block.nodeType !== 1) block = block.parentNode;
        const marker = makeSceneMarkerDiv();
        if (block && block !== editor && (block.tagName === 'DIV' || block.tagName === 'P' || block.classList?.contains('scene-marker'))) {
          block.before(marker);
        } else {
          editor.appendChild(marker);
        }
        marker.focus();
      }

      updateTextStats();
      showToast('场景标记已插入，输入场景名称', 'success');
    });

    function makeSceneMarkerDiv() {
      const d = document.createElement('div');
      d.className = 'scene-marker';
      d.innerHTML = '◆ ';
      d.setAttribute('data-scene', 'true');
      d.contentEditable = 'true';
      return d;
    }

    // ── 2) 配图插入按钮 ──
    const imgPopup = document.getElementById('imgInsertPopup');
    document.getElementById('fmtImage')?.addEventListener('click', () => {
      // 保存当前编辑器选区，供后续 insertImageAtCursor 使用
      const sel = window.getSelection();
      if (sel && sel.rangeCount && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        _lastEditorRange = sel.getRangeAt(0).cloneRange();
      }
      if (imgPopup) {
        const visible = imgPopup.style.display !== 'none';
        imgPopup.style.display = visible ? 'none' : 'block';
        if (!visible) refreshImgGallery();
      }
    });

    // 图片弹窗 Tab 切换
    document.querySelectorAll('.img-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.img-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const tabName = tab.dataset.tab;
        document.getElementById('imgUploadTab').style.display = tabName === 'upload' ? 'block' : 'none';
        document.getElementById('imgUrlTab').style.display = tabName === 'url' ? 'block' : 'none';
        document.getElementById('imgGalleryTab').style.display = tabName === 'gallery' ? 'block' : 'none';
      });
    });

    // 文件上传
    document.getElementById('imgFileInput')?.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        insertImageAtCursor(reader.result);
        imgPopup.style.display = 'none';
      };
      reader.readAsDataURL(file);
    });

    // URL 插入
    document.getElementById('imgUrlInsert')?.addEventListener('click', () => {
      const url = document.getElementById('imgUrlInput').value.trim();
      if (!url) { showToast('请输入图片链接', 'error'); return; }
      insertImageAtCursor(url);
      document.getElementById('imgUrlInput').value = '';
      imgPopup.style.display = 'none';
    });

    // 素材库选择
    function refreshImgGallery() {
      const grid = document.getElementById('imgGalleryGrid');
      if (!grid) return;
      const imgs = VNStore.getGalleryImages();
      if (imgs.length === 0) {
        grid.innerHTML = '<div class="img-gallery-empty">暂无素材，使用花花生成图片后出现在这里</div>';
        return;
      }
      grid.innerHTML = imgs.map((img, i) =>
        '<div class="img-gallery-item" style="background-image:url(' + img.url + ')" data-url="' + img.url + '"></div>'
      ).join('');
      grid.querySelectorAll('.img-gallery-item').forEach(item => {
        item.addEventListener('click', () => {
          insertImageAtCursor(item.dataset.url);
          imgPopup.style.display = 'none';
        });
      });
    }
    window._galleryImages = window._galleryImages || []; // 兼容旧引用

    function insertImageAtCursor(src) {
      editor.focus();
      let sel = window.getSelection();

      // 如果当前选区丢失，回退到保存的选区
      if ((!sel || !sel.rangeCount || sel.isCollapsed || !editor.contains(sel.getRangeAt(0).commonAncestorContainer)) && _lastEditorRange) {
        sel.removeAllRanges();
        sel.addRange(_lastEditorRange);
      }

      if (!sel || !sel.rangeCount) {
        // 仍有问题 — 直接追加到编辑器末尾
        const wrap = makeImageWrap(src);
        editor.appendChild(wrap);
        const spacer = document.createElement('div');
        spacer.innerHTML = '<br>';
        editor.appendChild(spacer);
        updateTextStats();
        showToast('图片已追加到末尾', '');
        return;
      }

      const wrap = makeImageWrap(src);

      const range = sel.getRangeAt(0);
      let block = range.startContainer;
      while (block && block !== editor && block.nodeType !== 1) block = block.parentNode;
      if (block && block !== editor && (block.tagName === 'DIV' || block.tagName === 'P' || block.classList?.contains('scene-marker'))) {
        block.after(wrap);
      } else {
        editor.appendChild(wrap);
      }
      // 在图片后插入一个空行继续写作
      const spacer = document.createElement('div');
      spacer.innerHTML = '<br>';
      wrap.after(spacer);
      updateTextStats();
      showToast('图片已插入', 'success');
    }

    function makeImageWrap(src) {
      const wrap = document.createElement('div');
      wrap.className = 'editor-image-wrap';
      wrap.contentEditable = 'false';
      const img = document.createElement('img');
      img.className = 'editor-image';
      img.src = src;
      img.onerror = () => { img.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22120%22%3E%3Crect fill=%22%23f5e6d3%22 width=%22200%22 height=%22120%22/%3E%3Ctext x=%22100%22 y=%2265%22 text-anchor=%22middle%22 fill=%22%23b8a48e%22 font-size=%2212%22%3E图片加载失败%3C/text%3E%3C/svg%3E'; };
      const removeBtn = document.createElement('button');
      removeBtn.className = 'img-remove-btn';
      removeBtn.textContent = '✕';
      removeBtn.onclick = () => { wrap.remove(); updateTextStats(); };
      wrap.appendChild(img);
      wrap.appendChild(removeBtn);
      return wrap;
    }

    // ── 3) 分支剧情面板 ──
    const branchPanel = document.getElementById('branchPanel');
    document.getElementById('fmtBranch')?.addEventListener('click', () => {
      if (branchPanel) {
        const visible = branchPanel.style.display !== 'none';
        branchPanel.style.display = visible ? 'none' : 'block';
        if (!visible) { refreshBranchPanel(); showToast('点击段落可查看其分支', ''); }
      }
    });

    document.getElementById('branchPanelClose')?.addEventListener('click', () => {
      branchPanel.style.display = 'none';
    });

    // 点击编辑器时更新分支面板
    editor.addEventListener('click', () => {
      if (branchPanel && branchPanel.style.display !== 'none') {
        refreshBranchPanel();
      }
    });
    editor.addEventListener('keyup', () => {
      if (branchPanel && branchPanel.style.display !== 'none') {
        refreshBranchPanel();
      }
    });

    // 添加分支按钮
    document.getElementById('addBranchBtn')?.addEventListener('click', () => {
      const srcIdx = getCurrentParagraphIndex();
      if (srcIdx < 0) { showToast('请先点击编辑器中的一个段落', 'error'); return; }
      document.getElementById('branchSrcIdx').textContent = srcIdx + 1;
      document.getElementById('branchOptionText').value = '';
      document.getElementById('branchTargetIdx').value = '';
      document.getElementById('branchEditForm').style.display = 'block';
      delete document.getElementById('branchEditForm').dataset.editIdx;
    });

    // 取消编辑
    document.getElementById('branchEditCancel')?.addEventListener('click', () => {
      document.getElementById('branchEditForm').style.display = 'none';
    });

    // 保存分支
    document.getElementById('branchEditSave')?.addEventListener('click', () => {
      const srcIdx = getCurrentParagraphIndex();
      if (srcIdx < 0) { showToast('请先点击编辑器中的一个段落', 'error'); return; }
      const text = document.getElementById('branchOptionText').value.trim();
      const target = parseInt(document.getElementById('branchTargetIdx').value);
      if (!text) { showToast('请输入选项文字', 'error'); return; }
      if (!target || target < 1) { showToast('请输入有效的目标段落编号', 'error'); return; }

      const editIdx = document.getElementById('branchEditForm').dataset.editIdx;
      if (editIdx !== undefined) {
        // 编辑模式
        window._branchData[parseInt(editIdx)] = { srcParagraph: srcIdx, text, targetParagraph: target - 1 };
      } else {
        // 新增模式
        window._branchData.push({ srcParagraph: srcIdx, text, targetParagraph: target - 1 });
      }

      document.getElementById('branchEditForm').style.display = 'none';
      refreshBranchPanel();
      showToast('分支已保存', 'success');
    });

    // 关闭弹窗（点击外部）
    document.addEventListener('click', e => {
      if (imgPopup && imgPopup.style.display !== 'none') {
        if (!imgPopup.contains(e.target) && e.target !== document.getElementById('fmtImage')) {
          imgPopup.style.display = 'none';
        }
      }
    });

    // ── 暴露接口给 AI 智能体使用 ──
    window.SceneEditor = {
      getSceneMarkers: () => {
        return Array.from(editor.querySelectorAll('.scene-marker')).map(m => ({
          text: m.textContent.trim(),
          index: Array.from(editor.querySelectorAll('div, p, .scene-marker')).indexOf(m)
        }));
      },
      getBranches: () => window._branchData,
      getImages: () => {
        return Array.from(editor.querySelectorAll('.editor-image')).map(img => ({
          src: img.src,
          index: Array.from(editor.querySelectorAll('div, p, .editor-image-wrap, .scene-marker'))
            .indexOf(img.closest('.editor-image-wrap'))
        }));
      }
    };
  }

  function updateTextStats() {
    const editor = document.getElementById('textEditor');
    const statsEl = document.getElementById('textStats');
    if (!editor || !statsEl) return;
    const stats = Parser.countStats(editor.innerText);
    statsEl.textContent = `字数：${stats.chars.toLocaleString()} | 段落：${stats.paragraphs}`;
    // 触发写作鼓励检测
    checkEncouragement(stats.chars);
  }

  // HTML 转义
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  // 第一行自动设为标题
  function bindFirstLineTitle(editor) {
    const cb = document.getElementById('firstLineTitleCb');
    if (!cb) return;

    let titleEnabled = false;
    let titleDebounce = null;

    function applyTitle() {
      if (!titleEnabled) return;
      const raw = editor.innerText;
      const nlIdx = raw.indexOf('\n');
      if (nlIdx <= 0) {
        if (raw.trim()) {
          editor.innerHTML = '<div class="auto-title">' + escapeHtml(raw.trim()) + '</div>';
        }
        return;
      }
      const firstLine = raw.substring(0, nlIdx).trim();
      const rest = raw.substring(nlIdx + 1);
      if (firstLine) {
        editor.innerHTML = '<div class="auto-title">' + escapeHtml(firstLine) + '</div>'
          + escapeHtml(rest).replace(/\n/g, '<br>');
      }
    }

    function removeTitle() {
      editor.innerText = editor.innerText; // 还原纯文本
      updateTextStats();
    }

    cb.addEventListener('change', () => {
      titleEnabled = cb.checked;
      if (titleEnabled) {
        applyTitle();
        showToast('已启用：第一行自动设为标题', 'success');
      } else {
        removeTitle();
        showToast('已取消标题格式', '');
      }
    });

    editor.addEventListener('input', () => {
      if (!titleEnabled) return;
      clearTimeout(titleDebounce);
      titleDebounce = setTimeout(applyTitle, 300);
    });
  }

  // 文本选中操作栏
  // ── 浮动选中气泡（替换旧的 sticky bar + persist-selection 机制） ──
  let _selectedText = '';              // 当前选中的文本
  let _selectedRange = null;           // 选中区的 Range 快照

  function hideSelectionPopup() {
    const popup = document.getElementById('selectionPopup');
    if (popup) { popup.classList.remove('show'); popup.style.left = '-9999px'; }
    _selectedText = '';
    _selectedRange = null;
  }

  let _popupHideTimer = null;
  function showSelectionPopup(text, range) {
    const popup = document.getElementById('selectionPopup');
    const spCount = document.getElementById('spCount');
    if (!popup) return;

    _selectedText = text;
    _selectedRange = range ? range.cloneRange() : null;
    if (spCount) spCount.textContent = text.length;

    // 定位：在选区末尾上方
    const rect = range.getBoundingClientRect();
    let top = rect.top - 48;           // 默认在选区上方
    let left = rect.left + rect.width / 2;

    // 如果上方空间不够，放到选区下方
    if (top < 10) {
      top = rect.bottom + 10;
      popup.classList.add('sp-below');
    } else {
      popup.classList.remove('sp-below');
    }

    // 水平居中，并限制在视口内
    popup.style.left = left + 'px';
    popup.style.top = top + 'px';
    popup.classList.add('show');

    // 延迟检测是否需要水平修正（DOM 渲染后才能获取 popup 宽度）
    requestAnimationFrame(() => {
      const pw = popup.offsetWidth;
      const vw = window.innerWidth;
      let l = left - pw / 2;
      if (l < 8) l = 8;
      if (l + pw > vw - 8) l = vw - pw - 8;
      popup.style.transform = 'translateX(0)';
      popup.style.left = l + 'px';
    });

    // 绑定气泡按钮（只绑定一次）
    if (!popup._bound) {
      popup._bound = true;
      popup.querySelectorAll('.sp-btn').forEach(btn => {
        btn.addEventListener('mousedown', e => {
          e.preventDefault(); e.stopPropagation();
          const agent = btn.dataset.agent;
          const editor = document.getElementById('textEditor');

          // 优先使用当前实时选区，回退到缓存的 _selectedRange
          let range = null;
          const sel = window.getSelection();
          if (sel && sel.rangeCount && !sel.isCollapsed && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
            range = sel.getRangeAt(0);
          } else if (_selectedRange) {
            // 验证缓存选区节点仍在 DOM 中
            try {
              if (editor.contains(_selectedRange.commonAncestorContainer)) {
                range = _selectedRange;
              }
            } catch (_) {}
          }

          if (range && editor) {
            try {
              sel.removeAllRanges();
              sel.addRange(range);
            } catch (_) {}
          }

          Agents.setContext(agent, _selectedText);
          switchAgentTab(agent);
          window.App?.showToast(`已引用到 ${agent === 'ziwen' ? '字吻' : '花花'}`, 'success');
          setTimeout(hideSelectionPopup, 400);
        });
      });
      // 点击气泡外部关闭
      document.addEventListener('mousedown', e => {
        if (!popup.contains(e.target)) hideSelectionPopup();
      });
    }
  }

  function handleTextSelection(e) {
    // 键盘事件（keyup）延迟一下等选区稳定
    if (e && e.type === 'keyup') {
      clearTimeout(_selectionDebounce);
      _selectionDebounce = setTimeout(() => checkSelection(), 100);
      return;
    }
    // mouseup 立即检查
    if (e && e.type === 'mouseup') {
      // 给浏览器一点时间完成点击后的选区更新
      setTimeout(() => checkSelection(), 10);
      return;
    }
    checkSelection();
  }
  let _selectionDebounce = null;

  function checkSelection() {
    const sel = window.getSelection();
    const popup = document.getElementById('selectionPopup');
    const editor = document.getElementById('textEditor');
    if (!popup || !editor) return;

    const text = (sel && sel.toString() || '').trim();
    const inEditor = sel && sel.rangeCount && editor.contains(sel.getRangeAt(0).commonAncestorContainer);

    if (text.length > 5 && inEditor) {
      // 显示浮动气泡
      showSelectionPopup(text, sel.getRangeAt(0));
    } else if (text.length <= 5) {
      hideSelectionPopup();
    }
    // 如果选区在编辑器外（例如点击了格式按钮），不关闭气泡
  }

  // ── 文件导入 ──
  function bindFileImport() {
    // ── 单/多文件导入 ──
    document.getElementById('fileInput')?.addEventListener('change', async e => {
      const files = Array.from(e.target.files);
      if (!files.length) return;
      e.target.value = '';

      if (files.length === 1) {
        // 单文件：直接注入编辑器
        showToast('正在解析文件…', '');
        try {
          const text = await Parser.parseFile(files[0]);
          injectToEditor(text);
          showToast(`✓ 已导入 ${files[0].name}`, 'success');
        } catch(err) {
          showToast(err.message || '导入失败', 'error');
        }
      } else {
        // 多文件批量导入：显示结果弹窗
        showToast(`正在批量解析 ${files.length} 个文件…`, '');
        const results = await Parser.parseFiles(files);
        showBatchResult(results);
      }
    });

    // ── 网页 URL 导入 ──
    document.getElementById('urlImportBtn')?.addEventListener('click', () => {
      const panel = document.getElementById('urlImportPanel');
      if (panel) {
        const isVisible = panel.style.display !== 'none';
        panel.style.display = isVisible ? 'none' : 'block';
        if (!isVisible) document.getElementById('urlInput')?.focus();
      }
    });

    document.getElementById('urlImportClose')?.addEventListener('click', () => {
      document.getElementById('urlImportPanel').style.display = 'none';
    });

    const doFetch = async () => {
      const urlEl = document.getElementById('urlInput');
      const url = urlEl?.value.trim();
      if (!url) { showToast('请输入网址', 'error'); return; }
      const btn = document.getElementById('urlFetchBtn');
      btn.textContent = '爬取中…';
      btn.disabled = true;
      try {
        const text = await Parser.parseUrl(url);
        injectToEditor(text);
        document.getElementById('urlImportPanel').style.display = 'none';
        if (urlEl) urlEl.value = '';
        showToast('✓ 网页正文已导入', 'success');
      } catch(err) {
        showToast(err.message || '爬取失败，请换一个链接试试', 'error');
      } finally {
        btn.textContent = '爬取正文';
        btn.disabled = false;
      }
    };

    document.getElementById('urlFetchBtn')?.addEventListener('click', doFetch);
    document.getElementById('urlInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') doFetch();
    });
  }

  // ── 注入文本到编辑器（兼容纯文本和 HTML 富文本） ──
  function injectToEditor(textOrHtml, append = false) {
    const editor = document.getElementById('textEditor');
    if (!editor) return;
    const isHtml = typeof textOrHtml === 'string' && textOrHtml.trim().startsWith('<');
    if (append) {
      if (isHtml) {
        editor.innerHTML += '<br><br>' + textOrHtml;
      } else {
        editor.innerText = (editor.innerText.trim() ? editor.innerText + '\n\n' : '') + textOrHtml;
      }
    } else {
      if (isHtml) {
        editor.innerHTML = textOrHtml;
      } else {
        editor.innerText = textOrHtml;
      }
    }
    updateTextStats();
  }

  // ── 批量导入结果弹窗 ──
  function showBatchResult(results) {
    const ok    = results.filter(r => r.ok);
    const fail  = results.filter(r => !r.ok);

    // 合并所有成功文本（用章节分隔线隔开）
    if (ok.length) {
      const combined = ok.map(r =>
        `━━━ ${r.name} ━━━\n\n${r.text}`
      ).join('\n\n');
      injectToEditor(combined);
    }

    // 构建简要报告
    let msg = `批量导入完成：${ok.length} 成功`;
    if (fail.length) {
      msg += `，${fail.length} 失败（${fail.map(r => r.name).join('、')}）`;
    }
    showToast(msg, ok.length ? 'success' : 'error');
  }

  // ── 智能体 Tab ──
  function bindAgentTabs() {
    document.querySelectorAll('.agent-tab').forEach(tab => {
      tab.addEventListener('click', () => switchAgentTab(tab.dataset.agent));
    });
  }

  function switchAgentTab(agentId) {
    document.querySelectorAll('.agent-tab').forEach(t => t.classList.toggle('active', t.dataset.agent === agentId));
    document.querySelectorAll('.agent-workspace').forEach(w => w.classList.toggle('active', w.id === 'agent-' + agentId));
  }

  // ── 智能体发送 ──
  function bindAgentSend() {
    // 字吻
    const ziSend = document.getElementById('ziwen-send');
    const ziInput = document.getElementById('ziwen-input');
    ziSend?.addEventListener('click', () => sendZiwen());
    ziInput?.addEventListener('keydown', e => { if (e.ctrlKey && e.key === 'Enter') sendZiwen(); });

    // 花花
    const huaSend = document.getElementById('huahua-send');
    const huaInput = document.getElementById('huahua-input');
    huaSend?.addEventListener('click', () => sendHuahua());
    huaInput?.addEventListener('keydown', e => { if (e.ctrlKey && e.key === 'Enter') sendHuahua(); });

    // 暮舟
    const mzSend = document.getElementById('mzhou-send');
    const mzInput = document.getElementById('mzhou-input');
    mzSend?.addEventListener('click', () => sendMzhou());
    mzInput?.addEventListener('keydown', e => { if (e.ctrlKey && e.key === 'Enter') sendMzhou(); });

    // 发布按钮
    document.getElementById('publishBtn')?.addEventListener('click', publishWork);
    // 清空对话
    document.getElementById('clearChatBtn')?.addEventListener('click', () => {
      const activeAgent = document.querySelector('.agent-workspace.active')?.id?.replace('agent-', '');
      if (activeAgent) {
        const history = document.getElementById(activeAgent + '-history');
        if (history) history.innerHTML = '';
        showToast('对话已清空', '');
      }
    });
  }

  function sendZiwen() {
    const input = document.getElementById('ziwen-input');
    const val = input?.value.trim();
    if (!val && !Agents) return;
    Agents.sendZiwen(val || '');
    if (input) input.value = '';
  }

  function sendHuahua() {
    const input = document.getElementById('huahua-input');
    const val = input?.value.trim();
    Agents.sendHuahua(val || '');
    if (input) input.value = '';
  }

  function sendMzhou() {
    const input = document.getElementById('mzhou-input');
    const val = input?.value.trim();
    Agents.sendMzhou(val || '');
    if (input) input.value = '';
  }

  window.App = { showToast, publishWork };

  // ── 发布到成品库 ──
  function publishWork() {
    // 打开新建作品模态框，预填数据
    const title = document.getElementById('vnTitle')?.value || '未命名视觉小说';
    document.getElementById('workModalTitle').textContent = '发布到成品库';
    document.getElementById('workName').value = title;
    document.getElementById('workDesc').value = '';
    document.getElementById('workTags').value = '';
    document.getElementById('workColor').value = '#534AB7';
    // 更新合集选项
    LibraryManager.renderCollectionList();
    document.getElementById('workModal').style.display = 'flex';
    // 覆盖保存逻辑，使用当前场景数据
    document.getElementById('saveWorkBtn').onclick = () => LibraryManager.saveWorkFromModal();
  }

  // ── Panel 折叠 ──
  function bindPanelCollapse() {
    const layout = document.querySelector('.studio-layout');
    const textPanel = document.getElementById('textPanel');
    const layoutPanel = document.getElementById('layoutPanel');
    const rootStyle = getComputedStyle(document.documentElement);
    const leftW = rootStyle.getPropertyValue('--panel-left-w').trim();
    const rightW = rootStyle.getPropertyValue('--panel-right-w').trim();

    function resetGrid() {
      layout.style.gridTemplateColumns = '';
    }

    // 左侧展开/收起
    document.getElementById('expandTextPanel')?.addEventListener('click', () => {
      const btn = document.getElementById('expandTextPanel');
      const isExpanded = textPanel.classList.toggle('expanded');
      if (isExpanded) {
        textPanel.classList.remove('collapsed');
        document.getElementById('collapseTextPanel').textContent = '◁';
        layoutPanel.classList.add('collapsed');
        document.getElementById('collapseRightPanel').textContent = '◁';
        layout.style.gridTemplateColumns = '680px 1fr 42px';
        btn.title = '恢复原始宽度';
      } else {
        layoutPanel.classList.remove('collapsed');
        document.getElementById('collapseRightPanel').textContent = '▷';
        resetGrid();
        btn.title = '向右展开一倍';
      }
    });

    // 左侧原有收起按钮
    document.getElementById('collapseTextPanel')?.addEventListener('click', () => {
      if (textPanel.classList.contains('expanded')) {
        textPanel.classList.remove('expanded');
        document.getElementById('expandTextPanel').title = '向右展开一倍';
        layoutPanel.classList.remove('collapsed');
        document.getElementById('collapseRightPanel').textContent = '▷';
        resetGrid();
        return;
      }
      const btn = document.getElementById('collapseTextPanel');
      const isCollapsed = textPanel.classList.toggle('collapsed');
      btn.textContent = isCollapsed ? '▷' : '◁';
      if (isCollapsed) layout.style.gridTemplateColumns = `42px 1fr ${rightW}`;
      else resetGrid();
    });

    // 右侧收起按钮
    document.getElementById('collapseRightPanel')?.addEventListener('click', () => {
      const btn = document.getElementById('collapseRightPanel');
      const isCollapsed = layoutPanel.classList.toggle('collapsed');
      btn.textContent = isCollapsed ? '◁' : '▷';
      if (isCollapsed) layout.style.gridTemplateColumns = `${leftW} 1fr 42px`;
      else resetGrid();
    });
  }

  // ── 排版面板 ──
  function bindLayoutPanel() {
    const editor = document.getElementById('textEditor');
    const layoutPreview = document.getElementById('lpContent');
    const layoutEmpty = document.getElementById('lpEmpty');
    if (!editor || !layoutPreview) return;

    // 当前选中的模板
    let currentTemplate = 'sakura';
    const templateBgs = {
      sakura: 'linear-gradient(180deg, #fff0f5 0%, #ffe4ec 100%)',
      night: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
      parchment: 'linear-gradient(180deg, #f5e6c8 0%, #e8d5a8 100%)',
      ink: 'linear-gradient(180deg, #f5f0e8 0%, #e8e0d0 100%)',
      starry: 'linear-gradient(180deg, #0d1b2a 0%, #1b2838 100%)'
    };

    // 模板选择
    document.querySelectorAll('.template-card[data-tpl]').forEach(card => {
      card.addEventListener('click', () => {
        if (card.dataset.tpl === 'custom') {
          openCanvasModal();
          return;
        }
        document.querySelectorAll('.template-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        currentTemplate = card.dataset.tpl;
        // 不清除 _customCanvasBg — 用户画布优先于模板
        _savedCanvasBg = null;
        _savedCanvasBgImage = null;
        applyTemplateBg(currentTemplate);
        layoutPreview.style.backgroundImage = '';
        layoutPreview.style.backgroundColor = '';
      });
    });

    // ══════ 画布编辑器弹窗 ══════
    let canvasState = {
      mode: 'color',       // 'color' | 'image'
      bgColor: '#fff0f5',
      gradientDir: '180deg',
      bgImage: null,
      ratio: '16:9',
      texture: null,
      texOpacity: 40,
      pattern: null,        // 纹理样式：null|'sakura'|'ginkgo'|'goldDust'|'snow'|'bamboo'|'beast'
      _materialPattern: null  // 材质专属图案 CSS url()
    };
    // 联动：保存/恢复排版预览背景
    let _savedCanvasBg = null;
    let _savedCanvasBgImage = null;
    let _customCanvasBg = null;         // 用户自定义画布背景 image
    let _customCanvasBgImage = null;    // 同上（兼容旧引用）
    let _customCanvasBgSize = null;
    let _customCanvasBgRepeat = null;
    let _customCanvasBgPos = null;
    let _customCanvasBgColor = null;
    let _prevLayoutBg = null;
    let _prevLayoutBgImage = null;

    const RATIO_MAP = {
      '16:9': 16/9,
      '9:16': 9/16,
      '4:3': 4/3,
      '1:1': 1,
      '3:4': 3/4
    };

    function openCanvasModal() {
      const modal = document.getElementById('canvasModal');
      if (!modal) return;
      // 保存当前排版预览背景（取消时恢复）
      _prevLayoutBg = layoutPreview.style.background;
      _prevLayoutBgImage = layoutPreview.style.backgroundImage;
      modal.style.display = 'flex';
      // Reset tab
      modal.querySelectorAll('.ce-tab').forEach(t => { t.classList.remove('active'); });
      modal.querySelector('.ce-tab[data-ce-tab="canvas"]')?.classList.add('active');
      document.getElementById('cePanelCanvas').style.display = 'block';
      document.getElementById('cePanelTexture').style.display = 'none';
      document.getElementById('cePanelMaterial').style.display = 'none';
      updateBigPreview();
    }

    function closeCanvasModal(restore = true) {
      document.getElementById('canvasModal').style.display = 'none';
      if (restore && _prevLayoutBg !== null) {
        layoutPreview.style.background = _prevLayoutBg;
        layoutPreview.style.backgroundImage = _prevLayoutBgImage || '';
        if (_prevLayoutBgImage) {
          layoutPreview.style.backgroundSize = 'cover';
          layoutPreview.style.backgroundPosition = 'center';
        }
      }
      // 清除材质图案临时状态
      canvasState._materialPattern = null;
    }

    document.getElementById('canvasModalClose')?.addEventListener('click', () => closeCanvasModal(true));
    document.getElementById('canvasModalCancel')?.addEventListener('click', () => closeCanvasModal(true));
    document.getElementById('canvasModal')?.addEventListener('click', e => {
      if (e.target === document.getElementById('canvasModal')) closeCanvasModal(true);
    });

    // Tab 切换
    document.querySelectorAll('#canvasModal .ce-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('#canvasModal .ce-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const tabName = tab.dataset.ceTab;
        document.getElementById('cePanelCanvas').style.display = tabName === 'canvas' ? 'block' : 'none';
        document.getElementById('cePanelTexture').style.display = tabName === 'texture' ? 'block' : 'none';
        document.getElementById('cePanelMaterial').style.display = tabName === 'material' ? 'block' : 'none';
      });
    });

    // 纯色背景 — 选择色块 → 切换为纯色模式
    document.querySelectorAll('#canvasModal .ce-color-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        document.querySelectorAll('#canvasModal .ce-color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        canvasState.mode = 'color';
        canvasState.bgColor = dot.dataset.color;
        canvasState.bgImage = null;
        updateModeHint();
        updateBigPreview();
      });
    });

    // 自定义取色器 → 纯色模式
    document.getElementById('ceCustomColor')?.addEventListener('input', e => {
      canvasState.mode = 'color';
      canvasState.bgColor = e.target.value;
      canvasState.bgImage = null;
      document.querySelectorAll('#canvasModal .ce-color-dot').forEach(d => d.classList.remove('active'));
      updateModeHint();
      updateBigPreview();
    });

    // 渐变方向
    document.querySelectorAll('#canvasModal .ce-dir-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#canvasModal .ce-dir-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        canvasState.gradientDir = btn.dataset.dir;
        updateBigPreview();
      });
    });

    // 图片上传 → 切换为图片模式
    document.getElementById('ceBgImage')?.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        canvasState.mode = 'image';
        canvasState.bgImage = ev.target.result;
        canvasState.bgColor = null;
        document.querySelectorAll('#canvasModal .ce-color-dot').forEach(d => d.classList.remove('active'));
        updateModeHint();
        updateBigPreview();
      };
      reader.readAsDataURL(file);
    });

    // 图片链接 → 图片模式
    document.getElementById('ceApplyUrl')?.addEventListener('click', () => {
      const url = document.getElementById('ceBgUrl')?.value.trim();
      if (!url) return;
      canvasState.mode = 'image';
      canvasState.bgImage = url;
      canvasState.bgColor = null;
      document.querySelectorAll('#canvasModal .ce-color-dot').forEach(d => d.classList.remove('active'));
      updateModeHint();
      updateBigPreview();
    });

    function updateModeHint() {
      const hint = document.getElementById('ceModeHint');
      if (hint) hint.textContent = canvasState.mode === 'color' ? '当前：纯色模式' : '当前：图片模式';
    }

    // 比例选择
    document.querySelectorAll('#canvasModal .ce-ratio-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#canvasModal .ce-ratio-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        canvasState.ratio = btn.dataset.ratio;
        updateBigPreview();
      });
    });

    // 纹理选择
    document.querySelectorAll('#canvasModal .ce-tex-card').forEach(card => {
      card.addEventListener('click', () => {
        if (canvasState.texture === card.dataset.tex) {
          canvasState.texture = null;
          card.classList.remove('active');
        } else {
          document.querySelectorAll('#canvasModal .ce-tex-card').forEach(t => t.classList.remove('active'));
          card.classList.add('active');
          canvasState.texture = card.dataset.tex;
        }
        updateBigPreview();
      });
    });

    // 纹理强度
    document.getElementById('ceTexOpacity')?.addEventListener('input', e => {
      canvasState.texOpacity = parseInt(e.target.value);
      const valEl = document.getElementById('ceTexOpacityVal');
      if (valEl) valEl.textContent = e.target.value + '%';
      updateBigPreview();
    });

    // 花纹样式选择（画布 Tab 内）
    document.querySelectorAll('#canvasModal .ce-pattern-card').forEach(card => {
      card.addEventListener('click', () => {
        const patKey = card.dataset.pattern || null;  // '' → null (无花纹)
        if (canvasState.pattern === patKey) {
          // 二次点击同花纹 → 切换为无花纹
          canvasState.pattern = null;
          document.querySelectorAll('#canvasModal .ce-pattern-card').forEach(c => c.classList.remove('active'));
          const noneCard = document.querySelector('#canvasModal .ce-pattern-card[data-pattern=""]');
          if (noneCard) noneCard.classList.add('active');
        } else {
          document.querySelectorAll('#canvasModal .ce-pattern-card').forEach(c => c.classList.remove('active'));
          card.classList.add('active');
          canvasState.pattern = patKey;
        }
        updateBigPreview();
      });
    });

    // ── 材质预设：每种材质有独立底色 + 专属 SVG 图案（不依赖纹理 Tab）──
    const MATERIAL_PATTERNS = {
      // 透明水滴 — 浅蓝底色 + 水滴光斑 SVG
      water: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cdefs%3E%3CradialGradient id='wd' cx='40%25' cy='40%25'%3E%3Cstop offset='0%25' stop-color='white' stop-opacity='0.25'/%3E%3Cstop offset='100%25' stop-color='white' stop-opacity='0'/%3E%3C/radialGradient%3E%3C/defs%3E%3Cellipse cx='30' cy='25' rx='18' ry='14' fill='url(%23wd)'/%3E%3Cellipse cx='80' cy='60' rx='22' ry='16' fill='url(%23wd)'/%3E%3Cellipse cx='45' cy='85' rx='15' ry='12' fill='url(%23wd)'/%3E%3Cellipse cx='100' cy='15' rx='12' ry='9' fill='url(%23wd)'/%3E%3C/svg%3E`,
      // 清新拟态 — 柔粉底色 + 微妙光影圆点  
      neumorph: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cdefs%3E%3CradialGradient id='nm' cx='50%25' cy='50%25'%3E%3Cstop offset='0%25' stop-color='white' stop-opacity='0.12'/%3E%3Cstop offset='100%25' stop-color='white' stop-opacity='0'/%3E%3C/radialGradient%3E%3C/defs%3E%3Ccircle cx='20' cy='20' r='14' fill='url(%23nm)'/%3E%3Ccircle cx='75' cy='35' r='18' fill='url(%23nm)'/%3E%3Ccircle cx='45' cy='70' r='16' fill='url(%23nm)'/%3E%3Ccircle cx='90' cy='80' r='12' fill='url(%23nm)'/%3E%3C/svg%3E`,
      // 碎裂玻璃 — 深蓝底色 + 裂纹线条
      glass: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='150' height='150'%3E%3Cpath d='M20 0 L45 50 L30 90 L70 110 L55 150' stroke='rgba(255,255,255,0.06)' stroke-width='0.8' fill='none'/%3E%3Cpath d='M60 0 L75 40 L110 35 L95 80 L140 95' stroke='rgba(255,255,255,0.05)' stroke-width='0.6' fill='none'/%3E%3Cpath d='M100 0 L115 55 L85 70 L130 130' stroke='rgba(255,255,255,0.04)' stroke-width='0.7' fill='none'/%3E%3Cpath d='M0 60 L40 70 L25 110 L55 130' stroke='rgba(255,255,255,0.05)' stroke-width='0.5' fill='none'/%3E%3Cpath d='M130 10 L140 50 L120 80 L145 100' stroke='rgba(255,255,255,0.04)' stroke-width='0.6' fill='none'/%3E%3C/svg%3E`,
      // 温柔毛毡 — 暖棕底色 + 纤维短纹
      felt: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Cline x1='5' y1='8' x2='20' y2='10' stroke='rgba(139,105,60,0.06)' stroke-width='1.5'/%3E%3Cline x1='35' y1='15' x2='50' y2='12' stroke='rgba(139,105,60,0.05)' stroke-width='1.2'/%3E%3Cline x1='10' y1='30' x2='25' y2='28' stroke='rgba(139,105,60,0.06)' stroke-width='1.8'/%3E%3Cline x1='40' y1='35' x2='55' y2='38' stroke='rgba(139,105,60,0.05)' stroke-width='1.3'/%3E%3Cline x1='3' y1='50' x2='18' y2='52' stroke='rgba(139,105,60,0.06)' stroke-width='1.5'/%3E%3Cline x1='30' y1='48' x2='48' y2='45' stroke='rgba(139,105,60,0.05)' stroke-width='1.2'/%3E%3Cline x1='15' y1='55' x2='22' y2='58' stroke='rgba(139,105,60,0.04)' stroke-width='1'/%3E%3C/svg%3E`,
      // 柔顺布料 — 淡紫底色 + 经纬编织纹
      fabricW: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect x='0' y='8' width='40' height='2' rx='1' fill='rgba(130,110,150,0.05)'/%3E%3Crect x='0' y='20' width='40' height='2.5' rx='1' fill='rgba(130,110,150,0.04)'/%3E%3Crect x='0' y='32' width='40' height='2' rx='1' fill='rgba(130,110,150,0.05)'/%3E%3Crect x='10' y='0' width='2' height='40' rx='1' fill='rgba(130,110,150,0.03)'/%3E%3Crect x='28' y='0' width='2' height='40' rx='1' fill='rgba(130,110,150,0.03)'/%3E%3C/svg%3E`,
      // 宣纸 — 米白底色 + 细纤维斑点
      ricepaper: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cline x1='15' y1='5' x2='25' y2='6' stroke='rgba(139,105,20,0.04)' stroke-width='1'/%3E%3Cline x1='50' y1='18' x2='62' y2='16' stroke='rgba(139,105,20,0.03)' stroke-width='0.8'/%3E%3Cline x1='8' y1='35' x2='18' y2='37' stroke='rgba(139,105,20,0.04)' stroke-width='1.2'/%3E%3Cline x1='38' y1='42' x2='55' y2='40' stroke='rgba(139,105,20,0.03)' stroke-width='0.7'/%3E%3Cline x1='60' y1='55' x2='72' y2='57' stroke='rgba(139,105,20,0.04)' stroke-width='1'/%3E%3Cline x1='20' y1='62' x2='35' y2='60' stroke='rgba(139,105,20,0.03)' stroke-width='0.9'/%3E%3Cline x1='45' y1='72' x2='55' y2='74' stroke='rgba(139,105,20,0.04)' stroke-width='1.1'/%3E%3Ccircle cx='70' cy='22' r='1.5' fill='rgba(139,105,20,0.05)'/%3E%3Ccircle cx='30' cy='50' r='1' fill='rgba(139,105,20,0.04)'/%3E%3Ccircle cx='12' cy='68' r='1.2' fill='rgba(139,105,20,0.04)'/%3E%3C/svg%3E`,
      // 糖纸 — 彩虹渐变底色 + 细碎折光纹
      candy: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cdefs%3E%3ClinearGradient id='cg1' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='white' stop-opacity='0.2'/%3E%3Cstop offset='50%25' stop-color='white' stop-opacity='0.05'/%3E%3Cstop offset='100%25' stop-color='white' stop-opacity='0'/%3E%3C/linearGradient%3E%3C/defs%3E%3Cpolygon points='0,15 40,10 80,20 100,5 100,35 60,40 20,30 0,45' fill='url(%23cg1)'/%3E%3Cpolygon points='0,50 50,45 90,55 100,48 100,72 70,68 30,75 0,70' fill='rgba(255,255,255,0.04)'/%3E%3Ccircle cx='25' cy='25' r='2' fill='white' opacity='0.08'/%3E%3Ccircle cx='75' cy='65' r='1.5' fill='white' opacity='0.07'/%3E%3Ccircle cx='55' cy='85' r='1.8' fill='white' opacity='0.06'/%3E%3C/svg%3E`
    };

    // 材质预设定义（含底色、材质专属图案、是否暗色）
    const MATERIAL_PRESETS = {
      water:     { mode:'color', bgColor:'#e8f4fd', pattern:'water',     isDark:false },
      neumorph:  { mode:'color', bgColor:'#f5f0f5', pattern:'neumorph',  isDark:false },
      glass:     { mode:'color', bgColor:'#1a2a3a', pattern:'glass',     isDark:true },
      felt:      { mode:'color', bgColor:'#f0e6d8', pattern:'felt',      isDark:false },
      fabricW:   { mode:'color', bgColor:'#f5f0f8', pattern:'fabricW',   isDark:false },
      ricepaper: { mode:'color', bgColor:'#faf6ed', pattern:'ricepaper', isDark:false },
      candy:     { mode:'color', bgColor:'#fef5f8', pattern:'candy',     isDark:false }
    };

    // 材质选择 → 更新 canvasState 并在弹窗内预览（不关闭弹窗）
    document.querySelectorAll('#canvasModal .ce-mat-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('#canvasModal .ce-mat-card').forEach(m => m.classList.remove('active'));
        card.classList.add('active');
        const matKey = card.dataset.mat;
        const preset = MATERIAL_PRESETS[matKey];
        if (!preset) return;

        // 将材质预设写入 canvasState
        canvasState.mode = preset.mode;
        canvasState.bgColor = preset.bgColor;
        canvasState.bgImage = null;
        canvasState.texture = null;     // 材质自带图案，不使用纹理Tab
        canvasState.texOpacity = 40;
        canvasState._materialPattern = MATERIAL_PATTERNS[preset.pattern]
          ? `url("${MATERIAL_PATTERNS[preset.pattern]}")`
          : null;

        // 清除颜色选择器的高亮
        document.querySelectorAll('#canvasModal .ce-color-dot').forEach(d => d.classList.remove('active'));
        // 清除纹理Tab选中状态
        document.querySelectorAll('#canvasModal .ce-tex-card').forEach(t => t.classList.remove('active'));
        // 同步纹理强度滑块
        const texSlider = document.getElementById('ceTexOpacity');
        if (texSlider) texSlider.value = 40;
        const texVal = document.getElementById('ceTexOpacityVal');
        if (texVal) texVal.textContent = '40%';

        updateModeHint();
        updateBigPreview();
        showToast('材质「' + card.querySelector('span').textContent + '」已载入预览，请点击"应用画布"确认', 'info');
      });
    });

    // 应用画布按钮
    document.getElementById('ceApplyCanvas')?.addEventListener('click', () => {
      // 先让 updateBigPreview 同步排版预览
      updateBigPreview();

      // 标记为自定义
      document.querySelectorAll('.template-card').forEach(c => c.classList.remove('active'));
      document.getElementById('tplCustomCard').classList.add('active');
      currentTemplate = 'custom';
      _savedCanvasBg = null; _savedCanvasBgImage = null;
      // 保存完整的独立背景属性
      _customCanvasBg = layoutPreview.style.backgroundImage || '';
      _customCanvasBgImage = layoutPreview.style.backgroundImage || '';
      _customCanvasBgSize = layoutPreview.style.backgroundSize || '';
      _customCanvasBgRepeat = layoutPreview.style.backgroundRepeat || '';
      _customCanvasBgPos = layoutPreview.style.backgroundPosition || '';
      _customCanvasBgColor = layoutPreview.style.backgroundColor || '';
      closeCanvasModal(false);
      showToast('画布已应用', 'success');
    });

    // ── 纹理样式（原花纹）SVG 底纹 ──
    function generatePatternCSS(pattern) {
      if (!pattern) return { bgImage: '', bgRepeat: 'repeat' };
      const PATTERNS = {
        sakura: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E  %3Cellipse cx='80' cy='76' rx='9' ry='15' fill='%23e8a0b4' opacity='0.22'/%3E  %3Cellipse cx='94' cy='86' rx='9' ry='15' transform='rotate(72 80 86)' fill='%23e8a0b4' opacity='0.22'/%3E  %3Cellipse cx='88' cy='102' rx='9' ry='15' transform='rotate(144 80 86)' fill='%23e8a0b4' opacity='0.22'/%3E  %3Cellipse cx='72' cy='102' rx='9' ry='15' transform='rotate(216 80 86)' fill='%23e8a0b4' opacity='0.22'/%3E  %3Cellipse cx='66' cy='86' rx='9' ry='15' transform='rotate(288 80 86)' fill='%23e8a0b4' opacity='0.22'/%3E  %3Ccircle cx='80' cy='86' r='5' fill='%23e8a0b4' opacity='0.32'/%3E  %3Cellipse cx='200' cy='185' rx='6' ry='11' fill='%23e8a0b4' opacity='0.14'/%3E  %3Cellipse cx='210' cy='192' rx='6' ry='11' transform='rotate(72 200 192)' fill='%23e8a0b4' opacity='0.14'/%3E  %3Cellipse cx='206' cy='203' rx='6' ry='11' transform='rotate(144 200 192)' fill='%23e8a0b4' opacity='0.14'/%3E  %3Cellipse cx='194' cy='203' rx='6' ry='11' transform='rotate(216 200 192)' fill='%23e8a0b4' opacity='0.14'/%3E  %3Cellipse cx='190' cy='192' rx='6' ry='11' transform='rotate(288 200 192)' fill='%23e8a0b4' opacity='0.14'/%3E  %3Ccircle cx='200' cy='192' r='3.5' fill='%23e8a0b4' opacity='0.22'/%3E  %3Cellipse cx='50' cy='200' rx='4' ry='8' fill='%23e8a0b4' opacity='0.08'/%3E  %3Cellipse cx='58' cy='204' rx='4' ry='8' transform='rotate(72 50 204)' fill='%23e8a0b4' opacity='0.08'/%3E  %3Cellipse cx='55' cy='212' rx='4' ry='8' transform='rotate(144 50 204)' fill='%23e8a0b4' opacity='0.08'/%3E  %3Cellipse cx='47' cy='212' rx='4' ry='8' transform='rotate(216 50 204)' fill='%23e8a0b4' opacity='0.08'/%3E  %3Cellipse cx='45' cy='204' rx='4' ry='8' transform='rotate(288 50 204)' fill='%23e8a0b4' opacity='0.08'/%3E  %3Ccircle cx='50' cy='204' r='2.5' fill='%23e8a0b4' opacity='0.12'/%3E%3C/svg%3E`,
        ginkgo: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='90' height='90'%3E%3Cpath d='M45 20 Q50 10 55 20 L65 35 Q70 45 55 50 Q40 55 25 50 Q10 45 25 35 Z' fill='%23c8a050' opacity='0.12'/%3E%3Cpath d='M45 75 Q50 65 55 75 L60 85 Q60 90 50 90 Q40 90 40 85 Z' fill='%23c8a050' opacity='0.08'/%3E%3Ccircle cx='20' cy='55' r='1.5' fill='%23c8a050' opacity='0.1'/%3E%3C/svg%3E`,
        goldDust: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E  %3Cpolygon points='110,70 117,106 153,113 117,120 110,156 103,120 67,113 103,106' fill='%23d4a030' opacity='0.3'/%3E  %3Cpolygon points='190,35 194,56 215,61 194,66 190,87 186,66 165,61 186,56' fill='%23d4a030' opacity='0.2'/%3E  %3Cpolygon points='38,165 41,180 55,184 41,188 38,203 35,188 21,184 35,180' fill='%23d4a030' opacity='0.18'/%3E  %3Cpolygon points='195,140 197,152 208,155 197,158 195,170 193,158 182,155 193,152' fill='%23d4a030' opacity='0.13'/%3E%3C/svg%3E`,
        snow: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E  %3Cg stroke='white' stroke-opacity='0.2' stroke-width='1.2' stroke-linecap='round' fill='none'%3E    %3Cline x1='80' y1='88' x2='80' y2='122'/%3E    %3Cline x1='63' y1='96' x2='97' y2='114'/%3E    %3Cline x1='63' y1='114' x2='97' y2='96'/%3E    %3Cline x1='80' y1='80' x2='80' y2='72'/%3E    %3Cline x1='72' y1='88' x2='67' y2='83'/%3E    %3Cline x1='88' y1='88' x2='93' y2='83'/%3E    %3Cline x1='66' y1='98' x2='60' y2='96'/%3E    %3Cline x1='94' y1='112' x2='100' y2='114'/%3E    %3Cline x1='94' y1='98' x2='100' y2='96'/%3E    %3Cline x1='66' y1='112' x2='60' y2='114'/%3E  %3C/g%3E  %3Cg stroke='white' stroke-opacity='0.13' stroke-width='0.9' stroke-linecap='round' fill='none'%3E    %3Cline x1='160' y1='148' x2='160' y2='168'/%3E    %3Cline x1='150' y1='153' x2='170' y2='163'/%3E    %3Cline x1='150' y1='163' x2='170' y2='153'/%3E    %3Cline x1='160' y1='143' x2='160' y2='138'/%3E  %3C/g%3E  %3Cg stroke='white' stroke-opacity='0.09' stroke-width='0.7' stroke-linecap='round' fill='none'%3E    %3Cline x1='40' y1='30' x2='40' y2='42'/%3E    %3Cline x1='34' y1='33' x2='46' y2='39'/%3E    %3Cline x1='34' y1='39' x2='46' y2='33'/%3E  %3C/g%3E%3C/svg%3E`,
        bamboo: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='70' height='70'%3E%3Cellipse cx='35' cy='15' rx='8' ry='3' fill='%234a7c3f' opacity='0.1'/%3E%3Cellipse cx='20' cy='40' rx='6' ry='2.5' fill='%234a7c3f' opacity='0.08'/%3E%3Cellipse cx='55' cy='55' rx='7' ry='2' fill='%234a7c3f' opacity='0.09'/%3E%3C/svg%3E`,
        beast: `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cpath d='M30 20 L35 10 L40 20 L50 15 L45 25 L55 30 L45 35 L40 25 L35 35 L25 30 Z' fill='%238B6914' opacity='0.15'/%3E%3Cpath d='M70 60 L75 50 L80 60 L90 55 L85 65 L95 70 L85 75 L80 65 L75 75 L65 70 Z' fill='%238B6914' opacity='0.12'/%3E%3Ccircle cx='15' cy='55' r='2' fill='%238B6914' opacity='0.2'/%3E%3Ccircle cx='85' cy='25' r='2' fill='%238B6914' opacity='0.18'/%3E%3Ccircle cx='50' cy='65' r='1.5' fill='%238B6914' opacity='0.15'/%3E%3C/svg%3E`
      };
      const dataUri = PATTERNS[pattern];
      if (!dataUri) return { bgImage: '', bgRepeat: 'repeat' };
      return { bgImage: `url("${dataUri}")`, bgRepeat: 'repeat' };
    }

    // 将纹理样式叠加到已有背景上，返回完整的 background-image 值
    function applyPatternToBg(baseBgImage, pattern) {
      if (!pattern) return baseBgImage;
      const pat = generatePatternCSS(pattern);
      if (!pat.bgImage) return baseBgImage;
      if (!baseBgImage || baseBgImage === 'none') return pat.bgImage;
      return `${pat.bgImage}, ${baseBgImage}`;
    }

    function updateBigPreview() {
      const preview = document.getElementById('cePreviewBig');
      if (!preview) return;
      preview.style.aspectRatio = String(RATIO_MAP[canvasState.ratio] || 16/9);
      const placeholder = preview.querySelector('.ce-preview-placeholder');
      if (placeholder) placeholder.style.display = 'none';

      // 重置所有背景属性
      const bgProps = ['background','backgroundImage','backgroundColor','backgroundSize','backgroundPosition','backgroundRepeat'];
      const resetBg = (el) => bgProps.forEach(p => el.style[p] = '');

      resetBg(preview);
      resetBg(layoutPreview);

      // 构建 background-image 图层（从顶到底：纹理样式 > 材质图案 > 纹理覆盖 > 主背景）
      let bgImages = [];
      let bgSizes = [];
      let bgRepeats = [];
      let bgPositions = [];

      // 第1层：纹理样式（花纹/装饰图案）
      if (canvasState.pattern) {
        const pat = generatePatternCSS(canvasState.pattern);
        if (pat.bgImage) {
          bgImages.push(pat.bgImage);
          bgSizes.push('auto');
          bgRepeats.push(pat.bgRepeat);
          bgPositions.push('0 0');
        }
      }

      // 第2层：材质专属图案（如果有）
      if (canvasState._materialPattern) {
        bgImages.push(canvasState._materialPattern);
        bgSizes.push('auto');
        bgRepeats.push('repeat');
        bgPositions.push('0 0');
      }

      // 第3层：纹理叠加（noise/paper/fabric等）
      if (canvasState.texture) {
        const texBgs = {
          noise: `repeating-conic-gradient(rgba(0,0,0,${canvasState.texOpacity/250}) 0% 25%, transparent 0% 50%)`,
          paper: `linear-gradient(90deg,rgba(139,105,20,${canvasState.texOpacity/250}) 1px,transparent 1px)`,
          fabric: `repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,${canvasState.texOpacity/250}) 2px,rgba(0,0,0,${canvasState.texOpacity/250}) 4px)`,
          dots: `radial-gradient(circle,rgba(0,0,0,${canvasState.texOpacity/250}) 1px,transparent 1px)`,
          lines: `repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,${canvasState.texOpacity/250}) 3px,rgba(0,0,0,${canvasState.texOpacity/250}) 4px)`,
          grid: `linear-gradient(rgba(0,0,0,${canvasState.texOpacity/250}) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,${canvasState.texOpacity/250}) 1px,transparent 1px)`
        };
        const texBg = texBgs[canvasState.texture];
        if (texBg) {
          bgImages.push(texBg);
          bgSizes.push(canvasState.texture === 'noise' ? '4px 4px' : canvasState.texture === 'dots' ? '8px 8px' : canvasState.texture === 'grid' ? '12px 12px' : canvasState.texture === 'paper' ? '4px 100%' : 'auto');
          bgRepeats.push('repeat');
          bgPositions.push('50% 0');
        }
      }

      // 第4层：主背景（渐变或图片）
      if (canvasState.mode === 'image' && canvasState.bgImage) {
        bgImages.push(`url(${canvasState.bgImage})`);
        bgSizes.push('cover');
        bgRepeats.push('no-repeat');
        bgPositions.push('center');
      } else if (canvasState.mode === 'color' && canvasState.bgColor) {
        const lighter = lightenColor(canvasState.bgColor, 15);
        bgImages.push(`linear-gradient(${canvasState.gradientDir}, ${canvasState.bgColor}, ${lighter})`);
        bgSizes.push('auto');
        bgRepeats.push('no-repeat');
        bgPositions.push('0 0');
      }

      if (bgImages.length > 0) {
        const joined = bgImages.join(', ');
        // 更新弹窗内大预览
        preview.style.backgroundImage = joined;
        preview.style.backgroundSize = bgSizes.join(', ');
        preview.style.backgroundRepeat = bgRepeats.join(', ');
        preview.style.backgroundPosition = bgPositions.join(', ');
        if (canvasState.mode === 'color' && canvasState.bgColor) {
          preview.style.backgroundColor = canvasState.bgColor;
        }

        // 实时联动排版预览
        layoutPreview.style.backgroundImage = joined;
        layoutPreview.style.backgroundSize = bgSizes.join(', ');
        layoutPreview.style.backgroundRepeat = bgRepeats.join(', ');
        layoutPreview.style.backgroundPosition = bgPositions.join(', ');
        if (canvasState.mode === 'color' && canvasState.bgColor) {
          layoutPreview.style.backgroundColor = canvasState.bgColor;
        }
      }
    }

    function lightenColor(hex, percent) {
      const num = parseInt(hex.replace('#', ''), 16);
      const r = Math.min(255, (num >> 16) + percent * 2.55);
      const g = Math.min(255, ((num >> 8) & 0x00FF) + percent * 2.55);
      const b = Math.min(255, (num & 0x0000FF) + percent * 2.55);
      return '#' + (0x1000000 + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1);
    }

    function applyTemplateBg(tpl) {
      _savedCanvasBg = null;
      _savedCanvasBgImage = null;
      // 用户有自定义画布 → 优先使用
      if (_customCanvasBg) {
        layoutPreview.style.backgroundImage = _customCanvasBg;
        layoutPreview.style.backgroundSize = _customCanvasBgSize || '';
        layoutPreview.style.backgroundRepeat = _customCanvasBgRepeat || '';
        layoutPreview.style.backgroundPosition = _customCanvasBgPos || '';
        layoutPreview.style.backgroundColor = _customCanvasBgColor || '';
        layoutPreview.style.color = '';
        layoutPreview.style.textShadow = '';
        return;
      }
      const bg = templateBgs[tpl] || '';
      // 重置为独立属性
      layoutPreview.style.backgroundImage = bg.includes('gradient') ? bg : '';
      layoutPreview.style.background = bg.includes('gradient') ? '' : bg;
      layoutPreview.style.backgroundSize = '';
      layoutPreview.style.backgroundRepeat = '';
      layoutPreview.style.backgroundPosition = '';
      layoutPreview.style.backgroundColor = '';
      if (tpl === 'night' || tpl === 'starry') {
        layoutPreview.style.color = '#e0d8d0';
        layoutPreview.style.textShadow = '0 1px 2px rgba(0,0,0,.3)';
      } else {
        layoutPreview.style.color = '';
        layoutPreview.style.textShadow = '';
      }
    }

    // 自动同步：监听左侧编辑器内容变化（DOM 深度克隆保留全部格式）
    function syncLayoutPreview() {
      if (!editor || !layoutPreview) return;
      const text = editor.innerText.trim();
      if (!text) {
        lpContent.innerHTML = '';
        lpContent.style.display = 'none';
        layoutEmpty.style.display = 'flex';
        layoutPreview.style.display = 'block';
        return;
      }
      layoutEmpty.style.display = 'none';
      lpContent.style.display = 'block';
      layoutPreview.style.display = 'block';

      // 清空 lpContent 重建（保留 lpEmpty/lpContent DOM 结构）
      lpContent.innerHTML = '';
      const children = Array.from(editor.childNodes);
      let paraIndex = 0;

      for (const node of children) {
        if (node.nodeType === 1 && node.classList && node.classList.contains('scene-marker')) {
          // 场景标记
          const span = document.createElement('span');
          span.className = 'lp-scene-marker';
          span.textContent = '◆ ' + (node.textContent.trim() || '新场景');
          lpContent.appendChild(span);
        } else if (node.nodeType === 1 && node.classList && node.classList.contains('editor-image-wrap')) {
          // 配图
          const img = node.querySelector('img');
          if (img) {
            const wrap = document.createElement('div');
            wrap.className = 'lp-image-wrap';
            const clonedImg = img.cloneNode(true);
            wrap.appendChild(clonedImg);
            lpContent.appendChild(wrap);
          }
        } else if (node.nodeType === 1) {
          // 块级元素：深度克隆以保留 B/I/H2/H3 等内联格式
          const txt = node.textContent.trim();
          if (!txt) continue;
          const cloned = node.cloneNode(true);
          cloned.className = 'lp-para';
          cloned.setAttribute('data-idx', paraIndex++);
          // 映射格式标签
          cloned.querySelectorAll('b, strong').forEach(el => { el.style.fontWeight = '700'; });
          cloned.querySelectorAll('i, em').forEach(el => { el.style.fontStyle = 'italic'; });
          cloned.querySelectorAll('h2').forEach(el => { el.className = 'lp-h2'; });
          cloned.querySelectorAll('h3').forEach(el => { el.className = 'lp-h3'; });
          cloned.querySelectorAll('u').forEach(el => { el.style.textDecoration = 'underline'; });
          // 移除编辑器中可能残留的 contenteditable 属性
          cloned.querySelectorAll('[contenteditable]').forEach(el => el.removeAttribute('contenteditable'));
          lpContent.appendChild(cloned);
        } else if (node.nodeType === 3) {
          // 裸文本节点
          const txt = node.textContent.trim();
          if (!txt) continue;
          const p = document.createElement('p');
          p.className = 'lp-para';
          p.setAttribute('data-idx', paraIndex++);
          p.textContent = txt;
          lpContent.appendChild(p);
        }
      }

      // 检查分支数据
      const branches = window._branchData || [];
      branches.forEach(b => {
        const paraEl = lpContent.querySelector(`.lp-para[data-idx="${b.srcParagraph}"]`);
        if (paraEl && b.text) {
          paraEl.insertAdjacentHTML('beforeend',
            '<span class="lp-branch-hint" title="段落' + (b.targetParagraph + 1) + '">↯ ' + b.text + '</span>');
        }
      });

      // 画布联动：用户自定义画布始终优先
      if (_customCanvasBg) {
        layoutPreview.style.backgroundImage = _customCanvasBg;
        layoutPreview.style.backgroundSize = _customCanvasBgSize || '';
        layoutPreview.style.backgroundRepeat = _customCanvasBgRepeat || '';
        layoutPreview.style.backgroundPosition = _customCanvasBgPos || '';
        layoutPreview.style.backgroundColor = _customCanvasBgColor || '';
      } else if (currentTemplate === 'custom' && _savedCanvasBg) {
        layoutPreview.style.background = _savedCanvasBg;
        layoutPreview.style.backgroundImage = _savedCanvasBgImage || '';
        if (_savedCanvasBgImage) {
          layoutPreview.style.backgroundSize = 'cover';
          layoutPreview.style.backgroundPosition = 'center';
        }
      }
    }

    // 监听编辑器变化
    editor.addEventListener('input', syncLayoutPreview);
    editor.addEventListener('keyup', syncLayoutPreview);
    // 初始同步 + 默认桃花画布
    setTimeout(() => {
      syncLayoutPreview();
      // 默认应用桃花（sakura）背景到排版预览
      if (currentTemplate === 'sakura') {
        applyTemplateBg('sakura');
      }
    }, 500);

    // 插入项工具按钮
    document.getElementById('layoutInsScene')?.addEventListener('click', () => {
      // 在编辑器光标处插入场景标记
      editor.focus();
      const sel = window.getSelection();
      if (sel.rangeCount) {
        const range = sel.getRangeAt(0);
        const marker = document.createElement('div');
        marker.className = 'scene-marker';
        marker.contentEditable = 'true';
        marker.textContent = '新场景';
        range.insertNode(marker);
        range.setStartAfter(marker);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      syncLayoutPreview();
      showToast('已插入场景标记', 'success');
    });

    document.getElementById('layoutInsImage')?.addEventListener('click', () => {
      // 打开图片插入面板（复用已有功能）
      const popup = document.getElementById('imgInsertPopup');
      if (popup) popup.style.display = 'block';
    });

    document.getElementById('layoutInsSep')?.addEventListener('click', () => {
      editor.focus();
      const sel = window.getSelection();
      if (sel.rangeCount) {
        const range = sel.getRangeAt(0);
        const sep = document.createElement('div');
        sep.textContent = '— ✦ —';
        sep.style.textAlign = 'center';
        sep.style.color = 'var(--text-dim)';
        sep.style.padding = '8px 0';
        sep.style.letterSpacing = '4px';
        range.insertNode(sep);
      }
      syncLayoutPreview();
      showToast('已插入分割线', 'success');
    });

    document.getElementById('layoutInsBranch')?.addEventListener('click', () => {
      const branchPanel = document.getElementById('branchPanel');
      if (branchPanel) {
        branchPanel.style.display = branchPanel.style.display === 'none' ? 'block' : 'none';
      }
    });

    // 暴露接口
    window.LayoutPanel = {
      sync: syncLayoutPreview,
      getTemplate: () => currentTemplate,
      getPreviewHTML: () => lpContent.innerHTML,
      getPreviewBg: () => layoutPreview.style.background
    };

    // 生成 HTML 按钮
    document.getElementById('generateHtmlBtn')?.addEventListener('click', () => {
      const title = document.getElementById('vnTitle')?.value || '未命名视觉小说';
      const author = Auth.currentUser()?.username || '佚名';
      const scenes = VNStore.getCurrentScenes();
      if (!scenes.length) {
        showToast('请先用暮舟生成场景脚本', '');
        return;
      }
      const html = HtmlGenerator.generate({
        title,
        author,
        scenes,
        template: currentTemplate,
        mode: 'scroll',
        options: { petals: true, scrollReveal: true, fontSize: '16px' }
      });
      HtmlGenerator.download(html, title.replace(/[<>:\"/\\|?*]/g, '_') + '.html');
      showToast('HTML 已生成并开始下载', 'success');
    });
  }

  // ── 导出功能 ──
  function bindPublish() {
    // 填充作品选择器
    const sel = document.getElementById('pubProjectSelect');
    if (sel) {
      const works = VNStore.getWorks();
      sel.innerHTML = '<option value="">—— 当前会话场景 ——</option>' +
        works.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
    }

    document.getElementById('exportWebBtn')?.addEventListener('click', exportToHTML);
    document.getElementById('exportScriptBtn')?.addEventListener('click', exportToMarkdown);
    document.getElementById('exportPackBtn')?.addEventListener('click', exportToZip);
  }

  function exportToHTML() {
    // 读取发布面板设置
    const pubTemplate = document.getElementById('pubTemplateSelect')?.value || 'sakura';
    const pubMode = document.getElementById('pubModeSelect')?.value || 'scroll';

    // 获取场景数据
    const workId = document.getElementById('pubProjectSelect')?.value;
    const work = workId ? VNStore.getWork(workId) : null;
    const title = work?.name || document.getElementById('vnTitle')?.value || '未命名视觉小说';
    const author = work?.author || 'Phantom VN';
    const scenes = work?.scenes?.length ? work.scenes : VNStore.getCurrentScenes();

    if (!scenes || !scenes.length) {
      showToast('暂无场景数据，请先在创作工坊中生成场景', 'error');
      return;
    }

    // 收集排版面板的当前设置（如果在 studio 模式下）
    const lpContent = document.getElementById('lpContent');
    const layoutTemplate = lpContent?.closest('#layoutPanel')?.querySelector('.template-card.active')?.dataset?.tpl;
    const finalTemplate = layoutTemplate && layoutTemplate !== 'custom' ? layoutTemplate : pubTemplate;

    // 调用 HtmlGenerator 生成
    const html = HtmlGenerator.generate({
      title,
      author,
      scenes,
      template: finalTemplate,
      mode: pubMode,
      options: {
        petals: true,
        scrollReveal: true,
        fontSize: '16px',
        showSpeaker: true
      }
    });

    HtmlGenerator.download(html, title + '.html');
    showToast('HTML 视觉小说已导出', 'success');
  }

  function exportToMarkdown() {
    const workId = document.getElementById('pubProjectSelect')?.value;
    const work = workId ? VNStore.getWork(workId) : null;
    const title = work?.name || document.getElementById('vnTitle')?.value || '视觉小说剧本';
    const scenes = work?.scenes?.length ? work.scenes : VNStore.getCurrentScenes();
    if (!scenes.length) { showToast('暂无场景数据', 'error'); return; }

    const md = scenes.map((s, i) =>
      `## 场景 ${i + 1}：${s.background || ''}\n\n**${s.speaker || '旁白'}**\n\n> ${s.text || ''}\n`
    ).join('\n---\n\n');

    const blob = new Blob(['# ' + title + '\n\n' + md], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = title + '.md';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('剧本已导出', 'success');
  }

  async function exportToZip() {
    const pubTemplate = document.getElementById('pubTemplateSelect')?.value || 'sakura';
    const pubMode = document.getElementById('pubModeSelect')?.value || 'scroll';

    const workId = document.getElementById('pubProjectSelect')?.value;
    const work = workId ? VNStore.getWork(workId) : null;
    const title = work?.name || document.getElementById('vnTitle')?.value || '未命名视觉小说';
    const author = work?.author || 'Phantom VN';
    const scenes = work?.scenes?.length ? work.scenes : VNStore.getCurrentScenes();

    if (!scenes || !scenes.length) {
      showToast('暂无场景数据，请先在创作工坊中生成场景', 'error');
      return;
    }

    // 统计外部图片数量
    const externalImages = scenes.filter(s => OfflinePack.isExternalUrl(s.bgImage));
    const totalExternal = externalImages.length;

    // 禁用按钮，显示进度
    const btn = document.getElementById('exportPackBtn');
    const origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = totalExternal ? '打包中…' : '生成 ZIP…';

    try {
      const result = await OfflinePack.generate({
        title, author, scenes,
        template: pubTemplate,
        mode: pubMode,
        options: { petals: true, scrollReveal: true, fontSize: '16px', showSpeaker: true },
        onProgress: (p) => {
          if (p.stage === 'images' && totalExternal) {
            btn.textContent = `内嵌图片 ${p.current}/${p.total}…`;
          } else if (p.stage === 'html') {
            btn.textContent = '生成 HTML…';
          } else if (p.stage === 'zip') {
            btn.textContent = '打包 ZIP…';
          } else if (p.stage === 'compress') {
            btn.textContent = `压缩中 ${Math.round(p.percent || 0)}%…`;
          }
        }
      });

      if (result.ok) {
        const sizeMB = (result.size / 1024 / 1024).toFixed(1);
        showToast(`离线包已生成 (${sizeMB} MB)，可在无网络环境下阅读`, 'success');
      } else if (result.htmlOnly) {
        showToast(result.reason, '');
      }
    } catch (err) {
      console.error('离线打包失败:', err);
      showToast('打包失败，请检查网络后重试', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = origText;
    }
  }

  function downloadText(content, filename) {
    const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── 新建项目 ──
  function bindNewProject() {
    document.getElementById('newProjectBtn')?.addEventListener('click', () => {
      if (confirm('新建项目将清空当前会话资源，是否继续？')) {
        document.getElementById('textEditor').innerHTML = '';
        document.getElementById('ziwen-history').innerHTML = '';
        document.getElementById('huahua-history').innerHTML = '';
        document.getElementById('mzhou-history').innerHTML = '';
        document.getElementById('vnTitle').value = '';
        VNStore.clearTextSegments();
        Agents.updateGalleryPanel();
        Agents.updateMzhouResources();
        updateTextStats();
        switchTab('author');
        switchDashSub('author', 'studio');
        showToast('已新建项目', 'success');
      }
    });
  }

  // ── 主题切换（循环：粉色 → 暗紫 → 清新 → 鎏金） ──
  function bindThemeToggle() {
    const themes = [
      { cls: '',                   label: '桃花', icon: '❀' },
      { cls: 'theme-purple',       label: '暗紫', icon: '◐' },
      { cls: 'theme-green',        label: '清新', icon: '◐' },
      { cls: 'theme-bluegold',     label: '青金', icon: '✦' },
      { cls: 'theme-vintage',      label: '回忆', icon: '📜' }
    ];
    let idx = 0;
    document.getElementById('themeToggle')?.addEventListener('click', () => {
      idx = (idx + 1) % themes.length;
      const t = themes[idx];
      document.body.className = document.body.className
        .replace(/\btheme-\w+\b/g, '')
        .trim();
      if (t.cls) document.body.classList.add(t.cls);
      document.getElementById('themeToggle').textContent = t.icon + ' ' + t.label;
      showToast('已切换为「' + t.label + '」主题', 'success');
      // 更新花瓣：回忆→银杏 / 暗紫/清新/青金→清除 / 桃花→桃花
      const container = document.getElementById('petalFall');
      if (!container) return;
      container.innerHTML = '';
      if (document.body.classList.contains('theme-vintage')) {
        initPetalFall('ginkgo');
      } else if (!document.body.className.match(/\btheme-\w+\b/)) {
        // 默认桃花主题
        initPetalFall('peach');
      }
      // 暗紫/清新/青金主题不生成花瓣（CSS 已隐藏容器）
    });
  }

  // ── Toast 通知 ──
  let toastTimer = null;
  function showToast(msg, type = '') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.classList.remove('show'); }, 2500);
  }
  // ── 全局 Modal 关闭 ──
  window.closeModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
  };
  // 点击遮罩关闭
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.style.display = 'none';
    });
  });
  // ESC 关闭
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay').forEach(m => m.style.display = 'none');
    }
  });

  // ── 花瓣/银杏叶飘落（双模式） ──
  function initPetalFall(mode) {
    // mode: 'peach' (桃花, 默认常驻) | 'ginkgo' (银杏, vintage 触发)
    const container = document.getElementById('petalFall');
    if (!container) return;
    const petalCount = 36;

    if (mode === 'peach') {
      // 桃花模式：粉色系 + 圆形花瓣
      const colors = ['#f8a5c2','#f472b6','#e878b0','#f490ba','#faa8c4','#fca0c0'];
      for (let i = 0; i < petalCount; i++) {
        const petal = document.createElement('div');
        petal.className = 'petal-peach';
        petal.style.left = Math.random() * 100 + '%';
        petal.style.width = (10 + Math.random() * 12) + 'px';
        petal.style.height = petal.style.width;
        petal.style.setProperty('--fall-dur', (7 + Math.random() * 8) + 's');
        petal.style.setProperty('--fall-delay', Math.random() * 10 + 's');
        petal.style.setProperty('--sway-1', (Math.random() * 60 - 30) + 'px');
        petal.style.setProperty('--sway-2', (Math.random() * 50 - 25) + 'px');
        petal.style.setProperty('--sway-3', (Math.random() * 40 - 20) + 'px');
        petal.style.setProperty('--sway-4', (Math.random() * 50 - 20) + 'px');
        petal.style.setProperty('--final-rot', Math.floor(Math.random() * 60 - 30) + 'deg');
        petal.style.setProperty('--petal-opacity', 0.35 + Math.random() * 0.45);
        petal.style.setProperty('--petal-blur', (Math.random() * 0.5).toFixed(1) + 'px');
        petal.style.setProperty('--petal-bg', 'radial-gradient(ellipse at 30% 35%, ' + colors[Math.floor(Math.random() * colors.length)] + ', ' + colors[1] + ')');
        container.appendChild(petal);
      }
    } else if (mode === 'ginkgo') {
      // 银杏模式：黄色系 + 扇形 clip-path + 叶柄
      const colors = ['#f0c040','#e8a820','#d49018','#c87810','#b86800','#8b6914'];
      for (let i = 0; i < petalCount; i++) {
        const petal = document.createElement('div');
        petal.className = 'petal-ginkgo';
        petal.style.left = Math.random() * 100 + '%';
        const sz = 10 + Math.random() * 14;
        petal.style.setProperty('--petal-w', sz + 'px');
        petal.style.setProperty('--petal-h', (sz * 1.1) + 'px');
        petal.style.width = sz + 'px';
        petal.style.height = (sz * 1.1) + 'px';
        petal.style.setProperty('--fall-dur', (7 + Math.random() * 8) + 's');
        petal.style.setProperty('--fall-delay', Math.random() * 10 + 's');
        petal.style.setProperty('--sway-1', (Math.random() * 60 - 30) + 'px');
        petal.style.setProperty('--sway-2', (Math.random() * 50 - 25) + 'px');
        petal.style.setProperty('--sway-3', (Math.random() * 40 - 20) + 'px');
        petal.style.setProperty('--sway-4', (Math.random() * 50 - 20) + 'px');
        petal.style.setProperty('--final-rot', Math.floor(Math.random() * 60 - 30) + 'deg');
        petal.style.setProperty('--petal-opacity', 0.35 + Math.random() * 0.45);
        petal.style.setProperty('--petal-blur', (Math.random() * 0.5).toFixed(1) + 'px');
        petal.style.setProperty('--petal-rot', (Math.random() * 360) + 'deg');
        const ci = Math.floor(Math.random() * colors.length);
        const ci2 = (ci + 2) % colors.length;
        petal.style.setProperty('--petal-bg', 'radial-gradient(ellipse at 50% 70%, ' + colors[ci] + ', ' + colors[ci2] + ' 70%, transparent 72%)');
        container.appendChild(petal);
      }
    }
  }

  // ── Dashboard State ──
  let activeDashboard = null;  // 'reader' | 'author' | null
  const panelOrigins = {};     // store original parents of panels moved into dashboards

  // Move a tab-panel into a dashboard content div
  function movePanelToDash(panelName, dashContentId) {
    const panel = document.getElementById('tab-' + panelName);
    const target = document.getElementById(dashContentId);
    if (!panel || !target) return;
    if (!panelOrigins[panelName]) {
      panelOrigins[panelName] = panel.parentElement;
    }
    // Restore any existing panel in dashboard first
    const existing = target.querySelector('.tab-panel');
    if (existing && existing.id !== ('tab-' + panelName)) {
      const orig = panelOrigins[existing.id.replace('tab-', '')];
      if (orig && orig !== target) {
        existing.style.display = '';
        existing.classList.remove('active');
        existing.removeAttribute('data-in-dash');
        orig.appendChild(existing);
      }
    }
    target.appendChild(panel);
    panel.dataset.inDash = 'true';
    panel.classList.add('active');
    // Set display based on panel type
    if (panelName === 'studio') panel.style.display = 'flex';
    else panel.style.display = 'block';
  }

  // Restore all panels from dashboards back to their origins
  function restoreDashPanels() {
    for (const [name, origin] of Object.entries(panelOrigins)) {
      const panel = document.getElementById('tab-' + name);
      if (panel && panel.parentElement !== origin) {
        panel.classList.remove('active');
        panel.removeAttribute('data-in-dash');
        panel.style.display = '';
        if (origin && origin !== panel.parentElement) {
          origin.appendChild(panel);
        }
      }
    }
    activeDashboard = null;
  }

  // Set active sub-nav button
  function setDashSubActive(navId, subName) {
    const nav = document.getElementById(navId);
    if (!nav) return;
    nav.querySelectorAll('.dash-nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.dashSub === subName);
    });
  }

  // Switch sub-tab within a dashboard
  window.switchDashSub = function(dashboard, sub) {
    if (sub === 'home') { switchTab('home'); return; }

    if (dashboard === 'reader') {
      restoreDashPanels();
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('tab-reader').classList.add('active');
      movePanelToDash('explore', 'readerContent');
      setDashSubActive('readerNav', sub);
      if (!exploreInited) { exploreInited = true; initExploreView(); }
      activeDashboard = 'reader';
      history.replaceState(null, '', '#reader');
    } else if (dashboard === 'author') {
      restoreDashPanels();
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('tab-author').classList.add('active');
      movePanelToDash(sub, 'authorContent');
      setDashSubActive('authorNav', sub);
      activeDashboard = 'author';
      history.replaceState(null, '', '#author');
    }
  };

  // ── Hash 路由 & 扩展 Tab 切换 ──
  window.switchTab = function(tabId) {
    // ── 旧 hash 重定向到对应 Dashboard ──
    if (tabId === 'explore') {
      restoreDashPanels();
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('tab-reader').classList.add('active');
      movePanelToDash('explore', 'readerContent');
      setDashSubActive('readerNav', 'explore');
      if (!exploreInited) { exploreInited = true; initExploreView(); }
      activeDashboard = 'reader';
      history.replaceState(null, '', '#reader');
      return;
    }
    if (['studio', 'library', 'publish'].includes(tabId)) {
      restoreDashPanels();
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('tab-author').classList.add('active');
      movePanelToDash(tabId, 'authorContent');
      setDashSubActive('authorNav', tabId);
      activeDashboard = 'author';
      history.replaceState(null, '', '#author');
      return;
    }

    // Restore any panels moved into dashboards
    restoreDashPanels();

    // Hide all panels (including reader/author shells)
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

    // Topbar / footer / petal control
    const topbar = document.querySelector('.topbar');
    const footer = document.querySelector('.site-footer');
    const petalFall = document.getElementById('petalFall');
    const storyPanel = document.getElementById('tab-story');

    // ── Story: full-screen mode ──
    if (tabId === 'story') {
      if (topbar) topbar.style.display = 'none';
      if (footer) footer.style.display = 'none';
      if (petalFall) petalFall.style.display = 'none';
      document.body.style.overflow = 'hidden';
      if (storyPanel) {
        storyPanel.classList.add('active');
        storyPanel.style.position = 'fixed';
        storyPanel.style.top = '0'; storyPanel.style.left = '0';
        storyPanel.style.right = '0'; storyPanel.style.bottom = '0';
        storyPanel.style.zIndex = '10';
        storyPanel.style.overflowY = 'auto';
      }
      return;
    }

    // ── Normal mode ──
    if (topbar) topbar.style.display = '';
    if (footer) footer.style.display = '';
    if (petalFall) petalFall.style.display = '';
    document.body.style.overflow = '';
    if (storyPanel) {
      storyPanel.style.position = ''; storyPanel.style.top = '';
      storyPanel.style.left = ''; storyPanel.style.right = '';
      storyPanel.style.bottom = ''; storyPanel.style.zIndex = '';
      storyPanel.style.overflowY = '';
    }
    if (typeof stPetalAnimId !== 'undefined' && stPetalAnimId) { cancelAnimationFrame(stPetalAnimId); stPetalAnimId = null; }

    // ── Reader Dashboard ──
    if (tabId === 'reader') {
      document.getElementById('tab-reader').classList.add('active');
      movePanelToDash('explore', 'readerContent');
      setDashSubActive('readerNav', 'explore');
      if (!exploreInited) { exploreInited = true; initExploreView(); }
      activeDashboard = 'reader';
      history.replaceState(null, '', '#reader');
      return;
    }

    // ── Author Dashboard ──
    if (tabId === 'author') {
      document.getElementById('tab-author').classList.add('active');
      movePanelToDash('studio', 'authorContent');
      setDashSubActive('authorNav', 'studio');
      activeDashboard = 'author';
      history.replaceState(null, '', '#author');
      return;
    }

    // ── Home (Landing) ──
    if (tabId === 'home') {
      const target = document.getElementById('tab-home');
      if (target) target.classList.add('active');
      history.replaceState(null, '', '#home');
      loadHomeFeatured();
      return;
    }
  };

  window.App = { showToast, publishWork, switchTab };

  // ── Hash 变化处理 ──
  function handleHash() {
    const hash = window.location.hash.replace('#', '');
    const path = window.location.pathname;

    if (!hash && path !== '/' && path !== '/index.html') {
      if (path.startsWith('/story/')) {
        const storyId = path.split('/').pop();
        window.location.replace('/#story/' + storyId);
        return;
      }
      if (path === '/explore' || path === '/explore.html' || path === '/story.html') {
        window.location.replace('/#reader');
        return;
      }
    }

    if (!hash) { switchTab('home'); return; }
    if (hash.startsWith('story/')) {
      const storyId = hash.replace('story/', '');
      switchTab('story');
      loadStoryView(storyId);
    } else if (['home', 'reader', 'author', 'studio', 'explore', 'library', 'publish'].includes(hash)) {
      switchTab(hash);
    }
  }

  window.addEventListener('hashchange', handleHash);

  // ── 首页推荐作品 ──
  async function loadHomeFeatured() {
    const grid = document.getElementById('homeFeatGrid');
    if (!grid || grid.dataset.loaded) return;
    try {
      const resp = await fetch('/api/stories?page=1&limit=6&sort=popular');
      const data = await resp.json();
      if (data.stories && data.stories.length > 0) {
        grid.innerHTML = data.stories.map(s => {
          const cover = s.cover_image_url || '';
          return '<a class="home-feat-card" href="#story/' + s.id + '">' +
            (cover ? '<div class="home-feat-cover" style="background-image:url(' + cover + ')"></div>' : '<div class="home-feat-cover home-feat-placeholder">◆</div>') +
            '<div class="home-feat-info"><h3>' + s.title + '</h3><p>' + (s.users?.username || '匿名') + ' · ' + (s.like_count || 0) + ' ♥</p></div></a>';
        }).join('');
        grid.dataset.loaded = '1';
      }
    } catch (e) { console.warn('Featured load error:', e); }
  }

  // ═══════════════════════════
  // Explore View
  // ═══════════════════════════
  let exploreInited = false;
  let explorePage = 1;
  let exploreSort = 'newest';
  let exploreCat = '';
  let exploreSearch = '';
  let exploreTotal = 0;
  const EXPLORE_LIMIT = 12;

  async function initExploreView() {
    // Sort buttons
    document.querySelectorAll('#tab-explore .exp-sort-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#tab-explore .exp-sort-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        exploreSort = btn.dataset.sort;
        exploreRefresh();
      });
    });
    // Category pills
    document.querySelectorAll('#tab-explore .exp-cat-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        document.querySelectorAll('#tab-explore .exp-cat-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        exploreCat = pill.dataset.cat;
        exploreRefresh();
      });
    });
    // Search
    let searchTimer;
    document.getElementById('expSearchInput').addEventListener('input', e => {
      clearTimeout(searchTimer);
      exploreSearch = e.target.value.trim();
      searchTimer = setTimeout(() => exploreRefresh(), 400);
    });
    // Load more
    document.getElementById('expLoadMoreBtn').addEventListener('click', exploreLoadMore);

    await exploreRefresh();
  }

  async function exploreRefresh() {
    explorePage = 1;
    const loading = document.getElementById('expLoading');
    if (loading) loading.classList.add('show');
    try {
      const params = new URLSearchParams({ page: '1', limit: String(EXPLORE_LIMIT), sort: exploreSort });
      if (exploreCat) params.set('tag', exploreCat);
      if (exploreSearch) params.set('search', exploreSearch);
      const resp = await fetch('/api/stories?' + params);
      const data = await resp.json();
      if (loading) loading.classList.remove('show');
      exploreTotal = data.total || 0;
      renderExploreCards(data.stories || [], false);
      document.getElementById('expLoadMoreWrap').style.display =
        (data.stories && data.stories.length >= EXPLORE_LIMIT && exploreTotal > EXPLORE_LIMIT) ? 'block' : 'none';
    } catch (err) {
      if (loading) loading.classList.remove('show');
      console.error('Explore fetch error:', err);
    }
  }

  async function exploreLoadMore() {
    const btn = document.getElementById('expLoadMoreBtn');
    btn.classList.add('loading');
    btn.textContent = '加载中...';
    explorePage++;
    try {
      const params = new URLSearchParams({ page: String(explorePage), limit: String(EXPLORE_LIMIT), sort: exploreSort });
      if (exploreCat) params.set('tag', exploreCat);
      if (exploreSearch) params.set('search', exploreSearch);
      const resp = await fetch('/api/stories?' + params);
      const data = await resp.json();
      if (data.stories && data.stories.length > 0) {
        renderExploreCards(data.stories, true);
      } else {
        explorePage--;
      }
      if (!data.stories || data.stories.length < EXPLORE_LIMIT || explorePage * EXPLORE_LIMIT >= exploreTotal) {
        document.getElementById('expLoadMoreWrap').style.display = 'none';
      }
    } catch (err) {
      explorePage--;
      console.error('Explore loadMore error:', err);
    } finally {
      btn.classList.remove('loading');
      btn.textContent = '加载更多';
    }
  }

  function renderExploreCards(stories, append) {
    const grid = document.getElementById('expCardGrid');
    if (!append) grid.innerHTML = '';
    if (!stories || stories.length === 0) {
      if (!append) {
        grid.innerHTML = '<div class="exp-empty"><h3>还没有作品</h3><p>成为第一位创作者，发布你的轻视觉小说</p></div>';
      }
      return;
    }
    stories.forEach(s => {
      const card = document.createElement('div');
      card.className = 'exp-card';
      card.onclick = () => { window.location.hash = '#story/' + s.id; };
      const date = s.created_at ? new Date(s.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
      const authorName = (s.users && s.users.username) ? s.users.username : '佚名';
      const tags = s.tags || [];
      const cover = s.cover_image_url
        ? '<img class="exp-card-cover" src="' + s.cover_image_url + '" alt="' + (s.title || '') + '" loading="lazy" onerror="this.classList.add(\'placeholder\');this.innerHTML=\'书\'">'
        : '<div class="exp-card-cover placeholder">书</div>';
      card.innerHTML = cover +
        '<div class="exp-card-body">' +
        '<h3 class="exp-card-title">' + (s.title || '未命名作品') + '</h3>' +
        '<p class="exp-card-summary">' + (s.summary || '暂无简介') + '</p>' +
        '<div class="exp-card-tags">' + tags.slice(0, 3).map(t => '<span class="exp-card-tag">' + t + '</span>').join('') + '</div>' +
        '<div class="exp-card-footer">' +
        '<span class="exp-card-author">' + authorName + '</span>' +
        '<div class="exp-card-stats"><span>' + (s.view_count || 0) + ' 阅读</span><span>' + (s.like_count || 0) + ' 赞</span></div>' +
        '</div></div>';
      grid.appendChild(card);
    });
  }

  // ═══════════════════════════
  // Story View
  // ═══════════════════════════
  let stStoryData = null;
  let stStoryId = null;
  let stPetalAnimId = null;
  let stLiked = false;
  let stFaved = false;
  const stSettings = { bgm: true, reveal: true, fx: true, grain: true, mouse: true, flash: true };

  // Load saved settings
  try {
    const saved = localStorage.getItem('phantom_reading_settings');
    if (saved) Object.assign(stSettings, JSON.parse(saved));
  } catch (e) { }

  function stApplySettings() {
    const storyPanel = document.getElementById('tab-story');
    if (!storyPanel) return;
    document.getElementById('stToggleBGM').classList.toggle('on', stSettings.bgm);
    document.getElementById('stToggleReveal').classList.toggle('on', stSettings.reveal);
    document.getElementById('stToggleFx').classList.toggle('on', stSettings.fx);
    document.getElementById('stToggleGrain').classList.toggle('on', stSettings.grain);
    document.getElementById('stToggleMouse').classList.toggle('on', stSettings.mouse);
    document.getElementById('stToggleFlash').classList.toggle('on', stSettings.flash);
    storyPanel.classList.toggle('no-reveal', !stSettings.reveal);
    storyPanel.classList.toggle('grain-off', !stSettings.grain);
    const petals = document.getElementById('stPetals');
    if (petals) petals.classList.toggle('hidden', !stSettings.fx);
    storyPanel.classList.toggle('no-flash', !stSettings.flash);
    localStorage.setItem('phantom_reading_settings', JSON.stringify(stSettings));
  }

  function stToggleSetting(key) {
    stSettings[key] = !stSettings[key];
    stApplySettings();
  }

  async function loadStoryView(storyId) {
    // Reset
    document.getElementById('stLoading').style.display = 'flex';
    document.getElementById('stError').style.display = 'none';
    document.getElementById('stStoryContainer').style.display = 'none';
    stStopPetals();
    stStoryId = storyId;
    stLiked = false; stFaved = false;

    try {
      const resp = await fetch('/api/stories?id=' + storyId);
      if (!resp.ok) throw new Error(await resp.text());
      stStoryData = await resp.json();
      stRenderStory();
      document.getElementById('stLoading').style.display = 'none';
      document.getElementById('stStoryContainer').style.display = 'block';
      document.title = (stStoryData.story?.title || '作品') + ' - Phantom Wild';
      setupStScrollReveal();
      if (stSettings.fx) stStartPetals();
      setupStScrollEffects();
      stApplySettings();
      // 加载评论 + 检查点赞/收藏状态
      loadComments();
      const user = Auth.currentUser();
      if (user && user.id) {
        fetch('/api/social?action=like&story_id=' + storyId).then(r => r.json()).then(d => {
          if (d && d.count > 0) { stLiked = true; document.getElementById('stBtnLike').innerHTML = '♥ 已点赞'; }
        }).catch(e => {});
        fetch('/api/social?action=favorite&user_id=' + user.id).then(r => r.json()).then(d => {
          if (d && d.length > 0) { stFaved = true; document.getElementById('stBtnFav').innerHTML = '★ 已收藏'; }
        }).catch(e => {});
      }
    } catch (err) {
      document.getElementById('stLoading').style.display = 'none';
      document.getElementById('stError').style.display = 'flex';
      document.getElementById('stErrorMsg').textContent = err.message || '作品加载失败';
    }
  }

  function stRenderStory() {
    const { story, chapters, paragraphs, branches } = stStoryData;
    if (!story) return;
    document.getElementById('stStoryTitle').textContent = story.title;
    document.getElementById('stStoryMeta').textContent =
      (story.users?.username || '匿名作者') + ' · ' + stFormatDate(story.created_at) + ' · ' + (story.view_count || 0) + ' 次阅读';
    document.getElementById('stStorySummary').textContent = story.summary || '';
    const tagsEl = document.getElementById('stStoryTags');
    if (story.tags && story.tags.length) {
      tagsEl.innerHTML = story.tags.map(t => '<span class="st-tag">' + t + '</span>').join('');
    }

    const contentEl = document.getElementById('stStoryContent');
    let html = '';
    if (chapters && chapters.length > 0) {
      chapters.forEach((ch, ci) => {
        const chParagraphs = paragraphs
          ? paragraphs.filter(p => p.chapter_id === ch.id).sort((a, b) => a.order_index - b.order_index)
          : [];
        const chBranches = branches
          ? branches.filter(b => b.chapter_id === ch.id)
          : [];
        if (ci > 0) {
          html += '<div class="st-chapter-sep"><span class="st-chapter-tag">' + (ch.title || '第' + ch.chapter_number + '章') + '</span></div>';
        }
        chParagraphs.forEach((p, pi) => {
          if (p.image_url && p.image_style !== 'none') {
            if (p.image_style === 'polaroid') {
              html += '<div class="st-pol-wrap reveal-card"><div class="st-pol-inner"><div class="st-pol-img"><img src="' + p.image_url + '" alt="" onerror="this.style.display=\'none\'"></div><p class="st-pol-cap">' + (p.content || '').substring(0, 30) + '...</p></div></div>';
            } else {
              html += '<div class="st-vcard reveal-card"><div class="st-blossom">';
              if (p.image_url) html += '<div class="st-photo"><img src="' + p.image_url + '" alt="" onerror="this.style.display=\'none\'"></div>';
              html += '<p class="st-bq">' + (p.content || '') + '</p></div></div>';
            }
          } else {
            html += '<p class="st-p reveal">' + (p.content || '') + '</p>';
          }
          const paraBranches = chBranches.filter(b => b.paragraph_index === pi);
          if (paraBranches.length > 0) {
            html += '<div class="st-branch-zone"><p>选择去向</p><div class="st-branch-options">';
            paraBranches.forEach(b => {
              html += '<button class="st-btn-branch" onclick="App.navigateBranch(' + b.target_chapter_id + ',' + (b.target_paragraph_index || 0) + ')">' + b.option_text + '</button>';
            });
            html += '</div></div>';
          }
        });
      });
    }
    contentEl.innerHTML = html;
  }

  function setupStScrollReveal() {
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
    }, { threshold: 0.08 });
    document.querySelectorAll('#tab-story .reveal, #tab-story .reveal-card').forEach((el, i) => {
      el.style.transitionDelay = (i % 5) * 0.05 + 's';
      observer.observe(el);
    });
  }

  function stStartPetals() {
    const cv = document.getElementById('stPetals');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    function resize() {
      cv.width = window.innerWidth;
      cv.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize, { passive: true });
    const COLS = ['#f7c5cf', '#f9d4dc', '#fce4ec', '#f4b8c8', '#ffe0ea'];
    function mkPetal(scattered) {
      return {
        x: Math.random() * cv.width, y: scattered ? Math.random() * cv.height : -20 - Math.random() * 50,
        sz: 4 + Math.random() * 8, vx: (Math.random() - .5) * 1, vy: .5 + Math.random() * 1.2,
        angle: Math.random() * Math.PI * 2, va: (Math.random() - .5) * .035,
        sw: Math.random() * Math.PI * 2, swS: .006 + Math.random() * .01,
        col: COLS[Math.random() * COLS.length | 0], a: .32 + Math.random() * .44
      };
    }
    const petals = [];
    for (let i = 0; i < 22; i++) petals.push(mkPetal(true));
    function drawP(p) {
      ctx.save(); ctx.globalAlpha = p.a; ctx.translate(p.x, p.y); ctx.rotate(p.angle);
      for (let i = 0; i < 5; i++) {
        ctx.save(); ctx.rotate(i / 5 * Math.PI * 2); ctx.scale(1, .5);
        ctx.beginPath(); ctx.ellipse(p.sz * .5, 0, p.sz * .56, p.sz * .27, 0, 0, Math.PI * 2);
        ctx.fillStyle = p.col; ctx.fill(); ctx.restore();
      }
      ctx.beginPath(); ctx.arc(0, 0, p.sz * .16, 0, Math.PI * 2);
      ctx.fillStyle = '#d98fa4'; ctx.fill(); ctx.restore();
    }
    function loop() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (let i = 0; i < petals.length; i++) {
        const p = petals[i]; p.sw += p.swS;
        p.x += p.vx + Math.sin(p.sw) * .6; p.y += p.vy; p.angle += p.va;
        drawP(p);
        if (p.y > cv.height + 36 || p.x < -55 || p.x > cv.width + 55) petals[i] = mkPetal(false);
      }
      if (petals.length < 28 && Math.random() < .015) petals.push(mkPetal(false));
      stPetalAnimId = requestAnimationFrame(loop);
    }
    loop();
  }

  function stStopPetals() {
    if (stPetalAnimId) { cancelAnimationFrame(stPetalAnimId); stPetalAnimId = null; }
  }

  function setupStScrollEffects() {
    const topbar = document.getElementById('stTopbar');
    document.getElementById('tab-story').addEventListener('scroll', () => {
      if (topbar) topbar.classList.toggle('scrolled', document.getElementById('tab-story').scrollTop > 60);
    }, { passive: true });
  }

  function stFormatDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // Story actions binding
  document.getElementById('stBackBtn')?.addEventListener('click', () => {
    switchTab('reader');
  });
  document.getElementById('stErrorBackBtn')?.addEventListener('click', () => {
    switchTab('reader');
  });
  document.getElementById('stBtnSettings')?.addEventListener('click', () => {
    document.getElementById('stSettingsPanel').classList.toggle('show');
  });
  document.addEventListener('click', e => {
    const panel = document.getElementById('stSettingsPanel');
    const btn = document.getElementById('stBtnSettings');
    if (panel && btn && !panel.contains(e.target) && e.target !== btn) {
      panel.classList.remove('show');
    }
  });
  document.getElementById('stBtnFullscreen')?.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  });
  ['stToggleBGM', 'stToggleReveal', 'stToggleFx', 'stToggleGrain', 'stToggleMouse', 'stToggleFlash'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => stToggleSetting(id.replace('stToggle', '').toLowerCase()));
  });
  // ── 点赞 / 收藏 / 评论 ──
  async function loadComments() {
    const list = document.getElementById('stCommentsList');
    if (!list || !stStoryId) return;
    try {
      const resp = await fetch('/api/social?action=comment&story_id=' + stStoryId);
      const data = await resp.json();
      if (!data || data.length === 0) {
        list.innerHTML = '<p style="color:#aaa;text-align:center;padding:20px 0;">暂无评论，来写第一条吧</p>';
        return;
      }
      list.innerHTML = data.map(c => {
        const username = c.users?.username || '匿名';
        const content = c.content.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return '<div class="st-comment-item"><div class="st-comment-user">' + username + '</div><div class="st-comment-text">' + content + '</div></div>';
      }).join('');
    } catch (e) { console.warn('Load comments error:', e); }
  }

  document.getElementById('stBtnLike')?.addEventListener('click', async () => {
    const user = Auth.currentUser();
    if (!user) { showToast('请先登录', 'error'); return; }
    const btn = document.getElementById('stBtnLike');
    btn.disabled = true;
    try {
      const resp = await fetch('/api/social?action=like', {
        method: stLiked ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, story_id: stStoryId })
      });
      if (resp.ok) {
        stLiked = !stLiked;
        btn.innerHTML = stLiked ? '♥ 已点赞' : '♡ 点赞';
        showToast(stLiked ? '已点赞' : '已取消点赞', 'success');
      }
    } catch (e) { showToast('操作失败', 'error'); }
    btn.disabled = false;
  });
  document.getElementById('stBtnFav')?.addEventListener('click', async () => {
    const user = Auth.currentUser();
    if (!user) { showToast('请先登录', 'error'); return; }
    const btn = document.getElementById('stBtnFav');
    btn.disabled = true;
    try {
      const resp = await fetch('/api/social?action=favorite', {
        method: stFaved ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, story_id: stStoryId })
      });
      if (resp.ok) {
        stFaved = !stFaved;
        btn.innerHTML = stFaved ? '★ 已收藏' : '☆ 收藏';
        showToast(stFaved ? '已收藏' : '已取消收藏', 'success');
      }
    } catch (e) { showToast('操作失败', 'error'); }
    btn.disabled = false;
  });
  document.getElementById('stBtnShare')?.addEventListener('click', () => {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title: stStoryData?.story?.title || '', url });
    } else {
      navigator.clipboard.writeText(url).then(() => showToast('链接已复制', 'success'));
    }
  });
  document.getElementById('stCommentSend')?.addEventListener('click', async () => {
    const user = Auth.currentUser();
    if (!user) { showToast('请先登录', 'error'); return; }
    const input = document.getElementById('stCommentInput');
    const content = input.value.trim();
    if (!content) return;
    const btn = document.getElementById('stCommentSend');
    btn.disabled = true;
    try {
      const resp = await fetch('/api/social?action=comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, story_id: stStoryId, content })
      });
      if (resp.ok) {
        input.value = '';
        showToast('评论已发布', 'success');
        await loadComments();
      }
    } catch (e) { showToast('评论失败', 'error'); }
    btn.disabled = false;
  });

  // Branch navigation
  window.App = { showToast, publishWork, switchTab, navigateBranch: function(chapterId, paraIndex) {
    if (stSettings.flash) {
      document.getElementById('stBladeT').style.height = '52vh';
      document.getElementById('stBladeB').style.height = '52vh';
      setTimeout(() => {
        document.getElementById('stFlash').style.opacity = '1';
        document.getElementById('stFlash').style.transition = 'opacity 0.06s';
        setTimeout(() => {
          document.getElementById('stFlash').style.opacity = '0';
          document.getElementById('stFlash').style.transition = 'opacity 0.7s';
          document.getElementById('stBladeT').style.height = '0';
          document.getElementById('stBladeB').style.height = '0';
        }, 80);
      }, 220);
    }
    const target = document.querySelector('#tab-story [data-chapter="' + chapterId + '"]');
    if (target) {
      setTimeout(() => target.scrollIntoView({ behavior: 'smooth' }), stSettings.flash ? 400 : 0);
    }
  }};

  // ── 初始化时处理 hash ──
  window.addEventListener('load', () => {
    setTimeout(handleHash, 10);
  });

  // ═══════════════════════════════════════════
  //  写作鼓励弹窗
  // ═══════════════════════════════════════════

  const ENC_MILESTONES = [500, 1000, 5000];
  const encReached = {};

  const ENC_POETRY = [
    '读书破万卷，下笔如有神',
    '笔落惊风雨，诗成泣鬼神',
    '两句三年得，一吟双泪流',
    '文章千古事，得失寸心知',
    '一语天然万古新，豪华落尽见真淳',
    '看似寻常最奇崛，成如容易却艰辛',
    '清水出芙蓉，天然去雕饰',
    '吟安一个字，捻断数茎须',
    '云山苍苍，江水泱泱，先生之风，山高水长',
    '李杜文章在，光焰万丈长'
  ];
  const ENC_SHORT = [
    '主人真厉害！', '灵感如泉涌！', '笔下生花，妙不可言',
    '文字在你指尖流淌', '你已经超越了昨天的自己',
    '越来越有感觉了！', '故事正在成型', '坚持就是最好的天赋',
    '每个字都在发光', '你正在创造世界'
  ];
  const ENC_LONG = [
    '有的人穷其一生都在凑齐自己的童年，你是否也是呢？',
    '每一个伟大的故事，都始于一个微不足道的开始，而你已走过很远',
    '文字是时间的容器，你正将此刻封存为永恒',
    '小说家的使命不是讲述已知的世界，而是创造从未存在过的宇宙',
    '当你写下第一行字时，一个平行世界便诞生了',
    '那些深夜独自敲下的字句，终将在某天成为他人的光',
    '故事从来不只是故事，它是你与世界的密钥',
    '每一段文字都是心灵的碎片，拼凑起来便是整个人生',
    '写作是一场与自己的漫长对话，而你已找到了声音',
    '世界上最远的距离，不是生与死，而是灵感一闪而你捕捉到了它'
  ];
  const ENC_TEXTURES = ['texture-wood', 'texture-rings', 'texture-lines'];
  const ENC_ICONS = ['📜', '🪶', '🌸', '🌙', '✨'];

  function checkEncouragement(chars) {
    for (const m of ENC_MILESTONES) {
      if (chars >= m && !encReached[m]) {
        encReached[m] = true;
        spawnEncouragement(m);
      }
    }
  }

  function spawnEncouragement(milestone) {
    let text;
    if (milestone === 500) {
      text = '哇咔咔！主人已经写五百字啦~';
    } else {
      // 1000/5000 随机从三个池子抽
      const pool = Math.random() < 0.4 ? ENC_POETRY : (Math.random() < 0.55 ? ENC_SHORT : ENC_LONG);
      text = pool[Math.floor(Math.random() * pool.length)];
    }

    const card = document.createElement('div');
    card.className = 'encouragement-card ' + ENC_TEXTURES[Math.floor(Math.random() * ENC_TEXTURES.length)];
    card.innerHTML = '<span class="enc-icon">' + ENC_ICONS[Math.floor(Math.random() * ENC_ICONS.length)] + '</span>'
      + '<div class="enc-text">' + text + '</div>';
    document.body.appendChild(card);

    // 4 秒后淡出
    setTimeout(() => {
      card.classList.add('dismiss');
      card.addEventListener('animationend', () => card.remove());
    }, 4000);
  }

  function initEncouragement() {
    // 重置里程碑（编辑期间有效）
    for (const m of ENC_MILESTONES) encReached[m] = false;
    // 初始检查（如果编辑器已有内容）
    const editor = document.getElementById('textEditor');
    if (editor) {
      const stats = Parser.countStats(editor.innerText);
      checkEncouragement(stats.chars);
    }
  }

  // ═══════════════════════════════════════════
  //  久坐/沉浸提示
  // ═══════════════════════════════════════════

  const SIT_REMINDERS = [
    '🌸 已经写了不短时间了，起来活动一下吧~',
    '🍵 一杯清茶，片刻小憩，灵感会更清澈',
    '📖 文字需要呼吸，你也一样——站起来走走吧',
    '🌿 窗外的风景也在等你，抬头看看远方',
    '💫 专注是好事，但别忘了照顾这副肉身哦'
  ];
  let sitActiveSeconds = 0;
  let sitTimer = null;
  let sitLastActivity = Date.now();
  let sitBannerShown = false;
  let sitBadgeShown = false;

  function recordActivity() {
    sitLastActivity = Date.now();
  }

  function initSitReminder() {
    // 监听用户活动
    ['mousemove', 'keydown', 'click', 'scroll', 'touchmove', 'input'].forEach(evt => {
      document.addEventListener(evt, recordActivity, { passive: true });
    });

    // 每秒检查
    sitTimer = setInterval(() => {
      const now = Date.now();
      // 过去 60 秒内有活动则计入活跃时间
      if (now - sitLastActivity < 60000) {
        sitActiveSeconds++;
      } else {
        // 离开超过 5 分钟重置计时
        if (now - sitLastActivity > 300000) {
          sitActiveSeconds = 0;
          sitBannerShown = false;
          sitBadgeShown = false;
          removeSitBanner();
          removeFocusBadge();
        }
        return;
      }

      // 35 分钟：显示提示横幅
      if (sitActiveSeconds >= 35 * 60 && !sitBannerShown) {
        sitBannerShown = true;
        showSitBanner();
      }

      // 2 小时：专注徽章
      if (sitActiveSeconds >= 2 * 3600 && !sitBadgeShown) {
        sitBadgeShown = true;
        showFocusBadge();
      }
    }, 1000);
  }

  function showSitBanner() {
    const existing = document.getElementById('sitBanner');
    if (existing) return;

    const banner = document.createElement('div');
    banner.id = 'sitBanner';
    banner.className = 'sit-reminder-banner';
    banner.innerHTML = SIT_REMINDERS[Math.floor(Math.random() * SIT_REMINDERS.length)]
      + '<button class="sit-close" id="sitCloseBtn">✕</button>';
    document.body.appendChild(banner);

    requestAnimationFrame(() => banner.classList.add('show'));

    document.getElementById('sitCloseBtn').addEventListener('click', () => {
      banner.classList.remove('show');
      setTimeout(() => banner.remove(), 500);
    });

    // 15 秒后自动消失
    setTimeout(() => {
      if (banner.parentNode) {
        banner.classList.remove('show');
        setTimeout(() => { if (banner.parentNode) banner.remove(); }, 500);
      }
    }, 15000);
  }

  function removeSitBanner() {
    const banner = document.getElementById('sitBanner');
    if (banner) { banner.classList.remove('show'); setTimeout(() => { if (banner.parentNode) banner.remove(); }, 500); }
  }

  function showFocusBadge() {
    const avatarBtn = document.getElementById('userAvatarBtn');
    if (!avatarBtn) return;
    const existing = avatarBtn.querySelector('.focus-badge');
    if (existing) return;

    const badge = document.createElement('span');
    badge.className = 'focus-badge';
    badge.textContent = '🏆';
    badge.title = '专注徽章：连续沉浸超过2小时';
    avatarBtn.style.position = avatarBtn.style.position || 'relative';
    avatarBtn.appendChild(badge);
  }

  function removeFocusBadge() {
    const badge = document.querySelector('.focus-badge');
    if (badge) badge.remove();
  }

  // ═══════════════════════════════════════════
  //  木鱼禅意增强（扩展原有木鱼逻辑）
  //  注意：主要逻辑已在 bindTextEditor() 内的 IIFE 中升级
  //  此处仅提供工具函数
  // ═══════════════════════════════════════════

  const ZEN_QUOTES = [
    '文字即修行', '一念起，万水千山', '心若不动，风又奈何',
    '静水深流，字如其人', '烦恼即菩提', '一花一世界，一字一乾坤',
    '行到水穷处，坐看云起时', '万古长空，一朝风月',
    '应无所住而生其心', '大音希声，大象无形'
  ];

  function spawnZenCard(btn) {
    const rect = btn.getBoundingClientRect();
    const card = document.createElement('div');
    card.className = 'zen-card';
    card.textContent = '🪷 ' + ZEN_QUOTES[Math.floor(Math.random() * ZEN_QUOTES.length)];
    document.body.appendChild(card);
    card.addEventListener('animationend', () => card.remove());
  }

  function spawnMeritFlash() {
    const flash = document.createElement('div');
    flash.className = 'muyu-merit-flash';
    document.body.appendChild(flash);
    flash.addEventListener('animationend', () => flash.remove());
  }

  // ══════════════════════════════════════
  // 彩蛋 A：Konami Code 樱花爆发
  // 需先点击页面非交互区域（如工作室背景）激活，再输入组合键
  // ══════════════════════════════════════
  function initKonamiCode() {
    const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
    let konamiReady = false;
    let kb = [];

    // 点击非交互区域激活
    document.addEventListener('click', e => {
      const tag = e.target.tagName;
      const isInteractive = /^(BUTTON|INPUT|SELECT|TEXTAREA|A|LABEL)$/.test(tag)
        || e.target.closest('button,a,input,select,textarea,label,[role="button"]')
        || e.target.isContentEditable
        || e.target.closest('[contenteditable="true"]');
      if (!isInteractive) {
        konamiReady = true;
        kb = [];
      }
    });

    document.addEventListener('keydown', e => {
      if (!konamiReady) return;
      kb.push(e.key);
      if (kb.length > KONAMI.length) kb.shift();
      if (kb.join(',') === KONAMI.join(',')) {
        kb = [];
        konamiReady = false;
        burstSakura();
      }
    });
  }

  function burstSakura() {
    const container = document.createElement('div');
    container.className = 'sakura-burst';
    document.body.appendChild(container);
    const colors = ['a','b','c','d'];
    const count = 80;
    for (let i = 0; i < count; i++) {
      const petal = document.createElement('div');
      petal.className = 'burst-petal ' + colors[Math.floor(Math.random() * 4)];
      petal.style.left = Math.random() * 100 + '%';
      petal.style.width = (8 + Math.random() * 16) + 'px';
      petal.style.height = (10 + Math.random() * 18) + 'px';
      petal.style.animationDuration = (3 + Math.random() * 3.5) + 's';
      petal.style.animationDelay = Math.random() * 0.7 + 's';
      petal.style.setProperty('--bx', (Math.random() * 200 - 100) + 'px');
      petal.style.setProperty('--br', (Math.random() * 720 - 360) + 'deg');
      container.appendChild(petal);
    }
    setTimeout(() => container.remove(), 7000);
  }

  // ══════════════════════════════════════
  // 彩蛋 C：Logo 5连击开发者彩蛋
  // ══════════════════════════════════════
  function initEasterEggLogo() {
    let clicks = 0;
    let timer = null;
    const logo = document.querySelector('.logo');
    if (!logo) return;
    logo.style.cursor = 'pointer';
    logo.addEventListener('click', () => {
      clicks++;
      if (clicks === 1) timer = setTimeout(() => { clicks = 0; }, 3000);
      if (clicks >= 5) {
        clearTimeout(timer);
        clicks = 0;
        showEasterEgg();
      }
    });
  }

  function showEasterEgg() {
    const overlay = document.createElement('div');
    overlay.className = 'easter-egg-overlay';
    overlay.innerHTML = '<div class="easter-egg-dialog"><div class="ee-icon"><img src="assets/微信图片_20260527223222_269_1.jpg" alt="" style="width:48px;height:48px;border-radius:6px;object-fit:cover;"></div><div class="ee-title">Phantom Wild Visual Novel</div><div class="ee-version">v2.0 · Build 2026</div><div class="ee-divider"></div><div class="ee-desc">介于传统小说与视觉小说游戏之间的<br>全新轻视觉小说创作与阅读平台</div><button class="ee-close">关闭</button></div>';
    document.body.appendChild(overlay);
    overlay.querySelector('.ee-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  }

  return { init, showToast, publishWork };
})();

// ── DOM Ready ──
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
