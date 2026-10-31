/* ============================================================
   Tools-X · App Shell
   视图切换、全局搜索与启动（最后加载，boot 在末尾执行）
============================================================ */
let view = 'docs', query = '';
const VIEWS = ['docs', 'json', 'api'];
const SEARCH_PH = { docs: '搜索笔记名称或内容…  / 聚焦', json: '搜索笔记名称或内容…  / 聚焦', api: 'Search request name or URL…  / to focus' };
function hashView() {
  const m = location.hash.match(/^#\/([a-z]+)/);
  return m && VIEWS.includes(m[1]) ? m[1] : null;
}
function switchView(v, silent) {
  if (!VIEWS.includes(v)) v = 'docs';
  if (view === 'docs' && v !== 'docs') flushDocSaves();
  view = v;
  prefs.lastView = v;
  savePrefs();
  query = '';
  const sb = document.getElementById('search');
  if (sb) { sb.value = ''; sb.placeholder = SEARCH_PH[v] || ''; }
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('active', n.dataset.view === v));
  document.querySelectorAll('.view').forEach((s) => s.classList.remove('active'));
  const el = document.getElementById('view-' + v);
  if (el) el.classList.add('active');
  const addBtn = document.getElementById('addBtn'), addLabel = document.getElementById('addLabel');
  const labels = { docs: '新建笔记', json: null, api: null };
  addBtn.style.display = labels[v] ? 'inline-flex' : 'none';
  addLabel.textContent = labels[v] || '';
  if (!silent && hashView() !== v) { try { history.pushState({ v }, '', '#/' + v); } catch (e) {} }
  render();
}
window.addEventListener('popstate', () => { const v = hashView(); if (v && v !== view) switchView(v, true); });
window.addEventListener('hashchange', () => { const v = hashView(); if (v && v !== view) switchView(v, true); });
/* 外层标签页 hash 变化时（复用同一标签页切换工具），同步视图 */
window.addEventListener('message', (e) => {
  if (!e.data || e.data.type !== 'TOOLSX_VIEW' || !initDone) return;
  const v = e.data.view;
  if (v && VIEWS.includes(v) && v !== view) switchView(v, true);
});

function render() {
  if (view === 'docs') renderDocs();
  else if (view === 'json') renderJson();
  else if (view === 'api') renderApi();
}
document.getElementById('search').addEventListener('input', (e) => { query = e.target.value.toLowerCase(); render(); });
document.getElementById('addBtn').addEventListener('click', () => { if (view === 'docs') newNote(null); });
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
    e.preventDefault();
    document.getElementById('search').focus();
  }
});

/* 页面隐藏 / 卸载前，把各工具尚未落盘的数据一次写掉 */
function flushAll() {
  try { flushDocSaves(); } catch (e) {}
  try { flushDocTree(); } catch (e) {}
  try { apiFlush(); } catch (e) {}
  try { flushPrefs(); } catch (e) {}
}
window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });
window.addEventListener('beforeunload', () => flushAll());

/* ---------- 启动 ---------- */
async function boot() {
  await storeInit();
  docsInit(get(STORE.docsIndex), keysByPrefix(DOC_NOTE_PREFIX));
  apiInit({
    index: get(STORE.apiIndex),
    examples: keysByPrefix(API_EXAMPLE_PREFIX),
    session: get(STORE.apiSession),
    draft: get(STORE.apiDraft)
  });
  const p = get(STORE.prefs);
  if (p && typeof p === 'object') Object.assign(prefs, p);
  if (prefs.theme) document.documentElement.dataset.theme = prefs.theme;
  treeCollapsed = !!prefs.docsTree;
  applyTreeCollapsed();
  const v = hashView() || (VIEWS.includes(prefs.lastView) ? prefs.lastView : null) || 'docs';
  switchView(v, true);
  try { if (hashView() !== v) history.replaceState({ v }, '', '#/' + v); } catch (e) {}
}
boot();
