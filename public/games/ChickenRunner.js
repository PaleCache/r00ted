(function () {
  
    const DIFFICULTIES = {
        easy:   { lanes: 24, mults: buildMults(24, 1.02, 1.055) },
        medium: { lanes: 20, mults: buildMults(20, 1.08, 1.13) },
        hard:   { lanes: 16, mults: buildMults(16, 1.20, 1.24) },
    };
    function buildMults(n, start, growth) {
        const arr = [];
        let m = start;
        for (let i = 0; i < n; i++) {
            arr.push(Math.round(m * 100) / 100);
            m *= growth;
        }
        return arr;
    }

    let currentDifficulty = "medium";
    let leaderboardData = [];
    let recentBets = [];

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
    let laneIndex = -1;     
    let inRound = false;
    let cashedOut = false;
    function injectStyles() {
        if (document.getElementById("ccStyles")) return;
        const style = document.createElement("style");
        style.id = "ccStyles";
        style.textContent = `
        #ccModal {
        position: fixed; inset: 0; background: rgba(0, 0, 0, 0);
        display: none; align-items: center; justify-content: center;
        z-index: 30500;
        }
        #ccModal.show { display: flex; }
        #ccBox {
        width: 860px; max-width: 96vw; background: rgba(0, 0, 0, 0.875);
        border: 1px solid #3a3c42; border-radius: 14px;
        display: flex; flex-direction: row; overflow: hidden;
        position: fixed;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        min-width: 640px;
        min-height: 420px;
        box-sizing: border-box;
        }
        #ccMain { display: flex; flex-direction: column; flex: 1; min-width: 0; }
        #ccHeader {
        display:flex; align-items:center; justify-content:space-between;
        padding: 14px 18px;
        cursor: grab;
        }
        #ccHeader:active { cursor: grabbing; }
        #ccHeader h3 { margin:0; color:#fff; font-size:16px; }
        #ccCloseBtn {
        background:none; border:none; color:#72767d; font-size:20px; cursor:pointer;
        transition: color .15s;
        }
        #ccCloseBtn:hover { color:#fff; }
        #ccBalanceRow {
        display:flex; align-items:center; justify-content:space-between;
        padding: 10px 18px; rgba(0, 0, 0, 0.875);
        font-size: 13px; color:#b9bbbe;
        }
        #ccBalanceRow b { color:#ffd700; }
        #ccAccountBadge {
        font-size: 11px; padding: 2px 8px; border-radius: 10px;
        background:#2b2d31; border:1px solid #3a3c42; color:#b9bbbe;
        cursor:pointer; user-select:none;
        }
        #ccAccountBadge.bonus { color:#fff; background:#FF0000; }
        #ccBoardWrap {
        padding: 18px;
        background: radial-gradient(ellipse at center, #0a0a0a 0%, #000000 100%);
        }
        #ccBoard {
            position: relative;
            width: 100%;
            height: 420px;              
            background: linear-gradient(180deg, #3a3a3f 0%, #2c2c30 50%, #232326 100%);
            border-radius: 10px;
            overflow: hidden;
            display: flex;
            flex-direction: column;      
            align-items: stretch;
            box-shadow: inset 0 0 40px rgba(0,0,0,0.6);
        }
        #ccBoard::before {
            content: "";
            position: absolute;
            left: 0;
            right: 0;
            top: 50%;
            height: 4px;
            transform: translateY(-50%);
            background: rgba(255, 220, 80, 0.55);
            z-index: 1;
        }

        #ccBoard::after {
            display: none;
        }
        .cc-lane {
            position: relative;
            flex: 1;
            min-height: 0;
            border-bottom: 1px solid rgba(255,255,255,0.06);  
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .cc-lane-mult {
            position: absolute;
            left: 8px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 10px;
            font-weight: 800;
            color: #fff;
            opacity: .6;
            text-shadow: 0 1px 2px rgba(0,0,0,0.8);
            z-index: 3;
        }
        .cc-lane.done .cc-lane-mult { opacity: 1; color:#ffd700; }
        .cc-lane.current { background: rgba(255,255,255,0.08); }
        .cc-lane.crashed { background: rgba(255,0,0,0.28); }

        .cc-chicken {
            position: absolute;
            left: 50%;
            top: -30px;
            width: 38px;
            height: 38px;
            font-size: 30px;
            line-height: 38px;
            text-align: center;
            filter: drop-shadow(0 3px 3px rgba(0,0,0,0.6));
            transition: top .28s cubic-bezier(.34,1.56,.64,1);
            transform: translateX(-50%) scaleX(-1);
            z-index: 6;
        }

        .cc-chicken.hopping { animation: ccHop .28s ease; }
        .cc-chicken.hit { animation: ccHit .5s ease forwards; }

        @keyframes ccHop {
            0%   { transform: translateX(-50%) translateY(0) scaleX(-1) scale(1); }
            40%  { transform: translateX(-50%) translateY(-14px) scaleX(-1) scale(1.05); }
            100% { transform: translateX(-50%) translateY(0) scaleX(-1) scale(1); }
        }

        @keyframes ccHit {
            0%   { transform: translateX(-50%) translateY(0) rotate(0deg) scaleX(-1); opacity: 1; }
            30%  { transform: translateX(-50%) translateY(-12px) rotate(25deg) scaleX(-1); }
            100% { transform: translateX(-50%) translateY(30px) rotate(140deg) scaleX(-1); opacity: 0; }
        }


        .cc-car {
            position: absolute;
            width: 46px;
            height: 24px;
            z-index: 5;
            pointer-events: none;
            filter: drop-shadow(0 3px 3px rgba(0,0,0,0.5));
        }
        .cc-car svg { width: 100%; height: 100%; display: block; }

        .cc-car.driving-right { animation: ccCarRight var(--cc-car-dur, 0.9s) linear forwards; }
        .cc-car.driving-left  { animation: ccCarLeft  var(--cc-car-dur, 0.9s) linear forwards; transform: scaleX(-1); }

        @keyframes ccCarRight {
            from { left: -60px; }
            to   { left: 105%; }
        }
        @keyframes ccCarLeft {
            from { left: 105%; }
            to   { left: -60px; }
        }
        #ccMessage {
        text-align:center; color:#fff; font-size:14px; font-weight:700; min-height:20px;
        margin-top:10px;
        }
        #ccControls {
        padding: 14px 18px; border-top: 1px solid #3a3c42; rgba(0, 0, 0, 0.875);
        display:flex; flex-direction:column; gap:10px;
        }
        #ccDifficultyRow { display:flex; align-items:center; gap:8px; }
        .cc-diff {
        padding: 6px 12px; border-radius: 8px; font-size:12px; font-weight:700;
        background:#2b2d31; border:1px solid #3a3c42; color:#b9bbbe; cursor:pointer;
        }
        .cc-diff.active { background:#FF0000; color:#fff; border-color:#FF0000; }
        .cc-diff:disabled, .cc-diff[disabled] { opacity:.4; cursor:not-allowed; }
        #ccBetRow { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .cc-chip {
            width: 42px; height: 42px; border-radius: 50%; border: 2px dashed rgba(255,255,255,0.5);
            display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:800;
            color:#fff; cursor:pointer; transition: transform .1s; flex-shrink:0; user-select:none;
        }
        .cc-chip:hover { transform: scale(1.08); }
        .cc-chip:active { transform: scale(0.95); }
        .cc-chip[data-v="1"]   { background:#40444b; }
        .cc-chip[data-v="5"]   { background:#3b6ea5; }
        .cc-chip[data-v="25"]  { background:#2f8f4e; }
        .cc-chip[data-v="100"] { background:#1e1f22; border-color:#FF0000; color:#FF0000; }
        .cc-chip[data-v="500"] { background:#6b21a8; }
        #ccClearBetBtn {
        background:#40444b; border:none; color:#fff; padding:8px 12px; border-radius:8px;
        cursor:pointer; font-size:12px; margin-left:auto;
        }
        #ccCurrentBet { color:#ffd700; font-weight:800; font-size:13px; }
        #ccActionRow { display:flex; gap:10px; }
        #ccStartBtn, #ccHopBtn, #ccCashoutBtn {
        flex:1; background:#FF0000; border:none; color:#fff; padding:12px 0; border-radius:8px;
        cursor:pointer; font-size:14px; font-weight:700; transition: filter .15s, opacity .15s;
        }
        #ccCashoutBtn { background:#23d160; }
        #ccStartBtn:hover, #ccHopBtn:hover, #ccCashoutBtn:hover { filter:brightness(1.15); }
        #ccStartBtn:disabled, #ccHopBtn:disabled, #ccCashoutBtn:disabled { opacity:.35; cursor:not-allowed; filter:none; }

        #ccResizeHandle {
        position: absolute;
        bottom: 0; right: 0;
        width: 18px; height: 18px;
        background: linear-gradient(135deg, transparent 50%, rgba(73,73,73,1) 50%);
        cursor: nwse-resize;
        z-index: 100;
        border-radius: 0 0 14px 0;
        }
        #ccSidebar {
          width: 200px; flex-shrink: 0; border-left: 1px solid #3a3c42;
          display: flex; flex-direction: column; background: rgba(0,0,0,0.35);
        }
        #ccSidebar h4 {
          margin:0; padding:14px 16px 10px; color:#fff; font-size:13px;
          text-transform:uppercase; letter-spacing:.5px; border-bottom:1px solid #3a3c42;
        }
        #ccLeaderboardList { flex:1; overflow-y:auto; padding: 8px; display:flex; flex-direction:column; gap:6px; }
        .cc-lb-row {
          display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:8px;
          background:#1e1f22; border:1px solid #2b2d31;
        }
        .cc-lb-rank { width:16px; font-size:11px; font-weight:800; color:#72767d; flex-shrink:0; text-align:center; }
        .cc-lb-row:nth-child(1) .cc-lb-rank { color:#ffd700; }
        .cc-lb-row:nth-child(2) .cc-lb-rank { color:#c0c0c0; }
        .cc-lb-row:nth-child(3) .cc-lb-rank { color:#cd7f32; }
        .cc-lb-avatar { width:26px; height:26px; border-radius:50%; flex-shrink:0; object-fit:cover; }
        .cc-lb-namecol { flex:1; min-width:0; display:flex; flex-direction:column; gap:1px; }
        .cc-lb-name { font-size:12px; color:#e6e6e7; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .cc-lb-mult { font-size:10.5px; color:#72767d; font-weight:600; }
        .cc-lb-payout { font-size:11px; font-weight:800; color:#23d160; flex-shrink:0; }
        .cc-empty { color:#72767d; font-size:12px; text-align:center; padding:20px 10px; }

        #ccBetToastWrap {
          position:absolute; top:8px; right:8px; z-index:20;
          display:flex; flex-direction:column; gap:6px; align-items:flex-end;
          pointer-events:none;
        }
        .cc-bet-toast {
          display:flex; align-items:center; gap:8px;
          background:rgba(0,0,0,0.8); border:1px solid #3a3c42; border-radius:20px;
          padding:5px 12px 5px 5px; font-size:11.5px; color:#fff;
          animation: ccToastIn .2s ease-out;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        }
 
        .cc-bet-toast.leaving { animation: ccToastOut .3s ease-in forwards; }
        .cc-bet-toast img { width:22px; height:22px; border-radius:50%; flex-shrink:0; }
        .cc-bet-toast .cc-toast-mult { font-weight:800; }
        .cc-bet-toast .cc-toast-mult.win { color:#23d160; }
        .cc-bet-toast .cc-toast-mult.loss { color:#ff5555; }
        @keyframes ccToastIn { from { opacity:0; transform: translateX(20px); } to { opacity:1; transform: translateX(0); } }
        @keyframes ccToastOut { from { opacity:1; transform: translateX(0); } to { opacity:0; transform: translateX(20px); } }

        @media (max-width: 640px) {
          #ccBox { flex-direction: column; max-height: 94vh; }
          #ccSidebar { width:100%; border-left:none; border-top:1px solid #3a3c42; max-height:180px; }
        }
        `;
        document.head.appendChild(style);
    }

  
    function setupChickenDragResize() {
        const box = document.getElementById("ccBox");
        const header = document.getElementById("ccHeader");
        const resizeHandle = document.getElementById("ccResizeHandle");
        if (!box || box.dataset.dragSetup) return;
        box.dataset.dragSetup = "true";

        let isDragging = false, isResizing = false;
        let startX, startY, startLeft, startTop, startWidth, startHeight;

        header.addEventListener("mousedown", (e) => {
            if (e.target.closest("button")) return;
            isDragging = true;
            const rect = box.getBoundingClientRect();
            startX = e.clientX; startY = e.clientY;
            startLeft = rect.left; startTop = rect.top;
            box.style.left = rect.left + "px";
            box.style.top = rect.top + "px";
            box.style.transform = "none";
            e.preventDefault();
        });

        resizeHandle.addEventListener("mousedown", (e) => {
            isResizing = true;
            const rect = box.getBoundingClientRect();
            startX = e.clientX; startY = e.clientY;
            startWidth = rect.width; startHeight = rect.height;
            e.preventDefault();
            e.stopPropagation();
        });

        document.addEventListener("mousemove", (e) => {
            if (isDragging) {
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                let left = startLeft + dx;
                let top = startTop + dy;
                left = Math.max(0, Math.min(left, window.innerWidth - box.offsetWidth));
                top = Math.max(0, Math.min(top, window.innerHeight - box.offsetHeight));
                box.style.left = left + "px";
                box.style.top = top + "px";
            }
            if (isResizing) {
                const rect = box.getBoundingClientRect();
                const maxWidth = Math.max(640, window.innerWidth - rect.left);
                const maxHeight = Math.max(420, window.innerHeight - rect.top);
                box.style.width = Math.max(640, Math.min(startWidth + (e.clientX - startX), maxWidth)) + "px";
                box.style.height = Math.max(420, Math.min(startHeight + (e.clientY - startY), maxHeight)) + "px";
            }
        });

        document.addEventListener("mouseup", () => {
            isDragging = false;
            isResizing = false;
        });
    }

    let els = {};

    function buildModal() {
        if (document.getElementById("ccModal")) return;

        const modal = document.createElement("div");
        modal.id = "ccModal";
        modal.innerHTML = `
        <div id="ccBox">
          <div id="ccResizeHandle"></div>
          <div id="ccMain">
            <div id="ccHeader">
              <h3>🐔 Chicken Runner</h3>
              <button id="ccCloseBtn">✕</button>
            </div>
            <div id="ccBalanceRow">
              <span>Balance: <b id="ccBalanceVal">0 chips</b></span>
              <span id="ccAccountBadge">Normal</span>
            </div>
            <div id="ccBoardWrap">
              <div id="ccBoard">
                <div id="ccBetToastWrap"></div>
              </div>
              <div id="ccMessage"></div>
            </div>
            <div id="ccControls">
              <div id="ccDifficultyRow">
                <span style="color:#b9bbbe; font-size:12px;">Difficulty:</span>
                <button class="cc-diff" data-d="easy">Easy</button>
                <button class="cc-diff active" data-d="medium">Medium</button>
                <button class="cc-diff" data-d="hard">Hard</button>
              </div>
              <div id="ccBetRow">
                <span style="color:#b9bbbe; font-size:12px;">Bet:</span>
                <div class="cc-chip" data-v="1">1</div>
                <div class="cc-chip" data-v="5">5</div>
                <div class="cc-chip" data-v="25">25</div>
                <div class="cc-chip" data-v="100">100</div>
                <div class="cc-chip" data-v="500">500</div>
                <span id="ccCurrentBet">0</span>
                <button id="ccClearBetBtn">Clear</button>
              </div>
              <div id="ccActionRow">
                <button id="ccStartBtn">Start</button>
                <button id="ccHopBtn" disabled>Hop</button>
                <button id="ccCashoutBtn" disabled>Cash Out</button>
              </div>
            </div>
          </div>
          <div id="ccSidebar">
            <h4>🏆 Top Wins</h4>
            <div id="ccLeaderboardList"><div class="cc-empty">No data yet</div></div>
          </div>
        </div>
        `;
        document.body.appendChild(modal);

        els = {
            modal,
            closeBtn: document.getElementById("ccCloseBtn"),
            balanceVal: document.getElementById("ccBalanceVal"),
            accountBadge: document.getElementById("ccAccountBadge"),
            board: document.getElementById("ccBoard"),
            message: document.getElementById("ccMessage"),
            betRow: document.getElementById("ccBetRow"),
            clearBetBtn: document.getElementById("ccClearBetBtn"),
            currentBet: document.getElementById("ccCurrentBet"),
            startBtn: document.getElementById("ccStartBtn"),
            hopBtn: document.getElementById("ccHopBtn"),
            cashoutBtn: document.getElementById("ccCashoutBtn"),
            leaderboardList: document.getElementById("ccLeaderboardList"),
            betToastWrap: document.getElementById("ccBetToastWrap"),
            diffBtns: Array.from(document.querySelectorAll(".cc-diff")),
        };

        els.closeBtn.onclick = () => {
            closeChicken();
            if (window.openGamesMenu) window.openGamesMenu();
        };

        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && modal.classList.contains("show")) closeChicken();
        });

        els.betRow.querySelectorAll(".cc-chip").forEach((chip) => {
            chip.onclick = () => {
                if (inRound) return;
                const v = parseInt(chip.dataset.v, 10);
                if (v > balance - pendingBet) return;
                pendingBet += v;
                renderBet();
            };
        });

        els.clearBetBtn.onclick = () => {
            if (inRound) return;
            pendingBet = 0;
            renderBet();
        };

        els.diffBtns.forEach((btn) => {
            btn.onclick = () => {
                if (inRound) return;
                currentDifficulty = btn.dataset.d;
                els.diffBtns.forEach((b) => b.classList.toggle("active", b === btn));
                buildLanes();
            };
        });

        els.startBtn.onclick = () => {
            const socket = getSocket();
            if (!socket || pendingBet <= 0 || pendingBet > balance || inRound) return;
            socket.emit("chickenStart", { amount: pendingBet, account: getAccount(), difficulty: currentDifficulty });
        };

        els.hopBtn.onclick = () => {
            const socket = getSocket();
            if (!socket || !inRound) return;
            socket.emit("chickenHop");
        };

        els.cashoutBtn.onclick = () => {
            const socket = getSocket();
            if (!socket || !inRound) return;
            socket.emit("chickenCashout");
        };

        els.accountBadge.onclick = () => {
            if (inRound) return;
            const next = getAccount() === "bonus" ? "normal" : "bonus";
            if (window.setSelectedAccount) window.setSelectedAccount(next);
            else window.selectedAccount = next;
            refreshDisplayedBalance();
        };

        buildLanes();
        renderBet();
        setupChickenDragResize();
    }

    function buildLanes() {
    els.board.querySelectorAll(".cc-lane, .cc-car").forEach((l) => l.remove());
    const toastWrap = els.betToastWrap;
    const { lanes, mults } = DIFFICULTIES[currentDifficulty];
    for (let i = 0; i < lanes; i++) {
        const lane = document.createElement("div");
        lane.className = "cc-lane";
        lane.id = `ccLane${i}`;
        const mult = document.createElement("div");
        mult.className = "cc-lane-mult";
        mult.textContent = `${mults[i]}x`;
        lane.appendChild(mult);
        els.board.insertBefore(lane, toastWrap);
    }
    let chicken = document.getElementById("ccChicken");
    if (!chicken) {
        chicken = document.createElement("div");
        chicken.className = "cc-chicken";
        chicken.id = "ccChicken";
        chicken.textContent = "🐓";
        els.board.appendChild(chicken);
    }
    chicken.classList.remove("hit");
    chicken.style.left = "50%";
    chicken.style.top = "-30px";
    chicken.style.bottom = "";         
    chicken.style.opacity = "1";
    laneIndex = -1;
}

    function renderBalance() {
        els.balanceVal.textContent = `${balance} chips`;
        if (els.accountBadge) {
            const acc = getAccount();
            els.accountBadge.textContent = acc === "bonus" ? "Bonus" : "Normal";
            els.accountBadge.classList.toggle("bonus", acc === "bonus");
        }
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
        els.startBtn.disabled = inRound || pendingBet <= 0 || pendingBet > balance;
        els.diffBtns.forEach((b) => (b.disabled = inRound));
        els.betRow.querySelectorAll(".cc-chip").forEach((c) => c.style.pointerEvents = inRound ? "none" : "auto");
    }

    function setRoundControls(active) {
        inRound = active;
        els.hopBtn.disabled = !active;
        els.cashoutBtn.disabled = !active;
        renderBet();
    }

    function sanitizeAvatar(src) {
        if (typeof window.sanitizeAvatar === "function") return window.sanitizeAvatar(src);
        return src || "/avatars/default1.png";
    }

    function showBetToast(bet) {
        if (!els.betToastWrap) return;

        const toast = document.createElement("div");
        toast.className = "cc-bet-toast";

        const img = document.createElement("img");
        img.src = sanitizeAvatar(bet.avatar);

        const text = document.createElement("span");
        const won = bet.payoutChips > bet.betChips;
        text.appendChild(document.createTextNode(bet.username + " · "));

        const mult = document.createElement("span");
        mult.className = "cc-toast-mult " + (won ? "win" : "loss");
        mult.textContent = `${bet.multiplier}x`;
        text.appendChild(mult);

        toast.appendChild(img);
        toast.appendChild(text);
        els.betToastWrap.appendChild(toast);
        while (els.betToastWrap.children.length > 5) {
            els.betToastWrap.removeChild(els.betToastWrap.firstChild);
        }

        setTimeout(() => {
            toast.classList.add("leaving");
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function renderLeaderboard() {
        if (!els.leaderboardList) return;
        els.leaderboardList.innerHTML = "";
        if (!leaderboardData.length) {
            els.leaderboardList.innerHTML = `<div class="cc-empty">No data yet</div>`;
            return;
        }
        leaderboardData.forEach((entry, i) => {
            const row = document.createElement("div");
            row.className = "cc-lb-row";

            const rank = document.createElement("div");
            rank.className = "cc-lb-rank";
            rank.textContent = "#" + (i + 1);

            const avatar = document.createElement("img");
            avatar.className = "cc-lb-avatar";
            avatar.src = sanitizeAvatar(entry.avatar);

            const nameCol = document.createElement("div");
            nameCol.className = "cc-lb-namecol";

            const name = document.createElement("div");
            name.className = "cc-lb-name";
            name.textContent = entry.username;

            const mult = document.createElement("div");
            mult.className = "cc-lb-mult";
            mult.textContent = `${entry.multiplier}x`;

            nameCol.appendChild(name);
            nameCol.appendChild(mult);

            const payout = document.createElement("div");
            payout.className = "cc-lb-payout";
            payout.textContent = "+" + entry.payout;

            row.appendChild(rank);
            row.appendChild(avatar);
            row.appendChild(nameCol);
            row.appendChild(payout);
            els.leaderboardList.appendChild(row);
        });
    }

    function setMessage(text) {
        els.message.textContent = text || "";
    }

function moveChickenToLane(idx, lanes) {
    const chicken = document.getElementById("ccChicken");
    if (!chicken) return;
    const boardHeight = els.board.clientHeight || 420;
    const laneHeight = boardHeight / lanes;
    const top = idx < 0 ? -30 : idx * laneHeight + laneHeight / 2 - 19;
    chicken.style.top = `${top}px`;
    chicken.style.left = "50%";
}


    const CC_CAR_SVG = `
<svg viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">
  <rect x="6" y="20" width="88" height="20" rx="6" fill="#e63946"/>
  <rect x="22" y="6" width="46" height="20" rx="6" fill="#e63946"/>
  <rect x="26" y="10" width="16" height="12" rx="2" fill="#bfe9ff"/>
  <rect x="50" y="10" width="16" height="12" rx="2" fill="#bfe9ff"/>
  <circle cx="24" cy="42" r="8" fill="#111"/>
  <circle cx="76" cy="42" r="8" fill="#111"/>
  <circle cx="24" cy="42" r="3" fill="#555"/>
  <circle cx="76" cy="42" r="3" fill="#555"/>
  <rect x="4" y="26" width="6" height="6" fill="#fff59d"/>
</svg>`;

function spawnCarAtChicken() {
    if (!els.board) return;
    const chicken = document.getElementById("ccChicken");
    if (!chicken) return;

    const chickenTop = parseFloat(chicken.style.top) || 0;
    const goingRight = Math.random() < 0.5;
    const car = document.createElement("div");
    car.className = "cc-car " + (goingRight ? "driving-right" : "driving-left");
    car.innerHTML = CC_CAR_SVG;
    const dur = 0.55 + Math.random() * 0.25;
    car.style.setProperty("--cc-car-dur", dur + "s");
    car.style.top = (chickenTop + 7) + "px";  
    car.style.left = goingRight ? "-60px" : "105%";
    els.board.appendChild(car);
    setTimeout(() => {
        chicken.classList.add("hit");
    }, dur * 1000 * 0.5);  

    setTimeout(() => car.remove(), dur * 1000 + 100);
}

    function markLaneDone(idx) {
        const lane = document.getElementById(`ccLane${idx}`);
        if (lane) lane.classList.add("done");
    }

    function markLaneCurrent(idx) {
        document.querySelectorAll(".cc-lane.current").forEach((l) => l.classList.remove("current"));
        const lane = document.getElementById(`ccLane${idx}`);
        if (lane) lane.classList.add("current");
    }

    function markLaneCrashed(idx) {
        const lane = document.getElementById(`ccLane${idx}`);
        if (lane) lane.classList.add("crashed");
    }

    function bindSocketListeners() {
        const socket = getSocket();
        if (!socket || listenersBound) return;
        listenersBound = true;

        socket.on("chickenState", (state) => {
            normalBalance = state.balance;
            if (state.difficulty && DIFFICULTIES[state.difficulty]) {
                currentDifficulty = state.difficulty;
                els.diffBtns.forEach((b) => b.classList.toggle("active", b.dataset.d === currentDifficulty));
                buildLanes();
            }
            refreshDisplayedBalance();
        });

        socket.on("bonusUpdate", () => {
            refreshDisplayedBalance();
        });

        socket.on("chickenLeaderboardState", (data) => {
            leaderboardData = data?.leaders || [];
            renderLeaderboard();
        });

        socket.on("chickenRecentBet", (entry) => {
            showBetToast(entry);
            recentBets.unshift(entry);
            if (recentBets.length > 25) recentBets = recentBets.slice(0, 25);
        });

        socket.on("chickenStarted", (data) => {
            buildLanes();
            setRoundControls(true);
            cashedOut = false;
            setMessage("Round started - hop or cash out!");
            if (data.account !== "bonus" && typeof data.balance === "number") {
                normalBalance = data.balance;
            }
            refreshDisplayedBalance();
        });

        socket.on("chickenHopResult", (data) => {
    const { lanes } = DIFFICULTIES[currentDifficulty];
    laneIndex = data.laneIndex;
    markLaneDone(laneIndex);
    moveChickenToLane(laneIndex, lanes);

    const chicken = document.getElementById("ccChicken");

    if (data.crashed) {
        markLaneCrashed(laneIndex);
        setMessage(`💥 Crashed at lane ${laneIndex + 1} - lost bet`);
        setRoundControls(false);
        spawnCarAtChicken();
        if (typeof data.balance === "number") normalBalance = data.balance;
        refreshDisplayedBalance();
        setTimeout(() => {
            const s = getSocket();
            if (s) s.emit("chickenGetState");
        }, 700);
    } else {
        if (chicken) {
            chicken.classList.remove("hopping");
            void chicken.offsetWidth; 
            chicken.classList.add("hopping");
        }
        markLaneCurrent(laneIndex);
        setMessage(`Lane ${laneIndex + 1} clear - x${data.multiplier} so far`);
        if (laneIndex >= lanes - 1) {
            setMessage(`🎉 Crossed the road! x${data.multiplier}`);
            setRoundControls(false);
        }
    }
});

        socket.on("chickenCashoutResult", (data) => {
            setMessage(`💰 Cashed out at x${data.multiplier} - +${data.payoutChips}`);
            setRoundControls(false);
            cashedOut = true;
            if (typeof data.balance === "number") normalBalance = data.balance;
            refreshDisplayedBalance();
            setTimeout(() => {
                const s = getSocket();
                if (s) s.emit("chickenGetState");
            }, 400);
        });

        socket.on("chickenError", (data) => {
            renderBet();
            setMessage(data?.msg || "Something went wrong.");
        });
    }

    function openChicken() {
        injectStyles();
        if (typeof window.setGameStatus === "function") window.setGameStatus("Chicken Runner");
        buildModal();
        els.modal.classList.add("show");
        window.chickenOpen = true;
        refreshDisplayedBalance();
        waitForSocketAndInit();
    }

    function waitForSocketAndInit(attemptsLeft = 20) {
        const sock = getSocket();
        if (sock) {
            bindSocketListeners();
            sock.emit("chickenGetState");
            sock.emit("chickenLeaderboardGet");
            return;
        }
        if (attemptsLeft <= 0) {
            setMessage("Couldn't find a connection.");
            return;
        }
        setMessage("Connecting…");
        setTimeout(() => waitForSocketAndInit(attemptsLeft - 1), 250);
    }

    function closeChicken() {
        if (els.modal) els.modal.classList.remove("show");
        window.chickenOpen = false;
        if (typeof window.clearGameStatus === "function") window.clearGameStatus("Chicken Runner");
    }

    window.openChicken = openChicken;
    window.closeChicken = closeChicken;

    document.addEventListener("DOMContentLoaded", () => {
        const btn = document.getElementById("chickenBtn");
        if (btn) btn.addEventListener("click", openChicken);
    });

    if (document.readyState !== "loading") {
        const btn = document.getElementById("chickenBtn");
        if (btn) btn.addEventListener("click", openChicken);
    }
})();