(() => {
  'use strict';

  const W = window;
  const D = document;
  const LS = localStorage;
  const SS = sessionStorage;

  const CFG = W.AtlasToolsConfig && typeof W.AtlasToolsConfig === 'object'
    ? W.AtlasToolsConfig
    : {};

  const ROLE = (D.currentScript && D.currentScript.dataset && D.currentScript.dataset.role) || 'unknown';
  const PREFIX = '__atlas_guard__';

  const STATE = W[PREFIX] ||= {
    locked: false,
    startedAt: Date.now(),
    roles: {},
    offlineSince: 0,
    cookieTimer: null,
    netTimer: null,
    headObserver: null,
    heartbeatTimer: null
  };

  function safe(fn) {
    try { return fn(); } catch { return undefined; }
  }

  function hardWipe(reason) {
    if (STATE.locked) return;
    STATE.locked = true;

    safe(() => console.warn('[ATLAS LOCK]', reason || 'locked'));

    safe(() => {
      if (STATE.cookieTimer) clearInterval(STATE.cookieTimer);
      if (STATE.netTimer) clearInterval(STATE.netTimer);
      if (STATE.heartbeatTimer) clearInterval(STATE.heartbeatTimer);
      if (STATE.headObserver) STATE.headObserver.disconnect();
    });

    safe(() => {
      D.documentElement.innerHTML = '';
    });

    safe(() => {
      D.open();
      D.write(
        '<!doctype html><html><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>Locked</title>' +
        '<style>html,body{margin:0;width:100%;height:100%;background:#000}</style>' +
        '</head><body></body></html>'
      );
      D.close();
    });

    W.__ATLAS_LOCKED__ = true;
  }

  function applyDarkTheme() {
    safe(() => {
      const root = D.documentElement;
      root.classList.add('dark');
      root.dataset.theme = 'dark';
    });

    safe(() => {
      if (D.body) D.body.classList.add('dark');
    });

    safe(() => LS.setItem('theme', 'dark'));
    safe(() => {
      D.cookie = 'theme=dark; path=/; max-age=31536000; samesite=lax';
    });
  }

  function parseCookies() {
    const out = {};
    const raw = D.cookie || '';
    raw.split(/;\s*/).forEach(part => {
      if (!part) return;
      const idx = part.indexOf('=');
      const key = idx >= 0 ? decodeURIComponent(part.slice(0, idx).trim()) : decodeURIComponent(part.trim());
      const value = idx >= 0 ? decodeURIComponent(part.slice(idx + 1)) : '';
      if (key) out[key] = value;
    });
    return out;
  }

  function cookiesTampered() {
    const cookies = parseCookies();

    for (const key of Object.keys(cookies)) {
      if (key !== 'theme') return true;
    }

    if ('theme' in cookies && cookies.theme !== 'dark') return true;

    return false;
  }

  function startCookieWatch() {
    STATE.cookieTimer = setInterval(() => {
      if (STATE.locked) return;
      if (cookiesTampered()) {
        hardWipe('cookie tamper');
      }
    }, 500);
  }

  function startNetworkWatch() {
    const markOffline = () => {
      if (STATE.offlineSince) return;
      STATE.offlineSince = Date.now();

      setTimeout(() => {
        if (STATE.locked) return;
        if (!navigator.onLine && STATE.offlineSince && Date.now() - STATE.offlineSince >= 2000) {
          hardWipe('offline > 2s');
        }
      }, 2000);
    };

    const markOnline = () => {
      STATE.offlineSince = 0;
    };

    W.addEventListener('offline', markOffline);
    W.addEventListener('online', markOnline);

    STATE.netTimer = setInterval(() => {
      if (STATE.locked) return;
      if (!navigator.onLine) markOffline();
      else markOnline();
    }, 500);
  }

  function startHeadWatch() {
    setTimeout(() => {
      if (STATE.locked) return;

      const criticalTags = new Set(['SCRIPT', 'LINK', 'STYLE', 'META']);

      const observer = new MutationObserver(records => {
        for (const record of records) {
          if (record.type === 'childList') {
            for (const node of record.addedNodes) {
              if (node && node.nodeType === 1 && criticalTags.has(node.tagName)) {
                hardWipe('head tamper: added critical node');
                return;
              }
            }

            for (const node of record.removedNodes) {
              if (node && node.nodeType === 1 && criticalTags.has(node.tagName)) {
                hardWipe('head tamper: removed critical node');
                return;
              }
            }
          }

          if (record.type === 'attributes') {
            const el = record.target;
            if (el && el.nodeType === 1 && criticalTags.has(el.tagName)) {
              hardWipe('head tamper: attribute change');
              return;
            }
          }
        }
      });

      if (D.head) {
        observer.observe(D.head, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ['src', 'href', 'rel', 'type', 'media', 'integrity', 'crossorigin', 'disabled']
        });
      }

      STATE.headObserver = observer;

      const styleLink = D.querySelector('link#atlas-style[href*="style.css"], link[rel="stylesheet"][href*="style.css"]');
      if (!styleLink) {
        hardWipe('style.css missing');
      }

      const headLoader = D.querySelector('head script[data-role="head"][src*="index.js"]');
      if (!headLoader) {
        hardWipe('head loader missing');
      }
    }, 5000);
  }

  function startHeartbeat() {
    const selfKey = `${PREFIX}hb_${ROLE}`;
    const peerKey = ROLE === 'head' ? `${PREFIX}hb_body` : `${PREFIX}hb_head`;

    safe(() => SS.setItem(selfKey, String(Date.now())));

    STATE.heartbeatTimer = setInterval(() => {
      if (STATE.locked) return;

      safe(() => SS.setItem(selfKey, String(Date.now())));

      const now = Date.now();
      const peerTs = Number(safe(() => SS.getItem(peerKey)) || 0);

      // بعد از یک بازه امن، نبودن loader دوم یا حذف شدنش قفل شود
      if (now - STATE.startedAt > 4500) {
        if (!peerTs || now - peerTs > 1800) {
          hardWipe(`peer missing: ${peerKey}`);
        }
      }
    }, 600);
  }

  function init() {
    if (STATE.roles[ROLE]) return;
    STATE.roles[ROLE] = true;

    applyDarkTheme();
    startHeartbeat();
    startCookieWatch();
    startNetworkWatch();
    startHeadWatch();

    if (D.readyState === 'loading') {
      D.addEventListener('DOMContentLoaded', applyDarkTheme, { once: true });
    }
  }

  init();
})();
