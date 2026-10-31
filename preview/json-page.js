/* ============================================================
   Tools-X · 本地 JSON / JSONC 文件自动预览（content script）
   在浏览器打开 file:///…/*.json 或 *.jsonc 时，用同一套预览视觉
   生成格式化、语法高亮的预览页，并支持 JSONC 的注释与尾随逗号。
   公共外壳见 preview/shell.js，语法高亮见 core/md-core.js。
   需在 chrome://extensions 中为该插件开启「允许访问文件网址」。
============================================================ */
(function () {
  const S = window.TXShell;
  const fullPath = (() => {
    try { return decodeURIComponent(location.pathname); } catch (e) { return location.pathname; }
  })();
  if (!/\.(json|jsonc)$/i.test(fullPath)) return;

  // JSON 预览独立保存深浅色偏好
  const THEME_KEY = 'toolsxJsonTheme';
  const fileName = fullPath.split('/').pop() || fullPath;
  const isJsonc = /\.jsonc$/i.test(fullPath);

  let source = '';
  let mounted = false;
  let theme = 'light';

  const ICON_JSON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H7a2 2 0 00-2 2v4a2 2 0 01-2 2 2 2 0 012 2v4a2 2 0 002 2h1"></path><path d="M16 3h1a2 2 0 012 2v4a2 2 0 002 2 2 2 0 00-2 2v4a2 2 0 00-2 2h-1"></path></svg>';

  const PAGE_HTML = S.pageBar(ICON_JSON, '<span class="tx-fmt"></span>') + `
<div class="tx-wrap">
  <div class="tx-doc tx-doc-json">
    <div class="tx-err tx-hide" id="txErr"></div>
    <pre class="tx-json" id="txJson"></pre>
    <pre class="tx-src tx-hide"></pre>
  </div>
</div>
<div class="tx-toast" id="txToast"></div>`;

  /* ---------- JSONC 解析支持 ---------- */
  /* 去掉注释与尾随逗号后再次校验，字符串内容不会被误伤 */
  function stripJsonc(src) {
    let out = '';
    let i = 0;
    let inStr = false;
    let esc = false;
    const n = src.length;
    while (i < n) {
      const c = src[i];
      if (inStr) {
        out += c;
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        i++;
        continue;
      }
      if (c === '"') { inStr = true; out += c; i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') {
        i += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
        i += 2;
        continue;
      }
      if (c === ',') {
        let j = i + 1;
        while (j < n) {
          if (' \t\n\r'.includes(src[j])) { j++; continue; }
          if (src[j] === '/' && src[j + 1] === '/') { while (j < n && src[j] !== '\n') j++; continue; }
          if (src[j] === '/' && src[j + 1] === '*') {
            j += 2;
            while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++;
            j += 2;
            continue;
          }
          break;
        }
        if (src[j] === '}' || src[j] === ']') { i++; continue; }
      }
      out += c;
      i++;
    }
    return out;
  }

  function tokenize(src) {
    const tk = [];
    let i = 0;
    const n = src.length;
    while (i < n) {
      const c = src[i];
      if (' \t\n\r'.includes(c)) { i++; continue; }
      if (c === '/' && src[i + 1] === '/') {
        let j = i;
        while (j < n && src[j] !== '\n') j++;
        tk.push({ t: 'c', v: src.slice(i, j) });
        i = j;
        continue;
      }
      if (c === '/' && src[i + 1] === '*') {
        let j = i + 2;
        while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++;
        j = Math.min(j + 2, n);
        tk.push({ t: 'c', v: src.slice(i, j) });
        i = j;
        continue;
      }
      if (c === '"') {
        let j = i + 1;
        let esc = false;
        while (j < n) {
          const d = src[j];
          if (esc) esc = false;
          else if (d === '\\') esc = true;
          else if (d === '"') { j++; break; }
          j++;
        }
        tk.push({ t: 's', v: src.slice(i, j) });
        i = j;
        continue;
      }
      if ('{}[],:'.includes(c)) { tk.push({ t: 'p', v: c }); i++; continue; }
      let j = i;
      while (j < n && !' \t\n\r{}[],:'.includes(src[j]) && !(src[j] === '/' && (src[j + 1] === '/' || src[j + 1] === '*'))) j++;
      if (j === i) j++;
      tk.push({ t: 'v', v: src.slice(i, j) });
      i = j;
    }
    return tk;
  }

  /* ---------- 可折叠节点树 ---------- */
  /* 把 token 还原为树结构，注释作为独立节点保留 */
  function parseTree(tk) {
    let i = 0;
    function value() {
      const t = tk[i];
      if (!t) return { t: 'lit', v: '' };
      if (t.t === 'p' && t.v === '{') { i++; return obj(); }
      if (t.t === 'p' && t.v === '[') { i++; return arr(); }
      i++;
      return { t: t.t === 's' ? 'str' : 'lit', v: t.v };
    }
    function obj() {
      const items = [];
      while (i < tk.length) {
        const t = tk[i];
        if (t.t === 'c') { items.push({ t: 'comment', v: t.v }); i++; continue; }
        if (t.t === 'p' && t.v === '}') { i++; break; }
        if (t.t === 'p' && t.v === ',') { i++; continue; }
        if (t.t === 's') {
          const key = t.v;
          i++;
          while (tk[i] && tk[i].t === 'c') { items.push({ t: 'comment', v: tk[i].v }); i++; }
          if (tk[i] && tk[i].t === 'p' && tk[i].v === ':') i++;
          while (tk[i] && tk[i].t === 'c') { items.push({ t: 'comment', v: tk[i].v }); i++; }
          items.push({ t: 'kv', key, val: value() });
          continue;
        }
        i++;
      }
      return { t: 'obj', items };
    }
    function arr() {
      const items = [];
      while (i < tk.length) {
        const t = tk[i];
        if (t.t === 'c') { items.push({ t: 'comment', v: t.v }); i++; continue; }
        if (t.t === 'p' && t.v === ']') { i++; break; }
        if (t.t === 'p' && t.v === ',') { i++; continue; }
        items.push({ t: 'val', val: value() });
      }
      return { t: 'arr', items };
    }
    return value();
  }

  function commentHtml(v, depth) {
    const pad = '  '.repeat(depth);
    return v.split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => '\n' + pad + '<span class="ck-c">' + esc(line) + '</span>')
      .join('');
  }

  function nodeHtml(node, depth, comma, prefix) {
    const pad = '  '.repeat(depth);
    const pre = prefix || '';
    const post = comma ? ',' : '';
    if (node.t === 'str' || node.t === 'lit') {
      return '\n' + pad + pre + hiCode(node.v, 'json') + post;
    }

    const isArr = node.t === 'arr';
    const open = isArr ? '[' : '{';
    const close = isArr ? ']' : '}';
    const real = node.items.filter((it) => it.t !== 'comment');
    if (!node.items.length) return '\n' + pad + pre + open + close + post;

    const countHtml = isArr ? '<span class="jt-count"> // ' + real.length + ' item</span>' : '';
    let s = '\n' + pad
      + '<span class="jt-node">'
      + '<span class="jt-car" title="收起 / 展开">▾</span>'
      + '<span class="jt-h">' + pre + open + '</span>'
      + '<span class="jt-ell">' + pre + open + ' … ' + close + '</span>'
      + countHtml
      + '<span class="jt-kids">';
    node.items.forEach((it, idx) => {
      const later = node.items.slice(idx + 1).some((x) => x.t !== 'comment');
      s += itemHtml(it, depth + 1, later);
    });
    s += '</span>'
      + '<span class="jt-cl">\n' + pad + close + post + '</span>'
      + '</span>';
    return s;
  }

  function itemHtml(it, depth, comma) {
    if (it.t === 'comment') return commentHtml(it.v, depth);
    if (it.t === 'kv') {
      return nodeHtml(it.val, depth, comma, '<span class="ck-k">' + esc(it.key) + '</span>: ');
    }
    return nodeHtml(it.val, depth, comma, '');
  }

  function renderJson(src) {
    return nodeHtml(parseTree(tokenize(src)), 0, false, '').replace(/^\n/, '');
  }

  function countKeys(v) {
    let c = 0;
    const walk = (x) => {
      if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === 'object') Object.keys(x).forEach((k) => { c++; walk(x[k]); });
    };
    walk(v);
    return c;
  }

  function setMode(next) {
    S.setMode(next, document.getElementById('txJson'), document.querySelector('.tx-src'));
  }

  function mount() {
    mounted = true;
    document.documentElement.dataset.toolsxPreview = '';
    document.body.className = 'tx-body';
    document.body.innerHTML = PAGE_HTML;

    const nameEl = document.querySelector('.tx-file-name');
    nameEl.textContent = fileName;
    nameEl.title = fileName;
    document.querySelector('.tx-file-path').textContent = fullPath;
    document.title = fileName + ' · Tools-X';
    document.querySelector('.tx-fmt').textContent = isJsonc ? 'JSONC' : 'JSON';

    let valid = false;
    let errMsg = '';
    let keyCount = 0;
    if (source.trim()) {
      try {
        const obj = JSON.parse(stripJsonc(source));
        valid = true;
        keyCount = countKeys(obj);
      } catch (e) {
        errMsg = e.message;
      }
    }

    document.querySelector('.tx-stat').textContent = S.stats(source) + (valid ? ' · ' + keyCount + ' 键' : '');
    const jsonEl = document.getElementById('txJson');
    jsonEl.innerHTML = valid ? renderJson(source) : hiCode(source, 'json');
    document.querySelector('.tx-src').textContent = source;

    const errEl = document.getElementById('txErr');
    if (errMsg) {
      errEl.textContent = '✗ 不是合法 ' + (isJsonc ? 'JSONC' : 'JSON') + '：' + errMsg;
      errEl.classList.remove('tx-hide');
    }

    theme = S.preferredTheme(THEME_KEY);
    S.applyTheme(THEME_KEY, theme);

    jsonEl.addEventListener('click', (e) => {
      const hit = e.target.closest('.jt-car, .jt-h, .jt-ell, .jt-count');
      if (!hit) return;
      const node = hit.closest('.jt-node');
      if (node) node.classList.toggle('closed');
    });

    document.querySelector('.tx-seg').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-mode]');
      if (btn) setMode(btn.dataset.mode);
    });
    document.querySelector('.tx-acts').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'copy') S.copyText(source, '已复制 JSON 源码');
      else if (btn.dataset.act === 'theme') {
        theme = theme === 'dark' ? 'light' : 'dark';
        S.applyTheme(THEME_KEY, theme);
        S.toast(theme === 'dark' ? '已切换到暗色模式' : '已切换到浅色模式');
      }
    });
  }

  function boot() {
    if (mounted) return;
    source = S.readSource();
    if (!source.trim() && document.readyState !== 'complete') {
      window.addEventListener('load', boot, { once: true });
      return;
    }
    mount();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
