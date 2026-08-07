(function () {
  window.bonusState = { bonusXp: 0, bonusChips: 0, wagered: 0, required: 0, claimable: false };
  window.selectedAccount = "normal"; 

  function initBonusAccount(socket) {
    window.socket = socket;

    socket.on("bonusUpdate", (state) => {
      window.bonusState = state;
      refreshGlobalUI();
    });

    socket.on("bonusClaimed", (data) => {
      showToast(`✅ Claimed ${data.claimedXp} bonus XP!`);
    });

    socket.on("bonusClaimError", (data) => {
      showToast(`❌ ${data.msg}`);
    });

    socket.emit("bonusGetState");
  }

  function showToast(msg) {
    if (window.showSystemToast) return window.showSystemToast(msg);
    console.log(msg);
  }

  function refreshGlobalUI() {
    const chipsEl = document.getElementById("bonusChipsVal");
    if (chipsEl) chipsEl.textContent = window.bonusState.bonusChips.toLocaleString();

    const progress = document.getElementById("bonusClaimProgress");
    const btn = document.getElementById("bonusClaimBtn");
    if (progress) {
      const pct = window.bonusState.required > 0
        ? Math.min(100, Math.floor((window.bonusState.wagered / window.bonusState.required) * 100))
        : 0;
      progress.textContent = `${pct}% wagered (${window.bonusState.wagered}/${window.bonusState.required} XP)`;
    }
    if (btn) btn.disabled = !window.bonusState.claimable;

    document.querySelectorAll(".global-account-toggle-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.account === window.selectedAccount);
    });
  }

  window.setSelectedAccount = function (val) {
    window.selectedAccount = val === "bonus" ? "bonus" : "normal";
    refreshGlobalUI();
  };


  window.buildGlobalBonusWidget = function () {
    const wrap = document.createElement("div");
    wrap.id = "globalBonusWidget";
    wrap.style.cssText = `
      background:rgba(0, 0, 0, 0.9); border:none; border-radius:10px;
      padding:12px 14px; margin-bottom:10px; font-size:12px; color:#b9bbbe;
    `;
    wrap.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span style="font-weight:600; color:#fff;">Wallet</span>
        <div style="display:flex; gap:6px;">
          <button class="global-account-toggle-btn" data-account="normal" style="
            background:#2b2d31; border:none; color:#fff; padding:5px 10px;
            border-radius:6px; cursor:pointer; font-size:12px; font-weight:600;
          ">Normal</button>
          <button class="global-account-toggle-btn" data-account="bonus" style="
            background:#2b2d31; border:none; color:#fff; padding:5px 10px;
            border-radius:6px; cursor:pointer; font-size:12px; font-weight:600;
          ">Bonus (<span id="bonusChipsVal">0</span>)</button>
        </div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span id="bonusClaimProgress">0% wagered (0/0 XP)</span>
        <button id="bonusClaimBtn" disabled style="
          background:#FF0000; border:none; color:#fff; padding:6px 12px;
          border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;
        ">Claim</button>
      </div>
      <style>
        .global-account-toggle-btn.active {background:#FF0000 !important; }
        #bonusClaimBtn:disabled { opacity:.5; cursor:not-allowed; }
      </style>
    `;

    wrap.querySelectorAll(".global-account-toggle-btn").forEach((btn) => {
      btn.onclick = () => window.setSelectedAccount(btn.dataset.account);
    });
    wrap.querySelector("#bonusClaimBtn").onclick = () => {
      if (window.socket) window.socket.emit("bonusClaim");
    };

    refreshGlobalUI();
    return wrap;
  };

  window.initBonusAccount = initBonusAccount;
  window.refreshGlobalUI = refreshGlobalUI;
})();