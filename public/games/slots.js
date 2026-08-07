
(function () {
    function getSocket() {
        if (window.socket) return window.socket;
        try {
            if (typeof socket !== "undefined" && socket) return socket;
        } catch (e) {}
        return null;
    }

    const SYMBOL_EMOJI = {
        cherry: "🍒",
        lemon: "🍋",
        bell: "🔔",
        clover: "🍀",
        star: "⭐",
        seven: "7️⃣",
        pepe: "🐸"
    };
    const REEL_STRIP = ["cherry", "lemon", "bell", "clover", "star", "cherry", "lemon", "bell", "seven", "pepe", "cherry", "lemon"];

    const SLOTS_FREE_SPINS_COST = 5;
    const SLOTS_FREE_SPINS_COUNT = 10;

    let els = {};
    let spinning = false;
    let currentBet = 1;
    let balance = 0;
    let normalBalance = 0;
    let listenersBound = false;
    let dragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let hasPositioned = false;

    let freeSpinsRemaining = 0;
    let freeSpinsAccount = null;

    function injectStyles() {
        if (document.getElementById("slotsStyles")) return;
        const style = document.createElement("style");
        style.id = "slotsStyles";
        style.textContent = `
        #slotsModal {
        position: fixed; inset: 0; background: rgba(0,0,0,0);
        display: none; z-index: 30700; pointer-events: none;
        }
        #slotsModal.show { display: block; }
        #slotsBox {
        position: absolute; width: 400px; max-width: 95vw;
        background: rgba(0,0,0,0.875);
        border: 1px solid #3a3c42; border-radius: 14px; overflow: hidden;
        display:flex; flex-direction:column;
        pointer-events: auto;
        }
        #slotsBetInput::-webkit-outer-spin-button,
        #slotsBetInput::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
        }
        #slotsBetInput {
        -moz-appearance: textfield;
        }
        #slotsHeader {
        display:flex; align-items:center; justify-content:space-between;
        padding: 14px 18px; 
        cursor: grab; user-select: none;
        }
        #slotsHeader:active { cursor: grabbing; }
        #slotsHeader h3 { margin:0; color:#fff; font-size:16px; pointer-events:none; }
        #slotsCloseBtn { background:none; border:none; color:#72767d; font-size:20px; cursor:pointer; }
        #slotsCloseBtn:hover { color:#fff; }
        #slotsBalanceRow {
        display:flex; align-items:center; justify-content:space-between;
        padding: 10px 18px; background:rgba(0,0,0,0.8); 
        color:#b9bbbe; font-size: 13px;
        }
        #slotsBalanceRow b { color:#ffd700; font-size:15px; }
        #slotsAccountBadge {
        font-size: 11px; padding: 2px 8px; border-radius: 10px;
        background:#2b2d31; border:1px solid #3a3c42; color:#b9bbbe;
        cursor:pointer; user-select:none;
        }
        #slotsAccountBadge.bonus { border-color:#FF0000; color:#fff; background:#3a1010; }
        #slotsRateNote {
        text-align:center; color:#72767d; font-size:11px;
        padding: 6px 18px; background:#1e1f22; 
        }
        #slotsMachine {
        padding: 20px 18px 8px; display:flex; justify-content:center;
        background: radial-gradient(ellipse at center, #240000 0%, #050505 100%);
        }
        #slotsReels {
        display:flex; gap:8px; background:#000; border:3px solid #333; border-radius:10px;
        padding:12px;
        }
        .slots-reel-window {
        width:70px; height:70px; overflow:hidden; background:#000; border-radius:6px;
        border:2px solid #2a2a2a; position:relative;
        }
        .slots-reel-strip {
        display:flex; flex-direction:column; position:absolute; top:0; left:0; width:100%;
        }
        .slots-symbol {
        height:70px; display:flex; align-items:center; justify-content:center; font-size:38px;
        }
        .slots-reel-window.win { border-color:#ffd700; box-shadow: 0 0 14px rgba(255,215,0,0.7); }
        #slotsPayoutBanner {
        text-align:center; font-weight:700; font-size:16px; min-height:22px; margin-top:10px;
        color:#3ba55d;
        }
        #slotsFooter { padding: 12px 18px 16px; display:flex; flex-direction:column; gap:10px; }
        #slotsBuyFreeSpinsBtn {
        width:100%; padding:9px; font-weight:700; font-size:12.5px;
        background:#FF0000; border:1px solid #FF0000; color:#fff;
        border-radius:8px; cursor:pointer; transition: filter .15s, opacity .15s;
        }
        #slotsBuyFreeSpinsBtn:hover:not(:disabled) { filter: brightness(1.2); }
        #slotsBuyFreeSpinsBtn:disabled { cursor:default; }
        .slots-bet-row { display:flex; align-items:center; gap:8px; justify-content:center; }
        .slots-bet-btn {
        background:#1e1f22; border:1px solid #3a3c42; color:#fff; width:30px; height:30px; border-radius:6px;
        cursor:pointer; font-size:14px; font-weight:700;
        }
        .slots-bet-btn:hover { background:#2b2d31; }
        #slotsBetInput {
        width:100px; text-align:center; padding:7px; background:#111; border:1px solid #3a3c42;
        border-radius:6px; color:#fff; font-size:14px; font-weight:700;
        }
        #slotsBetInput:disabled { opacity:.5; }
        #slotsSpinBtn {
        background:#FF0000; border:none; color:#fff; padding:12px; border-radius:8px;
        cursor:pointer; font-size:14px; font-weight:700; letter-spacing: 0.5px;
        transition: filter .15s, opacity .15s;
        }
        #slotsSpinBtn:hover { filter: brightness(1.15); }
        #slotsSpinBtn:disabled { opacity:.5; cursor:not-allowed; }
        .slots-quickbets { display:flex; gap:6px; justify-content:center; }
        .slots-quickbet {
        background:#1e1f22; border:1px solid #3a3c42; color:#b9bbbe; padding:5px 10px;
        border-radius:6px; cursor:pointer; font-size:12px;
        }
        .slots-quickbet:hover { border-color:#FF0000; color:#fff; }
        #slotsError { color:#ff5555; font-size:12px; text-align:center; min-height:16px; }
        @keyframes slotsPulse {
          0%, 100% { text-shadow: 0 0 0px rgba(255,215,0,0); }
          50% { text-shadow: 0 0 12px rgba(255,215,0,0.9); }
        }
        #slotsPayoutBanner.win { animation: slotsPulse 0.6s ease-in-out infinite; }
        `;
        document.head.appendChild(style);
    }

    function buildModal() {
        if (document.getElementById("slotsModal")) return;
        const modal = document.createElement("div");
        modal.id = "slotsModal";
        modal.innerHTML = `
        <div id="slotsBox">
          <div id="slotsHeader">
            <h3>🎰 Slots</h3>
            <button id="slotsCloseBtn">✕</button>
          </div>
          <div id="slotsBalanceRow">
            <span>Balance <span id="slotsAccountBadge">Normal</span></span>
            <b id="slotsBalanceVal">0</b>
          </div>
          <div id="slotsRateNote">1 chip = 10 XP • click badge above to switch account</div>
          <div id="slotsMachine">
            <div id="slotsReels">
              <div class="slots-reel-window" data-reel="0"><div class="slots-reel-strip"></div></div>
              <div class="slots-reel-window" data-reel="1"><div class="slots-reel-strip"></div></div>
              <div class="slots-reel-window" data-reel="2"><div class="slots-reel-strip"></div></div>
            </div>
          </div>
          <div id="slotsPayoutBanner"></div>
          <div id="slotsFooter">
            <button id="slotsBuyFreeSpinsBtn">Buy ${SLOTS_FREE_SPINS_COUNT} Free Spins (${SLOTS_FREE_SPINS_COST})</button>
            <div class="slots-bet-row">
              <button class="slots-bet-btn" id="slotsBetHalf">½</button>
              <input id="slotsBetInput" type="number" min="1" step="1" value="1">
              <button class="slots-bet-btn" id="slotsBetDouble">2x</button>
            </div>
            <div class="slots-quickbets">
              <button class="slots-quickbet" data-amt="100">100</button>
              <button class="slots-quickbet" data-amt="500">500</button>
              <button class="slots-quickbet" data-amt="1000">1,000</button>
              <button class="slots-quickbet" data-amt="max">Max</button>
            </div>
            <button id="slotsSpinBtn">SPIN</button>
            <div id="slotsError"></div>
          </div>
        </div>
        `;
        document.body.appendChild(modal);

        els = {
            modal,
            box: document.getElementById("slotsBox"),
            header: document.getElementById("slotsHeader"),
            closeBtn: document.getElementById("slotsCloseBtn"),
            balanceVal: document.getElementById("slotsBalanceVal"),
            accountBadge: document.getElementById("slotsAccountBadge"),
            reels: [...document.querySelectorAll(".slots-reel-window")],
            strips: [...document.querySelectorAll(".slots-reel-strip")],
            payoutBanner: document.getElementById("slotsPayoutBanner"),
            betInput: document.getElementById("slotsBetInput"),
            spinBtn: document.getElementById("slotsSpinBtn"),
            error: document.getElementById("slotsError"),
            betHalf: document.getElementById("slotsBetHalf"),
            betDouble: document.getElementById("slotsBetDouble"),
            buyFreeSpinsBtn: document.getElementById("slotsBuyFreeSpinsBtn"),
        };

        els.strips.forEach((strip) => {
            strip.innerHTML = "";
            for (let i = 0; i < 3; i++) {
                REEL_STRIP.forEach((sym) => {
                    const div = document.createElement("div");
                    div.className = "slots-symbol";
                    div.textContent = SYMBOL_EMOJI[sym] || "❓";
                    div.dataset.symbol = sym;
                    strip.appendChild(div);
                });
            }
        });

        els.closeBtn.onclick = () => {
            closeSlots();
            window.openGamesMenu();
        };
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && modal.classList.contains("show")) closeSlots();
        });

        bindDrag();

        els.spinBtn.onclick = () => doSpin();
        els.betHalf.onclick = () => setBet(Math.max(1, Math.floor(currentBet / 2)));
        els.betDouble.onclick = () => setBet(currentBet * 2);
        els.betInput.addEventListener("change", () => setBet(Math.floor(Number(els.betInput.value)) || 1));

        els.accountBadge.onclick = () => {
            const next = getAccount() === "bonus" ? "normal" : "bonus";
            if (window.setSelectedAccount) window.setSelectedAccount(next);
            else window.selectedAccount = next;
            refreshDisplayedBalance();
        };

        els.buyFreeSpinsBtn.onclick = () => {
            const socket = getSocket();
            if (!socket) return;
            if (freeSpinsRemaining > 0) return;
            socket.emit("slotsBuyFreeSpins", { account: getAccount() });
        };

        document.querySelectorAll(".slots-quickbet").forEach((btn) => {
            btn.onclick = () => {
                if (btn.dataset.amt === "max") setBet(Math.max(1, balance));
                else setBet(Number(btn.dataset.amt));
            };
        });

        setBet(1);
    }

    function getAccount() {
        return window.selectedAccount === "bonus" ? "bonus" : "normal";
    }

    function bindDrag() {
        els.header.addEventListener("mousedown", (e) => {
            if (e.target === els.closeBtn) return;
            dragging = true;
            const rect = els.box.getBoundingClientRect();
            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;
            document.body.style.userSelect = "none";
        });

        document.addEventListener("mousemove", (e) => {
            if (!dragging) return;
            const boxRect = els.box.getBoundingClientRect();
            let x = e.clientX - dragOffsetX;
            let y = e.clientY - dragOffsetY;

            x = Math.max(0, Math.min(window.innerWidth - boxRect.width, x));
            y = Math.max(0, Math.min(window.innerHeight - boxRect.height, y));

            els.box.style.left = `${x}px`;
            els.box.style.top = `${y}px`;
        });

        document.addEventListener("mouseup", () => {
            if (dragging) {
                dragging = false;
                document.body.style.userSelect = "";
            }
        });

        els.header.addEventListener("touchstart", (e) => {
            if (e.target === els.closeBtn) return;
            const touch = e.touches[0];
            dragging = true;
            const rect = els.box.getBoundingClientRect();
            dragOffsetX = touch.clientX - rect.left;
            dragOffsetY = touch.clientY - rect.top;
        }, { passive: true });

        document.addEventListener("touchmove", (e) => {
            if (!dragging) return;
            const touch = e.touches[0];
            const boxRect = els.box.getBoundingClientRect();
            let x = touch.clientX - dragOffsetX;
            let y = touch.clientY - dragOffsetY;
            x = Math.max(0, Math.min(window.innerWidth - boxRect.width, x));
            y = Math.max(0, Math.min(window.innerHeight - boxRect.height, y));
            els.box.style.left = `${x}px`;
            els.box.style.top = `${y}px`;
        }, { passive: true });

        document.addEventListener("touchend", () => { dragging = false; });
    }

    function positionInitial() {
        if (hasPositioned) return;
        hasPositioned = true;
        const rect = els.box.getBoundingClientRect();
        const x = Math.max(0, (window.innerWidth - rect.width) / 2);
        const y = Math.max(0, (window.innerHeight - rect.height) / 2 - 40);
        els.box.style.left = `${x}px`;
        els.box.style.top = `${y}px`;
    }

    function setBet(amt) {
        currentBet = Math.max(1, Math.floor(amt));
        els.betInput.value = currentBet;
    }

    function setMessage(text, isWin) {
        els.payoutBanner.textContent = text || "";
        els.payoutBanner.classList.toggle("win", !!isWin);
    }

    function setError(text) {
        els.error.textContent = text || "";
    }

    function updateBalance(bal) {
        balance = bal || 0;
        els.balanceVal.textContent = balance.toLocaleString();
    }

    function refreshDisplayedBalance() {
        const acc = getAccount();
        if (els.accountBadge) {
            els.accountBadge.textContent = acc === "bonus" ? "Bonus" : "Normal";
            els.accountBadge.classList.toggle("bonus", acc === "bonus");
        }
        if (acc === "bonus") {
            updateBalance(window.bonusState ? window.bonusState.bonusChips : 0);
        } else {
            updateBalance(normalBalance);
        }
    }

    function updateFreeSpinsUI() {
        if (!els.buyFreeSpinsBtn) return;
        if (freeSpinsRemaining > 0) {
            els.buyFreeSpinsBtn.textContent = `🎁 ${freeSpinsRemaining} Free Spins Left`;
            els.buyFreeSpinsBtn.disabled = true;
            els.buyFreeSpinsBtn.style.opacity = "0.7";
            els.betInput.disabled = true;
            els.betInput.value = 1;
            els.betHalf.disabled = true;
            els.betDouble.disabled = true;
            document.querySelectorAll(".slots-quickbet").forEach(b => b.disabled = true);
            els.spinBtn.textContent = "FREE SPIN";
        } else {
            els.buyFreeSpinsBtn.textContent = `Buy ${SLOTS_FREE_SPINS_COUNT} Free Spins (${SLOTS_FREE_SPINS_COST})`;
            els.buyFreeSpinsBtn.disabled = false;
            els.buyFreeSpinsBtn.style.opacity = "1";
            els.betInput.disabled = false;
            els.betHalf.disabled = false;
            els.betDouble.disabled = false;
            document.querySelectorAll(".slots-quickbet").forEach(b => b.disabled = false);
            els.spinBtn.textContent = "SPIN";
        }
    }

    function animateReel(reelIndex, targetSymbol, duration, delay) {
        return new Promise((resolve) => {
            const strip = els.strips[reelIndex];
            const symbolH = 70;
            const totalSymbols = REEL_STRIP.length * 3;

            let landIndex = -1;
            for (let i = totalSymbols - REEL_STRIP.length; i < totalSymbols; i++) {
                if (strip.children[i] && strip.children[i].dataset.symbol === targetSymbol) {
                    landIndex = i;
                    break;
                }
            }
            if (landIndex === -1) landIndex = REEL_STRIP.length;

            setTimeout(() => {
                strip.style.transition = `transform ${duration}ms cubic-bezier(0.15, 0.85, 0.35, 1)`;
                strip.style.transform = `translateY(${-(landIndex * symbolH)}px)`;
                setTimeout(resolve, duration);
            }, delay);
        });
    }

    function resetReels() {
        els.strips.forEach((strip) => {
            strip.style.transition = "none";
            strip.style.transform = "translateY(0px)";
        });
        els.reels.forEach((r) => r.classList.remove("win"));
    }

    async function doSpin() {
        if (spinning) return;
        const socket = getSocket();
        if (!socket) { setError("Not connected."); return; }

        const usingFreeSpin = freeSpinsRemaining > 0;

        if (!usingFreeSpin) {
            const amount = Math.floor(Number(els.betInput.value));
            const account = getAccount();
            if (!Number.isFinite(amount) || amount <= 0) { setError("Enter a valid bet."); return; }
            if (amount > balance) { setError("Insufficient balance."); return; }

            setError("");
            setMessage("");
            spinning = true;
            els.spinBtn.disabled = true;
            els.reels.forEach((r) => r.classList.remove("win"));
            socket.emit("slotsSpin", { amount, account });
            return;
        }

        setError("");
        setMessage("");
        spinning = true;
        els.spinBtn.disabled = true;
        els.reels.forEach((r) => r.classList.remove("win"));
        socket.emit("slotsSpin", { account: freeSpinsAccount });
    }

    async function handleResult(data) {
        resetReels();
        await new Promise((r) => requestAnimationFrame(r));

        const durations = [900, 1150, 1400];
        await Promise.all(data.reels.map((sym, i) => animateReel(i, sym, durations[i], i * 150)));

        if (data.account === "bonus") {
        } else if (typeof data.balance === "number") {
            normalBalance = data.balance;
        }

        if (data.freeSpin) {
            freeSpinsRemaining = data.freeSpinsRemaining || 0;
            if (freeSpinsRemaining <= 0) freeSpinsAccount = null;
        }

        refreshDisplayedBalance();
        updateFreeSpinsUI();

        if (data.payoutChips > 0) {
            setMessage(`+${data.payoutChips.toLocaleString()} chips (x${data.multiplier})${data.freeSpin ? " 🎁" : ""}`, true);
            els.reels.forEach((r) => r.classList.add("win"));
        } else {
            setMessage(data.freeSpin ? "No win (free spin)" : "No win", false);
        }

        spinning = false;
        els.spinBtn.disabled = false;
    }

    function bindSocketListeners() {
        const socket = getSocket();
        if (!socket || listenersBound) return;
        listenersBound = true;

        socket.on("slotsState", (data) => {
            normalBalance = data.balance || 0;
            if (data.freeSpins && data.freeSpins.active) {
                freeSpinsRemaining = data.freeSpins.remaining;
                freeSpinsAccount = data.freeSpins.account;
            } else {
                freeSpinsRemaining = 0;
                freeSpinsAccount = null;
            }
            refreshDisplayedBalance();
            updateFreeSpinsUI();
        });

        socket.on("slotsResult", (data) => {
            handleResult(data);
        });

        socket.on("slotsPayoutCredited", (data) => {
            if (data.account !== "bonus" && typeof data.balance === "number") {
                normalBalance = data.balance;
            }
            refreshDisplayedBalance();
        });

        socket.on("slotsFreeSpinsBought", (data) => {
            freeSpinsRemaining = data.remaining;
            freeSpinsAccount = data.account;
            if (data.account !== "bonus" && typeof data.balance === "number") {
                normalBalance = data.balance;
            }
            refreshDisplayedBalance();
            updateFreeSpinsUI();
        });

        socket.on("slotsError", (data) => {
            setError(data.msg || "Error");
            spinning = false;
            els.spinBtn.disabled = false;
        });

        socket.on("bonusUpdate", () => {
            refreshDisplayedBalance();
        });
    }

    function openSlots() {
         if (typeof window.setGameStatus === "function") window.setGameStatus("Slots");
        injectStyles();
        buildModal();
        els.modal.classList.add("show");
        positionInitial();
        bindSocketListeners();
        resetReels();
        setMessage("");
        setError("");
        refreshDisplayedBalance();
        updateFreeSpinsUI();
        const socket = getSocket();
        if (socket) socket.emit("slotsGetState");
    }

    function closeSlots() {
        if (els.modal) els.modal.classList.remove("show");
        if (typeof window.clearGameStatus === "function") window.clearGameStatus("Slots");
    }

    window.openSlots = openSlots;
    window.closeSlots = closeSlots;

    document.addEventListener("DOMContentLoaded", () => {
        const btn = document.getElementById("slotsBtn");
        if (btn) btn.addEventListener("click", openSlots);
    });
    if (document.readyState !== "loading") {
        const btn = document.getElementById("slotsBtn");
        if (btn) btn.addEventListener("click", openSlots);
    }
})();