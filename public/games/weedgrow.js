(function () {
    const POT_COUNT = 3;
   const GROW_MS = 60 * 60 * 1000; 
    const DRY_OUT_MS = 15 * 60 * 1000; 
    const WATER_NEEDED_EVERY_MS = 20 * 60 * 1000; 
    const HARVEST_XP = 30;

    function getSocket() {
        if (window.socket) return window.socket;
        try {
            if (typeof socket !== "undefined" && socket) return socket;
        } catch (e) {}
        return null;
    }

    let pots = []; 
    let listenersBound = false;
    let tickTimer = null;
    let els = {};
    function wgLeafIconInnerSVG() {
        return `${svgDefs()}${buildLeafSVG(50, 92, 3.4, 0, false)}`;
    }


    function wgLeafIconMarkup(sizePx) {
        try {
            return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${sizePx}" height="${sizePx}" style="display:inline-block; vertical-align:-${Math.round(sizePx * 0.18)}px; flex-shrink:0;">${wgLeafIconInnerSVG()}</svg>`;
        } catch (e) {
            return "";
        }
    }


    let wgLeafIconCache = null;
    function wgGetLeafIconUrl() {
        if (wgLeafIconCache) return wgLeafIconCache;
        try {
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${wgLeafIconInnerSVG()}</svg>`;
            wgLeafIconCache = "data:image/svg+xml;base64," + btoa(svg);
        } catch (e) {
            wgLeafIconCache = null;
        }
        return wgLeafIconCache;
    }

    function wgGetStackOffset() {
        if (typeof getStackOffset === "function") return getStackOffset();
        let offset = 20;
        document.querySelectorAll('.stacked-notification').forEach(el => {
            offset += el.offsetHeight + 10;
        });
        return offset;
    }

    function wgShowBanner(title, body) {
        const banner = document.createElement('div');
        banner.classList.add('banner-notification', 'stacked-notification', 'timer-5s');
        const topOffset = wgGetStackOffset();

        banner.style.cssText = `
            position: fixed;
            top: ${topOffset}px;
            left: 50%;
            transform: translateX(-50%);
            background: #111214;
            border: 1px solid #3a3c42;
            border-left: 4px solid #ff0000;
            color: white;
            padding: 14px 16px;
            border-radius: 10px;
            z-index: 10001;
            cursor: pointer;
            width: 320px;
            animation: bannerDropIn 0.3s ease-out;
            display: flex;
            flex-direction: column;
            gap: 10px;
            overflow: hidden;
        `;

        const topRow = document.createElement('div');
        topRow.style.cssText = 'display:flex; align-items:center; gap:10px;';

        const iconWrapper = document.createElement('div');
        iconWrapper.style.cssText = `
            width: 42px; height: 42px; border-radius: 50%;
            background: rgba(76, 175, 80, 0.15);
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0; box-shadow: 0 0 12px rgba(76, 175, 80, 0.4);
        `;
        iconWrapper.innerHTML = wgLeafIconMarkup(28);

        const nameCol = document.createElement('div');
        nameCol.style.cssText = 'display:flex; flex-direction:column; gap:3px; flex:1; min-width:0;';

        const titleSpan = document.createElement('div');
        titleSpan.style.cssText = 'font-weight:700; font-size:14px; color:#4caf50;';
        titleSpan.textContent = title;

        const bodySpan = document.createElement('div');
        bodySpan.style.cssText = 'font-size:12px; color:#b9bbbe;';
        bodySpan.textContent = body;

        nameCol.appendChild(titleSpan);
        nameCol.appendChild(bodySpan);

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            background: none; border: none; color: #72767d;
            font-size: 14px; cursor: pointer; padding: 0;
            flex-shrink: 0; align-self: flex-start; transition: color 0.15s;
        `;
        closeBtn.onmouseover = () => closeBtn.style.color = '#fff';
        closeBtn.onmouseout = () => closeBtn.style.color = '#72767d';
        closeBtn.onclick = (e) => { e.stopPropagation(); banner.remove(); window.openGamesMenu();};

        topRow.appendChild(iconWrapper);
        topRow.appendChild(nameCol);
        topRow.appendChild(closeBtn);
        banner.appendChild(topRow);

        banner.onclick = () => {
            if (typeof openWeedGrow === "function") openWeedGrow();
            banner.remove();
        };

        document.body.appendChild(banner);

        setTimeout(() => {
            if (banner.parentNode) {
                banner.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
                banner.style.opacity = '0';
                banner.style.transform = 'translate(-50%, -100%)';
                setTimeout(() => banner.remove(), 400);
            }
        }, 5000);
    }

    function wgNotify(title, body, soundUrl) {
    try {
        if (typeof notifSettings !== "undefined" && notifSettings.browser && typeof sendNotification === "function") {
            sendNotification(title, body, {
                icon: wgGetLeafIconUrl(),
                tag: "weedgrow-wilted",
                requireInteraction: false
            });
        }
    } catch (e) { console.warn("weedgrow notify failed:", e); }

    try {
        wgShowBanner(title, body);
    } catch (e) { console.warn("weedgrow banner failed:", e); }

    try {
        if (typeof notifSettings !== "undefined" && notifSettings.sound) {
            const audio = new Audio(soundUrl);
            audio.volume = 0.5;
            audio.play().catch(() => {});
        }
    } catch (e) {}
}

  
    let wgWiltedBatch = new Set();
    let wgAlreadyNotifiedWilted = new Set();
    let wgWiltedBatchTimer = null;
    const WG_WILT_BATCH_WINDOW_MS = 1500;

    function wgQueueWiltedNotify(potIndex) {
        if (wgAlreadyNotifiedWilted.has(potIndex)) return;
        wgAlreadyNotifiedWilted.add(potIndex);
        wgWiltedBatch.add(potIndex);

        if (wgWiltedBatchTimer) clearTimeout(wgWiltedBatchTimer);
        wgWiltedBatchTimer = setTimeout(() => {
            const count = wgWiltedBatch.size;
            wgWiltedBatch.clear();
            wgWiltedBatchTimer = null;

            const body = count > 1
                ? `${count} plants are wilting, water them now or they'll die soon.`
                : `A plant is wilting, water it now or it'll die soon.`;

            wgNotify("Plant needs water", body, "/sounds/message-new-email.oga");
        }, WG_WILT_BATCH_WINDOW_MS);
    }

    function wgClearWiltedNotified(potIndex) {
        wgAlreadyNotifiedWilted.delete(potIndex);
    }

    function injectStyles() {
        if (document.getElementById("wgStyles")) return;
        const style = document.createElement("style");
        style.id = "wgStyles";
        style.textContent = `
       #wgModal {
        position: fixed; inset: 0; pointer-events: none;
        display: none; align-items: center; justify-content: center;
        z-index: 30500;
        }
        #wgModal.show { display: flex; }
        #wgBox {
        width: 660px; max-width: 96vw; min-width: 480px;
        height: auto; max-height: 92vh; min-height: 420px;
        background: rgba(10, 12, 10, 0.92);
        border: 1px solid #2f3a2f; border-radius: 14px;
        display: flex; flex-direction: column; overflow: hidden;
        pointer-events: auto;
        position: relative;
        }
        #wgRoomWrap, #wgLeaderboardWrap { flex-shrink: 1; overflow-y: auto; }
        #wgResizeHandle {
        position: absolute; bottom: 0; right: 0;
        width: 18px; height: 18px; cursor: nwse-resize;
        background: linear-gradient(135deg, transparent 50%, #4a4d54 50%);
        border-bottom-right-radius: 14px;
        z-index: 5;
        }

        #wgHeader {
        display:flex; align-items:center; justify-content:space-between;
        padding: 14px 18px;
        }
        #wgHeader h3 { margin:0; color:#fff; font-size:16px; pointer-events:none; }
        #wgHeader { cursor: move; user-select: none; }
        #wgBox.wg-dragging { transition: none !important; }
        #wgCloseBtn {
        background:none; border:none; color:#72767d; font-size:20px; cursor:pointer;
        transition: color .15s;
        }
        #wgCloseBtn:hover { color:#fff; }
        #wgRoomWrap {
        padding: 24px 18px;
        background: radial-gradient(ellipse at top, #14251a 0%, #0a0f0a 100%);
        display:flex; gap:18px; justify-content:center;
        }
        .wg-pot-slot {
        width: 180px; display:flex; flex-direction:column; align-items:center; gap:8px;
        }
        .wg-light {
        width: 40px; height: 14px; border-radius: 3px;
        background: linear-gradient(180deg, #fff6c9, #e0c34f);
        box-shadow: 0 0 18px 6px rgba(255, 240, 150, 0.55);
        }
        .wg-light.off { background:#333; box-shadow:none; }
        .wg-plant-area {
        width: 140px; height: 110px; display:flex; align-items:flex-end; justify-content:center;
        position: relative; margin-top: 14px;
        }
        .wg-plant {
        font-size: 10px; text-align:center; line-height:1.1; user-select:none;
        transition: font-size .3s;
        }
        .wg-pot {
        width: 66px; height: 44px;
        background: linear-gradient(180deg, #8a5a2b, #6b4420);
        border-radius: 5px 5px 12px 12px;
        border: 1px solid #4a2f16;
        position: relative;
        display:flex; align-items:flex-start; justify-content:center;
        cursor: pointer;
        transition: transform .1s;
        }
        .wg-pot:hover { transform: scale(1.03); }
        .wg-pot.disabled { cursor:default; }
        .wg-pot-rim {
        position:absolute; top:-6px; left:-4px; right:-4px; height:12px;
        background:#7a4c25; border-radius: 6px; border: 1px solid #4a2f16;
        }
        .wg-plant-svg {
        position:absolute; bottom:44px; display:flex; align-items:flex-end; justify-content:center;
        transition: transform .3s ease;
        }
        .wg-plant-svg svg { display:block; overflow: visible; }
        .wg-empty-plus { font-size: 30px; color:#3a4a3a; }
        .wg-water-drop {
        font-size: 26px; position:absolute; top:-30px; cursor:pointer;
        filter: drop-shadow(0 0 4px rgba(60,160,255,.6));
        animation: wgBob 1.2s ease-in-out infinite;
        }
        @keyframes wgBob { 0%,100%{ transform: translateY(0);} 50%{ transform: translateY(-6px);} }
        .wg-status {
        font-size: 12px; color:#b9bbbe; text-align:center; min-height: 32px;
        }
        .wg-status b { color:#ffd700; }
        .wg-progress-track {
        width: 100%; height: 6px; border-radius: 3px; background:#20291f; overflow:hidden;
        }
        .wg-progress-fill {
        height:100%; background: linear-gradient(90deg,#3fae4c,#8fdc6a);
        transition: width .4s linear;
        }
        .wg-progress-fill.wilted { background: linear-gradient(90deg,#8a3f2b,#5c2a1c); }
        .wg-harvest-btn {
        margin-top: 4px; background:#2f8f4e; border:none; color:#fff; padding:6px 14px;
        border-radius:8px; cursor:pointer; font-size:12px; font-weight:700;
        transition: filter .15s, opacity .15s;
        }
        .wg-harvest-btn:disabled { opacity:.3; cursor:not-allowed; }
        .wg-harvest-btn:hover:not(:disabled) { filter:brightness(1.15); }
        #wgFooter {
        padding: 12px 18px; text-align:center;
        color:#72767d; font-size:12px;
        }
        #wgFooter b { color:#ffd700; }
        #wgLeaderboardWrap {
        padding: 14px 18px 16px;
        max-height: 220px; overflow-y: auto;
        }
        #wgLeaderboardTitle {
        color:#fff; font-size:13px; font-weight:700; margin:0 0 10px;
        display:flex; align-items:center; gap:6px;
        }
        .wg-lb-row {
        display:flex; align-items:center; gap:10px; padding:6px 4px;
        border-radius:6px;
        }
        .wg-lb-row:nth-child(odd) { background: rgba(255,255,255,0.02); }
        .wg-lb-rank {
        width: 20px; text-align:center; font-size:12px; font-weight:700; color:#72767d; flex-shrink:0;
        }
        .wg-lb-rank.gold { color:#ffd700; }
        .wg-lb-rank.silver { color:#c9c9c9; }
        .wg-lb-rank.bronze { color:#cd7f32; }
        .wg-lb-avatar {
        width: 26px; height: 26px; border-radius: 50%; object-fit: cover; flex-shrink:0;
        background: #2b2d31;
        }
        .wg-lb-name {
        flex:1; color:#dcddde; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
        }
        .wg-lb-count {
        color:#8fdc6a; font-size:12px; font-weight:700; flex-shrink:0;
        }
        .wg-lb-empty {
        color:#72767d; font-size:12px; text-align:center; padding: 8px 0;
        }

        .wg-harvest-btn.wg-btn-disabled-look {
        opacity: .3;
        cursor: not-allowed;
        pointer-events: auto;
        }
                `;
        document.head.appendChild(style);
    }

    function makeDraggable(box, handle) {
        if (!box || !handle) return;
        let dragging = false;
        let startX = 0, startY = 0, startLeft = 0, startTop = 0;

        function onPointerDown(e) {
            if (e.target.closest("button")) return;
            dragging = true;
            box.classList.add("wg-dragging");

            const rect = box.getBoundingClientRect();
            box.style.position = "fixed";
            box.style.left = rect.left + "px";
            box.style.top = rect.top + "px";
            box.style.margin = "0";

            startX = e.clientX;
            startY = e.clientY;
            startLeft = rect.left;
            startTop = rect.top;

            document.addEventListener("mousemove", onPointerMove);
            document.addEventListener("mouseup", onPointerUp);
            e.preventDefault();
        }

        function onPointerMove(e) {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            const maxLeft = window.innerWidth - box.offsetWidth;
            const maxTop = window.innerHeight - box.offsetHeight;
            const newLeft = Math.min(Math.max(0, startLeft + dx), Math.max(0, maxLeft));
            const newTop = Math.min(Math.max(0, startTop + dy), Math.max(0, maxTop));
            box.style.left = newLeft + "px";
            box.style.top = newTop + "px";
        }

        function onPointerUp() {
            dragging = false;
            box.classList.remove("wg-dragging");
            document.removeEventListener("mousemove", onPointerMove);
            document.removeEventListener("mouseup", onPointerUp);
        }

        handle.addEventListener("mousedown", onPointerDown);
    }

    function resetModalPosition() {
        const box = document.getElementById("wgBox");
        if (!box) return;
        box.style.position = "";
        box.style.left = "";
        box.style.top = "";
        box.style.margin = "";
        box.style.width = "";
        box.style.height = "";
    }

    function buildModal() {
        if (document.getElementById("wgModal")) return;

        const modal = document.createElement("div");
        modal.id = "wgModal";
        modal.innerHTML = `
        <div id="wgBox">
        <div id="wgHeader">
        <h3>${wgLeafIconMarkup(22)} Grow Room</h3>
        <button id="wgCloseBtn">✕</button>
        </div>
        <div id="wgRoomWrap"></div>
        <div id="wgLeaderboardWrap">
            <div id="wgLeaderboardTitle">🏆 Top Growers</div>
            <div id="wgLeaderboardList"><div class="wg-lb-empty">Loading…</div></div>
        </div>
        <div id="wgFooter">Water each plant when it's thirsty. Full grow takes ~1 hour. Harvest for <b>${HARVEST_XP} XP</b>.</div>
        <div id="wgResizeHandle"></div>
        </div>
        `;
        document.body.appendChild(modal);

        els = {
            modal,
            closeBtn: document.getElementById("wgCloseBtn"),
            roomWrap: document.getElementById("wgRoomWrap"),
        };

        els.closeBtn.onclick = () => {    
        closeWeedGrow();
        window.openGamesMenu();    
        }
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && modal.classList.contains("show")) closeWeedGrow();
        });

        makeDraggable(document.getElementById("wgBox"), document.getElementById("wgHeader"));
        makeResizable(document.getElementById("wgBox"), document.getElementById("wgResizeHandle"));

        for (let i = 0; i < POT_COUNT; i++) {
            const slot = document.createElement("div");
            slot.className = "wg-pot-slot";
            slot.dataset.idx = i;
            slot.innerHTML = `
                <div class="wg-light" data-role="light"></div>
                <div class="wg-plant-area">
                    <div class="wg-water-drop" data-role="water" style="display:none;">💧</div>
                    <div class="wg-plant-svg" data-role="plant"><span class="wg-empty-plus">➕</span></div>
                    <div class="wg-pot" data-role="pot"><div class="wg-pot-rim"></div></div>
                </div>
                <div class="wg-progress-track"><div class="wg-progress-fill" data-role="fill" style="width:0%;"></div></div>
                <div class="wg-status" data-role="status">Empty pot</div>
                <button class="wg-harvest-btn" data-role="harvest" data-ready="false">Harvest</button>
            `;
slot.querySelector('[data-role="pot"]').onclick = () => {
    wgLogClick(i, "plant");
    const socket = getSocket();
    if (!socket) return;
    const pot = pots[i];
    if (!pot || pot.stage === "empty") {
        socket.emit("weedPlant", { potIndex: i });
    }
};
slot.querySelector('[data-role="water"]').onclick = (e) => {
    e.stopPropagation();
    wgLogClick(i, "water");
    const socket = getSocket();
    if (!socket) return;
    socket.emit("weedWater", { potIndex: i });
};
slot.querySelector('[data-role="harvest"]').onclick = (e) => {
    wgLogClick(i, "harvest");
    const socket = getSocket();
    if (!socket) return;
    if (e.currentTarget.dataset.ready !== "true") return; 
    socket.emit("weedHarvest", { potIndex: i });
};
            els.roomWrap.appendChild(slot);
        }
    }

    let svgDefsInjected = false;
    function svgDefs() {
        return `
        <defs>
            <linearGradient id="wgLeafGrad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stop-color="#1f5c26"/>
                <stop offset="55%" stop-color="#3d8c3f"/>
                <stop offset="100%" stop-color="#5fae52"/>
            </linearGradient>
            <linearGradient id="wgLeafGradWilt" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stop-color="#4a3a1f"/>
                <stop offset="55%" stop-color="#7a6234"/>
                <stop offset="100%" stop-color="#93794a"/>
            </linearGradient>
            <radialGradient id="wgBudGrad" cx="35%" cy="30%" r="75%">
                <stop offset="0%" stop-color="#e8f0c0"/>
                <stop offset="45%" stop-color="#b9d17e"/>
                <stop offset="100%" stop-color="#6f8f3f"/>
            </radialGradient>
        </defs>`;
    }

    function makeResizable(box, handle) {
    if (!box || !handle) return;
    let resizing = false;
    let startX = 0, startY = 0, startW = 0, startH = 0;

    function onDown(e) {
        resizing = true;
        const rect = box.getBoundingClientRect();
        box.style.position = "fixed";
        box.style.left = rect.left + "px";
        box.style.top = rect.top + "px";
        box.style.margin = "0";

        startX = e.clientX;
        startY = e.clientY;
        startW = rect.width;
        startH = rect.height;

        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        e.preventDefault();
        e.stopPropagation();
    }

    function onMove(e) {
        if (!resizing) return;
        const minW = parseInt(getComputedStyle(box).minWidth) || 480;
        const minH = parseInt(getComputedStyle(box).minHeight) || 420;
        const maxW = window.innerWidth * 0.96;
        const maxH = window.innerHeight * 0.92;

        const newW = Math.min(maxW, Math.max(minW, startW + (e.clientX - startX)));
        const newH = Math.min(maxH, Math.max(minH, startH + (e.clientY - startY)));

        box.style.width = newW + "px";
        box.style.height = newH + "px";
    }

    function onUp() {
        resizing = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
    }

    handle.addEventListener("mousedown", onDown);
}


    function leafletPath(len, wilted) {
        const w = len * 0.085; 
        const teeth = 8;
        let left = [];
        let right = [];
        for (let i = 1; i < teeth; i++) {
            const t = i / teeth;
            const envelope = Math.sin(Math.PI * Math.pow(t, 0.55)) * (1 - t * 0.5);
            const widthAt = w * envelope;
            const jag = (i % 2 === 0) ? widthAt * 1.25 : widthAt * 0.7;
            const y = -len * t;
            left.push(`${(-jag).toFixed(2)},${y.toFixed(2)}`);
            right.push(`${jag.toFixed(2)},${y.toFixed(2)}`);
        }
        const pts = [`0,0`, ...left, `0,${-len}`, ...right.reverse(), `0,0`];
        const fill = wilted ? "url(#wgLeafGradWilt)" : "url(#wgLeafGrad)";
        const stroke = wilted ? "#3a2c15" : "#132e17";
        return `<g>
            <polygon points="${pts.join(" ")}" fill="${fill}" stroke="${stroke}" stroke-width="0.4" stroke-linejoin="round"/>
            <line x1="0" y1="0" x2="0" y2="${-len * 0.95}" stroke="${stroke}" stroke-width="0.35" opacity="0.5"/>
        </g>`;
    }


    function buildLeafSVG(cx, cy, scale, rotationDeg, wilted) {
        const bladeAngles = [-78, -52, -27, 0, 27, 52, 78];
        const lens =        [12,  17,  22,  26, 22,  17,  12];
        const blades = bladeAngles.map((angle, i) =>
            `<g transform="rotate(${angle})">${leafletPath(lens[i], wilted)}</g>`
        ).join("");
        return `<g transform="translate(${cx},${cy}) scale(${scale}) rotate(${rotationDeg})">${blades}</g>`;
    }


    function budCluster(cx, cy, scale, wilted, tall) {
        if (wilted) return "";
        const segCount = tall ? 6 : 4;
        let blobs = "";
        let hairs = "";
        for (let i = 0; i < segCount; i++) {
            const t = i / (segCount - 1); 
            const yy = -i * 3.2;
            const rx = (2.6 - t * 1.1) + (i % 2 === 0 ? 0.4 : -0.2);
            const xx = (i % 2 === 0 ? 1 : -1) * (0.6 * (1 - t));
            blobs += `<ellipse cx="${xx.toFixed(1)}" cy="${yy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${(rx * 1.05).toFixed(1)}" fill="url(#wgBudGrad)" stroke="#5f7a35" stroke-width="0.3"/>`;
         
            const hAngles = [140 + i * 7, 40 - i * 7];
            hAngles.forEach((a) => {
                const rad = (a * Math.PI) / 180;
                const len = 3 + Math.random() * 1.8;
                const x2 = xx + Math.cos(rad) * len;
                const y2 = yy - Math.abs(Math.sin(rad)) * len * 0.6;
                hairs += `<line x1="${xx.toFixed(1)}" y1="${yy.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#e08a3c" stroke-width="0.55" stroke-linecap="round"/>`;
            });
        }
        return `<g transform="translate(${cx},${cy}) scale(${scale})">${blobs}${hairs}</g>`;
    }

  
    function branchLine(fromX, fromY, toX, toY, stemColor, widthPx) {
        return `<line x1="${fromX}" y1="${fromY}" x2="${toX}" y2="${toY}" stroke="${stemColor}" stroke-width="${widthPx}" stroke-linecap="round"/>`;
    }

    function buildPlantSVG(pot) {
        const progress = pot.progress || 0;
        const wilted = !!pot.wilted;
        const stemColor = wilted ? "#6b5233" : "#3f7a2e";
        const leafScale = wilted ? 0.7 : 1;
        const defs = svgDefs();

    
        if (pot.stage === "empty") return "";

        if (progress < 0.15) {
         
            return `
            <svg viewBox="0 0 100 100" width="48" height="48">
                ${defs}
                <line x1="50" y1="94" x2="50" y2="64" stroke="${stemColor}" stroke-width="4" stroke-linecap="round"/>
                ${buildLeafSVG(50, 60, 0.55 * leafScale, 0, wilted)}
            </svg>`;
        }

        if (progress < 0.4) {
         
            return `
            <svg viewBox="0 0 100 100" width="58" height="58">
                ${defs}
                <line x1="50" y1="96" x2="50" y2="58" stroke="${stemColor}" stroke-width="4.5" stroke-linecap="round"/>
                ${branchLine(50, 78, 36, 68, stemColor, 2)}
                ${branchLine(50, 78, 64, 68, stemColor, 2)}
                ${buildLeafSVG(36, 66, 0.45 * leafScale, -20, wilted)}
                ${buildLeafSVG(64, 66, 0.45 * leafScale, 20, wilted)}
                ${buildLeafSVG(50, 56, 0.55 * leafScale, 0, wilted)}
            </svg>`;
        }

        if (progress < 0.65) {
         
            return `
            <svg viewBox="0 0 100 100" width="68" height="68">
                ${defs}
                <line x1="50" y1="98" x2="50" y2="48" stroke="${stemColor}" stroke-width="5" stroke-linecap="round"/>
                ${branchLine(50, 84, 32, 72, stemColor, 2.4)}
                ${branchLine(50, 84, 68, 72, stemColor, 2.4)}
                ${branchLine(50, 64, 36, 54, stemColor, 2)}
                ${branchLine(50, 64, 64, 54, stemColor, 2)}
                ${buildLeafSVG(32, 70, 0.5 * leafScale, -25, wilted)}
                ${buildLeafSVG(68, 70, 0.5 * leafScale, 25, wilted)}
                ${buildLeafSVG(36, 52, 0.45 * leafScale, -18, wilted)}
                ${buildLeafSVG(64, 52, 0.45 * leafScale, 18, wilted)}
                ${buildLeafSVG(50, 46, 0.5 * leafScale, 0, wilted)}
            </svg>`;
        }

        if (progress < 0.9) {
           
            const buds = `
                ${budCluster(50, 36, 0.35, wilted, false)}
                ${budCluster(34, 52, 0.25, wilted, false)}
                ${budCluster(66, 52, 0.25, wilted, false)}
            `;
            return `
            <svg viewBox="0 0 100 100" width="76" height="76">
                ${defs}
                <line x1="50" y1="98" x2="50" y2="40" stroke="${stemColor}" stroke-width="5.5" stroke-linecap="round"/>
                ${branchLine(50, 86, 28, 72, stemColor, 2.6)}
                ${branchLine(50, 86, 72, 72, stemColor, 2.6)}
                ${branchLine(50, 66, 32, 54, stemColor, 2.2)}
                ${branchLine(50, 66, 68, 54, stemColor, 2.2)}
                ${buildLeafSVG(28, 70, 0.55 * leafScale, -28, wilted)}
                ${buildLeafSVG(72, 70, 0.55 * leafScale, 28, wilted)}
                ${buildLeafSVG(32, 52, 0.5 * leafScale, -18, wilted)}
                ${buildLeafSVG(68, 52, 0.5 * leafScale, 18, wilted)}
                ${buildLeafSVG(50, 38, 0.5 * leafScale, 0, wilted)}
                ${buds}
            </svg>`;
        }

  
        const buds = `
            ${budCluster(50, 32, 0.55, wilted, true)}
            ${budCluster(30, 50, 0.4, wilted, true)}
            ${budCluster(70, 50, 0.4, wilted, true)}
            ${budCluster(40, 60, 0.3, wilted, false)}
            ${budCluster(60, 60, 0.3, wilted, false)}
        `;
        return `
        <svg viewBox="0 0 100 100" width="84" height="84">
            ${defs}
            <line x1="50" y1="98" x2="50" y2="36" stroke="${stemColor}" stroke-width="6" stroke-linecap="round"/>
            ${branchLine(50, 88, 24, 74, stemColor, 3)}
            ${branchLine(50, 88, 76, 74, stemColor, 3)}
            ${branchLine(50, 68, 30, 56, stemColor, 2.4)}
            ${branchLine(50, 68, 70, 56, stemColor, 2.4)}
            ${buildLeafSVG(24, 72, 0.62 * leafScale, -30, wilted)}
            ${buildLeafSVG(76, 72, 0.62 * leafScale, 30, wilted)}
            ${buildLeafSVG(30, 54, 0.5 * leafScale, -18, wilted)}
            ${buildLeafSVG(70, 54, 0.5 * leafScale, 18, wilted)}
            ${buildLeafSVG(50, 34, 0.5 * leafScale, 0, wilted)}
            ${buds}
        </svg>`;
    }

    function renderPots() {
        for (let i = 0; i < POT_COUNT; i++) {
            const slot = els.roomWrap.querySelector(`.wg-pot-slot[data-idx="${i}"]`);
            if (!slot) continue;
            const pot = pots[i] || { stage: "empty" };

            const light = slot.querySelector('[data-role="light"]');
            const plantContainer = slot.querySelector('[data-role="plant"]');
            const potEl = slot.querySelector('[data-role="pot"]');
            const waterDrop = slot.querySelector('[data-role="water"]');
            const fill = slot.querySelector('[data-role="fill"]');
            const status = slot.querySelector('[data-role="status"]');
            const harvestBtn = slot.querySelector('[data-role="harvest"]');

            light.classList.toggle("off", pot.stage === "empty");
            plantContainer.innerHTML = pot.stage === "empty"
                ? `<span class="wg-empty-plus">➕</span>`
                : buildPlantSVG(pot);
            potEl.classList.toggle("disabled", pot.stage !== "empty");

            const pct = Math.min(100, Math.round((pot.progress || 0) * 100));
            fill.style.width = `${pct}%`;
            fill.classList.toggle("wilted", !!pot.wilted);

            waterDrop.style.display = (pot.stage !== "empty" && pot.stage !== "ready" && (pot.needsWater || pot.wilted)) ? "block" : "none";

            const isReady = pot.stage === "ready";
            harvestBtn.dataset.ready = isReady ? "true" : "false";
            harvestBtn.classList.toggle("wg-btn-disabled-look", !isReady);

        if (pot.stage === "empty") {
            status.innerHTML = "Empty pot click to plant";
        } else if (pot.stage === "ready") {
            status.innerHTML = `<b>Ready to harvest!</b>`;
        } else if (pot.wilted) {
            const mins = Math.max(0, Math.ceil((pot.deathInMs || 0) / 60000));
            status.innerHTML = `Wilting dies in <b>${mins}m</b> water it now!`;
        } else if (pot.needsWater) {
            status.innerHTML = `Thirsty needs water`;
        } else {
            const mins = Math.ceil((pot.growMsLeft || 0) / 60000);
            status.innerHTML = `Growing <b>${mins}m</b> left`;
        }
        }
    }

    function renderLeaderboard(leaders) {
        const list = document.getElementById("wgLeaderboardList");
        if (!list) return;
        if (!leaders || leaders.length === 0) {
            list.innerHTML = `<div class="wg-lb-empty">No harvests yet be the first!</div>`;
            return;
        }
        const leafIcon = wgLeafIconMarkup(20);
        const rankClass = (i) => (i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "");
        list.innerHTML = leaders.map((entry, i) => `
            <div class="wg-lb-row">
                <span class="wg-lb-rank ${rankClass(i)}">#${i + 1}</span>
                <img class="wg-lb-avatar" src="${entry.avatar}" alt="">
                <span class="wg-lb-name">${entry.username}</span>
                <span class="wg-lb-count">${entry.count} ${leafIcon}</span>
            </div>
        `).join("");
    }

function startLocalTicker() {
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(() => {
        pots.forEach((pot) => {
            if (!pot || pot.stage === "empty" || pot.stage === "ready") return;
            if (pot.wilted) {
                if (typeof pot.deathInMs === "number") {
                    pot.deathInMs = Math.max(0, pot.deathInMs - 1000);
                }
                
            } else if (typeof pot.growMsLeft === "number") {
                pot.growMsLeft = Math.max(0, pot.growMsLeft - 1000);
                pot.progress = Math.min(1, 1 - (pot.growMsLeft / GROW_MS));
                if (pot.growMsLeft <= 0) pot.stage = "ready";
            }
        });
        renderPots();
    }, 1000);
}

let boundSocket = null; 

function bindSocketListeners() {
    const socket = getSocket();
    if (!socket || boundSocket === socket) return; 
    boundSocket = socket;

    socket.on("weedState", (state) => {
        pots = state.pots || [];
        renderPots();
    });

    socket.on("weedDied", (data) => {
        if (pots[data.potIndex] !== undefined) pots[data.potIndex] = data.pot;
        renderPots();
        wgClearWiltedNotified(data.potIndex);
        const slot = els.roomWrap.querySelector(`.wg-pot-slot[data-idx="${data.potIndex}"] [data-role="status"]`);
        if (slot) slot.innerHTML = `<b>Plant died from neglect</b>`;
        wgNotify(
            "Plant died",
            `Pot ${data.potIndex + 1}'s plant died from neglect.`,
            "/sounds/message-new-email.oga"
        );
    });


        socket.on("weedPlanted", (data) => {
            if (pots[data.potIndex] !== undefined) pots[data.potIndex] = data.pot;
            wgClearWiltedNotified(data.potIndex);
            renderPots();
        });

        socket.on("weedWatered", (data) => {
            if (pots[data.potIndex] !== undefined) pots[data.potIndex] = data.pot;
            wgClearWiltedNotified(data.potIndex);
            renderPots();
        });

        socket.on("weedWilted", (data) => {
            if (pots[data.potIndex] !== undefined) pots[data.potIndex] = data.pot;
            renderPots();
            wgQueueWiltedNotify(data.potIndex);
        });

        socket.on("weedReady", (data) => {
            if (pots[data.potIndex] !== undefined) pots[data.potIndex] = data.pot;
            renderPots();
        });

        socket.on("weedHarvested", (data) => {
            if (pots[data.potIndex] !== undefined) pots[data.potIndex] = data.pot;
            wgClearWiltedNotified(data.potIndex);
            renderPots();
            const slot = els.roomWrap.querySelector(`.wg-pot-slot[data-idx="${data.potIndex}"] [data-role="status"]`);
            if (slot) slot.innerHTML = `<b>+${data.xpAwarded} XP!</b> 🎉`;
        });

        socket.on("weedError", (data) => {
            console.warn("Weed grow error:", data?.msg);
        });

        socket.on("weedLeaderboardState", (data) => {
            renderLeaderboard(data?.leaders || []);
        });
    }

    function openWeedGrow() {
        injectStyles();
        buildModal();
        resetModalPosition();
        els.modal.classList.add("show");
        window.weedGrowOpen = true;
        startLocalTicker();
        waitForSocketAndInit();
         if (typeof window.setGameStatus === "function") window.setGameStatus("GrowRoom");
    }

    function waitForSocketAndInit(attemptsLeft = 20) {
        const sock = getSocket();
        if (sock) {
            bindSocketListeners();
            sock.emit("weedGetState");
            sock.emit("weedLeaderboardGet");
            return;
        }
        if (attemptsLeft <= 0) return;
        setTimeout(() => waitForSocketAndInit(attemptsLeft - 1), 250);
    }

    function wgLogClick(potIndex, action) {
    const socket = getSocket();
    if (!socket) return;
    socket.emit("weedButtonClick", {
        potIndex,
        action,         
        clientTs: Date.now()
    });
}

    function closeWeedGrow() {
        if (els.modal) els.modal.classList.remove("show");
        window.weedGrowOpen = false;
        if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
        if (typeof window.clearGameStatus === "function") window.clearGameStatus("GrowRoom");
    }

    window.openWeedGrow = openWeedGrow;
    window.closeWeedGrow = closeWeedGrow;

    document.addEventListener("DOMContentLoaded", () => {
        const btn = document.getElementById("weedGrowBtn");
        if (btn) btn.addEventListener("click", openWeedGrow);
    });
    if (document.readyState !== "loading") {
        const btn = document.getElementById("weedGrowBtn");
        if (btn) btn.addEventListener("click", openWeedGrow);
    }


})();