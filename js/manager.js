/**
 * manager.js — 成品库管理模块
 * 视觉小说作品的增删改查 + 合集管理
 */

const VNStore = (() => {
  const WORKS_KEY = 'pvn_works';
  const COLLECTIONS_KEY = 'pvn_collections';
  const SEGMENTS_KEY = 'pvn_segments';
  const GALLERY_KEY = 'pvn_gallery';
  const SCENES_KEY = 'pvn_scenes';

  // ── LocalStorage 辅助 ──
  function load(key, def = []) {
    try { return JSON.parse(localStorage.getItem(key)) || def; }
    catch { return def; }
  }
  function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  // ── Works CRUD ──
  function getWorks() { return load(WORKS_KEY, []); }
  function saveWorks(w) { save(WORKS_KEY, w); }

  function createWork(data) {
    const works = getWorks();
    const work = {
      id: 'work_' + Date.now(),
      name: data.name || '未命名作品',
      desc: data.desc || '',
      tags: data.tags || [],
      collection: data.collection || '',
      color: data.color || '#534AB7',
      coverImage: data.coverImage || null,
      scenes: data.scenes || [],
      textSegments: data.textSegments || [],
      gallery: data.gallery || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    works.unshift(work);
    saveWorks(works);
    return work;
  }

  function updateWork(id, data) {
    const works = getWorks();
    const idx = works.findIndex(w => w.id === id);
    if (idx === -1) return null;
    works[idx] = { ...works[idx], ...data, updatedAt: new Date().toISOString() };
    saveWorks(works);
    return works[idx];
  }

  function deleteWork(id) {
    const works = getWorks().filter(w => w.id !== id);
    saveWorks(works);
  }

  function getWork(id) { return getWorks().find(w => w.id === id) || null; }

  // ── Collections CRUD ──
  function getCollections() { return load(COLLECTIONS_KEY, []); }
  function saveCollections(c) { save(COLLECTIONS_KEY, c); }

  function createCollection(name, desc = '') {
    const cols = getCollections();
    const col = { id: 'col_' + Date.now(), name, desc, createdAt: new Date().toISOString() };
    cols.push(col);
    saveCollections(cols);
    return col;
  }

  function deleteCollection(id) {
    const cols = getCollections().filter(c => c.id !== id);
    saveCollections(cols);
    // 解绑作品
    const works = getWorks().map(w => w.collection === id ? { ...w, collection: '' } : w);
    saveWorks(works);
  }

  // ── Session 资源（不持久化到成品库）──
  let _segments = [];
  let _gallery = [];
  let _scenes = [];

  function addTextSegment(text) {
    _segments.push({ id: 'seg_' + Date.now(), text, addedAt: new Date().toISOString() });
  }
  function getTextSegments() { return _segments; }
  function clearTextSegments() { _segments = []; }

  function addGalleryImage(img) { _gallery.push(img); }
  function getGalleryImages() { return _gallery; }
  function removeGalleryImage(id) { _gallery = _gallery.filter(i => i.id !== id); }

  function setCurrentScenes(scenes) { _scenes = scenes; }
  function getCurrentScenes() { return _scenes; }

  return {
    getWorks, createWork, updateWork, deleteWork, getWork,
    getCollections, createCollection, deleteCollection,
    addTextSegment, getTextSegments, clearTextSegments,
    addGalleryImage, getGalleryImages, removeGalleryImage,
    setCurrentScenes, getCurrentScenes
  };
})();

// ══════════════════════════════════════════
// LibraryManager — 渲染成品库UI
// ══════════════════════════════════════════
const LibraryManager = (() => {
  let currentCollection = 'all';
  let searchQuery = '';
  let sortOrder = 'newest';
  let editingWorkId = null;

  function init() {
    renderCollectionList();
    renderWorksGrid();
    bindEvents();
  }

  function bindEvents() {
    // 搜索
    document.getElementById('libSearch')?.addEventListener('input', e => {
      searchQuery = e.target.value.toLowerCase();
      renderWorksGrid();
    });
    // 排序
    document.getElementById('libSort')?.addEventListener('change', e => {
      sortOrder = e.target.value;
      renderWorksGrid();
    });
    // 合集过滤
    document.getElementById('libCollection')?.addEventListener('change', e => {
      currentCollection = e.target.value;
      renderWorksGrid();
    });
    // 新建合集
    document.getElementById('addColBtn')?.addEventListener('click', () => openCollectionModal());
    document.getElementById('newCollectionBtn')?.addEventListener('click', () => openCollectionModal());
    document.getElementById('saveColBtn')?.addEventListener('click', saveCollection);
    // 保存作品
    document.getElementById('saveWorkBtn')?.addEventListener('click', saveWorkFromModal);
  }

  // ── 渲染合集列表 ──
  function renderCollectionList() {
    const list = document.getElementById('collectionList');
    if (!list) return;
    const collections = VNStore.getCollections();
    const works = VNStore.getWorks();
    const totalEl = document.getElementById('totalCount');
    if (totalEl) totalEl.textContent = works.length;

    // 更新顶部合集下拉
    const filterSel = document.getElementById('libCollection');
    const workColSel = document.getElementById('workCollection');
    const pubSel = document.getElementById('pubProjectSelect');

    [filterSel, workColSel].forEach(sel => {
      if (!sel) return;
      const allOpt = sel.tagName === 'SELECT' && sel.id === 'libCollection'
        ? '<option value="all">全部合集</option>'
        : '<option value="">无合集</option>';
      sel.innerHTML = allOpt + collections.map(c =>
        `<option value="${c.id}">${c.name}</option>`).join('');
    });

    if (pubSel) {
      pubSel.innerHTML = '<option value="">—— 选择作品 ——</option>' +
        works.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
    }

    // 渲染合集侧边栏
    const colItems = collections.map(c => {
      const count = works.filter(w => w.collection === c.id).length;
      return `<li class="col-item ${currentCollection === c.id ? 'active' : ''}" data-col="${c.id}">
        <span class="col-icon">◉</span>
        <span>${c.name}</span>
        <span class="col-count">${count}</span>
        <button style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:10px;margin-left:2px"
          onclick="event.stopPropagation();LibraryManager.deleteCollection('${c.id}')">✕</button>
      </li>`;
    }).join('');

    const allItem = list.querySelector('[data-col="all"]');
    if (allItem) {
      // keep it, replace rest
      list.innerHTML = `<li class="col-item ${currentCollection === 'all' ? 'active' : ''}" data-col="all">
        <span class="col-icon">◉</span> 全部作品
        <span class="col-count" id="totalCount">${works.length}</span>
      </li>` + colItems;
    }

    // Click handlers
    list.querySelectorAll('.col-item').forEach(item => {
      item.addEventListener('click', () => {
        currentCollection = item.dataset.col;
        list.querySelectorAll('.col-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        renderWorksGrid();
      });
    });
  }

  // ── 渲染作品网格 ──
  function renderWorksGrid() {
    const grid = document.getElementById('worksGrid');
    const empty = document.getElementById('gridEmpty');
    if (!grid) return;

    let works = VNStore.getWorks();

    // 合集过滤
    if (currentCollection !== 'all') {
      works = works.filter(w => w.collection === currentCollection);
    }
    // 搜索
    if (searchQuery) {
      works = works.filter(w =>
        w.name.toLowerCase().includes(searchQuery) ||
        (w.desc || '').toLowerCase().includes(searchQuery) ||
        (w.tags || []).some(t => t.toLowerCase().includes(searchQuery))
      );
    }
    // 排序
    if (sortOrder === 'newest') works.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    else if (sortOrder === 'oldest') works.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    else if (sortOrder === 'name') works.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));

    if (!works.length) {
      grid.innerHTML = '';
      if (empty) { empty.style.display = 'flex'; grid.appendChild(empty); }
      return;
    }
    if (empty) empty.style.display = 'none';

    grid.innerHTML = works.map(w => renderWorkCard(w)).join('');
  }

  function renderWorkCard(work) {
    const date = new Date(work.createdAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
    const tags = (work.tags || []).slice(0, 3).map(t => `<span class="tag">${t}</span>`).join('');
    const cover = work.coverImage
      ? `<img src="${work.coverImage}" alt="封面">`
      : `<div class="work-card-placeholder" style="background:${work.color}22"><img src="assets/微信图片_20260527223222_269_1.jpg" alt="" class="deco-icon-lg" style="opacity:.3"></div>`;

    return `<div class="work-card" data-id="${work.id}">
      <div class="work-card-cover" style="background:${work.color}22">
        ${cover}
      </div>
      <div class="work-card-body">
        <div class="work-card-title">${work.name}</div>
        <div class="work-card-desc">${work.desc || '暂无简介'}</div>
        <div class="work-card-tags">${tags}</div>
      </div>
      <div class="work-card-footer">
        <span class="work-card-date">${date}</span>
        <div class="work-card-actions">
          <button class="card-action-btn" title="预览" onclick="LibraryManager.previewWork('${work.id}')">◉</button>
          <button class="card-action-btn" title="编辑" onclick="LibraryManager.editWork('${work.id}')">✎</button>
          <button class="card-action-btn" title="添加到合集" onclick="LibraryManager.moveToCollection('${work.id}')">◑</button>
          <button class="card-action-btn danger" title="删除" onclick="LibraryManager.confirmDeleteWork('${work.id}')">✕</button>
        </div>
      </div>
    </div>`;
  }

  // ── 作品操作 ──
  function previewWork(id) {
    const work = VNStore.getWork(id);
    if (!work) return;
    if (work.scenes && work.scenes.length) {
      VNStore.setCurrentScenes(work.scenes);
      Agents.updateVNPlayer(work.scenes);
      switchTab('author');
      switchDashSub('author', 'studio');
      const modal = document.getElementById('fullscreenModal');
      if (modal) modal.style.display = 'flex';
    } else {
      App.showToast('该作品暂无场景数据', 'error');
    }
  }

  function editWork(id) {
    const work = VNStore.getWork(id);
    if (!work) return;
    editingWorkId = id;
    document.getElementById('workModalTitle').textContent = '编辑作品';
    document.getElementById('workName').value = work.name;
    document.getElementById('workDesc').value = work.desc || '';
    document.getElementById('workTags').value = (work.tags || []).join(' ');
    document.getElementById('workCollection').value = work.collection || '';
    document.getElementById('workColor').value = work.color || '#534AB7';
    document.getElementById('workModal').style.display = 'flex';
  }

  function confirmDeleteWork(id) {
    const work = VNStore.getWork(id);
    if (!work) return;
    if (confirm(`确认删除「${work.name}」？此操作不可撤销。`)) {
      VNStore.deleteWork(id);
      renderWorksGrid();
      renderCollectionList();
      App.showToast('已删除', 'success');
    }
  }

  function moveToCollection(id) {
    const cols = VNStore.getCollections();
    if (!cols.length) { App.showToast('请先创建合集', 'error'); return; }
    const names = cols.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
    const choice = prompt(`选择合集（输入序号，0=取消归属）：\n${names}`);
    const idx = parseInt(choice) - 1;
    if (choice === '0') {
      VNStore.updateWork(id, { collection: '' });
    } else if (!isNaN(idx) && cols[idx]) {
      VNStore.updateWork(id, { collection: cols[idx].id });
    }
    renderWorksGrid();
    renderCollectionList();
    App.showToast('已更新合集', 'success');
  }

  function saveWorkFromModal() {
    const name = document.getElementById('workName')?.value.trim();
    if (!name) { App.showToast('请输入作品名称', 'error'); return; }

    const data = {
      name,
      desc: document.getElementById('workDesc')?.value.trim() || '',
      tags: document.getElementById('workTags')?.value.trim().split(/\s+/).filter(Boolean),
      collection: document.getElementById('workCollection')?.value || '',
      color: document.getElementById('workColor')?.value || '#534AB7',
    };

    if (editingWorkId) {
      VNStore.updateWork(editingWorkId, data);
      App.showToast('已保存修改', 'success');
      editingWorkId = null;
    } else {
      const scenes = VNStore.getCurrentScenes();
      const textSegments = VNStore.getTextSegments();
      const gallery = VNStore.getGalleryImages();
      const coverImage = gallery[0]?.url || null;
      VNStore.createWork({ ...data, scenes, textSegments, gallery, coverImage });
      App.showToast('已创建新作品', 'success');
    }

    closeModal('workModal');
    renderWorksGrid();
    renderCollectionList();
  }

  // ── 合集操作 ──
  function openCollectionModal() {
    document.getElementById('colName').value = '';
    document.getElementById('colDesc').value = '';
    document.getElementById('collectionModal').style.display = 'flex';
  }

  function saveCollection() {
    const name = document.getElementById('colName')?.value.trim();
    if (!name) { App.showToast('请输入合集名称', 'error'); return; }
    VNStore.createCollection(name, document.getElementById('colDesc')?.value.trim());
    closeModal('collectionModal');
    renderCollectionList();
    App.showToast('合集已创建', 'success');
  }

  function deleteCollection(id) {
    if (confirm('删除合集？（其中的作品不会被删除）')) {
      VNStore.deleteCollection(id);
      renderCollectionList();
      renderWorksGrid();
      App.showToast('合集已删除', 'success');
    }
  }

  return {
    init, renderWorksGrid, renderCollectionList,
    previewWork, editWork, confirmDeleteWork, moveToCollection,
    openCollectionModal, saveCollection, saveWorkFromModal, deleteCollection
  };
})();
