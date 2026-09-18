(function () {
  function getSocket() {
    if (window.socket) return window.socket;
    try { if (typeof socket !== "undefined" && socket) return socket; } catch (e) {}
    return null;
  }
  function getAccount() {
    return window.selectedAccount === "bonus" ? "bonus" : "normal";
  }
  function sanitizeAvatar(src) {
    if (typeof window.sanitizeAvatar === "function") return window.sanitizeAvatar(src);
    return src || "/avatars/default1.png";
  }

 
  let normalBalance = 0, bonusBalance = 0, balance = 0;
  let listenersBound = false;
  let active = false;
  let coinId = "ZEC";
  let direction = "long";
  let leverage = 200;
  let wager = 0;
  let entryPrice = 0, bustPrice = 0, currentPrice = 0;
  let equity = 0, multiplier = 1;
  let prices = {};
  let coins = ["ZEC", "ETH", "SOL", "DOGE"];
  let maxLeverage = 100;
  let leaderboard = [];
  let prevPrice = null; 
  let candles = [];
  let rawHistory = {};  
  let dailyKlines = {}; 
  let timeframe = "2s";
  let viewStart = 0;
  let viewCount = 70;
  let isDragging = false;
  let dragStartX = 0, dragStartView = 0;
  let needsRedraw = true;
  let rafId = null;
  let publicFeed = [];
  let positionOpenTime = 0;
  const MIN_POSITION_DURATION = 3000;
  

  const TF_MS = { "1s": 1000, "2s": 2000, "5s": 5000, "1m": 60000, "5m": 300000, "1D": 86400000 };
  function injectStyles() {
    if (document.getElementById("moonStyles")) return;
    const s = document.createElement("style");
    s.id = "moonStyles";
    s.textContent = `
      #moonModal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:2147483647;pointer-events:none}
      #moonModal.show{display:flex}
      #moonBox{width:980px;max-width:97vw;height:640px;max-height:94vh;background:rgba(0,0,0,0.9);border:1px solid #1c2030;border-radius:12px;display:flex;flex-direction:column;overflow:hidden;pointer-events:auto;position:relative;box-shadow:0 30px 90px rgba(0,0,0,.75);min-width:640px;min-height:480px}
      #moonBox.dragging-positioned{position:fixed;margin:0}
      #moonHeader{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;cursor:move;user-select:none;border-bottom:1px solid #1c2030;background:rgba(0,0,0,0.9)}
      #moonHeader h3{margin:0;color:#fff;font-size:15px;font-weight:700}
      #moonCloseBtn{background:none;border:none;color:#6b7280;font-size:20px;cursor:pointer}
      #moonCloseBtn:hover{color:#fff}
      #moonPriceHeader{display:flex;align-items:center;gap:16px;padding:10px 16px;border-bottom:1px solid #1c2030}
      #moonCoinSelect{background:#141820;border:1px solid #2a3142;color:#e5e7eb;font-size:13px;padding:5px 10px;border-radius:6px}
      #moonPriceBig{font-size:22px;font-weight:800;color:#f3f4f6}
      #moonPriceChange{font-size:13px;font-weight:600}
      #moonPriceChange.up{color:#10b981} #moonPriceChange.down{color:#ef4444}
      #moonBal{margin-left:auto;font-size:13px;color:#9ca3af}
      #moonBal b{color:#fbbf24}
      #moonAccountBadge{font-size:11px;padding:2px 9px;border-radius:20px;background:#1f2937;border:1px solid #374151;color:#9ca3af;cursor:pointer;margin-left:8px}
      #moonAccountBadge.bonus{background:#dc2626;border-color:#dc2626;color:#fff}
      #moonChartArea{flex:1;display:flex;flex-direction:column;min-height:0}
      #moonTfBar{display:flex;gap:2px;padding:6px 12px;background:rgba(0,0,0,0.9);border-bottom:1px solid #1c2030}
      .moon-tf{background:transparent;border:none;color:#6b7280;font-size:12px;font-weight:600;padding:4px 10px;border-radius:4px;cursor:pointer}
      .moon-tf.active,.moon-tf:hover{color:#e5e7eb;background:#1c2030}
      #moonChartWrap{flex:1;position:relative;background:#080a0f;cursor:crosshair;overflow:hidden}
      #moonCanvas{width:100%;height:100%;display:block}
      #moonZoomBtns{position:absolute;bottom:10px;right:12px;display:flex;gap:6px}
      .moon-zbtn{background:#1c2030;border:1px solid #2a3142;color:#9ca3af;font-size:11px;padding:4px 10px;border-radius:6px;cursor:pointer}
      .moon-zbtn:hover{color:#fff}
      #moonBottom{display:flex;border-top:1px solid #1c2030;height:252px}
      #moonTradePanel{width:280px;flex-shrink:0;border-right:1px solid #1c2030;display:flex;flex-direction:column;padding:12px;gap:10px;background:rgba(0,0,0,0.9)}
      #moonDirToggle{display:flex;border-radius:6px;overflow:hidden;border:1px solid #2a3142}
      .moon-dir-btn{flex:1;padding:8px;font-size:13px;font-weight:700;cursor:pointer;border:none;background:#141820;color:#9ca3af}
      .moon-dir-btn.active.long{background:#059669;color:#fff}
      .moon-dir-btn.active.short{background:#dc2626;color:#fff}
      #moonLevRow{display:flex;align-items:center;gap:8px}
      #moonLevSelect{flex:1;background:#141820;border:1px solid #2a3142;color:#e5e7eb;font-size:13px;padding:6px 8px;border-radius:6px}
      #moonBetRow{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
      .moon-chip{width:36px;height:36px;border-radius:50%;border:1px solid #2a3142;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#e5e7eb;cursor:pointer;background:#141820}
      #moonCurrentBet{color:#fbbf24;font-weight:800;font-size:13px;min-width:32px}
      #moonClearBetBtn{background:#1f2937;border:none;color:#9ca3af;padding:6px 10px;border-radius:6px;font-size:11px;cursor:pointer;margin-left:auto}
      #moonActionBtn{background:#2563eb;border:none;color:#fff;padding:12px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;width:100%}
      #moonActionBtn:disabled{opacity:.4;cursor:not-allowed}
      #moonActionBtn.close{background:#d97706}
      #moonPosInfo{font-size:12px;color:#9ca3af;line-height:1.5;display:none}
      #moonPosInfo.active{display:block}
      #moonMessage{font-size:12px;color:#e5e7eb;min-height:16px;text-align:center}
      #moonFeed{flex:1;display:flex;flex-direction:column;min-width:0;background:rgba(0,0,0,0.9)}
      #moonFeedTabs{display:flex;border-bottom:1px solid #1c2030;padding:0 8px}
      .moon-ftab{background:none;border:none;color:#6b7280;font-size:12px;font-weight:600;padding:10px 14px;cursor:pointer;border-bottom:2px solid transparent}
      .moon-ftab.active{color:#e5e7eb;border-bottom-color:#3b82f6}
      #moonFeedList{flex:1;overflow-y:auto;padding:6px 8px}
      .moon-bet-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:8px;margin-bottom:4px;background:#11141c;border:1px solid #1c2030}
      .moon-bet-row img{width:28px;height:28px;border-radius:50%}
      .moon-bet-info{flex:1;min-width:0}
      .moon-bet-title{font-size:12px;color:#e5e7eb;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .moon-bet-sub{font-size:11px;color:#6b7280}
      .moon-bet-pnl{font-size:12px;font-weight:700;text-align:right}
      .moon-bet-pnl.pos{color:#10b981} .moon-bet-pnl.neg{color:#ef4444}
      #moonFeedEmpty{color:#4b5563;font-size:12px;text-align:center;padding:30px}
        #moonResizeHandle{
        position:absolute;
        bottom:0; right:0;
        width:18px; height:18px;
        background:linear-gradient(135deg, transparent 50%, rgba(73,73,73,1) 50%);
        cursor:nwse-resize;
        z-index:100;
        border-radius:0 0 12px 0;
      }
      .moon-dir-btn {
      flex: 1;
      padding: 8px !important;
      font-size: 13px !important;
      font-weight: 700;
      line-height: normal !important;
      height: auto !important;
      cursor: pointer;
      border: none;
      background: #141820;
      color: #9ca3af;
    }
    `;
    document.head.appendChild(s);
  }

  let els = {};

  function buildModal() {
    if (document.getElementById("moonModal")) return;
    const modal = document.createElement("div");
    modal.id = "moonModal";
    modal.innerHTML = `
      <div id="moonBox">
        <div id="moonResizeHandle"></div>
        <div id="moonHeader"><h3>MOON</h3><button id="moonCloseBtn">✕</button></div>
        <div id="moonPriceHeader">
          <select id="moonCoinSelect"></select>
          <div>
            <div id="moonPriceBig">-</div>
            <div id="moonPriceChange"></div>
          </div>
          <div id="moonBal">Balance: <b id="moonBalanceVal">0</b>
            <span id="moonAccountBadge">Normal</span>
          </div>
        </div>
        <div id="moonChartArea">
          <div id="moonTfBar">
            <button class="moon-tf" data-tf="1s">1s</button>
            <button class="moon-tf active" data-tf="2s">2s</button>
            <button class="moon-tf" data-tf="5s">5s</button>
            <button class="moon-tf" data-tf="1m">1m</button>
            <button class="moon-tf" data-tf="5m">5m</button>
            <button class="moon-tf" data-tf="1D">1D</button>
          </div>
          <div id="moonChartWrap">
            <canvas id="moonCanvas"></canvas>
            <div id="moonZoomBtns">
              <button class="moon-zbtn" id="moonZoomOut">−</button>
              <button class="moon-zbtn" id="moonZoomIn">+</button>
              <button class="moon-zbtn" id="moonZoomReset">Reset</button>
            </div>
          </div>
        </div>
        <div id="moonBottom">
          <div id="moonTradePanel">
          <div id="moonDirToggle">
            <button class="moon-dir-btn long active" data-dir="long">UP</button>
            <button class="moon-dir-btn short" data-dir="short">DOWN</button>
          </div>
            <div id="moonLevRow">
              <span style="color:#9ca3af;font-size:12px">Lev</span>
              <select id="moonLevSelect"></select>
            </div>
            <div id="moonBetRow">
              <div class="moon-chip" data-v="1">1</div>
              <div class="moon-chip" data-v="5">5</div>
              <div class="moon-chip" data-v="25">25</div>
              <div class="moon-chip" data-v="100">100</div>
              <div class="moon-chip" data-v="500">500</div>
              <span id="moonCurrentBet">0</span>
              <button id="moonClearBetBtn">Clear</button>
            </div>
            <button id="moonActionBtn">Open Long</button>
            <div id="moonPosInfo"></div>
            <div id="moonMessage"></div>
          </div>
          <div id="moonFeed">
            <div id="moonFeedTabs">
              <button class="moon-ftab active" data-tab="public">Public</button>
              <button class="moon-ftab" data-tab="lb">Leaderboard</button>
            </div>
            <div id="moonFeedList"></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    els = {
      modal,
      box: document.getElementById("moonBox"),
      closeBtn: document.getElementById("moonCloseBtn"),
      coinSelect: document.getElementById("moonCoinSelect"),
      priceBig: document.getElementById("moonPriceBig"),
      priceChange: document.getElementById("moonPriceChange"),
      balanceVal: document.getElementById("moonBalanceVal"),
      accountBadge: document.getElementById("moonAccountBadge"),
      canvas: document.getElementById("moonCanvas"),
      chartWrap: document.getElementById("moonChartWrap"),
      tfBtns: document.querySelectorAll(".moon-tf"),
      zoomIn: document.getElementById("moonZoomIn"),
      zoomOut: document.getElementById("moonZoomOut"),
      zoomReset: document.getElementById("moonZoomReset"),
      dirBtns: document.querySelectorAll(".moon-dir-btn"),
      levSelect: document.getElementById("moonLevSelect"),
      betRow: document.getElementById("moonBetRow"),
      currentBet: document.getElementById("moonCurrentBet"),
      clearBetBtn: document.getElementById("moonClearBetBtn"),
      actionBtn: document.getElementById("moonActionBtn"),
      posInfo: document.getElementById("moonPosInfo"),
      message: document.getElementById("moonMessage"),
      feedList: document.getElementById("moonFeedList"),
      feedTabs: document.querySelectorAll(".moon-ftab"),
    };
    els.ctx = els.canvas.getContext("2d");

    els.closeBtn.onclick = () => { closeMoon(); if (window.openGamesMenu) window.openGamesMenu(); };
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && els.modal.classList.contains("show")) closeMoon();
    });

    els.dirBtns.forEach(b => {
      b.onclick = () => {
        if (active) return;
        direction = b.dataset.dir;
        els.dirBtns.forEach(x => x.classList.remove("active", "long", "short"));
        b.classList.add("active", direction);
        updateActionBtn();
      };
    });

    

    els.coinSelect.onchange = () => {
      if (active) { els.coinSelect.value = coinId; return; }
      coinId = els.coinSelect.value;
      candles = [];
      viewStart = 0;
      prevPrice = null;
      applyTimeframe();
      const sock = getSocket();
      if (sock) sock.emit("moonGetState");
      needsRedraw = true;
      renderPriceHeader();
    };

    els.levSelect.onchange = () => {
      if (active) return;
      leverage = parseInt(els.levSelect.value, 10);
      updateActionBtn();
    };

    els.tfBtns.forEach(b => {
      b.onclick = () => {
        els.tfBtns.forEach(x => x.classList.remove("active"));
        b.classList.add("active");
        timeframe = b.dataset.tf;
        applyTimeframe();
        needsRedraw = true;
      };
    });

    els.betRow.querySelectorAll(".moon-chip").forEach(c => {
      c.onclick = () => {
        if (active) return;
        const v = parseInt(c.dataset.v, 10);
        if (wager + v > balance) return;
        wager += v;
        renderBet();
      };
    });
    els.clearBetBtn.onclick = () => { if (!active) { wager = 0; renderBet(); } };

    els.actionBtn.onclick = () => {
      const sock = getSocket();
      if (!sock) return;
      if (!active) {
        if (wager <= 0 || wager > balance) return;
        sock.emit("moonOpen", { coinId, direction, leverage, amount: wager, account: getAccount() });
      } else {
        sock.emit("moonClose");
      }
    };

    els.accountBadge.onclick = () => {
      const next = getAccount() === "bonus" ? "normal" : "bonus";
      if (window.setSelectedAccount) window.setSelectedAccount(next);
      else window.selectedAccount = next;
      refreshBalance();
    };

    els.zoomIn.onclick = () => { viewCount = Math.max(15, Math.floor(viewCount * 0.7)); clampView(); needsRedraw = true; };
    els.zoomOut.onclick = () => { viewCount = Math.min(candles.length || 1000, Math.floor(viewCount * 1.4)); clampView(); needsRedraw = true; };
    els.zoomReset.onclick = () => { viewCount = 70; viewStart = Math.max(0, candles.length - viewCount); needsRedraw = true; };

    els.chartWrap.addEventListener("mousedown", e => {
      isDragging = true;
      dragStartX = e.clientX;
      dragStartView = viewStart;
      els.chartWrap.style.cursor = "grabbing";
    });
    window.addEventListener("mousemove", e => {
      if (!isDragging) return;
      const candleW = els.canvas.clientWidth / viewCount;
      viewStart = dragStartView + Math.round(-(e.clientX - dragStartX) / candleW);
      clampView();
      needsRedraw = true;
    });
    window.addEventListener("mouseup", () => {
      isDragging = false;
      if (els.chartWrap) els.chartWrap.style.cursor = "crosshair";
    });

    els.chartWrap.addEventListener("wheel", e => {
      e.preventDefault();
      const rect = els.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const cw = rect.width / viewCount;
      const idxUnderCursor = viewStart + mouseX / cw;
      const oldViewCount = viewCount;
      if (e.deltaY < 0) viewCount = Math.max(15, Math.floor(viewCount * 0.85));
      else viewCount = Math.min(candles.length || 1000, Math.floor(viewCount * 1.15));
      if (viewCount !== oldViewCount) {
        const frac = mouseX / rect.width;
        viewStart = Math.round(idxUnderCursor - frac * viewCount);
      }

      clampView();
      needsRedraw = true;
    }, { passive: false });

    els.feedTabs.forEach(t => {
      t.onclick = () => {
        els.feedTabs.forEach(x => x.classList.remove("active"));
        t.classList.add("active");
        renderFeed(t.dataset.tab);
      };
    });

        (function () {
      const handle = document.getElementById("moonResizeHandle");
      let resizing = false, sx, sy, sw, sh;
      handle.addEventListener("mousedown", e => {
        resizing = true;
        const r = els.box.getBoundingClientRect();
        sx = e.clientX; sy = e.clientY; sw = r.width; sh = r.height;
        e.preventDefault();
        e.stopPropagation();
      });
      document.addEventListener("mousemove", e => {
        if (!resizing) return;
        const r = els.box.getBoundingClientRect();
        const maxW = Math.max(500, innerWidth - r.left);
        const maxH = Math.max(360, innerHeight - r.top);
        els.box.style.width = Math.max(640, Math.min(sw + (e.clientX - sx), maxW)) + "px";
        els.box.style.height = Math.max(480, Math.min(sh + (e.clientY - sy), maxH)) + "px";
        resizeCanvas();
        needsRedraw = true;
      });
      document.addEventListener("mouseup", () => { resizing = false; });
    })();

    (function () {
      let dragging = false, sx, sy, sl, st;
      document.getElementById("moonHeader").addEventListener("mousedown", e => {
        if (e.target.id === "moonCloseBtn") return;
        dragging = true;
        const r = els.box.getBoundingClientRect();
        if (!els.box.classList.contains("dragging-positioned")) {
          els.box.classList.add("dragging-positioned");
          els.box.style.left = r.left + "px";
          els.box.style.top = r.top + "px";
        }
        sx = e.clientX; sy = e.clientY; sl = r.left; st = r.top;
        document.body.style.userSelect = "none";
        e.preventDefault();
      });
      document.addEventListener("mousemove", e => {
        if (!dragging) return;
        els.box.style.left = Math.min(Math.max(sl + e.clientX - sx, -els.box.offsetWidth + 80), innerWidth - 80) + "px";
        els.box.style.top = Math.min(Math.max(st + e.clientY - sy, 0), innerHeight - 40) + "px";
      });
      document.addEventListener("mouseup", () => {
        if (dragging) { dragging = false; document.body.style.userSelect = ""; }
      });
    })();

    window.addEventListener("resize", () => { resizeCanvas(); needsRedraw = true; });
    resizeCanvas();
    populateSelects();
    renderBet();
  }

  function clampView() {
    if (viewStart < 0) viewStart = 0;
    if (viewStart + viewCount > candles.length) viewStart = Math.max(0, candles.length - viewCount);
  }

  function populateSelects() {
    els.coinSelect.innerHTML = "";
    coins.forEach(c => {
      const o = document.createElement("option");
      o.value = c; o.textContent = c;
      els.coinSelect.appendChild(o);
    });
    els.coinSelect.value = coinId;

    els.levSelect.innerHTML = "";
    [200, 250, 500, 750, 1000].forEach(l => {
      if (l > maxLeverage) return;
      const o = document.createElement("option");
      o.value = l; o.textContent = l + "x";
      els.levSelect.appendChild(o);
    });
    els.levSelect.value = String(leverage);
  }

  function resizeCanvas() {
    if (!els.canvas) return;
    const dpr = devicePixelRatio || 1;
    const w = els.chartWrap.clientWidth;
    const h = els.chartWrap.clientHeight;
    els.canvas.width = w * dpr;
    els.canvas.height = h * dpr;
    els.canvas.style.width = w + "px";
    els.canvas.style.height = h + "px";
    els.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }


  function buildCandlesFromHistory(historyArray) {
    if (!Array.isArray(historyArray) || historyArray.length < 2) return;
    candles = [];
    const step = TF_MS[timeframe] || 2000;
    let lastT = 0;
    let cur = null;

    historyArray.forEach(pt => {
      const lo = pt.low ?? pt.price;
      const hi = pt.high ?? pt.price;
      if (!cur || pt.t - lastT >= step) {
        if (cur) candles.push(cur);
        cur = { t: pt.t, o: pt.price, h: hi, l: lo, c: pt.price };
        lastT = pt.t;
      } else {
        cur.c = pt.price;
        cur.h = Math.max(cur.h, hi);
        cur.l = Math.min(cur.l, lo);
      }
    });
    if (cur) candles.push(cur);
    viewStart = Math.max(0, candles.length - viewCount);
    needsRedraw = true;
  }


  function applyTimeframe() {
    if (timeframe === "1D") {
      if (dailyKlines[coinId] && dailyKlines[coinId].length) {
        candles = dailyKlines[coinId].map(k => ({ t: k.t, o: k.o, h: k.h, l: k.l, c: k.c }));
        viewStart = Math.max(0, candles.length - viewCount);
      }
    } else if (rawHistory[coinId]) {
      buildCandlesFromHistory(rawHistory[coinId]);
    }
    needsRedraw = true;
  }

  function onServerPrice(price, low, high) {
    currentPrice = price;
    const lo = low ?? price;
    const hi = high ?? price;

    if (!rawHistory[coinId]) rawHistory[coinId] = [];
    rawHistory[coinId].push({ t: Date.now(), price, low: lo, high: hi });
    if (rawHistory[coinId].length > 2000) rawHistory[coinId].shift();

    if (!candles.length) {
      candles.push({ t: Date.now(), o: price, h: hi, l: lo, c: price });
    } else {
      const last = candles[candles.length - 1];
      const step = TF_MS[timeframe] || 2000;
      const now = Date.now();
      if (now - last.t < step) {
        last.c = price;
        last.h = Math.max(last.h, hi);
        last.l = Math.min(last.l, lo);
      } else {
        candles.push({ t: now, o: last.c, h: hi, l: lo, c: price });
        if (candles.length > 1000) candles.shift();
        if (viewStart + viewCount >= candles.length - 2) {
          viewStart = Math.max(0, candles.length - viewCount);
        }
      }
    }
    needsRedraw = true;
    renderPriceHeader();
  }

  function drawChart() {
    if (!els.ctx || !els.modal?.classList.contains("show")) {
      rafId = requestAnimationFrame(drawChart);
      return;
    }
    if (!needsRedraw) {
      rafId = requestAnimationFrame(drawChart);
      return;
    }
    needsRedraw = false;

    const ctx = els.ctx;
    const w = els.canvas.clientWidth;
    const h = els.canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    if (candles.length < 2) {
      rafId = requestAnimationFrame(drawChart);
      return;
    }

    const visible = candles.slice(viewStart, viewStart + viewCount);
    if (!visible.length) {
      rafId = requestAnimationFrame(drawChart);
      return;
    }

    let min = Infinity, max = -Infinity;
    for (const c of visible) {
      if (c.l < min) min = c.l;
      if (c.h > max) max = c.h;
    }

    const mid = (min + max) / 2 || currentPrice || 100;
    if (max - min <= 0) {
      const eps = mid * 0.0005 || 0.01;
      min = mid - eps;
      max = mid + eps;
    }


    const pad = (max - min) * 0.08;
    min -= pad;
    max += pad;
    const range = max - min;

    ctx.strokeStyle = "#151922";
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      const y = (i / 5) * h;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    ctx.fillStyle = "#4b5563";
    ctx.font = "11px sans-serif";
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const p = max - (i / 4) * range;
      ctx.fillText(p.toLocaleString(undefined, { maximumFractionDigits: 2 }), w - 6, (i / 4) * h + 4);
    }

    const cw = w / visible.length;
    const bodyW = Math.max(2.5, cw * 0.7);
    for (let i = 0; i < visible.length; i++) {
      const c = visible[i];
      const x = i * cw + cw / 2;
      const yO = h - ((c.o - min) / range) * h;
      const yC = h - ((c.c - min) / range) * h;
      const yH = h - ((c.h - min) / range) * h;
      const yL = h - ((c.l - min) / range) * h;
      const up = c.c >= c.o;

      ctx.strokeStyle = up ? "#10b981" : "#ef4444";
      ctx.fillStyle   = up ? "#10b981" : "#ef4444";

      ctx.beginPath();
      ctx.moveTo(x, yH);
      ctx.lineTo(x, yL);
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const top = Math.min(yO, yC);
      const bh  = Math.max(1.5, Math.abs(yC - yO));
      ctx.fillRect(x - bodyW / 2, top, bodyW, bh);
    }

    if (active && bustPrice) {
      const inRange = bustPrice >= min && bustPrice <= max;
      const y = inRange
        ? h - ((bustPrice - min) / range) * h
        : (bustPrice < min ? h - 4 : 4); 
      ctx.beginPath();
      ctx.strokeStyle = "#ff1a1a";
      ctx.lineWidth = 2.5;
      ctx.setLineDash(inRange ? [] : [3, 3]); 
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#ff1a1a";
      ctx.font = "bold 12px sans-serif";
      ctx.textAlign = "left";
      const label = inRange ? "BUST  " + bustPrice.toFixed(2) : (bustPrice < min ? "▼ BUST " : "▲ BUST ") + bustPrice.toFixed(2);
      ctx.fillText(label, 10, inRange ? y - 7 : (bustPrice < min ? y - 7 : y + 16));
    }

    if (active && entryPrice) {
      const inRange = entryPrice >= min && entryPrice <= max;
      if (inRange) {
        const y = h - ((entryPrice - min) / range) * h;
        ctx.beginPath();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 1.5;
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    rafId = requestAnimationFrame(drawChart);
  }

  function refreshBalance() {
    balance = getAccount() === "bonus" ? bonusBalance : normalBalance;
    els.balanceVal.textContent = balance;
    els.accountBadge.textContent = getAccount() === "bonus" ? "Bonus" : "Normal";
    els.accountBadge.classList.toggle("bonus", getAccount() === "bonus");
    renderBet();
  }
  function renderBet() {
    els.currentBet.textContent = String(wager);
    updateActionBtn();
  }
 function updateActionBtn() {
  if (!active) {
    clearInterval(window.closeCountdown);
    window.closeCountdown = null;
    els.actionBtn.textContent = `Open ${direction === "long" ? "Up" : "Down"} ${leverage}x`;
    els.actionBtn.classList.remove("close");
    els.actionBtn.disabled = wager <= 0 || wager > balance;
  } else {
    const elapsed = Date.now() - positionOpenTime;
    const canClose = elapsed >= MIN_POSITION_DURATION;

    if (!canClose) {
      const remaining = Math.ceil((MIN_POSITION_DURATION - elapsed) / 1000);
      els.actionBtn.textContent = `Close in ${remaining}s`;
    } else {
      els.actionBtn.textContent = `Close  ${multiplier.toFixed(2)}x`;
    }

    els.actionBtn.classList.add("close");
    els.actionBtn.disabled = !canClose;
  }
}
  function setMessage(t) { els.message.textContent = t || ""; }

  function renderPriceHeader() {
    const p = currentPrice || prices[coinId] || 0;
    els.priceBig.textContent = p ? "$" + p.toLocaleString(undefined, { maximumFractionDigits: 3 }) : "-";

    if (prevPrice && p) {
      const chg = ((p - prevPrice) / prevPrice) * 100;
      els.priceChange.textContent = (chg >= 0 ? "▲ +" : "▼ ") + Math.abs(chg).toFixed(3) + "%";
      els.priceChange.className = chg >= 0 ? "up" : "down";
    } else {
      els.priceChange.textContent = "-";
      els.priceChange.className = "";
    }
  }

  function renderPosInfo() {
    if (!active) {
      els.posInfo.classList.remove("active");
      els.posInfo.innerHTML = "";
      return;
    }
    els.posInfo.classList.add("active");
    els.posInfo.innerHTML = `
      <div><b>${direction === "long" ? "UP" : "DOWN"} ${leverage}x</b> ${coinId}</div>
      <div>Entry $${entryPrice.toFixed(2)} --> <span style="color:#ff1a1a">Bust $${bustPrice.toFixed(2)}</span></div>
      <div>Equity <b style="color:${equity >= (wager || 1) ? '#10b981' : '#ef4444'}">${equity.toFixed(2)}</b>  (${multiplier.toFixed(2)}x)</div>
    `;
  }

function renderFeed(tab) {
  els.feedList.innerHTML = "";
  const list = tab === "lb" ? leaderboard : publicFeed;
  
  if (!list.length) {
    els.feedList.innerHTML = `<div id="moonFeedEmpty">No data yet</div>`;
    return;
  }
  
  list.forEach((e, i) => {
    const row = document.createElement("div");
    row.className = "moon-bet-row";
    row.innerHTML = `
      <img src="${sanitizeAvatar(e.avatar)}">
      <div class="moon-bet-info">
        <div class="moon-bet-title">${e.username}</div>
        <div class="moon-bet-sub">${tab === "lb" ? "#" + (i + 1) : (e.coinId || coinId) + " · " + (e.leverage || 10) + "x"}</div>
      </div>
      <div class="moon-bet-pnl pos">${Number(e.multiplier).toFixed(2)}x · ${e.payout}</div>
    `;
    els.feedList.appendChild(row);
  });
}

  function applyState(state) {
    active = !!state.active;
    coins = state.coins || coins;
    maxLeverage = state.maxLeverage || 100;
    prices = state.prices || prices;

    if (typeof state.balance === "number") normalBalance = state.balance;
    if (typeof state.bonusBalance === "number") bonusBalance = state.bonusBalance;
    refreshBalance();

    if (state.history) {
      rawHistory = state.history;
    }
    if (state.klines) {
      dailyKlines = state.klines;
    }
    applyTimeframe();

    if (active) {
      coinId = state.coinId;
      direction = state.direction;
      leverage = state.leverage;
      entryPrice = state.entryPrice;
      bustPrice = state.bustPrice;
      currentPrice = state.currentPrice;
      equity = state.equity;
      multiplier = state.multiplier;
      onServerPrice(currentPrice);
    } else {
      currentPrice = prices[coinId] || currentPrice;
      if (currentPrice) onServerPrice(currentPrice);
    }

    prevPrice = currentPrice;
    populateSelects();
    els.coinSelect.disabled = active;
    els.levSelect.disabled = active;
    els.dirBtns.forEach(b => b.disabled = active);
    renderPriceHeader();
    renderPosInfo();
    updateActionBtn();
    needsRedraw = true;
  }

  function bindSocketListeners() {
    const sock = getSocket();
    if (!sock || listenersBound) return;
    listenersBound = true;

    sock.on("moonState", applyState);
    sock.on("moonPriceUpdate", (payload) => {
      Object.keys(payload).forEach(c => { prices[c] = payload[c].price ?? payload[c]; });
      const tick = payload[coinId];
      if (tick !== undefined) {
        const price = tick.price ?? tick;
        onServerPrice(price, tick.low, tick.high);
      }
    });

    sock.on("moonPositionOpened", (data) => {
      active = true;
      positionOpenTime = Date.now();
      coinId = data.coinId;
      direction = data.direction;
      leverage = data.leverage;
      entryPrice = data.entryPrice;
      bustPrice = data.bustPrice;
      if (data.account !== "bonus") normalBalance = data.balance;
      else bonusBalance = data.balance;
      refreshBalance();
      wager = 0;
      setMessage(`Opened ${direction === "long" ? "UP" : "DOWN"} ${leverage}x`);
      renderPosInfo();
      updateActionBtn();
      needsRedraw = true;
    if (!window.closeCountdown) {
    window.closeCountdown = setInterval(() => {
      if (!active) {
        clearInterval(window.closeCountdown);
        window.closeCountdown = null;
        return;
      }
      updateActionBtn();
    }, 100);
  }
});

    sock.on("moonPositionUpdate", (data) => {
      if (!active) return;
      currentPrice = data.currentPrice;
      equity = data.equity;
      multiplier = data.multiplier;
      bustPrice = data.bustPrice;
      onServerPrice(currentPrice);
      renderPosInfo();
      updateActionBtn();
    });

    sock.on("moonPositionClosed", (data) => {
      active = false;
      if (data.account !== "bonus") normalBalance = data.balance;
      else bonusBalance = data.balance;
      refreshBalance();
      setMessage(data.reason === "bust"
        ? `💥 BUSTED - position lost`
        : `Closed at ${data.multiplier.toFixed(2)}x --> +${data.payoutChips}`);
      renderPosInfo();
      updateActionBtn();
      needsRedraw = true;
    });

    sock.on("moonError", (d) => setMessage(d?.msg || "Error"));

sock.on("moonLeaderboardState", (d) => {
  leaderboard = d?.leaders || [];
  publicFeed = d?.publicFeed || [];
  const tab = document.querySelector(".moon-ftab.active")?.dataset.tab || "public";
  renderFeed(tab);
});

    sock.on("bonusUpdate", () => refreshBalance());
  }

  function openMoon() {
    injectStyles();
    buildModal();
    els.modal.classList.add("show");
    window.moonOpen = true;
    wager = 0;
    renderBet();
    refreshBalance();
    resizeCanvas();
    needsRedraw = true;
    if (!rafId) rafId = requestAnimationFrame(drawChart);
    waitForSocket();
    if (typeof window.setGameStatus === "function") window.setGameStatus("Moon");
  }

  function waitForSocket(n = 20) {
    const sock = getSocket();
    if (sock) {
      bindSocketListeners();
      sock.emit("moonGetState");
      sock.emit("moonLeaderboardGet");
      return;
    }
    if (n <= 0) { setMessage("Connection failed"); return; }
    setMessage("Connecting…");
    setTimeout(() => waitForSocket(n - 1), 250);
  }

  function closeMoon() {
    if (els.modal) els.modal.classList.remove("show");
    window.moonOpen = false;
    if (typeof window.clearGameStatus === "function") window.clearGameStatus("Moon");
  }

  window.openMoon = openMoon;
  window.closeMoon = closeMoon;

  document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("moonBtn");
    if (btn) btn.addEventListener("click", openMoon);
  });
  if (document.readyState !== "loading") {
    const btn = document.getElementById("moonBtn");
    if (btn) btn.addEventListener("click", openMoon);
  }
})();