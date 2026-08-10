(function () {
    const ROWS = 16;
    const SLOTS = ROWS + 1;
    let leaderboardData = [];
    let recentBets = [];
    const RECENT_BETS_MAX_DISPLAY = 15;

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
    let multipliers = [1000, 130, 26, 9, 4, 2, 0.4, 0.2, 0.2, 0.2, 0.4, 2, 4, 9, 26, 130, 1000];
    let listenersBound = false;

    function injectStyles() {
        if (document.getElementById("pkStyles")) return;
        const style = document.createElement("style");
        style.id = "pkStyles";
        style.textContent = `
        #pkModal {
        position: fixed; inset: 0; background: rgba(0, 0, 0, 0);
        display: none; align-items: center; justify-content: center;
        z-index: 30500;
        }
        #pkModal.show { display: flex; }
        #pkBox {
        width: 860px; max-width: 96vw; background: rgba(0, 0, 0, 0.875);
        border: 1px solid #3a3c42; border-radius: 14px;
        display: flex; flex-direction: row; overflow: hidden;
        }
        #pkMain { display: flex; flex-direction: column; flex: 1; min-width: 0; }  
        #pkHeader {
        display:flex; align-items:center; justify-content:space-between;
        padding: 14px 18px; 
        }
        #pkHeader h3 { margin:0; color:#fff; font-size:16px; }
        #pkCloseBtn {
        background:none; border:none; color:#72767d; font-size:20px; cursor:pointer;
        transition: color .15s;
        }
        #pkCloseBtn:hover { color:#fff; }
        #pkBalanceRow {
        display:flex; align-items:center; justify-content:space-between;
        padding: 10px 18px; rgba(0, 0, 0, 0.875);
        font-size: 13px; color:#b9bbbe;
        }
        #pkBalanceRow b { color:#ffd700; }
        #pkAccountBadge {
        font-size: 11px; padding: 2px 8px; border-radius: 10px;
        background:#2b2d31; border:1px solid #3a3c42; color:#b9bbbe;
        cursor:pointer; user-select:none;
        }
        #pkAccountBadge.bonus { color:#fff; background:#FF0000;; }
        #pkBoardWrap {
        padding: 18px;
        background: radial-gradient(ellipse at center, #000000 0%, #000000 100%);
        }
        #pkBoard {
        position: relative; width: 100%; height: 460px;
        background: rgba(0,0,0,0.25); border-radius: 10px; overflow: hidden;
        }
        .pk-peg {
        position:absolute; width:6px; height:6px; border-radius:50%;
        background:#5a6a5f;
        }
        .pk-ball {
        position:absolute; width:14px; height:14px; border-radius:50%;
        background: radial-gradient(circle at 35% 30%, #fff, #FF0000 60%, #8f0000);
        z-index: 5;
        }
        #pkSlots {
        display:flex; margin-top:6px; gap:2px;
        }
        .pk-slot {
        flex:1; text-align:center; font-size:10px; font-weight:800; color:#fff;
        padding:7px 0; border-radius:6px; background:#2b2d31;
        transition: transform .15s, background .15s;
        overflow: hidden; white-space: nowrap;
        }
        .pk-slot.hit { background:#FF0000; transform: scale(1.12) translateY(-4px); }
        #pkMessage {
        text-align:center; color:#fff; font-size:14px; font-weight:700; min-height:20px;
        margin-top:10px;
        }
        #pkControls {
        padding: 14px 18px; border-top: 1px solid #3a3c42; rgba(0, 0, 0, 0.875);
        display:flex; flex-direction:column; gap:10px;
        }
        #pkBetRow { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .pk-chip {
            width: 42px; height: 42px; border-radius: 50%; border: 2px dashed rgba(255,255,255,0.5);
            display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:800;
            color:#fff; cursor:pointer; transition: transform .1s; flex-shrink:0; user-select:none;
        }
        .pk-chip:hover { transform: scale(1.08); }
        .pk-chip:active { transform: scale(0.95); }
        .pk-chip[data-v="5"]   { background:#3b6ea5; }
        .pk-chip[data-v="25"]  { background:#2f8f4e; }
        .pk-chip[data-v="100"] { background:#1e1f22; border-color:#FF0000; color:#FF0000; }
        .pk-chip[data-v="500"] { background:#6b21a8; }
        #pkClearBetBtn {
        background:#40444b; border:none; color:#fff; padding:8px 12px; border-radius:8px;
        cursor:pointer; font-size:12px; margin-left:auto;
        }
        #pkCurrentBet { color:#ffd700; font-weight:800; font-size:13px; }
        #pkDropBtn {
        background:#FF0000; border:none; color:#fff; padding:12px 0; border-radius:8px;
        cursor:pointer; font-size:14px; font-weight:700; transition: filter .15s, opacity .15s;
        }
        #pkDropBtn:hover { filter:brightness(1.15); }
        #pkDropBtn:disabled { opacity:.35; cursor:not-allowed; filter:none; }

        #pkBox {
            position: fixed;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            min-width: 640px;
            min-height: 420px;
            box-sizing: border-box;
            }
            #pkHeader {
            cursor: grab;
            }
            #pkHeader:active {
            cursor: grabbing;
            }
            #pkResizeHandle {
            position: absolute;
            bottom: 0; right: 0;
            width: 18px; height: 18px;
            background: linear-gradient(135deg, transparent 50%, rgba(73,73,73,1) 50%);
            cursor: nwse-resize;
            z-index: 100;
            border-radius: 0 0 14px 0;
            }
        #pkMain { display: flex; flex-direction: column; flex: 1; min-width: 0; }
        #pkSidebar {
          width: 200px; flex-shrink: 0; border-left: 1px solid #3a3c42;
          display: flex; flex-direction: column; background: rgba(0,0,0,0.35);
        }
        #pkSidebar h4 {
          margin:0; padding:14px 16px 10px; color:#fff; font-size:13px;
          text-transform:uppercase; letter-spacing:.5px; border-bottom:1px solid #3a3c42;
        }
        #pkLeaderboardList { flex:1; overflow-y:auto; padding: 8px; display:flex; flex-direction:column; gap:6px; }
        .pk-lb-row {
          display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:8px;
          background:#1e1f22; border:1px solid #2b2d31;
        }
        .pk-lb-rank { width:16px; font-size:11px; font-weight:800; color:#72767d; flex-shrink:0; text-align:center; }
        .pk-lb-row:nth-child(1) .pk-lb-rank { color:#ffd700; }
        .pk-lb-row:nth-child(2) .pk-lb-rank { color:#c0c0c0; }
        .pk-lb-row:nth-child(3) .pk-lb-rank { color:#cd7f32; }
        .pk-lb-avatar { width:26px; height:26px; border-radius:50%; flex-shrink:0; object-fit:cover; }
        .pk-lb-namecol { flex:1; min-width:0; display:flex; flex-direction:column; gap:1px; }
        .pk-lb-name { font-size:12px; color:#e6e6e7; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .pk-lb-mult { font-size:10.5px; color:#72767d; font-weight:600; }
        .pk-lb-payout { font-size:11px; font-weight:800; color:#23d160; flex-shrink:0; }
        .pk-empty { color:#72767d; font-size:12px; text-align:center; padding:20px 10px; }

        #pkBetToastWrap {
          position:absolute; top:8px; right:8px; z-index:20;
          display:flex; flex-direction:column; gap:6px; align-items:flex-end;
          pointer-events:none;
        }
        .pk-bet-toast {
          display:flex; align-items:center; gap:8px;
          background:rgba(0,0,0,0.8); border:1px solid #3a3c42; border-radius:20px;
          padding:5px 12px 5px 5px; font-size:11.5px; color:#fff;
          animation: pkToastIn .2s ease-out;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        }
        .pk-bet-toast.leaving { animation: pkToastOut .3s ease-in forwards; }
        .pk-bet-toast img { width:22px; height:22px; border-radius:50%; flex-shrink:0; }
        .pk-bet-toast .pk-toast-mult { font-weight:800; }
        .pk-bet-toast .pk-toast-mult.win { color:#23d160; }
        .pk-bet-toast .pk-toast-mult.loss { color:#ff5555; }
        @keyframes pkToastIn { from { opacity:0; transform: translateX(20px); } to { opacity:1; transform: translateX(0); } }
        @keyframes pkToastOut { from { opacity:1; transform: translateX(0); } to { opacity:0; transform: translateX(20px); } }

        @media (max-width: 640px) {
          #pkBox { flex-direction: column; max-height: 94vh; }
          #pkSidebar { width:100%; border-left:none; border-top:1px solid #3a3c42; max-height:180px; }
        }
        .pk-tab.active { color:#fff; border-bottom-color:#FF0000; }
        .pk-tab-content { flex:1; overflow-y:auto; padding:8px; display:flex; flex-direction:column; gap:6px; }
        .pk-bet-row, .pk-lb-row {
          display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:8px;
          background:#1e1f22; border:1px solid #2b2d31;
        }
        .pk-bet-avatar, .pk-lb-avatar { width:26px; height:26px; border-radius:50%; flex-shrink:0; object-fit:cover; }
        .pk-bet-info, .pk-lb-info { flex:1; min-width:0; display:flex; flex-direction:column; gap:1px; }
        .pk-bet-name, .pk-lb-name { font-size:11.5px; color:#e6e6e7; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .pk-bet-detail { font-size:10.5px; color:#72767d; }
        .pk-bet-mult { font-size:11px; font-weight:800; flex-shrink:0; }
        .pk-bet-mult.win { color:#23d160; }
        .pk-bet-mult.loss { color:#ff5555; }
        .pk-lb-rank { width:16px; font-size:11px; font-weight:800; color:#72767d; flex-shrink:0; text-align:center; }
        .pk-lb-row:nth-child(1) .pk-lb-rank { color:#ffd700; }
        .pk-lb-row:nth-child(2) .pk-lb-rank { color:#c0c0c0; }
        .pk-lb-row:nth-child(3) .pk-lb-rank { color:#cd7f32; }
        .pk-lb-payout { font-size:11px; font-weight:800; color:#23d160; flex-shrink:0; }
        .pk-empty { color:#72767d; font-size:12px; text-align:center; padding:20px 10px; }
        @media (max-width: 640px) {
          #pkBox { flex-direction: column; max-height: 94vh; }
          #pkSidebar { width:100%; border-left:none; border-top:1px solid #3a3c42; max-height:220px; }
        }
        `;
        document.head.appendChild(style);
    }


    function setupPlinkoDragResize() {
        const box = document.getElementById("pkBox");
        const header = document.getElementById("pkHeader");
        const resizeHandle = document.getElementById("pkResizeHandle");
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
    const slotTimeouts = {}; 

    function buildModal() {
        if (document.getElementById("pkModal")) return;

        const modal = document.createElement("div");
        modal.id = "pkModal";
        modal.innerHTML = `
        <div id="pkBox">
          <div id="pkResizeHandle"></div>
          <div id="pkMain">
            <div id="pkHeader">
              <h3>🎯 Plinko</h3>
              <button id="pkCloseBtn">✕</button>
            </div>
            <div id="pkBalanceRow">
              <span>Balance: <b id="pkBalanceVal">0 chips</b></span>
              <span id="pkAccountBadge">Normal</span>
            </div>
            <div id="pkBoardWrap">
              <div id="pkBoard">
                <div id="pkBetToastWrap"></div>
              </div>
              <div id="pkSlots"></div>
              <div id="pkMessage"></div>
            </div>
            <div id="pkControls">
              <div id="pkBetRow">
                <span style="color:#b9bbbe; font-size:12px;">Bet:</span>
                <div class="pk-chip" data-v="1">1</div>
                <div class="pk-chip" data-v="5">5</div>
                <div class="pk-chip" data-v="25">25</div>
                <div class="pk-chip" data-v="100">100</div>
                <div class="pk-chip" data-v="500">500</div>
                <span id="pkCurrentBet">0</span>
                <button id="pkClearBetBtn">Clear</button>
              </div>
              <button id="pkDropBtn">Drop Ball</button>
            </div>
          </div>
          <div id="pkSidebar">
            <h4>🏆 Top Wins</h4>
            <div id="pkLeaderboardList"><div class="pk-empty">No data yet</div></div>
          </div>
        </div>
        `;
        document.body.appendChild(modal);

         els = {
            modal,
            closeBtn: document.getElementById("pkCloseBtn"),
            balanceVal: document.getElementById("pkBalanceVal"),
            accountBadge: document.getElementById("pkAccountBadge"),
            board: document.getElementById("pkBoard"),
            slots: document.getElementById("pkSlots"),
            message: document.getElementById("pkMessage"),
            betRow: document.getElementById("pkBetRow"),
            clearBetBtn: document.getElementById("pkClearBetBtn"),
            currentBet: document.getElementById("pkCurrentBet"),
            dropBtn: document.getElementById("pkDropBtn"),
            leaderboardList: document.getElementById("pkLeaderboardList"),
            betToastWrap: document.getElementById("pkBetToastWrap"),
        };


        document.querySelectorAll(".pk-tab").forEach(tab => {
            tab.onclick = () => {
                document.querySelectorAll(".pk-tab").forEach(t => t.classList.remove("active"));
                tab.classList.add("active");
                const target = tab.dataset.tab;
                els.recentBetsList.style.display = target === "bets" ? "flex" : "none";
                els.leaderboardList.style.display = target === "leaderboard" ? "flex" : "none";
            };
        });

        els.closeBtn.onclick = () => {
        closePlinko();
        window.openGamesMenu();
        }
        
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && modal.classList.contains("show")) closePlinko();
        });

        els.betRow.querySelectorAll(".pk-chip").forEach((chip) => {
            chip.onclick = () => {
                const v = parseInt(chip.dataset.v, 10);
                if (v > balance - pendingBet) return;
                pendingBet += v;
                renderBet();
            };
        });

        els.clearBetBtn.onclick = () => {
            pendingBet = 0;
            renderBet();
        };

        els.dropBtn.onclick = () => {
            const socket = getSocket();
            if (!socket || pendingBet <= 0) return;
            if (pendingBet > balance) return;
            socket.emit("plinkoDrop", { amount: pendingBet, account: getAccount() });
        };

        els.accountBadge.onclick = () => {
            const next = getAccount() === "bonus" ? "normal" : "bonus";
            if (window.setSelectedAccount) window.setSelectedAccount(next);
            else window.selectedAccount = next;
            refreshDisplayedBalance();
        };

        buildPegs();
        buildSlots();
        renderBet();
        setupPlinkoDragResize();
    }

    function buildPegs() {
        els.board.querySelectorAll(".pk-peg").forEach((p) => p.remove());
        const topMarginPct = 8;
        const bottomMarginPct = 6;
        const usablePct = 100 - topMarginPct - bottomMarginPct;
        const colSpacingPct = 100 / SLOTS;

        for (let row = 0; row < ROWS; row++) {
            const pegCount = row + 2;
            const y = topMarginPct + (row / (ROWS - 1)) * usablePct;
            for (let i = 0; i < pegCount; i++) {
                const x = 50 + (i - (pegCount - 1) / 2) * colSpacingPct;
                const peg = document.createElement("div");
                peg.className = "pk-peg";
                peg.style.left = `calc(${x}% - 3px)`;
                peg.style.top = `calc(${y}% - 3px)`;
                els.board.appendChild(peg);
            }
        }
    }

    function buildSlots() {
        els.slots.innerHTML = "";
        multipliers.forEach((m, i) => {
            const slot = document.createElement("div");
            slot.className = "pk-slot";
            slot.id = `pkSlot${i}`;
            slot.textContent = `${m}x`;
            els.slots.appendChild(slot);
        });
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
        els.dropBtn.disabled = pendingBet <= 0 || pendingBet > balance;
    }

    function sanitizeAvatar(src) {
        if (typeof window.sanitizeAvatar === "function") return window.sanitizeAvatar(src);
        return src || "/avatars/default1.png";
    }



    function showBetToast(bet) {
        if (!els.betToastWrap) return;

        const toast = document.createElement("div");
        toast.className = "pk-bet-toast";

        const img = document.createElement("img");
        img.src = sanitizeAvatar(bet.avatar);

        const text = document.createElement("span");
        const won = bet.payoutChips > bet.betChips;
        text.innerHTML = "";
        text.appendChild(document.createTextNode(bet.username + " · "));

        const mult = document.createElement("span");
        mult.className = "pk-toast-mult " + (won ? "win" : "loss");
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
            els.leaderboardList.innerHTML = `<div class="pk-empty">No data yet</div>`;
            return;
        }
        leaderboardData.forEach((entry, i) => {
            const row = document.createElement("div");
            row.className = "pk-lb-row";

            const rank = document.createElement("div");
            rank.className = "pk-lb-rank";
            rank.textContent = "#" + (i + 1);

            const avatar = document.createElement("img");
            avatar.className = "pk-lb-avatar";
            avatar.src = sanitizeAvatar(entry.avatar);

            const nameCol = document.createElement("div");
            nameCol.className = "pk-lb-namecol";

            const name = document.createElement("div");
            name.className = "pk-lb-name";
            name.textContent = entry.username;

            const mult = document.createElement("div");
            mult.className = "pk-lb-mult";
            mult.textContent = `${entry.multiplier}x`;

            nameCol.appendChild(name);
            nameCol.appendChild(mult);

            const payout = document.createElement("div");
            payout.className = "pk-lb-payout";
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

  
   function animateDrop(path, slotIndex, multiplier, payoutChips, finalBalance, betAmount) {
   
    
    const boardWidth = els.board.clientWidth || 440;
    const boardHeight = els.board.clientHeight || 300;
    const slotWidth = boardWidth / SLOTS;
    const topMarginPct = 8;
    const bottomMarginPct = 6;
    const usablePct = 100 - topMarginPct - bottomMarginPct;
    const rowYPct = (row) => topMarginPct + (row / (ROWS - 1)) * usablePct;
    const slotsRowYPct = 100;

    let x = boardWidth / 2;
    const ball = document.createElement("div");
    ball.className = "pk-ball";
    ball.style.left = `${x - 7}px`;
    ball.style.top = `-14px`;
    els.board.appendChild(ball);

    let step = 0;
    function nextStep() {
        if (step >= path.length) {
        const slotEl = document.getElementById(`pkSlot${slotIndex}`);
        if (slotEl) {
            slotEl.classList.add("hit");
            setTimeout(() => slotEl.classList.remove("hit"), 500);
        }

            if (payoutChips > betAmount) {
                setMessage(`🎉 Landed x${multiplier} - +${payoutChips - betAmount}`);
            } else if (payoutChips === betAmount) {
                setMessage(`Landed x${multiplier} - push`);
            } else {
                setMessage(`Landed x${multiplier} - -${betAmount - payoutChips}`);
            }
                 
           
                  const audio = new Audio('/sounds/completion-success.oga');
                  audio.volume = 0.5;
                  audio.play().catch(() => {});
    
            
        
            setTimeout(() => {
                const socket = getSocket();
                if (socket) {
                    socket.emit("plinkoGetState");
                }
            }, 500);

            setTimeout(() => ball.remove(), 400);
            return;
        }

        const bit = path[step];
        x += (bit ? 1 : -1) * (slotWidth / 2);
        const yPct = step === path.length - 1 ? slotsRowYPct : rowYPct(step);
        ball.style.transition = "left .22s ease, top .22s ease";
        ball.style.left = `${x - 7}px`;
        ball.style.top = `calc(${yPct}% - 7px)`;
        step++;
        setTimeout(nextStep, 230);
    }

    setTimeout(nextStep, 150);
}

  
    function bindSocketListeners() {
        const socket = getSocket();
        if (!socket || listenersBound) return;
        listenersBound = true;

        socket.on("plinkoState", (state) => {
            normalBalance = state.balance;
            if (Array.isArray(state.multipliers)) {
                multipliers = state.multipliers;
                buildSlots();
            }
            refreshDisplayedBalance();
        });

        socket.on("bonusUpdate", () => {
            refreshDisplayedBalance();
        });

        socket.on("plinkoLeaderboardState", (data) => {
            leaderboardData = data?.leaders || [];
            renderLeaderboard();
        });

        socket.on("plinkoRecentBet", (entry) => {
            showBetToast(entry);
            recentBets.unshift(entry);
            if (recentBets.length > 25) recentBets = recentBets.slice(0, 25);
        });



        socket.on("plinkoResult", (data) => {
            if (data.account !== "bonus" && typeof data.balance === "number") {
                normalBalance = data.balance;
            }
            animateDrop(data.path, data.slotIndex, data.multiplier, data.payoutChips, data.balance, data.betChips);
            const creditDelay = 150 + ROWS * 230 + 300;
            const suppressUntil = Date.now() + creditDelay + 500; 
            window.plinkoSuppressUntil = Math.max(window.plinkoSuppressUntil || 0, suppressUntil);
        });
        socket.on("plinkoError", (data) => {
            renderBet();
            setMessage(data?.msg || "Something went wrong.");
        });
    }

function openPlinko() {
    injectStyles();
     if (typeof window.setGameStatus === "function") window.setGameStatus("Plinko");
    buildModal();
    els.modal.classList.add("show");
     window.plinkoOpen = true;
    refreshDisplayedBalance();
    waitForSocketAndInit();
}
        function waitForSocketAndInit(attemptsLeft = 20) {
        const sock = getSocket();
        if (sock) {
            bindSocketListeners();
            sock.emit("plinkoGetState");
            sock.emit("plinkoLeaderboardGet");
            return;
        }
        if (attemptsLeft <= 0) {
            setMessage("Couldn't find a connection.");
            return;
        }
        setMessage("Connecting…");
        setTimeout(() => waitForSocketAndInit(attemptsLeft - 1), 250);
    }

    function closePlinko() {
        if (els.modal) els.modal.classList.remove("show");
         window.plinkoOpen = false;
         if (typeof window.clearGameStatus === "function") window.clearGameStatus("Plinko");
    
    }

    window.openPlinko = openPlinko;
    window.closePlinko = closePlinko;

    document.addEventListener("DOMContentLoaded", () => {
        const btn = document.getElementById("plinkoBtn");
        if (btn) btn.addEventListener("click", openPlinko);
    });

    if (document.readyState !== "loading") {
        const btn = document.getElementById("plinkoBtn");
        if (btn) btn.addEventListener("click", openPlinko);
    }
})();