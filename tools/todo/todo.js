/* ============================================================
   Tools-X · Todo（任务清单 / 截止日期 / 提醒 / 网页悬浮面板）
   数据：STORE.todoIndex / todoSession / todoSettings
   提醒：扩展内由 background.js 发系统通知；直接打开页面时退回权限内的 Notification
============================================================ */
const TODO_REMIND = [
  ['none', '不提醒'],
  ['0', '到期时'],
  ['5', '提前 5 分钟'],
  ['15', '提前 15 分钟'],
  ['30', '提前 30 分钟'],
  ['60', '提前 1 小时'],
  ['1440', '提前 1 天']
];
const ICO_TODO_CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>';
const ICO_TODO_BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>';
const ICO_TODO_NOTE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>';
const ICO_TODO_STEP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>';
const ICO_TODO_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const ICO_TODO_STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 3 15 9 21 10 17 15 18 21 12 18 6 21 7 15 3 10 9 9"/></svg>';
const ICO_TODO_STAR_ON = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="12 3 15 9 21 10 17 15 18 21 12 18 6 21 7 15 3 10 9 9"/></svg>';
const ICO_TODO_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
const ICO_TODO_LIST = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/></svg>';
const ICO_TODO_DONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="8 12 11 15 16 9"/></svg>';

const TODO_LISTS = [
  { key: 'myday', label: '我的一天', icon: ICO_TODO_SUN },
  { key: 'planned', label: '计划', icon: ICO_TODO_CAL },
  { key: 'important', label: '重要', icon: ICO_TODO_STAR },
  { key: 'all', label: '全部', icon: ICO_TODO_LIST },
  { key: 'completed', label: '已完成', icon: ICO_TODO_DONE }
];
const TODO_GROUPS = { overdue: '已逾期', today: '今天', tomorrow: '明天', later: '更晚', nodate: '无日期' };

let todoTasks = [], todoFilter = 'myday', todoSel = null;
let todoSaveT = 0, todoSessT = 0, todoSettings = { widget: true };

/* ---------- 数据归一化 ---------- */
function todoNorm(t) {
  if (!t || typeof t !== 'object') return null;
  const id = String(t.id || uid());
  const remind = TODO_REMIND.some((r) => r[0] === String(t.remind)) ? String(t.remind) : 'none';
  const out = {
    id: id,
    title: String(t.title == null ? '' : t.title).trim() || '未命名任务',
    note: String(t.note || ''),
    due: /^\d{4}-\d{2}-\d{2}$/.test(String(t.due || '')) ? String(t.due) : '',
    dueTime: /^\d{2}:\d{2}$/.test(String(t.dueTime || '')) ? String(t.dueTime) : '',
    remind: remind,
    remindAt: 0,
    notifiedFor: Number(t.notifiedFor) || 0,
    myDay: !!t.myDay,
    important: !!t.important,
    done: !!t.done,
    steps: (Array.isArray(t.steps) ? t.steps : []).map((s) => ({
      id: String((s && s.id) || uid()),
      text: String((s && s.text) || ''),
      done: !!(s && s.done)
    })).filter((s) => s.text),
    createdAt: Number(t.createdAt) || Date.now(),
    completedAt: Number(t.completedAt) || 0
  };
  out.remindAt = todoRemindAt(out);
  return out;
}
function todoCur() { return todoSel ? todoTasks.find((t) => t.id === todoSel) || null : null; }

/* ---------- 时间 / 提醒计算 ---------- */
function todoYmd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function todoTomorrowYmd() { const d = new Date(); d.setDate(d.getDate() + 1); return todoYmd(d); }
function todoDueTs(t) {
  if (!t.due) return 0;
  const p = t.due.split('-').map(Number);
  const q = (t.dueTime || '09:00').split(':').map(Number);
  const d = new Date(p[0], (p[1] || 1) - 1, p[2] || 1, q[0] || 0, q[1] || 0, 0, 0);
  const ts = d.getTime();
  return isNaN(ts) ? 0 : ts;
}
function todoRemindAt(t) {
  if (t.remind === 'none') return 0;
  const base = todoDueTs(t);
  if (!base) return 0;
  return base - (Number(t.remind) || 0) * 60000;
}
function todoRecompute(t) { t.remindAt = todoRemindAt(t); }
function todoOverdue(t) {
  if (!t.due) return false;
  const today = todoYmd(new Date());
  if (t.due < today) return true;
  if (t.due > today) return false;
  if (!t.dueTime) return false;
  const now = new Date(), p = (n) => String(n).padStart(2, '0');
  return p(now.getHours()) + ':' + p(now.getMinutes()) > t.dueTime;
}
function todoDueLabel(t) {
  if (!t.due) return '';
  const today = todoYmd(new Date()), tomorrow = todoTomorrowYmd();
  let s;
  if (t.due === today) s = '今天';
  else if (t.due === tomorrow) s = '明天';
  else {
    const d = new Date(t.due + 'T00:00:00');
    const y = d.getFullYear() === new Date().getFullYear() ? '' : d.getFullYear() + '年';
    s = y + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  if (t.dueTime) s += ' ' + t.dueTime;
  return s;
}
function todoRemindLabel(t) {
  const r = TODO_REMIND.find((x) => x[0] === t.remind);
  return r ? r[1] : '不提醒';
}
function todoRemindHint(t) {
  if (t.remind === 'none') return '选择提醒后，会通过浏览器系统通知提醒。';
  if (!t.due) return '请先选择截止日期。';
  return '将在 ' + fmtTime(t.remindAt) + ' 发送系统通知。' + (t.dueTime ? '' : '（未设置时间，按 09:00 计算）');
}
function todoGroupKey(t) {
  const today = todoYmd(new Date());
  if (!t.due) return 'nodate';
  if (t.due < today) return 'overdue';
  if (t.due === today) return 'today';
  if (t.due === todoTomorrowYmd()) return 'tomorrow';
  return 'later';
}
function todoSortFn(a, b) {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
  if (a.due && !b.due) return -1;
  if (!a.due && b.due) return 1;
  if (a.important !== b.important) return a.important ? -1 : 1;
  return b.createdAt - a.createdAt;
}

/* ---------- 初始化 / 持久化 ---------- */
function todoInit(stored) {
  const s = stored && typeof stored === 'object' ? stored : {};
  todoTasks = (Array.isArray(s.tasks) ? s.tasks : []).map(todoNorm).filter(Boolean);
  const sess = s.session && typeof s.session === 'object' ? s.session : {};
  todoFilter = TODO_LISTS.some((l) => l.key === sess.filter) ? sess.filter : 'myday';
  todoSel = sess.sel ? String(sess.sel) : null;
  if (todoSel && !todoTasks.some((t) => t.id === todoSel)) todoSel = null;
  todoSettings = Object.assign({ widget: true }, s.settings && typeof s.settings === 'object' ? s.settings : {});

  onStoreSync((keys) => {
    if (!keys) return;
    const hasSettings = Object.prototype.hasOwnProperty.call(keys, STORE.todoSettings);
    const hasTasks = Object.prototype.hasOwnProperty.call(keys, STORE.todoIndex);
    if (!hasSettings && !hasTasks) return;
    if (hasSettings) {
      todoSettings = Object.assign({ widget: true }, keys[STORE.todoSettings] && typeof keys[STORE.todoSettings] === 'object' ? keys[STORE.todoSettings] : {});
    }
    if (!hasTasks) { renderTodoNav(); return; }
    clearTimeout(todoSaveT); todoSaveT = 0;
    const arr = keys[STORE.todoIndex];
    todoTasks = (Array.isArray(arr) ? arr : []).map(todoNorm).filter(Boolean);
    if (todoSel && !todoTasks.some((t) => t.id === todoSel)) todoSel = null;
    renderTodo();
  });

  if (!EMBEDDED) {
    setTimeout(todoLocalReminderTick, 2000);
    setInterval(todoLocalReminderTick, 30000);
  }
}
function todoSave() {
  clearTimeout(todoSaveT);
  todoSaveT = setTimeout(() => { todoSaveT = 0; patch({ [STORE.todoIndex]: todoTasks }); }, 300);
}
function todoSaveSession() {
  clearTimeout(todoSessT);
  todoSessT = setTimeout(() => {
    todoSessT = 0;
    patch({ [STORE.todoSession]: { filter: todoFilter, sel: todoSel } });
  }, 150);
}
function flushTodo() {
  if (todoSaveT) { clearTimeout(todoSaveT); todoSaveT = 0; patch({ [STORE.todoIndex]: todoTasks }); }
  if (todoSessT) { clearTimeout(todoSessT); todoSessT = 0; patch({ [STORE.todoSession]: { filter: todoFilter, sel: todoSel } }); }
}

/* ---------- 列表筛选 / 渲染 ---------- */
function todoCounts() {
  const c = { myday: 0, planned: 0, important: 0, all: 0, completed: 0 };
  todoTasks.forEach((t) => {
    if (t.done) { c.completed++; return; }
    c.all++;
    if (t.myDay) c.myday++;
    if (t.due) c.planned++;
    if (t.important) c.important++;
  });
  return c;
}
function todoMatch(t, q) {
  return t.title.toLowerCase().includes(q) ||
    t.note.toLowerCase().includes(q) ||
    t.steps.some((s) => s.text.toLowerCase().includes(q));
}
function todoFiltered() {
  if (query) return todoTasks.filter((t) => todoMatch(t, query)).sort(todoSortFn);
  let list = todoTasks.filter((t) => (todoFilter === 'completed' ? t.done : !t.done));
  if (todoFilter === 'myday') list = list.filter((t) => t.myDay);
  else if (todoFilter === 'planned') list = list.filter((t) => t.due);
  else if (todoFilter === 'important') list = list.filter((t) => t.important);
  return list.sort(todoSortFn);
}
function todoListLabel() {
  if (query) return '搜索结果';
  const l = TODO_LISTS.find((x) => x.key === todoFilter);
  return l ? l.label : '全部';
}
function todoEmptyText() {
  if (query) return '没有匹配的任务';
  if (todoFilter === 'myday') return '我的一天还是空的 —— 添加任务，或把任务标记为「我的一天」';
  if (todoFilter === 'planned') return '还没有安排日期的任务';
  if (todoFilter === 'important') return '还没有标记为重要的任务';
  if (todoFilter === 'completed') return '还没有已完成的任务';
  return '所有任务都完成了';
}

function renderTodoNav() {
  const nav = document.getElementById('todoNav');
  if (!nav) return;
  const c = todoCounts();
  nav.innerHTML = TODO_LISTS.map((l) => `
    <button type="button" class="todo-nav-item ${todoFilter === l.key ? 'on' : ''}" onclick="todoSetFilter('${l.key}')">
      ${l.icon}<span class="todo-nav-name">${l.label}</span><span class="todo-nav-n">${c[l.key]}</span>
    </button>`).join('');
  const sw = document.getElementById('todoWidgetSwitch');
  if (sw) sw.classList.toggle('on', !!todoSettings.widget);
}

function todoRowHtml(t) {
  const meta = [];
  if (t.done) {
    meta.push('<span class="todo-note-meta">已完成 ' + esc(fmtTime(t.completedAt)) + '</span>');
  } else {
    const due = todoDueLabel(t);
    if (due) meta.push(`<span class="todo-due ${todoOverdue(t) ? 'over' : ''}">${ICO_TODO_CAL}${esc(due)}</span>`);
    if (t.remindAt) meta.push(`<span class="todo-mini" title="提醒 ${esc(fmtTime(t.remindAt))}">${ICO_TODO_BELL}</span>`);
    if (t.note.trim()) meta.push(`<span class="todo-mini" title="有备注">${ICO_TODO_NOTE}</span>`);
    if (t.steps.length) {
      const done = t.steps.filter((s) => s.done).length;
      meta.push(`<span class="todo-mini" title="步骤 ${done}/${t.steps.length}">${ICO_TODO_STEP}<b>${done}/${t.steps.length}</b></span>`);
    }
    if (t.myDay && !query && todoFilter !== 'myday') meta.push(`<span class="todo-mini" title="我的一天">${ICO_TODO_SUN}</span>`);
  }
  return `<div class="todo-row ${t.done ? 'done' : ''} ${todoSel === t.id ? 'sel' : ''}" data-tid="${esc(t.id)}" onclick="todoSelect('${t.id}')">
    <button type="button" class="todo-check" title="${t.done ? '取消完成' : '完成'}" onclick="event.stopPropagation();todoToggle('${t.id}')">${ICO_TODO_CHECK}</button>
    <div class="todo-row-main">
      <div class="todo-title">${esc(t.title)}</div>
      ${meta.length ? '<div class="todo-meta">' + meta.join('') + '</div>' : ''}
    </div>
    <button type="button" class="todo-star ${t.important ? 'on' : ''}" title="标记重要" onclick="event.stopPropagation();todoStar('${t.id}')">${t.important ? ICO_TODO_STAR_ON : ICO_TODO_STAR}</button>
  </div>`;
}

function todoRenderItems(list) {
  const box = document.getElementById('todoItems');
  if (!box) return;
  if (!list.length) {
    box.innerHTML = `<div class="todo-empty">${ICO_TODO_LIST}<p>${todoEmptyText()}</p></div>`;
    return;
  }
  if (todoFilter === 'completed' || query) {
    box.innerHTML = list.map(todoRowHtml).join('');
    return;
  }
  const buckets = { overdue: [], today: [], tomorrow: [], later: [], nodate: [] };
  list.forEach((t) => buckets[todoGroupKey(t)].push(t));
  box.innerHTML = Object.keys(TODO_GROUPS).map((k) => {
    if (!buckets[k].length) return '';
    return `<div class="todo-group"><span>${TODO_GROUPS[k]}</span><b>${buckets[k].length}</b></div>` + buckets[k].map(todoRowHtml).join('');
  }).join('');
}

function todoStepHtml(s) {
  return `<div class="todo-step ${s.done ? 'done' : ''}">
    <button type="button" class="todo-step-check" title="切换步骤" onclick="todoStepToggle('${s.id}')">${s.done ? ICO_TODO_CHECK : ''}</button>
    <input class="todo-step-text" value="${esc(s.text)}" spellcheck="false" oninput="todoStepText('${s.id}',this.value)">
    <button type="button" class="todo-step-del" title="删除步骤" onclick="todoStepDel('${s.id}')">×</button>
  </div>`;
}

function renderTodoDetail() {
  const box = document.getElementById('todoDetail');
  if (!box) return;
  const t = todoCur();
  if (!t) { box.innerHTML = ''; return; }
  const remLabel = todoRemindLabel(t);
  const remOpts = TODO_REMIND.map((r) => `<button type="button" class="csel-opt ${t.remind === r[0] ? 'on' : ''}" data-value="${r[0]}" data-label="${r[1]}" onclick="todoRemindPick('${r[0]}')">${r[1]}</button>`).join('');
  const steps = t.steps.length ? t.steps.map(todoStepHtml).join('') : '<div class="todo-step-empty">暂无步骤</div>';
  box.innerHTML = `
    <div class="todo-detail-head">
      <span>任务详情</span>
      <button type="button" class="icon-btn" title="关闭" onclick="todoCloseDetail()">${ICO_X}</button>
    </div>
    <div class="todo-detail-body">
      <input id="todoDTitle" class="todo-d-title" value="${esc(t.title)}" placeholder="任务名称" spellcheck="false" oninput="todoTitleInput(this.value)" onblur="todoTitleBlur()">
      <div class="todo-flags">
        <button type="button" class="todo-flag ${t.myDay ? 'on' : ''}" onclick="todoToggleMyDay()">${ICO_TODO_SUN}<span>我的一天</span></button>
        <button type="button" class="todo-flag ${t.important ? 'on' : ''}" onclick="todoToggleImportant()">${ICO_TODO_STAR}<span>重要</span></button>
      </div>
      <div class="todo-block">
        <label class="todo-label">步骤</label>
        <div class="todo-steps">${steps}</div>
        <div class="todo-step-add">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
          <input id="todoStepInput" type="text" placeholder="添加步骤，按 Enter" onkeydown="todoStepKey(event)">
        </div>
      </div>
      <div class="todo-fields">
        <div class="todo-field">
          <div class="todo-label-row"><label class="todo-label">截止日期</label><button type="button" class="todo-clear ${t.due ? '' : 'hide'}" onclick="todoClearDue()">清除</button></div>
          <input type="date" value="${t.due}" onchange="todoDueInput(this.value)">
        </div>
        <div class="todo-field">
          <label class="todo-label">时间</label>
          <input type="time" value="${t.dueTime}" onchange="todoTimeInput(this.value)">
        </div>
      </div>
      <div class="todo-field">
        <label class="todo-label">提醒</label>
        <div class="csel todo-remind" id="todoRemindSel" data-value="${t.remind}">
          <button type="button" class="csel-btn" onclick="cselToggle('todoRemindSel')">
            <span class="csel-val">${remLabel}</span>
            <svg class="csel-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="csel-menu">${remOpts}</div>
        </div>
        <p class="todo-hint">${todoRemindHint(t)}</p>
      </div>
      <div class="todo-field">
        <label class="todo-label">备注</label>
        <textarea class="todo-note" placeholder="补充说明…" oninput="todoNoteInput(this.value)">${esc(t.note)}</textarea>
      </div>
      <div class="todo-detail-foot">
        <span>${t.done ? '完成于 ' + esc(fmtTime(t.completedAt)) : '创建于 ' + esc(fmtTime(t.createdAt))}</span>
        <button type="button" class="btn btn-ghost btn-sm todo-danger" onclick="todoDeleteAsk()">删除任务</button>
      </div>
    </div>`;
}

function renderTodo() {
  if (todoSel && !todoTasks.some((t) => t.id === todoSel)) todoSel = null;
  renderTodoNav();
  const list = todoFiltered();
  const head = document.getElementById('todoHeadTitle');
  if (head) head.textContent = todoListLabel();
  const cnt = document.getElementById('todoCount');
  if (cnt) cnt.textContent = list.length ? list.length + (query ? ' 个结果' : ' 项') : '';
  const clearBtn = document.getElementById('todoClearBtn');
  if (clearBtn) clearBtn.classList.toggle('hide', !(todoFilter === 'completed' && !query && todoTasks.some((t) => t.done)));
  const addWrap = document.getElementById('todoAddWrap');
  if (addWrap) addWrap.classList.toggle('hide', todoFilter === 'completed' || !!query);
  const layout = document.getElementById('todoLayout');
  if (layout) layout.classList.toggle('no-detail', !todoCur());
  todoRenderItems(list);
  renderTodoDetail();
}

/* ---------- 交互 ---------- */
function todoSetFilter(f) {
  if (!TODO_LISTS.some((l) => l.key === f)) return;
  todoFilter = f;
  todoSel = null;
  query = '';
  const sb = document.getElementById('search');
  if (sb) sb.value = '';
  todoSaveSession();
  renderTodo();
}
function todoSelect(id) {
  if (!todoTasks.some((t) => t.id === id)) return;
  todoSel = id;
  todoSaveSession();
  renderTodo();
}
function todoCloseDetail() { todoSel = null; todoSaveSession(); renderTodo(); }
function todoCreate(title) {
  const t = todoNorm({
    id: uid(), title: title, createdAt: Date.now(),
    myDay: todoFilter === 'myday', important: todoFilter === 'important', remind: 'none'
  });
  if (!t) return;
  todoTasks.unshift(t);
  todoSel = t.id;
  todoSave();
  todoSaveSession();
  renderTodo();
}
function todoAddKey(e) {
  if (e.key !== 'Enter' || e.isComposing) return;
  e.preventDefault();
  const el = e.target;
  const v = el.value.trim();
  if (!v) return;
  el.value = '';
  todoCreate(v);
}
function todoToggle(id) {
  const t = todoTasks.find((x) => x.id === id);
  if (!t) return;
  t.done = !t.done;
  t.completedAt = t.done ? Date.now() : 0;
  todoSave();
  renderTodo();
}
function todoStar(id) {
  const t = todoTasks.find((x) => x.id === id);
  if (!t) return;
  t.important = !t.important;
  todoSave();
  renderTodo();
}
function todoToggleMyDay() {
  const t = todoCur();
  if (!t) return;
  t.myDay = !t.myDay;
  todoSave(); renderTodo();
}
function todoToggleImportant() {
  const t = todoCur();
  if (!t) return;
  t.important = !t.important;
  todoSave(); renderTodo();
}
function todoTitleInput(v) {
  const t = todoCur();
  if (!t) return;
  t.title = v;
  todoSave();
  const row = document.querySelector('#todoItems .todo-row[data-tid="' + t.id + '"] .todo-title');
  if (row) row.textContent = v;
}
function todoTitleBlur() {
  const t = todoCur();
  if (!t) return;
  if (!t.title.trim()) {
    t.title = '未命名任务';
    const el = document.getElementById('todoDTitle');
    if (el) el.value = t.title;
    const row = document.querySelector('#todoItems .todo-row[data-tid="' + t.id + '"] .todo-title');
    if (row) row.textContent = t.title;
    todoSave();
  }
}
function todoNoteInput(v) {
  const t = todoCur();
  if (!t) return;
  t.note = v;
  todoSave();
}
function todoDueInput(v) {
  const t = todoCur();
  if (!t) return;
  t.due = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
  if (!t.due) { t.dueTime = ''; t.remind = 'none'; }
  todoRecompute(t);
  todoSave(); renderTodo();
}
function todoTimeInput(v) {
  const t = todoCur();
  if (!t) return;
  t.dueTime = /^\d{2}:\d{2}$/.test(v) ? v : '';
  todoRecompute(t);
  todoSave(); renderTodo();
}
function todoClearDue() {
  const t = todoCur();
  if (!t) return;
  t.due = ''; t.dueTime = ''; t.remind = 'none';
  todoRecompute(t);
  todoSave(); renderTodo();
}
function todoRemindPick(v) {
  const t = todoCur();
  if (!t) return;
  if (v !== 'none' && !t.due) {
    cselSelect('todoRemindSel', 'none');
    toast('请先设置截止日期');
    return;
  }
  t.remind = TODO_REMIND.some((r) => r[0] === v) ? v : 'none';
  cselSelect('todoRemindSel', t.remind);
  todoRecompute(t);
  todoSave();
  if (!EMBEDDED && t.remind !== 'none' && 'Notification' in window && Notification.permission === 'default') {
    try { Notification.requestPermission(); } catch (e) {}
  }
  renderTodo();
}
function todoStepKey(e) {
  if (e.key !== 'Enter' || e.isComposing) return;
  e.preventDefault();
  const t = todoCur();
  const v = e.target.value.trim();
  if (!t || !v) return;
  t.steps.push({ id: uid(), text: v, done: false });
  todoSave();
  renderTodo();
  setTimeout(() => { const el = document.getElementById('todoStepInput'); if (el) el.focus(); }, 0);
}
function todoStepToggle(id) {
  const t = todoCur();
  if (!t) return;
  const s = t.steps.find((x) => x.id === id);
  if (!s) return;
  s.done = !s.done;
  todoSave(); renderTodo();
}
function todoStepText(id, v) {
  const t = todoCur();
  if (!t) return;
  const s = t.steps.find((x) => x.id === id);
  if (!s) return;
  s.text = v;
  todoSave();
}
function todoStepDel(id) {
  const t = todoCur();
  if (!t) return;
  t.steps = t.steps.filter((x) => x.id !== id);
  todoSave(); renderTodo();
}
function todoDeleteAsk() {
  const t = todoCur();
  if (!t) return;
  openModal(`
    <div class="modal-head"><h3>删除任务</h3><button class="icon-btn" onclick="closeModal()">${ICO_X}</button></div>
    <div class="modal-body"><p class="todo-modal-text">确定删除「${esc(t.title)}」？此操作不可撤销。</p></div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">取消</button><button class="btn btn-accent" onclick="todoDeleteConfirm()">删除</button></div>`);
}
function todoDeleteConfirm() {
  const t = todoCur();
  if (!t) { closeModal(); return; }
  todoTasks = todoTasks.filter((x) => x.id !== t.id);
  todoSel = null;
  closeModal();
  todoSave(); todoSaveSession(); renderTodo();
  toast('已删除任务');
}
function todoClearDone() {
  const n = todoTasks.filter((t) => t.done).length;
  if (!n) return;
  openModal(`
    <div class="modal-head"><h3>清除已完成任务</h3><button class="icon-btn" onclick="closeModal()">${ICO_X}</button></div>
    <div class="modal-body"><p class="todo-modal-text">将删除 ${n} 个已完成任务，此操作不可撤销。</p></div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">取消</button><button class="btn btn-accent" onclick="todoClearConfirm()">清除</button></div>`);
}
function todoClearConfirm() {
  todoTasks = todoTasks.filter((t) => !t.done);
  if (todoSel && !todoTasks.some((t) => t.id === todoSel)) todoSel = null;
  closeModal();
  todoSave(); todoSaveSession(); renderTodo();
  toast('已清除完成任务');
}
function todoToggleWidget() {
  todoSettings.widget = !todoSettings.widget;
  patch({ [STORE.todoSettings]: Object.assign({}, todoSettings, { widget: !!todoSettings.widget }) });
  renderTodoNav();
  toast(todoSettings.widget ? '已开启网页悬浮按钮' : '已关闭网页悬浮按钮');
}

/* ---------- 非扩展环境（直接打开 app.html）的提醒兜底 ---------- */
function todoLocalReminderTick() {
  if (EMBEDDED) return;
  const now = Date.now();
  let changed = false;
  todoTasks.forEach((t) => {
    if (t.done || !t.remindAt || t.notifiedFor === t.remindAt) return;
    if (t.remindAt > now) return;
    t.notifiedFor = t.remindAt;
    changed = true;
    toast('待办提醒：' + t.title);
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Tools-X · Todo', { body: t.title });
      }
    } catch (e) {}
  });
  if (changed) patch({ [STORE.todoIndex]: todoTasks });
}
