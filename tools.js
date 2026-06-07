(()=>{"use strict";
const W=window,D=document,N=navigator,L=location,S=localStorage,SS=sessionStorage;

const CFG_IN=W.AtlasToolsConfig&&typeof W.AtlasToolsConfig==="object"?W.AtlasToolsConfig:{};
const DEF={
  host:["siteatlascode.github.io","www.siteatlascode.github.io"],
  domainLock:true,
  rightClick:true,
  devtools:true,
  tamper:true,
  ip:true,
  device:true,
  captcha:true,
  loader:true,
  loaderMin:2500,
  integrityUrl:"https://siteatlascode.github.io/tools.js",
  expectedToolsHash:"",
  allowedScriptSrcs:["https://siteatlascode.github.io/tools.js","https://www.siteatlascode.github.io/tools.js"],
  captchaPool:[{img:"1.png",code:"H3h&8"},{img:"2.png",code:"A7P#2"},{img:"3.png",code:"Q8m@9"},],
  banThresholds:{medium:20,high:40,veryHigh:60,extreme:80},
  banDurations:{captchaFail:10*60*1000,medium:0,high:0,highRiskBan:60*60*1000,extremeBan:12*60*60*1000},
  ipPollUrl:"https://api.ipify.org?format=json",
  ipPollEvery:5*60*1000,
  maxIpChangesPerDay:4,
  maxFlapsPerHour:10
};
const CFG=Object.assign({},DEF,CFG_IN);

const SELF=D.currentScript||Array.from(D.scripts).slice(-1)[0]||null;
const SELF_SRC=SELF&&SELF.src?new URL(SELF.src,L.href).href:"";

const STATE={
  blocked:false,
  booted:false,
  verified:false,
  risk:0,
  lastCaptcha:null,
  lastIp:null,
  lastIpDay:null
};

const K={
  ban:"atlas_sec_ban_v3",
  ip:"atlas_sec_ip_v3",
  fp:"atlas_sec_fp_v3",
  net:"atlas_sec_net_v3",
  cfg:"atlas_sec_cfg_v3",
  chk:"atlas_sec_chk_v3"
};

const wait=ms=>new Promise(r=>setTimeout(r,ms));
const now=()=>Date.now();
const rand=arr=>arr[Math.floor(Math.random()*arr.length)];
const isObj=v=>v&&typeof v==="object"&&!Array.isArray(v);
const str=v=>v==null?"":String(v);
const lower=v=>str(v).toLowerCase();
const safeJsonParse=(v,f)=>{try{return JSON.parse(v)}catch{return f}};
const getAllowedHosts=()=>Array.isArray(CFG.host)?CFG.host.map(lower).filter(Boolean):typeof CFG.host==="string"?[lower(CFG.host)]:[];
const cleanUrl=u=>{try{return new URL(u,L.href).href}catch{return ""}};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));

const css=(tag,style,id)=>{const e=D.createElement(tag);if(id)e.id=id;if(style)e.style.cssText=style;return e};
const rm=id=>D.getElementById(id)?.remove();
const setText=(el,txt)=>{if(el)el.textContent=txt};

const storeRead=(k,f)=>safeJsonParse(S.getItem(k),f);
const storeWrite=(k,v)=>{try{S.setItem(k,JSON.stringify(v))}catch{}};
const getBan=()=>storeRead(K.ban,null);
const clearBan=()=>{try{S.removeItem(K.ban)}catch{}};

const setBan=(reason,durationMs,meta={})=>{
  const started=now();
  const duration=Math.max(0,durationMs|0);
  const expires=started+duration;
  const ban={reason:String(reason||"Blocked"),started,expires,durationMs:duration,meta};
  storeWrite(K.ban,ban);
  return ban;
};

const msToClock=ms=>{
  ms=Math.max(0,ms|0);
  const s=Math.floor(ms/1000);
  const d=Math.floor(s/86400);
  const h=Math.floor((s%86400)/3600);
  const m=Math.floor((s%3600)/60);
  const sec=s%60;
  return d>0?`${d}d ${h}h ${m}m ${sec}s`:`${h}h ${m}m ${sec}s`;
};

const hostnameOk=()=>{
  if(!CFG.domainLock) return true;
  const hosts=getAllowedHosts();
  if(!hosts.length) return true;
  return hosts.includes(lower(L.hostname));
};

const detectTamperConfigFalse=()=>Object.values(CFG).reduce((n,v)=>n+(v===false?1:0),0);
const repairConfigIfNeeded=()=>{
  if(detectTamperConfigFalse()<=5) return false;
  W.AtlasToolsConfig=Object.assign({},DEF,CFG_IN,{
    domainLock:DEF.domainLock,
    rightClick:DEF.rightClick,
    devtools:DEF.devtools,
    tamper:DEF.tamper,
    ip:DEF.ip,
    device:DEF.device,
    captcha:DEF.captcha,
    loader:DEF.loader
  });
  return true;
};

const verifyCurrentBan=()=>{
  const ban=getBan();
  if(!ban) return null;
  if(now()>=ban.expires){ clearBan(); return null; }
  return ban;
};

const cleanAndAllow=(arr,fallback)=>{
  const srcs=(Array.isArray(arr)&&arr.length?arr:fallback).map(cleanUrl).filter(Boolean);
  return srcs;
};

const verifySameScriptSrc=()=>{
  if(!CFG.tamper) return true;
  if(!SELF_SRC) return true;
  const allowed=cleanAndAllow(CFG.allowedScriptSrcs,[CFG.integrityUrl]);
  if(!allowed.length) return true;
  return allowed.includes(cleanUrl(SELF_SRC));
};

const kill=(reason,durationMs,meta={})=>{
  if(STATE.blocked) return;
  STATE.blocked=true;
  clearOverlays();
  setBan(reason,durationMs,meta);
  renderBan();
};

const ensureStyle=()=>{
  if(D.getElementById("atlas-sec-style")) return;
  const st=D.createElement("style");
  st.id="atlas-sec-style";
  st.textContent=`
@keyframes atlasSpin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}
@keyframes atlasSweep{0%{transform:translateX(-110%)}100%{transform:translateX(110%)}}
@keyframes atlasPulse{0%,100%{opacity:.22;transform:scaleX(.96)}50%{opacity:1;transform:scaleX(1)}}
@keyframes atlasBlink{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes atlasFadeIn{0%{opacity:0;transform:translateY(10px) scale(.985)}100%{opacity:1;transform:translateY(0) scale(1)}}
@keyframes atlasFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes atlasGlow{0%,100%{filter:drop-shadow(0 0 6px rgba(255,255,255,.18))}50%{filter:drop-shadow(0 0 18px rgba(255,255,255,.34))}}
@keyframes atlasShimmer{0%{background-position:-220% 0}100%{background-position:220% 0}}
@keyframes atlasShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-1px)}40%{transform:translateX(1px)}60%{transform:translateX(-1px)}80%{transform:translateX(1px)}}
`;
  D.head.appendChild(st);
};

const overlay=(id,style)=>{
  let e=D.getElementById(id);
  if(e) return e;
  e=css("div",style,id);
  D.documentElement.appendChild(e);
  return e;
};
const clearOverlays=()=>["atlas-sec-loader","atlas-sec-human","atlas-sec-ban","atlas-sec-audit"].forEach(rm);

const blockRightClick=()=>{
  if(!CFG.rightClick) return;
  D.addEventListener("contextmenu",e=>e.preventDefault(),{capture:true});
  D.addEventListener("keydown",e=>{
    const k=str(e.key).toLowerCase();
    if(e.key==="F12"||(e.ctrlKey&&e.shiftKey&&k==="i")||(e.ctrlKey&&e.shiftKey&&k==="j")||(e.ctrlKey&&k==="u")||(e.ctrlKey&&k==="s")||(e.ctrlKey&&k==="p")){
      e.preventDefault();
    }
  },{capture:true});
};

const detectDevtools=()=>{
  if(!CFG.devtools) return;
  let last=0;
  const tick=()=>{
    if(STATE.blocked) return;
    const w=W.outerWidth-W.innerWidth;
    const h=W.outerHeight-W.innerHeight;
    if((w>160||h>160)&&now()-last>1500){
      last=now();
      kill("Developer tools detected",12*60*60*1000,{kind:"devtools"});
    }
  };
  setInterval(tick,700);
};

const initialNetworkState=()=>{
  const n=storeRead(K.net,{hour:Math.floor(now()/3600000),flaps:0,day:Math.floor(now()/86400000),ipChanges:0});
  if(!isObj(n)) return {hour:Math.floor(now()/3600000),flaps:0,day:Math.floor(now()/86400000),ipChanges:0};
  return {
    hour:typeof n.hour==="number"?n.hour:Math.floor(now()/3600000),
    flaps:typeof n.flaps==="number"?n.flaps:0,
    day:typeof n.day==="number"?n.day:Math.floor(now()/86400000),
    ipChanges:typeof n.ipChanges==="number"?n.ipChanges:0
  };
};
const networkState=initialNetworkState();
const persistNetworkState=()=>storeWrite(K.net,networkState);

const bumpFlap=()=>{
  const h=Math.floor(now()/3600000);
  if(networkState.hour!==h){ networkState.hour=h; networkState.flaps=0; }
  networkState.flaps++;
  persistNetworkState();
  if(CFG.ip&&networkState.flaps>CFG.maxFlapsPerHour){
    kill("Network instability detected",60*60*1000,{kind:"flap",flaps:networkState.flaps});
  }
};
const observeNetwork=()=>{
  addEventListener("online",bumpFlap,{passive:true});
  addEventListener("offline",bumpFlap,{passive:true});
};

const hashSha256=async txt=>{
  const data=new TextEncoder().encode(txt);
  const buf=await crypto.subtle.digest("SHA-256",data);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
};
const normalizeSrcText=t=>String(t||"").replace(/\r\n/g,"\n").replace(/^\uFEFF/,"").replace(/\s+/g," ").trim();

const integrityCheck=async()=>{
  if(!CFG.tamper) return true;
  const selfUrl=cleanUrl(SELF_SRC);
  const integrityUrl=cleanUrl(CFG.integrityUrl||SELF_SRC);
  if(!selfUrl||!integrityUrl) return true;
  const allowed=cleanAndAllow(CFG.allowedScriptSrcs,[integrityUrl]);
  if(allowed.length&&!allowed.includes(selfUrl)) return false;
  try{
    const res=await fetch(integrityUrl,{cache:"no-store",credentials:"omit"});
    if(!res.ok) return false;
    const remoteText=await res.text();
    const localText=SELF&&SELF.src?"":(SELF?.textContent||"");
    if(CFG.expectedToolsHash){
      const h=await hashSha256(normalizeSrcText(remoteText));
      return lower(h)===lower(String(CFG.expectedToolsHash).trim());
    }
    if(localText){
      return normalizeSrcText(remoteText)===normalizeSrcText(localText);
    }
    return true;
  }catch{
    return true;
  }
};

const scriptInjectionGuard=()=>{
  if(!CFG.tamper) return;
  const allowed=cleanAndAllow(CFG.allowedScriptSrcs,[CFG.integrityUrl||SELF_SRC]);
  const isAllowedScript=s=>{
    const src=s&&s.src?cleanUrl(s.src):"";
    if(!src) return true;
    return allowed.includes(src);
  };
  const obs=new MutationObserver(muts=>{
    if(STATE.blocked) return;
    for(const m of muts){
      for(const node of m.addedNodes||[]){
        if(node&&node.nodeType===1&&node.tagName==="SCRIPT"){
          if(!isAllowedScript(node)){
            kill("Unauthorized script injection",12*60*60*1000,{kind:"script-injection",src:cleanUrl(node.src||"")});
            return;
          }
        }
      }
    }
  });
  obs.observe(D.documentElement,{childList:true,subtree:true});
};

const getWebGLFingerprint=()=>{
  try{
    const c=D.createElement("canvas");
    const gl=c.getContext("webgl")||c.getContext("experimental-webgl");
    if(!gl) return "no-webgl";
    const dbg=gl.getExtension("WEBGL_debug_renderer_info");
    const vendor=dbg?gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR);
    const renderer=dbg?gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
    const version=gl.getParameter(gl.VERSION);
    return [vendor,renderer,version].map(str).join("|");
  }catch{return "webgl-error";}
};

const getCanvasFingerprint=()=>{
  try{
    const c=D.createElement("canvas");
    c.width=220;c.height=60;
    const ctx=c.getContext("2d");
    if(!ctx) return "no-canvas";
    ctx.textBaseline="top";
    ctx.font="16px Arial";
    ctx.fillStyle="#111";
    ctx.fillRect(0,0,220,60);
    ctx.fillStyle="#eee";
    ctx.fillText("AtlasSecurity::"+L.hostname,8,8);
    ctx.beginPath();
    ctx.arc(160,22,12,0,Math.PI*2);
    ctx.fill();
    return c.toDataURL();
  }catch{return "canvas-error";}
};

const getFp=()=>{
  const scrObj=W.screen||{};
  const scr=`${scrObj.width||0}x${scrObj.height||0}x${scrObj.colorDepth||0}x${scrObj.pixelDepth||0}@${W.devicePixelRatio||1}`;
  const lang=(N.languages||[]).join(",");
  const plugins=(N.plugins&&typeof N.plugins.length==="number")?String(N.plugins.length):"0";
  const touch=String(N.maxTouchPoints||0);
  const hc=String(N.hardwareConcurrency||0);
  const webdriver=String(!!N.webdriver);
  const ua=str(N.userAgent);
  const webgl=getWebGLFingerprint();
  const canvas=getCanvasFingerprint();
  const tz=Intl.DateTimeFormat().resolvedOptions().timeZone||"";
  const platform=str(N.platform);
  const vendor=str(N.vendor);
  const memory=String(N.deviceMemory||0);
  return {ua,scr,lang,plugins,touch,hc,webdriver,webgl,canvas,tz,platform,vendor,memory};
};

const fingerprintRisk=async()=>{
  if(!CFG.device) return 0;
  let risk=0;
  const ua=lower(N.userAgent||"");
  if(/headless|phantom|selenium|playwright|puppeteer/.test(ua)) risk+=40;
  if(N.webdriver) risk+=55;
  if((N.plugins&&N.plugins.length===0)) risk+=8;
  if((N.languages||[]).length===0) risk+=10;
  if((N.maxTouchPoints||0)===0&&/android|iphone|ipad|mobile/.test(ua)) risk+=10;
  if((N.hardwareConcurrency||0)<=1) risk+=10;
  const scrObj=W.screen||{};
  if(!scrObj.width||!scrObj.height||scrObj.width<320||scrObj.height<240) risk+=8;
  const fp=getFp();
  const prev=storeRead(K.fp,null);
  if(prev&&JSON.stringify(prev)!==JSON.stringify(fp)) risk+=15;
  storeWrite(K.fp,fp);
  return risk;
};

const getIpInfo=async()=>{
  if(!CFG.ip) return null;
  try{
    const r=await fetch(CFG.ipPollUrl,{cache:"no-store",credentials:"omit"});
    if(!r.ok) return null;
    const j=await r.json();
    const ip=j&&typeof j==="object"?(j.ip||j.address||j.query||j.origin||null):null;
    return ip?String(ip):null;
  }catch{return null;}
};

const ipRisk=async()=>{
  if(!CFG.ip) return 0;
  const day=Math.floor(now()/86400000);
  if(networkState.day!==day){ networkState.day=day; networkState.ipChanges=0; }
  const ip=await getIpInfo();
  if(ip){
    if(STATE.lastIp===null){
      STATE.lastIp=ip;
      STATE.lastIpDay=day;
    }else if(STATE.lastIp!==ip){
      STATE.lastIp=ip;
      STATE.lastIpDay=day;
      networkState.ipChanges++;
      persistNetworkState();
      if(networkState.ipChanges>CFG.maxIpChangesPerDay){
        kill("Excessive IP changes",60*60*1000,{kind:"ip-change",changes:networkState.ipChanges});
        return 999;
      }
    }
  }
  return 0;
};

const randomCaptcha=()=>{
  const pool=Array.isArray(CFG.captchaPool)&&CFG.captchaPool.length?CFG.captchaPool:DEF.captchaPool;
  return JSON.parse(JSON.stringify(rand(pool)));
};

const renderLoader = async () => {
    if (!CFG.loader) return;

    ensureStyle();
    clearOverlays();

    const wrap = overlay(
        "atlas-sec-loader",
        "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#050505;overflow:hidden;z-index:2147483646;transition:opacity .45s ease;"
    );

    wrap.innerHTML = "";

    const sweep = css(
        "div",
        "position:absolute;inset:0;background:linear-gradient(130deg,transparent 15%,rgba(255,255,255,.06) 50%,transparent 80%);animation:atlasSweep 1.2s linear infinite;"
    );

    const line = css(
        "div",
        "position:relative;width:min(320px,72vw);height:3px;border-radius:99px;background:linear-gradient(90deg,transparent,#fff,transparent);box-shadow:0 0 12px #fff,0 0 30px rgba(255,255,255,.3);animation:atlasPulse .7s ease infinite;"
    );

    wrap.appendChild(sweep);
    wrap.appendChild(line);

    const start = now();

    await Promise.race([
        new Promise(resolve => {
            if (document.readyState === "complete") {
                resolve();
                return;
            }
            window.addEventListener("load", resolve, { once: true });
        }),
        wait(12000)
    ]);

    const remain = Math.max(
        0,
        (CFG.loaderMin | 0) - (now() - start)
    );

    if (remain > 0) {
        await wait(remain);
    }

    wrap.style.opacity = "0";

    await wait(450);

    wrap.remove();
};

const renderCaptcha=()=>new Promise(resolve=>{
  ensureStyle();
  clearOverlays();
  let cap=randomCaptcha();
  STATE.lastCaptcha=cap;

  const box=overlay("atlas-sec-human",`
position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
background:
radial-gradient(circle at 20% 20%, rgba(255,255,255,.08), transparent 32%),
radial-gradient(circle at 80% 0%, rgba(255,255,255,.04), transparent 26%),
rgba(5,5,5,.96);
backdrop-filter:blur(12px);z-index:2147483647;font-family:system-ui,sans-serif;color:#fff;padding:20px;
`);
  box.innerHTML="";
  const card=css("div",`
width:min(480px,92vw);
background:linear-gradient(180deg, rgba(20,20,20,.98), rgba(10,10,10,.98));
border:1px solid rgba(255,255,255,.08);
border-radius:26px;
box-shadow:0 22px 80px rgba(0,0,0,.62), inset 0 1px 0 rgba(255,255,255,.04);
padding:18px;
display:grid;
gap:14px;
animation:atlasFadeIn .18s ease-out;
`);
  const head=css("div","display:flex;align-items:center;justify-content:space-between;gap:12px;");
  const title=css("div","font-size:18px;font-weight:900;letter-spacing:.2px;");
  title.textContent="تأیید انسانی";
  const tag=css("div","font-size:12px;opacity:.72;");
  tag.textContent="کد تصویر را وارد کن";
  head.appendChild(title); head.appendChild(tag);

  const frame=css("div",`
border-radius:20px;overflow:hidden;background:#0f0f0f;border:1px solid rgba(255,255,255,.08);
box-shadow:inset 0 0 0 1px rgba(255,255,255,.02);
`);
  const img=css("img","display:block;width:100%;height:190px;object-fit:cover;user-select:none;pointer-events:none;");
  img.alt="captcha";
  img.src=cleanUrl(cap.img||"");
  frame.appendChild(img);

  const prompt=css("div","font-size:15px;opacity:.9;line-height:1.8;");
  prompt.textContent="کاراکترها را دقیقاً از روی تصویر بنویس.";
  const input=css("input",`
width:100%;box-sizing:border-box;background:#fff;color:#111;border:0;border-radius:16px;
padding:14px 16px;font-size:16px;font-weight:800;outline:none;
box-shadow:0 10px 28px rgba(0,0,0,.18);
`);
  input.type="text"; input.autocomplete="off"; input.spellcheck=false; input.placeholder="کد تصویر";
  const honey=css("input","position:absolute;left:-9999px;top:auto;width:1px;height:1px;opacity:0;pointer-events:none;");
  honey.type="text"; honey.autocomplete="off"; honey.tabIndex=-1;

  const status=css("div","min-height:22px;font-size:13px;opacity:.78;line-height:1.6;");
  status.textContent="";
  const row=css("div","display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:flex-start;");
  const submit=css("button",`
border:0;background:#fff;color:#111;padding:13px 18px;border-radius:14px;font-size:15px;
font-weight:900;cursor:pointer;box-shadow:0 0 16px rgba(255,255,255,.14);
`);
  submit.type="button"; submit.textContent="تأیید";
  const refresh=css("button",`
border:1px solid rgba(255,255,255,.14);background:transparent;color:#fff;padding:13px 18px;
border-radius:14px;font-size:15px;font-weight:800;cursor:pointer;
`);
  refresh.type="button"; refresh.textContent="عکس جدید";
  row.appendChild(submit); row.appendChild(refresh);

  const hint=css("div","font-size:12px;opacity:.56;line-height:1.7;");
  hint.textContent="اگر فیلد مخفی پر شود، دسترسی مسدود می‌شود.";

  card.appendChild(head);
  card.appendChild(frame);
  card.appendChild(prompt);
  card.appendChild(input);
  card.appendChild(honey);
  card.appendChild(status);
  card.appendChild(row);
  card.appendChild(hint);
  box.appendChild(card);

  let failCount=0;
  let busy=false;

  const fail=msg=>{
    status.textContent=msg||"خطا";
    card.style.animation="atlasShake .35s ease";
    setTimeout(()=>{card.style.animation="atlasFadeIn .18s ease-out"},360);
    failCount++;
    if(failCount>=3){
      kill("Captcha failed 3 times",CFG.banDurations.captchaFail,{kind:"captcha-fail",fails:failCount});
      resolve(false);
    }else{
      input.value="";
      honey.value="";
      input.focus();
    }
  };

  const applyNewCaptcha=()=>{
    cap=randomCaptcha();
    STATE.lastCaptcha=cap;
    img.src=cleanUrl(cap.img||"")+(cap.img?"?v="+Date.now():"");
    input.value="";
    honey.value="";
    status.textContent="";
    input.focus();
  };

  const verify=async()=>{
    if(busy||STATE.blocked) return;
    busy=true;
    const answer=str(input.value).trim();
    const hidden=str(honey.value).trim();
    if(hidden.length){
      kill("Hidden captcha field filled",12*60*60*1000,{kind:"honeypot"});
      resolve(false);
      return;
    }
    if(!answer){ busy=false; fail("کد را وارد کن"); return; }
    if(answer!==str(cap.code).trim()){ busy=false; fail("کد اشتباه است"); return; }
    STATE.verified=true;
    box.remove();
    resolve(true);
  };

  submit.addEventListener("click",verify);
  refresh.addEventListener("click",()=>{ if(STATE.blocked) return; applyNewCaptcha(); });
  input.addEventListener("keydown",e=>{ if(e.key==="Enter") verify(); });
  setTimeout(()=>input.focus(),0);
});

const renderAudit=reason=>{
  ensureStyle();
  clearOverlays();
  const box=overlay("atlas-sec-audit",`
position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
background:
radial-gradient(circle at 20% 20%, rgba(255,255,255,.08), transparent 32%),
rgba(4,4,4,.95);
backdrop-filter:blur(10px);
z-index:2147483647;color:#fff;font-family:system-ui,sans-serif;padding:20px;
`);
  box.innerHTML="";
  const card=css("div",`
width:min(560px,94vw);
background:linear-gradient(180deg, rgba(18,18,18,.98), rgba(10,10,10,.98));
border:1px solid rgba(255,255,255,.08);
border-radius:26px;
box-shadow:0 22px 80px rgba(0,0,0,.62);
padding:18px;
display:grid;
gap:12px;
animation:atlasFadeIn .18s ease-out;
`);
  const t=css("div","font-size:18px;font-weight:900;");
  t.textContent="بررسی امنیتی";
  const txt=css("div","font-size:14px;opacity:.82;line-height:1.85;white-space:pre-wrap;");
  txt.textContent=reason||"در حال بررسی...";
  const sub=css("div","font-size:12px;opacity:.62;line-height:1.7;");
  sub.textContent="این مرحله موقت است.";
  card.appendChild(t); card.appendChild(txt); card.appendChild(sub);
  box.appendChild(card);
  return {box,txt};
};

const renderBan=()=>{
  ensureStyle();
  clearOverlays();
  const ban=verifyCurrentBan();
  if(!ban) return;
  STATE.blocked=true;
  const box=overlay("atlas-sec-ban",`
position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
background:
radial-gradient(circle at 20% 20%, rgba(255,255,255,.08), transparent 32%),
radial-gradient(circle at 80% 80%, rgba(255,255,255,.05), transparent 24%),
rgba(0,0,0,.96);
backdrop-filter:blur(12px);
z-index:2147483647;color:#fff;font-family:system-ui,sans-serif;padding:22px;
`);
  box.innerHTML="";
  const card=css("div",`
width:min(620px,95vw);
background:linear-gradient(180deg, rgba(22,22,22,.98), rgba(12,12,12,.98));
border:1px solid rgba(255,255,255,.09);
border-radius:28px;
box-shadow:0 22px 80px rgba(0,0,0,.66), inset 0 1px 0 rgba(255,255,255,.04);
padding:22px;
display:grid;
gap:14px;
animation:atlasFadeIn .18s ease-out;
`);
  const title=css("div","font-size:21px;font-weight:950;letter-spacing:.2px;");
  title.textContent="دسترسی مسدود شد";
  const reason=css("div","font-size:14px;line-height:1.9;opacity:.92;white-space:pre-wrap;");
  reason.textContent=`دلیل: ${ban.reason}`;
  const timer=css("div","font-size:15px;font-weight:900;line-height:1.8;");
  const meta=css("div","font-size:12px;line-height:1.75;opacity:.68;white-space:pre-wrap;");
  const controls=css("div","display:flex;gap:10px;flex-wrap:wrap;align-items:center;");
  const btn=css("button",`
border:0;background:#fff;color:#111;padding:13px 18px;border-radius:14px;font-size:15px;
font-weight:900;cursor:pointer;box-shadow:0 0 16px rgba(255,255,255,.14);
`);
  btn.type="button"; btn.textContent="چک مجدد";
  const note=css("div","font-size:12px;opacity:.62;line-height:1.7;");
  note.textContent="این دکمه فقط برای بن ۱۲ ساعته فعال است.";
  controls.appendChild(btn);
  card.appendChild(title); card.appendChild(reason); card.appendChild(timer); card.appendChild(meta); card.appendChild(controls); card.appendChild(note);
  box.appendChild(card);

  const update=()=>{
    const cur=verifyCurrentBan();
    if(!cur){
      clearOverlays();
      STATE.blocked=false;
      boot();
      return;
    }
    const left=cur.expires-now();
    setText(timer,`پایان بن: ${msToClock(left)}`);
    setText(meta,`شروع: ${new Date(cur.started).toLocaleString()}\nپایان: ${new Date(cur.expires).toLocaleString()}`);
    btn.style.display=cur.durationMs===12*60*60*1000?"inline-flex":"none";
  };

  btn.addEventListener("click",async()=>{
    const cur=verifyCurrentBan();
    if(!cur||cur.durationMs!==12*60*60*1000) return;
    btn.disabled=true;
    btn.textContent="در حال بررسی...";
    const audit=await auditAll({showAudit:false});
    if(audit.clear){
      const rem=now()+4*60*60*1000;
      storeWrite(K.ban,{...cur,expires:rem,durationMs:4*60*60*1000,reason:`${cur.reason} | recheck approved`});
      btn.textContent="محدودیت به ۴ ساعت کاهش یافت";
      setTimeout(()=>{btn.disabled=false;btn.textContent="چک مجدد";update()},1500);
    }else{
      btn.textContent="نیاز به محدودیت فعلی";
      setTimeout(()=>{btn.disabled=false;btn.textContent="چک مجدد"},1500);
    }
  });

  update();
  const t=setInterval(()=>{
    const cur=verifyCurrentBan();
    if(!cur){ clearInterval(t); return; }
    update();
  },1000);
};

const auditAll=async({showAudit=true}={})=>{
  const out={clear:false,reason:"",risk:0};
  const audit=showAudit?renderAudit("در حال ارزیابی سیگنال‌ها..."):null;

  const configFalseCount=detectTamperConfigFalse();
  if(configFalseCount>5){
    repairConfigIfNeeded();
    kill("Too many disabled config entries",12*60*60*1000,{kind:"config-false",count:configFalseCount});
    out.reason="config-false";
    return out;
  }

  if(!hostnameOk()){
    kill("Invalid domain",12*60*60*1000,{kind:"domain"});
    out.reason="domain";
    return out;
  }

  if(!verifySameScriptSrc()){
    kill("Tools.js source mismatch",12*60*60*1000,{kind:"src-mismatch",src:SELF_SRC});
    out.reason="src-mismatch";
    return out;
  }

  if(CFG.tamper){
    const ok=await integrityCheck();
    if(!ok){
      kill("Tools.js integrity mismatch",12*60*60*1000,{kind:"integrity"});
      out.reason="integrity";
      return out;
    }
  }

  const fpRisk=await fingerprintRisk();
  const ipR=await ipRisk();
  const risk=fpRisk+ipR;
  STATE.risk=risk;

  const t=CFG.banThresholds||DEF.banThresholds;
  const d=CFG.banDurations||DEF.banDurations;

  if(showAudit&&audit){
    audit.txt.textContent=`ریسک: ${risk}\n\nFingerprint:\n${JSON.stringify(getFp(),null,2)}`;
  }

  if(risk>=t.extreme){
    kill("Very high security risk",d.extremeBan,{kind:"risk",risk});
    out.reason="risk-extreme";
    return out;
  }

  if(risk>=t.veryHigh){
    kill("High security risk",d.highRiskBan,{kind:"risk",risk});
    out.reason="risk-highban";
    return out;
  }

  if(risk>=t.high){
    if(CFG.captcha){
      const ok=await renderCaptcha();
      if(!ok){ out.reason="captcha-failed"; return out; }
    }
    await wait(10*1000);
    out.clear=true;
    out.reason="risk-high-delay";
    return out;
  }

  if(risk>=t.medium){
    if(CFG.captcha){
      const ok=await renderCaptcha();
      if(!ok){ out.reason="captcha-failed"; return out; }
    }
    out.clear=true;
    out.reason="risk-medium-captcha";
    return out;
  }

  out.clear=true;
  out.reason="risk-low";
  return out;
};

const pollIpLoop=async()=>{
  if(!CFG.ip) return;
  while(!STATE.blocked){
    await wait(CFG.ipPollEvery|0);
    if(STATE.blocked) break;
    const cur=await getIpInfo();
    if(cur&&STATE.lastIp&&cur!==STATE.lastIp){
      const d=Math.floor(now()/86400000);
      if(networkState.day!==d){ networkState.day=d; networkState.ipChanges=0; }
      networkState.ipChanges++;
      persistNetworkState();
      STATE.lastIp=cur;
      if(networkState.ipChanges>CFG.maxIpChangesPerDay){
        kill("Excessive IP changes",60*60*1000,{kind:"ip-change",changes:networkState.ipChanges});
        break;
      }
    }
    if(cur&&!STATE.lastIp) STATE.lastIp=cur;
  }
};

const captchaGate=async()=>{
  if(!CFG.captcha) return true;
  const r=await renderCaptcha();
  return !!r;
};

const boot=async()=>{
  if(STATE.booted) return;
  STATE.booted=true;

  const ban=verifyCurrentBan();
  if(ban){ renderBan(); return; }

  if(!hostnameOk()){
    kill("Invalid domain",12*60*60*1000,{kind:"domain"});
    return;
  }

  if(detectTamperConfigFalse()>5){
    repairConfigIfNeeded();
    kill("Too many disabled config entries",12*60*60*1000,{kind:"config-false"});
    return;
  }

  blockRightClick();
  detectDevtools();
  observeNetwork();
  scriptInjectionGuard();

  if(CFG.loader) await renderLoader();
  if(STATE.blocked) return;

  const res=await auditAll({showAudit:false});
  if(!res.clear){
    if(STATE.blocked) return;
    if(res.reason==="risk-medium-captcha"){
      STATE.verified=await captchaGate();
      if(STATE.verified) pollIpLoop();
      return;
    }
    if(res.reason==="risk-high-delay"){
      STATE.verified=await captchaGate();
      if(!STATE.verified){
        kill("Verification required",10*60*1000,{kind:"captcha-fail"});
        return;
      }
    }
    if(res.reason==="risk-low"){
      STATE.verified=true;
      pollIpLoop();
      return;
    }
    return;
  }

  STATE.verified=true;
  pollIpLoop();
};

if(document.readyState==="loading"){
  D.addEventListener("DOMContentLoaded",boot,{once:true});
}else{
  boot();
}
})();

window.ATLAS_CORE_LOADED = true;
