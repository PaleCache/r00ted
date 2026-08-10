(function () {
    function getSocket() {
        if (window.socket) return window.socket;
        try {
            if (typeof socket !== "undefined" && socket) return socket;
        } catch (e) {}
        return null;
    }

    let els = {};
    let ctx = null;
    let latestState = null;
    let mySide = null;
    let myUserId = null;
    let opponentInfo = null;
    let inQueue = false;
    let listenersBound = false;
    let usingMouse = false;
    let keys = { up: false, down: false };

    function resolveMyUserId() {
        if (window.currentUser?.id) return window.currentUser.id;
        if (window.myUserId) return window.myUserId;
        return myUserId;
    }

    function injectStyles() {
        if (document.getElementById("pongStyles")) return;
        const style = document.createElement("style");
        style.id = "pongStyles";
        style.textContent = `
        #pongModal {
        position: fixed; inset: 0; background: rgba(0,0,0,0);
        display: none; align-items: center; justify-content: center; z-index: 30600;
        }
        #pongModal.show { display: flex; }
        #pongBox {
        width: 760px; max-width: 95vw; background: rgba(0,0,0,0.875);
        border: 1px solid #3a3c42; border-radius: 14px; overflow: hidden;
        display:flex; flex-direction:column;
        position: fixed;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        min-width: 480px;
        min-height: 400px;
        box-sizing: border-box;
        }
        #pongHeader {
        display:flex; align-items:center; justify-content:space-between;
        padding: 14px 18px; border-bottom: 1px solid #3a3c42;
        cursor: grab;
        }
        #pongHeader:active {
        cursor: grabbing;
        }

        #pongResizeHandle {
        position: absolute;
        bottom: 0; right: 0;
        width: 18px; height: 18px;
        background: linear-gradient(135deg, transparent 50%, rgba(73,73,73,1) 50%);
        cursor: nwse-resize;
        z-index: 100;
        border-radius: 0 0 14px 0;
        }
        #pongHeader h3 { margin:0; color:#fff; font-size:16px; }
        #pongCloseBtn { background:none; border:none; color:#72767d; font-size:20px; cursor:pointer; }
        #pongCloseBtn:hover { color:#fff; }
        #pongScoreRow {
        display:flex; align-items:center; justify-content:center; gap:24px;
        padding: 10px 18px; background:#1e1f22; border-bottom:1px solid #3a3c42;
        color:#fff; font-size: 14px;
        }
        #pongScoreRow .pong-player { display:flex; align-items:center; gap:8px; }
        #pongScoreRow img { width:26px; height:26px; border-radius:50%; }
        #pongScoreRow b { font-size: 22px; color: #ffd700; }
        #pongCanvasWrap {
        padding: 16px; display:flex; justify-content:center; align-items:center;
        background: radial-gradient(ellipse at center, #240000 0%, #050505 100%);
        flex: 1; min-height: 0; overflow: hidden;
        }
        #pongCanvas {
        background:#000; border-radius:6px; touch-action: none;
        max-width: 100%; max-height: 100%; width: auto; height: auto;
        }
        #pongFooter { padding: 12px 18px; text-align:center; color:#b9bbbe; font-size:13px; min-height: 44px; display:flex; flex-direction:column; align-items:center; gap:8px; }
        #pongFindBtn {
        background:#FF0000; border:none; color:#fff; padding:12px 24px; border-radius:8px;
        cursor:pointer; font-size:14px; font-weight:700; transition: filter .15s, opacity .15s;
        }
        #pongFindBtn:hover { filter: brightness(1.15); }
        #pongFindBtn:disabled { opacity:.5; cursor:not-allowed; }
        #pongCancelBtn {
        background:#40444b; border:none; color:#fff; padding:8px 16px; border-radius:8px;
        cursor:pointer; font-size:12px;
        }
        #pongServeBtn {
        background:#3ba55d; border:none; color:#fff; padding:10px 22px; border-radius:8px;
        cursor:pointer; font-size:14px; font-weight:700; animation: pongPulse 1.1s ease-in-out infinite;
        }
        #pongServeBtn:hover { filter: brightness(1.1); }
        @keyframes pongPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(59,165,93,0.55); }
          50% { box-shadow: 0 0 0 8px rgba(59,165,93,0); }
        }
        #pongMessage { font-weight:700; color:#fff; min-height: 20px; }
        `;
        document.head.appendChild(style);
    }

    function setupPongDragResize() {
        const box = document.getElementById("pongBox");
        const header = document.getElementById("pongHeader");
        const resizeHandle = document.getElementById("pongResizeHandle");
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
                const maxWidth = Math.max(480, window.innerWidth - rect.left);
                const maxHeight = Math.max(400, window.innerHeight - rect.top);
                box.style.width = Math.max(480, Math.min(startWidth + (e.clientX - startX), maxWidth)) + "px";
                box.style.height = Math.max(400, Math.min(startHeight + (e.clientY - startY), maxHeight)) + "px";
            }
        });

        document.addEventListener("mouseup", () => {
            isDragging = false;
            isResizing = false;
        });
    }

    function buildModal() {
        if (document.getElementById("pongModal")) return;
        const modal = document.createElement("div");
        modal.id = "pongModal";
        modal.innerHTML = `
        <div id="pongBox">
          <div id="pongResizeHandle"></div>
          <div id="pongHeader">
            <h3>🏓 Pong</h3>
            <button id="pongCloseBtn">✕</button>
          </div>
          <div id="pongScoreRow">
            <div class="pong-player"><img id="pongLeftAvatar" src="/avatars/default1.png"><span id="pongLeftName">—</span></div>
            <div><b id="pongLeftScore">0</b> : <b id="pongRightScore">0</b></div>
            <div class="pong-player"><span id="pongRightName">—</span><img id="pongRightAvatar" src="/avatars/default1.png"></div>
          </div>
          <div id="pongCanvasWrap">
            <canvas id="pongCanvas" width="700" height="420"></canvas>
          </div>
          <div id="pongFooter">
            <div id="pongMessage"></div>
            <button id="pongFindBtn">Find Match</button>
            <button id="pongCancelBtn" style="display:none;">Cancel Queue</button>
            <button id="pongServeBtn" style="display:none;">Serve (Space)</button>
          </div>
        </div>
        `;
        document.body.appendChild(modal);

        els = {
            modal,
            closeBtn: document.getElementById("pongCloseBtn"),
            canvas: document.getElementById("pongCanvas"),
            message: document.getElementById("pongMessage"),
            findBtn: document.getElementById("pongFindBtn"),
            cancelBtn: document.getElementById("pongCancelBtn"),
            serveBtn: document.getElementById("pongServeBtn"),
            leftName: document.getElementById("pongLeftName"),
            rightName: document.getElementById("pongRightName"),
            leftAvatar: document.getElementById("pongLeftAvatar"),
            rightAvatar: document.getElementById("pongRightAvatar"),
            leftScore: document.getElementById("pongLeftScore"),
            rightScore: document.getElementById("pongRightScore"),
        };
        ctx = els.canvas.getContext("2d");

        els.closeBtn.onclick = () => {
        closePong();
        window.openGamesMenu();    
        }
       
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && modal.classList.contains("show")) closePong();
        });

        els.findBtn.onclick = () => {
            const socket = getSocket();
            if (!socket) return;
            socket.emit("pongJoinQueue");
        };
        els.cancelBtn.onclick = () => {
            const socket = getSocket();
            if (!socket) return;
            socket.emit("pongLeaveQueue");
            setQueueUI(false);
            setMessage("");
        };

        els.serveBtn.onclick = () => sendServe();
        els.canvas.addEventListener("click", () => sendServe());

        els.canvas.addEventListener("mousemove", (e) => {
            if (!mySide) return;
            usingMouse = true;
            const rect = els.canvas.getBoundingClientRect();
            const scaleY = els.canvas.height / rect.height;
            const y = (e.clientY - rect.top) * scaleY;
            const socket = getSocket();
            if (socket) socket.emit("pongInput", { y });
        });

       
        document.addEventListener("keydown", (e) => {
            if (!mySide || !els.modal.classList.contains("show")) return;
            if (e.key === " " || e.code === "Space") {
                e.preventDefault();
                sendServe();
                return;
            }
            let changed = false;
            if (["ArrowUp", "w", "W"].includes(e.key) && !keys.up) { keys.up = true; changed = true; }
            if (["ArrowDown", "s", "S"].includes(e.key) && !keys.down) { keys.down = true; changed = true; }
            if (changed) sendKeyState();
        });
        document.addEventListener("keyup", (e) => {
            if (!mySide) return;
            let changed = false;
            if (["ArrowUp", "w", "W"].includes(e.key) && keys.up) { keys.up = false; changed = true; }
            if (["ArrowDown", "s", "S"].includes(e.key) && keys.down) { keys.down = false; changed = true; }
            if (changed) sendKeyState();
        });

        drawIdle();
        setupPongDragResize();
    }

    function sendKeyState() {
        const socket = getSocket();
        if (!socket) return;
        socket.emit("pongInput", { up: keys.up, down: keys.down });
    }

    function sendServe() {
        if (!mySide || !latestState) return;
        if (latestState.status !== "serving") return;
        if (latestState.serverUserId !== resolveMyUserId()) return;
        const socket = getSocket();
        if (socket) socket.emit("pongServe");
    }

    function setQueueUI(waiting) {
        inQueue = waiting;
        els.findBtn.style.display = waiting ? "none" : "inline-block";
        els.cancelBtn.style.display = waiting ? "inline-block" : "none";
        els.findBtn.disabled = waiting;
    }

    function setMessage(text) {
        els.message.textContent = text || "";
    }

    function drawIdle() {
        if (!ctx) return;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.setLineDash([6, 10]);
        ctx.beginPath();
        ctx.moveTo(els.canvas.width / 2, 0);
        ctx.lineTo(els.canvas.width / 2, els.canvas.height);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    function drawState(state) {
        if (!ctx) return;
        els.canvas.width = state.width;
        els.canvas.height = state.height;

        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, state.width, state.height);

        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.setLineDash([6, 10]);
        ctx.beginPath();
        ctx.moveTo(state.width / 2, 0);
        ctx.lineTo(state.width / 2, state.height);
        ctx.stroke();
        ctx.setLineDash([]);

        const left = state.players.find(p => p.side === "left");
        const right = state.players.find(p => p.side === "right");

        ctx.fillStyle = "#fff";
        ctx.fillRect(state.paddleMargin, left.y, state.paddleWidth, state.paddleHeight);
        ctx.fillRect(state.width - state.paddleMargin - state.paddleWidth, right.y, state.paddleWidth, state.paddleHeight);

        ctx.beginPath();
        ctx.fillStyle = "#FF0000";
        ctx.arc(state.ball.x, state.ball.y, state.ballSize / 2, 0, Math.PI * 2);
        ctx.fill();

        els.leftName.textContent = left.username + (mySide === "left" ? " (you)" : "");
        els.rightName.textContent = right.username + (mySide === "right" ? " (you)" : "");
        els.leftAvatar.src = left.avatar;
        els.rightAvatar.src = right.avatar;
        els.leftScore.textContent = left.score;
        els.rightScore.textContent = right.score;
    }

    function bindSocketListeners() {
        const socket = getSocket();
        if (!socket || listenersBound) return;
        listenersBound = true;

        socket.on("pongQueued", () => {
            setQueueUI(true);
            setMessage("Looking for an opponent…");
        });

        socket.on("pongMatchFound", (data) => {
            mySide = data.yourSide;
            myUserId = data.yourUserId || myUserId;
            opponentInfo = data.opponent;
            setQueueUI(false);
            els.serveBtn.style.display = "none";
            setMessage(`Match found! You vs ${opponentInfo.username}`);
        });

        socket.on("pongState", (state) => {
            latestState = state;
            drawState(state);

            if (state.status === "serving") {
                const isMyServe = state.serverUserId === resolveMyUserId();
                const serverPlayer = state.players.find(p => p.userId === state.serverUserId);
                if (isMyServe) {
                    setMessage("Your serve!");
                    els.serveBtn.style.display = "inline-block";
                } else {
                    setMessage(`Waiting for ${serverPlayer ? serverPlayer.username : "opponent"} to serve…`);
                    els.serveBtn.style.display = "none";
                }
            } else {
                setMessage("");
                els.serveBtn.style.display = "none";
            }
        });

        socket.on("pongGameOver", (data) => {
            mySide = null;
            keys = { up: false, down: false };
            els.serveBtn.style.display = "none";
            setQueueUI(false);
            setMessage(
                data.youWon
                    ? `🏆 You won! +${data.xpAwarded} XP`
                    : `${data.winnerUsername} won the match.`
            );
        });
    }

    function openPong() {
        injectStyles();
        buildModal();
        els.modal.classList.add("show");
        bindSocketListeners();
        drawIdle();
         if (typeof window.setGameStatus === "function") window.setGameStatus("Pong");
    }

    function closePong() {
        if (typeof window.clearGameStatus === "function") window.clearGameStatus("Pong");
        if (els.modal) els.modal.classList.remove("show");
        if (inQueue) {
            const socket = getSocket();
            if (socket) socket.emit("pongLeaveQueue");
            setQueueUI(false);
        }
        if (mySide) {
            const socket = getSocket();
            if (socket) socket.emit("pongLeaveGame");
            mySide = null;
        }
    }

    window.openPong = openPong;
    window.closePong = closePong;

    document.addEventListener("DOMContentLoaded", () => {
        const btn = document.getElementById("pongBtn");
        if (btn) btn.addEventListener("click", openPong);
    });
    if (document.readyState !== "loading") {
        const btn = document.getElementById("pongBtn");
        if (btn) btn.addEventListener("click", openPong);
    }
})();