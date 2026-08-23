(function () {
  "use strict";

  const FALLBACK_EMOJIS = [
    "😀","😁","😂","🤣","😃","😄","😅","😆","😉","😊","😋","😎","😍","😘",
    "🥰","😗","😙","😚","🙂","🤗","🤩","🤔","🤨","😐","😑","😶","🙄","😏",
    "😣","😥","😮","🤐","😯","😪","😫","🥱","😴","😌","😛","😜","😝","🤤",
    "😒","😓","😔","😕","🙃","🤑","😲","☹️","🙁","😖","😞","😟","😢","😭",
    "😦","😧","😨","😩","🤯","😬","😰","😱","🥵","🥶","😳","🤪","😵","😡",
    "😠","🤬","😷","🤒","🤕","🤢","🤮","🥴","😇","🥳","🥺","🤠","🤡","🤥",
    "🤫","🤭","🧐","🤓","😈","👿","👹","👺","💀","👻","👽","🤖","💩","👍",
    "👎","👏","🙌","🤝","🙏","💪","👀","🔥","💯","✨","🎉","🎊","❤️","🧡",
    "💛","💚","💙","💜","🖤","🤍","🤎","💔","💕","💖","💗","💓","💞","💘"
  ];

  const EMOTE_PREFIX = "emote:";
  const reactionState = new Map();
  let fullEmojiCache = null;
  let emojiLoadPromise = null;

  function normalizeEntry(e) {
    if (typeof e === "string") return { emoji: e, name: e, group: "Other" };
    return {
      emoji: e.emoji || e.char || e.symbol || "",
      name: e.name || e.shortcode || "",
      group: e.group || e.category || "Other"
    };
  }

  function loadFromGlobal() {
    try {
      if (typeof emojiList !== "undefined" && Array.isArray(emojiList) && emojiList.length) {
        return emojiList.map(normalizeEntry);
      }
    } catch (_) {}
    const candidates = [window.EMOJI_LIST, window.emojiList, window.allEmojis, window.emojis, window.ALL_EMOJIS];
    for (const c of candidates) {
      if (Array.isArray(c) && c.length) return c.map(normalizeEntry);
    }
    return null;
  }

  const EMOJIBASE_GROUP_NAMES = {
    0: "Smileys & Emotion",
    1: "People & Body",
    3: "Animals & Nature",
    4: "Food & Drink",
    5: "Travel & Places",
    6: "Activities",
    7: "Objects",
    8: "Symbols",
    9: "Flags"
  };

  function ensureFullEmojiList() {
    if (fullEmojiCache && fullEmojiCache.length) return Promise.resolve(fullEmojiCache);
    if (emojiLoadPromise) return emojiLoadPromise;

    const fromGlobal = loadFromGlobal();
    if (fromGlobal) {
      fullEmojiCache = fromGlobal;
      return Promise.resolve(fullEmojiCache);
    }

    emojiLoadPromise = fetch("https://cdn.jsdelivr.net/npm/emojibase-data@15/en/data.json")
      .then(res => res.json())
      .then(data => {
        const out = [];
        data.forEach(item => {
          if (item.group === 2) return; 
          const group = EMOJIBASE_GROUP_NAMES[item.group] || "Other";
          out.push({ emoji: item.emoji, name: item.label, group });
          if (Array.isArray(item.skins)) {
            item.skins.forEach(skin => {
              out.push({ emoji: skin.emoji, name: skin.label || item.label, group });
            });
          }
        });
        fullEmojiCache = out;
        try {
          if (typeof emojiList !== "undefined" && (!emojiList || !emojiList.length)) {
            emojiList = fullEmojiCache;
          }
        } catch (_) {}
        window.emojiList = fullEmojiCache;
        return fullEmojiCache;
      })
      .catch(err => {
        console.warn("Failed to load full emoji list, using fallback", err);
        fullEmojiCache = FALLBACK_EMOJIS.map(e => ({ emoji: e, name: e, group: "Other" }));
        return fullEmojiCache;
      })
      .finally(() => { emojiLoadPromise = null; });

    return emojiLoadPromise;
  }

  function getFullEmojiListSync() {
    if (fullEmojiCache && fullEmojiCache.length) return fullEmojiCache;
    return FALLBACK_EMOJIS.map(e => ({ emoji: e, name: e, group: "Other" }));
  }

  function getPepeList() {
    try {
      if (typeof pepeList !== "undefined" && Array.isArray(pepeList) && pepeList.length) {
        return pepeList;
      }
    } catch (_) {}
    if (Array.isArray(window.pepeList) && window.pepeList.length) return window.pepeList;
    if (Array.isArray(window.PEPE_LIST) && window.PEPE_LIST.length) return window.PEPE_LIST;
    if (Array.isArray(window.emoteList) && window.emoteList.length) return window.emoteList;
    if (window.emoteConfig && Array.isArray(window.emoteConfig.pepeList)) {
      return window.emoteConfig.pepeList;
    }
    return [];
  }

  function isEmoteKey(key) {
    return typeof key === "string" && key.startsWith(EMOTE_PREFIX);
  }

  function emoteFilenameFromKey(key) {
    return key.slice(EMOTE_PREFIX.length);
  }

  function getReactions(messageId) {
    return reactionState.get(messageId) || {};
  }

  function setReactions(messageId, reactions) {
    reactionState.set(messageId, reactions || {});
  }

  function renderReactionVisual(key) {
    if (isEmoteKey(key)) {
      const img = document.createElement("img");
      img.src = `/avatars/${emoteFilenameFromKey(key)}`;
      img.alt = emoteFilenameFromKey(key);
      img.style.cssText = "width:16px;height:16px;object-fit:contain;vertical-align:middle;";
      return img;
    }
    const span = document.createElement("span");
    span.textContent = key;
    span.style.cssText = "font-size:14px;line-height:1;vertical-align:middle;";
    return span;
  }

  function getOrCreateReactionBar(messageEl, messageId) {
    let bar = messageEl.querySelector(".reaction-bar");
    if (bar) return bar;

    const content = messageEl.querySelector(".content");
    if (!content) return null;

    messageEl.querySelectorAll(".reaction-bar").forEach(b => b.remove());

    bar = document.createElement("div");
    bar.className = "reaction-bar";
    bar.dataset.msgId = messageId;
    bar.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;";
    content.appendChild(bar);
    return bar;
  }

  function renderReactionBar(bar, messageId) {
    if (!bar) return;
    const reactions = getReactions(messageId);
    bar.innerHTML = "";

    const keys = Object.keys(reactions).filter(k => (reactions[k] || []).length > 0);
    if (!keys.length) {
      bar.style.display = "none";
      return;
    }
    bar.style.display = "flex";

    keys.forEach(key => {
      const userIds = reactions[key] || [];
      const mine = userIds.includes(user.id);

      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = "reaction-pill";
      pill.style.cssText = `
        display:inline-flex;align-items:center;gap:4px;
        background:${mine ? "rgba(255,0,0,0.18)" : "rgba(255,255,255,0.06)"};
        border:1px solid ${mine ? "#FF0000" : "#3a3c42"};
        border-radius:10px;padding:2px 7px;cursor:pointer;
        transition:background .15s,border-color .15s;
      `;
      pill.onmouseover = () => { if (!mine) pill.style.background = "rgba(255,255,255,0.12)"; };
      pill.onmouseout  = () => { if (!mine) pill.style.background = "rgba(255,255,255,0.06)"; };

      pill.appendChild(renderReactionVisual(key));

      const count = document.createElement("span");
      count.textContent = String(userIds.length);
      count.style.cssText = `font-size:11px;font-weight:700;color:${mine ? "#FF0000" : "#b9bbbe"};`;
      pill.appendChild(count);
      pill.title = buildReactorTooltip(userIds);
      pill.onclick = () => toggleReaction(messageId, key);

      bar.appendChild(pill);
    });
  }

  function buildReactorTooltip(userIds) {
    try {
      return userIds.map(id => {
        if (id === user.id) return "You";
        const u = (window.currentUsers || (typeof currentUsers !== "undefined" ? currentUsers : []) || [])
          .find(u => u && (u.id === id || u.userId === id));
        return u ? u.username : "Someone";
      }).join(", ");
    } catch {
      return `${userIds.length} reacted`;
    }
  }


  let openPicker = null;

  function closeReactionPicker() {
    if (openPicker) {
      openPicker.remove();
      openPicker = null;
    }
  }

  const EMOJI_CATEGORY_ICONS = {
    "Smileys & Emotion": "😀",
    "People & Body": "🙌",
    "Animals & Nature": "🐻",
    "Food & Drink": "🍔",
    "Travel & Places": "✈️",
    "Activities": "⚽",
    "Objects": "💡",
    "Symbols": "❤️",
    "Flags": "🏳️",
    "Other": "🔹"
  };
  const EMOTES_CATEGORY_KEY = "__emotes__";
  const REACTIONS_PER_PAGE = 40;

  function openReactionPicker(anchorEl, messageId) {
    closeReactionPicker();

    const pepe = getPepeList();

    const picker = document.createElement("div");
    picker.className = "reaction-picker";
    picker.style.cssText = `
      position:fixed;display:flex;flex-direction:column;width:311px;max-height:395px;
      background:#111214;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.6);
      overflow:hidden;z-index:10006;user-select:none;-webkit-user-select:none;
    `;

    const header = document.createElement("div");
    header.style.cssText = "padding:8px;flex-shrink:0;display:flex;gap:6px;align-items:center;";

    const backBtn = document.createElement("button");
    backBtn.innerHTML = "‹";
    backBtn.style.cssText = `
      background:none;border:none;color:#b9bbbe;font-size:20px;cursor:pointer;
      padding:0 4px;display:none;flex-shrink:0;line-height:1;
    `;
    header.appendChild(backBtn);

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Search emoji / emotes…";
    searchInput.style.cssText = `
      flex:1;box-sizing:border-box;background:#1e1f22;border:1px solid #3a3c42;
      border-radius:6px;color:#fff;padding:7px 10px;font-size:13px;outline:none;
      transition:border-color .15s;
    `;
    searchInput.onfocus = () => (searchInput.style.borderColor = "#FF0000");
    searchInput.onblur  = () => (searchInput.style.borderColor = "#3a3c42");
    header.appendChild(searchInput);
    picker.appendChild(header);

  
    const gridWrap = document.createElement("div");
    gridWrap.style.cssText = "flex:1;overflow-y:auto;padding:8px;";
    picker.appendChild(gridWrap);

    const categoryGrid = document.createElement("div");
    categoryGrid.style.cssText = "display:grid;grid-template-columns:repeat(2,1fr);gap:8px;";
    gridWrap.appendChild(categoryGrid);

    const grid = document.createElement("div");
    grid.style.cssText = "display:none;grid-template-columns:repeat(6,1fr);gap:4px;";
    gridWrap.appendChild(grid);
    const footer = document.createElement("div");
    footer.style.cssText = "display:none;align-items:center;justify-content:space-between;padding:6px 10px;flex-shrink:0;";
    const pageBtnStyle = `
      background:#1e1f22;border:none;color:#b9bbbe;font-size:11px;padding:4px 8px;
      border-radius:6px;cursor:pointer;
    `;
    const prevBtn = document.createElement("button");
    prevBtn.textContent = "‹ Prev";
    prevBtn.style.cssText = pageBtnStyle;
    const pageLabel = document.createElement("span");
    pageLabel.style.cssText = "color:#b9bbbe;font-size:11px;";
    const nextBtn = document.createElement("button");
    nextBtn.textContent = "Next ›";
    nextBtn.style.cssText = pageBtnStyle;
    footer.appendChild(prevBtn);
    footer.appendChild(pageLabel);
    footer.appendChild(nextBtn);
    picker.appendChild(footer);

    let activeCategory = null; 
    let currentFilter = "";
    let emojiData = getFullEmojiListSync();
    let pickerState = { page: 0, filtered: [] };

    function showCategoriesView() {
      activeCategory = null;
      backBtn.style.display = "none";
      grid.style.display = "none";
      footer.style.display = "none";
      categoryGrid.style.display = "grid";
    }

    function showResultsView() {
      backBtn.style.display = "block";
      categoryGrid.style.display = "none";
      grid.style.display = "grid";
    }

    function renderCategoryGrid() {
      categoryGrid.innerHTML = "";
      const groups = [...new Set(emojiData.map(e => e.group || "Other"))];

      const tiles = groups.map(g => ({ key: g, label: g, icon: EMOJI_CATEGORY_ICONS[g] || "🔹" }));
      if (pepe.length) tiles.push({ key: EMOTES_CATEGORY_KEY, label: "Emotes", icon: "☹" });

      tiles.forEach(({ key, label, icon }) => {
        const tile = document.createElement("div");
        tile.style.cssText = `
          display:flex;align-items:center;gap:8px;height:44px;padding:0 10px;
          border-radius:8px;background:#1e1f22;cursor:pointer;transition:background .12s;
        `;
        tile.onmouseover = () => (tile.style.background = "#2a2c31");
        tile.onmouseout  = () => (tile.style.background = "#1e1f22");

        const iconEl = document.createElement("span");
        iconEl.textContent = icon;
        iconEl.style.fontSize = "18px";

        const labelEl = document.createElement("span");
        labelEl.textContent = label;
        labelEl.style.cssText = "color:#e6e6e7;font-size:11.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";

        tile.appendChild(iconEl);
        tile.appendChild(labelEl);
        tile.onclick = e => {
          e.stopPropagation();
          activeCategory = key;
          showResultsView();
          pickerState.page = 0;
          renderGrid();
        };
        categoryGrid.appendChild(tile);
      });
    }

    function renderGrid() {
      grid.innerHTML = "";

   
      if (activeCategory === EMOTES_CATEGORY_KEY) {
        grid.style.gridTemplateColumns = "repeat(6,1fr)";
        footer.style.display = "none";

        if (!pepe.length) {
          grid.innerHTML = `<div style="grid-column:1/-1;color:#72767d;font-size:12px;text-align:center;padding:20px 0;">No emotes available.</div>`;
          return;
        }

        const filtered = currentFilter
          ? pepe.filter(f => f.toLowerCase().includes(currentFilter))
          : pepe;

        if (!filtered.length) {
          grid.innerHTML = `<div style="grid-column:1/-1;color:#72767d;font-size:12px;text-align:center;padding:20px 0;">No emotes found</div>`;
          return;
        }

        filtered.forEach(filename => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.title = filename;
          btn.style.cssText = `
            background:#1e1f22;border:none;border-radius:6px;padding:3px;
            cursor:pointer;display:flex;align-items:center;justify-content:center;aspect-ratio:1;
          `;
          btn.onmouseover = () => (btn.style.background = "#2a2c31");
          btn.onmouseout  = () => (btn.style.background = "#1e1f22");

          const img = document.createElement("img");
          img.src = `/avatars/${filename}`;
          img.style.cssText = "width:22px;height:22px;object-fit:contain;pointer-events:none;";
          btn.appendChild(img);

          btn.onclick = () => {
            toggleReaction(messageId, EMOTE_PREFIX + filename);
            closeReactionPicker();
          };
          grid.appendChild(btn);
        });
        return;
      }

    
      grid.style.gridTemplateColumns = "repeat(6,1fr)";

      const source = (activeCategory && !currentFilter)
        ? emojiData.filter(e => e.group === activeCategory)
        : emojiData;

      pickerState.filtered = currentFilter
        ? source.filter(e => (e.name || "").toLowerCase().includes(currentFilter) || e.emoji.includes(currentFilter))
        : source;

      const totalPages = Math.max(1, Math.ceil(pickerState.filtered.length / REACTIONS_PER_PAGE));
      if (pickerState.page >= totalPages) pickerState.page = totalPages - 1;
      if (pickerState.page < 0) pickerState.page = 0;

      const start = pickerState.page * REACTIONS_PER_PAGE;
      const pageItems = pickerState.filtered.slice(start, start + REACTIONS_PER_PAGE);

      if (!pageItems.length) {
        grid.innerHTML = `<div style="grid-column:1/-1;color:#72767d;font-size:12px;text-align:center;padding:20px 0;">No emojis found</div>`;
      } else {
        pageItems.forEach(item => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = item.emoji;
          btn.title = item.name || item.emoji;
          btn.style.cssText = "background:none;border:none;font-size:18px;cursor:pointer;border-radius:6px;padding:4px;";
          btn.onmouseover = () => (btn.style.background = "#2a2c31");
          btn.onmouseout  = () => (btn.style.background = "none");
          btn.onclick = () => {
            toggleReaction(messageId, item.emoji);
            closeReactionPicker();
          };
          grid.appendChild(btn);
        });
      }

      pageLabel.textContent = `${pickerState.page + 1}/${totalPages} (${pickerState.filtered.length})`;
      footer.style.display = pickerState.filtered.length > REACTIONS_PER_PAGE ? "flex" : "none";
    }

    prevBtn.onclick = () => {
      if (pickerState.page > 0) {
        pickerState.page--;
        renderGrid();
      }
    };
    nextBtn.onclick = () => {
      const totalPages = Math.ceil(pickerState.filtered.length / REACTIONS_PER_PAGE);
      if (pickerState.page < totalPages - 1) {
        pickerState.page++;
        renderGrid();
      }
    };

    backBtn.onclick = e => {
      e.stopPropagation();
      searchInput.value = "";
      currentFilter = "";
      showCategoriesView();
    };


    searchInput.addEventListener("click", e => e.stopPropagation());
    searchInput.addEventListener("input", () => {
      currentFilter = searchInput.value.trim().toLowerCase();
      pickerState.page = 0;

      if (currentFilter) {
        if (activeCategory !== EMOTES_CATEGORY_KEY) activeCategory = null;
        showResultsView();
        renderGrid();
      } else if (activeCategory) {
        showResultsView();
        renderGrid();
      } else {
        showCategoriesView();
      }
    });

    renderCategoryGrid();
    showCategoriesView();

    ensureFullEmojiList().then(list => {
      emojiData = list;
      renderCategoryGrid();
      if (activeCategory && activeCategory !== EMOTES_CATEGORY_KEY) renderGrid();
    });

    document.body.appendChild(picker);

    const rect = anchorEl.getBoundingClientRect();
    const top  = Math.min(rect.bottom + 6, window.innerHeight - 410);
    let left   = rect.left - 100;
    left = Math.max(8, Math.min(left, window.innerWidth - 319));
    picker.style.top  = top + "px";
    picker.style.left = left + "px";

    openPicker = picker;
    searchInput.focus();

    setTimeout(() => {
      document.addEventListener("click", onOutsideClick);
    }, 0);

    function onOutsideClick(e) {
      if (picker.contains(e.target) || e.target === anchorEl) return;
      closeReactionPicker();
      document.removeEventListener("click", onOutsideClick);
    }
  }

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeReactionPicker();
  });


  function toggleReaction(messageId, key) {
    if (!(window.socket && socket.connected)) return;
    const list = getReactions(messageId)[key] || [];
    const already = list.includes(user.id);
    socket.emit(already ? "removeReaction" : "addReaction", {
      messageId,
      emoji: key
    });
  }

  function applyReactionAdded({ messageId, emoji, userId }) {
    if (!messageId || !emoji || !userId) return;
    const reactions = { ...getReactions(messageId) };
    const set = new Set(reactions[emoji] || []);
    set.add(userId);
    reactions[emoji] = Array.from(set);
    setReactions(messageId, reactions);
    refreshMessageReactionBar(messageId);
  }

  function applyReactionRemoved({ messageId, emoji, userId }) {
    if (!messageId || !emoji) return;
    const reactions = { ...getReactions(messageId) };
    const set = new Set(reactions[emoji] || []);
    if (userId) set.delete(userId);
    if (set.size === 0) delete reactions[emoji];
    else reactions[emoji] = Array.from(set);
    setReactions(messageId, reactions);
    refreshMessageReactionBar(messageId);
  }

  function seedFromMessageList(msgs) {
    if (!Array.isArray(msgs)) return;
    let any = false;
    msgs.forEach(m => {
      if (m && m.id && m.reactions && typeof m.reactions === "object") {
        if (Object.keys(m.reactions).length > 0) {
          setReactions(m.id, m.reactions);
          any = true;
        }
      }
    });
    if (!any) return;

    const apply = () => {
      msgs.forEach(m => { if (m && m.id) refreshMessageReactionBar(m.id); });
      scanAndWireMessages(document);
      reactionState.forEach((_, messageId) => refreshMessageReactionBar(messageId));
    };
    apply();
    setTimeout(apply, 50);
    setTimeout(apply, 300);
    setTimeout(apply, 1000);
  }

  function seedFromWindowHistory() {
    if (Array.isArray(window.allHistoryMessages) && window.allHistoryMessages.length) {
      seedFromMessageList(window.allHistoryMessages);
    }
  }

  function onReactionAdded(d)   { applyReactionAdded(d); }
  function onReactionRemoved(d) { applyReactionRemoved(d); }
  function onEmoteListUpdated(data) {
    if (data && Array.isArray(data.pepeList)) {
      try { pepeList = data.pepeList; } catch (_) {}
      window.pepeList = data.pepeList;
    }
  }
  function onHistory(data) {
    if (data && Array.isArray(data.messages)) {
      seedFromMessageList(data.messages);
      [200, 500, 1000, 2000, 3500, 5000, 8000, 10000].forEach(delay =>
        setTimeout(() => {
          scanAndWireMessages(document);
          reactionState.forEach((_, messageId) => refreshMessageReactionBar(messageId));
        }, delay)
      );
    }
  }
  function onMessage(msg) {
    if (msg && msg.id && msg.reactions) {
      setReactions(msg.id, msg.reactions);
    }
  }
  function onMessageEdited(msg) {
    if (msg && msg.id && msg.reactions) {
      setReactions(msg.id, msg.reactions);
      refreshMessageReactionBar(msg.id);
    }
  }

  let socketWired = false;

  function wireSocketListeners() {
    if (!window.socket || socketWired) return !!window.socket;

    socket.off("reactionAdded",   onReactionAdded);
    socket.off("reactionRemoved", onReactionRemoved);
    socket.off("emoteListUpdated", onEmoteListUpdated);
    socket.off("history",         onHistory);
    socket.off("message",         onMessage);
    socket.off("messageEdited",   onMessageEdited);

    socket.on("reactionAdded",    onReactionAdded);
    socket.on("reactionRemoved",  onReactionRemoved);
    socket.on("emoteListUpdated", onEmoteListUpdated);
    socket.on("history",          onHistory);
    socket.on("message",          onMessage);
    socket.on("messageEdited",    onMessageEdited);

    socketWired = true;
    seedFromWindowHistory();
    return true;
  }

  if (!wireSocketListeners()) {
    const poll = setInterval(() => {
      if (wireSocketListeners()) clearInterval(poll);
    }, 200);
    setTimeout(() => clearInterval(poll), 10000);
  }

  function ensureReactionUI(messageEl) {
    if (!messageEl || messageEl.nodeType !== 1) return;
    const messageId = messageEl.dataset.id;
    if (!messageId) return;

    let actions = messageEl.querySelector(".actions");
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "actions reaction-only-actions";
      messageEl.appendChild(actions);
    }
    if (!actions.querySelector(".react-add-btn")) {
      const reactBtn = document.createElement("button");
      reactBtn.className = "btn react-add-btn";
      reactBtn.title = "Add reaction";
      reactBtn.innerHTML = "☹";
      reactBtn.style.cssText = "font-size:13px;line-height:1;";
      reactBtn.onclick = e => {
        e.stopPropagation();
        openReactionPicker(reactBtn, messageId);
      };
      actions.insertBefore(reactBtn, actions.firstChild);
    }

    const bar = getOrCreateReactionBar(messageEl, messageId);
    if (bar) renderReactionBar(bar, messageId);
    messageEl.dataset.reactionsWired = "1";
  }

  function refreshMessageReactionBar(messageId) {
    const messageEl = document.querySelector(`.message[data-id="${CSS.escape(messageId)}"]`);
    if (!messageEl) return;
    const bar = getOrCreateReactionBar(messageEl, messageId);
    if (bar) renderReactionBar(bar, messageId);
  }

  function scanAndWireMessages(root) {
    (root || document).querySelectorAll(".message").forEach(ensureReactionUI);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      scanAndWireMessages(document);
      seedFromWindowHistory();
    });
  } else {
    scanAndWireMessages(document);
    seedFromWindowHistory();
  }

  const historyPoll = setInterval(() => {
    seedFromWindowHistory();
    scanAndWireMessages(document);
    reactionState.forEach((_, messageId) => refreshMessageReactionBar(messageId));
  }, 800);
  setTimeout(() => clearInterval(historyPoll), 30000);

  const messagesRoot = document.getElementById("messages");
  if (messagesRoot) {
    const observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        m.addedNodes.forEach(node => {
          if (node.nodeType !== 1) return;
          if (node.classList && node.classList.contains("message")) {
            ensureReactionUI(node);
          } else if (node.querySelectorAll) {
            node.querySelectorAll(".message").forEach(ensureReactionUI);
          }
        });
      }
    });
    observer.observe(messagesRoot, { childList: true, subtree: true });
  }

  window.ReactionsModule = {
    toggleReaction,
    applyReactionAdded,
    applyReactionRemoved,
    refreshMessageReactionBar,
    getReactions,
    getPepeList,
    seedFromMessageList
  };
})();