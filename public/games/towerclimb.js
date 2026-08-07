(function () {
    const DT_ROWS = 9;
    const DT_DIFFICULTIES = {
        easy:   { tiles: 4, mines: 1, label: "Easy" },
        medium: { tiles: 3, mines: 1, label: "Medium" },
        hard:   { tiles: 2, mines: 1, label: "Hard" },
        expert: { tiles: 3, mines: 2, label: "Expert" },
        master: { tiles: 4, mines: 3, label: "Master" },
    };

    function getSocket() {
        if (window.socket) return window.socket;
        try { if (typeof socket !== "undefined" && socket) return socket; } catch (e) {}
        return null;
    }

    let els = {};
    let state = {
        active: false,
        difficulty: "easy",
        tiles: 4,
        currentLevel: 0,
        multiplier: 1,
        betChips: 0,
        account: "normal",
        revealedRows: [], 
        balance: 0,
        bonusBalance: 0
    };
    let boundSocket = null;

    function dtGetStackOffset() {
        if (typeof getStackOffset === "function") return getStackOffset();
        let offset = 20;
        document.querySelectorAll('.stacked-notification').forEach(el => {
            offset += el.offsetHeight + 10;
        });
        return offset;
    }

    function dtShowBanner(title, body, color) {
        const banner = document.createElement('div');
        banner.classList.add('banner-notification', 'stacked-notification', 'timer-5s');
        const topOffset = dtGetStackOffset();
        banner.style.cssText = `
            position: fixed; top: ${topOffset}px; left: 50%; transform: translateX(-50%);
            background: #111214; border: 1px solid #3a3c42; border-left: 4px solid ${color || "#FF0000"};
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
            background: rgba(255, 140, 0, 0.15); display:flex; align-items:center; justify-content:center;
            flex-shrink:0; box-shadow: 0 0 12px rgba(255,140,0,0.4); font-size:22px;
        `;
        iconWrapper.textContent = "🐉";
        const nameCol = document.createElement('div');
        nameCol.style.cssText = 'display:flex; flex-direction:column; gap:3px; flex:1; min-width:0;';
        const titleSpan = document.createElement('div');
        titleSpan.style.cssText = `font-weight:700; font-size:14px; color:${color || "#FF0000"};`;
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
        closeBtn.onclick = (e) => { e.stopPropagation(); banner.remove(); window.openGamesMenu();};
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
        if (document.getElementById("dtStyles")) return;
        const style = document.createElement("style");
        style.id = "dtStyles";
        style.textContent = `
        #dtModal { position: fixed; inset: 0; pointer-events: none; display: none; align-items: center; justify-content: center; z-index: 30500; }
        #dtModal.show { display: flex; }
        #dtBox {
            width: 620px; max-width: 96vw; height: auto; max-height: 92vh; min-height: 480px;
            background: rgba(0, 0, 0, 0.9); border: 1px solid #ff000054; border-radius: 14px;
            display: flex; flex-direction: column; overflow: hidden; pointer-events: auto;
            position: relative;
        }
        #dtResizeHandle {
            position: absolute; bottom: 0; right: 0; width: 18px; height: 18px; cursor: nwse-resize;
            background: linear-gradient(135deg, transparent 50%, #4a4d54 50%); border-bottom-right-radius: 14px; z-index: 5;
        }
        #dtHeader { display:flex; align-items:center; justify-content:space-between; padding: 14px 18px; cursor: move; user-select: none; }
        #dtHeader h3 { margin:0; color:#fff; font-size:16px; pointer-events:none; display:flex; align-items:center; gap:8px; }
        #dtBox.dt-dragging { transition: none !important; }
        #dtCloseBtn { background:none; border:none; color:#72767d; font-size:20px; cursor:pointer; transition: color .15s; }
        #dtCloseBtn:hover { color:#fff; }
        #dtBody { flex:1; overflow-y:auto; display:flex; gap:16px; padding: 0 18px 16px; }
        #dtControls {
            width: 220px; flex-shrink:0; display:flex; flex-direction:column; gap: 10px;
        }
        .dt-label { font-size:11px; color:#8a8f9a; text-transform:uppercase; font-weight:700; letter-spacing:.4px; margin-bottom: 2px;}
        .dt-input-row { display:flex; gap:6px; }
        .dt-bet-input {
            flex:1; background:#1a151d; border:1px solid #3a2f42; border-radius:8px; color:#fff;
            padding:8px 10px; font-size:13px; outline:none;
        }
        .dt-half-double { display:flex; gap:6px; }
        .dt-half-double button {
            flex:1; background:#241d29; border:1px solid #3a2f42; border-radius:6px; color:#b9bbbe;
            font-size:11px; padding:5px 0; cursor:pointer; transition: background .15s;
        }
        .dt-half-double button:hover { background:#3a2f42; }
        select.dt-select {
            width:100%; background:#1a151d; border:1px solid #3a2f42; border-radius:8px; color:#fff;
            padding:8px 10px; font-size:13px; outline:none; cursor:pointer;
        }
        .dt-account-toggle { display:flex; gap:6px; }
        .dt-account-toggle button {
            flex:1; background:#1a151d; border:1px solid #3a2f42; border-radius:6px; color:#b9bbbe;
            font-size:12px; padding:7px 0; cursor:pointer; transition: background .15s, color .15s;
        }
        .dt-account-toggle button.active { background:#FF0000; color:#111; font-weight:700; border-color:#FF0000; }
        #dtActionBtn {
            margin-top:6px; background: #FF0000; border:none; color:#111;
            font-weight:800; font-size:14px; padding:12px 0; border-radius:10px; cursor:pointer;
            transition: filter .15s, opacity .15s;
        }
        #dtActionBtn:disabled { opacity:.35; cursor:not-allowed; }
        #dtActionBtn:hover:not(:disabled) { filter:brightness(1.1); }
        #dtCashoutBtn {
            background: linear-gradient(180deg,#3fae4c,#237a2e); border:none; color:#fff;
            font-weight:800; font-size:13px; padding:10px 0; border-radius:10px; cursor:pointer; display:none;
        }
        #dtCashoutBtn:hover { filter:brightness(1.1); }
        #dtStatsBox {
            background:#1a151d; border:1px solid #3a2f42; border-radius:8px; padding:8px 10px;
            font-size:12px; color:#b9bbbe; display:flex; flex-direction:column; gap:4px;
        }
        #dtStatsBox b { color:#FF0000; }
        #dtTowerWrap { flex:1; display:flex; flex-direction:column-reverse; gap:6px; overflow-y:auto; padding: 8px 4px; }
        .dt-row { display:flex; gap:6px; justify-content:center; align-items:center; }
        .dt-row-label {
            width:26px; flex-shrink:0; text-align:right; font-size:11px; color:#6c7480; font-weight:700; padding-right:2px;
        }
        .dt-tiles { display:flex; gap:6px; flex:1; justify-content:center; }
        .dt-tile {
            width: 52px; height: 42px; border-radius: 8px; background: #221a26; border: 1px solid #3a2f42;
            display:flex; align-items:center; justify-content:center; font-size:18px; cursor:pointer;
            transition: transform .1s, background .15s, border-color .15s;
            position:relative; user-select:none;
        }
        .dt-tile.clickable:hover { transform: translateY(-2px); border-color:#FF0000; }
        .dt-tile.disabled { cursor:default; opacity:.5; }
        .dt-tile.current-row { border-color:#FF0000; box-shadow: 0 0 10px rgba(255, 0, 0, 0.35); }
        .dt-tile.safe { background: #1c3320; border-color:#3fae4c; }
        .dt-tile.mine { background: #3a1414; border-color:#c0392b; }
        .dt-row-mult { width:56px; flex-shrink:0; font-size:11px; color:#6c7480; text-align:left; padding-left:4px; }
        .dt-row.cleared .dt-row-mult { color:#8fdc6a; font-weight:700; }
        #dtLeaderboardWrap { padding: 10px 18px 16px; max-height: 190px; overflow-y:auto; border-top:1px solid #2a2230; }
        #dtLeaderboardTitle { color:#fff; font-size:13px; font-weight:700; margin:0 0 8px; display:flex; align-items:center; gap:6px; }
        .dt-lb-row { display:flex; align-items:center; gap:10px; padding:5px 4px; border-radius:6px; }
        .dt-lb-row:nth-child(odd) { background: rgba(255,255,255,0.02); }
        .dt-lb-rank { width: 20px; text-align:center; font-size:12px; font-weight:700; color:#72767d; flex-shrink:0; }
        .dt-lb-rank.gold { color:#ffd700; } .dt-lb-rank.silver { color:#c9c9c9; } .dt-lb-rank.bronze { color:#cd7f32; }
        .dt-lb-avatar { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; flex-shrink:0; background:#2b2d31; }
        .dt-lb-name { flex:1; color:#dcddde; font-size:12.5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .dt-lb-mult { color:#FF0000; font-size:12px; font-weight:700; flex-shrink:0; }
        .dt-lb-empty { color:#72767d; font-size:12px; text-align:center; padding: 8px 0; }
        `;
        document.head.appendChild(style);
    }

    function makeDraggable(box, handle) {
        let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;
        function onDown(e) {
            if (e.target.closest("button") || e.target.closest("select")) return;
            dragging = true;
            box.classList.add("dt-dragging");
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
            dragging = false; box.classList.remove("dt-dragging");
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
            const minW = 520, minH = 480;
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
        const box = document.getElementById("dtBox");
        if (!box) return;
        box.style.position = ""; box.style.left = ""; box.style.top = ""; box.style.margin = "";
        box.style.width = ""; box.style.height = "";
    }

    function buildModal() {
        if (document.getElementById("dtModal")) return;
        const modal = document.createElement("div");
        modal.id = "dtModal";
        modal.innerHTML = `
        <div id="dtBox">
            <div id="dtHeader"><h3>Tower Climb</h3><button id="dtCloseBtn">✕</button></div>
            <div id="dtBody">
                <div id="dtControls">
                    <div>
                        <div class="dt-label">Bet Amount</div>
                        <div class="dt-input-row">
                            <input type="number" id="dtBetInput" class="dt-bet-input" min="1" value="10">
                        </div>
                        <div class="dt-half-double" style="margin-top:6px;">
                            <button id="dtHalfBtn">½</button>
                            <button id="dtDoubleBtn">2×</button>
                            <button id="dtMaxBtn">Max</button>
                        </div>
                    </div>
                    <div>
                        <div class="dt-label">Difficulty</div>
                        <select id="dtDifficultySelect" class="dt-select">
                            <option value="easy">Easy (4 tiles, 1 dragon)</option>
                            <option value="medium">Medium (3 tiles, 1 dragon)</option>
                            <option value="hard">Hard (2 tiles, 1 dragon)</option>
                            <option value="expert">Expert (3 tiles, 2 dragons)</option>
                            <option value="master">Master (4 tiles, 3 dragons)</option>
                        </select>
                    </div>
                    <div>
                        <div class="dt-label">Account</div>
                        <div class="dt-account-toggle">
                            <button id="dtAcctNormal" class="active">Normal</button>
                            <button id="dtAcctBonus">Bonus</button>
                        </div>
                    </div>
                    <div id="dtStatsBox">
                        <div>Balance: <b id="dtBalanceText">0</b></div>
                        <div>Level: <b id="dtLevelText">0</b> / ${DT_ROWS}</div>
                        <div>Multiplier: <b id="dtMultText">1.00x</b></div>
                        <div>Payout: <b id="dtPayoutText">0</b></div>
                    </div>
                    <button id="dtActionBtn">Start Climb</button>
                    <button id="dtCashoutBtn">Cash Out</button>
                </div>
                <div id="dtTowerWrap"></div>
            </div>
            <div id="dtLeaderboardWrap">
                <div id="dtLeaderboardTitle">🏆 Top Climbers</div>
                <div id="dtLeaderboardList"><div class="dt-lb-empty">Loading…</div></div>
            </div>
            <div id="dtResizeHandle"></div>
        </div>
        `;
        document.body.appendChild(modal);

        els = {
            modal,
            closeBtn: document.getElementById("dtCloseBtn"),
            towerWrap: document.getElementById("dtTowerWrap"),
            betInput: document.getElementById("dtBetInput"),
            difficultySelect: document.getElementById("dtDifficultySelect"),
            acctNormal: document.getElementById("dtAcctNormal"),
            acctBonus: document.getElementById("dtAcctBonus"),
            balanceText: document.getElementById("dtBalanceText"),
            levelText: document.getElementById("dtLevelText"),
            multText: document.getElementById("dtMultText"),
            payoutText: document.getElementById("dtPayoutText"),
            actionBtn: document.getElementById("dtActionBtn"),
            cashoutBtn: document.getElementById("dtCashoutBtn"),
            halfBtn: document.getElementById("dtHalfBtn"),
            doubleBtn: document.getElementById("dtDoubleBtn"),
            maxBtn: document.getElementById("dtMaxBtn"),
        };

        els.closeBtn.onclick = () => {closeDragonTower(); window.openGamesMenu();}
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && modal.classList.contains("show")) closeDragonTower();
        });

        makeDraggable(document.getElementById("dtBox"), document.getElementById("dtHeader"));
        makeResizable(document.getElementById("dtBox"), document.getElementById("dtResizeHandle"));

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

        els.difficultySelect.onchange = () => {
            state.difficulty = els.difficultySelect.value;
        };

        els.actionBtn.onclick = () => {
            const socket = getSocket();
            if (!socket) return;
            if (state.active) return;
            const amount = Math.floor(Number(els.betInput.value));
            if (!Number.isFinite(amount) || amount <= 0) return;
            socket.emit("dragonTowerStart", {
                amount,
                difficulty: els.difficultySelect.value,
                account: state.account
            });
        };

        els.cashoutBtn.onclick = () => {
            const socket = getSocket();
            if (!socket) return;
            socket.emit("dragonTowerCashout");
        };
    }

    function updateStatsDisplay() {
        els.balanceText.textContent = Math.floor(state.account === "bonus" ? state.bonusBalance : state.balance);
        els.levelText.textContent = state.currentLevel;
        els.multText.textContent = state.multiplier.toFixed(2) + "x";
        const payout = Math.floor(state.betChips * state.multiplier);
        els.payoutText.textContent = state.active ? payout : 0;
    }

    function tileEmoji(hitMine) {
        return hitMine ? "🔥" : "🐉";
    }

    function renderTower() {
        const wrap = els.towerWrap;
        wrap.innerHTML = "";
        const cfg = DT_DIFFICULTIES[state.difficulty] || DT_DIFFICULTIES.easy;
        const tileCount = state.active ? state.tiles : cfg.tiles;

        for (let level = 0; level < DT_ROWS; level++) {
            const row = document.createElement("div");
            row.className = "dt-row";
            const isCurrentRow = state.active && level === state.currentLevel;
            const revealed = state.revealedRows.find(r => r.level === level);
            const isCleared = !!revealed && !revealed.hitMine;

            row.classList.toggle("cleared", isCleared);

            const label = document.createElement("div");
            label.className = "dt-row-label";
            label.textContent = level + 1;

            const tiles = document.createElement("div");
            tiles.className = "dt-tiles";

            for (let t = 0; t < tileCount; t++) {
                const tile = document.createElement("div");
                tile.className = "dt-tile";

                if (revealed) {
                    if (revealed.pickedIndex === t) {
                        tile.classList.add(revealed.hitMine ? "mine" : "safe");
                        tile.textContent = tileEmoji(revealed.hitMine);
                    } else if (revealed.hitMine && Array.isArray(revealed.mineIndices) && revealed.mineIndices.includes(t)) {
                        tile.classList.add("mine");
                        tile.textContent = "🔥";
                    }
                    tile.classList.add("disabled");
                } else if (isCurrentRow) {
                    tile.classList.add("clickable", "current-row");
                    tile.onclick = () => {
                        const socket = getSocket();
                        if (!socket) return;
                        socket.emit("dragonTowerPick", { tileIndex: t });
                    };
                } else {
                    tile.classList.add("disabled");
                }

                tiles.appendChild(tile);
            }

            const multLabel = document.createElement("div");
            multLabel.className = "dt-row-mult";
            const cfgForMult = state.active ? DT_DIFFICULTIES[state.difficulty] : cfg;
            const safeTiles = cfgForMult.tiles - cfgForMult.mines;
            const mult = Math.pow(cfgForMult.tiles / safeTiles, level + 1) * 0.97;
            multLabel.textContent = mult.toFixed(2) + "x";

            row.appendChild(label);
            row.appendChild(tiles);
            row.appendChild(multLabel);
            wrap.appendChild(row);
        }

       
        requestAnimationFrame(() => {
            const rows = wrap.querySelectorAll(".dt-row");
            const idx = state.active ? state.currentLevel : 0;
            if (rows[idx]) rows[idx].scrollIntoView({ block: "center", behavior: "smooth" });
        });
    }

    function renderAll() {
        els.actionBtn.style.display = state.active ? "none" : "block";
        els.actionBtn.disabled = state.active;
        els.cashoutBtn.style.display = (state.active && state.currentLevel > 0) ? "block" : "none";
        els.betInput.disabled = state.active;
        els.difficultySelect.disabled = state.active;
        els.difficultySelect.value = state.difficulty;
        updateStatsDisplay();
        renderTower();
    }

    function renderLeaderboard(leaders) {
        const list = document.getElementById("dtLeaderboardList");
        if (!list) return;
        if (!leaders || leaders.length === 0) {
            list.innerHTML = `<div class="dt-lb-empty">No climbs yet - be the first!</div>`;
            return;
        }
        const rankClass = (i) => (i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "");
        list.innerHTML = leaders.map((entry, i) => `
            <div class="dt-lb-row">
                <span class="dt-lb-rank ${rankClass(i)}">#${i + 1}</span>
                <img class="dt-lb-avatar" src="${entry.avatar}" alt="">
                <span class="dt-lb-name">${entry.username}</span>
                <span class="dt-lb-mult">${entry.multiplier.toFixed(2)}x</span>
            </div>
        `).join("");
    }

    function bindSocketListeners() {
        const socket = getSocket();
        if (!socket || boundSocket === socket) return;
        boundSocket = socket;

        socket.on("dragonTowerState", (data) => {
            if (!data.active) {
                state.active = false;
                state.balance = data.balance ?? state.balance;
                state.bonusBalance = data.bonusBalance ?? state.bonusBalance;
                state.currentLevel = 0;
                state.multiplier = 1;
                state.revealedRows = [];
                renderAll();
                return;
            }
            state.active = true;
            state.difficulty = data.difficulty;
            state.tiles = data.tiles;
            state.betChips = data.betChips;
            state.account = data.account;
            state.currentLevel = data.currentLevel;
            state.multiplier = data.multiplier;
            state.revealedRows = (data.revealedRows || []).map(r => ({ level: r.level, pickedIndex: r.pickedIndex, hitMine: false }));
            renderAll();
        });

        socket.on("dragonTowerStarted", (data) => {
            state.active = true;
            state.difficulty = data.difficulty;
            state.tiles = data.tiles;
            state.betChips = data.betChips;
            state.account = data.account;
            state.currentLevel = 0;
            state.multiplier = 1;
            state.revealedRows = [];
            if (data.account === "bonus") state.bonusBalance = data.balance;
            else state.balance = data.balance;
            renderAll();
        });

        socket.on("dragonTowerTileResult", (data) => {
            state.currentLevel = data.towerComplete ? DT_ROWS : data.level + 1;
            state.multiplier = data.multiplier;
            state.revealedRows.push({ level: data.level, pickedIndex: data.pickedIndex, hitMine: false });
            renderAll();
        });

        socket.on("dragonTowerDied", (data) => {
            state.active = false;
            state.revealedRows.push({
                level: data.level,
                pickedIndex: data.pickedIndex,
                hitMine: true,
                mineIndices: data.mineIndices
            });
            if (data.account === "bonus") state.bonusBalance = data.balance;
            else state.balance = data.balance;
            renderAll();
            dtShowBanner("Dragon got you!", `Died on level ${data.level + 1}. Lost ${data.betChips} chips.`, "#ff0000");
        });

        socket.on("dragonTowerFullClear", (data) => {
            state.active = false;
            if (data.account === "bonus") state.bonusBalance = data.balance;
            else state.balance = data.balance;
            renderAll();
            dtShowBanner("Tower cleared! 🏆", `${data.multiplier.toFixed(2)}x -> +${data.payoutChips} chips!`, "#ff0000");
        });

        socket.on("dragonTowerCashoutResult", (data) => {
            state.active = false;
            if (data.account === "bonus") state.bonusBalance = data.balance;
            else state.balance = data.balance;
            renderAll();
            dtShowBanner("Cashed out!", `Level ${data.level} at ${data.multiplier.toFixed(2)}x -> +${data.payoutChips} chips.`, "#FF0000");
        });

        socket.on("dragonTowerError", (data) => {
            console.warn("Dragon Tower error:", data?.msg);
            if (typeof showToast === "function") showToast(data?.msg || "Error");
        });

        socket.on("dragonTowerLeaderboard", (leaders) => {
            renderLeaderboard(leaders || []);
        });
    }

    function openDragonTower() {
        injectStyles();
        buildModal();
        resetModalPosition();
        els.modal.classList.add("show");
        window.dragonTowerOpen = true;
        bindSocketListeners();
        waitForSocketAndInit();
         if (typeof window.setGameStatus === "function") window.setGameStatus("TowerClimb");
    }

    function waitForSocketAndInit(attemptsLeft = 20) {
        const sock = getSocket();
        if (sock) {
            bindSocketListeners();
            sock.emit("dragonTowerGetState");
            sock.emit("dragonTowerLeaderboardGet");
            return;
        }
        if (attemptsLeft <= 0) return;
        setTimeout(() => waitForSocketAndInit(attemptsLeft - 1), 250);
    }

    function closeDragonTower() {
        if (els.modal) els.modal.classList.remove("show");
        window.dragonTowerOpen = false;
        if (typeof window.clearGameStatus === "function") window.clearGameStatus("TowerClimb");
    }

    window.openDragonTower = openDragonTower;
    window.closeDragonTower = closeDragonTower;

    document.addEventListener("DOMContentLoaded", () => {
        const btn = document.getElementById("dragonTowerBtn");
        if (btn) btn.addEventListener("click", openDragonTower);
    });
    if (document.readyState !== "loading") {
        const btn = document.getElementById("dragonTowerBtn");
        if (btn) btn.addEventListener("click", openDragonTower);
    }
})();