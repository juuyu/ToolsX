/* ============================================================
   Tools-X · 本地 Markdown 文件自动预览（content script）
   在浏览器打开 file:///…/*.md 时，用 Docs 同款渲染引擎生成预览页。
   公共外壳见 preview/shell.js，渲染引擎见 core/md-core.js。
   需在 chrome://extensions 中为该插件开启「允许访问文件网址」。
============================================================ */
(function () {
  const S = window.TXShell;
  const fullPath = (() => {
    try { return decodeURIComponent(location.pathname); } catch (e) { return location.pathname; }
  })();
  if (!/\.(md|markdown|mdx)$/i.test(fullPath)) return;

  const THEME_KEY = 'toolsxMdTheme';
  const TOC_KEY = 'toolsxMdToc';
  const fileName = fullPath.split('/').pop() || fullPath;

  let source = '';
  let mounted = false;
  let theme = 'light';
  let tocCollapsed = false;

  const ICON_DOC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="13" y2="17"></line></svg>';

  const PAGE_HTML = S.pageBar(ICON_DOC, `<button type="button" class="tx-btn" data-act="pdf" title="导出 PDF" aria-label="导出 PDF">${S.ICON_PRINT}</button>`) + `
<div class="tx-wrap">
  <div class="tx-doc">
    <div class="tx-md"></div>
    <pre class="tx-src tx-hide"></pre>
  </div>
  <aside class="tx-toc tx-hide" id="txToc">
    <button type="button" class="tx-rail" data-act="toc-toggle" title="展开目录">${S.ICON_CHEV_L}<span>目录</span></button>
    <div class="tx-toc-panel">
      <div class="tx-toc-head"><span>目录</span><button type="button" class="tx-toc-btn" data-act="toc-toggle" title="收起目录">${S.ICON_CHEV_R}</button></div>
      <div class="tx-toc-list" id="txTocList"></div>
    </div>
  </aside>
</div>
<div class="tx-toast" id="txToast"></div>`;

  function setMode(next) {
    S.setMode(next, document.querySelector('.tx-md'), document.querySelector('.tx-src'));
  }

  /* ---------- 标题树 ---------- */
  function setTocCollapsed(v) {
    tocCollapsed = v;
    document.getElementById('txToc').classList.toggle('collapsed', v);
    try { localStorage.setItem(TOC_KEY, v ? '1' : '0'); } catch (e) {}
  }

  function buildToc() {
    const toc = document.getElementById('txToc');
    const list = document.getElementById('txTocList');
    const headings = mdOutline(document.querySelector('.tx-md'), 'tx-h-');
    list.innerHTML = headings.length ? tocHtml(headings) : '';
    toc.classList.toggle('tx-hide', !headings.length);
    try { tocCollapsed = localStorage.getItem(TOC_KEY) === '1'; } catch (e) {}
    toc.classList.toggle('collapsed', tocCollapsed);
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
    document.querySelector('.tx-stat').textContent = S.stats(source);
    document.querySelector('.tx-md').innerHTML = mdRender(source);
    document.querySelector('.tx-src').textContent = source;

    theme = S.preferredTheme(THEME_KEY);
    S.applyTheme(THEME_KEY, theme);
    buildToc();

    document.querySelector('.tx-seg').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-mode]');
      if (btn) setMode(btn.dataset.mode);
    });
    document.querySelector('.tx-acts').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'copy') S.copyText(source, '已复制 Markdown 源码');
      else if (btn.dataset.act === 'pdf') {
        const view = document.querySelector('.tx-md');
        if (!view || (typeof mdPrintHtml !== 'function') || !mdPrintHtml(view.innerHTML)) S.toast('当前环境不支持打印');
      }
      else if (btn.dataset.act === 'theme') {
        theme = theme === 'dark' ? 'light' : 'dark';
        S.applyTheme(THEME_KEY, theme);
        S.toast(theme === 'dark' ? '已切换到暗色模式' : '已切换到浅色模式');
      }
    });
    document.getElementById('txToc').addEventListener('click', (e) => {
      if (e.target.closest('[data-act="toc-toggle"]')) {
        setTocCollapsed(!tocCollapsed);
        return;
      }
      const it = e.target.closest('.toc-item');
      if (it) {
        const el = document.getElementById(it.dataset.h);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  function boot() {
    if (mounted) return;
    source = S.readSource();
    if (!source.trim()) {
      // 纯文本尚未写入（例如仍在加载），等 load 再试一次；若始终为空则不做替换
      if (document.readyState !== 'complete') {
        window.addEventListener('load', boot, { once: true });
      }
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
