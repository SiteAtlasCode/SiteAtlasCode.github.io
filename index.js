const GITHUB_OWNER = "siteatlascode";
const GITHUB_REPO = "siteatlascode.github.io";

const CACHE_KEY = "atlas_issues_cache";    
const CACHE_TIME = "atlas_issues_time";    
const SYNC_INTERVAL = 300000;    

const data = [    
  {    
    id: "ALS-001",    
    title: "پرونده APT WAR",    
    status: "high",    
    date: "2026/06/7",    
    desc: "بررسی تکمیل و نتیجه ثبت شد. به زودی آپلود می‌شود."    
  }    
];    

    window.AtlasToolsConfig = Object.freeze({
  tamper: false,
  host: false,
  domainLock: false,
  loaderMin: 2500,
  rightClick: false,
  devtools: false
});

const grid = document.getElementById("grid");    
const search = document.getElementById("search");    
const filter = document.getElementById("filter");    
const modal = document.getElementById("modal");    
const modalContent = document.getElementById("modalContent");    

let all = [];    

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

function loadCache() {    
  try {    
    const cache = localStorage.getItem(CACHE_KEY);    
    if (!cache) return [];    
    const parsed = JSON.parse(cache);    
    return Array.isArray(parsed) ? parsed : [];    
  } catch {    
    return [];    
  }    
}    

function saveCache(items) {    
  try {    
    localStorage.setItem(CACHE_KEY, JSON.stringify(items));    
    localStorage.setItem(CACHE_TIME, String(Date.now()));    
  } catch {}    
}    

function clearCache() {    
  try {    
    localStorage.removeItem(CACHE_KEY);    
    localStorage.removeItem(CACHE_TIME);    
  } catch {}    
}    

function normalizeGitHubIssue(issue) {    
  const body = issue.body || "";    
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

    const parsed = issues    
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
  modal.classList.add("active");    
  modalContent.innerHTML = `    
    <div class="id">${item.id}</div>    
    <h2 style="margin-top:8px">${item.title}</h2>    
    <div style="margin-top:12px">${badge(item.status)}</div>    
    <div class="detail">${item.details || item.desc || ""}</div>    
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
      <div class="id">${item.id}</div>    
      <div class="title">${item.title}</div>    
      <div class="meta">    
        ${badge(item.status)}    
        <span>${item.date || ""}</span>    
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

document.getElementById("close").onclick = () => modal.classList.remove("active");    

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
  setAll([...data, ...remote]);    
}    

(async () => {    
  const cached = loadCache();    

  if (cached.length) {    
    setAll([...data, ...cached]);    
  } else {    
    setAll(data);    
  }    

  await syncIssues();    
  setInterval(syncIssues, SYNC_INTERVAL);    
})();
