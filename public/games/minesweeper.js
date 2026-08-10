(function () {
    const GRID_SIZE = 5;
    const TILE_COUNT = GRID_SIZE * GRID_SIZE;
    const MINE_OPTIONS = [3, 5, 8, 12];

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
    let selectedMines = 5;
    let listenersBound = false;

  
    let active = false;
    let activeAccount = "normal"; 
    let revealed = [];    
    let currentMultiplier = 1;
    let currentBet = 0;

    function injectStyles() {
        if (document.getElementById("msStyles")) return;
        const style = document.createElement("style");
        style.id = "msStyles";
        style.textContent = `
        #msModal {
        position: fixed; inset: 0; background: rgba(0, 0, 0, 0);
        display: none; align-items: center; justify-content: center;
        z-index: 30500;
        }
        #msModal.show { display: flex; }
        #msBox {
        width: 480px; max-width: 92vw; background: rgba(0, 0, 0, 0.875);;
        border: 1px solid #3a3c42; border-radius: 14px;
        display: flex; flex-direction: column; overflow: hidden;
        position: fixed;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        min-width: 380px;
        min-height: 300px;
        box-sizing: border-box;
        }
        #msHeader {
        display:flex; align-items:center; justify-content:space-between;
        padding: 14px 18px;
        cursor: grab;
        }
        #msHeader:active {
        cursor: grabbing;
        }
        #msResizeHandle {
        position: absolute;
        bottom: 0; right: 0;
        width: 18px; height: 18px;
        background: linear-gradient(135deg, transparent 50%, rgba(73,73,73,1) 50%);
        cursor: nwse-resize;
        z-index: 100;
        border-radius: 0 0 14px 0;
        }
        #msHeader h3 { margin:0; color:#fff; font-size:16px; }
        #msCloseBtn {
        background:none; border:none; color:#72767d; font-size:20px; cursor:pointer;
        transition: color .15s;
        }
        #msCloseBtn:hover { color:#fff; }
        #msBalanceRow {
        display:flex; align-items:center; justify-content:space-between;
        padding: 10px 18px; background:rgba(0, 0, 0, 0.875);
        font-size: 13px; color:#b9bbbe;
        }
        #msBalanceRow b { color:#ffd700; }
        #msAccountBadge {
        font-size: 11px; padding: 2px 8px; border-radius: 10px;
        background:#2b2d31; border:1px solid #3a3c42; color:#b9bbbe;
        cursor:pointer; user-select:none;
        }
        #msAccountBadge.bonus { color:#fff; background:#FF0000;; }
        #msAccountBadge.locked { cursor:default; opacity:.7; }
         #msBoardWrap {
            padding: 18px;
            background: radial-gradient(ellipse at center, #f50000 0%, #1a0e0e 100%);
            flex: 1;
            overflow-y: auto;
            box-sizing: border-box;
        }
        #msBoard {
        display:grid; grid-template-columns: repeat(5, 1fr); gap:6px;
        }
        .ms-tile {
        aspect-ratio: 1 / 1; border-radius: 8px; background:#2b2d31;
        display:flex; align-items:center; justify-content:center;
        font-size: 18px; cursor:pointer; user-select:none;
        transition: transform .1s, background .15s;
        border: 1px solid #3a3c42;
        }
        .ms-tile:hover:not(.revealed):not(.disabled) { transform: scale(1.05); background:#35383e; }
        .ms-tile.revealed { background:#1f6b3a; cursor:default; }
        .ms-tile.mine-hit { background:#8f0000; }
        .ms-tile.mine-shown { background:#3a1414; opacity:.85; }
        .ms-tile.disabled { cursor:default; opacity:.6; }
        #msMultRow {
        display:flex; align-items:center; justify-content:space-between;
        margin-top:12px; font-size:13px; color:#b9bbbe;
        }
        #msMultRow b { color:#ffd700; font-size:15px; }
        #msMessage {
        text-align:center; color:#fff; font-size:14px; font-weight:700; min-height:20px;
        margin-top:8px;
        }
        #msControls {
        padding: 14px 18px; border-top: 1px solid #3a3c42; rgba(0, 0, 0, 0.875);
        display:flex; flex-direction:column; gap:10px;
        }
        #msBetRow { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .ms-chip {
            width: 42px; height: 42px; border-radius: 50%; border: 2px dashed rgba(255,255,255,0.5);
            display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:800;
            color:#fff; cursor:pointer; transition: transform .1s; flex-shrink:0; user-select:none;
        }
        .ms-chip:hover { transform: scale(1.08); }
        .ms-chip:active { transform: scale(0.95); }
        .ms-chip[data-v="5"]   { background:#3b6ea5; }
        .ms-chip[data-v="25"]  { background:#2f8f4e; }
        .ms-chip[data-v="100"] { background:#1e1f22; border-color:#FF0000; color:#FF0000; }
        .ms-chip[data-v="500"] { background:#6b21a8; }
        #msClearBetBtn {
        background:#40444b; border:none; color:#fff; padding:8px 12px; border-radius:8px;
        cursor:pointer; font-size:12px; margin-left:auto;
        }
        #msCurrentBet { color:#ffd700; font-weight:800; font-size:13px; }
        #msMineRow { display:flex; align-items:center; gap:8px; }
        .ms-mine-opt {
        padding:6px 12px; border-radius:8px; background:#2b2d31; color:#fff;
        font-size:12px; font-weight:700; cursor:pointer; border:1px solid #3a3c42;
        transition: background .15s, border-color .15s;
        }
        .ms-mine-opt.active { background:#8f0000; border-color:#FF0000; }
        #msActionRow { display:flex; gap:10px; }
        #msStartBtn, #msCashoutBtn {
        flex:1; background:#FF0000; border:none; color:#fff; padding:12px 0; border-radius:8px;
        cursor:pointer; font-size:14px; font-weight:700; transition: filter .15s, opacity .15s;
        }
        #msCashoutBtn { background:#2f8f4e; }
        #msStartBtn:hover, #msCashoutBtn:hover { filter:brightness(1.15); }
        #msStartBtn:disabled, #msCashoutBtn:disabled { opacity:.35; cursor:not-allowed; filter:none; }
        `;
        document.head.appendChild(style);
    }

    let els = {};

    function buildModal() {
        if (document.getElementById("msModal")) return;

        const modal = document.createElement("div");
        modal.id = "msModal";
        modal.innerHTML = `
        <div id="msBox">
        <div id="msResizeHandle"></div>
        <div id="msHeader">
        <h3>💣 Minesweeper</h3>
        <button id="msCloseBtn">✕</button>
        </div>
        <div id="msBalanceRow">
        <span>Balance: <b id="msBalanceVal">0 chips</b></span>
        <span id="msAccountBadge">Normal</span>
        </div>
        <div id="msBoardWrap">
        <div id="msBoard"></div>
        <div id="msMultRow">
        <span>Multiplier: <b id="msMultVal">1.00x</b></span>
        <span>Potential: <b id="msPotVal" style="color:#2f8f4e;">0</b></span>
        </div>
        <div id="msMessage"></div>
        </div>
        <div id="msControls">
        <div id="msMineRow">
        <span style="color:#b9bbbe; font-size:12px;">Mines:</span>
        </div>
        <div id="msBetRow">
        <span style="color:#b9bbbe; font-size:12px;">Bet:</span>
        <div class="ms-chip" data-v="1">1</div>
        <div class="ms-chip" data-v="5">5</div>
        <div class="ms-chip" data-v="25">25</div>
        <div class="ms-chip" data-v="100">100</div>
        <div class="ms-chip" data-v="500">500</div>
        <span id="msCurrentBet">0</span>
        <button id="msClearBetBtn">Clear</button>
        </div>
        <div id="msActionRow">
        <button id="msStartBtn">Start Round</button>
        <button id="msCashoutBtn" disabled>Cash Out</button>
        </div>
        </div>
        </div>
        `;
        document.body.appendChild(modal);

        els = {
            modal,
            closeBtn: document.getElementById("msCloseBtn"),
            balanceVal: document.getElementById("msBalanceVal"),
            accountBadge: document.getElementById("msAccountBadge"),
            board: document.getElementById("msBoard"),
            multVal: document.getElementById("msMultVal"),
            potVal: document.getElementById("msPotVal"),
            message: document.getElementById("msMessage"),
            mineRow: document.getElementById("msMineRow"),
            betRow: document.getElementById("msBetRow"),
            clearBetBtn: document.getElementById("msClearBetBtn"),
            currentBet: document.getElementById("msCurrentBet"),
            startBtn: document.getElementById("msStartBtn"),
            cashoutBtn: document.getElementById("msCashoutBtn"),
        };

        els.closeBtn.onclick = () => {
            
        closeMinesweeper();
        window.openGamesMenu();
        }
     
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && modal.classList.contains("show")) closeMinesweeper();
        });

        MINE_OPTIONS.forEach((n) => {
            const opt = document.createElement("div");
            opt.className = "ms-mine-opt" + (n === selectedMines ? " active" : "");
            opt.textContent = `${n} mines`;
            opt.dataset.v = n;
            opt.onclick = () => {
                if (active) return;
                selectedMines = n;
                els.mineRow.querySelectorAll(".ms-mine-opt").forEach((el) => el.classList.remove("active"));
                opt.classList.add("active");
            };
            els.mineRow.appendChild(opt);
        });

        els.betRow.querySelectorAll(".ms-chip").forEach((chip) => {
            chip.onclick = () => {
                if (active) return;
                const v = parseInt(chip.dataset.v, 10);
                if (v > balance - pendingBet) return;
                pendingBet += v;
                renderBet();
            };
        });

        els.clearBetBtn.onclick = () => {
            if (active) return;
            pendingBet = 0;
            renderBet();
        };

        els.startBtn.onclick = () => {
            const socket = getSocket();
            if (!socket || pendingBet <= 0 || pendingBet > balance || active) return;
            socket.emit("minesweeperStart", { amount: pendingBet, mines: selectedMines, account: getAccount() });
        };

        els.cashoutBtn.onclick = () => {
            const socket = getSocket();
            if (!socket || !active) return;
            socket.emit("minesweeperCashout");
        };

        els.accountBadge.onclick = () => {
            if (active) return;
            const next = getAccount() === "bonus" ? "normal" : "bonus";
            if (window.setSelectedAccount) window.setSelectedAccount(next);
            else window.selectedAccount = next;
            refreshDisplayedBalance();
        };

        buildBoard();
        renderBet();
        setupMinesweeperDragResize();
    }

    function setupMinesweeperDragResize() {
        const box = document.getElementById("msBox");
        const header = document.getElementById("msHeader");
        const resizeHandle = document.getElementById("msResizeHandle");
        if (!box || !header || !resizeHandle) return;

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
                const maxWidth = Math.max(380, window.innerWidth - rect.left);
                const maxHeight = Math.max(300, window.innerHeight - rect.top);
                box.style.width = Math.max(380, Math.min(startWidth + (e.clientX - startX), maxWidth)) + "px";
                box.style.height = Math.max(300, Math.min(startHeight + (e.clientY - startY), maxHeight)) + "px";
            }
        });

        document.addEventListener("mouseup", () => {
            isDragging = false;
            isResizing = false;
        });
    }

    function buildBoard() {
        els.board.innerHTML = "";
        revealed = new Array(TILE_COUNT).fill(false);
        for (let i = 0; i < TILE_COUNT; i++) {
            const tile = document.createElement("div");
            tile.className = "ms-tile disabled";
            tile.dataset.idx = i;
            tile.textContent = "";
            tile.onclick = () => {
                if (!active || revealed[i]) return;
                const socket = getSocket();
                if (!socket) return;
                socket.emit("minesweeperReveal", { index: i });
            };
            els.board.appendChild(tile);
        }
    }

    function setBoardEnabled(enabled) {
        els.board.querySelectorAll(".ms-tile").forEach((t) => {
            if (enabled) t.classList.remove("disabled");
            else t.classList.add("disabled");
        });
    }

    function renderBalance() {
        els.balanceVal.textContent = `${balance} chips`;
        if (els.accountBadge) {
            const acc = active ? activeAccount : getAccount();
            els.accountBadge.textContent = acc === "bonus" ? "Bonus" : "Normal";
            els.accountBadge.classList.toggle("bonus", acc === "bonus");
            els.accountBadge.classList.toggle("locked", active);
        }
    }

    function refreshDisplayedBalance() {
        const acc = active ? activeAccount : getAccount();
        balance = acc === "bonus"
            ? (window.bonusState ? window.bonusState.bonusChips : 0)
            : normalBalance;
        renderBalance();
        renderBet();
    }

    function renderBet() {
        els.currentBet.textContent = String(pendingBet);
        els.startBtn.disabled = active || pendingBet <= 0 || pendingBet > balance;
    }

    function setMessage(text) {
        els.message.textContent = text || "";
    }

    function renderMultAndPot() {
        els.multVal.textContent = `${currentMultiplier.toFixed(2)}x`;
        els.potVal.textContent = Math.floor(currentBet * currentMultiplier);
    }

 function resetBoardVisuals() {
    revealed.fill(false);  
    els.board.querySelectorAll(".ms-tile").forEach((t) => {
        t.className = "ms-tile disabled";
        t.textContent = "";
    });
}

    function bindSocketListeners() {
        const socket = getSocket();
        if (!socket || listenersBound) return;
        listenersBound = true;

        socket.on("minesweeperState", (state) => {
            active = !!state.active;
            if (active) {
                activeAccount = state.account === "bonus" ? "bonus" : "normal";
                currentBet = state.betChips || 0;
                currentMultiplier = state.multiplier || 1;
                selectedMines = state.mines || selectedMines;
                if (Array.isArray(state.revealedIndexes)) {
                    resetBoardVisuals();
                    state.revealedIndexes.forEach((idx) => markRevealed(idx));
                }
                setBoardEnabled(true);
                els.cashoutBtn.disabled = false;
                els.mineRow.querySelectorAll(".ms-mine-opt").forEach((el) => {
                    el.classList.toggle("active", parseInt(el.dataset.v, 10) === selectedMines);
                });
                if (activeAccount !== "bonus") normalBalance = state.balance;
            } else {
                setBoardEnabled(false);
                els.cashoutBtn.disabled = true;
                normalBalance = state.balance;
            }
            refreshDisplayedBalance();
            renderMultAndPot();
        });

        socket.on("bonusUpdate", () => {
            refreshDisplayedBalance();
        });

        socket.on("minesweeperTileResult", (data) => {
            if (data.hitMine) {
                markMineHit(data.index);
                if (Array.isArray(data.allMines)) {
                    data.allMines.forEach((idx) => {
                        if (idx !== data.index) markMineShown(idx);
                    });
                }
                active = false;
                setBoardEnabled(false);
                els.cashoutBtn.disabled = true;
                if (data.account !== "bonus" && typeof data.balance === "number") {
                    normalBalance = data.balance;
                }
                refreshDisplayedBalance();
                setMessage(`💥 Boom! Lost ${data.betChips}`);
            } else {
                markRevealed(data.index);
                currentMultiplier = data.multiplier;
                currentBet = data.betChips;
                renderMultAndPot();
                setMessage(`Safe! ${data.multiplier.toFixed(2)}x`);
            }
        });

        socket.on("minesweeperCashoutResult", (data) => {
            active = false;
            setBoardEnabled(false);
            els.cashoutBtn.disabled = true;
            if (data.account !== "bonus" && typeof data.balance === "number") {
                normalBalance = data.balance;
            }
            refreshDisplayedBalance();
            setMessage(`💰 Cashed out ${data.payoutChips} (${data.multiplier.toFixed(2)}x)`);
            renderBet();
        });

        socket.on("minesweeperStarted", (data) => {
            active = true;
            activeAccount = data.account === "bonus" ? "bonus" : "normal";
            currentBet = data.betChips;
            currentMultiplier = 1;
            if (activeAccount !== "bonus" && typeof data.balance === "number") {
                normalBalance = data.balance;
            }
            resetBoardVisuals();
            setBoardEnabled(true);
            els.cashoutBtn.disabled = false;
            refreshDisplayedBalance();
            renderMultAndPot();
            setMessage("Pick a tile!");
        });

        socket.on("minesweeperError", (data) => {
            renderBet();
            setMessage(data?.msg || "Something went wrong.");
        });
    }

    function markRevealed(idx) {
        revealed[idx] = true;
        const tile = els.board.querySelector(`.ms-tile[data-idx="${idx}"]`);
        if (tile) {
            tile.classList.remove("disabled");
            tile.classList.add("revealed");
            tile.textContent = "💎";
        }
    }

    function markMineHit(idx) {
        const tile = els.board.querySelector(`.ms-tile[data-idx="${idx}"]`);
        if (tile) {
            tile.classList.add("mine-hit");
            tile.classList.remove("disabled");
            tile.textContent = "💣";
        }
    }

    function markMineShown(idx) {
        const tile = els.board.querySelector(`.ms-tile[data-idx="${idx}"]`);
        if (tile && !tile.classList.contains("revealed")) {
            tile.classList.add("mine-shown");
            tile.textContent = "💣";
        }
    }

    function openMinesweeper() {
        injectStyles();
        buildModal();
        els.modal.classList.add("show");
        window.minesweeperOpen = true;
        refreshDisplayedBalance();
        waitForSocketAndInit();
        if (typeof window.setGameStatus === "function") window.setGameStatus("MineSweeper");
    }

    function waitForSocketAndInit(attemptsLeft = 20) {
        const sock = getSocket();
        if (sock) {
            bindSocketListeners();
            sock.emit("minesweeperGetState");
            return;
        }
        if (attemptsLeft <= 0) {
            setMessage("Couldn't find a connection");
            return;
        }
        setMessage("Connecting…");
        setTimeout(() => waitForSocketAndInit(attemptsLeft - 1), 250);
    }

    function closeMinesweeper() {
        if (els.modal) els.modal.classList.remove("show");
        window.minesweeperOpen = false;
        if (typeof window.clearGameStatus === "function") window.clearGameStatus("MineSweeper");
    }

    window.openMinesweeper = openMinesweeper;
    window.closeMinesweeper = closeMinesweeper;

    document.addEventListener("DOMContentLoaded", () => {
        const btn = document.getElementById("minesweeperBtn");
        if (btn) btn.addEventListener("click", openMinesweeper);
    });

    if (document.readyState !== "loading") {
        const btn = document.getElementById("minesweeperBtn");
        if (btn) btn.addEventListener("click", openMinesweeper);
    }
})();