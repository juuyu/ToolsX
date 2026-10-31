/* ============================================================
   Tools-X · 通用 UI 组件（所有工具复用）
   - 自定义下拉：替代原生 select，风格与页面一致
   - 文本输入弹窗：新建 / 重命名等命名场景
   - 文本文件下载：插件内交给扩展页，独立打开时退回 Blob
   依赖 core.js（openModal / closeModal / toast / esc / EMBEDDED）
============================================================ */
const ICO_X = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';

/* ---------- 自定义下拉 ---------- */
let cselOpenId = null;
function cselToggle(id) {
  const root = document.getElementById(id);
  if (!root) return;
  const open = !root.classList.contains('open');
  cselClose();
  if (open) { root.classList.add('open'); cselOpenId = id; }
}
function cselClose() {
  document.querySelectorAll('.csel.open').forEach((r) => r.classList.remove('open'));
  cselOpenId = null;
}
function cselValue(id, value) {
  const root = document.getElementById(id);
  if (!root) return;
  const v = String(value);
  root.dataset.value = v;
  root.querySelectorAll('.csel-opt').forEach((o) => {
    const on = o.dataset.value === v;
    o.classList.toggle('on', on);
    if (on) {
      const lbl = root.querySelector('.csel-val');
      if (lbl) lbl.textContent = o.dataset.label || o.textContent.trim();
    }
  });
  if (root.classList.contains('csel-method')) {
    root.classList.remove('m-get', 'm-post', 'm-put', 'm-patch', 'm-delete', 'm-head', 'm-options');
    root.classList.add('m-' + v.toLowerCase());
  }
}
function cselSelect(id, value) { cselClose(); cselValue(id, value); }
document.addEventListener('mousedown', (e) => { if (cselOpenId && !e.target.closest('.csel')) cselClose(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && cselOpenId) cselClose(); });

/* ---------- 文本输入弹窗 ---------- */
let promptCb = null;
let promptEmpty = '';
function promptText(opts, cb) {
  const o = opts || {};
  promptCb = cb;
  promptEmpty = o.empty || '请输入内容';
  openModal(`
  <div class="modal-head"><h3>${esc(o.title || '')}</h3><button class="icon-btn" onclick="closeModal()">${ICO_X}</button></div>
  <div class="modal-body"><div class="field"><label>${esc(o.label || 'Name')}</label><input id="f-prompt" value="${esc(o.value || '')}" placeholder="${esc(o.placeholder || '')}"></div></div>
  <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">${esc(o.cancel || 'Cancel')}</button><button class="btn btn-accent" onclick="submitPromptText()">${esc(o.ok || 'OK')}</button></div>`);
  setTimeout(() => {
    const inp = document.getElementById('f-prompt');
    if (inp) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitPromptText(); } });
  }, 60);
}
function submitPromptText() {
  const el = document.getElementById('f-prompt');
  const v = el ? el.value.trim() : '';
  if (!v) { toast(promptEmpty); return; }
  closeModal();
  const cb = promptCb;
  promptCb = null;
  if (cb) cb(v);
}

/* ---------- 文本文件下载 ---------- */
function downloadText(filename, text, mime) {
  const type = mime || 'application/json;charset=utf-8';
  if (EMBEDDED) {
    try { window.parent.postMessage({ type: 'TOOLSX_DOWNLOAD', filename: filename, text: text, mime: type }, '*'); } catch (e) {}
    return;
  }
  const blob = new Blob([text], { type: type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 4000);
}
