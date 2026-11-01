/* ============================================================
   Tools-X · Todo 网页悬浮面板（content script，所有 http/https 页面）
   - 右下角悬浮按钮 + 轻量任务面板
   - 直接读写 chrome.storage.local 的 toolsx.todo.* key，与工具页实时同步
   - Shadow DOM 隔离样式，不污染宿主页面
============================================================ */
(function () {
  'use strict';
  if (window.__toolsxTodoWidget) return;
  window.__toolsxTodoWidget = true;

  const TASKS_KEY = 'toolsx.todo.tasks';
  const SETTINGS_KEY = 'toolsx.todo.settings';
  const PREFS_KEY = 'toolsx.prefs';

  let tasks = [];
  let settings = { widget: true };
  let prefs = {};
  let tab = 'today';
  let host = null;
  let shadow = null;
  let panelOpen = false;
  let dragStart = null;
  let dragMoved = false;
  let suppressClick = false;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => ymd(new Date());

  function norm(t) {
    if (!t || typeof t !== 'object') return null;
    return Object.assign({}, t, {
      id: String(t.id || uid()),
      title: String(t.title == null ? '' : t.title).trim() || '未命名任务',
      note: String(t.note || ''),
      due: String(t.due || ''),
      dueTime: String(t.dueTime || ''),
      remind: String(t.remind || 'none'),
      remindAt: Number(t.remindAt) || 0,
      notifiedFor: Number(t.notifiedFor) || 0,
      myDay: !!t.myDay,
      important: !!t.important,
      done: !!t.done,
      steps: Array.isArray(t.steps) ? t.steps : [],
      createdAt: Number(t.createdAt) || Date.now(),
      completedAt: Number(t.completedAt) || 0
    });
  }
  function normList(v) {
    return (Array.isArray(v) ? v : []).map(norm).filter(Boolean);
  }
  function hasStorage() {
    try { return !!(chrome && chrome.storage && chrome.storage.local); } catch (e) { return false; }
  }
  function themeName() {
    if (prefs && prefs.theme) return prefs.theme;
    try { return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (e) { return 'light'; }
  }

  function badgeCount() {
    return tasks.filter((t) => !t.done && inToday(t)).length;
  }
  function inToday(t) {
    if (!t.due) return !!t.myDay;
    return t.due <= today();
  }
  function dueLabel(t) {
    if (!t.due) return '';
    const td = today();
    if (t.due < td) {
      const d = new Date(t.due + 'T00:00:00');
      return '逾期 · ' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
    }
    if (t.due === td) return t.dueTime || '今天';
    const tm = new Date(); tm.setDate(tm.getDate() + 1);
    if (t.due === ymd(tm)) return t.dueTime ? '明天 ' + t.dueTime : '明天';
    const d = new Date(t.due + 'T00:00:00');
    return (d.getMonth() + 1) + '月' + d.getDate() + '日' + (t.dueTime ? ' ' + t.dueTime : '');
  }
  function sortTasks(a, b) {
    if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
    if (a.due && !b.due) return -1;
    if (!a.due && b.due) return 1;
    if (a.important !== b.important) return a.important ? -1 : 1;
    return b.createdAt - a.createdAt;
  }
  function visibleTasks() {
    let list = tasks.filter((t) => !t.done);
    if (tab === 'today') list = list.filter(inToday);
    return list.sort(sortTasks);
  }
  function dateText() {
    const d = new Date();
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 · ' + ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  }

  /* ---------- 样式（Shadow DOM 内自包含） ---------- */
  const CSS = `
:host{all:initial;--tx-paper:#FAF9F5;--tx-panel:#FFFFFF;--tx-ink:#1F1E1D;--tx-ink2:#55524B;--tx-ink3:#8B867C;
  --tx-line:#E7E2D6;--tx-line2:#DDD6C6;--tx-accent:#C96442;--tx-accent-deep:#A84E30;--tx-wash:#FBF3EC;
  --tx-green:#6E8B5E;--tx-shadow:0 4px 16px rgba(31,30,29,.08),0 16px 48px rgba(31,30,29,.14);
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif}
:host([data-theme="dark"]){--tx-paper:#211F1E;--tx-panel:#2E2B29;--tx-ink:#EDEAE2;--tx-ink2:#B5AFA2;
  --tx-ink3:#8A8478;--tx-line:#3A3733;--tx-line2:#4C4741;--tx-accent:#D87A56;--tx-accent-deep:#E2926E;
  --tx-wash:#352A22;--tx-green:#93B17F;--tx-shadow:0 4px 16px rgba(0,0,0,.4),0 16px 48px rgba(0,0,0,.45)}
*{box-sizing:border-box;margin:0;padding:0}
button{font:inherit;cursor:pointer;border:none;background:none;color:inherit}
input{font:inherit}
.txw-launch{position:fixed;right:22px;top:22px;width:52px;height:52px;border-radius:50%;background:var(--tx-accent);
  color:#fff;display:grid;place-items:center;box-shadow:0 6px 20px rgba(31,30,29,.24);border:2px solid rgba(255,255,255,.16);
  transition:transform .18s cubic-bezier(.22,.8,.32,1),background .15s,box-shadow .18s;z-index:2147483000;pointer-events:auto;opacity:1;
  cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}
.txw-launch:hover{transform:translateY(-2px) scale(1.03);background:var(--tx-accent-deep);box-shadow:0 10px 26px rgba(31,30,29,.28)}
.txw-launch:active{transform:scale(.97)}
.txw-launch.dragging{transition:none;cursor:grabbing;transform:none;box-shadow:0 10px 26px rgba(31,30,29,.3)}
.txw-launch svg{width:23px;height:23px}
.txw-launch.hide{opacity:0;pointer-events:none;transform:scale(.8)}
.txw-badge{position:absolute;top:-4px;right:-4px;min-width:19px;height:19px;padding:0 5px;border-radius:99px;
  background:var(--tx-ink);color:var(--tx-paper);font-size:10.5px;font-weight:700;display:none;place-items:center;line-height:19px;text-align:center}
.txw-badge.show{display:grid}
.txw-panel{position:fixed;right:22px;top:86px;width:338px;max-width:calc(100vw - 24px);max-height:min(62vh,470px);
  background:var(--tx-panel);border:1px solid var(--tx-line);border-radius:16px;box-shadow:var(--tx-shadow);
  display:flex;flex-direction:column;overflow:hidden;z-index:2147483001;pointer-events:auto;
  opacity:0;visibility:hidden;transform:translateY(10px) scale(.98);transform-origin:bottom right;
  transition:opacity .18s ease,transform .22s cubic-bezier(.22,.8,.32,1),visibility .18s}
.txw-panel.open{opacity:1;visibility:visible;transform:none}
.txw-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 14px 10px;border-bottom:1px solid var(--tx-line)}
.txw-brand{display:flex;align-items:center;gap:8px;min-width:0}
.txw-dot{width:8px;height:8px;border-radius:50%;background:var(--tx-accent);flex-shrink:0}
.txw-brand b{font-size:14px;font-weight:700;color:var(--tx-ink);letter-spacing:.01em}
.txw-sub{font-size:11px;color:var(--tx-ink3);white-space:nowrap}
.txw-head-acts{display:flex;gap:2px;flex-shrink:0}
.txw-ico{width:28px;height:28px;border-radius:7px;display:grid;place-items:center;color:var(--tx-ink3);transition:background .14s,color .14s}
.txw-ico:hover{background:var(--tx-paper);color:var(--tx-ink)}
.txw-ico svg{width:15px;height:15px}
.txw-tabs{display:flex;align-items:center;gap:2px;padding:8px 12px;background:var(--tx-paper)}
.txw-tabs button{font-size:11.5px;font-weight:600;padding:4px 11px;border-radius:99px;color:var(--tx-ink3);transition:all .14s}
.txw-tabs button.on{background:var(--tx-panel);color:var(--tx-ink);box-shadow:0 1px 2px rgba(31,30,29,.07)}
.txw-tabs .txw-count{margin-left:auto;font-size:10.5px;color:var(--tx-ink3);font-family:ui-monospace,Menlo,monospace}
.txw-add{display:flex;align-items:center;gap:8px;margin:4px 12px 8px;padding:7px 10px;border:1px solid var(--tx-line);border-radius:9px;background:var(--tx-paper);transition:border-color .15s}
.txw-add:focus-within{border-color:var(--tx-accent);background:var(--tx-panel)}
.txw-add span{width:16px;height:16px;display:grid;place-items:center;color:var(--tx-accent);font-size:16px;font-weight:700;line-height:1;flex-shrink:0}
.txw-add input{flex:1;min-width:0;border:none;outline:none;background:transparent;font-size:12.5px;color:var(--tx-ink);padding:1px 0}
.txw-add input::placeholder{color:var(--tx-ink3)}
.txw-list{flex:1;min-height:60px;overflow-y:auto;padding:2px 8px 8px}
.txw-list::-webkit-scrollbar{width:8px}
.txw-list::-webkit-scrollbar-thumb{background:var(--tx-line2);border-radius:8px}
.txw-item{display:flex;align-items:flex-start;gap:9px;padding:8px 7px;border-radius:8px;transition:background .13s}
.txw-item:hover{background:var(--tx-paper)}
.txw-check{width:19px;height:19px;flex-shrink:0;margin-top:1px;border-radius:50%;border:1.5px solid var(--tx-line2);display:grid;place-items:center;color:transparent;transition:border-color .15s,background .15s}
.txw-check:hover{border-color:var(--tx-accent);color:var(--tx-accent)}
.txw-check svg{width:10px;height:10px}
.txw-item-main{flex:1;min-width:0}
.txw-title{font-size:12.5px;line-height:1.45;color:var(--tx-ink);word-break:break-word;cursor:pointer}
.txw-meta{display:flex;align-items:center;gap:6px;margin-top:1px;font-size:10.5px;color:var(--tx-ink3)}
.txw-meta.over{color:var(--tx-accent-deep)}
.txw-meta svg{width:11px;height:11px}
.txw-empty{padding:30px 16px;text-align:center;color:var(--tx-ink3);font-size:12px;line-height:1.7}
.txw-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 14px 10px;border-top:1px solid var(--tx-line);font-size:10.5px;color:var(--tx-ink3)}
.txw-foot button{font-size:10.5px;color:var(--tx-ink3);padding:2px 4px;border-radius:4px;transition:color .14s,background .14s}
.txw-foot button:hover{color:var(--tx-accent-deep);background:var(--tx-wash)}
@media (max-width:480px){.txw-panel{right:12px;top:80px;width:calc(100vw - 24px)}.txw-launch{right:16px;top:16px}}
`;

  const ICON_LAUNCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>';
  const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  const ICON_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="21" y1="3" x2="10" y2="14"/></svg>';
  const ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  const ICON_CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>';

  function build() {
    host = document.createElement('div');
    host.id = 'toolsx-todo-widget';
    host.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;z-index:2147483000;pointer-events:none';
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>${CSS}</style>
      <button class="txw-launch" id="txwLaunch" type="button" aria-label="打开 Tools-X 待办" title="Tools-X 待办">${ICON_LAUNCH}<span class="txw-badge" id="txwBadge"></span></button>
      <div class="txw-panel" id="txwPanel" role="dialog" aria-label="Tools-X 待办">
        <div class="txw-head">
          <div class="txw-brand"><span class="txw-dot"></span><b>Todo</b><span class="txw-sub" id="txwDate"></span></div>
          <div class="txw-head-acts">
            <button class="txw-ico" id="txwOpen" type="button" title="打开完整页面">${ICON_OPEN}</button>
            <button class="txw-ico" id="txwClose" type="button" title="收起">${ICON_CLOSE}</button>
          </div>
        </div>
        <div class="txw-tabs">
          <button type="button" data-tab="today" class="on">今天</button>
          <button type="button" data-tab="all">全部</button>
          <span class="txw-count" id="txwCount"></span>
        </div>
        <div class="txw-add"><span>+</span><input id="txwAdd" type="text" placeholder="添加任务，按 Enter" spellcheck="false"></div>
        <div class="txw-list" id="txwList"></div>
        <div class="txw-foot"><span>与 Tools-X 实时同步</span><button type="button" id="txwHide">隐藏悬浮按钮</button></div>
      </div>`;
    document.documentElement.appendChild(host);

    shadow.getElementById('txwLaunch').addEventListener('click', () => {
      if (suppressClick) return;
      togglePanel();
    });
    shadow.getElementById('txwLaunch').addEventListener('pointerdown', onDragStart);
    shadow.getElementById('txwClose').addEventListener('click', () => setPanel(false));
    shadow.getElementById('txwOpen').addEventListener('click', openFull);
    shadow.getElementById('txwAdd').addEventListener('keydown', addKey);
    shadow.getElementById('txwHide').addEventListener('click', hideWidget);
    shadow.querySelectorAll('.txw-tabs button').forEach((b) => {
      b.addEventListener('click', () => {
        tab = b.dataset.tab === 'all' ? 'all' : 'today';
        shadow.querySelectorAll('.txw-tabs button').forEach((x) => x.classList.toggle('on', x === b));
        render();
      });
    });
    shadow.getElementById('txwList').addEventListener('click', listClick);
    document.addEventListener('pointerdown', (e) => {
      if (!panelOpen) return;
      const path = e.composedPath ? e.composedPath() : [];
      if (!path.includes(host)) setPanel(false);
    }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panelOpen) setPanel(false); }, true);

    applyTheme();
    applyPos();
    applyVisible();
    render();
    window.addEventListener('resize', onViewportChange);
  }

  function applyTheme() {
    if (host) host.dataset.theme = themeName();
  }
  function applyVisible() {
    if (!shadow) return;
    const launch = shadow.getElementById('txwLaunch');
    const on = settings.widget !== false;
    if (launch) launch.classList.toggle('hide', !on);
    if (!on) setPanel(false);
  }

  /* ---------- 位置：默认右上角，可拖动并记忆 ---------- */
  function applyPos() {
    if (!shadow || dragStart) return;
    const btn = shadow.getElementById('txwLaunch');
    if (!btn) return;
    const pos = settings.widgetPos;
    if (!pos || typeof pos.left !== 'number' || typeof pos.top !== 'number') {
      btn.style.left = '';
      btn.style.top = '';
      btn.style.right = '';
      btn.style.bottom = '';
      return;
    }
    const bw = btn.offsetWidth || 52, bh = btn.offsetHeight || 52;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    const left = Math.min(Math.max(8, pos.left), Math.max(8, vw - bw - 8));
    const top = Math.min(Math.max(8, pos.top), Math.max(8, vh - bh - 8));
    btn.style.left = left + 'px';
    btn.style.top = top + 'px';
    btn.style.right = 'auto';
    btn.style.bottom = 'auto';
  }
  function saveSettings() {
    if (!hasStorage()) return;
    try { chrome.storage.local.set({ [SETTINGS_KEY]: settings }); } catch (e) {}
  }
  function positionPanel() {
    if (!shadow || !panelOpen) return;
    const btn = shadow.getElementById('txwLaunch');
    const panel = shadow.getElementById('txwPanel');
    if (!btn || !panel) return;
    const r = btn.getBoundingClientRect();
    const pw = panel.offsetWidth || 338;
    const ph = panel.offsetHeight || 400;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    let left = r.right - pw;
    if (left < 8) left = Math.min(r.left, vw - pw - 8);
    left = Math.max(8, Math.min(left, Math.max(8, vw - pw - 8)));
    let top = r.bottom + 10;
    let origin = 'top right';
    if (top + ph > vh - 8) {
      top = r.top - ph - 10;
      origin = 'bottom right';
    }
    if (top < 8) top = Math.max(8, Math.min(vh - ph - 8, r.bottom + 10));
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.transformOrigin = origin;
  }
  function onViewportChange() {
    if (dragStart) return;
    applyPos();
    positionPanel();
  }
  function onDragStart(e) {
    if (e.button !== 0) return;
    const btn = e.currentTarget;
    const r = btn.getBoundingClientRect();
    dragStart = { px: e.clientX, py: e.clientY, left: r.left, top: r.top, btn: btn };
    dragMoved = false;
    try { btn.setPointerCapture(e.pointerId); } catch (err) {}
    btn.addEventListener('pointermove', onDragMove);
    btn.addEventListener('pointerup', onDragEnd);
    btn.addEventListener('pointercancel', onDragEnd);
  }
  function onDragMove(e) {
    if (!dragStart) return;
    const dx = e.clientX - dragStart.px;
    const dy = e.clientY - dragStart.py;
    if (!dragMoved && Math.abs(dx) + Math.abs(dy) < 4) return;
    if (!dragMoved) {
      dragMoved = true;
      dragStart.btn.classList.add('dragging');
      setPanel(false);
    }
    const bw = dragStart.btn.offsetWidth || 52, bh = dragStart.btn.offsetHeight || 52;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    const left = Math.min(Math.max(8, dragStart.left + dx), Math.max(8, vw - bw - 8));
    const top = Math.min(Math.max(8, dragStart.top + dy), Math.max(8, vh - bh - 8));
    dragStart.btn.style.left = left + 'px';
    dragStart.btn.style.top = top + 'px';
    dragStart.btn.style.right = 'auto';
    dragStart.btn.style.bottom = 'auto';
  }
  function onDragEnd(e) {
    if (!dragStart) return;
    const btn = dragStart.btn;
    btn.removeEventListener('pointermove', onDragMove);
    btn.removeEventListener('pointerup', onDragEnd);
    btn.removeEventListener('pointercancel', onDragEnd);
    btn.classList.remove('dragging');
    try { btn.releasePointerCapture(e.pointerId); } catch (err) {}
    if (dragMoved) {
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 350);
      const r = btn.getBoundingClientRect();
      settings.widgetPos = { left: Math.round(r.left), top: Math.round(r.top) };
      saveSettings();
      positionPanel();
    }
    dragStart = null;
    dragMoved = false;
  }
  function setPanel(open) {
    panelOpen = !!open;
    const panel = shadow && shadow.getElementById('txwPanel');
    if (!panel) return;
    if (panelOpen) positionPanel();
    panel.classList.toggle('open', panelOpen);
  }
  function togglePanel() {
    if (settings.widget === false) return;
    setPanel(!panelOpen);
    if (panelOpen) {
      render();
      const input = shadow.getElementById('txwAdd');
      if (input) setTimeout(() => input.focus(), 60);
    }
  }
  function render() {
    if (!shadow) return;
    const list = visibleTasks();
    const badge = shadow.getElementById('txwBadge');
    const n = badgeCount();
    if (badge) {
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.classList.toggle('show', settings.widget !== false && n > 0);
    }
    const date = shadow.getElementById('txwDate');
    if (date) date.textContent = dateText();
    const cnt = shadow.getElementById('txwCount');
    if (cnt) cnt.textContent = list.length ? list.length + ' 项' : '';
    const box = shadow.getElementById('txwList');
    if (!box) return;
    if (!list.length) {
      box.innerHTML = `<div class="txw-empty">${tab === 'today' ? '今天没有待办<br>享受空白的一天' : '没有未完成的任务'}</div>`;
      return;
    }
    box.innerHTML = list.map((t) => {
      const due = dueLabel(t);
      const over = t.due && t.due < today();
      return `<div class="txw-item" data-id="${esc(t.id)}">
        <button class="txw-check" type="button" title="完成" data-check="${esc(t.id)}">${ICON_CHECK}</button>
        <div class="txw-item-main">
          <div class="txw-title" data-open="${esc(t.id)}">${esc(t.title)}</div>
          ${due ? `<div class="txw-meta ${over ? 'over' : ''}">${ICON_CAL}${esc(due)}</div>` : ''}
        </div>
      </div>`;
    }).join('');
  }

  function saveTasks() {
    if (!hasStorage()) return;
    try { chrome.storage.local.set({ [TASKS_KEY]: tasks }); } catch (e) {}
  }
  function addKey(e) {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    const v = e.target.value.trim();
    if (!v) return;
    e.target.value = '';
    tasks.unshift(norm({
      id: uid(), title: v, createdAt: Date.now(),
      myDay: tab === 'today', remind: 'none'
    }));
    saveTasks();
    render();
  }
  function listClick(e) {
    const check = e.target.closest('[data-check]');
    if (check) {
      e.stopPropagation();
      const id = check.dataset.check;
      const t = tasks.find((x) => x.id === id);
      if (!t) return;
      t.done = !t.done;
      t.completedAt = t.done ? Date.now() : 0;
      saveTasks();
      render();
      return;
    }
    const open = e.target.closest('[data-open]');
    if (open) openFull();
  }
  function hideWidget() {
    settings.widget = false;
    if (hasStorage()) { try { chrome.storage.local.set({ [SETTINGS_KEY]: { widget: false } }); } catch (e) {} }
    applyVisible();
  }
  function openFull() {
    try { chrome.runtime.sendMessage({ type: 'TOOLSX_OPEN_TODO' }); } catch (e) {}
  }

  async function load() {
    if (!hasStorage()) return;
    try {
      const o = await chrome.storage.local.get([TASKS_KEY, SETTINGS_KEY, PREFS_KEY]);
      tasks = normList(o[TASKS_KEY]);
      settings = Object.assign({ widget: true }, o[SETTINGS_KEY] && typeof o[SETTINGS_KEY] === 'object' ? o[SETTINGS_KEY] : {});
      prefs = o[PREFS_KEY] && typeof o[PREFS_KEY] === 'object' ? o[PREFS_KEY] : {};
    } catch (e) {}
  }

  function watchStorage() {
    if (!hasStorage()) return;
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[TASKS_KEY]) tasks = normList(changes[TASKS_KEY].newValue);
        if (changes[SETTINGS_KEY]) settings = Object.assign({ widget: true }, changes[SETTINGS_KEY].newValue || {});
        if (changes[PREFS_KEY]) prefs = changes[PREFS_KEY].newValue || {};
        applyTheme();
        applyPos();
        if (panelOpen) positionPanel();
        applyVisible();
        render();
      });
    } catch (e) {}
  }

  function start() {
    load().then(() => {
      build();
      watchStorage();
      try {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
          if (!prefs.theme) applyTheme();
        });
      } catch (e) {}
    });
  }

  if (document.documentElement) start();
  else window.addEventListener('DOMContentLoaded', start, { once: true });
})();
