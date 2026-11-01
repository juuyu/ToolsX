/* ============================================================
   Tools-X · Core
   共享存储层（按工具拆分 key）· 主题 · 通用工具
   存储：插件内由 sandbox 页 postMessage 交给扩展页写 chrome.storage.local；
   直接打开页面时退回 localStorage，同样按 key 分开保存。
============================================================ */
const EMBEDDED = window.parent !== window;

/* 每个工具独立的存储 key：同一个工具允许使用多个 key */
const STORE = {
  schema: 'toolsx.schema',
  prefs: 'toolsx.prefs',                       // 全局偏好（主题 / 上次视图 / 目录折叠）
  docsIndex: 'toolsx.docs.index',              // Docs：目录树（不含正文）
  docNote: (id) => 'toolsx.docs.note.' + id,   // Docs：单篇笔记正文 + 注释
  apiIndex: 'toolsx.api.index',                // Postman：文件夹 / 请求定义
  apiExamples: (rid) => 'toolsx.api.examples.' + rid, // Postman：单个请求的响应示例
  apiSession: 'toolsx.api.session',            // Postman：当前选中 / 标签页 / 视图状态
  apiDraft: 'toolsx.api.draft',                // Postman：当前编辑中的请求草稿
  todoIndex: 'toolsx.todo.tasks',              // Todo：任务列表
  todoSession: 'toolsx.todo.session',          // Todo：当前列表筛选 / 选中任务
  todoSettings: 'toolsx.todo.settings',        // Todo：网页悬浮按钮等开关
  todoNotified: 'toolsx.todo.notified'         // Todo：后台已提醒记录（background.js 写入）
};
const DOC_NOTE_PREFIX = STORE.docNote('');
const API_EXAMPLE_PREFIX = STORE.apiExamples('');
const LEGACY_KEYS = ['toolsxData', 'aihubData'];

let rawStore = {};
/* Docs 工具的内存态：目录树只保留结构，正文按 key 单独读取 */
let DB = { docs: [] };
let initDone = false;
const initReady = new Promise((resolve) => {
  window.addEventListener('message', (e) => {
    if (!e.data || e.data.type !== 'TOOLSX_INIT') return;
    initDone = true;
    rawStore = e.data.keys || {};
    resolve(rawStore);
  });
});
/* 脚本就绪即向外层索取数据，不必等 iframe 的 load */
if (EMBEDDED) { try { window.parent.postMessage({ type: 'TOOLSX_READY' }, '*'); } catch (e) {} }

function readLocalStore() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.indexOf('toolsx') === 0 || LEGACY_KEYS.indexOf(k) >= 0) {
        try { out[k] = JSON.parse(localStorage.getItem(k)); } catch (e) { out[k] = localStorage.getItem(k); }
      }
    }
  } catch (e) {}
  return out;
}
function get(key) { return rawStore[key]; }
function keysByPrefix(prefix) {
  const out = {};
  Object.keys(rawStore).forEach((k) => { if (k.indexOf(prefix) === 0) out[k] = rawStore[k]; });
  return out;
}
function patch(map) {
  Object.keys(map).forEach((k) => { rawStore[k] = map[k]; });
  if (EMBEDDED) { try { window.parent.postMessage({ type: 'TOOLSX_PATCH', patch: map }, '*'); } catch (e) {} return; }
  try { Object.keys(map).forEach((k) => localStorage.setItem(k, JSON.stringify(map[k]))); } catch (e) {}
}
function removeKeys(keys) {
  keys.forEach((k) => { delete rawStore[k]; });
  if (EMBEDDED) { try { window.parent.postMessage({ type: 'TOOLSX_REMOVE', keys: keys }, '*'); } catch (e) {} return; }
  try { keys.forEach((k) => localStorage.removeItem(k)); } catch (e) {}
}

/* 宿主页把 chrome.storage 的外部变更（浮窗 content script 写入）同步进来 */
const storeSyncFns = new Set();
function onStoreSync(fn) {
  if (typeof fn !== 'function') return () => {};
  storeSyncFns.add(fn);
  return () => storeSyncFns.delete(fn);
}
function applyStoreSync(map) {
  if (!map || typeof map !== 'object') return;
  let changed = false;
  Object.keys(map).forEach((k) => {
    if (map[k] === undefined) {
      if (k in rawStore) { delete rawStore[k]; changed = true; }
    } else {
      rawStore[k] = map[k];
      changed = true;
    }
  });
  if (!changed) return;
  setTimeout(() => storeSyncFns.forEach((fn) => { try { fn(map); } catch (e) {} }), 0);
}
window.addEventListener('message', (e) => {
  if (!e.data || e.data.type !== 'TOOLSX_STORE_SYNC') return;
  applyStoreSync(e.data.keys);
});

/* ---------- 旧版单 key 数据迁移 ---------- */
function legacySanitize(v) {
  if (!v || typeof v !== 'object') return null;
  try {
    const raw = JSON.stringify(v);
    if (raw.indexOf('AI Hub') >= 0) return JSON.parse(raw.replace(/AI Hub/g, 'Tools-X'));
  } catch (e) {}
  return v;
}
function stripDocs(list) {
  return (list || []).map((n) => {
    const o = { id: String(n.id), name: String(n.name || 'Untitled'), type: n.type === 'folder' ? 'folder' : 'note', updatedAt: Number(n.updatedAt) || 0 };
    if (o.type === 'folder') { o.open = n.open !== false; o.children = stripDocs(n.children || []); }
    else o.fmt = n.fmt === 'json' ? 'json' : 'md';
    return o;
  });
}
function stripApiFolders(folders) {
  return (folders || []).map((f) => ({
    id: String(f.id),
    name: String(f.name || 'Untitled folder'),
    open: f.open !== false,
    requests: (f.requests || []).map((r) => ({ id: String(r.id), name: String(r.name || 'Untitled request'), ts: Number(r.ts) || 0, open: !!r.open, request: r.request || null }))
  }));
}
function migrateLegacy() {
  const legacy = legacySanitize(get('toolsxData') || get('aihubData'));
  const hasNew = Object.keys(rawStore).some((k) => k.indexOf('toolsx.') === 0);
  if (!legacy || hasNew) return false;
  const p = {};
  p[STORE.schema] = { version: 2, migratedAt: Date.now() };
  p[STORE.prefs] = (legacy.prefs && typeof legacy.prefs === 'object') ? legacy.prefs : {};
  const docs = Array.isArray(legacy.docs) ? legacy.docs : [];
  p[STORE.docsIndex] = stripDocs(docs);
  (function walk(list) {
    (list || []).forEach((n) => {
      if (n.type === 'folder') { walk(n.children || []); return; }
      p[STORE.docNote(String(n.id))] = { content: String(n.content || ''), comments: (n.comments && typeof n.comments === 'object') ? n.comments : {}, updatedAt: Number(n.updatedAt) || Date.now() };
    });
  })(docs);
  const a = (legacy.api && typeof legacy.api === 'object') ? legacy.api : {};
  p[STORE.apiIndex] = { folders: stripApiFolders(a.folders) };
  (a.folders || []).forEach((f) => (f.requests || []).forEach((r) => {
    if (Array.isArray(r.examples) && r.examples.length) p[STORE.apiExamples(String(r.id))] = r.examples;
  }));
  p[STORE.apiSession] = { activeFolder: a.activeFolder || null, tab: a.tab || 'params', respTab: a.respTab || 'body', pretty: a.pretty !== false };
  p[STORE.apiDraft] = { method: a.method || 'GET', url: String(a.url || ''), name: String(a.name || ''), params: Array.isArray(a.params) ? a.params : [], headers: Array.isArray(a.headers) ? a.headers : [], bodyType: a.bodyType || 'none', body: String(a.body || ''), form: Array.isArray(a.form) ? a.form : [] };
  patch(p);
  removeKeys(LEGACY_KEYS);
  return true;
}
async function storeInit() {
  if (EMBEDDED) await initReady;
  else rawStore = readLocalStore();
  migrateLegacy();
}

/* ---------- 全局偏好 / 主题 ---------- */
const prefs = { theme: '', docsTree: false, lastView: '', tocCollapsed: false };
let prefsT = 0;
function savePrefs() {
  clearTimeout(prefsT);
  prefsT = setTimeout(() => { prefsT = 0; patch({ [STORE.prefs]: Object.assign({}, prefs) }); }, 150);
}
function flushPrefs() {
  clearTimeout(prefsT); prefsT = 0;
  patch({ [STORE.prefs]: Object.assign({}, prefs) });
}
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  prefs.theme = t;
  savePrefs();
}
document.getElementById('themeBtn').addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  toast(next === 'dark' ? '已切换到暗色模式' : '已切换到浅色模式');
});

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
let toastT = 0;
function toast(msg) {
  const t = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 1800);
}
function copy(text, msg) {
  if (EMBEDDED) { window.parent.postMessage({ type: 'TOOLSX_COPY', text: text }, '*'); toast(msg || '已复制到剪贴板'); return; }
  navigator.clipboard.writeText(text).then(() => toast(msg || '已复制到剪贴板'));
}
function openModal(html) {
  document.getElementById('modal').innerHTML = html;
  document.getElementById('overlay').classList.add('show');
  setTimeout(() => document.getElementById('modal').querySelector('input,textarea')?.focus(), 60);
}
function closeModal() { document.getElementById('overlay').classList.remove('show'); }
document.getElementById('overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

function findNode(list,id,parent=null,listRef=null){for(const n of list){if(n.id===id)return{n,parent,list:listRef||list};if(n.children){const r=findNode(n.children,id,n,n.children);if(r)return r}}return null}
function countNotes(n){return n.type==='note'?1:(n.children||[]).reduce((s,c)=>s+countNotes(c),0)}
function docsTotal(){return DB.docs.reduce((s,n)=>s+countNotes(n),0)}
function isAncestor(node,id){if(node.id===id)return true;if(!node.children)return false;return node.children.some(c=>isAncestor(c,id))}
function fmtTime(ts){const d=new Date(ts||Date.now());return (d.getMonth()+1)+'/'+d.getDate()+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
function formatBytes(n){n=Number(n)||0;if(n<1024)return n+' B';if(n<1024*1024)return (n/1024).toFixed(1)+' KB';return (n/1048576).toFixed(1)+' MB'}
function byteLen(s){try{return new TextEncoder().encode(s).length}catch(e){return String(s).length}}
const ICO_DOC='<svg class="f-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>';
const ICO_JSON='<svg class="f-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H7a2 2 0 00-2 2v5a2 2 0 01-2 2 2 2 0 012 2v5c0 1.1.9 2 2 2h1"/><path d="M16 3h1a2 2 0 012 2v5a2 2 0 002 2 2 2 0 00-2 2v5a2 2 0 01-2 2h-1"/></svg>';
const ICO_FOLDER='<svg class="f-ico" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"/></svg>';
const ICO_PLUS='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const ICO_CHEV_UP='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></svg>';
const ICO_CHEV_DOWN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 13 12 18 17 13"/><polyline points="7 6 12 11 17 6"/></svg>';
const ICO_EDIT='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.8 2.8 0 114 4L7.5 20.5 2 22l1.5-5.5z"/></svg>';
const ICO_TRASH='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>';
const ICO_LOCK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>';
const ICO_CHEV_R='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
const ICO_CHEV_L='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
const ICO_COPY='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
const ICO_MSG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H8l-5 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="15" x2="12.01" y2="15"/></svg>';

/* 提示条 / modal 关闭上的全局 Esc 已在上方绑定 */
