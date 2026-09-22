/* 题卡集 · 主逻辑：渲染 / 搜索筛选 / 增删改 / GitHub 同步 */
(function () {
  'use strict';

  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.prototype.slice.call((el || document).querySelectorAll(sel));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const DATA_KEY = 'carddeck.data';
  const hl = window.Highlight ? window.Highlight.run : (s) => esc(s);

  const LANG_LABEL = { cpp: 'C++', c: 'C', python: 'Python', java: 'Java', javascript: 'JavaScript', go: 'Go', plain: '文本' };
  const DIFF_CLASS = { '简单': 'easy', '中等': 'mid', '困难': 'hard' };

  const store = {
    data: { cards: [], deleted: {} },
    query: '',
    tag: '全部',
    dirty: false
  };

  /* ---------- 数据 ---------- */
  function normalizeDeck(d) {
    const out = { cards: [], deleted: {} };
    if (d && Array.isArray(d.cards)) {
      for (const c of d.cards) {
        if (c && c.id && c.title) {
          out.cards.push({
            id: String(c.id),
            title: String(c.title),
            difficulty: c.difficulty ? String(c.difficulty) : '',
            tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
            lang: c.lang ? String(c.lang) : 'cpp',
            body: c.body ? String(c.body) : '',
            code: c.code ? String(c.code) : '',
            updatedAt: c.updatedAt ? String(c.updatedAt) : ''
          });
        }
      }
    }
    if (d && d.deleted && typeof d.deleted === 'object' && !Array.isArray(d.deleted)) {
      for (const k of Object.keys(d.deleted)) out.deleted[k] = String(d.deleted[k]);
    }
    return out;
  }

  function saveData() {
    try { localStorage.setItem(DATA_KEY, JSON.stringify(store.data)); }
    catch (e) { console.warn('保存本地缓存失败', e); }
  }

  /* 示例卡判定：id 以 demo- 开头且内容从未被编辑过（updatedAt 与种子一致） */
  function isPristineSeed(c) {
    if (!window.SEED || !/^demo-/.test(String(c.id))) return false;
    return (window.SEED.cards || []).some((s) => s.id === c.id && s.updatedAt === c.updatedAt);
  }

  /* 双向合并：按 id 取 updatedAt 较新者；删除用墓碑（deleted 时间戳更新则仍视为已删除） */
  function mergeData(a, b) {
    const deleted = {};
    for (const [id, ts] of Object.entries(a.deleted || {})) deleted[id] = ts;
    for (const [id, ts] of Object.entries(b.deleted || {})) {
      if (!(id in deleted) || String(ts) > String(deleted[id])) deleted[id] = ts;
    }
    const map = new Map();
    for (const c of b.cards) {
      if (!map.has(c.id) || String(c.updatedAt) > String(map.get(c.id).updatedAt)) map.set(c.id, c);
    }
    for (const c of a.cards) {
      if (!map.has(c.id) || String(c.updatedAt) > String(map.get(c.id).updatedAt)) map.set(c.id, c);
    }
    const cards = [];
    for (const c of map.values()) {
      const dts = deleted[c.id];
      if (dts && String(dts) > String(c.updatedAt || '')) continue;   // 删除发生在最后 → 仍已删除
      if (dts) delete deleted[c.id];                                  // 卡片更新晚于删除 → 复活并撤销墓碑
      cards.push(c);
    }
    return { cards: cards, deleted: deleted };
  }

  /* ---------- 格式化 ---------- */
  function fmtDate(iso) {
    const d = new Date(iso);
    if (!iso || isNaN(d)) return '';
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function fmtNow() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ---------- 渲染 ---------- */
  function visibleCards() {
    let list = store.data.cards.slice();
    if (store.tag !== '全部') list = list.filter((c) => (c.tags || []).indexOf(store.tag) !== -1);
    const q = store.query.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => ((c.title || '') + '\n' + (c.body || '') + '\n' + (c.code || '') + '\n' + (c.tags || []).join(' '))
        .toLowerCase().indexOf(q) !== -1);
    }
    list.sort((x, y) => String(y.updatedAt || '').localeCompare(String(x.updatedAt || '')));
    return list;
  }

  function allTags() {
    const set = new Set();
    for (const c of store.data.cards) for (const t of (c.tags || [])) if (t) set.add(t);
    return set;
  }

  function cardHTML(c) {
    const tags = (c.tags || []).map((t) => '<span class="tag">' + esc(t) + '</span>').join('');
    const diff = c.difficulty
      ? '<span class="chip ' + (DIFF_CLASS[c.difficulty] || '') + '">' + esc(c.difficulty) + '</span>'
      : '';
    const codeBlock = c.code ? (
      '<div class="codewrap">' +
        '<div class="codebar">' +
          '<span class="dots"><i class="d r"></i><i class="d y"></i><i class="d g"></i></span>' +
          '<span class="langname">' + esc(LANG_LABEL[c.lang] || c.lang || '文本') + '</span>' +
          '<span class="spacer"></span>' +
          '<button class="mini" data-act="toggle" type="button">展开</button>' +
          '<button class="mini" data-act="copy" type="button">复制</button>' +
        '</div>' +
        '<pre class="code collapsed"><code>' + hl(c.code, c.lang) + '</code></pre>' +
      '</div>'
    ) : '';
    return (
      '<article class="card glass" data-id="' + esc(c.id) + '">' +
        '<div class="chead"><h2 class="ctitle">' + esc(c.title) + '</h2>' + diff + '</div>' +
        '<div class="cmeta">' + tags + '<span class="cdate">' + fmtDate(c.updatedAt) + '</span></div>' +
        (c.body ? '<p class="cbody">' + esc(c.body) + '</p>' : '') +
        codeBlock +
        '<div class="cfoot">' +
          '<button class="mini" data-act="edit" type="button">编辑</button>' +
          '<button class="mini danger" data-act="del" type="button">删除</button>' +
        '</div>' +
      '</article>'
    );
  }

  function renderFilters(tags) {
    const names = ['全部'].concat(Array.from(tags).sort((a, b) => a.localeCompare(b, 'zh')));
    $('#filters').innerHTML = names.map((n) =>
      '<button class="fchip' + (n === store.tag ? ' on' : '') + '" data-tag="' + esc(n) + '" type="button">' + esc(n) + '</button>'
    ).join('');
  }

  function render() {
    const tags = allTags();
    if (store.tag !== '全部' && !tags.has(store.tag)) store.tag = '全部';   // 筛选中的标签已被删光 → 回到全部
    renderFilters(tags);
    const list = visibleCards();
    const total = store.data.cards.length;
    $('#count').textContent = list.length === total ? ('共 ' + total + ' 张') : (list.length + ' / ' + total + ' 张');
    const grid = $('#grid');
    if (!list.length) {
      grid.innerHTML = store.data.cards.length
        ? '<div class="empty glass">没有匹配的卡片，换个关键词或筛选条件试试 🔍</div>'
        : '<div class="empty glass">还没有卡片 ✨<br>点击右上角「＋ 添加卡片」创建第一张，<br>保存后点「同步」即可上传到 GitHub。</div>';
    } else {
      grid.innerHTML = list.map(cardHTML).join('');
    }
    updateSyncBadge();
  }

  function updateSyncBadge() {
    const dot = $('#sync-dot');
    if (dot) dot.classList.toggle('on', store.dirty);
  }

  /* ---------- toast / 弹窗 ---------- */
  let toastTimer = null;
  function toast(msg, isErr) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.toggle('err', !!isErr);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), isErr ? 5200 : 2600);
  }

  function openModal(sel) {
    const m = $(sel);
    m.classList.add('show');
    const f = m.querySelector('input,textarea');
    if (f) setTimeout(() => f.focus(), 80);
  }
  function closeModals() { $$('.modal').forEach((m) => m.classList.remove('show')); }

  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; }
    catch (e) {
      try {
        const ta = document.createElement('textarea');
        ta.value = t;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch (e2) { return false; }
    }
  }

  /* ---------- 卡片操作 ---------- */
  function bindGrid() {
    $('#grid').addEventListener('click', async (e) => {
      const bodyEl = e.target.closest('.cbody');
      if (bodyEl && !e.target.closest('button')) {
        const sel = window.getSelection ? window.getSelection() : null;
        if (!sel || sel.isCollapsed) bodyEl.classList.toggle('open');   // 正在选中文字时不切换展开
        return;
      }
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const cardEl = btn.closest('.card');
      const id = cardEl ? cardEl.getAttribute('data-id') : '';
      const act = btn.getAttribute('data-act');

      if (act === 'copy') {
        const c = store.data.cards.find((x) => x.id === id);
        const ok = c ? await copyText(c.code || '') : false;
        btn.textContent = ok ? '已复制 ✓' : '复制失败';
        setTimeout(() => { btn.textContent = '复制'; }, 1300);
      } else if (act === 'toggle') {
        const pre = $('.code', cardEl);
        pre.classList.toggle('collapsed');
        btn.textContent = pre.classList.contains('collapsed') ? '展开' : '收起';
      } else if (act === 'edit') {
        openAddModal(store.data.cards.find((x) => x.id === id) || null);
      } else if (act === 'del') {
        delCard(id);
      }
    });
  }

  function delCard(id) {
    const c = store.data.cards.find((x) => x.id === id);
    if (!c) return;
    if (!confirm('确定删除「' + c.title + '」？\n删除后点「同步」才会从 GitHub 仓库移除。')) return;
    store.data.cards = store.data.cards.filter((x) => x.id !== id);
    store.data.deleted[id] = new Date().toISOString();
    store.dirty = true;
    saveData();
    render();
    toast('已删除，记得点「同步」上传');
  }

  /* ---------- 添加 / 编辑 ---------- */
  let editingId = null;

  function openAddModal(c) {
    editingId = c ? c.id : null;
    $('#f-title').value = c ? c.title : '';
    $('#f-diff').value = c ? (c.difficulty || '') : '';
    $('#f-tags').value = c ? (c.tags || []).join(', ') : '';
    $('#f-lang').value = c ? (c.lang || 'cpp') : 'cpp';
    $('#f-body').value = c ? (c.body || '') : '';
    $('#f-code').value = c ? (c.code || '') : '';
    $('#modal-add-title').textContent = c ? '编辑卡片' : '添加卡片';
    openModal('#modal-add');
  }

  function saveCard() {
    const title = $('#f-title').value.trim();
    if (!title) { toast('请先填写题目', true); $('#f-title').focus(); return; }
    const tags = $('#f-tags').value.split(/[,，、;；\s]+/).map((s) => s.trim()).filter(Boolean);
    const now = new Date().toISOString();
    const patch = {
      title: title,
      difficulty: $('#f-diff').value || '',
      tags: tags,
      lang: $('#f-lang').value || 'cpp',
      body: $('#f-body').value.replace(/\r\n/g, '\n').trim(),
      code: $('#f-code').value.replace(/\r\n/g, '\n').replace(/\s+$/, ''),
      updatedAt: now
    };
    let id;
    if (editingId) {
      id = editingId;
      const c = store.data.cards.find((x) => x.id === id);
      if (c) Object.assign(c, patch);
      else store.data.cards.push(Object.assign({ id: id }, patch));
    } else {
      id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      store.data.cards.push(Object.assign({ id: id }, patch));
    }
    delete store.data.deleted[id];
    store.dirty = true;
    saveData();
    closeModals();
    render();
    toast('已保存到本机 ✓');
    const cfg = GH.cfg();
    if (cfg && cfg.token && cfg.owner && cfg.repo) syncAll(false);   // 配置了 Token：自动上传
    else updateSyncBadge();
  }

  /* ---------- 设置 ---------- */
  function openSettings() {
    const cfg = GH.cfg() || {};
    $('#s-owner').value = cfg.owner || '';
    $('#s-repo').value = cfg.repo || '';
    $('#s-branch').value = cfg.branch || 'main';
    $('#s-path').value = cfg.path || 'data/cards.json';
    $('#s-token').value = cfg.token || '';
    openModal('#modal-settings');
  }

  function readSettingsForm() {
    return {
      owner: $('#s-owner').value.trim(),
      repo: $('#s-repo').value.trim(),
      branch: $('#s-branch').value.trim() || 'main',
      path: ($('#s-path').value.trim() || 'data/cards.json').replace(/^\/+/, ''),
      token: $('#s-token').value.trim()
    };
  }

  function saveSettings() {
    const cfg = readSettingsForm();
    if (!cfg.owner || !cfg.repo) { toast('owner 和 repo 不能为空', true); return; }
    GH.saveCfg(cfg);
    closeModals();
    toast('设置已保存 ✓');
    if (cfg.owner && cfg.repo) syncAll(false);   // 配了 Token 会推送；没配则拉取
  }

  async function testConn() {
    const cfg = readSettingsForm();
    if (!cfg.owner || !cfg.repo) { toast('请先填写 owner 和 repo', true); return; }
    const btn = $('#btn-test');
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = '测试中…';
    try {
      const r = await GH.getFile(cfg);
      toast(r
        ? ('连接成功，已找到 ' + cfg.path + ' ✓')
        : ('连接成功 ✓（仓库中还没有 ' + cfg.path + '，首次同步会自动创建）'));
    } catch (e) {
      toast('连接失败：' + e.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  }

  function clearLocal() {
    if (!confirm('清除本机缓存的卡片数据？\n（不影响 GitHub 仓库与 Token 设置；下次打开会重新加载示例或仓库数据）')) return;
    localStorage.removeItem(DATA_KEY);
    location.reload();
  }

  function exportData() {
    const text = JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      cards: store.data.cards,
      deleted: store.data.deleted
    }, null, 2) + '\n';
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cards.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast('已导出 cards.json ✓');
  }

  /* ---------- 同步 ---------- */
  let syncing = false;

  async function syncAll(silent) {
    const cfg = GH.cfg();
    if (!cfg || !cfg.owner || !cfg.repo) {
      if (!silent) { toast('请先在「设置」中配置 GitHub 仓库', true); openSettings(); }
      return;
    }
    if (syncing) return;
    syncing = true;
    const btn = $('#btn-sync');
    btn.classList.add('spin');
    btn.disabled = true;
    let needResync = false;
    try {
      const localSnapshot = JSON.parse(JSON.stringify(store.data));   // 快照，防止网络等待期间的本地改动丢失
      const remote = await GH.getFile(cfg);
      const remoteData = remote ? normalizeDeck(JSON.parse(remote.text)) : { cards: [], deleted: {} };
      if (remote) {
        /* 远端已有数据：从未被编辑过的示例卡不参与合并，避免新设备首开时把示例混进真实题库 */
        localSnapshot.cards = localSnapshot.cards.filter((c) => !isPristineSeed(c));
      }
      const merged = mergeData(localSnapshot, remoteData);

      if (cfg.token) {
        const text = JSON.stringify({
          version: 1,
          updatedAt: new Date().toISOString(),
          cards: merged.cards,
          deleted: merged.deleted
        }, null, 2) + '\n';
        await GH.putFile(cfg, text, remote ? remote.sha : undefined,
          'sync: ' + merged.cards.length + ' 张卡片 @ ' + fmtNow());
        /* 与「当前」本地数据再合并一次：同步期间的新增 / 编辑 / 删除不会被覆盖 */
        store.data = mergeData(merged, store.data);
        const midEdits = JSON.stringify(store.data) !== JSON.stringify(merged);
        saveData();
        store.dirty = midEdits;
        needResync = midEdits;   // 同步期间又有改动 → 追加一轮同步把它们推上去
        render();
        if (!silent) toast('已与 GitHub 同步 ✓');
      } else {
        store.data = mergeData(merged, store.data);
        saveData();
        render();
        if (!silent) {
          toast(remote
            ? '已拉取 GitHub 最新数据 ✓（填写 Token 后可上传）'
            : '仓库中还没有卡片文件（填写 Token 后点同步即可创建）');
        }
      }
    } catch (err) {
      console.error('同步失败', err);
      toast('同步失败：' + err.message, true);
    } finally {
      syncing = false;
      btn.classList.remove('spin');
      btn.disabled = false;
      updateSyncBadge();
      if (needResync) setTimeout(() => { if (!syncing) syncAll(silent); }, 600);
    }
  }

  /* ---------- 事件绑定 ---------- */
  function bindEvents() {
    $('#btn-add').addEventListener('click', () => openAddModal(null));
    $('#btn-sync').addEventListener('click', () => syncAll(false));
    $('#btn-settings').addEventListener('click', openSettings);
    let searchTimer = null;
    $('#search').addEventListener('input', (e) => {
      store.query = e.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(render, 150);   // 卡片较多时避免每个按键都全量重绘
    });

    $('#filters').addEventListener('click', (e) => {
      const b = e.target.closest('.fchip');
      if (!b) return;
      store.tag = b.getAttribute('data-tag');
      render();
    });

    bindGrid();

    $('#form-add').addEventListener('submit', (e) => { e.preventDefault(); saveCard(); });
    $('#form-settings').addEventListener('submit', (e) => { e.preventDefault(); saveSettings(); });
    $('#btn-test').addEventListener('click', testConn);
    $('#btn-export').addEventListener('click', exportData);
    $('#btn-clear').addEventListener('click', clearLocal);

    $$('[data-close]').forEach((b) => b.addEventListener('click', closeModals));
    $$('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) closeModals(); }));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModals(); });
  }

  /* ---------- 启动 ---------- */
  async function init() {
    let loaded = false;
    try {
      const raw = localStorage.getItem(DATA_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && Array.isArray(d.cards)) { store.data = normalizeDeck(d); loaded = true; }
        else localStorage.removeItem(DATA_KEY);
      }
    } catch (e) {
      console.warn('本地缓存损坏，已重置', e);
      localStorage.removeItem(DATA_KEY);
    }

    if (!loaded) {
      /* 已配置仓库 → 优先拉取远端，避免把示例卡当作本地数据；拉不到才回退到示例 */
      const cfg0 = GH.cfg();
      let remoteData = null;
      if (cfg0 && cfg0.owner && cfg0.repo) {
        try {
          const remote = await GH.getFile(cfg0);
          if (remote) remoteData = normalizeDeck(JSON.parse(remote.text));
        } catch (e) { console.warn('首次加载拉取远端失败，先用示例数据', e); }
      }
      if (remoteData) {
        store.data = remoteData;
      } else {
        let seed = null;
        try {
          const res = await fetch('data/cards.json', { cache: 'no-store' });
          if (res.ok) seed = await res.json();
        } catch (e) { /* file:// 下 fetch 受限，走内置兜底数据 */ }
        if (!seed && window.SEED) seed = window.SEED;
        store.data = normalizeDeck(seed);
      }
      saveData();
    }

    bindEvents();
    render();

    if ('serviceWorker' in navigator) {
      const host = location.hostname;
      if (host !== 'localhost' && host !== '127.0.0.1') {   // 本地开发不缓存，线上启用离线
        navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW 注册失败', e));
      }
    }

    const cfg = GH.cfg();
    if (cfg && cfg.owner && cfg.repo) syncAll(true);   // 静默自动同步
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
