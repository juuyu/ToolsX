/* ============================================================
   Tools-X · Background（MV3 service worker）
   - Todo 提醒调度：chrome.alarms + chrome.notifications
   - 打开完整 Todo 页面（复用固定标签页）
   只写 toolsx.todo.notified（id → 已提醒的 remindAt），
   不改任务列表，避免与工具页 / 悬浮面板的编辑互相覆盖。
============================================================ */
const TASKS_KEY = 'toolsx.todo.tasks';
const NOTIFIED_KEY = 'toolsx.todo.notified';
const ALARM_NAME = 'toolsx-todo-reminder';
const TAB_ID_KEY = 'toolsxAppTabId';
const ICON_URL = 'icons/icon128.png';
const GRACE_MS = 24 * 60 * 60 * 1000; // 超过 24 小时的旧提醒不再补发

/* todo.js 内的同一套计算：截止日期 + 时间（默认 09:00）→ 提前量 */
function remindAtOf(t) {
  if (!t || t.done || !t.due || t.remind === 'none' || t.remind == null) return 0;
  const p = String(t.due).split('-').map(Number);
  if (p.length < 3 || !p[0] || !p[1] || !p[2]) return 0;
  const q = String(t.dueTime || '09:00').split(':').map(Number);
  const d = new Date(p[0], p[1] - 1, p[2], q[0] || 0, q[1] || 0, 0, 0);
  const ts = d.getTime();
  if (isNaN(ts)) return 0;
  return ts - (Number(t.remind) || 0) * 60000;
}

function tasksOf(v) { return Array.isArray(v) ? v : []; }
function notifiedOf(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }

function dueHint(t) {
  if (!t.due) return '';
  const parts = String(t.due).split('-');
  const date = Number(parts[1]) + '月' + Number(parts[2]) + '日';
  return t.dueTime ? date + ' ' + t.dueTime : date;
}

async function readState() {
  const o = await chrome.storage.local.get([TASKS_KEY, NOTIFIED_KEY]);
  return { tasks: tasksOf(o[TASKS_KEY]), notified: notifiedOf(o[NOTIFIED_KEY]) };
}

async function schedule(nextAt) {
  await chrome.alarms.clear(ALARM_NAME);
  if (nextAt > 0) {
    chrome.alarms.create(ALARM_NAME, { when: Math.max(nextAt, Date.now() + 1000) });
  }
}

/* 处理已到点的提醒 + 计算下一条提醒时间 */
async function tick() {
  const { tasks, notified } = await readState();
  const now = Date.now();
  const map = {};
  let nextAt = 0;
  const push = [];
  let dirty = false;

  tasks.forEach((t) => {
    if (!t || !t.id) return;
    const at = remindAtOf(t);
    const id = String(t.id);
    if (!at || at > now) {
      if (at > now && (!nextAt || at < nextAt)) nextAt = at;
      return;
    }
    if (notified[id] === at) return;
    /* 过期太久的提醒只记录、不再补发 */
    if (now - at > GRACE_MS) { map[id] = at; dirty = true; return; }
    map[id] = at;
    dirty = true;
    push.push({ task: t, at: at });
  });

  /* 清理已失效的记录（任务被删 / 时间被改） */
  Object.keys(notified).forEach((id) => {
    if (map[id] !== undefined) return;
    const t = tasks.find((x) => x && String(x.id) === id);
    if (!t || remindAtOf(t) !== notified[id]) dirty = true;
    else map[id] = notified[id];
  });

  if (dirty) {
    try { await chrome.storage.local.set({ [NOTIFIED_KEY]: map }); } catch (e) {}
  }

  push.forEach(({ task, at }) => {
    const title = String(task.title || '未命名任务');
    const notifId = 'toolsx-todo-' + String(task.id) + '-' + at;
    try {
      chrome.notifications.create(notifId, {
        type: 'basic',
        iconUrl: ICON_URL,
        title: 'Tools-X · Todo',
        message: title,
        contextMessage: '待办提醒' + (dueHint(task) ? ' · ' + dueHint(task) : ''),
        priority: 2,
        requireInteraction: false
      });
    } catch (e) {}
  });

  await schedule(nextAt);
}

let tickT = 0;
function tickSoon() {
  clearTimeout(tickT);
  tickT = setTimeout(() => { tickT = 0; tick().catch(() => {}); }, 400);
}

/* 读取上次测试时可能遗留的旧标签页 ID，不可用时清掉 */
async function openTodoPage() {
  const url = chrome.runtime.getURL('app-window.html#/todo');
  let tabId;
  try { tabId = (await chrome.storage.local.get(TAB_ID_KEY))[TAB_ID_KEY]; } catch (e) {}
  if (typeof tabId === 'number') {
    try {
      const tab = await chrome.tabs.get(tabId);
      await chrome.tabs.update(tabId, { url: url, active: true });
      if (tab && tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
      return;
    } catch (e) {
      try { await chrome.storage.local.remove(TAB_ID_KEY); } catch (err) {}
    }
  }
  const tab = await chrome.tabs.create({ url: url });
  try { await chrome.storage.local.set({ [TAB_ID_KEY]: tab.id }); } catch (e) {}
}

chrome.runtime.onInstalled.addListener(() => { tick().catch(() => {}); });
chrome.runtime.onStartup.addListener(() => { tick().catch(() => {}); });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm && alarm.name === ALARM_NAME) tick().catch(() => {});
});

chrome.notifications.onClicked.addListener(() => {
  openTodoPage().catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'TOOLSX_OPEN_TODO') return;
  openTodoPage().then(() => sendResponse && sendResponse({ ok: true })).catch(() => sendResponse && sendResponse({ ok: false }));
  return true;
});

/* 任务被工具页 / 网页悬浮面板修改后重新排期（只关心任务 key，避免自身写入触发循环） */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes && changes[TASKS_KEY]) tickSoon();
});

/* service worker 启动时兜底排期（可能由 alarms 唤醒） */
tick().catch(() => {});
