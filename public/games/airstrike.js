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

    function sanitizeAvatar(src) {
        if (typeof window.sanitizeAvatar === "function") return window.sanitizeAvatar(src);
        return src || "/avatars/default1.png";
    }

    let balance = 0;
    let normalBalance = 0;
    let pendingBet = 0;
    let listenersBound = false;

    let roundState = "waiting";   
    let currentMultiplier = 1;
    let crashPoint = null;
    let countdownMsLeft = 0;
    let yourBet = null;         
    let livePlayers = [];
    let leaderboard = [];
    let rafId = null;
    let countdownTimer = null;

    function injectStyles() {
        if (document.getElementById("asStyles")) return;
        const style = document.createElement("style");
        style.id = "asStyles";
        style.textContent = `
        #asModal {
        position: fixed; inset: 0; background: rgba(0, 0, 0, 0);
        display: none; align-items: center; justify-content: center;
        z-index: 2147483647;
        pointer-events: none;
        }
        #asModal.show { display: flex; }
        #asBox {
        width: 780px; max-width: 96vw; background: rgba(0, 0, 0, 0.9);
        border: 1px solid #3a3c42; border-radius: 14px;
        display: flex; overflow: auto;
        max-height: 92vh;
        min-width: 480px;
        min-height: 360px;
        resize: both;
        pointer-events: auto;
        position: relative;            
        }
        #asBox.dragging-positioned {
        position: fixed;                
        margin: 0;
        }
        #asMain { flex: 1; display: flex; flex-direction: column; min-width: 0; }
        #asHeader {
        display:flex; align-items:center; justify-content:space-between;
        padding: 14px 18px;
        cursor: move;                    
        user-select: none;
        }
        #asHeader h3 { margin:0; color:#fff; font-size:16px; }
        #asCloseBtn {
        background:none; border:none; color:#72767d; font-size:20px; cursor:pointer;
        transition: color .15s;
        }
        #asCloseBtn:hover { color:#fff; }
        #asBalanceRow {
        display:flex; align-items:center; justify-content:space-between;
        padding: 10px 18px;
        font-size: 13px; color:#b9bbbe;
        }
        #asBalanceRow b { color:#ffd700; }
        #asAccountBadge {
        font-size: 11px; padding: 2px 8px; border-radius: 10px;
        background:#2b2d31; border:1px solid #3a3c42; color:#b9bbbe;
        cursor:pointer; user-select:none;
        }
        #asAccountBadge.bonus { color:#fff; background:#FF0000; }
        #asBoardWrap { padding: 0 18px 18px; }
        #asBoard {
        position: relative; width: 100%; height: 320px;
        background: radial-gradient(ellipse at 50% 15%, #1a1010 0%, #000 70%);
        border-radius: 10px; overflow: hidden;
        }
        #asCanvas { position:absolute; inset:0; width:100%; height:100%; display:block; }
        #asCenterDisplay {
        position:absolute; top:50%; left:50%; transform:translate(-50%,-55%);
        text-align:center; pointer-events:none; z-index:3;
        }
        #asMultVal { font-size: 46px; font-weight:900; color:#fff; text-shadow:0 0 24px rgba(255,45,45,.5); }
        #asMultVal.crashed { color:#FF0000; }
        #asMultSub { margin-top:4px; font-size:12px; font-weight:800; color:#b9bbbe; letter-spacing:1px; text-transform:uppercase; }
        #asMultSub.crashed { color:#FF0000; }
        #asCountdownWrap { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); text-align:center; z-index:3; }
        #asCountdownLabel { font-size:11px; color:#b9bbbe; text-transform:uppercase; letter-spacing:2px; font-weight:700; margin-bottom:4px; }
        #asCountdownNum { font-size:40px; font-weight:900; color:#fff; }
        #asLivePlayers {
        position:absolute; top:10px; left:12px; display:flex; flex-direction:column; gap:4px;
        max-height: 90%; overflow-y:auto; z-index:3; max-width: 180px;
        }
        .as-player-chip {
        display:flex; align-items:center; gap:6px; background:rgba(0,0,0,.55);
        border:1px solid #3a3c42; border-radius:20px; padding:3px 8px 3px 3px;
        font-size:11px; color:#fff; font-weight:700;
        }
        .as-player-chip img { width:18px; height:18px; border-radius:50%; flex-shrink:0; }
        .as-player-chip.cashed { border-color:#23d160; color:#23d160; }
        #asMessage { text-align:center; color:#fff; font-size:13px; font-weight:700; min-height:18px; margin-top:8px; }
        #asControls {
        padding: 14px 18px; border-top: 1px solid #3a3c42;
        display:flex; flex-direction:column; gap:10px;
        }
        #asBetRow { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .as-chip {
            width: 40px; height: 40px; border-radius: 50%; border: 2px dashed rgba(255,255,255,0.5);
            display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:800;
            color:#fff; cursor:pointer; transition: transform .1s; flex-shrink:0; user-select:none;
        }
        .as-chip:hover { transform: scale(1.08); }
        .as-chip:active { transform: scale(0.95); }
        .as-chip[data-v="5"]   { background:#3b6ea5; }
        .as-chip[data-v="25"]  { background:#2f8f4e; }
        .as-chip[data-v="100"] { background:#1e1f22; border-color:#FF0000; color:#FF0000; }
        .as-chip[data-v="500"] { background:#6b21a8; }
        #asClearBetBtn {
        background:#40444b; border:none; color:#fff; padding:8px 12px; border-radius:8px;
        cursor:pointer; font-size:12px; margin-left:auto;
        }
        #asCurrentBet { color:#ffd700; font-weight:800; font-size:13px; }
        #asActionBtn {
        background:#FF0000; border:none; color:#fff; padding:12px 0; border-radius:8px;
        cursor:pointer; font-size:14px; font-weight:700; transition: filter .15s, opacity .15s, background .15s;
        }
        #asActionBtn:hover { filter:brightness(1.15); }
        #asActionBtn:disabled { opacity:.35; cursor:not-allowed; filter:none; }
        #asActionBtn.cashout { background:#ffd23f; color:#221900; }
        #asActionBtn.waiting-locked { background:#40444b; color:#b9bbbe; }

        #asLeaderboard {
        width: 220px; flex-shrink:0; border-left:1px solid #3a3c42;
        display:flex; flex-direction:column; background: rgba(0,0,0,0.35);
        }
        #asLeaderboard h4 {
        margin:0; padding:14px 16px 10px; color:#fff; font-size:13px;
        text-transform:uppercase; letter-spacing:.5px; border-bottom:1px solid #3a3c42;
        }
        #asLeaderboardList { flex:1; overflow-y:auto; padding: 8px; display:flex; flex-direction:column; gap:6px; }
        .as-lb-row {
        display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:8px;
        background:#1e1f22; border:1px solid #2b2d31;
        }
        .as-lb-rank { width:16px; font-size:11px; font-weight:800; color:#72767d; flex-shrink:0; text-align:center; }
        .as-lb-row:nth-child(1) .as-lb-rank { color:#ffd700; }
        .as-lb-row:nth-child(2) .as-lb-rank { color:#c0c0c0; }
        .as-lb-row:nth-child(3) .as-lb-rank { color:#cd7f32; }
        .as-lb-avatar { width:26px; height:26px; border-radius:50%; flex-shrink:0; object-fit:cover; }
        .as-lb-name { flex:1; min-width:0; font-size:12px; color:#e6e6e7; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .as-lb-mult { font-size:12px; font-weight:800; color:#23d160; flex-shrink:0; }
        #asLeaderboardEmpty { color:#72767d; font-size:12px; text-align:center; padding:20px 10px; }

        @media (max-width: 640px) {
          #asBox { flex-direction: column; max-height: 94vh; }
          #asLeaderboard { width:100%; border-left:none; border-top:1px solid #3a3c42; max-height:180px; }
        }
        `;
        document.head.appendChild(style);
    }

    let els = {};

    function buildModal() {
        if (document.getElementById("asModal")) return;

        const modal = document.createElement("div");
        modal.id = "asModal";
        modal.innerHTML = `
        <div id="asBox">
          <div id="asMain">
            <div id="asHeader">
              <h3>✈️ Airstrike</h3>
              <button id="asCloseBtn">✕</button>
            </div>
            <div id="asBalanceRow">
              <span>Balance: <b id="asBalanceVal">0 chips</b></span>
              <span id="asAccountBadge">Normal</span>
            </div>
            <div id="asBoardWrap">
              <div id="asBoard">
                <div id="asLivePlayers"></div>
                <canvas id="asCanvas"></canvas>
                <div id="asCountdownWrap">
                  <div id="asCountdownLabel">Next round in</div>
                  <div id="asCountdownNum">5.0</div>
                </div>
                <div id="asCenterDisplay" style="display:none;">
                  <div id="asMultVal">1.00x</div>
                  <div id="asMultSub">FLYING</div>
                </div>
              </div>
              <div id="asMessage"></div>
            </div>
            <div id="asControls">
              <div id="asBetRow">
                <span style="color:#b9bbbe; font-size:12px;">Bet:</span>
                <div class="as-chip" data-v="1">1</div>
                <div class="as-chip" data-v="5">5</div>
                <div class="as-chip" data-v="25">25</div>
                <div class="as-chip" data-v="100">100</div>
                <div class="as-chip" data-v="500">500</div>
                <span id="asCurrentBet">0</span>
                <button id="asClearBetBtn">Clear</button>
              </div>
              <button id="asActionBtn">Place Bet</button>
            </div>
          </div>
          <div id="asLeaderboard">
            <h4>🏆 Top Multipliers</h4>
            <div id="asLeaderboardList"><div id="asLeaderboardEmpty">No data yet</div></div>
          </div>
        </div>
        `;
        document.body.appendChild(modal);

        els = {
            modal,
            closeBtn: document.getElementById("asCloseBtn"),
            balanceVal: document.getElementById("asBalanceVal"),
            accountBadge: document.getElementById("asAccountBadge"),
            board: document.getElementById("asBoard"),
            canvas: document.getElementById("asCanvas"),
            centerDisplay: document.getElementById("asCenterDisplay"),
            multVal: document.getElementById("asMultVal"),
            multSub: document.getElementById("asMultSub"),
            countdownWrap: document.getElementById("asCountdownWrap"),
            countdownNum: document.getElementById("asCountdownNum"),
            livePlayers: document.getElementById("asLivePlayers"),
            message: document.getElementById("asMessage"),
            betRow: document.getElementById("asBetRow"),
            clearBetBtn: document.getElementById("asClearBetBtn"),
            currentBet: document.getElementById("asCurrentBet"),
            actionBtn: document.getElementById("asActionBtn"),
            leaderboardList: document.getElementById("asLeaderboardList"),
        };

        els.ctx = els.canvas.getContext("2d");

        els.closeBtn.onclick = () => {
            closeAirstrike();
            if (window.openGamesMenu) window.openGamesMenu();
        };
       
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && modal.classList.contains("show")) closeAirstrike();
        });

        els.betRow.querySelectorAll(".as-chip").forEach((chip) => {
            chip.onclick = () => {
                if (roundState !== "waiting" || yourBet) return;
                const v = parseInt(chip.dataset.v, 10);
                if (v > balance - pendingBet) return;
                pendingBet += v;
                renderBet();
            };
        });

        els.clearBetBtn.onclick = () => {
            if (roundState !== "waiting" || yourBet) return;
            pendingBet = 0;
            renderBet();
        };

        els.actionBtn.onclick = () => {
            const socket = getSocket();
            if (!socket) return;

            if (roundState === "waiting" && !yourBet) {
                if (pendingBet <= 0 || pendingBet > balance) return;
                socket.emit("airstrikeBet", { amount: pendingBet, account: getAccount() });
            } else if (roundState === "flying" && yourBet && !yourBet.cashedOutAt) {
                socket.emit("airstrikeCashout");
            }
        };

        els.accountBadge.onclick = () => {
            const next = getAccount() === "bonus" ? "normal" : "bonus";
            if (window.setSelectedAccount) window.setSelectedAccount(next);
            else window.selectedAccount = next;
            refreshDisplayedBalance();
        };

      
    (function makeDraggable() {
        let dragging = false;
        let startX = 0, startY = 0, startLeft = 0, startTop = 0;

        els.header = document.getElementById("asHeader");

        els.header.addEventListener("mousedown", (e) => {
            if (e.target.id === "asCloseBtn") return;
            dragging = true;

            const rect = els.box ? els.box.getBoundingClientRect() : document.getElementById("asBox").getBoundingClientRect();
            const box = document.getElementById("asBox");
            els.box = box;

            if (!box.classList.contains("dragging-positioned")) {
                box.classList.add("dragging-positioned");
                box.style.left = rect.left + "px";
                box.style.top = rect.top + "px";
            }

            startX = e.clientX;
            startY = e.clientY;
            startLeft = rect.left;
            startTop = rect.top;

            document.body.style.userSelect = "none";
            e.preventDefault();
        });

        document.addEventListener("mousemove", (e) => {
            if (!dragging || !els.box) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            const maxLeft = window.innerWidth - 60;
            const maxTop = window.innerHeight - 40;
            const newLeft = Math.min(Math.max(startLeft + dx, -els.box.offsetWidth + 60), maxLeft);
            const newTop = Math.min(Math.max(startTop + dy, 0), maxTop);

            els.box.style.left = newLeft + "px";
            els.box.style.top = newTop + "px";
        });

        document.addEventListener("mouseup", () => {
            if (dragging) {
                dragging = false;
                document.body.style.userSelect = "";
            }
        });
})();

        window.addEventListener("resize", resizeCanvas);
        resizeCanvas();
        renderBet();
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
        els.actionBtn.classList.remove("cashout", "waiting-locked");

        if (roundState === "waiting") {
            if (yourBet) {
                els.actionBtn.textContent = "Bet Placed - Waiting…";
                els.actionBtn.classList.add("waiting-locked");
                els.actionBtn.disabled = true;
            } else {
                els.actionBtn.textContent = "Place Bet";
                els.actionBtn.disabled = pendingBet <= 0 || pendingBet > balance;
            }
        } else if (roundState === "flying") {
            if (yourBet && !yourBet.cashedOutAt) {
                els.actionBtn.textContent = `Cash Out (${currentMultiplier.toFixed(2)}x)`;
                els.actionBtn.classList.add("cashout");
                els.actionBtn.disabled = false;
            } else if (yourBet && yourBet.cashedOutAt) {
                els.actionBtn.textContent = `Cashed Out at ${yourBet.cashedOutAt.toFixed(2)}x ✓`;
                els.actionBtn.classList.add("waiting-locked");
                els.actionBtn.disabled = true;
            } else {
                els.actionBtn.textContent = "Round in progress…";
                els.actionBtn.classList.add("waiting-locked");
                els.actionBtn.disabled = true;
            }
        } else {
            els.actionBtn.textContent = "Place Bet";
            els.actionBtn.classList.add("waiting-locked");
            els.actionBtn.disabled = true;
        }
    }

    function setMessage(text) {
        if (els.message) els.message.textContent = text || "";
    }

    function renderLivePlayers() {
        if (!els.livePlayers) return;
        els.livePlayers.innerHTML = "";
        livePlayers.forEach(p => {
            const chip = document.createElement("div");
            chip.className = "as-player-chip" + (p.cashedOutAt ? " cashed" : "");
            const img = document.createElement("img");
            img.src = sanitizeAvatar(p.avatar);
            const label = document.createElement("span");
            label.textContent = p.cashedOutAt
                ? `${p.username} · ${p.cashedOutAt.toFixed(2)}x`
                : `${p.username} · ${p.amount}`;
            chip.appendChild(img);
            chip.appendChild(label);
            els.livePlayers.appendChild(chip);
        });
    }

    function renderLeaderboard() {
        if (!els.leaderboardList) return;
        els.leaderboardList.innerHTML = "";
        if (!leaderboard.length) {
            els.leaderboardList.innerHTML = `<div id="asLeaderboardEmpty">No data yet</div>`;
            return;
        }
        leaderboard.forEach((entry, i) => {
            const row = document.createElement("div");
            row.className = "as-lb-row";

            const rank = document.createElement("div");
            rank.className = "as-lb-rank";
            rank.textContent = "#" + (i + 1);

            const avatar = document.createElement("img");
            avatar.className = "as-lb-avatar";
            avatar.src = sanitizeAvatar(entry.avatar);

            const name = document.createElement("div");
            name.className = "as-lb-name";
            name.textContent = entry.username;

            const mult = document.createElement("div");
            mult.className = "as-lb-mult";
            mult.textContent = entry.multiplier.toFixed(2) + "x";

            row.appendChild(rank);
            row.appendChild(avatar);
            row.appendChild(name);
            row.appendChild(mult);
            els.leaderboardList.appendChild(row);
        });
    }

   
    let flightStartClient = 0;

    function curveY(progress) {
        return Math.pow(progress, 1.6);
    }

    function drawFrame() {
        if (!els.ctx || !els.modal || !els.modal.classList.contains("show")) {
            rafId = requestAnimationFrame(drawFrame);
            return;
        }

        const w = els.canvas.clientWidth, h = els.canvas.clientHeight;
        els.ctx.clearRect(0, 0, w, h);

        if (roundState === "flying" || roundState === "crashed") {
            const elapsed = Math.max(0, (Date.now() - flightStartClient) / 1000);
            const progress = Math.min(elapsed / 12, 1);

            const padding = 30;
            const usableW = w - padding * 1.4;
            const usableH = h - padding * 1.6;
            const pts = [];
            const steps = 60;
            for (let i = 0; i <= steps; i++) {
                const t = (i / steps) * progress;
                const x = padding * 0.6 + t * usableW;
                const y = h - padding * 0.9 - curveY(t) * usableH;
                pts.push([x, y]);
            }

            if (pts.length > 1) {
                els.ctx.beginPath();
                els.ctx.moveTo(pts[0][0], h - padding * 0.9);
                pts.forEach(p => els.ctx.lineTo(p[0], p[1]));
                els.ctx.lineTo(pts[pts.length - 1][0], h - padding * 0.9);
                els.ctx.closePath();
                const grad = els.ctx.createLinearGradient(0, 0, 0, h);
                const crashedNow = roundState === "crashed";
                if (crashedNow) {
                    grad.addColorStop(0, "rgba(255,45,45,0.32)");
                    grad.addColorStop(1, "rgba(255,45,45,0.02)");
                } else {
                    grad.addColorStop(0, "rgba(35,209,96,0.28)");
                    grad.addColorStop(1, "rgba(35,209,96,0.02)");
                }
                els.ctx.fillStyle = grad;
                els.ctx.fill();

                els.ctx.beginPath();
                pts.forEach((p, i) => i === 0 ? els.ctx.moveTo(p[0], p[1]) : els.ctx.lineTo(p[0], p[1]));
                els.ctx.strokeStyle = crashedNow ? "#ff2d2d" : "#23d160";
                els.ctx.lineWidth = 3;
                els.ctx.lineCap = "round";
                els.ctx.shadowColor = crashedNow ? "rgba(255,45,45,.6)" : "rgba(35,209,96,.6)";
                els.ctx.shadowBlur = 12;
                els.ctx.stroke();
                els.ctx.shadowBlur = 0;

                const [tx, ty] = pts[pts.length - 1];
                els.ctx.font = "22px serif";
                els.ctx.textAlign = "center";
                els.ctx.textBaseline = "middle";
                els.ctx.fillText(crashedNow ? "💥" : "✈️", tx, ty);
            }
        }

        rafId = requestAnimationFrame(drawFrame);
    }
    rafId = requestAnimationFrame(drawFrame);

   
    function applyState(state) {
        const prevRoundState = roundState;
        roundState = state.state;
        currentMultiplier = state.multiplier;
        crashPoint = state.crashPoint;
        countdownMsLeft = state.countdownMsLeft || 0;
        yourBet = state.yourBet;
        livePlayers = state.players || [];

        if (typeof state.balance === "number") normalBalance = state.balance;
        refreshDisplayedBalance();

        if (roundState === "flying" && prevRoundState !== "flying") {
            flightStartClient = Date.now();
        }

        if (roundState === "waiting") {
            els.countdownWrap.style.display = "block";
            els.centerDisplay.style.display = "none";
            const secs = Math.max(0, countdownMsLeft / 1000);
            els.countdownNum.textContent = secs.toFixed(1);
            setMessage("");
        } else {
            els.countdownWrap.style.display = "none";
            els.centerDisplay.style.display = "block";
            els.multVal.textContent = currentMultiplier.toFixed(2) + "x";
            els.multVal.classList.toggle("crashed", roundState === "crashed");
            els.multSub.textContent = roundState === "crashed" ? "CRASHED" : "FLYING";
            els.multSub.classList.toggle("crashed", roundState === "crashed");

            if (roundState === "crashed" && prevRoundState !== "crashed") {
                if (yourBet && !yourBet.cashedOutAt) {
                    setMessage(`💥 Crashed at ${crashPoint.toFixed(2)}x - lost ${yourBet.amount}`);
                } else {
                    setMessage(`💥 Crashed at ${crashPoint.toFixed(2)}x`);
                }
            }
        }

        renderLivePlayers();
        updateActionButton();
    }

    function localCountdownTick() {
        clearInterval(countdownTimer);
        countdownTimer = setInterval(() => {
            if (roundState !== "waiting") return;
            countdownMsLeft = Math.max(0, countdownMsLeft - 100);
            els.countdownNum.textContent = (countdownMsLeft / 1000).toFixed(1);
        }, 100);
    }

   
    function bindSocketListeners() {
        const socket = getSocket();
        if (!socket || listenersBound) return;
        listenersBound = true;

        socket.on("airstrikeState", (state) => {
            applyState(state);
        });

        socket.on("airstrikeCashoutResult", (data) => {
            if (data.account !== "bonus" && typeof data.balance === "number") {
                normalBalance = data.balance;
            }
            refreshDisplayedBalance();
            setMessage(`✅ Cashed out at ${data.multiplier.toFixed(2)}x - +${data.payoutChips}`);
        });

        socket.on("airstrikeError", (data) => {
            setMessage(data?.msg || "Something went wrong.");
        });

        socket.on("airstrikeLeaderboardState", (data) => {
            leaderboard = data?.leaders || [];
            renderLeaderboard();
        });

        socket.on("bonusUpdate", () => {
            refreshDisplayedBalance();
        });

    
    }

    function openAirstrike() {
        injectStyles();
        buildModal();
        els.modal.classList.add("show");
        window.airstrikeOpen = true;
        pendingBet = 0;
        renderBet();
        refreshDisplayedBalance();
        resizeCanvas();
        localCountdownTick(); 
        waitForSocketAndInit();
        if (typeof window.setGameStatus === "function") window.setGameStatus("Airstrike");
    }

    function waitForSocketAndInit(attemptsLeft = 20) {
        const sock = getSocket();
        if (sock) {
            bindSocketListeners();
            sock.emit("airstrikeGetState");
            sock.emit("airstrikeLeaderboardGet");
            return;
        }
        if (attemptsLeft <= 0) {
            setMessage("Couldn't find a connection.");
            return;
        }
        setMessage("Connecting…");
        setTimeout(() => waitForSocketAndInit(attemptsLeft - 1), 250);
    }

    function closeAirstrike() {
        if (els.modal) els.modal.classList.remove("show");
        window.airstrikeOpen = false;
        clearInterval(countdownTimer);
        if (typeof window.clearGameStatus === "function") window.clearGameStatus("Airstrike");
    }

    window.openAirstrike = openAirstrike;
    window.closeAirstrike = closeAirstrike;

    document.addEventListener("DOMContentLoaded", () => {
        const btn = document.getElementById("airstrikeBtn");
        if (btn) btn.addEventListener("click", openAirstrike);
    });

    if (document.readyState !== "loading") {
        const btn = document.getElementById("airstrikeBtn");
        if (btn) btn.addEventListener("click", openAirstrike);
    }
})();


