(() => {
  "use strict";

  const W = window;
  const D = document;

  const STATE = (W.__ATLAS_GUARD__ ||= {
    booted: false,
    locked: false,
    slots: new Set(),
    baseline: "",
    cookieTimer: null,
    offlineTimer: null,
    mutationObserver: null
  });

  const script = D.currentScript;
  const slot = (script && script.dataset && script.dataset.slot) ? String(script.dataset.slot) : "unknown";
  STATE.slots.add(slot);

  if (STATE.booted) {
    W.ATLAS_CORE_LOADED = true;
    return;
  }
  STATE.booted = true;

  const ALLOWED_COOKIES = new Set(["theme", "atlas-theme"]);
  const SELF_CHECK_DELAY = 3000;   // اگر یکی از دو نسخه لود نشده باشد
  const SNAPSHOT_DELAY = 5000;     // بعد از ۵ ثانیه مانیتور جدی‌تر شود
  const OFFLINE_DELAY = 2000;      // قطع اینترنت بیش از ۲ ثانیه
  const COOKIE_POLL = 1000;

  function fnv1a(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  function parseCookies() {
    const out = new Map();
    const raw = D.cookie || "";
    raw.split(";").map(s => s.trim()).filter(Boolean).forEach(pair => {
      const idx = pair.indexOf("=");
      const key = decodeURIComponent((idx >= 0 ? pair.slice(0, idx) : pair)).trim();
      const val = idx >= 0 ? pair.slice(idx + 1) : "";
      out.set(key, val);
    });
    return out;
  }

  function cookiePolicyBroken() {
    const cookies = parseCookies();
    for (const key of cookies.keys()) {
      if (!ALLOWED_COOKIES.has(key)) return true;
    }
    return false;
  }

  function currentSnapshot() {
    const headNodes = Array.from(D.head.querySelectorAll(
      "script,link[rel='stylesheet'],meta[name],meta[property],title"
    )).map(el => el.outerHTML).join("||");

    const bodyNodes = Array.from(D.body ? D.body.children : []).map(el => {
      if (!el || !el.outerHTML) return "";
      return el.tagName === "SCRIPT" || el.tagName === "LINK" ? el.outerHTML : `${el.tagName}:${el.className}:${el.id}`;
    }).join("||");

    return fnv1a(headNodes + "##" + bodyNodes + "##" + (D.body ? D.body.className : ""));
  }

  function lockPage(reason) {
    if (STATE.locked) return;
    STATE.locked = true;

    try { clearInterval(STATE.cookieTimer); } catch {}
    try { clearTimeout(STATE.offlineTimer); } catch {}
    try { STATE.mutationObserver && STATE.mutationObserver.disconnect(); } catch {}

    try {
      if (D.documentElement) D.documentElement.classList.add("atlas-locked");
      if (D.body) {
        D.body.classList.add("atlas-locked");
        D.body.innerHTML = "";
      }
      const veil = D.createElement("div");
      veil.id = "atlas-lockscreen";
      veil.setAttribute("data-reason", reason || "locked");
      D.documentElement.appendChild(veil);
    } catch {}

    W.ATLAS_CORE_LOADED = false;
  }

  function startCookieWatch() {
    STATE.cookieTimer = setInterval(() => {
      if (cookiePolicyBroken()) lockPage("cookie-tamper");
    }, COOKIE_POLL);
  }

  function startOfflineWatch() {
    const arm = () => {
      clearTimeout(STATE.offlineTimer);
      STATE.offlineTimer = setTimeout(() => {
        if (!navigator.onLine) lockPage("offline");
      }, OFFLINE_DELAY);
    };

    W.addEventListener("offline", arm);
    W.addEventListener("online", () => {
      clearTimeout(STATE.offlineTimer);
    });
  }

  function startSlotCheck() {
    setTimeout(() => {
      if (!STATE.slots.has("head") || !STATE.slots.has("body")) {
        lockPage("missing-slot");
      }
    }, SELF_CHECK_DELAY);
  }

  function startTamperWatch() {
    setTimeout(() => {
      STATE.baseline = currentSnapshot();

      const mo = new MutationObserver(() => {
        if (currentSnapshot() !== STATE.baseline) {
          lockPage("dom-tamper");
        }
      });

      mo.observe(D.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true
      });

      STATE.mutationObserver = mo;
    }, SNAPSHOT_DELAY);
  }

  D.addEventListener("DOMContentLoaded", () => {
    if (D.documentElement && !D.documentElement.classList.contains("theme-dark")) {
      D.documentElement.classList.add("theme-dark");
    }

    startCookieWatch();
    startOfflineWatch();
    startSlotCheck();
    startTamperWatch();

    if (!D.body) {
      lockPage("no-body");
    }
  }, { once: true });

  W.addEventListener("error", e => {
    const tag = e && e.target && e.target.tagName;
    if (tag === "SCRIPT" || tag === "LINK") {
      lockPage("asset-error");
    }
  }, true);

  W.addEventListener("load", () => {
    setTimeout(() => {
      if (!W.ATLAS_CORE_LOADED) lockPage("core-not-loaded");
    }, 3000);
  });

  W.ATLAS_CORE_LOADED = true;
})();
