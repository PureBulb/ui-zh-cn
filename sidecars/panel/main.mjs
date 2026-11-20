import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Response, SidecarApp } from 'sidecar_sdk';

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(HERE, '..', '..');
const DICT_FILE = join(PLUGIN_ROOT, 'dict.json');
const DATA_DIR = process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR
  || join(os.homedir(), '.gemini', 'antigravity', 'sidecar_data', 'ui-zh-cn', 'panel', 'data');
const SETTINGS_FILE = join(DATA_DIR, 'settings.json');

const app = new SidecarApp();
const readLocal = (name) => readFileSync(join(HERE, name), 'utf8');

app.page('/', () => readLocal('index.html'));
app.page('/app.js', () => readLocal('app.js'));
app.api('/styles.css', () => new Response(readLocal('styles.css'), { contentType: 'text/css' }), 'GET');

let lastCdpStatus = { connected: false, port: null, pages: 0, error: null };

function getDevToolsPortFile() {
  const candidates = [
    join(os.homedir(), '.config', 'Antigravity', 'DevToolsActivePort'),
    join(os.homedir(), 'Library', 'Application Support', 'Antigravity', 'DevToolsActivePort'),
    join(process.env.APPDATA || '', 'Antigravity', 'DevToolsActivePort'),
  ];
  return candidates.find((p) => p && existsSync(p)) || null;
}

function getDevToolsPort() {
  const f = getDevToolsPortFile();
  if (!f) return null;
  try {
    const firstLine = readFileSync(f, 'utf8').trim().split(/\r?\n/)[0].trim();
    const port = Number(firstLine);
    return Number.isFinite(port) && port > 0 ? port : null;
  } catch (_) {
    return null;
  }
}

function cdpEval(wsUrl, expression, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ws = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { ws.close(); } catch (_) {}
        reject(new Error('CDP eval timeout'));
      }
    }, timeoutMs);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true },
      }));
    };
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(String(evt.data));
        if (msg.id === 1 && !settled) {
          settled = true;
          clearTimeout(timer);
          ws.close();
          resolve(msg.result?.result?.value);
        }
      } catch (_) {}
    };
    ws.onerror = (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error('WebSocket error'));
      }
    };
  });
}

function loadSettings() {
  const defaults = { enabled: true, customDict: {} };
  if (!existsSync(SETTINGS_FILE)) return defaults;
  try {
    const parsed = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'));
    return {
      enabled: parsed.enabled !== false,
      customDict: (parsed.customDict && typeof parsed.customDict === 'object') ? parsed.customDict : {},
    };
  } catch (_) {
    return defaults;
  }
}

function saveSettings(next) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function loadBuiltInDict() {
  try {
    if (existsSync(DICT_FILE)) {
      return JSON.parse(readFileSync(DICT_FILE, 'utf8'));
    }
  } catch (_) {}
  return { exact: {}, patterns: [] };
}

function buildRendererScript(payload) {
  const jsonPayload = JSON.stringify(payload);
  return `
(function applyAgyZhCn(cfg) {
  try {
    const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'CODE', 'PRE', 'TEXTAREA', 'INPUT', 'SVG', 'CANVAS', 'IFRAME']);
    const SKIP_SELECTOR = 'pre, code, textarea, input, [contenteditable="true"], .monaco-editor, .cm-editor, .katex, .markdown-body, .prose';

    if (!window.__AGY_ZH_CN__) {
      window.__AGY_ZH_CN__ = {
        origText: new WeakMap(),
        origAttrs: new WeakMap(),
        observer: null,
        rafId: null,
        cfg: null,
        compiledPatterns: [],
        version: 0,
      };
    }

    const state = window.__AGY_ZH_CN__;
    state.cfg = cfg;
    state.version = Date.now();
    state.compiledPatterns = (cfg.patterns || []).map((p) => {
      try { return { re: new RegExp(p.regex), rep: p.replace }; } catch (_) { return null; }
    }).filter(Boolean);

    function shouldSkipElement(el) {
      if (!el || el.nodeType !== 1) return false;
      if (SKIP_TAGS.has(el.tagName)) return true;
      if (el.closest && el.closest(SKIP_SELECTOR)) return true;
      return false;
    }

    function translateString(str) {
      if (!str || typeof str !== 'string') return null;
      const trimmed = str.trim();
      if (!trimmed || trimmed.length > 800) return null;
      const normalized = trimmed.replace(/\s+/g, ' ');
      if (state.cfg.exact) {
        const mapped = Object.prototype.hasOwnProperty.call(state.cfg.exact, trimmed)
          ? state.cfg.exact[trimmed]
          : (Object.prototype.hasOwnProperty.call(state.cfg.exact, normalized) ? state.cfg.exact[normalized] : null);
        if (mapped && mapped !== trimmed) {
          return str.replace(trimmed, mapped);
        }
      }
      for (const pat of state.compiledPatterns) {
        if (pat.re.test(normalized)) {
          const mapped = normalized.replace(pat.re, pat.rep);
          if (mapped !== normalized) return str.replace(trimmed, mapped);
        }
      }
      return null;
    }

    function restoreAll() {
      const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (state.origText.has(node)) {
          const orig = state.origText.get(node);
          if (node.nodeValue !== orig) node.nodeValue = orig;
          state.origText.delete(node);
        }
      }
      const els = document.querySelectorAll('[placeholder],[aria-label],[title]');
      for (const el of els) {
        const saved = state.origAttrs.get(el);
        if (saved) {
          for (const [k, v] of Object.entries(saved)) {
            if (el.getAttribute(k) !== v) el.setAttribute(k, v);
          }
          state.origAttrs.delete(el);
        }
      }
    }

    function walkAndTranslate(root) {
      if (!root || !state.cfg || !state.cfg.enabled) return;

      if (root.nodeType === Node.TEXT_NODE) {
        const parent = root.parentElement;
        if (!parent || shouldSkipElement(parent)) return;
        const base = state.origText.has(root) ? state.origText.get(root) : root.nodeValue;
        const next = translateString(base);
        if (next && root.nodeValue !== next) {
          if (!state.origText.has(root)) state.origText.set(root, base);
          root.nodeValue = next;
        }
        return;
      }

      if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
      if (root.nodeType === Node.ELEMENT_NODE && shouldSkipElement(root)) return;

      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          if (n.parentElement && shouldSkipElement(n.parentElement)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });

      let textNode;
      while ((textNode = walker.nextNode())) {
        const base = state.origText.has(textNode) ? state.origText.get(textNode) : textNode.nodeValue;
        const next = translateString(base);
        if (next && textNode.nodeValue !== next) {
          if (!state.origText.has(textNode)) state.origText.set(textNode, base);
          textNode.nodeValue = next;
        }
      }

      const targetEls = root.querySelectorAll ? root.querySelectorAll('[placeholder],[aria-label],[title]') : [];
      for (const el of targetEls) {
        if (el.closest && el.closest('.monaco-editor, .cm-editor')) continue;
        for (const attr of ['placeholder', 'aria-label', 'title']) {
          const val = el.getAttribute(attr);
          if (!val) continue;
          const saved = state.origAttrs.get(el) || {};
          const base = Object.prototype.hasOwnProperty.call(saved, attr) ? saved[attr] : val;
          const next = translateString(base);
          if (next && val !== next) {
            saved[attr] = base;
            state.origAttrs.set(el, saved);
            el.setAttribute(attr, next);
          }
        }
      }
    }

    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }

    if (!cfg.enabled) {
      restoreAll();
      return 'restored';
    }

    const pendingNodes = new Set();
    function scheduleFlush() {
      if (state.rafId) return;
      state.rafId = requestAnimationFrame(() => {
        state.rafId = null;
        if (!state.cfg || !state.cfg.enabled) return;
        for (const n of pendingNodes) {
          if (document.contains(n)) walkAndTranslate(n);
        }
        pendingNodes.clear();
      });
    }

    walkAndTranslate(document.body || document.documentElement);

    state.observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'childList') {
          for (const node of m.addedNodes) {
            if (node.nodeType === 1 || node.nodeType === 3) pendingNodes.add(node);
          }
        } else if (m.type === 'characterData' && m.target) {
          pendingNodes.add(m.target);
        }
      }
      if (pendingNodes.size > 0) scheduleFlush();
    });

    if (document.body) {
      state.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }
    return 'applied';
  } catch (e) {
    return 'error:' + (e && e.message ? e.message : String(e));
  }
})(${jsonPayload});
`;
}

async function applyToMainWindows(forceDisable = false) {
  const port = getDevToolsPort();
  if (!port) {
    lastCdpStatus = { connected: false, port: null, pages: 0, error: '未检测到 DevToolsActivePort' };
    return lastCdpStatus;
  }

  try {
    const res = await fetch(`http://127.0.0.1:${port}/json`);
    const targets = await res.json();
    const pages = targets.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl && !String(t.url || '').startsWith('devtools://'));

    const settings = loadSettings();
    const builtIn = loadBuiltInDict();
    const payload = {
      enabled: forceDisable ? false : settings.enabled,
      exact: Object.assign({}, builtIn.exact || {}, settings.customDict || {}),
      patterns: Array.isArray(builtIn.patterns) ? builtIn.patterns : [],
    };

    const script = buildRendererScript(payload);
    for (const page of pages) {
      await cdpEval(page.webSocketDebuggerUrl, script).catch(() => {});
    }

    lastCdpStatus = { connected: pages.length > 0, port, pages: pages.length, error: null };
    return lastCdpStatus;
  } catch (err) {
    lastCdpStatus = { connected: false, port, pages: 0, error: err.message };
    return lastCdpStatus;
  }
}

async function ensureInjectedLoop() {
  const port = getDevToolsPort();
  if (!port) return;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json`);
    const targets = await res.json();
    const pages = targets.filter((t) => t.type === 'page' && t.webSocketDebuggerUrl && !String(t.url || '').startsWith('devtools://'));
    for (const page of pages) {
      const alive = await cdpEval(page.webSocketDebuggerUrl, 'Boolean(window.__AGY_ZH_CN__)').catch(() => false);
      if (!alive) {
        await applyToMainWindows(false);
        break;
      }
    }
    lastCdpStatus = { connected: pages.length > 0, port, pages: pages.length, error: null };
  } catch (_) {}
}

// APIs
app.api('/api/state', async () => {
  const settings = loadSettings();
  const builtIn = loadBuiltInDict();
  if (!lastCdpStatus.connected) {
    await applyToMainWindows(false);
  }
  return {
    settings,
    builtInCount: Object.keys(builtIn.exact || {}).length,
    customCount: Object.keys(settings.customDict).length,
    runtime: { hookActive: lastCdpStatus.connected, port: lastCdpStatus.port, pages: lastCdpStatus.pages },
  };
}, 'GET');

app.api('/api/toggle', async (data) => {
  const current = loadSettings();
  current.enabled = Boolean(data.enabled);
  saveSettings(current);
  await applyToMainWindows(false);
  return { ok: true, settings: current };
});

app.api('/api/custom-dict/set', async (data) => {
  const en = String(data.en ?? '').trim();
  const zh = String(data.zh ?? '').trim();
  if (!en || !zh) {
    return new Response(JSON.stringify({ error: '英文和中文词条均不能为空' }), {
      contentType: 'application/json',
      status: 400,
    });
  }
  const current = loadSettings();
  current.customDict[en] = zh;
  saveSettings(current);
  await applyToMainWindows(false);
  return { ok: true, settings: current };
});

app.api('/api/custom-dict/delete', async (data) => {
  const en = String(data.en ?? '').trim();
  const current = loadSettings();
  delete current.customDict[en];
  saveSettings(current);
  await applyToMainWindows(false);
  return { ok: true, settings: current };
});

// Clean restore when plugin is disabled / sidecar stops
async function shutdown() {
  try { await applyToMainWindows(true); } catch (_) {}
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

app.run();

// Initial injection & gentle self-healing watcher (handles page reloads or new windows)
setTimeout(() => { applyToMainWindows(false); }, 400);
setInterval(ensureInjectedLoop, 60000);
