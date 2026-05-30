/**
 * auth.js v2.0 — 注册 / 登录 / 用户会话管理
 * 对接 Supabase 数据库，通过 /api/user 接口读写
 * Token 存储在 localStorage / sessionStorage
 */

const Auth = (() => {

  // ── 常量 ──
  const API_BASE  = '/api/user';
  const SESSION_KEY = 'pvn_session';
  const REMEMBER_KEY = 'pvn_remember';

  // ── 工具：安全 JSON 解析 ──
  async function safeJson(res) {
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const text = await res.text().catch(() => '');
      console.error('API returned non-JSON:', text.substring(0, 200));
      return { error: '服务器返回了非 JSON 数据（' + res.status + '），请检查 API 是否正常部署' };
    }
    try {
      return await res.json();
    } catch {
      const text = await res.text().catch(() => '');
      console.error('JSON parse failed:', text.substring(0, 200));
      return { error: 'API 数据解析失败（' + res.status + '）' };
    }
  }

  // ── 工具：API 调用 ──
  async function apiCall(action, body, useAuth = false) {
    const url = `${API_BASE}?action=${action}`;
    const headers = { 'Content-Type': 'application/json' };
    if (useAuth) {
      const session = getSession();
      if (session && session.token) {
        headers['Authorization'] = `Bearer ${session.token}`;
      }
      // Also pass user id in body for operations that need it
      if (session && session.id) {
        body = { ...body, userId: session.id };
      }
    }
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.error || '请求失败 (' + res.status + ')');
    return data;
  }

  async function apiGet(action, id) {
    const url = `${API_BASE}?action=${action}&id=${id}`;
    const res = await fetch(url);
    const data = await safeJson(res);
    if (!res.ok) throw new Error(data.error || '请求失败 (' + res.status + ')');
    return data;
  }

  // ── 会话管理 ──
  function getSession() {
    try {
      const s = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  }

  function saveSession(user, token, remember) {
    const data = JSON.stringify({
      id: user.id, username: user.username, email: user.email,
      role: user.role, avatar_url: user.avatar_url, bio: user.bio,
      token: token
    });
    if (remember) {
      localStorage.setItem(SESSION_KEY, data);
    } else {
      sessionStorage.setItem(SESSION_KEY, data);
    }
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_KEY);
  }

  function getToken() {
    const s = getSession();
    return s ? s.token : null;
  }

  // ── 当前用户 ──
  function currentUser() {
    return getSession();
  }

  function isAuthor() {
    const u = currentUser();
    return u && u.role === 'author';
  }

  function isAdmin() {
    const u = currentUser();
    return u && u.role === 'admin';
  }

  // ── 注册（异步） ──
  async function register({ username, email, password, avatarColor }) {
    // 前端校验
    if (!username || username.length < 2 || username.length > 16) return { ok: false, msg: '用户名需为 2-16 个字符' };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, msg: '请输入有效的邮箱地址' };
    if (!password || password.length < 6) return { ok: false, msg: '密码至少需要 6 位' };

    try {
      const data = await apiCall('register', { username, email, password });
      // 给新用户附加头像颜色（存在 session 里）
      data.user.avatarColor = avatarColor || '#7c6fff';
      return { ok: true, user: data.user, token: data.token };
    } catch (e) {
      return { ok: false, msg: e.message };
    }
  }

  // ── 登录（异步） ──
  async function login({ identifier, password, remember }) {
    if (!identifier) return { ok: false, msg: '请输入用户名或邮箱' };
    if (!password) return { ok: false, msg: '请输入密码' };

    try {
      // 先用 username 登录；若用户输入的是邮箱，后端也支持 username 字段传邮箱
      const data = await apiCall('login', { username: identifier, password });
      data.user.avatarColor = data.user.avatar_url ? '#7c6fff' : '#7c6fff';
      return { ok: true, user: data.user, token: data.token };
    } catch (e) {
      return { ok: false, msg: e.message };
    }
  }

  // ── 登出 ──
  function logout() {
    clearSession();
    renderUI(null);
    window.App?.showToast('已退出登录', 'success');
  }

  // ── 激活作者身份 ──
  async function activateAuthor() {
    const user = currentUser();
    if (!user) return { ok: false, msg: '请先登录' };
    try {
      await apiCall('activate_author', {}, true);
      const updated = { ...user, role: 'author' };
      // 确保 token 有效再保存，避免 Bearer null
      const token = user.token && user.token !== 'null' ? user.token : getToken();
      saveSession(updated, token, !!localStorage.getItem(SESSION_KEY));
      renderUI(updated);
      return { ok: true };
    } catch (e) {
      return { ok: false, msg: e.message };
    }
  }

  // ── 更新资料 ──
  async function updateProfile({ username, bio, avatarColor }) {
    const session = getSession();
    if (!session) return { ok: false, msg: '未登录' };

    if (!username || username.length < 2) return { ok: false, msg: '用户名至少 2 个字符' };

    try {
      const data = await apiCall('profile', { username, bio });
      const updated = { ...session, username: data.username, bio: data.bio };
      const remember = !!localStorage.getItem(SESSION_KEY);
      saveSession(updated, session.token, remember);
      return { ok: true, user: updated };
    } catch (e) {
      return { ok: false, msg: e.message };
    }
  }

  // ── 渲染顶栏 UI ──
  function renderUI(user) {
    const authBtns = document.getElementById('authBtns');
    const userMenu  = document.getElementById('userMenu');
    if (!authBtns || !userMenu) return;

    if (user) {
      authBtns.style.display = 'none';
      userMenu.style.display = 'block';
      const initial = (user.username || 'U')[0].toUpperCase();
      const color   = user.avatarColor || '#7c6fff';
      const roleBadge = user.role === 'author' ? ' ✦' : user.role === 'admin' ? ' ⬡' : '';

      const icon = document.getElementById('userAvatarIcon');
      if (icon) { icon.textContent = initial; icon.style.background = color; }
      const nameText = document.getElementById('userNameText');
      if (nameText) nameText.textContent = user.username + roleBadge;
      const da = document.getElementById('dropdownAvatar');
      if (da) { da.textContent = initial; da.style.background = color; }
      const dn = document.getElementById('dropdownName');
      if (dn) dn.textContent = user.username + roleBadge;
      const de = document.getElementById('dropdownEmail');
      if (de) de.textContent = user.email;
      const dr = document.getElementById('dropdownRole');
      if (dr) dr.textContent = user.role === 'author' ? '作者' : user.role === 'admin' ? '管理员' : '读者';

      // 作者激活按钮
      const actBtn = document.getElementById('activateAuthorBtn');
      if (actBtn) {
        actBtn.style.display = (user.role === 'reader') ? 'block' : 'none';
      }
    } else {
      authBtns.style.display = 'flex';
      userMenu.style.display  = 'none';
    }
  }

  // ── 显示错误 ──
  function showError(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('visible', !!msg);
  }

  // ── 切换密码可见 ──
  function bindEye(btnId, inputId) {
    document.getElementById(btnId)?.addEventListener('click', () => {
      const inp = document.getElementById(inputId);
      if (!inp) return;
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });
  }

  // ── 选颜色 ──
  function bindAvatarColors(containerId, callback) {
    const container = document.getElementById(containerId);
    if (!container) return;
    let selectedColor = container.querySelector('.av-color.active')?.dataset.color || '#7c6fff';
    container.querySelectorAll('.av-color').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.av-color').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedColor = btn.dataset.color;
        if (callback) callback(selectedColor);
      });
    });
    return { get: () => selectedColor };
  }

  // ── 初始化 ──
  function init() {
    const session = getSession();
    renderUI(session);

    // ── 按钮绑定 ──
    document.getElementById('loginBtn')?.addEventListener('click', () => openModal('loginModal'));
    document.getElementById('registerBtn')?.addEventListener('click', () => openModal('registerModal'));

    document.getElementById('userAvatarBtn')?.addEventListener('click', e => {
      e.stopPropagation();
      const dd = document.getElementById('userDropdown');
      if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', () => {
      const dd = document.getElementById('userDropdown');
      if (dd) dd.style.display = 'none';
    });

    document.getElementById('logoutBtn')?.addEventListener('click', logout);

    // 个人资料
    document.getElementById('profileBtn')?.addEventListener('click', openProfile);
    document.getElementById('saveProfileBtn')?.addEventListener('click', saveProfile);

    // 激活作者
    document.getElementById('activateAuthorBtn')?.addEventListener('click', async () => {
      const result = await activateAuthor();
      window.App?.showToast(result.ok ? '已升级为作者 ✦' : result.msg, result.ok ? 'success' : 'error');
    });

    // 登录弹窗
    bindEye('loginEyeBtn', 'loginPassword');
    document.getElementById('doLoginBtn')?.addEventListener('click', doLogin);
    document.getElementById('toRegisterBtn')?.addEventListener('click', () => {
      closeModal('loginModal'); openModal('registerModal');
    });
    ['loginIdentifier','loginPassword'].forEach(id => {
      document.getElementById(id)?.addEventListener('keydown', e => {
        if (e.key === 'Enter') doLogin();
      });
    });

    // 注册弹窗
    bindEye('regEyeBtn', 'regPassword');
    let selectedRegColor = '#7c6fff';
    const colorPicker = bindAvatarColors('avatarColors', c => { selectedRegColor = c; });
    document.getElementById('doRegisterBtn')?.addEventListener('click', () => doRegister(colorPicker));
    document.getElementById('toLoginBtn')?.addEventListener('click', () => {
      closeModal('registerModal'); openModal('loginModal');
    });
    ['regUsername','regEmail','regPassword','regConfirm'].forEach(id => {
      document.getElementById(id)?.addEventListener('keydown', e => {
        if (e.key === 'Enter') doRegister(colorPicker);
      });
    });

    // Modal 背景点击关闭
    document.getElementById('loginModal')?.addEventListener('click', e => {
      if (e.target === document.getElementById('loginModal')) closeModal('loginModal');
    });
    document.getElementById('registerModal')?.addEventListener('click', e => {
      if (e.target === document.getElementById('registerModal')) closeModal('registerModal');
    });
  }

  // ── 执行登录（异步） ──
  async function doLogin() {
    const identifier = document.getElementById('loginIdentifier')?.value.trim();
    const password   = document.getElementById('loginPassword')?.value;
    const remember   = document.getElementById('rememberMe')?.checked;
    showError('loginError', '');

    if (!identifier) { showError('loginError', '请输入用户名或邮箱'); return; }
    if (!password)   { showError('loginError', '请输入密码'); return; }

    const btn = document.getElementById('doLoginBtn');
    if (btn) { btn.disabled = true; btn.textContent = '登录中…'; }

    try {
      const result = await login({ identifier, password, remember });
      if (btn) { btn.disabled = false; btn.textContent = '登 录'; }
      if (result.ok) {
        saveSession(result.user, result.token, remember);
        closeModal('loginModal');
        renderUI(result.user);
        document.getElementById('loginPassword').value = '';
        window.App?.showToast(`欢迎回来，${result.user.username}！`, 'success');
      } else {
        showError('loginError', result.msg);
      }
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '登 录'; }
      showError('loginError', e.message || '网络错误，请稍后重试');
    }
  }

  // ── 执行注册（异步） ──
  async function doRegister(colorPicker) {
    const username = document.getElementById('regUsername')?.value.trim();
    const email    = document.getElementById('regEmail')?.value.trim();
    const password = document.getElementById('regPassword')?.value;
    const confirm  = document.getElementById('regConfirm')?.value;
    const avatarColor = colorPicker ? colorPicker.get() : '#7c6fff';
    showError('regError', '');

    if (password !== confirm) { showError('regError', '两次输入的密码不一致'); return; }

    const btn = document.getElementById('doRegisterBtn');
    if (btn) { btn.disabled = true; btn.textContent = '注册中…'; }

    try {
      const result = await register({ username, email, password, avatarColor });
      if (btn) { btn.disabled = false; btn.textContent = '注 册'; }
      if (result.ok) {
        saveSession(result.user, result.token, false);
        closeModal('registerModal');
        renderUI(result.user);
        window.App?.showToast(`注册成功！欢迎加入，${result.user.username} ✦`, 'success');
      } else {
        showError('regError', result.msg);
      }
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '注 册'; }
      showError('regError', e.message || '网络错误，请稍后重试');
    }
  }

  // ── 打开个人资料 ──
  function openProfile() {
    const user = currentUser();
    if (!user) return;
    document.getElementById('profileUsername').value = user.username;
    document.getElementById('profileEmail').value    = user.email;
    document.getElementById('profileBio').value      = user.bio || '';
    document.getElementById('profileJoinDate').textContent = '—';

    const big = document.getElementById('profileAvatarBig');
    if (big) { big.textContent = user.username[0].toUpperCase(); big.style.background = user.avatarColor || '#7c6fff'; }

    const container = document.getElementById('profileAvatarColors');
    if (container) {
      container.querySelectorAll('.av-color').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.color === (user.avatarColor || '#7c6fff'));
        btn.addEventListener('click', () => {
          container.querySelectorAll('.av-color').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          if (big) big.style.background = btn.dataset.color;
        });
      });
    }
    openModal('profileModal');
  }

  // ── 保存个人资料 ──
  async function saveProfile() {
    const username = document.getElementById('profileUsername')?.value.trim();
    const bio      = document.getElementById('profileBio')?.value.trim();
    const container = document.getElementById('profileAvatarColors');
    const avatarColor = container?.querySelector('.av-color.active')?.dataset.color;

    const result = await updateProfile({ username, bio, avatarColor });
    if (result.ok) {
      renderUI(result.user);
      closeModal('profileModal');
      window.App?.showToast('资料已更新', 'success');
    } else {
      window.App?.showToast(result.msg, 'error');
    }
  }

  return { init, currentUser, isAuthor, isAdmin, logout, register, login, renderUI, getToken };

})();

// 工具函数（与 app.js 共享）
function openModal(id) {
  const el = document.getElementById(id);
  if (el) { el.style.display = 'flex'; }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) { el.style.display = 'none'; }
}

document.addEventListener('DOMContentLoaded', () => {
  Auth.init();
});
