const STORE_PREFIX = 'toolsx';
const LEGACY_KEYS = ['toolsxData', 'aihubData'];
const frame = document.getElementById('appFrame');

/* 读取所有以 toolsx 开头的 key（各工具的数据按 key 分开存放） */
async function readStore() {
  const out = {};
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const all = await chrome.storage.local.get(null);
    Object.keys(all || {}).forEach((k) => {
      if (k.indexOf(STORE_PREFIX) === 0 || LEGACY_KEYS.indexOf(k) >= 0) out[k] = all[k];
    });
  } else {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.indexOf(STORE_PREFIX) !== 0 && LEGACY_KEYS.indexOf(k) < 0) continue;
        try { out[k] = JSON.parse(localStorage.getItem(k)); } catch (e) { out[k] = localStorage.getItem(k); }
      }
    } catch (e) {}
  }
  return out;
}

/* 逐 key 覆盖写入：只改动真正变化的那部分数据 */
function writeStore(patch) {
  const map = patch || {};
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.set(map);
    return;
  }
  try { Object.keys(map).forEach((k) => localStorage.setItem(k, JSON.stringify(map[k]))); } catch (e) {}
}

function removeStore(keys) {
  const list = Array.isArray(keys) ? keys : [];
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    chrome.storage.local.remove(list);
    return;
  }
  try { list.forEach((k) => localStorage.removeItem(k)); } catch (e) {}
}

let initSent = false;
const apiCtl = new Map();
const API_TIMEOUT = 30000;
const API_BODY_LIMIT = 3 * 1024 * 1024;

async function sendInit() {
  if (initSent) return;
  initSent = true;
  const stored = await readStore();
  frame.contentWindow?.postMessage({ type: 'TOOLSX_INIT', keys: stored }, '*');
}

/* Postman 请求在扩展页面内执行，借助 host_permissions 绕过 CORS */
async function runHttp(data) {
  const { id, req } = data || {};
  if (!req || !req.url) return;
  const ctl = new AbortController();
  const entry = { ctl, timedOut: false, timer: 0 };
  apiCtl.set(id, entry);
  entry.timer = setTimeout(() => { entry.timedOut = true; ctl.abort(); }, API_TIMEOUT);
  const started = performance.now();
  try {
    const init = {
      method: req.method || 'GET',
      headers: req.headers || {},
      signal: ctl.signal,
      redirect: 'follow',
      credentials: 'omit'
    };
    if (req.body != null && init.method !== 'GET' && init.method !== 'HEAD') init.body = req.body;
    const res = await fetch(req.url, init);
    let text = await res.text();
    let truncated = false;
    if (text.length > API_BODY_LIMIT) { text = text.slice(0, API_BODY_LIMIT); truncated = true; }
    const headers = [];
    res.headers.forEach((v, k) => headers.push([k, v]));
    frame.contentWindow?.postMessage({
      type: 'TOOLSX_HTTP_RES', id,
      status: res.status, statusText: res.statusText,
      headers, body: text, truncated,
      duration: Math.round(performance.now() - started)
    }, '*');
  } catch (err) {
    const cancelled = !entry.timedOut && err && err.name === 'AbortError';
    frame.contentWindow?.postMessage({
      type: 'TOOLSX_HTTP_RES', id,
      error: entry.timedOut ? '请求超时（30 秒）' : (cancelled ? '请求已取消' : (err.message || '请求失败')),
      cancelled
    }, '*');
  } finally {
    clearTimeout(entry.timer);
    apiCtl.delete(id);
  }
}

/* sandbox 页面无法直接下载文件，由扩展页面负责落盘 */
function downloadFile(data) {
  const { filename, text, mime } = data || {};
  const blob = new Blob([text == null ? '' : String(text)], { type: mime || 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'download.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) {} }, 4000);
}

window.addEventListener('message', (e) => {
  if (e.source !== frame.contentWindow) return;
  const data = e.data || {};
  if (data.type === 'TOOLSX_PATCH') writeStore(data.patch);
  else if (data.type === 'TOOLSX_REMOVE') removeStore(data.keys);
  else if (data.type === 'TOOLSX_COPY') {
    navigator.clipboard.writeText(data.text).catch(() => {});
  }
  else if (data.type === 'TOOLSX_DOWNLOAD') downloadFile(data);
  else if (data.type === 'TOOLSX_READY') sendInit();
  else if (data.type === 'TOOLSX_HTTP') runHttp(data);
  else if (data.type === 'TOOLSX_HTTP_ABORT') {
    const entry = apiCtl.get(data.id);
    if (entry) { entry.timedOut = false; entry.ctl.abort(); }
  }
});

frame.addEventListener('load', sendInit);

// 标签页已存在时再次从浮窗打开，仅 hash 变化，通知 iframe 切换工具
window.addEventListener('hashchange', () => {
  const m = location.hash.match(/^#\/?([a-z]+)/);
  if (m) frame.contentWindow?.postMessage({ type: 'TOOLSX_VIEW', view: m[1] }, '*');
});

frame.src = 'app.html' + (location.hash || '#/docs');
