(function () {

    function forwardClickTo(id) {
        return function () {
            const el = document.getElementById(id);
            if (el) el.click();
        };
    }

    const GAMES = {
        singleplayer: [
            {
                label: "Daily Wheel",
                icon: `<path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" /><path d="M6.7 6.7l3.1 3.1" /><path d="M14.2 14.2l3.1 3.1" /><path d="M17.3 6.7l-3.1 3.1" /><path d="M9.8 14.2l-3.1 3.1" />`,
                open: () => window.openWheelModal && window.openWheelModal()
            },
            {
                label: "Pepe Runner",
                icon: `<path d="M11 16.5c-2.318 -4.033 -4.972 -6 -8 -6c-1.657 0 -3 1.343 -3 3c0 4.006 4.087 7.5 8 7.5c1.5 0 3 -1.5 3 -4.5z" /><path d="M11 16.5c2.318 -4.033 4.972 -6 8 -6c1.657 0 3 1.343 3 3c0 4.006 -4.087 7.5 -8 7.5c-1.5 0 -3 -1.5 -3 -4.5z" /><path d="M9.5 7a2.5 2.5 0 0 0 -2.5 2.5v0a2.5 2.5 0 0 0 2.5 2.5h5a2.5 2.5 0 0 0 2.5 -2.5v0a2.5 2.5 0 0 0 -2.5 -2.5" />`,
                open: () => window.openPepeRunner && window.openPepeRunner()
            },
            {
                label: "Dice",
                icon: `<path d="M4 4m0 3a3 3 0 0 1 3 -3h10a3 3 0 0 1 3 3v10a3 3 0 0 1 -3 3h-10a3 3 0 0 1 -3 -3z" /><path d="M8 8v.01" /><path d="M16 16v.01" /><path d="M8 16v.01" /><path d="M16 8v.01" /><path d="M12 12v.01" />`,
                open: () => window.openDiceModal && window.openDiceModal()
            },
            {
                label: "Plinko",
                icon: `<path d="M6 4m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M12 4m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M18 4m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M9 10m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M15 10m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M6 16m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M12 16m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M18 16m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />`,
                open: forwardClickTo("plinkoBtn")
            },

            
            {
                label: "Minesweeper",
                icon: `<path d="M17 4a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" /><path d="M19 7v.01" /><path d="M17 5h1.5a1.5 1.5 0 0 1 1.5 1.5v.5" /><path d="M11.5 6.5l2 2" /><path d="M13 5l-1.5 1.5" /><path d="M8 12m-6 0a6 6 0 1 0 12 0a6 6 0 1 0 -12 0" />`,
                open: forwardClickTo("minesweeperBtn")
            },
            {
                label: "Grow Room",
                icon: `<path d="M7 20h10" /><path d="M10 20c0 -4.4 -2 -8 -2 -12" /><path d="M14 20c0 -4.4 2 -8 2 -12" /><path d="M8 8c-2.5 0 -4.5 -2 -4.5 -4.5c2.5 0 4.5 2 4.5 4.5" /><path d="M16 8c2.5 0 4.5 -2 4.5 -4.5c-2.5 0 -4.5 2 -4.5 4.5" /><path d="M8 14c-2.5 0 -4.5 -2 -4.5 -4.5c2.5 0 4.5 2 4.5 4.5" /><path d="M16 14c2.5 0 4.5 -2 4.5 -4.5c-2.5 0 -4.5 2 -4.5 4.5" />`,
                open: forwardClickTo("weedGrowBtn")
            },

            {
                label: "Slots",
                icon: `<path d="M6 12l4 0" /><path d="M8 10l0 4" /><path d="M15 11l0 .01" /><path d="M18 12l0 .01" /><path d="M4.5 8h15a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1 -2.5 2.5c-1.5 0 -3 -1 -4 -2l-.5 -.5h-6l-.5 .5c-1 1 -2.5 2 -4 2a2.5 2.5 0 0 1 -2.5 -2.5v-5a2.5 2.5 0 0 1 2.5 -2.5" />`,
                open: forwardClickTo("slotsBtn")
            },
            {
                label: "Sky Runner",
                icon: `<path d="M16 10h4a2 2 0 0 1 0 4h-4l-4 7h-3l2 -7h-4l-2 2h-3l2 -4l-2 -4h3l2 2h4l-2 -7h3z" />`,
                open: forwardClickTo("aviaBtn")
            },

            {
                label: "Tower Climb",
                icon: `<path d="M4 20l4 -9l4 9" /><path d="M6 15h4" /><path d="M14 20l3 -12l3 12" /><path d="M13.5 12h5" />`,
                open: forwardClickTo("dragonTowerBtn")
            },

            {
                label: "Darts",
                icon: `<circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" />`,
                open: forwardClickTo("dartsBtn")
            },
                ],
        multiplayer: [
            {
                label: "Blackjack",
                icon: `<path d="M4 8a2 2 0 0 1 2 -2h4l4 4v8a2 2 0 0 1 -2 2h-6a2 2 0 0 1 -2 -2z" /><path d="M14 6v-2a2 2 0 0 0 -2 -2h-6a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h2" />`,
                open: () => window.openBlackjack && window.openBlackjack()
            },
            {
                label: "Poker",
                icon: `<path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" /><path d="M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" /><path d="M12 3l0 3" /><path d="M12 18l0 3" /><path d="M3 12l3 0" /><path d="M18 12l3 0" /><path d="M5.6 5.6l2.1 2.1" /><path d="M16.3 16.3l2.1 2.1" /><path d="M5.6 18.4l2.1 -2.1" /><path d="M16.3 7.7l2.1 -2.1" />`,
                open: () => window.openPokerModal && window.openPokerModal()
            },
            {
                label: "Pong",
                icon: `<path d="M4.5 12.5m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" /><path d="M6 11l9 -9" /><path d="M9 6l4.5 4.5" /><path d="M11.5 19.5l7 -7a1 1 0 0 0 0 -1.5l-2.5 -2.5a1 1 0 0 0 -1.5 0l-7 7a5 5 0 0 0 4 4z" />`,
                open: forwardClickTo("pongBtn")
            },
            {
                label: "Airstrike",
                icon: `<path d="M16 10h4a2 2 0 0 1 0 4h-4l-4 7h-3l2 -7h-4l-2 2h-3l2 -4l-2 -4h3l2 2h4l-2 -7h3z" />`,
                open: forwardClickTo("airstrikeBtn")
            },

            {
                label: "Roulette",
                icon: `<path stroke="none" d="M0 0h24v24H0z" fill="none" /><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="1" fill="currentColor" /><line x1="12" y1="3" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="21" /><line x1="3" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="21" y2="12" /><line x1="5.64" y1="5.64" x2="7.76" y2="7.76" /><line x1="16.24" y1="16.24" x2="18.36" y2="18.36" /><line x1="18.36" y1="5.64" x2="16.24" y2="7.76" /><line x1="7.76" y1="16.24" x2="5.64" y2="18.36" />`,
                open: () => window.openRoulette && window.openRoulette()
            },
        ]
    };

    function injectStyles() {
        if (document.getElementById("gamesMenuStyles")) return;
        const style = document.createElement("style");
        style.id = "gamesMenuStyles";
        style.textContent = `
        .games-menu-tile {
            display:flex; flex-direction:column; align-items:center; gap:8px;
            background:#1e1f22; border:1px solid #3a3c42; border-radius:10px;
            padding:14px 8px; cursor:pointer; color:#dcddde; transition: background .15s, border-color .15s, transform .1s;
        }
        .games-menu-tile:hover { background:#2b2d31; border-color:#FF0000; transform: translateY(-2px); }
        .games-menu-tile svg { width:26px; height:26px; stroke:#fff; }
        .games-menu-tile span { font-size:12px; font-weight:600; text-align:center; }
        .games-menu-tab.active { color:#fff !important;}
        `;
        document.head.appendChild(style);
    }

    function buildPane(paneEl, games) {
        paneEl.innerHTML = "";
        games.forEach((g) => {
            const tile = document.createElement("div");
            tile.className = "games-menu-tile";
            tile.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                    ${g.icon}
                </svg>
                <span>${g.label}</span>
            `;
            tile.onclick = () => {
                closeGamesMenu();
                g.open();
            };
            paneEl.appendChild(tile);
        });
    }

    let built = false;
    function ensureBuilt() {
        if (built) return;
        injectStyles();

        if (window.buildGlobalBonusWidget && !document.getElementById("globalBonusWidget")) {
            const modal = document.getElementById("gamesMenuModal");
            const panel =
                document.querySelector("#gamesMenuModal .games-menu-header") ||
                document.querySelector("#gamesMenuModal .games-menu-panel") ||
                document.querySelector("#gamesMenuModal .games-menu-content") ||
                (modal ? modal.firstElementChild : null); 

            if (panel && panel !== modal) {
                panel.appendChild(window.buildGlobalBonusWidget());
                if (window.refreshGlobalUI) window.refreshGlobalUI();
            } else {
                console.warn(
                    "[games-menu] No inner panel found for bonus widget — add a " +
                    "`.games-menu-header` (or `.games-menu-panel`/`.games-menu-content`) " +
                    "wrapper around your menu contents in the gamesMenuModal markup."
                );
            }
        }

        buildPane(document.getElementById("gamesMenuPane-singleplayer"), GAMES.singleplayer);
        buildPane(document.getElementById("gamesMenuPane-multiplayer"), GAMES.multiplayer);

        document.querySelectorAll(".games-menu-tab").forEach((tab) => {
            tab.onclick = () => {
                document.querySelectorAll(".games-menu-tab").forEach((t) => {
                    t.classList.remove("active");
                    t.style.color = "#72767d";
                    t.style.borderBottomColor = "transparent";
                });
                tab.classList.add("active");
                tab.style.color = "#fff";
                tab.style.borderBottomColor = "#FF0000";

                document.querySelectorAll(".games-menu-pane").forEach((p) => (p.style.display = "none"));
                document.getElementById(`gamesMenuPane-${tab.dataset.tab}`).style.display = "grid";
            };
        });

        document.getElementById("gamesMenuCloseBtn").onclick = closeGamesMenu;
        document.getElementById("gamesMenuModal").addEventListener("click", (e) => {
            if (e.target.id === "gamesMenuModal") closeGamesMenu();
        });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape" && document.getElementById("gamesMenuModal").style.display !== "none") {
                closeGamesMenu();
            }
        });

        built = true;
    }

    window.openGamesMenu = function () {
        ensureBuilt();
        document.getElementById("gamesMenuModal").style.display = "flex";
    };

    window.closeGamesMenu = function () {
        const modal = document.getElementById("gamesMenuModal");
        if (modal) modal.style.display = "none";
    };
})();

function closeGamesMenu() {
    window.closeGamesMenu();
}