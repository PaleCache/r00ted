(function () {
  let currentPath = "";
  let currentList = [];    
  let currentIndex = -1;    
  let searchTimer = null;
  let pollTimer = null;
  let lastSig = "";
  let els = {};
  function setWatching(title) {
    window.currentVideoWatching = title || null;
    if (typeof broadcastStreamStatus === "function") broadcastStreamStatus();
  }

  const token = () => localStorage.getItem("chatToken");
  const withToken = (url) => url; 
  const authHeaders = () => ({ Authorization: `Bearer ${token()}` });

  function fmtSize(b) {
    if (b > 1073741824) return (b / 1073741824).toFixed(2) + " GB";
    if (b > 1048576) return (b / 1048576).toFixed(1) + " MB";
    return Math.max(1, Math.round(b / 1024)) + " KB";
  }
  function fmtDuration(s) {
    if (!Number.isFinite(s)) return "";
    s = Math.floor(s);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(sec).padStart(2, "0");
  }
  function timeAgo(ts) {
    const d = (Date.now() - ts) / 1000;
    if (d < 3600) return Math.max(1, Math.floor(d / 60)) + " minutes ago";
    if (d < 86400) return Math.floor(d / 3600) + " hours ago";
    if (d < 2592000) return Math.floor(d / 86400) + " days ago";
    if (d < 31536000) return Math.floor(d / 2592000) + " months ago";
    return Math.floor(d / 31536000) + " years ago";
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function injectStyles() {
    if (document.getElementById("vlStyles")) return;
    const style = document.createElement("style");
    style.id = "vlStyles";
    style.textContent = `
      #videoModal { position:fixed; inset:0; pointer-events:none; display:none; align-items:center; justify-content:center; z-index:40000; }
      #videoModal.show { display:flex; }
      #videoBox {
        width:1100px; max-width:96vw; height:680px; max-height:92vh; min-width:520px; min-height:380px;
        background:#0f0f0f; border:1px solid #3a3c42; border-radius:14px; display:flex; flex-direction:column;
        overflow:hidden; pointer-events:auto; position:relative; color:#f1f1f1;
        font-family:'Inter',system-ui,sans-serif;
      }
      #videoHeader { display:flex; align-items:center; gap:14px; padding:10px 16px; background:#0f0f0f; cursor:move; user-select:none; flex-shrink:0; border-bottom:1px solid #272727; }
      .vl-logo { font-weight:700; font-size:16px; display:flex; align-items:center; gap:6px; pointer-events:none; white-space:nowrap; }
      .vl-logo i { background:#FF0000; color:#fff; font-style:normal; border-radius:6px; padding:1px 7px; font-size:12px; }
      #vlSearchWrap { flex:1; display:flex; justify-content:center; }
      #vlSearch { width:100%; max-width:420px; padding:7px 16px; background:#121212; border:1px solid #303030; border-radius:20px; color:#fff; font-size:14px; outline:none; }
      #vlSearch:focus { border-color:#3ea6ff; }
      #videoCloseBtn { background:none; border:none; color:#aaa; font-size:22px; cursor:pointer; transition:color .15s; }
      #videoCloseBtn:hover { color:#fff; }
      #vlBody { flex:1; min-height:0; overflow-y:auto; }
      #vlBody::-webkit-scrollbar { width:10px; } #vlBody::-webkit-scrollbar-thumb { background:#3a3a3a; border-radius:5px; }
      .vl-crumbs { display:flex; flex-wrap:wrap; gap:6px; padding:12px 16px 0; font-size:13px; color:#aaa; }
      .vl-crumbs span { cursor:pointer; padding:3px 8px; border-radius:12px; background:#272727; }
      .vl-crumbs span:hover { background:#3f3f3f; color:#fff; }
      .vl-folders { display:flex; flex-wrap:wrap; gap:8px; padding:12px 16px 0; }
      .vl-folder { background:#272727; padding:8px 14px; border-radius:10px; cursor:pointer; font-size:14px; }
      .vl-folder:hover { background:#3f3f3f; }
      .vl-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:20px 14px; padding:16px; }
      .vl-card { cursor:pointer; }
      .vl-thumb { position:relative; aspect-ratio:16/9; background:#272727; border-radius:12px; overflow:hidden; transition:border-radius .15s; }
      .vl-card:hover .vl-thumb { border-radius:4px; }
      .vl-thumb img, .vl-thumb video { width:100%; height:100%; object-fit:cover; display:block; pointer-events:none; }
      .vl-dur { position:absolute; right:6px; bottom:6px; background:rgba(0,0,0,.8); padding:1px 5px; border-radius:4px; font-size:12px; font-weight:600; }
      .vl-title { margin-top:10px; font-size:15px; font-weight:600; line-height:1.3; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; word-break:break-word; }
      .vl-meta { margin-top:4px; font-size:12px; color:#aaa; }
      .vl-empty { padding:60px 16px; text-align:center; color:#aaa; }
      .vl-watch { display:flex; gap:18px; padding:16px; flex-wrap:wrap; }
      .vl-main { flex:1 1 560px; min-width:0; }
      .vl-player { width:100%; aspect-ratio:16/9; background:#000; border-radius:12px; display:block; max-height:62vh; }
      .vl-wtitle { font-size:18px; font-weight:600; margin:12px 0 4px; word-break:break-word; }
      .vl-back { background:#272727; border:none; color:#fff; padding:7px 14px; border-radius:18px; cursor:pointer; font-size:13px; margin-bottom:12px; }
      .vl-back:hover { background:#3f3f3f; }
      .vl-side { flex:0 0 320px; display:flex; flex-direction:column; gap:10px; }
      .vl-side h4 { margin:0 0 2px; font-size:14px; color:#ddd; }
      .vl-up { display:flex; gap:8px; cursor:pointer; border-radius:8px; padding:4px; }
      .vl-up:hover, .vl-up.active { background:#272727; }
      .vl-up .vl-thumb { width:140px; flex-shrink:0; border-radius:8px; }
      .vl-up .vl-title { margin-top:0; font-size:13px; }
      #vlSearch:focus { border-color:#FF0000 !important; }
      .vl-pwrap { position:relative; width:100%; aspect-ratio:16/9; background:#000; border-radius:12px; overflow:hidden; max-height:62vh; outline:none; user-select:none; }
      .vl-pwrap:fullscreen { max-height:none; border-radius:0; aspect-ratio:auto; }
      .vl-pvideo { width:100%; height:100%; display:block; object-fit:contain; background:#000; cursor:pointer; }
      .vl-bigplay { position:absolute; left:50%; top:50%; width:64px; height:64px; margin:-32px 0 0 -32px; border-radius:50%; background:rgba(255,0,0,.85); display:flex; align-items:center; justify-content:center; opacity:0; pointer-events:none; transition:opacity .15s; }
      .vl-bigplay svg { width:34px; height:34px; }
      .vl-paused .vl-bigplay { opacity:1; }
      .vl-loading .vl-bigplay { opacity:0; }
      .vl-spinner { position:absolute; left:50%; top:50%; width:48px; height:48px; margin:-24px 0 0 -24px; border-radius:50%; border:4px solid rgba(255,255,255,.2); border-top-color:#FF0000; animation:vlSpin .8s linear infinite; opacity:0; pointer-events:none; transition:opacity .15s; }
      .vl-loading .vl-spinner { opacity:1; }
      @keyframes vlSpin { to { transform:rotate(360deg); } }
      .vl-controls { position:absolute; left:0; right:0; bottom:0; padding:24px 12px 8px; background:linear-gradient(transparent, rgba(0,0,0,.85)); transition:opacity .2s; }
      .vl-pwrap.vl-idle { cursor:none; }
      .vl-pwrap.vl-idle .vl-controls { opacity:0; }
      .vl-bar { position:relative; height:14px; cursor:pointer; }
      .vl-bar::before { content:""; position:absolute; left:0; right:0; top:50%; height:4px; margin-top:-2px; background:rgba(255,255,255,.25); border-radius:2px; }
      .vl-buf, .vl-fill { position:absolute; left:0; top:50%; height:4px; margin-top:-2px; border-radius:2px; width:0; }
      .vl-buf { background:rgba(255,255,255,.4); }
      .vl-fill { background:#FF0000; }
      .vl-knob { position:absolute; top:50%; left:0; width:12px; height:12px; border-radius:50%; background:#FF0000; transform:translate(-50%,-50%) scale(0); transition:transform .1s; }
      .vl-bar:hover .vl-knob, .vl-pwrap.vl-seeking .vl-knob { transform:translate(-50%,-50%) scale(1); }
      .vl-crow { display:flex; align-items:center; gap:8px; }
      .vl-cbtn { background:none; border:none; color:#fff; cursor:pointer; padding:4px; display:flex; align-items:center; opacity:.9; transition:color .15s; }
      .vl-cbtn:hover { color:#FF0000; opacity:1; }
      .vl-vol { -webkit-appearance:none; appearance:none; width:70px; height:14px; background:transparent; cursor:pointer; outline:none; --v:100%; }
      .vl-vol::-webkit-slider-runnable-track { height:4px; border-radius:2px; background:linear-gradient(to right, #FF0000 var(--v), rgba(255,255,255,.25) var(--v)); }
      .vl-vol::-webkit-slider-thumb { -webkit-appearance:none; width:12px; height:12px; border-radius:50%; background:#FF0000; border:none; margin-top:-4px; }
      .vl-vol::-moz-range-track { height:4px; border-radius:2px; background:rgba(255,255,255,.25); }
      .vl-vol::-moz-range-progress { height:4px; border-radius:2px; background:#FF0000; }
      .vl-vol::-moz-range-thumb { width:12px; height:12px; border-radius:50%; background:#FF0000; border:none; }
      .vl-thumb::after {
        content:""; position:absolute; left:50%; top:50%; width:44px; height:44px; margin:-22px 0 0 -22px; border-radius:50%;
        background:rgba(255,0,0,.9) url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='white'><path d='M8 5v14l11-7z'/></svg>") center/22px no-repeat;
        opacity:0; transform:scale(.8); transition:opacity .15s, transform .15s; pointer-events:none;
      }
      .vl-card:hover .vl-thumb::after, .vl-up:hover .vl-thumb::after { opacity:1; transform:scale(1); }
      .vl-time { font-size:12px; color:#ddd; white-space:nowrap; }
      .vl-spacer { flex:1; }
      .vl-speed { font-size:13px; font-weight:600; min-width:34px; justify-content:center; }
      #videoResizeHandle { position:absolute; bottom:0; right:0; width:18px; height:18px; cursor:nwse-resize; background:linear-gradient(135deg,transparent 50%,#4a4d54 50%); border-bottom-right-radius:14px; z-index:999999; }
    `;
    document.head.appendChild(style);
  }

  function makeDraggable(box, handle) {
    let dragging = false, sx = 0, sy = 0, sl = 0, st = 0;
    handle.addEventListener("mousedown", (e) => {
      if (e.target.closest("button, input")) return;
      dragging = true;
      const r = box.getBoundingClientRect();
      box.style.position = "fixed"; box.style.left = r.left + "px"; box.style.top = r.top + "px"; box.style.margin = "0";
      sx = e.clientX; sy = e.clientY; sl = r.left; st = r.top;
      e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      box.style.left = Math.min(Math.max(0, sl + e.clientX - sx), Math.max(0, innerWidth - box.offsetWidth)) + "px";
      box.style.top = Math.min(Math.max(0, st + e.clientY - sy), Math.max(0, innerHeight - box.offsetHeight)) + "px";
    });
    document.addEventListener("mouseup", () => { dragging = false; });
  }

  function makeResizable(box, handle) {
    let resizing = false, sx = 0, sy = 0, sw = 0, sh = 0;
    handle.addEventListener("mousedown", (e) => {
      resizing = true;
      const r = box.getBoundingClientRect();
      box.style.position = "fixed"; box.style.left = r.left + "px"; box.style.top = r.top + "px"; box.style.margin = "0";
      sx = e.clientX; sy = e.clientY; sw = r.width; sh = r.height;
      e.preventDefault(); e.stopPropagation();
    });
    document.addEventListener("mousemove", (e) => {
      if (!resizing) return;
      const cs = getComputedStyle(box);
      const minW = parseInt(cs.minWidth) || 520, minH = parseInt(cs.minHeight) || 380;
      box.style.width = Math.min(innerWidth * 0.96, Math.max(minW, sw + e.clientX - sx)) + "px";
      box.style.height = Math.min(innerHeight * 0.92, Math.max(minH, sh + e.clientY - sy)) + "px";
    });
    document.addEventListener("mouseup", () => { resizing = false; });
  }

  function resetModalPosition() {
    const b = document.getElementById("videoBox");
    if (!b) return;
    ["position", "left", "top", "margin", "width", "height"].forEach(p => (b.style[p] = ""));
  }

  function injectModal() {
    if (document.getElementById("videoModal")) return;
    const modal = document.createElement("div");
    modal.id = "videoModal";
    modal.innerHTML = `
      <div id="videoBox">
        <div id="videoHeader">
          <div class="vl-logo">Videos</div>
          <div id="vlSearchWrap"><input id="vlSearch" type="text" placeholder="Search videos" autocomplete="off"></div>
          <button id="videoCloseBtn">✕</button>
        </div>
        <div id="vlBody"></div>
        <div id="videoResizeHandle"></div>
      </div>`;
    document.body.appendChild(modal);

    els = {
      modal,
      box: document.getElementById("videoBox"),
      header: document.getElementById("videoHeader"),
      body: document.getElementById("vlBody"),
      search: document.getElementById("vlSearch"),
      handle: document.getElementById("videoResizeHandle")
    };

    document.getElementById("videoCloseBtn").onclick = closeVideoModal;
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.classList.contains("show") && document.activeElement !== els.search) closeVideoModal();
    });
    els.search.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const q = els.search.value.trim();
        q ? search(q) : browse(currentPath);
      }, 300);
    });

    makeDraggable(els.box, els.header);
    makeResizable(els.box, els.handle);
  }

  async function browse(subPath) {
    stopPlayer();
    currentPath = subPath || "";
    els.search.value = "";
    els.body.innerHTML = '<div class="vl-empty">Loading…</div>';
    try {
      const res = await fetch(`/api/videos/browse?path=${encodeURIComponent(currentPath)}`, { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      lastSig = sig(data);
      renderBrowse(data);
    } catch (e) {
      els.body.innerHTML = '<div class="vl-empty">Couldn\'t load videos.</div>';
    }
  }

  function sig(data) {
    return JSON.stringify([data.folders, data.videos.map(v => [v.relPath, v.mtime, v.size])]);
  }


  async function pollRefresh() {
    if (!els.modal || !els.modal.classList.contains("show")) return;
    if (currentIndex !== -1 || els.search.value.trim()) return; 
    try {
      const res = await fetch(`/api/videos/browse?path=${encodeURIComponent(currentPath)}`, { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const s = sig(data);
      if (s === lastSig) return;
      if (currentIndex !== -1 || els.search.value.trim()) return;
      lastSig = s;
      const top = els.body.scrollTop;
      renderBrowse(data);
      els.body.scrollTop = top;
    } catch (e) {}
  }

  async function search(q) {
    stopPlayer();
    try {
      const res = await fetch(`/api/videos/search?q=${encodeURIComponent(q)}`, { headers: authHeaders() });
      const data = await res.json();
      els.body.innerHTML = "";
      currentList = data.videos;
      if (!data.videos.length) { els.body.appendChild(el("div", "vl-empty", `No results for "${q}"`)); return; }
      els.body.appendChild(buildGrid(data.videos));
    } catch (e) {
      els.body.innerHTML = '<div class="vl-empty">Search failed.</div>';
    }
  }

  function renderBrowse(data) {
    els.body.innerHTML = "";
    currentList = data.videos;

    if (currentPath) {
      const crumbs = el("div", "vl-crumbs");
      const home = el("span", "", "🏠 Home");
      home.onclick = () => browse("");
      crumbs.appendChild(home);
      let acc = "";
      currentPath.split("/").forEach(part => {
        acc = acc ? `${acc}/${part}` : part;
        const target = acc;
        const c = el("span", "", part);
        c.onclick = () => browse(target);
        crumbs.appendChild(c);
      });
      els.body.appendChild(crumbs);
    }

    if (data.folders.length) {
      const wrap = el("div", "vl-folders");
      data.folders.forEach(f => {
        const d = el("div", "vl-folder", "📁 " + f);
        d.onclick = () => browse(currentPath ? `${currentPath}/${f}` : f);
        wrap.appendChild(d);
      });
      els.body.appendChild(wrap);
    }

    if (!data.videos.length && !data.folders.length) {
      els.body.appendChild(el("div", "vl-empty", "No videos here yet. Drop mp4/webm files into the /videos folder on the server."));
      return;
    }
    if (data.videos.length) els.body.appendChild(buildGrid(data.videos));
  }

 
  function buildThumb(v, withDuration = true) {
    const t = el("div", "vl-thumb");
    const dur = el("div", "vl-dur");
    dur.style.display = "none";

    if (v.thumbUrl) {
      const img = document.createElement("img");
      img.loading = "lazy";
      img.src = withToken(v.thumbUrl);
      t.appendChild(img);
    }
   
    const vid = document.createElement("video");
    vid.preload = "metadata";
    vid.muted = true;
    vid.src = withToken(v.url) + "#t=0.5";
    vid.addEventListener("loadedmetadata", () => {
      dur.textContent = fmtDuration(vid.duration);
      dur.style.display = "block";
    });
    if (v.thumbUrl) {
      vid.style.display = "none";
    }
    t.appendChild(vid);
    if (withDuration) t.appendChild(dur);
    return t;
  }

  function buildGrid(videos) {
    const grid = el("div", "vl-grid");
    videos.forEach((v, i) => {
      const card = el("div", "vl-card");
      card.appendChild(buildThumb(v));
      card.appendChild(el("div", "vl-title", v.title));
      card.appendChild(el("div", "vl-meta", `${fmtSize(v.size)} • ${timeAgo(v.mtime)}`));
      card.onclick = () => watch(i);
      grid.appendChild(card);
    });
    return grid;
  }

  const ICON = {
    play: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    vol: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>',
    mute: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>',
    full: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>'
  };

  function buildPlayer(src, onEnded) {
    const wrap = el("div", "vl-pwrap vl-paused");
    wrap.tabIndex = 0;

    const video = document.createElement("video");
    video.id = "vlPlayer";
    video.className = "vl-pvideo";
    video.autoplay = true;
    video.playsInline = true;
    try {
      const sv = parseFloat(localStorage.getItem("vlVolume"));
      if (Number.isFinite(sv)) video.volume = Math.min(1, Math.max(0, sv));
    } catch (e) {}
    video.src = src;
    wrap.appendChild(video);

    const bigPlay = el("div", "vl-bigplay");
    bigPlay.innerHTML = ICON.play;
    wrap.appendChild(bigPlay);

    const spinner = el("div", "vl-spinner");
    wrap.appendChild(spinner);
    const setLoading = (on) => wrap.classList.toggle("vl-loading", on);
    setLoading(true); 
    video.addEventListener("loadstart", () => setLoading(true));
    video.addEventListener("waiting", () => setLoading(true));
    video.addEventListener("seeking", () => setLoading(true));
    ["canplay", "playing", "seeked", "error"].forEach(ev =>
      video.addEventListener(ev, () => { if (ev === "error" || video.readyState >= 3) setLoading(false); })
    );

    const controls = el("div", "vl-controls");
    const bar = el("div", "vl-bar");
    const buf = el("div", "vl-buf"), fill = el("div", "vl-fill"), knob = el("div", "vl-knob");
    bar.append(buf, fill, knob);

    const row = el("div", "vl-crow");
    const playBtn = el("button", "vl-cbtn");
    const muteBtn = el("button", "vl-cbtn");
    const vol = document.createElement("input");
    vol.type = "range"; vol.min = 0; vol.max = 1; vol.step = 0.02; vol.className = "vl-vol";
    const time = el("span", "vl-time", "0:00 / 0:00");
    const speedBtn = el("button", "vl-cbtn vl-speed", "1x");
    const fsBtn = el("button", "vl-cbtn");
    fsBtn.innerHTML = ICON.full;
    row.append(playBtn, muteBtn, vol, time, el("span", "vl-spacer"), speedBtn, fsBtn);
    controls.append(bar, row);
    wrap.appendChild(controls);

    const toggle = () => (video.paused ? video.play().catch(() => {}) : video.pause());
    const toggleFs = () => (document.fullscreenElement ? document.exitFullscreen() : wrap.requestFullscreen());

    const syncPlay = () => {
      playBtn.innerHTML = video.paused ? ICON.play : ICON.pause;
      wrap.classList.toggle("vl-paused", video.paused);
    };
    const syncVol = () => {
      muteBtn.innerHTML = video.muted || video.volume === 0 ? ICON.mute : ICON.vol;
      const level = video.muted ? 0 : video.volume;
      vol.value = level;
      vol.style.setProperty("--v", level * 100 + "%");
    };
    const syncTime = () => {
      if (seeking) return;
      const d = video.duration || 0;
      const p = d ? (video.currentTime / d) * 100 : 0;
      fill.style.width = p + "%";
      knob.style.left = p + "%";
      time.textContent = `${fmtDuration(video.currentTime || 0) || "0:00"} / ${fmtDuration(d) || "0:00"}`;
    };
    const syncBuf = () => {
      const d = video.duration;
      if (!d) return;
      for (let i = 0; i < video.buffered.length; i++) {
        if (video.buffered.start(i) <= video.currentTime && video.currentTime <= video.buffered.end(i)) {
          buf.style.width = (video.buffered.end(i) / d) * 100 + "%";
          return;
        }
      }
    };

    video.addEventListener("play", syncPlay);
    video.addEventListener("pause", syncPlay);
    video.addEventListener("timeupdate", () => { syncTime(); syncBuf(); });
    video.addEventListener("progress", syncBuf);
    video.addEventListener("loadedmetadata", syncTime);
    video.addEventListener("volumechange", () => {
      syncVol();
      try { localStorage.setItem("vlVolume", String(video.volume)); } catch (e) {}
    });
    video.addEventListener("ended", onEnded);
    video.addEventListener("click", toggle);
    video.addEventListener("dblclick", toggleFs);

    playBtn.onclick = toggle;
    muteBtn.onclick = () => { video.muted = !video.muted; };
    vol.addEventListener("input", () => { video.muted = false; video.volume = parseFloat(vol.value); });
    fsBtn.onclick = toggleFs;

    const speeds = [0.5, 1, 1.25, 1.5, 2];
    speedBtn.onclick = () => {
      const next = speeds[(speeds.indexOf(video.playbackRate) + 1) % speeds.length] || 1;
      video.playbackRate = next;
      speedBtn.textContent = next + "x";
    };

    let seeking = false, seekRatio = 0;
    const ratioFrom = (e) => {
      const r = bar.getBoundingClientRect();
      return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    };
    const preview = (ratio) => {
      fill.style.width = ratio * 100 + "%";
      knob.style.left = ratio * 100 + "%";
      time.textContent = `${fmtDuration(ratio * video.duration) || "0:00"} / ${fmtDuration(video.duration) || "0:00"}`;
    };
    bar.addEventListener("pointerdown", (e) => {
      if (!Number.isFinite(video.duration) || !video.duration) return;
      seeking = true;
      wrap.classList.add("vl-seeking");
      bar.setPointerCapture(e.pointerId);
      seekRatio = ratioFrom(e);
      preview(seekRatio);
    });
    bar.addEventListener("pointermove", (e) => {
      if (!seeking) return;
      seekRatio = ratioFrom(e);
      preview(seekRatio);
    });
    const endSeek = (commit) => {
      if (!seeking) return;
      seeking = false;
      wrap.classList.remove("vl-seeking");
      if (!commit) return;
      const resume = !video.paused || video.ended;
      setLoading(true);
      video.currentTime = seekRatio * video.duration;
      if (resume) video.play().catch(() => {});
    };
    bar.addEventListener("pointerup", () => endSeek(true));
    bar.addEventListener("pointercancel", () => endSeek(false));
    wrap.addEventListener("keydown", (e) => {
      if (e.target === vol && e.key.startsWith("Arrow")) return;
      const k = e.key.toLowerCase();
      if (k === " " || k === "k") toggle();
      else if (e.key === "ArrowRight") video.currentTime = Math.min(video.duration || 0, video.currentTime + 5);
      else if (e.key === "ArrowLeft") video.currentTime = Math.max(0, video.currentTime - 5);
      else if (e.key === "ArrowUp") { video.muted = false; video.volume = Math.min(1, video.volume + 0.05); }
      else if (e.key === "ArrowDown") video.volume = Math.max(0, video.volume - 0.05);
      else if (k === "m") video.muted = !video.muted;
      else if (k === "f") toggleFs();
      else return;
      e.preventDefault();
    });

    let idleT;
    wrap.addEventListener("mousemove", () => {
      wrap.classList.remove("vl-idle");
      clearTimeout(idleT);
      idleT = setTimeout(() => { if (!video.paused) wrap.classList.add("vl-idle"); }, 2500);
    });

    syncPlay(); syncVol(); syncTime();
    setTimeout(() => wrap.focus({ preventScroll: true }), 0);
    return wrap;
  }

  function watch(index) {
    const v = currentList[index];
    if (!v) return;
    currentIndex = index;
    setWatching(v.title); 
    els.body.innerHTML = "";

    const wrap = el("div", "vl-watch");
    const main = el("div", "vl-main");

    const back = el("button", "vl-back", "← Back");
    back.onclick = () => {
      const q = els.search.value.trim();
      q ? search(q) : browse(currentPath);
    };
    main.appendChild(back);

    main.appendChild(buildPlayer(withToken(v.url), () => {
      if (currentIndex + 1 < currentList.length) watch(currentIndex + 1);
    }));

    main.appendChild(el("div", "vl-wtitle", v.title));
    main.appendChild(el("div", "vl-meta", `${fmtSize(v.size)} • added ${timeAgo(v.mtime)}`));
    wrap.appendChild(main);

    if (currentList.length > 1) {
      const side = el("div", "vl-side");
      side.appendChild(el("h4", "", "Up next"));
      currentList.forEach((u, i) => {
        if (i === index) return;
        const row = el("div", "vl-up");
        row.appendChild(buildThumb(u, true));
        row.appendChild(el("div", "vl-title", u.title));
        row.onclick = () => watch(i);
        side.appendChild(row);
      });
      wrap.appendChild(side);
    }

    els.body.appendChild(wrap);
    els.body.scrollTop = 0;
  }

  function stopPlayer() {
    const p = document.getElementById("vlPlayer");
    if (p) { p.pause(); p.removeAttribute("src"); p.load(); }
    currentIndex = -1;
    setWatching(null);  
  }

  window.openVideoModal = function () {
    injectStyles();
    injectModal();
    resetModalPosition();
    els.modal.classList.add("show");
    browse("");
    clearInterval(pollTimer);
    pollTimer = setInterval(pollRefresh, 4000);
  };

  window.closeVideoModal = function () {
    clearInterval(pollTimer);
    pollTimer = null;
    stopPlayer();
    if (els.body) els.body.innerHTML = "";
    if (els.modal) els.modal.classList.remove("show");
  };
})();