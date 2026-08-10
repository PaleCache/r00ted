(function () {
  let diceState = { balance: 0, maxBet: 20000, minTarget: 2, maxTarget: 98 };
  let mode = "under"; 
  let target = 50;
  let rolling = false;
  let modalEl = null;
  let rollAnimTimer = null;
  let normalBalance = 0;
  let diceLeaderboardData = [];

  function getSocket() {
    if (window.socket) return window.socket;
    try { if (typeof socket !== "undefined" && socket) return socket; } catch (e) {}
    return null;
  }

  function getAccount() {
    return window.selectedAccount === "bonus" ? "bonus" : "normal";
  }

  function currentDisplayBalance() {
    return getAccount() === "bonus"
      ? (window.bonusState ? window.bonusState.bonusChips : 0)
      : normalBalance;
  }

  function refreshDisplayedBalance() {
    diceState.balance = currentDisplayBalance();
    render();
  }

  function injectStyles() {
    if (document.getElementById("diceStyles")) return;
    const style = document.createElement("style");
    style.id = "diceStyles";
    style.textContent = `
      #diceModalOverlay {
        position: fixed; inset: 0; background: rgba(0, 0, 0, 0);
        display: flex; align-items: center; justify-content: center;
        z-index: 30000; font-family: 'Inter', system-ui, sans-serif;
      }

      input[type="number"] {
        -moz-appearance: textfield;
            }
            input[type="number"]::-webkit-outer-spin-button,
            input[type="number"]::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
            }
         #diceOuterBox {
          background: rgba(0, 0, 0, 0.875);
          border: 1px solid #40444b;
          border-radius: 16px;
          display: flex;
          flex-direction: row;
          overflow: hidden;
          position: fixed;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          min-width: 380px;
          min-height: 300px;
          width: 580px;
          height: 520px;
          box-sizing: border-box;
        }
        #diceDragHandle {
          cursor: grab;
          padding: 4px 0 10px;
          margin: -4px 0 4px;
        }
        #diceDragHandle:active {
          cursor: grabbing;
        }
        #diceResizeHandle {
          position: absolute;
          bottom: 0; right: 0;
          width: 18px; height: 18px;
          background: linear-gradient(135deg, transparent 50%, rgba(73,73,73,1) 50%);
          cursor: nwse-resize;
          z-index: 100;
          border-radius: 0 0 16px 0;
        }
       #diceModalBox {
        padding: 28px 32px; flex: 1; min-width: 0; text-align: center; position: relative;
        overflow-y: auto; box-sizing: border-box;
      }
    #diceSidebar {
      width: 200px; flex-shrink: 0; border-left: 1px solid #3a3c42;
      display: flex; flex-direction: column; background: rgba(0,0,0,0.35);
      box-sizing: border-box;
    }
      #diceSidebar h4 {
        margin:0; padding:14px 16px 10px; color:#fff; font-size:13px;
        text-transform:uppercase; letter-spacing:.5px; border-bottom:1px solid #3a3c42;
      }
      #diceLeaderboardList { flex:1; overflow-y:auto; padding: 8px; display:flex; flex-direction:column; gap:6px; }
      .dice-lb-row {
        display:flex; align-items:center; gap:8px; padding:6px 8px; border-radius:8px;
        background:#1e1f22; border:1px solid #2b2d31;
      }
      .dice-lb-rank { width:16px; font-size:11px; font-weight:800; color:#72767d; flex-shrink:0; text-align:center; }
      .dice-lb-row:nth-child(1) .dice-lb-rank { color:#ffd700; }
      .dice-lb-row:nth-child(2) .dice-lb-rank { color:#c0c0c0; }
      .dice-lb-row:nth-child(3) .dice-lb-rank { color:#cd7f32; }
      .dice-lb-avatar { width:26px; height:26px; border-radius:50%; flex-shrink:0; object-fit:cover; }
      .dice-lb-name { flex:1; min-width:0; font-size:12px; color:#e6e6e7; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .dice-lb-payout { font-size:11px; font-weight:800; color:#23d160; flex-shrink:0; }
      .dice-empty { color:#72767d; font-size:12px; text-align:center; padding:20px 10px; }

      #diceBetToastWrap {
        position:absolute; top:8px; right:8px; z-index:20;
        display:flex; flex-direction:column; gap:6px; align-items:flex-end;
        pointer-events:none;
      }
      .dice-bet-toast {
        display:flex; align-items:center; gap:8px;
        background:rgba(0,0,0,0.85); border:1px solid #3a3c42; border-radius:20px;
        padding:5px 12px 5px 5px; font-size:11.5px; color:#fff;
        animation: diceToastIn .2s ease-out;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      }
      .dice-bet-toast.leaving { animation: diceToastOut .3s ease-in forwards; }
      .dice-bet-toast img { width:22px; height:22px; border-radius:50%; flex-shrink:0; }
      .dice-bet-toast .dice-toast-mult { font-weight:800; }
      .dice-bet-toast .dice-toast-mult.win { color:#23d160; }
      .dice-bet-toast .dice-toast-mult.loss { color:#ff5555; }
      @keyframes diceToastIn { from { opacity:0; transform: translateX(20px); } to { opacity:1; transform: translateX(0); } }
      @keyframes diceToastOut { from { opacity:1; transform: translateX(0); } to { opacity:0; transform: translateX(20px); } }

      @media (max-width: 640px) {
        #diceOuterBox { flex-direction: column; max-height: 94vh; max-width: 94vw; }
        #diceSidebar { width:100%; border-left:none; border-top:1px solid #3a3c42; max-height:180px; }
      }
      #diceModalBox h3 { margin: 0 0 4px; color: #fff; font-size: 20px; }
      #diceModalBox .dice-sub { color: #b9bbbe; font-size: 13px; margin-bottom: 18px; }
      #diceBalanceRow { display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom: 14px; }
      #diceBalance { color: #b9bbbe; font-size: 13px; }
      #diceAccountBadge {
        font-size: 11px; padding: 2px 8px; border-radius: 10px;
        background:#2b2d31; border:1px solid #3a3c42; color:#b9bbbe;
        cursor:pointer; user-select:none;
      }
      #diceAccountBadge.bonus {color:#fff; background:#FF0000;; }
      #diceRollDisplay {
        font-size: 40px; font-weight: 700; color: #fff; margin: 6px 0 16px;
        font-variant-numeric: tabular-nums;
        min-height: 50px; display: flex; align-items: center; justify-content: center;
      }
      #diceRollDisplay.win { color: #3ba55d; }
      #diceRollDisplay.lose { color: #ed4245; }
      #diceTrack {
        position: relative; height: 10px; border-radius: 6px;
        background: linear-gradient(to right, #3ba55d, #3ba55d);
        margin: 10px 0 6px;
      }
      #diceTrackFillLose { position: absolute; top:0; bottom:0; background: #ed4245; border-radius: 6px; }
      #diceMarker {
        position: absolute; top: -5px; width: 3px; height: 20px;
        background: #fff; border-radius: 2px; transform: translateX(-50%);
        transition: left 0.15s linear;
      }
      #diceTargetSlider { width: 100%; margin: 8px 0 4px; accent-color: #FF0000; }
      .dice-row { display: flex; gap: 10px; margin: 12px 0; }
      .dice-row > div { flex: 1; text-align: left; }
      .dice-row label { display:block; font-size: 12px; color:#b9bbbe; margin-bottom: 4px; }
      .dice-row input[type="number"] {
        width: 100%; padding: 9px 10px; background: #40444b; border: 1px solid #40444b;
        border-radius: 6px; color: #fff; font-size: 14px; box-sizing: border-box; outline: none;
      }
      #diceModeToggle { display: flex; border-radius: 6px; overflow: hidden; border: 1px solid #40444b; }
      #diceModeToggle button {
        flex: 1; padding: 9px 0; background: #40444b; border: none; color: #b9bbbe;
        font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s, color 0.15s;
      }
      #diceModeToggle button.active { background: #FF0000; color: #fff; }
      #diceStatsRow { display:flex; justify-content: space-between; font-size: 12px; color:#b9bbbe; margin: 4px 0 14px; }
      #diceRollBtn {
        width: 100%; padding: 12px; background: #FF0000; color: #fff; border: none;
        border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer;
        transition: background 0.2s;
      }
      #diceRollBtn:hover:not(:disabled) { background: #cc0000; }
      #diceRollBtn:disabled { background: #40444b; cursor: not-allowed; color: #72767d; }
      #diceResultText { min-height: 22px; margin-top: 10px; font-size: 14px; font-weight: 600; }
      #diceCloseBtn {
        margin-top: 14px; background: none; border: none; color: #72767d;
        cursor: pointer; font-size: 13px; text-decoration: underline;
      }
      #diceCloseBtn:hover { color: #fff; }
    `;
    document.head.appendChild(style);
  }

  function currentMultiplier() {
    const winChance = mode === "under" ? target : (100 - target);
    if (winChance <= 0) return 0;
    return (100 / winChance) * 0.99;
  }

  function sanitizeAvatar(src) {
    if (typeof window.sanitizeAvatar === "function") return window.sanitizeAvatar(src);
    return src || "/avatars/default1.png";
  }

  function showDiceBetToast(bet) {
    if (!modalEl) return;
    const wrap = modalEl.querySelector("#diceBetToastWrap");
    if (!wrap) return;

    const toast = document.createElement("div");
    toast.className = "dice-bet-toast";

    const img = document.createElement("img");
    img.src = sanitizeAvatar(bet.avatar);

    const text = document.createElement("span");
    text.appendChild(document.createTextNode(bet.username + " · "));

    const mult = document.createElement("span");
    mult.className = "dice-toast-mult " + (bet.won ? "win" : "loss");
    mult.textContent = `${bet.multiplier.toFixed(2)}x`;
    text.appendChild(mult);

    toast.appendChild(img);
    toast.appendChild(text);
    wrap.appendChild(toast);

    while (wrap.children.length > 5) {
      wrap.removeChild(wrap.firstChild);
    }

    setTimeout(() => {
      toast.classList.add("leaving");
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function renderDiceLeaderboard() {
    if (!modalEl) return;
    const listEl = modalEl.querySelector("#diceLeaderboardList");
    if (!listEl) return;
    listEl.innerHTML = "";
    if (!diceLeaderboardData.length) {
      listEl.innerHTML = `<div class="dice-empty">No data yet</div>`;
      return;
    }
    diceLeaderboardData.forEach((entry, i) => {
      const row = document.createElement("div");
      row.className = "dice-lb-row";

      const rank = document.createElement("div");
      rank.className = "dice-lb-rank";
      rank.textContent = "#" + (i + 1);

      const avatar = document.createElement("img");
      avatar.className = "dice-lb-avatar";
      avatar.src = sanitizeAvatar(entry.avatar);

      const name = document.createElement("div");
      name.className = "dice-lb-name";
      name.textContent = entry.username;

      const payout = document.createElement("div");
      payout.className = "dice-lb-payout";
      payout.textContent = "+" + entry.payout;

      row.appendChild(rank);
      row.appendChild(avatar);
      row.appendChild(name);
      row.appendChild(payout);
      listEl.appendChild(row);
    });
  }

  function render() {
    if (!modalEl) return;
    const balEl = modalEl.querySelector("#diceBalance");
    const badgeEl = modalEl.querySelector("#diceAccountBadge");
    const slider = modalEl.querySelector("#diceTargetSlider");
    const targetLabel = modalEl.querySelector("#diceTargetLabel");
    const winChanceEl = modalEl.querySelector("#diceWinChance");
    const multEl = modalEl.querySelector("#diceMultiplier");
    const rollBtn = modalEl.querySelector("#diceRollBtn");
    const underBtn = modalEl.querySelector("#diceModeUnder");
    const overBtn = modalEl.querySelector("#diceModeOver");
    const marker = modalEl.querySelector("#diceMarker");
    const fillLose = modalEl.querySelector("#diceTrackFillLose");

    balEl.textContent = `Balance: ${diceState.balance.toLocaleString()} chips`;
    if (badgeEl) {
      const acc = getAccount();
      badgeEl.textContent = acc === "bonus" ? "Bonus" : "Normal";
      badgeEl.classList.toggle("bonus", acc === "bonus");
    }

    slider.min = diceState.minTarget;
    slider.max = diceState.maxTarget;
    slider.value = target;
    targetLabel.textContent = target;

    const winChance = mode === "under" ? target : (100 - target);
    winChanceEl.textContent = `${winChance.toFixed(0)}% win chance`;
    multEl.textContent = `${currentMultiplier().toFixed(2)}x`;

    underBtn.classList.toggle("active", mode === "under");
    overBtn.classList.toggle("active", mode === "over");

    marker.style.left = `${target}%`;
    if (mode === "under") {
      fillLose.style.left = `${target}%`;
      fillLose.style.right = "0";
    } else {
      fillLose.style.left = "0";
      fillLose.style.right = `${100 - target}%`;
    }

    rollBtn.disabled = rolling;
    rollBtn.textContent = rolling ? "Rolling..." : "Roll";
  }

  window.openDiceModal = function openDiceModal() {
    injectStyles();
     if (typeof window.setGameStatus === "function") window.setGameStatus("Dice");
    if (modalEl) modalEl.remove();

    modalEl = document.createElement("div");
    modalEl.id = "diceModalOverlay";
    modalEl.innerHTML = `
      <div id="diceOuterBox">
      <div id="diceResizeHandle"></div>
      <div id="diceModalBox">
        <div id="diceBetToastWrap"></div>
        <div id="diceDragHandle">
          <h3>🎲 Dice</h3>
          <p class="dice-sub">Pick a target, bet, and roll - 0.00 to 99.99.</p>
        </div>
        <div id="diceBalanceRow">
          <span id="diceBalance">Loading...</span>
          <span id="diceAccountBadge">Normal</span>
        </div>

        <div id="diceRollDisplay">--.--</div>

        <div id="diceTrack">
          <div id="diceTrackFillLose"></div>
          <div id="diceMarker"></div>
        </div>
        <input type="range" id="diceTargetSlider" min="2" max="98" value="50" step="1">
        <div id="diceStatsRow">
          <span>Target: <b id="diceTargetLabel">50</b></span>
          <span id="diceWinChance">50% win chance</span>
          <span id="diceMultiplier">1.98x</span>
        </div>

        <div id="diceModeToggle">
          <button id="diceModeUnder" class="active">Roll Under</button>
          <button id="diceModeOver">Roll Over</button>
        </div>

        <div class="dice-row">
          <div>
            <label>Bet Amount</label>
            <input type="number" id="diceBetInput" min="1" value="1" step="1">
          </div>
        </div>

         <button id="diceRollBtn" disabled>Loading...</button>
        <div id="diceResultText"></div>
        <button id="diceCloseBtn">Close</button>
      </div>
      <div id="diceSidebar">
        <h4>🏆 Top Wins</h4>
        <div id="diceLeaderboardList"><div class="dice-empty">No data yet</div></div>
      </div>
      </div>
    `;
    document.body.appendChild(modalEl);
    setupDiceDragResize();
    modalEl.querySelector("#diceCloseBtn").onclick = () => {
      modalEl.remove();
      window.openGamesMenu();
      if (typeof window.clearGameStatus === "function") window.clearGameStatus("Dice");
    };


    modalEl.querySelector("#diceTargetSlider").addEventListener("input", (e) => {
      target = Number(e.target.value);
      render();
    });
    modalEl.querySelector("#diceModeUnder").onclick = () => { mode = "under"; render(); };
    modalEl.querySelector("#diceModeOver").onclick = () => { mode = "over"; render(); };
    modalEl.querySelector("#diceRollBtn").onclick = rollDice;
    modalEl.querySelector("#diceAccountBadge").onclick = () => {
      const next = getAccount() === "bonus" ? "normal" : "bonus";
      if (window.setSelectedAccount) window.setSelectedAccount(next);
      else window.selectedAccount = next;
      refreshDisplayedBalance();
    };

    const socket = getSocket();
    if (socket) {
      socket.emit("diceGetState");
      socket.emit("diceLeaderboardGet");   
    }

    refreshDisplayedBalance();
  };


  function setupDiceDragResize() {
    const box = modalEl.querySelector("#diceOuterBox");
    const header = modalEl.querySelector("#diceDragHandle");
    const resizeHandle = modalEl.querySelector("#diceResizeHandle");
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
      const maxWidth = Math.max(500, window.innerWidth - rect.left);
      const maxHeight = Math.max(360, window.innerHeight - rect.top);
      box.style.width = Math.max(500, Math.min(startWidth + (e.clientX - startX), maxWidth)) + "px";
      box.style.height = Math.max(360, Math.min(startHeight + (e.clientY - startY), maxHeight)) + "px";
    }
    });

    document.addEventListener("mouseup", () => {
      isDragging = false;
      isResizing = false;
    });
  }

  function rollDice() {
    if (rolling) return;
    const socket = getSocket();
    if (!socket) { showError("Not connected."); return; }

    const betInput = modalEl.querySelector("#diceBetInput");
    const amount = Math.floor(Number(betInput.value));

    if (!Number.isFinite(amount) || amount <= 0) {
      showError("Enter a valid bet amount.");
      return;
    }
    if (amount > diceState.balance) {
      showError("Insufficient balance.");
      return;
    }
    if (amount > diceState.maxBet) {
      showError(`Max bet is ${diceState.maxBet} chips.`);
      return;
    }

    rolling = true;
    modalEl.querySelector("#diceResultText").textContent = "";
    const displayEl = modalEl.querySelector("#diceRollDisplay");
    displayEl.className = "";
    render();

    let flickerCount = 0;
    clearInterval(rollAnimTimer);
    rollAnimTimer = setInterval(() => {
      displayEl.textContent = (Math.random() * 100).toFixed(2);
      flickerCount++;
      if (flickerCount > 40) clearInterval(rollAnimTimer); 
    }, 45);

    socket.emit("diceRoll", { amount, target, mode, account: getAccount() });
  }

  function showError(msg) {
    if (!modalEl) return;
    const resultEl = modalEl.querySelector("#diceResultText");
    resultEl.textContent = "❌ " + msg;
    resultEl.style.color = "#ed4245";
  }

  let pendingResult = null;

  function wireSocket() {
    const socket = getSocket();
    if (!socket) {
      setTimeout(wireSocket, 200);
      return;
    }
    socket.on("diceLeaderboardState", (data) => {
      diceLeaderboardData = data?.leaders || [];
      renderDiceLeaderboard();
    });

    socket.on("diceRecentBet", (data) => {
      showDiceBetToast(data);
    });

    socket.on("diceState", (data) => {
      normalBalance = data.balance;
      diceState = { ...diceState, ...data, balance: currentDisplayBalance() };
      render();
    });

    socket.on("bonusUpdate", () => {
      refreshDisplayedBalance();
    });

    socket.on("diceResult", (data) => {
      if (!modalEl) return;
      pendingResult = data;

      setTimeout(() => {
        clearInterval(rollAnimTimer);
        const displayEl = modalEl.querySelector("#diceRollDisplay");
        displayEl.textContent = data.roll.toFixed(2);
        displayEl.className = data.won ? "win" : "lose";
      }, 900);
    });

    socket.on("dicePayoutCredited", (data) => {
      if (!modalEl || !pendingResult) return;
      rolling = false;

      if (data.account !== "bonus" && typeof data.balance === "number") {
        normalBalance = data.balance;
      }
      refreshDisplayedBalance();

      const resultEl = modalEl.querySelector("#diceResultText");
      if (data.payoutChips > 0) {
        resultEl.textContent = `🎉 Won ${data.payoutChips} chips at ${pendingResult.multiplier.toFixed(2)}x!`;
        resultEl.style.color = "#3ba55d";
      } else {
        resultEl.textContent = `😬 Lost ${pendingResult.betChips} chips. Try again!`;
        resultEl.style.color = "#b9bbbe";
      }

      pendingResult = null;
      render();
    });

    socket.on("diceError", (data) => {
      rolling = false;
      clearInterval(rollAnimTimer);
      render();
      showError(data.msg || "Something went wrong.");
    });
  }

  wireSocket();
})();