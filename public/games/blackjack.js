

(function () {
  let bjState = null;
  let modalEl = null;
  let pendingBet = 0;
  let bjTimerDeadline = 0;  
  let bjTimerMode = null;    
  let bjTimerInterval = null; 

  function getSocket() {
    if (window.socket) return window.socket;
    try { if (typeof socket !== "undefined" && socket) return socket; } catch (e) {}
    return null;
  }

  function injectStyles() {
    if (document.getElementById("bjStyles")) return;
    const style = document.createElement("style");
    style.id = "bjStyles";
    style.textContent = `
      #bjModalBox {
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        width: 760px; max-width: 94vw; background: rgba(0, 0, 0, 0.875);
        border: 1px solid #3a3c42; border-radius: 16px; padding: 20px 24px 24px;
        font-family: 'Inter', system-ui, sans-serif; z-index: 30000;
      }

      .bj-seat-avatar {
  width: 36px; height: 36px; border-radius: 50%; border: 2px solid #40444b;
  object-fit: cover; margin: 4px auto 2px; display:block;
}
.bj-seat.turn .bj-seat-avatar { border-color: #FF0000; box-shadow: 0 0 8px #FF0000; }
      #bjHeader { display:flex; align-items:center; justify-content:space-between; cursor: move; margin-bottom: 10px; }
      #bjHeader h3 { margin: 0; color:#fff; font-size: 18px; }
      #bjCloseBtn { background:none; border:none; color:#72767d; font-size:18px; cursor:pointer; }
      #bjCloseBtn:hover { color:#fff; }

        #bjTableWrap {
            position: relative;
            width: 100%;
            height: 420px;
            margin: 8px 0 16px;
            background: radial-gradient(ellipse at center, #eb0000 0%, #070707 80%);
            border-radius: 200px / 140px;
            border: 10px solid #3a2415;
        }
      #bjDealerArea {
        position:absolute; top: 10%; left:50%; transform: translateX(-50%);
        display:flex; flex-direction:column; align-items:center; gap:6px;
      }
      #bjDealerLabel { font-size: 11px; color:#8fa896; text-transform:uppercase; letter-spacing:.05em; font-weight:700; }
      #bjDealerCards { display:flex; gap:5px; min-height: 68px; }
      #bjDealerTotal { font-size: 12px; color:#dfe3e8; font-weight:700; background:rgba(0,0,0,0.35); padding:2px 8px; border-radius:10px; }
      #bjStage {
        position:absolute; top: 8px; left: 50%; transform: translateX(-50%);
        font-size: 11px; color:#b9bbbe; text-transform: uppercase; letter-spacing: 0.05em;
      }
      #bjTimer {
        position:absolute; top: 8px; right: 14px;
        font-size: 12px; color:#ffd166; font-weight:700;
      }

      .bj-seat { position: absolute; width: 130px; text-align: center; transform: translate(-50%, -50%); }
      .bj-seat.turn .bj-seat-avatar-wrap { box-shadow: 0 0 10px #FF0000; border-color:#FF0000; }
      .bj-seat-name { font-size: 12px; color: #fff; font-weight: 600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .bj-seat-bet { font-size: 11px; color: #ffd166; margin-top: 2px; }
      .bj-cards { display:flex; gap:3px; justify-content:center; margin-top: 4px; min-height: 40px; }
      .bj-empty-seat {
        width: 42px; height: 42px; border-radius: 50%; border: 2px dashed #555;
        margin: 0 auto; display:flex; align-items:center; justify-content:center;
        cursor:pointer; color:#888; font-size: 18px; background: rgba(255,255,255,0.03);
      }
      .bj-empty-seat:hover { border-color:#FF0000; color:#FF0000; }

      .bj-card {
        width: 26px; height: 36px; border-radius: 4px; background:#f4f4f4;
        display:flex; flex-direction:column; align-items:center; justify-content:center;
        font-size: 11px; font-weight: 800;
        flex-shrink:0;
      }
      .bj-card.red { color:#e0142c; }
      .bj-card.black { color:#111; }
      .bj-card.back { background: repeating-linear-gradient(45deg,#a10000,#a10000 4px,#c40000 4px,#c40000 8px); }

      .bj-hand-total { font-size: 10px; color:#dfe3e8; font-weight:700; background:rgba(0,0,0,0.35); padding: 1px 6px; border-radius:8px; margin-top:2px; display:inline-block; }
      .bj-hand-result { font-size: 11px; font-weight: 800; margin-top: 2px; }
      .bj-hand-result.win { color:#4ade80; }
      .bj-hand-result.lose { color:#ff5555; }
      .bj-hand-result.push { color:#facc15; }

      #bjControls { display:flex; flex-direction:column; gap:10px; }
      #bjBetRow { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
      .bj-chip {
        width: 40px; height: 40px; border-radius: 50%; border: 2px dashed rgba(255,255,255,0.5);
        display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:800;
        color:#fff; cursor:pointer; transition: transform .1s; flex-shrink:0; user-select:none;
      }
      .bj-chip:hover { transform: scale(1.08); }
      .bj-chip[data-v="1"]   { background:#555; }
      .bj-chip[data-v="5"]   { background:#3b6ea5; }
      .bj-chip[data-v="25"]  { background:#2f8f4e; }
      .bj-chip[data-v="100"] { background:#1e1f22; border-color:#FF0000; color:#FF0000; }
      #bjClearBetBtn { background:#40444b; border:none; color:#fff; padding:8px 12px; border-radius:8px; cursor:pointer; font-size:12px; margin-left:auto; }
      #bjCurrentBet { color:#ffd700; font-weight:800; font-size:13px; min-width: 30px; }

      #bjActionRow { display:flex; gap:8px; }
      .bj-action-btn { flex:1; padding:10px 0; border-radius:8px; border:none; cursor:pointer; font-size:13px; font-weight:700; color:#fff; transition: filter .15s, opacity .15s; }
      .bj-action-btn:hover { filter:brightness(1.15); }
      .bj-action-btn:disabled { opacity:.35; cursor:not-allowed; filter:none; }
      #bjHitBtn    { background:#2f8f4e; }
      #bjStandBtn  { background:#3b6ea5; }
      #bjDoubleBtn { background:#a5763b; }

      #bjBuyInBox input[type="number"] { -moz-appearance: textfield; }
      #bjBuyInBox input[type="number"]::-webkit-outer-spin-button,
      #bjBuyInBox input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

      #bjSitPrompt { text-align:center; padding: 10px 0; color:#b9bbbe; font-size: 13px; }
      #bjLeaveBtn { margin-top: 10px; background:none; border:none; color:#72767d; font-size: 12px; cursor:pointer; text-decoration: underline; }
      #bjLeaveBtn:hover { color:#fff; }
      #bjErrorText { color:#ed4245; font-size: 12px; min-height: 16px; margin-top: 6px; text-align:center; }
      #bjHeaderBalance { color:#ffd166; font-size:13px; font-weight:400; }
    `;
    document.head.appendChild(style);
  }

  const SEAT_POSITIONS = [
    { top: "88%", left: "50%" },
    { top: "68%", left: "14%" },
    { top: "68%", left: "86%" },
    { top: "38%", left: "8%" },
    { top: "38%", left: "92%" }
  ];

  function cardHTML(card) {
    if (!card) return `<div class="bj-card back"></div>`;
    const isRed = card.s === "♥" || card.s === "♦";
    return `<div class="bj-card ${isRed ? "red" : "black"}"><div>${card.r}</div><div>${card.s}</div></div>`;
  }

  function cardValue(card) {
    if (card.r === "A") return 11;
    if (["K", "Q", "J"].includes(card.r)) return 10;
    return parseInt(card.r, 10);
  }
  function handTotal(hand) {
    let total = hand.reduce((sum, c) => sum + cardValue(c), 0);
    let aces = hand.filter((c) => c.r === "A").length;
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  function makeDraggable(header, box) {
    let dragging = false, offX = 0, offY = 0;
    header.addEventListener("mousedown", (e) => {
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
      box.style.top = `${e.clientY - offY}px`;
      box.style.left = `${e.clientX - offX}px`;
    });
    document.addEventListener("mouseup", () => { dragging = false; });
  }

  window.openBlackjack = function openBlackjack() {
    injectStyles();
     if (typeof window.setGameStatus === "function") window.setGameStatus("BlackJack");
    if (modalEl) modalEl.remove();

    modalEl = document.createElement("div");
    modalEl.id = "bjModalBox";
    modalEl.innerHTML = `
      <div id="bjHeader">
        <h3>🃏 Blackjack <span id="bjHeaderBalance"></span></h3>
        <button id="bjCloseBtn">✕</button>
      </div>

      <div id="bjTableWrap">
        <div id="bjStage">Waiting for players</div>
        <div id="bjTimer"></div>
        <div id="bjDealerArea">
          <div id="bjDealerLabel">Dealer</div>
          <div id="bjDealerCards"></div>
          <div id="bjDealerTotal"></div>
        </div>
        <div id="bjSeats"></div>
      </div>

      <div id="bjControls"></div>
      <div id="bjErrorText"></div>
    `;
    document.body.appendChild(modalEl);
    startBjTimerTick();

    modalEl.querySelector("#bjCloseBtn").onclick = () => {
    modalEl.remove();
    window.openGamesMenu();
    if (typeof window.clearGameStatus === "function") window.clearGameStatus("BlackJack");
    clearInterval(bjTimerInterval);  
    bjTimerInterval = null;
  };
    makeDraggable(modalEl.querySelector("#bjHeader"), modalEl);

    const socket = getSocket();
    if (socket) socket.emit("bjGetState");
    else waitForSocket();
    if (typeof window.clearGameStatus === "function") window.clearGameStatus("Blackjack");
  };

  function waitForSocket(attemptsLeft = 20) {
    const socket = getSocket();
    if (socket) { wireSocket(); socket.emit("bjGetState"); return; }
    if (attemptsLeft <= 0) { showError("Couldn't find a connection"); return; }
    setTimeout(() => waitForSocket(attemptsLeft - 1), 250);
  }

  function showError(msg) {
    if (!modalEl) return;
    modalEl.querySelector("#bjErrorText").textContent = msg ? "❌ " + msg : "";
  }

  function startBjTimerTick() {
  clearInterval(bjTimerInterval);
  bjTimerInterval = setInterval(() => {
    if (!modalEl || !bjState) return;
    const timerEl = modalEl.querySelector("#bjTimer");
    if (!timerEl || !bjTimerMode) { if (timerEl) timerEl.textContent = ""; return; }

    const msLeft = Math.max(0, bjTimerDeadline - Date.now());
    const secs = Math.ceil(msLeft / 1000);

    if (bjTimerMode === "betting") {
      timerEl.textContent = secs > 0 ? `${secs}s to bet` : "";
    } else if (bjTimerMode === "playing") {
      timerEl.textContent = secs > 0 ? `${secs}s` : "";
    }
  }, 100);
}

  function render() {
    if (!modalEl || !bjState) return;
    showError("");

    const stageEl = modalEl.querySelector("#bjStage");
    const timerEl = modalEl.querySelector("#bjTimer");
    const dealerCardsEl = modalEl.querySelector("#bjDealerCards");
    const dealerTotalEl = modalEl.querySelector("#bjDealerTotal");
    const seatsEl = modalEl.querySelector("#bjSeats");
    const controlsEl = modalEl.querySelector("#bjControls");
    const headerBalanceEl = modalEl.querySelector("#bjHeaderBalance");

    const stageLabels = { waiting: "Waiting for players", betting: "Place your bets", playing: "Playing", dealer: "Dealer's turn", results: "Round over" };
    stageEl.textContent = stageLabels[bjState.stage] || bjState.stage;

    if (headerBalanceEl && bjState.yourBalance != null) {
      headerBalanceEl.textContent = `· ${bjState.yourBalance.toLocaleString()} chips`;
    }

    if (bjState.stage === "betting" && bjState.bettingMsLeft > 0) {
      bjTimerMode = "betting";
      bjTimerDeadline = Date.now() + bjState.bettingMsLeft;
    } else if (bjState.stage === "playing" && bjState.turnMsLeft > 0) {
      bjTimerMode = "playing";
      bjTimerDeadline = Date.now() + bjState.turnMsLeft;
    } else {
      bjTimerMode = null;
      timerEl.textContent = "";
    }

    const dh = bjState.dealerHand || [];
    dealerCardsEl.innerHTML = dh.map(c => cardHTML(c)).join("");
    if (dh.length) {
      if (bjState.dealerHoleHidden) {
        dealerTotalEl.textContent = dh[0] ? `${cardValue(dh[0])} + ?` : "";
      } else {
        dealerTotalEl.textContent = String(handTotal(dh));
      }
    } else {
      dealerTotalEl.textContent = "";
    }

    seatsEl.innerHTML = "";
    bjState.seats.forEach((seat, i) => {
      const pos = SEAT_POSITIONS[i];
      const wrapper = document.createElement("div");
      wrapper.style.top = pos.top;
      wrapper.style.left = pos.left;

      if (!seat) {
        wrapper.className = "bj-seat";
        wrapper.innerHTML = `<div class="bj-empty-seat" title="Sit here">+</div>`;
        wrapper.querySelector(".bj-empty-seat").onclick = () => {
          const socket = getSocket();
          if (socket) socket.emit("bjSit", { seatIndex: i });
        };
      } else {
  wrapper.className = "bj-seat" + (seat.isTurn ? " turn" : "");
  const hand = seat.hand || [];
  const total = hand.length ? handTotal(hand) : 0;
  wrapper.innerHTML = `
    <div class="bj-cards">${hand.map(c => cardHTML(c)).join("")}</div>
    ${hand.length ? `<div class="bj-hand-total">${total > 21 ? total + " Bust" : total}</div>` : ""}
    <img class="bj-seat-avatar" src="${seat.avatar}" alt="">
    <div class="bj-seat-name">${escapeHtml(seat.username)}</div>
    ${seat.bet > 0 ? `<div class="bj-seat-bet">Bet: ${seat.bet}</div>` : ""}
    ${seat.result ? `<div class="bj-hand-result ${seat.result.type}">${escapeHtml(seat.result.text)}</div>` : ""}
  `;
}
      seatsEl.appendChild(wrapper);
    });

    renderControls(controlsEl);
  }

 function renderControls(controlsEl) {
    const mySeatIndex = bjState.yourSeatIndex;
    if (mySeatIndex === -1 || mySeatIndex === undefined) {
      controlsEl.innerHTML = `<div id="bjSitPrompt">Click an empty seat to sit down and join the table.</div>`;
      return;
    }

    const seat = bjState.seats[mySeatIndex];
    if (!seat) { controlsEl.innerHTML = ""; return; }

    const canBet = (bjState.stage === "waiting" || bjState.stage === "betting") && seat.bet === 0;
    const isMyTurn = bjState.stage === "playing" && seat.isTurn && !seat.done;
    const canDouble = isMyTurn && (seat.hand || []).length === 2;

    if (canBet) {
      const maxChips = Math.max(0, bjState.yourBalance ?? 0);
      const sliderMax = Math.max(maxChips, pendingBet, 1);
      if (pendingBet > maxChips) pendingBet = maxChips;

      controlsEl.innerHTML = `
        <div id="bjBetRow">
          <span style="color:#b9bbbe; font-size:12px;">Bet:</span>
          <div class="bj-chip" data-v="1">1</div>
          <div class="bj-chip" data-v="5">5</div>
          <div class="bj-chip" data-v="25">25</div>
          <div class="bj-chip" data-v="100">100</div>
          <span id="bjCurrentBet">${pendingBet}</span>
          <button id="bjClearBetBtn">Clear</button>
          <button id="bjPlaceBetBtn" style="background:#FF0000;border:none;color:#fff;padding:9px 16px;border-radius:8px;font-weight:700;cursor:pointer;">Place Bet</button>
        </div>
        <div id="bjBetSliderRow" style="display:flex; align-items:center; gap:10px; margin-top:4px;">
          <span style="color:#72767d; font-size:11px; flex-shrink:0;">0</span>
          <input id="bjBetSlider" type="range" min="0" max="${sliderMax}" step="1" value="${pendingBet}"
            style="flex:1; accent-color:#FF0000; cursor:pointer;">
          <span style="color:#72767d; font-size:11px; flex-shrink:0;">${maxChips.toLocaleString()}</span>
        </div>
        <button id="bjLeaveBtn">Leave table</button>
      `;

      const betLabel = controlsEl.querySelector("#bjCurrentBet");
      const slider = controlsEl.querySelector("#bjBetSlider");

      controlsEl.querySelectorAll(".bj-chip").forEach(chip => {
        chip.onclick = () => {
          const v = parseInt(chip.dataset.v, 10);
          if (v > maxChips - pendingBet) return;
          pendingBet += v;
          betLabel.textContent = pendingBet;
          slider.max = Math.max(maxChips, pendingBet, 1);
          slider.value = pendingBet;
        };
      });

      slider.oninput = () => {
        pendingBet = parseInt(slider.value, 10) || 0;
        betLabel.textContent = pendingBet;
      };

      controlsEl.querySelector("#bjClearBetBtn").onclick = () => {
        pendingBet = 0;
        betLabel.textContent = "0";
        slider.value = 0;
      };
      controlsEl.querySelector("#bjPlaceBetBtn").onclick = () => {
        const socket = getSocket();
        if (!socket || pendingBet <= 0) return;
        socket.emit("bjPlaceBet", { amount: pendingBet });
      };
      controlsEl.querySelector("#bjLeaveBtn").onclick = () => {
        const socket = getSocket();
        if (socket) { socket.emit("bjLeave"); socket.emit("bjGetState"); }
      };
      return;
    }

    controlsEl.innerHTML = `
      <div id="bjActionRow">
        <button id="bjHitBtn" class="bj-action-btn" ${isMyTurn ? "" : "disabled"}>Hit</button>
        <button id="bjStandBtn" class="bj-action-btn" ${isMyTurn ? "" : "disabled"}>Stand</button>
        <button id="bjDoubleBtn" class="bj-action-btn" ${canDouble ? "" : "disabled"}>Double</button>
      </div>
      <button id="bjLeaveBtn">Leave table</button>
    `;
    controlsEl.querySelector("#bjHitBtn").onclick = () => { const s = getSocket(); if (s) s.emit("bjHit"); };
    controlsEl.querySelector("#bjStandBtn").onclick = () => { const s = getSocket(); if (s) s.emit("bjStand"); };
    controlsEl.querySelector("#bjDoubleBtn").onclick = () => { const s = getSocket(); if (s) s.emit("bjDouble"); };
    controlsEl.querySelector("#bjLeaveBtn").onclick = () => {
      const socket = getSocket();
      if (socket) { socket.emit("bjLeave"); socket.emit("bjGetState"); }
    };
  }

  let listenersBound = false;
  function wireSocket() {
    const socket = getSocket();
    if (!socket) { setTimeout(wireSocket, 200); return; }
    if (listenersBound) return;
    listenersBound = true;

    socket.on("bjState", (data) => { bjState = data; render(); });
    socket.on("bjSpectatorState", (data) => {
      if (bjState && bjState.yourSeatIndex !== -1) return;
      bjState = data;
      render();
    });
    socket.on("bjError", (data) => showError(data?.msg || "Something went wrong."));
  }

  wireSocket();
})();