/* ============================================================
   Tools-X · 本地 PlantUML 文件自动预览（content script）
   在浏览器打开 file:///…/*.puml 时，用离线 SVG 渲染器生成预览页。
   公共外壳见 preview/shell.js，渲染引擎见 core/puml.js。
   需在 chrome://extensions 中为该插件开启「允许访问文件网址」。
============================================================ */
(function () {
  const S = window.TXShell;
  const fullPath = (() => {
    try { return decodeURIComponent(location.pathname); } catch (e) { return location.pathname; }
  })();
  if (!/\.(puml|plantuml)$/i.test(fullPath)) return;

  const THEME_KEY = 'toolsxPumlTheme';
  const fileName = fullPath.split('/').pop() || fullPath;

  let source = '';
  let mounted = false;
  let theme = 'light';

  const ICON_UML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="5" rx="1"></rect><rect x="14" y="16" width="7" height="5" rx="1"></rect><path d="M6.5 8v6.5h14"></path></svg>';

  const PAGE_HTML = S.pageBar(ICON_UML) + `
<div class="tx-wrap">
  <div class="tx-doc tx-doc-puml">
    <div class="tx-puml" id="txPuml"></div>
    <pre class="tx-src tx-hide"></pre>
  </div>
</div>
<div class="tx-toast" id="txToast"></div>`;

  function setMode(next) {
    S.setMode(next, document.getElementById('txPuml'), document.querySelector('.tx-src'));
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

    const pv = document.getElementById('txPuml');
    const svg = source.trim() && typeof renderPuml === 'function' ? renderPuml(source) : '';
    if (svg) pv.innerHTML = '<div class="puml-block">' + svg + '</div>';
    else pv.innerHTML = '<div class="tx-err">无法识别该 PlantUML 内容（支持时序图 / 类图 / 活动图常用语法）</div>';
    document.querySelector('.tx-src').textContent = source;

    theme = S.preferredTheme(THEME_KEY);
    S.applyTheme(THEME_KEY, theme);

    document.querySelector('.tx-seg').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-mode]');
      if (btn) setMode(btn.dataset.mode);
    });
    document.querySelector('.tx-acts').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'copy') S.copyText(source, '已复制 PlantUML 源码');
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
