/* ============================================================
   Tools-X · 本地文件预览页公共外壳
   Markdown / JSON 两个 content script 共用：深浅色、读取原文、
   文件统计、复制、预览/源码切换、工具栏 HTML。
   挂载前由各页面脚本注入 window.TXShell。
============================================================ */
(function () {
  const ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"></rect><path d="M5 15V5a2 2 0 012-2h10"></path></svg>';
  const ICON_MOON = '<svg class="tx-i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"></path></svg>';
  const ICON_SUN = '<svg class="tx-i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path></svg>';
  const ICON_CHEV_R = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
  const ICON_CHEV_L = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';

  let toastT = 0;

  function preferredTheme(key) {
    try {
      const saved = localStorage.getItem(key);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (e) {}
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function applyTheme(key, t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem(key, t); } catch (e) {}
  }

  /* Chrome 以纯文本渲染本地文件，正文位于 <pre> 中 */
  function readSource() {
    if (!document.body) return '';
    const pre = document.body.querySelector('pre');
    return (pre ? pre.textContent : document.body.textContent || '')
      .replace(/\r\n?/g, '\n')
      .replace(/^\uFEFF/, '');
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function stats(text) {
    const t = String(text || '');
    const lines = t.trim() ? t.replace(/\n$/, '').split('\n').length : 0;
    let bytes = t.length;
    try { bytes = new TextEncoder().encode(t).length; } catch (e) {}
    return lines + ' 行 · ' + formatSize(bytes);
  }

  function toast(msg) {
    const el = document.getElementById('txToast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove('show'), 1800);
  }

  function copyText(text, doneMsg) {
    const done = () => toast(doneMsg);
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { if (document.execCommand('copy')) done(); } catch (e) {}
      ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
      return;
    }
    fallback();
  }

  function setMode(next, viewEl, srcEl) {
    if (next !== 'view' && next !== 'src') return;
    document.querySelectorAll('.tx-seg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === next));
    if (viewEl) viewEl.classList.toggle('tx-hide', next !== 'view');
    if (srcEl) srcEl.classList.toggle('tx-hide', next !== 'src');
  }

  /* 顶部工具栏：文件信息 + 可选附加信息 + 模式切换 / 复制 / 主题 */
  function pageBar(iconHtml, extraHtml) {
    return `
<div class="tx-bar">
  <div class="tx-file">
    <span class="tx-file-ico">${iconHtml}</span>
    <span class="tx-file-txt">
      <span class="tx-file-name"></span>
      <span class="tx-file-path"></span>
    </span>
  </div>
  <div class="tx-acts">
    ${extraHtml || ''}
    <span class="tx-stat"></span>
    <div class="tx-seg">
      <button type="button" data-mode="view" class="on">预览</button>
      <button type="button" data-mode="src">源码</button>
    </div>
    <button type="button" class="tx-btn" data-act="copy" title="复制源码" aria-label="复制源码">${ICON_COPY}</button>
    <button type="button" class="tx-btn" data-act="theme" title="切换深浅模式" aria-label="切换深浅模式">${ICON_MOON}${ICON_SUN}</button>
  </div>
</div>`;
  }

  window.TXShell = {
    ICON_CHEV_R, ICON_CHEV_L,
    preferredTheme, applyTheme, readSource, formatSize, stats,
    toast, copyText, setMode, pageBar
  };
})();
