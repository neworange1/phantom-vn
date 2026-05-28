/**
 * agents.js — 三个AI智能体的UI交互与模拟逻辑
 * 字吻 · 花花 · 暮舟
 *
 * DeepSeek API 已接入，通过 Vercel 代理隐藏 Key。
 * 所有 LLM 调用通过 /api/chat 代理；图片生成通过 /api/image 代理到 Pollinations.ai（免费）。
 */

const Agents = (() => {

  // ── API 配置 ──
  // API Key 已移至 Vercel 服务端环境变量，前端不再持有
  const PROXY_URL = '/api/chat';

  const API_CONFIG = {
    ziwen: { endpoint: PROXY_URL },
    huahua: { endpoint: PROXY_URL, imageEndpoint: '/api/image', imageModel: 'flux' },
    mzhou:  { endpoint: PROXY_URL }
  };

  // ── 内部状态 ──
  const context = { ziwen: null, huahua: null, mzhou: null };
  const histories = { ziwen: [], huahua: [], mzhou: [] };

  // 角色库（花花角色设定）
  let characterDB = [];
  let editingCharIdx = -1;

  // 参考图（base64 或 objectURL）
  let refImageData = null;

  // ── 上下文管理 ──
  function setContext(agent, text) {
    context[agent] = text;
    const el = document.getElementById(agent + '-context');
    const textEl = document.getElementById(agent + '-ctx-text');
    if (el && textEl) {
      textEl.textContent = text.slice(0, 80) + (text.length > 80 ? '…' : '');
      el.style.display = 'flex';
    }
  }

  window.clearContext = function(agent) {
    context[agent] = null;
    const el = document.getElementById(agent + '-context');
    if (el) el.style.display = 'none';
  };

  // ── 渲染消息 ──
  function appendMessage(agent, role, content, extra = {}) {
    const history = document.getElementById(agent + '-history');
    if (!history) return;

    const row = document.createElement('div');
    row.className = 'msg-row ' + role + (role === 'agent' ? ' ' + agent : '');

    let avatarLabel = role === 'user' ? '我' : { ziwen: '字', huahua: '花', mzhou: '暮' }[agent];
    const avatarEl = `<div class="msg-avatar">${avatarLabel}</div>`;

    let bubbleContent = '';

    if (extra.type === 'image') {
      const refNote = extra.hasRef ? '<span style="font-size:10px;color:var(--text-dim);margin-left:4px">· 参考图注入</span>' : '';
      bubbleContent = `
        <div>${extra.caption || '已生成图片'}${refNote}</div>
        <img class="msg-img" src="${content}" alt="生成图片"
          onclick="Agents.openImagePreview('${content}', '${extra.caption || ''}')">
        <div class="msg-actions">
          <button class="msg-action-btn" onclick="Agents.addToGallery('${content}', '${extra.caption || ''}')">加入资源库</button>
          <button class="msg-action-btn" onclick="Agents.downloadImage('${content}')">下载</button>
        </div>`;
    } else if (extra.type === 'optimized') {
      const escaped = escapeAttr(content);
      bubbleContent = `
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:6px">优化结果 · ${extra.mode || '润色'} · 强度 ${extra.intensity ?? 50}%</div>
        <div>${content}</div>
        <div class="msg-actions">
          <button class="msg-action-btn" onclick="Agents.replaceSelection('${escaped}')">替换原文</button>
          <button class="msg-action-btn" onclick="Agents.copyText('${escaped}')">复制</button>
          <button class="msg-action-btn" onclick="Agents.addToMzhou('${escaped}')">加入暮舟</button>
        </div>`;
    } else if (extra.type === 'multi-version') {
      // 多版本对比卡片
      bubbleContent = `<div style="font-size:11px;color:var(--text-dim);margin-bottom:8px">✦ 多版本对比 · ${extra.mode || '润色'} · 强度 ${extra.intensity ?? 50}%</div>`;
      (extra.versions || []).forEach((ver, idx) => {
        const escVer = escapeAttr(ver);
        bubbleContent += `
        <div class="ver-card" id="ver-card-${extra.uid}-${idx}">
          <div class="ver-label">版本 ${idx + 1}</div>
          <div class="ver-text">${ver}</div>
          <div class="msg-actions">
            <button class="msg-action-btn primary" onclick="Agents.adoptVersion('${escVer}')">✓ 采用此版本</button>
            <button class="msg-action-btn" onclick="Agents.copyText('${escVer}')">复制</button>
            <button class="msg-action-btn" onclick="Agents.addToMzhou('${escVer}')">加入暮舟</button>
          </div>
        </div>`;
      });
    } else if (extra.type === 'vn') {
      bubbleContent = `
        <div style="font-size:11px;color:var(--mzhou-color);margin-bottom:6px">✦ 视觉小说脚本生成完成</div>
        <div>${content}</div>
        <div class="msg-actions">
          <button class="msg-action-btn" onclick="Agents.previewVN()">预览播放</button>
          <button class="msg-action-btn" onclick="Agents.openScriptEditor()">📋 编辑脚本</button>
          <button class="msg-action-btn" onclick="App.publishWork()">发布到成品库</button>
        </div>`;
    } else {
      bubbleContent = `<div>${content}</div>`;
    }

    row.innerHTML = role === 'user'
      ? `<div class="msg-bubble">${bubbleContent}</div>${avatarEl}`
      : `${avatarEl}<div class="msg-bubble">${bubbleContent}</div>`;

    history.appendChild(row);
    history.scrollTop = history.scrollHeight;

    histories[agent].push({ role, content, extra });
    return row;
  }

  // ── 打字加载动画 ──
  function showTyping(agent) {
    const history = document.getElementById(agent + '-history');
    const row = document.createElement('div');
    row.className = 'msg-row agent ' + agent;
    row.id = 'typing-' + agent;
    let label = { ziwen: '字', huahua: '花', mzhou: '暮' }[agent];
    row.innerHTML = `
      <div class="msg-avatar">${label}</div>
      <div class="msg-bubble">
        <div class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>`;
    history.appendChild(row);
    history.scrollTop = history.scrollHeight;
    return row;
  }

  function hideTyping(agent) {
    const el = document.getElementById('typing-' + agent);
    if (el) el.remove();
  }

  // ══════════════════════════════════════
  // 字吻 — 文字优化智能体
  // ══════════════════════════════════════
  async function sendZiwen(userInput) {
    const mode = document.querySelector('input[name="ziwen-mode"]:checked')?.value || 'polish';
    const modeLabels = {
      polish: '润色', expand: '扩写', rewrite: '改写',
      condense: '精炼', dialogue: '对白化'
    };

    // 读取强度滑块
    const intensity = parseInt(document.getElementById('ziwenIntensity')?.value || '50', 10);
    // 读取多版本开关
    const isMultiVer = document.getElementById('ziwenMultiVer')?.checked || false;

    const ctx = context.ziwen;

    appendMessage('ziwen', 'user',
      `<b>[${modeLabels[mode]}${isMultiVer ? ' · 多版本' : ''}]</b> 强度 ${intensity}% &nbsp; ${userInput || '优化选中片段'}`
    );
    const typingRow = showTyping('ziwen');

    if (isMultiVer) {
      // 生成 3 个版本
      await delay(1400 + Math.random() * 600);
      hideTyping('ziwen');
      const versions = [];
      for (let i = 0; i < 3; i++) {
        const llmResult = await safeCallLLM('ziwen', buildZiwenPrompt(mode, ctx, userInput, intensity, i));
        if (llmResult !== null) {
          versions.push(llmResult);
        } else {
          versions.push(demoZiwenResponse(mode, ctx || userInput, intensity, i));
        }
      }
      appendMessage('ziwen', 'agent', '', {
        type: 'multi-version',
        mode: modeLabels[mode],
        intensity,
        versions,
        uid: Date.now()
      });
    } else {
      // 单版本
      await delay(1000 + Math.random() * 800);
      hideTyping('ziwen');
      let result = await safeCallLLM('ziwen', buildZiwenPrompt(mode, ctx, userInput, intensity));
      if (result === null) {
        result = demoZiwenResponse(mode, ctx || userInput, intensity);
      }
      appendMessage('ziwen', 'agent', result, { type: 'optimized', mode: modeLabels[mode], intensity });
      VNStore.addTextSegment(result);
      updateMzhouResources();
    }
    clearContext('ziwen');
  }

  function buildZiwenPrompt(mode, ctx, extra, intensity = 50, variantIdx = 0) {
    const intensityDesc = intensity <= 20
      ? '仅做最轻微的润色，几乎不改变原文措辞'
      : intensity <= 50
      ? '适度改写，保留主要句式和意象'
      : intensity <= 80
      ? '较大幅度改写，可更换句式和意象'
      : '大幅改写，可重构段落结构';
    const modeInstructions = {
      polish: `请对以下文段进行润色（${intensityDesc}），使语言更加流畅优美`,
      expand: `请对以下文段进行扩写（${intensityDesc}），丰富细节描写和情感渲染，扩展至原来的2-3倍`,
      rewrite: `请对以下文段进行改写（${intensityDesc}），换一种表达方式`,
      condense: `请对以下文段进行精炼（${intensityDesc}），保留关键内容，压缩至原来的一半`,
      dialogue: '请将以下文段改写为视觉小说对话格式，包含说话者名字和对话内容'
    };
    const variantHint = variantIdx > 0 ? `\n（这是第 ${variantIdx + 1} 个不同风格的版本，请与其他版本有所区别）` : '';
    return `${modeInstructions[mode]}。\n\n原文：${ctx || ''}\n\n${extra ? '额外要求：' + extra : ''}${variantHint}`;
  }

  function demoZiwenResponse(mode, text, intensity = 50, variantIdx = 0) {
    // 根据强度和变体索引生成不同风格的演示文本
    const variants = {
      polish: [
        `夜色如墨，染透了长安城每一寸青砖。她立于城楼之上，衣袂随风翻卷，双眸中映着远处烽火的余烬——那是一种久经沙场的人才懂得的沉默。`,
        `墨色的夜将长安城悄然淹没。城楼上，她衣角翻飞，望着渐渐熄灭的烽火，眼中有什么东西无声地沉淀。`,
        `夜沉如墨。城楼上的女子一言不发，远处烽火将熄，映在她眸中，像一场说不清楚的梦。`
      ],
      expand: [
        `夜色如墨，沉沉地压在长安城每一块青石板上。她静静立于城楼之巅，月华清冷，将她的轮廓勾勒得如同一幅墨色工笔。\n\n风从关外吹来，带着大漠孤烟的气息，将她的衣袂吹得猎猎作响。她没有转身，只是那双曾见过无数生死的眼睛，在凝望着远方渐渐熄灭的烽火——那一点点明灭的光，像极了她此刻的心情。`,
        `黑夜浓如泼墨，将长安城的每一条街巷都藏了进去，藏进了时光深处，也藏进了她心口那道说不出来的隐痛里。\n\n她一个人站在城头，风把头发吹乱了也不管，只是那么静静地看着远处的烽火，看着那点微弱的光一明一暗，一明一暗……`,
        `漫长的夜把整座长安城压成了一幅水墨。城楼上，她的影子被月光拉得很长，衣袂在风里猎猎作响，像是某种无言的告别。\n\n那火光——关外最后一束烽火——在她眼中慢慢小了，暗了，最终像一颗星陨落在黑暗里。她没动，连眼皮都没眨一下。`
      ],
      rewrite: [
        `黑夜笼罩长安。她站在城头，任风吹乱衣角，眼中倒映着战火将熄的最后一丝光。`,
        `长安入夜，城楼孤立。她迎着风，望向那一点快要消失的烽火，心里什么话也没有。`,
        `夜深了，长安静了。她站在最高处，看着关外的火光灭掉，什么都没说。`
      ],
      condense: [
        `夜染长安，她立于城楼，眸映烽火，一言不发。`,
        `墨夜长安，城楼孤影，烽火将熄。`,
        `夜沉，烽灭，她无言。`
      ],
      dialogue: [
        `【旁白】：夜色如墨，长安城楼上，一道身影静立许久。\n\n【燕离】：（低声）烽火灭了。\n\n【旁白】：她转过身，眸中有什么东西，悄然碎裂。`,
        `【旁白】：夜深，城楼风冷，她一个人站了很久。\n\n【燕离】：（自语）灭了……真的灭了。\n\n【旁白】：声音很轻，像是说给自己听，又像是说给那场还没散尽的战争。`,
        `【旁白】：月色惨白，烽火将熄，只有她还在城头站着。\n\n【燕离】：（沉默片刻后，轻笑）也好。\n\n【旁白】：没人知道她这句「也好」，藏了多少说不出口的东西。`
      ]
    };
    const pool = variants[mode] || variants.polish;
    const idx = variantIdx % pool.length;
    const base = text ? text.slice(0, 30) : '';
    let result = pool[idx];
    // 根据强度调整演示说明
    const intensityNote = intensity <= 20 ? '（轻度处理）' : intensity >= 80 ? '（深度改写）' : '';
    return result + (base ? `\n\n<span style="font-size:10px;color:var(--text-dim)">原文参考：「${base}…」${intensityNote}</span>` : '');
  }

  // 采用多版本中某个版本
  function adoptVersion(text) {
    VNStore.addTextSegment(text);
    updateMzhouResources();
    App.showToast('✓ 已采用该版本并加入资源', 'success');
  }

  // ══════════════════════════════════════
  // 花花 — 图片生成智能体
  // ══════════════════════════════════════
  async function sendHuahua(userInput) {
    const mode = document.querySelector('input[name="huahua-mode"]:checked')?.value || 'scene';
    const style = document.getElementById('huahua-style')?.value || 'anime';
    const ratio = document.getElementById('huahua-ratio')?.value || '16:9';
    const ctx = context.huahua;
    const hasRef = !!refImageData;

    // 读取注入角色
    const charInjectIdx = parseInt(document.getElementById('charInjectSelect')?.value || '-1', 10);
    const injectChar = charInjectIdx >= 0 ? characterDB[charInjectIdx] : null;

    const modeLabels = {
      scene: '场景图', character: '角色立绘', portrait: '头像',
      ui: 'UI模板', cover: '封面'
    };

    let charNote = injectChar ? ` · 角色：${injectChar.name}` : '';
    let refNote = hasRef ? ' · 参考图' : '';
    appendMessage('huahua', 'user',
      `<b>[${modeLabels[mode]}·${style}${charNote}${refNote}]</b> ${userInput || ctx?.slice(0,40) || '生成图片'}`
    );

    const typingRow = showTyping('huahua');

    // ── 直接生图（跳过 DeepSeek 优化，避免 prompt 被污染）──
    const rawPrompt = buildHuahuaPrompt(mode, style, ctx, userInput, injectChar);
    const imagePrompt = rawPrompt;

    // ── 生成图片 ──
    hideTyping('huahua');
    let imageUrl = '';
    let caption = userInput || ctx?.slice(0, 60) || '生成的图片';

    if (API_CONFIG.huahua.imageEndpoint) {
      try {
        imageUrl = await callImageGen('huahua', imagePrompt, ratio, refImageData);
        // 验证图片 URL 是否可访问（Pollinations 需要时间渲染，做一次预检查）
        if (imageUrl) {
          const valid = await validateImageUrl(imageUrl);
          if (!valid) {
            console.warn('[huahua] 图片 URL 无效或超时，使用占位图');
            imageUrl = generatePlaceholderSVG(mode, style, userInput || ctx || '', injectChar);
          }
        } else {
          imageUrl = generatePlaceholderSVG(mode, style, userInput || ctx || '', injectChar);
        }
      } catch (imgErr) {
        console.warn('[huahua] 图片生成失败:', imgErr.message);
        imageUrl = generatePlaceholderSVG(mode, style, userInput || ctx || '', injectChar);
      }
    } else {
      imageUrl = generatePlaceholderSVG(mode, style, userInput || ctx || '', injectChar);
    }

    appendMessage('huahua', 'agent', imageUrl, { type: 'image', caption, hasRef });
    clearContext('huahua');
    updateMzhouResources();
  }

  function buildHuahuaPrompt(mode, style, ctx, extra, char) {
    const styleMap = {
      anime: 'anime illustration, cel shading', ink: 'Chinese ink painting, brush strokes',
      oil: 'oil painting, impasto', pixel: 'pixel art, 16-bit',
      watercolor: 'watercolor, soft edges', photography: 'photorealistic, cinematic',
      flat: 'flat design, vector illustration'
    };
    const modeMap = {
      scene: 'wide establishing shot, visual novel background',
      character: 'full body character illustration, visual novel sprite',
      portrait: 'portrait, face close-up',
      ui: 'visual novel UI element, dialogue box design',
      cover: 'book cover, title card design'
    };
    const charPart = char ? `, character: ${char.name}, ${char.desc}` : '';
    return `${modeMap[mode]}, ${styleMap[style]}, ${ctx || ''}, ${extra || ''}${charPart}`;
  }

  function generatePlaceholderSVG(mode, style, desc, char) {
    const modeColors = {
      scene:     ['#fce4ec', '#f8bbd0', '#e878b0'],
      character: ['#f3e5f5', '#e1bee7', '#c084d0'],
      portrait:  ['#e8f5e9', '#c8e6c9', '#5dc4b0'],
      ui:        ['#e0f7fa', '#b2ebf2', '#3dd6c8'],
      cover:     ['#fff3e0', '#ffe0b2', '#f5c345']
    };
    const [bg1, bg2, accent] = modeColors[mode] || modeColors.scene;
    const shortDesc = (desc || '视觉小说图片').slice(0, 24);
    const charLine = char ? `<text x="240" y="220" fill="${accent}" font-size="11" text-anchor="middle" opacity="0.7">角色：${char.name}</text>` : '';
    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270" viewBox="0 0 480 270">
  <defs>
    <radialGradient id="bg" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="${bg2}"/>
      <stop offset="100%" stop-color="${bg1}"/>
    </radialGradient>
  </defs>
  <rect width="480" height="270" fill="url(#bg)"/>
  <rect x="0" y="220" width="480" height="50" fill="${bg1}" opacity="0.8"/>
  <circle cx="240" cy="100" r="50" fill="none" stroke="${accent}" stroke-width="1.5" opacity="0.6"/>
  <circle cx="240" cy="100" r="35" fill="${accent}" opacity="0.15"/>
  <text x="240" y="108" fill="${accent}" font-size="28" text-anchor="middle" font-family="serif" opacity="0.8">✿</text>
  <text x="240" y="175" fill="#4a3040" font-size="13" text-anchor="middle" font-family="sans-serif" opacity="0.7">${shortDesc}</text>
  <text x="240" y="196" fill="${accent}" font-size="11" text-anchor="middle" opacity="0.5">[${style} · ${mode}] 演示模式</text>
  ${charLine}
  <text x="240" y="258" fill="#4a3040" font-size="10" text-anchor="middle" opacity="0.3">配置 API Key 后生成真实图片</text>
</svg>`;
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));
  }

  // ══════════════════════════════════════
  // 角色设定面板（花花）
  // ══════════════════════════════════════
  function initCharPanel() {
    document.getElementById('charPanelToggle')?.addEventListener('click', () => {
      const body = document.getElementById('charPanelBody');
      const icon = document.getElementById('charToggleIcon');
      if (!body) return;
      const isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      if (icon) icon.textContent = isOpen ? '▶' : '▼';
    });

    document.getElementById('addCharBtn')?.addEventListener('click', () => {
      editingCharIdx = -1;
      document.getElementById('charNameInput').value = '';
      document.getElementById('charDescInput').value = '';
      document.getElementById('charForm').style.display = 'block';
      document.getElementById('charNameInput').focus();
    });

    document.getElementById('charFormCancel')?.addEventListener('click', () => {
      document.getElementById('charForm').style.display = 'none';
    });

    document.getElementById('charFormSave')?.addEventListener('click', () => {
      const name = document.getElementById('charNameInput')?.value.trim();
      const desc = document.getElementById('charDescInput')?.value.trim();
      if (!name) { App.showToast('请输入角色名', 'error'); return; }
      if (editingCharIdx >= 0) {
        characterDB[editingCharIdx] = { name, desc };
        App.showToast('角色已更新', 'success');
      } else {
        characterDB.push({ name, desc });
        App.showToast(`「${name}」已加入角色库`, 'success');
      }
      document.getElementById('charForm').style.display = 'none';
      renderCharList();
    });
  }

  function renderCharList() {
    const list = document.getElementById('charList');
    const badge = document.getElementById('charCountBadge');
    if (badge) badge.textContent = characterDB.length;
    if (!list) return;
    if (!characterDB.length) {
      list.innerHTML = '<div class="char-empty-hint">暂未设定角色，点击「+ 添加角色」开始</div>';
    } else {
      list.innerHTML = characterDB.map((ch, i) => `
        <div class="char-item">
          <div class="char-item-info">
            <span class="char-item-name">${ch.name}</span>
            <span class="char-item-desc">${(ch.desc || '').slice(0, 40)}${(ch.desc||'').length > 40 ? '…' : ''}</span>
          </div>
          <div class="char-item-btns">
            <button class="char-edit-btn" onclick="Agents.editChar(${i})" title="编辑">✎</button>
            <button class="char-del-btn" onclick="Agents.deleteChar(${i})" title="删除">✕</button>
          </div>
        </div>`).join('');
    }
    // 更新注入选择器
    const sel = document.getElementById('charInjectSelect');
    const injectRow = document.getElementById('charInjectRow');
    if (sel) {
      sel.innerHTML = '<option value="">不指定角色</option>' +
        characterDB.map((ch, i) => `<option value="${i}">${ch.name}</option>`).join('');
    }
    if (injectRow) injectRow.style.display = characterDB.length ? 'flex' : 'none';
  }

  function editChar(idx) {
    editingCharIdx = idx;
    const ch = characterDB[idx];
    if (!ch) return;
    document.getElementById('charNameInput').value = ch.name;
    document.getElementById('charDescInput').value = ch.desc || '';
    document.getElementById('charForm').style.display = 'block';
    document.getElementById('charPanelBody').style.display = 'block';
    document.getElementById('charToggleIcon').textContent = '▼';
    document.getElementById('charNameInput').focus();
  }

  function deleteChar(idx) {
    characterDB.splice(idx, 1);
    renderCharList();
    App.showToast('角色已删除', '');
  }

  // ══════════════════════════════════════
  // 参考图上传（花花）
  // ══════════════════════════════════════
  function initRefImage() {
    document.getElementById('refImgInput')?.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        refImageData = ev.target.result;
        const thumb = document.getElementById('refImgThumb');
        const preview = document.getElementById('refImgPreview');
        const hint = document.getElementById('refImgHint');
        if (thumb) thumb.src = refImageData;
        if (preview) preview.style.display = 'flex';
        if (hint) hint.style.display = 'none';
        App.showToast('参考图已加载', 'success');
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    });

    document.getElementById('refImgClear')?.addEventListener('click', () => {
      refImageData = null;
      const preview = document.getElementById('refImgPreview');
      const hint = document.getElementById('refImgHint');
      const thumb = document.getElementById('refImgThumb');
      if (preview) preview.style.display = 'none';
      if (hint) hint.style.display = '';
      if (thumb) thumb.src = '';
      App.showToast('参考图已移除', '');
    });
  }

  // ══════════════════════════════════════
  // 暮舟 — 融合发布智能体
  // ══════════════════════════════════════
  async function sendMzhou(userInput) {
    const title = document.getElementById('vnTitle')?.value || '未命名视觉小说';
    const pov = document.getElementById('vnPOV')?.value || 'third';
    const pace = document.getElementById('vnPace')?.value || 'normal';
    const segments = VNStore.getTextSegments();
    const images = VNStore.getGalleryImages();

    appendMessage('mzhou', 'user', userInput || '融合所有资源，生成视觉小说脚本');
    const typingRow = showTyping('mzhou');
    await delay(2000 + Math.random() * 1000);
    hideTyping('mzhou');

    let script = await safeCallLLM('mzhou', buildMzhouPrompt(userInput, segments, images, pov, pace));
    if (script === null) {
      script = demoMzhouScript(title, segments, images);
    }

    const scenes = parseMzhouScript(script, segments, images);
    VNStore.setCurrentScenes(scenes);
    updateVNPlayer(scenes);
    renderScriptEditor(scenes);

    appendMessage('mzhou', 'agent', formatScriptPreview(script, scenes.length), { type: 'vn' });
  }

  function buildMzhouPrompt(extra, segments, images, pov, pace) {
    const segTexts = segments.map((s, i) => `[段落${i+1}] ${s.text.slice(0, 200)}`).join('\n');
    const imgCount = images.length;
    return `你是视觉小说编剧。请将以下文本片段编排为视觉小说格式，包含场景背景、说话人、对话文本。
叙事视角：${pov === 'first' ? '第一人称' : pov === 'second' ? '第二人称' : '第三人称'}
节奏：${pace}
图片资源数量：${imgCount}
${extra ? '编排要求：' + extra : ''}

文本片段：
${segTexts}

请输出格式：
[场景N] 背景：...
角色：...
旁白/对话：...
---`;
  }

  function demoMzhouScript(title, segments, images) {
    const seg = segments[0] || { text: '夜色如墨，长安沉寂。' };
    return `[场景1] 背景：夜色笼罩的长安城楼
角色：燕离（主角）
旁白：${seg.text.slice(0,60)}…

[场景2] 背景：宫廷走廊
角色：左擎宁
对话：「你以为，这一切真的是巧合吗？」

[场景3] 背景：烽火熄灭的城头
角色：燕离
对话：「不管真相如何——我不会放手。」
旁白：风吹过，带走了最后一声叹息。`;
  }

  function parseMzhouScript(script, segments, images) {
    const sceneBlocks = script.split(/\[场景\d+\]/).filter(b => b.trim());
    const scenes = sceneBlocks.map((block, i) => {
      const bgMatch = block.match(/背景[：:]\s*(.+)/);
      const charMatch = block.match(/角色[：:]\s*(.+)/);
      const dialogueMatch = block.match(/(?:对话|旁白)[：:]\s*(.+)/);
      const bg = images[i % Math.max(images.length, 1)]?.url || null;
      return {
        index: i,
        background: bgMatch ? bgMatch[1].trim() : '场景' + (i + 1),
        bgImage: bg,
        speaker: charMatch ? charMatch[1].trim() : '旁白',
        text: dialogueMatch ? dialogueMatch[1].trim().replace(/[「」『』""]/g, '') : (segments[i]?.text.slice(0, 100) || '……'),
      };
    });
    return scenes.length ? scenes : [{
      index: 0, background: '序章', bgImage: null,
      speaker: '旁白', text: '故事从这里开始……'
    }];
  }

  function formatScriptPreview(script, sceneCount) {
    return `视觉小说脚本已生成，共 <b>${sceneCount}</b> 个场景。\n\n<pre style="font-size:11px;color:var(--text-secondary);white-space:pre-wrap;line-height:1.6">${script.slice(0, 300)}${script.length > 300 ? '\n…（点击「编辑脚本」查看并调整全部场景）' : ''}</pre>`;
  }

  // ══════════════════════════════════════
  // VN 脚本预览编辑器
  // ══════════════════════════════════════
  function renderScriptEditor(scenes) {
    const editor = document.getElementById('vnScriptEditor');
    const list = document.getElementById('vnSceneList');
    if (!editor || !list) return;

    editor.style.display = 'block';

    list.innerHTML = scenes.map((s, i) => `
      <div class="vn-scene-row" data-idx="${i}" draggable="true">
        <span class="scene-drag-handle" title="拖拽调序">⠿</span>
        <span class="scene-num">${i + 1}</span>
        <div class="scene-row-body">
          <span class="scene-speaker-tag">${(s.speaker || '旁白').slice(0,8)}</span>
          <span class="scene-text-preview" contenteditable="true"
            data-idx="${i}"
            onblur="Agents.updateSceneText(${i}, this.innerText)"
            title="点击编辑">${(s.text || '').slice(0, 40)}${(s.text||'').length > 40 ? '…' : ''}</span>
        </div>
        <div class="scene-row-ctrl">
          <button class="scene-ctrl-btn" onclick="Agents.moveScene(${i}, -1)" title="上移" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="scene-ctrl-btn" onclick="Agents.moveScene(${i}, 1)" title="下移" ${i === scenes.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="scene-ctrl-btn danger" onclick="Agents.deleteScene(${i})" title="删除场景">✕</button>
        </div>
      </div>`).join('');

    initSceneDragDrop(list);
  }

  function initSceneDragDrop(list) {
    let dragSrc = null;
    list.querySelectorAll('.vn-scene-row').forEach(row => {
      row.addEventListener('dragstart', function() { dragSrc = this; this.classList.add('dragging'); });
      row.addEventListener('dragend', function() { this.classList.remove('dragging'); });
      row.addEventListener('dragover', e => { e.preventDefault(); row.classList.add('drag-over'); });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', function(e) {
        e.preventDefault();
        this.classList.remove('drag-over');
        if (dragSrc === this) return;
        const fromIdx = parseInt(dragSrc.dataset.idx);
        const toIdx = parseInt(this.dataset.idx);
        if (isNaN(fromIdx) || isNaN(toIdx)) return;
        const scenes = VNStore.getCurrentScenes();
        if (fromIdx < 0 || fromIdx >= scenes.length || toIdx < 0 || toIdx >= scenes.length) return;
        const moved = scenes.splice(fromIdx, 1)[0];
        scenes.splice(toIdx, 0, moved);
        scenes.forEach((s, i) => s.index = i);
        VNStore.setCurrentScenes(scenes);
        renderScriptEditor(scenes);
        updateVNPlayer(scenes);
      });
    });
  }

  function moveScene(idx, dir) {
    const scenes = VNStore.getCurrentScenes();
    const target = idx + dir;
    if (target < 0 || target >= scenes.length) return;
    [scenes[idx], scenes[target]] = [scenes[target], scenes[idx]];
    scenes.forEach((s, i) => s.index = i);
    VNStore.setCurrentScenes(scenes);
    renderScriptEditor(scenes);
    updateVNPlayer(scenes);
  }

  function deleteScene(idx) {
    const scenes = VNStore.getCurrentScenes();
    scenes.splice(idx, 1);
    scenes.forEach((s, i) => s.index = i);
    VNStore.setCurrentScenes(scenes);
    renderScriptEditor(scenes);
    updateVNPlayer(scenes);
    App.showToast('场景已删除', '');
  }

  function updateSceneText(idx, newText) {
    const scenes = VNStore.getCurrentScenes();
    if (scenes[idx]) {
      scenes[idx].text = newText.trim();
      VNStore.setCurrentScenes(scenes);
      updateVNPlayer(scenes);
    }
  }

  function openScriptEditor() {
    const editor = document.getElementById('vnScriptEditor');
    if (!editor) return;
    const scenes = VNStore.getCurrentScenes();
    if (!scenes.length) { App.showToast('暂无脚本，请先让暮舟生成', 'error'); return; }
    editor.style.display = 'block';
    renderScriptEditor(scenes);
    // 滚动到脚本编辑器
    editor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // 切换到暮舟 tab
    if (typeof window.App !== 'undefined') {
      document.querySelector('[data-agent="mzhou"]')?.click();
    }
  }

  // ── 脚本编辑器收起按钮 ──
  function initScriptEditorClose() {
    document.getElementById('vnScriptClose')?.addEventListener('click', () => {
      const editor = document.getElementById('vnScriptEditor');
      if (editor) editor.style.display = 'none';
    });
  }

  // ══════════════════════════════════════
  // VN Player 更新
  // ══════════════════════════════════════
  function updateVNPlayer(scenes) {
    if (!scenes || !scenes.length) return;
    VNStore.setCurrentScenes(scenes);
    let current = 0;

    function render(idx) {
      const scene = scenes[idx];
      if (!scene) return;

      const vnText = document.getElementById('vnText');
      const vnSpeaker = document.getElementById('vnSpeaker');
      const vnBg = document.getElementById('vnBg');
      const vnProgress = document.getElementById('vnProgress');

      if (vnText) typewriterEffect(vnText, scene.text);
      if (vnSpeaker) vnSpeaker.textContent = scene.speaker;
      if (vnBg && scene.bgImage) {
        vnBg.style.backgroundImage = `url(${scene.bgImage})`;
        vnBg.style.backgroundSize = 'cover';
      } else if (vnBg) {
        vnBg.style.backgroundImage = `linear-gradient(180deg, hsl(340, 60%, 92%) 0%, hsl(350, 70%, 88%) 100%)`;
      }
      if (vnProgress) vnProgress.textContent = `${idx + 1} / ${scenes.length}`;

      const fsText = document.getElementById('fsText');
      const fsSpeaker = document.getElementById('fsSpeaker');
      const fsBg = document.getElementById('fsBg');
      const fsProgress = document.getElementById('fsProgress');
      if (fsText) typewriterEffect(fsText, scene.text);
      if (fsSpeaker) fsSpeaker.textContent = scene.speaker;
      if (fsBg && scene.bgImage) fsBg.style.backgroundImage = `url(${scene.bgImage})`;
      if (fsProgress) fsProgress.textContent = `${idx + 1} / ${scenes.length}`;
    }

    render(current);

    ['vnPrev', 'vnNext', 'fsPrev', 'fsNext'].forEach(btnId => {
      const btn = document.getElementById(btnId);
      if (!btn) return;
      btn.onclick = () => {
        if (btnId.includes('Prev') && current > 0) { current--; render(current); }
        if (btnId.includes('Next') && current < scenes.length - 1) { current++; render(current); }
      };
    });
  }

  function typewriterEffect(el, text) {
    el.innerHTML = '';
    let i = 0;
    const cursor = document.createElement('span');
    cursor.className = 'cursor-blink';
    cursor.textContent = '▌';

    function type() {
      if (i < text.length) {
        el.textContent = text.slice(0, ++i);
        el.appendChild(cursor);
        setTimeout(type, 28 + Math.random() * 20);
      }
    }
    type();
  }

  // ══════════════════════════════════════
  // 资源管理
  // ══════════════════════════════════════
  function updateMzhouResources() {
    const segments = VNStore.getTextSegments();
    const images = VNStore.getGalleryImages();

    const segList = document.getElementById('textSegList');
    const segCount = document.getElementById('textSegCount');
    const imgList = document.getElementById('imgResList');
    const imgCount = document.getElementById('imgResCount');

    if (segCount) segCount.textContent = segments.length;
    if (imgCount) imgCount.textContent = images.length;

    if (segList) {
      segList.innerHTML = segments.slice(-3).map(s => `
        <div class="res-item">
          <span>${s.text.slice(0,40)}…</span>
          <span style="color:var(--text-dim);font-size:10px">${s.text.length}字</span>
        </div>`).join('');
    }

    if (imgList) {
      imgList.innerHTML = images.slice(-6).map((img, i) => `
        <img class="res-thumb" src="${img.url}" alt="资源${i}"
          onclick="Agents.openImagePreview('${img.url}', '${img.caption || ''}')">
      `).join('');
    }
  }

  function addToGallery(url, caption) {
    VNStore.addGalleryImage({ url, caption, id: 'img_' + Date.now() });
    updateMzhouResources();
    updateGalleryPanel();
    App.showToast('已加入资源库', 'success');
  }

  function updateGalleryPanel() {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;
    const images = VNStore.getGalleryImages();
    if (!images.length) {
      grid.innerHTML = '<div class="gallery-empty">暂无资源，使用花花生成图片后会出现在这里</div>';
      return;
    }
    grid.innerHTML = images.map((img, i) => `
      <div class="gallery-item">
        <img src="${img.url}" alt="图片${i}">
        <div class="gallery-item-overlay">
          <button class="gi-btn" onclick="Agents.openImagePreview('${img.url}', '${img.caption || ''}')" title="预览">◉</button>
          <button class="gi-btn" onclick="VNStore.removeGalleryImage('${img.id}');Agents.updateGalleryPanel()" title="删除">✕</button>
        </div>
      </div>`).join('');
  }

  function openImagePreview(url, caption) {
    const modal = document.getElementById('imgModal');
    const src = document.getElementById('imgModalSrc');
    const title = document.getElementById('imgModalTitle');
    if (modal && src) {
      src.src = url;
      if (title) title.textContent = caption || '图片预览';
      modal.style.display = 'flex';
      document.getElementById('useAsSceneBtn').onclick = () => {
        document.getElementById('vnBg').style.backgroundImage = `url(${url})`;
        document.getElementById('vnBg').style.backgroundSize = 'cover';
        closeModal('imgModal');
        App.showToast('已设为场景背景', 'success');
      };
      document.getElementById('useAsSpriteBtn').onclick = () => {
        const sprite = document.getElementById('vnSprite');
        if (sprite) { sprite.src = url; sprite.style.display = 'block'; }
        closeModal('imgModal');
        App.showToast('已设为角色立绘', 'success');
      };
      document.getElementById('downloadImgBtn').onclick = () => downloadImage(url);
    }
  }

  function downloadImage(url) {
    const a = document.createElement('a');
    a.href = url;
    a.download = 'phantom_' + Date.now() + '.png';
    a.click();
  }

  function replaceSelection(text) {
    const editor = document.getElementById('textEditor');
    if (!editor) return;
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
    }
    App.showToast('已替换选中文本', 'success');
  }

  function copyText(text) {
    navigator.clipboard.writeText(text)
      .then(() => App.showToast('已复制', 'success'))
      .catch(() => App.showToast('复制失败', 'error'));
  }

  function addToMzhou(text) {
    VNStore.addTextSegment(text);
    updateMzhouResources();
    App.showToast('已加入暮舟资源', 'success');
  }

  function previewVN() {
    const modal = document.getElementById('fullscreenModal');
    if (modal) modal.style.display = 'flex';
    const scenes = VNStore.getCurrentScenes();
    if (scenes.length) updateVNPlayer(scenes);
  }

  // ══════════════════════════════════════
  // 通用 API 调用（LLM）
  // ══════════════════════════════════════
  async function callLLM(agent, prompt) {
    const cfg = API_CONFIG[agent];
    if (!cfg || !cfg.endpoint) {
      throw new Error(`智能体 ${agent} 未配置 API 端点`);
    }
    const resp = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent, prompt })
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`API 请求失败 (${resp.status}): ${errText}`);
    }
    const data = await resp.json();
    // 服务端返回 demo_mode 标识 → 前端进入演示模式
    if (data.demo_mode) {
      console.warn(`[${agent}] 演示模式:`, data.reason || 'API 不可用');
      return null;
    }
    if (data.error) throw new Error(data.error);
    return data.content || '（无返回内容）';
  }

  // 安全调用 LLM，失败时返回 null
  async function safeCallLLM(agent, prompt) {
    try {
      return await callLLM(agent, prompt);
    } catch (err) {
      console.warn(`[${agent}] DeepSeek 调用失败:`, err.message);
      return null;
    }
  }

  async function callImageGen(agent, prompt, ratio, refData) {
    const cfg = API_CONFIG[agent];
    const endpoint = cfg.imageEndpoint;
    if (!endpoint) throw new Error('图片生成暂未配置');
    const sizeMap = { '16:9': '1792x1024', '9:16': '1024x1792', '1:1': '1024x1024', '3:4': '1024x1344' };
    const body = { prompt, size: sizeMap[ratio] || '1024x1024', n: 1 };
    if (refData) body.image = refData;
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!resp.ok) throw new Error('图片生成请求失败: ' + resp.status);
    const data = await resp.json();
    return data.data?.[0]?.url || '';
  }

  // 验证图片 URL 是否可访问（带超时，避免 Pollinations 渲染慢导致空白）
  async function validateImageUrl(url, timeoutMs = 8000) {
    if (!url) return false;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const resp = await fetch(url, { method: 'HEAD', signal: ctrl.signal, mode: 'no-cors' });
      clearTimeout(t);
      return true;
    } catch {
      return false;
    }
  }

  // ── 工具 ──
  function delay(ms) { return new Promise(res => setTimeout(res, ms)); }
  function escapeAttr(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;').replace(/"/g, '&quot;').slice(0, 200);
  }

  // ── 初始化（供 app.js 调用）──
  function init() {
    initCharPanel();
    initRefImage();
    initScriptEditorClose();

    // 强度滑块实时显示数值
    const slider = document.getElementById('ziwenIntensity');
    const valEl = document.getElementById('ziwenIntensityVal');
    slider?.addEventListener('input', () => {
      if (valEl) valEl.textContent = slider.value + '%';
    });
  }

  // Public API
  return {
    init,
    setContext, sendZiwen, sendHuahua, sendMzhou,
    addToGallery, updateGalleryPanel, openImagePreview, downloadImage,
    replaceSelection, copyText, addToMzhou, previewVN,
    updateMzhouResources, updateVNPlayer,
    adoptVersion, editChar, deleteChar, renderCharList,
    moveScene, deleteScene, updateSceneText, openScriptEditor
  };
})();
