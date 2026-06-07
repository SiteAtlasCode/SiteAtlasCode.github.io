(() => {
  "use strict";

  const STATE_KEY = "__ATLAS_RUNTIME_STATE__";
  const STATE = window[STATE_KEY] || (window[STATE_KEY] = {});
  if (STATE.booted || STATE.booting) return;
  STATE.booting = true;

  const DEFAULT_CONFIG = {
    tamper: false,
    host: false,
    domainLock: false,
    loaderMin: 2500,
    rightClick: false,
    devtools: false,
    themeDefault: "dark",
    themeCookieName: "atlas_theme",
    allowedCookies: ["atlas_theme"],
    sensitiveArmedAfter: 5000,
    offlineKillAfter: 2000,
    sensitivePollEvery: 1000,
    syncInterval: 300000,
    githubOwner: "siteatlascode",
    githubRepo: "siteatlascode.github.io"
  };

  const USER_CONFIG = (window.AtlasToolsConfig && typeof window.AtlasToolsConfig === "object") ? window.AtlasToolsConfig : {};
  const CFG = Object.freeze({ ...DEFAULT_CONFIG, ...USER_CONFIG });
  try {
    Object.defineProperty(window, "AtlasToolsConfig", {
      value: CFG,
      writable: false,
      configurable: false,
      enumerable: true
    });
  } catch {
    window.AtlasToolsConfig = CFG;
  }

  window.__ATLAS_CORE_LOADED__ = false;

  const WIPED = () => !!STATE.wiped;

  const safeLS = {
    get(key) {
      try { return localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch {}
    },
    remove(key) {
      try { localStorage.removeItem(key); } catch {}
    }
  };

  const safeSS = {
    get(key) {
      try { return sessionStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { sessionStorage.setItem(key, value); } catch {}
    },
    remove(key) {
      try { sessionStorage.removeItem(key); } catch {}
    }
  };

  function setCookie(name, value, days = 3650) {
    try {
      const maxAge = days * 24 * 60 * 60;
      document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
    } catch {}
  }

  function getCookies() {
    try {
      return document.cookie
        .split(";")
        .map(v => v.trim())
        .filter(Boolean)
        .map(v => decodeURIComponent(v.split("=")[0] || ""));
    } catch {
      return [];
    }
  }

  function wipePage() {
    if (STATE.wiped) return;
    STATE.wiped = true;
    try { window.stop(); } catch {}
    try {
      document.documentElement.innerHTML = "";
      document.open();
      document.write("");
      document.close();
    } catch {}
    try {
      document.body = null;
    } catch {}
  }

  function isReady() {
    return document && document.documentElement && document.body;
  }

  function ensureTheme() {
    if (WIPED()) return;
    const themeKey = "theme";
    const stored = safeLS.get(themeKey);
    const current = (stored === "dark" || stored === "light") ? stored : CFG.themeDefault;

    if (document.documentElement) {
      document.documentElement.dataset.theme = current;
    }

    const apply = () => {
      if (!document.body) return;
      document.body.classList.toggle("dark", current === "dark");
      document.body.classList.toggle("light", current === "light");
    };

    apply();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", apply, { once: true });
    }

    safeLS.set(themeKey, current);
    setCookie(CFG.themeCookieName, current);
  }

  function setTheme(nextTheme) {
    const theme = nextTheme === "light" ? "light" : "dark";
    safeLS.set("theme", theme);
    setCookie(CFG.themeCookieName, theme);
    if (document.documentElement) document.documentElement.dataset.theme = theme;
    if (document.body) {
      document.body.classList.toggle("dark", theme === "dark");
      document.body.classList.toggle("light", theme === "light");
    }
  }

  function lockAllowedCookies() {
    const allowed = new Set((CFG.allowedCookies || []).map(String));
    const cookies = getCookies();
    for (const c of cookies) {
      if (!allowed.has(c)) {
        wipePage();
        return false;
      }
    }
    return true;
  }

  function cookieGuardLoop() {
    if (WIPED()) return;
    if (!lockAllowedCookies()) return;
    STATE.cookieTimer = window.setInterval(() => {
      if (WIPED()) return;
      lockAllowedCookies();
    }, 1000);
  }

  function startOfflineGuard() {
    if (WIPED()) return;

    const arm = () => {
      if (STATE.offlineTimer) clearTimeout(STATE.offlineTimer);
      STATE.offlineTimer = window.setTimeout(() => {
        if (!navigator.onLine) wipePage();
      }, CFG.offlineKillAfter);
    };

    const disarm = () => {
      if (STATE.offlineTimer) {
        clearTimeout(STATE.offlineTimer);
        STATE.offlineTimer = null;
      }
    };

    window.addEventListener("offline", arm, { passive: true });
    window.addEventListener("online", disarm, { passive: true });

    if (!navigator.onLine) arm();
  }

  function sensitiveSignature() {
    const nodes = Array.from(document.querySelectorAll(
      "script,style,iframe,link[rel='stylesheet'],meta[http-equiv],object,embed"
    ));

    return nodes.map(node => {
      const tag = node.tagName.toLowerCase();
      const attrs = Array.from(node.attributes || [])
        .map(a => `${a.name}=${a.value}`)
        .sort()
        .join("|");
      const text = (tag === "script" || tag === "style") ? (node.textContent || "").slice(0, 2000) : "";
      return `${tag}::${attrs}::${text}`;
    }).join("<<<ATLAS>>>"); 
  }

  function startSensitiveGuard() {
    if (WIPED()) return;

    STATE.sensitiveBaseline = sensitiveSignature();

    const checkSensitive = () => {
      if (WIPED()) return;
      const now = sensitiveSignature();
      if (now !== STATE.sensitiveBaseline) wipePage();
    };

    STATE.sensitiveObserver = new MutationObserver(records => {
      if (WIPED()) return;
      for (const rec of records) {
        const t = rec.target;
        const name = t && t.tagName ? String(t.tagName).toLowerCase() : "";
        const added = rec.addedNodes ? Array.from(rec.addedNodes) : [];
        const removed = rec.removedNodes ? Array.from(rec.removedNodes) : [];

        const isSensitiveNode = node => {
          if (!node || node.nodeType !== 1) return false;
          const tag = String(node.tagName || "").toLowerCase();
          if (["script", "style", "iframe", "link", "meta", "object", "embed"].includes(tag)) return true;
          if (node.querySelector && node.querySelector("script,style,iframe,link[rel='stylesheet'],meta[http-equiv],object,embed")) return true;
          return false;
        };

        if (isSensitiveNode(t)) {
          wipePage();
          return;
        }

        if (added.some(isSensitiveNode) || removed.some(isSensitiveNode)) {
          wipePage();
          return;
        }

        if (rec.type === "attributes") {
          const tag = name;
          const attr = String(rec.attributeName || "").toLowerCase();
          if (
            ["script", "style", "iframe", "link", "meta", "object", "embed"].includes(tag) ||
            ["src", "href", "type", "rel", "http-equiv", "content", "integrity", "nonce"].includes(attr)
          ) {
            wipePage();
            return;
          }
        }

        if (rec.type === "characterData") {
          const parentTag = rec.target && rec.target.parentElement ? String(rec.target.parentElement.tagName || "").toLowerCase() : "";
          if (["script", "style"].includes(parentTag)) {
            wipePage();
            return;
          }
        }
      }
    });

    try {
      STATE.sensitiveObserver.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        characterData: true,
        attributeOldValue: false,
        characterDataOldValue: false
      });
    } catch {}

    STATE.sensitivePollTimer = window.setInterval(checkSensitive, CFG.sensitivePollEvery);
    checkSensitive();
  }

  function armSensitiveGuardLater() {
    if (WIPED()) return;
    if (STATE.sensitiveArmed) return;
    STATE.sensitiveArmed = true;
    window.setTimeout(() => {
      if (!WIPED()) startSensitiveGuard();
    }, CFG.sensitiveArmedAfter);
  }

  function safeText(el, text) {
    el.textContent = text == null ? "" : String(text);
  }

  function clearNode(el) {
    while (el && el.firstChild) el.removeChild(el.firstChild);
  }

  function badge(v) {
    const span = document.createElement("span");
    if (v === "high") {
      span.className = "badge high";
      span.textContent = "بحرانی";
    } else if (v === "medium") {
      span.className = "badge medium";
      span.textContent = "بررسی";
    } else {
      span.className = "badge low";
      span.textContent = "بسته";
    }
    return span;
  }

  function dedupe(arr) {
    const map = new Map();
    (Array.isArray(arr) ? arr : []).forEach(item => {
      if (!item || !item.id) return;
      map.set(String(item.id), item);
    });
    return [...map.values()];
  }

  function loadCache() {
    try {
      const cache = safeLS.get("atlas_issues_cache");
      if (!cache) return [];
      const parsed = JSON.parse(cache);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveCache(items) {
    try {
      safeLS.set("atlas_issues_cache", JSON.stringify(items));
      safeLS.set("atlas_issues_time", String(Date.now()));
    } catch {}
  }

  function clearCache() {
    safeLS.remove("atlas_issues_cache");
    safeLS.remove("atlas_issues_time");
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
    if (WIPED()) return [];
    if (!CFG.githubOwner || !CFG.githubRepo) return [];

    const url = `https://api.github.com/repos/${CFG.githubOwner}/${CFG.githubRepo}/issues?state=all&per_page=100`;

    try {
      const res = await fetch(url, {
        method: "GET",
        cache: "no-store",
        headers: {
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        }
      });

      if (res.status === 404) {
        clearCache();
        return [];
      }

      if (!res.ok) {
        return loadCache();
      }

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

  function setAll(nextItems) {
    if (WIPED()) return;
    const next = dedupe(nextItems);
    const old = JSON.stringify(STATE.all || []);
    const now = JSON.stringify(next);
    if (old !== now) {
      STATE.all = next;
      render();
    }
  }

  function openCard(item) {
    if (WIPED() || !STATE.modal || !STATE.modalContent) return;

    STATE.modal.classList.add("active");
    clearNode(STATE.modalContent);

    const id = document.createElement("div");
    id.className = "id";
    safeText(id, item.id || "");

    const h2 = document.createElement("h2");
    h2.style.marginTop = "8px";
    safeText(h2, item.title || "");

    const badgeWrap = document.createElement("div");
    badgeWrap.style.marginTop = "12px";
    badgeWrap.appendChild(badge(item.status));

    const detail = document.createElement("div");
    detail.className = "detail";
    safeText(detail, item.details || item.desc || "");

    STATE.modalContent.appendChild(id);
    STATE.modalContent.appendChild(h2);
    STATE.modalContent.appendChild(badgeWrap);
    STATE.modalContent.appendChild(detail);
  }

  function render() {
    if (WIPED() || !STATE.grid || !STATE.search || !STATE.filter) return;

    const q = (STATE.search.value || "").toLowerCase().trim();
    const f = STATE.filter.value;

    clearNode(STATE.grid);

    const filtered = (STATE.all || []).filter(item => {
      const hay = `${item.title || ""} ${item.id || ""}`.toLowerCase();
      const matchesQuery = !q || hay.includes(q);
      const matchesFilter = f === "all" || item.status === f;
      return matchesQuery && matchesFilter;
    });

    for (const item of filtered) {
      const div = document.createElement("div");
      div.className = "card";

      const id = document.createElement("div");
      id.className = "id";
      safeText(id, item.id || "");

      const title = document.createElement("div");
      title.className = "title";
      safeText(title, item.title || "");

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.appendChild(badge(item.status));

      const date = document.createElement("span");
      safeText(date, item.date || "");

      meta.appendChild(date);

      div.appendChild(id);
      div.appendChild(title);
      div.appendChild(meta);

      div.addEventListener("click", () => openCard(item), { passive: true });
      STATE.grid.appendChild(div);
    }
  }

  function syncThemeButton() {
    if (!STATE.themeBtn) return;
    STATE.themeBtn.addEventListener("click", () => {
      if (WIPED()) return;
      const current = safeLS.get("theme") || CFG.themeDefault;
      const next = current === "dark" ? "light" : "dark";
      setTheme(next);
    }, { passive: true });
  }

  function bindUI() {
    if (WIPED()) return;

    STATE.grid = document.getElementById("grid");
    STATE.search = document.getElementById("search");
    STATE.filter = document.getElementById("filter");
    STATE.modal = document.getElementById("modal");
    STATE.modalContent = document.getElementById("modalContent");
    STATE.closeBtn = document.getElementById("close");
    STATE.themeBtn = document.getElementById("themeBtn");

    if (STATE.closeBtn && !STATE.closeBtn.__atlasBound) {
      STATE.closeBtn.__atlasBound = true;
      STATE.closeBtn.addEventListener("click", () => {
        if (STATE.modal) STATE.modal.classList.remove("active");
      }, { passive: true });
    }

    if (STATE.modal && !STATE.modal.__atlasBound) {
      STATE.modal.__atlasBound = true;
      STATE.modal.addEventListener("click", e => {
        if (e.target === STATE.modal) STATE.modal.classList.remove("active");
      }, { passive: true });
    }

    if (STATE.search && !STATE.search.__atlasBound) {
      STATE.search.__atlasBound = true;
      STATE.search.addEventListener("input", render, { passive: true });
    }

    if (STATE.filter && !STATE.filter.__atlasBound) {
      STATE.filter.__atlasBound = true;
      STATE.filter.addEventListener("change", render, { passive: true });
    }

    syncThemeButton();
  }

  async function syncIssues() {
    if (WIPED()) return;
    const remote = await githubIssues();
    if (WIPED()) return;
    setAll([...(STATE.baseData || []), ...remote]);
  }

  async function bootApp() {
    if (STATE.appBooted || WIPED()) return;
    STATE.appBooted = true;

    STATE.baseData = [
      {
        id: "ALS-001",
        title: "پرونده APT WAR",
        status: "high",
        date: "2026/06/7",
        desc: "بررسی تکمیل و نتیجه ثبت شد. به زودی آپلود می‌شود."
      }
    ];

    bindUI();
    ensureTheme();

    const cached = loadCache();
    if (cached.length) {
      setAll([...(STATE.baseData || []), ...cached]);
    } else {
      setAll(STATE.baseData || []);
    }

    await syncIssues();
    if (WIPED()) return;

    if (!STATE.syncTimer) {
      STATE.syncTimer = window.setInterval(syncIssues, CFG.syncInterval);
    }

    window.__ATLAS_CORE_LOADED__ = true;
  }

  function startAllGuards() {
    if (STATE.guardsStarted || WIPED()) return;
    STATE.guardsStarted = true;
    cookieGuardLoop();
    startOfflineGuard();
    armSensitiveGuardLater();
  }

  function init() {
    if (STATE.initialized || WIPED()) return;
    STATE.initialized = true;
    startAllGuards();

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        if (WIPED()) return;
        bootApp();
      }, { once: true });
    } else {
      bootApp();
    }
  }

  init();

  STATE.booted = true;
  STATE.booting = false;
})();
