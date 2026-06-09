window.AtlasToolsConfig = Object.freeze({
  tamper: false,
  host: false,
  domainLock: false,
  loaderMin: 2500,
  rightClick: false,
  devtools: false
});

const GITHUB_OWNER = "siteatlascode";
const GITHUB_REPO = "siteatlascode.github.io";

const GITHUB_ISSUES_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues?state=all&per_page=100`;
    
const ATLASGIT_BACKUP_URL = "https://siteatlascode.github.io/AtlasGit.txt";

const CACHE_KEY_ISSUES = "atlas_issues_cache_v2";
const CACHE_TIME_ISSUES = "atlas_issues_time_v2";
const CACHE_KEY_ATLAS = "atlas_atlasgit_cache_v2";
const CACHE_TIME_ATLAS = "atlas_atlasgit_time_v2";
const SYNC_INTERVAL = 300000;
const grid = document.getElementById("grid");
const search = document.getElementById("search");
const filter = document.getElementById("filter");
const modal = document.getElementById("modal");
const modalContent = document.getElementById("modalContent");
const closeBtn = document.getElementById("close");

let all = [];
let atlasItems = [];

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function badge(v) {
  if (v === "high") return `<span class="badge high">بحرانی</span>`;
  if (v === "medium") return `<span class="badge medium">بررسی</span>`;
  return `<span class="badge low">بسته</span>`;
}

function dedupe(arr) {
  const map = new Map();
  arr.forEach(item => {
    if (!item || !item.id) return;
    map.set(String(item.id), item);
  });
  return [...map.values()];
}

function loadCache(key) {
  try {
    const cache = localStorage.getItem(key);
    if (!cache) return [];
    const parsed = JSON.parse(cache);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCache(key, timeKey, items) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
    localStorage.setItem(timeKey, String(Date.now()));
  } catch {}
}

function clearCache(key, timeKey) {
  try {
    localStorage.removeItem(key);
    localStorage.removeItem(timeKey);
  } catch {}
}

function safeJSONParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeGitHubIssue(issue) {
  const body = String(issue?.body ?? "").trim();

  if (!body.startsWith("[ALS-ISSUE]")) {
    return null;
  }

  const jsonText = body.slice("[ALS-ISSUE]".length).trim();
  const parsed = safeJSONParse(jsonText);

  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    return null;
  }

  const inner = String(parsed.inner ?? "text")
    .trim()
    .toLowerCase();

  return {
    id: parsed.id || `GH-${issue.number}`,
    title: parsed.title || issue.title || "",
    status: ["high", "medium", "low"].includes(parsed.status)
      ? parsed.status
      : "low",
    date: parsed.date || (issue.created_at
      ? issue.created_at.slice(0, 10)
      : ""),
    desc: parsed.desc || "",
    details: parsed.details || "",
    inner: inner === "html" ? "html" : "text",
    updated: issue.updated_at || "",
    number: issue.number
  };
}

function normalizeAtlasGitRecord(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;

  const id = String(item.id ?? "").trim();
  if (!id) return null;

  const inner = String(item.inner ?? "text")
    .trim()
    .toLowerCase();

  return {
    id,
    text: String(item.text ?? ""),
    inner: inner === "html" ? "html" : "text"
  };
}

function parseAtlasGitText(rawText) {
  const text = String(rawText ?? "").trim();
  if (!text) return [];

  const jsonText = text.startsWith("[AtlasGit]")
    ? text.slice("[AtlasGit]".length).trim()
    : text;

  const parsed = safeJSONParse(jsonText);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map(normalizeAtlasGitRecord)
    .filter(Boolean);
}

async function githubIssues() {
  if (!GITHUB_OWNER || !GITHUB_REPO) return [];

  try {
    const res = await fetch(GITHUB_ISSUES_API, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });

    if (res.status === 404) {
      clearCache(CACHE_KEY_ISSUES, CACHE_TIME_ISSUES);
      return [];
    }

    if (!res.ok) {
      return loadCache(CACHE_KEY_ISSUES);
    }

    const issues = await res.json();
    const parsed = issues
      .filter(x => !x.pull_request)
      .map(normalizeGitHubIssue)
      .filter(Boolean);

    saveCache(CACHE_KEY_ISSUES, CACHE_TIME_ISSUES, parsed);
    return parsed;
  } catch {
    return loadCache(CACHE_KEY_ISSUES);
  }
}

async function githubAtlasGit() {
  try {
    const res = await fetch(GITHUB_ISSUES_API, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    });

    if (res.status === 404) {
      clearCache(CACHE_KEY_ATLAS, CACHE_TIME_ATLAS);
      return [];
    }

    if (!res.ok) {
      return loadCache(CACHE_KEY_ATLAS);
    }

    const issues = await res.json();
    const items = [];

    issues
      .filter(x => !x.pull_request)
      .forEach(issue => {
        const parsed = parseAtlasGitText(issue?.body || "");
        if (parsed.length) items.push(...parsed);
      });

    const deduped = dedupe(items);
    saveCache(CACHE_KEY_ATLAS, CACHE_TIME_ATLAS, deduped);
    return deduped;
  } catch {
    return loadCache(CACHE_KEY_ATLAS);
  }
}

async function loadAtlasGitBackup() {
  try {
    const res = await fetch(ATLASGIT_BACKUP_URL, {
      method: "GET",
      cache: "no-store"
    });

    if (!res.ok) {
      return loadCache(CACHE_KEY_ATLAS);
    }

    const text = await res.text();
    const parsed = parseAtlasGitText(text);
    const deduped = dedupe(parsed);

    if (deduped.length) {
      saveCache(CACHE_KEY_ATLAS, CACHE_TIME_ATLAS, deduped);
    }

    return deduped;
  } catch {
    return loadCache(CACHE_KEY_ATLAS);
  }
}

function openCard(item) {
  modal.classList.add("active");

  const desc =
    item.inner === "html"
      ? item.desc
      : escapeHTML(item.desc || "");

  const details =
    item.inner === "html"
      ? item.details
      : escapeHTML(item.details || "");

  modalContent.innerHTML = `
    <div class="id">${escapeHTML(item.id)}</div>

    <h2 style="margin-top:8px">
      ${escapeHTML(item.title)}
    </h2>

    <div style="margin-top:12px">
      ${badge(item.status)}
    </div>

    ${
      item.desc
        ? `<div class="detail">${desc}</div>`
        : ""
    }

    ${
      item.details
        ? `<div class="detail">${details}</div>`
        : ""
    }
  `;
}

function render() {
  const q = (search.value || "").toLowerCase().trim();
  const f = filter.value;

  grid.innerHTML = "";

  const filtered = all.filter(item => {
    const hay = `${item.title || ""} ${item.id || ""}`.toLowerCase();
    const matchesQuery = !q || hay.includes(q);
    const matchesFilter = f === "all" || item.status === f;
    return matchesQuery && matchesFilter;
  });

  filtered.forEach(item => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div class="id">${escapeHTML(item.id)}</div>
      <div class="title">${escapeHTML(item.title)}</div>
      <div class="meta">
        ${badge(item.status)}
        <span>${escapeHTML(item.date || "")}</span>
      </div>
    `;
    div.onclick = () => openCard(item);
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

function applyAtlasGit(items) {
  const map = new Map();

  items.forEach(item => {
    map.set(String(item.id), {
      text: String(item.text ?? ""),
      inner: item.inner || "text"
    });
  });

  document.querySelectorAll("[AtlasGit]").forEach(el => {
    const id = el.getAttribute("AtlasGit");

    if (!id || !map.has(id)) {
      return;
    }

    const data = map.get(id);

    if (data.inner === "html") {
      el.innerHTML = data.text;
    } else {
      el.textContent = data.text;
    }
  });
}

closeBtn.onclick = () => modal.classList.remove("active");

modal.onclick = e => {
  if (e.target === modal) modal.classList.remove("active");
};

search.oninput = render;
filter.onchange = render;

document.getElementById("themeBtn").onclick = () => {
  document.body.classList.toggle("dark");
  localStorage.setItem(
    "theme",
    document.body.classList.contains("dark") ? "dark" : "light"
  );
};

if (localStorage.getItem("theme") === "dark") {
  document.body.classList.add("dark");
}

async function syncIssues() {
  const remote = await githubIssues();
  setAll(remote);
}

async function syncAtlasGit() {
  let items = await githubAtlasGit();

  if (!items.length) {
    items = await loadAtlasGitBackup();
  }

  atlasItems = dedupe(items);
  applyAtlasGit(atlasItems);
}

(async () => {
  const cachedIssues = loadCache(CACHE_KEY_ISSUES);
  const cachedAtlas = loadCache(CACHE_KEY_ATLAS);
  setAll(cachedIssues);

  if (cachedAtlas.length) {
    atlasItems = cachedAtlas;
    applyAtlasGit(atlasItems);
  }

  await syncIssues();
  await syncAtlasGit();

  setInterval(syncIssues, SYNC_INTERVAL);
  setInterval(syncAtlasGit, SYNC_INTERVAL);
})();
