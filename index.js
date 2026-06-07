(() => {
  "use strict";

  const W = window;
  const D = document;
  const S = W.localStorage;

  if (W.__ATLAS_SECURITY_BOOTSTRAPPED__) return;
  W.__ATLAS_SECURITY_BOOTSTRAPPED__ = true;

  if (typeof W.__ATLAS_CORE_LOADED__ !== "boolean") W.__ATLAS_CORE_LOADED__ = false;

  const CFG_IN = W.AtlasToolsConfig && typeof W.AtlasToolsConfig === "object" ? W.AtlasToolsConfig : {};

  const CFG = {
    tamper: false,
    host: false,
    domainLock: false,
    loaderMin: 2500,
    rightClick: false,
    devtools: false,
    themeDefault: "dark",
    cookieKey: "theme",
    allowedCookies: ["theme"],
    offlineGraceMs: 2000,
    sensitiveArmMs: 5000,
    cookiePollMs: 1000,
    sensitivePollMs: 1000,
    syncInterval: 300000,
    ...CFG_IN
  };

  const ALLOWED_COOKIES = new Set([].concat(CFG.allowedCookies || []).map(v => String(v).trim()).filter(Boolean));
  if (!ALLOWED_COOKIES.size) ALLOWED_COOKIES.add(String(CFG.cookieKey || "theme"));

  const STATE_KEY = "__ATLAS_GUARD_STATE__";
  const state = W[STATE_KEY] || (W[STATE_KEY] = {
    ready: false,
    killed: false,
    booted: false,
    sensitiveArmed: false,
    bodyReady: false,
    cookieTimer: 0,
    sensitiveTimer: 0,
    loaderTimer: 0,
    offlineTimer: 0,
    interval: 0,
    observer: null,
    readyQueue: []
  });

  if (state.ready) return;
  state.ready = true;

  let wipeLock = false;

  function clearTimers() {
    if (state.cookieTimer) clearInterval(state.cookieTimer);
    if (state.sensitiveTimer) clearInterval(state.sensitiveTimer);
    if (state.loaderTimer) clearTimeout(state.loaderTimer);
    if (state.offlineTimer) clearTimeout(state.offlineTimer);
    if (state.interval) clearInterval(state.interval);
    state.cookieTimer = 0;
    state.sensitiveTimer = 0;
    state.loaderTimer = 0;
    state.offlineTimer = 0;
    state.interval = 0;
  }

  function disconnectObserver() {
    try {
      if (state.observer) state.observer.disconnect();
    } catch {}
    state.observer = null;
  }

  function wipe() {
    if (wipeLock || state.killed) return;
    wipeLock = true;
    state.killed = true;
    disconnectObserver();
    clearTimers();
    try {
      D.documentElement.innerHTML = "";
    } catch {}
    try {
      D.open();
      D.write("");
      D.close();
    } catch {}
  }

  function schedule(fn, ms) {
    return W.setTimeout(fn, ms);
  }

  function onReady(fn) {
    if (D.readyState === "loading") {
      state.readyQueue.push(fn);
    } else {
      fn();
    }
  }

  function flushReadyQueue() {
    if (!state.readyQueue.length) return;
    const queue = state.readyQueue.splice(0);
    for (const fn of queue) {
      try {
        fn();
      } catch {}
    }
  }

  function cookieNames() {
    try {
      return D.cookie
        .split(";")
        .map(v => v.trim())
        .filter(Boolean)
        .map(v => v.split("=")[0].trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  function validateCookies() {
    const names = cookieNames();
    for (const name of names) {
      if (!ALLOWED_COOKIES.has(name)) {
        wipe();
        return false;
      }
    }
    return true;
  }

  function applyDefaultTheme() {
    const themeKey = String(CFG.cookieKey || "theme");
    let saved = null;
    try {
      saved = S.getItem(themeKey);
    } catch {}
    const dark = saved !== "light";
    if (D.body) {
      D.body.classList.toggle("dark", dark);
    }
    if (dark) {
      try {
        S.setItem(themeKey, "dark");
      } catch {}
    }
  }

  function sensitiveSelector() {
    return [
      "script",
      "style",
      "iframe",
      "link[rel='stylesheet']",
      "object",
      "embed",
      "meta[http-equiv]",
      "noscript"
    ].join(",");
  }

  function isSensitiveNode(node) {
    return !!(node && node.nodeType === 1 && node.matches && node.matches(sensitiveSelector()));
  }

  function containsSensitive(node) {
    if (!node || node.nodeType !== 1) return false;
    if (isSensitiveNode(node)) return true;
    if (node.querySelector && node.querySelector(sensitiveSelector())) return true;
    return false;
  }

  function signatureForSensitive() {
    const nodes = D.querySelectorAll(sensitiveSelector());
    let out = "";
    for (const el of nodes) {
      out += [
        el.tagName,
        el.getAttribute("src") || "",
        el.getAttribute("href") || "",
        el.getAttribute("rel") || "",
        el.getAttribute("type") || "",
        el.getAttribute("media") || "",
        el.getAttribute("nonce") || "",
        el.getAttribute("integrity") || "",
        el.getAttribute("http-equiv") || "",
        el.textContent || ""
      ].join("|") + "§";
    }
    return out;
  }

  function armOfflineWatch() {
    if (state.offlineTimer) return;
    state.offlineTimer = schedule(() => {
      state.offlineTimer = 0;
      if (!navigator.onLine) wipe();
    }, Number(CFG.offlineGraceMs) || 2000);
  }

  function startSensitiveWatch() {
    if (state.sensitiveArmed || state.killed) return;
    state.sensitiveArmed = true;

    let baseline = signatureForSensitive();

    try {
      state.observer = new MutationObserver(records => {
        if (state.killed) return;

        for (const record of records) {
          if (record.type === "childList") {
            for (const node of record.addedNodes) {
              if (containsSensitive(node)) {
                wipe();
                return;
              }
            }
            for (const node of record.removedNodes) {
              if (containsSensitive(node)) {
                wipe();
                return;
              }
            }
          } else if (record.type === "attributes") {
            if (isSensitiveNode(record.target)) {
              wipe();
              return;
            }
          }
        }

        const now = signatureForSensitive();
        if (now !== baseline) {
          wipe();
          return;
        }
      });

      state.observer.observe(D.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["src", "href", "rel", "type", "media", "nonce", "integrity", "http-equiv"]
      });
    } catch {
      wipe();
      return;
    }

    state.sensitiveTimer = schedule(() => {
      if (state.killed) return;
      baseline = signatureForSensitive();
      state.interval = W.setInterval(() => {
        if (state.killed) return;
        if (!validateCookies()) return;
        const now = signatureForSensitive();
        if (now !== baseline) {
          wipe();
        }
      }, Number(CFG.sensitivePollMs) || 1000);
    }, Number(CFG.sensitiveArmMs) || 5000);
  }

  function bootGuards() {
    if (state.killed) return;

    if (!validateCookies()) return;
    applyDefaultTheme();

    if (!navigator.onLine) armOfflineWatch();

    W.addEventListener("offline", armOfflineWatch, { passive: true });
    W.addEventListener("online", () => {
      if (state.offlineTimer) {
        clearTimeout(state.offlineTimer);
        state.offlineTimer = 0;
      }
    }, { passive: true });

    state.cookieTimer = W.setInterval(() => {
      if (!validateCookies()) return;
    }, Number(CFG.cookiePollMs) || 1000);

    startSensitiveWatch();

    state.loaderTimer = schedule(() => {
      if (!W.__ATLAS_CORE_LOADED__) {
        wipe();
      }
    }, Math.max(3000, Number(CFG.loaderMin) || 2500));
  }

  function safeText(value) {
    return String(value == null ? "" : value);
  }

  function badge(v) {
    if (v === "high") return `<span class="badge high">بحرانی</span>`;
    if (v === "medium") return `<span class="badge medium">بررسی</span>`;
    return `<span class="badge low">بسته</span>`;
  }

  function dedupe(arr) {
    const map = new Map();
    for (const item of arr || []) {
      if (!item || !item.id) continue;
      map.set(String(item.id), item);
    }
    return [...map.values()];
  }

  const GITHUB_OWNER = "siteatlascode";
  const GITHUB_REPO = "siteatlascode.github.io";
  const CACHE_KEY = "atlas_issues_cache";
  const CACHE_TIME = "atlas_issues_time";
  const SYNC_INTERVAL = Number(CFG.syncInterval) || 300000;

  const data = [
    {
      id: "ALS-001",
      title: "پرونده APT WAR",
      status: "high",
      date: "2026/06/7",
      desc: "بررسی تکمیل و نتیجه ثبت شد. به زودی آپلود می‌شود."
    }
  ];

  let all = [];
  let grid = null;
  let search = null;
  let filter = null;
  let modal = null;
  let modalContent = null;

  function loadCache() {
    try {
      const cache = S.getItem(CACHE_KEY);
      if (!cache) return [];
      const parsed = JSON.parse(cache);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveCache(items) {
    try {
      S.setItem(CACHE_KEY, JSON.stringify(items));
      S.setItem(CACHE_TIME, String(Date.now()));
    } catch {}
  }

  function clearCache() {
    try {
      S.removeItem(CACHE_KEY);
      S.removeItem(CACHE_TIME);
    } catch {}
  }

  function normalizeGitHubIssue(issue) {
    const body = issue && issue.body ? String(issue.body) : "";
    if (!body.trim().startsWith("[ALS-ISSUE]")) return null;

    const jsonText = body.replace("[ALS-ISSUE]", "").trim();

    try {
      const parsed = JSON.parse(jsonText);
      return {
        id: parsed.id || `GH-${issue.number}`,
        title: parsed.title || issue.title || "",
        status: ["high", "medium", "low"].includes(parsed.status) ? parsed.status : "low",
        date: parsed.date || (issue.created_at ? issue.created_at.slice(0, 10) : ""),
        desc: parsed.desc || "",
        details: parsed.details || "",
        updated: issue.updated_at || "",
        number: issue.number
      };
    } catch {
      return null;
    }
  }

  async function githubIssues() {
    if (!GITHUB_OWNER || !GITHUB_REPO) return [];

    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues?state=all&per_page=100`;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);

      const res = await fetch(url, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        }
      }).finally(() => clearTimeout(timer));

      if (res.status === 404) {
        clearCache();
        return [];
      }

      if (!res.ok) return loadCache();

      const issues = await res.json();
      const parsed = (Array.isArray(issues) ? issues : [])
        .filter(x => !x.pull_request)
        .map(normalizeGitHubIssue)
        .filter(Boolean);

      saveCache(parsed);
      return parsed;
    } catch {
      clearCache();
      return [];
    }
  }

  function openCard(item) {
    if (!modal || !modalContent) return;
    modal.classList.add("active");
    modalContent.innerHTML = `
      <div class="id">${safeText(item.id)}</div>
      <h2 style="margin-top:8px">${safeText(item.title)}</h2>
      <div style="margin-top:12px">${badge(item.status)}</div>
      <div class="detail">${safeText(item.details || item.desc || "")}</div>
    `;
  }

  function render() {
    if (!grid || !search || !filter) return;
    const q = safeText(search.value).toLowerCase().trim();
    const f = safeText(filter.value);

    grid.innerHTML = "";

    const filtered = all.filter(item => {
      const hay = `${item.title || ""} ${item.id || ""}`.toLowerCase();
      const matchesQuery = !q || hay.includes(q);
      const matchesFilter = f === "all" || item.status === f;
      return matchesQuery && matchesFilter;
    });

    filtered.forEach(item => {
      const div = D.createElement("div");
      div.className = "card";
      div.innerHTML = `
        <div class="id">${safeText(item.id)}</div>
        <div class="title">${safeText(item.title)}</div>
        <div class="meta">
          ${badge(item.status)}
          <span>${safeText(item.date || "")}</span>
        </div>
      `;
      div.addEventListener("click", () => openCard(item), { passive: true });
      grid.appendChild(div);
    });
  }

  function setAll(nextItems) {
    const next = dedupe(nextItems);
    const old = JSON.stringify(all);
    const now = JSON.stringify(next);
    if (old !== now) {
      all = next;
      render();
    }
  }

  async function syncIssues() {
    const remote = await githubIssues();
    setAll([...data, ...remote]);
  }

  function bindUI() {
    grid = D.getElementById("grid");
    search = D.getElementById("search");
    filter = D.getElementById("filter");
    modal = D.getElementById("modal");
    modalContent = D.getElementById("modalContent");

    if (modal) {
      const close = D.getElementById("close");
      if (close) close.addEventListener("click", () => modal.classList.remove("active"), { passive: true });
      modal.addEventListener("click", e => {
        if (e.target === modal) modal.classList.remove("active");
      }, { passive: true });
    }

    if (search) search.addEventListener("input", render, { passive: true });
    if (filter) filter.addEventListener("change", render, { passive: true });

    const themeBtn = D.getElementById("themeBtn");
    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        if (!D.body) return;
        D.body.classList.toggle("dark");
        try {
          S.setItem(String(CFG.cookieKey || "theme"), D.body.classList.contains("dark") ? "dark" : "light");
        } catch {}
      }, { passive: true });
    }
  }

  function startApp() {
    if (state.booted || state.killed) return;
    state.booted = true;

    bindUI();
    applyDefaultTheme();

    const cached = loadCache();
    if (cached.length) {
      setAll([...data, ...cached]);
    } else {
      setAll(data);
    }

    syncIssues();
    state.interval = W.setInterval(syncIssues, SYNC_INTERVAL);
    W.__ATLAS_CORE_LOADED__ = true;
  }

  function init() {
    if (state.killed) return;
    bootGuards();
    onReady(() => {
      state.bodyReady = true;
      applyDefaultTheme();
      startApp();
      flushReadyQueue();
    });
  }

  if (D.readyState === "loading") {
    D.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  W.addEventListener("pageshow", () => {
    if (!W.__ATLAS_CORE_LOADED__ && !state.killed) {
      wipe();
    }
  }, { passive: true });
})();
