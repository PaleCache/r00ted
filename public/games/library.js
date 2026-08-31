(function () {
  let currentPath = "";
  let currentGameName = null;
  let els = {};

  function getToken() {
    return localStorage.getItem("chatToken");
  }

  function injectStyles() {
    if (document.getElementById("libStyles")) return;
    const style = document.createElement("style");
    style.id = "libStyles";
    style.textContent = `
      #libraryModal {
        position: fixed; inset: 0; pointer-events: none;
        display: none; align-items: center; justify-content: center;
        z-index: 40000;
      }
      #libraryModal.show { display: flex; }
      #libraryBox {
        width: 1000px; max-width: 96vw; height: 640px; max-height: 92vh;
        min-width: 480px; min-height: 360px;
        background: rgba(0,0,0,0.9); border: 1px solid #3a3c42; border-radius: 14px;
        display: flex; flex-direction: column; overflow: hidden;
        pointer-events: auto; position: relative;
      }
      #libraryBox.lib-dragging { transition: none !important; }
      #libraryHeader {
        display:flex; align-items:center; justify-content:space-between;
        padding: 12px 18px; background:rgba(0,0,0,0.9); cursor: move; user-select: none;
        flex-shrink: 0;
      }
      #libraryHeader span { font-weight:600; color:#fff; font-size:15px; pointer-events:none; }
      #libraryCloseBtn {
        background:none; border:none; color:#72767d; font-size:22px; cursor:pointer;
        transition: color .15s;
      }
      #libraryCloseBtn:hover { color:#fff; }
      #libraryBrowsePane { flex:1; min-height:0; overflow-y:auto; padding:16px; }
      #libraryPlayerPane { display:none; flex-direction:column; flex:1; min-height:0; background:#000; }
      #libraryResizeHandle {
        position: absolute; bottom: 0; right: 0;
        width: 18px; height: 18px; cursor: nwse-resize;
        background: linear-gradient(135deg, transparent 50%, #4a4d54 50%);
        border-bottom-right-radius: 14px;
        z-index: 999999;
      }
      .lib-row {
        padding: 8px; cursor: pointer; color: #dcddde; border-radius: 6px;
        transition: background .15s;
      }
      .lib-row:hover { background: rgba(255,255,255,0.05); }
    `;
    document.head.appendChild(style);
  }

  function makeDraggable(box, handle) {
    let dragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    function onDown(e) {
      if (e.target.closest("button")) return;
      dragging = true;
      box.classList.add("lib-dragging");
      const rect = box.getBoundingClientRect();
      box.style.position = "fixed";
      box.style.left = rect.left + "px";
      box.style.top = rect.top + "px";
      box.style.margin = "0";
      startX = e.clientX; startY = e.clientY;
      startLeft = rect.left; startTop = rect.top;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      e.preventDefault();
    }
    function onMove(e) {
      if (!dragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      const maxLeft = window.innerWidth - box.offsetWidth;
      const maxTop = window.innerHeight - box.offsetHeight;
      box.style.left = Math.min(Math.max(0, startLeft + dx), Math.max(0, maxLeft)) + "px";
      box.style.top = Math.min(Math.max(0, startTop + dy), Math.max(0, maxTop)) + "px";
    }
    function onUp() {
      dragging = false;
      box.classList.remove("lib-dragging");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    handle.addEventListener("mousedown", onDown);
  }

  function makeResizable(box, handle) {
    let resizing = false;
    let startX = 0, startY = 0, startW = 0, startH = 0;

    function onDown(e) {
      resizing = true;
      const rect = box.getBoundingClientRect();
      box.style.position = "fixed";
      box.style.left = rect.left + "px";
      box.style.top = rect.top + "px";
      box.style.margin = "0";
      startX = e.clientX; startY = e.clientY;
      startW = rect.width; startH = rect.height;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
      e.preventDefault();
      e.stopPropagation();
    }
    function onMove(e) {
      if (!resizing) return;
      const minW = parseInt(getComputedStyle(box).minWidth) || 480;
      const minH = parseInt(getComputedStyle(box).minHeight) || 360;
      const maxW = window.innerWidth * 0.96;
      const maxH = window.innerHeight * 0.92;
      const newW = Math.min(maxW, Math.max(minW, startW + (e.clientX - startX)));
      const newH = Math.min(maxH, Math.max(minH, startH + (e.clientY - startY)));
      box.style.width = newW + "px";
      box.style.height = newH + "px";
    }
    function onUp() {
      resizing = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    handle.addEventListener("mousedown", onDown);
  }

  function resetModalPosition() {
    const box = document.getElementById("libraryBox");
    if (!box) return;
    box.style.position = "";
    box.style.left = "";
    box.style.top = "";
    box.style.margin = "";
    box.style.width = "";
    box.style.height = "";
  }

  function injectModal() {
    if (document.getElementById("libraryModal")) return;
    const modal = document.createElement("div");
    modal.id = "libraryModal";
    modal.innerHTML = `
      <div id="libraryBox">
        <div id="libraryHeader">
          <span id="libraryModalTitle">Library</span>
          <button id="libraryCloseBtn">✕</button>
        </div>
        <div id="libraryBrowsePane"></div>
        <div id="libraryPlayerPane"></div>
        <div id="libraryResizeHandle"></div>
      </div>
    `;
    document.body.appendChild(modal);

    els = {
      modal,
      box: document.getElementById("libraryBox"),
      header: document.getElementById("libraryHeader"),
      resizeHandle: document.getElementById("libraryResizeHandle"),
      browsePane: document.getElementById("libraryBrowsePane"),
      playerPane: document.getElementById("libraryPlayerPane"),
    };

    document.getElementById("libraryCloseBtn").onclick = closeLibraryModal;
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal.classList.contains("show")) closeLibraryModal();
      window.openGamesMenu();
    });

    makeDraggable(els.box, els.header);
    makeResizable(els.box, els.resizeHandle);
  }

  async function browse(subPath) {
    currentPath = subPath || "";
    const res = await fetch(`/api/library/browse?path=${encodeURIComponent(currentPath)}`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    const data = await res.json();
    renderBrowse(data);
  }

  function renderBrowse(data) {
    els.playerPane.style.display = "none";
    els.browsePane.style.display = "block";
    els.resizeHandle.style.display = "block";
    els.browsePane.innerHTML = "";

    if (currentPath) {
      const up = document.createElement("div");
      up.className = "lib-row";
      up.textContent = "⬅ ..";
      up.onclick = () => browse(currentPath.split("/").slice(0, -1).join("/"));
      els.browsePane.appendChild(up);
    }

    data.folders.forEach(f => {
      const el = document.createElement("div");
      el.className = "lib-row";
      el.textContent = "📁 " + f;
      el.onclick = () => browse(currentPath ? `${currentPath}/${f}` : f);
      els.browsePane.appendChild(el);
    });

    data.files.forEach(file => {
      const el = document.createElement("div");
      el.className = "lib-row";
      el.textContent = "🎮 " + file.name;
      el.onclick = () => playFile(file);
      els.browsePane.appendChild(el);
    });
  }

  function playFile(file) {
  els.browsePane.style.display = "none";
  els.playerPane.style.display = "flex";
  els.playerPane.style.flexDirection = "column";
  els.playerPane.innerHTML = "";
  els.resizeHandle.style.display = "none";

  const container = document.createElement("div");
  container.id = "emulatorContainer";
  container.style.cssText = "width:100%; flex:1; min-height:0; position:relative; overflow:hidden;";
  els.playerPane.appendChild(container);

  const fileUrl = `${file.url}&token=${encodeURIComponent(getToken())}`;

  const coreMap = {
    nes: "nes", gb: "gb", gbc: "gb", gba: "gba",
    sfc: "snes", smc: "snes", n64: "n64", z64: "n64",
    bin: "segaMD", iso: "psx", chd: "psx"
  };

  window.EJS_player = "#emulatorContainer";
  window.EJS_gameUrl = fileUrl;
  window.EJS_core = coreMap[file.ext] || "nes";
  window.EJS_pathtodata = "https://cdn.emulatorjs.org/stable/data/";
  window.EJS_language = "en-US";

  const script = document.createElement("script");
  script.src = "https://cdn.emulatorjs.org/stable/data/loader.js";
  container.appendChild(script);
  if (currentGameName && typeof window.clearGameStatus === "function") {
    window.clearGameStatus(currentGameName);
  }

  currentGameName = file.name.replace(/\.[^/.]+$/, "");
  if (typeof window.setGameStatus === "function") {
    window.setGameStatus(currentGameName);
  }
}

function stopEmulator() {
    try {
      if (window.EJS_emulator && typeof window.EJS_emulator.callEvent === "function") {
        window.EJS_emulator.callEvent("exit");
      }
    } catch (e) {
      console.warn("Emulator cleanup failed:", e);
    }

    if (els.playerPane) {
      els.playerPane.innerHTML = "";
      els.playerPane.style.display = "none";
    }
    if (els.resizeHandle) els.resizeHandle.style.display = "block";
    if (els.browsePane) els.browsePane.style.display = "block";

    window.EJS_player = undefined;
    window.EJS_gameUrl = undefined;
    window.EJS_core = undefined;
    window.EJS_emulator = undefined;

    if (currentGameName && typeof window.clearGameStatus === "function") {
      window.clearGameStatus(currentGameName);   
    }
    currentGameName = null;
  }

  window.openLibraryModal = function () {
    injectStyles();
    injectModal();
    resetModalPosition();
    els.modal.classList.add("show");
    browse("");
  };

  window.closeLibraryModal = function () {
    if (els.modal) els.modal.classList.remove("show");
    stopEmulator();
    window.openGamesMenu();
  };
})();