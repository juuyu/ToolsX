(function () {
  const t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
})();

const TAB_ID_KEY = 'toolsxAppTabId';

async function openTool(tool) {
  const url = chrome.runtime.getURL('app-window.html#/' + tool);
  const stored = await chrome.storage.local.get(TAB_ID_KEY);
  const tabId = stored[TAB_ID_KEY];

  if (typeof tabId === 'number') {
    try {
      const tab = await chrome.tabs.get(tabId);
      await chrome.tabs.update(tabId, { url, active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      window.close();
      return;
    } catch (err) {
      await chrome.storage.local.remove(TAB_ID_KEY);
    }
  }

  const tab = await chrome.tabs.create({ url });
  await chrome.storage.local.set({ [TAB_ID_KEY]: tab.id });
  window.close();
}

document.querySelectorAll('[data-tool]').forEach((el) => {
  el.addEventListener('click', () => openTool(el.dataset.tool));
});
