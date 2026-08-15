function displayStreams(streams) {
  const streamsList = document.getElementById('streamsList');
  streamsList.innerHTML = '';

  if (streams.length === 0) {
    streamsList.innerHTML = '<div style="color: #b9bbbe; padding: 20px; text-align: center;">No live streams</div>';
    return;
  }

  streams.forEach(stream => {
    const streamElement = document.createElement('div');
    streamElement.dataset.streamPlatform = stream.platform;
    streamElement.dataset.streamName = stream.name;
    streamElement.style = 'background: rgb(0 0 0 / 88%); border-radius: 8px; padding: 12px; display: flex; gap: 12px; align-items: center; border: 1px solid #3a3c42;';

    const logoImg = document.createElement('img');
    logoImg.src = stream.logo || '/avatars/default1.png';
    logoImg.style = `
      width: 60px;
      height: 60px;
      border-radius: 50%;
      border: 3px solid ${stream.platform === 'kick' ? '#53FC19' : '#FF0000'};
    `;
    logoImg.draggable = false;

    const infoDiv = document.createElement('div');
    infoDiv.style = 'flex: 1; display: flex; flex-direction: column; gap: 4px;';

    const nameDiv = document.createElement('div');
    nameDiv.style = 'font-weight: bold; color: #ffffff; font-size: 14px;';
    nameDiv.textContent = stream.name;

    const titleDiv = document.createElement('div');
    titleDiv.style = 'font-size: 10px; color: #b9bbbe; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
    titleDiv.textContent = stream.title;

    const viewersDiv = document.createElement('div');
    viewersDiv.className = 'stream-viewers';
    viewersDiv.style = 'font-size: 12px; color: #4f545c;';
    viewersDiv.textContent = `${stream.viewers || 0} viewers`;

    const durationDiv = document.createElement('div');
    durationDiv.className = 'stream-duration';
    durationDiv.style = 'font-size: 11px; color: #b9bbbe; opacity: 0.8;';
    durationDiv.dataset.startTime = stream.startTime || Date.now();
    durationDiv.textContent = formatStreamDuration(stream.startTime);

    infoDiv.appendChild(nameDiv);
    infoDiv.appendChild(titleDiv);
    infoDiv.appendChild(viewersDiv);
    infoDiv.appendChild(durationDiv);

    const platformDiv = document.createElement('div');
    platformDiv.style = 'font-size: 12px; color: #b9bbbe; background: #36393f; padding: 4px 8px; border-radius: 4px;';
    platformDiv.textContent = stream.platform;

    const viewBtn = document.createElement('button');
    viewBtn.className = 'stream-watch-btn';
    viewBtn.style = 'background: #36393f; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 12px; cursor: pointer;';
    viewBtn.textContent = 'Watch';
    viewBtn.onmouseover = () => viewBtn.style.background = '#ff0000';
    viewBtn.onmouseout = () => viewBtn.style.background = '#36393f';

    const embedBtn = document.createElement('button');
    embedBtn.className = 'stream-embed-btn';
    embedBtn.style = 'background: #36393f; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-size: 12px; cursor: pointer;';
    embedBtn.textContent = 'Embed';
    embedBtn.onmouseover = () => embedBtn.style.background = '#ff0000';
    embedBtn.onmouseout = () => embedBtn.style.background = '#36393f';

    streamElement.appendChild(logoImg);
    streamElement.appendChild(infoDiv);
    streamElement.appendChild(platformDiv);
    streamElement.appendChild(embedBtn);
    streamElement.appendChild(viewBtn);

    streamsList.appendChild(streamElement);
  });
}




const KICK_PUSHER_KEY = "32cbd69e4b950bf97679";
const KICK_PUSHER_CLUSTER = "us2";
let pusherScriptPromise = null;
let currentEmbedPusher = null;
let currentEmbedChannel = null;

let hlsScriptPromise = null;
function loadHlsLib() {
  if (window.Hls) return Promise.resolve();
  if (hlsScriptPromise) return hlsScriptPromise;
  hlsScriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js";
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return hlsScriptPromise;
}

function loadPusherLib() {
  if (window.Pusher) return Promise.resolve();
  if (pusherScriptPromise) return pusherScriptPromise;
  pusherScriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://js.pusher.com/8.4.0/pusher.min.js";
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return pusherScriptPromise;
}

let combinedStreamUI = null; 
const openEmbedWindows = new Map();

function getStreamId(stream) {
  return `${stream.platform}-${stream.name}`;
}

function ensureCombinedStreamWindow() {
  if (combinedStreamUI) return combinedStreamUI;

  const modal = document.createElement("div");
  modal.className = "embedStreamModal";
  modal.style.cssText = `
    position: fixed; inset: 0; z-index: 20002;
    pointer-events: none;
  `;

  const box = document.createElement("div");
  box.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(1300px, 94vw); height: min(760px, 90vh);
    min-width: 600px; min-height: 400px;
    background: rgb(0 0 0 / 90%); border-radius: 12px; overflow: hidden;
    display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.7);
    border: 1px solid #3a3c42;
    pointer-events: auto;
    z-index: 20003;
  `;
  box.addEventListener("mousedown", () => {
    box.style.zIndex = "20103";
  });

  const header = document.createElement("div");
  header.style.cssText = `
    display:flex; align-items:center; justify-content:space-between;
    padding: 10px 16px; border-bottom: 1px solid #3a3c42; flex-shrink:0;
    cursor: move; user-select: none;
  `;

  const titleSpan = document.createElement("span");
  titleSpan.textContent = "Multi-Stream Viewer";
  titleSpan.style.cssText = "color:#fff; font-weight:700; font-size:14px;";

  const headerBtns = document.createElement("div");
  headerBtns.style.cssText = "display:flex; align-items:center; gap:4px;";

  function headerBtnStyle() {
    return `
      background:none; border:none; color:#72767d; font-size:16px;
      cursor:pointer; padding:4px 8px; border-radius:4px;
      transition: color 0.15s, background 0.15s; line-height:1;
    `;
  }

  const minimizeBtn = document.createElement("button");
  minimizeBtn.innerHTML = "&#8211;";
  minimizeBtn.title = "Minimize";
  minimizeBtn.style.cssText = headerBtnStyle();
  minimizeBtn.onmouseover = () => minimizeBtn.style.background = "rgba(255,255,255,0.08)";
  minimizeBtn.onmouseout = () => minimizeBtn.style.background = "transparent";
  let isMinimized = false;
  let restoreHeight = null;
  minimizeBtn.onclick = (e) => {
    e.stopPropagation();
    isMinimized = !isMinimized;
    if (isMinimized) {
      restoreHeight = box.style.height || getComputedStyle(box).height;
      body.style.display = "none";
      resizeHandle.style.display = "none";
      box.style.height = "auto";
      box.style.minHeight = "0";
      minimizeBtn.innerHTML = "&#9633;";
      minimizeBtn.title = "Restore";
    } else {
      body.style.display = "flex";
      resizeHandle.style.display = "block";
      box.style.minHeight = "400px";
      box.style.height = restoreHeight || "min(760px, 90vh)";
      minimizeBtn.innerHTML = "&#8211;";
      minimizeBtn.title = "Minimize";
    }
  };

  const fullscreenBtn = document.createElement("button");
  fullscreenBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`;
  fullscreenBtn.title = "Fullscreen";
  fullscreenBtn.style.cssText = headerBtnStyle();
  fullscreenBtn.onmouseover = () => fullscreenBtn.style.background = "rgba(255,255,255,0.08)";
  fullscreenBtn.onmouseout = () => fullscreenBtn.style.background = "transparent";
  fullscreenBtn.onclick = (e) => {
    e.stopPropagation();
    if (!document.fullscreenElement) {
      box.requestFullscreen?.().catch(err => console.error("Fullscreen error:", err));
    } else {
      document.exitFullscreen?.();
    }
  };
  document.addEventListener("fullscreenchange", () => {
    const isFs = document.fullscreenElement === box;
    box.classList.toggle("ss-fullscreen", isFs);
    box.style.borderRadius = isFs ? "0" : "12px";
  });

  const closeAllBtn = document.createElement("button");
  closeAllBtn.textContent = "✕";
  closeAllBtn.title = "Close";
  closeAllBtn.style.cssText = headerBtnStyle() + "font-size:18px;";
  closeAllBtn.onmouseover = () => { closeAllBtn.style.color = "#fff"; closeAllBtn.style.background = "rgba(255,0,0,0.15)"; };
  closeAllBtn.onmouseout = () => { closeAllBtn.style.color = "#72767d"; closeAllBtn.style.background = "transparent"; };
  closeAllBtn.onclick = () => closeCombinedStreamWindow();
 

  headerBtns.appendChild(minimizeBtn);
  headerBtns.appendChild(fullscreenBtn);
  headerBtns.appendChild(closeAllBtn);

  header.appendChild(titleSpan);
  header.appendChild(headerBtns);

  const body = document.createElement("div");
  body.style.cssText = "flex:1; display:flex; min-height:0;";

  const videoGrid = document.createElement("div");
  videoGrid.style.cssText = `
    flex:3; min-width:0; background:#000; display:grid;
    gap:2px; grid-template-columns: 1fr; overflow:auto;
  `;

  const chatPanel = document.createElement("div");
  chatPanel.style.cssText = `
    flex:1; min-width:260px; max-width:340px; background:rgb(0 0 0 / 90%);
    display:flex; flex-direction:column; border-left:1px solid #3a3c42;
  `;

  const chatHeader = document.createElement("div");
  chatHeader.style.cssText = "padding:8px; border-bottom:1px solid #3a3c42; flex-shrink:0;";

  const chatSelectLabel = document.createElement("div");
  chatSelectLabel.textContent = "Viewing chat for:";
  chatSelectLabel.style.cssText = "color:#72767d; font-size:11px; text-transform:uppercase; font-weight:700; margin-bottom:6px;";

  const chatSelect = document.createElement("select");
  chatSelect.style.cssText = `
    width:100%; box-sizing:border-box; padding:7px 10px; background:#1e1f22;
    border:1px solid #3a3c42; border-radius:6px; color:#fff; font-size:13px; outline:none;
    cursor: pointer;
  `;
  chatHeader.appendChild(chatSelectLabel);
  chatHeader.appendChild(chatSelect);

  const chatListsWrap = document.createElement("div");
  chatListsWrap.style.cssText = "flex:1; min-height:0; position:relative;";

  chatPanel.appendChild(chatHeader);
  chatPanel.appendChild(chatListsWrap);

  body.appendChild(videoGrid);
  body.appendChild(chatPanel);

  const resizeHandle = document.createElement("div");
  resizeHandle.style.cssText = `
    position: absolute; bottom: 0; right: 0;
    width: 18px; height: 18px; cursor: nwse-resize;
    background: linear-gradient(135deg, transparent 50%, #4a4d54 50%);
    border-bottom-right-radius: 12px;
    z-index: 5;
  `;

  box.appendChild(header);
  box.appendChild(body);
  box.appendChild(resizeHandle);
  modal.appendChild(box);
  document.body.appendChild(modal);

  makeDraggableAndResizable(box, header, resizeHandle);

  chatSelect.addEventListener("change", () => {
    showChatFor(chatSelect.value);
  });

  combinedStreamUI = { modal, box, videoGrid, chatSelect, chatListsWrap };
  return combinedStreamUI;
}

function updateVideoGridLayout() {
  const ui = combinedStreamUI;
  if (!ui) return;
  const count = openEmbedWindows.size;
  let cols = 1;
  if (count === 2) cols = 2;
  else if (count === 3) cols = 2;
  else if (count >= 4) cols = 2;
  ui.videoGrid.style.gridTemplateColumns = count <= 1 ? "1fr" : `repeat(${cols}, 1fr)`;
}

function showChatFor(streamId) {
  const ui = combinedStreamUI;
  if (!ui) return;
  ui.chatListsWrap.querySelectorAll("[data-chat-for]").forEach(el => {
    el.style.display = el.dataset.chatFor === streamId ? "flex" : "none";
  });
}

function openEmbedStreamModal(stream) {
  const streamId = getStreamId(stream);

  if (openEmbedWindows.has(streamId)) {
    const ui = ensureCombinedStreamWindow();
    ui.chatSelect.value = streamId;
    showChatFor(streamId);
    broadcastStreamStatus()
    ui.box.style.zIndex = "20103";
    return;
  }

  const ui = ensureCombinedStreamWindow();

  const tile = document.createElement("div");
  tile.style.cssText = "position:relative; background:#000; min-height:200px;";
  tile.dataset.videoFor = streamId;

const tileHeader = document.createElement("div");
  tileHeader.style.cssText = `
    position:absolute; top:0; left:0; right:0; z-index:2;
    display:flex; align-items:center; justify-content:space-between;
    padding:4px 8px; background:rgba(0,0,0,0.6); pointer-events:none;
  `;

  const tileTitle = document.createElement("span");
  tileTitle.style.cssText = "color:#fff; font-size:12px; font-weight:700; text-shadow:0 1px 2px rgba(0,0,0,0.8);";
  tileTitle.textContent = `${stream.name} · ${stream.platform}`;

  const tileChattersBadge = document.createElement("span");
  tileChattersBadge.style.cssText = "color:#b9bbbe; font-size:11px; margin-left:8px; display:none;";

  const titleWrap = document.createElement("span");
  titleWrap.style.cssText = "display:flex; align-items:center;";
  titleWrap.appendChild(tileTitle);
  titleWrap.appendChild(tileChattersBadge);

  const tileClose = document.createElement("button");
  tileClose.textContent = "✕";
  tileClose.style.cssText = "background:rgba(0,0,0,0.6); border:none; color:#fff; font-size:13px; cursor:pointer; pointer-events:auto; border-radius:4px; padding:2px 6px;";
  tileClose.onclick = () => closeEmbedWindow(streamId);

  tileHeader.appendChild(titleWrap);
  tileHeader.appendChild(tileClose);

  const videoWrap = document.createElement("div");
  videoWrap.style.cssText = "position:absolute; inset:0;";

  tile.appendChild(videoWrap);
  tile.appendChild(tileHeader);
  ui.videoGrid.appendChild(tile);

  const chatWrap = document.createElement("div");
  chatWrap.dataset.chatFor = streamId;
  chatWrap.style.cssText = "position:absolute; inset:0; display:none; flex-direction:column;";
  ui.chatListsWrap.appendChild(chatWrap);

  const opt = document.createElement("option");
  opt.value = streamId;
  opt.textContent = `${stream.name} (${stream.platform})`;
  ui.chatSelect.appendChild(opt);
  ui.chatSelect.value = streamId;

const entry = {
    tile, videoWrap, chatWrap,
    pusher: null, channel: null,
    platform: stream.platform, name: stream.name,
    subBadgeUrl: null,
    uniqueChatters: new Set(),
    updateChattersBadge: () => {
      if (entry.uniqueChatters.size > 0) {
        tileChattersBadge.textContent = `· ${entry.uniqueChatters.size} chatting`;
        tileChattersBadge.style.display = "inline";
      }
    },
    renderMeta: (s) => {
      const viewers = s.viewers ?? s.viewerCount ?? 0;
      tileTitle.textContent = `${stream.name} · ${stream.platform} · ${viewers.toLocaleString()} viewers`;
    }
  };
  openEmbedWindows.set(streamId, entry);

  const parentHost = window.location.hostname;

  if (stream.platform === "twitch") {
    const vIframe = document.createElement("iframe");
    vIframe.style.cssText = "width:100%; height:100%; border:none;";
    vIframe.allowFullscreen = true;
    vIframe.src = `https://player.twitch.tv/?channel=${encodeURIComponent(stream.name)}&parent=${parentHost}&muted=false`;
    videoWrap.appendChild(vIframe);

    const cIframe = document.createElement("iframe");
    cIframe.style.cssText = "width:100%; height:100%; border:none;";
    cIframe.src = `https://www.twitch.tv/embed/${encodeURIComponent(stream.name)}/chat?parent=${parentHost}&darkpopout`;
    chatWrap.appendChild(cIframe);

  } else if (stream.platform === "kick") {
    const vIframe = document.createElement("iframe");
    vIframe.style.cssText = "width:100%; height:100%; border:none;";
    vIframe.allowFullscreen = true;
    vIframe.allow = "autoplay; fullscreen";
    vIframe.src = `https://player.kick.com/${encodeURIComponent(stream.name)}?muted=false&autoplay=true`;
    videoWrap.appendChild(vIframe);

    const cIframe = document.createElement("iframe");
    cIframe.style.cssText = "width:100%; height:100%; border:none;";
    cIframe.src = `https://kick.com/popout/${encodeURIComponent(stream.name)}/chat`;
    chatWrap.appendChild(cIframe);

}
  
   else if (stream.platform === "youtube") {
    const videoId = getYouTubeId(stream.url);
    if (!videoId) {
      videoWrap.innerHTML = `<div style="color:#72767d; padding:20px; font-size:13px;">Could not resolve YouTube video ID.</div>`;
    } else {
      const vIframe = document.createElement("iframe");
      vIframe.style.cssText = "width:100%; height:100%; border:none;";
      vIframe.allowFullscreen = true;
      vIframe.allow = "autoplay; encrypted-media; fullscreen";
      vIframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
      videoWrap.appendChild(vIframe);

      const chatIframe = document.createElement("iframe");
      chatIframe.style.cssText = "width:100%; height:100%; border:none;";
      chatIframe.src = `https://www.youtube.com/live_chat?v=${videoId}&embed_domain=${parentHost}&dark_theme=1`;
      chatWrap.appendChild(chatIframe);
    }
  }

  updateVideoGridLayout();
  broadcastStreamStatus()
  showChatFor(streamId);
}

function closeEmbedWindow(streamId) {
  const entry = openEmbedWindows.get(streamId);
  if (!entry) return;

 
  entry.videoWrap?.querySelectorAll('iframe').forEach(iframe => {
    iframe.src = 'about:blank'; 
    iframe.remove();
  });
  
  entry.chatWrap?.querySelectorAll('iframe').forEach(iframe => {
    iframe.src = 'about:blank';
    iframe.remove();
  });

  if (entry.channel) { try { entry.channel.unbind_all(); } catch (e) {} }
  if (entry.pusher) { try { entry.pusher.disconnect(); } catch (e) {} }

  entry.tile?.remove();
  entry.chatWrap?.remove();
  openEmbedWindows.delete(streamId);
  broadcastStreamStatus();

  if (!combinedStreamUI) return;

  const opt = [...combinedStreamUI.chatSelect.options].find(o => o.value === streamId);
  if (opt) opt.remove();

  if (openEmbedWindows.size === 0) {
    closeCombinedStreamWindow();
    
    return;
  }

  const next = combinedStreamUI.chatSelect.options[0]?.value;
  if (next) {
    combinedStreamUI.chatSelect.value = next;
    showChatFor(next);
  }
  updateVideoGridLayout();
}

function closeCombinedStreamWindow() {
  openEmbedWindows.forEach((entry) => {
    if (entry.channel) { try { entry.channel.unbind_all(); } catch (e) {} }
    if (entry.pusher) { try { entry.pusher.disconnect(); } catch (e) {} }
  });
  openEmbedWindows.clear();

  if (combinedStreamUI) {
    if (combinedStreamUI.box._cleanupDrag) combinedStreamUI.box._cleanupDrag();
    combinedStreamUI.modal.remove();
    combinedStreamUI = null;
    broadcastStreamStatus();
  }
}

function parseKickContent(content) {
  const frag = document.createDocumentFragment();
  const emoteRegex = /\[emote:(\d+):([^\]]+)\]/g;
  let lastIndex = 0;
  let match;

  while ((match = emoteRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      frag.appendChild(document.createTextNode(content.slice(lastIndex, match.index)));
    }
    const [, emoteId, emoteName] = match;
    const img = document.createElement("img");
    img.src = `https://files.kick.com/emotes/${emoteId}/fullsize`;
    img.alt = emoteName;
    img.title = emoteName;
    img.style.cssText = "height:20px; width:auto; vertical-align:middle; margin:0 1px;";
    frag.appendChild(img);
    lastIndex = emoteRegex.lastIndex;
  }

  if (lastIndex < content.length) {
    frag.appendChild(document.createTextNode(content.slice(lastIndex)));
  }

  return frag;
}


async function initKickPusherChat(chatroomId, chatWrap) {
  chatWrap.innerHTML = `<div style="color:#72767d; padding:12px; font-size:12px;">Connecting to chat…</div>`;
  await loadPusherLib();

  const list = document.createElement("div");
  list.style.cssText = "flex:1; overflow-y:auto; padding:8px; display:flex; flex-direction:column; gap:6px;";
  chatWrap.innerHTML = "";
  chatWrap.appendChild(list);

  const pusher = new Pusher(KICK_PUSHER_KEY, { cluster: KICK_PUSHER_CLUSTER, forceTLS: true });
  currentEmbedPusher = pusher;

  const channel = pusher.subscribe(`chatrooms.${chatroomId}.v2`);
  currentEmbedChannel = channel;

  

  channel.bind("App\\Events\\ChatMessageEvent", (data) => {
    try {
      const payload = typeof data === "string" ? JSON.parse(data) : data;
      appendKickChatMessage(list, payload);
      console.log("Raw badges for", payload?.sender?.username, badges);
    } catch (e) { console.warn("Kick chat parse error:", e); }
  });
}
const KICK_BADGE_DEFS = {
  broadcaster: {
    viewBox: "0 0 24 24",
    solid: [
      { d: "M3 8l3 3 4-6 2 4 2-4 4 6 3-3-2 11H5L3 8z", fill: "#FF3B3B" },
      { d: "M5 21h14v2H5z", fill: "#FF3B3B" }
    ]
  },
  moderator: {
    viewBox: "0 0 24 24",
    solid: [
      { d: "M12 2l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5l8-3z", fill: "#3B82F6" }
    ],
    stroke: [
      { d: "M9.5 12.5l2 2 4-4.5", stroke: "#fff", strokeWidth: 1.8 }
    ]
  },
  vip: {
    viewBox: "0 0 24 24",
    solid: [
      { d: "M12 2l4 6h6l-10 14L2 8h6l4-6z", fill: "#C084FC" }
    ]
  },
  og: {
    viewBox: "0 0 24 24",
    solid: [
      { d: "M12 1l2.6 6.6L21 9l-5 4.5 1.5 7L12 17l-5.5 3.5L8 13.5 3 9l6.4-1.4L12 1z", fill: "#FBBF24" }
    ]
  },
  founder: {
    viewBox: "0 0 24 24",
    solid: [
      { d: "M3 11l9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V11z", fill: "#FB923C" }
    ]
  },
  staff: {
    viewBox: "0 0 24 24",
    solid: [
      { d: "M12 2a5 5 0 0 0-4.9 6L2 13l3 3 5.1-5.1A5 5 0 0 0 17 6l-3.2 3.2-2-2L15 4a5 5 0 0 0-3-2z", fill: "#991B1B" }
    ]
  },
  verified: {
    viewBox: "0 0 24 24",
    solid: [
      { d: "M12 2l2.4 1.4 2.7-.3 1.3 2.4 2.4 1.3-.3 2.7L22 12l-1.5 2.5.3 2.7-2.4 1.3-1.3 2.4-2.7-.3L12 22l-2.4-1.4-2.7.3-1.3-2.4-2.4-1.3.3-2.7L2 12l1.5-2.5-.3-2.7 2.4-1.3 1.3-2.4 2.7.3L12 2z", fill: "#2DD4BF" }
    ],
    stroke: [
      { d: "M8.5 12.5l2.3 2.3L16 9.5", stroke: "#fff", strokeWidth: 1.8 }
    ]
  },
  subgifter: {
    viewBox: "0 0 24 24",
    solid: [
      { d: "M4 9h16v3H4z", fill: "#F472B6" },
      { d: "M5 12h14v9H5z", fill: "#F472B6" },
      { d: "M11 9v12h2V9z", fill: "#DB2777" },
      { d: "M12 9c-1.5 0-3-1-3-2.5S10.3 4 12 6c1.7-2 4-1 4 .5S13.5 9 12 9z", fill: "#F9A8D4" }
    ]
  },
  bot: {
    viewBox: "0 0 24 24",
    solid: [
      { d: "M6 10h12v9H6z", fill: "#5865F2" },
      { d: "M9.5 14a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0z", fill: "#fff" },
      { d: "M16.9 14a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0z", fill: "#fff" },
      { d: "M11 5h2v5h-2z", fill: "#5865F2" }
    ]
  },
  subscriber: {
    viewBox: "0 0 24 24",
    solid: [
      { d: "M12 2l3 6 6.5.9-4.7 4.6 1.1 6.5L12 16.9 6.1 20l1.1-6.5-4.7-4.6L9 8z", fill: "#34D399" }
    ]
  }
};



const KICK_BADGE_SIZE = 16; 

function withTooltip(el, text) {
  const wrap = document.createElement("span");
  wrap.title = text;
  wrap.style.cssText = `
    display:inline-flex;
    align-items:center;
    justify-content:center;
    flex-shrink:0;
  `;
  wrap.appendChild(el);
  return wrap;
}

function buildKickBadgeSVG(type) {
  const def = KICK_BADGE_DEFS[type];
  if (!def) return null;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", def.viewBox);
  svg.setAttribute("width", KICK_BADGE_SIZE);
  svg.setAttribute("height", KICK_BADGE_SIZE);
  svg.style.cssText = "display:block; flex-shrink:0;";

  (def.solid || []).forEach(p => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", p.d);
    path.setAttribute("fill", p.fill);
    svg.appendChild(path);
  });

  (def.stroke || []).forEach(p => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", p.d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", p.stroke);
    path.setAttribute("stroke-width", p.strokeWidth);
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    svg.appendChild(path);
  });

  return svg;
}

function buildKickBadge(badge, channelSubBadgeUrl) {
  if (badge.image_url) {
    let label = badge.name || badge.badge_type || "Badge";
    if (badge.name === "level" && badge.metadata?.level) {
      label = `Level ${badge.metadata.level}`;
    } else if (badge.name === "subscriber" && badge.metadata?.months) {
      label = `${badge.metadata.months}-Month Subscriber`;
    }

    const img = document.createElement("img");
    img.src = badge.image_url;
    img.alt = label;
    img.style.cssText = `
      width:${KICK_BADGE_SIZE}px;
      height:${KICK_BADGE_SIZE}px;
      object-fit:contain;
      display:block;
      flex-shrink:0;
    `;
    return withTooltip(img, label);
  }

  const normalizedType = badge.type.replace(/^sub_gifter(25|50|100)?$/, "subgifter");
  const svgBadge = buildKickBadgeSVG(normalizedType);
  if (svgBadge) {
    const label = badge.type === "subscriber" && badge.count
      ? `${badge.count}-Month Subscriber`
      : badge.type;
    return withTooltip(svgBadge, label);
  }

 
  if ((badge.type === "chatroom_level" || badge.type === "level") && badge.count) {
    return buildKickLevelBadge(badge.count);
  }

  console.warn("Unmapped Kick badge type:", badge.type, badge);
  return null;
}


function buildKickLevelBadge(level) {
  const wrapper = document.createElement("span");
  wrapper.style.cssText = `
    display:inline-flex; align-items:center; justify-content:center;
    width:${KICK_BADGE_SIZE}px; height:${KICK_BADGE_SIZE}px;
    border-radius:50%; background:#34D399; flex-shrink:0;
  `;

  const label = document.createElement("span");
  label.textContent = level;
  label.style.cssText = `
    font-size:${Math.max(7, KICK_BADGE_SIZE * 0.1)}px;
    font-weight:800; color:#111214; line-height:1;
  `;
  wrapper.appendChild(label);

  return withTooltip(wrapper, `Level ${level}`);
}

function appendKickChatMessage(list, payload, channelSubBadgeUrl = null) {
  const row = document.createElement("div");
  row.style.cssText = "font-size:13px; line-height:1.55; word-break:break-word;";
  const badgesV1 = payload?.sender?.identity?.badges || [];
  const badgesV2 = payload?.sender?.identity?.badges_v2 || [];
  const allBadges = [...badgesV2, ...badgesV1]; 
  const nameGroup = document.createElement("span");
  nameGroup.style.cssText = "display:inline-flex; align-items:center; gap:3px; vertical-align:middle;";

  if (allBadges.length > 0) {
    allBadges.forEach(b => {
      const el = buildKickBadge(b, channelSubBadgeUrl);
      if (el) nameGroup.appendChild(el);
    });
  }

  const color = payload?.sender?.identity?.color || "#00f2ff";
  const name = document.createElement("span");
  name.textContent = payload?.sender?.username || "Unknown";
  name.style.cssText = `font-weight:700; color:${color};`;
  nameGroup.appendChild(name);

  row.appendChild(nameGroup);
  row.appendChild(document.createTextNode(":\u00A0"));

  const contentSpan = document.createElement("span");
  contentSpan.style.color = "#dcddde";
  contentSpan.appendChild(parseKickContent(payload?.content || ""));
  row.appendChild(contentSpan);

  list.appendChild(row);

  if (list.children.length > 200) list.firstChild.remove();
  list.scrollTop = list.scrollHeight;
}

function broadcastStreamStatus() {
  if (typeof socket === "undefined" || !socket?.connected) return;
  const watching = [...openEmbedWindows.values()];
  const count = watching.length;

  let streamStatus = null;

  if (count === 1) {
    streamStatus = `Watching ${watching[0].name} on ${watching[0].platform}`;
  } else if (count > 1) {
    streamStatus = `Watching ${count} streams`;
  }

  window.currentStreamStatus = streamStatus;
  socket.emit("setStreamStatus", { streamStatus });

  if (window.electronAPI?.overlayStreamUpdate) {
    if (count >= 1) {
      window.electronAPI.overlayStreamUpdate({
        text: streamStatus,
        count,
        streams: watching.map(s => ({ name: s.name, platform: s.platform }))
      });
    } else {
      window.electronAPI.overlayStreamUpdate(null);
    }
  }
}