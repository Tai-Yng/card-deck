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
          const nc = {
            id: String(c.id),
            title: String(c.title),
            difficulty: c.difficulty ? String(c.difficulty) : '',
            tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
            lang: c.lang ? String(c.lang) : 'cpp',
            body: c.body ? String(c.body) : '',
            code: c.code ? String(c.code) : '',
            updatedAt: c.updatedAt ? String(c.updatedAt) : ''
          };
          /* 复习进度（可选）：box 阶段 1-6 + 到期时间 + 最近评分时间 */
          if (c.review && typeof c.review === 'object' && typeof c.review.box === 'number' && c.review.due) {
            nc.review = {
              box: Math.min(6, Math.max(1, Math.round(c.review.box))),
              due: String(c.review.due),
              last: c.review.last ? String(c.review.last) : ''
            };
          }
          out.cards.push(nc);
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

  /* 与顺序无关的数据指纹：判断「有没有实际变化」。
     若直接 stringify 比较，卡片顺序不同但内容相同会误判为有改动，
     导致空提交甚至无限补传循环 */
  function fingerprint(deck) {
    const sortedDeleted = {};
    for (const k of Object.keys(deck.deleted).sort()) sortedDeleted[k] = deck.deleted[k];
    return JSON.stringify({
      cards: deck.cards.map((c) => c.id + '|' + (c.updatedAt || '') + '|' + (c.review ? c.review.box + '@' + (c.review.due || '') : '')).sort(),
      deleted: sortedDeleted
    });
  }

  /* 卡片新旧裁决：先比 updatedAt（内容编辑），相同再比 review.last（评分不改动 updatedAt） */
  function cardNewer(x, y) {
    const xu = String(x.updatedAt || ''), yu = String(y.updatedAt || '');
    if (xu !== yu) return xu > yu;
    const xr = (x.review && x.review.last) || '';
    const yr = (y.review && y.review.last) || '';
    return xr > yr;
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
      if (!map.has(c.id) || cardNewer(c, map.get(c.id))) map.set(c.id, c);
    }
    for (const c of a.cards) {
      if (!map.has(c.id) || cardNewer(c, map.get(c.id))) map.set(c.id, c);
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

  /* ---------- 间隔复习（艾宾浩斯 / Leitner 盒子法） ---------- */
  const RV_DAYS = [1, 2, 4, 7, 15, 30];   // 各阶段间隔天数

  function nextReview(prev, rate, nowMs) {
    const p = (prev && typeof prev.box === 'number') ? prev.box : 0;
    let box;
    if (rate === 'good') box = Math.min(6, p + 1);
    else if (rate === 'ok') box = Math.max(1, p);
    else box = 1;
    return { box: box, due: new Date(nowMs + RV_DAYS[box - 1] * 86400000).toISOString(), last: new Date(nowMs).toISOString() };
  }

  function reviewStats(cards, nowIso) {
    let due = 0, fresh = 0, learning = 0;
    for (const c of cards) {
      if (!c.review) fresh++;
      else if (c.review.due <= nowIso) due++;
      else learning++;
    }
    return { due: due, fresh: fresh, learning: learning };
  }

  function masteryLevel(c) {
    if (!c.review) return 0;
    if (c.review.box >= 5) return 3;
    if (c.review.box >= 3) return 2;
    return 1;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function buildQueue(cards, mode, nowIso) {
    if (mode === 'random') return shuffle(cards.slice());
    const due = [], fresh = [];
    for (const c of cards) {
      if (!c.review) fresh.push(c);
      else if (c.review.due <= nowIso) due.push(c);
    }
    due.sort((x, y) => String(x.review.due).localeCompare(String(y.review.due)));
    shuffle(fresh);
    return due.concat(fresh);
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
    const lv = masteryLevel(c);
    const dot = '<span class="mdot lv' + lv + '" title="' + (lv === 0 ? '新卡' : '复习进度：第 ' + c.review.box + ' 阶') + '"></span>';
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
        '<div class="cmeta">' + dot + tags + '<span class="cdate">' + fmtDate(c.updatedAt) + '</span></div>' +
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
    updateReviewBadge();
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

  /* ---------- 主题（跟随系统 / 亮 / 暗） ---------- */
  const THEME_KEY = 'carddeck.theme';

  function themeMode() {
    try {
      const m = localStorage.getItem(THEME_KEY);
      return (m === 'light' || m === 'dark') ? m : 'auto';
    } catch (e) { return 'auto'; }
  }

  function applyTheme() {
    const mode = themeMode();
    const dark = mode === 'dark' || (mode === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('theme-dark', dark);
    document.documentElement.style.colorScheme = mode === 'auto' ? '' : mode;
    const meta = $('#meta-theme');
    if (meta) meta.setAttribute('content', dark ? '#0d1220' : '#eaf1ff');
    const btn = $('#btn-theme');
    if (btn) {
      btn.textContent = mode === 'auto' ? '◐' : (mode === 'light' ? '☀' : '☾');
      btn.title = '主题：' + (mode === 'auto' ? '跟随系统' : (mode === 'light' ? '亮色' : '暗色')) + '（点击切换）';
    }
  }

  function cycleTheme() {
    const order = ['auto', 'light', 'dark'];
    const next = order[(order.indexOf(themeMode()) + 1) % 3];
    try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* 忽略 */ }
    applyTheme();
    toast('主题：' + (next === 'auto' ? '跟随系统' : (next === 'light' ? '亮色' : '暗色')));
  }

  if (window.matchMedia) {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', applyTheme);
    else if (mq.addListener) mq.addListener(applyTheme);
  }

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
  let detailId = null;   // 详情浮层当前展示的卡片

  function bindGrid() {
    $('#grid').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (btn) {
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
        return;
      }
      /* 点卡任意非按钮区域 → 单卡聚焦详情 */
      const cardEl = e.target.closest('.card');
      if (cardEl && cardEl.getAttribute('data-id')) openCardDetail(cardEl.getAttribute('data-id'));
    });
  }

  function openCardDetail(id) {
    const c = store.data.cards.find((x) => x.id === id);
    if (!c) return;
    detailId = id;
    $('#card-sheet').innerHTML = cardDetailHTML(c);
    openModal('#modal-card');
  }

  function cardDetailHTML(c) {
    const tags = (c.tags || []).map((t) => '<span class="tag">' + esc(t) + '</span>').join('');
    const lv = masteryLevel(c);
    const dot = '<span class="mdot lv' + lv + '" title="' + (lv === 0 ? '新卡' : '复习进度：第 ' + c.review.box + ' 阶') + '"></span>';
    const diff = c.difficulty
      ? '<span class="chip ' + (DIFF_CLASS[c.difficulty] || '') + '">' + esc(c.difficulty) + '</span>'
      : '';
    const codeBlock = c.code ? (
      '<div class="codewrap">' +
        '<div class="codebar">' +
          '<span class="dots"><i class="d r"></i><i class="d y"></i><i class="d g"></i></span>' +
          '<span class="langname">' + esc(LANG_LABEL[c.lang] || c.lang || '文本') + '</span>' +
          '<span class="spacer"></span>' +
          '<button class="mini" data-act="toggle" type="button">收起</button>' +
          '<button class="mini" data-act="copy" type="button">复制</button>' +
        '</div>' +
        '<pre class="code"><code>' + hl(c.code, c.lang) + '</code></pre>' +
      '</div>'
    ) : '';
    return (
      '<article class="detail-card" data-id="' + esc(c.id) + '">' +
        '<div class="chead"><h2 class="ctitle">' + esc(c.title) + '</h2>' + diff + '</div>' +
        '<div class="cmeta">' + dot + tags + '<span class="cdate">' + fmtDate(c.updatedAt) + '</span></div>' +
        (c.body ? '<p class="cbody open">' + esc(c.body) + '</p>' : '') +
        codeBlock +
        '<div class="cfoot detail-foot">' +
          '<button class="mini" data-act="edit" type="button">编辑</button>' +
          '<button class="mini danger" data-act="del" type="button">删除</button>' +
          '<button class="mini" data-close type="button">关闭</button>' +
        '</div>' +
      '</article>'
    );
  }

  function bindCardSheet() {
    $('#card-sheet').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const c = store.data.cards.find((x) => x.id === detailId);
      if (!c) return;
      const act = btn.getAttribute('data-act');
      if (act === 'copy') {
        const ok = await copyText(c.code || '');
        btn.textContent = ok ? '已复制 ✓' : '复制失败';
        setTimeout(() => { btn.textContent = '复制'; }, 1300);
      } else if (act === 'toggle') {
        const pre = $('.code', $('#card-sheet'));
        pre.classList.toggle('collapsed');
        btn.textContent = pre.classList.contains('collapsed') ? '展开' : '收起';
      } else if (act === 'edit') {
        closeModals();                       // 先收详情再进编辑
        openAddModal(c);
      } else if (act === 'del') {
        closeModals();
        delCard(c.id);
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

  function downloadFile(name, text, mime) {
    const blob = new Blob([text], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }

  function exportData() {
    const text = JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      cards: store.data.cards,
      deleted: store.data.deleted
    }, null, 2) + '\n';
    downloadFile('cards.json', text, 'application/json');
    toast('已导出 cards.json ✓');
  }

  function exportMarkdown() {
    const langMap = { cpp: 'cpp', c: 'c', python: 'python', java: 'java', javascript: 'javascript', go: 'go', plain: '' };
    const lines = ['# 题卡集导出（' + fmtNow() + '）', ''];
    const list = store.data.cards.slice().sort((x, y) => String(x.title).localeCompare(String(y.title), 'zh'));
    for (const c of list) {
      lines.push('## ' + c.title, '');
      const meta = [];
      if (c.difficulty) meta.push('难度：' + c.difficulty);
      if ((c.tags || []).length) meta.push('标签：' + c.tags.join('、'));
      if (c.review) meta.push('复习：第 ' + c.review.box + ' 阶');
      if (meta.length) lines.push('> ' + meta.join(' ｜ '), '');
      if (c.body) lines.push(c.body, '');
      if (c.code) lines.push('```' + (langMap[c.lang] !== undefined ? langMap[c.lang] : String(c.lang || '')), c.code, '```', '');
    }
    downloadFile('cards.md', lines.join('\n') + '\n', 'text/markdown');
    toast('已导出 cards.md ✓');
  }

  async function importJSON(file) {
    try {
      const text = await file.text();
      const imported = normalizeDeck(JSON.parse(text));
      if (!imported.cards.length) { toast('文件中没有有效卡片', true); return; }
      store.data = mergeData(store.data, imported);
      store.dirty = true;
      saveData();
      render();
      toast('已导入 ' + imported.cards.length + ' 张卡片（按更新时间合并）✓');
    } catch (err) {
      toast('导入失败：' + err.message, true);
    }
  }

  /* ---------- 复习模式 ---------- */
  const review = { active: false, queue: [], idx: 0, reveal: { body: false, code: false }, stats: { good: 0, ok: 0, bad: 0 }, badIds: [], undoStack: [] };
  /* reveal 揭示状态（用户自选顺序）：body/code 各自的方框是否已揭开；评分在全部可揭示内容揭开后可用 */
  function allRevealed(c) {
    return (!c.body || review.reveal.body) && (!c.code || review.reveal.code);
  }

  function updateReviewBadge() {
    const el = $('#review-count');
    if (!el) return;
    const s = reviewStats(store.data.cards, new Date().toISOString());
    const n = s.due + s.fresh;
    el.textContent = n > 99 ? '99+' : String(n);
    el.hidden = n === 0;
  }

  function openReview() {
    if (review.active && review.idx < review.queue.length) renderReviewCard();
    else renderReviewStart();
    openModal('#modal-review');
  }

  function renderReviewStart() {
    review.active = false;
    const s = reviewStats(store.data.cards, new Date().toISOString());
    const nothing = (s.due + s.fresh) === 0;
    $('#review-sheet').innerHTML =
      '<div class="review-scroll">' +
      '<h3 class="rtitle">复习</h3>' +
      '<div class="rstats">' +
        '<div class="rstat"><b>' + s.due + '</b><span>待复习</span></div>' +
        '<div class="rstat"><b>' + s.fresh + '</b><span>新卡</span></div>' +
        '<div class="rstat"><b>' + s.learning + '</b><span>学习中</span></div>' +
      '</div>' +
      '<button class="btn primary reveal-btn" data-ract="start" type="button"' + (nothing ? ' disabled' : '') + '>开始复习（到期 + 新卡）</button>' +
      '<button class="btn reveal-btn" data-ract="random" type="button" style="margin-top:10px">随机抽卡（自由复习）</button>' +
      '<p class="rkbd">间隔复习：认识 → 间隔逐级加长（1/2/4/7/15/30 天）· 模糊 / 不会 → 明天再见</p>' +
      '</div>';
  }

  function startReview(mode) {
    let q;
    if (mode === 'bad') q = review.badIds.map((id) => store.data.cards.find((c) => c.id === id)).filter(Boolean);
    else q = buildQueue(store.data.cards, mode, new Date().toISOString());
    if (!q.length) { toast('没有可复习的卡片 🎉'); return; }
    review.queue = q;
    review.idx = 0;
    review.reveal = { body: false, code: false };
    review.stats = { good: 0, ok: 0, bad: 0 };
    review.badIds = [];
    review.undoStack = [];
    review.active = true;
    renderReviewCard();
  }

  function renderReviewCard() {
    const c = review.queue[review.idx];
    const tags = (c.tags || []).map((t) => '<span class="tag">' + esc(t) + '</span>').join('');
    const diff = c.difficulty ? '<span class="chip ' + (DIFF_CLASS[c.difficulty] || '') + '">' + esc(c.difficulty) + '</span>' : '';
    const pct = Math.round((review.idx / review.queue.length) * 100);
    const head =
      '<div class="rcount"><span>第 ' + (review.idx + 1) + ' / ' + review.queue.length + ' 张</span><span>不会的卡评分后明天再见</span></div>' +
      '<div class="rprog"><div class="rprog-in" style="width:' + pct + '%"></div></div>' +
      '<div class="chead"><h3 class="rtitle">' + esc(c.title) + '</h3>' + diff + '</div>' +
      '<div class="cmeta"><span class="mdot lv' + masteryLevel(c) + '"></span>' + tags + '</div>';
    let content = '';
    if (c.body) {
      content += review.reveal.body
        ? '<p class="cbody open">' + esc(c.body) + '</p>'
        : '<div class="reveal-box" data-ract="reveal-body">' +
            '<div class="rv-skel"><i></i><i></i><i></i><i></i><i></i></div>' +
            '<span class="rv-label">👁 点击显示思路</span>' +
          '</div>';
    } else if (!review.reveal.body && !review.reveal.code) {
      content += '<div class="rhint">先自己在心里过一遍思路 ✍️</div>';
    }
    if (c.code) {
      content += review.reveal.code
        ? '<div class="codewrap"><div class="codebar"><span class="dots"><i class="d r"></i><i class="d y"></i><i class="d g"></i></span><span class="langname">' + esc(LANG_LABEL[c.lang] || c.lang || '文本') + '</span></div><pre class="code"><code>' + hl(c.code, c.lang) + '</code></pre></div>'
        : '<div class="reveal-box rv-code" data-ract="reveal-code">' +
            '<div class="rv-skel"><i></i><i></i><i></i><i></i><i></i></div>' +
            '<span class="rv-label">👁 点击显示答案</span>' +
          '</div>';
    }
    const undoBtn = review.undoStack.length
      ? '<button class="undo-btn" data-ract="undo" type="button">↩ 撤销上一次评分</button>'
      : '';
    const actions = allRevealed(c)
      ? '<div class="rate-row">' +
          '<button class="rate bad" data-rate="bad" type="button">不会<small>明天</small></button>' +
          '<button class="rate ok" data-rate="ok" type="button">模糊<small>明天</small></button>' +
          '<button class="rate good" data-rate="good" type="button">认识<small>' + RV_DAYS[Math.min(6, ((c.review && c.review.box) || 0) + 1) - 1] + '天后</small></button>' +
        '</div>'
      : '<button class="btn reveal-btn" data-ract="skip" type="button">跳过这张（→）</button>';
    const kbd = '<p class="rkbd">快捷键：空格 显示思路/答案 · 1 / 2 / 3 评分 · → 跳过 · Backspace 撤销 · Esc 退出</p>';
    $('#review-sheet').innerHTML =
      '<div class="review-scroll">' + head + content + '</div>' +
      '<div class="review-actions">' + undoBtn + actions + kbd + '</div>';
  }

  function advanceReveal() {
    if (!review.active || review.idx >= review.queue.length) return;
    const c = review.queue[review.idx];
    if (c.body && !review.reveal.body) { review.reveal.body = true; renderReviewCard(); return; }   // 空格默认顺序:先思路
    if (c.code && !review.reveal.code) { review.reveal.code = true; renderReviewCard(); return; }
  }

  function rateReview(rate) {
    if (!review.active || review.idx >= review.queue.length) return;
    if (!allRevealed(review.queue[review.idx])) return;   // 未全部揭示不可评分
    const c = review.queue[review.idx];
    review.undoStack.push({ id: c.id, idx: review.idx, prevReview: c.review ? { box: c.review.box, due: c.review.due, last: c.review.last } : null, rate: rate });
    c.review = nextReview(c.review, rate, Date.now());
    review.stats[rate]++;
    if (rate === 'bad') review.badIds.push(c.id);
    store.dirty = true;
    saveData();
    review.idx++;
    review.reveal = { body: false, code: false };
    updateReviewBadge();
    if (review.idx >= review.queue.length) renderReviewDone();
    else renderReviewCard();
  }

  function undoReview() {
    if (!review.active || !review.undoStack.length) return;
    const e = review.undoStack.pop();
    const c = store.data.cards.find((x) => x.id === e.id);
    if (c) {
      if (e.prevReview) c.review = e.prevReview;
      else delete c.review;
    }
    review.stats[e.rate]--;
    if (e.rate === 'bad') {
      const bi = review.badIds.lastIndexOf(e.id);   // 重刷轮内可能多条，只摘本次
      if (bi !== -1) review.badIds.splice(bi, 1);
    }
    review.idx = e.idx;          // 用入栈时下标定位（跳过卡不进栈，栈长≠idx）
    review.reveal = { body: true, code: true };   // 评分时必然全揭示 → 恢复到该状态
    saveData();
    updateReviewBadge();
    renderReviewCard();
  }

  function skipReview() {
    if (review.idx >= review.queue.length) return;
    review.idx++;
    review.reveal = { body: false, code: false };
    if (review.idx >= review.queue.length) renderReviewDone();
    else renderReviewCard();
  }

  function renderReviewDone() {
    const s = review.stats;
    $('#review-sheet').innerHTML =
      '<div class="review-scroll">' +
      '<h3 class="rtitle" style="text-align:center">本轮完成 🎉</h3>' +
      '<div class="rstats">' +
        '<div class="rstat"><b>' + s.good + '</b><span>认识</span></div>' +
        '<div class="rstat"><b>' + s.ok + '</b><span>模糊</span></div>' +
        '<div class="rstat"><b>' + s.bad + '</b><span>不会</span></div>' +
      '</div>' +
      (review.badIds.length ? '<button class="btn primary reveal-btn" data-ract="redo" type="button">重刷不会的（' + review.badIds.length + ' 张）</button>' : '') +
      (review.undoStack.length ? '<button class="btn reveal-btn" data-ract="undo" type="button" style="margin-top:10px">↩ 撤销上一次评分</button>' : '') +
      '<button class="btn reveal-btn" data-ract="done" type="button" style="margin-top:10px">完成</button>' +
      '</div>';
    render();
  }

  /* 会话结束时统一推送一次：避免复习中每评一张就产生一个提交 */
  function endReviewSession() {
    if (!review.active) return;
    review.active = false;
    review.undoStack = [];
    const cfg = GH.cfg();
    if (store.dirty && cfg && cfg.token && cfg.owner && cfg.repo) syncAll(false);
  }

  function onReviewClick(e) {
    const el = e.target.closest('[data-rate],[data-ract]');
    if (!el) return;
    if (el.dataset.rate) { rateReview(el.dataset.rate); return; }
    const act = el.dataset.ract;
    if (act === 'start') startReview('due');
    else if (act === 'random') startReview('random');
    else if (act === 'reveal-body') { review.reveal.body = true; renderReviewCard(); }
    else if (act === 'reveal-code') { review.reveal.code = true; renderReviewCard(); }
    else if (act === 'skip') skipReview();
    else if (act === 'undo') undoReview();
    else if (act === 'redo') startReview('bad');
    else if (act === 'done') { endReviewSession(); closeModals(); }
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
        /* 内容与远端一致时不推送，避免每次打开页面都产生空提交 */
        const unchanged = !!remote && fingerprint(merged) === fingerprint(remoteData);
        if (!unchanged) {
          const text = JSON.stringify({
            version: 1,
            updatedAt: new Date().toISOString(),
            cards: merged.cards,
            deleted: merged.deleted
          }, null, 2) + '\n';
          await GH.putFile(cfg, text, remote ? remote.sha : undefined,
            'sync: ' + merged.cards.length + ' 张卡片 @ ' + fmtNow());
        }
        /* 与「当前」本地数据再合并一次：同步期间的新增 / 编辑 / 删除不会被覆盖。
           当前本地的未编辑示例卡同样剔除，保证状态收敛、不会反复触发补传 */
        const current = JSON.parse(JSON.stringify(store.data));
        if (remote) current.cards = current.cards.filter((c) => !isPristineSeed(c));
        store.data = mergeData(merged, current);
        const midEdits = !unchanged && fingerprint(store.data) !== fingerprint(merged);
        saveData();
        store.dirty = midEdits;
        needResync = midEdits;   // 同步期间又有改动 → 追加一轮同步把它们推上去
        render();
        if (!silent) toast(unchanged ? '已与 GitHub 一致 ✓' : '已与 GitHub 同步 ✓');
      } else {
        const current = JSON.parse(JSON.stringify(store.data));
        if (remote) current.cards = current.cards.filter((c) => !isPristineSeed(c));
        store.data = mergeData(merged, current);
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
    $('#btn-review').addEventListener('click', openReview);
    $('#btn-sync').addEventListener('click', () => syncAll(false));
    $('#btn-theme').addEventListener('click', cycleTheme);
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
    bindCardSheet();

    $('#form-add').addEventListener('submit', (e) => { e.preventDefault(); saveCard(); });
    $('#form-settings').addEventListener('submit', (e) => { e.preventDefault(); saveSettings(); });
    $('#btn-test').addEventListener('click', testConn);
    $('#btn-export').addEventListener('click', exportData);
    $('#btn-export-md').addEventListener('click', exportMarkdown);
    $('#btn-import').addEventListener('click', () => $('#file-import').click());
    $('#file-import').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (f) importJSON(f);
    });
    $('#btn-clear').addEventListener('click', clearLocal);
    $('#review-sheet').addEventListener('click', onReviewClick);

    $$('[data-close]').forEach((b) => b.addEventListener('click', closeModals));
    $$('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) closeModals(); }));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { endReviewSession(); closeModals(); return; }
      if (!$('#modal-review').classList.contains('show')) return;
      if (!review.active) {                                   // 起始页：回车直接开始
        if (e.key === 'Enter') { e.preventDefault(); startReview('due'); }
        return;
      }
      if (review.active && e.key === 'Backspace') { e.preventDefault(); undoReview(); return; }
      if (review.active && (e.key === ' ' || e.key === 'Enter') && !allRevealed(review.queue[review.idx])) { e.preventDefault(); advanceReveal(); return; }
      if (review.active && (e.key === '1' || e.key === '2' || e.key === '3')) {
        const c = review.queue[review.idx];
        if (!allRevealed(c)) return;                        // 未全揭示数字键无效
        e.preventDefault();
        rateReview(['good', 'ok', 'bad'][Number(e.key) - 1]);
        return;
      }
      if (e.key === 'ArrowRight') { e.preventDefault(); skipReview(); }   // 跳过不限是否已显示答案
    });
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
      /* 无缓存 → 立即用示例数据渲染（保证首屏速度）；
         若配置了仓库，随后的自动同步会拉取远端并剔除未编辑的示例卡 */
      let seed = null;
      try {
        const res = await fetch('data/cards.json', { cache: 'no-store' });
        if (res.ok) seed = await res.json();
      } catch (e) { /* file:// 下 fetch 受限，走内置兜底数据 */ }
      if (!seed && window.SEED) seed = window.SEED;
      store.data = normalizeDeck(seed);
      saveData();
    }

    applyTheme();
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
