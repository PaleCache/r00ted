(function () {
  let modalEl = null;
  let rafId = null;

  function getSocket() {
    if (window.socket) return window.socket;
    try { if (typeof socket !== "undefined" && socket) return socket; } catch (e) {}
    return null;
  }

  function injectStyles() {
    if (document.getElementById("pepeRunnerStyles")) return;
    const style = document.createElement("style");
    style.id = "pepeRunnerStyles";
    style.textContent = `
      #pepeRunnerModalBox {
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        width: 660px; max-width: 94vw; background: rgba(0, 0, 0, 0.875);
        border: 1px solid #40444b; border-radius: 16px; padding: 20px 24px 24px;
        color: #dcddde;
        font-family: 'Inter', system-ui, sans-serif; z-index: 30000;
        max-height: 90vh; overflow-y: auto;
      }
      #pepeRunnerHeader { display:flex; align-items:center; justify-content:space-between; cursor: move; margin-bottom: 10px; }
      #pepeRunnerHeader h3 { margin: 0; color:#fff; font-size: 18px; }
      #pepeRunnerCloseBtn { background:none; border:none; color:#72767d; font-size:18px; cursor:pointer; }
      #pepeRunnerCloseBtn:hover { color:#fff; }

      #pepeRunnerScoreRow {
        display:flex; justify-content:space-between; margin-bottom:8px;
        color:#b9bbbe; font-size:12px; font-weight:600; letter-spacing:0.03em;
      }
      #pepeRunnerScoreRow b { color:#ffd166; }
      #pepeRunnerHiHolder { font-weight:400; }

      #pepeRunnerCanvasWrap {
        border-radius: 10px; overflow:hidden; border: 1px solid #40444b;
        background:#ecebe3;
      }
      #pepeRunnerCanvas { display:block; width:100%; image-rendering: pixelated; cursor: pointer; }

      #pepeRunnerHint {
        margin-top: 10px; text-align:center; color:#72767d; font-size: 11px; letter-spacing: 0.04em;
      }

      #pepeRunnerLeaderboardWrap {
        margin-top: 16px; padding-top: 14px; border-top: 1px solid #2f3136;
      }
      #pepeRunnerLeaderboardTitle {
        color:#fff; font-size:13px; font-weight:700; margin:0 0 10px;
        display:flex; align-items:center; gap:6px;
      }
      .pr-lb-row {
        display:flex; align-items:center; gap:10px; padding:6px 4px;
        border-radius:6px;
      }
      .pr-lb-row:nth-child(odd) { background: rgba(255,255,255,0.02); }
      .pr-lb-rank {
        width: 20px; text-align:center; font-size:12px; font-weight:700; color:#72767d; flex-shrink:0;
      }
      .pr-lb-rank.gold { color:#ffd700; }
      .pr-lb-rank.silver { color:#c9c9c9; }
      .pr-lb-rank.bronze { color:#cd7f32; }
      .pr-lb-avatar {
        width: 26px; height: 26px; border-radius: 50%; object-fit: cover; flex-shrink:0;
        background: #2b2d31;
      }
      .pr-lb-name {
        flex:1; color:#dcddde; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
      }
      .pr-lb-score {
        color:#ffd166; font-size:12px; font-weight:700; flex-shrink:0;
      }
      .pr-lb-empty {
        color:#72767d; font-size:12px; text-align:center; padding: 8px 0;
      }
    `;
    document.head.appendChild(style);
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

  function renderLeaderboard(root, leaders) {
    const list = root.querySelector("#pepeRunnerLeaderboardList");
    if (!list) return;
    if (!leaders || leaders.length === 0) {
      list.innerHTML = `<div class="pr-lb-empty">No runs yet — be the first!</div>`;
      return;
    }
    const rankClass = (i) => (i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "");
    list.innerHTML = leaders.map((entry, i) => `
      <div class="pr-lb-row">
        <span class="pr-lb-rank ${rankClass(i)}">#${i + 1}</span>
        <img class="pr-lb-avatar" src="${entry.avatar}" alt="">
        <span class="pr-lb-name">${entry.username}</span>
        <span class="pr-lb-score">${entry.score}</span>
      </div>
    `).join("");
  }

  window.openPepeRunner = function openPepeRunner() {
    injectStyles();
     if (typeof window.setGameStatus === "function") window.setGameStatus("PepeRunner");
    if (modalEl) { modalEl.remove(); if (rafId) cancelAnimationFrame(rafId); }

    modalEl = document.createElement("div");
    modalEl.id = "pepeRunnerModalBox";
    modalEl.innerHTML = `
      <div id="pepeRunnerHeader">
        <h3>🐸 Pepe Runner</h3>
        <button id="pepeRunnerCloseBtn">✕</button>
      </div>
      <div id="pepeRunnerScoreRow">
        <span>SCORE: <b id="pepeRunnerScore">0</b></span>
        <span>HI: <b id="pepeRunnerHi">0</b> <span id="pepeRunnerHiHolder" style="color:#72767d; font-weight:400;"></span></span>
      </div>
      <div id="pepeRunnerCanvasWrap">
        <canvas id="pepeRunnerCanvas" width="600" height="200"></canvas>
      </div>
      <div id="pepeRunnerHint">SPACE / ↑ / CLICK TO JUMP · ↓ TO DUCK</div>
      <div id="pepeRunnerLeaderboardWrap">
        <div id="pepeRunnerLeaderboardTitle">🏆 Top Runners</div>
        <div id="pepeRunnerLeaderboardList"><div class="pr-lb-empty">Loading…</div></div>
      </div>
    `;
    document.body.appendChild(modalEl);

    modalEl.querySelector("#pepeRunnerCloseBtn").onclick = () => {
      if (rafId) cancelAnimationFrame(rafId);
      modalEl.remove();
      modalEl = null;
      window.openGamesMenu();
      if (typeof window.clearGameStatus === "function") window.clearGameStatus("PepeRunner");
    };
    makeDraggable(modalEl.querySelector("#pepeRunnerHeader"), modalEl);

    startGame(modalEl);
  };

  function startGame(root) {
    const canvas = root.querySelector("#pepeRunnerCanvas");
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const GROUND_Y = 160;

    const scoreEl = root.querySelector("#pepeRunnerScore");
    const hiEl = root.querySelector("#pepeRunnerHi");
    const hiHolderEl = root.querySelector("#pepeRunnerHiHolder");

    const socket = getSocket();
    let hiScore = 0;
    let hiHolder = "";

    function applyHighscore(hs) {
      if (!hs) return;
      hiScore = hs.score || 0;
      hiHolder = hs.username || "";
      hiEl.textContent = hiScore;
      hiHolderEl.textContent = hiHolder ? `(${hiHolder})` : "";
    }

    function applyLeaderboard(data) {
      renderLeaderboard(root, data?.leaders || []);
    }

    if (socket) {
      socket.emit("pepeGetHighscore");
      socket.on("pepeHighscoreState", applyHighscore);
      socket.emit("pepeLeaderboardGet");
      socket.on("pepeLeaderboardState", applyLeaderboard);
    }

    const player = { x: 50, y: GROUND_Y - 34, w: 34, h: 34, vy: 0, ducking: false, grounded: true };
    const GRAVITY = 0.6;
    const JUMP_VELOCITY = -11;

    let obstacles = [];
    let clouds = [];
    let speed = 6;
    let score = 0;
    let frame = 0;
    let running = false;
    let gameOver = false;
    let started = false;
    let nextSpawnFrame = 90;
    let scoreSubmitted = false;

    function resetGame() {
      obstacles = [];
      clouds = [{ x: 100, y: 30, w: 40 }, { x: 320, y: 55, w: 30 }, { x: 480, y: 25, w: 50 }];
      speed = 6; score = 0; frame = 0; nextSpawnFrame = 90;
      player.y = GROUND_Y - 34; player.vy = 0; player.grounded = true; player.ducking = false;
      gameOver = false; running = true; started = true; scoreSubmitted = false;
      if (socket) socket.emit("pepeRunStart");
    }

    function jump() {
      if (!started || gameOver) { resetGame(); return; }
      if (player.grounded && !player.ducking) {
        player.vy = JUMP_VELOCITY;
        player.grounded = false;
      }
    }
    function setDuck(on) { if (player.grounded) player.ducking = on; }

    function onKeyDown(e) {
      if (!root.isConnected) return cleanup();
      if (e.code === "Space" || e.code === "ArrowUp") { e.preventDefault(); jump(); }
      else if (e.code === "ArrowDown") { e.preventDefault(); setDuck(true); }
    }
    function onKeyUp(e) {
      if (e.code === "ArrowDown") setDuck(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("mousedown", jump);
    canvas.addEventListener("touchstart", (e) => { e.preventDefault(); jump(); }, { passive: false });

    const HAIR_BLUES = ["#4fa3e3", "#5ab8f0", "#3d8fd6", "#6cc4f2"];

    function spawnObstacle() {
      const type = Math.random() < 0.25 ? "tall" : "short";
      const h = type === "tall" ? 42 : 30;
      obstacles.push({ x: W + 20, y: GROUND_Y - h, w: 20, h, hairSeed: Math.random() });
    }

    function update() {
      frame++;
      score += 0.12;
      speed = 6 + Math.min(6, score / 150);

      if (frame >= nextSpawnFrame) {
        spawnObstacle();
        nextSpawnFrame = frame + 55 + Math.random() * 55 - speed * 2;
      }

      if (!player.grounded) {
        player.vy += GRAVITY;
        player.y += player.vy;
        if (player.y >= GROUND_Y - 34) { player.y = GROUND_Y - 34; player.vy = 0; player.grounded = true; }
      }

      obstacles.forEach(o => o.x -= speed);
      obstacles = obstacles.filter(o => o.x + o.w > -10);

      clouds.forEach(c => { c.x -= speed * 0.25; if (c.x < -60) c.x = W + Math.random() * 100; });

      const pH = player.ducking ? 18 : 34;
      const pY = player.ducking ? GROUND_Y - 18 : player.y;
      const pBox = { x: player.x + 6, y: pY + 4, w: player.w - 12, h: pH - 6 };

      for (const o of obstacles) {
        const oBox = { x: o.x + 3, y: o.y + 2, w: o.w - 6, h: o.h - 2 };
        if (pBox.x < oBox.x + oBox.w && pBox.x + pBox.w > oBox.x && pBox.y < oBox.y + oBox.h && pBox.y + pBox.h > oBox.y) {
          endGame();
          break;
        }
      }
    }

    function endGame() {
      running = false;
      gameOver = true;
      if (!scoreSubmitted) {
        scoreSubmitted = true;
        const finalScore = Math.floor(score);
        if (socket) socket.emit("pepeSubmitScore", { score: finalScore });
      }
    }

    function drawGround() {
      ctx.strokeStyle = "#4a4f3f"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(W, GROUND_Y); ctx.stroke();
      ctx.setLineDash([8, 10]); ctx.strokeStyle = "#b7bba9";
      ctx.beginPath();
      const offset = (frame * speed) % 18;
      ctx.moveTo(-offset, GROUND_Y + 6); ctx.lineTo(W, GROUND_Y + 6); ctx.stroke();
      ctx.setLineDash([]);
    }

    function drawClouds() {
      ctx.fillStyle = "#d7d5c9";
      clouds.forEach(c => {
        ctx.beginPath();
        ctx.ellipse(c.x, c.y, c.w * 0.5, 8, 0, 0, Math.PI * 2);
        ctx.ellipse(c.x + c.w * 0.35, c.y - 4, c.w * 0.32, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }


    function drawFrog() {
      const ducking = player.ducking;
      const x = player.x;
      const y = ducking ? GROUND_Y - 18 : player.y;
      const h = ducking ? 18 : 34;
      const w = player.w;

      ctx.save();
      ctx.translate(x, y);

      const legPhase = Math.floor(frame / 6) % 2;
      ctx.fillStyle = "#3f7a34";
      if (player.grounded && !ducking) {
        if (legPhase === 0) { ctx.fillRect(6, h - 6, 6, 6); ctx.fillRect(w - 14, h - 4, 6, 4); }
        else { ctx.fillRect(6, h - 4, 6, 4); ctx.fillRect(w - 14, h - 6, 6, 6); }
      } else {
        ctx.fillRect(6, h - 6, 6, 6);
        ctx.fillRect(w - 14, h - 6, 6, 6);
      }

  
      ctx.fillStyle = "#4f9a3f";
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.58, w / 2 - 1, h * 0.44, 0, 0, Math.PI * 2);
      ctx.fill();

     
      ctx.fillStyle = "#8fce6f";
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.68, w / 3, h * 0.24, 0, 0, Math.PI * 2);
      ctx.fill();

     
      const headR = ducking ? 12 : 15;
      const headY = ducking ? 7 : 9;
      ctx.fillStyle = "#5cb04a";
      ctx.beginPath();
      ctx.arc(w / 2, headY, headR, 0, Math.PI * 2);
      ctx.fill();

    
      const eyeOffsetX = headR * 0.55;
      const eyeY = headY - headR * 0.7;
      ctx.fillStyle = "#eafbe0";
      ctx.beginPath();
      ctx.arc(w / 2 - eyeOffsetX, eyeY, 6, 0, Math.PI * 2);
      ctx.arc(w / 2 + eyeOffsetX, eyeY - 1.5, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#173d10";
      ctx.beginPath();
      ctx.arc(w / 2 - eyeOffsetX, eyeY, 2.6, 0, Math.PI * 2);
      ctx.arc(w / 2 + eyeOffsetX, eyeY - 1.5, 2.3, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = "#173d10";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w / 2 - eyeOffsetX - 5, eyeY - 4);
      ctx.lineTo(w / 2 - eyeOffsetX + 5, eyeY - 5);
      ctx.stroke();

   
      ctx.strokeStyle = "#173d10";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(w / 2 - 6, headY + 6);
      ctx.quadraticCurveTo(w / 2, headY + 10, w / 2 + 7, headY + 4);
      ctx.stroke();

      ctx.restore();
    }

    function drawObstacle(o) {
      ctx.save();
      ctx.translate(o.x, o.y);
      const w = o.w, h = o.h;

      ctx.fillStyle = "#333";
      ctx.fillRect(w * 0.25, h - 6, 3, 6);
      ctx.fillRect(w * 0.6, h - 6, 3, 6);

      ctx.fillStyle = "#c95050";
      ctx.fillRect(w * 0.2, h * 0.45, w * 0.6, h * 0.4);

      ctx.fillStyle = "#f0c8a0";
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.32, w * 0.28, 0, Math.PI * 2);
      ctx.fill();

      const hairColor = HAIR_BLUES[Math.floor(o.hairSeed * HAIR_BLUES.length)];
      ctx.fillStyle = hairColor;
      ctx.beginPath();
      ctx.arc(w / 2, h * 0.26, w * 0.34, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(w * 0.12, h * 0.24, w * 0.14, h * 0.22);
      ctx.fillRect(w * 0.72, h * 0.24, w * 0.14, h * 0.22);

      ctx.restore();
    }

    function drawStartScreen() {
      ctx.fillStyle = "#4a4f3f";
      ctx.font = "bold 14px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillText("PRESS SPACE TO START", W / 2, H / 2 - 20);
      drawFrog();
    }

    function drawGameOverScreen() {
      ctx.fillStyle = "rgba(236,235,227,0.85)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#4a4f3f";
      ctx.font = "bold 18px 'Courier New', monospace";
      ctx.textAlign = "center";
      ctx.fillText("GAME OVER", W / 2, H / 2 - 10);
      ctx.font = "12px 'Courier New', monospace";
      ctx.fillText("SCORE " + Math.floor(score) + "   PRESS SPACE TO RETRY", W / 2, H / 2 + 14);
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      drawClouds();
      drawGround();
      obstacles.forEach(drawObstacle);
      drawFrog();
      scoreEl.textContent = Math.floor(score);

      if (!started) drawStartScreen();
      else if (gameOver) drawGameOverScreen();
    }

    function cleanup() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      if (socket) {
        socket.off("pepeHighscoreState", applyHighscore);
        socket.off("pepeLeaderboardState", applyLeaderboard);
      }
    }

    function loop() {
      if (!root.isConnected) { cleanup(); return; }
      if (running) update();
      draw();
      rafId = requestAnimationFrame(loop);
    }

    draw();
    loop();
  }
})();