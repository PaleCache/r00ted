var debugmode = false;
let currentProfileUser = null;
let lastKnownStatus = new Map();
let currentVoiceRoom = null;
let cachedLiveStreams = [];
let lastStreamFetch = 0;
const STREAM_CACHE_DURATION = 30000;
let JITSI_CONFIG = {};
let SERVER_CONFIG = {};
let pepeList = [];
let unlockedPrestigeBadges = [];
const gifCache = new Map();
let virtualScrollHandler = null;
let pendingEmotes = [];
let lastEmoteClick = { filename: null, time: 0 };
let currentEmoteFile = null;
let currentEmoteName = null;
let messageSeenBy = new Map();
let currentUsers = [];  
let isCurrentlyMuted = false;
let cooldownInterval = null;
let mentionDropdown = null;
let selectedIndex = -1;
let zoomLevel = 1;
let isDragging = false;
let startX, startY, translateX = 0, translateY = 0;
const frameSnapshotCache = new Map();

const GIF_CATEGORIES = [
  { label: "Reactions",  query: "reactions" },
  { label: "Hi",         query: "hi" },
  { label: "Bye",        query: "bye" },
  { label: "Yes",        query: "yes" },
  { label: "No",         query: "no" },
  { label: "Congrats",   query: "congratulations" },
  { label: "Dance",      query: "dance" },
  { label: "Love",       query: "love" },
  { label: "Angry",      query: "angry" },
  { label: "Shrug",      query: "shrug" },
];

let activeGifCategory = "trending";
let gifViewMode = "categories";
const categoryThumbCache = new Map();
let categoryThumbsLoaded = false;

async function loadCategoryThumbnails() {
  if (categoryThumbsLoaded) return;
  const allCats = [{ label: "Trending", query: "trending" }, ...GIF_CATEGORIES];

  allCats.forEach(async (cat) => {
    try {
      const cacheKey = cat.query === "trending" ? "__trending__" : cat.query;
      let results = gifCache.get(cacheKey);

      if (!results) {
        const url = cat.query === "trending"
          ? `/api/gifs/trending?limit=100`
          : `/api/gifs/search?q=${encodeURIComponent(cat.query)}&limit=100`;

        const response = await fetch(url);
        if (!response.ok) return;
        const data = await response.json();
        results = data.data;

        if (gifCache.size > 20) {
          const firstKey = gifCache.keys().next().value;
          gifCache.delete(firstKey);
        }
        gifCache.set(cacheKey, results);
      }

      const first = results?.[0];
      const thumb = first?.images?.fixed_height_small?.url || first?.images?.original?.url;
      if (!thumb) return;
      categoryThumbCache.set(cat.query, thumb);
      if (gifViewMode === "categories") {
        const tile = gifCategoryRow.querySelector(`[data-category-query="${cat.query}"]`);
        if (tile) {
          tile.style.background = `url('${thumb}') center/cover`;
          const spinner = tile.querySelector('div > span');
          if (spinner) spinner.parentElement.remove();
        }
      }
    } catch (err) {
      console.warn(`Thumbnail fetch failed for "${cat.query}":`, err);
    }
  });

  categoryThumbsLoaded = true;
}

function getInputPlaceholder() {
  return `Send Message As ${user.username}`;
}

function getLevelColor(level) {
  const hue = (level * 137.508) % 360; 
  const saturation = 70 + (level % 3) * 10; 
  const lightness = 55 + (level % 2) * 10; 
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}


function getStackOffset() {
  let offset = 20;
  document.querySelectorAll('.stacked-notification').forEach(el => {
    offset += el.offsetHeight + 10;
  });
  return offset;
}

function showToast(message, duration = 3500) {
  const toast = document.createElement('div');
  toast.className = 'banner-notification toast-notification stacked-notification';
  toast.style.cssText = `
    position: fixed;
    top: ${getStackOffset()}px;
    left: 50%;
    transform: translateX(-50%);
    background: #111214;
    border: 1px solid #3a3c42;
    border-left: 3px solid #FF0000;
    color: #fff;
    padding: 12px 16px;
    border-radius: 8px;
    font-size: 13px;
    z-index: 99999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    animation: bannerDropIn 0.2s ease;
    display: flex;
    align-items: center;
    gap: 10px;
    white-space: nowrap;
    overflow: hidden;
  `;
  const logo = document.createElement('img');
  logo.src = '/icon.png';
  logo.style.cssText = 'width: 54px; height: 54px; border-radius: 6px; flex-shrink: 0;';

  const text = document.createElement('span');
  text.textContent = message;

  const timer = document.createElement('div');
  timer.style.cssText = `
    position: absolute;
    bottom: 0;
    left: 0;
    height: 3px;
    width: 100%;
    background: #FF0000;
    border-radius: 0 0 8px 8px;
    animation: timerShrink ${duration}ms linear forwards;
  `;

  toast.appendChild(logo);
  toast.appendChild(text);
  toast.appendChild(timer);
  document.body.appendChild(toast);

setTimeout(() => {
    toast.style.transition = 'opacity 0.3s, transform 0.3s';
    toast.style.opacity = '0';
    toast.style.transform = 'translate(-50%, -100%)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function getLevelRgb(level) {
  const hue = (level * 137.508) % 360;
  const saturation = (70 + (level % 3) * 10) / 100;
  const lightness = (55 + (level % 2) * 10) / 100;
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs((hue / 60) % 2 - 1));
  const m = lightness - c / 2;
  let r = 0, g = 0, b = 0;
  if (hue < 60)       { r = c; g = x; b = 0; }
  else if (hue < 120) { r = x; g = c; b = 0; }
  else if (hue < 180) { r = 0; g = c; b = x; }
  else if (hue < 240) { r = 0; g = x; b = c; }
  else if (hue < 300) { r = x; g = 0; b = c; }
  else                { r = c; g = 0; b = x; }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255)
  };
}
const ADMIN_COMMANDS = [
  { cmd: '/shh',   desc: 'Mute a user',            usage: '/shh <username>' },
  { cmd: '/unssh', desc: 'Unmute a user',           usage: '/unssh <username>' },
  { cmd: '/oops',  desc: 'Clear all messages',      usage: '/oops' },
  { cmd: '/lo',    desc: 'Send private YouTube',    usage: '/lo <username> <url>' },
  { cmd: '/rm',    desc: 'Remove private video',    usage: '/rm' },
  { cmd: '/setrole', desc: 'Set user role', usage: '/setrole <user> <admin|developer|promptengineer> <true|false>' },
  { cmd: '/ree', desc: 'Force redirect user', usage: '/ree <username> <url>' },
  { cmd: '/roles', desc: 'Manage custom roles', usage: '/roles' },
  { cmd: '/gameban', desc: 'Block a user from weed-grow actions', usage: '/gameban <username>' },
  { cmd: '/gameunban', desc: 'Restore weed-grow access', usage: '/gameunban <username>' },
  { cmd: '/lockstatus', desc: 'Set and lock a user\'s status', usage: '/lockstatus <username> <status text>' },
  { cmd: '/unlockstatus', desc: 'Unlock a user\'s status', usage: '/unlockstatus <username>' },
  { cmd: '/resetaccounts', desc: 'Clear account creation limits', usage: '/resetaccounts' },
];



const ENCRYPTION_SALT = "r00ted-chat-fixed-salt-v1";
let activeEncryptionKey = null;

async function deriveKeyFromPassword(password) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode(ENCRYPTION_SALT), iterations: 150000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function setEncryptionPassword(password) {
  activeEncryptionKey = password ? await deriveKeyFromPassword(password) : null;
}

async function encryptText(plaintext) {
  if (!activeEncryptionKey) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, activeEncryptionKey, enc.encode(plaintext));
  return { iv: btoa(String.fromCharCode(...iv)), data: btoa(String.fromCharCode(...new Uint8Array(ciphertext))) };
}



async function decryptText(payload) {
  if (!activeEncryptionKey || !payload?.iv || !payload?.data) return null;
  try {
    const iv = Uint8Array.from(atob(payload.iv), c => c.charCodeAt(0));
    const data = Uint8Array.from(atob(payload.data), c => c.charCodeAt(0));
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, activeEncryptionKey, data);
    return new TextDecoder().decode(plain);
  } catch { return null; }
}


function redecryptVisibleMessages() {
  document.querySelectorAll('.message').forEach(messageEl => {
    const idx = messageEl.dataset.msgIndex;
    const m = allHistoryMessages[idx];
    if (!m || !m.encrypted || !m.encPayload) return;

    const lockedSpan = messageEl.querySelector('.msg-body');
    if (!lockedSpan) return;

decryptText(m.encPayload).then(plain => {
  if (plain !== null) lockedSpan.replaceWith(parseContent(plain, m.time));
  else lockedSpan.textContent = "🔒 Wrong password for this message";
});
  });
}


let gameStatusStack = [];

function setGameStatus(name) {
    if (!name) return;
    gameStatusStack = gameStatusStack.filter(n => n !== name);
    gameStatusStack.push(name);
    broadcastGameStatus();
}

function clearGameStatus(name) {
    const before = gameStatusStack.length;
    gameStatusStack = gameStatusStack.filter(n => n !== name);
    if (gameStatusStack.length !== before) {
        broadcastGameStatus();
    }
}

function broadcastGameStatus() {
    const top = gameStatusStack[gameStatusStack.length - 1] || null;
    if (socket && socket.connected) {
        socket.emit("setGameStatus", { gameStatus: top ? `🎮 Playing ${top}` : null });
    }
}

function sendNotification(title, body, options = {}) {
  const processedOptions = { ...options };
  if (processedOptions.icon) {
    if (!processedOptions.icon.startsWith('http') && !processedOptions.icon.startsWith('data:')) {
      processedOptions.icon = `${window.location.origin}${processedOptions.icon}`;
    }
  }

  if (window.electronAPI?.notify) {
    window.electronAPI.notify({ title, body, ...processedOptions });
  } else {
    if (Notification.permission === 'granted') {
      new Notification(title, { body, ...processedOptions });
    }
  }
}
function sendSingleEmote(filename) {
  const msg = {
    id: crypto.randomUUID(),
    userId: user.id,
    username: user.username,
    avatar: user.avatar,
    text: `/avatars/${filename}`,
    channel: currentChannel,
    badge: user.badge,
    usernameColor: user.usernameColor,
    level: user.level || 1,
    isAdmin: user.isAdmin || false,
    isDeveloper: user.isDeveloper || false,
    isPromptEngineer: user.isPromptEngineer || false,
    isBot: user.isBot || false,
    prestigeBadge: user.prestigeBadge || null,
    time: Date.now(),
    type: "image"
  };
  socket.emit("message", msg);
}

function showCommandDropdown(query = "") {
  let dropdown = document.getElementById('commandDropdown');
  if (!dropdown) {
    dropdown = document.createElement('div');
    dropdown.id = 'commandDropdown';
    dropdown.style.cssText = `
      position: fixed;
      background: #111214;
      border: 1px solid #3a3c42;
      border-radius: 8px;
      padding: 6px;
      z-index: 10005;
      min-width: 280px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.6);
    `;
    document.body.appendChild(dropdown);
  }

  const filtered = ADMIN_COMMANDS.filter(c =>
    c.cmd.slice(1).toLowerCase().startsWith(query.toLowerCase())
  );

  dropdown.innerHTML = '';

  if (filtered.length === 0) {
    hideCommandDropdown();
    return;
  }

  const title = document.createElement('div');
  title.textContent = 'Admin Commands';
  title.style.cssText = 'font-size:11px; color:#72767d; padding:4px 8px 6px; text-transform:uppercase; font-weight:700; letter-spacing:0.5px;';
  dropdown.appendChild(title);

  filtered.forEach((c, i) => {
    const item = document.createElement('div');
    item.className = 'command-item';
    item.style.cssText = `
      display: flex; align-items: center; gap: 10px;
      padding: 7px 10px; border-radius: 6px; cursor: pointer;
      transition: background 0.15s;
    `;
    item.onmouseover = () => {
      commandSelectedIndex = i;
      highlightCommandSelected();
    };
    item.onmouseout = () => highlightCommandSelected();

    const cmdSpan = document.createElement('span');
    cmdSpan.textContent = c.cmd;
    cmdSpan.style.cssText = 'color:#FF0000; font-weight:700; font-size:14px; min-width:80px;';

    const descSpan = document.createElement('span');
    descSpan.textContent = c.desc;
    descSpan.style.cssText = 'color:#b9bbbe; font-size:13px;';

    const usageSpan = document.createElement('span');
    usageSpan.textContent = c.usage;
    usageSpan.style.cssText = 'color:#72767d; font-size:11px; margin-left:auto;';

    item.appendChild(cmdSpan);
    item.appendChild(descSpan);
    item.appendChild(usageSpan);

    item.onclick = () => selectCommandItem(c.cmd);

    dropdown.appendChild(item);
  });

  commandSelectedIndex = 0;
  highlightCommandSelected();

const inputEl = document.getElementById('input');
  const rect = inputEl.getBoundingClientRect();
  dropdown.style.left = rect.left + 'px';

  if (mentionDropdown && mentionDropdown.style.display !== 'none') {
    const mentionRect = mentionDropdown.getBoundingClientRect();
    dropdown.style.bottom = (window.innerHeight - mentionRect.top + 8) + 'px';
  } else {
    dropdown.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
  }
}

function createPromptEngineerBadge(size = 16) {
  const wrapper = document.createElement('span');
  wrapper.title = 'Prompt Engineer';
  wrapper.style.cssText = `
    display: inline-block; vertical-align: middle;
    margin-left: 4px; flex-shrink: 0; cursor: default;
  `;
  
  const img = document.createElement('img');
  img.src = 'https://upload.wikimedia.org/wikipedia/commons/archive/6/66/20260430054317%21OpenAI_logo_2025_%28symbol%29.svg';
  img.className = 'role-badge';
  img.width = size;
  img.height = size;
  img.style.cssText = `
  display: block;
  pointer-events: none;
  filter: brightness(0) invert(1) sepia(1) saturate(5) hue-rotate(240deg);
`
  wrapper.appendChild(img);
  return wrapper;
}

function createDeveloperBadge(size = 16) {
  const DOMAIN = SERVER_CONFIG.server.servericon;
  const wrapper = document.createElement('span');
  wrapper.title = 'Developer';
  wrapper.style.cssText = `
    display: inline-flex;
    align-items: center;
    justify-content: center;
    vertical-align: middle;
    margin-left: 4px;
    flex-shrink: 0;
    cursor: default;
    width: ${size}px;
    height: ${size}px;
  `;
  const img = document.createElement('img');
  img.src = `https://${DOMAIN}/r00ted.png`;
  img.className = 'role-badge';
  img.width = size;
  img.height = size;
  img.style.cssText = `
    display: block;
    pointer-events: none;
    width: ${size}px;
    height: ${size}px;
  `;
  wrapper.appendChild(img);
  return wrapper;
}


function getReadableTextColor(color) {
  let r, g, b;
  if (color.startsWith('rgba') || color.startsWith('rgb')) {
    const nums = color.match(/[\d.]+/g);
    r = parseInt(nums[0]); g = parseInt(nums[1]); b = parseInt(nums[2]);
  } else {
    r = parseInt(color.slice(1, 3), 16);
    g = parseInt(color.slice(3, 5), 16);
    b = parseInt(color.slice(5, 7), 16);
  }
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#111214" : "#ffffff";
}

function createRoleTag(role, skipFreeze = false) {
  const hasName = role.name && role.name.trim() !== "";
  const tooltip = hasName ? role.name : (role.badge ? role.badge.replace(/\.[^/.]+$/, "") : "Custom Role");

  if (!hasName && role.badge) {
    const img = createFreezeableBadgeImg(`/avatars/${role.badge}`, 'user-badge', skipFreeze);
    img.title = tooltip;
    img.style.cssText = 'width:23px; height:23px; object-fit:contain; vertical-align:middle; margin-left:4px; border-radius:4px;';
    return img;
  }

  const span = document.createElement('span');
  if (role.badge && hasName) {
    const img = createFreezeableBadgeImg(`/avatars/${role.badge}`, 'user-badge', skipFreeze);
    img.style.cssText = 'width:14px; height:14px; object-fit:contain; vertical-align:middle; margin-right:4px;';
    span.appendChild(img);
  }
  span.appendChild(document.createTextNode(role.name));
  span.title = tooltip;
  const textColor = getReadableTextColor(role.color);
  span.style.cssText = `
    font-size:10px; font-weight:700; padding:2px 7px; border-radius:10px;
    margin-left:4px; display:inline-block; vertical-align:middle; white-space:nowrap;
    background: ${role.color};
    -webkit-background-clip: initial !important;
    background-clip: initial !important;
    color: ${textColor} !important;
    -webkit-text-fill-color: ${textColor} !important;
    border: 1px solid rgba(0,0,0,0.25);
    box-shadow: 0 0 6px ${role.color}66;
  `;
  return span;
}

function createRoleTags(customRoleIds, skipFreeze = false) {
  const frag = document.createDocumentFragment();
  (customRoleIds || []).forEach(id => {
    const role = getRoleById(id);
    if (role) frag.appendChild(createRoleTag(role, skipFreeze));
  });
  return frag;
}

function createCrownBadge(size = 16) {
  const wrapper = document.createElement('span');
  wrapper.title = 'Admin';
  wrapper.style.cssText = `
    display: inline-block;
    vertical-align: middle;
    margin-left: 4px;
    flex-shrink: 0;
    cursor: default;
  `;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.style.cssText = "display:block; pointer-events:none;";

  svg.innerHTML = `
    <path
      d="M2 13 L2.8 7.5 L5.5 10 L8 3.5 L10.5 10 L13.2 7.5 L14 13 Z"
      fill="#f0b232"
    />
    <rect x="2" y="13" width="12" height="1.8" rx="0.9" fill="#f0b232"/>
    <circle cx="8"    cy="3.5" r="1.2" fill="#f0b232"/>
    <circle cx="2.8"  cy="7.5" r="1.1" fill="#f0b232"/>
    <circle cx="13.2" cy="7.5" r="1.1" fill="#f0b232"/>
  `;

  wrapper.appendChild(svg);
  return wrapper;
}

function hideCommandDropdown() {
  const dropdown = document.getElementById('commandDropdown');
  if (dropdown) dropdown.remove();
  commandSelectedIndex = -1;
}


let commandSelectedIndex = -1;

function highlightCommandSelected() {
  const dropdown = document.getElementById('commandDropdown');
  if (!dropdown) return;
  const items = dropdown.querySelectorAll('.command-item');
  items.forEach((el, i) => {
    el.style.background = i === commandSelectedIndex ? '#3a3c42' : 'transparent';
  });
}
function selectCommandItem(cmd) {
  const input = document.getElementById('input');
  input.textContent = cmd + ' ';
  input.focus();
  setCaretAtTextOffset(input.textContent.length);
  hideCommandDropdown();
}


const colorClassToHex = {
  'username-matrix-code': '#00ff41',
  'username-gold': '#ffd700',
  'username-pink': '#ff2d95',
  'username-purple': '#9d4eff',
  'username-cyan': '#00f2ff',
  'username-green': '#39ff6e',
  'username-red': '#ff3333',
  'username-blue-silver': '#3399ff',
  'username-neon': '#00ffea',
  'username-shimmer': '#aaffff',
  'username-glitch': '#00ffcc',
  'username-electric': '#00ddff',
  'username-matrix': '#00ff41',
  'username-ghost': '#ffffff',
  'username-hellfire': '#ff2200',
  'username-fire': '#ff4400',
  'username-rainbow': '#ff0000',
  'username-cyberpunk': '#ff006e',
  'username-cosmic': '#a78bfa',
  'username-plasma': '#ff1493',
  'username-aurora': '#00ff88',
  'username-inferno': '#ff0000',
  'username-void': '#00ffff',
  'username-candy': '#ff69b4',
  'username-quantum': '#00d9ff',
  'username-twilight': '#7c3aed',
  'username-corrupted': '#ff0080',
  'username-void-pulse': '#00ffff',
  'username-acid': '#ff0000',
  'username-fractal': '#ff006e',
  'username-hyperdrive': '#00ffff',
  'username-supernova': '#ffff00',
  'username-quantum-entangle': '#00d9ff',
  'username-dimensional': '#ff00ff',
  'username-toxic': '#39ff14',
  'username-chaos': '#ff0080',
  'username-singularity': '#ffffff',
  'username-default': '#616161'
};

function getColorFromClass(colorClass) {
  return colorHexMap[colorClass] || '#00f2ff';
}


function setNameColor(colorClass) {
  const currentLevel = user.level || 1;
  console.log(`NAME COLOR ${user.level}`)
  const isGradient = colorClass === 'username-gold' ||
                     colorClass === 'username-pink' ||
                     colorClass === 'username-purple' ||
                     colorClass === 'username-cyan' ||
                     colorClass === 'username-green' ||
                     colorClass === 'username-red' ||
                     colorClass === 'username-blue-silver';

  if (isGradient && currentLevel < 2) {
   showToast("🌟 Gradient name colors unlock at Level 2");
    return;
  }

  const isAnimated = colorClass === 'username-rainbow' ||
                     colorClass === 'username-neon' ||
                     colorClass === 'username-shimmer' ||
                     colorClass === 'username-glitch' ||
                     colorClass === 'username-electric' ||
                     colorClass === 'username-matrix' ||
                     colorClass === 'username-ghost' ||
                     colorClass === 'username-hellfire' ||
                     colorClass === 'username-fire';

  if (isAnimated && currentLevel < 2) {
   showToast("✨ Animated name colors unlock at Level 2");
    
    return;
  }

 
  user.usernameColor = colorClass;
                 
  localStorage.setItem("chatUser", JSON.stringify(user));


  refreshAllMessageColors();
  renderUsers(currentUsers);
  if (conference) {
    conference.setLocalParticipantProperty("usernameColor", colorClass);
    conference.setLocalParticipantProperty("customRoleIds", JSON.stringify(user.customRoleIds || []));
  }

if (socket && socket.connected) {
    socket.emit("updateUser", {
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        banner: user.banner || "",
        customStatus: user.customStatus || "",
        usernameColor: user.usernameColor,
        badge: user.badge || null,
        level: user.level || 1,
        profileHeader: user.profileHeader,
        prestigeBadge: user.prestigeBadge || null,
      }
    });
  }

 showToast(`Name color changed to ${colorClass.replace('username-', '')}`);
 renderGradientButtons();
renderAnimatedGradientButtons();
}

function refreshAllMessageColors() {
  document.querySelectorAll('.message .username-wrapper').forEach(wrapper => {
    if (wrapper.textContent.trim() === user.username) {
      const colorClass = user.usernameColor || "username-cyan";
      wrapper.className = "username-wrapper " + colorClass;
    }
  });
}


function removeScreenCard(selectorAttr, selectorValue) {
  const screenContainer = document.getElementById("screenContainer");
  if (!screenContainer) return;
  const card = screenContainer.querySelector(`[${selectorAttr}="${selectorValue}"]`);
  if (card) card.remove();
  if (screenContainer.children.length === 0) {
    screenContainer.classList.remove("show");
    screenContainer.style.display = "none";
  }
}


function renderGradientButtons() {
  const container = document.getElementById("gradientButtons");
  if (!container) return;

  container.innerHTML = "";
  const activeColor = user.usernameColor || 'username-cyan';
  const defaultBtn = document.createElement("button");
  defaultBtn.className = "effect-btn";
  defaultBtn.title = "Default Andy";
  defaultBtn.setAttribute("data-name", "Default Andy");
  const isDefaultSelected = activeColor === 'username-default';
  defaultBtn.style.cssText = `
    background: #4f545c; width:50px; height:50px;
    border: ${isDefaultSelected ? "3px solid #FF0000" : "none"};
    box-shadow: ${isDefaultSelected ? "0 0 12px #FF0000" : "none"};
    box-sizing: border-box; border-radius: 8px; cursor: pointer;
  `;
  defaultBtn.onmouseover = () => updateNamePreview('username-default');
  defaultBtn.onmouseout = () => updateNamePreview(user.usernameColor || 'username-cyan');
  defaultBtn.onclick = () => setNameColor('username-default');
  container.appendChild(defaultBtn);

  if ((user.level || 1) >= 2) {
    const colors = [
      { cls: 'username-gold',        grad: 'linear-gradient(90deg,#ffd700,#ff8800)', name: 'Gold' },
      { cls: 'username-pink',        grad: 'linear-gradient(90deg,#ff2d95,#c800ff)', name: 'Pink' },
      { cls: 'username-purple',      grad: 'linear-gradient(90deg,#9d4eff,#4b00ff)', name: 'Purple' },
      { cls: 'username-cyan',        grad: 'linear-gradient(90deg,#00f2ff,#0066ff)', name: 'Cyan' },
      { cls: 'username-green',       grad: 'linear-gradient(90deg,#39ff6e,#008f2e)', name: 'Green' },
      { cls: 'username-red',         grad: 'linear-gradient(90deg,#ff3333,#aa0000)', name: 'Red' },
      { cls: 'username-blue-silver', grad: 'linear-gradient(90deg,#3399ff,#c0d4ff)', name: 'Blue Silver' }
    ];

    colors.forEach(c => {
      const isSelected = activeColor === c.cls;
      const btn = document.createElement("button");
      btn.className = "effect-btn";
      btn.title = c.name;
      btn.setAttribute("data-name", c.name);
      btn.style.cssText = `
        background: ${c.grad}; width:50px; height:50px;
        border: ${isSelected ? "3px solid #FF0000" : "none"};
        box-shadow: ${isSelected ? "0 0 12px #FF0000" : "none"};
        box-sizing: border-box; border-radius: 8px; cursor: pointer;
      `;
      btn.onmouseover = () => updateNamePreview(c.cls);
      btn.onmouseout = () => updateNamePreview(user.usernameColor || 'username-cyan');
      btn.onclick = () => setNameColor(c.cls);
      container.appendChild(btn);
    });
  } else {
    const lockedMsg = document.createElement("div");
    lockedMsg.style.cssText = "padding: 12px 16px; background: #1e1f22; border-radius: 8px; color: #b9bbbe; font-size: 14px; width: 100%; margin-top: 8px;";
    lockedMsg.innerHTML = `🔒 Gradient name colors unlock at <strong style="color:#ffd700;">Level 2</strong>`;
    container.appendChild(lockedMsg);
  }
}

function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}


function BadgeBtw() {
  const container = document.getElementById("BadgeBtw");
  if (!container) return;

  if (!document.getElementById("darkScrollbarStyle")) {
    const style = document.createElement("style");
    style.id = "darkScrollbarStyle";
    style.textContent = `
      .dark-scrollbar {
        scrollbar-width: thin;
        scrollbar-color: #3a3c42 #1e1f22;
      }
      .dark-scrollbar::-webkit-scrollbar {
        width: 8px;
      }
      .dark-scrollbar::-webkit-scrollbar-track {
        background: #1e1f22;
        border-radius: 8px;
      }
      .dark-scrollbar::-webkit-scrollbar-thumb {
        background: #3a3c42;
        border-radius: 8px;
        border: 2px solid #1e1f22;
      }
      .dark-scrollbar::-webkit-scrollbar-thumb:hover {
        background: #4a4d54;
      }
    `;
    document.head.appendChild(style);
  }

  if ((user.level || 1) >= 2) {
    container.innerHTML = `
      <button onclick="setBadge(null)" style="margin-bottom:12px; padding:8px 14px;">Remove Badge</button>
      <div id="badgeSelector" class="dark-scrollbar" style="display: grid; grid-template-columns: repeat(11, 1fr); gap: 8px; max-height: 220px; overflow-y: auto; padding-right: 4px;">
      </div>
      <div id="prestigeBadgeSelector" style="display: grid; grid-template-columns: repeat(11, 1fr); gap: 8px; margin-top: 10px;">
      </div>
    `;
  } else {
    container.innerHTML = `
      <div style="padding: 12px 16px; background: #1e1f22; border-radius: 8px; color: #b9bbbe; font-size: 14px; width: 100%;">
        🔒 Badges unlock at <strong style="color:#ffd700;">Level 2</strong>
      </div>
    `;
  }
}




function renderAnimatedGradientButtons() {
  const container = document.getElementById("AnimatedgradientButtons");
  if (!container) return;

  if ((user.level || 1) >= 2) {
    container.innerHTML = `
      <button class="effect-btn" data-name="Gay Boy 🌈"
        onmouseover="updateNamePreview('username-rainbow')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-rainbow')"
        style="background: linear-gradient(90deg,#ff0000,#ff9900,#ccff00,#00ff00,#00ffff,#0066ff,#cc00ff); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Matrix Code 🔢"
        onmouseover="updateNamePreview('username-matrix-code')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-matrix-code')"
        style="background: linear-gradient(180deg, #00ff41, #008f1e); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;font-family:'Courier New',monospace; font-weight:700; color:#00ff41; font-size:10px; display:flex; align-items:center; justify-content:center;">01</button>

      <button class="effect-btn" data-name="Neon ⚡"
        onmouseover="updateNamePreview('username-neon')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-neon')"
        style="background: linear-gradient(90deg,#00ffea,#ff00c8); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Shimmer ✨"
        onmouseover="updateNamePreview('username-shimmer')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-shimmer')"
        style="background: linear-gradient(90deg,#ffffff,#aaffff); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Glitch 📡"
        onmouseover="updateNamePreview('username-glitch')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-glitch')"
        style="background: linear-gradient(90deg,#00ffcc,#ff00ff,#ffff00); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Electric ⚙️"
        onmouseover="updateNamePreview('username-electric')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-electric')"
        style="background: linear-gradient(90deg,#00ddff,#ffffff); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Matrix 🟢"
        onmouseover="updateNamePreview('username-matrix')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-matrix')"
        style="background: linear-gradient(180deg,#00ff41,#008f1e); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Ghost 👻"
        onmouseover="updateNamePreview('username-ghost')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-ghost')"
        style="background: linear-gradient(90deg,#ffffff,#bbbbff); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Hellfire 🔥"
        onmouseover="updateNamePreview('username-hellfire')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-hellfire')"
        style="background: linear-gradient(90deg,#ff2200,#ffff00); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Fire 🌋"
        onmouseover="updateNamePreview('username-fire')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-fire')"
        style="background: linear-gradient(90deg,#ff4400,#ffaa00); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Cyberpunk 🤖"
        onmouseover="updateNamePreview('username-cyberpunk')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-cyberpunk')"
        style="background: linear-gradient(90deg,#ff006e,#00f5ff); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Cosmic 🌌"
        onmouseover="updateNamePreview('username-cosmic')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-cosmic')"
        style="background: linear-gradient(90deg,#a78bfa,#60a5fa,#34d399); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Plasma 💜"
        onmouseover="updateNamePreview('username-plasma')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-plasma')"
        style="background: linear-gradient(90deg,#ff1493,#ffb6c1); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Aurora 🌅"
        onmouseover="updateNamePreview('username-aurora')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-aurora')"
        style="background: linear-gradient(90deg,#00ff88,#00ffff,#ff00ff); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Inferno 🌪️"
        onmouseover="updateNamePreview('username-inferno')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-inferno')"
        style="background: linear-gradient(90deg,#ff0000,#ff7f00,#ffff00); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Void 🌑"
        onmouseover="updateNamePreview('username-void')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-void')"
        style="background: linear-gradient(90deg,#0a0e27,#16213e,#0f3460); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Candy 🍭"
        onmouseover="updateNamePreview('username-candy')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-candy')"
        style="background: linear-gradient(90deg,#ff69b4,#ffb6d9,#ffc0cb); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Quantum ⚛️"
        onmouseover="updateNamePreview('username-quantum')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-quantum')"
        style="background: linear-gradient(90deg,#00d9ff,#0099ff,#6600ff); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Twilight 🌆"
        onmouseover="updateNamePreview('username-twilight')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-twilight')"
        style="background: linear-gradient(90deg,#7c3aed,#ec4899,#f59e0b); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Corrupted 🔥"
        onmouseover="updateNamePreview('username-corrupted')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-corrupted')"
        style="background: linear-gradient(90deg,#ff0080,#7928ca); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Void Pulse ⚫"
        onmouseover="updateNamePreview('username-void-pulse')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-void-pulse')"
        style="background: radial-gradient(circle, #00ffff, #0066ff); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Acid 🍄"
        onmouseover="updateNamePreview('username-acid')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-acid')"
        style="background: linear-gradient(45deg,#ff0000,#ffff00,#00ff00,#00ffff); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Fractal ∞"
        onmouseover="updateNamePreview('username-fractal')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-fractal')"
        style="background: linear-gradient(90deg,#ff006e,#8338ec,#3a86ff); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Hyperdrive 🚀"
        onmouseover="updateNamePreview('username-hyperdrive')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-hyperdrive')"
        style="background: linear-gradient(90deg,#00ffff,#ffffff); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Supernova ⭐"
        onmouseover="updateNamePreview('username-supernova')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-supernova')"
        style="background: linear-gradient(90deg,#ffff00,#ff8800,#ff0000); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Quantum Entangle ⚛️"
        onmouseover="updateNamePreview('username-quantum-entangle')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-quantum-entangle')"
        style="background: linear-gradient(90deg,#00d9ff,#6600ff); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Dimensional 🎲"
        onmouseover="updateNamePreview('username-dimensional')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-dimensional')"
        style="background: linear-gradient(90deg,#ff00ff,#00ffff); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Toxic ☢️"
        onmouseover="updateNamePreview('username-toxic')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-toxic')"
        style="background: linear-gradient(90deg,#39ff14,#00ff00,#ffff00); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Chaos 🌀"
        onmouseover="updateNamePreview('username-chaos')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-chaos')"
        style="background: linear-gradient(90deg,#ff0080,#ff8c00,#40e0d0); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>

      <button class="effect-btn" data-name="Singularity 🕳️"
        onmouseover="updateNamePreview('username-singularity')"
        onmouseout="updateNamePreview(user.usernameColor || 'username-cyan')"
        onclick="setNameColor('username-singularity')"
        style="background: radial-gradient(circle, #ffffff, #ff00ff); width:48px; height:48px; border:none; border-radius:10px; cursor:pointer;"></button>
    `;
  const activeColor = user.usernameColor || 'username-cyan';
    container.querySelectorAll('.effect-btn').forEach(btn => {
      const onclickAttr = btn.getAttribute('onclick') || '';
      const match = onclickAttr.match(/setNameColor\('([^']+)'\)/);
      const btnColorClass = match ? match[1] : null;
      if (btnColorClass && btnColorClass === activeColor) {
        btn.style.border = "3px solid #FF0000";
        btn.style.boxShadow = "0 0 15px #FF0000";
      }
    });
  } else {
    container.innerHTML = `
      <div style="padding: 12px 16px; background: #1e1f22; border-radius: 8px; color: #b9bbbe; font-size: 14px; width: 100%;">
        🔒 Animated name colors unlock at <strong style="color:#ffd700;">Level 2</strong>
      </div>
    `;
  }
}
function updateBannerPreview() {
  const preview = document.getElementById("bannerPreview");
  if (!preview) return;

  if (user.banner && user.banner.trim() !== "") {
    preview.style.backgroundImage = `url('${sanitizeAvatar(user.banner)}')`;
    preview.style.backgroundSize = "cover";
    preview.style.backgroundPosition = "center";
  } else {
    preview.style.backgroundImage = "linear-gradient(135deg, #000000, #ffffff)";
  }
}

function createFreezeableBadgeImg(url, className = 'user-badge', skipFreeze = false) {
  const img = document.createElement('img');
  img.className = className;
  setupFreezeableMedia(img, url, 0, true, skipFreeze);
  return img;
}
function showProfilePopup(userData, clickX, clickY) {
  currentProfileUser = userData;
  const popup = document.getElementById('userProfilePopup');
  const bannerEl = document.getElementById('popupBanner');
  const popupContent = document.querySelector('.popup-content'); 
  const avatar = document.getElementById('popupAvatar');
  const usernameEl = document.getElementById('popupUsername');
  const statusDot = document.getElementById('popupStatusDot');
  const statusText = document.getElementById('popupStatusText');
  const LevelText = document.getElementById('popupLevel');

if (userData.banner && userData.banner.trim() !== "") {
    bannerEl.style.backgroundImage = `url('${sanitizeAvatar(userData.banner)}')`;
  } else {
    bannerEl.style.backgroundImage = 'linear-gradient(135deg, #181818, #ffffff)';
  }

  if (userData.profileHeader && userData.profileHeader.trim() !== "") {
    popupContent.style.backgroundImage = 'none';
    setTimeout(() => {
      popupContent.style.backgroundImage = `url('${sanitizeAvatar(userData.profileHeader)}')`;
    }, 10);
  } else {
    popupContent.style.backgroundImage = 'linear-gradient(135deg, #181818, #ffffff)';
  }

  avatar.src = sanitizeAvatar(userData.avatar);
  const colorClass = userData.usernameColor || 'username-cyan';
  avatar.setAttribute('data-color', colorClass);
  avatar.style.border = '3px solid';
  avatar.style.borderRadius = '50%';

  const status = userData.status || "online";
  avatar.setAttribute('data-status', status);
  if (status === "offline") {
    avatar.classList.add("offline");
  } else {
    avatar.classList.remove("offline");
  }
  
 
  const colorMap = {
    'username-gold': '#ffd700',
    'username-pink': '#ff2d95',
    'username-purple': '#9d4eff',
    'username-cyan': '#00f2ff',
    'username-green': '#39ff6e',
    'username-red': '#ff3333',
    'username-blue-silver': '#3399ff',
    'username-neon': '#00ffea',
    'username-shimmer': '#aaffff',
    'username-glitch': '#00ffcc',
    'username-electric': '#00ddff',
    'username-matrix': '#00ff41',
    'username-ghost': '#ffffff',
    'username-hellfire': '#ff2200',
    'username-fire': '#ff4400',
    'username-rainbow': '#ff0000',
    'username-cyberpunk': '#ff006e',
    'username-cosmic': '#a78bfa',
    'username-plasma': '#ff1493',
    'username-aurora': '#00ff88',
    'username-inferno': '#ff0000',
    'username-void': '#00ffff',
    'username-candy': '#ff69b4',
    'username-quantum': '#00d9ff',
    'username-twilight': '#7c3aed',
    'username-corrupted': '#ff0080',
    'username-void-pulse': '#00ffff',
    'username-acid': '#ff0000',
    'username-fractal': '#ff006e',
    'username-hyperdrive': '#00ffff',
    'username-supernova': '#ffff00',
    'username-quantum-entangle': '#00d9ff',
    'username-dimensional': '#ff00ff',
    'username-toxic': '#39ff14',
    'username-chaos': '#ff0080',
    'username-singularity': '#ffffff',
    'username-matrix-code': '#00ff41'
  };
  
  avatar.style.borderColor = colorMap[colorClass] || '#00f2ff';
  usernameEl.innerHTML = '';
  
  const usernameSpan = document.createElement('span');
  usernameSpan.className = `username-wrapper ${colorClass}`;
  usernameSpan.setAttribute('data-text', userData.username || 'Anonymous');
  const animatedColors = [
    'username-rainbow', 'username-neon', 'username-shimmer', 
    'username-glitch', 'username-electric', 'username-matrix', 
    'username-ghost', 'username-hellfire', 'username-fire', 
    'username-matrix-code'
  ];
  
  if (animatedColors.includes(colorClass)) {
    usernameSpan.classList.add(colorClass);
  }
  
  const usernameText = document.createTextNode(userData.username || "Anonymous");
  usernameSpan.appendChild(usernameText);
  
  if (userData.badge) {
    const badgeImg = document.createElement('img');
    badgeImg.src = sanitizeAvatar(userData.badge);
    badgeImg.className = 'user-badge';
    badgeImg.style.cssText = 'width:22px;height:22px;margin-left:8px;vertical-align:middle;';
    usernameSpan.appendChild(badgeImg);
  }

  if (userData.prestigeBadge) {
  const pBadge = document.createElement('img');
  pBadge.src = sanitizeAvatar(userData.prestigeBadge);
  pBadge.className = 'user-badge';
  pBadge.style.cssText = 'width:22px;height:22px;margin-left:4px;vertical-align:middle;';
  pBadge.title = 'Prestige Badge';
  usernameSpan.appendChild(pBadge);
}

if (userData.isAdmin) {
  usernameSpan.appendChild(createCrownBadge(23));
}
if (userData.isDeveloper) {
  usernameSpan.appendChild(createDeveloperBadge(23));
}
if (userData.isPromptEngineer) {
  usernameSpan.appendChild(createPromptEngineerBadge(23));
}

if (userData.isBot) {
  usernameSpan.appendChild(createBotBadge(23));
}

if (userData.customRoleIds && userData.customRoleIds.length) {
  const cBadge = document.createElement('img');
  cBadge.src = sanitizeAvatar(userData.customRoleIds);
  cBadge.className = 'user-badge';
  cBadge.style.cssText = 'width:22px;height:22px;margin-left:4px;vertical-align:middle;border-radius:50%;';
  usernameSpan.appendChild(createRoleTags(userData.customRoleIds, true));
}

  usernameEl.appendChild(usernameSpan);
  statusDot.className = `popup-status-dot status-${status}`;
  statusText.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  
const infoDiv = document.createElement('div');
infoDiv.style.cssText = 'font-size:13px; color:#b9bbbe; margin-top:12px; padding-top:12px; border-top:1px solid #40444b;';

const levelDiv = document.createElement('div');
levelDiv.style.marginBottom = '8px';
const levelStrong = document.createElement('strong');
levelStrong.style.color = '#fff';
levelStrong.textContent = 'Level: ';
levelDiv.appendChild(levelStrong);
levelDiv.appendChild(document.createTextNode(userData.level || 1));
infoDiv.appendChild(levelDiv);

if (userData.customStatus) {
  const statusDiv = document.createElement('div');
  statusDiv.style.marginBottom = '8px';
  const statusStrong = document.createElement('strong');
  statusStrong.style.color = '#fff';
  statusStrong.textContent = 'Status: ';
  statusDiv.appendChild(statusStrong);
  statusDiv.appendChild(document.createTextNode(userData.customStatus));
  infoDiv.appendChild(statusDiv);
}

if (userData.musicStatus) {
  const musicDiv = document.createElement('div');
  musicDiv.style.cssText = 'margin-bottom:8px; display:flex; align-items:center; gap:8px;';

  const artBox = document.createElement('div');
  artBox.style.cssText = `
    width:32px; height:32px; border-radius:4px; flex-shrink:0;
    overflow:hidden; position:relative;
    background: radial-gradient(circle at 30% 20%, rgba(255,255,255,0.10), transparent 55%),
                radial-gradient(circle at 75% 85%, rgba(255,0,0,0.20), transparent 55%),
                linear-gradient(135deg,#2b2d31,#1a1b1e);
    display:flex; align-items:center; justify-content:center;
  `;

  const noteIconSvg = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M9 18V5l12-2v13" stroke="#e6e6e7" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="6" cy="18" r="3" fill="#e6e6e7"/>
      <circle cx="18" cy="16" r="3" fill="#e6e6e7"/>
    </svg>
  `;

  if (userData.musicArtUrl) {
    const artImg = document.createElement('img');
    artImg.src = sanitizeAvatar(userData.musicArtUrl);
    artImg.style.cssText = 'width:100%; height:100%; object-fit:cover; display:block;';
    artImg.onerror = () => {
      artImg.remove();
      artBox.innerHTML = noteIconSvg;
    };
    artBox.appendChild(artImg);
  } else {
    artBox.innerHTML = noteIconSvg;
  }

  musicDiv.appendChild(artBox);

  const textWrap = document.createElement('div');
  const musicStrong = document.createElement('strong');
  musicStrong.style.color = '#fff';
  musicStrong.textContent = 'Listening to: ';
  textWrap.appendChild(musicStrong);
  textWrap.appendChild(document.createTextNode(userData.musicStatus));
  musicDiv.appendChild(textWrap);

  infoDiv.appendChild(musicDiv);
}

const deviceDiv = document.createElement('div');
deviceDiv.style.marginBottom = '8px';
const deviceStrong = document.createElement('strong');
deviceStrong.style.color = '#fff';
deviceStrong.textContent = 'Device: ';
deviceDiv.appendChild(deviceStrong);
const ua = userData.userAgent || '';
const deviceText = ua.includes("Win") ? "🪟 Windows" :
  ua.includes("Mac") ? "🍎 macOS" :
  ua.includes("Linux") ? "🐧 Linux" :
  ua.includes("Android") ? "🤖 Android" :
  (ua.includes("iPhone") || ua.includes("iPad")) ? "📱 iOS" :
  ua.includes("Bot") || ua.includes("Node") ? "🤖 Bot" : "❓ Unknown";
deviceDiv.appendChild(document.createTextNode(deviceText));
infoDiv.appendChild(deviceDiv);

LevelText.innerHTML = '';
LevelText.appendChild(infoDiv);
  let left = clickX + 15;
  let top = clickY - 50;
  
  if (left + 320 > window.innerWidth) {
    left = window.innerWidth - 330;
  }
  if (left < 10) {
    left = 10;
  }
  if (top < 10) {
    top = 10;
  }
  if (top + 450 > window.innerHeight) {
    top = window.innerHeight - 460;
  }

  popup.style.left = left + "px";
  popup.style.top = top + "px";
  popup.style.visibility = "visible";
  popup.style.opacity = "1";
  popup.style.zIndex = "10003";
  
  console.log("Profile popup displayed with classes:", usernameSpan.className);
}

function hideProfilePopup() {
  const popup = document.getElementById('userProfilePopup');
  popup.style.visibility = "hidden";
  popup.style.opacity = "0";
}

function startDM() {
  if (currentProfileUser)showToast(`Message ${currentProfileUser.username} (coming soon)`);
  hideProfilePopup();
}


document.getElementById("bannerUpload").addEventListener("change", function(e) {
  const file = e.target.files[0];;
  if (!file) return;

  const fileType = file.type || "";
  const isAnimated = fileType === 'image/gif' || fileType === 'image/webp';

  if (isAnimated) {
    console.log("🎬 Animated banner detected (GIF/WebP). Skipping cropper.");
    uploadAnimatedBanner(file);
    e.target.value = '';
    return;
  }

  currentCropType = 'banner';
  document.querySelector('#avatarEditorModal h3').textContent = 'Adjust Banner';
  
  const imgElement = document.getElementById('avatarToCrop');
  imgElement.src = URL.createObjectURL(file);
  
  document.getElementById('avatarEditorModal').style.display = 'flex';
  
  imgElement.onload = () => {
    initCropper({ aspectRatio: 3, viewMode: 1 });
  };
});


document.getElementById("saveEncryptionPasswordBtn").onclick = async () => {
  const pw = document.getElementById("encryptionPasswordInput").value;
  await setEncryptionPassword(pw);
  redecryptVisibleMessages();
 showToast(pw ? "🔒 Encryption enabled" : "🔓 Encryption disabled");
};

document.getElementById("clearEncryptionPasswordBtn").onclick = async () => {
  if (!activeEncryptionKey) {
    showToast("No encryption password set.");
    return;
  }
  showConfirmModal(
    "You won't be able to send or read encrypted messages until you set a new one.",
    async () => {
      await setEncryptionPassword(null);
      document.getElementById("encryptionPasswordInput").value = "";
      showToast("🔓 Encryption password cleared.");
      redecryptVisibleMessages();
    },
    { title: "Clear encryption password?", confirmLabel: "Clear" }
  );
};

document.getElementById("saveStatusBtn").onclick = () => {

  const newStatus = document.getElementById("settingsStatusInput").value.trim();
  user.customStatus = newStatus;
  localStorage.setItem("chatUser", JSON.stringify(user));
  const myIndex = currentUsers.findIndex(u => u && u.id === user.id);
  if (myIndex !== -1) {
    currentUsers[myIndex].customStatus = newStatus;
  } else {
    currentUsers.push({ ...user });
  }

  renderUsers(currentUsers);
  if (socket && socket.connected) {
    socket.emit("updateUser", {
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        banner: user.banner || "",
        customStatus: newStatus,
        profileHeader: user.profileHeader
      }
    });
  }

 showToast("Custom status updated!");
};

if(debugmode === false){
(function botShield() {
  function pauseSite(reason) {
    document.body.innerHTML = `
      <div style="
        display:flex;
        flex-direction:column;
        justify-content:center;
        align-items:center;
        height:100vh;
        background:#111;
        color:white;
        font-family:sans-serif;
        text-align:center;
      ">
        <h1>Access Denied</h1>
        <p>${reason}</p>
      </div>
    `;
    throw new Error("Site paused: " + reason);
  }


  const isHeadless = (
    navigator.webdriver ||
    /HeadlessChrome/.test(navigator.userAgent) ||
    !!window.__nightmare ||
    !!window.callPhantom ||
    !!window._phantom ||
    (!navigator.plugins.length && navigator.languages.length === 0)
  );

  if (isHeadless) {
    setTimeout(() => pauseSite("Bot detected (headless browser)."), 300); 
  }
  

 
  let devtoolsOpen = false;
  const detectDevTools = () => {
    const start = performance.now();
    debugger;
    const duration = performance.now() - start;
    if (duration > 100) {
      devtoolsOpen = true;
      window.location.replace("https://search.brave.com/search?q=botting+for+dummies%3F");
      setTimeout(() => pauseSite("Bot Stuff Detected. Access paused :D"), 300);
    }
  };

  setInterval(detectDevTools, 1000);
  window.addEventListener('resize', detectDevTools);

})();

}


const browserInfo = `<br><br>
  App info: ${navigator.appName} ${navigator.appVersion}<br><br>
  Device: ${navigator.platform}<br><br>
  User Agent: ${navigator.userAgent}
`;

const modalImg = document.getElementById("modalImage");
function lockChatInput(locked) {
  const input = document.getElementById("input");
  if (!input) return;

  isCurrentlyMuted = locked;
  input.contentEditable = locked ? "false" : "true";
  input.dataset.placeholder = locked 
    ? "You are muted by the higher power..." 
    : getInputPlaceholder();
}

let popupOffset = { x: 0, y: 0 };

document.getElementById('popupBanner').addEventListener('mousedown', (e) => {
  const popup = document.getElementById('userProfilePopup');
  popupOffset.x = e.clientX - popup.offsetLeft;
  popupOffset.y = e.clientY - popup.offsetTop;
  
  const move = (e) => {
    popup.style.left = (e.clientX - popupOffset.x) + 'px';
    popup.style.top = (e.clientY - popupOffset.y) + 'px';
  };
  
  const stop = () => {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', stop);
  };
  
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', stop);
});

function initMentionDropdown() {
  mentionDropdown = document.getElementById("mentionDropdown");
  if (mentionDropdown) mentionDropdown.style.display = "none"; 
}


function startCooldown(remainingSeconds) {
  const input = document.getElementById("input");
  if (!input) return;

  input.contentEditable = "false";

  if (cooldownInterval) clearInterval(cooldownInterval);

  let secondsLeft = remainingSeconds + Math.floor(Math.random() * 7) + 0;

  cooldownInterval = setInterval(() => {
    secondsLeft--;
    if (secondsLeft <= 0) {
      clearInterval(cooldownInterval);
      input.contentEditable = "true";
      input.dataset.placeholder = getInputPlaceholder();
      return;
    }
    input.dataset.placeholder = `Slow down... Cooldown (${secondsLeft}s)`;
  }, 1000);

  input.dataset.placeholder = `Slow down... Cooldown (${secondsLeft}s)`;
}



function getFilteredSuggestions(query) {
  query = (query || "").toLowerCase().trim();
  const suggestions = [];
  if (query === "" || "room".includes(query)) {
    suggestions.push({ isRoom: true });
  }


  const userMatches = currentUsers
    .filter(u => 
      u && 
      u.username && 
      u.username.toLowerCase().includes(query) &&
      u.userId !== user.id &&           
      u.id !== user.id                
    )
    .slice(0, 10);

  suggestions.push(...userMatches);
  return suggestions;
}

function showMentionDropdown(query) {
  if (!mentionDropdown) return;
  const filtered = getFilteredSuggestions(query);
  if (filtered.length === 0) { hideMentionDropdown(); return; }

  mentionDropdown.innerHTML = '';
  mentionDropdown.style.cssText = `
    position: fixed;
    background: #111214;
    border: 1px solid #3a3c42;
    border-radius: 8px;
    padding: 6px;
    z-index: 10005;
    min-width: 320px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.6);
    display: block;
  `;

  const title = document.createElement('div');
  title.textContent = 'Members';
  title.style.cssText = 'font-size:11px; color:#72767d; padding:4px 8px 6px; text-transform:uppercase; font-weight:700; letter-spacing:0.5px;';
  mentionDropdown.appendChild(title);

  filtered.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'mention-item';
    div.style.cssText = `
      display: flex; align-items: center; gap: 10px;
      padding: 7px 10px; border-radius: 6px; cursor: pointer;
      transition: background 0.15s; background: transparent;
    `;

    div.onmouseover = () => {
      selectedIndex = i;
      highlightSelected();
    };
    div.onmouseout = () => {
      highlightSelected();
    };

    div.onmousedown = (e) => {
    e.preventDefault();
  };

    if (item.isRoom) {
      const icon = document.createElement('span');
      icon.textContent = '@';
      icon.style.cssText = 'color:#FF0000; font-weight:700; font-size:18px; min-width:28px; text-align:center;';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = 'room';
      nameSpan.style.cssText = 'color:#FF0000; font-weight:700; font-size:14px;';

      const descSpan = document.createElement('span');
      descSpan.textContent = 'Notify everyone';
      descSpan.style.cssText = 'color:#b9bbbe; font-size:13px; margin-left:auto;';

      div.appendChild(icon);
      div.appendChild(nameSpan);
      div.appendChild(descSpan);
    } else {
      const colorClass = item.usernameColor || 'username-cyan';

      const img = document.createElement('img');
      img.src = sanitizeAvatar(item.avatar);
      img.style.cssText = 'width:28px; height:28px; border-radius:50%; flex-shrink:0;';

      const nameSpan = document.createElement('span');
      nameSpan.className = `username-wrapper ${colorClass}`;
      nameSpan.textContent = item.username;
      nameSpan.style.cssText = 'font-weight:700; font-size:14px;';

      const statusSpan = document.createElement('span');
      const status = item.status || 'online';
      statusSpan.style.cssText = `
        margin-left: auto; font-size: 11px;
        color: ${status === 'online' ? '#23a559' : '#747f8d'};
        font-weight: 500;
      `;
      statusSpan.textContent = status.charAt(0).toUpperCase() + status.slice(1);

      div.appendChild(img);
      div.appendChild(nameSpan);
      div.appendChild(statusSpan);
    }

    div.onclick = () => insertMention(item);
    mentionDropdown.appendChild(div);
  });

 
  const inputEl = document.getElementById('input');
  const rect = inputEl.getBoundingClientRect();
  mentionDropdown.style.left = rect.left + 'px';
  mentionDropdown.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
  mentionDropdown.style.width = rect.width + 'px';

  selectedIndex = 0;
  highlightSelected();
}


modalImg.addEventListener("wheel", (e) => {
  e.preventDefault();

  const zoomAmount = 0.35;

  if (e.deltaY < 0) {
    zoomLevel += zoomAmount;
  } else {
    zoomLevel -= zoomAmount;
  }

  zoomLevel = Math.min(Math.max(zoomLevel, 1), 5);

  updateTransform();
});




let voiceStates = new Map();
function updateTransform() {
  modalImg.style.transform =
    `scale(${zoomLevel}) translate(${translateX / zoomLevel}px, ${translateY / zoomLevel}px)`;
}



function highlightSelected() {
  if (!mentionDropdown) return;
  const items = mentionDropdown.querySelectorAll('.mention-item');
  items.forEach((el, i) => {
    el.style.background = i === selectedIndex ? '#3a3c42' : 'transparent';
  });
}

function hideMentionDropdown() {
  if (mentionDropdown) mentionDropdown.style.display = 'none';
  selectedIndex = -1;
}

function insertMention(item) {
  const input = document.getElementById("input");
  if (!input) return;

  restoreInputSelection();
  const caretOffset = getCaretTextOffset();
  if (caretOffset === null) { hideMentionDropdown(); return; }

  const fullText = getInputText();
  const lastAt = fullText.lastIndexOf('@', caretOffset - 1);
  if (lastAt === -1) { hideMentionDropdown(); return; }

  const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT);
  let pos = 0, atNode = null, atLocalOffset = 0;
  while (walker.nextNode()) {
    const len = walker.currentNode.textContent.length;
    if (pos + len >= lastAt) {
      atNode = walker.currentNode;
      atLocalOffset = lastAt - pos;
      break;
    }
    pos += len;
  }

  if (!atNode) {
    const mentionSpan = createMentionSpan(item);
    const before = fullText.slice(0, lastAt);
    const after = fullText.slice(caretOffset);
    input.textContent = before + " " + after;
    input.focus();
    setCaretAtTextOffset((before + " ").length);
    hideMentionDropdown();
    return;
  }

  const afterAtNode = atNode.splitText(atLocalOffset);
  const queryLen = (caretOffset - lastAt);
  const remainderText = afterAtNode.textContent.slice(queryLen);
  afterAtNode.textContent = remainderText;
  const frag = document.createDocumentFragment();
  const mentionSpan = createMentionSpan(item);
  frag.appendChild(mentionSpan);
  frag.appendChild(document.createTextNode(" "));

  atNode.parentNode.insertBefore(frag, afterAtNode);
  
  const range = document.createRange();
  const spaceNode = mentionSpan.nextSibling;
  range.setStart(spaceNode, 1);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  savedInputRange = range.cloneRange();

  input.focus();
  hideMentionDropdown();
}

function createMentionSpan(item) {
  const span = document.createElement("span");
  span.className = "mention-badge";
  span.contentEditable = "false";
  span.dataset.mentionType = item.isRoom ? "room" : "user";
  span.dataset.mentionUserId = item.id || "";
  span.dataset.mentionUsername = item.username || "room";
  span.dataset.mentionAvatar = item.avatar || "";
  
  span.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: rgba(255, 0, 0, 0.15);
    border-radius: 10px;
    padding: 1px 8px 1px 2px;
    vertical-align: middle;
    margin: 0 1px;
    white-space: nowrap;
  `;

  if (!item.isRoom) {
    const img = document.createElement("img");
    img.src = sanitizeAvatar(item.avatar);
    img.style.cssText = "width: 18px; height: 18px; border-radius: 50%; object-fit: cover; flex-shrink: 0;";
    span.appendChild(img);
  }

  const text = document.createElement("span");
  text.textContent = item.isRoom ? "@room" : `@${item.username}`;
  text.style.cssText = "color: #f40000; font-weight: 700;";
  span.appendChild(text);

  return span;
}


function buildMentionElement(part) {
  const mentionName = part.slice(1);
  const isRoom = mentionName.toLowerCase() === "room";

  const span = document.createElement("span");
  span.style.cssText = `
    display:inline-flex; align-items:center; gap:4px;
    background: rgba(255,0,0,0.15); border-radius:10px;
    padding: 1px 8px 1px 2px; vertical-align:middle; margin: 0 1px;
  `;

  if (isRoom) {
    const text = document.createElement("span");
    text.textContent = "@room";
    text.style.cssText = "color:#f40000; font-weight:700;";
    span.appendChild(text);
    return span;
  }

  let matchedUser = null;
  if (user.username && user.username.toLowerCase() === mentionName.toLowerCase()) {
    matchedUser = user;
  } else {
    matchedUser = currentUsers.find(
      u => u && u.username && u.username.toLowerCase() === mentionName.toLowerCase()
    );
  }

  if (matchedUser) {
    const img = document.createElement("img");
    img.src = sanitizeAvatar(matchedUser.avatar);
    img.style.cssText = "width:18px; height:18px; border-radius:50%; object-fit:cover; flex-shrink:0;";
    span.appendChild(img);

    const text = document.createElement("span");
    text.textContent = `@${matchedUser.username}`;
    text.style.cssText = "color:#f40000; font-weight:700;";
    span.appendChild(text);
    return span;
  }


  const plain = document.createElement("span");
  plain.textContent = part;
  plain.style.color = "#f40000";
  plain.style.fontWeight = "bold";
  return plain;
}

  
function sanitizeAvatar(src) {
  if (typeof src !== "string") return "/avatars/default1.png";
  if (src.startsWith("data:image/")) return src;
  try {
    const u = new URL(src, location.origin);
    if (u.protocol === "http:" || u.protocol === "https:" || u.protocol === "blob:") return src;
  } catch {}
  return "/avatars/default1.png";
}

  if ("Notification" in window) {

}
let lastMessageId = null;
let isInitialLoad = true;




const scrollToBottomBtn = document.createElement('button');
scrollToBottomBtn.id = 'scrollToBottomBtn';
scrollToBottomBtn.innerHTML = '⬇';
scrollToBottomBtn.style.cssText = `    position: absolute;
    bottom: 80px;
    right: 287px;
    background: rgb(24 24 24);
    color: #f8f2f2;
    border: none;
    padding: 4px 8px;
    border-radius: 7px;
    font-size: 18px;
    font-weight: 600;
    cursor: pointer;
    z-index: 100;
    display: block;`;
scrollToBottomBtn.onclick = () => {
  isUserScrolling = false;

  if (renderedEnd < allHistoryMessages.length) {
    messagesDiv.innerHTML = "";
     freezeableMediaRegistry = [];
    renderedStart = Math.max(0, allHistoryMessages.length - BATCH_SIZE);
    renderedEnd = allHistoryMessages.length;

    const topSpacer = document.createElement("div");
    topSpacer.id = "topSpacer";
    topSpacer.style.cssText = `height: ${renderedStart * TOP_SPACER_HEIGHT}px; width: 100%;`;
    messagesDiv.appendChild(topSpacer);

    const topSentinel = document.createElement("div");
    topSentinel.id = "topSentinel";
    topSentinel.style.cssText = "height: 1px; width: 100%;";
    messagesDiv.appendChild(topSentinel);

    const topLoader = document.createElement("div");
    topLoader.id = "topLoader";
    topLoader.style.cssText = "text-align:center; padding:10px; color:#b9bbbe; font-size:13px; display:none;";
    topLoader.innerHTML = `<span style="display:inline-flex;align-items:center;gap:8px;"><span style="width:14px;height:14px;border-radius:50%;border:2px solid #FF0000;border-top-color:transparent;display:inline-block;animation:spin 0.7s linear infinite;"></span>Loading older messages...</span>`;
    messagesDiv.appendChild(topLoader);

    const fragment = document.createDocumentFragment();
    for (let i = renderedStart; i < renderedEnd; i++) {
      const el = buildMessageElement(allHistoryMessages[i], false);
      if (el) {
        el.dataset.msgIndex = i;
        fragment.appendChild(el);
      }
    }
    messagesDiv.appendChild(fragment);

    const bottomSentinel = document.createElement("div");
    bottomSentinel.id = "bottomSentinel";
    bottomSentinel.style.cssText = "height: 1px; width: 100%;";
    messagesDiv.appendChild(bottomSentinel);

    const bottomLoader = document.createElement("div");
    bottomLoader.id = "bottomLoader";
    bottomLoader.style.cssText = "text-align:center; padding:10px; color:#b9bbbe; font-size:13px; display:none;";
    bottomLoader.innerHTML = `<span style="display:inline-flex;align-items:center;gap:8px;"><span style="width:14px;height:14px;border-radius:50%;border:2px solid #FF0000;border-top-color:transparent;display:inline-block;animation:spin 0.7s linear infinite;"></span>Loading newer messages...</span>`;
    messagesDiv.appendChild(bottomLoader);

    setupVirtualScroll();
    setupMessageHoverSeen();
  }

  setTimeout(() => {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    scrollToBottomBtn.style.display = 'none';
  }, 50);
};
document.body.appendChild(scrollToBottomBtn);

const markReadBtn = document.createElement('button');
markReadBtn.id = 'markReadBtn';
markReadBtn.innerHTML = '✓';
markReadBtn.title = 'Mark all as read';
markReadBtn.style.cssText = `
  position: absolute;
  bottom: 80px;
  right: 326px;
  background: rgb(24 24 24);
  color: #f8f2f2;
  border: none;
  padding: 4px 8px;
  border-radius: 7px;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  z-index: 100;
  display: block;
`;
markReadBtn.onclick = () => markAllRead();
document.body.appendChild(markReadBtn);
markReadBtn.style.display = 'none';



function markAllRead() {
  unreadCounts.set(currentChannel, 0);
  updateChannelBadge(currentChannel, 0);
  updateTabBadge();

  if (window.electronAPI) {
    window.electronAPI.updateBadge(
      [...unreadCounts.values()].reduce((a, b) => a + b, 0)
    );
  }

  const messageIds = [];

  allHistoryMessages.forEach(m => {
    if (!m.id) return;
    const seenList = messageSeenBy.get(m.id) || [];
    if (!seenList.some(u => u.userId === user.id)) {
      messageIds.push(m.id);
    }
  });


  document.querySelectorAll('.message').forEach(msg => {
    const messageId = msg.dataset.id;
    if (!messageId) return;
    if (messageIds.includes(messageId)) return;
    const seenList = messageSeenBy.get(messageId) || [];
    if (!seenList.some(u => u.userId === user.id)) {
      messageIds.push(messageId);
    }
  });

  if (messageIds.length === 0) {
    markReadBtn.style.display = 'none';
    return;
  }

  const now = Date.now();
  messageIds.forEach(id => {
    if (!messageSeenBy.has(id)) messageSeenBy.set(id, []);
    const list = messageSeenBy.get(id);
    if (!list.some(u => u.userId === user.id)) {
      list.push({
        userId: user.id,
        username: user.username,
        avatar: user.avatar,
        seenAt: now
      });
    }
  });

  socket.emit("markAllSeen", {
    messageIds,
    userId: user.id,
    username: user.username,
    avatar: user.avatar,
    seenAt: now
  });

  markReadBtn.style.display = 'none';
}

const EMOTES_PER_PAGE = 20;
let emotePickerState = { page: 0, filtered: [] };

function initializePepePicker() {
  const existing = document.getElementById("pepePicker");
  if (existing) existing.remove();

  const pepePicker = document.createElement("div");
  pepePicker.id = "pepePicker";
  pepePicker.style.cssText = `
    position: absolute;
    display: flex;
    flex-direction: column;
    width: 324px;
    max-height: 395px;
    background: #111214;
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.6);
    overflow: hidden;
    z-index: 10005;
    user-select: none;
    -webkit-user-select: none;
  `;

  const header = document.createElement("div");
  header.style.cssText = `
    padding: 8px; flex-shrink: 0;
  `;
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search emotes...";
  searchInput.style.cssText = `
    width: 100%; box-sizing: border-box; padding: 7px 10px;
    background: #1e1f22; border-radius: 6px;
    color: #fff; font-size: 13px; outline: none; transition: border-color 0.15s;
  `;
  searchInput.onfocus = () => searchInput.style.borderColor = "#FF0000";
  searchInput.onblur = () => searchInput.style.borderColor = "#3a3c42";
searchInput.oninput = () => {
    emojiPickerState.page = 0;
    if (searchInput.value.trim() === "") {
      showEmojiCategoriesView();
    } else {
      showEmojiResultsView();
      document.getElementById("emojiBackBtn").style.display = "block";
      renderEmojiPickerGrid(searchInput.value.trim().toLowerCase());
    }
  };
  header.appendChild(searchInput);

  const gridWrap = document.createElement("div");
  gridWrap.id = "pepeGridWrap";
  gridWrap.style.cssText = `
    flex: 1; overflow-y: auto; padding: 8px;
  `;

  const grid = document.createElement("div");
  grid.id = "pepeGrid";
  grid.style.cssText = `
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  `;
  gridWrap.appendChild(grid);

  const footer = document.createElement("div");
  footer.id = "pepeFooter";
  footer.style.cssText = `
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 10px; flex-shrink: 0;
  `;

  const prevBtn = document.createElement("button");
  prevBtn.textContent = "‹ Prev";
  prevBtn.style.cssText = pageBtnStyle();
  prevBtn.onclick = () => {
    if (emotePickerState.page > 0) {
      emotePickerState.page--;
      renderEmotePickerGrid(searchInput.value.trim().toLowerCase());
    }
  };

  const pageLabel = document.createElement("span");
  pageLabel.id = "pepePageLabel";
  pageLabel.style.cssText = "color:#b9bbbe; font-size:11px;";

  const nextBtn = document.createElement("button");
  nextBtn.textContent = "Next ›";
  nextBtn.style.cssText = pageBtnStyle();
  nextBtn.onclick = () => {
    const totalPages = Math.ceil(emotePickerState.filtered.length / EMOTES_PER_PAGE);
    if (emotePickerState.page < totalPages - 1) {
      emotePickerState.page++;
      renderEmotePickerGrid(searchInput.value.trim().toLowerCase());
    }
  };

  footer.appendChild(prevBtn);
  footer.appendChild(pageLabel);
  footer.appendChild(nextBtn);

  pepePicker.appendChild(header);
  pepePicker.appendChild(gridWrap);
  pepePicker.appendChild(footer);
  document.body.appendChild(pepePicker);

  function pageBtnStyle() {
    return `
      background: #1e1f22; border: 0px solid #3a3c42; color: #b9bbbe;
      font-size: 11px; padding: 4px 8px; border-radius: 6px;
      cursor: pointer; transition: background 0.15s, color 0.15s;
    `;
  }

  renderEmotePickerGrid("");

  const pepeBtn = document.getElementById("pepeBtn");
pepeBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const willShow = !pepePicker.classList.contains("show");
  closeAllPickers("pepeBtn");
  pepePicker.classList.toggle("show", willShow);
  pepePicker.style.display = willShow ? "flex" : "none";
  if (willShow) {
    const rect = pepeBtn.getBoundingClientRect();
    pepePicker.style.left = (rect.left - 195) + "px";
    pepePicker.style.bottom = (window.innerHeight - rect.top + 8) + "px";
    searchInput.value = "";
    emotePickerState.page = 0;
    renderEmotePickerGrid("");
    searchInput.focus();
  }
});

  document.addEventListener("click", (e) => {
    if (!pepeBtn.contains(e.target) && !pepePicker.contains(e.target)) {
      pepePicker.classList.remove("show");
      pepePicker.style.display = "none";
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      pepePicker.classList.remove("show");
      pepePicker.style.display = "none";
    }
  });

  pepePicker.style.display = "none";
}

function renderEmotePickerGrid(query) {
  const grid = document.getElementById("pepeGrid");
  const pageLabel = document.getElementById("pepePageLabel");
  const footer = document.getElementById("pepeFooter");
  if (!grid) return;

  emotePickerState.filtered = query
    ? pepeList.filter(f => f.toLowerCase().includes(query))
    : pepeList;

  const totalPages = Math.max(1, Math.ceil(emotePickerState.filtered.length / EMOTES_PER_PAGE));
  if (emotePickerState.page >= totalPages) emotePickerState.page = totalPages - 1;
  if (emotePickerState.page < 0) emotePickerState.page = 0;

  const start = emotePickerState.page * EMOTES_PER_PAGE;
  const pageItems = emotePickerState.filtered.slice(start, start + EMOTES_PER_PAGE);

  grid.innerHTML = "";

  if (pageItems.length === 0) {
    grid.style.display = "block";
    grid.innerHTML = `<div style="color:#72767d; font-size:12px; text-align:center; padding:20px 0;">No emotes found</div>`;
  } else {
    grid.style.display = "grid";
    pageItems.forEach(filename => {
      const item = document.createElement("div");
      item.className = "pepe-item";
      item.style.cssText = `
        position: relative; aspect-ratio: 1; border-radius: 6px;
        background: #1e1f22; display: flex; align-items: center; justify-content: center;
        cursor: pointer; transition: background 0.15s, transform 0.1s;
      `;
      item.onmouseover = () => { item.style.background = "#2a2c31"; item.style.transform = "scale(1.06)"; };
      item.onmouseout = () => { item.style.background = "#1e1f22"; item.style.transform = "scale(1)"; };
      item.title = filename;

      const img = document.createElement("img");
      img.src = `/avatars/${filename}`;
      img.style.cssText = "width:78%; height:78%; object-fit:contain; pointer-events:none;";
      item.appendChild(img);

item.onclick = () => {
        const now = Date.now();
        const isDoubleClick = lastEmoteClick.filename === filename && (now - lastEmoteClick.time) < 350;
        const chatInputEl = document.getElementById("input");

        if (isDoubleClick) {
          const imgs = chatInputEl.querySelectorAll(`img[data-emote-file="${CSS.escape(filename)}"]`);
          const lastImg = imgs[imgs.length - 1];
          if (lastImg) {
            const next = lastImg.nextSibling;
            if (next && next.nodeType === Node.TEXT_NODE && next.textContent === " ") next.remove();
            lastImg.remove();
          }
          lastEmoteClick = { filename: null, time: 0 };
          sendSingleEmote(filename);
          return;
        }

       restoreInputSelection();

        const img2 = document.createElement("img");
        img2.src = `/avatars/${filename}`;
        img2.className = "inline-emote";
        img2.contentEditable = "false";
        img2.dataset.emoteFile = filename;

        const sel = window.getSelection();
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(img2);
        const space = document.createTextNode(" ");
        img2.after(space);
        const after = document.createRange();
        after.setStartAfter(space);
        after.collapse(true);
        sel.removeAllRanges();
        sel.addRange(after);
        savedInputRange = after.cloneRange();

        lastEmoteClick = { filename, time: now };

        item.style.background = "#FF0000";
        setTimeout(() => item.style.background = "#1e1f22", 150);
      };

      grid.appendChild(item);
    });
  }

  pageLabel.textContent = `${emotePickerState.page + 1}/${totalPages} (${emotePickerState.filtered.length})`;
  footer.style.display = emotePickerState.filtered.length > EMOTES_PER_PAGE ? "flex" : "none";
}


function isEmoteUrl(url) {
  return /\/avatars\/[^/]+\.(png|jpe?g|gif|webp)$/i.test(url);
}

let token = localStorage.getItem("chatToken");

const socket = io({
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 30000,
  reconnectionAttempts: Infinity,
  withCredentials: true,
  auth: {
    token: token
  }
});

window.socket = socket;
initBonusAccount(socket);


socket.on("connect_error", (err) => {
  console.error("Socket connect error:", err.message);
  const isAuthFailure = err.message === "Invalid or missing token";

  if (isAuthFailure) {
    localStorage.removeItem("chatToken");
    window.location.href = "/login";
    return;
  }

});


function loadJitsiLibrary() {
  return new Promise((resolve, reject) => {
    if (window.JitsiMeetJS) {
      console.log("Jitsi library already loaded");
      resolve();
      return;
    }

    console.log("Loading Jitsi library from:", JITSI_CONFIG.libJitsiUrl);
    
    const script = document.createElement('script');
    script.src = JITSI_CONFIG.libJitsiUrl;
    script.async = true;
    
    script.onload = () => {
      console.log("Jitsi library loaded successfully");
      resolve();
    };
    
    script.onerror = () => {
      console.error("❌ Failed to load Jitsi library from:", JITSI_CONFIG.libJitsiUrl);
      reject(new Error("Failed to load Jitsi library"));
    };
    
    document.head.appendChild(script);
  });
}


let customRoles = [];
function getRoleById(id) {
  return customRoles.find(r => r.id === id);
}

const pendingRoleOverrides = new Map(); 

function setPendingRoleOverride(userId, roleIds) {
  pendingRoleOverrides.set(userId, [...roleIds]);
  setTimeout(() => pendingRoleOverrides.delete(userId), 8000);
}

socket.on("roleList", (roles) => {
  customRoles = roles || [];
  refreshRoleManagerIfOpen();
});

let serverConfigReceived = false;
socket.on("serverConfig", (data) => {
  JITSI_CONFIG = data.jitsi;
  SERVER_CONFIG = data;
  loadUserBackground();
  serverConfigReceived = true;
  pepeList = data.pepeList || [];
  SERVER_CONFIG.prestigeBadges = data.prestigeBadges || [];
  initializePepePicker();
  initializeEmojiPicker();

  if (data.version) {
    window.APP_VERSION = data.version;
    const versionEl = document.getElementById("version");
    if (versionEl) versionEl.textContent = `v${data.version} alpha`;
    updateTabBadge();
  }

    if (data.serverBanner) {
    applyServerBanner(data.serverBanner);
  }

 
  loadJitsiLibrary()
    .then(() => initJitsi())
    .then(() => {
      console.log("Jitsi ready");
      enableVoiceChannelButtons();
    })
    .catch(err => {
      console.error("❌ Jitsi init failed:", err);
    });
});

socket.on("forceRedirect", (data) => {
  console.log(`DATA URL ${data.url}`)
 window.location.href = data.url;
    

});

socket.on("voiceStateUpdate", (data) => {
  if (data?.userId) {
    voiceStates.set(data.userId, { isMuted: !!data.isMuted, isDeafened: !!data.isDeafened });
    updateVoiceUI();
  }
});

socket.on("voiceStatesSync", (states) => {
  voiceStates.clear();
  Object.keys(states).forEach(id => {
    voiceStates.set(id, states[id]);
  });
  updateVoiceUI();
});


socket.on("userOnline", (data) => {
  triggerUserOnlineNotification(data);
});


socket.on("initialStreams", (data) => {
  if (!data || !data.allStreams) return;
  console.log("📺 Received initial streams from server:", data.allStreams);
  
  cachedLiveStreams = data.allStreams;
  if (document.getElementById('liveStreamsModal').style.display === 'flex') {
    displayStreams(cachedLiveStreams);
  }
});

let liveDurationTimer = null;

function refreshLiveModal() {
  const modal = document.getElementById('liveStreamsModal');
  if (!modal || modal.style.display !== 'flex') return;

  document.querySelectorAll('#streamsList [data-stream-platform]').forEach(card => {
    const platform = card.dataset.streamPlatform;
    const name = card.dataset.streamName;
    const stream = cachedLiveStreams.find(s => s.platform === platform && s.name === name);
    if (!stream) return;

    const durationEl = card.querySelector('.stream-duration');
    if (durationEl) durationEl.textContent = formatStreamDuration(stream.startTime);

    const viewersEl = card.querySelector('.stream-viewers');
    if (viewersEl) viewersEl.textContent = `${stream.viewers || 0} viewers`;
  });
}
socket.on("streamLive", (data) => {
  if (data?.allStreams) cachedLiveStreams = data.allStreams;
  refreshLiveModal();
  handleStreamLiveNotification(data.stream);

  const id = getStreamId(data.stream);
  const win = openEmbedWindows.get(id);
  if (win) win.renderMeta(data.stream);
});


socket.on('kickChatMessage', ({ broadcasterId, payload }) => {
  if (!window.currentEmbedBroadcasterId || broadcasterId !== window.currentEmbedBroadcasterId) return;
  const list = document.querySelector('#embedChatWrap div');
  const entry = [...openEmbedWindows.values()].find(e => e.platform === "kick");
  if (list) appendKickChatMessage(list, payload, entry?.subBadgeUrl);
  const uname = payload?.sender?.username;
  if (uname && entry) {
    entry.uniqueChatters.add(uname.toLowerCase());
    entry.updateChattersBadge();
  }
});


socket.on("streamsUpdate", (data) => {
  if (!data || !data.allStreams) return;
  cachedLiveStreams = data.allStreams;
  refreshLiveModal();
  data.allStreams.forEach(s => {
    const id = getStreamId(s);
    const win = openEmbedWindows.get(id);
    if (win) win.renderMeta(s);
  });
});

socket.on("streamOffline", (data) => {
  if (!data || !data.allStreams) return;
  console.log("⚫ Stream offline:", data.allStreams);
  cachedLiveStreams = data.allStreams;
  handleStreamOfflineNotification(data.stream);
  refreshLiveModal();
});

const liveModalInterval = setInterval(() => {
  const modal = document.getElementById('liveStreamsModal');
  if (modal && modal.style.display === 'flex') {
    refreshLiveStreamsModal();
  }
}, 1000);


socket.on("disconnect", (reason) => {
  console.log("🔴 Socket disconnected:", reason);
  console.log('[DEBUG] disconnected', reason, Date.now())
  showConnectionStatus("reconnecting");
});

socket.on("reconnect_attempt", (attempt) => {
  console.log(`🔄 Reconnection attempt #${attempt}`);
});



socket.on("reconnect_error", (err) => {
  console.error("Reconnect error:", err);
});

socket.on("reconnect_failed", () => {
  console.error("❌ Reconnection failed after all attempts");
  showConnectionStatus("failed");
});


function showConnectionStatus(state) {
  let banner = document.getElementById("connectionBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "connectionBanner";
    banner.classList.add("banner-notification", "stacked-notification");
    banner.style.cssText = `
      position: fixed;
      top: 10px;
      left: 50%;
       transform: translateX(-50%);
      background: #111214;
      border: 1px solid #3a3c42;
      border-left: 3px solid #FF0000;
      color: #fff;
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 13px;
      z-index: 99999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      gap: 10px;
      white-space: nowrap;
    `;

    const logo = document.createElement('img');
    logo.id = "connectionBannerLogo";
    logo.src = '/icon.png';
    logo.style.cssText = 'width: 48px; height: 48px; border-radius: 6px; flex-shrink: 0;';

    const text = document.createElement('span');
    text.id = "connectionBannerText";

    banner.appendChild(logo);
    banner.appendChild(text);
    document.body.appendChild(banner);
  }

  const textEl = banner.querySelector("#connectionBannerText");

  if (state === "reconnecting") {
    banner.style.borderLeftColor = "#f59e0b";
    textEl.innerHTML = `Reconnecting<span style="display:inline-block;animation:dot 1.4s infinite">...</span>`;
  } else if (state === "connected") {
    banner.style.borderLeftColor = "#23a559";
    textEl.textContent = "Connected";
    setTimeout(() => banner.remove(), 1500);
  } else if (state === "failed") {
    banner.style.borderLeftColor = "#ef4444";
    textEl.textContent = "❌ Connection lost, refresh page";
  }
}

function getUser() {
  let saved = localStorage.getItem("chatUser");
  if (!saved) {
    return {
      id: crypto.randomUUID(), 
      sessionToken: null,
      username: "Anonymous #" + Math.floor(Math.random() * 10000),
      avatar: `/avatars/default${Math.floor(Math.random()*9)+1}.png`,
      usernameColor: "username-cyan"
    };
  }
  const user = JSON.parse(saved);

  delete user.level;
  delete user.xp;
  return user;
}

const user = getUser();
window.user = user;

socket.on("prestigeUnlocked", (data) => {
  data.badges.forEach(p => {
    if (!unlockedPrestigeBadges.includes(p.badge)) {
      unlockedPrestigeBadges.push(p.badge);
    }
    
    const toast = document.createElement("div");
    toast.style.cssText = `
      position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
      background: linear-gradient(135deg, #1a1a2e, #313131);
      border: 2px solid #FF0000;
      color: white; padding: 16px 24px; border-radius: 12px;
      font-weight: bold;
      z-index: 10000; display: flex; align-items: center; gap: 12px;
      animation: fadeIn 0.3s ease;
    `;
    toast.innerHTML = `
      <img src="${p.badge}" style="width:40px;height:40px;border-radius:50%;border:2px solid #FF0000">
      <div>
        <div style="font-size:16px;">🏆 Prestige Unlocked!</div>
        <div style="font-size:13px;color:#FF0000;">${p.label} Badge Level ${p.level}</div>
      </div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  });
  
  
  createBadgeSelector();
});
let hasReceivedInitialUserData = false;

socket.on("userData", (data) => {
  if (data.id && data.id !== user.id) return;
console.log('[DEBUG] userData received, id =', data.id, 'at', Date.now());
  const oldLevel = user.level || 1;
    if (typeof window.flushPendingWhisperHistory === 'function') {
    window.flushPendingWhisperHistory();
  }

    if (socket && socket.connected) {
    socket.emit("getWhisperHistory");
  }

  if (data.isDeveloper !== undefined) user.isDeveloper = data.isDeveloper;
  if (data.isPromptEngineer !== undefined) user.isPromptEngineer = data.isPromptEngineer;
  if (data.level !== undefined) user.level = data.level;
  if (data.xp !== undefined) user.xp = data.xp;
  if (data.usernameColor) user.usernameColor = data.usernameColor;
  if (data.badge !== undefined) user.badge = data.badge;
  if (data.banner) user.banner = data.banner;
  if (data.customRoleIds !== undefined) user.customRoleIds = data.customRoleIds;
  if (data.unlockedPrestigeBadges) {
    unlockedPrestigeBadges = data.unlockedPrestigeBadges;
  }
  if (data.isAdmin !== undefined) {
    user.isAdmin = data.isAdmin;
    if (data.isAdmin) {
      const badgeEl = document.querySelector('.user-badge');
      if (badgeEl) {
        badgeEl.textContent = '♛';
        badgeEl.style.fontWeight = 'bold';
      }
      console.log('Admin privileges granted');
    }
  }

  const myIndex = currentUsers.findIndex(u => u && u.id === user.id);
  if (myIndex !== -1) {
    currentUsers[myIndex].level = user.level;
    currentUsers[myIndex].xp = user.xp;
  }

  localStorage.setItem("chatUser", JSON.stringify(user));
  updateCircularLevel();
  renderUsers(currentUsers);
  updateVoiceUI();
  if (!hasReceivedInitialUserData) {
    hasReceivedInitialUserData = true;
    return;
  }

if (data.level && data.level > oldLevel && !window.plinkoOpen) {
  showLevelUpNotification(data.level);
}
});




socket.on("connect", () => {

  

  if (socket.io.engine.readyState === "open" && window.wasConnected) {
    console.log("🔄 This is a RECONNECT");
    currentUsers = [];
    typingUsers.clear();

    if (connection) {
      try { connection.disconnect(); } catch (e) {}
      connection = null;
      window.jitsiInitialized = false;
    }

    const savedRoom = currentVoiceRoom; 
    currentVoiceRoom = null;

    if (savedRoom) {
      const tryRejoin = async () => {
        try {
          if (!window.jitsiInitialized) {
            await initJitsi(15000);
          }
          await joinVoiceChannel(savedRoom);
          console.log("Rejoined voice after reconnect:", savedRoom);
        } catch (err) {
          console.error("❌ Auto-rejoin failed:", err);
        }
      };
      setTimeout(tryRejoin, 1500);
    }
  }

  window.wasConnected = true;
  socket.emit("join", user);
  showConnectionStatus("connected");

  setTimeout(() => {
    if (socket.connected && user?.id) {
      socket.emit("getWhisperHistory");
    }
  }, 500);
});


socket.on("sessionIssued", (data) => {
  if (!data?.id || !data?.sessionToken) return;
  user.id = data.id;
  user.sessionToken = data.sessionToken;
  window.user = user;
  localStorage.setItem("chatUser", JSON.stringify(user));
  console.log("🔐 Session established");
});


socket.on("messageEdited", (data) => {
  const idx = allHistoryMessages.findIndex(m => m.id === data.id);
  let m;
  if (idx !== -1) {
    if (data.type === "text") allHistoryMessages[idx].text = data.text;
    else if (data.type === "embed") allHistoryMessages[idx].embed = data.embed;
    allHistoryMessages[idx].edited = true;
    allHistoryMessages[idx].editedAt = data.editedAt;
    m = allHistoryMessages[idx];
  } else {
    m = data;
  }

  const el = document.querySelector(`[data-id="${data.id}"]`);
  if (!el) return;
  const content = el.querySelector('.content');
  if (!content) return;
  const header = content.firstElementChild;

  while (content.children.length > 1) content.removeChild(content.lastElementChild);

  if (data.type === "embed" && data.embed) {
    content.appendChild(buildEmbedElement(m));
  } else {
    content.appendChild(parseContent(data.text, data.editedAt));
  }

  let editedTag = header.querySelector('.edited-tag');
  if (!editedTag) {
    editedTag = document.createElement('span');
    editedTag.className = 'edited-tag';
    editedTag.style.cssText = 'font-size:10px; color:#72767d; margin-left:4px;';
    editedTag.textContent = '(edited)';
    header.appendChild(editedTag);
  }
});


socket.on("userPropertiesUpdated", (data) => {
  const { userId, properties } = data;
  if (conference && userId !== user.id) {
    const participant = conference.getParticipantById(userId);
    if (participant) {
      if (properties.username) participant.setDisplayName(properties.username);
      if (properties.avatar) participant.setProperty("avatar", properties.avatar);
      if (properties.usernameColor) participant.setProperty("usernameColor", properties.usernameColor);
      if (properties.badge !== undefined) participant.setProperty("badge", properties.badge || "");
      if (properties.customStatus) participant.setProperty("customStatus", properties.customStatus);
      if (properties.level) participant.setProperty("level", String(properties.level));
      if (properties.banner !== undefined) participant.setProperty("banner", properties.banner);
      if (properties.profileHeader !== undefined) participant.setProperty("profileHeader", properties.profileHeader);
    }
  }

   if (userId === user.id) {
    if (properties.isAdmin !== undefined) user.isAdmin = properties.isAdmin;
    if (properties.isDeveloper !== undefined) user.isDeveloper = properties.isDeveloper;
    if (properties.isPromptEngineer !== undefined) user.isPromptEngineer = properties.isPromptEngineer;
    if (properties.level !== undefined) user.level = properties.level;
    localStorage.setItem("chatUser", JSON.stringify(user));
  }


    if (conference) {
    conference.setLocalParticipantProperty("isAdmin", String(user.isAdmin || false));
    conference.setLocalParticipantProperty("isDeveloper", String(user.isDeveloper || false));
    conference.setLocalParticipantProperty("isPromptEngineer", String(user.isPromptEngineer || false));
    conference.setLocalParticipantProperty("level", String(user.level || 1));
    conference.setLocalParticipantProperty("badge", user.badge || "");
    conference.setLocalParticipantProperty("prestigeBadge", user.prestigeBadge || "");
    conference.setLocalParticipantProperty("customRoleId", user.customRoleId || "");
    conference.setLocalParticipantProperty("customRoleIds", JSON.stringify(user.customRoleIds || []));
  }
  

  const userIndex = currentUsers.findIndex(u => u.id === userId);
  if (userIndex !== -1) {
    Object.assign(currentUsers[userIndex], properties);
  }
  
 
  updateVoiceUI();
  renderUsers(currentUsers);
});

socket.on("updateUser", (data) => {
  if (!data?.user?.id) return;
  const target = currentUsers.find(u => u.id === data.user.id);
  if (target) {
    if (data.user.username) target.username = data.user.username;
    if (data.user.avatar) target.avatar = data.user.avatar;
    if (data.user.usernameColor) target.usernameColor = data.user.usernameColor;
    if (data.user.badge !== undefined) target.badge = data.user.badge;
    if (data.user.customStatus !== undefined) target.customStatus = data.user.customStatus;
    if (data.user.banner !== undefined) target.banner = data.user.banner;       
    if (data.user.profileHeader !== undefined) target.profileHeader = data.user.profileHeader; 
  }

  if (data.user.id === user.id) {
    if (data.user.level !== undefined) user.level = data.user.level;
    if (data.user.xp !== undefined) user.xp = data.user.xp;
    if (data.user.usernameColor) user.usernameColor = data.user.usernameColor;
    if (data.user.badge !== undefined) user.badge = data.user.badge;
    if (data.user.customRoleIds !== undefined) user.customRoleIds = data.user.customRoleIds;

    localStorage.setItem("chatUser", JSON.stringify(user));
    updateCircularLevel();
    console.log(`🔄 Self update Level ${user.level} | XP ${user.xp}`);
  }

  if (data.user.level !== undefined){
    target.level = data.user.level;
  }

  renderUsers(currentUsers);

});




function canUseGradientColors() {
  return (user.level || 1) >= 10;
}


function canUseAnimatedColors() {
  return (user.level || 1) >= 25;
}


window.addEventListener('load', async () => {
    const tempClass = user.usernameColor;
    user.usernameColor = tempClass; 
    refreshAllMessageColors();
    renderUsers(currentUsers);
    if (!isCurrentlyMuted) {
      inputField.dataset.placeholder = getInputPlaceholder();
    }
    setTimeout(() => {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }, 500);
});


function editMsg(id, currentText) {
  const el = document.querySelector(`[data-id="${id}"]`);
  if (!el) return;
  const content = el.querySelector('.content');
  const existing = content.querySelector('.edit-input-wrap');
  if (existing) { existing.remove(); return; } 

  const wrap = document.createElement('div');
  wrap.className = 'edit-input-wrap';
  wrap.style.cssText = 'margin-top:4px;';

  const textarea = document.createElement('textarea');
  textarea.value = currentText;
  textarea.style.cssText = `
    width:100%; box-sizing:border-box; background:#1e1f22; color:#fff;
    border:1px solid #3a3c42; border-radius:6px; padding:6px 8px;
    font-size:14px; font-family:inherit; resize:vertical; min-height:40px;
  `;

  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:11px; color:#72767d; margin-top:4px;';
  hint.textContent = 'Escape to cancel • Enter to save';

  wrap.appendChild(textarea);
  wrap.appendChild(hint);
  content.appendChild(wrap);
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  const save = () => {
    const newText = textarea.value.trim();
    if (!newText) { wrap.remove(); return; }
    if (newText !== currentText) {
      socket.emit("editMessage", { id, text: newText });
    }
    wrap.remove();
  };

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      wrap.remove();
    }
  });
}

function updateSeenByUI(messageId) {
  const messageEl = document.querySelector(`[data-id="${messageId}"]`);
  if (!messageEl) return;

  let container = messageEl.querySelector('.seen-by-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'seen-by-container';
    messageEl.appendChild(container);
  }

  container.innerHTML = '';

  const seenUsers = messageSeenBy.get(messageId) || [];

  seenUsers.forEach(u => {
    if (u.userId === user.id) return;

    const img = document.createElement('img');
    img.src = sanitizeAvatar(u.avatar);
    img.className = 'seen-by-avatar';
    const seenTime = u.seenAt ? formatSeenTime(u.seenAt) : "just now";
    img.title = `${u.username} seen this ${seenTime}`;

    container.appendChild(img);
  });

  container.style.display = container.children.length > 0 ? 'flex' : 'none';
}

function refreshSeenTimestamps() {
  document.querySelectorAll('.seen-by-container').forEach(container => {
    const messageEl = container.closest('.message');
    if (messageEl) {
      const messageId = messageEl.dataset.id;
      if (messageId) {
        updateSeenByUI(messageId);
      }
    }
  });
}



function formatSeenTime(ts) {
  if (!ts) return "just now";

  const date = new Date(ts);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  
  if (diffMins < 1) {
    return "just now";
  }

  
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }

  
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

 
  if (diffDays === 1) {
    return "1 day ago";
  }
  if (diffDays < 30) {
    return `${diffDays} days ago`;
  }

  
  const time = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric' 
  }) + ` at ${time}`;
}

function formatTime(ts) {
  const date = new Date(ts);
  const now = new Date();

  const isToday =
    date.toDateString() === now.toDateString();

  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);

  const isYesterday =
    date.toDateString() === yesterday.toDateString();

  const time = date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  if (isToday) return `Today at ${time}`;
  if (isYesterday) return `Yesterday at ${time}`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
  }) + ` at ${time}`;
}



const messagesDiv = document.getElementById("messages");
const input = document.getElementById("input");


document.getElementById("saveNameBtn").onclick = () => {
  const newName = document.getElementById("settingsNameInput").value.trim();
  if (!newName) return;

  user.username = newName;
  localStorage.setItem("chatUser", JSON.stringify(user));

 showToast(`Changed username to ${newName}`);

if (!isCurrentlyMuted) {
    inputField.dataset.placeholder = getInputPlaceholder();
  }

if (conference) {
    conference.setDisplayName(newName);
  }

  if (socket.connected) {
    socket.emit("updateUser", {
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        usernameColor: user.usernameColor,
        badge: user.badge || null,
        level: user.level || 1,
        profileHeader: user.profileHeader,
        prestigeBadge: user.prestigeBadge || null,
      }
    });
  }
};


function wireFreezeableHoverContainer(container) {
  if (!container || container.dataset.hoverWired === "1") return;
  container.dataset.hoverWired = "1";

container.addEventListener("mouseenter", () => {
  container.querySelectorAll('img[data-live-src]').forEach(img => {
    img.dataset.hovering = "1";
    if (img.dataset.liveSrc && img.src !== img.dataset.liveSrc) {
      const preload = new Image();
      preload.onload = () => { img.src = img.dataset.liveSrc; };
      preload.src = img.dataset.liveSrc;
    }
  });
});

container.addEventListener("mouseleave", () => {
    container.querySelectorAll('img[data-live-src]').forEach(img => {
      img.dataset.hovering = "0";
      const excludeFromAutoplay = img.dataset.excludeAutoplay === "1";
      if ((excludeFromAutoplay || img.dataset.autoplay !== "1") && img.dataset.frozenFrame) {
        img.src = img.dataset.frozenFrame;
      }
    });
  });
}

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  
  if (hex.length !== 6) {
    return { r: 0, g: 242, b: 255 }; 
  }
  
  return {
    r: parseInt(hex.substring(0, 2), 16), 
    g: parseInt(hex.substring(2, 4), 16), 
    b: parseInt(hex.substring(4, 6), 16)  
  };
}

function getColorBgWithOpacity(colorClass, opacity = 0.2) {
  const hex = colorClassToHex[colorClass] || '#00f2ff';
  console.log(`Color class: ${colorClass} Hex: ${hex}`);
  const rgb = hexToRgb(hex);
  
  const r = isNaN(rgb.r) ? 0 : rgb.r;
  const g = isNaN(rgb.g) ? 242 : rgb.g;
  const b = isNaN(rgb.b) ? 255 : rgb.b;
  
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

const usersList = document.getElementById("usersList");

function renderUsers(users) {
  const usersList = document.getElementById("usersList");
  const valid = users.filter(u => u);

  const priorityList = [
    { key: "admin", label: "Admin", test: u => u.isAdmin, badge: () => createCrownBadge(14), color: "#f0b232" },
    { key: "developer", label: "Developer", test: u => u.isDeveloper, badge: () => createDeveloperBadge(16), color: "#f25858" },
    { key: "promptEngineer", label: "Prompt Engineer", test: u => u.isPromptEngineer, badge: () => createPromptEngineerBadge(14), color: "#10a37f" },
    ...[...customRoles].reverse().map(r => ({
      key: `role-${r.id}`,
      label: r.name,
      test: u => (u.customRoleIds || []).includes(r.id),
      badge: r.badge ? () => {
        const img = document.createElement('img');
        img.src = `/avatars/${r.badge}`;
        img.style.cssText = 'width:14px; height:14px; object-fit:contain; display:block;';
        return img;
      } : null,
      color: r.color
    })),
    { key: "online", label: "Online", test: () => true, badge: null, color: "#b9bbbe" }
  ];

  const buckets = new Map(priorityList.map(p => [p.key, []]));
  const offline = [];

  valid.forEach(u => {
    if ((u.status || "online") === "offline") { offline.push(u); return; }
    const match = priorityList.find(p => p.test(u));
    buckets.get(match.key).push(u);
  });

  
function rowSignature(u) {
    return [
      u.id, u.username, u.avatar, u.usernameColor, u.status,
      u.level, u.badge, u.prestigeBadge, u.isAdmin, u.isDeveloper,
      u.isPromptEngineer, u.isBot, u.customStatus, u.musicStatus,
      u.banner, u.profileHeader,                    
      (u.customRoleIds || []).join(",")
    ].join("|");
  }

  const existingRows = new Map();
  usersList.querySelectorAll('[data-user-row-id]').forEach(el => {
    existingRows.set(el.dataset.userRowId, el);
  });

  const fragment = document.createDocumentFragment();
  const usedIds = new Set();

  [...priorityList, { key: "offline", label: "Offline", test: null, badge: null, color: "#b9bbbe" }]
    .forEach(section => {
      const list = section.key === "offline" ? offline : buckets.get(section.key);
      if (!list || list.length === 0) return;

      const header = document.createElement("div");
      header.className = "user-section-header";
      header.style.cssText = `
        display: flex; align-items: center; gap: 6px; margin: 14px 0 6px 12px;
        font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px;
        color: ${section.color};
      `;
      if (section.badge) {
        const badgeWrap = document.createElement("span");
        badgeWrap.style.cssText = "display:flex; align-items:center;";
        badgeWrap.appendChild(section.badge());
        header.appendChild(badgeWrap);
      }
      const labelSpan = document.createElement("span");
      const hasLabel = section.label && section.label.trim() !== "";
      labelSpan.textContent = hasLabel ? `${section.label} - ${list.length}` : `${list.length}`;
      header.appendChild(labelSpan);
      fragment.appendChild(header);

      list.forEach(u => {
        const rowId = u.id || u.username;
        usedIds.add(rowId);
        const sig = rowSignature(u);
        const existing = existingRows.get(rowId);

        if (existing && existing.dataset.userRowSig === sig) {
          fragment.appendChild(existing);
        } else {
          const row = buildUserRow(u);
          row.dataset.userRowId = rowId;
          row.dataset.userRowSig = sig;
          fragment.appendChild(row);
        }
      });
    });

  usersList.innerHTML = "";
  usersList.appendChild(fragment);
}

function createBotBadge(size = 16) {
  const wrapper = document.createElement('span');
  wrapper.title = 'Bot';
  wrapper.style.cssText = `
    display: inline-block; vertical-align: middle;
    margin-left: 4px; flex-shrink: 0; cursor: default;
  `;

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.style.cssText = "display:block; pointer-events:none;";
  svg.innerHTML = `
    <rect x="2" y="5" width="12" height="8" rx="2" fill="#5865F2"/>
    <circle cx="5.5" cy="9" r="1.2" fill="white"/>
    <circle cx="10.5" cy="9" r="1.2" fill="white"/>
    <rect x="7" y="1.5" width="2" height="3" fill="#5865F2"/>
  `;

  wrapper.appendChild(svg);
  return wrapper;
}

function buildUserRow(u) {
  const status = u.status || "online";
  const displayStatus = (u.customStatus && u.customStatus.trim() !== "")
    ? u.customStatus
    : status.charAt(0).toUpperCase() + status.slice(1);

  const colorClass = u.usernameColor || "username-cyan";
  const el = document.createElement("div");
  el.className = "user";
el.setAttribute("data-user-row-id", u.id || u.username || "");
  el.style.cursor = "pointer";
  el.setAttribute("data-status", status);
  if (status === "offline") {
    el.classList.add("offline");
  }

const imgElement = document.createElement("img");
imgElement.src = sanitizeAvatar(u.avatar);
imgElement.setAttribute("data-color", colorClass);
imgElement.style.cssText = "width: 40px; height: 40px; border-radius: 50%; display: block;";

const avatarContainer = document.createElement("div");
avatarContainer.style.cssText = "position: relative; width: 40px; height: 40px; flex-shrink: 0;";
avatarContainer.appendChild(imgElement);

const statusDot = document.createElement("span");
statusDot.className = `status-dot status-${status}`;
statusDot.style.cssText = `position: absolute;
    top: 27px;
    left: 26px;
    width: 10px;
    height: 10px;
    border: 2.5px solid #232428;
    border-radius: 50%;
    z-index: 3;`;
  avatarContainer.appendChild(statusDot);

const textContainer = document.createElement("div");
textContainer.style.cssText = "display:flex; flex-direction:column; gap: 1px; margin-left: 4px; flex: 1; min-width: 0;";

  const usernameSpan = document.createElement("span");
  usernameSpan.className = `username-wrapper ${colorClass}`;
  usernameSpan.setAttribute("data-text", u.username);
  usernameSpan.setAttribute("data-user-id", u.id || '');
  usernameSpan.style.cssText = "font-size:15px; position:relative; display:inline-block;";
  usernameSpan.textContent = u.username;

const displayLevel = u.level || 1;
const lvlColor = getLevelColor(displayLevel);
const lvlRgb = getLevelRgb(displayLevel);
const levelSpan = document.createElement("span");
levelSpan.style.cssText = `font-size:11px; color:${lvlColor}; -webkit-text-fill-color:${lvlColor}; background:rgba(${lvlRgb.r},${lvlRgb.g},${lvlRgb.b},0.2); -webkit-background-clip:initial; background-clip:initial; font-weight:700; padding:2px 6px; border-radius:3px; border:1px solid ${lvlColor}; display:inline-block; position:relative;`;
levelSpan.textContent = displayLevel;
usernameSpan.appendChild(levelSpan);

if (u.badge) {
    const badgeImg = createFreezeableBadgeImg(sanitizeAvatar(u.badge), 'user-badge', true);
    usernameSpan.appendChild(badgeImg);
  }

  if (u.prestigeBadge) {
    const pBadge = createFreezeableBadgeImg(sanitizeAvatar(u.prestigeBadge), 'user-badge', true);
    pBadge.title = "Prestige Badge";
    usernameSpan.appendChild(pBadge);
  }

  if (u.isAdmin) {
    usernameSpan.appendChild(createCrownBadge(23));
  }
  if (u.isDeveloper) {
    const w = document.createElement('span');
    w.style.cssText = 'display:inline-block;position:relative;-webkit-text-fill-color:initial;background-clip:initial;-webkit-background-clip:initial;';
    w.appendChild(createDeveloperBadge(18));
    usernameSpan.appendChild(w);
  }
  if (u.isPromptEngineer) {
    const w = document.createElement('span');
    w.style.cssText = 'display:inline-block;position:relative;-webkit-text-fill-color:initial;background-clip:initial;-webkit-background-clip:initial;';
    w.appendChild(createPromptEngineerBadge(18));
    usernameSpan.appendChild(w);
  }

  if (u.isBot) {
  usernameSpan.appendChild(createBotBadge(23));
}

if (u.customRoleIds && u.customRoleIds.length) {
  const cBadge = document.createElement('img');
  cBadge.src = sanitizeAvatar(u.customRoleIds);
  cBadge.className = 'user-badge';
  cBadge.style.cssText = 'width:22px;height:22px;margin-left:4px;vertical-align:middle;border-radius:50%;';
  usernameSpan.appendChild(createRoleTags(u.customRoleIds, true));
}

  textContainer.appendChild(usernameSpan);

const statusSpan = document.createElement("span");
statusSpan.style.cssText = "font-size:12.5px; color:#b9bbbe; display:flex; align-items:center; gap:4px; min-width:0; overflow:hidden;";

if (u.musicStatus) {
  const noteIcon = document.createElement("span");
  noteIcon.textContent = "🎵";
  noteIcon.style.cssText = "font-size:11px; flex-shrink:0;";
  statusSpan.appendChild(noteIcon);

  const musicText = document.createElement("span");
  musicText.style.cssText = "overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0;";
  musicText.textContent = u.musicStatus;
  statusSpan.appendChild(musicText);
} else {
  statusSpan.textContent = displayStatus;
}

textContainer.appendChild(statusSpan);

  el.appendChild(avatarContainer);
  el.appendChild(textContainer);

  el.addEventListener('click', (e) => {
    const rect = el.getBoundingClientRect();
    showProfilePopup(u, rect.right + 10, rect.top + 20);
  });
  wireFreezeableHoverContainer(el);
  return el;
}



let lastActivityTime = Date.now();

let lastActivitySent = 0;

function updateLastActiveOnServer() {
  const now = Date.now();
  if (now - lastActivitySent < 7000) return; 
  console.log(`FULL SENDING`)
  lastActivitySent = now;

  if (socket && socket.connected && user?.id) {
    socket.emit("updateUser", {
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        banner: user.banner || "",
        usernameColor: user.usernameColor,
        badge: user.badge || null,
        status: "online",
        lastActive: now,
        profileHeader: user.profileHeader,
        prestigeBadge: user.prestigeBadge || null,
      }
    });
  }
}


window.addEventListener('load', () => {
  const inputField = document.getElementById("input");
  const messagesDiv = document.getElementById("messages");

  if (!inputField || !messagesDiv) {
    console.warn("Could not find input or messages element");
    return;
  }

if (!isCurrentlyMuted) {
    inputField.dataset.placeholder = getInputPlaceholder();
  }

  const activityEvents = ['mousemove', 'mousedown', 'keydown', 'click', 'scroll', 'touchstart', 'focus'];
  activityEvents.forEach(ev => {
    document.addEventListener(ev, updateLastActiveOnServer, { passive: true });
  });

  inputField.addEventListener('input', updateLastActiveOnServer);

  messagesDiv.addEventListener('mouseover', updateLastActiveOnServer, { passive: true });
  messagesDiv.addEventListener('mouseenter', updateLastActiveOnServer, { passive: true });
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      updateLastActiveOnServer();
    }
  });

  console.log("Activity detection for online status activated");
});



function setBadge(badgeUrl) {
  if (badgeUrl === user.badge) {
    user.badge = null;        
  } else {
    user.badge = badgeUrl;
  }

  localStorage.setItem("chatUser", JSON.stringify(user));
  const myIndex = currentUsers.findIndex(u => u && u.id === user.id);
  if (myIndex !== -1) {
    currentUsers[myIndex].badge = user.badge;
  }
  renderUsers(currentUsers);

  if (conference) {
    conference.setLocalParticipantProperty("usernameColor", user.usernameColor || "username-cyan");
    conference.setLocalParticipantProperty("badge", user.badge || "");
    conference.setLocalParticipantProperty("prestigeBadge", user.prestigeBadge || "");
    conference.setLocalParticipantProperty("isDeveloper", String(user.isDeveloper || false));
    conference.setLocalParticipantProperty("isPromptEngineer", String(user.isPromptEngineer || false));
    conference.setLocalParticipantProperty("isAdmin", String(user.isAdmin || false));
    conference.setLocalParticipantProperty("level", String(user.level || 1));
    conference.setLocalParticipantProperty("avatar", user.avatar || "");
    conference.setLocalParticipantProperty("customRoleIds", JSON.stringify(user.customRoleIds || []));
  }

  if (socket && socket.connected) {
    socket.emit("updateUser", {
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        banner: user.banner || "",
        customStatus: user.customStatus || "",
        usernameColor: user.usernameColor,
        badge: user.badge || null,
        prestigeBadge: user.prestigeBadge || null, 
        level: user.level || 1,
        profileHeader: user.profileHeader
      }
    });
  }

  createBadgeSelector();
 showToast(user.badge ? "Badge applied!" : "Badge removed");
}

    
document.addEventListener('click', (e) => {
  const popup = document.getElementById('userProfilePopup');
  const volumeMenu = document.querySelector('.volume-context-menu');
  
  if (!popup.contains(e.target) && !e.target.closest('.user') && !e.target.closest('.volume-context-menu')) {
    hideProfilePopup();
  }
  
  if (volumeMenu && !volumeMenu.contains(e.target) && !e.target.closest('.voice-participant')) {
    volumeMenu.remove();
  }
});

    
document.addEventListener('keydown', (e) => {
  if (e.key === "Escape") {
    hideProfilePopup();
  }
});;



const uploadBtn = document.getElementById("uploadBtn");
const imageInput = document.getElementById("imageInput");

uploadBtn.onclick = () => imageInput.click();




function parseContent(text, orderKey) {
  if (typeof text !== "string" || text.trim() === "") {
    return document.createElement("div");
  }

  const container = document.createElement("div");
  const urlRegex = /(https?:\/\/[^\s]+)/;
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  

const isEmoteOnlyMessage = parts.every(part => {
    const trimmed = part.trim();
    if (trimmed === "") return true;
    return urlRegex.test(trimmed) && isEmoteUrl(trimmed);
  });

  const emojiOnlyTestRegex = /(\p{Emoji_Presentation}|\p{Extended_Pictographic}|\p{Emoji_Modifier_Base}|\p{Emoji_Modifier})/gu;
  const strippedOfEmojiAndSpace = text.replace(emojiOnlyTestRegex, "").trim();
  const isEmojiOnlyMessage = strippedOfEmojiAndSpace === "" && emojiOnlyTestRegex.test(text);

  parts.forEach(part => {
    if (!part) return;
    if (urlRegex.test(part) && isSafeUrl(part)) {

if (isImageUrl(part)) {
  const img = document.createElement("img");
  img.loading = "lazy";
  const emote = isEmoteUrl(part);
  setupFreezeableMedia(img, part, orderKey, emote, false); 

  if (emote) {
    const emoteSize = isEmoteOnlyMessage ? "62px" : "28px";
    img.style.width = emoteSize;
    img.style.height = emoteSize;
    img.style.objectFit = "contain";
    img.style.verticalAlign = "middle";
    img.style.margin = "0 2px";
    img.style.borderRadius = "0";
    img.style.cursor = "default";
    } else {
      img.style.maxWidth = "300px";
      img.style.borderRadius = "8px";
      img.style.cursor = "zoom-in";
      img.title = "Click to enlarge";
      img.onclick = (e) => { e.stopPropagation(); openImageModal(part); };
    }

        container.appendChild(img);
        return;
      }

      if (isYouTubeUrl(part)) {
        const videoId = extractYouTubeId(part);
        if (videoId) {
          const thumbUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
          const title = document.createElement("a");
          title.href = part;
          title.target = "_blank";
          title.rel = "noopener noreferrer";
          title.textContent = "YouTube Video";

          fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`)
            .then(r => r.json())
            .then(data => {
              if (data.author_name && data.title) {
                title.textContent = `${data.author_name} - ${data.title}`;
                title.title = `Click to watch: ${data.title} by ${data.author_name}`;
              }
            })
            .catch(err => console.error('Failed to fetch embed:', err));

          const thumb = document.createElement("img");
          thumb.src = thumbUrl;
          thumb.style.cssText = `
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: center;
            display: block;
          `;

          const wrapper = document.createElement("div");
          wrapper.style.cssText = `
            display: inline-flex;
            flex-direction: column;
            width: 550px;
            max-width: 100%;
            border-radius: 4px;
            overflow: hidden;
            background: #1e1f22;
            border-left: 4px solid rgb(68 66 66);
            margin: 4px 0;
          `;

          const meta = document.createElement("div");
          meta.style.cssText = `
            padding: 8px 12px 4px;
            display: flex;
            align-items: center;
            gap: 8px;
          `;

          const ytIcon = document.createElement("img");
          ytIcon.src = "https://www.youtube.com/favicon.ico";
          ytIcon.style.cssText = "width:16px; height:16px; border-radius:2px;";

          const ytLabel = document.createElement("span");
          ytLabel.textContent = "YouTube";
          ytLabel.style.cssText = "color:#ff0000; font-size:12px; font-weight:600;";

          meta.appendChild(ytIcon);
          meta.appendChild(ytLabel);

          title.style.cssText = `
            color: #f40000;
            font-size: 14px;
            font-weight: 600;
            padding: 0 12px 8px;
            text-decoration: none;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            display: block;
          `;
          title.onmouseover = () => title.style.textDecoration = "underline";
          title.onmouseout = () => title.style.textDecoration = "none";

          const thumbWrapper = document.createElement("div");
          thumbWrapper.style.cssText = `
            position: relative;
            width: 100%;
            padding-bottom: 56.25%;
            cursor: pointer;
            overflow: hidden;
            background: #1e1f22;
          `;

          const playBtn = document.createElement("div");
          playBtn.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 68px;
            height: 68px;
            background: rgba(0,0,0,0.75);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.15s, transform 0.15s;
            pointer-events: none;
          `;
          playBtn.innerHTML = `<svg width="30" height="30" viewBox="0 0 24 24" fill="white">
            <path d="M8 5v14l11-7z"/>
          </svg>`;

          thumbWrapper.onmouseover = () => {
            playBtn.style.background = "rgba(255,0,0,0.9)";
            playBtn.style.transform = "translate(-50%, -50%) scale(1.1)";
          };
          thumbWrapper.onmouseout = () => {
            playBtn.style.background = "rgba(0,0,0,0.75)";
            playBtn.style.transform = "translate(-50%, -50%) scale(1)";
          };

          thumbWrapper.onclick = () => {
            const iframe = document.createElement("iframe");
            iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
            iframe.allowFullscreen = true;
            iframe.allow = "autoplay; encrypted-media; fullscreen";
            iframe.style.cssText = `
              position: absolute;
              inset: 0;
              width: 100%;
              height: 100%;
              border: none;
              display: block;
            `;

            const unloadBtn = document.createElement("div");
            unloadBtn.style.cssText = `
              position: absolute;
              top: 0px;
              right: 8px;
              background: rgba(0,0,0,0.85);
              color: white;
              border: none;
              border-radius: 4px;
              padding: 4px 8px;
              font-size: 12px;
              font-weight: 600;
              cursor: pointer;
              z-index: 10;
              display: flex;
              align-items: center;
              gap: 4px;
              transition: background 0.15s;
            `;
            unloadBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
            unloadBtn.onmouseover = () => unloadBtn.style.background = "rgba(255,0,0,0.9)";
            unloadBtn.onmouseout = () => unloadBtn.style.background = "rgba(0,0,0,0.85)";

            unloadBtn.onclick = (e) => {
              e.stopPropagation();
              thumbWrapper.innerHTML = "";
              thumbWrapper.appendChild(thumb);
              thumbWrapper.appendChild(playBtn);
              thumbWrapper.onclick = reloadHandler;
            };

            thumbWrapper.innerHTML = "";
            thumbWrapper.appendChild(iframe);
            thumbWrapper.appendChild(unloadBtn);
            thumbWrapper.onclick = null;
          };

          const reloadHandler = thumbWrapper.onclick;
          thumbWrapper.appendChild(thumb);
          thumbWrapper.appendChild(playBtn);

          wrapper.appendChild(meta);
          wrapper.appendChild(title);
          wrapper.appendChild(thumbWrapper);

          container.appendChild(wrapper);
        }
        return;
      }

      const a = document.createElement("a");
      a.href = part;
      a.textContent = part;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.style.color = "#fc0000";

      container.appendChild(a);
      return;
    }

appendTextWithMentionsAndEmoji(part, container, isEmojiOnlyMessage);

    const mdMatch = part.match(/\[([^\]]+)\]\((https?:\/\/[^\s]+)\)/);
    if (mdMatch) {
      const [, label, url] = mdMatch;

      if (isSafeUrl(url)) {
        const a = document.createElement("a");
        a.href = url;
        a.textContent = label;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.style.color = "#00a8fc";

        container.appendChild(a);
        return;
      }
    }

  });

  return container;
}



function scaleEmojiInText(text, isEmojiOnlyMessage = false) {
  const wrapper = document.createElement("span");
  const emojiRegex = /(\p{Emoji_Presentation}|\p{Extended_Pictographic}|\p{Emoji_Modifier_Base}|\p{Emoji_Modifier})/gu;
  let lastIndex = 0;
  let match;

  const emojiFontSize = isEmojiOnlyMessage ? "2.5em" : "1.15em";

  while ((match = emojiRegex.exec(text)) !== null) {
   
    if (match.index > lastIndex) {
      wrapper.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
    }

    const emojiSpan = document.createElement("span");
    emojiSpan.textContent = match[0];
    emojiSpan.style.cssText = `font-size: ${emojiFontSize}; display: inline-block; line-height: 1; vertical-align: middle;`;
    wrapper.appendChild(emojiSpan);

    lastIndex = emojiRegex.lastIndex;
  }


  if (lastIndex < text.length) {
    wrapper.appendChild(document.createTextNode(text.substring(lastIndex)));
  }

  return wrapper;
}

function isYouTubeUrl(url) {
  return url.includes("youtube.com/watch?v=") || url.includes("youtu.be/");
}

function extractYouTubeId(url) {
  try {
    if (url.includes("watch?v=")) {
      return url.split("v=")[1].split("&")[0];
    }
    if (url.includes("youtu.be/")) {
      return url.split("youtu.be/")[1].split("?")[0];
    }
  } catch {
    return null;
  }
  return null;
}




function createSafeText(text) {
  return document.createTextNode(text);
}

function isSafeUrl(url) {
  try {
    const u = new URL(url);
  
    if (u.protocol === 'javascript:' || u.protocol === 'data:') return false;
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function markMessageAsSeen(messageId) {
  if (!messageId || !socket.connected) return;

  if (!messageSeenBy.has(messageId) ||
      !messageSeenBy.get(messageId).some(u => u.userId === user.id)) {
    
    socket.emit("messageSeen", {
      messageId: messageId,
      userId: user.id,
      username: user.username,
      avatar: user.avatar
    });
  }
}

function isImageUrl(url) {
  return (
    /^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(url) ||
    /^https?:\/\/(www\.)?nekos\.moe\/image\/[a-zA-Z0-9]+$/i.test(url)
  );
}

let isUserScrolling = false;

function isAtBottom() {
  const scrollHeight = messagesDiv.scrollHeight;
  const clientHeight = messagesDiv.clientHeight;
  const currentScrollTop = messagesDiv.scrollTop;
  return Math.abs(scrollHeight - clientHeight - currentScrollTop) < 50;
}

messagesDiv.addEventListener('scroll', () => {
  isUserScrolling = !isAtBottom();
  scrollToBottomBtn.style.display = isUserScrolling ? 'block' : 'none';
});

function autoScrollToBottom() {
  if (!isUserScrolling && renderedEnd >= allHistoryMessages.length) {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
}


function buildMessageElement(m, shouldNotify = false) {
  if (!m) return null;

  const el = document.createElement("div");
  el.className = "message";
  el.dataset.id = m.id || "";
  el.dataset.sender = m.userId || "";

  let isMentioned = false;
  if (typeof m.text === "string" && m.text.trim() !== "") {
 const escapedUsername = user.username.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentionRegex = new RegExp(`@(?:\\[${escapedUsername}\\]|${escapedUsername}(?:\\s|$|[^\\w#]))`, 'i');
isMentioned = mentionRegex.test(m.text) || /@room\b/i.test(m.text) || /@\[room\]/i.test(m.text);
  }

  if (isMentioned || m.isRoomMention) {
    el.style.background = "rgba(255, 0, 0, 0.2)";
    el.style.borderLeft = "4px solid #FF0000";
    el.style.borderRadius = "8px";
  }

  if ((isMentioned || m.isRoomMention) && shouldNotify && m.userId !== user.id) {
    if (notifSettings.browser && Notification.permission === "granted") {
      const notifBody = getNotificationBody(m);
      sendNotification(`Mentioned by ${m.username}`, notifBody, {
        icon: sanitizeAvatar(m.avatar),
        requireInteraction: false
      });
    }
    if (notifSettings.sound) {
      const audio = new Audio('/sounds/message-new-email.oga');
      audio.volume = 0.5;
      audio.play().catch(() => {});
    }
  }

  const img = document.createElement("img");
  img.src = sanitizeAvatar(m.avatar);
  img.className = "pfp";
  const colorClass = m.usernameColor || "username-cyan";
  img.setAttribute("data-color", colorClass);

  const content = document.createElement("div");
  content.className = "content";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.gap = "8px";

  const usernameWrapper = document.createElement("span");
  usernameWrapper.className = "username-wrapper";
  usernameWrapper.classList.add(colorClass);
  usernameWrapper.setAttribute("data-user-id", m.userId || "");

  if (colorClass.includes('rainbow') || colorClass.includes('fire')) {
    usernameWrapper.classList.add('username-rainbow');
  } else if (colorClass.includes('neon')) {
    usernameWrapper.classList.add('username-neon');
  } else if (colorClass.includes('shimmer')) {
    usernameWrapper.classList.add('username-shimmer');
  } else if (colorClass.includes('glitch')) {
    usernameWrapper.classList.add('username-glitch');
    usernameWrapper.setAttribute('data-text', m.username || 'Unknown');
  } else if (colorClass.includes('electric')) {
    usernameWrapper.classList.add('username-electric');
  } else if (colorClass.includes('matrix')) {
    usernameWrapper.classList.add('username-matrix');
  } else if (colorClass.includes('ghost')) {
    usernameWrapper.classList.add('username-ghost');
  } else if (colorClass.includes('hellfire')) {
    usernameWrapper.classList.add('username-hellfire');
  }

  usernameWrapper.textContent = m.username || "Unknown";

  const badgeColor = colorClassToHex[colorClass] || '#00f2ff';
  const rgbColor = hexToRgb(badgeColor);

if (m.level) {
  const displayLevel = m.level;
  const lvlColor = getLevelColor(displayLevel);
  const lvlRgb = getLevelRgb(displayLevel);
  const levelSpan = document.createElement('span');
  levelSpan.style.cssText = `font-size:11px; color:${lvlColor}; -webkit-text-fill-color:${lvlColor}; background:rgba(${lvlRgb.r},${lvlRgb.g},${lvlRgb.b},0.2); -webkit-background-clip:initial; background-clip:initial; font-weight:700; padding:2px 6px; border-radius:4px; border:1px solid ${lvlColor}; margin-left:4px; display:inline-block; position:relative;`;
  levelSpan.textContent = displayLevel;
  usernameWrapper.appendChild(levelSpan);
} else {
 
  const displayLevel = 1;
  const lvlColor = getLevelColor(displayLevel);
  const lvlRgb = getLevelRgb(displayLevel);
  const levelSpan = document.createElement('span');
  levelSpan.style.cssText = `font-size:11px; color:${lvlColor}; -webkit-text-fill-color:${lvlColor}; background:rgba(${lvlRgb.r},${lvlRgb.g},${lvlRgb.b},0.2); -webkit-background-clip:initial; background-clip:initial; font-weight:700; padding:2px 6px; border-radius:4px; border:1px solid ${lvlColor}; margin-left:4px; display:inline-block; position:relative;`;
  levelSpan.textContent = displayLevel;
  usernameWrapper.appendChild(levelSpan);
}
if (m.badge) {
  const badgeImg = createFreezeableBadgeImg(sanitizeAvatar(m.badge));
  badgeImg.title = 'Badge';
  usernameWrapper.appendChild(badgeImg);
}
if (m.prestigeBadge) {
  const pBadge = createFreezeableBadgeImg(sanitizeAvatar(m.prestigeBadge));
  pBadge.title = 'Prestige Badge';
  usernameWrapper.appendChild(pBadge);
}
  if (m.isAdmin) usernameWrapper.appendChild(createCrownBadge(23));
  if (m.isDeveloper) {
    const w = document.createElement('span');
    w.style.cssText = 'display:inline-block;position:relative;-webkit-text-fill-color:initial;background-clip:initial;-webkit-background-clip:initial;';
    w.appendChild(createDeveloperBadge(23));
    usernameWrapper.appendChild(w);
  }
  if (m.isPromptEngineer) {
    const w = document.createElement('span');
    w.style.cssText = 'display:inline-block;position:relative;-webkit-text-fill-color:initial;background-clip:initial;-webkit-background-clip:initial;';
    w.appendChild(createPromptEngineerBadge(23));
    usernameWrapper.appendChild(w);
  }


    if (m.isBot) {
    const w = document.createElement('span');
    w.style.cssText = 'display:inline-block;position:relative;-webkit-text-fill-color:initial;background-clip:initial;-webkit-background-clip:initial;';
    w.appendChild(createBotBadge(23));
    usernameWrapper.appendChild(w);
  }


if (m.customRoleIds && m.customRoleIds.length) {
  const cBadge = document.createElement('img');
  cBadge.src = sanitizeAvatar(m.customRoleIds);
  cBadge.className = 'user-badge';
  cBadge.style.cssText = 'width:22px;height:22px;margin-left:4px;vertical-align:middle;border-radius:50%;';
  usernameWrapper.appendChild(createRoleTags(m.customRoleIds));
}

const timeEl = document.createElement("span");
timeEl.textContent = formatTime(m.time);
timeEl.style.fontSize = "11px";
timeEl.style.color = "#b9bbbe";
timeEl.style.opacity = "0.7";

header.appendChild(usernameWrapper);
header.appendChild(timeEl);
content.appendChild(header);

if (m.type === "embed" && m.embed) {
  content.appendChild(buildEmbedElement(m));
} else if (m.type === "image" && typeof m.text === "string" && m.text.trim() !== "") {
    const image = document.createElement("img");
    setupFreezeableMedia(image, m.text, m.time);
    image.style.maxWidth = "300px";
    image.style.borderRadius = "8px";
    image.style.cursor = "zoom-in";
    image.title = "Click to enlarge";
    image.addEventListener('load', () => autoScrollToBottom(), { once: true });
    image.onclick = (e) => { e.stopPropagation(); openImageModal(m.text); };
    content.appendChild(image);


    } else if (m.type === "file" && typeof m.text === "string" && m.text.trim() !== "") {
  const fileCard = document.createElement("div");
  fileCard.style.cssText = `
    display:flex; align-items:center; gap:10px;
    background:rgba(0, 0, 0, 0.9); border-radius:8px;
    padding:10px 12px; max-width:320px;
  `;

  const icon = document.createElement("span");
  icon.textContent = "📄";
  icon.style.cssText = "font-size:22px; flex-shrink:0;";

  const info = document.createElement("div");
  info.style.cssText = "flex:1; min-width:0; display:flex; flex-direction:column;";

  const nameEl = document.createElement("span");
  nameEl.textContent = m.fileName || m.text.split('/').pop();
  nameEl.style.cssText = "color:#fff; font-size:13px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";

  const subEl = document.createElement("span");
  subEl.textContent = "Text file";
  subEl.style.cssText = "color:#72767d; font-size:11px;";
  info.appendChild(nameEl);
  info.appendChild(subEl);


  fileCard.appendChild(icon);
  fileCard.appendChild(info);
  content.appendChild(fileCard);


 } else if (m.type === "audio" && typeof m.text === "string" && m.text.trim() !== "") {
  content.appendChild(buildAudioPlayer(m.text, m.fileName));

  } else if (m.type === "video" && typeof m.text === "string" && m.text.trim() !== "") {
    const videoContainer = document.createElement("div");
    videoContainer.style.maxWidth = "505px";
    const videoEl = document.createElement("video");
    videoEl.src = m.text;
    videoEl.controls = true;
    videoEl.style.maxWidth = "100%";
    videoEl.style.borderRadius = "8px";
    videoEl.style.backgroundColor = "#000";
    videoEl.autoplay = false;
    videoEl.preload = "none";
    videoEl.setAttribute("playsinline", "");
    videoContainer.appendChild(videoEl);
    content.appendChild(videoContainer);

  } else if (m.type === "screen" && typeof m.text === "string") {
    const screenDiv = document.createElement("div");
    screenDiv.style.cssText = "position:relative; display:inline-block; margin:8px 0;";
    const label = document.createElement("div");
    label.textContent = `🖥️ Screen Share`;
    label.style.cssText = "color:#FF0000; font-size:12px; margin-bottom:4px; font-weight:600;";
    const sImg = document.createElement("img");
    sImg.src = m.text;
    sImg.style.cssText = "max-width:600px; border-radius:8px; border:2px solid #FF0000; cursor:zoom-in;";
    sImg.onclick = () => openImageModal(m.text);
    screenDiv.appendChild(label);
    screenDiv.appendChild(sImg);
    content.appendChild(screenDiv);

  } else if (m.encrypted && m.encPayload) {
  const lockedSpan = document.createElement("div");
  lockedSpan.className = "msg-body";
  lockedSpan.style.cssText = "color:#72767d; font-style:italic;";
  lockedSpan.textContent = activeEncryptionKey ? "🔓 Decrypting..." : "🔒 Encrypted (enter this messages password in settings)";
  content.appendChild(lockedSpan);

  if (activeEncryptionKey) {
decryptText(m.encPayload).then(plain => {
  if (plain !== null) lockedSpan.replaceWith(parseContent(plain, m.time));
  else lockedSpan.textContent = "🔒 Wrong password for this message";
});
  }

} else if (typeof m.text === "string" && m.text.trim() !== "") {
    content.appendChild(parseContent(m.text, m.time));
}

  el.appendChild(img);
  el.appendChild(content);

if (m.userId === user.id || user.isAdmin || user.isDeveloper) {
    const actions = document.createElement("div");
    actions.className = "actions";

  
    const isEditable = m.userId === user.id
    && m.type === "text"
    && !m.encrypted
    && typeof m.text === "string";

    if (isEditable) {
      const editBtn = document.createElement("button");
      editBtn.className = "btn";
      editBtn.textContent = "✎";
      editBtn.title = "Edit message";
      editBtn.onclick = () => editMsg(m.id, m.text);
      actions.appendChild(editBtn);
    }

    const isDownloadable = (m.type === "image" || m.type === "video" || m.type === "screen" || m.type === "file" || m.type === "audio")
      && typeof m.text === "string"
      && m.text.trim() !== "";

    if (isDownloadable) {
      const dlBtn = document.createElement("button");
      dlBtn.className = "btn";
      dlBtn.title = "Download";
      dlBtn.innerHTML = `<svg width="11" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/></svg>`;
      dlBtn.onclick = () => downloadMedia(m.text);
      actions.appendChild(dlBtn);
    }

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn";
    deleteBtn.textContent = "✕";
    deleteBtn.onclick = () => deleteMsg(m.id);
    actions.appendChild(deleteBtn);
    el.appendChild(actions);
  }
  const seenContainer = document.createElement('div');
  seenContainer.className = 'seen-by-container';
  el.appendChild(seenContainer);

  if (messageSeenBy.has(m.id)) {
    updateSeenByUI(m.id);
    setTimeout(refreshSeenTimestamps, 100);
  }
  wireFreezeableHoverContainer(el);
  return el;
}

function getNotificationBody(m) {
  if (m.encrypted) return "🔒 Encrypted message";
  if (m.type === "image") {
    return isEmoteUrl(m.text) ? "📷 Sent an emote" : "🖼️ Sent an image";
  }
  if (m.type === "audio") {
    return "🎶 Sent an audio file"; 
  }
  if (m.type === "file") {
    return "📄 Sent a text file"; 
  }
  if (m.type === "text") {
    return isEmoteUrl(m.text) ? "📷 Sent an emote" : "📄 Sent a text file";
  }
  if (m.type === "video") return "🎬 Sent a video";
  if (m.type === "embed") return m.embed?.title || "Sent an embed";
  if (typeof m.text === "string") {
    const trimmed = m.text.trim();
    if (isSafeUrl(trimmed) && isImageUrl(trimmed)) {
      return isEmoteUrl(trimmed) ? "📷 Sent an emote" : "🖼️ Sent an image";
    }
    return m.text.substring(0, 100);
  }
  return "New message";
}


function getEmoteOrImageUrlFromMessage(m) {
  if (m.encrypted) return null;
  if (m.type === "image" && typeof m.text === "string") return m.text;
  if (typeof m.text === "string") {
    const trimmed = m.text.trim();
    if (isSafeUrl(trimmed) && isImageUrl(trimmed)) return trimmed;
  }
  return null;
}

function addMessage(m, shouldNotify = false) {
  const isMentioned = checkIfMentioned(m.text);
  const notifyFlag = isMentioned ? false : shouldNotify;
  const el = buildMessageElement(m, notifyFlag);
  if (!el) return;
  el.dataset.msgIndex = allHistoryMessages.length - 1;

  const bottomSentinel = document.getElementById("bottomSentinel");
  if (bottomSentinel) {
    bottomSentinel.before(el);
  } else {
    messagesDiv.appendChild(el);
  }

  setupMessageHoverSeen();
  autoScrollToBottom();
}


function checkIfMentioned(text) {
  if (typeof text !== "string" || text.trim() === "") return false;
  
  const escapedUsername = user.username.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mentionRegex = new RegExp(`@(?:\\[${escapedUsername}\\]|${escapedUsername}(?:\\s|$|[^\\w#]))`, 'i');
  
  return mentionRegex.test(text) || /@room\b/i.test(text) || /@\[room\]/i.test(text);
}


function setupMessageHoverSeen() {
  const messages = document.querySelectorAll('.message');
  messages.forEach(msg => {
    const messageId = msg.dataset.id;
    if (!messageId) return;
    msg.removeEventListener('mouseenter', msg._seenHandler);

    msg._seenHandler = () => {
      const seenList = messageSeenBy.get(messageId) || [];
      const alreadySeen = seenList.some(u => u.userId === user.id);
      if (!alreadySeen) {
        markMessageAsSeen(messageId);
      }
    };

    msg.addEventListener('mouseenter', msg._seenHandler);
  });
}

function deleteMsg(id) {
  socket.emit("delete", { id });
}

const MAX_AUTOPLAY_MEDIA = 3;
let freezeableMediaRegistry = []; 

let freezeableMediaCounter = 0;

let autoplayRecomputePending = false;

function registerFreezeableMedia(img) {
  freezeableMediaRegistry = freezeableMediaRegistry.filter(
    existing => existing.isConnected
  );
  freezeableMediaRegistry.push(img);

  if (autoplayRecomputePending) return;
  autoplayRecomputePending = true;
  requestAnimationFrame(() => {
    autoplayRecomputePending = false;
    updateAutoplaySet();
  });
}

function unregisterFreezeableMedia(img) {
  const idx = freezeableMediaRegistry.indexOf(img);
  if (idx !== -1) freezeableMediaRegistry.splice(idx, 1);
}

function updateAutoplaySet() {
  freezeableMediaRegistry = freezeableMediaRegistry.filter(img => img.isConnected);
  const eligible = freezeableMediaRegistry.filter(img => img.dataset.excludeAutoplay !== "1");
  const sorted = [...eligible].sort((a, b) => {
    const av = Number(a.dataset.seq);
    const bv = Number(b.dataset.seq);
    if (av !== bv) return (isNaN(av) ? 0 : av) - (isNaN(bv) ? 0 : bv);
    const ac = Number(a.dataset.seqCounter) || 0;
    const bc = Number(b.dataset.seqCounter) || 0;
    return ac - bc;
  });

  const total = sorted.length;
  sorted.forEach((img, i) => {
    const isInLastN = i >= total - MAX_AUTOPLAY_MEDIA;
    img.dataset.autoplay = isInLastN ? "1" : "0";
    if (img.dataset.hovering === "1") return;
    if (!img.dataset.frozenFrame) return;
    img.src = isInLastN ? img.dataset.liveSrc : img.dataset.frozenFrame;
  });


freezeableMediaRegistry.forEach(img => {
    if (img.dataset.excludeAutoplay !== "1") return;
    img.dataset.autoplay = "0";
    if (img.dataset.hovering === "1") return;
    if (img.dataset.frozenFrame && img.src !== img.dataset.frozenFrame) {
      img.src = img.dataset.frozenFrame;
    }
  });
}


const BATCH_SIZE = 10;
const UNLOAD_THRESHOLD = 30;
let allHistoryMessages = [];
let renderedStart = 0; 
let renderedEnd = 0;  

const TOP_SPACER_HEIGHT = 60;

socket.on("history", (data) => {
  if (data.channel && data.channel !== currentChannel) return;
  messagesDiv.innerHTML = "";
  freezeableMediaRegistry = [];
  messageSeenBy.clear();
  allHistoryMessages = [];
  renderedStart = 0;
  renderedEnd = 0;

  data.messages.forEach(m => {
    if (m.seenBy && Array.isArray(m.seenBy)) {
      messageSeenBy.set(m.id, m.seenBy);
    }
    allHistoryMessages.push(m);
  });

  renderInitialBatch();
  isInitialLoad = false;

  if (activeEncryptionKey) redecryptVisibleMessages();

  setTimeout(() => {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }, 100);
});

function renderInitialBatch() {
  messagesDiv.innerHTML = "";
  freezeableMediaRegistry = [];

  const total = allHistoryMessages.length;
  renderedStart = Math.max(0, total - BATCH_SIZE);
  renderedEnd = total;
  const topSpacer = document.createElement("div");
  topSpacer.id = "topSpacer";
  topSpacer.style.cssText = `height: ${renderedStart * TOP_SPACER_HEIGHT}px; width: 100%;`;
  messagesDiv.appendChild(topSpacer);
  const topSentinel = document.createElement("div");
  topSentinel.id = "topSentinel";
  topSentinel.style.cssText = "height: 1px; width: 100%;";
  messagesDiv.appendChild(topSentinel);
  const topLoader = document.createElement("div");
  topLoader.id = "topLoader";
  topLoader.style.cssText = "text-align:center; padding:10px; color:#b9bbbe; font-size:13px; display:none;";
  topLoader.innerHTML = `<span style="display:inline-flex;align-items:center;gap:8px;"><span style="width:14px;height:14px;border-radius:50%;border:2px solid #FF0000;border-top-color:transparent;display:inline-block;animation:spin 0.7s linear infinite;"></span>Loading older messages...</span>`;
  messagesDiv.appendChild(topLoader);
  const fragment = document.createDocumentFragment();
  for (let i = renderedStart; i < renderedEnd; i++) {
    const el = buildMessageElement(allHistoryMessages[i], false);
    if (el) {
      el.dataset.msgIndex = i;
      fragment.appendChild(el);
    }
  }
  messagesDiv.appendChild(fragment);
  const bottomSentinel = document.createElement("div");
  bottomSentinel.id = "bottomSentinel";
  bottomSentinel.style.cssText = "height: 1px; width: 100%;";
  messagesDiv.appendChild(bottomSentinel);
  const bottomLoader = document.createElement("div");
  bottomLoader.id = "bottomLoader";
  bottomLoader.style.cssText = "text-align:center; padding:10px; color:#b9bbbe; font-size:13px; display:none;";
  bottomLoader.innerHTML = `<span style="display:inline-flex;align-items:center;gap:8px;"><span style="width:14px;height:14px;border-radius:50%;border:2px solid #FF0000;border-top-color:transparent;display:inline-block;animation:spin 0.7s linear infinite;"></span>Loading newer messages...</span>`;
  messagesDiv.appendChild(bottomLoader);

  if (!document.getElementById("spinStyle")) {
    const style = document.createElement("style");
    style.id = "spinStyle";
    style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
  }

  setupVirtualScroll();
  setupMessageHoverSeen();
}
let topObserver = null;
let bottomObserver = null;



let pauseTimer = null;
messagesDiv.addEventListener('scroll', () => {
  if (pauseTimer) return;
  pauseTimer = setTimeout(() => {
    pauseOffscreenMedia();
    pauseTimer = null;
  }, 150);
}, { passive: true });



let isLoadingTop = false;
let isLoadingBottom = false;

function loadMoreTop() {
  if (isLoadingTop) return;
  if (renderedStart <= 0) return;
  const topSentinel = document.getElementById("topSentinel");
  const topSpacer = document.getElementById("topSpacer");
  const topLoader = document.getElementById("topLoader");
  if (!topSentinel || !topSpacer || !topLoader) return;

  isLoadingTop = true;
  messagesDiv.style.overflowY = "hidden";
  topLoader.style.display = "block";

  const newStart = Math.max(0, renderedStart - BATCH_SIZE);
  const batch = allHistoryMessages.slice(newStart, renderedStart);

  if (batch.length === 0) {
    topLoader.style.display = "none";
    messagesDiv.style.overflowY = "scroll";
    isLoadingTop = false;
    return;
  }

  const prevHeight = messagesDiv.scrollHeight;
  const prevScroll = messagesDiv.scrollTop;

  const fragment = document.createDocumentFragment();
  batch.forEach((m, i) => {
    const el = buildMessageElement(m, false);
    if (el) {
      el.dataset.msgIndex = newStart + i;
      fragment.appendChild(el);
    }
  });
  topLoader.after(fragment);

  renderedStart = newStart;
  topSpacer.style.height = `${renderedStart * TOP_SPACER_HEIGHT}px`;
  messagesDiv.scrollTop = prevScroll + (messagesDiv.scrollHeight - prevHeight);

  const totalRendered = renderedEnd - renderedStart;
  if (totalRendered > UNLOAD_THRESHOLD) {
    const removeCount = totalRendered - UNLOAD_THRESHOLD;
    for (let i = 0; i < removeCount; i++) {
      const idx = renderedEnd - 1 - i;
      const el = messagesDiv.querySelector(`[data-msg-index="${idx}"]`);
      if (el) el.remove();
    }
    renderedEnd -= removeCount;
  }

  setupMessageHoverSeen();
  topLoader.style.display = "none";
  messagesDiv.style.overflowY = "scroll";
  isLoadingTop = false;
}

function loadMoreBottom() {
  if (isLoadingBottom) return;
  if (renderedEnd >= allHistoryMessages.length) return;
  const bottomSentinel = document.getElementById("bottomSentinel");
  const bottomLoader = document.getElementById("bottomLoader");
  const topSpacer = document.getElementById("topSpacer");
  if (!bottomSentinel || !bottomLoader || !topSpacer) return;

  isLoadingBottom = true;
  messagesDiv.style.overflowY = "hidden";
  bottomLoader.style.display = "block";

  const newEnd = Math.min(allHistoryMessages.length, renderedEnd + BATCH_SIZE);
  const batch = allHistoryMessages.slice(renderedEnd, newEnd);

  if (batch.length === 0) {
    bottomLoader.style.display = "none";
    messagesDiv.style.overflowY = "scroll";
    isLoadingBottom = false;
    return;
  }

  const fragment = document.createDocumentFragment();
  batch.forEach((m, i) => {
    const el = buildMessageElement(m, false);
    if (el) {
      el.dataset.msgIndex = renderedEnd + i;
      fragment.appendChild(el);
    }
  });
  bottomSentinel.before(fragment);
  renderedEnd = newEnd;

  const totalRendered = renderedEnd - renderedStart;
  if (totalRendered > UNLOAD_THRESHOLD) {
    const removeCount = totalRendered - UNLOAD_THRESHOLD;
    const prevHeight = messagesDiv.scrollHeight;
    const prevScroll = messagesDiv.scrollTop;
    for (let i = 0; i < removeCount; i++) {
      const idx = renderedStart + i;
      const el = messagesDiv.querySelector(`[data-msg-index="${idx}"]`);
      if (el) el.remove();
    }
    renderedStart += removeCount;
    topSpacer.style.height = `${renderedStart * TOP_SPACER_HEIGHT}px`;
    messagesDiv.scrollTop = prevScroll - (prevHeight - messagesDiv.scrollHeight);
  }

  setupMessageHoverSeen();
  bottomLoader.style.display = "none";
  messagesDiv.style.overflowY = "scroll";
  isLoadingBottom = false;
}


function getEmoteCode(filename) {
  return `:${filename.replace(/\.[^/.]+$/, "")}:`;
}

function expandEmoteCodes(text) {
  return text.replace(/:([a-zA-Z0-9_-]+):/g, (match, name) => {
    const found = pepeList.find(
      f => f.replace(/\.[^/.]+$/, "").toLowerCase() === name.toLowerCase()
    );
    return found ? `${window.location.origin}/avatars/${found}` : match;
  });
}

function setupVirtualScroll() {
  if (topObserver) { topObserver.disconnect(); topObserver = null; }
  if (bottomObserver) { bottomObserver.disconnect(); bottomObserver = null; }
  if (virtualScrollHandler) {
    messagesDiv.removeEventListener('scroll', virtualScrollHandler);
    virtualScrollHandler = null;
  }

  const topSentinel = document.getElementById("topSentinel");
  const bottomSentinel = document.getElementById("bottomSentinel");
  if (!topSentinel || !bottomSentinel) return;

  topObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) loadMoreTop();
  }, { root: messagesDiv, rootMargin: "200px" });

  bottomObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) loadMoreBottom();
  }, { root: messagesDiv, rootMargin: "200px" });

  topObserver.observe(topSentinel);
  bottomObserver.observe(bottomSentinel);

  virtualScrollHandler = () => {
    if (messagesDiv.scrollTop < 300) loadMoreTop();
    const distFromBottom = messagesDiv.scrollHeight - messagesDiv.scrollTop - messagesDiv.clientHeight;
    if (distFromBottom < 300) loadMoreBottom();
  };
  messagesDiv.addEventListener('scroll', virtualScrollHandler, { passive: true });
}


socket.on("unreadMessages", (data) => {
  const { unreadByChannel } = data;
  console.log("📬 Unseen messages:", unreadByChannel);
  Object.entries(unreadByChannel).forEach(([channel, count]) => {
    unreadCounts.set(channel, count);
    updateChannelBadge(channel, count);
  });
});



socket.on("onlineUsers", (users) => {
  currentUsers = users || [];
  pendingRoleOverrides.forEach((roleIds, uid) => {
    const u = currentUsers.find(x => x && x.id === uid);
    if (u) u.customRoleIds = roleIds;
  });
  renderUsers(currentUsers);
  refreshRoleManagerIfOpen();
});

socket.on("messageSeen", (data) => {
  const { messageId, userId, username, avatar, seenAt } = data;
  if (messageSeenBy.size > 500) {
    const firstKey = messageSeenBy.keys().next().value;
    messageSeenBy.delete(firstKey);
  }
  if (!messageSeenBy.has(messageId)) messageSeenBy.set(messageId, []);
  const list = messageSeenBy.get(messageId);
  if (!list.some(u => u.userId === userId)) {
    list.push({ userId, username, avatar, seenAt: seenAt || Date.now() });
    updateSeenByUI(messageId);
  }
});

socket.on("typing", (data) => {
  if (data.userId !== user.id) {
    clearTimeout(typingUsers.get(data.userId)?.timeout);
    typingUsers.set(data.userId, {
      username: data.username,
      avatar: data.avatar || '/avatars/default1.png',
      usernameColor: data.usernameColor || 'username-cyan',
      timeout: setTimeout(() => {
        typingUsers.delete(data.userId);
        updateTypingIndicator();
      }, 4000)
    });
    updateTypingIndicator();
  }
});

socket.on("stopTyping", (data) => {
  if (typingUsers.has(data.userId)) {
    clearTimeout(typingUsers.get(data.userId).timeout);
    typingUsers.delete(data.userId);
    updateTypingIndicator();
  }
});

socket.on("delete", (data) => {
  const el = document.querySelector(`[data-id="${data.id}"]`);
  if (el) {
    el.querySelectorAll('img[data-live-src]').forEach(img => unregisterFreezeableMedia(img));
    el.remove();
  }
  const idx = allHistoryMessages.findIndex(m => m.id === data.id);
  if (idx !== -1) allHistoryMessages.splice(idx, 1);

  updateAutoplaySet();
});

socket.on("clear", () => {
  messagesDiv.innerHTML = "";
  messageSeenBy.clear();
});

socket.on("cooldown", (data) => {
  startCooldown(data.remaining);
});

socket.on("youAreMuted", (data) => {
  lockChatInput(data.muted);
  if (data.message)showToast(data.message);
});



function appendTextWithMentionsAndEmoji(text, container, isEmojiOnlyMessage = false) {
  if (!text) return;
  const known = getKnownUsernamesForMentions();
  let i = 0;
  while (i < text.length) {
    const at = text.indexOf("@", i);
    if (at === -1) {
      if (i < text.length) {
        container.appendChild(scaleEmojiInText(text.slice(i), isEmojiOnlyMessage));
      }
      return;
    }
    if (at > i) {
      container.appendChild(scaleEmojiInText(text.slice(i, at), isEmojiOnlyMessage));
    }

    const after = text.slice(at + 1);
    let matched = null;
    let consumed = 0;
    if (after.startsWith("[")) {
      const close = after.indexOf("]");
      if (close > 1) {
        matched = after.slice(1, close);
        consumed = close + 1;
      }
    }

    
    if (!matched) {
      for (const name of known) {
        if (after.toLowerCase().startsWith(name.toLowerCase())) {
          const next = after[name.length];
          if (next === undefined || /[\s.,!?;:)\]\}'"<>]/.test(next)) {
            matched = name;
            consumed = name.length;
            break;
          }
        }
      }
    }
    if (!matched && after.toLowerCase().startsWith("room")) {
      const next = after[4];
      if (next === undefined || /[\s.,!?;:)\]\}'"<>]/.test(next)) {
        matched = "room";
        consumed = 4;
      }
    }

    if (matched) {
      container.appendChild(buildMentionElement("@" + matched));
      i = at + 1 + consumed;
    } else {
      container.appendChild(document.createTextNode("@"));
      i = at + 1;
    }
  }
}



function getKnownUsernamesForMentions() {
  const names = new Set();
  if (user?.username) names.add(user.username);
  (currentUsers || []).forEach(u => {
    if (u?.username) names.add(u.username);
  });
  return [...names].sort((a, b) => b.length - a.length);
}

const inputField = document.getElementById("input");
initMentionDropdown();
setInterval(refreshSeenTimestamps, 45000);

function getInputText() {
  const input = document.getElementById("input");
  let out = "";
  input.childNodes.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent;
    } else if (node.classList && node.classList.contains("mention-badge")) {
      const uname = node.dataset.mentionUsername || "";
      out += uname.toLowerCase() === "room" ? "@room" : `@[${uname}]`;
    } else if (node.tagName === "IMG" && node.dataset.emoteFile) {
      out += `${window.location.origin}/avatars/${node.dataset.emoteFile}`;
    } else if (node.tagName === "BR") {
      out += "\n";
    } else {
      out += node.textContent || "";
    }
  });
  return out;
}

function clearInputField() {
  document.getElementById("input").innerHTML = "";
}

function isInputEmpty() {
  const input = document.getElementById("input");
  return input.textContent.trim() === "" && !input.querySelector("img");
}

inputField.addEventListener("keydown", async (e) => {
  if (document.getElementById("input").contentEditable === "false") return;

  const cmdDropdown = document.getElementById('commandDropdown');
  const cmdVisible = !!cmdDropdown;


   if ((e.key === "Backspace" || e.key === "Delete") && window.getSelection().rangeCount) {
    const sel = window.getSelection();
    const range = sel.getRangeAt(0);
    if (range.collapsed) {
      const isBackspace = e.key === "Backspace";
      const isSpecial = (n) => n && n.nodeType === Node.ELEMENT_NODE && (
        n.classList?.contains("mention-badge") ||
        n.classList?.contains("inline-emote") ||
        n.dataset?.emoteFile ||
        n.contentEditable === "false"
      );

      let target = null;
      const node = range.startContainer;
      const offset = range.startOffset;

      if (node.nodeType === Node.TEXT_NODE) {
        if (isBackspace && offset === 0) target = node.previousSibling;
        else if (!isBackspace && offset >= node.textContent.length) target = node.nextSibling;
      } else if (node === inputField || node.nodeType === Node.ELEMENT_NODE) {
        if (isBackspace && offset > 0) target = node.childNodes[offset - 1];
        else if (!isBackspace && offset < node.childNodes.length) target = node.childNodes[offset];
      }

    
      while (target && target.nodeType === Node.TEXT_NODE && !target.textContent.trim()) {
        const dead = target;
        target = isBackspace ? target.previousSibling : target.nextSibling;
        dead.remove();
      }

      if (target && isSpecial(target)) {
        e.preventDefault();
        target.remove();

        const r = document.createRange();
        if (node.nodeType === Node.TEXT_NODE) {
          r.setStart(node, isBackspace ? Math.max(0, offset - 1) : offset);
        } else {
          r.setStart(node, Math.max(0, isBackspace ? offset - 1 : offset));
        }
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
        savedInputRange = r.cloneRange();
      }
    }
  }



if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();

    const isCommandText = getInputText().trim().startsWith('/');

    const mentionVisible = !isCommandText
      && mentionDropdown
      && mentionDropdown.style.display !== 'none'
      && mentionDropdown.querySelectorAll('.mention-item').length > 0;

    if (mentionVisible) {
      const items = mentionDropdown.querySelectorAll('.mention-item');
      if (items[selectedIndex]) { items[selectedIndex].click(); return; }
    }

    if (cmdVisible && cmdDropdown.querySelectorAll('.command-item').length > 0) {
      const items = cmdDropdown.querySelectorAll('.command-item');
      if (items[commandSelectedIndex]) { items[commandSelectedIndex].click(); return; }
    }

    if (isInputEmpty()) return;
    if (!socket || !socket.connected) {
      console.warn("⚠️ Socket not connected yet");
      return;
    }

    let text = getInputText().trim();
    if (!text) return;

    if (text === "/resetaccounts") {
    if (!user.isAdmin && !user.isDeveloper) { clearInputField(); return; }
    socket.emit("resetAccountCreation");
    clearInputField();
    hideCommandDropdown();
    return;
  }

    if (text.startsWith("/shh ")) {
      if (!user.isAdmin && !user.isDeveloper) { clearInputField(); return; }
      const target = text.slice(5).trim();
      if (target) socket.emit("muteUser", { target });
      clearInputField();
      hideCommandDropdown();
      return;
    }
    if (text.startsWith("/unssh ")) {
      if (!user.isAdmin && !user.isDeveloper) { clearInputField(); return; }
      const target = text.slice(7).trim();
      if (target) socket.emit("unmuteUser", { target });
      clearInputField();
      hideCommandDropdown();
      return;
    }

    if (text.startsWith("/gameban ")) {
      if (!user.isAdmin && !user.isDeveloper) { clearInputField(); return; }
      const target = text.slice(9).trim();
      if (target) socket.emit("weedGameBan", { target });
      clearInputField();
      hideCommandDropdown();
      return;
    }
    if (text.startsWith("/gameunban ")) {
      if (!user.isAdmin && !user.isDeveloper) { clearInputField(); return; }
      const target = text.slice(11).trim();
      if (target) socket.emit("weedGameUnban", { target });
      clearInputField();
      hideCommandDropdown();
      return;
    }
    if (text === "/oops") {
      if (!user.isAdmin && !user.isDeveloper) { clearInputField(); return; }
      socket.emit("clear");
      clearInputField();
      hideCommandDropdown();
      return;
    }
    if (text === "/roles") {
      if (!user.isAdmin && !user.isDeveloper) { clearInputField(); return; }
      openRoleManager();
      clearInputField();
      hideCommandDropdown();
      return;
    }
    if (text.startsWith("/") && !user.isAdmin && !user.isDeveloper) {
      clearInputField();
      hideCommandDropdown();
      return;
    }

    if (text.startsWith("/lockstatus ")) {
      if (!user.isAdmin && !user.isDeveloper) { clearInputField(); return; }
      const rest = text.slice(12).trim();
      const firstSpace = rest.indexOf(" ");
      if (firstSpace === -1) {
        showToast("❌ Usage: /lockstatus <username> <status text>");
        clearInputField();
        hideCommandDropdown();
        return;
      }
      const target = rest.slice(0, firstSpace).trim();
      const statusText = rest.slice(firstSpace + 1).trim();
      if (target && statusText) socket.emit("lockUserStatus", { target, status: statusText });
      clearInputField();
      hideCommandDropdown();
      return;
    }
    if (text.startsWith("/unlockstatus ")) {
      if (!user.isAdmin && !user.isDeveloper) { clearInputField(); return; }
      const target = text.slice(14).trim();
      if (target) socket.emit("unlockUserStatus", { target });
      clearInputField();
      hideCommandDropdown();
      return;
    }


    

    console.log(`MSG ${user.level}`)
    let messageText = text;
    let isEncrypted = false;
    let encPayload = null;
    if (activeEncryptionKey) {
      encPayload = await encryptText(text);
      isEncrypted = true;
      messageText = "[Encrypted message]";
    }
    const msg = {
      id: crypto.randomUUID(),
      userId: user.id,
      username: user.username,
      avatar: user.avatar,
      usernameColor: user.usernameColor || "username-cyan",
      badge: user.badge || null,
      level: user.level || 1,
      isAdmin: user.isAdmin || false,
      isDeveloper: user.isDeveloper || false,
      isPromptEngineer: user.isPromptEngineer || false,
      isBot: user.isBot || false,
      prestigeBadge: user.prestigeBadge || null,
      customRoleIds: user.customRoleIds || [],
      text: messageText,
      encrypted: isEncrypted,
      encPayload: encPayload,
      channel: currentChannel,
      time: Date.now(),
      type: "text"
    };

    socket.emit("message", msg);
    clearInputField();
    hideCommandDropdown();
    return;
  }

  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (mentionDropdown && mentionDropdown.style.display !== 'none') {
      const items = mentionDropdown.querySelectorAll('.mention-item');
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      highlightSelected();
    } else if (cmdVisible) {
      const items = cmdDropdown.querySelectorAll('.command-item');
      commandSelectedIndex = Math.min(commandSelectedIndex + 1, items.length - 1);
      highlightCommandSelected();
    }
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (mentionDropdown && mentionDropdown.style.display !== 'none') {
      selectedIndex = Math.max(selectedIndex - 1, 0);
      highlightSelected();
    } else if (cmdVisible) {
      commandSelectedIndex = Math.max(commandSelectedIndex - 1, 0);
      highlightCommandSelected();
    }
  } else if (e.key === "Tab") {
    if (mentionDropdown && mentionDropdown.style.display !== 'none') {
      e.preventDefault();
      const items = mentionDropdown.querySelectorAll('.mention-item');
      if (items[selectedIndex]) items[selectedIndex].click();
    } else if (cmdVisible) {
      e.preventDefault();
      const items = cmdDropdown.querySelectorAll('.command-item');
      if (items[commandSelectedIndex]) items[commandSelectedIndex].click();
    }
  } else if (e.key === "Escape") {
    hideMentionDropdown();
    hideCommandDropdown();
  }
});


document.addEventListener("click", (e) => {
  if (mentionDropdown && 
      !inputField.contains(e.target) && 
      !mentionDropdown.contains(e.target)) {
    hideMentionDropdown();
  }
});

document.getElementById("closeSettingsBtn").onclick = () => {
  settingsModal.classList.remove("show");
};



let roleManagerView = { screen: "list", roleId: null };

function openRoleManager() {
  document.getElementById("roleManagerModal")?.remove();
  roleManagerView = { screen: "list", roleId: null };

  const modal = document.createElement("div");
  modal.id = "roleManagerModal";
  modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.75); display:flex; align-items:center; justify-content:center; z-index:20001;";
  modal.innerHTML = `<div id="roleManagerBox" style="background:#2b2d31; border-radius:12px; padding:24px 28px; width:420px; max-height:80vh; overflow-y:auto; box-shadow:0 20px 60px rgba(0,0,0,0.6); border:1px solid #3a3c42;"></div>`;
  document.body.appendChild(modal);

  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
  renderRoleManager();
}


function renderRoleManager() {
  const box = document.getElementById("roleManagerBox");
  if (!box) return;
  const scrollableSelectors = ["#addMemberList", "#addBuiltinMemberList", "#roleMembersList", "#builtinMembersList", "#roleListItems"];
  let savedScrollTop = 0;
  let savedScrollSelector = null;
  for (const sel of scrollableSelectors) {
    const el = box.querySelector(sel);
    if (el) { savedScrollTop = el.scrollTop; savedScrollSelector = sel; break; }
  }


  const activeEl = document.activeElement;
  let savedFocus = null;
  if (activeEl && box.contains(activeEl) && activeEl.tagName === "INPUT") {
    savedFocus = {
      id: activeEl.id,
      value: activeEl.value,
      selectionStart: activeEl.selectionStart,
      selectionEnd: activeEl.selectionEnd
    };
  }

  if (roleManagerView.screen === "list") renderRoleListScreen(box);
  else if (roleManagerView.screen === "detail") renderRoleDetailScreen(box);
  else if (roleManagerView.screen === "addMembers") renderAddMembersScreen(box);
  else if (roleManagerView.screen === "builtinDetail") renderBuiltinRoleDetailScreen(box);
  else if (roleManagerView.screen === "builtinAddMembers") renderBuiltinAddMembersScreen(box);


  if (savedScrollSelector) {
    const restoredScroll = box.querySelector(savedScrollSelector);
    if (restoredScroll) restoredScroll.scrollTop = savedScrollTop;
  }


  if (savedFocus && savedFocus.id) {
    const restoredInput = document.getElementById(savedFocus.id);
    if (restoredInput) {
      if (restoredInput.value === "" && savedFocus.value !== "") {
        restoredInput.value = savedFocus.value;
        restoredInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
      restoredInput.focus();
      try {
        restoredInput.setSelectionRange(savedFocus.selectionStart, savedFocus.selectionEnd);
      } catch (e) {}
    }
  }
}

let roleCreateDraft = { name: "", hex: "#00f2ff", opacity: 100, badge: null };


function renderRoleListScreen(box) {
  box.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
      <h3 style="margin:0; color:#fff; font-size:17px;">Roles</h3>
      <button id="closeRoleManager" style="background:none; border:none; color:#72767d; font-size:20px; cursor:pointer;">✕</button>
    </div>

    <div style="margin-bottom:18px;">
      <div style="font-size:12px; color:#b9bbbe; text-transform:uppercase; font-weight:700; margin-bottom:8px;">Create Role</div>
      <div style="display:flex; gap:8px; margin-bottom:8px;">
        <input id="newRoleName" type="text" placeholder="Role name" maxlength="24"
          style="flex:1; padding:8px 10px; background:#40444b; border:1px solid #40444b; border-radius:6px; color:#fff; font-size:13px; outline:none;">
        <input id="newRoleColor" type="color"
          style="width:42px; height:36px; padding:2px; background:#40444b; border:1px solid #40444b; border-radius:6px; cursor:pointer;">
      </div>
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
        <div id="newRoleBadgePreview" style="width:32px; height:32px; border-radius:6px; background:#40444b; flex-shrink:0; display:flex; align-items:center; justify-content:center; overflow:hidden;"></div>
        <button id="pickRoleBadgeBtn" type="button" style="flex:1; background:#40444b; border:1px solid #40444b; color:#b9bbbe; padding:8px 10px; border-radius:6px; cursor:pointer; font-size:13px; text-align:left;"></button>
        <button id="clearRoleBadgeBtn" type="button" style="background:none; border:none; color:#72767d; font-size:16px; cursor:pointer; padding:4px 8px;">✕</button>
      </div>
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
        <span style="font-size:11px; color:#b9bbbe; width:50px; flex-shrink:0;">Opacity</span>
        <input id="newRoleOpacity" type="range" min="0" max="100"
          style="flex:1; min-width:0; height:6px; accent-color:#FF0000; cursor:pointer;">
        <span id="newRoleOpacityLabel" style="font-size:11px; color:#b9bbbe; width:36px; text-align:right; flex-shrink:0;"></span>
      </div>
      <div id="newRolePreviewSwatch" style="height:24px; border-radius:6px; margin-bottom:8px; border:1px solid #40444b;"></div>
      <button id="createRoleBtn" style="width:100%; background:#FF0000; border:none; color:#fff; padding:8px 0; border-radius:6px; cursor:pointer; font-size:13px; font-weight:600;">Create</button>
    </div>

    <div>
      <div style="font-size:12px; color:#b9bbbe; text-transform:uppercase; font-weight:700; margin-bottom:8px;">All Roles</div>
      <div id="roleListItems"></div>
    </div>
  `;

  const closeBtn = box.querySelector("#closeRoleManager");
  const createBtn = box.querySelector("#createRoleBtn");
  const nameEl = box.querySelector("#newRoleName");
  const hexEl = box.querySelector("#newRoleColor");
  const opacityEl = box.querySelector("#newRoleOpacity");
  const labelEl = box.querySelector("#newRoleOpacityLabel");
  const swatchEl = box.querySelector("#newRolePreviewSwatch");
  const listItems = box.querySelector("#roleListItems");
  const badgePreview = box.querySelector("#newRoleBadgePreview");
  const pickBadgeBtn = box.querySelector("#pickRoleBadgeBtn");
  const clearBadgeBtn = box.querySelector("#clearRoleBadgeBtn");
  nameEl.value = roleCreateDraft.name;
  hexEl.value = roleCreateDraft.hex;
  opacityEl.value = roleCreateDraft.opacity;

  if (closeBtn) closeBtn.onclick = () => document.getElementById("roleManagerModal")?.remove();

  function hexToRgbParts(hex) {
    hex = hex.replace('#', '');
    return {
      r: parseInt(hex.substring(0, 2), 16),
      g: parseInt(hex.substring(2, 4), 16),
      b: parseInt(hex.substring(4, 6), 16)
    };
  }

  function renderBadgePreview() {
    if (roleCreateDraft.badge) {
      badgePreview.innerHTML = `<img src="/avatars/${roleCreateDraft.badge}" style="width:100%; height:100%; object-fit:contain;">`;
      clearBadgeBtn.style.display = "block";
      pickBadgeBtn.textContent = roleCreateDraft.badge;
    } else {
      badgePreview.innerHTML = `<span style="color:#72767d; font-size:16px;">＋</span>`;
      clearBadgeBtn.style.display = "none";
      pickBadgeBtn.textContent = "Choose badge (optional)";
    }
  }
  renderBadgePreview();

  function updateNewRolePreview() {
    const { r, g, b } = hexToRgbParts(hexEl.value);
    const opacity = opacityEl.value / 100;
    labelEl.textContent = Math.round(opacity * 100) + "%";
    swatchEl.style.background = `rgba(${r},${g},${b},${opacity})`;
  }

  nameEl.addEventListener("input", () => { roleCreateDraft.name = nameEl.value; });
  hexEl.addEventListener("input", () => { roleCreateDraft.hex = hexEl.value; updateNewRolePreview(); });
  opacityEl.addEventListener("input", () => { roleCreateDraft.opacity = opacityEl.value; updateNewRolePreview(); });
  updateNewRolePreview();

  pickBadgeBtn.onclick = () => {
    openBadgePickerForRole((filename) => {
      roleCreateDraft.badge = filename;
      renderBadgePreview();
    });
  };
  clearBadgeBtn.onclick = () => {
    roleCreateDraft.badge = null;
    renderBadgePreview();
  };

createBtn.onclick = () => {
    const name = nameEl.value.trim();

    const { r, g, b } = hexToRgbParts(hexEl.value);
    const opacity = opacityEl.value / 100;
    const color = `rgba(${r},${g},${b},${opacity})`;

    socket.emit("createRole", { name, color, badge: roleCreateDraft.badge || null });

    roleCreateDraft = { name: "", hex: "#00f2ff", opacity: 100, badge: null };
    nameEl.value = "";
    hexEl.value = "#00f2ff";
    opacityEl.value = 100;
    renderBadgePreview();
    updateNewRolePreview();
  };

  if (!listItems) return;
  listItems.innerHTML = "";

  const builtInRoles = [
    { key: "isAdmin", label: "Admin", test: u => u.isAdmin, icon: () => createCrownBadge(16) },
    { key: "isDeveloper", label: "Developer", test: u => u.isDeveloper, icon: () => createDeveloperBadge(18) },
    { key: "isPromptEngineer", label: "Prompt Engineer", test: u => u.isPromptEngineer, icon: () => createPromptEngineerBadge(23) }
  ];


  if (!box._roleListDelegated) {
    box.addEventListener("click", (e) => {
      const row = e.target.closest("[data-role-row]");
      if (!row) return;
      if (e.target.closest(".role-del-btn")) return;

      if (row.dataset.builtin) {
        roleManagerView = { screen: "builtinDetail", roleId: row.dataset.builtin };
      } else if (row.dataset.roleId) {
        roleManagerView = { screen: "detail", roleId: row.dataset.roleId };
      }
      renderRoleManager();
    });
    box._roleListDelegated = true;
  }

  builtInRoles.forEach(br => {
    const memberCount = currentUsers.filter(u => u && br.test(u)).length;
    const row = document.createElement("div");
    row.dataset.roleRow = "1";
    row.dataset.builtin = br.key;
    row.style.cssText = `
      display:flex; align-items:center; gap:10px; padding:10px 8px;
      border-radius:8px; cursor:pointer; transition:background 0.12s; margin-bottom:2px;
    `;
    row.onmouseover = () => row.style.background = "rgba(255,255,255,0.05)";
    row.onmouseout = () => row.style.background = "transparent";

    const iconWrap = document.createElement("span");
    iconWrap.style.cssText = "display:flex; align-items:center; flex-shrink:0;";
    iconWrap.appendChild(br.icon());

    const labelSpan = document.createElement("span");
    labelSpan.style.cssText = "flex:1; color:#e6e6e7; font-size:14px; font-weight:600;";
    labelSpan.textContent = br.label;

    const countSpan = document.createElement("span");
    countSpan.style.cssText = "color:#72767d; font-size:12px;";
    countSpan.textContent = `${memberCount} member${memberCount === 1 ? "" : "s"}`;

    row.appendChild(iconWrap);
    row.appendChild(labelSpan);
    row.appendChild(countSpan);

    listItems.appendChild(row);
  });

  const divider = document.createElement("div");
  divider.style.cssText = "border-top:1px solid #40444b; margin:10px 0;";
  listItems.appendChild(divider);

  if (customRoles.length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.style.cssText = "color:#72767d; font-size:12px; padding:8px 0;";
    emptyMsg.textContent = "No custom roles yet. Create one above.";
    listItems.appendChild(emptyMsg);
    return;
  }

  customRoles.forEach(role => {
    const memberCount = currentUsers.filter(u => u && (u.customRoleIds || []).includes(role.id)).length;

    const row = document.createElement("div");
    row.dataset.roleRow = "1";
    row.dataset.roleId = role.id;
    row.style.cssText = `
      display:flex; align-items:center; gap:10px; padding:10px 8px;
      border-radius:8px; cursor:pointer; transition:background 0.12s; margin-bottom:2px;
    `;
    row.onmouseover = () => row.style.background = "rgba(255,255,255,0.05)";
    row.onmouseout = () => row.style.background = "transparent";

row.innerHTML = `
  <span style="width:14px; height:14px; border-radius:4px; background:${role.color}; flex-shrink:0;"></span>
  ${role.badge ? `<img src="/avatars/${role.badge}" style="width:18px; height:18px; object-fit:contain; flex-shrink:0;">` : ""}
  <span style="flex:1; color:#e6e6e7; font-size:14px; font-weight:600;">${escapeHtml(role.name)}</span>
  <span style="color:#72767d; font-size:12px;">${memberCount} member${memberCount === 1 ? "" : "s"}</span>
  <button data-id="${role.id}" class="role-del-btn" title="Delete role" style="background:none; border:none; color:#72767d; cursor:pointer; font-size:14px; padding:2px 6px;">✕</button>
`;

    const delBtn = row.querySelector(".role-del-btn");
    if (delBtn) {
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        showConfirmModal(
          `Removes this role from everyone who has it.`,
          () => socket.emit("deleteRole", { id: role.id }),
          { title: `Delete role "${role.name}"?`, confirmLabel: "Delete" }
        );
      });
    }

    listItems.appendChild(row);
  });
}


function openBadgePickerForRole(onSelect) {
  document.getElementById("roleBadgePickerModal")?.remove();

  const modal = document.createElement("div");
  modal.id = "roleBadgePickerModal";
  modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.75); display:flex; align-items:center; justify-content:center; z-index:30002;";
  modal.innerHTML = `
    <div style="background:#2b2d31; border-radius:12px; padding:20px; width:340px; max-height:70vh; display:flex; flex-direction:column; box-shadow:0 20px 60px rgba(0,0,0,0.6); border:1px solid #3a3c42;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
        <h3 style="margin:0; color:#fff; font-size:16px;">Choose Role Badge</h3>
        <button id="closeBadgePicker" style="background:none; border:none; color:#72767d; font-size:20px; cursor:pointer;">✕</button>
      </div>
      <div id="roleBadgeGrid" style="display:grid; grid-template-columns:repeat(5, 1fr); gap:8px; overflow-y:auto; flex:1;"></div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
  modal.querySelector("#closeBadgePicker").onclick = () => modal.remove();

  const grid = modal.querySelector("#roleBadgeGrid");
  if (pepeList.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1; color:#72767d; font-size:12px; text-align:center; padding:20px 0;">No emotes/badges available.</div>`;
  } else {
    pepeList.forEach(filename => {
      const item = document.createElement("div");
      item.style.cssText = `
        aspect-ratio:1; border-radius:6px; background:#1e1f22;
        display:flex; align-items:center; justify-content:center;
        cursor:pointer; transition:background 0.15s;
      `;
      item.onmouseover = () => item.style.background = "#2a2c31";
      item.onmouseout = () => item.style.background = "#1e1f22";
      item.title = filename;
      item.innerHTML = `<img src="/avatars/${filename}" style="width:78%; height:78%; object-fit:contain; pointer-events:none;">`;
      item.onclick = () => {
        onSelect(filename);
        modal.remove();
      };
      grid.appendChild(item);
    });
  }
}


function renderAddMembersScreen(box) {
  const role = getRoleById(roleManagerView.roleId);
  if (!role) { roleManagerView = { screen: "list", roleId: null }; return renderRoleManager(); }

  const nonMembers = currentUsers.filter(u => u && u.username && !(u.customRoleIds || []).includes(role.id));

  box.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
      <button id="backToRoleDetail" style="background:none; border:none; color:#b9bbbe; font-size:18px; cursor:pointer; padding:0;">‹</button>
      <h3 style="margin:0; color:#fff; font-size:17px; flex:1;">Add Members to ${role.name}</h3>
      <button id="closeRoleManager" style="background:none; border:none; color:#72767d; font-size:20px; cursor:pointer;">✕</button>
    </div>

    <input id="addMemberSearch" type="text" placeholder="Search users…"
      style="width:100%; box-sizing:border-box; padding:8px 10px; background:#40444b; border:1px solid #40444b; border-radius:6px; color:#fff; font-size:13px; outline:none; margin-bottom:12px;">

    <div id="addMemberList" style="max-height:280px; overflow-y:auto;"></div>
  `;

  box.querySelector("#closeRoleManager").onclick = () => document.getElementById("roleManagerModal")?.remove();
  box.querySelector("#backToRoleDetail").onclick = () => {
    roleManagerView = { screen: "detail", roleId: role.id };
    renderRoleManager();
  };

  const listEl = box.querySelector("#addMemberList");
  const searchInput = box.querySelector("#addMemberSearch");

  function renderList(filter = "") {
    const q = filter.trim().toLowerCase();
    const filtered = nonMembers
      .filter(u => u.username.toLowerCase().includes(q))
      .sort((a, b) => a.username.localeCompare(b.username));

    listEl.innerHTML = "";
    if (filtered.length === 0) {
      listEl.innerHTML = `<div style="color:#72767d; font-size:12px; padding:8px 0;">No matching users.</div>`;
      return;
    }

    filtered.forEach(u => {
      const row = document.createElement("div");
      row.style.cssText = `
        display:flex; align-items:center; gap:10px; padding:7px 4px; border-radius:6px; cursor:pointer;
      `;
      row.onmouseover = () => row.style.background = "rgba(255,255,255,0.05)";
      row.onmouseout = () => row.style.background = "transparent";
      row.innerHTML = `
        <img src="${sanitizeAvatar(u.avatar)}" style="width:28px; height:28px; border-radius:50%; flex-shrink:0;">
        <span style="flex:1; color:#e6e6e7; font-size:13px;">${u.username}</span>
        <span style="color:#FF0000; font-size:18px; line-height:1;">+</span>
      `;
    row.onclick = () => {
      socket.emit("assignRole", { username: u.username, roleId: role.id, action: "add" });
      if (!u.customRoleIds) u.customRoleIds = [];
      u.customRoleIds.push(role.id);
      setPendingRoleOverride(u.id, u.customRoleIds);
      roleManagerView = { screen: "detail", roleId: role.id };
      renderRoleManager();
    };
      listEl.appendChild(row);
    });
  }

  searchInput.addEventListener("input", () => renderList(searchInput.value));
  renderList();
}



const BUILTIN_ROLE_LABELS = {
  isAdmin: "Admin",
  isDeveloper: "Developer",
  isPromptEngineer: "Prompt Engineer"
};

function renderBuiltinRoleDetailScreen(box) {
  const key = roleManagerView.roleId;
  const label = BUILTIN_ROLE_LABELS[key] || key;
  const members = currentUsers.filter(u => u && u[key]);

  box.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
      <button id="backToRoleList" style="background:none; border:none; color:#b9bbbe; font-size:18px; cursor:pointer; padding:0;">‹</button>
      <h3 style="margin:0; color:#fff; font-size:17px; flex:1;">${label}</h3>
      <button id="closeRoleManager" style="background:none; border:none; color:#72767d; font-size:20px; cursor:pointer;">✕</button>
    </div>

    <button id="manageMembersBtn" style="
      width:100%; background:#FF0000; border:none; color:#fff; padding:10px; border-radius:8px;
      cursor:pointer; font-size:13px; font-weight:600; margin-bottom:16px;
    ">+ Manage Members</button>

    <div style="font-size:12px; color:#b9bbbe; text-transform:uppercase; font-weight:700; margin-bottom:8px;">
      Members - ${members.length}
    </div>
    <div id="builtinMembersList"></div>
  `;

  box.querySelector("#closeRoleManager").onclick = () => document.getElementById("roleManagerModal")?.remove();
  box.querySelector("#backToRoleList").onclick = () => {
    roleManagerView = { screen: "list", roleId: null };
    renderRoleManager();
  };
  box.querySelector("#manageMembersBtn").onclick = () => {
    roleManagerView = { screen: "builtinAddMembers", roleId: key };
    renderRoleManager();
  };

  const membersList = box.querySelector("#builtinMembersList");
  if (members.length === 0) {
    membersList.innerHTML = `<div style="color:#72767d; font-size:12px; padding:8px 0;">No members yet. Click "Manage Members" to add some.</div>`;
    return;
  }

  members.forEach(u => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex; align-items:center; gap:10px; padding:7px 4px;";
    row.innerHTML = `
      <img src="${sanitizeAvatar(u.avatar)}" style="width:28px; height:28px; border-radius:50%; flex-shrink:0;">
      <span style="flex:1; color:#e6e6e7; font-size:13px;">${u.username}</span>
      <button class="remove-member-btn" title="Remove ${label}" style="background:none; border:none; color:#72767d; cursor:pointer; font-size:14px; padding:2px 6px;">✕</button>
    `;
    row.querySelector(".remove-member-btn").onclick = () => {
      socket.emit("setUserRole", { userId: u.id, role: key, value: false });
      u[key] = false;
      row.remove();
      if (membersList.children.length === 0) {
        membersList.innerHTML = `<div style="color:#72767d; font-size:12px; padding:8px 0;">No members yet. Click "Manage Members" to add some.</div>`;
      }
      renderUsers(currentUsers);
    };
    membersList.appendChild(row);
  });
}

function renderBuiltinAddMembersScreen(box) {
  const key = roleManagerView.roleId;
  const label = BUILTIN_ROLE_LABELS[key] || key;
  const nonMembers = currentUsers.filter(u => u && u.username && !u[key]);

  box.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
      <button id="backToBuiltinDetail" style="background:none; border:none; color:#b9bbbe; font-size:18px; cursor:pointer; padding:0;">‹</button>
      <h3 style="margin:0; color:#fff; font-size:17px; flex:1;">Add ${label}</h3>
      <button id="closeRoleManager" style="background:none; border:none; color:#72767d; font-size:20px; cursor:pointer;">✕</button>
    </div>

    <input id="addBuiltinMemberSearch" type="text" placeholder="Search users…"
      style="width:100%; box-sizing:border-box; padding:8px 10px; background:#40444b; border:1px solid #40444b; border-radius:6px; color:#fff; font-size:13px; outline:none; margin-bottom:12px;">

    <div id="addBuiltinMemberList" style="max-height:280px; overflow-y:auto;"></div>
  `;

  box.querySelector("#closeRoleManager").onclick = () => document.getElementById("roleManagerModal")?.remove();
  box.querySelector("#backToBuiltinDetail").onclick = () => {
    roleManagerView = { screen: "builtinDetail", roleId: key };
    renderRoleManager();
  };

  const listEl = box.querySelector("#addBuiltinMemberList");
  const searchInput = box.querySelector("#addBuiltinMemberSearch");

  function renderList(filter = "") {
    const q = filter.trim().toLowerCase();
    const filtered = nonMembers
      .filter(u => u.username.toLowerCase().includes(q))
      .sort((a, b) => a.username.localeCompare(b.username));

    listEl.innerHTML = "";
    if (filtered.length === 0) {
      listEl.innerHTML = `<div style="color:#72767d; font-size:12px; padding:8px 0;">No matching users.</div>`;
      return;
    }

    filtered.forEach(u => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex; align-items:center; gap:10px; padding:7px 4px; border-radius:6px; cursor:pointer;";
      row.onmouseover = () => row.style.background = "rgba(255,255,255,0.05)";
      row.onmouseout = () => row.style.background = "transparent";
      row.innerHTML = `
        <img src="${sanitizeAvatar(u.avatar)}" style="width:28px; height:28px; border-radius:50%; flex-shrink:0;">
        <span style="flex:1; color:#e6e6e7; font-size:13px;">${u.username}</span>
        <span style="color:#FF0000; font-size:18px; line-height:1;">+</span>
      `;
      row.onclick = () => {
        socket.emit("setUserRole", { userId: u.id, role: key, value: true });
        u[key] = true;
        roleManagerView = { screen: "builtinDetail", roleId: key };
        renderRoleManager();
      };
      listEl.appendChild(row);
    });
  }

  searchInput.addEventListener("input", () => renderList(searchInput.value));
  renderList();
}





function renderRoleDetailScreen(box) {
  const role = getRoleById(roleManagerView.roleId);
  if (!role) { roleManagerView = { screen: "list", roleId: null }; return renderRoleManager(); }

  const members = currentUsers.filter(u => u && (u.customRoleIds || []).includes(role.id));

  box.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
      <button id="backToRoleList" style="background:none; border:none; color:#b9bbbe; font-size:18px; cursor:pointer; padding:0;">‹</button>
      <span style="width:14px; height:14px; border-radius:4px; background:${role.color}; flex-shrink:0;"></span>
      <h3 style="margin:0; color:#fff; font-size:17px; flex:1;">${role.name}</h3>
      <button id="closeRoleManager" style="background:none; border:none; color:#72767d; font-size:20px; cursor:pointer;">✕</button>
    </div>

    <button id="manageMembersBtn" style="
      width:100%; background:#FF0000; border:none; color:#fff; padding:10px; border-radius:8px;
      cursor:pointer; font-size:13px; font-weight:600; margin-bottom:16px;
    ">+ Manage Members</button>

    <div style="font-size:12px; color:#b9bbbe; text-transform:uppercase; font-weight:700; margin-bottom:8px;">
      Members - ${members.length}
    </div>
    <div id="roleMembersList"></div>
  `;

  box.querySelector("#closeRoleManager").onclick = () => document.getElementById("roleManagerModal")?.remove();
  box.querySelector("#backToRoleList").onclick = () => {
    roleManagerView = { screen: "list", roleId: null };
    renderRoleManager();
  };
  box.querySelector("#manageMembersBtn").onclick = () => {
    roleManagerView = { screen: "addMembers", roleId: role.id };
    renderRoleManager();
  };

  const membersList = box.querySelector("#roleMembersList");
  if (members.length === 0) {
    membersList.innerHTML = `<div style="color:#72767d; font-size:12px; padding:8px 0;">No members yet. Click "Manage Members" to add some.</div>`;
    return;
  }

  members.forEach(u => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex; align-items:center; gap:10px; padding:7px 4px;";
    row.innerHTML = `
      <img src="${sanitizeAvatar(u.avatar)}" style="width:28px; height:28px; border-radius:50%; flex-shrink:0;">
      <span style="flex:1; color:#e6e6e7; font-size:13px;">${u.username}</span>
      <button class="remove-member-btn" title="Remove from role" style="background:none; border:none; color:#72767d; cursor:pointer; font-size:14px; padding:2px 6px;">✕</button>
    `;
row.querySelector(".remove-member-btn").onclick = () => {
  socket.emit("assignRole", { username: u.username, roleId: role.id, action: "remove" });
  u.customRoleIds = (u.customRoleIds || []).filter(id => id !== role.id);
  setPendingRoleOverride(u.id, u.customRoleIds);

  row.remove();
  const countHeader = box.querySelector("div[style*='text-transform:uppercase']");
  if (countHeader) countHeader.textContent = `Members - ${Math.max(0, members.length - 1)}`;
  if (membersList.children.length === 0) {
    membersList.innerHTML = `<div style="color:#72767d; font-size:12px; padding:8px 0;">No members yet. Click "Manage Members" to add some.</div>`;
  }

  const globalUser = currentUsers.find(cu => cu && cu.id === u.id);
  if (globalUser) globalUser.customRoleIds = (globalUser.customRoleIds || []).filter(id => id !== role.id);
  renderUsers(currentUsers);
};
membersList.appendChild(row);
  });
}



function renderRoleManagerContents() {
  const modal = document.getElementById("roleManagerModal");
  if (!modal) return;

  const list = modal.querySelector("#roleManagerList");
  const userSelect = modal.querySelector("#assignRoleUsername");
  list.innerHTML = customRoles.length === 0
    ? `<div style="color:#72767d; font-size:12px; padding:8px 0;">No roles yet.</div>`
    : "";
  customRoles.forEach(role => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex; align-items:center; gap:8px; padding:6px 0;";
    row.innerHTML = `
      <span style="width:14px; height:14px; border-radius:4px; background:${role.color}; flex-shrink:0;"></span>
      <span style="flex:1; color:#e6e6e7; font-size:13px;">${role.name}</span>
      <button data-id="${role.id}" style="background:none; border:none; color:#72767d; cursor:pointer; font-size:13px;">✕</button>
    `;
    row.querySelector("button").onclick = () => {
      showConfirmModal(
        `Removes this role from everyone who has it.`,
        () => socket.emit("deleteRole", { id: role.id }),
        { title: `Delete role "${role.name}"?`, confirmLabel: "Delete" }
      );
    };
    list.appendChild(row);
  });


  const prevSelected = userSelect.value;
  const sortedUsers = [...currentUsers].filter(u => u && u.username).sort((a, b) => a.username.localeCompare(b.username));
  userSelect.innerHTML = sortedUsers.map(u => {
    const roleNames = (u.customRoleIds || []).map(id => getRoleById(id)?.name).filter(Boolean);
    const suffix = roleNames.length ? ` (${roleNames.join(", ")})` : "";
    return `<option value="${u.username}">${u.username}${suffix}</option>`;
  }).join("");
  if (sortedUsers.some(u => u.username === prevSelected)) {
    userSelect.value = prevSelected;
  }

  renderRoleCheckboxes();
  userSelect.onchange = renderRoleCheckboxes;
}

function renderRoleCheckboxes() {
  const modal = document.getElementById("roleManagerModal");
  if (!modal) return;

  const userSelect = modal.querySelector("#assignRoleUsername");
  const container = modal.querySelector("#userRoleCheckboxes");
  const username = userSelect.value;

  container.innerHTML = "";

  if (!username) {
    container.innerHTML = `<div style="color:#72767d; font-size:12px;">No users online.</div>`;
    return;
  }

  if (customRoles.length === 0) {
    container.innerHTML = `<div style="color:#72767d; font-size:12px;">No roles created yet.</div>`;
    return;
  }

  const targetUser = currentUsers.find(u => u.username === username);
  const currentRoleIds = targetUser?.customRoleIds || [];

  customRoles.forEach(role => {
    const label = document.createElement("label");
    label.style.cssText = "display:flex; align-items:center; gap:8px; cursor:pointer; padding:4px 0;";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = currentRoleIds.includes(role.id);
    checkbox.style.cssText = "cursor:pointer;";
    checkbox.onchange = () => {
      socket.emit("assignRole", { username, roleId: role.id });
    };

    const swatch = document.createElement("span");
    swatch.style.cssText = `width:12px; height:12px; border-radius:3px; background:${role.color}; flex-shrink:0;`;

    const name = document.createElement("span");
    name.textContent = role.name;
    name.style.cssText = "color:#e6e6e7; font-size:13px;";

    label.appendChild(checkbox);
    label.appendChild(swatch);
    label.appendChild(name);
    container.appendChild(label);
  });
}

function refreshRoleManagerIfOpen() {
  const modal = document.getElementById("roleManagerModal");
  const box = document.getElementById("roleManagerBox");
  if (modal && box) {
    renderRoleManager();
  }
}


function handleStreamOfflineNotification(stream) {
  const streamId = `${stream.platform}-${stream.name}`;
  notifiedStreams.delete(streamId);
  console.log(`⚫ ${stream.name} went offline - cleared notification flag`);
}



function triggerUserOnlineNotification(onlineUser) {
  const statusText = onlineUser.customStatus || "Just came online";

  if (notifSettings.browser && Notification.permission === 'granted') {
    sendNotification(
      `${onlineUser.username} is now online!`,
      statusText,
      {
        icon: sanitizeAvatar(onlineUser.avatar),
        tag: `online-${onlineUser.id}`,
        requireInteraction: false
      }
    );
  }

  showUserOnlineToast(onlineUser);

  if (notifSettings.sound) {
    const audio = new Audio('/sounds/battery-low.oga');
    audio.volume = 0.4;
    audio.play().catch(() => {});
  }
}


function applyCustomColorForUser(userId, hexColor) {
  if (!userId || !hexColor) return;

  let style = document.getElementById("customColorStyle");
  if (!style) {
    style = document.createElement("style");
    style.id = "customColorStyle";
    document.head.appendChild(style);
  }


  style.innerHTML += `
    .username-wrapper[data-user-id="${userId}"] {
      background: ${hexColor} !important;
      -webkit-background-clip: text !important;
      background-clip: text !important;
      -webkit-text-fill-color: transparent !important;
    }
  `;

 
  document.querySelectorAll(`.username-wrapper[data-user-id="${userId}"]`).forEach(wrapper => {
    wrapper.style.background = '';
    wrapper.style.webkitBackgroundClip = '';
    wrapper.style.backgroundClip = '';
    wrapper.style.webkitTextFillColor = '';
    wrapper.style.background = hexColor;
    wrapper.style.webkitBackgroundClip = "text";
    wrapper.style.backgroundClip = "text";
    wrapper.style.webkitTextFillColor = "transparent";
  });
}

const typingUsers = new Map();
const typingIndicator = document.getElementById("typingIndicator");


function formatLastSeen(timestamp) {
  if (!timestamp) return "Never";
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes/60)}h ago`;
  return `${Math.floor(minutes/1440)}d ago`;
}
function updateTypingIndicator() {
  typingIndicator.innerHTML = '';

  if (typingUsers.size === 0) {
    typingIndicator.style.opacity = '0';
    typingIndicator.style.transform = 'translateY(4px)';
    return;
  }

  typingIndicator.style.opacity = '1';
  typingIndicator.style.transform = 'translateY(0)';

  const users = Array.from(typingUsers.values());

  
  if (users.length <= 3) {
    const avatarStack = document.createElement('div');
    avatarStack.style.cssText = 'display:flex; align-items:center; margin-right:6px;';
    users.forEach((u, i) => {
      const img = document.createElement('img');
      img.src = sanitizeAvatar(u.avatar);
      img.style.cssText = `
        width: 18px; height: 18px; border-radius: 50%;
        border: 2px solid #1e1f22;
        margin-left: ${i === 0 ? '0' : '-6px'};
        z-index: ${users.length - i};
        position: relative;
        object-fit: cover;
      `;
      avatarStack.appendChild(img);
    });
    typingIndicator.appendChild(avatarStack);
  }


  const dots = document.createElement('div');
  dots.style.cssText = 'display:flex; align-items:center; gap:3px; margin-right:7px;';
  [0, 1, 2].forEach(i => {
    const dot = document.createElement('span');
    dot.style.cssText = `
      width: 5px; height: 5px; border-radius: 50%;
      background: #b9bbbe;
      display: inline-block;
      animation: typingBounce 1.2s ease-in-out infinite;
      animation-delay: ${i * 0.18}s;
    `;
    dots.appendChild(dot);
  });
  typingIndicator.appendChild(dots);

  
  const text = document.createElement('span');
  text.style.cssText = 'font-size:12px; color:#b9bbbe; font-style:italic;';
  if (users.length === 1) {
    const nameSpan = document.createElement('span');
    nameSpan.className = `username-wrapper ${users[0].usernameColor || 'username-cyan'}`;
    nameSpan.textContent = users[0].username;
    nameSpan.style.cssText = 'font-size:12px; font-weight:700; font-style:normal;';
    text.appendChild(nameSpan);
    text.appendChild(document.createTextNode(' is typing...'));
  } else if (users.length === 2) {
    const n1 = document.createElement('span');
    n1.className = `username-wrapper ${users[0].usernameColor || 'username-cyan'}`;
    n1.textContent = users[0].username;
    n1.style.cssText = 'font-size:12px; font-weight:700; font-style:normal;';
    const n2 = document.createElement('span');
    n2.className = `username-wrapper ${users[1].usernameColor || 'username-cyan'}`;
    n2.textContent = users[1].username;
    n2.style.cssText = 'font-size:12px; font-weight:700; font-style:normal;';
    text.appendChild(n1);
    text.appendChild(document.createTextNode(' and '));
    text.appendChild(n2);
    text.appendChild(document.createTextNode(' are typing...'));
  } else {
    text.textContent = `${users.length} people are typing...`;
  }
  typingIndicator.appendChild(text);
}


let typingTimeout;

function getCaretTextOffset() {
  const input = document.getElementById("input");
  const sel = window.getSelection();
  if (!sel.rangeCount || !input.contains(sel.anchorNode)) return null;
  const range = sel.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(input);
  preRange.setEnd(range.endContainer, range.endOffset);
  return preRange.toString().length;
}


let savedInputRange = null;

function saveInputSelection() {
  const input = document.getElementById("input");
  const sel = window.getSelection();
  if (sel.rangeCount && input.contains(sel.anchorNode)) {
    savedInputRange = sel.getRangeAt(0).cloneRange();
  }
}

document.getElementById("input").addEventListener("keyup", saveInputSelection);
document.getElementById("input").addEventListener("mouseup", saveInputSelection);

function restoreInputSelection() {
  const input = document.getElementById("input");

  const rangeToUse = (savedInputRange && input.contains(savedInputRange.startContainer))
    ? savedInputRange
    : (() => {
        const r = document.createRange();
        r.selectNodeContents(input);
        r.collapse(false);
        return r;
      })();

  input.focus();
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(rangeToUse);
}

function setCaretAtTextOffset(offset) {
  const input = document.getElementById("input");
  const walker = document.createTreeWalker(input, NodeFilter.SHOW_TEXT);
  let pos = 0, node = null, localOffset = 0;
  while (walker.nextNode()) {
    const len = walker.currentNode.textContent.length;
    if (pos + len >= offset) {
      node = walker.currentNode;
      localOffset = offset - pos;
      break;
    }
    pos += len;
  }
  const sel = window.getSelection();
  const range = document.createRange();
  if (node) {
    range.setStart(node, localOffset);
  } else {
    range.selectNodeContents(input);
    range.collapse(false);
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

inputField.addEventListener("input", () => {
  if (!socket.connected) return;

  if (isInputEmpty()) {
    inputField.innerHTML = "";
  }

  socket.emit("typing", {
    userId: user.id,
    username: user.username,
    avatar: user.avatar,
    usernameColor: user.usernameColor || 'username-cyan'
  });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit("stopTyping");
  }, 3000);

  const caretOffset = getCaretTextOffset();
  const fullText = getInputText();

  if (caretOffset !== null) {
    const textBeforeCaret = fullText.slice(0, caretOffset);
    const lastAt = textBeforeCaret.lastIndexOf('@');
    const afterAt = lastAt !== -1 ? textBeforeCaret.slice(lastAt + 1) : null;
    if (lastAt !== -1 && afterAt !== null && !/\s/.test(afterAt)) {
      showMentionDropdown(afterAt);
    } else {
      hideMentionDropdown();
    }
  } else {
    hideMentionDropdown();
  }

   if (fullText.startsWith('/') && !fullText.includes(' ') && (user.isAdmin || user.isDeveloper)) {
    showCommandDropdown(fullText.split(' ')[0].slice(1));
  } else {
    hideCommandDropdown();
  }
});



inputField.addEventListener("blur", () => {
  clearTimeout(typingTimeout);
  socket.emit("stopTyping");
});

const uploadProgress = document.getElementById("uploadProgress");
const uploadPercent = document.getElementById("uploadPercent");

imageInput.setAttribute("accept", "image/*,video/*,audio/*,text/plain,text/markdown,text/csv,application/json,.txt,.md,.csv,.json");
imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("image", file);

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/upload-image", true);
  xhr.setRequestHeader("Authorization", `Bearer ${localStorage.getItem("chatToken")}`);
  uploadProgress.style.display = "block";
  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable) {
      const percent = Math.round((event.loaded / event.total) * 100);
      uploadPercent.textContent = percent + "%";
    }
  };

 xhr.onload = () => {
  uploadProgress.style.display = "none";
  if (xhr.status === 200) {
    const data = JSON.parse(xhr.responseText);
    const isVideo = file.type.startsWith("video/");
    const isAudio = data.type === "audio";
    const isTextFile = data.type === "file";

    const msg = {
      id: crypto.randomUUID(),
      userId: user.id,
      username: user.username,
      avatar: user.avatar,
      usernameColor: user.usernameColor,
      badge: user.badge,
      level: user.level || 1,
      isAdmin: user.isAdmin || false,
      isDeveloper: user.isDeveloper || false,
      isPromptEngineer: user.isPromptEngineer || false,
      isBot: user.isBot || false,
      prestigeBadge: user.prestigeBadge || null,
      text: data.url,
      fileName: (isAudio || isTextFile) ? (data.filename || file.name) : undefined,
      channel: currentChannel,
      time: Date.now(),
      type: isVideo ? "video" : (isAudio ? "audio" : (isTextFile ? "file" : "image"))
    };

    socket.emit("message", msg);
  } else {
    showToast("Upload failed: " + xhr.responseText);
  }
};

  xhr.onerror = () => {
    uploadProgress.style.display = "none";
    showToast("Upload error");
  };

  xhr.send(formData);
});

const avatarInput = document.getElementById("pfpUpload");
let avatarCropper = null;
let currentFile = null;

if (avatarInput) {
  avatarInput.addEventListener("change", function(e) {
    console.log("📁 Change event triggered");
    const inputElement = e.target;
    const fileList = inputElement.files;
    
    console.log("📋 FileList object:", fileList);
    console.log("📊 FileList length:", fileList.length);
    if (!fileList || fileList.length === 0) {
      console.warn("❌ No file selected.");
      return;
    }

    const selectedFile = fileList.item(0);
    
    console.log("📄 Selected file object:", selectedFile);
    console.log("📄 Selected file type:", typeof selectedFile);
    if (!selectedFile || !selectedFile.name) {
      console.error("❌ File object is invalid:", selectedFile);
     showToast("❌ Invalid file. Please try again.");
      return;
    }

    const fileName = selectedFile.name.toLowerCase();
    const fileType = selectedFile.type || "";
    const fileSize = selectedFile.size || 0;

    console.log(`File: "${fileName}" | Type: "${fileType}" | Size: ${fileSize} bytes`);
    const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    const hasValidExtension = validExtensions.some(ext => fileName.endsWith(ext));
    const isImage = fileType.startsWith("image/") || hasValidExtension;

    if (!isImage) {
     showToast("❌ Please select a valid image file (JPG, PNG, GIF, WebP, BMP).");
      inputElement.value = '';
      return;
    }

    currentFile = selectedFile;
    const reader = new FileReader();




    reader.onload = (readerEvent) => {
      console.log("📖 File read successfully");


          const isAnimated = fileType === 'image/gif' || fileType === 'image/webp';

      if (isAnimated) {
        console.log("🎬 Animated file detected (GIF/WebP). Skipping cropper.");
        uploadAnimatedImage(readerEvent.target.result);
        inputElement.value = ''; 
        return;
      }
      
      const img = document.getElementById("avatarToCrop");
      if (!img) {
        console.error("❌ Element #avatarToCrop not found");
       showToast("❌ Avatar editor UI not found.");
        return;
      }

      img.src = readerEvent.target.result;
      console.log("🖼️ Image loaded");
      if (typeof Cropper === 'undefined') {
        console.error("❌ Cropper.js not loaded");
       showToast("❌ Cropper library not available.");
        return;
      }

      if (avatarCropper) {
        avatarCropper.destroy();
        inputElement.value = ''; 
        
      }

      avatarCropper = new Cropper(img, {
        viewMode: 1,
        dragMode: 'move',
        aspectRatio: 1,
        autoCropArea: 0.8,
        restore: false,
        guides: true,
        center: true,
        highlight: false,
        cropBoxMovable: true,
        cropBoxResizable: true,
        toggleDragModeOnDblclick: false,
        ready: function() {
          console.log("Cropper initialized");
        }
      });

      const cropModal = document.getElementById("avatarEditorModal");
      if (cropModal) {
        cropModal.style.display = "flex";
        console.log("🪟 Modal opened");
      }
    };

    reader.onerror = function(error) {
      console.error("❌ FileReader error:", error);
     showToast("❌ Failed to read image.");
    };

    console.log("📖 Starting to read file...");
    reader.readAsDataURL(selectedFile);
    setTimeout(() => {
      inputElement.value = '';
    }, 100);

  });
} else {
  console.error("❌ Avatar input (#pfpUpload) not found");
}

function uploadAnimatedImage(dataUrl) {
  const img = new Image();
  img.src = dataUrl;
  img.onload = () => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const size = 256;
    canvas.width = size;
    canvas.height = size;
    const scale = Math.max(size / img.width, size / img.height);
    const x = (size / 2) - (img.width / 2) * scale;
    const y = (size / 2) - (img.height / 2) * scale;
    ctx.drawImage(img, x, y, img.width * scale, img.height * scale);    
    const formData = new FormData();
    formData.append("avatar", currentFile, currentFile.name); 
    const progressEl = document.getElementById("uploadProgress");
    if (progressEl) progressEl.style.display = "block";

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/upload-avatar", true);
    xhr.setRequestHeader("Authorization", `Bearer ${localStorage.getItem("chatToken")}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        const percentEl = document.getElementById("uploadPercent");
        if (percentEl) percentEl.textContent = percent + "%";
      }
    };

    xhr.onload = () => {
      if (progressEl) progressEl.style.display = "none";
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        user.avatar = data.url;
        localStorage.setItem("chatUser", JSON.stringify(user));
        
        const settingsPfp = document.getElementById("settingsPfp");
        if (settingsPfp) settingsPfp.src = sanitizeAvatar(user.avatar);
        
        if (typeof conference !== 'undefined' && conference) {
          try {
            conference.setLocalParticipantProperty("avatar", user.avatar);
          } catch (error) {
            console.warn("Jitsi update failed:", error);
          }
        }

        if (socket && socket.connected) {
          socket.emit("updateUser", {
            user: { 
              id: user.id, 
              username: user.username, 
              avatar: user.avatar,
              usernameColor: user.usernameColor,
              badge: user.badge || null,
              level: user.level || 1,
              profileHeader: user.profileHeader,
              prestigeBadge: user.prestigeBadge || null,
            }
          });
        }

        const myIndex = currentUsers.findIndex(u => u && u.id === user.id);
        if (myIndex !== -1) {
          currentUsers[myIndex].avatar = user.avatar;
        }
        renderUsers(currentUsers);
       showToast("Avatar updated! (Note: Cropping is disabled for animated files)");
      } else {
       showToast("Upload failed: " + xhr.responseText);
      }
    };

    xhr.onerror = () => {
      if (progressEl) progressEl.style.display = "none";
     showToast("Upload error");
    };

    xhr.send(formData);
  };
}

document.getElementById("closeAvatarEditor").onclick = () => {
  document.getElementById("avatarEditorModal").style.display = "none";
  document.getElementById('avatarEditorModal').style.zIndex = '';
  if (avatarCropper) avatarCropper.destroy();
  document.getElementById("pfpUpload").value = '';

  
};

document.getElementById("cancelCropBtn").onclick = () => {
  document.getElementById("avatarEditorModal").style.display = "none";
  if (avatarCropper) avatarCropper.destroy();
  document.getElementById("pfpUpload").value = '';
 
};

document.getElementById("resetBtn").onclick = () => avatarCropper?.reset();
document.getElementById("flipHBtn").onclick = () => avatarCropper?.scaleX((avatarCropper.getData().scaleX || 1) * -1);
document.getElementById("flipVBtn").onclick = () => avatarCropper?.scaleY((avatarCropper.getData().scaleY || 1) * -1);
document.getElementById("rotateLBtn").onclick = () => avatarCropper?.rotate(-90);
document.getElementById("rotateRBtn").onclick = () => avatarCropper?.rotate(90);

document.getElementById("zoomSlider").addEventListener("input", (e) => {
  const val = parseFloat(e.target.value);
  avatarCropper?.zoomTo(val);
  document.getElementById("zoomLevel").textContent = val.toFixed(1);
});




document.getElementById("saveCropBtn").onclick = () => {
  if (!avatarCropper) return;
  const canvas = avatarCropper.getCroppedCanvas({
    width: 256,
    height: 256,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'high',
  });

  canvas.toBlob((blob) => {
    if (!blob) {
     showToast("Error creating image.");
      return;
    }

    document.getElementById("avatarEditorModal").style.display = "none";
    if (avatarCropper) {
      avatarCropper.destroy();
      avatarCropper = null;
    }
    const progressEl = document.getElementById("uploadProgress");
    if (progressEl) progressEl.style.display = "block";

    const formData = new FormData();
    formData.append("avatar", blob, "avatar.png");

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/upload-avatar", true);
    xhr.setRequestHeader("Authorization", `Bearer ${localStorage.getItem("chatToken")}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        const percentEl = document.getElementById("uploadPercent");
        if (percentEl) percentEl.textContent = percent + "%";
      }
    };

    xhr.onload = () => {
      const progressEl = document.getElementById("uploadProgress");
      if (progressEl) progressEl.style.display = "none";

      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        user.avatar = data.url;
        localStorage.setItem("chatUser", JSON.stringify(user));
        const settingsPfp = document.getElementById("settingsPfp");
        if (settingsPfp) settingsPfp.src = sanitizeAvatar(user.avatar);
        if (typeof conference !== 'undefined' && conference) {
          try {
            conference.setLocalParticipantProperty("avatar", user.avatar);
          } catch (error) {
            console.warn("Jitsi conference update failed (likely not in a call yet):", error);
          }
        }

      
        if (socket && socket.connected) {
          socket.emit("updateUser", {
            user: { 
              id: user.id, 
              username: user.username, 
              avatar: user.avatar,
              usernameColor: user.usernameColor,
              badge: user.badge || null,
              level: user.level || 1,
              profileHeader: user.profileHeader,
              prestigeBadge: user.prestigeBadge || null,
            }
          });
        }

      
        const myIndex = currentUsers.findIndex(u => u && u.id === user.id);
        if (myIndex !== -1) {
          currentUsers[myIndex].avatar = user.avatar;
        }
        renderUsers(currentUsers);
       showToast("Avatar updated!");
      } else {
       showToast("Upload failed: " + xhr.responseText);
      }
    };

    xhr.onerror = () => {
      const progressEl = document.getElementById("uploadProgress");
      if (progressEl) progressEl.style.display = "none";
     showToast("Upload error");
    };

    xhr.send(formData);
  }, "image/png");
};


window.addEventListener("click", (e) => {
  const modal = document.getElementById("avatarEditorModal");
  if (e.target === modal) {
    modal.style.display = "none";
    if (cropper) cropper.destroy();
  }
});

function openImageModal(src) {
  const modal = document.getElementById('imageModal');
  const modalImg = document.getElementById('modalImage');
  modalImg.src = src;
  modal.classList.add('show');
  modal.onclick = function(e) {
    if (e.target === modal) {
      closeImageModal();
    }
  };

  let downloadBtn = document.getElementById('imageModalDownloadBtn');
  if (!downloadBtn) {
    downloadBtn = document.createElement('button');
    downloadBtn.id = 'imageModalDownloadBtn';
    downloadBtn.title = 'Download';
    downloadBtn.style.cssText = `
      position: fixed;
      top: 20px;
      right: 70px;
      background: rgba(0,0,0,0.7);
      border: none;
      color: #fff;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100000;
      transition: background 0.15s;
    `;
    downloadBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16"/></svg>`;
    downloadBtn.onmouseover = () => downloadBtn.style.background = "rgba(255,0,0,0.85)";
    downloadBtn.onmouseout = () => downloadBtn.style.background = "rgba(0,0,0,0.7)";
    downloadBtn.onclick = (e) => {
      e.stopPropagation();
      downloadMedia(modalImg.src);
    };
    document.body.appendChild(downloadBtn);
  }
  downloadBtn.onclick = (e) => {
    e.stopPropagation();
    downloadMedia(src);
  };
  downloadBtn.style.display = 'flex';

  let closeBtn = document.getElementById('imageModalCloseBtn');
  if (!closeBtn) {
    closeBtn = document.createElement('button');
    closeBtn.id = 'imageModalCloseBtn';
    closeBtn.title = 'Close';
    closeBtn.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(0,0,0,0.7);
      border: none;
      color: #fff;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100000;
      transition: background 0.15s;
    `;
    closeBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
    closeBtn.onmouseover = () => closeBtn.style.background = "rgba(255,0,0,0.85)";
    closeBtn.onmouseout = () => closeBtn.style.background = "rgba(0,0,0,0.7)";
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      closeImageModal();
    };
    document.body.appendChild(closeBtn);
  }
  closeBtn.style.display = 'flex';
}

function closeImageModal() {
  const modal = document.getElementById('imageModal');
  modal.classList.remove('show');
  const downloadBtn = document.getElementById('imageModalDownloadBtn');
  if (downloadBtn) downloadBtn.style.display = 'none';
  const closeBtn = document.getElementById('imageModalCloseBtn');
  if (closeBtn) closeBtn.style.display = 'none';
}



async function downloadMedia(url) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    const ext = url.split('?')[0].split('.').pop() || 'download';
    const filename = url.split('/').pop().split('?')[0] || `download.${ext}`;

    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error("Download failed:", err);
    showToast("❌ Download failed");
  }
}




document.addEventListener('keydown', function(e) {
  if (e.key === "Escape") {
    closeImageModal();
  }
});


const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");


function createBadgeSelector() {
  const container = document.getElementById("badgeSelector");
  const prestigeContainer = document.getElementById("prestigeBadgeSelector");
  if (!container) return;

  container.innerHTML = "";
  pepeList.forEach(filename => {
    const badgeUrl = `/avatars/${filename}`;
    const isSelected = user.badge === badgeUrl;

    const img = document.createElement("img");
    img.src = badgeUrl;
    img.alt = filename;
    img.style.width = "45px";
    img.style.height = "45px";
    img.style.borderRadius = "8px";
    img.style.cursor = "pointer";
    img.style.transition = "all 0.2s";
    img.style.background = "#2b2d31";
    img.style.padding = "4px";
    img.style.boxSizing = "border-box";
    img.style.border = isSelected ? "3px solid #FF0000" : "2px solid transparent";
    img.style.boxShadow = isSelected ? "0 0 12px #FF0000" : "none";
    img.onmouseover = () => { if (!isSelected) img.style.transform = "scale(1.06)"; };
    img.onmouseout  = () => { img.style.transform = "scale(1)"; };
    img.onclick = () => setBadge(badgeUrl);
    container.appendChild(img);
  });

 if (!prestigeContainer) return;
  prestigeContainer.innerHTML = "";

  const SERVER_PRESTIGE = SERVER_CONFIG.prestigeBadges || [];
  if (SERVER_PRESTIGE.length === 0) return;

  const divider = document.createElement("div");
  divider.style.cssText = "grid-column: 1 / -1; margin: 0 0 4px; border-top: 1px solid #40444b; padding-top: 8px;";
  divider.innerHTML = `<span style="font-size:11px;color:#ffd700;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">🏆 Prestige Badges</span>`;
  prestigeContainer.appendChild(divider);

  SERVER_PRESTIGE.forEach(p => {
    const isUnlocked = unlockedPrestigeBadges.includes(p.badge);
    const isSelected = isUnlocked && user.prestigeBadge === p.badge;

    const wrapper = document.createElement("div");
    wrapper.style.cssText = `
      display:flex; flex-direction:column; align-items:center; gap:4px;
      cursor:${isUnlocked ? "pointer" : "not-allowed"};
      opacity:${isUnlocked ? "1" : "0.4"};
    `;
    if (!isUnlocked) wrapper.title = `Unlocks at Level ${p.level}`;

    const img = document.createElement("img");
    img.src = p.badge;
    img.style.cssText = `
      width:45px; height:45px; border-radius:8px; transition:all 0.2s;
      background:#2b2d31; padding:4px; box-sizing:border-box;
      border: ${isSelected ? "3px solid #FF0000" : (isUnlocked ? "2px solid #ffd70055" : "2px solid #40444b")};
      box-shadow: ${isSelected ? "0 0 12px #FF0000" : "none"};
      ${!isUnlocked ? "filter:grayscale(1);" : ""}
    `;

    const label = document.createElement("span");
    label.textContent = isUnlocked ? p.label : `Lvl ${p.level}`;
    label.style.cssText = `
      font-size:10px; font-weight:600; text-align:center;
      color:${isUnlocked ? "#ffd700" : "#72767d"};
    `;

    wrapper.appendChild(img);
    wrapper.appendChild(label);
    if (isUnlocked) wrapper.onclick = () => setPrestigeBadge(p.badge);

    prestigeContainer.appendChild(wrapper);
  });
}


const originalSetBadge = setBadge;
settingsBtn.onclick = () => {
  settingsModal.classList.add("show");
  document.querySelectorAll(".settings-tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
  const appearanceTab = document.querySelector('.settings-tab[data-tab="appearance"]');
  const appearanceContent = document.getElementById("appearanceTab");
    updateNamePreview(user.usernameColor || 'username-cyan');
    const headerPreview = document.getElementById("profileHeaderPreview");
  if (headerPreview && user.profileHeader) {
    headerPreview.style.backgroundImage = `url('${sanitizeAvatar(user.profileHeader)}')`;
  } else if (headerPreview) {
    headerPreview.style.backgroundImage = 'linear-gradient(135deg, #000000, #ffffff)';
  }
  if (appearanceTab) appearanceTab.classList.add("active");
  if (appearanceContent) appearanceContent.classList.add("active");
  updateBannerPreview();
  document.getElementById("settingsPfp").src = sanitizeAvatar(user.avatar);
  document.getElementById("settingsNameInput").value = user.username;
  document.getElementById("settingsStatusInput").value = user.customStatus || "";
  BadgeBtw();
  createBadgeSelector();
  renderGradientButtons();
  renderAnimatedGradientButtons();
  loadNotifSettings();

  const adminTabBtn = document.getElementById('adminTabBtn');
  if (adminTabBtn) {
    adminTabBtn.style.display = (user.isAdmin || user.isDeveloper) ? 'block' : 'none';
  }

  const overlayTabBtn = document.querySelector('.settings-tab[data-tab="overlay"]');
  const isElectron = !!window.electronAPI;
  if (overlayTabBtn) {
    overlayTabBtn.style.display = isElectron ? '' : 'none';
  }
};

document.querySelectorAll('.channel-item').forEach(channel => {
  const bell = document.createElement('img');
  bell.className = 'channel-bell';
  bell.style.cssText = `
    position: absolute;
    right: 34px;
    width: 16px;
    height: 16px;
    cursor: pointer;
    opacity: 0.5;
    transition: all 0.2s;
    filter: brightness(0) invert(1);
  `;
  
  const isEnabled = localStorage.getItem(`notif_${channel.dataset.channel}`) !== 'false';
  bell.src = isEnabled ? '/svgs/bell-on.svg' : '/svgs/bell-off.svg';
  bell.style.opacity = isEnabled ? '1' : '0.3';
  
  bell.onclick = (e) => {
    e.stopPropagation();
    const channelName = channel.dataset.channel;
    const enabled = localStorage.getItem(`notif_${channelName}`) !== 'false';
    localStorage.setItem(`notif_${channelName}`, enabled ? 'false' : 'true');
    bell.src = enabled ? '/svgs/bell-off.svg' : '/svgs/bell-on.svg';
    bell.style.opacity = enabled ? '0.3' : '1';
  };
  
  channel.style.position = 'relative';
  channel.appendChild(bell);
});


document.querySelectorAll(".settings-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    if (tab.dataset.tab === "overlay" && !window.electronAPI) return;
    document.querySelectorAll(".settings-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

    tab.classList.add("active");

    const targetContent = document.getElementById(tab.dataset.tab + "Tab");
    if (targetContent) {
      targetContent.classList.add("active");

      if (tab.dataset.tab === "notifications") {
        loadNotifSettings();
      }
      if (tab.dataset.tab === "audio") {
        initAudioTab();
      } else {
        stopAudioPreview();
      }
      if (tab.dataset.tab === "overlay") {
  loadOverlaySettings();
}
    }
  });
});
document.getElementById("closeSettingsBtn").onclick = () => settingsModal.classList.remove("show");
settingsModal.onclick = (e) => { if (e.target === settingsModal) settingsModal.classList.remove("show"); };

let userXP = 0;
let userLevel = 1;
const XP_PER_LEVEL = 100;





function updateCircularLevel() {
  const levelEl = document.getElementById("levelText");
  const circle = document.getElementById("xpCircle");
  const container = document.getElementById("levelContainer");

  const level = user.level || 1;
  const xp = user.xp || 0;
 const lvlColor = getLevelColor(level); 
  function getXpForLevel(lvl) {
    if (lvl < 10) return 100;
    return Math.floor(100 * Math.pow(1.05, lvl - 10));
  }

  let xpAtCurrentLevel = 0;
  for (let i = 1; i < level; i++) {
    xpAtCurrentLevel += getXpForLevel(i);
  }

  const xpNeeded = getXpForLevel(level);
  const xpIntoLevel = Math.max(0, xp - xpAtCurrentLevel);
  const progress = Math.min(xpIntoLevel / xpNeeded, 1);

  levelEl.textContent = level;
   levelEl.style.color = lvlColor;
  circle.style.stroke = lvlColor;
  circle.style.strokeDashoffset = 94.2 * (1 - progress);
  container.title = `${xpIntoLevel} / ${xpNeeded} XP`;
}


function setPrestigeBadge(badgeUrl) {
  if (badgeUrl === user.prestigeBadge) {
    user.prestigeBadge = null;
  } else {
    user.prestigeBadge = badgeUrl;
  }

  localStorage.setItem("chatUser", JSON.stringify(user));

    if (conference) {
    conference.setLocalParticipantProperty("prestigeBadge", user.prestigeBadge || "");
  }

  if (socket && socket.connected) {
    socket.emit("updateUser", {
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        badge: user.badge || null,
        prestigeBadge: user.prestigeBadge || null
      }
    });
  }

  createBadgeSelector();
 showToast(user.prestigeBadge ? "Prestige badge applied!" : "Prestige badge removed");
}


function showLevelUpNotification(newLevel) {
   console.log("showLevelUpNotification called, plinkoOpen =", window.plinkoOpen);
  if (window.plinkoOpen) {
    console.log("SUPPRESSED");
    return;
  }
  const banner = document.createElement('div');
  banner.classList.add('banner-notification', 'stacked-notification','timer-6s');
  const topOffset = getStackOffset();

  banner.style.cssText = `
    position: fixed;
    top: ${topOffset}px;
    left: 50%; 
    transform: translateX(-50%);
    background: #111214;
    border: 1px solid #3a3c42;
    border-left: 4px solid #FF0000;
    color: white;
    padding: 14px 16px;
    border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.7), 0 0 20px
    z-index: 10001;
    width: 320px;
    animation: bannerDropIn 0.3s ease-out;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow: hidden;
    z-index: 99999;
  `;

  const topRow = document.createElement('div');
  topRow.style.cssText = 'display:flex; align-items:center; gap:10px;';

  const iconWrapper = document.createElement('div');
  iconWrapper.style.cssText = `
    width: 42px; height: 42px; border-radius: 50%;
    background: linear-gradient(135deg, #FF0000, #ff0000);
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; flex-shrink: 0;
    box-shadow: 0 0 12px rgba(255, 0, 0, 0.6);
  `;
  iconWrapper.textContent = '⬆';

  const nameCol = document.createElement('div');
  nameCol.style.cssText = 'display:flex; flex-direction:column; gap:3px; flex:1; min-width:0;';

  const titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex; align-items:center; gap:6px;';

  const titleSpan = document.createElement('span');
  titleSpan.style.cssText = 'font-weight:700; font-size:14px; color:#FF0000;';
  titleSpan.textContent = 'Level Up!';

  const levelBadge = document.createElement('span');
  levelBadge.style.cssText = `
    background: rgba(255, 0, 0, 0.2); color: #FF0000;
    font-size: 11px; font-weight: 800;
    padding: 2px 8px; border-radius: 4px;
    border: 1px solid #FF0000 flex-shrink: 0;
  `;
  levelBadge.textContent = `Level ${newLevel}`;

  titleRow.appendChild(titleSpan);
  titleRow.appendChild(levelBadge);

  const subText = document.createElement('div');
  subText.style.cssText = 'font-size:12px; color:#b9bbbe;';
  subText.textContent = `You reached level ${newLevel}! Keep it up!.`;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = `
    background: none; border: none; color: #72767d;
    font-size: 14px; cursor: pointer; padding: 0;
    flex-shrink: 0; align-self: flex-start; transition: color 0.15s;
  `;
  closeBtn.onmouseover = () => closeBtn.style.color = '#fff';
  closeBtn.onmouseout = () => closeBtn.style.color = '#72767d';
  closeBtn.onclick = () => banner.remove();

  nameCol.appendChild(titleRow);
  nameCol.appendChild(subText);

  topRow.appendChild(iconWrapper);
  topRow.appendChild(nameCol);
  topRow.appendChild(closeBtn);
  banner.appendChild(topRow);
  document.body.appendChild(banner);


  sendNotification('⬆ Level Up!', `You reached Level ${newLevel}! Keep it up.`, {
    icon: sanitizeAvatar(user.avatar),
    tag: `levelup-${newLevel}`,
    requireInteraction: false
  });

  if (notifSettings.sound) {
    const audio = new Audio('/sounds/service-login.oga');
    audio.volume = 0.4;
    audio.play().catch(() => {});
  }

  
  setTimeout(() => {
    if (banner.parentNode) {
      banner.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
      banner.style.opacity = '0';
     banner.style.transform = 'translate(-50%, -100%)';
      setTimeout(() => banner.remove(), 400);
    }
  }, 6000);

  renderUsers(currentUsers);
}


let xpInterval = null;
let connection = null;
let conference = null;
let localAudioTrack = null;
let remoteTracks = new Map();



async function initJitsi(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (window.jitsiInitializing) {
      const checkInterval = setInterval(() => {
        if (window.jitsiInitialized || window.jitsiInitFailed) {
          clearInterval(checkInterval);
          window.jitsiInitFailed ? reject(new Error("Jitsi init failed")) : resolve();
        }
      }, 100);
      return;
    }

  if (!window.JitsiMeetJS) {
      console.error("❌ JitsiMeetJS not loaded yet!");
      reject(new Error("JitsiMeetJS library not loaded"));
      return;
    }
    if (window.jitsiInitialized && connection && connection.state === 'CONNECTED') {
      console.log("Jitsi already connected");
      resolve();
      return;
    }

 
    if (connection) {
      try {
        connection.disconnect();
      } catch (e) {}
      connection = null;
    }


    window.jitsiInitializing = true;
    window.jitsiInitialized = false;
    window.jitsiInitFailed = false;
    
    const timeoutId = setTimeout(() => {
      window.jitsiInitFailed = true;
      window.jitsiInitializing = false;
      if (connection) {
        try {
          connection.disconnect();
        } catch (e) {}
        connection = null;
      }
      reject(new Error("Jitsi connection timeout"));
    }, timeoutMs);

   JitsiMeetJS.init({
  disableAudioLevels: false,
  p2p: { enabled: JITSI_CONFIG.p2pEnabled || false },
});

connection = new JitsiMeetJS.JitsiConnection(null, null, {
  hosts: {
    domain: JITSI_CONFIG.domain,
    muc: JITSI_CONFIG.muc
  },
  serviceUrl: JITSI_CONFIG.bosh,
  enableLipSync: true,
  p2p: {
    enabled: JITSI_CONFIG.p2pEnabled || false,
    useStunTurn: false
  },
  focusUserJid: JITSI_CONFIG.focusUserJid,
  deploymentInfo: {
    userRegion: "us"
  }
});

    const onConnected = () => {
      clearTimeout(timeoutId);
      console.log("XMPP Connected to Jitsi");
      window.jitsiInitialized = true;
      window.jitsiInitializing = false;
      connection.removeEventListener(
        JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED,
        onConnected
      );
      connection.removeEventListener(
        JitsiMeetJS.events.connection.CONNECTION_FAILED,
        onFailed
      );
      startConnectionHealthCheck();
      resolve();
    };

    const onFailed = (error) => {
      clearTimeout(timeoutId);
      console.error("❌ XMPP Connection failed:", error);
      window.jitsiInitFailed = true;
      window.jitsiInitializing = false;
      connection.removeEventListener(
        JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED,
        onConnected
      );
      connection.removeEventListener(
        JitsiMeetJS.events.connection.CONNECTION_FAILED,
        onFailed
      );
      reject(error);
    };

    connection.addEventListener(
      JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED,
      onConnected
    );
    connection.addEventListener(
      JitsiMeetJS.events.connection.CONNECTION_FAILED,
      onFailed
    );

    connection.connect();
  });
}


function enableVoiceChannelButtons() {
  const buttons = document.querySelectorAll('.voice-channel');
  if (!window.jitsiInitialized || buttons.length === 0) {
   
    setTimeout(enableVoiceChannelButtons, 500);
    return;
  }
  buttons.forEach(item => {
    item.style.opacity = '';
    item.style.cursor = '';
    item.title = '';
  });
}
let connectionHealthCheck = null;

function startConnectionHealthCheck() {
  if (connectionHealthCheck) clearInterval(connectionHealthCheck);
  console.log("💓 Health check started");
  connectionHealthCheck = setInterval(() => {
    console.log(`❤️‍🩹 HEALTH CHECK | inVoice: ${!!currentVoiceRoom} | initializing: ${!!window.jitsiInitializing} | initialized: ${!!window.jitsiInitialized} | connection: ${!!connection}`);
    if (window.jitsiInitializing) {
      console.log("⏳ Still initializing, skipping check");
      return;
    }
    if (!connection || !window.jitsiInitialized) {
      console.warn("⚠️ Jitsi connection lost, reinitializing...");
      window.jitsiInitialized = false;
      connection = null;

   initJitsi()
  .then(() => {
    console.log("Jitsi reinitialized successfully");
    enableVoiceChannelButtons();
    socket.emit("getChannels");
    if (currentVoiceRoom) {
      joinVoiceChannel(currentVoiceRoom);
    }
  })
        .catch(err => {
          console.error("❌ Jitsi reinit failed:", err);
        });
    } else {
      console.log("Jitsi connection healthy");
    }

  }, 30000);
}

function stopConnectionHealthCheck() {
  if (connectionHealthCheck) {
    clearInterval(connectionHealthCheck);
    connectionHealthCheck = null;
  }
}



let voiceRoomParticipants = new Map();

socket.on("voiceRoomUpdate", (data) => {
  const { roomName, participants, count } = data;
  voiceRoomParticipants.set(roomName, participants);
  
  const countEl = document.getElementById(`vcCount-${roomName}`);
  if (countEl) {
    if (roomName === currentVoiceRoom) {
      const localCount = (conference ? remoteTracks.size + 1 : 0);
      countEl.textContent = localCount;
    } else {
      countEl.textContent = count;
    }
  }
  updateVoiceChannelParticipantLists();
});



async function joinVoiceChannel(roomSlug) {
  if (conference) leaveVoice();
  currentVoiceRoom = roomSlug;

  voiceStates.clear();

  try {
    if (!window.jitsiInitialized || !connection) {
      window.jitsiInitialized = false;
      if (connection) { try { connection.disconnect(); } catch (e) {} connection = null; }
      await initJitsi(15000);
    }
  } catch (error) {
    console.error("Failed to initialize Jitsi:", error);
   showToast("Voice connection failed. Try again.");
    currentVoiceRoom = null;
    return;
  }
  document.getElementById('voiceControls').style.display = 'flex';
  document.getElementById('voiceRoomLabel').textContent = roomSlug;

  socket.emit("voiceJoin", {
    roomName: roomSlug,
    userId: user.id,
    username: user.username,
    avatar: user.avatar,
    usernameColor: user.usernameColor,
    level: user.level || 1,
    badge: user.badge || null
  });

  setTimeout(() => socket.emit("requestVoiceStates", { roomName: roomSlug }), 800);
  document.getElementById('voicePanel').classList.add('show');
  conference = connection.initJitsiConference(roomSlug, {
    startAudioOnly: JITSI_CONFIG.startAudioOnly !== false,
    p2p: { enabled: false },
    channelLastN: -1
  });

 
  conference.on(JitsiMeetJS.events.conference.TRACK_ADDED, onRemoteTrackAdded);
  conference.on(JitsiMeetJS.events.conference.TRACK_REMOVED, onRemoteTrackRemoved);
  conference.on(JitsiMeetJS.events.conference.USER_JOINED, () => { userjoinSound(); updateVoiceUI(); });
  conference.on(JitsiMeetJS.events.conference.USER_LEFT, () => { userleaveSound(); updateVoiceUI(); });
  conference.on(JitsiMeetJS.events.conference.PARTICIPANT_PROPERTY_CHANGED, (participant, propertyKey, oldValue, newValue) => {
  updateVoiceUI();
  pushOverlayVoiceUpdate();
});

  conference.on(JitsiMeetJS.events.conference.CONFERENCE_JOINED, () => {
  console.log("Conference joined:", roomSlug);

  conference.setDisplayName(user.username);
  conference.setLocalParticipantProperty("userId", user.id);
  conference.setLocalParticipantProperty("avatar", user.avatar);
  conference.setLocalParticipantProperty("usernameColor", user.usernameColor || "username-cyan");
  conference.setLocalParticipantProperty("badge", user.badge || "");
  conference.setLocalParticipantProperty("banner", user.banner || "");
  conference.setLocalParticipantProperty("level", String(user.level || 1));
  conference.setLocalParticipantProperty("isAdmin", String(user.isAdmin || false));
  conference.setLocalParticipantProperty("isDeveloper", String(user.isDeveloper || false));
  conference.setLocalParticipantProperty("isPromptEngineer", String(user.isPromptEngineer || false));
  conference.setLocalParticipantProperty("prestigeBadge", user.prestigeBadge || "");
  conference.setLocalParticipantProperty("customRoleIds", JSON.stringify(user.customRoleIds || []));

  startPingMonitor();
  updateVoiceUI();
  setTimeout(() => {
    if (!localAudioTrack) {
      console.warn("👻 Ghost join no local audio track after 4s, rejoining");
      const room = currentVoiceRoom;
      leaveVoice();
      setTimeout(() => joinVoiceChannelWithTimeout(room), 1000);
    }
  }, 4000);
});

  try {
    const tracks = await JitsiMeetJS.createLocalTracks({
      devices: ['audio'],
      constraints: { audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } }
    });
    localAudioTrack = tracks[0];

    if (!conference) {
      console.error("Conference was destroyed before track could be added");
      return;
    }

    conference.addTrack(localAudioTrack);
    currentActiveAudioTrack = localAudioTrack;
    localAudioTrack.addEventListener(
      JitsiMeetJS.events.track.TRACK_AUDIO_LEVEL_CHANGED,
      (level) => handleAudioLevel("local", level)
    );
    console.log("Local microphone added");
} catch (e) {
    console.error("Microphone error:", e);
   showToast("🎙️ No microphone detected - you have been removed from the voice channel.\n\nPlease check your mic in system settings and try again.");
  }

 
  conference.join();

  voiceStates.set(user.id, { isMuted: false, isDeafened: false });
  updateVoiceUI();
  setActiveVoiceChannel(roomSlug);
}




function refreshLiveStreamsModal() {
  const modal = document.getElementById('liveStreamsModal');
  if (modal && modal.style.display === 'flex') {
    displayStreams(cachedLiveStreams);
  }
}

let muteCheckInterval = null;
let screenShareIntervals = new Map();

function onRemoteTrackAdded(track) {
  const participantId = track.getParticipantId();
  if (conference && participantId === conference.myUserId()) return;
  
  if (track.getType() === 'audio') {
    const audio = document.createElement('audio');
    audio.autoplay = true;
    track.attach(audio);
    document.body.appendChild(audio);
    if (isDeafened) {
      audio.muted = true;
    }
    remoteTracks.set(participantId, audio);
    applySavedVolumesToUser(participantId);

    track.addEventListener(
      JitsiMeetJS.events.track.TRACK_AUDIO_LEVEL_CHANGED,
      (level) => {
        handleAudioLevel(participantId, level);
      }
    );
  }

  if (track.getType() === 'video') {
    console.log("📹 VIDEO TRACK from", participantId, "| P2P:", track.isP2P, "| Muted:", track.isMuted());
    
    const participant = conference?.getParticipantById(participantId);
    const name = participant?.getDisplayName() || "Someone";
    const isScreenShare = track.getVideoType && track.getVideoType() === 'desktop';
    const label = isScreenShare ? `🖥️ ${name}'s screen` : `📹 ${name}'s camera`;
    
    document.querySelectorAll(`[data-video-id="${participantId}"]`).forEach(el => {
      el.remove();
    });

   const createVideoElement = () => {
  const participant = conference?.getParticipantById(participantId);
  const name = participant?.getDisplayName() || "Someone";
  const isScreenShare = track.getVideoType && track.getVideoType() === 'desktop';
 
  const wrapper = document.createElement("div");
  wrapper.className = "ss-card";
  wrapper.setAttribute("data-video-id", participantId);
  wrapper.setAttribute("data-video-type", isScreenShare ? "screen" : "camera");
 
  const loading = document.createElement("div");
  loading.className = "ss-loading";
  const spinner = document.createElement("div");
  spinner.className = "ss-spinner";
  const loadingText = document.createElement("div");
  loadingText.textContent = isScreenShare ? `Loading ${name}'s stream…` : `Loading ${name}'s camera…`;
  loading.appendChild(spinner);
  loading.appendChild(loadingText);
  wrapper.appendChild(loading);
 
  const video = document.createElement("video");
  video.className = "ss-video";
  video.autoplay = true;
  video.playsInline = true;
  video.muted = false;
  video.style.objectFit = isScreenShare ? "contain" : "cover";
  video.style.opacity = "0";
  video.style.transition = "opacity 0.2s ease";
  wrapper.appendChild(video);
 
  const chip = document.createElement("div");
  chip.className = "ss-chip";
  const chipDot = document.createElement("span");
  chipDot.className = "ss-dot";
  const chipText = document.createElement("span");
  chipText.textContent = isScreenShare ? `${name} is sharing their screen` : `${name}'s camera`;
  chip.appendChild(chipDot);
  chip.appendChild(chipText);
  wrapper.appendChild(chip);
 
  const controls = document.createElement("div");
  controls.className = "ss-controls";
 
  const pipBtn = document.createElement("button");
  pipBtn.className = "ss-btn";
  pipBtn.title = "Picture-in-Picture";
  pipBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="14" rx="2"/><rect x="12" y="11" width="7" height="5" rx="1" fill="currentColor" stroke="none"/></svg>`;
pipBtn.addEventListener("click", (e) => {
  e.stopPropagation();
 
  if (typeof video.requestPictureInPicture !== "function") {
    showToast("Picture-in-Picture not supported in this browser");
    return;
  }
 
  video.disablePictureInPicture = false;
 
  const attemptPiP = async () => {
    try {
      if (video.paused) {
        await video.play();
      }
      await video.requestPictureInPicture();
      pipBtn.innerHTML = "✓";
      const screenContainer = document.getElementById("screenContainer");
      if (screenContainer) {
        screenContainer.classList.remove("show");
        screenContainer.style.display = "none";
      }
    } catch (err) {
      console.error("PiP error:", err.name, err.message);
      showToast("Couldn't enter Picture-in-Picture: " + (err?.message || "unknown error"));
    }
  };
 
  if (video.readyState >= 1) {
    attemptPiP();
  } else {
    video.addEventListener("loadedmetadata", attemptPiP, { once: true });
  }
});
 
  const fullscreenBtn = document.createElement("button");
  fullscreenBtn.className = "ss-btn";
  fullscreenBtn.title = "Fullscreen";
  fullscreenBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`;
  fullscreenBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (video.requestFullscreen) video.requestFullscreen().catch(err => console.error("Fullscreen error:", err));
  });
 
  controls.appendChild(pipBtn);
  controls.appendChild(fullscreenBtn);
  wrapper.appendChild(controls);
 
  const volumeWrap = document.createElement("div");
  volumeWrap.className = "ss-volume";
  const volumeSlider = document.createElement("input");
  volumeSlider.type = "range";
  volumeSlider.min = "0";
  volumeSlider.max = "200";
  volumeSlider.value = "100";
  const volumePct = document.createElement("span");
  volumePct.className = "ss-volume-pct";
  volumePct.textContent = "100%";
  volumeSlider.addEventListener("input", (e) => {
    const percent = parseInt(e.target.value);
    volumePct.textContent = percent + "%";
    const volume = Math.max(0, Math.min(2, percent / 100));
    const audio = remoteTracks.get(participantId);
    if (audio) audio.volume = volume;
    localStorage.setItem(`videoVolume_${participantId}`, volume.toString());
  });
  volumeWrap.appendChild(volumeSlider);
  volumeWrap.appendChild(volumePct);
  wrapper.appendChild(volumeWrap);
 
  const screenContainer = document.getElementById("screenContainer");
  if (screenContainer) {
    screenContainer.classList.add("show");
    screenContainer.style.display = "flex";
    screenContainer.appendChild(wrapper);
  }
 
  track.attach(video);
 
  video.addEventListener('loadedmetadata', () => {
    loading.style.display = "none";
    video.style.opacity = "1";
    video.play().catch(e => console.error("Play error:", e));
  }, { once: true });
 
video.addEventListener('leavepictureinpicture', () => {
  const screenContainer = document.getElementById("screenContainer");
 
  if (!track.isMuted()) {
    if (screenContainer) {
      screenContainer.classList.add("show");
      screenContainer.style.display = "flex"; 
    }
  } else {
    removeScreenCard("data-video-id", participantId);
  }
 
  pipBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="14" rx="2"/><rect x="12" y="11" width="7" height="5" rx="1" fill="currentColor" stroke="none"/></svg>`;
});
 
  return wrapper;
};

    let wrapper = null;
    if (!track.isMuted()) {
      wrapper = createVideoElement();
    }

    if (screenShareIntervals.has(participantId)) {
      clearInterval(screenShareIntervals.get(participantId));
    }

    const videoCheckInterval = setInterval(() => {
      const isMuted = track.isMuted();
      const hasWrapper = document.querySelector(`[data-video-id="${participantId}"]`);

    if (isMuted && hasWrapper) {
      console.log("🔇 Video track is now muted - removing video");
      removeScreenCard("data-video-id", participantId);
    } else if (!isMuted && !hasWrapper) {
      console.log("🎬 Video track is now unmuted - re-adding video");
      wrapper = createVideoElement();
    }
    }, 300);

    screenShareIntervals.set(participantId, videoCheckInterval);
  }

  updateVoiceUI();
}

const lastLoudAt = new Map();
const speakingState = new Map();
const smoothedLevels = new Map();

const THRESHOLD = 0.006;    
const GRACE_MS = 250;         
const SMOOTHING = 0.6;       

function handleAudioLevel(participantId, level) {
  if (level > THRESHOLD) {
    lastLoudAt.set(participantId, Date.now());
    setSpeaking(participantId, true);
  }
}
function setSpeaking(participantId, isSpeaking) {
  const wasSpeaking = speakingState.get(participantId) || false;
  if (isSpeaking === wasSpeaking) return;

  speakingState.set(participantId, isSpeaking);
  const el = document.querySelector(`[data-id="${participantId}"]`);
  if (el) el.classList.toggle("speaking", isSpeaking);
  pushOverlayVoiceUpdate();
}


setInterval(() => {
  const now = Date.now();
  lastLoudAt.forEach((ts, participantId) => {
    if (speakingState.get(participantId) && now - ts > GRACE_MS) {
      setSpeaking(participantId, false);
    }
  });
}, 100);

function onRemoteTrackRemoved(track) {
  if (track.getType() === 'audio') {
    const id = track.getParticipantId();
    if (remoteTracks.has(id)) {
      const audio = remoteTracks.get(id);
      audio.srcObject = null;
      audio.remove();
      remoteTracks.delete(id);
    }
    if (audioGainNodes.has(id)) {
      audioGainNodes.delete(id);
    }
    if (audioContexts.has(id)) {
      audioContexts.get(id).context.close().catch(() => {});
      audioContexts.delete(id);
    }
    lastLoudAt.delete(id);
    speakingState.delete(id);
    smoothedLevels.delete(id);
    updateVoiceUI();
  }
  
  if (track.getType() === 'video') {
    const participantId = track.getParticipantId();
    console.log("🛑 VIDEO TRACK REMOVED from", participantId);
    if (screenShareIntervals.has(participantId)) {
      clearInterval(screenShareIntervals.get(participantId));
      screenShareIntervals.delete(participantId);
      console.log("Cleared interval for", participantId);
    }
    
    const wrapper = document.querySelector(`[data-screen-id="${participantId}"]`);
    if (wrapper) {
      const video = wrapper.querySelector('video');
      if (video) {
        try {
          track.detach(video);
        } catch (e) {
          console.error("Error detaching video:", e);
        }
      }
      wrapper.remove();
      console.log("Remote screen wrapper removed for", participantId);
    }
    
    removeScreenCard("data-video-id", participantId);
    updateVoiceUI();
  }
}

function updateVoiceUI() {
  voiceStates.set(user.id, { 
    isMuted: isCurrentlyMuted, 
    isDeafened: isDeafened 
  });

  const container = document.getElementById('voiceParticipants');
  if (!container) return;

  container.innerHTML = '';
const localRow = buildParticipantRow(
    "local", user.avatar, user.username,
    user.usernameColor || "username-cyan",
    user.level || 1, user.badge || null,
    user.isAdmin || false, user.isDeveloper || false, user.isPromptEngineer || false,
    user.prestigeBadge || null,
    user.customRoleIds || []
);

  localRow.addEventListener('contextmenu', (e) => {
    const usernameEl = localRow.querySelector('.username-wrapper');
    const username = usernameEl ? usernameEl.textContent.trim() : 'You';
    showVolumeContextMenu(e, "local", username);
  });

  container.appendChild(localRow);
  remoteTracks.forEach((audio, id) => {
    const participant = conference ? conference.getParticipantById(id) : null;
    if (!participant) return;

    const remoteCustomRoleIds = (() => {
  try { return JSON.parse(participant.getProperty("customRoleIds") || "[]"); }
  catch { return []; }
})();

    const remoteRow = buildParticipantRow(
      id,
      participant.getProperty("avatar") || "/avatars/default1.png",
      participant.getDisplayName() || "Anonymous",
      participant.getProperty("usernameColor") || "username-cyan",
      parseInt(participant.getProperty("level")) || 1,
      participant.getProperty("badge") || null,
      participant.getProperty("isAdmin") === "true",
      participant.getProperty("isDeveloper") === "true",
      participant.getProperty("isPromptEngineer") === "true",
      participant.getProperty("prestigeBadge") || null,
      remoteCustomRoleIds
    );

    remoteRow.addEventListener('contextmenu', (e) => {
      const usernameEl = remoteRow.querySelector('.username-wrapper');
      const username = usernameEl ? usernameEl.textContent.trim() : 'User';
      showVolumeContextMenu(e, id, username);
    });

    container.appendChild(remoteRow);
  });

  if (currentVoiceRoom) {
    const countEl = document.getElementById(`vcCount-${currentVoiceRoom}`);
    if (countEl) {
      countEl.textContent = remoteTracks.size + 1;
    }
  }


  document.querySelectorAll('.voice-participant').forEach(el => {
    const id = el.getAttribute('data-id');
    if (speakingState.get(id)) {
      el.classList.add("speaking");
    }
  });

  pushOverlayVoiceUpdate();
  updateVoiceChannelParticipantLists();
}

function buildParticipantRow(id, avatar, name, colorClass, level, badge, isAdmin, isDeveloper = false, isPromptEngineer = false,prestigeBadge = null, customRoleIds = []) {
  const div = document.createElement('div');
  div.className = 'voice-participant';
  div.setAttribute('data-username-color', colorClass || 'username-cyan');
  div.setAttribute("data-id", id);
  const realUserId = (id === "local") ? user.id : id;
  const stateKey = (id === "local") ? user.id : (conference?.getParticipantById(id)?.getProperty("userId") || id);
const state = voiceStates.get(stateKey) || { isMuted: false, isDeafened: false };

  const img = document.createElement('img');
  img.src = sanitizeAvatar(avatar);
  img.style.cssText = "width:42px;height:42px;border-radius:50%;flex-shrink:0;";

  const textSpan = document.createElement('span');
  textSpan.className = `username-wrapper ${colorClass || 'username-cyan'}`;
  textSpan.setAttribute('data-text', name || "Anonymous");
  textSpan.textContent = name || "Anonymous";
   
    const badgeColor = colorClassToHex[colorClass] || '#00f2ff';
    const rgbColor = hexToRgb(badgeColor);

  const metaSpan = document.createElement('span');
  metaSpan.style.cssText = "margin-left:4px; vertical-align:middle; white-space:nowrap; display:flex; align-items:center; gap:4px;";
const displayLevel = level || 1;
const lvlColor = getLevelColor(displayLevel);
const lvlRgb = getLevelRgb(displayLevel);
const levelBadge = document.createElement('span');
levelBadge.style.cssText = `font-size:10px; color:${lvlColor}; -webkit-text-fill-color:${lvlColor}; background:rgba(${lvlRgb.r},${lvlRgb.g},${lvlRgb.b},0.2); -webkit-background-clip:initial; background-clip:initial; font-weight:700; padding:2px 6px; border-radius:3px; border:1px solid ${lvlColor}; margin-left:4px; display:inline-block; position:relative;`;
levelBadge.textContent = displayLevel;
metaSpan.appendChild(levelBadge);
  if (state.isMuted) {
    const muteIcon = document.createElement('img');
    muteIcon.src = '/svgs/mic-on.svg';
    muteIcon.title = 'Muted';
    muteIcon.style.cssText = 'width:14px;height:14px;opacity:0.9;filter:brightness(0)saturate(100%)invert(13%)sepia(99%)saturate(3465%)hue-rotate(0deg)brightness(104%);';
    metaSpan.appendChild(muteIcon);
  }

  if (state.isDeafened) {
    const deafIcon = document.createElement('img');
    deafIcon.src = '/svgs/def.svg';
    deafIcon.title = 'Deafened';
    deafIcon.style.cssText = 'width:14px;height:14px;opacity:0.9;filter:brightness(0)saturate(100%)invert(13%)sepia(99%)saturate(3465%)hue-rotate(0deg)brightness(104%);';
    metaSpan.appendChild(deafIcon);
  }

  if (badge) {
    const badgeImg = document.createElement('img');
    badgeImg.src = sanitizeAvatar(badge);
    badgeImg.className = 'user-badge';
    badgeImg.style.cssText = "width:23px;height:23px;vertical-align:middle;margin-left:3px;";
    metaSpan.appendChild(badgeImg);
  }

  if (prestigeBadge) {
  const pBadge = document.createElement('img');
  pBadge.src = sanitizeAvatar(prestigeBadge);
  pBadge.className = 'user-badge';
  pBadge.title = "Prestige Badge";
  metaSpan.appendChild(pBadge);
}
if (isAdmin) {
  metaSpan.appendChild(createCrownBadge(23));
}
if (isDeveloper) {
  metaSpan.appendChild(createDeveloperBadge(23));
}
if (isPromptEngineer) {
  metaSpan.appendChild(createPromptEngineerBadge(23));
}

if (customRoleIds && customRoleIds.length) {
  metaSpan.appendChild(createRoleTags(customRoleIds, true));
}

  div.appendChild(img);
  div.appendChild(textSpan);
  div.appendChild(metaSpan);
  return div;
}



let currentVolumeSliders = new Map();
function showVolumeContextMenu(e, participantId, username) {
  e.preventDefault();
  document.querySelectorAll('.volume-context-menu').forEach(m => m.remove());

const participant = participantId !== "local" ? conference?.getParticipantById(participantId) : null;
const isBotParticipant = participant?.getProperty("isBot") === "true";

  const menu = document.createElement('div');
  menu.className = 'volume-context-menu';
  menu.style.cssText = `
    position: fixed;
    background: rgb(0 0 0 / 96%);
    border: 1px solid rgb(32 34 37);
    border-radius: 8px;
    padding: 12px;
    width: 240px;
    box-shadow: rgba(0, 0, 0, 0.6) 0px 8px 32px;
    z-index: 10002;
    color: white;
    font-size: 14px;
    left: 243px;
    top: 284px;
  `;

  let storedVolume = currentVolumeSliders.get(participantId);
  if (storedVolume === undefined) {
    const saved = localStorage.getItem(`vol_${participantId}`);
    storedVolume = saved ? parseFloat(saved) : 1;
  }
  
  const sliderValue = Math.max(0, Math.min(200, Math.round(storedVolume * 100)));

  menu.innerHTML = `
    <div style="font-weight:600; margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid #42444a;">
      ${username}
    </div>
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
      <span style="font-size:13px; color:#b9bbbe; width:50px;">Volume</span>
<input type="range" min="0" max="200" value="${sliderValue}" step="1" 
       ${isBotParticipant ? "disabled" : ""}
       style="flex:1; accent-color:#FF0000; ${isBotParticipant ? "opacity:0.4; cursor:not-allowed;" : ""}">
<span id="volValue" style="font-size:13px; color:#b9bbbe; width:40px; text-align:right;">
  ${isBotParticipant ? "-" : sliderValue + '%'}
</span>
    </div>
    <button id="viewProfileBtn" style="
      width: 100%;
      background: #FF0000;
      color: white;
      border: none;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      font-weight: 500;
      transition: 0.2s;
    ">View Profile</button>
  `;

  menu.style.left = `${e.pageX + 10}px`;
  menu.style.top = `${e.pageY + 10}px`;
  document.body.appendChild(menu);

  const range = menu.querySelector('input');
  const valueDisplay = menu.querySelector('#volValue');
  const viewProfileBtn = menu.querySelector('#viewProfileBtn');

if (!isBotParticipant) {
  range.addEventListener('input', () => {
    const percent = parseInt(range.value);
    valueDisplay.textContent = percent + '%';
    const volume = Math.max(0, Math.min(2, percent / 100));
    currentVolumeSliders.set(participantId, volume);
    localStorage.setItem(`vol_${participantId}`, volume.toString());
    applyVolumeToUser(participantId, volume);
  });
}

  viewProfileBtn.addEventListener('mouseover', () => {
    viewProfileBtn.style.background = '#FF0000';
  });

  viewProfileBtn.addEventListener('mouseout', () => {
    viewProfileBtn.style.background = '#313131';
  });

 viewProfileBtn.addEventListener('click', () => {
  let userData;
  if (participantId === "local") {
    userData = {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      usernameColor: user.usernameColor || "username-cyan",
      level: user.level || 1,
      badge: user.badge || null,
      prestigeBadge: user.prestigeBadge || null,
      isAdmin: user.isAdmin || false,
      isDeveloper: user.isDeveloper || false,
      isPromptEngineer: user.isPromptEngineer || false,
      status: "online",
      customStatus: user.customStatus || "",
      banner: user.banner || "",
      profileHeader: user.profileHeader || "",
      userAgent: navigator.userAgent,
      musicStatus: window.currentMusicStatus || null
    };
  } else {
    const userFromList = currentUsers.find(u => 
      u.id === participantId || 
      u.username === (conference?.getParticipantById(participantId)?.getDisplayName())
    );

    const participant = conference?.getParticipantById(participantId);

    if (userFromList) {
      userData = { ...userFromList };
    } else if (participant) {
      userData = {
        id: participantId,
        username: participant.getDisplayName() || username,
        avatar: participant.getProperty("avatar") || "/avatars/default1.png",
        usernameColor: participant.getProperty("usernameColor") || "username-cyan",
        level: parseInt(participant.getProperty("level")) || 1,
        badge: participant.getProperty("badge") || null,
        prestigeBadge: participant.getProperty("prestigeBadge") || null,
        isAdmin: participant.getProperty("isAdmin") === "true",
        isDeveloper: participant.getProperty("isDeveloper") === "true",
        isPromptEngineer: participant.getProperty("isPromptEngineer") === "true",
        status: "online",
        customStatus: participant.getProperty("customStatus") || "",
        banner: participant.getProperty("banner") || "",
        profileHeader: participant.getProperty("profileHeader") || "",
        userAgent: navigator.userAgent
      };
    } else {
     showToast("Could not load user profile");
      return;
    }
  }

  showProfilePopup(userData, e.pageX, e.pageY);
  menu.remove();
});
}

 

const audioContexts = new Map();

function getOrCreateGainNode(participantId, audioElement) {
  if (audioContexts.has(participantId)) {
    return audioContexts.get(participantId);
  }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const source = ctx.createMediaElementSource(audioElement);
  const gainNode = ctx.createGain();
  source.connect(gainNode);
  gainNode.connect(ctx.destination);
  audioContexts.set(participantId, { context: ctx, gainNode, source });
  return { context: ctx, gainNode, source };
}

const audioGainNodes = new Map();
let sharedAudioContext = null;

function getAudioContext() {
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume();
  }
  return sharedAudioContext;
}

function applyVolumeToUser(participantId, volume) {
  if (participantId === "local") return;
  const audio = remoteTracks.get(participantId);
  if (!audio) return;

  const clampedVolume = Math.max(0, Math.min(2, volume));
  currentVolumeSliders.set(participantId, clampedVolume);
  localStorage.setItem(`vol_${participantId}`, clampedVolume.toString());

  if (clampedVolume <= 1) {
    if (audioGainNodes.has(participantId)) {
      audioGainNodes.get(participantId).gain.value = 1;
    }
    audio.volume = clampedVolume;
    return;
  }

 
  audio.volume = 1;

  if (!audioGainNodes.has(participantId)) {
    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') ctx.resume();
      const source = ctx.createMediaElementSource(audio);
      const gainNode = ctx.createGain();
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      audioGainNodes.set(participantId, gainNode);
    } catch (e) {
      console.warn("GainNode setup failed:", e);
      return;
    }
  }

  audioGainNodes.get(participantId).gain.value = clampedVolume;
}

function toggleMute() {
  if (!localAudioTrack) return;

  isCurrentlyMuted = !isCurrentlyMuted;

  isCurrentlyMuted ? localAudioTrack.mute() : localAudioTrack.unmute();

  document.getElementById('muteBtn').classList.toggle('muted', isCurrentlyMuted);
  voiceStates.set(user.id, { isMuted: isCurrentlyMuted, isDeafened: isDeafened });
  socket.emit("voiceStateChange", {
    userId: user.id,
    isMuted: isCurrentlyMuted,
    isDeafened: isDeafened
  });

  updateVoiceUI();
}

let screenTrack = null;
let screenAudioTrack = null;
let currentActiveAudioTrack = null;

async function toggleScreenShare() {
  if (screenTrack) {
   
   if (conference) {
  try {
    if (screenTrack) await conference.removeTrack(screenTrack);
    if (screenAudioTrack) await conference.removeTrack(screenAudioTrack);
  } catch (e) {}
}
if (screenAudioTrack) { screenAudioTrack.dispose(); screenAudioTrack = null; }
    
    try {
      if (screenTrack) screenTrack.dispose();
      if (screenAudioTrack) screenAudioTrack.dispose();
    } catch (e) {
      console.error("Error disposing tracks:", e);
    }
    
    screenTrack = null;
    screenAudioTrack = null;
    document.getElementById('screenBtn').style.background = '';
    
    removeScreenCard("data-screen-id", "local-screen");
    document.getElementById('screenBtn').classList.remove('sharing');
    
    socket.emit("screenShareStop", {
      userId: user.id,
      username: user.username,
      roomName: currentVoiceRoom
    });
    return;
  }

  try {
    if (!conference) {
     showToast("❌ You must join voice first to share screen");
      return;
    }

    console.log("Requesting screen capture...");

    let tracks = [];
    try {
    tracks = await JitsiMeetJS.createLocalTracks({
      devices: ['desktop'],
      desktopSharingFrameRate: { min: 5, max: 30 },
      constraints: { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true } }
    });
      console.log(`📹 Captured ${tracks.length} tracks from screen`);
    } catch (e) {
      console.error("❌ Desktop capture failed:", e);
     showToast("❌ Screen capture failed. Make sure you selected a window/screen.");
      return;
    }

    screenTrack = null;
    screenAudioTrack = null;
    if (Array.isArray(tracks)) {
  for (let i = 0; i < tracks.length; i++) {
    if (tracks[i] && typeof tracks[i].getType === 'function') {
      const trackType = tracks[i].getType();
      
      if (trackType === 'video' && !screenTrack) {
        screenTrack = tracks[i];
        console.log("Got screen VIDEO track");
      } else if (trackType === 'audio' && !screenAudioTrack) {
        screenAudioTrack = tracks[i];
        console.log("Got screen AUDIO track");
      }
    }
  }
}

    if (!screenTrack) {
      console.error("❌ No video track captured!");
     showToast("❌ Could not capture screen video");
      return;
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log("Adding screen video track to conference...");
   try {
 await conference.addTrack(screenTrack);


if (screenAudioTrack && localAudioTrack) {
  try {
    const ctx = new AudioContext();
      const micSource = ctx.createMediaStreamSource(
      new MediaStream([currentActiveAudioTrack.getTrack()]) 
    );
    const screenSource = ctx.createMediaStreamSource(
      new MediaStream([screenAudioTrack.getTrack()])
    );
    const destination = ctx.createMediaStreamDestination();
    micSource.connect(destination);
    screenSource.connect(destination);

    const [mixedJitsiTrack] = await JitsiMeetJS.createLocalTracksFromMediaStreams([{
      stream: destination.stream,
      sourceType: 'mic',
      mediaType: 'audio'
    }]);

        await conference.replaceTrack(currentActiveAudioTrack, mixedJitsiTrack); 
    currentActiveAudioTrack = mixedJitsiTrack;
    screenAudioTrack._mixedJitsiTrack = mixedJitsiTrack;
    screenAudioTrack._audioContext = ctx;
    console.log("Mixed mic + screen audio");
  } catch (e) {
    console.warn("Audio mixing failed:", e);
    screenAudioTrack.dispose();
    screenAudioTrack = null;
  }
}
} catch (e) {
  console.error("❌ Failed to add tracks:", e);
  screenTrack.dispose();
  if (screenAudioTrack) screenAudioTrack.dispose();
  return;
}
    
    await new Promise(resolve => setTimeout(resolve, 2500));
removeScreenCard("data-screen-id", "local-screen");
const screenContainer = document.getElementById("screenContainer");
 
  const wrapper = document.createElement("div");
  wrapper.className = "ss-card ss-local";
  wrapper.setAttribute("data-screen-id", "local-screen");
 
  const loading = document.createElement("div");
  loading.className = "ss-loading";
  const spinner = document.createElement("div");
  spinner.className = "ss-spinner";
  const loadingText = document.createElement("div");
  loadingText.textContent = "Starting your stream…";
  loading.appendChild(spinner);
  loading.appendChild(loadingText);
  wrapper.appendChild(loading);
 
  const video = document.createElement("video");
  video.className = "ss-video";
  video.autoplay = true;
  video.muted = true;
  video.style.objectFit = "contain";
  video.style.opacity = "0";
  video.style.transition = "opacity 0.2s ease";
  wrapper.appendChild(video);
 
  const chip = document.createElement("div");
  chip.className = "ss-chip";
  const chipDot = document.createElement("span");
  chipDot.className = "ss-dot";
  const chipText = document.createElement("span");
  chipText.textContent = "You're sharing your screen";
  chip.appendChild(chipDot);
  chip.appendChild(chipText);
  wrapper.appendChild(chip);
 
  const controls = document.createElement("div");
  controls.className = "ss-controls";
 
  const fullscreenBtn = document.createElement("button");
  fullscreenBtn.className = "ss-btn";
  fullscreenBtn.title = "Fullscreen";
  fullscreenBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`;
  fullscreenBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (video.requestFullscreen) video.requestFullscreen().catch(err => console.error("Fullscreen error:", err));
  });
 
  const stopBtn = document.createElement("button");
  stopBtn.className = "ss-btn ss-btn-danger";
  stopBtn.title = "Stop sharing";
  stopBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
  stopBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleScreenShare();
  });
 
  controls.appendChild(fullscreenBtn);
  controls.appendChild(stopBtn);
  wrapper.appendChild(controls);
 
  screenContainer.appendChild(wrapper);
 
  console.log("Attaching screen video...");
  screenTrack.attach(video);
 
  video.addEventListener('loadedmetadata', () => {
    loading.style.display = "none";
    video.style.opacity = "1";
  }, { once: true });
 
screenContainer.classList.add("show");
screenContainer.style.display = "flex"; 
document.getElementById('screenBtn').classList.add('sharing');


    socket.emit("screenShareStart", {
      userId: user.id,
      username: user.username,
      roomName: currentVoiceRoom,
      avatar: user.avatar,
      usernameColor: user.usernameColor,
      level: user.level || 1
    });

    screenTrack.addEventListener(
      JitsiMeetJS.events.track.TRACK_REMOVED,
      () => {
        console.log("🛑 Screen share stopped");
        screenTrack = null;
        screenAudioTrack = null;
        document.getElementById('screenBtn').style.background = '';
        removeScreenCard("data-screen-id", "local-screen");
        document.getElementById('screenBtn').classList.remove('sharing');
        
        socket.emit("screenShareStop", {
          userId: user.id,
          username: user.username,
          roomName: currentVoiceRoom
        });
      }
    );

    console.log("Screen share started (video only)!");

  } catch (err) {
    console.error("❌ Screen share error:", err);
    screenTrack = null;
    screenAudioTrack = null;
    document.getElementById('screenBtn').style.background = '';
    
    if (err.name === "NotAllowedError") {
     showToast("❌ Screen share cancelled");
    } else {
     showToast("❌ Screen share failed: " + err.message);
    }
  }
}


function leaveVoice() {
 
  const roomSlug = currentVoiceRoom || document.querySelector('.voice-channel.active')?.dataset.room;
  currentVoiceRoom = null;
  stopPingMonitor();
  document.getElementById('voiceControls').style.display = 'none';
  document.getElementById('voiceRoomLabel').textContent = '';
  
  if (roomSlug) {
    socket.emit("voiceLeave", { roomName: roomSlug, userId: user.id });
  }
  
  if (conference) { try { conference.leave(); } catch (e) {} conference = null; }
  if (localAudioTrack) { try { localAudioTrack.dispose(); } catch (e) {} localAudioTrack = null; }
  screenShareIntervals.forEach((interval) => clearInterval(interval));
  screenShareIntervals.clear();
  
 remoteTracks.forEach((audio, id) => {
    try { audio.srcObject = null; audio.remove(); } catch (e) {}
    if (audioContexts.has(id)) {
      audioContexts.get(id).context.close().catch(() => {});
      audioContexts.delete(id);
    }
    if (audioGainNodes.has(id)) audioGainNodes.delete(id);
  });
  remoteTracks.clear();
  voiceStates.clear();
  lastLoudAt.clear();
  speakingState.clear();
  isCurrentlyMuted = false;
  isDeafened = false;
  document.getElementById('muteBtn').classList.remove('muted');
  document.getElementById('deafenBtn').classList.remove('muted');
  document.querySelectorAll('.voice-channel').forEach(ch => ch.classList.remove('active'));
  const panel = document.getElementById('voicePanel');
  panel.classList.remove('show');
  panel.style.display = '';
  panel.style.display = 'none';
  document.querySelector('.sidebar2-content').appendChild(panel);
  if (window.electronAPI?.overlayVoiceUpdate) {
  window.electronAPI.overlayVoiceUpdate([]);
}

}

async function joinVoiceChannelWithTimeout(roomSlug, timeout = 15000) {
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Voice join timeout")), timeout)
  );

  try {
    await Promise.race([joinVoiceChannel(roomSlug), timeoutPromise]);
  } catch (error) {
    console.error("Voice join failed:", error);
   showToast("Failed to join voice. Please try again.");
    leaveVoice();
  }
}

let isDeafened = false;
function toggleDeafen() {
  isDeafened = !isDeafened;
  remoteTracks.forEach(audio => audio.muted = isDeafened);
  document.getElementById('deafenBtn').classList.toggle('muted', isDeafened);
  voiceStates.set(user.id, { isMuted: isCurrentlyMuted, isDeafened: isDeafened });
  socket.emit("voiceStateChange", {
    userId: user.id,
    isMuted: isCurrentlyMuted,
    isDeafened: isDeafened
  });

  updateVoiceUI();
}
let liveStreams = []; 

document.addEventListener('DOMContentLoaded', function() {
  const liveStreamsBtn = document.getElementById('liveStreamsBtn');
  const liveStreamsModal = document.getElementById('liveStreamsModal');
  liveStreamsModal.addEventListener('dragstart', (e) => {
  e.preventDefault();
  e.stopPropagation();
});
liveStreamsModal.addEventListener('dragover', (e) => {
  e.stopPropagation(); 
});
liveStreamsModal.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
});
liveStreamsBtn.addEventListener('click', function() {
  const modal = document.getElementById('liveStreamsModal');
  modal.style.display = 'flex';
  modal.style.zIndex = '30000';
  displayStreams(cachedLiveStreams);
});
  
liveStreamsModal.querySelector('.settings-close').addEventListener('click', function() {
  liveStreamsModal.style.display = 'none';
  clearInterval(liveModalInterval);
});
  
  liveStreamsModal.addEventListener('click', function(e) {
    if (e.target === liveStreamsModal) {
      liveStreamsModal.style.display = 'none';
    }
  });
});


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
    titleDiv.style = 'font-size: 13px; color: #b9bbbe; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
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


document.getElementById('streamsList').addEventListener('click', (e) => {
  const card = e.target.closest('[data-stream-platform]');
  if (!card) return;

  const platform = card.dataset.streamPlatform;
  const name = card.dataset.streamName;
  const stream = cachedLiveStreams.find(s => s.platform === platform && s.name === name);
  if (!stream) return;

  if (e.target.closest('.stream-watch-btn')) {
    window.open(stream.url, '_blank');
  } else if (e.target.closest('.stream-embed-btn')) {
    openEmbedStreamModal(stream);
  }
});

let notifiedStreams = new Set();

function handleStreamLiveNotification(stream) {
  const streamId = `${stream.platform}-${stream.name}`;
 if (notifiedStreams.has(streamId)) return;
  notifiedStreams.add(streamId);
  if (notifSettings.browser && Notification.permission === 'granted') {
  sendNotification(`🔴 ${stream.name} is now LIVE!`, stream.title || `Streaming on ${stream.platform}`, {
  icon: stream.logo || '/avatars/default1.png',
  tag: `stream-${stream.platform}-${stream.name}`,
  requireInteraction: false,
 
});
    
}

  if (notifSettings.liveBanner) {
  showStreamNotificationBanner(stream);
}

if (notifSettings.sound) {
  playNotificationSound();
}
  
}




function showUserOnlineToast(userData) {
  const banner = document.createElement('div');
  banner.classList.add('banner-notification', 'stacked-notification','timer-5s');
 const topOffset = getStackOffset();
  
  banner.style.cssText = `
    position: fixed;
    top: ${topOffset}px;
    left: 50%; 
    transform: translateX(-50%);
    background: #111214;
    border: 1px solid #3a3c42;
    border-left: 4px solid #FF0000;
    color: white;
    padding: 14px 16px;
    border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.7);
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

  const avatarWrapper = document.createElement('div');
  avatarWrapper.style.cssText = 'position:relative; flex-shrink:0;';

  const avatarBorderColor = colorClassToHex[userData.usernameColor] || '#FF0000;';

  const avatar = document.createElement('img');
  avatar.src = sanitizeAvatar(userData.avatar);
  avatar.style.cssText = `width:42px; height:42px; border-radius:50%; object-fit:cover; border:2px solid ${avatarBorderColor};`;
  const statusDot = document.createElement('div');
  statusDot.style.cssText = `
       position: absolute;
    bottom: 0;
    right: 0;
    width: 14px;
    height: 14px;
    background: #23a559;
    border-radius: 50%;
    border: 2px solid #111214;
    box-shadow: 0 0 6px rgba(35, 165, 89, 0.6);
  `;
  
  avatarWrapper.appendChild(avatar);
  avatarWrapper.appendChild(statusDot);

  const nameCol = document.createElement('div');
  nameCol.style.cssText = 'display:flex; flex-direction:column; gap:3px; flex:1; min-width:0;';

  const nameRow = document.createElement('div');
  nameRow.style.cssText = 'display:flex; align-items:center; gap:6px; flex-wrap:wrap;';

  const name = document.createElement('span');
  name.className = `username-wrapper ${userData.usernameColor || 'username-cyan'}`;
  name.setAttribute('data-text', userData.username);
  name.textContent = userData.username;
  name.style.cssText = 'font-weight:700; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:140px;';

  nameRow.appendChild(name);

  const onlineBadge = document.createElement('span');
  onlineBadge.textContent = '● Online';
  onlineBadge.style.cssText = `
    background: #FF0000;
    color: #ffffff;
    font-size: 10px;
    font-weight: 800;
    padding: 2px 6px;
    border-radius: 4px;
    letter-spacing: 0.5px;
    flex-shrink: 0;
  `;
  nameRow.appendChild(onlineBadge);

  if (userData.badge) {
    const badgeImg = document.createElement('img');
    badgeImg.src = sanitizeAvatar(userData.badge);
    badgeImg.style.cssText = 'width:18px; height:18px; border-radius:50%; object-fit:cover; flex-shrink:0;';
    nameRow.appendChild(badgeImg);
  }

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = `
    background: none; border: none; color: #72767d;
    font-size: 14px; cursor: pointer; padding: 0;
    flex-shrink: 0; align-self: flex-start;
    transition: color 0.15s;
  `;
  closeBtn.onmouseover = () => closeBtn.style.color = '#fff';
  closeBtn.onmouseout = () => closeBtn.style.color = '#72767d';
  closeBtn.onclick = (e) => { 
    e.stopPropagation(); 
    banner.remove(); 
  };

  nameCol.appendChild(nameRow);

  const statusText = document.createElement('div');
  statusText.textContent = userData.customStatus || 'Just came online';
  statusText.style.cssText = 'font-size:12px; color:#b9bbbe;';
  nameCol.appendChild(statusText);

  topRow.appendChild(avatarWrapper);
  topRow.appendChild(nameCol);
  topRow.appendChild(closeBtn);
  banner.appendChild(topRow);

  banner.onclick = () => { 
    if (typeof openUserProfile === 'function') {
      openUserProfile(userData);
    }
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


function showStreamNotificationBanner(streamData) {
  const banner = document.createElement('div');
  banner.classList.add('banner-notification', 'stacked-notification','timer-8s');
  const topOffset = getStackOffset();
  
  banner.style.cssText = `
    position: fixed;
    top: ${topOffset}px;
    left: 50%; 
    transform: translateX(-50%);
    background: #111214;
    border: 1px solid #3a3c42;
    border-left: 4px solid #FF0000;
    color: white;
    padding: 14px 16px;
    border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.7);
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

  const avatarWrapper = document.createElement('div');
  avatarWrapper.style.cssText = 'position:relative; flex-shrink:0;';

  const avatarBorderColor = '#FF0000';

  const avatar = document.createElement('img');
  avatar.src = sanitizeAvatar(streamData.logo);
  avatar.style.cssText = `width:42px; height:42px; border-radius:50%; object-fit:cover; border:2px solid ${avatarBorderColor};`;
  const liveDot = document.createElement('div');
  liveDot.style.cssText = `
    position: absolute;
    bottom: 2px;
    right: 2px;
    width: 12px;
    height: 12px;
    background: #FF0000;
    border-radius: 50%;
    border: 2px solid #111214;
    animation: livePulse 1s ease-in-out infinite;
  `;
  
  avatarWrapper.appendChild(avatar);
  avatarWrapper.appendChild(liveDot);

  const nameCol = document.createElement('div');
  nameCol.style.cssText = 'display:flex; flex-direction:column; gap:3px; flex:1; min-width:0;';

  const nameRow = document.createElement('div');
  nameRow.style.cssText = 'display:flex; align-items:center; gap:6px; flex-wrap:wrap;';

  const name = document.createElement('span');
  name.className = `username-wrapper username-default`;
  name.setAttribute('data-text', streamData.name);
  name.textContent = streamData.name;
  name.style.cssText = 'font-weight:700; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:140px;';

  nameRow.appendChild(name);

  const liveBadge = document.createElement('span');
  liveBadge.textContent = '🔴 LIVE';
  liveBadge.style.cssText = `
    background: #FF0000;
    color: white;
    font-size: 10px;
    font-weight: 800;
    padding: 3px 8px;
    border-radius: 4px;
    letter-spacing: 0.5px;
    flex-shrink: 0;
    animation: livePulse 1s ease-in-out infinite;
  `;
  nameRow.appendChild(liveBadge);

  if (streamData.badge) {
    const badgeImg = document.createElement('img');
    badgeImg.src = sanitizeAvatar(streamData.badge);
    badgeImg.style.cssText = 'width:18px; height:18px; border-radius:50%; object-fit:cover; flex-shrink:0;';
    nameRow.appendChild(badgeImg);
  }

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = `
    background: none; border: none; color: #72767d;
    font-size: 14px; cursor: pointer; padding: 0;
    flex-shrink: 0; align-self: flex-start;
    transition: color 0.15s;
  `;
  closeBtn.onmouseover = () => closeBtn.style.color = '#fff';
  closeBtn.onmouseout = () => closeBtn.style.color = '#72767d';
  closeBtn.onclick = (e) => { 
    e.stopPropagation(); 
    banner.remove(); 
  };

  nameCol.appendChild(nameRow);

  const streamTitle = document.createElement('div');
  streamTitle.textContent = streamData.title || 'Streaming now';
  streamTitle.style.cssText = 'font-size:13px; color:#b9bbbe; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
  nameCol.appendChild(streamTitle);

  topRow.appendChild(avatarWrapper);
  topRow.appendChild(nameCol);
  topRow.appendChild(closeBtn);

  const watchBtn = document.createElement('button');
  watchBtn.textContent = 'Watch Stream';
  watchBtn.style.cssText = `
    background: #FF0000;
    color: white; border: none;
    padding: 8px 14px; border-radius: 6px;
    font-size: 12px; font-weight: 600;
    cursor: pointer; transition: background 0.15s;
    align-self: flex-end;
    width: 100%;
  `;
  watchBtn.onmouseover = () => watchBtn.style.background = '#cc0000';
  watchBtn.onmouseout = () => watchBtn.style.background = '#FF0000';
  watchBtn.onclick = (e) => { 
    e.stopPropagation(); 
    if (typeof openStreamModal === 'function') {
      openStreamModal(streamData);
    }
    banner.remove(); 
  };

  banner.appendChild(topRow);
  banner.appendChild(watchBtn);

  banner.onclick = () => { 
    if (typeof openStreamModal === 'function') {
      openStreamModal(streamData);
    }
    banner.remove(); 
  };

  document.body.appendChild(banner);
setTimeout(() => {
  if (banner.parentNode) {
    banner.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
    banner.style.right = 'auto';
    banner.style.opacity = '0';
    banner.style.transform = 'translate(-50%, -100%)';
    setTimeout(() => banner.remove(), 400);
  }
}, 8000);
}

function playNotificationSound() {
  if (!notifSettings.sound) return;
  const audio = new Audio('/sounds/uwu.mp3');
  audio.volume = 0.5;
  audio.play().catch(() => {});
}

function userjoinSound() {
  if (!notifSettings.sound) return;
  const audio = new Audio('/sounds/power-plug.oga');
  audio.volume = 0.5;
  audio.play().catch(() => {});
}

function userleaveSound() {
  if (!notifSettings.sound) return;
  const audio = new Audio('/sounds/power-unplug.oga');
  audio.volume = 0.5;
  audio.play().catch(() => {});
}



if (!document.getElementById('bannerTimerStyles')) {
  const style = document.createElement('style');
  style.id = 'bannerTimerStyles';
  style.textContent = `
    @keyframes timerShrink {
      from { width: 100%; }
      to   { width: 0%; }
    }
    .banner-notification::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      height: 3px;
      border-radius: 0 0 10px 10px;
      background: #FF0000
      animation: timerShrink linear forwards;
      z-index: 9999;
    }
    .banner-notification.timer-8s::after { animation-duration: 8s; }
    .banner-notification.timer-6s::after { animation-duration: 6s; }
    .banner-notification.timer-5s::after { animation-duration: 5s; }
  `;
  document.head.appendChild(style);
}


if (!document.getElementById('slideDownStyles')) {
  const style = document.createElement('style');
  style.id = 'slideDownStyles';
  style.textContent = `
    @keyframes bannerDropIn {
      from { transform: translate(-50%, -100%); opacity: 0; }
      to   { transform: translate(-50%, 0); opacity: 1; }
    }
    @keyframes bannerSlideUpOut {
      from { transform: translate(-50%, 0); opacity: 1; }
      to   { transform: translate(-50%, -100%); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
}

let currentEmbeddedIframe = null;

function joinEmbeddedJitsi() {
  const modal = document.getElementById('embeddedJitsiModal');
  modal.innerHTML = '';
  const windowDiv = document.createElement('div');
  windowDiv.className = 'jitsi-embed-window';
  windowDiv.id = 'jitsiEmbedWindow';
  
  const header = document.createElement('div');
  header.className = 'jitsi-embed-header';
  header.innerHTML = `
    <span style="font-weight:600; font-size:18px;">🕪 Voice Chat (Embedded)</span>
    <button onclick="closeEmbeddedJitsi()" style="background:none; border:none; color:#FF0000; font-size:32px; cursor:pointer;">✕</button>
  `;
  
  const iframeContainer = document.createElement('div');
  iframeContainer.id = 'jitsiEmbedContainer';
  iframeContainer.style.cssText = 'flex:1; background:#000; position:relative; overflow:hidden;';
  
  const iframe = document.createElement('iframe');
  iframe.id = 'jitsiEmbedFrame';
  iframe.style.cssText = 'width:100%; height:100%; border:none;';
  iframe.allow = 'camera; microphone; fullscreen; display-capture; screen-wake-lock; clipboard-read; clipboard-write;';
  
  const roomName = JITSI_CONFIG.roomName
  const config = [
    `config.prejoinPageEnabled=false`,
    `config.startWithAudioMuted=${JITSI_CONFIG.startWithAudioMuted || false}`,
    `config.startWithVideoMuted=${JITSI_CONFIG.startWithVideoMuted || true}`,
    `config.disableDeepLinking=true`,
    `config.constraints.video.height.ideal=${JITSI_CONFIG.constraints?.video?.height?.ideal || 1080}`,
    `config.constraints.video.height.max=${JITSI_CONFIG.constraints?.video?.height?.ideal || 1080}`,
    `config.constraints.video.width.ideal=${JITSI_CONFIG.constraints?.video?.width?.ideal || 1920}`,
    `config.constraints.video.width.max=${JITSI_CONFIG.constraints?.video?.width?.ideal || 1920}`,
    `config.desktopSharingFrameRate.min=5`,
    `config.desktopSharingFrameRate.max=30`
  ].join('&');

  iframe.src = `https://${JITSI_CONFIG.embeddomain}/${roomName}#${config}`;
  iframeContainer.appendChild(iframe);
  
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'jitsi-resize-handle';
  
  windowDiv.appendChild(header);
  windowDiv.appendChild(iframeContainer);
  windowDiv.appendChild(resizeHandle);
  modal.appendChild(windowDiv);
  modal.classList.add('show');
  
  makeDraggableAndResizable(windowDiv, header);
  
  currentEmbeddedIframe = iframe;
  document.getElementById('vcCount-embed').textContent = '1+';
}

function makeDraggableAndResizable(element, dragHandle, resizeHandleEl) {
  let isResizing = false;
  let isDragging = false;
  let startX, startY, startWidth, startHeight, startLeft, startTop;

  const DRAG_EDGE_MARGIN = 40;

  dragHandle.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    if (document.fullscreenElement === element) return;

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = element.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    element.style.transform = 'none';
    element.style.left = startLeft + 'px';
    element.style.top = startTop + 'px';
    dragHandle.style.cursor = 'grabbing';
  });

  const resizeHandle = resizeHandleEl || element.querySelector('.jitsi-resize-handle');
  if (resizeHandle) {
    resizeHandle.addEventListener('mousedown', (e) => {
      if (document.fullscreenElement === element) return;
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = element.offsetWidth;
      startHeight = element.offsetHeight;
      e.preventDefault();
      e.stopPropagation();
    });
  }

  const onMouseMove = (e) => {
    if (!isDragging && !isResizing) return;
    if (isDragging) {
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      const maxLeft = window.innerWidth - DRAG_EDGE_MARGIN;
      const minLeft = DRAG_EDGE_MARGIN - element.offsetWidth;
      const maxTop = window.innerHeight - DRAG_EDGE_MARGIN;
      const minTop = 0;

      let left = startLeft + deltaX;
      let top = startTop + deltaY;
      left = Math.min(Math.max(left, minLeft), maxLeft);
      top = Math.min(Math.max(top, minTop), maxTop);

      element.style.left = left + 'px';
      element.style.top = top + 'px';
    }
    if (isResizing) {
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      element.style.width = Math.max(500, startWidth + deltaX) + 'px';
      element.style.height = Math.max(350, startHeight + deltaY) + 'px';
    }
  };

  const onMouseUp = () => {
    isDragging = false;
    isResizing = false;
    dragHandle.style.cursor = 'move';
  };

  document.addEventListener('mousemove', onMouseMove, { passive: true });
  document.addEventListener('mouseup', onMouseUp, { passive: true });

  const onResize = () => {
    if (element.style.transform !== 'none' || document.fullscreenElement === element) return;
    const rect = element.getBoundingClientRect();
    const maxLeft = window.innerWidth - DRAG_EDGE_MARGIN;
    const minLeft = DRAG_EDGE_MARGIN - rect.width;
    const maxTop = window.innerHeight - DRAG_EDGE_MARGIN;
    let left = Math.min(Math.max(rect.left, minLeft), maxLeft);
    let top = Math.min(Math.max(rect.top, 0), maxTop);
    if (left !== rect.left) element.style.left = left + 'px';
    if (top !== rect.top) element.style.top = top + 'px';
  };
  window.addEventListener('resize', onResize);

  element._cleanupDrag = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('resize', onResize);
  };
}


function setActiveVoiceChannel(roomSlug) {
  document.querySelectorAll(".voice-channel").forEach(ch => ch.classList.remove("active"));
  const active = document.querySelector(`.voice-channel[data-room="${roomSlug}"]`);
  if (active) {
    active.classList.add("active");
    active.parentNode.insertBefore(document.getElementById('voicePanel'), active.nextSibling);
  }
  const panel = document.getElementById('voicePanel');
  panel.classList.add('show');
  panel.style.display = ''; 
}

let notifSettings = {
  browser: true,
  liveBanner: true,
  sound: true
};

function loadNotifSettings() {
  const saved = localStorage.getItem("notifSettings");
  if (saved) {
    notifSettings = JSON.parse(saved);
  }
  

  document.getElementById("toggleBrowserNotif").checked = notifSettings.browser;
  document.getElementById("toggleLiveBanner").checked = notifSettings.liveBanner;
  document.getElementById("toggleNotifSound").checked = notifSettings.sound;
}

function saveNotifSettings() {
  localStorage.setItem("notifSettings", JSON.stringify(notifSettings));
}


window.addEventListener('load', () => {
  loadNotifSettings();
  document.getElementById("toggleBrowserNotif").addEventListener("change", (e) => {
    notifSettings.browser = e.target.checked;
    saveNotifSettings();
  });

  document.getElementById("toggleLiveBanner").addEventListener("change", (e) => {
    notifSettings.liveBanner = e.target.checked;
    saveNotifSettings();
  });

  document.getElementById("toggleNotifSound").addEventListener("change", (e) => {
    notifSettings.sound = e.target.checked;
    saveNotifSettings();
  });

  document.getElementById("requestNotifPermissionBtn").addEventListener("click", () => {
    if (Notification.permission !== "granted") {
      Notification.requestPermission();
    } else if (Notification.permission === "granted") {
     showToast("Notifications are already enabled.");
    } else {
     showToast("❌ Notifications are blocked. Please enable them in your browser settings.");
    }
  });
});



 GIFS_PER_PAGE = 36;
let gifPickerState = { page: 0, allResults: [] };

let gifSearchTimeout;
const gifModal = document.createElement("div");
gifModal.id = "gifModal";
gifModal.style.cssText = `
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.6);
  display: none;
  align-items: center;
  justify-content: center;
  z-index: 20000;
`;

const gifModalContent = document.createElement("div");
gifModalContent.className = "gif-picker-content";
gifModalContent.style.cssText = `
  display: flex;
  flex-direction: column;
  width: 340px;
  max-height: 420px;
  background: #111214;
  border: 1px solid #3a3c42;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.6);
  overflow: hidden;
`;


const gifHeader = document.createElement("div");
gifHeader.style.cssText = `
  display: flex; align-items: center; gap: 8px;
  padding: 10px; border-bottom: 1px solid #3a3c42; flex-shrink: 0;
`;

const gifSearchInput = document.createElement("input");
gifSearchInput.type = "text";
gifSearchInput.id = "gifSearchInput";
gifSearchInput.placeholder = "Search GIFs...";
gifSearchInput.style.cssText = `
  flex: 1; box-sizing: border-box; padding: 7px 10px;
  background: #1e1f22; border: 1px solid #3a3c42; border-radius: 6px;
  color: #fff; font-size: 13px; outline: none; transition: border-color 0.15s;
`;
gifSearchInput.onfocus = () => gifSearchInput.style.borderColor = "#FF0000";
gifSearchInput.onblur = () => gifSearchInput.style.borderColor = "#3a3c42";

const gifCloseBtn = document.createElement("button");
gifCloseBtn.textContent = "✕";
gifCloseBtn.style.cssText = `
  background: none; border: none; color: #72767d;
  font-size: 16px; cursor: pointer; padding: 0 2px;
  transition: color 0.15s; flex-shrink: 0;
`;
gifCloseBtn.onmouseover = () => gifCloseBtn.style.color = "#fff";
gifCloseBtn.onmouseout = () => gifCloseBtn.style.color = "#72767d";
gifCloseBtn.onclick = () => closeGifModal();

gifHeader.appendChild(gifSearchInput);
gifHeader.appendChild(gifCloseBtn);


const gifCategoryRow = document.createElement("div");
gifCategoryRow.id = "gifCategoryRow";
gifCategoryRow.style.cssText = `
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
`;

function renderCategoryGrid() {
  gifCategoryRow.style.display = "grid";
  gifGridWrap.style.display = "none";
  gifFooter.style.display = "none";
  gifCategoryRow.innerHTML = "";

  const allTiles = [{ label: "🔥 Trending", query: "trending" }, ...GIF_CATEGORIES];

  allTiles.forEach(cat => {
    const thumb = categoryThumbCache.get(cat.query);

    const tile = document.createElement("div");
    tile.dataset.categoryQuery = cat.query;
    tile.style.cssText = `
      position: relative;
      height: 70px;
      border-radius: 8px;
      overflow: hidden;
      cursor: pointer;
      background: ${thumb ? `url('${thumb}') center/cover` : "#1e1f22"};
      transition: transform 0.12s;
    `;
    tile.onmouseover = () => tile.style.transform = "scale(1.03)";
    tile.onmouseout = () => tile.style.transform = "scale(1)";

    if (!thumb) {
      const spinner = document.createElement("div");
      spinner.style.cssText = `
        position: absolute; inset: 0;
        display: flex; align-items: center; justify-content: center;
      `;
      spinner.innerHTML = `<span style="width:16px;height:16px;border-radius:50%;border:2px solid #FF0000;border-top-color:transparent;display:inline-block;animation:spin 0.7s linear infinite;"></span>`;
      tile.appendChild(spinner);
    }

    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position: absolute; inset: 0;
      background: linear-gradient(to top, rgba(0,0,0,0.75), rgba(0,0,0,0.1));
      display: flex; align-items: flex-end; padding: 6px 8px;
    `;
    const label = document.createElement("span");
    label.textContent = cat.label;
    label.style.cssText = "color:#fff; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.3px; text-shadow: 0 1px 3px rgba(0,0,0,0.8);";
    overlay.appendChild(label);
    tile.appendChild(overlay);

    tile.onclick = (e) => {
      e.stopPropagation();
      selectGifCategory(cat.query);
    };

    gifCategoryRow.appendChild(tile);
  });
}

function showResultsView() {
  gifViewMode = "results";
  gifCategoryRow.style.display = "none";
  gifGridWrap.style.display = "grid";
}

function showCategoriesView() {
  gifViewMode = "categories";
  renderCategoryGrid();
}

function selectGifCategory(queryOrTrending) {
  activeGifCategory = queryOrTrending;
  showResultsView();
  gifBackBtn.style.display = "block";
  gifSearchInput.value = queryOrTrending === "trending" ? "" : queryOrTrending;

  if (queryOrTrending === "trending") {
    loadTrendingGifs();
  } else {
    searchGifs(queryOrTrending);
  }
}

const gifBackBtn = document.createElement("button");
gifBackBtn.id = "gifBackBtn";
gifBackBtn.innerHTML = "‹";
gifBackBtn.style.cssText = `
  background: none; border: none; color: #b9bbbe;
  font-size: 20px; cursor: pointer; padding: 0 4px;
  display: none; flex-shrink: 0; line-height: 1;
`;
gifBackBtn.onclick = (e) => {
  e.stopPropagation();
  gifSearchInput.value = "";
  showCategoriesView();
};

gifHeader.insertBefore(gifBackBtn, gifSearchInput);

const gifGridWrap = document.createElement("div");
gifGridWrap.id = "gifResults";
gifGridWrap.style.cssText = `
  flex: 1; overflow-y: auto; padding: 8px;
  display: grid;
  grid-template-columns: repeat(4, 70px);
  grid-auto-rows: 70px;
  gap: 6px;
  justify-content: center;
  align-content: start;
`;


const gifFooter = document.createElement("div");
gifFooter.id = "gifFooter";
gifFooter.style.cssText = `
  display: none; align-items: center; justify-content: space-between;
  padding: 6px 10px; border-top: 1px solid #3a3c42; flex-shrink: 0;
`;

function pageBtnStyle() {
  return `
    background: #1e1f22; border: 0px solid #3a3c42; color: #b9bbbe;
    font-size: 11px; padding: 4px 8px; border-radius: 6px;
    cursor: pointer; transition: background 0.15s, color 0.15s;
  `;
}

const gifPrevBtn = document.createElement("button");
gifPrevBtn.textContent = "‹ Prev";
gifPrevBtn.style.cssText = pageBtnStyle();
gifPrevBtn.onclick = () => {
  if (gifPickerState.page > 0) {
    gifPickerState.page--;
    renderGifPage();
  }
};

const gifPageLabel = document.createElement("span");
gifPageLabel.id = "gifPageLabel";
gifPageLabel.style.cssText = "color:#b9bbbe; font-size:11px;";

const gifNextBtn = document.createElement("button");
gifNextBtn.textContent = "Next ›";
gifNextBtn.style.cssText = pageBtnStyle();
gifNextBtn.onclick = () => {
  const totalPages = Math.ceil(gifPickerState.allResults.length / GIFS_PER_PAGE);
  if (gifPickerState.page < totalPages - 1) {
    gifPickerState.page++;
    renderGifPage();
  }
};

gifFooter.appendChild(gifPrevBtn);
gifFooter.appendChild(gifPageLabel);
gifFooter.appendChild(gifNextBtn);

gifModalContent.appendChild(gifHeader);
gifModalContent.appendChild(gifCategoryRow);
gifModalContent.appendChild(gifGridWrap);
gifModalContent.appendChild(gifFooter);
gifModal.appendChild(gifModalContent);
document.body.appendChild(gifModal);

document.getElementById("gifBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  const willShow = gifModal.style.display !== "flex";
  closeAllPickers("gifBtn");

  if (!willShow) {
    closeGifModal();
    return;
  }

  const gifBtnRect = document.getElementById("gifBtn").getBoundingClientRect();
  const pickerWidth = 340;

  gifModal.style.background = "transparent";
  gifModal.style.pointerEvents = "none";
  gifModalContent.style.pointerEvents = "auto";
  gifModalContent.style.position = "absolute";
  gifModalContent.style.left = (gifBtnRect.right - pickerWidth) + "px";
  gifModalContent.style.bottom = (window.innerHeight - gifBtnRect.top + 8) + "px";
  gifModal.style.display = "flex";

  gifSearchInput.value = "";
  gifBackBtn.style.display = "none";
  showCategoriesView();
  loadCategoryThumbnails();

  gifSearchInput.focus();
});

async function loadTrendingGifs() {
  const cacheKey = "__trending__";
  if (gifCache.has(cacheKey)) {
    gifPickerState.allResults = gifCache.get(cacheKey);
    gifPickerState.page = 0;
    renderGifPage();
    return;
  }

  gifGridWrap.innerHTML = '<div style="grid-column:1/-1; color:#72767d; font-size:12px; text-align:center; padding:24px 0;">Loading trending GIFs...</div>';

  try {
    const response = await fetch(`/api/gifs/trending?limit=40`);
    if (!response.ok) throw new Error("Trending fetch failed");
    const data = await response.json();

    if (gifCache.size > 20) {
      const firstKey = gifCache.keys().next().value;
      gifCache.delete(firstKey);
    }
    gifCache.set(cacheKey, data.data);

    gifPickerState.allResults = data.data;
    gifPickerState.page = 0;
    renderGifPage();
  } catch (error) {
    console.error("Trending GIF error:", error);
    gifGridWrap.innerHTML = '<div style="grid-column:1/-1; color:#72767d; font-size:12px; text-align:center; padding:24px 0;">Failed to load trending GIFs.</div>';
  }
}

function closeGifModal() {
  gifModal.style.display = "none";
  gifSearchInput.value = "";
}

document.addEventListener("click", (e) => {
  const gifBtn = document.getElementById("gifBtn");
  if (gifModal.style.display === "flex" && !gifModalContent.contains(e.target) && !gifBtn.contains(e.target)) {
    closeGifModal();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && gifModal.style.display === "flex") {
    closeGifModal();
  }
});

gifSearchInput.addEventListener("input", (e) => {
  clearTimeout(gifSearchTimeout);
  const query = e.target.value.trim();

  if (query.length === 0) {
    gifBackBtn.style.display = "none";
    showCategoriesView();
    return;
  }

  gifBackBtn.style.display = "block";
  showResultsView();
  gifGridWrap.innerHTML = '<div style="grid-column:1/-1; color:#72767d; font-size:12px; text-align:center; padding:24px 0;">Waiting for you to finish typing...</div>';

  gifSearchTimeout = setTimeout(() => {
    if (query.length >= 3) {
      searchGifs(query);
    } else {
      gifGridWrap.innerHTML = '<div style="grid-column:1/-1; color:#72767d; font-size:12px; text-align:center; padding:24px 0;">Type at least 3 characters...</div>';
    }
  }, 4000);
});

async function searchGifs(query) {
  if (gifCache.has(query)) {
    gifPickerState.allResults = gifCache.get(query);
    gifPickerState.page = 0;
    renderGifPage();
    return;
  }

  gifGridWrap.innerHTML = '<div style="grid-column:1/-1; color:#72767d; font-size:12px; text-align:center; padding:24px 0;">Searching...</div>';

  try {
    const response = await fetch(
      `/api/gifs/search?q=${encodeURIComponent(query)}&limit=100`
    );
    if (!response.ok) throw new Error("Search failed");
    const data = await response.json();

    if (gifCache.size > 20) {
      const firstKey = gifCache.keys().next().value;
      gifCache.delete(firstKey);
    }
    gifCache.set(query, data.data);

    gifPickerState.allResults = data.data;
    gifPickerState.page = 0;
    renderGifPage();
  } catch (error) {
    console.error("GIF search error:", error);
    gifGridWrap.innerHTML = '<div style="grid-column:1/-1; color:#72767d; font-size:12px; text-align:center; padding:24px 0;">Search failed. Try again.</div>';
  }
}

function renderGifPage() {
  const gifs = gifPickerState.allResults;

  if (!gifs || gifs.length === 0) {
    gifGridWrap.innerHTML = '<div style="grid-column:1/-1; color:#72767d; font-size:12px; text-align:center; padding:24px 0;">No GIFs found</div>';
    gifFooter.style.display = "none";
    return;
  }

  const totalPages = Math.max(1, Math.ceil(gifs.length / GIFS_PER_PAGE));
  if (gifPickerState.page >= totalPages) gifPickerState.page = totalPages - 1;
  if (gifPickerState.page < 0) gifPickerState.page = 0;

  const start = gifPickerState.page * GIFS_PER_PAGE;
  const pageItems = gifs.slice(start, start + GIFS_PER_PAGE);

  gifGridWrap.innerHTML = "";

  pageItems.forEach(gif => {
  const previewUrl = gif.images.fixed_height_small.url;
  const fullUrl = gif.images.original.url;

  const item = document.createElement("div");
  item.className = "gif-picker-item";
  item.style.cssText = `
    position: relative;
    width: 70px;
    height: 70px;
    border-radius: 6px;
    background: #1e1f22;
    overflow: hidden;
    cursor: pointer;
    transition: transform 0.1s, outline 0.15s;
    outline: 2px solid transparent;
    box-sizing: border-box;
  `;
  item.onmouseover = () => { item.style.transform = "scale(1.06)"; item.style.outline = "2px solid #FF0000"; };
  item.onmouseout = () => { item.style.transform = "scale(1)"; item.style.outline = "2px solid transparent"; };

  const img = document.createElement("img");
  img.src = previewUrl;
  img.loading = "lazy";
  img.style.cssText = "width:100%; height:100%; object-fit:cover; display:block; pointer-events:none;";
  item.appendChild(img);

  item.addEventListener("click", () => {
    sendGif(fullUrl);
    closeGifModal();
  });

  gifGridWrap.appendChild(item);
});

  gifPageLabel.textContent = `${gifPickerState.page + 1}/${totalPages} (${gifs.length})`;
  gifFooter.style.display = gifs.length > GIFS_PER_PAGE ? "flex" : "none";
}




function closeEmbeddedJitsi() {
  const modal = document.getElementById('embeddedJitsiModal');
  const container = document.getElementById('jitsiEmbedContainer');
  const win = document.getElementById('jitsiEmbedWindow');
  if (win?._cleanupDrag) win._cleanupDrag();
  
  container.innerHTML = '';
  modal.classList.remove('show');
  modal.innerHTML = ''; 
  currentEmbeddedIframe = null;
  
  document.getElementById('vcCount-embed').textContent = '0';
}







function sendGif(gifUrl) {
  console.log(`SEND GIF ${user.level}`)
  const msg = {
    id: crypto.randomUUID(),
    userId: user.id,
    username: user.username,
    avatar: user.avatar,
    text: gifUrl,
    channel: currentChannel,
    badge: user.badge,
    usernameColor: user.usernameColor,
    level: user.level || 1,
    isAdmin: user.isAdmin || false,
    isDeveloper: user.isDeveloper || false,
    isPromptEngineer: user.isPromptEngineer || false,
    isBot: user.isBot || false,
    prestigeBadge: user.prestigeBadge || null,
    customRoleIds: user.customRoleIds || [],
    time: Date.now(),
    type: "image"
  };
  
  socket.emit("message", msg);

}


function applySavedVolumesToUser(participantId) {
  if (participantId === "local") return;
  const audio = remoteTracks.get(participantId);
  if (!audio) return;
  let savedVolume = currentVolumeSliders.get(participantId);
  if (savedVolume === undefined) {
    const stored = localStorage.getItem(`vol_${participantId}`);
    savedVolume = stored ? parseFloat(stored) : 1;
  }
  applyVolumeToUser(participantId, savedVolume);
}

const dropZone = document.getElementById('dropZone');
document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (e.dataTransfer?.items) {
    let hasFiles = false;
    for (let item of e.dataTransfer.items) {
      if (item.kind === 'file') {
        hasFiles = true;
        break;
      }
    }
    if (hasFiles) {
      dropZone.style.display = 'flex';
    }
  }
});


document.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.style.display = 'flex';
});


document.addEventListener('dragleave', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (e.clientX === 0 && e.clientY === 0) {
    dropZone.style.display = 'none';
  }
});


document.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.style.display = 'none';
  
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    Array.from(files).forEach(file => {
      uploadDroppedFile(file);
    });
  }
});


document.addEventListener('mouseleave', () => {
  dropZone.style.display = 'none';
});

function uploadDroppedFile(file) {
  const allowedMimes = [
    "image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp",
    "video/mp4", "video/webm", "video/ogg", "video/quicktime",
    "audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/webm",
    "text/plain", "text/markdown", "text/csv", "application/json"
  ];

  if (!allowedMimes.includes(file.type)) {
    showToast(`❌ File type not supported: ${file.type}`);
    return;
  }

  if (file.size > 200 * 1024 * 1024) {
    showToast("❌ File too large (max 100MB)");
    return;
  }

  const pasteNotif = document.createElement('div');
  pasteNotif.style.cssText = `
    position: fixed; bottom: 20px; right: 20px;
    background: #FF0000; color: white; padding: 12px 16px;
    border-radius: 8px; font-size: 13px; z-index: 10000;
  `;
  pasteNotif.textContent = `📋 Uploading ${
    file.type.startsWith('video/') ? 'video' :
    file.type.startsWith('text/') || file.type === 'application/json' ? 'file' : 'image'
  }...`;
  document.body.appendChild(pasteNotif);

  const formData = new FormData();
  formData.append("image", file);

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/upload-image", true);
  xhr.setRequestHeader("Authorization", `Bearer ${localStorage.getItem("chatToken")}`);
  uploadProgress.style.display = "block";

  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable) {
      const percent = Math.round((event.loaded / event.total) * 100);
      uploadPercent.textContent = percent + "%";
    }
  };

 xhr.onload = () => {
    uploadProgress.style.display = "none";
    pasteNotif.remove();

    if (xhr.status === 200) {
      const data = JSON.parse(xhr.responseText);
      const isVideo = file.type.startsWith("video/");
      const isAudio = data.type === "audio";
      const isTextFile = data.type === "file";

      const msg = {
        id: crypto.randomUUID(),
        userId: user.id,
        username: user.username,
        avatar: user.avatar,
        usernameColor: user.usernameColor,
        badge: user.badge,
        level: user.level || 1,
        isAdmin: user.isAdmin || false,
        isDeveloper: user.isDeveloper || false,
        isPromptEngineer: user.isPromptEngineer || false,
        isBot: user.isBot || false,
        prestigeBadge: user.prestigeBadge || null,
        text: data.url,
       
        channel: currentChannel,
        time: Date.now(),
        fileName: (isAudio || isTextFile) ? (data.filename || file.name) : undefined,
        type: isVideo ? "video" : (isAudio ? "audio" : (isTextFile ? "file" : "image"))
      
      };

      socket.emit("message", msg);

           const successNotif = document.createElement('div');
      successNotif.style.cssText = `position:fixed; bottom:20px; right:20px; background:#23a559; color:white; padding:12px 16px; border-radius:8px; font-size:13px; z-index:10000;`;
      successNotif.textContent = `${isVideo ? 'Video' : isAudio ? 'Audio' : isTextFile ? 'File' : 'Image'} uploaded!`;
      document.body.appendChild(successNotif);
      setTimeout(() => successNotif.remove(), 2000);
    } else {
      showToast("Upload failed: " + xhr.responseText);
    }
  };

  xhr.onerror = () => {
    uploadProgress.style.display = "none";
    pasteNotif.remove();
    showToast("Upload error");
  };

  xhr.send(formData);
}


let currentChannel = "general";
let channelsById = new Map();

function getChannelDisplayName(channelId) {
  return channelsById.get(channelId)?.name || channelId;
}

let pingInterval = null;


function startPingMonitor() {
  if (pingInterval) clearInterval(pingInterval);
  
  pingInterval = setInterval(() => {
    pingJitsiServer();
  }, 1500);
}


let consecutivePingFailures = 0;

function pingJitsiServer() {
  const DOMAIN = SERVER_CONFIG.server.pingdomain;
  const start = performance.now();
  let smoothedPing = 90;

  fetch(`https://${DOMAIN}`, {
    method: 'HEAD',
    mode: 'no-cors',
    cache: 'no-cache'
  })
  .then(() => {
    consecutivePingFailures = 0;
    const rawPing = performance.now() - start;
    smoothedPing = (rawPing * 0.3) + (smoothedPing * 0.7);
    updatePingDisplay(Math.round(smoothedPing));
  })
  .catch(() => {
    consecutivePingFailures++;
    updatePingDisplay(0);
    if (consecutivePingFailures >= 3 && currentVoiceRoom && !localAudioTrack) {
      console.warn("🔁 3 ping failures + no local track rejoining");
      consecutivePingFailures = 0;
      const room = currentVoiceRoom;
      leaveVoice();
      setTimeout(() => joinVoiceChannelWithTimeout(room), 1500);
    }
  });
}

let currentPingMs = 0;
function updatePingDisplay(ping) {
  currentPingMs = ping;
  if (window.electronAPI?.overlayPingUpdate) {
    window.electronAPI.overlayPingUpdate(currentVoiceRoom ? ping : null);
  }

  const pingDisplay = document.getElementById('pingDisplay');
  const pingText = document.getElementById('pingText');
  const voiceControls = document.querySelector('.voice-controls');
  const barsContainer = document.getElementById('pingBars');
  
  if (!barsContainer || !pingDisplay || !pingText || !voiceControls) return;
  
  pingText.style.display = 'none';
  pingDisplay.title = `${ping}ms`;

  let activeBars, color;
  
  if (ping < 100) {
    activeBars = 4;
    color = 'ping-good';
  } else if (ping < 170) {
    activeBars = 3;
    color = 'ping-good';
  } else if (ping < 190) {
    activeBars = 2;
    color = 'ping-warning';
  } else {
    activeBars = 1;
    color = 'ping-bad';
  }
  
  voiceControls.classList.remove('ping-good', 'ping-warning', 'ping-bad');
  voiceControls.classList.add(color);
  
  const bars = barsContainer.querySelectorAll('.ping-bar');
  bars.forEach((bar, index) => {
    bar.classList.toggle('active', index < activeBars);
  });
}

function stopPingMonitor() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}



inputField.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;

  let handledMedia = false;
  for (let item of items) {
    if (item.type.startsWith('image/') || item.type.startsWith('video/')) {
      handledMedia = true;
      e.preventDefault();
      const file = item.getAsFile();
      if (file) uploadDroppedFile(file);
    }
  }

  if (!handledMedia) {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }
});




function showMessageNotificationBanner(channel, message) {
  const banner = document.createElement('div');
  banner.classList.add('banner-notification', 'stacked-notification','timer-5s');
  
const topOffset = getStackOffset();
  
  banner.style.cssText = `
    position: fixed;
    top: ${topOffset}px;
    left: 50%; 
    transform: translateX(-50%);
    background: #111214;
    border: 1px solid #3a3c42;
    border-left: 4px solid #FF0000;
    color: white;
    padding: 14px 16px;
    border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.7);
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

  const avatarWrapper = document.createElement('div');
  avatarWrapper.style.cssText = 'position:relative; flex-shrink:0;';

  const avatar = document.createElement('img');
  avatar.src = sanitizeAvatar(message.avatar); 
  avatar.style.cssText = `width:42px; height:42px; border-radius:50%; object-fit:cover; border:2px solid ${colorClassToHex[message.usernameColor] || '#00f2ff'};`;
  avatarWrapper.appendChild(avatar);

  const nameCol = document.createElement('div');
  nameCol.style.cssText = 'display:flex; flex-direction:column; gap:3px; flex:1; min-width:0;';

  const nameRow = document.createElement('div');
  nameRow.style.cssText = 'display:flex; align-items:center; gap:6px; flex-wrap:wrap;';

  const name = document.createElement('span');
  name.className = `username-wrapper ${message.usernameColor || 'username-cyan'}`; 
  name.setAttribute('data-text', message.username || 'Unknown');
  name.textContent = message.username || 'Unknown';
  name.style.cssText = 'font-weight:700; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:140px;';
  nameRow.appendChild(name);

  const badgeColor = colorClassToHex[message.usernameColor] || '#00f2ff';
  const rgbColor = hexToRgb(badgeColor);

if (message.level && message.level > 1) {
    const lvlColor = getLevelColor(message.level);
    const lvlRgb = getLevelRgb(message.level);
    const levelBadge = document.createElement('span');
    levelBadge.style.cssText = `font-size:11px; color:${lvlColor}; -webkit-text-fill-color:${lvlColor}; background:rgba(${lvlRgb.r},${lvlRgb.g},${lvlRgb.b},0.2); -webkit-background-clip:initial; background-clip:initial; font-weight:700; padding:2px 6px; border-radius:3px; border:1px solid ${lvlColor}; flex-shrink:0; position:relative;`;
    levelBadge.textContent = message.level;
    nameRow.appendChild(levelBadge);
  }

  if (message.badge) {
    const badgeImg = document.createElement('img');
    badgeImg.src = sanitizeAvatar(message.badge);
    badgeImg.style.cssText = 'width:18px; height:18px; border-radius:50%; object-fit:cover; flex-shrink:0;';
    nameRow.appendChild(badgeImg);
  }

const channelBadge = document.createElement('span');
  channelBadge.textContent = `#${getChannelDisplayName(channel)}`;
  channelBadge.style.cssText = `
    background: #FF0000; color: white; font-size: 10px; font-weight: 800;
    padding: 2px 6px; border-radius: 4px; letter-spacing: 0.5px; flex-shrink: 0;
  `;
  nameRow.appendChild(channelBadge);

const body = document.createElement('div');
body.style.cssText = 'font-size:13px; color:#b9bbbe; display:flex; align-items:center; gap:6px; overflow:hidden;';

const mediaUrl = getEmoteOrImageUrlFromMessage(message);
if (mediaUrl) {
  const isEmote = isEmoteUrl(mediaUrl);
  const thumb = document.createElement('img');
  thumb.src = mediaUrl;
  thumb.style.cssText = isEmote
    ? 'width:28px; height:28px; object-fit:contain; flex-shrink:0;'
    : 'width:32px; height:24px; object-fit:cover; border-radius:3px; flex-shrink:0;';

  const label = document.createElement('span');
  label.textContent = isEmote ? '' : 'Sent an image';
  label.style.cssText = 'white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';

  body.appendChild(thumb);
  body.appendChild(label);
} else {
  body.textContent = getNotificationBody(message);
}

  nameCol.appendChild(nameRow);
  nameCol.appendChild(body);

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = `
    background: none; border: none; color: #72767d;
    font-size: 14px; cursor: pointer; padding: 0;
    flex-shrink: 0; align-self: flex-start; transition: color 0.15s;
  `;
  closeBtn.onmouseover = () => closeBtn.style.color = '#fff';
  closeBtn.onmouseout = () => closeBtn.style.color = '#72767d';
  closeBtn.onclick = (e) => { e.stopPropagation(); banner.remove(); };

  topRow.appendChild(avatarWrapper);
  topRow.appendChild(nameCol);
  topRow.appendChild(closeBtn);

  const jumpBtn = document.createElement('button');
  jumpBtn.textContent = 'Jump';
  jumpBtn.style.cssText = `
    background: #FF0000; color: white; border: none;
    padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 600;
    cursor: pointer; transition: background 0.15s; align-self: flex-end;
  `;
  jumpBtn.onmouseover = () => jumpBtn.style.background = '#cc0000';
  jumpBtn.onmouseout = () => jumpBtn.style.background = '#FF0000';
  jumpBtn.onclick = (e) => { e.stopPropagation(); switchChannel(channel); banner.remove(); };

  banner.appendChild(topRow);
  banner.appendChild(jumpBtn);
  banner.onclick = () => { switchChannel(channel); banner.remove(); };
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




let unreadCounts = new Map();
const CHANNELS = ["general", "bot"];
CHANNELS.forEach(ch => unreadCounts.set(ch, 0));

socket.on("message", (message) => {
  const msgChannel = message.channel || "general";
 if (message.userId !== user.id) {
 
  const notifEnabled = localStorage.getItem(`notif_${msgChannel}`) !== 'false';
    if (notifEnabled && notifSettings.browser) {
       
sendNotification(`New message in #${getChannelDisplayName(msgChannel)}`, getNotificationBody(message), {
  icon: sanitizeAvatar(message.avatar),
  tag: `msg-${msgChannel}`,
  requireInteraction: false
});
      
         
      showMessageNotificationBanner(msgChannel, message);
    

    if (notifSettings.sound) {
    const audio = new Audio('/sounds/message-new-email.oga');
    audio.volume = 0.5;
    audio.play().catch(() => {});
  }
 }


  
    const count = (unreadCounts.get(msgChannel) || 0) + 1;
    unreadCounts.set(msgChannel, count);
    updateChannelBadge(msgChannel, count);
 }

  if (msgChannel === currentChannel) {
    allHistoryMessages.push(message); 
    renderedEnd = allHistoryMessages.length; 
    addMessage(message, true);
  }
});


let totalUnread = 0;

function updateTabBadge() {
  totalUnread = 0;
  unreadCounts.forEach(count => totalUnread += count);
  const versionSuffix = window.APP_VERSION ? ` v${window.APP_VERSION}` : '';
  if (totalUnread > 0) {
    document.title = `(${totalUnread > 99 ? '99+' : totalUnread}) R00TED`;
  } else {
    document.title = `R00TED`;
  }


  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');

  const img = new Image();
  img.src = '/r00ted.svg';
  img.onload = () => {
    ctx.drawImage(img, 0, 0, 32, 32);

    if (totalUnread > 0) {
      ctx.beginPath();
      ctx.arc(24, 8, 9, 0, 2 * Math.PI);
      ctx.fillStyle = '#FF0000';
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(totalUnread > 99 ? '99+' : String(totalUnread), 24, 8);
    }

    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = canvas.toDataURL('image/png');
  };

  if (window.electronAPI) {
    window.electronAPI.updateBadge(totalUnread);
  }
}

function updateChannelBadge(channelName, count) {
  const channelEl = document.querySelector(`[data-channel="${channelName}"]`);
  if (!channelEl) return;

  const oldBadge = channelEl.querySelector('.channel-badge');
  if (oldBadge) oldBadge.remove();

  if (count > 0) {
    const badge = document.createElement('div');
    badge.className = 'channel-badge';
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.cssText = `
      position: absolute;
      top: 4px;
      right: 8px;
      background: #FF0000;
      color: white;
      border-radius: 50%;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      box-shadow: 0 0 8px rgba(171, 142, 217, 0.6);
    `;
    channelEl.appendChild(badge);
  }

  updateTabBadge();
  if (channelName === currentChannel) {
    markReadBtn.style.display = count > 0 ? 'block' : 'none';
  }
}


function switchChannel(channelName) {
  currentChannel = channelName;

  document.querySelectorAll('.channel-item').forEach(ch => {
    ch.classList.remove('active');
    ch.style.background = 'transparent';
    ch.style.color = '#b9bbbe';
    ch.style.borderLeft = '4px solid transparent';
  });

  const active = document.querySelector(`[data-channel="${channelName}"]`);
  active.classList.add('active');
  active.style.background = 'rgb(24, 24, 24)';
  active.style.color = 'white';
if (!document.getElementById("spinStyle")) {
    const style = document.createElement("style");
    style.id = "spinStyle";
    style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
    document.head.appendChild(style);
  }

  messagesDiv.innerHTML = `
    <div id="channelLoadingSpinner" style="
      display:flex; align-items:center; justify-content:center;
      height:100%; color:#b9bbbe; font-size:13px; gap:10px;
    ">
      <span style="width:22px;height:22px;border-radius:50%;border:3px solid #FF0000;border-top-color:transparent;display:inline-block;animation:spin 0.7s linear infinite;"></span>
      Loading messages...
    </div>
  `;
  socket.emit("joinChannel", { channel: channelName });
  const count = unreadCounts.get(channelName) || 0;
  markReadBtn.style.display = count > 0 ? 'block' : 'none';
}



function formatStreamDuration(startTime) {
  if (!startTime) return "Just went live";
  
  const now = Date.now();
  const diffMs = now - startTime;
  
  const seconds = Math.floor((diffMs / 1000) % 60);
  const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
  const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (days > 0) return `Live for ${days}d ${hours}h`;
  if (hours > 0) return `Live for ${hours}h ${minutes}m`;
  if (minutes > 0) return `Live for ${minutes}m ${seconds}s`;
  return `Live for ${seconds}s`;
}

const profileHeaderUpload = document.getElementById("profileHeaderUpload");

profileHeaderUpload.addEventListener("change", function(e) {
  const file = e.target.files[0];;
  if (!file) return;

  const fileType = file.type || "";
  const isAnimated = fileType === 'image/gif' || fileType === 'image/webp';

  if (isAnimated) {
    console.log("🎬 Animated header detected (GIF/WebP). Skipping cropper.");
    uploadAnimatedProfileHeader(file);
    e.target.value = '';
    return;
  }

  currentCropType = 'profileHeader';
  document.querySelector('#avatarEditorModal h3').textContent = 'Adjust Header';
  
  const imgElement = document.getElementById('avatarToCrop');
  imgElement.src = URL.createObjectURL(file);
  
  document.getElementById('avatarEditorModal').style.display = 'flex';
  
  imgElement.onload = () => {
    initCropper({ aspectRatio: 16/9, viewMode: 1 });
  };
});

function uploadProfileHeader(blob) {
  const progressEl = document.getElementById("uploadProgress");
  if (progressEl) progressEl.style.display = "block";

  const formData = new FormData();
  formData.append("avatar", blob, "profileHeader.png");

  const xhr = new XMLHttpRequest();
xhr.open("POST", "/upload-avatar", true);
xhr.setRequestHeader("Authorization", `Bearer ${localStorage.getItem("chatToken")}`);

  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable) {
      const percent = Math.round((event.loaded / event.total) * 100);
      const percentEl = document.getElementById("uploadPercent");
      if (percentEl) percentEl.textContent = percent + "%";
    }
  };

  xhr.onload = () => {
    if (progressEl) progressEl.style.display = "none";
    if (xhr.status === 200) {
      const data = JSON.parse(xhr.responseText);
      user.profileHeader = data.url;
      localStorage.setItem("chatUser", JSON.stringify(user));
      const preview = document.getElementById("profileHeaderPreview");
      if (preview) preview.style.backgroundImage = `url('${sanitizeAvatar(user.profileHeader)}')`;
      const popupBanner = document.getElementById('popupBanner');
      if (popupBanner) popupBanner.style.backgroundImage = `url('${sanitizeAvatar(user.profileHeader)}')`;
      if (socket && socket.connected) {
        socket.emit("updateUser", {
          user: {
            id: user.id,
            username: user.username,
            avatar: user.avatar,
            profileHeader: user.profileHeader,
            usernameColor: user.usernameColor,
            badge: user.badge || null,
            level: user.level || 1,
            prestigeBadge: user.prestigeBadge || null,
          }
        });
      }
      
     showToast("Profile header updated!");
    } else {
     showToast("Upload failed: " + xhr.responseText);
    }
  };

  xhr.onerror = () => {
    if (progressEl) progressEl.style.display = "none";
   showToast("Upload error");
  };

  xhr.send(formData);
}

function removeBanner() {
  user.banner = null;
  localStorage.setItem("chatUser", JSON.stringify(user));
  const myIndex = currentUsers.findIndex(u => u && u.id === user.id);
  if (myIndex !== -1) {
    currentUsers[myIndex].banner = null;
  }
  if (currentProfileUser && currentProfileUser.id === user.id) {
    currentProfileUser.banner = null;
  }

  
  
  const popupBanner = document.getElementById('popupBanner');

  document.getElementById('bannerUpload').value = '';
  document.getElementById('bannerPreview').style.backgroundImage = 'linear-gradient(135deg, #000000, #ffffff)';;
  
  if (socket && socket.connected) {
    socket.emit("updateUser", { 
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        banner: null,
        profileHeader: user.profileHeader,
        usernameColor: user.usernameColor,
        badge: user.badge || null,
        level: user.level || 1,
        prestigeBadge: user.prestigeBadge || null,
      }
    });
  }
 showToast("Banner removed!");
}

function removeProfileHeader() {
  user.profileHeader = null;
  localStorage.setItem("chatUser", JSON.stringify(user));
  const myIndex = currentUsers.findIndex(u => u && u.id === user.id);
  if (myIndex !== -1) {
    currentUsers[myIndex].profileHeader = null;
  }
  
  document.getElementById('profileHeaderPreview').style.backgroundImage = 'linear-gradient(135deg, #000000, #ffffff)';;
  document.getElementById('profileHeaderUpload').value = '';
  
  if (socket && socket.connected) {
    socket.emit("updateUser", { 
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        banner: user.banner,
        profileHeader: null,
        usernameColor: user.usernameColor,
        badge: user.badge || null,
        level: user.level || 1,
        prestigeBadge: user.prestigeBadge || null,
      }
    });
  }
 showToast("Profile header removed!");
}

let cropper = null;
let currentCropType = 'avatar';
function initCropper(options) {
  if (cropper) cropper.destroy();
  const image = document.getElementById('avatarToCrop');
  const src = image.src;
  
 cropper = new Cropper(image, {
    aspectRatio: options.aspectRatio,
    viewMode: 0,
    autoCropArea: 0.9,
    responsive: true,
    restore: false,
    checkCrossOrigin: false,
    checkOrientation: false,
    cropBoxResizable: true, 
    cropBoxMovable: true,   
  });
}

function openAvatarCrop(e) {
  const file = e.target.files[0];
  if (!file) return;
  currentCropType = 'avatar';
  document.querySelector('#avatarEditorModal h3').textContent = 'Adjust Avatar';
  const imgElement = document.getElementById('avatarToCrop');
  imgElement.src = URL.createObjectURL(file);
  document.getElementById('avatarEditorModal').style.display = 'flex';
  imgElement.onload = () => {
    initCropper({ aspectRatio: 1, viewMode: 1 });
  };
}

function openBannerCrop(e) {
  const file = e.target.files;
  if (!file) return;

  const fileType = file.type || "";
  const isAnimated = fileType === 'image/gif' || fileType === 'image/webp';

  if (isAnimated) {
    console.log("🎬 Animated banner detected (GIF/WebP). Skipping cropper.");
    uploadAnimatedBanner(file);
    e.target.value = '';
    return;
  }

  currentCropType = 'banner';
  document.querySelector('#avatarEditorModal h3').textContent = 'Adjust Banner';
  
  const imgElement = document.getElementById('avatarToCrop');
  imgElement.src = URL.createObjectURL(file);
  
  document.getElementById('avatarEditorModal').style.display = 'flex';
  
  imgElement.onload = () => {
    initCropper({ aspectRatio: 3, viewMode: 1 });
  };
}

document.getElementById('saveCropBtn').addEventListener('click', () => {
  if (!cropper) return;
    document.getElementById("profileHeaderUpload").value = '';
  document.getElementById("bannerUpload").value = '';
  
  const canvas = cropper.getCroppedCanvas({
    width: currentCropType === 'avatar' ? 256 : 900,
    height: currentCropType === 'avatar' ? 256 : 300,
  });

  canvas.toBlob((blob) => {
    if (!blob) {
     showToast("Error creating image.");
      return;
    }

    document.getElementById('avatarEditorModal').style.display = 'none';
    if (cropper) {
      cropper.destroy();
      cropper = null;
    }

    const progressEl = document.getElementById('uploadProgress');
    if (progressEl) progressEl.style.display = 'block';

    const formData = new FormData();

const filename = currentCropType === 'avatar' ? 'avatar.png' : 
                currentCropType === 'banner' ? 'banner.png' : 
                currentCropType === 'profileHeader' ? 'profileHeader.png' :
                currentCropType === 'serverBanner' ? 'serverBanner.png' :
                currentCropType === 'emote' ? `${currentEmoteName || 'emote'}.png` : 'image.png';

const fieldName = currentCropType === 'emote' ? 'emote' : 'avatar';

if (currentCropType === 'emote') {
  formData.append('name', currentEmoteName || '');
}
formData.append(fieldName, blob, filename);

const endpoint = currentCropType === 'emote' ? '/upload-emote' : '/upload-avatar';

const xhr = new XMLHttpRequest();
xhr.open('POST', endpoint, true);
xhr.setRequestHeader("Authorization", `Bearer ${localStorage.getItem("chatToken")}`);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        const percentEl = document.getElementById('uploadPercent');
        if (percentEl) percentEl.textContent = percent + '%';
      }
    };

    xhr.onload = () => {
      if (progressEl) progressEl.style.display = 'none';

      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        
        if (currentCropType === 'avatar') {
          user.avatar = data.url;
          const settingsPfp = document.getElementById('settingsPfp');
          if (settingsPfp) settingsPfp.src = sanitizeAvatar(user.avatar);
        } else if (currentCropType === 'banner') {
          user.banner = data.url;
          const preview = document.getElementById('bannerPreview');
          if (preview) preview.style.backgroundImage = `url('${sanitizeAvatar(user.banner)}')`;
        } else if (currentCropType === 'profileHeader') {
          user.profileHeader = data.url;
          const preview = document.getElementById('profileHeaderPreview');
          if (preview) preview.style.backgroundImage = `url('${sanitizeAvatar(user.profileHeader)}')`;

        } else if (currentCropType === 'serverBanner') {
          socket.emit('updateServerBanner', { url: data.url });
          const preview = document.getElementById('serverBannerPreview');
          if (preview) preview.style.backgroundImage = `url('${sanitizeAvatar(data.url)}')`;
         showToast('Server banner updated!');
          return;
        
      } else if (currentCropType === 'emote') {
        setTimeout(renderEmoteGrid, 300);
       showToast('Emote uploaded!');
        return;
      }
      

        localStorage.setItem('chatUser', JSON.stringify(user));
        if (typeof conference !== 'undefined' && conference) {
          try {
            if (currentCropType === 'avatar') {
              conference.setLocalParticipantProperty('avatar', user.avatar);
            } else if (currentCropType === 'banner') {
              conference.setLocalParticipantProperty('banner', user.banner);
            } else if (currentCropType === 'profileHeader') {
              conference.setLocalParticipantProperty('profileHeader', user.profileHeader);
            }
          } catch (error) {
            console.warn('Jitsi update failed:', error);
          }
        }

        if (socket && socket.connected) {
          socket.emit('updateUser', {
            user: {
              id: user.id,
              username: user.username,
              avatar: user.avatar,
              banner: user.banner,
              profileHeader: user.profileHeader,
              usernameColor: user.usernameColor,
              badge: user.badge || null,
              level: user.level || 1
            }
          });
        }
        const myIndex = currentUsers.findIndex(u => u && u.id === user.id);
        if (myIndex !== -1) {
          if (currentCropType === 'avatar') {
            currentUsers[myIndex].avatar = user.avatar;
          } else if (currentCropType === 'banner') {
            currentUsers[myIndex].banner = user.banner;
          } else if (currentCropType === 'profileHeader') {
            currentUsers[myIndex].profileHeader = user.profileHeader;
          }
        }

        renderUsers(currentUsers);
       showToast(`${currentCropType === 'avatar' ? 'Avatar' : currentCropType === 'banner' ? 'Banner' : 'Header'} updated!`);
      } else {
       showToast('Upload failed: ' + xhr.responseText);
      }
    };

    xhr.onerror = () => {
      if (progressEl) progressEl.style.display = 'none';
     showToast('Upload error');
    };

    xhr.send(formData);
  }, 'image/png');
});

document.getElementById('closeAvatarEditor').addEventListener('click', () => {
  document.getElementById('avatarEditorModal').style.display = 'none';
    document.getElementById("profileHeaderUpload").value = '';
  document.getElementById("bannerUpload").value = '';
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
  const img = document.getElementById('avatarToCrop');
  if (img.src.startsWith('blob:')) {
    URL.revokeObjectURL(img.src);
  }
});

document.getElementById("rotateLBtn").onclick = () => {
  const activeCropper = avatarCropper || cropper;
  activeCropper?.rotate(-90);
};

document.getElementById("rotateRBtn").onclick = () => {
  const activeCropper = avatarCropper || cropper;
  activeCropper?.rotate(90);
};

document.getElementById("flipHBtn").onclick = () => {
  const activeCropper = avatarCropper || cropper;
  activeCropper?.scaleX((activeCropper.getData().scaleX || 1) * -1);
};

document.getElementById("flipVBtn").onclick = () => {
  const activeCropper = avatarCropper || cropper;
  activeCropper?.scaleY((activeCropper.getData().scaleY || 1) * -1);
};

document.getElementById("resetBtn").onclick = () => {
  const activeCropper = avatarCropper || cropper;
  activeCropper?.reset();
};

document.getElementById("zoomSlider").addEventListener("input", (e) => {
  const activeCropper = avatarCropper || cropper;
  const val = parseFloat(e.target.value);
  activeCropper?.zoomTo(val);
  document.getElementById("zoomLevel").textContent = val.toFixed(1);
});


function uploadAnimatedBanner(file) {
  const progressEl = document.getElementById("uploadProgress");
  if (progressEl) progressEl.style.display = "block";

  const formData = new FormData();
  formData.append("avatar", file, file.name);

  const xhr = new XMLHttpRequest();
xhr.open("POST", "/upload-avatar", true);
xhr.setRequestHeader("Authorization", `Bearer ${localStorage.getItem("chatToken")}`);

  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable) {
      const percent = Math.round((event.loaded / event.total) * 100);
      const percentEl = document.getElementById("uploadPercent");
      if (percentEl) percentEl.textContent = percent + "%";
    }
  };

  xhr.onload = () => {
    if (progressEl) progressEl.style.display = "none";
    if (xhr.status === 200) {
      const data = JSON.parse(xhr.responseText);
      user.banner = data.url;
      localStorage.setItem("chatUser", JSON.stringify(user));
      
      const preview = document.getElementById("bannerPreview");
      if (preview) preview.style.backgroundImage = `url('${sanitizeAvatar(user.banner)}')`;
      
      if (socket && socket.connected) {
        socket.emit("updateUser", {
          user: {
            id: user.id,
            username: user.username,
            avatar: user.avatar,
            banner: user.banner,
            profileHeader: user.profileHeader,
            usernameColor: user.usernameColor,
            badge: user.badge || null,
            level: user.level || 1,
            prestigeBadge: user.prestigeBadge || null,
          }
        });
      }

      const myIndex = currentUsers.findIndex(u => u && u.id === user.id);
      if (myIndex !== -1) {
        currentUsers[myIndex].banner = user.banner;
      }
      renderUsers(currentUsers);
     showToast("Banner updated! (Note: Cropping is disabled for animated files)");
    } else {
     showToast("Upload failed: " + xhr.responseText);
    }
  };

  xhr.onerror = () => {
    if (progressEl) progressEl.style.display = "none";
   showToast("Upload error");
  };

  xhr.send(formData);
}

function uploadAnimatedProfileHeader(file) {
  const progressEl = document.getElementById("uploadProgress");
  if (progressEl) progressEl.style.display = "block";

  const formData = new FormData();
  formData.append("avatar", file, file.name);

  const xhr = new XMLHttpRequest();
xhr.open("POST", "/upload-avatar", true);
xhr.setRequestHeader("Authorization", `Bearer ${localStorage.getItem("chatToken")}`);

  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable) {
      const percent = Math.round((event.loaded / event.total) * 100);
      const percentEl = document.getElementById("uploadPercent");
      if (percentEl) percentEl.textContent = percent + "%";
    }
  };

  xhr.onload = () => {
    if (progressEl) progressEl.style.display = "none";
    if (xhr.status === 200) {
      const data = JSON.parse(xhr.responseText);
      user.profileHeader = data.url;
      localStorage.setItem("chatUser", JSON.stringify(user));
      
      const preview = document.getElementById("profileHeaderPreview");
      if (preview) preview.style.backgroundImage = `url('${sanitizeAvatar(user.profileHeader)}')`;
      
      if (socket && socket.connected) {
        socket.emit("updateUser", {
          user: {
            id: user.id,
            username: user.username,
            avatar: user.avatar,
            banner: user.banner,
            profileHeader: user.profileHeader,
            usernameColor: user.usernameColor,
            badge: user.badge || null,
            level: user.level || 1,
            prestigeBadge: user.prestigeBadge || null,
          }
        });
      }

      const myIndex = currentUsers.findIndex(u => u && u.id === user.id);
      if (myIndex !== -1) {
        currentUsers[myIndex].profileHeader = user.profileHeader;
      }
      renderUsers(currentUsers);
     showToast("Profile header updated! (Note: Cropping is disabled for animated files)");
    } else {
     showToast("Upload failed: " + xhr.responseText);
    }
  };

  xhr.onerror = () => {
    if (progressEl) progressEl.style.display = "none";
   showToast("Upload error");
  };

  xhr.send(formData);
}

socket.on('removePrivateYoutube', () => {
  const videoElements = document.querySelectorAll('.private-youtube-message');
  const last = videoElements[videoElements.length - 1];
  if (!last) return;
  const playerDiv = last.querySelector('[id^="yt-"]');
  if (playerDiv && activePlayers.has(playerDiv.id)) {
    activePlayers.get(playerDiv.id).destroy();
    activePlayers.delete(playerDiv.id);
  }
  if (last.parentNode) last.parentNode.removeChild(last);
});

socket.on("receivePrivateYoutube", async (data) => {
  const messagesDiv = document.getElementById("messages");

  const videoContainer = document.createElement("div");
  videoContainer.className = 'private-youtube-message';
  const playerId = `yt-${Date.now()}`;
  const videoId = getYouTubeId(data.url);

  if (!videoId) return;

  videoContainer.style.cssText = `
    margin: 10px 0;
    padding: 12px;
    background: #1e1f22;
    border-left: 4px solid #FF0000;
    border-radius: 6px;
    color: #fff;
  `;

  videoContainer.innerHTML = `
    <div style="font-size: 12px; color: #b9bbbe; margin-bottom: 8px;">
      📨 You Got Aids From <span style="color: #FF0000; font-weight: bold;">
      ${data.senderName}</span>
    </div>

    <div style="position: relative; width: 100%; aspect-ratio: 16/9; pointer-events: none;">
      <div id="${playerId}" style="position:absolute; inset:0;"></div>
    </div>

    <div style="margin-top: 6px; font-size: 11px; color: #72767d;">
      (Only visible to you)
    </div>
  `;

  messagesDiv.appendChild(videoContainer);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
  await loadYouTubeAPI();
  createPlayer(playerId, videoId);
});


socket.on('systemMessage', (data) => {
  if (data.type === 'success') {
    console.log(`${data.msg}`);
  }
});

const activePlayers = new Map();

function createPlayer(containerId, videoId) {
  if (activePlayers.has(containerId)) {
    activePlayers.get(containerId).destroy();
    activePlayers.delete(containerId);
  }

  const player = new YT.Player(containerId, {
    videoId,
    width: "100%",
    height: "100%",

    playerVars: {
      autoplay: 1,
      mute: 0,
      controls: 0,
      disablekb: 1,
      loop: 1,
      playlist: videoId,
      playsinline: 1
    },

    events: {
      onReady: (event) => {
        event.target.playVideo();
      },

      onStateChange: (event) => {
        if (event.data === YT.PlayerState.PAUSED) {
          event.target.playVideo();
        }
        if (event.data === YT.PlayerState.ENDED) {
          event.target.playVideo();
        }
      }
    }
  });

  activePlayers.set(containerId, player);

  return player;
}


function getYouTubeId(url) {
  try {
    const u = new URL(url);

    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);

    if (u.searchParams.get("v")) return u.searchParams.get("v");

    if (u.pathname.includes("/embed/")) {
      return u.pathname.split("/embed/")[1];
    }

    return null;
  } catch {
    return null;
  }
}



let ytReadyPromise = null;

function loadYouTubeAPI() {
  if (window.YT && window.YT.Player) return Promise.resolve();

  if (ytReadyPromise) return ytReadyPromise;

  ytReadyPromise = new Promise((resolve) => {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);

    window.onYouTubeIframeAPIReady = () => {
      resolve();
    };
  });

  return ytReadyPromise;
}


function renderChannelList(channels) {
  const textContainer = document.getElementById("channelsList");
  const voiceContainer = document.getElementById("voiceChannelsList");
  if (!textContainer || !voiceContainer) return;

const voicePanel = document.getElementById('voicePanel');
if (voicePanel && voicePanel.parentNode === voiceContainer) {
  document.querySelector('.sidebar2-content').appendChild(voicePanel);
}


  textContainer.innerHTML = "";
  voiceContainer.innerHTML = "";

  const textChannels = channels.filter(ch => ch.type !== "voice");
  const voiceChannels = channels.filter(ch => ch.type === "voice");

  textChannels.forEach(ch => {
    const item = document.createElement("div");
    item.className = "channel-item" + (ch.id === currentChannel ? " active" : "");
    item.dataset.channel = ch.id;
    item.style.cssText = `
      position: relative; display: flex; align-items: center; padding: 6px 10px;
      border-radius: 4px; cursor: pointer;
      color: ${ch.id === currentChannel ? "#fff" : "#b9bbbe"};
      background: ${ch.id === currentChannel ? "rgb(24,24,24)" : "transparent"};
      user-select: none; gap: 6px; font-size: 15px; transition: background 0.15s;
    `;
    const hash = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    hash.setAttribute("viewBox", "0 0 256 256");
    hash.setAttribute("width", "18");
    hash.setAttribute("height", "18");
    hash.style.cssText = "flex-shrink:0; fill:#80848e;";
    hash.innerHTML = `<path d="M164.193 37.8536c1.186-6.5205 7.433-10.8456 13.953-9.6602 6.521 1.1856 10.846 7.4327 9.661 13.9531L180.197 84H224c6.627 0 12 5.3726 12 12 0 6.627-5.373 12-12 12h-48.167l-7.272 40H208c6.627 0 12 5.373 12 12s-5.373 12-12 12h-43.803l-8.39 46.147c-1.186 6.52-7.433 10.845-13.953 9.66-6.521-1.186-10.846-7.433-9.661-13.953l7.61-41.854h-39.606l-8.3904 46.147c-1.1856 6.52-7.4327 10.845-13.9531 9.66-6.5204-1.186-10.8455-7.433-9.6601-13.953L75.8027 172H32c-6.6274 0-11.9999-5.373-12-12 0-6.627 5.3726-12 12-12h48.167l7.2725-40H48c-6.6274 0-11.9999-5.373-12-12 0-6.6274 5.3726-12 12-12h43.8027l8.3903-46.1464c1.186-6.5205 7.433-10.8456 13.953-9.6602 6.521 1.1856 10.846 7.4327 9.661 13.9531L116.197 84h39.606zM104.561 148h39.606l7.272-40h-39.606z"/>`;
    const name = document.createElement("span");
    name.style.cssText = "flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";
    name.textContent = ch.name;
    item.appendChild(hash);
    item.appendChild(name);
    item.addEventListener("click", () => switchChannel(ch.id));

    const bell = document.createElement("img");
    bell.className = "channel-bell";
    const bellEnabled = localStorage.getItem(`notif_${ch.id}`) !== "false";
    bell.src = bellEnabled ? "/svgs/bell-on.svg" : "/svgs/bell-off.svg";
    bell.style.cssText = `width:14px; height:14px; cursor:pointer; opacity:${bellEnabled ? "1" : "0.3"}; filter:brightness(0) invert(1); flex-shrink:0; transition:opacity 0.2s;`;
    bell.onclick = (e) => {
      e.stopPropagation();
      const enabled = localStorage.getItem(`notif_${ch.id}`) !== "false";
      localStorage.setItem(`notif_${ch.id}`, enabled ? "false" : "true");
      bell.src = enabled ? "/svgs/bell-off.svg" : "/svgs/bell-on.svg";
      bell.style.opacity = enabled ? "0.3" : "1";
    };
    item.appendChild(bell);

    if (user.isAdmin || user.isDeveloper) {
      const del = document.createElement("button");
      del.textContent = "✕";
      del.style.cssText = "background:none; border:none; color:#72767d; font-size:13px; cursor:pointer; padding:0 2px; line-height:1; flex-shrink:0; transition:color 0.15s;";
      del.onmouseover = () => del.style.color = "#ff3333";
      del.onmouseout = () => del.style.color = "#72767d";
      del.onclick = (e) => {
        e.stopPropagation();
        showConfirmModal(
          `All messages in #${ch.name} will be lost.`,
          () => socket.emit("deleteChannel", { id: ch.id }),
          { title: `Delete #${ch.name}?`, confirmLabel: "Delete" }
        );
      };
      item.appendChild(del);
    }

    const count = unreadCounts.get(ch.id) || 0;
    if (count > 0) updateChannelBadge(ch.id, count);
    textContainer.appendChild(item);
  });

  if (user.isAdmin || user.isDeveloper) {
    const addText = document.createElement("button");
    addText.style.cssText = "display:flex; align-items:center; gap:6px; background:none; border:none; color:#72767d; font-size:13px; cursor:pointer; padding:6px 10px; border-radius:4px; width:100%; transition:color 0.15s, background 0.15s; margin-top:4px;";
    addText.innerHTML = `<span style="font-size:18px;line-height:1;">＋</span> Add Text Channel`;
    addText.onmouseover = () => {
    addText.style.color = "#fff";
    addText.style.background = "rgba(255,255,255,0.05)";
    addText.style.width = "100%";
    addText.style.borderRadius = "9px";
  };
    addText.onmouseout = () => { addText.style.color = "#72767d"; addText.style.background = "none"; };
    addText.onclick = () => openCreateChannelModal("text");
    textContainer.appendChild(addText);
  }

voiceChannels.forEach(ch => {
     const isEmbed = ch.embed === true || ch.id === "vc-embed";
    const item = document.createElement("div");
    item.className = "voice-channel";
    item.dataset.room = ch.id;
    item.style.cssText = "display:flex; align-items:center; gap:8px; padding:6px 10px; border-radius:4px; cursor:pointer; color:#b9bbbe; position:relative; transition:background 0.15s; font-size:15px;";
    item.onmouseover = () => { if (!item.classList.contains("active")) item.style.background = "rgba(255,255,255,0.05)"; };
    item.onmouseout = () => { if (!item.classList.contains("active")) item.style.background = "transparent"; };


   const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 256 256");
    icon.setAttribute("width", "18");
    icon.setAttribute("height", "18");
    icon.style.cssText = "flex-shrink:0; fill:#80848e;";
    icon.innerHTML = `<path d="M116.693 32.0001C126.763 21.9201 144 29.056 144 43.3067V212.693c0 14.251-17.237 21.387-27.317 11.307l-48.0003-48H48.0958c-12.1705 0-24.725-7.094-28.3623-20.32-2.4426-8.821-3.7334-18.101-3.7334-27.68-.0115-9.351 1.2371-18.662 3.7119-27.68 3.648-13.237 16.2033-20.3199 28.374-20.3199h20.6074zm87.19 20.124c2.12 0 4.153.8417 5.653 2.3398 40.619 40.608 40.619 106.4541 0 147.0721-1.516 1.413-3.522 2.182-5.595 2.146-2.072-.037-4.049-.876-5.515-2.342s-2.305-3.443-2.342-5.516c-.036-2.072.733-4.078 2.146-5.594 8.172-8.172 14.656-17.874 19.079-28.551 4.423-10.678 6.699-22.122 6.699-33.679s-2.276-23.001-6.699-33.6786c-4.423-10.6774-10.907-20.3791-19.079-28.5508-1.499-1.5-2.34-3.5333-2.34-5.6533 0-2.1201.841-4.1534 2.34-5.6534 1.5-1.4981 3.533-2.3398 5.653-2.3398m-28.282 28.2724c1.051.0001 2.091.2071 3.062.6094.971.4024 1.853.992 2.596 1.7354 5.944 5.9431 10.659 12.9991 13.876 20.7647 3.217 7.765 4.873 16.089 4.873 24.494 0 8.406-1.656 16.729-4.873 24.494-3.217 7.766-7.932 14.822-13.876 20.765-1.51 1.456-3.531 2.261-5.628 2.242-2.098-.019-4.104-.861-5.587-2.345s-2.323-3.491-2.34-5.589c-.017-2.097.79-4.117 2.248-5.626 4.457-4.457 7.993-9.748 10.405-15.572 2.413-5.823 3.655-12.065 3.655-18.369 0-6.303-1.242-12.545-3.655-18.369-2.412-5.824-5.948-11.1151-10.405-15.5723-1.498-1.5-2.34-3.5334-2.34-5.6534 0-2.1199.842-4.1533 2.34-5.6533l-.011-.0107c.743-.7433 1.625-1.333 2.596-1.7354.971-.4023 2.013-.6094 3.064-.6094"/>`;


    const name = document.createElement("span");
    name.style.cssText = "flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";
    name.textContent = ch.name;

    const count = document.createElement("span");
    count.id = `vcCount-${ch.id}`;
    count.textContent = "0";
    count.style.cssText = "font-size:11px; color:#72767d; flex-shrink:0;";

    item.appendChild(icon);
    item.appendChild(name);
    item.appendChild(count);

    item.onclick = () => {
      if (!window.jitsiInitialized) {showToast("⏳ Voice server still connecting, please wait..."); return; }
      if (isEmbed) { joinEmbeddedJitsi(ch.id); return; }
      if (item.classList.contains("active")) { leaveVoice(); return; }
      joinVoiceChannelWithTimeout(ch.id);
    };

    if (user.isAdmin || user.isDeveloper) {
      const del = document.createElement("button");
      del.textContent = "✕";
      del.style.cssText = "background:none; border:none; color:#72767d; font-size:13px; cursor:pointer; padding:0 2px; flex-shrink:0; transition:color 0.15s;";
      del.onmouseover = () => del.style.color = "#ff3333";
      del.onmouseout = () => del.style.color = "#72767d";
      del.onclick = (e) => {
        e.stopPropagation();
        showConfirmModal(
          `This will remove the voice channel "${ch.name}".`,
          () => socket.emit("deleteChannel", { id: ch.id }),
          { title: `Delete voice channel "${ch.name}"?`, confirmLabel: "Delete" }
        );
      };
      item.appendChild(del);
    }

    const participantList = document.createElement("div");
    participantList.id = `vcParticipants-${ch.id}`;
    participantList.style.cssText = "display:flex;flex-direction:column;margin:0 0 2px 0;";

    voiceContainer.appendChild(item);
    voiceContainer.appendChild(participantList);
  });

  if (user.isAdmin || user.isDeveloper) {
    const addVoice = document.createElement("button");
    addVoice.style.cssText = "display:flex; align-items:center; gap:6px; background:none; border:none; color:#72767d; font-size:13px; cursor:pointer; padding:6px 10px; border-radius:4px; width:100%; transition:color 0.15s, background 0.15s; margin-top:4px;";
    addVoice.innerHTML = `<span style="font-size:18px;line-height:1;">＋</span> Add Voice Channel`;
    addVoice.onmouseover = () => { addVoice.style.color = "#fff"; addVoice.style.background = "rgba(255,255,255,0.05)"; addVoice.style.borderRadius = "9px";};
    addVoice.onmouseout = () => { addVoice.style.color = "#72767d"; addVoice.style.background = "none"; };
    addVoice.onclick = () => openCreateChannelModal("voice");
    voiceContainer.appendChild(addVoice);
  }

if (currentVoiceRoom) {
    const active = document.querySelector(`.voice-channel[data-room="${currentVoiceRoom}"]`);
    if (active && voicePanel) {
      active.parentNode.insertBefore(voicePanel, active.nextSibling);
      voicePanel.style.display = 'flex';
    }
  }

  if (window.jitsiInitialized) {
    enableVoiceChannelButtons();
  }

updateVoiceChannelParticipantLists(); 
}


function renderVoiceChannel(ch, container) {
  const item = document.createElement("div");
  item.className = "voice-channel";
  item.dataset.room = ch.id;
  item.style.cssText = `
    display: flex; align-items: center; gap: 8px;
    padding: 6px 10px; border-radius: 4px; cursor: pointer;
    color: #b9bbbe; position: relative; transition: background 0.15s;
  `;

  const icon = document.createElement("span");
  icon.textContent = "🔊";
  icon.style.fontSize = "14px";

  const name = document.createElement("span");
  name.textContent = ch.name;
  name.style.cssText = "flex:1; font-size:15px;";

  const count = document.createElement("span");
  count.id = `vcCount-${ch.id}`;
  count.textContent = "0";
  count.style.cssText = "font-size:11px; color:#72767d;";

  item.appendChild(icon);
  item.appendChild(name);
  item.appendChild(count);

  item.onclick = () => {
    if (item.classList.contains("active")) { leaveVoice(); return; }
    joinVoiceChannelWithTimeout(ch.id);
  };

  if (user.isAdmin || user.isDeveloper) {
    const del = document.createElement("button");
    del.textContent = "✕";
    del.style.cssText = "background:none; border:none; color:#72767d; cursor:pointer; font-size:13px;";
    del.onmouseover = () => del.style.color = "#ff3333";
    del.onmouseout = () => del.style.color = "#72767d";
   del.onclick = (e) => {
  e.stopPropagation();
  showConfirmModal(
    `This will remove the voice channel #${ch.name}.`,
    () => socket.emit("deleteChannel", { id: ch.id }),
    { title: `Delete voice channel #${ch.name}?`, confirmLabel: "Delete" }
  );
};
    item.appendChild(del);
  }
  item.addEventListener("mouseenter", () => {
    const participants = voiceRoomParticipants.get(ch.id) || [];
    if (participants.length === 0) return;
  });

  container.appendChild(item);
}


function appendAddButton(container, type) {
  const btn = document.createElement("button");
  btn.style.cssText = `
    display:flex; align-items:center; gap:6px; background:none; border:none;
    color:#72767d; font-size:13px; cursor:pointer; padding:6px 10px;
    border-radius:4px; width:100%; transition:color 0.15s, background 0.15s; margin-top:4px;
  `;
  btn.innerHTML = `<span style="font-size:18px;">＋</span> Add ${type === "voice" ? "Voice" : "Text"} Channel`;
  btn.onmouseover = () => { btn.style.color="#fff"; btn.style.background="rgba(255,255,255,0.05)"; };
  btn.onmouseout = () => { btn.style.color="#72767d"; btn.style.background="none"; };
  btn.onclick = () => openCreateChannelModal(type);
  container.appendChild(btn);
}




function openCreateChannelModal(type = "text") {
  document.getElementById("createChannelModal")?.remove();
  const modal = document.createElement("div");
  modal.id = "createChannelModal";
  modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.75); display:flex; align-items:center; justify-content:center; z-index:20000;";
  modal.innerHTML = `
    <div style="background:#2b2d31; border-radius:12px; padding:28px 32px; width:380px; box-shadow:0 20px 60px rgba(0,0,0,0.6); border:1px solid #3a3c42;">
      <h3 style="margin:0 0 6px; color:#fff; font-size:18px;">Create ${type === "voice" ? "Voice" : "Text"} Channel</h3>
      <p style="margin:0 0 20px; color:#b9bbbe; font-size:13px;">Lowercase letters, numbers, hyphens and underscores only.</p>
      <input id="newChannelNameInput" type="text" placeholder="${type === "voice" ? "lounge" : "new-channel"}" maxlength="32"
        style="width:100%; padding:10px 14px; background:#40444b; border:1px solid #40444b; border-radius:8px; color:#fff; font-size:15px; box-sizing:border-box; outline:none; transition:border-color 0.2s;">
      ${type === "voice" ? `
      <label style="display:flex; align-items:center; gap:8px; margin-top:14px; color:#b9bbbe; font-size:13px; cursor:pointer;">
        <input id="newChannelEmbedCheckbox" type="checkbox" style="cursor:pointer; width:16px; height:16px; accent-color:#FF0000;">
        Embed Voice Channel (opens the embedded Jitsi window instead of joining via voice controls)
      </label>` : ``}
      <p id="createChannelError" style="color:#ff3333; font-size:13px; min-height:18px; margin:8px 0 0;"></p>
      <div style="display:flex; gap:10px; margin-top:16px; justify-content:flex-end;">
        <button id="cancelCreateChannel" style="background:#40444b; border:none; color:#fff; padding:9px 18px; border-radius:8px; cursor:pointer; font-size:14px;">Cancel</button>
        <button id="confirmCreateChannel" style="background:#FF0000; border:none; color:#fff; padding:9px 18px; border-radius:8px; cursor:pointer; font-size:14px; font-weight:600;">Create</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const input = modal.querySelector("#newChannelNameInput");
  const embedCheckbox = modal.querySelector("#newChannelEmbedCheckbox");
  const errEl = modal.querySelector("#createChannelError");
  input.focus();
  input.addEventListener("focus", () => input.style.borderColor = "#FF0000");
  input.addEventListener("blur", () => input.style.borderColor = "#40444b");
  const submit = () => {
    const name = input.value.trim();
    if (!name) { errEl.textContent = "Channel name cannot be empty."; return; }
    const payload = { name, type };
    if (type === "voice") {
      payload.embed = !!embedCheckbox?.checked;
    }
    socket.emit("createChannel", payload);
  };
  modal.querySelector("#confirmCreateChannel").onclick = submit;
  modal.querySelector("#cancelCreateChannel").onclick = () => modal.remove();
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") modal.remove(); });
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
  const onError = (data) => { errEl.textContent = data.msg; socket.off("channelError", onError); };
  socket.on("channelError", onError);
}




socket.on("channelList", (channels) => {
  channelsById = new Map(channels.map(ch => [ch.id, ch]));
  channels.forEach(ch => {
    if (!unreadCounts.has(ch.id)) unreadCounts.set(ch.id, 0);
  });
  renderChannelList(channels);
  
 
  if (window.jitsiInitialized) {
    enableVoiceChannelButtons();
  }
  
  voiceRoomParticipants.forEach((participants, roomName) => {
    const countEl = document.getElementById(`vcCount-${roomName}`);
    if (!countEl) return;
    if (roomName === currentVoiceRoom) {
      countEl.textContent = remoteTracks.size + 1;
    } else {
      countEl.textContent = participants.length;
    }
  });
});

socket.on("channelCreated", (channel) => {
  channelsById.set(channel.id, channel);
  document.getElementById("createChannelModal")?.remove();
  unreadCounts.set(channel.id, 0);
  socket.emit("getChannels");
  console.log(`📢 Channel created: #${channel.name}`);
});

socket.on("channelDeleted", (data) => {
  channelsById.delete(data.id);
  unreadCounts.delete(data.id);
  if (currentChannel === data.id) {
    switchChannel("general");
  }

  console.log(`🗑️ Channel deleted: #${data.id}`);
});

socket.on("emoteListUpdated", (data) => {
  pepeList = data.pepeList || [];
  const existing = document.getElementById("pepePicker");
  if (existing) existing.remove();
  initializePepePicker();
  createBadgeSelector();
  initializeEmojiPicker();
});



function openEmoteManager() {
  document.getElementById("emoteManagerModal")?.remove();

  const modal = document.createElement("div");
  modal.id = "emoteManagerModal";
  modal.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.75);
    display: flex; align-items: center; justify-content: center; z-index: 20000;
  `;

  modal.innerHTML = `
    <div style="
      background: #2b2d31; border-radius: 12px; padding: 28px 32px;
      width: 520px; max-height: 80vh; display: flex; flex-direction: column;
      box-shadow: 0 20px 60px rgba(0,0,0,0.6); border: 1px solid #3a3c42;
    ">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:20px;">
        <h3 style="margin:0; color:#fff; font-size:18px;">Manage Emotes</h3>
        <button id="closeEmoteManager" style="
          background:none; border:none; color:#72767d; font-size:22px; cursor:pointer;
        ">✕</button>
      </div>

      <label style="
        display:flex; align-items:center; justify-content:center; gap:10px;
        background:#40444b; border:2px dashed #555; border-radius:8px;
        padding:20px; cursor:pointer; color:#b9bbbe; font-size:14px;
        transition:border-color 0.2s; margin-bottom:20px; flex-shrink:0;
      " id="emoteDropLabel">
        <span style="font-size:24px;">+</span>
        <span>Upload emote (PNG, GIF, WebP)</span>
        <input type="file" id="emoteFileInput" accept="image/png,image/jpeg,image/gif,image/webp"
          style="display:none;" multiple>
      </label>

      <div id="emoteUploadProgress" style="display:none; margin-bottom:12px; color:#b9bbbe; font-size:13px;">
        Uploading... <span id="emoteUploadPct">0%</span>
      </div>

   <div id="emoteGrid" style="
  display:grid; grid-template-columns: repeat(auto-fill, minmax(72px,1fr));
  gap:10px; overflow-y:auto; flex:1; padding: 4px 8px 4px 4px;
  overscroll-behavior: contain;
"></div>
    </div>
  `;

  document.body.appendChild(modal);

  renderEmoteGrid();

  document.getElementById("closeEmoteManager").onclick = () => modal.remove();
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });

  const label = document.getElementById("emoteDropLabel");
  const fileInput = document.getElementById("emoteFileInput");


modal.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.stopPropagation();
});

modal.addEventListener("drop", (e) => {
  e.preventDefault();
  e.stopPropagation();
});
modal.addEventListener("dragenter", (e) => {
  e.preventDefault();
  e.stopPropagation();
});

modal.addEventListener("dragleave", (e) => {
  e.stopPropagation();
});

label.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.stopPropagation();
  label.style.borderColor = "#FF0000";
});
label.addEventListener("dragleave", (e) => {
  e.stopPropagation();
  label.style.borderColor = "#555";
});


label.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
  label.style.borderColor = '#555';
  [...e.dataTransfer.files].forEach(uploadEmoteFile);
});

fileInput.addEventListener("change", (e) => {
  [...e.target.files].forEach(uploadEmoteFile);
  e.target.value = "";
});
}

function renderEmoteGrid() {
  const grid = document.getElementById("emoteGrid");
  if (!grid) return;
  grid.innerHTML = "";

  if (pepeList.length === 0) {
    grid.innerHTML = `<div style="color:#72767d; font-size:13px; grid-column:1/-1; text-align:center; padding:20px;">
      No emotes yet. Upload some above.
    </div>`;
    return;
  }

  pepeList.forEach(filename => {
    const wrapper = document.createElement("div");
   wrapper.style.cssText = `
  position:relative; border-radius:8px; overflow:hidden;
  background:#40444b; aspect-ratio:1; display:flex;
  align-items:center; justify-content:center;
  will-change: transform; transition: outline 0.15s;
  cursor: pointer;
`;
wrapper.onmouseover = () => wrapper.style.outline = '2px solid #FF0000';
wrapper.onmouseout = () => wrapper.style.outline = 'none';

    const img = document.createElement("img");
    img.src = `/avatars/${filename}`;
    img.style.cssText = "width:100%; height:100%; object-fit:contain;";
    img.title = filename;
    img.draggable = false;

    const del = document.createElement("button");
    del.innerHTML = "✕";
    del.title = "Delete emote";
    del.style.cssText = `
      position:absolute; top:3px; right:3px;
      background:rgba(0,0,0,0.7); border:none; color:#ff5555;
      font-size:12px; width:20px; height:20px; border-radius:50%;
      cursor:pointer; display:flex; align-items:center; justify-content:center;
      line-height:1; padding:0;
    `;
    del.onclick = () => deleteEmote(filename);

    wrapper.appendChild(img);
    wrapper.appendChild(del);
    grid.appendChild(wrapper);
  });
}

function promptEmoteName(defaultName, onConfirm) {
  document.getElementById("emoteNameModal")?.remove();
  const modal = document.createElement("div");
  modal.id = "emoteNameModal";
  modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.75); display:flex; align-items:center; justify-content:center; z-index:30001;";
  modal.innerHTML = `
    <div style="background:#2b2d31; border-radius:12px; padding:24px 28px; width:340px; box-shadow:0 20px 60px rgba(0,0,0,0.6); border:1px solid #3a3c42;">
      <h3 style="margin:0 0 14px; color:#fff; font-size:16px;">Name this emote</h3>
      <input id="emoteNameInput" type="text" value="${defaultName}" maxlength="32"
        style="width:100%; padding:9px 12px; background:#40444b; border:1px solid #40444b; border-radius:8px; color:#fff; font-size:14px; box-sizing:border-box; outline:none;">
      <div style="display:flex; gap:10px; margin-top:16px; justify-content:flex-end;">
        <button id="emoteNameCancel" style="background:#40444b; border:none; color:#fff; padding:8px 16px; border-radius:8px; cursor:pointer; font-size:13px;">Cancel</button>
        <button id="emoteNameConfirm" style="background:#FF0000; border:none; color:#fff; padding:8px 16px; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600;">Confirm</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const input = modal.querySelector("#emoteNameInput");
  input.focus();
  input.select();

  const submit = () => {
    const val = input.value.trim();
    modal.remove();
    if (val) onConfirm(val);
  };

  modal.querySelector("#emoteNameConfirm").onclick = submit;
  modal.querySelector("#emoteNameCancel").onclick = () => modal.remove();
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
    if (e.key === "Escape") modal.remove();
  });
}

function uploadEmoteFile(file) {
  const allowed = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];
  if (!allowed.includes(file.type)) {
    showToast(`❌ Unsupported file type: ${file.type}`);
    return;
  }

  const defaultName = file.name.replace(/\.[^/.]+$/, "");

  promptEmoteName(defaultName, (rawName) => {
    const emoteName = rawName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!emoteName) {
      showToast("❌ Invalid emote name");
      return;
    }

    const ext = file.name.split('.').pop().toLowerCase();
    const isAnimated = file.type === "image/gif" || file.type === "image/webp";

    if (isAnimated) {
  const progressEl = document.getElementById("emoteUploadProgress");
  const pctEl = document.getElementById("emoteUploadPct");
  if (progressEl) progressEl.style.display = "block";

  const formData = new FormData();
  formData.append("name", emoteName);
  formData.append("emote", file, `${emoteName}.${ext}`);

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/upload-emote", true);
  xhr.setRequestHeader("Authorization", `Bearer ${localStorage.getItem("chatToken")}`);
  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable && pctEl) pctEl.textContent = Math.round((e.loaded / e.total) * 100) + "%";
  };
  xhr.onload = () => {
    if (progressEl) progressEl.style.display = "none";
    if (xhr.status === 200) {
      setTimeout(renderEmoteGrid, 300);
    } else {
      showToast("Upload failed: " + xhr.responseText);
    }
  };
  xhr.onerror = () => {
    if (progressEl) progressEl.style.display = "none";
    showToast("Upload error");
  };
  xhr.send(formData);
  return;
}

    currentCropType = "emote";
    currentEmoteFile = file;
    currentEmoteName = emoteName;
    document.querySelector('#avatarEditorModal h3').textContent = 'Adjust Emote';

    const imgElement = document.getElementById('avatarToCrop');
    imgElement.src = URL.createObjectURL(file);

    document.getElementById('avatarEditorModal').style.display = 'flex';
    document.getElementById('avatarEditorModal').style.zIndex = '30000';

    imgElement.onload = () => {
      initCropper({ aspectRatio: NaN, viewMode: 0 });
    };
  });
}

function showConfirmModal(message, onConfirm, options = {}) {
  document.getElementById("appConfirmModal")?.remove();
  const modal = document.createElement("div");
  modal.id = "appConfirmModal";
  modal.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,0.75); display:flex; align-items:center; justify-content:center; z-index:30001;";
  modal.innerHTML = `
    <div style="background:#2b2d31; border-radius:12px; padding:24px 28px; width:360px; box-shadow:0 20px 60px rgba(0,0,0,0.6); border:1px solid #3a3c42;">
      <h3 style="margin:0 0 10px; color:#fff; font-size:16px;">${escapeHtml(options.title || "Are you sure?")}</h3>
      <p style="margin:0 0 18px; color:#b9bbbe; font-size:13px; line-height:1.5;">${escapeHtml(message)}</p>
      <div style="display:flex; gap:10px; justify-content:flex-end;">
        <button id="appConfirmCancel" style="background:#40444b; border:none; color:#fff; padding:8px 16px; border-radius:8px; cursor:pointer; font-size:13px;">Cancel</button>
        <button id="appConfirmOk" style="background:${options.danger === false ? '#FF0000' : '#e11d1d'}; border:none; color:#fff; padding:8px 16px; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600;">${escapeHtml(options.confirmLabel || "Confirm")}</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector("#appConfirmOk").onclick = () => { close(); onConfirm(); };
  modal.querySelector("#appConfirmCancel").onclick = close;
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
  document.addEventListener("keydown", function escHandler(e) {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", escHandler); }
  });
}

function deleteEmote(filename) {
  showConfirmModal(
    "This cannot be undone.",
    () => {
      fetch(`/delete-emote/${encodeURIComponent(filename)}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${localStorage.getItem("chatToken")}` }
      })
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            setTimeout(renderEmoteGrid, 300);
          } else {
            showToast("Delete failed: " + (data.error || "Unknown error"));
          }
        })
        .catch(() => showToast("Delete request failed"));
    },
    { title: `Delete emote "${filename}"?`, confirmLabel: "Delete" }
  );
}

document.getElementById('serverBannerUpload').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!user.isAdmin && !user.isDeveloper) return;

  const fileType = file.type || '';
  const isAnimated = fileType === 'image/gif' || fileType === 'image/webp';

  if (isAnimated) {
    uploadAnimatedServerBanner(file);
    e.target.value = '';
    return;
  }

  currentCropType = 'serverBanner';
  document.querySelector('#avatarEditorModal h3').textContent = 'Adjust Server Banner';

  const imgElement = document.getElementById('avatarToCrop');
  imgElement.src = URL.createObjectURL(file);

  document.getElementById('avatarEditorModal').style.display = 'flex';

  imgElement.onload = () => {
    initCropper({});
  };

  e.target.value = '';
});

function uploadAnimatedServerBanner(file) {
  const progressEl = document.getElementById('uploadProgress');
  const percentEl = document.getElementById('uploadPercent');
  if (progressEl) progressEl.style.display = 'block';

  const formData = new FormData();
  formData.append('avatar', file, file.name);

  const xhr = new XMLHttpRequest();
xhr.open("POST", "/upload-avatar", true);
xhr.setRequestHeader("Authorization", `Bearer ${localStorage.getItem("chatToken")}`);

  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable && percentEl) {
      percentEl.textContent = Math.round((event.loaded / event.total) * 100) + '%';
    }
  };

  xhr.onload = () => {
    if (progressEl) progressEl.style.display = 'none';
    if (xhr.status === 200) {
      const data = JSON.parse(xhr.responseText);
      socket.emit('updateServerBanner', { url: data.url });
     showToast('Server banner updated!');
    } else {
     showToast('Upload failed: ' + xhr.responseText);
    }
  };

  xhr.onerror = () => {
    if (progressEl) progressEl.style.display = 'none';
   showToast('Upload error');
  };

  xhr.send(formData);
}

function removeServerBanner() {
  if (!user.isAdmin && !user.isDeveloper) return;
  showConfirmModal(
    "This will remove the server banner for everyone.",
    () => socket.emit('updateServerBanner', { url: null }),
    { title: "Remove server banner?", confirmLabel: "Remove" }
  );
}

function applyServerBanner(url) {
  const bannerEl = document.getElementById('serverBanner');
  const previewEl = document.getElementById('serverBannerPreview');
  if (url) {
    if (bannerEl) bannerEl.style.backgroundImage = `url('${sanitizeAvatar(url)}')`;
    if (previewEl) previewEl.style.backgroundImage = `url('${sanitizeAvatar(url)}')`;
  } else {
    if (bannerEl) { bannerEl.style.backgroundImage = 'none'; bannerEl.style.backgroundColor = '#000'; }
    if (previewEl) { previewEl.style.backgroundImage = 'none'; previewEl.style.backgroundColor = '#000'; }
  }
}

socket.on('serverBannerUpdated', (data) => {
  applyServerBanner(data.url);
});
const gameDetection = {
  currentGame: null,
  detectionInterval: null,

  start() {
    if (this.detectionInterval) return;
    this.detectionInterval = setInterval(() => this.detectGame(), 5000);
    this.detectGame();
  },

  async detectGame() {
    try {
      if (!window.electronAPI?.getRunningGames) return;
      const gameName = await window.electronAPI.getRunningGames();
      if (gameName !== this.currentGame) {
        this.currentGame = gameName;
        this.updateStatus(gameName);
      }
    } catch (e) {}
  },

  updateStatus(gameName) {
    if (gameName) {
      window.setGameStatus(gameName);
    } else if (this.lastPushedGame) {
      window.clearGameStatus(this.lastPushedGame);
    }
    this.lastPushedGame = gameName || null;
  }
};




socket.on('connect', () => {
  console.log('[DEBUG] connected', socket.id, Date.now())
  if (window.electronAPI?.getRunningGames) {
    gameDetection.start();
    if (gameDetection.currentGame) {
      gameDetection.updateStatus(gameDetection.currentGame);
    }
  }
});

function updateVoiceChannelParticipantLists() {
  voiceRoomParticipants.forEach((participants, roomName) => {
    const list = document.getElementById(`vcParticipants-${roomName}`);
    if (!list) return;

    if (roomName === currentVoiceRoom) {
      list.innerHTML = "";
      return;
    }

    function rowSignature(p) {
      const uid = p.userId || p.id;
      const userData = uid === user.id ? user : (currentUsers.find(u => u.id === uid) || {});
      return [
        uid, p.username, p.avatar, p.usernameColor,
        userData.level, userData.badge, userData.prestigeBadge,
        userData.isAdmin, userData.isDeveloper, userData.isPromptEngineer
      ].join("|");
    }

    const existingRows = new Map();
    list.querySelectorAll('[data-vc-row-id]').forEach(el => {
      existingRows.set(el.dataset.vcRowId, el);
    });

    const fragment = document.createDocumentFragment();

    participants.forEach(p => {
      const uid = p.userId || p.id;
      const sig = rowSignature(p);
      const existing = existingRows.get(uid);

      if (existing && existing.dataset.vcRowSig === sig) {
        fragment.appendChild(existing);
      } else {
        const row = buildVoiceSidebarRow(
          p.username,
          p.avatar,
          p.usernameColor || "username-cyan",
          uid
        );
        row.style.opacity = "0.55";
        row.style.filter = "saturate(0.6)";
        row.dataset.vcRowId = uid;
        row.dataset.vcRowSig = sig;
        fragment.appendChild(row);
      }
    });

    list.innerHTML = "";
    list.appendChild(fragment);
  });
}

function buildVoiceSidebarRow(username, avatar, colorClass, userId) {
  const stateKey = userId === user.id ? user.id : userId;
  const state = voiceStates.get(stateKey) || { isMuted: false, isDeafened: false };
  const userData = userId === user.id ? user : (currentUsers.find(u => u.id === userId) || {});
  const level = userData.level || 1;
  const badge = userData.badge || null;
  const prestigeBadge = userData.prestigeBadge || null;
  const customRoleId = userData.customRoleId || null;
  const isAdmin = userData.isAdmin || false;
  const isDeveloper = userData.isDeveloper || false;
  const isPromptEngineer = userData.isPromptEngineer || false;
  const customRoleIds = userData.customRoleIds || [];
  

if (userId !== user.id && conference) {
    const p = conference.getParticipantById(userId);
    if (p) {
      return buildParticipantRow(
        userId,
        p.getProperty("avatar") || "/avatars/default1.png",
        p.getDisplayName() || username,
        p.getProperty("usernameColor") || colorClass,
        parseInt(p.getProperty("level")) || 1,
        p.getProperty("badge") || null,
        p.getProperty("isAdmin") === "true",
        p.getProperty("isDeveloper") === "true",
        p.getProperty("isPromptEngineer") === "true",
        p.getProperty("prestigeBadge") || null,
        (() => { try { return JSON.parse(p.getProperty("customRoleIds") || "[]"); } catch { return []; } })()
      );
    }
}


if (userId === user.id) {
    return buildParticipantRow(
      "local", user.avatar, user.username,
      user.usernameColor || "username-cyan",
      user.level || 1, user.badge || null,
      user.isAdmin || false, user.isDeveloper || false, user.isPromptEngineer || false,
      user.prestigeBadge || null,
      user.customRoleIds || []
    );
}

  return buildParticipantRow(
    userId,
    avatar,
    username,
    colorClass,
    level,
    badge,
    isAdmin,
    isDeveloper,
    isPromptEngineer,
    prestigeBadge,
    customRoleIds
  );
}


let audioPreviewStream = null;
let audioPreviewContext = null;
let audioPreviewAnimFrame = null;

async function initAudioTab() {
  const inputSelect = document.getElementById("audioInputSelect");
  const outputSelect = document.getElementById("audioOutputSelect");
  const micLevelBar = document.getElementById("micLevelBar");
  const micStatusText = document.getElementById("micStatusText");
  const micLevelText = document.getElementById("micLevelText");

  stopAudioPreview();

  try {
    const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    tempStream.getTracks().forEach(t => t.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();
    const savedInput = localStorage.getItem("preferredAudioInput") || "";
    const savedOutput = localStorage.getItem("preferredAudioOutput") || "";

    inputSelect.innerHTML = "";
    outputSelect.innerHTML = "";

    devices.filter(d => d.kind === "audioinput").forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.deviceId;
      opt.textContent = d.label || `Microphone ${inputSelect.options.length + 1}`;
      if (d.deviceId === savedInput) opt.selected = true;
      inputSelect.appendChild(opt);
    });

    devices.filter(d => d.kind === "audiooutput").forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.deviceId;
      opt.textContent = d.label || `Speaker ${outputSelect.options.length + 1}`;
      if (d.deviceId === savedOutput) opt.selected = true;
      outputSelect.appendChild(opt);
    });

    startAudioPreview(inputSelect.value);

    inputSelect.onchange = () => startAudioPreview(inputSelect.value);

  } catch (err) {
    micStatusText.textContent = "❌ Microphone permission denied";
    micStatusText.style.color = "#ff3333";
  }

 document.getElementById("applyAudioDevices").onclick = async () => {
  const inputId = inputSelect.value;
  const outputId = outputSelect.value;
  localStorage.setItem("preferredAudioInput", inputId);
  localStorage.setItem("preferredAudioOutput", outputId);
  if (outputId) {
    document.querySelectorAll("audio").forEach(async el => {
      if (el.setSinkId) try { await el.setSinkId(outputId); } catch (e) {}
    });
  }

  if (currentVoiceRoom && localAudioTrack) {
    const room = currentVoiceRoom;
    stopAudioPreview();
    settingsModal.classList.remove("show");
    try {
      leaveVoice();
      await new Promise(r => setTimeout(r, 800));
      await joinVoiceChannelWithTimeout(room);
      if (inputId && localAudioTrack) {
        try {
          const newTracks = await JitsiMeetJS.createLocalTracks({
            devices: ["audio"],
            micDeviceId: inputId,
            constraints: { audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true } }
          });
          const newTrack = newTracks[0];
          await conference.replaceTrack(localAudioTrack, newTrack);
          localAudioTrack.dispose();
          localAudioTrack = newTrack;
          currentActiveAudioTrack = newTrack;
          newTrack.addEventListener(
          JitsiMeetJS.events.track.TRACK_AUDIO_LEVEL_CHANGED,
          (level) => handleAudioLevel("local", level)
        );
        } catch (e) {
          console.warn("Track replace after rejoin failed:", e);
        }
      }
    } catch (err) {
      console.error("Rejoin failed:", err);
     showToast("❌ Failed to rejoin voice. Please rejoin manually.");
    }
  } else {
   showToast("Preferences saved. They'll apply next time you join voice.");
  }
};
}

let audioLoopbackNode = null;
let micLoopbackEnabled = false;

async function startAudioPreview(deviceId) {
  stopAudioPreview();
  const micLevelBar = document.getElementById("micLevelBar");
  const micStatusText = document.getElementById("micStatusText");
  const micLevelText = document.getElementById("micLevelText");
  const loopbackToggle = document.getElementById("micLoopbackToggle");
  if (!micLevelBar) return;

  micStatusText.textContent = "Testing...";
  micStatusText.style.color = "#b9bbbe";

  try {
 audioPreviewStream = await navigator.mediaDevices.getUserMedia({
    audio: deviceId
        ? {
            deviceId: { exact: deviceId },
            echoCancellation: false, 
            noiseSuppression: false,  
            autoGainControl: true,   
          }
        : {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          }
});


    audioPreviewContext = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioPreviewContext.createMediaStreamSource(audioPreviewStream);
    const analyser = audioPreviewContext.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const filter = audioPreviewContext.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 8000;
    audioLoopbackNode = audioPreviewContext.createGain();
    audioLoopbackNode.gain.value = 0;

    source.connect(filter);
    filter.connect(audioLoopbackNode);
    audioLoopbackNode.connect(audioPreviewContext.destination);

if (loopbackToggle) {
  loopbackToggle.checked = micLoopbackEnabled;
  loopbackToggle.onchange = () => {
    micLoopbackEnabled = loopbackToggle.checked;
    if (audioLoopbackNode) {
      audioLoopbackNode.gain.cancelScheduledValues(audioPreviewContext.currentTime);
      audioLoopbackNode.gain.setTargetAtTime(
        micLoopbackEnabled ? 0.6 : 0,
        audioPreviewContext.currentTime,
        0.05
      );
    }
  };
}

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let silenceFrames = 0;

    function draw() {
      audioPreviewAnimFrame = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      const pct = Math.min(100, Math.round((avg / 128) * 200));
      micLevelBar.style.width = pct + "%";
      micLevelText.textContent = pct + "%";
      if (pct > 5) {
        silenceFrames = 0;
        micStatusText.textContent = "Microphone working";
        micStatusText.style.color = "#23a559";
      } else {
        if (++silenceFrames > 60) {
          micStatusText.textContent = "🎙️ Speak to test...";
          micStatusText.style.color = "#b9bbbe";
        }
      }
    }
    draw();
  } catch (err) {
    micStatusText.textContent = "❌ Could not access device";
    micStatusText.style.color = "#ff3333";
  }
}

function stopAudioPreview() {
  if (audioPreviewAnimFrame) { cancelAnimationFrame(audioPreviewAnimFrame); audioPreviewAnimFrame = null; }
  if (audioPreviewStream) { audioPreviewStream.getTracks().forEach(t => t.stop()); audioPreviewStream = null; }
  if (audioPreviewContext) { audioPreviewContext.close().catch(() => {}); audioPreviewContext = null; }
  audioLoopbackNode = null;
  const bar = document.getElementById("micLevelBar");
  const txt = document.getElementById("micLevelText");
  if (bar) bar.style.width = "0%";
  if (txt) txt.textContent = "0%";
}

function stopAudioPreview() {
  if (audioPreviewAnimFrame) { cancelAnimationFrame(audioPreviewAnimFrame); audioPreviewAnimFrame = null; }
  if (audioPreviewStream) { audioPreviewStream.getTracks().forEach(t => t.stop()); audioPreviewStream = null; }
  if (audioPreviewContext) { audioPreviewContext.close().catch(() => {}); audioPreviewContext = null; }
  const bar = document.getElementById("micLevelBar");
  const txt = document.getElementById("micLevelText");
  if (bar) bar.style.width = "0%";
  if (txt) txt.textContent = "0%";
}


function updateNamePreview(colorClass) {
  const previewUsername = document.getElementById('previewUsername');
  const previewAvatar = document.getElementById('previewAvatar');
  const previewLevel = document.getElementById('previewLevel');
  const previewBadge = document.getElementById('previewBadge');
  if (!previewUsername) return;

  previewUsername.className = `username-wrapper ${colorClass}`;
  previewUsername.setAttribute('data-text', user.username);
  previewUsername.textContent = user.username;

  previewAvatar.src = sanitizeAvatar(user.avatar);
  previewAvatar.setAttribute('data-color', colorClass);
  previewAvatar.style.border = '3px solid';
  previewAvatar.style.borderRadius = '50%';
  previewAvatar.style.borderColor = colorClassToHex[colorClass] || '#00f2ff';

  const level = user.level || 1;
  const lvlColor = getLevelColor(level);
  const lvlRgb = getLevelRgb(level);
  previewLevel.textContent = level;
  previewLevel.style.cssText = `
    font-size:11px; color:${lvlColor}; -webkit-text-fill-color:${lvlColor};
    background:rgba(${lvlRgb.r},${lvlRgb.g},${lvlRgb.b},0.2);
    -webkit-background-clip:initial; background-clip:initial;
    font-weight:700; padding:2px 6px; border-radius:3px;
    border:1px solid ${lvlColor}; display:inline-block; position:relative;
  `;

  if (user.badge) {
    previewBadge.src = sanitizeAvatar(user.badge);
    previewBadge.style.display = 'inline-block';
  } else {
    previewBadge.style.display = 'none';
  }
}

function resolveCustomRoles(ids) {
  return (ids || [])
    .map(id => customRoles.find(r => r.id === id))
    .filter(Boolean)                               
    .map(r => ({ name: r.name, color: r.color, badge: r.badge ? `/avatars/${r.badge}` : null }));
  
}

function pushOverlayVoiceUpdate() {
  if (!window.electronAPI?.overlayVoiceUpdate) return;

  if (!currentVoiceRoom) {
    window.electronAPI.overlayVoiceUpdate([]);
    return;
  }

  const devBadgeUrl = SERVER_CONFIG?.server?.servericon
    ? `https://${SERVER_CONFIG.server.servericon}/r00ted.png`
    : null;
  const promptEngineerBadgeUrl = 'https://upload.wikimedia.org/wikipedia/commons/archive/6/66/20260430054317%21OpenAI_logo_2025_%28symbol%29.svg';

  const participants = [];
  participants.push({
    id: 'local',
    avatar: sanitizeAvatar(user.avatar),
    username: user.username,
    isMuted: isCurrentlyMuted,
    isDeafened: isDeafened,
    usernameColor: user.usernameColor || 'username-cyan',
    avatarBorderColor: colorClassToHex[user.usernameColor] || '#00f2ff',
    level: user.level || 1,
    badge: user.badge || null,
    prestigeBadge: user.prestigeBadge || null,
    isAdmin: user.isAdmin || false,
    isDeveloper: user.isDeveloper || false,
    isPromptEngineer: user.isPromptEngineer || false,
    devBadgeUrl,
    promptEngineerBadgeUrl,
    speaking: document.querySelector('.voice-participant[data-id="local"]')?.classList.contains('speaking') || false,
    ping: currentVoiceRoom ? currentPingMs : null,
    customRoles: resolveCustomRoles(user.customRoleIds),
  });

  remoteTracks.forEach((audio, id) => {
  const participant = conference?.getParticipantById(id);
  if (!participant) return;
  const stateKey = participant.getProperty("userId") || id;
  const state = voiceStates.get(stateKey) || {};
  const remoteColorClass = participant.getProperty("usernameColor") || 'username-cyan';

  let remoteCustomRoleIds = [];
  try { remoteCustomRoleIds = JSON.parse(participant.getProperty("customRoleIds") || "[]"); } catch {}

  participants.push({
    id,
    avatar: sanitizeAvatar(participant.getProperty("avatar") || "/avatars/default1.png"),
    username: participant.getDisplayName() || "Anonymous",
    isMuted: !!state.isMuted,
    isDeafened: !!state.isDeafened,
    usernameColor: remoteColorClass,
    avatarBorderColor: colorClassToHex[remoteColorClass] || '#00f2ff',
    level: parseInt(participant.getProperty("level")) || 1,
    badge: participant.getProperty("badge") || null,
    prestigeBadge: participant.getProperty("prestigeBadge") || null,
    isAdmin: participant.getProperty("isAdmin") === "true",
    isDeveloper: participant.getProperty("isDeveloper") === "true",
    isPromptEngineer: participant.getProperty("isPromptEngineer") === "true",
    devBadgeUrl,
    promptEngineerBadgeUrl,
    speaking: document.querySelector(`.voice-participant[data-id="${id}"]`)?.classList.contains('speaking') || false,
    customRoles: resolveCustomRoles(remoteCustomRoleIds),
  });
});

  window.electronAPI.overlayVoiceUpdate(participants);
}
let overlaySettings = { enabled: true };
let overlayScreenInfo = null;

async function loadOverlaySettings() {
  if (!window.electronAPI?.overlayGetInfo) return;
  const info = await window.electronAPI.overlayGetInfo();
  overlaySettings.enabled = info.enabled;
  document.getElementById("toggleGameOverlay").checked = info.enabled;
  initOverlayPreview(info);
}

document.getElementById("toggleGameOverlay").addEventListener("change", (e) => {
  overlaySettings.enabled = e.target.checked;
  window.electronAPI?.overlaySetEnabled?.(e.target.checked);

  if (e.target.checked) {
    pushOverlayVoiceUpdate();
  }
});

async function initOverlayPreview(info) {
  const screenEl = document.getElementById("overlayPreviewScreen");
  const boxEl = document.getElementById("overlayPreviewBox");
  if (!screenEl || !boxEl) return;

  screenEl.style.boxSizing = 'border-box';
  boxEl.style.boxSizing = 'border-box';
  overlayScreenInfo = info;
  boxEl.style.visibility = 'hidden';
  requestAnimationFrame(() => requestAnimationFrame(() => {
    screenEl.offsetHeight; 
    const previewWidth = screenEl.getBoundingClientRect().width || 480;
    const previewHeight = previewWidth * (info.screenHeight / info.screenWidth);
    screenEl.style.height = previewHeight + 'px';
    screenEl.offsetHeight;
    const OVERLAY_REAL_WIDTH = 220;
    const OVERLAY_REAL_HEIGHT = 90;
    const scale = previewWidth / info.screenWidth;
    boxEl.style.width = (OVERLAY_REAL_WIDTH * scale) + 'px';
    boxEl.style.height = (OVERLAY_REAL_HEIGHT * scale) + 'px';
    boxEl.style.left = (info.x * scale) + 'px';
    boxEl.style.top = (info.y * scale) + 'px';
    boxEl.style.visibility = 'visible';

    attachDragHandlers(boxEl, screenEl);
  }));
}

function attachDragHandlers(boxEl, screenEl) {
  let dragging = false;
  let offsetX = 0, offsetY = 0;

  boxEl.onmousedown = (e) => {
    dragging = true;
    boxEl.style.cursor = 'grabbing';
    const rect = boxEl.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    e.preventDefault();
  };

  document.onmousemove = (e) => {
    if (!dragging) return;
    const screenRect = screenEl.getBoundingClientRect();
    const boxRect = boxEl.getBoundingClientRect();
    let left = e.clientX - screenRect.left - offsetX;
    let top = e.clientY - screenRect.top - offsetY;
    left = Math.max(0, Math.min(left, screenRect.width - boxRect.width));
    top = Math.max(0, Math.min(top, screenRect.height - boxRect.height));
    boxEl.style.left = left + 'px';
    boxEl.style.top = top + 'px';
  };

  document.onmouseup = () => {
    if (!dragging) return;
    dragging = false;
    boxEl.style.cursor = 'grab';

    const screenRect = screenEl.getBoundingClientRect();
    const scaleX = overlayScreenInfo.screenWidth / screenRect.width;
    const scaleY = overlayScreenInfo.screenHeight / screenRect.height;
    const realX = Math.round(parseFloat(boxEl.style.left) * scaleX);
    const realY = Math.round(parseFloat(boxEl.style.top) * scaleY);

    window.electronAPI?.overlaySavePosition?.({ x: realX, y: realY });
  };
}

function positionPreviewBox(boxEl, screenEl, realX, realY, realW, realH) {
  requestAnimationFrame(() => {
    const screenRect = screenEl.getBoundingClientRect();
    const scaleX = screenRect.width / realW;
    const scaleY = screenRect.height / realH;
    boxEl.style.left = (realX * scaleX) + 'px';
    boxEl.style.top = (realY * scaleY) + 'px';
  });
}

document.getElementById("resetOverlayPosBtn").addEventListener("click", () => {
  window.electronAPI?.overlayResetPosition?.();
  showToast("Overlay position reset");
  const boxEl = document.getElementById("overlayPreviewBox");
  const screenEl = document.getElementById("overlayPreviewScreen");
  if (overlayScreenInfo) positionPreviewBox(boxEl, screenEl, 20, 420, overlayScreenInfo.screenWidth, overlayScreenInfo.screenHeight);
});

if (window.electronAPI?.onOverlayRequestRefresh) {
  window.electronAPI.onOverlayRequestRefresh(() => {
    console.log('🔄 Overlay ready, pushing current voice state');
    pushOverlayVoiceUpdate();
  });
}







let emojiViewMode = "categories";
let emojiActiveCategory = null;
const EMOJI_CATEGORY_ICONS = {
  "Smileys & Emotion": "😀",
  "People & Body": "🙌",
  "Animals & Nature": "🐻",
  "Food & Drink": "🍔",
  "Travel & Places": "✈️",
  "Activities": "⚽",
  "Objects": "💡",
  "Symbols": "❤️",
  "Flags": "🏳️"
};


let lastEmojiClick = { emoji: null, time: 0 };
let emojiList = [];
let emojiPickerState = { page: 0, filtered: [] };
const EMOJIS_PER_PAGE = 40;




function sendSingleEmoji(emoji) {
  const msg = {
    id: crypto.randomUUID(),
    userId: user.id,
    username: user.username,
    avatar: user.avatar,
    text: emoji,
    channel: currentChannel,
    badge: user.badge,
    usernameColor: user.usernameColor,
    level: user.level || 1,
    isAdmin: user.isAdmin || false,
    isDeveloper: user.isDeveloper || false,
    isPromptEngineer: user.isPromptEngineer || false,
    isBot: user.isBot || false,
    prestigeBadge: user.prestigeBadge || null,
    time: Date.now(),
    type: "text"
  };
  socket.emit("message", msg);
}

async function loadEmojiData() {
  if (emojiList.length > 0) return;
  try {
    const res = await fetch("https://cdn.jsdelivr.net/npm/unicode-emoji-json@0.6.0/data-by-emoji.json");
    const data = await res.json();
    emojiList = Object.entries(data).map(([emoji, info]) => ({
      emoji,
      name: info.name,
      group: info.group
    }));
  } catch (e) {
    console.error("Failed to load emoji data:", e);
  }
}

function initializeEmojiPicker() {
  const existing = document.getElementById("emojiPicker");
  if (existing) existing.remove();

  const emojiPicker = document.createElement("div");
  emojiPicker.id = "emojiPicker";
  emojiPicker.style.cssText = `
    position: absolute;
    display: flex;
    flex-direction: column;
    width: 311px;
    max-height: 395px;
    background: #111214;
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.6);
    overflow: hidden;
    z-index: 10005;
    user-select: none;
    -webkit-user-select: none;
  `;

  const header = document.createElement("div");
  header.style.cssText = `padding: 8px; flex-shrink: 0;`;


  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "Search emojis...";
  searchInput.style.cssText = `
    width: 100%; box-sizing: border-box; padding: 7px 10px;
    background: #1e1f22; border-radius: 6px;
    color: #fff; font-size: 13px; outline: none; transition: border-color 0.15s;
  `;
  searchInput.onfocus = () => searchInput.style.borderColor = "#FF0000";
  searchInput.onblur = () => searchInput.style.borderColor = "#3a3c42";
  searchInput.oninput = () => {
    emojiPickerState.page = 0;
    renderEmojiPickerGrid(searchInput.value.trim().toLowerCase());
  };

    const backBtn = document.createElement("button");
  backBtn.id = "emojiBackBtn";
  backBtn.innerHTML = "‹";
  backBtn.style.cssText = `
    background: none; border: none; color: #b9bbbe;
    font-size: 20px; cursor: pointer; padding: 0 4px;
    display: none; flex-shrink: 0; line-height: 1;
  `;
  backBtn.onclick = (e) => {
    e.stopPropagation();
    searchInput.value = "";
    showEmojiCategoriesView();
  };
  header.appendChild(backBtn);
  header.appendChild(searchInput);
  

  
const gridWrap = document.createElement("div");
  gridWrap.id = "emojiGridWrap";
  gridWrap.style.cssText = `flex: 1; overflow-y: auto; padding: 8px;`;

  const categoryGrid = document.createElement("div");
  categoryGrid.id = "emojiCategoryGrid";
  categoryGrid.style.cssText = `
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  `;

  const grid = document.createElement("div");
  grid.id = "emojiGrid";
  grid.style.cssText = `
    display: none;
    grid-template-columns: repeat(6, 1fr);
    gap: 4px;
  `;

  gridWrap.appendChild(categoryGrid);
  gridWrap.appendChild(grid);

  const footer = document.createElement("div");
  footer.id = "emojiFooter";
  footer.style.cssText = `
    display: flex; align-items: center; justify-content: space-between;
    padding: 6px 10px; flex-shrink: 0;
  `;

  const pageBtnStyle = `
    background: #1e1f22; border: 0px solid #3a3c42; color: #b9bbbe;
    font-size: 11px; padding: 4px 8px; border-radius: 6px;
    cursor: pointer; transition: background 0.15s, color 0.15s;
  `;

  const prevBtn = document.createElement("button");
  prevBtn.textContent = "‹ Prev";
  prevBtn.style.cssText = pageBtnStyle;
  prevBtn.onclick = () => {
    if (emojiPickerState.page > 0) {
      emojiPickerState.page--;
      renderEmojiPickerGrid(searchInput.value.trim().toLowerCase());
    }
  };

  const pageLabel = document.createElement("span");
  pageLabel.id = "emojiPageLabel";
  pageLabel.style.cssText = "color:#b9bbbe; font-size:11px;";

  const nextBtn = document.createElement("button");
  nextBtn.textContent = "Next ›";
  nextBtn.style.cssText = pageBtnStyle;
  nextBtn.onclick = () => {
    const totalPages = Math.ceil(emojiPickerState.filtered.length / EMOJIS_PER_PAGE);
    if (emojiPickerState.page < totalPages - 1) {
      emojiPickerState.page++;
      renderEmojiPickerGrid(searchInput.value.trim().toLowerCase());
    }
  };

  footer.appendChild(prevBtn);
  footer.appendChild(pageLabel);
  footer.appendChild(nextBtn);

  emojiPicker.appendChild(header);
  emojiPicker.appendChild(gridWrap);
  emojiPicker.appendChild(footer);
  document.body.appendChild(emojiPicker);

  renderEmojiPickerGrid("");

  const emojiBtn = document.getElementById("emojiBtn");
emojiBtn.addEventListener("click", async (e) => {
  e.stopPropagation();
  const willShow = !emojiPicker.classList.contains("show");
  closeAllPickers("emojiBtn");
  emojiPicker.classList.toggle("show", willShow);
  emojiPicker.style.display = willShow ? "flex" : "none";
  if (willShow) {
    await loadEmojiData();
    const rect = emojiBtn.getBoundingClientRect();
    emojiPicker.style.left = (rect.left - 230) + "px";
    emojiPicker.style.bottom = (window.innerHeight - rect.top + 8) + "px";
    searchInput.value = "";
    renderEmojiCategoryGrid();
    showEmojiCategoriesView();
    searchInput.focus();
  }
});

  document.addEventListener("click", (e) => {
    if (!emojiBtn.contains(e.target) && !emojiPicker.contains(e.target)) {
      emojiPicker.classList.remove("show");
      emojiPicker.style.display = "none";
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      emojiPicker.classList.remove("show");
      emojiPicker.style.display = "none";
    }
  });

  emojiPicker.style.display = "none";
}

function renderEmojiPickerGrid(query) {
  const grid = document.getElementById("emojiGrid");
  const pageLabel = document.getElementById("emojiPageLabel");
  const footer = document.getElementById("emojiFooter");
  if (!grid) return;

  let source = emojiList;
  if (emojiActiveCategory && !query) {
    source = emojiList.filter(e => e.group === emojiActiveCategory);
  }

  emojiPickerState.filtered = query
    ? emojiList.filter(e => e.name.toLowerCase().includes(query))
    : source;
  const totalPages = Math.max(1, Math.ceil(emojiPickerState.filtered.length / EMOJIS_PER_PAGE));
  if (emojiPickerState.page >= totalPages) emojiPickerState.page = totalPages - 1;
  if (emojiPickerState.page < 0) emojiPickerState.page = 0;

  const start = emojiPickerState.page * EMOJIS_PER_PAGE;
  const pageItems = emojiPickerState.filtered.slice(start, start + EMOJIS_PER_PAGE);

  grid.innerHTML = "";

  if (pageItems.length === 0) {
    grid.style.display = "block";
    grid.innerHTML = `<div style="color:#72767d; font-size:12px; text-align:center; padding:20px 0;">No emojis found</div>`;
  } else {
    grid.style.display = "grid";
    pageItems.forEach(({ emoji, name }) => {
      const item = document.createElement("div");
      item.style.cssText = `
        position: relative; aspect-ratio: 1; border-radius: 6px;
        background: #1e1f22; display: flex; align-items: center; justify-content: center;
        cursor: pointer; transition: background 0.15s, transform 0.1s; font-size: 20px;
      `;
      item.onmouseover = () => { item.style.background = "#2a2c31"; item.style.transform = "scale(1.1)"; };
      item.onmouseout = () => { item.style.background = "#1e1f22"; item.style.transform = "scale(1)"; };
      item.title = name;
      item.textContent = emoji;

item.onclick = () => {
        const now = Date.now();
        const isDoubleClick = lastEmojiClick.emoji === emoji && (now - lastEmojiClick.time) < 350;

        if (isDoubleClick) {
          const input = document.getElementById("input");
          const fullText = getInputText();
          if (fullText.endsWith(emoji)) {
            const newText = fullText.slice(0, fullText.length - emoji.length);
            input.textContent = newText;
            setCaretAtTextOffset(newText.length);
          } else if (fullText.endsWith(emoji + " ")) {
            const newText = fullText.slice(0, fullText.length - emoji.length - 1);
            input.textContent = newText;
            setCaretAtTextOffset(newText.length);
          }
          lastEmojiClick = { emoji: null, time: 0 };
          sendSingleEmoji(emoji);
          return;
        }

        restoreInputSelection();
        document.execCommand("insertText", false, emoji);
        saveInputSelection();
        lastEmojiClick = { emoji, time: now };

        item.style.background = "#FF0000";
        setTimeout(() => item.style.background = "#1e1f22", 150);
      };

      grid.appendChild(item);
    });
  }

  pageLabel.textContent = `${emojiPickerState.page + 1}/${totalPages} (${emojiPickerState.filtered.length})`;
  footer.style.display = emojiPickerState.filtered.length > EMOJIS_PER_PAGE ? "flex" : "none";
}

function renderEmojiCategoryGrid() {
  const categoryGrid = document.getElementById("emojiCategoryGrid");
  const groups = [...new Set(emojiList.map(e => e.group))];

  categoryGrid.innerHTML = "";
  groups.forEach(group => {
    const tile = document.createElement("div");
    tile.style.cssText = `
      display: flex; align-items: center; gap: 8px;
      height: 44px; padding: 0 10px; border-radius: 8px;
      background: #1e1f22; cursor: pointer; transition: background 0.12s;
    `;
    tile.onmouseover = () => tile.style.background = "#2a2c31";
    tile.onmouseout = () => tile.style.background = "#1e1f22";

    const icon = document.createElement("span");
    icon.textContent = EMOJI_CATEGORY_ICONS[group] || "🔹";
    icon.style.fontSize = "18px";

    const label = document.createElement("span");
    label.textContent = group;
    label.style.cssText = "color:#e6e6e7; font-size:11.5px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";

    tile.appendChild(icon);
    tile.appendChild(label);
    tile.onclick = (e) => {
      e.stopPropagation();
      selectEmojiCategory(group);
    };
    categoryGrid.appendChild(tile);
  });
}

function selectEmojiCategory(group) {
  emojiActiveCategory = group;
  showEmojiResultsView();
  document.getElementById("emojiBackBtn").style.display = "block";
  emojiPickerState.page = 0;
  renderEmojiPickerGrid("");
}

function showEmojiResultsView() {
  emojiViewMode = "results";
  document.getElementById("emojiCategoryGrid").style.display = "none";
  document.getElementById("emojiGrid").style.display = "grid";
}

function showEmojiCategoriesView() {
  emojiViewMode = "categories";
  emojiActiveCategory = null;
  document.getElementById("emojiBackBtn").style.display = "none";
  document.getElementById("emojiGrid").style.display = "none";
  document.getElementById("emojiCategoryGrid").style.display = "grid";
  document.getElementById("emojiFooter").style.display = "none";
}

function closeAllPickers(except) {
  const pickers = [
    { el: () => document.getElementById("pepePicker"), btn: "pepeBtn" },
    { el: () => document.getElementById("emojiPicker"), btn: "emojiBtn" },
    { el: () => gifModal, btn: "gifBtn" }
  ];

  pickers.forEach(p => {
    if (p.btn === except) return;
    const el = p.el();
    if (el) {
      el.classList.remove("show");
      el.style.display = "none";
    }
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
    background: #1e1f22; border-radius: 12px; overflow: hidden;
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
    flex:1; min-width:260px; max-width:340px; background:#111214;
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
    videoWrap.innerHTML = `<div style="color:#72767d; padding:20px; font-size:13px;">Checking stream…</div>`;

    const useIframeFallback = () => {
      videoWrap.innerHTML = "";
      const vIframe = document.createElement("iframe");
      vIframe.style.cssText = "width:100%; height:100%; border:none;";
      vIframe.allowFullscreen = true;
      vIframe.allow = "autoplay; fullscreen";
      vIframe.src = `https://player.kick.com/${encodeURIComponent(stream.name)}?muted=false&autoplay=true`;
      videoWrap.appendChild(vIframe);
    };

  
    fetch(`https://kick.com/api/v1/channels/${encodeURIComponent(stream.name)}`, {
      headers: { 'Accept': 'application/json' }
    })
      .then(r => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json();
      })
       .then(async data => {
        const playbackUrl = data?.playback_url;
        console.log('playbackUrl:', playbackUrl);
        if (!playbackUrl) throw new Error('no playback_url');

        videoWrap.innerHTML = "";
        const videoEl = document.createElement("video");
        videoEl.style.cssText = "width:100%; height:100%; border:none; background:#000;";
        videoEl.controls = true;
        videoEl.playsInline = true;
        videoEl.muted = true;
        videoWrap.appendChild(videoEl);

        const tryPlay = () => {
          videoEl.play().catch(err => console.warn(`Play failed for ${stream.name}:`, err.message));
        };

        if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
          videoEl.src = playbackUrl;
          videoEl.addEventListener('loadedmetadata', tryPlay, { once: true });
        } else {
          await loadHlsLib();
          await loadHlsLib();
  if (window.Hls && window.Hls.isSupported()) {
    console.log('creating hls.js instance');
  const hls = new Hls({
    enableWorker: false,
    capLevelToPlayerSize: false,
    startLevel: 0,
    maxBufferLength: 4,
    maxMaxBufferLength: 6,
    backBufferLength: 0,
    manifestLoadingMaxRetry: 4,
    manifestLoadingRetryDelay: 500,
    levelLoadingMaxRetry: 4,
    levelLoadingRetryDelay: 500,
    fragLoadingMaxRetry: 6,
    fragLoadingRetryDelay: 500,
  });
    hls.loadSource(playbackUrl);
    hls.attachMedia(videoEl);

  
  hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
    console.log('Available levels:', data.levels);
    const sorted = [...data.levels].sort((a, b) => a.height - b.height);
    const lowestIndex = data.levels.indexOf(sorted[0]);
    hls.autoLevelCapping = lowestIndex;
    hls.loadLevel = lowestIndex;
    tryPlay();
  });
  hls.on(Hls.Events.LEVEL_SWITCHED, () => {
    if (hls.autoLevelCapping === -1) hls.autoLevelCapping = 0;
  });

let hlsRetryCount = 0;
const MAX_HLS_RETRIES = 3;

hls.on(Hls.Events.ERROR, (event, data) => {
  console.log('HLS ERROR:', data.type, data.details, 'fatal:', data.fatal);

  if (!data.fatal) return; 

  switch (data.type) {
    case Hls.ErrorTypes.NETWORK_ERROR:
      if (hlsRetryCount < MAX_HLS_RETRIES) {
        hlsRetryCount++;
        console.warn(`⚠️ Network error for ${stream.name}, retrying (${hlsRetryCount}/${MAX_HLS_RETRIES})`);
        hls.startLoad();
      } else {
        console.warn(`⚠️ Network error retries exhausted for ${stream.name}, falling back to iframe`);
        hls.destroy();
        entry.hls = null;
        useIframeFallback();
      }
      break;

    case Hls.ErrorTypes.MEDIA_ERROR:
      console.warn(`⚠️ Media error for ${stream.name}, attempting recovery`);
      hls.recoverMediaError();
      break;

    default:
      console.warn(`⚠️ Unrecoverable HLS error for ${stream.name}, falling back to iframe`);
      hls.destroy();
      entry.hls = null;
      useIframeFallback();
      break;
  }
});
  entry.hls = hls;

          } else {
            throw new Error('hls.js unsupported');
          }
          
        }
        
      })
      .catch(err => {
        console.warn(`⚠️ Client-side Kick HLS fetch failed for ${stream.name}, falling back to iframe:`, err.message);
        useIframeFallback();
      });

  
    const list = document.createElement("div");
    list.style.cssText = "flex:1; overflow-y:auto; padding:8px; display:flex; flex-direction:column; gap:6px;";
    chatWrap.appendChild(list);

    fetch(`/api/kick-chatroom/${encodeURIComponent(stream.name)}`)
      .then(r => r.json())
      .then(async (data) => {
        if (!data.chatroomId) {
          chatWrap.innerHTML = `<div style="color:#72767d; padding:12px; font-size:12px;">Chat unavailable - no chatroomId configured.</div>`;
          return;
        }
       

        loadPusherLib().then(() => {
          const pusher = new Pusher(KICK_PUSHER_KEY, { cluster: KICK_PUSHER_CLUSTER, forceTLS: true });
          const channel = pusher.subscribe(`chatrooms.${data.chatroomId}.v2`);
          entry.pusher = pusher;
          entry.channel = channel;
          channel.bind('App\\Events\\ChatMessageEvent', (msg) => {
            const payload = typeof msg === 'string' ? JSON.parse(msg) : msg;
            appendKickChatMessage(list, payload, entry.subBadgeUrl);
            const uname = payload?.sender?.username;
            if (uname) {
              entry.uniqueChatters.add(uname.toLowerCase());
              entry.updateChattersBadge();
            }
          });
        }).catch(() => {
          chatWrap.innerHTML = `<div style="color:#72767d; padding:12px; font-size:12px;">Chat failed to load.</div>`;
        });
      })
      .catch(() => {
        chatWrap.innerHTML = `<div style="color:#72767d; padding:12px; font-size:12px;">Failed to load chatroom info.</div>`;
      });
  
  } else if (stream.platform === "youtube") {
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
  showChatFor(streamId);
}

function closeEmbedWindow(streamId) {
  const entry = openEmbedWindows.get(streamId);
  if (!entry) return;

  if (entry.channel) { try { entry.channel.unbind_all(); } catch (e) {} }
  if (entry.pusher) { try { entry.pusher.disconnect(); } catch (e) {} }
  if (entry.hls) { try { entry.hls.destroy(); } catch (e) {} }

  entry.tile?.remove();
  entry.chatWrap?.remove();
  openEmbedWindows.delete(streamId);

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


document.getElementById("bgUrlBtn").addEventListener("click", () => {
  const input = document.getElementById("bgUrlInput");
  const url = input.value.trim();
  if (!url) {
    showToast?.("❌ Please enter a URL");
    return;
  }
  if (!isSafeUrl(url)) {
    showToast?.("❌ Invalid or unsafe URL");
    return;
  }

  const testImg = new Image();
  testImg.onload = () => {
    setUserBackground(url);
    showToast?.("Background updated (only visible to you)");
    input.value = "";
  };
  testImg.onerror = () => {
    showToast?.("❌ Couldn't load image from that URL");
  };
  testImg.src = url;
});

document.getElementById("bgUrlInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    document.getElementById("bgUrlBtn").click();
  }
});

const BG_STORAGE_KEY = "customBackgroundUrl";

function getDefaultBackground() {
  return SERVER_CONFIG?.server?.backgroundImageUrl || null;
}

function applyBackground(url) {
  if (url) {
    document.body.style.backgroundImage = `url('${url}')`;
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundPosition = "center";
    document.body.style.backgroundAttachment = "fixed";
  } else {
    document.body.style.backgroundImage = "none";
  }
}

function loadUserBackground() {
  let saved = null;
  try { saved = localStorage.getItem(BG_STORAGE_KEY); } catch (e) {}
  applyBackground(saved || getDefaultBackground());
  updateBgPreview(saved || getDefaultBackground());
}

function updateBgPreview(url) {
  const preview = document.getElementById("bgPreview");
  if (!preview) return;
  preview.style.backgroundImage = url ? `url('${url}')` : "none";
  preview.style.backgroundColor = url ? "" : "#1e1f22";
}

function setUserBackground(url) {
  try { localStorage.setItem(BG_STORAGE_KEY, url); } catch (e) {}
  applyBackground(url);
  updateBgPreview(url);
}

function resetUserBackground() {
  try { localStorage.removeItem(BG_STORAGE_KEY); } catch (e) {}
  applyBackground(getDefaultBackground());
  updateBgPreview(getDefaultBackground());
  showToast?.("Background reset to default");
}

document.getElementById("bgUploadBtn").addEventListener("click", () => {
  document.getElementById("bgUploadInput").click();
});

document.getElementById("bgUploadInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast?.("❌ Please select an image file");
    return;
  }

  const formData = new FormData();
  formData.append("avatar", file, file.name); 

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/upload-avatar", true);
  xhr.setRequestHeader("Authorization", `Bearer ${localStorage.getItem("chatToken")}`);
  xhr.onload = () => {
    if (xhr.status === 200) {
      const data = JSON.parse(xhr.responseText);
      setUserBackground(data.url);
      showToast?.("Background updated (only visible to you)");
    } else {
      showToast?.("Upload failed: " + xhr.responseText);
    }
  };
  xhr.onerror = () => showToast?.("Upload error");
  xhr.send(formData);

  e.target.value = "";
});

document.getElementById("bgResetBtn").addEventListener("click", resetUserBackground);
loadUserBackground();




function isGifOrWebp(url) {
  return /\.(gif|webp)(\?.*)?$/i.test(url);
}

function captureFirstFrame(img) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width || 1;
    canvas.height = img.naturalHeight || img.height || 1;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch (e) {
    console.warn("Could not capture frame (likely CORS):", e);
    return null;
  }
}

function setupFreezeableMedia(img, url, orderKey, isEmote = false, skipFreeze = false, excludeFromAutoplay = false) {
  img.src = url;
  if (skipFreeze) return;
  if (!isGifOrWebp(url)) return;

  img.dataset.liveSrc = url;
  img.dataset.seq = String(orderKey);
  img.dataset.seqCounter = String(++freezeableMediaCounter);
  if (isEmote) img.dataset.isEmote = "1";
  if (excludeFromAutoplay) img.dataset.excludeAutoplay = "1";
  if (frameSnapshotCache.has(url)) {
    img.dataset.frozenFrame = frameSnapshotCache.get(url);
  }

img.addEventListener("load", function onFirstLoad() {
    if (!img.dataset.sizeLocked && !img.classList.contains('user-badge')) {
      const rect = img.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        img.style.width = rect.width + "px";
        img.style.height = rect.height + "px";
        img.dataset.sizeLocked = "1";
      }
    }

    if (img.dataset.frozenFrame) {
      if (excludeFromAutoplay && img.dataset.hovering !== "1") {
        img.src = img.dataset.frozenFrame;
      }
      registerFreezeableMedia(img);
      img.removeEventListener("load", onFirstLoad);
      return;
    }

    const probe = new Image();
    probe.crossOrigin = "anonymous";
    probe.onload = () => {
      const snapshot = captureFirstFrame(probe);
      if (snapshot) {
        img.dataset.frozenFrame = snapshot;
        frameSnapshotCache.set(url, snapshot);
        if (frameSnapshotCache.size > 300) {
          const firstKey = frameSnapshotCache.keys().next().value;
          frameSnapshotCache.delete(firstKey);
        }
        if (excludeFromAutoplay && img.dataset.hovering !== "1") {
          img.src = snapshot;
        }
      }
      registerFreezeableMedia(img);
    };
    probe.onerror = () => registerFreezeableMedia(img);
    probe.src = url;

    img.removeEventListener("load", onFirstLoad);
  });

  img.addEventListener("mouseenter", () => {
    img.dataset.hovering = "1";
    if (img.dataset.liveSrc && img.src !== img.dataset.liveSrc) {
      img.src = img.dataset.liveSrc;
    }
  });

  img.addEventListener("mouseleave", () => {
    img.dataset.hovering = "0";
    if ((excludeFromAutoplay || img.dataset.autoplay !== "1") && img.dataset.frozenFrame) {
      img.src = img.dataset.frozenFrame;
    }
  });
}

function pauseOffscreenMedia() {
  const rect = messagesDiv.getBoundingClientRect();
  messagesDiv.querySelectorAll('video').forEach(el => {
    const elRect = el.getBoundingClientRect();
    const isVisible = elRect.top < rect.bottom + 200 && elRect.bottom > rect.top - 200;
    if (!isVisible) el.pause();
  });


  freezeableMediaRegistry.forEach(img => {
    if (!img.isConnected || img.dataset.isEmote === "1") return;
  });
}


function buildEmbedElement(m) {
  const embedDiv = document.createElement("div");
  embedDiv.style.borderLeft = `4px solid ${m.embed.color || "#5865F2"}`;
  embedDiv.style.background = "rgba(0, 0, 0, 0.61)";
  embedDiv.style.padding = "12px 16px";
  embedDiv.style.borderRadius = "6px";
  embedDiv.style.maxWidth = "500px";
  embedDiv.style.display = "flex";
  embedDiv.style.flexDirection = "column";
  embedDiv.style.gap = "10px";
  const imageList = Array.isArray(m.embed.images) && m.embed.images.length > 0
    ? m.embed.images
    : (m.embed.image ? [m.embed.image] : []);

  if (imageList.length === 1) {
    const imgEl = document.createElement("img");
    imgEl.src = imageList[0];
    imgEl.loading = "lazy";
    imgEl.style.maxWidth = "100%";
    imgEl.style.borderRadius = "4px";
    imgEl.style.cursor = "zoom-in";
    imgEl.onclick = (e) => { e.stopPropagation(); openImageModal(imageList[0]); };
    embedDiv.appendChild(imgEl);
  } else if (imageList.length > 1) {
    const grid = document.createElement("div");
    const cols = imageList.length === 2 ? 2 : (imageList.length === 3 ? 3 : 2);
    grid.style.cssText = `
      display:grid; grid-template-columns:repeat(${cols}, 1fr); gap:4px;
      border-radius:6px; overflow:hidden;
    `;
    imageList.forEach(src => {
      const imgEl = document.createElement("img");
      imgEl.src = src;
      imgEl.loading = "lazy";
      imgEl.style.cssText = "width:100%; height:100%; max-height:220px; object-fit:cover; cursor:zoom-in; display:block;";
      imgEl.onclick = (e) => { e.stopPropagation(); openImageModal(src); };
      grid.appendChild(imgEl);
    });
    embedDiv.appendChild(grid);
  }

  if (m.embed.title) {
    const titleEl = document.createElement("div");
    titleEl.textContent = m.embed.title;
    titleEl.style.fontWeight = "600";
    titleEl.style.fontSize = "16px";
    titleEl.style.color = "#ffffff";
    embedDiv.appendChild(titleEl);
  }
  if (m.embed.description) {
    const descContainer = typeof m.embed.description === "string"
      ? parseContent(m.embed.description, m.time)
      : document.createTextNode(m.embed.description || '');
    descContainer.style && (descContainer.style.margin = "8px 0");
    embedDiv.appendChild(descContainer);
  }
  if (m.embed.fields && Array.isArray(m.embed.fields) && m.embed.fields.length > 0) {
    const fieldsContainer = document.createElement("div");
    fieldsContainer.style.display = "flex";
    fieldsContainer.style.flexWrap = "wrap";
    fieldsContainer.style.gap = "16px 30px";
    m.embed.fields.forEach(f => {
      if (!f || !f.name) return;
      const fieldDiv = document.createElement("div");
      fieldDiv.style.minWidth = "140px";
      const nameStrong = document.createElement("strong");
      nameStrong.style.color = "#fff";
      nameStrong.textContent = f.name;
      fieldDiv.appendChild(nameStrong);
      fieldDiv.appendChild(document.createElement("br"));
      const valueContainer = typeof f.value === "string" ? parseContent(f.value, m.time) : document.createTextNode(f.value || '');
      fieldDiv.appendChild(valueContainer);
      fieldsContainer.appendChild(fieldDiv);
    });
    embedDiv.appendChild(fieldsContainer);
  }


  if (m.embed.buttons && Array.isArray(m.embed.buttons) && m.embed.buttons.length > 0) {
    const buttonsRow = document.createElement("div");
    buttonsRow.style.cssText = "display:flex; flex-wrap:wrap; gap:8px; margin-top:4px;";

    const styleColors = {
      primary:   { bg: "#b758f2", hover: "#b758f2" },
      secondary: { bg: "#4f545c", hover: "#5d6269" },
      success:   { bg: "#23a559", hover: "#1e8e4c" },
      danger:    { bg: "#da373c", hover: "#c22e32" },
      link:      { bg: "#4f545c", hover: "#5d6269" }
    };

    m.embed.buttons.forEach(btn => {
      if (!btn || !btn.label) return;
      const isLink = btn.style === "link" && btn.url;
      const colors = styleColors[btn.style] || styleColors.secondary;

      const buttonEl = document.createElement(isLink ? "a" : "button");
      buttonEl.textContent = btn.emoji ? `${btn.emoji} ${btn.label}` : btn.label;
      buttonEl.style.cssText = `
        background:${colors.bg}; color:#fff; border:none; padding:8px 14px;
        border-radius:6px; font-size:13px; font-weight:600; cursor:pointer;
        transition:background 0.15s; text-decoration:none; display:inline-flex;
        align-items:center; gap:6px;
      `;
      buttonEl.onmouseover = () => buttonEl.style.background = colors.hover;
      buttonEl.onmouseout = () => buttonEl.style.background = colors.bg;

      if (isLink) {
        if (!isSafeUrl(btn.url)) return;
        buttonEl.href = btn.url;
        buttonEl.target = "_blank";
        buttonEl.rel = "noopener noreferrer";
      } else {
        buttonEl.onclick = () => {
          if (btn.oneTime) {
            buttonEl.disabled = true;
            buttonEl.style.opacity = "0.5";
            buttonEl.style.cursor = "not-allowed";
          }
          socket.emit("embedButtonClick", {
            messageId: m.id,
            buttonId: btn.id || btn.label,
            userId: user.id,
            username: user.username
          });
        };
      }

      buttonsRow.appendChild(buttonEl);
    });

    if (buttonsRow.children.length > 0) embedDiv.appendChild(buttonsRow);
  }

  if (m.embed.footer) {
    const footerDiv = document.createElement("div");
    footerDiv.style.marginTop = "auto";
    footerDiv.style.paddingTop = "8px";
    footerDiv.style.borderTop = "1px solid #40444b";
    footerDiv.style.fontSize = "12px";
    footerDiv.style.color = "#b9bbbe";
    footerDiv.textContent = m.embed.footer;
    embedDiv.appendChild(footerDiv);
  }

  return embedDiv;
}


function formatAudioTime(sec) {
  if (!isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function buildAudioPlayer(url, fileName) {
  const wrap = document.createElement("div");
  wrap.style.cssText = `
    display:flex; flex-direction:column; gap:8px;
    background:rgba(0, 0, 0, 0.9); border-radius:8px;
    padding:10px 12px; max-width:340px; box-sizing:border-box;
  `;

  const header = document.createElement("div");
  header.style.cssText = "display:flex; align-items:center; gap:8px;";

  const nameEl = document.createElement("span");
  nameEl.textContent = fileName || url.split('/').pop();
  nameEl.style.cssText = "color:#fff; font-size:13px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;";
  header.appendChild(nameEl);
 

  const controls = document.createElement("div");
  controls.style.cssText = "display:flex; align-items:center; gap:10px;";

  const playBtn = document.createElement("button");
  playBtn.style.cssText = `
    width:30px; height:30px; border-radius:50%; flex-shrink:0;
    background:#FF0000; border:none; cursor:pointer;
    display:flex; align-items:center; justify-content:center;
    transition: background 0.15s;
  `;
  playBtn.onmouseover = () => playBtn.style.background = "#cc0000";
  playBtn.onmouseout = () => playBtn.style.background = "#FF0000";

  const playIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>`;
  const pauseIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>`;
  playBtn.innerHTML = playIcon;

  const progressWrap = document.createElement("div");
  progressWrap.style.cssText = `
    flex:1; height:5px; background:#40444b; border-radius:3px;
    cursor:pointer; position:relative;
  `;

  const progressFill = document.createElement("div");
  progressFill.style.cssText = `
    height:100%; width:0%; background:#FF0000; border-radius:3px;
    pointer-events:none;
  `;
  progressWrap.appendChild(progressFill);

  const timeEl = document.createElement("span");
  timeEl.textContent = "0:00 / 0:00";
  timeEl.style.cssText = "color:#b9bbbe; font-size:11px; flex-shrink:0; min-width:72px; text-align:right;";

  controls.appendChild(playBtn);
  controls.appendChild(progressWrap);
  controls.appendChild(timeEl);
  const volumeRow = document.createElement("div");
  volumeRow.style.cssText = "display:flex; align-items:center; gap:8px;";

  const volBtn = document.createElement("button");
  volBtn.style.cssText = `
    background:none; border:none; color:#b9bbbe; cursor:pointer;
    padding:2px; flex-shrink:0; display:flex; align-items:center;
    transition: color 0.15s;
  `;
  volBtn.onmouseover = () => volBtn.style.color = "#fff";
  volBtn.onmouseout  = () => volBtn.style.color = "#b9bbbe";

  const volIconLoud = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 10v4h4l5 5V5L7 10H3z"/><path d="M16.5 12c0-1.77-.77-3.29-2-4.3v8.6c1.23-1.01 2-2.53 2-4.3z"/><path d="M14.5 3.23v2.06c2.89 1.2 4.5 4.14 4.5 6.71 0 2.57-1.61 5.51-4.5 6.71v2.06c4.01-1.24 6.5-4.9 6.5-8.77s-2.49-7.53-6.5-8.77z"/></svg>`;
  const volIconMuted = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 10v4h4l5 5V5L7 10H3z"/><path d="M19 12l2.5-2.5-1.4-1.4L17.6 10.6 15.1 8.1l-1.4 1.4L16.2 12l-2.5 2.5 1.4 1.4 2.5-2.5 2.5 2.5 1.4-1.4L19 12z"/></svg>`;
  volBtn.innerHTML = volIconLoud;

  const volSlider = document.createElement("input");
  volSlider.type = "range";
  volSlider.min = "0";
  volSlider.max = "100";
  volSlider.value = "100";
  volSlider.style.cssText = `
    width:70px; height:4px; accent-color:#FF0000; cursor:pointer;
  `;

  volumeRow.appendChild(volBtn);
  volumeRow.appendChild(volSlider);

  controls.appendChild(volumeRow);

  wrap.appendChild(header);
  wrap.appendChild(controls);

  const audioEl = document.createElement("audio");
  audioEl.src = url;
  audioEl.preload = "metadata";
  audioEl.style.display = "none";
  audioEl.dataset.chatMusicPlayer = "1";  
  wrap.appendChild(audioEl);

  playBtn.onclick = () => {
    if (audioEl.paused) {
      document.querySelectorAll('audio[data-chat-music-player="1"]').forEach(a => {
        if (a !== audioEl) a.pause();
      });
      audioEl.play();
    } else {
      audioEl.pause();
    }
  };

  audioEl.addEventListener("play", () => { playBtn.innerHTML = pauseIcon; });
  audioEl.addEventListener("pause", () => { playBtn.innerHTML = playIcon; });
  audioEl.addEventListener("ended", () => { playBtn.innerHTML = playIcon; progressFill.style.width = "0%"; });

  audioEl.addEventListener("loadedmetadata", () => {
    timeEl.textContent = `0:00 / ${formatAudioTime(audioEl.duration)}`;
  });

  audioEl.addEventListener("timeupdate", () => {
    if (!audioEl.duration) return;
    const pct = (audioEl.currentTime / audioEl.duration) * 100;
    progressFill.style.width = pct + "%";
    timeEl.textContent = `${formatAudioTime(audioEl.currentTime)} / ${formatAudioTime(audioEl.duration)}`;
  });

  progressWrap.addEventListener("click", (e) => {
    if (!audioEl.duration) return;
    const rect = progressWrap.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audioEl.currentTime = pct * audioEl.duration;
  });

  
  let lastVolume = 1;

  volSlider.addEventListener("input", () => {
    const v = parseInt(volSlider.value, 10) / 100;
    audioEl.volume = v;
    audioEl.muted = v === 0;
    volBtn.innerHTML = v === 0 ? volIconMuted : volIconLoud;
    if (v > 0) lastVolume = v;
  });

  volBtn.onclick = () => {
    if (audioEl.muted || audioEl.volume === 0) {
      audioEl.muted = false;
      audioEl.volume = lastVolume || 1;
      volSlider.value = String(Math.round((lastVolume || 1) * 100));
      volBtn.innerHTML = volIconLoud;
    } else {
      lastVolume = audioEl.volume;
      audioEl.muted = true;
      volSlider.value = "0";
      volBtn.innerHTML = volIconMuted;
    }
  };

  return wrap;
}