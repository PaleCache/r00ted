(function () {
  let rlState = null;
  let modalEl = null;
  let pendingBetAmount = 5;
  let leaderboard = [];
  let countdownInterval = null;
  let localMsLeft = 0;
  let selectedAccount = "normal";
  const WHEEL_ANIM_MS = 5200;
  let lastSpunRoundId = null;
  let spinAnimStartedAt = 0;
  let stageRefreshTimer = null;
  let resultRevealTimer = null;
  let pendingPersonalResult = null;
  let listenersBound = false;

  function getSocket() {
    if (window.socket) return window.socket;
    try { if (typeof socket !== "undefined" && socket) return socket; } catch (e) {}
    return null;
  }

  function injectStyles() {
    if (document.getElementById("rlStyles")) return;
    const style = document.createElement("style");
    style.id = "rlStyles";
    style.textContent = `
      #rlModalBox {
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        width: 860px; max-width: 96vw; max-height: 94vh; overflow-y: auto;
        background: rgba(0,0,0,0.9);
        border: 1px solid #3a3c42; border-radius: 18px;
        padding: 20px 24px 24px; font-family: 'Inter', system-ui, sans-serif;
        z-index: 30000;
      }
      #rlHeader { display:flex; align-items:center; justify-content:space-between; cursor: move; margin-bottom: 8px; }
      #rlHeader h3 { margin: 0; color:#fff; font-size: 18px; font-weight:600; }
      #rlCloseBtn { background:none; border:none; color:#72767d; font-size:18px; cursor:pointer; padding:4px 8px; }
      #rlCloseBtn:hover { color:#fff; }
      #rlHeaderBalance { color:#ffd166; font-size:13px; font-weight:400; }

   
      #rlWheelWrap {
        display:flex; align-items:center; justify-content:center; gap: 28px;
        padding: 18px 0 10px; flex-wrap: wrap;
      }
      #rlWheelOuter {
        width: 260px; height: 260px; position: relative; flex-shrink:0;
        perspective: 1000px;
      }
      #rlWheelTilt {
        width: 100%; height: 100%; position: relative;
        transform-style: preserve-3d;
        transform: rotateX(52deg);
      }
      #rlWheelInner {
        width: 100%; height: 100%; border-radius: 50%; position: relative;
        overflow: hidden;
        box-shadow:
          0 0 0 10px #5c3a1e,
          0 0 0 14px #3a2415,
          0 0 0 18px #2a1a0f,
          0 18px 35px rgba(0,0,0,0.75),
          inset 0 0 30px rgba(0,0,0,0.55);
        transform: rotate(0deg);
        transition: transform ${WHEEL_ANIM_MS}ms cubic-bezier(0.12, 0.75, 0.22, 1);
        will-change: transform;
        background: #111;
      }
      #rlWheelInner svg {
        width: 100%; height: 100%; display: block;
      }

    
      #rlBallOrbit {
        position: absolute; inset: 0; z-index: 15; pointer-events: none;
        transform: rotate(0deg);
        transition: transform ${WHEEL_ANIM_MS}ms cubic-bezier(0.08, 0.6, 0.18, 1);
      }
      #rlBallRadius {
        position: absolute; top: 50%; left: 50%; width: 0; height: 0;
        transform: translate(-50%, -50%) translateY(-112px);
        transition: transform ${WHEEL_ANIM_MS}ms cubic-bezier(0.25, 0.7, 0.3, 1);
      }
      #rlBall {
        position: absolute; top: -6px; left: -6px; width: 12px; height: 12px;
        border-radius: 50%;
        background: radial-gradient(circle at 32% 28%, #ffffff, #d0d0d0 50%, #888 100%);
        inset 0 -1px 2px rgba(0,0,0,0.3);
      }

    
      #rlResultBanner {
        text-align:center; min-height: 90px; display:flex; flex-direction:column;
        align-items:center; justify-content:center; gap:6px; min-width: 160px;
      }
      .rl-winning-number {
        width: 58px; height: 58px; border-radius: 50%; display:flex; align-items:center;
        justify-content:center; font-size: 24px; font-weight: 800; color:#fff;
        border: 2px solid rgba(255,255,255,0.35);
       
      }
      .rl-winning-number.red { background: #c40018; }
      .rl-winning-number.black { background: #1a1a1a; }
      .rl-winning-number.green { background: #0a7a3c; }
      #rlStageText { color:#b9bbbe; font-size: 13px; }
      #rlTimerText { color:#ffd166; font-size: 13px; font-weight:700; }
      #rlPersonalResult {
        font-size: 14px; font-weight: 700; min-height: 20px;
        transition: opacity 0.3s;
      }
      #rlPersonalResult.win { color: #4ade80; }
      #rlPersonalResult.loss { color: #f87171; }
      #rlPersonalResult.neutral { color: #b9bbbe; }

   
      #rlBoard { display:flex; flex-direction:column; gap: 4px; margin: 12px 0; }
      .rl-row { display:flex; gap: 3px; }
      .rl-cell {
        flex:1; padding: 8px 0; text-align:center; border-radius: 4px; cursor:pointer;
        font-size: 12px; font-weight: 700; color:#fff; user-select:none;
        transition: transform .1s, outline .1s; outline: 2px solid transparent;
        position: relative;
      }
      .rl-cell:hover { transform: scale(1.04); outline: 2px solid #FF0000; }
      .rl-cell.red { background:#c40018; }
      .rl-cell.black { background:#1a1a1a; }
      .rl-cell.green { background:#0a7a3c; }
      .rl-cell.outside { background:#2b2d31; border: 1px solid #40444b; }
      .rl-cell-mybet {
        position:absolute; bottom: 2px; right: 3px; background:#ffd166; color:#111;
        font-size: 9px; font-weight:800; padding: 1px 4px; border-radius: 6px;
      }

      #rlChipRow { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top: 6px; }
      .rl-chip {
        width: 38px; height: 38px; border-radius: 50%; border: 2px dashed rgba(255,255,255,0.5);
        display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:800;
        color:#fff; cursor:pointer; transition: transform .1s; flex-shrink:0; user-select:none;
      }
      .rl-chip:hover { transform: scale(1.08); }
      .rl-chip.selected { outline: 2px solid #FF0000; }
      .rl-chip[data-v="1"]   { background:#555; }
      .rl-chip[data-v="5"]   { background:#3b6ea5; }
      .rl-chip[data-v="25"]  { background:#2f8f4e; }
      .rl-chip[data-v="100"] { background:#1e1f22; border-color:#FF0000; color:#FF0000; }

      #rlAccountBadge {
        margin-left:auto; font-size: 11px; padding: 3px 10px; border-radius: 10px;
        background:#2b2d31; border:1px solid #3a3c42; color:#b9bbbe;
        cursor:pointer; user-select:none; font-weight:700; transition: background .15s, color .15s;
      }
      #rlAccountBadge:hover { filter:brightness(1.15); }
      #rlAccountBadge.bonus { color:#fff; background:#FF0000; border-color:#FF0000; }

      #rlMyBetsBox { margin-top: 10px; font-size: 12px; color:#b9bbbe; }
      #rlMyBetsList { display:flex; flex-wrap:wrap; gap: 6px; margin-top: 4px; }
      .rl-mybet-chip { background:#2b2d31; border:1px solid #40444b; padding:3px 8px; border-radius: 10px; font-size:11px; color:#ffd166; }

      .rl-cell-others {
        position:absolute; bottom: 2px; left: 3px; display:flex; align-items:center;
      }
      .rl-cell-others img {
        width: 14px; height: 14px; border-radius: 50%; object-fit: cover; background:#2b2d31;
        border: 1px solid #111; margin-left: -5px;
      }
      .rl-cell-others img:first-child { margin-left: 0; }
      .rl-cell-others .rl-cell-others-more {
        width: 14px; height: 14px; border-radius: 50%; background:#111; color:#fff;
        font-size: 7px; font-weight:800; display:flex; align-items:center; justify-content:center;
        margin-left: -5px; border: 1px solid #111;
      }

      #rlOtherBetsBox { margin-top: 10px; font-size: 12px; color:#b9bbbe; }
      #rlOtherBetsList { display:flex; flex-wrap:wrap; gap: 6px; margin-top: 4px; max-height: 90px; overflow-y: auto; }
      .rl-other-bet-chip {
        display:flex; align-items:center; gap:5px; background:#2b2d31; border:1px solid #40444b;
        padding:3px 8px 3px 3px; border-radius: 12px; font-size:11px; color:#dcddde;
      }
      .rl-other-bet-chip img {
        width: 18px; height: 18px; border-radius: 50%; object-fit: cover; background:#1e1f22; flex-shrink:0;
      }
      .rl-other-bet-chip .rl-other-bet-amt { color:#ffd166; font-weight:700; }

      #rlLeaderboardBox { margin-top: 16px; border-top: 1px solid #3a3c42; padding-top: 10px; }
      #rlLeaderboardTitle { color:#fff; font-size:13px; font-weight:700; margin:0 0 8px; display:flex; align-items:center; gap:6px; }
      .rl-lb-row { display:flex; align-items:center; gap:10px; padding:5px 4px; border-radius:6px; }
      .rl-lb-row:nth-child(odd) { background: rgba(255,255,255,0.02); }
      .rl-lb-rank { width: 20px; text-align:center; font-size:12px; font-weight:700; color:#72767d; flex-shrink:0; }
      .rl-lb-rank.gold { color:#ffd700; } .rl-lb-rank.silver { color:#c9c9c9; } .rl-lb-rank.bronze { color:#cd7f32; }
      .rl-lb-avatar { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; flex-shrink:0; background:#2b2d31; }
      .rl-lb-name { flex:1; color:#dcddde; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .rl-lb-net { color:#4ade80; font-size:12px; font-weight:700; flex-shrink:0; }
      #rlErrorText { color:#ed4245; font-size: 12px; min-height: 16px; margin-top: 8px; text-align:center; }
    `;
    document.head.appendChild(style);
  }

  
  const RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  const WHEEL_ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];

  function numberColor(n) {
    if (n === 0) return "green";
    return RED_NUMBERS.has(n) ? "red" : "black";
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  const DRAG_EDGE_MARGIN = 40; 

  function clampBoxPosition(box) {
    const rect = box.getBoundingClientRect();
    const maxLeft = window.innerWidth - DRAG_EDGE_MARGIN;
    const minLeft = DRAG_EDGE_MARGIN - rect.width;
    const maxTop = window.innerHeight - DRAG_EDGE_MARGIN;
    const minTop = 0;

    let left = rect.left;
    let top = rect.top;

    if (left > maxLeft) left = maxLeft;
    if (left < minLeft) left = minLeft;
    if (top > maxTop) top = maxTop;
    if (top < minTop) top = minTop;

    if (left !== rect.left) box.style.left = left + "px";
    if (top !== rect.top) box.style.top = top + "px";
  }

  function makeDraggable(header, box) {
    let dragging = false, offX = 0, offY = 0;
    header.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;
      dragging = true;
      const rect = box.getBoundingClientRect();
      offX = e.clientX - rect.left;
      offY = e.clientY - rect.top;
      box.style.transform = "none";
      box.style.top = rect.top + "px";
      box.style.left = rect.left + "px";
    });
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const maxLeft = window.innerWidth - DRAG_EDGE_MARGIN;
      const minLeft = DRAG_EDGE_MARGIN - box.offsetWidth;
      const maxTop = window.innerHeight - DRAG_EDGE_MARGIN;
      const minTop = 0;

      let left = e.clientX - offX;
      let top = e.clientY - offY;

      left = Math.min(Math.max(left, minLeft), maxLeft);
      top = Math.min(Math.max(top, minTop), maxTop);

      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
    });
    document.addEventListener("mouseup", () => { dragging = false; });

  
    window.addEventListener("resize", () => {
      if (box.style.transform === "none") clampBoxPosition(box);
    });
  }

  function buildWheelSVG() {
    const n = WHEEL_ORDER.length;
    const seg = 360 / n;
    const cx = 100, cy = 100;
    const outerR = 98;
    const textR  = 72;
    const fretOuter = 98;
    const fretInner = 32;

    let html = `<svg viewBox="0 0 200 200" width="100%" height="100%">`;
    html += `<circle cx="${cx}" cy="${cy}" r="${outerR}" fill="#0a0a0a"/>`;

    WHEEL_ORDER.forEach((num, i) => {
      const start = i * seg - 90;
      const end   = start + seg;
      const mid   = start + seg / 2;

      const rad1 = (start * Math.PI) / 180;
      const rad2 = (end   * Math.PI) / 180;
      const radM = (mid   * Math.PI) / 180;

      const x1 = cx + outerR * Math.cos(rad1);
      const y1 = cy + outerR * Math.sin(rad1);
      const x2 = cx + outerR * Math.cos(rad2);
      const y2 = cy + outerR * Math.sin(rad2);

      const color = numberColor(num);
      const fill  = color === "red" ? "#b80016" : color === "black" ? "#141414" : "#0a6e36";

      html += `<path d="M${cx},${cy} L${x1},${y1} A${outerR},${outerR} 0 0,1 ${x2},${y2} Z"
                     fill="${fill}" stroke="none"/>`;

    
      const fx1 = cx + fretInner * Math.cos(rad1);
      const fy1 = cy + fretInner * Math.sin(rad1);
      const fx2 = cx + fretOuter * Math.cos(rad1);
      const fy2 = cy + fretOuter * Math.sin(rad1);
      html += `<line x1="${fx1}" y1="${fy1}" x2="${fx2}" y2="${fy2}"
                     stroke="#c9a227" stroke-width="1.1" stroke-linecap="round"/>`;

     
      const tx = cx + textR * Math.cos(radM);
      const ty = cy + textR * Math.sin(radM);
      let rot = mid + 90;
      if (rot > 90 && rot < 270) rot += 180;

      html += `<text x="${tx}" y="${ty}"
                     fill="#f5f5f5" font-size="8.5" font-weight="700"
                     font-family="Inter, system-ui, sans-serif"
                     text-anchor="middle" dominant-baseline="middle"
                     transform="rotate(${rot}, ${tx}, ${ty})">${num}</text>`;
    });

  
    html += `<circle cx="${cx}" cy="${cy}" r="34" fill="none" stroke="#c9a227" stroke-width="2.5"/>`;
    html += `<circle cx="${cx}" cy="${cy}" r="31" fill="#1c120a"/>`;
    html += `<circle cx="${cx}" cy="${cy}" r="22" fill="#2e1c0f" stroke="#c9a227" stroke-width="1.5"/>`;
    html += `<circle cx="${cx}" cy="${cy}" r="12" fill="#1a1008"/>`;
    html += `<circle cx="${cx}" cy="${cy}" r="4"  fill="#c9a227"/>`;

    html += `</svg>`;
    return html;
  }

  function getAccount() {
    return selectedAccount === "bonus" ? "bonus" : "normal";
  }

  function renderAccountBadge() {
    if (!modalEl) return;
    const badge = modalEl.querySelector("#rlAccountBadge");
    if (!badge) return;
    const acc = getAccount();
    badge.textContent = acc === "bonus" ? "Bonus" : "Normal";
    badge.classList.toggle("bonus", acc === "bonus");
  }

  window.openRoulette = function openRoulette() {
    injectStyles();
     if (typeof window.setGameStatus === "function") window.setGameStatus("Roulette");
    if (modalEl) modalEl.remove();
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    lastSpunRoundId = null;
    pendingPersonalResult = null;
    clearTimeout(stageRefreshTimer);
    clearTimeout(resultRevealTimer);

    modalEl = document.createElement("div");
    modalEl.id = "rlModalBox";
    modalEl.innerHTML = `
      <div id="rlHeader">
        <h3>🎡 Roulette <span id="rlHeaderBalance"></span></h3>
        <button id="rlCloseBtn">✕</button>
      </div>

      <div id="rlWheelWrap">
        <div id="rlWheelOuter">
          <div id="rlWheelTilt">
            <div id="rlWheelInner">${buildWheelSVG()}</div>
            <div id="rlBallOrbit">
              <div id="rlBallRadius"><div id="rlBall"></div></div>
            </div>
          </div>
        </div>
        <div id="rlResultBanner">
          <div id="rlStageText">Loading...</div>
          <div id="rlTimerText"></div>
          <div id="rlPersonalResult"></div>
        </div>
      </div>

      <div id="rlBoard"></div>

      <div id="rlChipRow">
        <span style="color:#b9bbbe; font-size:12px;">Chip:</span>
        <div class="rl-chip" data-v="1">1</div>
        <div class="rl-chip" data-v="5">5</div>
        <div class="rl-chip" data-v="25">25</div>
        <div class="rl-chip" data-v="100">100</div>
        <span id="rlAccountBadge">Normal</span>
      </div>

      <div id="rlMyBetsBox">
        Your bets this round:
        <div id="rlMyBetsList"></div>
      </div>

      <div id="rlOtherBetsBox">
        Players' bets this round:
        <div id="rlOtherBetsList"></div>
      </div>

      <div id="rlErrorText"></div>

      <div id="rlLeaderboardBox">
        <div id="rlLeaderboardTitle">🏆 Biggest Single-Round Wins</div>
        <div id="rlLeaderboardList"><div style="color:#72767d;font-size:12px;">Loading…</div></div>
      </div>
    `;
    document.body.appendChild(modalEl);

    modalEl.querySelector("#rlCloseBtn").onclick = () => {
      if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
      modalEl.remove();
      if (typeof window.clearGameStatus === "function") window.clearGameStatus("Roulette");
      if (window.openGamesMenu) window.openGamesMenu();
    };
    makeDraggable(modalEl.querySelector("#rlHeader"), modalEl);

    buildBoard();
    wireChipSelection();

    modalEl.querySelector("#rlAccountBadge").onclick = () => {
      selectedAccount = selectedAccount === "bonus" ? "normal" : "bonus";
      if (window.setSelectedAccount) window.setSelectedAccount(selectedAccount);
      else window.selectedAccount = selectedAccount;
      renderAccountBadge();
    };
    renderAccountBadge();

    const socket = getSocket();
    if (socket) {
      wireSocket();
      socket.emit("rouletteGetState");
      socket.emit("rouletteLeaderboardGet");
    } else {
      waitForSocket();
    }
  };

  function waitForSocket(attemptsLeft = 20) {
    const socket = getSocket();
    if (socket) {
      wireSocket();
      socket.emit("rouletteGetState");
      socket.emit("rouletteLeaderboardGet");
      return;
    }
    if (attemptsLeft <= 0) { showError("Couldn't find a connection"); return; }
    setTimeout(() => waitForSocket(attemptsLeft - 1), 250);
  }

  function showError(msg) {
    if (!modalEl) return;
    modalEl.querySelector("#rlErrorText").textContent = msg ? "❌ " + msg : "";
  }

  function buildBoard() {
    const boardEl = modalEl.querySelector("#rlBoard");
    boardEl.innerHTML = "";

    const grid = document.createElement("div");
    grid.style.cssText = "display:flex; gap:4px;";

    const zeroCell = document.createElement("div");
    zeroCell.className = "rl-cell green";
    zeroCell.style.cssText = "width:44px; flex-shrink:0;";
    zeroCell.dataset.type = "straight";
    zeroCell.dataset.number = "0";
    zeroCell.textContent = "0";
    grid.appendChild(zeroCell);

    const numGrid = document.createElement("div");
    numGrid.style.cssText = "flex:1; display:flex; flex-direction:column; gap:3px;";
    for (let row = 0; row < 3; row++) {
      const rowEl = document.createElement("div");
      rowEl.className = "rl-row";
      for (let col = 0; col < 12; col++) {
        const num = (2 - row) + col * 3 + 1;
        const cell = document.createElement("div");
        cell.className = `rl-cell ${numberColor(num)}`;
        cell.dataset.type = "straight";
        cell.dataset.number = String(num);
        cell.textContent = String(num);
        rowEl.appendChild(cell);
      }
      numGrid.appendChild(rowEl);
    }
    grid.appendChild(numGrid);
    boardEl.appendChild(grid);

    const outsideRow1 = document.createElement("div");
    outsideRow1.className = "rl-row";
    outsideRow1.style.marginTop = "4px";
    [["dozen1","1st 12"],["dozen2","2nd 12"],["dozen3","3rd 12"]].forEach(([type, label]) => {
      const cell = document.createElement("div");
      cell.className = "rl-cell outside";
      cell.dataset.type = type;
      cell.textContent = label;
      outsideRow1.appendChild(cell);
    });
    boardEl.appendChild(outsideRow1);

    const outsideRow2 = document.createElement("div");
    outsideRow2.className = "rl-row";
    [["low","1-18"],["even","Even"],["red","Red"],["black","Black"],["odd","Odd"],["high","19-36"]].forEach(([type, label]) => {
      const cell = document.createElement("div");
      cell.className = "rl-cell outside" + (type === "red" ? " red" : type === "black" ? " black" : "");
      cell.dataset.type = type;
      cell.textContent = label;
      outsideRow2.appendChild(cell);
    });
    boardEl.appendChild(outsideRow2);

    boardEl.querySelectorAll(".rl-cell").forEach(cell => {
      cell.onclick = () => placeBet(cell.dataset.type, cell.dataset.number ? Number(cell.dataset.number) : null);
    });
  }

  function wireChipSelection() {
    modalEl.querySelectorAll(".rl-chip").forEach(chip => {
      chip.onclick = (e) => {
        e.stopPropagation();
        modalEl.querySelectorAll(".rl-chip").forEach(c => c.classList.remove("selected"));
        chip.classList.add("selected");
        pendingBetAmount = parseInt(chip.dataset.v, 10);
      };
    });
    modalEl.querySelector('.rl-chip[data-v="5"]').classList.add("selected");
  }

  function placeBet(type, number) {
    if (!rlState || rlState.state !== "betting") {
      showError("Betting is closed for this round.");
      return;
    }
    const socket = getSocket();
    if (!socket) return;
    const account = getAccount();
    socket.emit("roulettePlaceBet", { type, number, amount: pendingBetAmount, account });
  }

  function spinWheelTo(winningNumber) {
     if (!modalEl) return;
    const wheelInner = modalEl.querySelector("#rlWheelInner");
    const ballOrbit  = modalEl.querySelector("#rlBallOrbit");
    const ballRadius = modalEl.querySelector("#rlBallRadius");
    if (!wheelInner) return;

    const segAngle = 360 / WHEEL_ORDER.length;
    const idx = WHEEL_ORDER.indexOf(Number(winningNumber));
    if (idx === -1) return;
    const wheelTarget = 360 * 6 - (idx * segAngle) - segAngle / 2;
    const ballTarget = -(360 * 11);

    const RIM_RADIUS  = 112;
    const REST_RADIUS = 76;

  
    wheelInner.style.transition = "none";
    wheelInner.style.transform  = "rotate(0deg)";
    if (ballOrbit) {
      ballOrbit.style.transition = "none";
      ballOrbit.style.transform  = "rotate(0deg)";
    }
    if (ballRadius) {
      ballRadius.style.transition = "none";
      ballRadius.style.transform  = `translate(-50%, -50%) translateY(-${RIM_RADIUS}px)`;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        wheelInner.style.transition = `transform ${WHEEL_ANIM_MS}ms cubic-bezier(0.12, 0.75, 0.22, 1)`;
        wheelInner.style.transform  = `rotate(${wheelTarget}deg)`;

        if (ballOrbit) {
          ballOrbit.style.transition = `transform ${WHEEL_ANIM_MS}ms cubic-bezier(0.08, 0.6, 0.18, 1)`;
          ballOrbit.style.transform  = `rotate(${ballTarget}deg)`;
        }
        if (ballRadius) {
          ballRadius.style.transition = `transform ${WHEEL_ANIM_MS}ms cubic-bezier(0.25, 0.7, 0.3, 1)`;
          ballRadius.style.transform  = `translate(-50%, -50%) translateY(-${REST_RADIUS}px)`;
        }
      });
    });
  }

  function startCountdown(msLeft) {
    if (countdownInterval) clearInterval(countdownInterval);
    localMsLeft = msLeft;
    updateTimerText();
    countdownInterval = setInterval(() => {
      localMsLeft -= 1000;
      if (localMsLeft <= 0) {
        localMsLeft = 0;
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
      updateTimerText();
    }, 1000);
  }

  function updateTimerText() {
    const timerText = modalEl?.querySelector("#rlTimerText");
    if (!timerText) return;
    timerText.textContent = localMsLeft > 0 ? `${Math.ceil(localMsLeft / 1000)}s left` : "";
  }

  function updateTimerText0() {
    localMsLeft = 0;
    updateTimerText();
  }

  function renderOtherPlayersBets() {
    if (!modalEl || !rlState) return;
    const bets = rlState.allBets || [];

    modalEl.querySelectorAll(".rl-cell-others").forEach(el => el.remove());
    const byCell = new Map();
    bets.forEach(bet => {
      const cellEl = bet.type === "straight"
        ? modalEl.querySelector(`.rl-cell[data-type="straight"][data-number="${bet.number}"]`)
        : modalEl.querySelector(`.rl-cell[data-type="${bet.type}"]`);
      if (!cellEl) return;
      const key = bet.type + ":" + (bet.number ?? "");
      if (!byCell.has(key)) byCell.set(key, { users: new Map(), cellEl });
      byCell.get(key).users.set(bet.userId, { username: bet.username, avatar: bet.avatar });
    });
    byCell.forEach(({ users, cellEl }) => {
      const wrap = document.createElement("div");
      wrap.className = "rl-cell-others";
      const entries = Array.from(users.values());
      entries.slice(0, 3).forEach(u => {
        const img = document.createElement("img");
        img.src = u.avatar;
        img.alt = "";
        img.title = u.username;
        wrap.appendChild(img);
      });
      if (entries.length > 3) {
        const more = document.createElement("div");
        more.className = "rl-cell-others-more";
        more.textContent = "+" + (entries.length - 3);
        wrap.appendChild(more);
      }
      cellEl.appendChild(wrap);
    });

    const list = modalEl.querySelector("#rlOtherBetsList");
    if (!list) return;
    if (bets.length === 0) {
      list.innerHTML = `<div style="color:#72767d;font-size:12px;">No bets placed yet.</div>`;
      return;
    }
    list.innerHTML = bets.map(bet => `
      <div class="rl-other-bet-chip">
        <img src="${bet.avatar}" alt="">
        <span>${escapeHtml(bet.username)}: ${bet.type}${bet.number !== null && bet.number !== undefined ? " #" + bet.number : ""}</span>
        <span class="rl-other-bet-amt">${bet.amount}</span>
      </div>
    `).join("");
  }

  function showRoundResultBanner(data) {
    if (!modalEl) return;
    const resultBanner = modalEl.querySelector("#rlResultBanner");
    const existing = resultBanner.querySelector(".rl-winning-number");
    if (existing) existing.remove();

    const numEl = document.createElement("div");
    numEl.className = `rl-winning-number ${data.winningColor}`;
    numEl.textContent = data.winningNumber;
    resultBanner.insertBefore(numEl, resultBanner.firstChild);

    const stageText = modalEl.querySelector("#rlStageText");
    if (stageText) stageText.textContent = "Round over";
  }

  function applyPersonalResultMessage(data) {
    const el = modalEl?.querySelector("#rlPersonalResult");
    if (!el || !data) return;

    if (data.netWin > 0) {
      el.textContent = `You won +${data.netWin.toLocaleString()}!`;
      el.className = "win";
    } else if (data.netWin < 0) {
      el.textContent = `You lost ${Math.abs(data.netWin).toLocaleString()}`;
      el.className = "loss";
    } else {
      el.textContent = "No win this round";
      el.className = "neutral";
    }
  }

  function clearPersonalResult() {
    const el = modalEl?.querySelector("#rlPersonalResult");
    if (el) {
      el.textContent = "";
      el.className = "";
    }
  }

  function render() {
    if (!modalEl || !rlState) return;

    const stageText    = modalEl.querySelector("#rlStageText");
    const balanceEl    = modalEl.querySelector("#rlHeaderBalance");
    const myBetsList   = modalEl.querySelector("#rlMyBetsList");
    const resultBanner = modalEl.querySelector("#rlResultBanner");

    if (rlState.yourBalance != null) {
      balanceEl.textContent = `· ${rlState.yourBalance.toLocaleString()} chips`;
    }

    if (rlState.state === "betting") {
      stageText.textContent = "Place your bets";
      startCountdown(rlState.bettingMsLeft > 0 ? rlState.bettingMsLeft : 0);
      const existingResult = resultBanner.querySelector(".rl-winning-number");
      if (existingResult) existingResult.remove();
      clearPersonalResult();
    } else if (rlState.state === "spinning") {
      if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
      stageText.textContent = "Spinning...";
      updateTimerText0();
    } else if (rlState.state === "results") {
      if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
      const stillAnimating = Date.now() - spinAnimStartedAt < WHEEL_ANIM_MS;
      stageText.textContent = stillAnimating ? "Spinning..." : "Round over";
      updateTimerText0();
    }

    myBetsList.innerHTML = "";
    (rlState.yourBets || []).forEach(bet => {
      const chip = document.createElement("div");
      chip.className = "rl-mybet-chip";
      chip.textContent = `${bet.type}${bet.number !== null && bet.number !== undefined ? " #" + bet.number : ""}: ${bet.amount}`;
      myBetsList.appendChild(chip);
    });

    modalEl.querySelectorAll(".rl-cell-mybet").forEach(el => el.remove());
    (rlState.yourBets || []).forEach(bet => {
      let cell = null;
      if (bet.type === "straight") {
        cell = modalEl.querySelector(`.rl-cell[data-type="straight"][data-number="${bet.number}"]`);
      } else {
        cell = modalEl.querySelector(`.rl-cell[data-type="${bet.type}"]`);
      }
      if (cell) {
        const badge = document.createElement("div");
        badge.className = "rl-cell-mybet";
        badge.textContent = bet.amount;
        cell.appendChild(badge);
      }
    });

    renderOtherPlayersBets();
  }

  function renderLeaderboard() {
    const list = modalEl?.querySelector("#rlLeaderboardList");
    if (!list) return;
    if (!leaderboard || leaderboard.length === 0) {
      list.innerHTML = `<div style="color:#72767d;font-size:12px;">No wins recorded yet.</div>`;
      return;
    }
    const rankClass = (i) => (i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "");
    list.innerHTML = leaderboard.map((entry, i) => `
      <div class="rl-lb-row">
        <span class="rl-lb-rank ${rankClass(i)}">#${i + 1}</span>
        <img class="rl-lb-avatar" src="${entry.avatar}" alt="">
        <span class="rl-lb-name">${escapeHtml(entry.username)}</span>
        <span class="rl-lb-net">+${entry.netWin.toLocaleString()}</span>
      </div>
    `).join("");
  }

  function wireSocket() {
    const socket = getSocket();
    if (!socket) { setTimeout(wireSocket, 200); return; }
    if (listenersBound) return;
    listenersBound = true;

    socket.on("rouletteState", (data) => {
      const prevRoundId = rlState ? rlState.roundId : null;
      rlState = data;

      if (data.roundId !== prevRoundId) {
        pendingPersonalResult = null;
      }

      const hasNumber = data.winningNumber !== null && data.winningNumber !== undefined;
      if (hasNumber && data.roundId !== lastSpunRoundId) {
        lastSpunRoundId = data.roundId;
        spinAnimStartedAt = Date.now();
        spinWheelTo(data.winningNumber);

        clearTimeout(stageRefreshTimer);
        clearTimeout(resultRevealTimer);

        stageRefreshTimer = setTimeout(render, WHEEL_ANIM_MS + 60);

        resultRevealTimer = setTimeout(() => {
          showRoundResultBanner({
            winningNumber: data.winningNumber,
            winningColor: data.winningColor
          });
         
          if (pendingPersonalResult) {
            applyPersonalResultMessage(pendingPersonalResult);
            pendingPersonalResult = null;
          }
        }, WHEEL_ANIM_MS);
      }
      render();
    });

    socket.on("rouletteRoundResult", (data) => {
      if (!modalEl) return;
      pendingPersonalResult = data;
      if (Date.now() - spinAnimStartedAt >= WHEEL_ANIM_MS) {
        applyPersonalResultMessage(data);
        pendingPersonalResult = null;
      }
    });

    socket.on("rouletteBetPlaced", () => showError(""));
    socket.on("rouletteError", (data) => showError(data?.msg || "Something went wrong."));
    socket.on("rouletteLeaderboardState", (data) => {
      leaderboard = data?.leaders || [];
      renderLeaderboard();
    });
  }

  wireSocket();
})();