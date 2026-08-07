(function () {
    function getSocket() {
        if (window.socket) return window.socket;
        try { if (typeof socket !== "undefined" && socket) return socket; } catch (e) {}
        return null;
    }

    let els = {};
    let boundSocket = null;
    let state = {
        account: "normal",
        balance: 0,
        bonusBalance: 0,
        rings: [],
        throwing: false
    };

    function dGetStackOffset() {
        if (typeof getStackOffset === "function") return getStackOffset();
        let offset = 20;
        document.querySelectorAll('.stacked-notification').forEach(el => { offset += el.offsetHeight + 10; });
        return offset;
    }

    function dShowBanner(title, body, color) {
        const banner = document.createElement('div');
        banner.classList.add('banner-notification', 'stacked-notification', 'timer-5s');
        const topOffset = dGetStackOffset();
        banner.style.cssText = `
            position: fixed; top: ${topOffset}px; left: 50%; transform: translateX(-50%);
            background: #111214; border: 1px solid #3a3c42; border-left: 4px solid ${color || "#e63946"};
            color: white; padding: 14px 16px; border-radius: 10px;
            z-index: 10001; cursor: pointer;
            width: 320px; animation: bannerDropIn 0.3s ease-out;
            display: flex; flex-direction: column; gap: 10px; overflow: hidden;
        `;
        const topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex; align-items:center; gap:10px;';
        const iconWrapper = document.createElement('div');
        iconWrapper.style.cssText = `
            width: 42px; height: 42px; border-radius: 50%;
            background: rgba(230,57,70,0.15); display:flex; align-items:center; justify-content:center;
            flex-shrink:0; box-shadow: 0 0 12px rgba(230,57,70,0.4); font-size:22px;
        `;
        iconWrapper.textContent = "🎯";
        const nameCol = document.createElement('div');
        nameCol.style.cssText = 'display:flex; flex-direction:column; gap:3px; flex:1; min-width:0;';
        const titleSpan = document.createElement('div');
        titleSpan.style.cssText = `font-weight:700; font-size:14px; color:${color || "#e63946"};`;
        titleSpan.textContent = title;
        const bodySpan = document.createElement('div');
        bodySpan.style.cssText = 'font-size:12px; color:#b9bbbe;';
        bodySpan.textContent = body;
        nameCol.appendChild(titleSpan);
        nameCol.appendChild(bodySpan);
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `background:none; border:none; color:#72767d; font-size:14px; cursor:pointer; padding:0; flex-shrink:0; align-self:flex-start; transition:color .15s;`;
        closeBtn.onmouseover = () => closeBtn.style.color = '#fff';
        closeBtn.onmouseout = () => closeBtn.style.color = '#72767d';
        closeBtn.onclick = (e) => { e.stopPropagation(); banner.remove(); };
        topRow.appendChild(iconWrapper);
        topRow.appendChild(nameCol);
        topRow.appendChild(closeBtn);
        banner.appendChild(topRow);
        banner.onclick = () => banner.remove();
        document.body.appendChild(banner);
        setTimeout(() => {
            if (banner.parentNode) {
                banner.style.transition = 'opacity .4s ease, transform .4s ease';
                banner.style.opacity = '0';
                banner.style.transform = 'translate(-50%, -100%)';
                setTimeout(() => banner.remove(), 400);
            }
        }, 5000);
    }

    function injectStyles() {
        if (document.getElementById("dartsStyles")) return;
        const style = document.createElement("style");
        style.id = "dartsStyles";
        style.textContent = `
        #dartsModal { position: fixed; inset: 0; pointer-events: none; display: none; align-items: center; justify-content: center; z-index: 30500; }
        #dartsModal.show { display: flex; }
        #dartsBox {
            width: 600px; max-width: 96vw; height: auto; max-height: 92vh; min-height: 460px;
            background: rgba(0, 0, 0, 0.9); border: 1px solid #ff000054; border-radius: 14px;
            display: flex; flex-direction: column; overflow: hidden; pointer-events: auto;
            position: relative;
        }
        #dartsResizeHandle {
            position: absolute; bottom: 0; right: 0; width: 18px; height: 18px; cursor: nwse-resize;
            background: linear-gradient(135deg, transparent 50%, #4a4d54 50%); border-bottom-right-radius: 14px; z-index: 5;
        }
        #dartsHeader { display:flex; align-items:center; justify-content:space-between; padding: 14px 18px; cursor: move; user-select: none; }
        #dartsHeader h3 { margin:0; color:#fff; font-size:16px; pointer-events:none; display:flex; align-items:center; gap:8px; }
        #dartsBox.darts-dragging { transition: none !important; }
        #dartsCloseBtn { background:none; border:none; color:#72767d; font-size:20px; cursor:pointer; transition: color .15s; }
        #dartsCloseBtn:hover { color:#fff; }
        #dartsBody { flex:1; overflow-y:auto; display:flex; gap:18px; padding: 0 18px 16px; align-items:flex-start; }
        #dartsBoardWrap { flex:1; display:flex; flex-direction:column; align-items:center; gap:10px; padding-top:6px; }
        #dartsBoardSvgWrap { position:relative; width: 280px; height: 280px; }
        #dartsDart {
            position:absolute; top:50%; left:50%; width:26px; height:26px;
            transform: translate(-50%,-50%) rotate(0deg); transform-origin:center;
            transition: transform 1.4s cubic-bezier(.2,.7,.2,1), opacity .2s;
            opacity: 0; pointer-events:none; z-index:5; font-size:24px;
            display:flex; align-items:center; justify-content:center;
        }
        #dartsResultLabel { font-size:14px; font-weight:800; min-height: 20px; }
        #dartsControls { width: 220px; flex-shrink:0; display:flex; flex-direction:column; gap: 10px; }
        .darts-label { font-size:11px; color:#8a8f9a; text-transform:uppercase; font-weight:700; letter-spacing:.4px; margin-bottom: 2px;}
        .darts-input-row { display:flex; gap:6px; }
        .darts-bet-input { flex:1; background:#17121a; border:1px solid #33262a; border-radius:8px; color:#fff; padding:8px 10px; font-size:13px; outline:none; }
        .darts-half-double { display:flex; gap:6px; }
        .darts-half-double button { flex:1; background:#221a1e; border:1px solid #33262a; border-radius:6px; color:#b9bbbe; font-size:11px; padding:5px 0; cursor:pointer; transition: background .15s; }
        .darts-half-double button:hover { background:#33262a; }
        .darts-account-toggle { display:flex; gap:6px; }
        .darts-account-toggle button { flex:1; background:#17121a; border:1px solid #33262a; border-radius:6px; color:#b9bbbe; font-size:12px; padding:7px 0; cursor:pointer; transition: background .15s, color .15s; }
        .darts-account-toggle button.active { background:#e63946; color:#fff; font-weight:700; border-color:#e63946; }
        #dartsThrowBtn { margin-top:6px; background: linear-gradient(180deg,#ff5361,#c2242f); border:none; color:#fff; font-weight:800; font-size:14px; padding:12px 0; border-radius:10px; cursor:pointer; transition: filter .15s, opacity .15s; }
        #dartsThrowBtn:disabled { opacity:.4; cursor:not-allowed; }
        #dartsThrowBtn:hover:not(:disabled) { filter:brightness(1.1); }
        #dartsStatsBox { background:#17121a; border:1px solid #33262a; border-radius:8px; padding:8px 10px; font-size:12px; color:#b9bbbe; display:flex; flex-direction:column; gap:4px; }
        #dartsStatsBox b { color:#e63946; }
        #dartsRingLegend { display:flex; flex-direction:column; gap:3px; font-size:11px; color:#8a8f9a; margin-top:4px; }
        .darts-legend-row { display:flex; justify-content:space-between; }
        .darts-legend-row b { color:#dcddde; }
        #dartsLeaderboardWrap { padding: 10px 18px 16px; max-height: 190px; overflow-y:auto; border-top:1px solid #241a1d; }
        #dartsLeaderboardTitle { color:#fff; font-size:13px; font-weight:700; margin:0 0 8px; display:flex; align-items:center; gap:6px; }
        .darts-lb-row { display:flex; align-items:center; gap:10px; padding:5px 4px; border-radius:6px; }
        .darts-lb-row:nth-child(odd) { background: rgba(255,255,255,0.02); }
        .darts-lb-rank { width: 20px; text-align:center; font-size:12px; font-weight:700; color:#72767d; flex-shrink:0; }
        .darts-lb-rank.gold { color:#ffd700; } .darts-lb-rank.silver { color:#c9c9c9; } .darts-lb-rank.bronze { color:#cd7f32; }
        .darts-lb-avatar { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; flex-shrink:0; background:#2b2d31; }
        .darts-lb-name { flex:1; color:#dcddde; font-size:12.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .darts-lb-count { color:#e63946; font-size:12px; font-weight:700; flex-shrink:0; }
        .darts-lb-empty { color:#72767d; font-size:12px; text-align:center; padding: 8px 0; }
        `;
        document.head.appendChild(style);
    }

    function makeDraggable(box, handle) {
        let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
        function onDown(e) {
            if (e.target.closest("button")) return;
            dragging = true;
            box.classList.add("darts-dragging");
            const rect = box.getBoundingClientRect();
            box.style.position = "fixed"; box.style.left = rect.left + "px"; box.style.top = rect.top + "px"; box.style.margin = "0";
            startX = e.clientX; startY = e.clientY; startLeft = rect.left; startTop = rect.top;
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
            e.preventDefault();
        }
        function onMove(e) {
            if (!dragging) return;
            const dx = e.clientX - startX, dy = e.clientY - startY;
            const maxLeft = window.innerWidth - box.offsetWidth, maxTop = window.innerHeight - box.offsetHeight;
            box.style.left = Math.min(Math.max(0, startLeft + dx), Math.max(0, maxLeft)) + "px";
            box.style.top = Math.min(Math.max(0, startTop + dy), Math.max(0, maxTop)) + "px";
        }
        function onUp() {
            dragging = false; box.classList.remove("darts-dragging");
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        }
        handle.addEventListener("mousedown", onDown);
    }

    function makeResizable(box, handle) {
        let resizing = false, startX = 0, startY = 0, startW = 0, startH = 0;
        function onDown(e) {
            resizing = true;
            const rect = box.getBoundingClientRect();
            box.style.position = "fixed"; box.style.left = rect.left + "px"; box.style.top = rect.top + "px"; box.style.margin = "0";
            startX = e.clientX; startY = e.clientY; startW = rect.width; startH = rect.height;
            document.addEventListener("mousemove", onMove);
            document.addEventListener("mouseup", onUp);
            e.preventDefault(); e.stopPropagation();
        }
        function onMove(e) {
            if (!resizing) return;
            const minW = 500, minH = 460;
            const maxW = window.innerWidth * 0.96, maxH = window.innerHeight * 0.92;
            box.style.width = Math.min(maxW, Math.max(minW, startW + (e.clientX - startX))) + "px";
            box.style.height = Math.min(maxH, Math.max(minH, startH + (e.clientY - startY))) + "px";
        }
        function onUp() {
            resizing = false;
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        }
        handle.addEventListener("mousedown", onDown);
    }

    function resetModalPosition() {
        const box = document.getElementById("dartsBox");
        if (!box) return;
        box.style.position = ""; box.style.left = ""; box.style.top = ""; box.style.margin = "";
        box.style.width = ""; box.style.height = "";
    }

    function buildBoardSVG() {
        return `
        <svg viewBox="0 0 200 200" width="280" height="280" style="display:block;">
            <circle cx="100" cy="100" r="98" fill="#1a1216" stroke="#33262a" stroke-width="2"/>
            <circle cx="100" cy="100" r="80" fill="#241a1e"/>
            <circle cx="100" cy="100" r="60" fill="#3a2830"/>
            <circle cx="100" cy="100" r="38" fill="#c2242f"/>
            <circle cx="100" cy="100" r="18" fill="#ffd700"/>
            <circle cx="100" cy="100" r="6" fill="#fff2b0"/>
            <circle cx="100" cy="100" r="98" fill="none" stroke="#4a3a3e" stroke-width="1"/>
            <circle cx="100" cy="100" r="80" fill="none" stroke="#4a3a3e" stroke-width="1"/>
            <circle cx="100" cy="100" r="60" fill="none" stroke="#4a3a3e" stroke-width="1"/>
            <circle cx="100" cy="100" r="38" fill="none" stroke="#4a3a3e" stroke-width="1"/>
        </svg>`;
    }

   
    const RING_RADIUS_RANGE = {
        bullseye: [0.02, 0.09],
        inner:    [0.13, 0.19],
        middle:   [0.24, 0.30],
        outer:    [0.34, 0.40],
        miss:     [0.44, 0.49]
    };

    function buildModal() {
        if (document.getElementById("dartsModal")) return;
        const modal = document.createElement("div");
        modal.id = "dartsModal";
        modal.innerHTML = `
        <div id="dartsBox">
            <div id="dartsHeader"><h3>🎯 Darts</h3><button id="dartsCloseBtn">✕</button></div>
            <div id="dartsBody">
                <div id="dartsBoardWrap">
                    <div id="dartsBoardSvgWrap">
                        ${buildBoardSVG()}
                        <div id="dartsDart">🎯</div>
                    </div>
                    <div id="dartsResultLabel"></div>
                </div>
                <div id="dartsControls">
                    <div>
                        <div class="darts-label">Bet Amount</div>
                        <div class="darts-input-row">
                            <input type="number" id="dartsBetInput" class="darts-bet-input" min="1" value="10">
                        </div>
                        <div class="darts-half-double" style="margin-top:6px;">
                            <button id="dartsHalfBtn">½</button>
                            <button id="dartsDoubleBtn">2×</button>
                            <button id="dartsMaxBtn">Max</button>
                        </div>
                    </div>
                    <div>
                        <div class="darts-label">Account</div>
                        <div class="darts-account-toggle">
                            <button id="dartsAcctNormal" class="active">Normal</button>
                            <button id="dartsAcctBonus">Bonus</button>
                        </div>
                    </div>
                    <div id="dartsStatsBox">
                        <div>Balance: <b id="dartsBalanceText">0</b></div>
                        <div>Last Payout: <b id="dartsPayoutText">0</b></div>
                        <div id="dartsRingLegend"></div>
                    </div>
                    <button id="dartsThrowBtn">Throw Dart</button>
                </div>
            </div>
            <div id="dartsLeaderboardWrap">
                <div id="dartsLeaderboardTitle">🏆 Biggest Payouts</div>
                <div id="dartsLeaderboardList"><div class="darts-lb-empty">Loading…</div></div>
            </div>
            <div id="dartsResizeHandle"></div>
        </div>
        `;
        document.body.appendChild(modal);

        els = {
            modal,
            closeBtn: document.getElementById("dartsCloseBtn"),
            betInput: document.getElementById("dartsBetInput"),
            acctNormal: document.getElementById("dartsAcctNormal"),
            acctBonus: document.getElementById("dartsAcctBonus"),
            balanceText: document.getElementById("dartsBalanceText"),
            payoutText: document.getElementById("dartsPayoutText"),
            throwBtn: document.getElementById("dartsThrowBtn"),
            halfBtn: document.getElementById("dartsHalfBtn"),
            doubleBtn: document.getElementById("dartsDoubleBtn"),
            maxBtn: document.getElementById("dartsMaxBtn"),
            dart: document.getElementById("dartsDart"),
            boardWrap: document.getElementById("dartsBoardSvgWrap"),
            resultLabel: document.getElementById("dartsResultLabel"),
            ringLegend: document.getElementById("dartsRingLegend"),
        };

        els.closeBtn.onclick = () => {closeDarts(); window.openGamesMenu();}
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && modal.classList.contains("show")) closeDarts();
        });

        makeDraggable(document.getElementById("dartsBox"), document.getElementById("dartsHeader"));
        makeResizable(document.getElementById("dartsBox"), document.getElementById("dartsResizeHandle"));

        els.acctNormal.onclick = () => {
            state.account = "normal";
            els.acctNormal.classList.add("active");
            els.acctBonus.classList.remove("active");
            updateStatsDisplay();
        };
        els.acctBonus.onclick = () => {
            state.account = "bonus";
            els.acctBonus.classList.add("active");
            els.acctNormal.classList.remove("active");
            updateStatsDisplay();
        };

        els.halfBtn.onclick = () => {
            const v = Math.max(1, Math.floor((parseFloat(els.betInput.value) || 0) / 2));
            els.betInput.value = v;
        };
        els.doubleBtn.onclick = () => {
            const v = Math.max(1, Math.floor((parseFloat(els.betInput.value) || 0) * 2));
            els.betInput.value = v;
        };
        els.maxBtn.onclick = () => {
            const bal = state.account === "bonus" ? state.bonusBalance : state.balance;
            els.betInput.value = Math.max(1, Math.floor(bal));
        };

        els.throwBtn.onclick = () => {
            const socket = getSocket();
            if (!socket || state.throwing) return;
            const amount = Math.floor(Number(els.betInput.value));
            if (!Number.isFinite(amount) || amount <= 0) return;
            state.throwing = true;
            els.throwBtn.disabled = true;
            els.resultLabel.textContent = "";
            els.dart.style.opacity = "0";
            els.dart.style.transition = "none";
            els.dart.style.transform = "translate(-50%,-50%) rotate(0deg)";
            void els.dart.offsetWidth;
            els.dart.style.transition = "transform 1.4s cubic-bezier(.2,.7,.2,1), opacity .2s";
            socket.emit("dartsThrow", { amount, account: state.account });
        };
    }

    function updateStatsDisplay() {
        els.balanceText.textContent = Math.floor(state.account === "bonus" ? state.bonusBalance : state.balance);
    }

    function renderLegend() {
        if (!state.rings || state.rings.length === 0) return;
        els.ringLegend.innerHTML = state.rings.map(r =>
            `<div class="darts-legend-row"><span>${r.label}</span><b>${r.multiplier}x</b></div>`
        ).join("");
    }

    function animateDartToRing(ringId, angleDeg) {
        const range = RING_RADIUS_RANGE[ringId] || RING_RADIUS_RANGE.miss;
        const boardRadiusPx = 98; 
        const scale = 280 / 200;
        const rFrac = range[0] + Math.random() * (range[1] - range[0]);
        const distPx = rFrac * 200 * scale; 
        const rad = (angleDeg * Math.PI) / 180;
        const x = Math.cos(rad) * distPx;
        const y = Math.sin(rad) * distPx;

        els.dart.style.opacity = "1";
        requestAnimationFrame(() => {
            els.dart.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) rotate(${angleDeg + 90}deg)`;
        });
    }

    function bindSocketListeners() {
        const socket = getSocket();
        if (!socket || boundSocket === socket) return;
        boundSocket = socket;

        socket.on("dartsState", (data) => {
            state.balance = data.balance ?? state.balance;
            state.bonusBalance = data.bonusBalance ?? state.bonusBalance;
            state.rings = data.rings || [];
            renderLegend();
            updateStatsDisplay();
        });

        socket.on("dartsResult", (data) => {
            animateDartToRing(data.ringId, data.angleDeg);
            setTimeout(() => {
                const won = data.payoutChips > 0;
                els.resultLabel.textContent = won
                    ? `${data.ringLabel}! +${data.payoutChips} (${data.multiplier}x)`
                    : `${data.ringLabel} - no payout`;
                els.resultLabel.style.color = won ? "#8fdc6a" : "#e63946";
            }, 1450);
        });

        socket.on("dartsPayoutCredited", (data) => {
            if (data.account === "bonus") state.bonusBalance = data.balance;
            else state.balance = data.balance;
            els.payoutText.textContent = data.payoutChips;
            updateStatsDisplay();
            state.throwing = false;
            els.throwBtn.disabled = false;
        });

        socket.on("dartsError", (data) => {
            console.warn("Darts error:", data?.msg);
            if (typeof showToast === "function") showToast(data?.msg || "Error");
            state.throwing = false;
            els.throwBtn.disabled = false;
        });

        socket.on("dartsLeaderboardState", (data) => {
            renderLeaderboard(data?.leaders || []);
        });
    }

    function renderLeaderboard(leaders) {
        const list = document.getElementById("dartsLeaderboardList");
        if (!list) return;
        if (!leaders || leaders.length === 0) {
            list.innerHTML = `<div class="darts-lb-empty">No payouts yet - be the first!</div>`;
            return;
        }
        const rankClass = (i) => (i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "");
        list.innerHTML = leaders.map((entry, i) => `
            <div class="darts-lb-row">
                <span class="darts-lb-rank ${rankClass(i)}">#${i + 1}</span>
                <img class="darts-lb-avatar" src="${entry.avatar}" alt="">
                <span class="darts-lb-name">${entry.username}</span>
                <span class="darts-lb-count">${entry.payout}</span>
            </div>
        `).join("");
    }

    function openDarts() {
        injectStyles();
        buildModal();
        resetModalPosition();
        els.modal.classList.add("show");
        window.dartsOpen = true;
        bindSocketListeners();
        waitForSocketAndInit();
         if (typeof window.setGameStatus === "function") window.setGameStatus("Darts");
    }

    function waitForSocketAndInit(attemptsLeft = 20) {
        const sock = getSocket();
        if (sock) {
            bindSocketListeners();
            sock.emit("dartsGetState");
            sock.emit("dartsLeaderboardGet");
            return;
        }
        if (attemptsLeft <= 0) return;
        setTimeout(() => waitForSocketAndInit(attemptsLeft - 1), 250);
    }

    function closeDarts() {
        if (els.modal) els.modal.classList.remove("show");
        window.dartsOpen = false;
        if (typeof window.clearGameStatus === "function") window.clearGameStatus("Darts");
    }

    window.openDarts = openDarts;
    window.closeDarts = closeDarts;

    document.addEventListener("DOMContentLoaded", () => {
        const btn = document.getElementById("dartsBtn");
        if (btn) btn.addEventListener("click", openDarts);
    });
    if (document.readyState !== "loading") {
        const btn = document.getElementById("dartsBtn");
        if (btn) btn.addEventListener("click", openDarts);
    }
})();