

(function () {
  let pokerState = null;
  let modalEl = null;
  let myUserId = null; 
  let raiseTotal = 0;

  function resolveMyUserId() {
    if (window.currentUser?.id) return window.currentUser.id;
    if (window.myUserId) return window.myUserId;
    return myUserId;
  }

  function injectStyles() {
    if (document.getElementById("pokerStyles")) return;
    const style = document.createElement("style");
    style.id = "pokerStyles";
    style.textContent = `
      #pokerModalBox {
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        width: 720px; max-width: 94vw; background: rgba(0, 0, 0, 0.875);
        border: 1px solid #40444b; border-radius: 16px; padding: 20px 24px 24px;
        color: #dcddde;
        font-family: 'Inter', system-ui, sans-serif; z-index: 30000;
      }
      #pokerHeader { display:flex; align-items:center; justify-content:space-between; cursor: move; margin-bottom: 10px; }
      #pokerHeader h3 { margin: 0; color:#fff; font-size: 18px; }
      #pokerCloseBtn { background:none; border:none; color:#72767d; font-size:18px; cursor:pointer; }
      #pokerCloseBtn:hover { color:#fff; }

        #pokerTableWrap {
            position: relative;
            width: 100%;
            height: 380px;
            margin: 8px 0 16px;
            border-radius: 200px / 130px;
            border: 10px solid #3a2415;
            background: radial-gradient(ellipse at center, #eb0000 0%, #070707 80%);
        }
      .poker-seat {
        position: absolute; width: 110px; text-align: center; transform: translate(-50%, -50%);
      }
      .poker-seat-avatar {
        width: 40px; height: 40px; border-radius: 50%; border: 2px solid #40444b;
        object-fit: cover; margin: 0 auto 2px; display:block;
      }
        #pokerBuyInBox input[type="number"] {
         -moz-appearance: textfield;
        }
        #pokerBuyInBox input[type="number"]::-webkit-outer-spin-button,
        #pokerBuyInBox input[type="number"]::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
        }
      .poker-seat.turn .poker-seat-avatar { border-color: #FF0000; box-shadow: 0 0 8px #FF0000; }
      .poker-seat-name { font-size: 12px; color: #fff; font-weight: 600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .poker-seat-chips { font-size: 11px; color: #b9bbbe; }
      .poker-seat-bet { font-size: 11px; color: #ffd166; margin-top: 2px; }
      .poker-seat-cards { display:flex; gap:3px; justify-content:center; margin-top: 3px; }
      .poker-seat.folded { opacity: 0.4; }
      .poker-empty-seat {
        width: 40px; height: 40px; border-radius: 50%; border: 2px dashed #555;
        margin: 0 auto; display:flex; align-items:center; justify-content:center;
        cursor:pointer; color:#888; font-size: 18px; background: rgba(255,255,255,0.03);
      }
      .poker-empty-seat:hover { border-color:#FF0000; color:#FF0000; }

      .poker-card {
        width: 26px; height: 36px; border-radius: 4px; background:#fff;
        display:flex; align-items:center; justify-content:center;
        font-size: 12px; font-weight: 700;
      }
      .poker-card.red { color:#d0021b; }
      .poker-card.black { color:#1a1a1a; }
      .poker-card.hidden { background: repeating-linear-gradient(45deg,#7a1e1e,#7a1e1e 4px,#5c1414 4px,#5c1414 8px); }

      #pokerCommunity { position:absolute; top:50%; left:50%; transform: translate(-50%,-50%); display:flex; gap:6px; }
      #pokerPot {
        position:absolute; top: calc(50% - 34px); left:50%; transform: translateX(-50%);
        font-size: 13px; color:#ffd166; font-weight:600; background: rgba(0,0,0,0.4);
        padding: 3px 10px; border-radius: 10px;
      }
      #pokerStage {
        position:absolute; top: 8px; left: 50%; transform: translateX(-50%);
        font-size: 11px; color:#b9bbbe; text-transform: uppercase; letter-spacing: 0.05em;
      }

      #pokerActionBar { display:flex; gap:8px; align-items:center; flex-wrap: wrap; }
      #pokerActionBar button {
        padding: 10px 16px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600;
        cursor: pointer; transition: background 0.15s;
      }
      #pokerFoldBtn { background:#40444b; color:#fff; }
      #pokerFoldBtn:hover { background:#54585f; }
      #pokerCheckCallBtn { background:#3ba55d; color:#fff; }
      #pokerCheckCallBtn:hover { background:#2f8a4b; }
      #pokerRaiseBtn { background:#FF0000; color:#fff; }
      #pokerRaiseBtn:hover { background:#cc0000; }
      #pokerActionBar button:disabled { background:#2b2d31; color:#555; cursor:not-allowed; }
      #pokerRaiseSlider { flex: 1; min-width: 140px; accent-color:#FF0000; }
      #pokerRaiseAmount { color:#ffd166; font-weight:600; font-size: 13px; min-width: 70px; text-align:right; }

      #pokerSitPrompt { text-align:center; padding: 10px 0; color:#b9bbbe; font-size: 13px; }
      #pokerBuyInBox { display:flex; gap:8px; justify-content:center; margin-top: 8px; }
      #pokerBuyInBox input {
        width: 120px; padding: 8px 10px; background:#40444b; border:1px solid #40444b;
        border-radius:6px; color:#fff; font-size: 13px; text-align:center;
      }
      #pokerBuyInBox button {
        padding: 8px 16px; background:#FF0000; border:none; border-radius:6px;
        color:#fff; font-weight:600; cursor:pointer;
      }
      #pokerLeaveBtn {
        margin-top: 10px; background:none; border:none; color:#72767d;
        font-size: 12px; cursor:pointer; text-decoration: underline;
      }
      #pokerLeaveBtn:hover { color:#fff; }
      #pokerErrorText { color:#ed4245; font-size: 12px; min-height: 16px; margin-top: 6px; text-align:center; }
    `;
    document.head.appendChild(style);
  }


  const SEAT_POSITIONS = [
    { top: "92%", left: "50%" },
    { top: "72%", left: "12%" },
    { top: "28%", left: "12%" },
    { top: "6%",  left: "50%" },
    { top: "28%", left: "88%" },
    { top: "72%", left: "88%" }
  ];

  function cardHTML(card, hidden) {
    if (hidden || !card) return `<div class="poker-card hidden"></div>`;
    const RANK_NAMES = { 11: "J", 12: "Q", 13: "K", 14: "A" };
    const label = RANK_NAMES[card.rank] || card.rank;
    const isRed = card.suit === "♥" || card.suit === "♦";
    return `<div class="poker-card ${isRed ? "red" : "black"}">${label}${card.suit}</div>`;
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

  window.openPokerModal = function openPokerModal() {
     if (typeof window.setGameStatus === "function") window.setGameStatus("Poker");
    injectStyles();
    if (modalEl) modalEl.remove();

    modalEl = document.createElement("div");
    modalEl.id = "pokerModalBox";
    modalEl.innerHTML = `
      <div id="pokerHeader">
        <h3>♠️ Poker Table <span id="pokerHeaderBalance" style="color:#ffd166; font-size:13px; font-weight:400;"></span></h3>
        <button id="pokerCloseBtn">✕</button>
      </div>

      <div id="pokerTableWrap">
        <div id="pokerStage">Waiting for players</div>
        <div id="pokerPot"></div>
        <div id="pokerCommunity"></div>
        <div id="pokerSeats"></div>
      </div>

      <div id="pokerControls"></div>
      <div id="pokerErrorText"></div>
    `;
    document.body.appendChild(modalEl);

    modalEl.querySelector("#pokerCloseBtn").onclick = () => {
    modalEl.remove();
    window.openGamesMenu();
    if (typeof window.clearGameStatus === "function") window.clearGameStatus("Poker");
    }
    makeDraggable(modalEl.querySelector("#pokerHeader"), modalEl);

    socket.emit("pokerGetState");
  };

  function showError(msg) {
    if (!modalEl) return;
    modalEl.querySelector("#pokerErrorText").textContent = msg ? "❌ " + msg : "";
  }

  function render() {
    if (!modalEl || !pokerState) return;
    showError("");

    const stageEl = modalEl.querySelector("#pokerStage");
    const potEl = modalEl.querySelector("#pokerPot");
    const communityEl = modalEl.querySelector("#pokerCommunity");
    const seatsEl = modalEl.querySelector("#pokerSeats");
    const controlsEl = modalEl.querySelector("#pokerControls");

    const stageLabels = { waiting: "Waiting for players", preflop: "Pre-Flop", flop: "Flop", turn: "Turn", river: "River", showdown: "Showdown" };
    stageEl.textContent = stageLabels[pokerState.stage] || pokerState.stage;

    const headerBalanceEl = modalEl.querySelector("#pokerHeaderBalance");
    if (headerBalanceEl && pokerState.yourBalance != null) {
      headerBalanceEl.textContent = `· ${pokerState.yourBalance.toLocaleString()} chips`;
    }

    const totalPot = (pokerState.pots || []).reduce((sum, p) => sum + p.amount, 0)
      || pokerState.seats.reduce((sum, s) => sum + (s ? s.totalBet : 0), 0);
    potEl.textContent = totalPot > 0 ? `Pot: ${totalPot.toLocaleString()}` : "";

    communityEl.innerHTML = pokerState.community.map(c => cardHTML(c, false)).join("");

    seatsEl.innerHTML = "";
    pokerState.seats.forEach((seat, i) => {
      const pos = SEAT_POSITIONS[i];
      const wrapper = document.createElement("div");
      wrapper.style.top = pos.top;
      wrapper.style.left = pos.left;

      if (!seat) {
        wrapper.className = "poker-seat";
        wrapper.innerHTML = `<div class="poker-empty-seat" title="Sit here">+</div>`;
        wrapper.querySelector(".poker-empty-seat").onclick = () => promptBuyIn(i);
      } else {
        wrapper.className = "poker-seat" + (seat.folded ? " folded" : "") + (seat.isTurn ? " turn" : "");
        const isMe = seat.userId === resolveMyUserId();
        wrapper.innerHTML = `
          <div class="poker-seat-cards">${(seat.cards || []).map(c => cardHTML(c, !c && !isMe)).join("")}</div>
          <img class="poker-seat-avatar" src="${seat.avatar}" alt="">
          <div class="poker-seat-name">${escapeHtml(seat.username)}${isMe ? " (you)" : ""}</div>
          <div class="poker-seat-chips">${seat.chips.toLocaleString()} chips</div>
          ${seat.betThisRound > 0 ? `<div class="poker-seat-bet">Bet: ${seat.betThisRound}</div>` : ""}
          ${seat.allIn ? `<div class="poker-seat-bet">ALL IN</div>` : ""}
          ${seat.folded ? `<div class="poker-seat-bet">Folded</div>` : ""}
        `;
      }
      seatsEl.appendChild(wrapper);
    });

    renderControls(controlsEl);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  function promptBuyIn(seatIndex) {
    if (!modalEl) return;
      if (pokerState.yourBalance == null) {
    socket.emit("pokerGetState"); 
    return;
    }
    const controlsEl = modalEl.querySelector("#pokerControls");
    const balance = pokerState.yourBalance ?? 0;
    const minBuyIn = pokerState.minBuyIn ?? 1;
    const maxBuyInAllowed = pokerState.maxBuyIn ?? 500;
    const maxBuyIn = Math.min(maxBuyInAllowed, balance);
    const defaultBuyIn = Math.min(Math.max(minBuyIn, Math.round(maxBuyInAllowed / 10)), maxBuyIn || minBuyIn);

    controlsEl.innerHTML = `
      <div id="pokerSitPrompt">
        Your balance: <b style="color:#ffd166">${balance.toLocaleString()} chips</b><br>
        Buy in for seat ${seatIndex + 1} (${minBuyIn} – ${maxBuyInAllowed} chips)
        <div id="pokerBuyInBox">
          <input type="number" id="pokerBuyInInput" min="${minBuyIn}" max="${maxBuyIn}" value="${defaultBuyIn}" step="1">
          <button id="pokerBuyInConfirm">Sit Down</button>
        </div>
        ${balance < minBuyIn ? `<div style="color:#ed4245; font-size:12px; margin-top:6px;">You need at least ${minBuyIn} chips to sit down.</div>` : ""}
      </div>
    `;
    controlsEl.querySelector("#pokerBuyInConfirm").onclick = () => {
      const buyIn = Math.floor(Number(controlsEl.querySelector("#pokerBuyInInput").value));
      socket.emit("pokerSit", { seatIndex, buyIn });
    };
    if (balance < minBuyIn) {
      controlsEl.querySelector("#pokerBuyInConfirm").disabled = true;
      controlsEl.querySelector("#pokerBuyInInput").disabled = true;
    }
  }

  function renderControls(controlsEl) {
    const mySeatIndex = pokerState.yourSeatIndex;
    if (mySeatIndex === -1 || mySeatIndex === undefined) {
      controlsEl.innerHTML = `<div id="pokerSitPrompt">Click an empty seat to sit down and join the table.</div>`;
      return;
    }

    const seat = pokerState.seats[mySeatIndex];
    if (!seat) { controlsEl.innerHTML = ""; return; }

    const isMyTurn = seat.isTurn && !seat.folded && !seat.allIn && pokerState.stage !== "waiting" && pokerState.stage !== "showdown";
    const toCall = pokerState.currentBet - seat.betThisRound;
    const canCheck = toCall <= 0;

    const minRaiseTotal = pokerState.currentBet + pokerState.minRaise;
    const maxRaiseTotal = seat.chips + seat.betThisRound;
    if (!raiseTotal || raiseTotal < minRaiseTotal) raiseTotal = Math.min(minRaiseTotal, maxRaiseTotal);

    controlsEl.innerHTML = `
      <div id="pokerActionBar">
        <button id="pokerFoldBtn" ${isMyTurn ? "" : "disabled"}>Fold</button>
        <button id="pokerCheckCallBtn" ${isMyTurn ? "" : "disabled"}>${canCheck ? "Check" : `Call ${toCall}`}</button>
        <input type="range" id="pokerRaiseSlider" min="${minRaiseTotal}" max="${Math.max(maxRaiseTotal, minRaiseTotal)}" value="${raiseTotal}" ${isMyTurn && maxRaiseTotal > minRaiseTotal ? "" : "disabled"}>
        <span id="pokerRaiseAmount">${raiseTotal}</span>
        <button id="pokerRaiseBtn" ${isMyTurn ? "" : "disabled"}>${toCall > 0 ? "Raise" : "Bet"}</button>
      </div>
      <button id="pokerLeaveBtn">Leave table (cash out ${seat.chips.toLocaleString()} chips)</button>
    `;

    controlsEl.querySelector("#pokerFoldBtn").onclick = () => socket.emit("pokerAction", { action: "fold" });
    controlsEl.querySelector("#pokerCheckCallBtn").onclick = () => socket.emit("pokerAction", { action: canCheck ? "check" : "call" });
    controlsEl.querySelector("#pokerRaiseSlider").oninput = (e) => {
      raiseTotal = Number(e.target.value);
      controlsEl.querySelector("#pokerRaiseAmount").textContent = raiseTotal;
    };
    controlsEl.querySelector("#pokerRaiseBtn").onclick = () => {
      const raiseAmountAboveCurrentBet = raiseTotal - pokerState.currentBet;
      socket.emit("pokerAction", { action: "raise", amount: raiseAmountAboveCurrentBet });
    };
    controlsEl.querySelector("#pokerLeaveBtn").onclick = () => socket.emit("pokerLeave");
  }


  function wireSocket() {
    if (typeof socket === "undefined" || !socket) {
      setTimeout(wireSocket, 200);
      return;
    }
    socket.on("pokerHandResult", (data) => {
  if (!modalEl) return;
  const el = document.createElement("div");
  const text = data.folded
    ? "You folded"
    : data.won
      ? `You won ${data.amountWon}${data.handName ? " with " + data.handName : ""}!`
      : `You lost${data.handName ? " (" + data.handName + ")" : ""}`;
  el.textContent = text;
  el.style.cssText = `
    position:absolute; top:8px; right:8px; padding:6px 12px; border-radius:8px;
    font-size:13px; font-weight:600; color:#fff; z-index:10;
    background:${data.won ? "#3ba55d" : "#ed4245"};
  `;
  modalEl.querySelector("#pokerTableWrap").appendChild(el);
  setTimeout(() => el.remove(), 4500);
});

    socket.on("pokerState", (data) => {
      pokerState = data;
      render();
    });
    socket.on("pokerSpectatorState", (data) => {
      if (pokerState && pokerState.yourSeatIndex !== -1) return;
      pokerState = data;
      render();
    });
    socket.on("pokerError", (data) => {
      showError(data.msg || "Something went wrong.");
    });
  }

  wireSocket();
})();