
(function () {
  const S = {
    modal: null, box: null, grid: null, scroller: null, status: null,
    input: null, select: null, menu: null,
    dd: null, ddIndex: 0, userId: null, pickedName: null,
    before: null, hasMore: true, loading: false,
    query: "", channel: "", seq: 0, timer: null, placed: false,
    mention: null
  };

  function injectStyles() {
    if (document.getElementById("imageSearchStyle")) return;
    const s = document.createElement("style");
    s.id = "imageSearchStyle";
    s.textContent = `
      #imageSearchModal { display:none; position:fixed; inset:0; z-index:40400; font-family:inherit; pointer-events:none; }
      #imageSearchModal .is-box {
        position:fixed; width:640px; max-width:95vw; height:600px; max-height:88vh;
        min-width:340px; min-height:320px;
        background:rgba(0,0,0,0.9); border:1px solid #2c2e33; border-radius:14px;
        overflow:hidden; display:flex; flex-direction:column; color:#fff;
        pointer-events:auto;
      }
      #imageSearchModal .is-header {
        display:flex; align-items:center; justify-content:space-between;
        padding:16px 18px; border-bottom:1px solid #232529;
        cursor:move; user-select:none; flex:0 0 auto;
      }
      #imageSearchModal .is-header h3 { margin:0; font-size:15px; color:#fff; font-weight:700; letter-spacing:0.2px; pointer-events:none; }
      #imageSearchModal .is-close { background:none; border:none; color:#8a8d93; font-size:20px; cursor:pointer; line-height:1; padding:4px 6px; }
      #imageSearchModal .is-close:hover { color:#fff; }
      #imageSearchModal .is-toolbar { display:flex; gap:8px; padding:14px 18px 0; flex:0 0 auto; }
      #imageSearchModal input[type="text"] {
        flex:1; min-width:0; background:#1a1b1e; border:1px solid #2c2e33; border-radius:8px;
        color:#fff; padding:10px 12px; font-size:13px; outline:none;
      }
      #imageSearchModal input[type="text"]:focus { border-color:#FF0000; }
      #imageSearchModal select {
        background:#1a1b1e; border:1px solid #2c2e33; border-radius:8px; color:#fff;
        padding:9px 10px; font-size:13px; outline:none; cursor:pointer; max-width:160px;
      }
      #imageSearchModal select:focus { border-color:#FF0000; }
      #imageSearchModal .is-scroll {
        flex:1 1 auto; min-height:0; overflow-y:auto; padding:14px 18px 18px;
        scrollbar-width:thin; scrollbar-color:#3a3c42 #1e1f22;
      }
      #imageSearchModal .is-scroll::-webkit-scrollbar { width:8px; }
      #imageSearchModal .is-scroll::-webkit-scrollbar-track { background:#1e1f22; border-radius:8px; }
      #imageSearchModal .is-scroll::-webkit-scrollbar-thumb { background:#3a3c42; border-radius:8px; border:2px solid #1e1f22; }
      #imageSearchModal .is-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(120px, 1fr)); grid-auto-rows:120px; gap:8px; }
      #imageSearchModal .is-status { font-size:12px; color:#6b6e74; text-align:center; padding:14px 0; min-height:14px; }
      #imageSearchModal .is-status.error { color:#ff6b6e; }
      #imageSearchModal .is-tile {
        position:relative; border-radius:10px; overflow:hidden; background:#111214;
        border:1px solid #232529; cursor:pointer; transition:transform 0.1s, border-color 0.15s;
      }
      #imageSearchModal .is-tile:hover { transform:scale(1.03); border-color:#FF0000; }
      #imageSearchModal .is-tile img { width:100%; height:100%; object-fit:cover; display:block; }
      #imageSearchModal .is-tile .is-info {
        position:absolute; left:0; right:0; bottom:0; padding:16px 8px 6px;
        background:linear-gradient(to top, rgba(0,0,0,0.85), transparent);
        font-size:11px; opacity:0; transition:opacity 0.15s; pointer-events:none;
      }
      #imageSearchModal .is-tile:hover .is-info { opacity:1; }
      #imageSearchModal .is-info .is-who { font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      #imageSearchModal .is-info .is-meta { color:#b9bbbe; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      #imageSearchResize {
        position:absolute; bottom:0; right:0; width:18px; height:18px; cursor:nwse-resize;
        background:linear-gradient(135deg, transparent 50%, #4a4d54 50%);
        border-bottom-right-radius:14px; z-index:5;
      }
      #imageSearchMenu {
        position:fixed; z-index:40600; min-width:150px; padding:6px;
        background:#111214; border:1px solid #2c2e33; border-radius:10px;
        box-shadow:0 8px 24px rgba(0,0,0,0.6); display:none; flex-direction:column; gap:2px;
      }
      #imageSearchMenu button {
        background:none; border:none; color:#dcddde; font-size:13px; text-align:left;
        padding:9px 12px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:8px;
      }
      #imageSearchMenu button:hover { background:#1c1d20; color:#fff; }
      #imageSearchMenu button.is-primary:hover { background:#FF0000; color:#fff; }
    `;
    document.head.appendChild(s);
  }

  function build() {
    injectStyles();

    const modal = document.createElement("div");
    modal.id = "imageSearchModal";
    modal.innerHTML = `
      <div class="is-box">
        <div class="is-header" id="imageSearchDrag">
          <h3>Image Search</h3>
          <button class="is-close" id="imageSearchClose">×</button>
        </div>
        <div class="is-toolbar">
          <input type="text" id="imageSearchInput" placeholder="Search by username or filename..." autocomplete="off">
          <select id="imageSearchChannel"></select>
        </div>
        <div class="is-scroll" id="imageSearchScroll">
          <div class="is-grid" id="imageSearchGrid"></div>
          <div class="is-status" id="imageSearchStatus"></div>
        </div>
        <div id="imageSearchResize"></div>
      </div>
    `;
    document.body.appendChild(modal);

    const menu = document.createElement("div");
    menu.id = "imageSearchMenu";
    document.body.appendChild(menu);

    S.modal = modal;
    S.box = modal.querySelector(".is-box");
    S.grid = modal.querySelector("#imageSearchGrid");
    S.scroller = modal.querySelector("#imageSearchScroll");
    S.status = modal.querySelector("#imageSearchStatus");
    S.input = modal.querySelector("#imageSearchInput");
    S.select = modal.querySelector("#imageSearchChannel");
    S.menu = menu;

    modal.querySelector("#imageSearchClose").addEventListener("click", close);

    S.select.addEventListener("change", () => { S.channel = S.select.value; loadPage(true); });
    S.input.addEventListener("input", () => {
      const q = getMentionQuery();
      if (q !== null) showUserDropdown(q); else hideUserDropdown();
      clearTimeout(S.timer);
      S.timer = setTimeout(() => { resolveSearch(); loadPage(true); }, 400);
    });

    S.input.addEventListener("keydown", (e) => {
      if (!ddVisible()) return;
      const items = S.dd.querySelectorAll(".is-dd-item");
      if (e.key === "ArrowDown") { e.preventDefault(); S.ddIndex = Math.min(S.ddIndex + 1, items.length - 1); highlightDd(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); S.ddIndex = Math.max(S.ddIndex - 1, 0); highlightDd(); }
      else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); pickUser(S.dd._users[S.ddIndex]); }
    });

    S.input.addEventListener("blur", () => setTimeout(hideUserDropdown, 100));
    S.scroller.addEventListener("scroll", () => {
      hideMenu();
      if (S.scroller.scrollHeight - S.scroller.scrollTop - S.scroller.clientHeight < 300) loadPage(false);
    }, { passive: true });

    document.addEventListener("mousedown", (e) => {
      if (S.menu.style.display === "flex" && !S.menu.contains(e.target)) hideMenu();
    });

    makeDraggable(S.box, modal.querySelector("#imageSearchDrag"));
    makeResizable(S.box, modal.querySelector("#imageSearchResize"));
  }

  function makeDraggable(box, handle) {
    let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;

    handle.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;
      dragging = true;
      const rect = box.getBoundingClientRect();
      box.style.left = rect.left + "px";
      box.style.top = rect.top + "px";
      startX = e.clientX; startY = e.clientY;
      startLeft = rect.left; startTop = rect.top;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      e.preventDefault();
    });

    function onMove(e) {
      if (!dragging) return;
      const maxLeft = Math.max(0, window.innerWidth - box.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - box.offsetHeight);
      box.style.left = Math.min(Math.max(0, startLeft + e.clientX - startX), maxLeft) + "px";
      box.style.top = Math.min(Math.max(0, startTop + e.clientY - startY), maxTop) + "px";
      hideMenu();
    }
    function onUp() {
      dragging = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
  }



function getMentionQuery() {
  const before = S.input.value.slice(0, S.input.selectionStart);
  const m = /^@(.*)$/.exec(before);
  return m ? m[1] : null;
}

function hideUserDropdown() {
  if (S.dd) S.dd.style.display = "none";
  S.ddIndex = 0;
}

function ddVisible() {
  return S.dd && S.dd.style.display === "block";
}

function highlightDd() {
  if (!S.dd) return;
  S.dd.querySelectorAll(".is-dd-item").forEach((el, i) => {
    el.style.background = i === S.ddIndex ? "#3a3c42" : "transparent";
  });
}

function showUserDropdown(q) {
  const list = (typeof currentUsers !== "undefined" ? currentUsers : [])
    .filter(u => u && u.username && u.username.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 8);
  if (!list.length) { hideUserDropdown(); return; }

  if (!S.dd) {
    S.dd = document.createElement("div");
    S.dd.style.cssText = `
      position:fixed; z-index:40700; background:#111214; border:1px solid #3a3c42;
      border-radius:8px; padding:6px; box-shadow:0 8px 24px rgba(0,0,0,0.6); display:none;
    `;
    document.body.appendChild(S.dd);
  }
  S.dd.innerHTML = "";

  const title = document.createElement("div");
  title.textContent = "Members";
  title.style.cssText = "font-size:11px; color:#72767d; padding:4px 8px 6px; text-transform:uppercase; font-weight:700; letter-spacing:0.5px;";
  S.dd.appendChild(title);

  list.forEach((u, i) => {
    const row = document.createElement("div");
    row.className = "is-dd-item";
    row.style.cssText = "display:flex; align-items:center; gap:10px; padding:7px 10px; border-radius:6px; cursor:pointer;";
    row.onmouseover = () => { S.ddIndex = i; highlightDd(); };
    row.onmousedown = (e) => e.preventDefault();
    row.onclick = () => pickUser(u);

    const img = document.createElement("img");
    img.src = sanitizeAvatar(u.avatar);
    img.style.cssText = "width:28px; height:28px; border-radius:50%; flex-shrink:0;";

    const name = document.createElement("span");
    name.className = `username-wrapper ${u.usernameColor || "username-cyan"}`;
    name.textContent = u.username;
    name.style.cssText = "font-weight:700; font-size:14px;";

    const st = document.createElement("span");
    const status = u.status || "online";
    st.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    st.style.cssText = `margin-left:auto; font-size:11px; color:${status === "online" ? "#23a559" : "#747f8d"};`;

    row.append(img, name, st);
    S.dd.appendChild(row);
  });

  const r = S.input.getBoundingClientRect();
  S.dd.style.left = r.left + "px";
  S.dd.style.top = (r.bottom + 6) + "px";
  S.dd.style.width = r.width + "px";
  S.dd.style.display = "block";
  S.ddIndex = 0;
  S.dd._users = list;
  highlightDd();
}

function pickUser(u) {
  S.input.value = "@" + u.username + " ";
  S.input.setSelectionRange(S.input.value.length, S.input.value.length);
  hideUserDropdown();
  S.input.focus();
  clearTimeout(S.timer);
  resolveSearch();
  loadPage(true);
}

function resolveSearch() {
  const val = S.input.value.trim();
  const users = (typeof currentUsers !== "undefined" ? currentUsers : [])
    .filter(u => u && u.username)
    .sort((a, b) => b.username.length - a.username.length);

  S.mention = null;
  S.userId = null;
  S.query = val;

  if (!val.startsWith("@")) return;

  const lower = val.toLowerCase();
  const hit = users.find(u => {
    const n = "@" + u.username.toLowerCase();
    return lower.startsWith(n) && (lower.length === n.length || /\s/.test(lower[n.length]));
  });

  if (hit) {
    S.mention = hit.username;
    S.userId = hit.userId || hit.id || null;
    S.query = val.slice(1 + hit.username.length).trim();
  } else {
    const m = /^@(\S+)\s*(.*)$/.exec(val);
    if (m) { S.mention = m[1]; S.query = m[2]; }
  }
}

  function makeResizable(box, handle) {
    let resizing = false, startX = 0, startY = 0, startW = 0, startH = 0;

    handle.addEventListener("mousedown", (e) => {
      resizing = true;
      const rect = box.getBoundingClientRect();
      box.style.left = rect.left + "px";
      box.style.top = rect.top + "px";
      startX = e.clientX; startY = e.clientY;
      startW = rect.width; startH = rect.height;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      e.preventDefault();
      e.stopPropagation();
    });

    function onMove(e) {
      if (!resizing) return;
      const cs = getComputedStyle(box);
      const minW = parseInt(cs.minWidth) || 340;
      const minH = parseInt(cs.minHeight) || 320;
      box.style.width = Math.min(window.innerWidth * 0.95, Math.max(minW, startW + e.clientX - startX)) + "px";
      box.style.height = Math.min(window.innerHeight * 0.88, Math.max(minH, startH + e.clientY - startY)) + "px";
    }
    function onUp() {
      resizing = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
  }

  function center() {
    const w = Math.min(640, window.innerWidth * 0.95);
    const h = Math.min(600, window.innerHeight * 0.88);
    S.box.style.width = w + "px";
    S.box.style.height = h + "px";
    S.box.style.left = Math.max(0, (window.innerWidth - w) / 2) + "px";
    S.box.style.top = Math.max(0, (window.innerHeight - h) / 2) + "px";
  }

  function fillChannels() {
    const keep = S.select.value;
    S.select.innerHTML = "";
    S.select.add(new Option("All channels", ""));
    (typeof dynamicChannels_client !== "undefined" ? dynamicChannels_client : [])
      .filter(c => c.type === "text" || !c.type)
      .forEach(c => S.select.add(new Option("#" + c.name, c.id)));
    S.select.value = keep;
  }

  function open() {
    const firstTime = !S.modal;
    if (firstTime) build();
    fillChannels();
    S.modal.style.display = "block";
    if (!S.placed) { center(); S.placed = true; }
    if (firstTime) loadPage(true);
    S.input.focus();
  }

  function close() {
    hideMenu();
    hideUserDropdown();
    if (S.modal) S.modal.style.display = "none";
  }

  function setStatus(msg, err) {
    S.status.textContent = msg || "";
    S.status.className = "is-status" + (err ? " error" : "");
  }

  function loadPage(reset) {
    if (reset) {
      S.seq++;
      S.before = null;
      S.hasMore = true;
      S.loading = false;
      S.grid.innerHTML = "";
      S.scroller.scrollTop = 0;
      hideMenu();
    }
    if (S.loading || !S.hasMore) return;
    if (!socket || !socket.connected) { setStatus("Not connected.", true); return; }

    S.loading = true;
    setStatus("Loading...");
    const mySeq = S.seq;

    socket.timeout(8000).emit("searchImages", {
      query: S.query,
      userId: S.userId || null,
      username: S.mention || null,
      channel: S.channel || null,
      before: S.before,
      limit: 40
    }, (err, res) => {
      if (mySeq !== S.seq) return;
      S.loading = false;
      if (err || !res || !Array.isArray(res.images)) {
        setStatus("Search failed. Try again.", true);
        return;
      }

      res.images.forEach(item => S.grid.appendChild(buildTile(item)));
      S.before = res.nextBefore ?? S.before;
      S.hasMore = !!res.hasMore;

      if (S.grid.children.length === 0) setStatus("No images found");
      else setStatus(S.hasMore ? "" : "End of results");

      if (S.hasMore && S.scroller.scrollHeight <= S.scroller.clientHeight) loadPage(false);
    });
  }

  function buildTile(item) {
    const tile = document.createElement("div");
    tile.className = "is-tile";

    const img = document.createElement("img");
    img.src = sanitizeAvatar(item.url);
    img.loading = "lazy";
    img.draggable = false;
    img.onerror = () => tile.remove();
    tile.appendChild(img);

    const info = document.createElement("div");
    info.className = "is-info";
    const who = document.createElement("div");
    who.className = "is-who";
    who.textContent = item.username || "Unknown";
    const meta = document.createElement("div");
    meta.className = "is-meta";
    meta.textContent = `#${getChannelDisplayName(item.channel)} · ${formatTime(item.time)}`;
    info.append(who, meta);
    tile.appendChild(info);

    tile.addEventListener("click", (e) => {
      e.stopPropagation();
      showMenu(e.clientX, e.clientY, item);
    });
    return tile;
  }

  function showMenu(x, y, item) {
    S.menu.innerHTML = "";
 const ICON_VIEW = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const ICON_SEND = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>`;
const viewBtn = document.createElement("button");
    viewBtn.innerHTML = `${ICON_VIEW}<span>View</span>`;
    viewBtn.onclick = () => {
      hideMenu();
      openImageModal(item.url);
      const viewer = document.getElementById("imageModal");
      if (viewer) viewer.style.setProperty("z-index", "99999", "important");
    };

    const sendBtn = document.createElement("button");
    sendBtn.className = "is-primary";
    sendBtn.innerHTML = `${ICON_SEND}<span>Send to chat</span>`;
    sendBtn.onclick = () => { hideMenu(); sendToChat(item); };

    S.menu.append(viewBtn, sendBtn);
    S.menu.style.display = "flex";

    const w = S.menu.offsetWidth, h = S.menu.offsetHeight;
    S.menu.style.left = Math.max(8, Math.min(x, window.innerWidth - w - 8)) + "px";
    S.menu.style.top = Math.max(8, Math.min(y, window.innerHeight - h - 8)) + "px";
  }

  function hideMenu() {
    if (S.menu) S.menu.style.display = "none";
  }

  function sendToChat(item) {
    if (typeof isCurrentChannelForum === "function" && isCurrentChannelForum()) {
      showToast("This is a forum channel - open a post to send there.");
      return;
    }
    if (!socket || !socket.connected) { showToast("❌ Not connected"); return; }

    socket.emit("message", {
      id: crypto.randomUUID(),
      userId: user.id,
      username: user.username,
      avatar: user.avatar,
      text: item.url,
      channel: currentChannel,
      badge: user.badge,
      usernameColor: user.usernameColor,
      level: user.level || 1,
      isAdmin: user.isAdmin || false,
      isDeveloper: user.isDeveloper || false,
      isPromptEngineer: user.isPromptEngineer || false,
      isBot: user.isBot || false,
      prestigeBadge: user.prestigeBadge || null,
      customRoleIds: user.customRoleIds || [],
      time: Date.now(),
      type: "image"
    });
    showToast("Sent to chat");
  }
  function bindButton() {
    const btn = document.getElementById("imageSearchBtn");
    if (btn) btn.addEventListener("click", (e) => { e.stopPropagation(); open(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindButton);
  else bindButton();

  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "i") { e.preventDefault(); open(); }
    if (e.key === "Escape" && S.modal?.style.display === "block") {
      if (ddVisible()) { hideUserDropdown(); return; }
      const viewer = document.getElementById("imageModal");
      if (S.menu.style.display === "flex") { hideMenu(); return; }
      if (!viewer || !viewer.classList.contains("show")) close();
    }
  }, true);

  window.imageSearch = { open, close };
})();