

(function () {
  let wheelState = { spinsLeft: 3, spinsPerDay: 3, segments: [] };
  let spinning = false;
  let modalEl = null;
  let currentRotation = 0;

  const COLORS = ["#FF0000", "#cc0000", "#2b2d31", "#40444b", "#FF0000", "#cc0000", "#2b2d31", "#40444b"];

  function injectStyles() {
    if (document.getElementById("wheelStyles")) return;
    const style = document.createElement("style");
    style.id = "wheelStyles";
    style.textContent = `
      #wheelModalOverlay {
        position: fixed; inset: 0; background: rgba(0, 0, 0, 0);
        display: flex; align-items: center; justify-content: center;
        z-index: 30000; font-family: 'Inter', system-ui, sans-serif;
      }
      #wheelModalBox {
        background: rgba(0, 0, 0, 0.875);; border: 1px solid #40444b; border-radius: 16px;
        padding: 28px 32px; width: 360px; text-align: center;
      }
      #wheelModalBox h3 { margin: 0 0 4px; color: #fff; font-size: 20px; }
      #wheelModalBox .wheel-sub { color: #b9bbbe; font-size: 13px; margin-bottom: 18px; }
      #wheelCanvasWrap { position: relative; width: 260px; height: 260px; margin: 0 auto 18px; }
      #wheelPointer {
        position: absolute; top: -6px; left: 50%; transform: translateX(-50%);
        width: 0; height: 0; border-left: 12px solid transparent;
        border-right: 12px solid transparent; border-top: 20px solid #FF0000;
        z-index: 2; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.5));
      }
      #wheelCanvas { transition: transform 4.5s cubic-bezier(0.12, 0.72, 0.15, 1); }
      #wheelSpinBtn {
        width: 100%; padding: 12px; background: #FF0000; color: #fff; border: none;
        border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer;
        transition: background 0.2s;
      }
      #wheelSpinBtn:hover:not(:disabled) { background: #cc0000; }
      #wheelSpinBtn:disabled { background: #40444b; cursor: not-allowed; color: #72767d; }
      #wheelSpinsLeft { margin: 10px 0; color: #b9bbbe; font-size: 13px; }
      #wheelResultText { min-height: 24px; margin-top: 12px; font-size: 16px; font-weight: 600; }
      #wheelCloseBtn {
        margin-top: 14px; background: none; border: none; color: #72767d;
        cursor: pointer; font-size: 13px; text-decoration: underline;
      }
      #wheelCloseBtn:hover { color: #fff; }
    `;
    document.head.appendChild(style);
  }

  function drawWheel(canvas, segments) {
    const ctx = canvas.getContext("2d");
    const size = canvas.width;
    const cx = size / 2, cy = size / 2, r = size / 2 - 4;
    const n = segments.length || 1;
    const arc = (2 * Math.PI) / n;

    ctx.clearRect(0, 0, size, size);

    segments.forEach((seg, i) => {
      const start = i * arc - Math.PI / 2;
      const end = start + arc;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, end);
      ctx.closePath();
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fill();
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(start + arc / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px Inter, sans-serif";
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 3;
      ctx.fillText(seg.label || "", r - 12, 4);
      ctx.restore();
    });

    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, 2 * Math.PI);
    ctx.fillStyle = "#fff";
    ctx.fill();
  }

  function render() {
    if (!modalEl) return;
    const canvas = modalEl.querySelector("#wheelCanvas");
    const spinsEl = modalEl.querySelector("#wheelSpinsLeft");
    const btn = modalEl.querySelector("#wheelSpinBtn");

    drawWheel(canvas, wheelState.segments);
    spinsEl.textContent = `${wheelState.spinsLeft} / ${wheelState.spinsPerDay} spins left today`;

    if (wheelState.spinsLeft <= 0 || spinning) {
      btn.disabled = true;
      btn.textContent = spinning ? "Spinning..." : "No spins left";
    } else {
      btn.disabled = false;
      btn.textContent = "Spin the Wheel";
    }
  }

  window.openWheelModal = function openWheelModal() {
     if (typeof window.setGameStatus === "function") window.setGameStatus("Wheel");
    injectStyles();
    if (modalEl) modalEl.remove();

    modalEl = document.createElement("div");
    modalEl.id = "wheelModalOverlay";
    modalEl.innerHTML = `
      <div id="wheelModalBox">
        <h3>🎡 Daily XP Wheel</h3>
        <p class="wheel-sub">Spin for a chance at bonus XP - resets daily.</p>
        <div id="wheelCanvasWrap">
          <div id="wheelPointer"></div>
          <canvas id="wheelCanvas" width="260" height="260"></canvas>
        </div>
        <div id="wheelSpinsLeft">Loading...</div>
        <button id="wheelSpinBtn" disabled>Loading...</button>
        <div id="wheelResultText"></div>
        <button id="wheelCloseBtn">Close</button>
      </div>
    `;
    document.body.appendChild(modalEl);

    modalEl.querySelector("#wheelCloseBtn").onclick = () => {
    modalEl.remove();
    window.openGamesMenu();  
    if (typeof window.clearGameStatus === "function") window.clearGameStatus("Wheel");
    }

    modalEl.querySelector("#wheelSpinBtn").onclick = spin;

    socket.emit("wheelGetState");
  };

  function spin() {
    if (spinning || wheelState.spinsLeft <= 0) return;
    spinning = true;
    modalEl.querySelector("#wheelResultText").textContent = "";
    render();
    socket.emit("wheelSpin");
  }

  function animateToSegment(segmentIndex, totalSegments) {
    const canvas = modalEl.querySelector("#wheelCanvas");
    const arcDeg = 360 / totalSegments;
    const targetMod = ((360 - (segmentIndex * arcDeg + arcDeg / 2)) % 360 + 360) % 360;
    const currentMod = ((currentRotation % 360) + 360) % 360;
    let delta = targetMod - currentMod;
    if (delta <= 0) delta += 360;
    const EXTRA_SPINS = 6;
    currentRotation += delta + 360 * EXTRA_SPINS;

    canvas.style.transform = `rotate(${currentRotation}deg)`;


  }


  function wireSocket() {
    if (typeof socket === "undefined" || !socket) {
      setTimeout(wireSocket, 200);
      return;
    }

    socket.on("wheelState", (data) => {
      wheelState = data;
      render();
    });

    let pendingResult = null;

    socket.on("wheelResult", (data) => {
      if (!modalEl) return;
      pendingResult = data;
      animateToSegment(data.segmentIndex, wheelState.segments.length);
    });

    socket.on("wheelXpAwarded", (data) => {
      if (!modalEl || !pendingResult) return;
      spinning = false;
      wheelState.spinsLeft = pendingResult.spinsLeft;

      const resultEl = modalEl.querySelector("#wheelResultText");
      resultEl.textContent = data.xpWon > 0
        ? `🎉 You won ${data.xpWon} XP!`
        : `😬 No XP this time - try again tomorrow's spins.`;
      resultEl.style.color = data.xpWon > 0 ? "#3ba55d" : "#b9bbbe";
          const audio = new Audio('/sounds/battery-caution.oga');
          audio.volume = 0.5;
          audio.play().catch(() => {});

      pendingResult = null;
      render();
    });

    socket.on("wheelError", (data) => {
      spinning = false;
      render();
      if (modalEl) {
        const resultEl = modalEl.querySelector("#wheelResultText");
        resultEl.textContent = "❌ " + (data.msg || "Something went wrong.");
        resultEl.style.color = "#ed4245";
      }
    });
  }

  wireSocket();
})();