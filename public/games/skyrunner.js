(function () {
    function getSocket() {
        if (window.socket) return window.socket;
        try {
            if (typeof socket !== "undefined" && socket) return socket;
        } catch (e) {}
        return null;
    }

    function getAccount() {
        return window.selectedAccount === "bonus" ? "bonus" : "normal";
    }

    let balance = 0;
    let normalBalance = 0;
    let pendingBet = 0;
    let listenersBound = false;

    const SPEEDS = {
        cruise: { label: "Cruise", unitsPerSec: 45,  emoji: "🐢" },
        steady: { label: "Steady", unitsPerSec: 75,  emoji: "🚶" },
        fast:   { label: "Fast",   unitsPerSec: 115, emoji: "💨" },
        turbo:  { label: "Turbo",  unitsPerSec: 170, emoji: "⚡" },
    };
    let selectedSpeed = "steady";

   
    let flightActive = false;
    let flightStars = [];
    let flightTrackLength = 1000;
    let flightUnitsPerSec = 75;
    let flightStartedAt = 0;
    let lastResultMessage = "";
    let lastResultKind = ""; 
    let explosionAtDistance = null;
    let landedAtShip = false;
    let rafId = null;
    let leaderboardOpen = false;
    let leaderboardEntries = [];

    function injectStyles() {
        if (document.getElementById("avStyles")) return;
        const style = document.createElement("style");
        style.id = "avStyles";
        style.textContent = `
        #avModal {
        position: fixed; inset: 0; background: rgba(0, 0, 0, 0);
        display: none; align-items: center; justify-content: center;
        z-index: 30500;
        }
        #avModal.show { display: flex; }
        #avBox {
        width: 760px; max-width: 96vw; background: rgba(0, 0, 0, 0.9);
        border: 1px solid #3a3c42; border-radius: 14px;
        overflow: hidden; max-height: 92vh; display:flex; flex-direction:column;
        }
        #avHeader {
        display:flex; align-items:center; justify-content:space-between;
        padding: 12px 16px; background:#rgba(0, 0, 0, 0.9);
        }
        #avHeader h3 { margin:0; color:#fff; font-size:15px; letter-spacing:.5px; }
        #avHeaderBtns { display:flex; align-items:center; gap:10px; }
        #avLeaderboardBtn {
        background:#171a21; border:1px solid #3a3c42; color:#cfd8e3; font-size:13px;
        cursor:pointer; padding:5px 10px; border-radius:8px; font-weight:700;
        display:flex; align-items:center; gap:5px; transition: all .15s;
        }
        #avLeaderboardBtn:hover { background:#20242c; color:#fff; }
        #avLeaderboardBtn.active { background:#FF0000; border-color:#FF0000; color:#fff; }
        #avCloseBtn {
        background:none; border:none; color:#72767d; font-size:20px; cursor:pointer;
        transition: color .15s;
        }
        #avCloseBtn:hover { color:#fff; }
        #avBoard {
        position: relative; width: 100%; height: 340px;
        background: linear-gradient(180deg, #1b3a6b 0%, #2f5f95 45%, #6fa8d8 75%, #bcdcf2 100%);
        overflow: hidden;
        }
        #avCanvas { position:absolute; inset:0; width:100%; height:100%; display:block; }
        #avHud {
        position:absolute; left:10px; bottom:10px; z-index:4;
        display:flex; gap:14px; background:rgba(0,0,0,.35); backdrop-filter:blur(2px);
        padding:8px 14px; border-radius:10px;
        }
        .av-hud-stat { text-align:center; }
        .av-hud-label { font-size:9px; color:#cfd8e3; text-transform:uppercase; letter-spacing:1px; font-weight:700; }
        .av-hud-value { font-size:14px; color:#fff; font-weight:800; }
        #avResultBanner {
        position:absolute; top:14px; left:50%; transform:translateX(-50%);
        z-index:5; text-align:center; pointer-events:none;
        font-weight:900; font-size:20px; color:#fff;
        text-shadow:0 2px 8px rgba(0,0,0,.6);
        display:none;
        }
        #avResultBanner.win { color:#3ee06a; }
        #avResultBanner.lose { color:#ff4d4d; }
        #avLeaderboardPanel {
        position:absolute; top:0; right:0; bottom:0; width:250px; max-width:78%;
        z-index:6; background:rgba(0, 0, 0, 0.9); border-left:1px solid #23262d;
        display:flex; flex-direction:column; padding:14px 12px; overflow-y:auto;
        transform:translateX(100%); transition: transform .22s ease;
        
        }
        #avLeaderboardPanel.show { transform:translateX(0); }
        #avLeaderboardPanel h4 {
        margin:0 0 10px; color:#fff; font-size:12px; text-transform:uppercase;
        letter-spacing:1px; display:flex; align-items:center; gap:6px;
        }
        .av-lb-row {
        display:flex; align-items:center; gap:8px; padding:6px 7px;
        border-radius:8px; background:#12151c; margin-bottom:6px; font-size:11px;
        }
        .av-lb-row.me { background:#2a1414; border:1px solid #FF0000; }
        .av-lb-rank { width:18px; text-align:center; font-weight:900; color:#ffd700; flex-shrink:0; font-size:11px; }
        .av-lb-rank.r1 { color:#ffd700; }
        .av-lb-rank.r2 { color:#c7cbd1; }
        .av-lb-rank.r3 { color:#cd7f32; }
        .av-lb-avatar {
        width:24px; height:24px; border-radius:50%; object-fit:cover; flex-shrink:0;
        background:#23262d; border:1px solid #3a3c42;
        }
        .av-lb-info { flex:1; min-width:0; display:flex; flex-direction:column; gap:1px; }
        .av-lb-name { color:#e6e6e7; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .av-lb-mult { color:#3ee06a; font-weight:800; }
        .av-lb-payout { color:#ffd700; font-weight:700; font-size:10px; }
        .av-lb-empty { color:#72767d; font-size:12px; text-align:center; margin-top:20px; }
        #avMessage { text-align:center; color:#e6e6e7; font-size:12px; font-weight:700; min-height:16px; padding: 6px 0 0; }
        #avControls {
        padding: 12px 16px 16px; border-top: 1px solid #23262d; background:rgba(0, 0, 0, 0.9);
        display:flex; flex-direction:column; gap:10px;
        }
        #avSpeedRow { display:flex; gap:8px; }
        .av-speed-btn {
        flex:1; display:flex; flex-direction:column; align-items:center; gap:2px;
        background:#171a21; border:2px solid #23262d; border-radius:10px;
        padding:8px 4px; cursor:pointer; color:#9aa1ab; font-size:10px; font-weight:800;
        text-transform:uppercase; letter-spacing:.5px; transition: all .15s;
        }
        .av-speed-btn .av-speed-emoji { font-size:18px; }
        .av-speed-btn.active { color:#fff; background:#FF0000; }
        .av-speed-btn:disabled { opacity:.4; cursor:not-allowed; }
        #avBetRow { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .av-chip {
            width: 38px; height: 38px; border-radius: 50%; border: 2px dashed rgba(255,255,255,0.5);
            display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:800;
            color:#fff; cursor:pointer; transition: transform .1s; flex-shrink:0; user-select:none;
        }
        .av-chip:hover { transform: scale(1.08); }
        .av-chip:active { transform: scale(0.95); }
        .av-chip[data-v="5"]   { background:#3b6ea5; }
        .av-chip[data-v="25"]  { background:#2f8f4e; }
        .av-chip[data-v="100"] { background:#1e1f22; border-color:#FF0000; color:#FF0000; }
        .av-chip[data-v="500"] { background:#6b21a8; }
        #avClearBetBtn {
        background:#40444b; border:none; color:#fff; padding:8px 12px; border-radius:8px;
        cursor:pointer; font-size:12px; margin-left:auto;
        }
        #avCurrentBet { color:#ffd700; font-weight:800; font-size:13px; }
        #avBottomRow { display:flex; align-items:center; gap:12px; }
        #avBalanceBox { font-size:12px; color:#b9bbbe; }
        #avBalanceBox b { color:#ffd700; }
        #avAccountBadge {
        font-size: 11px; padding: 2px 8px; border-radius: 10px;
        background:#2b2d31; border:1px solid #3a3c42; color:#b9bbbe;
        cursor:pointer; user-select:none;
        }
        #avAccountBadge.bonus { color:#fff; background:#FF0000; }
        #avActionBtn {
        flex:1; background:#FF0000; border:none; color:#fff; padding:13px 0; border-radius:10px;
        cursor:pointer; font-size:14px; font-weight:800; transition: filter .15s, opacity .15s, background .15s;
        }
        #avActionBtn:hover { filter:brightness(1.15); }
        #avActionBtn:disabled { opacity:.35; cursor:not-allowed; filter:none; }
        #avActionBtn.cashout { background:#ffd23f; color:#221900; }

        @media (max-width: 640px) {
          #avBoard { height: 260px; }
          #avSpeedRow { flex-wrap:wrap; }
        }
        `;
        document.head.appendChild(style);
    }

    let els = {};

    function buildModal() {
        if (document.getElementById("avModal")) return;

        const modal = document.createElement("div");
        modal.id = "avModal";
        modal.innerHTML = `
        <div id="avBox">
          <div id="avHeader">
            <h3>✈️ SKY RUNNER</h3>
            <div id="avHeaderBtns">
              <button id="avLeaderboardBtn">🏆 <span>Leaders</span></button>
              <button id="avCloseBtn">✕</button>
            </div>
          </div>
          <div id="avBoard">
            <canvas id="avCanvas"></canvas>
            <div id="avResultBanner"></div>
            <div id="avLeaderboardPanel">
              <h4>🏆 Top Flights</h4>
              <div id="avLeaderboardList"></div>
            </div>
            <div id="avHud">
              <div class="av-hud-stat"><div class="av-hud-label">Altitude</div><div class="av-hud-value" id="avAltitude">0.0m</div></div>
              <div class="av-hud-stat"><div class="av-hud-label">Distance</div><div class="av-hud-value" id="avDistance">0.0m</div></div>
              <div class="av-hud-stat"><div class="av-hud-label">Multiplier</div><div class="av-hud-value" id="avMult">×1.00</div></div>
            </div>
          </div>
          <div id="avMessage"></div>
          <div id="avControls">
            <div id="avSpeedRow"></div>
            <div id="avBetRow">
              <span style="color:#b9bbbe; font-size:12px;">Bet:</span>
              <div class="av-chip" data-v="1">1</div>
              <div class="av-chip" data-v="5">5</div>
              <div class="av-chip" data-v="25">25</div>
              <div class="av-chip" data-v="100">100</div>
              <div class="av-chip" data-v="500">500</div>
              <span id="avCurrentBet">0</span>
              <button id="avClearBetBtn">Clear</button>
            </div>
            <div id="avBottomRow">
              <div id="avBalanceBox">Balance: <b id="avBalanceVal">0 chips</b></div>
              <span id="avAccountBadge">Normal</span>
              <button id="avActionBtn">Take Off</button>
            </div>
          </div>
        </div>
        `;
        document.body.appendChild(modal);

        els = {
            modal,
            closeBtn: document.getElementById("avCloseBtn"),
            board: document.getElementById("avBoard"),
            canvas: document.getElementById("avCanvas"),
            resultBanner: document.getElementById("avResultBanner"),
            altitude: document.getElementById("avAltitude"),
            distance: document.getElementById("avDistance"),
            mult: document.getElementById("avMult"),
            message: document.getElementById("avMessage"),
            speedRow: document.getElementById("avSpeedRow"),
            betRow: document.getElementById("avBetRow"),
            clearBetBtn: document.getElementById("avClearBetBtn"),
            currentBet: document.getElementById("avCurrentBet"),
            balanceVal: document.getElementById("avBalanceVal"),
            accountBadge: document.getElementById("avAccountBadge"),
            actionBtn: document.getElementById("avActionBtn"),
            leaderboardBtn: document.getElementById("avLeaderboardBtn"),
            leaderboardPanel: document.getElementById("avLeaderboardPanel"),
            leaderboardList: document.getElementById("avLeaderboardList"),
        };

        els.ctx = els.canvas.getContext("2d");

        els.closeBtn.onclick = () => {
            closeAvia();
            if (window.openGamesMenu) window.openGamesMenu();
        };
       
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && modal.classList.contains("show")) closeAvia();
        });

        els.leaderboardBtn.onclick = () => {
            leaderboardOpen = !leaderboardOpen;
            els.leaderboardBtn.classList.toggle("active", leaderboardOpen);
            els.leaderboardPanel.classList.toggle("show", leaderboardOpen);
            if (leaderboardOpen) requestLeaderboard();
        };

        Object.keys(SPEEDS).forEach(key => {
            const s = SPEEDS[key];
            const btn = document.createElement("div");
            btn.className = "av-speed-btn" + (key === selectedSpeed ? " active" : "");
            btn.dataset.speed = key;
            btn.innerHTML = `<span class="av-speed-emoji">${s.emoji}</span><span>${s.label}</span>`;
            btn.onclick = () => {
                if (flightActive) return;
                selectedSpeed = key;
                els.speedRow.querySelectorAll(".av-speed-btn").forEach(b => b.classList.toggle("active", b.dataset.speed === key));
            };
            els.speedRow.appendChild(btn);
        });

        els.betRow.querySelectorAll(".av-chip").forEach((chip) => {
            chip.onclick = () => {
                if (flightActive) return;
                const v = parseInt(chip.dataset.v, 10);
                if (v > balance - pendingBet) return;
                pendingBet += v;
                renderBet();
            };
        });

        els.clearBetBtn.onclick = () => {
            if (flightActive) return;
            pendingBet = 0;
            renderBet();
        };

        els.actionBtn.onclick = () => {
            const socket = getSocket();
            if (!socket) return;

            if (!flightActive) {
                if (pendingBet <= 0 || pendingBet > balance) return;
                lastResultMessage = "";
                lastResultKind = "";
                explosionAtDistance = null;
                landedAtShip = false;
                els.resultBanner.style.display = "none";
                socket.emit("aviaStart", { amount: pendingBet, speed: selectedSpeed, account: getAccount() });
            } else {
                socket.emit("aviaCashout");
            }
        };

        els.accountBadge.onclick = () => {
            if (flightActive) return;
            const next = getAccount() === "bonus" ? "normal" : "bonus";
            if (window.setSelectedAccount) window.setSelectedAccount(next);
            else window.selectedAccount = next;
            refreshDisplayedBalance();
        };

        window.addEventListener("resize", resizeCanvas);
        resizeCanvas();
        renderBet();
        updateActionButton();
    }

    function resizeCanvas() {
        if (!els.canvas) return;
        const dpr = window.devicePixelRatio || 1;
        const w = els.board.clientWidth;
        const h = els.board.clientHeight;
        els.canvas.width = w * dpr;
        els.canvas.height = h * dpr;
        els.canvas.style.width = w + "px";
        els.canvas.style.height = h + "px";
        els.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function renderBalance() {
        els.balanceVal.textContent = `${balance} chips`;
        const acc = getAccount();
        els.accountBadge.textContent = acc === "bonus" ? "Bonus" : "Normal";
        els.accountBadge.classList.toggle("bonus", acc === "bonus");
    }

    function refreshDisplayedBalance() {
        balance = getAccount() === "bonus"
            ? (window.bonusState ? window.bonusState.bonusChips : 0)
            : normalBalance;
        renderBalance();
        renderBet();
    }

    function renderBet() {
        els.currentBet.textContent = String(pendingBet);
        updateActionButton();
    }

    function updateActionButton() {
        if (!els.actionBtn) return;
        els.actionBtn.classList.remove("cashout");
        els.speedRow.querySelectorAll(".av-speed-btn").forEach(b => b.style.pointerEvents = flightActive ? "none" : "auto");
        els.betRow.style.opacity = flightActive ? "0.5" : "1";
        els.betRow.style.pointerEvents = flightActive ? "none" : "auto";

        if (!flightActive) {
            els.actionBtn.textContent = "Take Off";
            els.actionBtn.disabled = pendingBet <= 0 || pendingBet > balance;
        } else {
            els.actionBtn.classList.add("cashout");
            els.actionBtn.textContent = `Cash Out (${currentMultiplierClient().toFixed(2)}x)`;
            els.actionBtn.disabled = false;
        }
    }

    function setMessage(text) {
        if (els.message) els.message.textContent = text || "";
    }

  
    function requestLeaderboard() {
        const socket = getSocket();
        if (!socket) return;
        socket.emit("aviaGetLeaderboard");
    }

    function renderLeaderboard() {
        if (!els.leaderboardList) return;
        if (!leaderboardEntries.length) {
            els.leaderboardList.innerHTML = `<div class="av-lb-empty">No flights recorded yet. Be the first!</div>`;
            return;
        }
        const myName = window.currentUsername || window.username || null;
        els.leaderboardList.innerHTML = leaderboardEntries.slice(0, 20).map((entry, i) => {
            const rank = i + 1;
            const rankClass = rank === 1 ? "r1" : rank === 2 ? "r2" : rank === 3 ? "r3" : "";
            const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank;
            const isMe = myName && entry.name === myName;
            const avatarSrc = entry.avatar ? escapeHtml(entry.avatar) : "/avatars/default1.png";
            return `
              <div class="av-lb-row${isMe ? " me" : ""}">
                <div class="av-lb-rank ${rankClass}">${medal}</div>
                <img class="av-lb-avatar" src="${avatarSrc}" alt="" onerror="this.src='/avatars/default1.png'">
                <div class="av-lb-info">
                  <div class="av-lb-name">${escapeHtml(entry.name || "Anonymous")}</div>
                  <div class="av-lb-mult">×${Number(entry.multiplier || 0).toFixed(2)} <span class="av-lb-payout">· ${Number(entry.payout || 0)} chips</span></div>
                </div>
              </div>`;
        }).join("");
    }

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, (c) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        }[c]));
    }

   
    function currentDistanceClient() {
        if (!flightActive) return 0;
        const elapsedSec = (Date.now() - flightStartedAt) / 1000;
        return Math.min(elapsedSec * flightUnitsPerSec, flightTrackLength);
    }
    const AVIA_HOUSE_EDGE = 0.97; 

    function currentMultiplierClient() {
        const d = currentDistanceClient();
        let mult = 1;
        flightStars.forEach(s => { if (s.distance <= d) mult += s.value; });
        return Math.round(mult * AVIA_HOUSE_EDGE * 100) / 100;
    }

  
    function starSeedY(star) {
        const x = Math.sin(star.distance * 12.9898 + star.value * 78.233) * 43758.5453;
        return x - Math.floor(x); 
    }


    function tracePlaneOutline(ctx) {
        ctx.beginPath();
        ctx.moveTo(21, 16);
        ctx.lineTo(21, 14);
        ctx.lineTo(13, 9);
        ctx.lineTo(13, 3.5);
        ctx.bezierCurveTo(13, 2.67, 12.33, 2, 11.5, 2);
        ctx.bezierCurveTo(10.67, 2, 10, 2.67, 10, 3.5);
        ctx.lineTo(10, 9);
        ctx.lineTo(2, 14);
        ctx.lineTo(2, 16);
        ctx.lineTo(10, 13.5);
        ctx.lineTo(10, 19);
        ctx.lineTo(7.5, 20.5);
        ctx.lineTo(7.5, 22);
        ctx.lineTo(11, 21);
        ctx.lineTo(14.5, 22);
        ctx.lineTo(14.5, 20.5);
        ctx.lineTo(13, 19);
        ctx.lineTo(13, 13.5);
        ctx.lineTo(21, 16);
        ctx.closePath();
    }

    function drawPlane(ctx, exploding) {
        ctx.save();

        if (exploding) {
            ctx.font = "30px serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("💥", 0, 0);
            ctx.restore();
            return;
        }

        ctx.rotate(Math.PI / 2);   
        ctx.scale(1.9, 1.9);
        ctx.translate(-12, -12);  

        ctx.fillStyle = "#f2f3f7";
        ctx.strokeStyle = "#2b2d33";
        ctx.lineWidth = 0.9;
        ctx.lineJoin = "round";
        tracePlaneOutline(ctx);
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }

  
    function drawFrame() {
        if (!els.ctx || !els.modal || !els.modal.classList.contains("show")) {
            rafId = requestAnimationFrame(drawFrame);
            return;
        }

        const w = els.canvas.clientWidth, h = els.canvas.clientHeight;
        els.ctx.clearRect(0, 0, w, h);
        els.ctx.fillStyle = "rgba(255,255,255,0.18)";
        for (let i = 0; i < 5; i++) {
            const cx = ((i * 190) - (Date.now() / 60) % 950) % (w + 200) - 100;
            const cy = 40 + (i % 3) * 50;
            els.ctx.beginPath();
            els.ctx.ellipse(cx, cy, 46, 16, 0, 0, Math.PI * 2);
            els.ctx.fill();
        }

        const pxPerUnit = w / 380; 
        const planeScreenX = w * 0.28;
        const groundY = h - 30;

        const distanceNow = explosionAtDistance !== null ? explosionAtDistance
            : (landedAtShip ? flightTrackLength : currentDistanceClient());

      
        const shipScreenX = planeScreenX + (flightTrackLength - distanceNow) * pxPerUnit;
        if (shipScreenX > -60 && shipScreenX < w + 60) {
            els.ctx.font = "34px serif";
            els.ctx.textAlign = "center";
            els.ctx.fillText("🚢", shipScreenX, groundY - 4);
        }

      
        els.ctx.strokeStyle = "rgba(255,255,255,0.35)";
        els.ctx.lineWidth = 2;
        els.ctx.beginPath();
        els.ctx.moveTo(0, groundY + 14);
        els.ctx.lineTo(w, groundY + 14);
        els.ctx.stroke();

       
        flightStars.forEach(star => {
            const sx = planeScreenX + (star.distance - distanceNow) * pxPerUnit;
            if (sx < -30 || sx > w + 30) return;
            const collected = star.distance <= distanceNow;
            const sy = 40 + starSeedY(star) * (groundY - 100);

            els.ctx.save();
            els.ctx.globalAlpha = collected ? 0.25 : 1;
            els.ctx.beginPath();
            els.ctx.fillStyle = collected ? "#6b7280" : "#ffffff";
            els.ctx.shadowColor = collected ? "transparent" : "rgba(255,255,255,0.8)";
            els.ctx.shadowBlur = collected ? 0 : 14;
            els.ctx.arc(sx, sy, 17, 0, Math.PI * 2);
            els.ctx.fill();
            els.ctx.shadowBlur = 0;
            els.ctx.fillStyle = collected ? "#e5e7eb" : "#1a2438";
            els.ctx.font = "700 11px system-ui, sans-serif";
            els.ctx.textAlign = "center";
            els.ctx.textBaseline = "middle";
            els.ctx.fillText("×" + star.value, sx, sy + 1);
            els.ctx.restore();
        });

       
        const bob = flightActive ? Math.sin(Date.now() / 200) * 5 : 0;
        const planeY = groundY - 90 + bob;
        els.ctx.save();
        els.ctx.translate(planeScreenX, planeY);
        drawPlane(els.ctx, explosionAtDistance !== null);
        els.ctx.restore();

       
        els.altitude.textContent = (distanceNow * 0.023).toFixed(1) + "m";
        els.distance.textContent = distanceNow.toFixed(1) + "m";
        els.mult.textContent = "×" + currentMultiplierClient().toFixed(2);

        if (flightActive) updateActionButton();

        rafId = requestAnimationFrame(drawFrame);
    }
    rafId = requestAnimationFrame(drawFrame);

  
    function bindSocketListeners() {
        const socket = getSocket();
        if (!socket || listenersBound) return;
        listenersBound = true;

        socket.on("aviaState", (state) => {
            if (typeof state.balance === "number") normalBalance = state.balance;
            if (state.active) {
                flightActive = true;
                flightStars = state.stars || [];
                flightTrackLength = state.trackLength;
                flightUnitsPerSec = state.unitsPerSec;
                flightStartedAt = state.startedAt;
                selectedSpeed = state.speedKey;
            }
            refreshDisplayedBalance();
            updateActionButton();
        });

        socket.on("aviaStarted", (state) => {
            flightActive = true;
            flightStars = state.stars || [];
            flightTrackLength = state.trackLength;
            flightUnitsPerSec = state.unitsPerSec;
            flightStartedAt = state.startedAt;
            explosionAtDistance = null;
            landedAtShip = false;
            els.resultBanner.style.display = "none";
            if (state.account !== "bonus" && typeof state.balance === "number") normalBalance = state.balance;
            refreshDisplayedBalance();
            setMessage(`Taking off - ${SPEEDS[state.speedKey]?.label || state.speedKey} speed.`);
            updateActionButton();
        });

        socket.on("aviaCashoutResult", (data) => {
            flightActive = false;
            if (data.account !== "bonus" && typeof data.balance === "number") normalBalance = data.balance;
            refreshDisplayedBalance();
            showResultBanner(`+${data.payoutChips} chips`, "win");
            setMessage(`✅ Cashed out at ${data.multiplier.toFixed(2)}x - +${data.payoutChips}`);
            updateActionButton();
            if (leaderboardOpen) requestLeaderboard();
        });

        socket.on("aviaCrashed", (data) => {
            flightActive = false;
            explosionAtDistance = data.crashDistance;
            showResultBanner(`Crashed! Lost ${data.betChips}`, "lose");
            setMessage(`💥 Engine failure at ${data.multiplierAtCrash.toFixed(2)}x - lost ${data.betChips} chips.`);
            updateActionButton();
        });

        socket.on("aviaFullClear", (data) => {
            flightActive = false;
            landedAtShip = true;
            if (data.account !== "bonus" && typeof data.balance === "number") normalBalance = data.balance;
            refreshDisplayedBalance();
            showResultBanner(`Landed! +${data.payoutChips} chips`, "win");
            setMessage(`🏆 Full clear at ${data.multiplier.toFixed(2)}x - +${data.payoutChips}!`);
            updateActionButton();
            if (leaderboardOpen) requestLeaderboard();
        });

        socket.on("aviaError", (data) => {
            setMessage(data?.msg || "Something went wrong.");
        });

        socket.on("aviaLeaderboard", (data) => {
            leaderboardEntries = Array.isArray(data) ? data : (data?.entries || []);
            renderLeaderboard();
        });

        socket.on("bonusUpdate", () => {
            refreshDisplayedBalance();
        });
    }

    function showResultBanner(text, kind) {
        els.resultBanner.textContent = text;
        els.resultBanner.className = kind;
        els.resultBanner.style.display = "block";
        setTimeout(() => { els.resultBanner.style.display = "none"; }, 3200);
    }

    function openAvia() {
        injectStyles();
        buildModal();
        els.modal.classList.add("show");
        window.aviaOpen = true;
        refreshDisplayedBalance();
        resizeCanvas();
        waitForSocketAndInit();
         if (typeof window.setGameStatus === "function") window.setGameStatus("Skyrunner");
    }

    function waitForSocketAndInit(attemptsLeft = 20) {
        const sock = getSocket();
        if (sock) {
            bindSocketListeners();
            sock.emit("aviaGetState");
            return;
        }
        if (attemptsLeft <= 0) {
            setMessage("Couldn't find a connection.");
            return;
        }
        setMessage("Connecting…");
        setTimeout(() => waitForSocketAndInit(attemptsLeft - 1), 250);
    }

    function closeAvia() {
        if (els.modal) els.modal.classList.remove("show");
        window.aviaOpen = false;
        if (typeof window.clearGameStatus === "function") window.clearGameStatus("Skyrunner");
    }

    window.openAvia = openAvia;
    window.closeAvia = closeAvia;

    document.addEventListener("DOMContentLoaded", () => {
        const btn = document.getElementById("aviaBtn");
        if (btn) btn.addEventListener("click", openAvia);
    });

    if (document.readyState !== "loading") {
        const btn = document.getElementById("aviaBtn");
        if (btn) btn.addEventListener("click", openAvia);
    }
})();