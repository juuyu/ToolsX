/* ============================================================
   Tools-X · Prompt 管理
   数据：STORE.promptItems / promptCats / promptStats / promptSession
   用法：正文中用 {{参数名}} 定义参数，使用时填参数后复制最终 Prompt
============================================================ */
const PR_VAR_SRC = '\\{\\{\\s*([^{}\\s]+)\\s*\\}\\}';
const PR_ICO_ALL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';
const PR_ICO_CLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>';
const PR_ICO_STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 3 15 9 21 10 17 15 18 21 12 18 6 21 7 15 3 10 9 9"/></svg>';
const PR_ICO_EMPTY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z"/></svg>';
const PR_ICO_FOLDER = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"/></svg>';
const PR_ICO_DRAG = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="7" r="1.6"/><circle cx="15" cy="7" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="17" r="1.6"/><circle cx="15" cy="17" r="1.6"/></svg>';

/* ---------- 默认分类（首次运行只创建分类，不再内置 Prompt） ---------- */
const PR_CAT_SEEDS = ['翻译', '写作', '编程', '分析', '其他'];
/* 旧版本内置示例名称：仅用于一次性清理历史数据，不再作为内置内容写入 */
const PR_SEED_NAMES = [
  '口语化英文翻译', '英文表达润色', '多语言翻译', '文章润色', '邮件撰写', '小红书文案',
  '代码审查', '正则生成', '报错排查', 'SQL 生成', '长文总结', '会议纪要', '方案对比',
  '术语解释', '需求澄清', '专业领域翻译', '中英对照翻译', '爆款标题生成', '去 AI 味改写',
  '简历优化（JD 对齐）', '演讲稿撰写', '周报生成', '单元测试生成', '代码重构优化',
  '代码逐行讲解', 'Git 提交信息', 'PR 描述生成', '技术方案设计', '数据分析洞察',
  '竞品分析', '决策利弊分析', '学习计划', '费曼式讲解', 'Prompt 优化器', '模拟面试'
];
const PR_SEED_REMOVE = PR_SEED_NAMES.map((n) => n.toLowerCase());
let prSyncBound = false;


let prState = null;
let prEditing = null;
let prParamT = 0;
let prUseId = '';
let prUseParams = [];
let prSel = null;

/* ---------- 数据归一化 ---------- */
function prParamNorm(x) {
  if (!x || typeof x !== 'object') return null;
  const k = String(x.k || x.key || x.name || '').trim();
  if (!k) return null;
  const def = x.def == null ? (x['default'] == null ? '' : x['default']) : x.def;
  return {
    k: k,
    label: String(x.label == null ? (x.title || '') : x.label),
    def: String(def == null ? '' : def),
    multi: !!x.multi,
    req: x.req !== false && x.required !== false
  };
}
function prParamDefault(k) {
  const multi = /^(text|code|content|notes|note|info|error|schema|body|article|input|source|data|logs?)$/i.test(k);
  return { k: k, label: '', def: '', multi: multi, req: true };
}
function prParseKeys(content) {
  const re = new RegExp(PR_VAR_SRC, 'g');
  const out = [];
  let m;
  while ((m = re.exec(String(content || '')))) {
    if (out.indexOf(m[1]) < 0) out.push(m[1]);
  }
  return out;
}
function prMergeParams(content, saved) {
  const keys = prParseKeys(content);
  return keys.map((k) => {
    const old = (saved || []).filter((x) => x && x.k === k)[0];
    return old ? Object.assign({}, old, { k: k }) : prParamDefault(k);
  });
}
function prFill(p, vals, params) {
  const list = params || p.params || [];
  const map = {};
  list.forEach((x) => {
    const v = vals && vals[x.k] != null ? String(vals[x.k]) : '';
    map[x.k] = v.trim() ? v : String(x.def || '');
  });
  return String(p.content || '').replace(new RegExp(PR_VAR_SRC, 'g'), (m, k) => {
    return map[k] && map[k] !== '' ? map[k] : m;
  });
}
function prNameFrom(content) {
  const line = String(content || '').split('\n').map((s) => s.trim()).filter(Boolean)[0] || '未命名 Prompt';
  const t = line.replace(new RegExp(PR_VAR_SRC, 'g'), '…').slice(0, 24).trim();
  return t || '未命名 Prompt';
}
function prItemNorm(o) {
  if (!o || typeof o !== 'object') return null;
  const content = String(o.content == null ? '' : o.content);
  if (!content.trim()) return null;
  const now = Date.now();
  const params = Array.isArray(o.params) ? o.params.map(prParamNorm).filter(Boolean) : [];
  return {
    id: String(o.id || uid()),
    name: String(o.name == null ? '' : o.name).trim() || prNameFrom(content),
    content: content,
    cat: String(o.cat || ''),
    params: prMergeParams(content, params),
    star: !!o.star,
    ctime: Number(o.ctime) || now,
    utime: Number(o.utime) || now
  };
}
function prCatNorm(c) {
  if (!c || typeof c !== 'object') return null;
  const name = String(c.name || '').trim();
  if (!name) return null;
  return { id: String(c.id || uid()), name: name };
}

/* ---------- 初始化 ---------- */
function promptInit(raw) {
  raw = raw || {};
  const hasCats = raw.cats !== undefined;
  let cats = Array.isArray(raw.cats) ? raw.cats.map(prCatNorm).filter(Boolean) : [];
  let items = Array.isArray(raw.items) ? raw.items.map(prItemNorm).filter(Boolean) : [];
  const session = (raw.session && typeof raw.session === 'object') ? raw.session : {};
  const firstRun = !hasCats;
  if (firstRun) cats = PR_CAT_SEEDS.map((n) => ({ id: uid(), name: n }));
  let itemsChanged = false;
  items.forEach((it) => {
    if (it.cat && !cats.some((c) => c.id === it.cat)) { it.cat = ''; itemsChanged = true; }
  });
  const stats = (raw.stats && typeof raw.stats === 'object' && !Array.isArray(raw.stats)) ? Object.assign({}, raw.stats) : {};
  /* 一次性清理旧版本内置示例：仅清理与内置名称完全一致的条目（用户改过名的不动） */
  const hadSeeds = Object.prototype.hasOwnProperty.call(session, 'seedV');
  let statsChanged = false;
  if (hadSeeds) {
    const drop = {};
    PR_SEED_REMOVE.forEach((n) => { drop[n] = true; });
    const keep = [];
    items.forEach((it) => {
      if (drop[String(it.name).toLowerCase()]) {
        itemsChanged = true;
        if (it.id in stats) { delete stats[it.id]; statsChanged = true; }
      } else keep.push(it);
    });
    items = keep;
  }
  let active = session.active === undefined ? 'all' : String(session.active);
  if (active !== 'all' && active !== 'recent' && active !== 'fav' && active !== '' && !cats.some((c) => c.id === active)) active = 'all';
  prState = { items: items, cats: cats, stats: stats, active: active };
  if (firstRun || itemsChanged || statsChanged || hadSeeds) {
    const p = {};
    if (firstRun || itemsChanged) p[STORE.promptItems] = items.slice();
    if (firstRun) p[STORE.promptCats] = cats.slice();
    if (firstRun || statsChanged) p[STORE.promptStats] = stats;
    if (firstRun || hadSeeds || session.active !== active) p[STORE.promptSession] = { active: active };
    patch(p);
  }
  prBind();
}
function prSaveItems() { patch({ [STORE.promptItems]: prState.items.slice() }); }
function prSaveCats() { patch({ [STORE.promptCats]: prState.cats.slice() }); }
function prSaveSession() { patch({ [STORE.promptSession]: { active: prState.active } }); }
/* 其他标签页 / 外部写入后同步统计，保证「常用」实时准确 */
function prBind() {
  if (prSyncBound) return;
  prSyncBound = true;
  const grid = document.getElementById('prGrid');
  if (grid) {
    grid.addEventListener('pointerdown', prGridPointerDown);
    grid.addEventListener('click', prGridClickCapture, true);
  }
  onStoreSync((map) => {
    if (!prState || !Object.prototype.hasOwnProperty.call(map, STORE.promptStats)) return;
    const s = map[STORE.promptStats];
    prState.stats = (s && typeof s === 'object' && !Array.isArray(s)) ? Object.assign({}, s) : {};
    renderPrompt();
  });
}
function prCatName(id) {
  const c = prState.cats.filter((x) => x.id === id)[0];
  return c ? c.name : '未分类';
}
function prStatsOf(id) {
  const s = prState.stats[id];
  return { n: Number(s && s.n) || 0, t: Number(s && s.t) || 0 };
}
function prAgo(ts) {
  const d = Date.now() - (Number(ts) || 0);
  if (d < 60000) return '刚刚';
  if (d < 3600000) return Math.floor(d / 60000) + ' 分钟前';
  if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
  if (d < 2592000000) return Math.floor(d / 86400000) + ' 天前';
  return fmtTime(ts).split(' ')[0];
}
function prRich(s) {
  return esc(String(s || '')).replace(new RegExp(PR_VAR_SRC, 'g'), '<span class="pr-var">{{$1}}</span>');
}
function prFilterText(x) {
  return (x.name + ' ' + x.content + ' ' + prCatName(x.cat) + ' ' + x.params.map((p) => p.k + ' ' + (p.label || '')).join(' ')).toLowerCase();
}

/* ---------- 列表渲染 ---------- */
function renderPrompt() {
  if (!prState) return;
  prRenderNav();
  prRenderStats();
  const head = document.getElementById('prHeadTitle');
  const cnt = document.getElementById('prCount');
  const q = String(typeof query === 'string' ? query : '').trim().toLowerCase();
  let list = prState.items.slice();
  let title = '全部';
  if (prState.active === 'recent') { title = '常用'; list = list.filter((x) => prStatsOf(x.id).n > 0); }
  else if (prState.active === 'fav') { title = '收藏'; list = list.filter((x) => x.star); }
  else if (prState.active !== 'all') { title = prCatName(prState.active); list = list.filter((x) => x.cat === prState.active); }
  if (q) list = list.filter((x) => prFilterText(x).indexOf(q) >= 0);
  if (prState.active === 'recent' || prState.active === 'fav') {
    list.sort((a, b) => {
      const sa = prStatsOf(a.id), sb = prStatsOf(b.id);
      return sb.n - sa.n || sb.t - sa.t || b.utime - a.utime;
    });
  }
  /* 其余视图按列表自身顺序展示，长按拖动即可调整顺序 */
  if (head) head.textContent = title;
  if (cnt) cnt.textContent = list.length + ' 个 Prompt' + (q ? ' · 搜索' : '');
  const grid = document.getElementById('prGrid');
  if (!grid) return;
  if (!list.length) {
    grid.innerHTML = '<div class="empty">' + PR_ICO_EMPTY + '<p>' + (q ? '没有匹配的 Prompt' : '还没有 Prompt，点击右上角「新建 Prompt」开始创建') + '</p></div>';
    return;
  }
  grid.innerHTML = list.map(prCardHtml).join('');
}
function prRenderNav() {
  const nav = document.getElementById('prNav');
  if (!nav) return;
  const used = prState.items.filter((x) => prStatsOf(x.id).n > 0).length;
  const fav = prState.items.filter((x) => x.star).length;
  const unc = prState.items.filter((x) => !x.cat).length;
  let h = '';
  h += prNavItem('all', '全部', PR_ICO_ALL, prState.items.length);
  h += prNavItem('recent', '常用', PR_ICO_CLOCK, used);
  h += prNavItem('fav', '收藏', PR_ICO_STAR, fav);
  h += '<div class="pr-nav-label">分类</div>';
  prState.cats.forEach((c) => {
    h += prNavCat(c, prState.items.filter((x) => x.cat === c.id).length);
  });
  if (unc) h += prNavItem('', '未分类', PR_ICO_FOLDER, unc);
  nav.innerHTML = h;
}
function prNavItem(key, name, icon, count) {
  return '<button type="button" class="pr-nav-item' + (prState.active === key ? ' on' : '') + '" onclick="promptSetActive(\'' + key + '\')">'
    + icon + '<span class="pr-nav-name">' + esc(name) + '</span><span class="pr-nav-n">' + count + '</span></button>';
}
function prNavCat(c, count) {
  return '<div class="pr-nav-item pr-cat-row' + (prState.active === c.id ? ' on' : '') + '" onclick="promptSetActive(\'' + c.id + '\')">'
    + PR_ICO_FOLDER
    + '<span class="pr-nav-name">' + esc(c.name) + '</span>'
    + '<span class="pr-nav-n">' + count + '</span>'
    + '<span class="pr-nav-acts">'
    + '<button class="icon-btn" onclick="event.stopPropagation();promptCatRename(\'' + c.id + '\')" title="重命名">' + ICO_EDIT + '</button>'
    + '<button class="icon-btn danger" onclick="event.stopPropagation();promptCatDelete(\'' + c.id + '\')" title="删除">' + ICO_TRASH + '</button>'
    + '</span></div>';
}
function prRenderStats() {
  const el = document.getElementById('prStats');
  if (!el) return;
  let usage = 0;
  Object.keys(prState.stats).forEach((k) => { usage += prStatsOf(k).n; });
  const top = prState.items.map((x) => {
    const s = prStatsOf(x.id);
    return { x: x, n: s.n, t: s.t };
  }).filter((o) => o.n > 0).sort((a, b) => b.n - a.n || b.t - a.t).slice(0, 3);
  el.innerHTML = '<div class="pr-stat-head">统计</div>'
    + '<div class="pr-stat-grid">'
    + '<div><b>' + prState.items.length + '</b><span>Prompt</span></div>'
    + '<div><b>' + prState.cats.length + '</b><span>分类</span></div>'
    + '<div><b>' + usage + '</b><span>使用次数</span></div>'
    + '</div>'
    + (top.length
      ? '<div class="pr-top"><div class="pr-top-head">最常用</div>' + top.map((o) => '<div class="pr-top-row"><span>' + esc(o.x.name) + '</span><b>' + o.n + '</b></div>').join('') + '</div>'
      : '<p class="pr-stat-tip">使用 Prompt 后，这里会出现常用排行。</p>');
}
function prCardHtml(p) {
  const s = prStatsOf(p.id);
  const pc = p.params.length;
  const draggable = prCanDrag();
  return '<article class="pr-card" data-id="' + p.id + '" onclick="promptUse(\'' + p.id + '\')" title="点击使用并复制' + (draggable ? ' · 拖动右上角手柄排序' : '') + '">'
    + '<div class="pr-card-top"><span class="pr-cat-chip">' + esc(prCatName(p.cat)) + '</span>'
    + (pc ? '<span class="pr-param-chip">' + pc + ' 个参数</span>' : '')
    + '<span class="spacer" style="flex:1"></span>'
    + '<button class="pr-star' + (p.star ? ' on' : '') + '" onclick="event.stopPropagation();promptStar(\'' + p.id + '\')" title="' + (p.star ? '取消收藏' : '收藏') + '">' + PR_ICO_STAR + '</button>'
    + (draggable ? '<button class="pr-drag" onclick="event.stopPropagation()" title="拖动排序">' + PR_ICO_DRAG + '</button>' : '')
    + '</div>'
    + '<h3 class="pr-name">' + esc(p.name) + '</h3>'
    + '<div class="pr-preview">' + prRich(p.content) + '</div>'
    + '<div class="pr-foot"><span class="pr-use-n' + (s.n ? '' : ' zero') + '">' + (s.n ? '使用 ' + s.n + ' 次' : '未使用') + '</span>'
    + (s.t ? '<span class="pr-used-t">' + prAgo(s.t) + '</span>' : '')
    + '<span class="spacer" style="flex:1"></span>'
    + '<button class="icon-btn" onclick="event.stopPropagation();promptEdit(\'' + p.id + '\')" title="编辑">' + ICO_EDIT + '</button>'
    + '<button class="icon-btn danger" onclick="event.stopPropagation();promptDelete(\'' + p.id + '\')" title="删除">' + ICO_TRASH + '</button></div>'
    + '</article>';
}
function promptSetActive(v) {
  if (!prState) return;
  prState.active = v;
  prSaveSession();
  renderPrompt();
}

/* ---------- 拖动排序（按住卡片右上角手柄，仅「全部 / 分类 / 未分类」这类手动列表可用） ---------- */
let prDrag = null;
let prSuppressClickAt = 0;

function prCanDrag() {
  if (!prState) return false;
  if (String(typeof query === 'string' ? query : '').trim()) return false;
  const a = prState.active;
  return a === 'all' || a === '' || prState.cats.some((c) => c.id === a);
}
function prGridPointerDown(e) {
  if (e.button !== 0 || !prCanDrag()) return;
  const handle = e.target.closest('.pr-drag');
  if (!handle) return;
  const card = handle.closest('.pr-card');
  if (!card) return;
  e.preventDefault();
  prDragEnd();
  prDragStart(card, e);
}
function prDragStart(card, e) {
  const grid = document.getElementById('prGrid');
  if (!grid) return;
  const rect = card.getBoundingClientRect();
  /* 占位块留在列表里指示落点，卡片本身脱离文档流跟随指针 */
  const slot = document.createElement('div');
  slot.className = 'pr-slot';
  slot.style.height = rect.height + 'px';
  card.parentNode.insertBefore(slot, card);
  card.style.width = rect.width + 'px';
  card.style.height = rect.height + 'px';
  card.style.left = rect.left + 'px';
  card.style.top = rect.top + 'px';
  card.classList.add('dragging');
  document.body.classList.add('pr-dragging');
  prDrag = {
    el: card,
    slot: slot,
    dx: e.clientX - rect.left,
    dy: e.clientY - rect.top,
    order: Array.from(grid.querySelectorAll('.pr-card')).map((c) => c.dataset.id).join('|')
  };
  window.addEventListener('pointermove', prDragMove);
  window.addEventListener('pointerup', prDragEnd);
  window.addEventListener('pointercancel', prDragEnd);
}
function prDragMove(e) {
  if (!prDrag) return;
  e.preventDefault();
  const d = prDrag;
  d.el.style.left = (e.clientX - d.dx) + 'px';
  d.el.style.top = (e.clientY - d.dy) + 'px';
  const grid = document.getElementById('prGrid');
  if (!grid) return;
  const box = grid.getBoundingClientRect();
  if (e.clientY < box.top + 40) grid.scrollTop -= 14;
  else if (e.clientY > box.bottom - 40) grid.scrollTop += 14;
  const hit = document.elementFromPoint(e.clientX, e.clientY);
  if (!hit || hit === d.slot || !grid.contains(hit)) return;
  const card = hit.closest ? hit.closest('.pr-card') : null;
  if (!card) { grid.appendChild(d.slot); return; }
  if (card === d.el) return;
  const r = card.getBoundingClientRect();
  const next = e.clientY > r.top + r.height / 2 ? card.nextSibling : card;
  if (next === d.slot) return;
  grid.insertBefore(d.slot, next);
}
function prDragEnd() {
  if (!prDrag) return;
  const d = prDrag;
  prDrag = null;
  window.removeEventListener('pointermove', prDragMove);
  window.removeEventListener('pointerup', prDragEnd);
  window.removeEventListener('pointercancel', prDragEnd);
  document.body.classList.remove('pr-dragging');
  d.el.classList.remove('dragging');
  d.el.style.cssText = '';
  prSuppressClickAt = Date.now();
  const grid = document.getElementById('prGrid');
  if (!grid) { if (d.slot.parentNode) d.slot.parentNode.removeChild(d.slot); return; }
  /* 按占位块的位置生成新顺序（跳过跟随指针的卡片本身） */
  const ids = [];
  Array.from(grid.children).forEach((el) => {
    if (el === d.el) return;
    if (el === d.slot) ids.push(d.el.dataset.id);
    else if (el.classList && el.classList.contains('pr-card')) ids.push(el.dataset.id);
  });
  if (d.slot.parentNode) d.slot.parentNode.removeChild(d.slot);
  if (ids.join('|') !== d.order) prCommitOrder(ids);
  else renderPrompt();
}
function prCommitOrder(ids) {
  if (!prState) return;
  const slots = {};
  ids.forEach((id, i) => { slots[id] = i; });
  const queue = ids.map((id) => prState.items.filter((x) => x.id === id)[0]).filter(Boolean);
  let qi = 0;
  for (let i = 0; i < prState.items.length; i++) {
    if (slots[prState.items[i].id] !== undefined) prState.items[i] = queue[qi++];
  }
  prSaveItems();
  renderPrompt();
}
function prGridClickCapture(e) {
  if (!prSuppressClickAt || Date.now() - prSuppressClickAt >= 400) return;
  e.stopPropagation();
  e.preventDefault();
}

/* ---------- 使用 Prompt ---------- */
function promptUse(id) {
  const p = prState.items.filter((x) => x.id === id)[0];
  if (!p) return;
  /* 点击即计一次使用：有参数时先弹窗，复制后同样沿用这次计数 */
  prUseRecord(id);
  const params = prMergeParams(p.content, p.params);
  if (!params.length) {
    copy(p.content, '已复制：' + p.name);
    renderPrompt();
    return;
  }
  prUseId = id;
  prUseParams = params;
  const fields = params.map((x, i) => {
    const label = esc(x.label || x.k);
    const val = esc(x.def || '');
    const tag = x.multi
      ? '<textarea id="prp-' + i + '" rows="3" placeholder="请输入' + label + '" oninput="promptUsePreview()">' + val + '</textarea>'
      : '<input id="prp-' + i + '" type="text" value="' + val + '" placeholder="请输入' + label + '" oninput="promptUsePreview()">';
    return '<div class="pr-use-field"><label>' + label + (x.req ? '<em>*</em>' : '') + '<code>{{' + esc(x.k) + '}}</code></label>' + tag + '</div>';
  }).join('');
  openModal('<div class="modal-head"><h3>' + esc(p.name) + '</h3><button class="icon-btn" onclick="closeModal()">' + ICO_X + '</button></div>'
    + '<div class="modal-body"><p class="pr-use-tip">填写参数后复制最终 Prompt</p>'
    + '<div class="pr-use-fields">' + fields + '</div>'
    + '<div class="pr-final-wrap"><label class="pr-final-label">最终 Prompt</label><pre class="pr-final" id="prFinal"></pre></div></div>'
    + '<div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">取消</button><button class="btn btn-accent" onclick="promptUseSubmit()">' + ICO_COPY + '<span>复制 Prompt</span></button></div>');
  promptUsePreview();
}
function promptUsePreview() {
  const p = prState.items.filter((x) => x.id === prUseId)[0];
  if (!p) return;
  const vals = {};
  prUseParams.forEach((x, i) => {
    const el = document.getElementById('prp-' + i);
    vals[x.k] = el ? el.value : '';
  });
  const fin = document.getElementById('prFinal');
  if (fin) fin.textContent = prFill(p, vals, prUseParams);
}
function promptUseSubmit() {
  const p = prState.items.filter((x) => x.id === prUseId)[0];
  if (!p) return;
  const vals = {};
  let missEl = null;
  let missLabel = '';
  prUseParams.forEach((x, i) => {
    const el = document.getElementById('prp-' + i);
    const v = el ? el.value : '';
    vals[x.k] = v;
    if (x.req && !String(v).trim() && !missEl) { missEl = el; missLabel = x.label || x.k; }
  });
  if (missEl) {
    toast('请填写「' + missLabel + '」');
    missEl.focus();
    return;
  }
  const text = prFill(p, vals, prUseParams);
  closeModal();
  copy(text, '已复制：' + p.name);
  renderPrompt();
}
function prUseRecord(id) {
  const s = prStatsOf(id);
  prState.stats[id] = { n: s.n + 1, t: Date.now() };
  patch({ [STORE.promptStats]: Object.assign({}, prState.stats) });
}

/* ---------- 新建 / 编辑 ---------- */
function prIsCatActive() {
  const a = prState ? prState.active : 'all';
  return (a !== 'all' && a !== 'recent' && a !== 'fav') ? a : '';
}
function promptNew() {
  if (!prState) return;
  const a = prIsCatActive();
  prEditing = {
    id: null,
    name: '',
    content: '',
    cat: a || (prState.cats[0] ? prState.cats[0].id : ''),
    params: [],
    star: false
  };
  prOpenEditor();
}
function promptEdit(id) {
  const p = prState.items.filter((x) => x.id === id)[0];
  if (!p) return;
  prEditing = {
    id: p.id,
    name: p.name,
    content: p.content,
    cat: p.cat,
    params: prMergeParams(p.content, p.params).map((x) => Object.assign({}, x)),
    star: p.star
  };
  prOpenEditor();
}
function prOpenEditor() {
  const options = prState.cats.map((c) => '<button type="button" class="csel-opt' + (prEditing.cat === c.id ? ' on' : '') + '" data-value="' + c.id + '" onclick="cselSelect(\'prEdCat\',\'' + c.id + '\')">' + esc(c.name) + '</button>').join('')
    + '<button type="button" class="csel-opt' + (prEditing.cat ? '' : ' on') + '" data-value="" onclick="cselSelect(\'prEdCat\',\'\')">未分类</button>';
  openModal('<div class="modal-head"><h3>' + (prEditing.id ? '编辑 Prompt' : '新建 Prompt') + '</h3><button class="icon-btn" onclick="closeModal()">' + ICO_X + '</button></div>'
    + '<div class="modal-body pr-ed-wide">'
    + '<div class="pr-ed-row">'
    + '<div class="field"><label>名称</label><input id="prEdName" type="text" value="' + esc(prEditing.name) + '" placeholder="例如：口语化英文翻译"></div>'
    + '<div class="field pr-cat-field"><label>分类</label><div class="csel pr-ed-cat" id="prEdCat" data-value="' + prEditing.cat + '">'
    + '<button type="button" class="csel-btn" onclick="cselToggle(\'prEdCat\')"><span class="csel-val">' + esc(prCatName(prEditing.cat)) + '</span>'
    + '<svg class="csel-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></button>'
    + '<div class="csel-menu">' + options + '</div></div></div>'
    + '</div>'
    + '<div class="field"><label>Prompt 正文</label><textarea id="prEdContent" class="pr-ed-content" placeholder="在正文中用 {{参数名}} 表示需要填写的内容" oninput="promptEdContent()">' + esc(prEditing.content) + '</textarea></div>'
    + '<div class="pr-param-block"><div class="pr-param-head"><label>参数</label><span>正文中的 {{参数名}} 自动识别</span></div>'
    + '<div class="pr-param-list" id="prEdParams"></div></div>'
    + '</div>'
    + '<div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">取消</button><button class="btn btn-accent" onclick="promptSave()">保存</button></div>');
  prRenderEdParams();
}
function prRenderEdParams() {
  const el = document.getElementById('prEdParams');
  if (!el || !prEditing) return;
  if (!prEditing.params.length) {
    el.innerHTML = '<p class="pr-param-empty">未检测到参数。在正文中写 {{text}} 即可生成输入项。</p>';
    return;
  }
  el.innerHTML = prEditing.params.map((x, i) => '<div class="pr-param-row">'
    + '<code class="pr-param-key">{{' + esc(x.k) + '}}</code>'
    + '<input type="text" value="' + esc(x.label || '') + '" placeholder="显示名称，默认 ' + esc(x.k) + '" oninput="promptEdParam(' + i + ',\'label\',this.value)">'
    + '<input type="text" value="' + esc(x.def || '') + '" placeholder="默认值（可选）" oninput="promptEdParam(' + i + ',\'def\',this.value)">'
    + '<div class="pr-param-flags">'
    + '<label class="pr-param-check"><input type="checkbox"' + (x.multi ? ' checked' : '') + ' onchange="promptEdParam(' + i + ',\'multi\',this.checked)">多行输入</label>'
    + '<label class="pr-param-check"><input type="checkbox"' + (x.req ? ' checked' : '') + ' onchange="promptEdParam(' + i + ',\'req\',this.checked)">必填</label>'
    + '</div></div>').join('');
}
function promptEdParam(i, field, value) {
  if (!prEditing || !prEditing.params[i]) return;
  prEditing.params[i][field] = (field === 'multi' || field === 'req') ? !!value : String(value);
}
function promptEdContent() {
  if (!prEditing) return;
  const ta = document.getElementById('prEdContent');
  if (!ta) return;
  prEditing.content = ta.value;
  clearTimeout(prParamT);
  prParamT = setTimeout(() => {
    if (!prEditing) return;
    prEditing.params = prMergeParams(prEditing.content, prEditing.params);
    prRenderEdParams();
  }, 300);
}
function promptSave() {
  if (!prEditing) return;
  clearTimeout(prParamT);
  prParamT = 0;
  const nameEl = document.getElementById('prEdName');
  const contentEl = document.getElementById('prEdContent');
  const catEl = document.getElementById('prEdCat');
  const name = nameEl ? String(nameEl.value || '').trim() : '';
  const content = contentEl ? String(contentEl.value || '') : '';
  if (!name) { toast('请填写 Prompt 名称'); if (nameEl) nameEl.focus(); return; }
  if (!content.trim()) { toast('请填写 Prompt 正文'); if (contentEl) contentEl.focus(); return; }
  const cat = catEl ? String(catEl.dataset.value || '') : '';
  const params = prMergeParams(content, prEditing.params);
  const now = Date.now();
  const isNew = !prEditing.id;
  if (!isNew) {
    const it = prState.items.filter((x) => x.id === prEditing.id)[0];
    if (it) Object.assign(it, { name: name, content: content, cat: cat, params: params, utime: now });
  } else {
    prState.items.unshift({ id: uid(), name: name, content: content, cat: cat, params: params, star: !!prEditing.star, ctime: now, utime: now });
    prState.active = cat || 'all';
    prSaveSession();
  }
  prEditing = null;
  closeModal();
  prSaveItems();
  renderPrompt();
  toast(isNew ? '已创建 Prompt' : '已保存 Prompt');
}
function promptStar(id) {
  const p = prState.items.filter((x) => x.id === id)[0];
  if (!p) return;
  p.star = !p.star;
  prSaveItems();
  renderPrompt();
}
function promptDelete(id) {
  const p = prState.items.filter((x) => x.id === id)[0];
  if (!p) return;
  openModal('<div class="modal-head"><h3>删除 Prompt</h3><button class="icon-btn" onclick="closeModal()">' + ICO_X + '</button></div>'
    + '<div class="modal-body"><p class="pr-confirm-text">确定删除「' + esc(p.name) + '」吗？此操作不可恢复。</p></div>'
    + '<div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">取消</button><button class="btn btn-accent" onclick="prDeleteDo(\'' + p.id + '\')">删除</button></div>');
}
function prDeleteDo(id) {
  prState.items = prState.items.filter((x) => x.id !== id);
  const stats = Object.assign({}, prState.stats);
  delete stats[id];
  prState.stats = stats;
  closeModal();
  prSaveItems();
  patch({ [STORE.promptStats]: stats });
  renderPrompt();
  toast('已删除 Prompt');
}

/* ---------- 分类管理 ---------- */
function promptCatNew() {
  if (!prState) return;
  promptText({ title: '新建分类', label: '分类名称', placeholder: '例如：翻译', ok: '创建', cancel: '取消', empty: '请输入分类名称' }, (name) => {
    const n = String(name || '').trim();
    if (prState.cats.some((c) => c.name === n)) { toast('分类已存在'); return; }
    const c = { id: uid(), name: n };
    prState.cats.push(c);
    prState.active = c.id;
    prSaveCats();
    prSaveSession();
    renderPrompt();
    toast('已创建分类');
  });
}
function promptCatRename(id) {
  const c = prState.cats.filter((x) => x.id === id)[0];
  if (!c) return;
  promptText({ title: '重命名分类', label: '分类名称', value: c.name, placeholder: '分类名称', ok: '保存', cancel: '取消', empty: '请输入分类名称' }, (name) => {
    const n = String(name || '').trim();
    if (prState.cats.some((x) => x.id !== id && x.name === n)) { toast('分类已存在'); return; }
    c.name = n;
    prSaveCats();
    renderPrompt();
    toast('已重命名分类');
  });
}
function promptCatDelete(id) {
  const c = prState.cats.filter((x) => x.id === id)[0];
  if (!c) return;
  const n = prState.items.filter((x) => x.cat === id).length;
  openModal('<div class="modal-head"><h3>删除分类</h3><button class="icon-btn" onclick="closeModal()">' + ICO_X + '</button></div>'
    + '<div class="modal-body"><p class="pr-confirm-text">删除分类「' + esc(c.name) + '」后，其中的 ' + n + ' 个 Prompt 会变为「未分类」，不会被删除。</p></div>'
    + '<div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">取消</button><button class="btn btn-accent" onclick="prCatDeleteDo(\'' + c.id + '\')">删除分类</button></div>');
}
function prCatDeleteDo(id) {
  prState.cats = prState.cats.filter((c) => c.id !== id);
  prState.items.forEach((x) => { if (x.cat === id) x.cat = ''; });
  if (prState.active === id) prState.active = 'all';
  closeModal();
  prSaveCats();
  prSaveItems();
  prSaveSession();
  renderPrompt();
  toast('已删除分类');
}

/* ---------- 勾选弹窗（导出 / 导入共用） ---------- */
function prSelOpen(cfg) {
  const items = (cfg.items || []).map((x) => ({ id: x.id, name: x.name, group: x.group || '未分类', meta: x.meta || '', on: true }));
  prSel = { items: items, onOk: cfg.onOk };
  const groups = {};
  items.forEach((x) => { groups[x.group] = (groups[x.group] || 0) + 1; });
  let last = null;
  let rows = '';
  items.forEach((it, i) => {
    if (it.group !== last) {
      last = it.group;
      rows += '<div class="pr-sel-gname"><span>' + esc(it.group) + '</span><b>' + groups[it.group] + '</b></div>';
    }
    rows += '<label class="pr-sel-row"><input type="checkbox" class="pr-on" checked onchange="prSelPick(' + i + ',this.checked)">'
      + '<span class="pr-sel-name">' + esc(it.name) + '</span>'
      + (it.meta ? '<span class="pr-sel-c">' + esc(it.meta) + '</span>' : '')
      + '</label>';
  });
  openModal('<div class="modal-head"><h3>' + esc(cfg.title || '选择 Prompt') + '</h3><button class="icon-btn" onclick="closeModal()">' + ICO_X + '</button></div>'
    + '<div class="modal-body">'
    + '<div class="pr-sel-tools"><label class="pr-sel-all"><input type="checkbox" class="pr-on" id="prSelAll" checked onchange="prSelAllToggle(this.checked)"><span>全选</span></label><span class="pr-sel-n" id="prSelN"></span></div>'
    + '<div class="pr-sel-list">' + (rows || '<div class="pr-sel-empty">没有可选的 Prompt</div>') + '</div>'
    + (cfg.tip ? '<p class="pr-sel-tip">' + esc(cfg.tip) + '</p>' : '')
    + '</div>'
    + '<div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">取消</button><button class="btn btn-accent" onclick="prSelConfirm()">' + esc(cfg.ok || '确定') + '</button></div>');
  prSelSync();
}
function prSelSync() {
  if (!prSel) return;
  const n = prSel.items.filter((x) => x.on).length;
  const total = prSel.items.length;
  const cnt = document.getElementById('prSelN');
  if (cnt) cnt.textContent = '已选 ' + n + ' / ' + total;
  const all = document.getElementById('prSelAll');
  if (all) { all.checked = n === total && total > 0; all.indeterminate = n > 0 && n < total; }
}
function prSelPick(i, on) {
  if (!prSel || !prSel.items[i]) return;
  prSel.items[i].on = !!on;
  prSelSync();
}
function prSelAllToggle(on) {
  if (!prSel) return;
  prSel.items.forEach((x) => { x.on = !!on; });
  document.querySelectorAll('.pr-sel-list .pr-sel-row .pr-on').forEach((c) => { c.checked = !!on; });
  prSelSync();
}
function prSelConfirm() {
  if (!prSel) return;
  const picked = prSel.items.filter((x) => x.on);
  if (!picked.length) { toast('请至少选择一个 Prompt'); return; }
  const fn = prSel.onOk;
  const ids = picked.map((x) => x.id);
  prSel = null;
  closeModal();
  if (fn) fn(ids);
}

/* ---------- 导出 ---------- */
function prStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
}
function promptExport() {
  if (!prState || !prState.items.length) { toast('还没有可导出的 Prompt'); return; }
  const groups = prState.cats.map((c) => ({ name: c.name, items: prState.items.filter((x) => x.cat === c.id) }))
    .concat([{ name: '未分类', items: prState.items.filter((x) => !x.cat) }])
    .filter((g) => g.items.length);
  const items = [];
  groups.forEach((g) => g.items.forEach((p) => {
    items.push({ id: p.id, name: p.name, group: g.name });
  }));
  prSelOpen({
    title: '导出 Prompt',
    ok: '导出',
    tip: '仅导出勾选的 Prompt；分类按名称一并写入文件。',
    items: items,
    onOk: (ids) => prExportSelected(ids)
  });
}
function prExportSelected(ids) {
  const keep = {};
  ids.forEach((id) => { keep[id] = true; });
  const prompts = prState.items.filter((p) => keep[p.id]).map((p) => ({
    name: p.name,
    category: p.cat ? prCatName(p.cat) : '',
    content: p.content,
    params: p.params.map((x) => ({ k: x.k, label: x.label, def: x.def, multi: x.multi, req: x.req })),
    star: !!p.star
  }));
  const cats = [];
  const seen = {};
  prompts.forEach((p) => {
    if (p.category && !seen[p.category]) { seen[p.category] = true; cats.push({ name: p.category }); }
  });
  const data = { type: 'toolsx.prompt', version: 1, exportedAt: new Date().toISOString(), categories: cats, prompts: prompts };
  downloadText('toolsx-prompts-' + prStamp() + '.json', JSON.stringify(data, null, 2));
  toast('已导出 ' + prompts.length + ' 个 Prompt');
}

/* ---------- 导入 ---------- */
function promptImport() {
  const inp = document.getElementById('prImportFile');
  if (inp) { inp.value = ''; inp.click(); }
}
function promptImportFileChange(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    let data = null;
    try { data = JSON.parse(String(reader.result || '')); } catch (x) {}
    if (!data) { toast('文件不是有效的 JSON'); return; }
    const list = prCollectImport(data, file.name);
    if (!list.length) { toast('没有找到可导入的 Prompt'); return; }
    const items = list.map((it, i) => ({
      id: String(i),
      name: it.name,
      group: it.catName || '未分类',
      meta: it.params.length ? it.params.length + ' 个参数' : ''
    }));
    prSelOpen({
      title: '导入 Prompt',
      ok: '导入',
      tip: '勾选的 Prompt 会追加到列表；同名分类自动合并，同名 Prompt 自动加序号。',
      items: items,
      onOk: (ids) => prImportSelected(list, ids)
    });
  };
  reader.onerror = () => toast('读取文件失败');
  reader.readAsText(file);
}
function prCollectImport(data, filename) {
  let src = [];
  if (Array.isArray(data.prompts)) src = data.prompts;
  else if (Array.isArray(data.items)) src = data.items;
  else if (Array.isArray(data)) src = data;
  else if (data && typeof data === 'object' && (data.content || data.prompt)) src = [data];
  const out = [];
  const baseName = String(filename || '').replace(/\.json$/i, '');
  src.forEach((o) => {
    const it = prImportItem(o, baseName);
    if (it) out.push(it);
  });
  return out;
}
function prImportItem(o, baseName) {
  if (!o || typeof o !== 'object') return null;
  const content = String(o.content == null ? (o.prompt == null ? '' : o.prompt) : o.content);
  if (!content.trim()) return null;
  const name = String(o.name == null ? (o.title == null ? '' : o.title) : o.name).trim() || prNameFrom(content);
  const category = String(o.category == null ? (o.categoryName == null ? (o.cat == null ? '' : o.cat) : o.categoryName) : o.category).trim();
  const params = Array.isArray(o.params) ? o.params.map(prParamNorm).filter(Boolean) : [];
  return { name: name || baseName || 'Imported prompt', content: content, catName: category, params: params, star: !!o.star };
}
function prImportSelected(list, ids) {
  const keep = {};
  ids.forEach((k) => { keep[k] = true; });
  const picked = list.filter((x, i) => keep[String(i)]);
  if (!picked.length) { toast('请至少选择一个 Prompt'); return; }
  let catDirty = false;
  picked.forEach((it) => {
    let catId = '';
    const cn = String(it.catName || '').trim();
    if (cn) {
      let c = prState.cats.filter((x) => x.name === cn)[0];
      if (!c) { c = { id: uid(), name: cn }; prState.cats.push(c); catDirty = true; }
      catId = c.id;
    }
    const content = it.content;
    const params = prMergeParams(content, it.params);
    const now = Date.now();
    prState.items.unshift({
      id: uid(),
      name: prUniqueName(it.name),
      content: content,
      cat: catId,
      params: params,
      star: !!it.star,
      ctime: now,
      utime: now
    });
  });
  closeModal();
  if (catDirty) prSaveCats();
  prSaveItems();
  renderPrompt();
  toast('已导入 ' + picked.length + ' 个 Prompt');
}
function prUniqueName(name) {
  const base = String(name || '').trim() || 'Imported prompt';
  let out = base;
  let i = 2;
  while (prState.items.some((x) => x.name === out)) { out = base + ' (' + i + ')'; i++; }
  return out;
}
