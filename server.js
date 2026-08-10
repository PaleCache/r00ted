var debugmode = false;
const express = require("express");
const http = require("http");
const socketIO = require("socket.io");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const sharp = require("sharp");
const ipConnectionCount = new Map();
const IP_LIMIT = 2;
const CHECK_INTERVAL = 5000;
const app = express();
const server = http.createServer(app);
let messages = [];
let messagesByChannel = new Map();
let onlineUsers = new Map();
let mutedUsers = new Set();
const userRateLimit = new Map();
const DISCONNECT_GRACE_PERIOD = 8000;
const disconnectTimeouts = new Map();
let allUsers = new Map();
const USERS_FILE = "./data/users.json";
const voiceUserStates = new Map();
const userSockets = new Map();
const embedButtonRateLimit = new Map();

const ALLOWED_UPLOAD_EXT = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/ogg": ".ogv",
  "video/quicktime": ".mov",
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",     
  "audio/wav": ".wav",
  "audio/ogg": ".oga",
  "audio/webm": ".weba",
  "text/plain": ".txt",
  "text/markdown": ".md",
  "text/csv": ".csv",
  "application/json": ".json"
};



const SESSION_SECRET_FILE = path.join(__dirname, "./data/session-secret.txt");
let SESSION_SECRET;
try {
  if (fs.existsSync(SESSION_SECRET_FILE)) {
    SESSION_SECRET = fs.readFileSync(SESSION_SECRET_FILE, "utf8").trim();
  }
  if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
    SESSION_SECRET = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(SESSION_SECRET_FILE, SESSION_SECRET);
    console.log("🔑 Generated new session secret");
  }
} catch (e) {
  console.error("❌ FATAL: could not init session secret", e);
  process.exit(1);
}

function signSession(userId) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(userId).digest("hex");
}

function verifySession(userId, sessionToken) {
  if (!userId || !sessionToken) return false;
  try {
    const expected = signSession(userId);
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(String(sessionToken), "hex");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

let CHANNELS = [];
const CHANNELS_FILE = path.join(__dirname, "./data/channels.json");
const DEFAULT_CHANNELS = [
  { id: "general", name: "general", type: "text", createdAt: Date.now(), createdBy: "system" },
  { id: "bot",     name: "bot",     type: "text", createdAt: Date.now(), createdBy: "system" },
  { id: "vc-embed",   name: "Embed",   type: "voice", createdAt: Date.now(), createdBy: "system" },
  { id: "vc-general", name: "General", type: "voice", createdAt: Date.now(), createdBy: "system" }
];

const io = socketIO(server, {
  cors: { origin: "*" },
  transports: ["websocket", "polling"],
  pingInterval: 10000,   
  pingTimeout: 15000, 
  maxHttpBufferSize: 50e6,
  connectTimeout: 45000
});

const XP_PER_LEVEL = 100;
function calculateLevel(xp) {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}



const gifCache = new Map()
const GIF_SEARCH_TTL = 24 * 60 * 60 * 1000; 
const GIF_TRENDING_TTL = 24 * 60 * 60 * 1000;

function getCached(key) {
  const entry = gifCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    gifCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key, data, ttl) {
  gifCache.set(key, { data, expiresAt: Date.now() + ttl });
}


setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  gifCache.forEach((entry, key) => {
    if (now > entry.expiresAt) {
      gifCache.delete(key);
      cleaned++;
    }
  });
  if (cleaned > 0) console.log(`🧹 Cleaned ${cleaned} expired GIF cache entries`);
}, 10 * 60 * 1000);


const loginAttempts = new Map();

function checkLoginAttempts(ip) {
  const now = Date.now();
  const attempts = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  
  if (attempts.lockedUntil > now) {
    const minutesLeft = Math.ceil((attempts.lockedUntil - now) / 60000);
    return { allowed: false, minutesLeft };
  }
  
  if (now > attempts.lockedUntil && attempts.lockedUntil !== 0) {
    loginAttempts.delete(ip);
    return { allowed: true };
  }
  
  return { allowed: true };
}
function addServerXP(userId, amount) {
  if (!userId) return null;
  
  let user = allUsers.get(userId);
  if (!user) {
    user = { id: userId, xp: 0, level: 1, lastActive: Date.now() };
    allUsers.set(userId, user);
  }

  const oldLevel = user.level || 1;
  user.xp = (user.xp || 0) + amount;

  let level = 1;
  let xpRequired = 0;
  while (user.xp >= xpRequired + getXpForLevel(level)) {
    xpRequired += getXpForLevel(level);
    level++;
  }
  user.level = level;
  const prestigeBadges = emoteConfig.prestigeBadges || [];
  const newlyUnlocked = prestigeBadges.filter(p => p.level > oldLevel && p.level <= user.level);
  if (newlyUnlocked.length > 0) {
    if (!user.unlockedPrestigeBadges) user.unlockedPrestigeBadges = [];
    newlyUnlocked.forEach(p => {
      if (!user.unlockedPrestigeBadges.includes(p.badge)) {
        user.unlockedPrestigeBadges.push(p.badge);
        console.log(`🏆 ${user.username} unlocked prestige badge: ${p.label}`);
      }
    });
  }

  saveUsers();

  io.emit("userData", { 
    id: userId, 
    xp: user.xp, 
    level: user.level,
    unlockedPrestigeBadges: user.unlockedPrestigeBadges || []
  });

  if (newlyUnlocked.length > 0) {
    io.sockets.sockets.forEach(sock => {
      if (sock.userId === userId) {
        sock.emit("prestigeUnlocked", { badges: newlyUnlocked });
      }
    });
  }

  return { xp: user.xp, level: user.level };
}



function sanitizeString(str, maxLength = 100) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .slice(0, maxLength);
}


function syncChannelsArray() {
  CHANNELS.length = 0;
  dynamicChannels.filter(c => c.type !== "voice").forEach(c => CHANNELS.push(c.id));
}
function getXpForLevel(level) {
  if (level < 10) {
    return 100;
  }
  return Math.floor(100 * Math.pow(1.05, level - 10));
}

function loadChannels() {
  if (fs.existsSync(CHANNELS_FILE)) {
    try { return JSON.parse(fs.readFileSync(CHANNELS_FILE, "utf8")); }
    catch (e) { console.error("❌ channels.json load failed", e); }
  }
  fs.writeFileSync(CHANNELS_FILE, JSON.stringify(DEFAULT_CHANNELS, null, 2));
  return DEFAULT_CHANNELS;
}

function saveChannels(channels) {
  fs.writeFileSync(CHANNELS_FILE, JSON.stringify(channels, null, 2));
}

function syncChannelsArray() {
  CHANNELS.length = 0;
  dynamicChannels.forEach(c => CHANNELS.push(c.id));
}

let dynamicChannels = loadChannels();
syncChannelsArray();

const SERVER_CONFIG_PATH = path.join(__dirname, './config/server-config.json');
let serverConfig;

const EMOTE_CONFIG_PATH = path.join(__dirname, './config/emote-config.json');
let emoteConfig;

try {
  if (!fs.existsSync(EMOTE_CONFIG_PATH)) {
    throw new Error(`${EMOTE_CONFIG_PATH} is missing.`);
  }
  const data = fs.readFileSync(EMOTE_CONFIG_PATH, 'utf8');
  emoteConfig = JSON.parse(data);
  console.log(`✅ Loaded emote configuration from ${EMOTE_CONFIG_PATH}`);
} catch (err) {
  console.error(`❌ FATAL ERROR: Cannot load emote-config.json.`);
  console.error(`   Reason: ${err.message}`);
  process.exit(1);
}

try {
  if (!fs.existsSync(SERVER_CONFIG_PATH)) {
    throw new Error(`CRITICAL: ${SERVER_CONFIG_PATH} is missing.`);
  }
  const data = fs.readFileSync(SERVER_CONFIG_PATH, 'utf8');
  serverConfig = JSON.parse(data);
  console.log(`✅ Loaded server configuration from ${SERVER_CONFIG_PATH}`);
} catch (err) {
  console.error(`❌ FATAL ERROR: Cannot load server-config.json.`);
  console.error(`   Reason: ${err.message}`);
  process.exit(1);
}
if (!serverConfig.jitsi || !serverConfig.jitsi.domain || !serverConfig.jitsi.roomName) {
  console.error('❌ Missing required Jitsi config in server-config.json');
  process.exit(1);
}
let currentServerBanner = serverConfig.serverBanner || null;
const STREAMERS_CONFIG_PATH = path.join(__dirname, serverConfig.streamerConfigPath || './config/streamers-config.json');
let streamersConfig;

try {
  if (!fs.existsSync(STREAMERS_CONFIG_PATH)) {
    throw new Error(`CRITICAL: ${STREAMERS_CONFIG_PATH} is missing.`);
  }
  const data = fs.readFileSync(STREAMERS_CONFIG_PATH, 'utf8');
  streamersConfig = JSON.parse(data);
  console.log(`✅ Loaded streamers configuration from ${STREAMERS_CONFIG_PATH}`);
  console.log(`   Found ${streamersConfig.kick ? streamersConfig.kick.length : 0} Kick channels.`);
  console.log(`   Found ${streamersConfig.youtube ? streamersConfig.youtube.length : 0} YouTube channels.`);
} catch (err) {
  console.error(`❌ FATAL ERROR: Cannot load streamers-config.json.`);
  console.error(`   Reason: ${err.message}`);
  process.exit(1);
}

const KLIPY_API_KEY = serverConfig.klipyApiKey;
const CHAT_PASSWORD = serverConfig.chatPassword;
const tokenPath = serverConfig.kickTokenPath;

if (!KLIPY_API_KEY) {
  console.error("❌ FATAL: 'klipyApiKey' is missing in server-config.json.");
  process.exit(1);
}
if (!CHAT_PASSWORD) {
  console.error("❌ FATAL: 'chatPassword' is missing in server-config.json.");
  process.exit(1);
}
if (!tokenPath) {
  console.error("❌ FATAL: 'kickTokenPath' is missing in server-config.json.");
  process.exit(1);
}

console.log("✅ Configuration loaded successfully. Starting server...");


function stripAtPrefix(str) {
  if (typeof str !== "string") return "";
  let s = str.trim();
  const bracketMatch = s.match(/^@?\[([^\]]+)\]$/);
  if (bracketMatch) return bracketMatch[1];
  return s.replace(/^@+/, "");
}

function loadUsers() {
  if (fs.existsSync(USERS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
      allUsers = new Map(data.map(u => [u.id, u]));
      console.log(`✅ Loaded ${allUsers.size} users with XP`);
    } catch (e) { console.error("❌ users.json load failed", e); }
  }
}

function saveUsers() {
  const arr = Array.from(allUsers.values());
  fs.writeFileSync(USERS_FILE, JSON.stringify(arr, null, 2));
}

loadUsers();
migratePrestigeBadges();


function updatePersistentUser(userData) {
  if (!userData?.id) return;

  const existing = allUsers.get(userData.id) || {};
  const updated = { ...existing };

  const ALLOWED_FIELDS = [
    'username', 'avatar', 'banner', 'customStatus',
    'usernameColor', 'badge', 'profileHeader', 'status'
  ];

  ALLOWED_FIELDS.forEach(field => {
    if (userData[field] !== undefined) updated[field] = userData[field];
  });

  updated.xp        = existing.xp      ?? 0;
  updated.level     = existing.level   ?? 1;
  updated.isAdmin   = existing.isAdmin  ?? false;
  updated.lastActive = Date.now();

  allUsers.set(userData.id, updated);
  saveUsers();
}

const saveMessages = () => {
  persistAllMessages();
};


app.get('/ping', (req, res) => {
  res.status(200).send('OK');
});

app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
  setHeaders: (res, filePath) => {
    res.setHeader("Content-Disposition", "attachment");
    res.setHeader("X-Content-Type-Options", "nosniff");
  }
}));
app.use("/avatars", express.static(path.join(__dirname, "public/avatars")));
app.use(express.static("public"));


function sanitizeAvatar(src) {
  if (typeof src !== "string") return "/avatars/default1.png";
  if (src.startsWith("data:image/")) return src;
  try {
    const u = new URL(src, "http://example.com");
    if (u.protocol === "http:" || u.protocol === "https:") return src;
  } catch {}
 return "/avatars/default1.png";
}

function formatLastSeen(timestamp) {
  if (!timestamp) return "Never";
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / 1440)}d ago`;
}



function broadcastOnlineUsers() {
  const now = Date.now();
  const usersToSend = [];


  
  onlineUsers.forEach(user => {
   const hasGame = !!user.gameStatus;
  usersToSend.push({
    ...user,
    status: user.status || 'online',
    customStatus: user.gameStatus || user.customStatus || '',
    musicStatus: hasGame ? null : (user.musicStatus || null),
    musicArtUrl: hasGame ? null : (user.musicArtUrl || null)
    });
  });


  allUsers.forEach((user, id) => {
    if (onlineUsers.has(id)) return;

    const lastActive = user.lastActive || 0;
    let status = "offline";
    let displayText;
    const minutesAgo = Math.floor((now - lastActive) / 60000);

    if (minutesAgo < 1440) {
      displayText = `Last seen ${formatLastSeen(lastActive)}`;
    } else if (minutesAgo < 10080) {
      const daysAgo = Math.floor(minutesAgo / 1440);
      displayText = `Last seen ${daysAgo}d ago`;
    } else if (minutesAgo < 43200) {
      const weeksAgo = Math.floor(minutesAgo / 10080);
      displayText = `Last seen ${weeksAgo}w ago`;
    } else if (minutesAgo < 129600) {
      const monthsAgo = Math.floor(minutesAgo / 43200);
      displayText = `Last seen ${monthsAgo}mo ago`;
    } else {
      const date = new Date(lastActive);
      displayText = `Last seen ${date.toLocaleDateString()}`;
    }

    usersToSend.push({
      ...user,
      status: status,
      customStatus: displayText
    });
  });

  io.emit("onlineUsers", usersToSend);
}


let trackedStreams = new Map();
const axios = require("axios");
function loadTokenFromFile() {
  if (fs.existsSync(tokenPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      return data.token;
    } catch (e) {
      console.error("❌ Failed to parse Kick token:", e);
      return null;
    }
  }
  return null;
}





async function getYouTubeLiveV2(channels) {
  const liveStreams = [];

  for (const channel of channels) {
    try {
      const url = `https://www.youtube.com/@${channel}/live`;

      const resp = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        },
        maxRedirects: 5,
        validateStatus: status => status < 500,
      });

      const finalUrl = resp.request?.res?.responseUrl || resp.config.url;
      const html = resp.data;
      const lowerHtml = html.toLowerCase();
      if (resp.status >= 300 && resp.status < 400 && resp.headers.location?.includes('/watch?v=')) {
        const videoId = resp.headers.location.split('v=')[1]?.split('&')[0] || '';
        const avatar = await getYouTubeChannelAvatar(channel, html);
        liveStreams.push({
          name: channel,
          live: true,
          url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : url,
          title: title,
          viewerCount: viewerCount,
          thumbnail: videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '',
          logo: avatar || 'fallback_youtube_logo_url'
        });
        continue;
      }

      
      const isCaptcha = lowerHtml.includes("sign in to confirm you're not a bot")
        && lowerHtml.includes('this helps protect our community')
        && lowerHtml.includes('learn more');

      if (isCaptcha) {
        const videoIdMatch = html.match(/"video-id=":"([a-zA-Z0-9_-]{11})"/);
        const videoId = videoIdMatch ? videoIdMatch[1] : null; 

        let title = 'Live Stream';
        const titleMatch = html.match(/<yt-formatted-string[^>]*title="([^"]+)"[^>]*class="style-scope ytd-watch-metadata"/);
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1].trim(); 
        } else {
          const fallbackTitle = html.match(/<title>(.*?) - YouTube<\/title>/);
          if (fallbackTitle && fallbackTitle[1]) {
            title = fallbackTitle[1].replace(/ - YouTube$/, '').trim(); 
          }
        }

        let viewerCount = 'Unknown';
        const viewerAriaMatch = html.match(/aria-label="(\d+(?:,\d+)*) watching now"/);
        if (viewerAriaMatch && viewerAriaMatch[1]) {
          viewerCount = viewerAriaMatch[1] + ' watching now'; 
        } else {
          const viewerTextMatch = html.match(/(\d+(?:,\d+)*)\s*watching now/i);
          if (viewerTextMatch && viewerTextMatch[1]) {
            viewerCount = viewerTextMatch[1] + ' watching now'; 
          }
        }
        const avatar = await getYouTubeChannelAvatar(channel, html);
        liveStreams.push({
          name: channel,
          live: true,
          url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : url,
          title: title,
          viewerCount: viewerCount,
          logo: avatar || 'fallback_youtube_logo_url'
        });
        continue;
      }

     
      if (/islivenow":true/i.test(html) || /"videotype":"live"/i.test(html) || /playbackstartseconds/i.test(html)) {
        const canonicalMatch = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([^"]+)"/);
        const videoId = canonicalMatch ? canonicalMatch[1] : null;

        let title = 'Untitled Stream';
        const titleMatch = html.match(/<yt-formatted-string[^>]*title="([^"]+)"[^>]*class="style-scope ytd-watch-metadata"/);
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1].trim();
        } else {
          const fallbackTitle = html.match(/<title>(.*?) - YouTube<\/title>/);
          if (fallbackTitle && fallbackTitle[1]) {
            title = fallbackTitle[1].replace(/ - YouTube$/, '').trim();
          }
        }
         const avatar = await getYouTubeChannelAvatar(channel, html);
        liveStreams.push({
          name: channel,
          live: true,
          url: videoId ? `https://www.youtube.com/watch?v=${videoId}` : url,
          title: title,
          viewerCount: 'Unknown',
          logo: avatar || 'fallback_youtube_logo_url'
        });
      } else {
      }

    } catch (err) {
      console.error(`Error for ${channel}:`, err.message);
      continue;
    }
  }

  return liveStreams;
}


const DICE_MAX_BET_CHIPS = 20000;
const DICE_HOUSE_EDGE = 0.01;     
const DICE_MIN_TARGET = 2;        
const DICE_MAX_TARGET = 98;
const DICE_ANIMATION_MS = 1800; 
 
function diceRoll() {
  const hundredths = crypto.randomInt(0, 10000);
  return hundredths / 100;                       
}
 
function diceWinChance(target, mode) {
  return mode === "under" ? target : (100 - target);
}
 
function diceMultiplier(winChance) {
  if (winChance <= 0) return 0;
  return (100 / winChance) * (1 - DICE_HOUSE_EDGE);
}


const WHEEL_SPINS_PER_DAY = 3;
const WHEEL_ANIMATION_MS = 4700;
const WHEEL_SEGMENTS = [
  { label: "10 XP",   xp: 10,   weight: 30 },
  { label: "25 XP",   xp: 25,   weight: 25 },
  { label: "50 XP",   xp: 50,   weight: 18 },
  { label: "0 XP",    xp: 0,    weight: 15 },
  { label: "100 XP",  xp: 100,  weight: 8  },
  { label: "250 XP",  xp: 250,  weight: 3  },
  { label: "500 XP",  xp: 500,  weight: 0.8 },
  { label: "JACKPOT", xp: 1000, weight: 0.2 }
];
 
function getUtcDateString(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10); 
}
 

function pickWheelSegment() {
  const totalWeight = WHEEL_SEGMENTS.reduce((s, seg) => s + seg.weight, 0);
  const SCALE = 1000;
  const roll = crypto.randomInt(Math.round(totalWeight * SCALE)) / SCALE;
  let acc = 0;
  for (let i = 0; i < WHEEL_SEGMENTS.length; i++) {
    acc += WHEEL_SEGMENTS[i].weight;
    if (roll < acc) return i;
  }
  return WHEEL_SEGMENTS.length - 1;
}
 
function getWheelSpinsLeft(userId) {
  const user = allUsers.get(userId);
  if (!user) return WHEEL_SPINS_PER_DAY;
 
  const today = getUtcDateString();
  if (user.wheelDate !== today) {
    return WHEEL_SPINS_PER_DAY;
  }
  return Math.max(0, WHEEL_SPINS_PER_DAY - (user.wheelSpinsUsed || 0));
}


const POKER_SEATS = 6;
const POKER_SMALL_BLIND = 1;
const POKER_BIG_BLIND = 2;
const POKER_MIN_BUYIN = 1;
const POKER_MAX_BUYIN = 500;
const POKER_RANK_NAMES = { 11: "J", 12: "Q", 13: "K", 14: "A" };
 
function pokerCardLabel(card) {
  const r = POKER_RANK_NAMES[card.rank] || String(card.rank);
  return `${r}${card.suit}`;
}
 
function pokerFreshDeck() {
  const suits = ["♠", "♥", "♦", "♣"];
  const deck = [];
  for (const s of suits) for (let r = 2; r <= 14; r++) deck.push({ rank: r, suit: s });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
 

function pokerCombinations(arr, k) {
  const results = [];
  const combo = [];
  function go(start) {
    if (combo.length === k) { results.push(combo.slice()); return; }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      go(i + 1);
      combo.pop();
    }
  }
  go(0);
  return results;
}
 
function pokerEval5(cards) {
  const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);
 
  const countMap = {};
  ranks.forEach(r => { countMap[r] = (countMap[r] || 0) + 1; });
  const grouped = Object.entries(countMap)
    .map(([r, c]) => ({ rank: Number(r), count: c }))
    .sort((a, b) => (b.count - a.count) || (b.rank - a.rank));
 
  let uniqueRanksDesc = [...new Set(ranks)];
  let straightHigh = null;

  if (uniqueRanksDesc.includes(14)) uniqueRanksDesc = [...uniqueRanksDesc, 1];
  for (let i = 0; i <= uniqueRanksDesc.length - 5; i++) {
    if (uniqueRanksDesc[i] - uniqueRanksDesc[i + 4] === 4) {
      straightHigh = uniqueRanksDesc[i];
      break;
    }
  }
  const isStraight = straightHigh !== null;
 
  if (isStraight && isFlush) return [8, straightHigh];
  if (grouped[0].count === 4) {
    const kicker = grouped.find(g => g.count === 1)?.rank || 0;
    return [7, grouped[0].rank, kicker];
  }
  if (grouped[0].count === 3 && grouped[1]?.count >= 2) {
    return [6, grouped[0].rank, grouped[1].rank];
  }
  if (isFlush) return [5, ...ranks];
  if (isStraight) return [4, straightHigh];
  if (grouped[0].count === 3) {
    const kickers = grouped.filter(g => g.count === 1).map(g => g.rank).sort((a, b) => b - a);
    return [3, grouped[0].rank, ...kickers];
  }
  if (grouped[0].count === 2 && grouped[1]?.count === 2) {
    const pairs = grouped.filter(g => g.count === 2).map(g => g.rank).sort((a, b) => b - a);
    const kicker = grouped.find(g => g.count === 1)?.rank || 0;
    return [2, pairs[0], pairs[1], kicker];
  }
  if (grouped[0].count === 2) {
    const kickers = grouped.filter(g => g.count === 1).map(g => g.rank).sort((a, b) => b - a);
    return [1, grouped[0].rank, ...kickers];
  }
  return [0, ...ranks];
}
 
function pokerCompareScores(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] || 0, bv = b[i] || 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}
 
function pokerBestScore(sevenCards) {
  const combos = pokerCombinations(sevenCards, 5);
  let best = null;
  for (const combo of combos) {
    const score = pokerEval5(combo);
    if (!best || pokerCompareScores(score, best) > 0) best = score;
  }
  return best;
}
 
const HAND_NAMES = ["High Card", "Pair", "Two Pair", "Three of a Kind", "Straight", "Flush", "Full House", "Four of a Kind", "Straight Flush"];
 

const pokerTable = {
  seats: Array.from({ length: POKER_SEATS }, () => null), 
  deck: [],
  community: [],
  stage: "waiting", 
  dealerIndex: -1,
  currentTurnIndex: -1,
  currentBet: 0,
  minRaise: POKER_BIG_BLIND,
  lastAggressorIndex: -1,
  pots: [], 
  handNumber: 0
};
 
function pokerOccupiedSeats() {
  return pokerTable.seats
    .map((s, i) => ({ s, i }))
    .filter(x => x.s && !x.s.sittingOut);
}
 
function pokerActiveHandSeats() {
  return pokerTable.seats
    .map((s, i) => ({ s, i }))
    .filter(x => x.s && x.s.inHand);
}
 
function pokerFindUserSeatIndex(userId) {
  return pokerTable.seats.findIndex(s => s && s.userId === userId);
}
 
function pokerNextOccupiedIndex(fromIndex) {
  const occ = pokerOccupiedSeats().map(x => x.i);
  if (occ.length === 0) return -1;
  let idx = fromIndex;
  for (let n = 0; n < POKER_SEATS; n++) {
    idx = (idx + 1) % POKER_SEATS;
    if (occ.includes(idx)) return idx;
  }
  return -1;
}
 
function pokerNextToActIndex(fromIndex) {
  let idx = fromIndex;
  for (let n = 0; n < POKER_SEATS; n++) {
    idx = (idx + 1) % POKER_SEATS;
    const seat = pokerTable.seats[idx];
    if (seat && seat.inHand && !seat.folded && !seat.allIn) return idx;
  }
  return -1;
}
 
function pokerBroadcastState() {
  pokerOccupiedSeats().forEach(({ s }) => {
    const sockets = userSockets.get(s.userId);
    if (!sockets) return;
    sockets.forEach(sockId => {
      io.to(sockId).emit("pokerState", pokerBuildStateFor(s.userId));
    });
  });


  const seatedIds = new Set(pokerOccupiedSeats().map(({ s }) => s.userId));
  userSockets.forEach((sockets, userId) => {
    if (seatedIds.has(userId)) return;
    sockets.forEach(sockId => {
      io.to(sockId).emit("pokerSpectatorState", pokerBuildStateFor(userId));
    });
  });
}
function pokerBuildStateFor(viewerUserId) {
  return {
    stage: pokerTable.stage,
    community: pokerTable.community,
    currentBet: pokerTable.currentBet,
    minRaise: pokerTable.minRaise,
    currentTurnIndex: pokerTable.currentTurnIndex,
    dealerIndex: pokerTable.dealerIndex,
    pots: pokerTable.pots,
    handNumber: pokerTable.handNumber,
    yourBalance: viewerUserId ? getChipBalance(viewerUserId) : null,
    seats: pokerTable.seats.map((s, i) => {
      if (!s) return null;
      const isMe = s.userId === viewerUserId;
      const showCards = isMe || pokerTable.stage === "showdown";
      return {
        userId: s.userId,
        username: s.username,
        avatar: s.avatar,
        chips: s.chips,
        betThisRound: s.betThisRound,
        totalBet: s.totalBet,
        folded: s.folded,
        allIn: s.allIn,
        inHand: s.inHand,
        sittingOut: s.sittingOut,
        cards: showCards ? s.cards : (s.cards && s.cards.length ? [null, null] : []),
        isTurn: i === pokerTable.currentTurnIndex,
        seatIndex: i
      };
    }),
    yourSeatIndex: viewerUserId ? pokerFindUserSeatIndex(viewerUserId) : -1
  };
}
 
function pokerResetSeatForHand(seat) {
  seat.cards = [];
  seat.folded = false;
  seat.allIn = false;
  seat.betThisRound = 0;
  seat.totalBet = 0;
  seat.actedThisRound = false;
  seat.inHand = !seat.sittingOut && seat.chips > 0;
}
 
function pokerStartHand() {
  const occ = pokerOccupiedSeats();
  if (occ.length < 2) {
    pokerTable.stage = "waiting";
    pokerBroadcastState();
    return;
  }
 
  pokerTable.handNumber++;
  pokerTable.deck = pokerFreshDeck();
  pokerTable.community = [];
  pokerTable.pots = [];
  pokerTable.currentBet = 0;
  pokerTable.minRaise = POKER_BIG_BLIND;
 
  pokerTable.seats.forEach(s => { if (s) pokerResetSeatForHand(s); });
 
  pokerTable.dealerIndex = pokerNextOccupiedIndex(pokerTable.dealerIndex === -1 ? -1 : pokerTable.dealerIndex);
  if (pokerTable.dealerIndex === -1) { pokerTable.stage = "waiting"; pokerBroadcastState(); return; }
 
  const sbIndex = pokerNextOccupiedIndex(pokerTable.dealerIndex);
  const bbIndex = pokerNextOccupiedIndex(sbIndex);
  pokerOccupiedSeats().forEach(({ s }) => {
    s.cards = [pokerTable.deck.pop(), pokerTable.deck.pop()];
  });
 
  
  pokerPostBet(sbIndex, Math.min(POKER_SMALL_BLIND, pokerTable.seats[sbIndex].chips));
  pokerPostBet(bbIndex, Math.min(POKER_BIG_BLIND, pokerTable.seats[bbIndex].chips));
  pokerTable.currentBet = POKER_BIG_BLIND;
  pokerTable.lastAggressorIndex = bbIndex;
 
  pokerTable.stage = "preflop";
  pokerTable.currentTurnIndex = pokerNextToActIndex(bbIndex);
  pokerBroadcastState();
}
 
function pokerPostBet(seatIndex, amount) {
  const seat = pokerTable.seats[seatIndex];
  if (!seat) return;
  amount = Math.min(amount, seat.chips);
  seat.chips -= amount;
  seat.betThisRound += amount;
  seat.totalBet += amount;
  if (seat.chips === 0) seat.allIn = true;
}
 
function pokerBettingRoundComplete() {
  const active = pokerActiveHandSeats().filter(({ s }) => !s.folded && !s.allIn);
  if (active.length === 0) return true;
  return active.every(({ s }) => s.actedThisRound && s.betThisRound === pokerTable.currentBet);
}
 
function pokerCountNonFolded() {
  return pokerActiveHandSeats().filter(({ s }) => !s.folded).length;
}
 
function pokerAdvanceStage() {
  pokerTable.seats.forEach(s => { if (s && s.inHand) { s.betThisRound = 0; s.actedThisRound = false; } });
  pokerTable.currentBet = 0;
  pokerTable.minRaise = POKER_BIG_BLIND;
 
  if (pokerTable.stage === "preflop") {
    pokerTable.deck.pop(); 
    pokerTable.community.push(pokerTable.deck.pop(), pokerTable.deck.pop(), pokerTable.deck.pop());
    pokerTable.stage = "flop";
  } else if (pokerTable.stage === "flop") {
    pokerTable.deck.pop();
    pokerTable.community.push(pokerTable.deck.pop());
    pokerTable.stage = "turn";
  } else if (pokerTable.stage === "turn") {
    pokerTable.deck.pop();
    pokerTable.community.push(pokerTable.deck.pop());
    pokerTable.stage = "river";
  } else if (pokerTable.stage === "river") {
    pokerShowdown();
    return;
  }
 
  if (pokerCountNonFolded() <= 1) { pokerShowdown(); return; }
  const active = pokerActiveHandSeats().filter(({ s }) => !s.folded && !s.allIn);
  if (active.length <= 1) {
    setTimeout(() => pokerAdvanceStage(), 900);
    pokerBroadcastState();
    return;
  }
 
  pokerTable.currentTurnIndex = pokerNextToActIndex(pokerTable.dealerIndex);
  pokerBroadcastState();
}
 
function pokerBuildPots() {
  const contributors = pokerActiveHandSeats().map(({ s, i }) => ({ i, totalBet: s.totalBet, folded: s.folded, userId: s.userId }));
  const levels = [...new Set(contributors.filter(c => c.totalBet > 0).map(c => c.totalBet))].sort((a, b) => a - b);
  const pots = [];
  let prevLevel = 0;
  for (const level of levels) {
    const layerContributors = contributors.filter(c => c.totalBet >= level);
    const amount = (level - prevLevel) * layerContributors.length;
    const eligible = layerContributors.filter(c => !c.folded).map(c => c.userId);
    if (amount > 0) pots.push({ amount, eligibleUserIds: eligible });
    prevLevel = level;
  }
  return pots;
}
 
function pokerShowdown() {
  pokerTable.stage = "showdown";
  const pots = pokerBuildPots();
  pokerTable.pots = pots;

  const nonFolded = pokerActiveHandSeats().filter(({ s }) => !s.folded);
  const winnings = {};

  pots.forEach(pot => {
    const contenders = nonFolded.filter(({ s }) => pot.eligibleUserIds.includes(s.userId));
    if (contenders.length === 0) return;
    let winners = [];
    let bestScore = null;
    contenders.forEach(({ s }) => {
      const seven = [...s.cards, ...pokerTable.community];
      const score = seven.length >= 5 ? pokerBestScore(seven) : [0];
      s._lastScore = score;
      if (!bestScore || pokerCompareScores(score, bestScore) > 0) {
        bestScore = score;
        winners = [s];
      } else if (pokerCompareScores(score, bestScore) === 0) {
        winners.push(s);
      }
    });
    const share = Math.floor(pot.amount / winners.length);
    winners.forEach(w => {
      w.chips += share;
      winnings[w.userId] = (winnings[w.userId] || 0) + share;
    });
  });


  pokerActiveHandSeats().forEach(({ s }) => {
    const won = winnings[s.userId] || 0;
    const net = won - s.totalBet;
    emitToUser(s.userId, "pokerHandResult", {
      folded: s.folded,
      won: won > 0,
      amountWon: won,
      net,
      handName: (!s.folded && s._lastScore) ? HAND_NAMES[s._lastScore[0]] : null
    });
  });

  pokerBroadcastState();

  setTimeout(() => {
    pokerTable.seats.forEach(s => { if (s && s.chips <= 0) { s.sittingOut = true; } });
    pokerStartHand();
  }, 5000);
}
 
function pokerHandleFold(userId) {
  const idx = pokerFindUserSeatIndex(userId);
  const seat = pokerTable.seats[idx];
  if (!seat || idx !== pokerTable.currentTurnIndex) return;
  seat.folded = true;
  seat.actedThisRound = true;
  pokerAfterAction(idx);
}
 
function pokerHandleCheck(userId) {
  const idx = pokerFindUserSeatIndex(userId);
  const seat = pokerTable.seats[idx];
  if (!seat || idx !== pokerTable.currentTurnIndex) return;
  if (seat.betThisRound !== pokerTable.currentBet) return; 
  seat.actedThisRound = true;
  pokerAfterAction(idx);
}
 
function pokerHandleCall(userId) {
  const idx = pokerFindUserSeatIndex(userId);
  const seat = pokerTable.seats[idx];
  if (!seat || idx !== pokerTable.currentTurnIndex) return;
  const toCall = Math.min(pokerTable.currentBet - seat.betThisRound, seat.chips);
  pokerPostBet(idx, toCall);
  seat.actedThisRound = true;
  pokerAfterAction(idx);
}
 
function pokerHandleBetRaise(userId, amount) {
  const idx = pokerFindUserSeatIndex(userId);
  const seat = pokerTable.seats[idx];
  if (!seat || idx !== pokerTable.currentTurnIndex) return;
  amount = Math.floor(Number(amount));
  if (!Number.isFinite(amount) || amount <= 0) return;
 
  const totalTarget = pokerTable.currentBet + amount; 
  const chipsNeeded = Math.min(totalTarget - seat.betThisRound, seat.chips);
  if (chipsNeeded <= 0) return;
 
  pokerPostBet(idx, chipsNeeded);
 
  if (seat.betThisRound > pokerTable.currentBet) {
    pokerTable.minRaise = Math.max(POKER_BIG_BLIND, seat.betThisRound - pokerTable.currentBet);
    pokerTable.currentBet = seat.betThisRound;
    pokerTable.lastAggressorIndex = idx;
    pokerActiveHandSeats().forEach(({ s, i }) => { if (i !== idx && !s.folded && !s.allIn) s.actedThisRound = false; });
  }
  seat.actedThisRound = true;
  pokerAfterAction(idx);
}
 
function pokerAfterAction(actedIndex) {
  if (pokerCountNonFolded() <= 1) { pokerShowdown(); return; }
 
  if (pokerBettingRoundComplete()) {
    pokerAdvanceStage();
    return;
  }
 
  pokerTable.currentTurnIndex = pokerNextToActIndex(actedIndex);
  pokerBroadcastState();
}

const PEPE_HIGHSCORE_FILE = path.join(__dirname, "./data/pepeHighscore.json");
const PEPE_SCORE_RATE_CAP = 8;     
const PEPE_RATE_BUFFER = 1.25;    
const pepeRunStarts = new Map();   

let pepeHighscore = { username: null, userId: null, score: 0, ts: 0 };
function loadPepeHighscore() {
  if (fs.existsSync(PEPE_HIGHSCORE_FILE)) {
    try { return JSON.parse(fs.readFileSync(PEPE_HIGHSCORE_FILE, "utf8")); }
    catch (e) { console.error("❌ pepeHighscore.json load failed", e); }
  }
  return { username: null, userId: null, score: 0, ts: 0 };
}
function savePepeHighscore() {
  fs.writeFileSync(PEPE_HIGHSCORE_FILE, JSON.stringify(pepeHighscore, null, 2));
}
pepeHighscore = loadPepeHighscore();
const PONG_WIDTH = 700;
const PONG_HEIGHT = 420;
const PONG_PADDLE_HEIGHT = 80;
const PONG_PADDLE_WIDTH = 12;
const PONG_PADDLE_MARGIN = 20;
const PONG_BALL_SIZE = 10;
const PONG_WIN_SCORE = 7;
const PONG_TICK_MS = 1000 / 60;
const PONG_XP_REWARD = 10;
const PONG_BASE_BALL_SPEED = 4;
const PONG_MAX_BALL_SPEED = 9;
const PONG_PADDLE_SPEED = 9;

const SLOTS_MAX_BET_CHIPS = 20000;
const SLOTS_REEL_COUNT = 3;
const SLOTS_ANIMATION_MS = 900 + 1150 + 1400; 
const SLOTS_FREE_SPINS_COST = 5;
const SLOTS_FREE_SPINS_COUNT = 10;
const SLOTS_FREE_SPIN_BET = 1
 
const SLOTS_SYMBOLS = [
  { id: "cherry", weight: 32 },
  { id: "lemon",  weight: 26 },
  { id: "bell",   weight: 18 },
  { id: "clover", weight: 12 },
  { id: "star",   weight: 7  },
  { id: "pepe",   weight: 4  },
  { id: "seven",  weight: 1  },
];
 

const SLOTS_PAYOUTS = {
  cherry: 13,
  lemon:  18,
  bell:   27,
  clover: 44,
  star:   90,
  pepe:   225,
  seven:  450,
};


const slotsFreeSpinSessions = new Map(); 

function slotsFreeSpinsState(userId) {
  const session = slotsFreeSpinSessions.get(userId);
  return {
    active: !!session,
    remaining: session ? session.remaining : 0,
    account: session ? session.account : null,
    cost: SLOTS_FREE_SPINS_COST,
    count: SLOTS_FREE_SPINS_COUNT,
    fixedBet: SLOTS_FREE_SPIN_BET
  };
}
 

const SLOTS_HOUSE_EDGE = 0.96;
 
function slotsPickSymbol() {
  const totalWeight = SLOTS_SYMBOLS.reduce((s, sym) => s + sym.weight, 0);
  const SCALE = 1000;
  const roll = crypto.randomInt(Math.round(totalWeight * SCALE)) / SCALE;
  let acc = 0;
  for (const sym of SLOTS_SYMBOLS) {
    acc += sym.weight;
    if (roll < acc) return sym.id;
  }
  return SLOTS_SYMBOLS[SLOTS_SYMBOLS.length - 1].id;
}
 
function slotsSpinReels() {
  const reels = [];
  for (let i = 0; i < SLOTS_REEL_COUNT; i++) reels.push(slotsPickSymbol());
  return reels;
}
 
function slotsEvaluate(reels, betChips) {
  const allSame = reels.every((r) => r === reels[0]);
  if (!allSame) {
    return { multiplier: 0, payoutChips: 0 };
  }
  const baseMult = SLOTS_PAYOUTS[reels[0]] || 0;
  const multiplier = Math.round(baseMult * SLOTS_HOUSE_EDGE * 100) / 100;
  const payoutChips = Math.floor(betChips * multiplier);
  return { multiplier, payoutChips };
}
 

let pongQueue = [];             
const pongRooms = new Map();     
const pongUserRoom = new Map(); 
 
function pongMakeRoomId() {
  return "pong_" + crypto.randomUUID();
}
 
function pongGetUserInfo(userId) {
  const online = onlineUsers.get(userId);
  const db = allUsers.get(userId);
  return {
    userId,
    username: online?.username || db?.username || "Anonymous",
    avatar: online?.avatar || db?.avatar || "/avatars/default1.png"
  };
}
 
function pongResetBall(room) {
  room.ball = { x: PONG_WIDTH / 2, y: PONG_HEIGHT / 2, vx: 0, vy: 0 };
}
 

function pongPrepareServe(room, serverUserId) {
  room.status = "serving";
  room.serverUserId = serverUserId;
  pongResetBall(room);
}
 

function pongServeBall(room, serverUserId) {
  if (room.status !== "serving") return false;
  if (room.serverUserId !== serverUserId) return false;

  const server = room.players.find(p => p.userId === serverUserId);
  const towardsRight = server.side === "left";

  room.status = "launching"; 
  setTimeout(() => {
    if (room.status !== "launching") return; 
    room.ball.vx = (towardsRight ? 1 : -1) * PONG_BASE_BALL_SPEED;
    room.ball.vy = (crypto.randomInt(2) === 0 ? -1 : 1) * (PONG_BASE_BALL_SPEED * 0.5);
    room.status = "playing";
    pongBroadcastState(room);
  }, 500); 

  return true;
}
 
function pongCreateRoom(userIdA, userIdB) {
  const roomId = pongMakeRoomId();
  const room = {
    id: roomId,
    players: [
      { ...pongGetUserInfo(userIdA), side: "left", y: PONG_HEIGHT / 2 - PONG_PADDLE_HEIGHT / 2, score: 0, keys: { up: false, down: false } },
      { ...pongGetUserInfo(userIdB), side: "right", y: PONG_HEIGHT / 2 - PONG_PADDLE_HEIGHT / 2, score: 0, keys: { up: false, down: false } }
    ],
    ball: null,
    status: "serving", 
    serverUserId: null,
    interval: null,
    lastScorer: null
  };
 
  const openingServer = crypto.randomInt(2) === 0 ? userIdA : userIdB;
  pongPrepareServe(room, openingServer);
 
  pongRooms.set(roomId, room);
  pongUserRoom.set(userIdA, roomId);
  pongUserRoom.set(userIdB, roomId);
 
  room.interval = setInterval(() => pongTick(room), PONG_TICK_MS);
 
  room.players.forEach((p, idx) => {
    emitToUser(p.userId, "pongMatchFound", {
      roomId,
      yourUserId: p.userId,
      yourSide: p.side,
      opponent: room.players[1 - idx]
    });
  });
 
  console.log(`🏓 Pong match started: ${room.players[0].username} vs ${room.players[1].username}`);
  return room;
}
 
function pongBuildState(room) {
  return {
    roomId: room.id,
    status: room.status,
    serverUserId: room.serverUserId,
    ball: room.ball,
    players: room.players.map(p => ({
      userId: p.userId,
      username: p.username,
      avatar: p.avatar,
      side: p.side,
      y: p.y,
      score: p.score
    })),
    width: PONG_WIDTH,
    height: PONG_HEIGHT,
    paddleHeight: PONG_PADDLE_HEIGHT,
    paddleWidth: PONG_PADDLE_WIDTH,
    paddleMargin: PONG_PADDLE_MARGIN,
    ballSize: PONG_BALL_SIZE,
    winScore: PONG_WIN_SCORE
  };
}
 
function pongBroadcastState(room) {
  const state = pongBuildState(room);
  room.players.forEach(p => emitToUser(p.userId, "pongState", state));
}
 
function pongTick(room) {
  if (room.status === "over") return;
  room.players.forEach(p => {
    if (p.keys.up) p.y -= PONG_PADDLE_SPEED;
    if (p.keys.down) p.y += PONG_PADDLE_SPEED;
    p.y = Math.max(0, Math.min(PONG_HEIGHT - PONG_PADDLE_HEIGHT, p.y));
  });
 
  if (room.status !== "playing") {
    pongBroadcastState(room);
    return;
  }
 
  const ball = room.ball;
  ball.x += ball.vx;
  ball.y += ball.vy;
 
 
  if (ball.y - PONG_BALL_SIZE / 2 <= 0) {
    ball.y = PONG_BALL_SIZE / 2;
    ball.vy *= -1;
  } else if (ball.y + PONG_BALL_SIZE / 2 >= PONG_HEIGHT) {
    ball.y = PONG_HEIGHT - PONG_BALL_SIZE / 2;
    ball.vy *= -1;
  }
 
  const left = room.players.find(p => p.side === "left");
  const right = room.players.find(p => p.side === "right");
 
 
  const leftPaddleX = PONG_PADDLE_MARGIN;
  if (
    ball.vx < 0 &&
    ball.x - PONG_BALL_SIZE / 2 <= leftPaddleX + PONG_PADDLE_WIDTH &&
    ball.x - PONG_BALL_SIZE / 2 >= leftPaddleX &&
    ball.y >= left.y &&
    ball.y <= left.y + PONG_PADDLE_HEIGHT
  ) {
    const hitPos = (ball.y - (left.y + PONG_PADDLE_HEIGHT / 2)) / (PONG_PADDLE_HEIGHT / 2); 
    const speed = Math.min(PONG_MAX_BALL_SPEED, Math.hypot(ball.vx, ball.vy) * 1.06);
    const angle = hitPos * (Math.PI / 3); 
    ball.vx = Math.abs(speed * Math.cos(angle));
    ball.vy = speed * Math.sin(angle);
    ball.x = leftPaddleX + PONG_PADDLE_WIDTH + PONG_BALL_SIZE / 2;
  }
 
 
  const rightPaddleX = PONG_WIDTH - PONG_PADDLE_MARGIN - PONG_PADDLE_WIDTH;
  if (
    ball.vx > 0 &&
    ball.x + PONG_BALL_SIZE / 2 >= rightPaddleX &&
    ball.x + PONG_BALL_SIZE / 2 <= rightPaddleX + PONG_PADDLE_WIDTH &&
    ball.y >= right.y &&
    ball.y <= right.y + PONG_PADDLE_HEIGHT
  ) {
    const hitPos = (ball.y - (right.y + PONG_PADDLE_HEIGHT / 2)) / (PONG_PADDLE_HEIGHT / 2);
    const speed = Math.min(PONG_MAX_BALL_SPEED, Math.hypot(ball.vx, ball.vy) * 1.06);
    const angle = hitPos * (Math.PI / 3);
    ball.vx = -Math.abs(speed * Math.cos(angle));
    ball.vy = speed * Math.sin(angle);
    ball.x = rightPaddleX - PONG_BALL_SIZE / 2;
  }
 
 
  if (ball.x < -PONG_BALL_SIZE) {
    right.score++;
    room.lastScorer = right.userId;
    pongAfterScore(room, "right");
  } else if (ball.x > PONG_WIDTH + PONG_BALL_SIZE) {
    left.score++;
    room.lastScorer = left.userId;
    pongAfterScore(room, "left");
  }
 
  pongBroadcastState(room);
}
 
function pongAfterScore(room, scoredSide) {
  const winner = room.players.find(p => p.score >= PONG_WIN_SCORE);
  if (winner) {
    pongEndRoom(room, winner);
    return;
  }
  
  const concedingSide = scoredSide === "left" ? "right" : "left";
  const nextServer = room.players.find(p => p.side === concedingSide);
  pongPrepareServe(room, nextServer.userId);
  pongBroadcastState(room);
}
 
function pongEndRoom(room, winner) {
  room.status = "over";
  clearInterval(room.interval);
  room.interval = null;
 
  const loser = room.players.find(p => p.userId !== winner.userId);
 
  addServerXP(winner.userId, PONG_XP_REWARD);
 
  room.players.forEach(p => {
    emitToUser(p.userId, "pongGameOver", {
      winnerId: winner.userId,
      winnerUsername: winner.username,
      youWon: p.userId === winner.userId,
      finalScore: { left: room.players.find(x => x.side === "left").score, right: room.players.find(x => x.side === "right").score },
      xpAwarded: PONG_XP_REWARD
    });
    pongUserRoom.delete(p.userId);
  });
 
  console.log(`🏓 Pong match over: ${winner.username} beat ${loser?.username || "?"} (+${PONG_XP_REWARD} XP)`);
 
  
  setTimeout(() => pongRooms.delete(room.id), 10000);
}
 
function pongHandleLeave(userId, reason = "left") {
  pongQueue = pongQueue.filter(id => id !== userId);
  const roomId = pongUserRoom.get(userId);
  if (!roomId) return;
  const room = pongRooms.get(roomId);
  if (!room || room.status !== "playing") return;
 
  const winner = room.players.find(p => p.userId !== userId);
  if (winner) {
    pongEndRoom(room, winner);
  }
}


const DICE_LEADERBOARD_FILE = path.join(__dirname, "./data/diceLeaderboard.json");
const DICE_LEADERBOARD_TOP_N = 10;
let diceLeaderboard = new Map(); 

function diceLoadLeaderboard() {
  if (fs.existsSync(DICE_LEADERBOARD_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(DICE_LEADERBOARD_FILE, "utf8"));
      diceLeaderboard = new Map(Object.entries(data));
      console.log(`✅ Loaded dice leaderboard (${diceLeaderboard.size} players)`);
    } catch (e) {
      console.error("❌ diceLeaderboard.json load failed", e);
    }
  }
}
function diceSaveLeaderboard() {
  try {
    fs.writeFileSync(DICE_LEADERBOARD_FILE, JSON.stringify(Object.fromEntries(diceLeaderboard), null, 2));
  } catch (e) {
    console.error("❌ Failed to save diceLeaderboard.json:", e);
  }
}
diceLoadLeaderboard();

function diceRecordWin(userId, payoutChips) {
  const current = diceLeaderboard.get(userId) || 0;
  if (payoutChips > current) {
    diceLeaderboard.set(userId, payoutChips);
    diceSaveLeaderboard();
    return true;
  }
  return false;
}

function diceBuildLeaderboardPayload() {
  const leaders = Array.from(diceLeaderboard.entries())
    .map(([userId, payout]) => {
      const online = onlineUsers.get(userId);
      const db = allUsers.get(userId);
      return {
        userId,
        username: online?.username || db?.username || "Unknown",
        avatar: online?.avatar || db?.avatar || "/avatars/default1.png",
        payout
      };
    })
    .sort((a, b) => b.payout - a.payout)
    .slice(0, DICE_LEADERBOARD_TOP_N);
  return { leaders };
}
function diceBroadcastLeaderboard() {
  io.emit("diceLeaderboardState", diceBuildLeaderboardPayload());
}
function diceBroadcastRecentBet(entry) {
  io.emit("diceRecentBet", entry);
}


const PLINKO_LEADERBOARD_FILE = path.join(__dirname, "./data/plinkoLeaderboard.json");
const PLINKO_LEADERBOARD_TOP_N = 10;
let plinkoLeaderboard = new Map(); 

function plinkoLoadLeaderboard() {
  if (fs.existsSync(PLINKO_LEADERBOARD_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(PLINKO_LEADERBOARD_FILE, "utf8"));
      plinkoLeaderboard = new Map(Object.entries(data));
      console.log(`✅ Loaded plinko leaderboard (${plinkoLeaderboard.size} players)`);
    } catch (e) {
      console.error("❌ plinkoLeaderboard.json load failed", e);
    }
  }
}
function plinkoSaveLeaderboard() {
  try {
    fs.writeFileSync(PLINKO_LEADERBOARD_FILE, JSON.stringify(Object.fromEntries(plinkoLeaderboard), null, 2));
  } catch (e) {
    console.error("❌ Failed to save plinkoLeaderboard.json:", e);
  }
}
plinkoLoadLeaderboard();

function plinkoRecordWin(userId, payoutChips, multiplier) {
  const current = plinkoLeaderboard.get(userId);
  if (!current || payoutChips > current.payout) {
    plinkoLeaderboard.set(userId, { payout: payoutChips, multiplier, ts: Date.now() });
    plinkoSaveLeaderboard();
    return true;
  }
  return false;
}

function plinkoBuildLeaderboardPayload() {
  const leaders = Array.from(plinkoLeaderboard.entries())
    .map(([userId, entry]) => {
      const online = onlineUsers.get(userId);
      const db = allUsers.get(userId);
      return {
        userId,
        username: online?.username || db?.username || "Unknown",
        avatar: online?.avatar || db?.avatar || "/avatars/default1.png",
        payout: entry.payout,
        multiplier: entry.multiplier
      };
    })
    .sort((a, b) => b.payout - a.payout)
    .slice(0, PLINKO_LEADERBOARD_TOP_N);
  return { leaders };
}
function plinkoBroadcastLeaderboard() {
  io.emit("plinkoLeaderboardState", plinkoBuildLeaderboardPayload());
}


function plinkoBroadcastRecentBet(entry) {
  io.emit("plinkoRecentBet", entry);
}

const AVIA_LEADERBOARD_FILE = path.join(__dirname, "./data/aviaLeaderboard.json");
const AVIA_LEADERBOARD_TOP_N = 10;
let aviaLeaderboard = new Map();
 
function aviaLoadLeaderboard() {
  if (fs.existsSync(AVIA_LEADERBOARD_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(AVIA_LEADERBOARD_FILE, "utf8"));
      aviaLeaderboard = new Map(Object.entries(data));
      console.log(`✅ Loaded avia leaderboard (${aviaLeaderboard.size} players)`);
    } catch (e) {
      console.error("❌ aviaLeaderboard.json load failed", e);
    }
  }
}
function aviaSaveLeaderboard() {
  try {
    fs.writeFileSync(AVIA_LEADERBOARD_FILE, JSON.stringify(Object.fromEntries(aviaLeaderboard), null, 2));
  } catch (e) {
    console.error("❌ Failed to save aviaLeaderboard.json:", e);
  }
}
aviaLoadLeaderboard();
function aviaRecordResult(userId, multiplier, payoutChips) {
  const current = aviaLeaderboard.get(userId);
  if (!current || multiplier > current.multiplier) {
    aviaLeaderboard.set(userId, { multiplier, payout: payoutChips, ts: Date.now() });
    aviaSaveLeaderboard();
    return true;
  }
  return false;
}
 
function aviaBuildLeaderboardPayload() {
  return Array.from(aviaLeaderboard.entries())
    .map(([userId, entry]) => {
      const online = onlineUsers.get(userId);
      const db = allUsers.get(userId);
      return {
        userId,
        name: online?.username || db?.username || "Unknown",
        avatar: online?.avatar || db?.avatar || "/avatars/default1.png",
        multiplier: entry.multiplier,
        payout: entry.payout
      };
    })
    .sort((a, b) => b.multiplier - a.multiplier)
    .slice(0, AVIA_LEADERBOARD_TOP_N);
}
 
function aviaBroadcastLeaderboard() {
  io.emit("aviaLeaderboard", aviaBuildLeaderboardPayload());
}


const AVIA_TRACK_LENGTH = 1000;       
const AVIA_MAX_BET_CHIPS = 20000;
const AVIA_HOUSE_EDGE = 0.97;
const AVIA_FAIR_LAMBDA = 0.008;
const AVIA_SPEEDS = {
  cruise: { label: "Cruise", unitsPerSec: 45,  lambda: AVIA_FAIR_LAMBDA, emoji: "🐢" },
  steady: { label: "Steady", unitsPerSec: 75,  lambda: AVIA_FAIR_LAMBDA, emoji: "🚶" },
  fast:   { label: "Fast",   unitsPerSec: 115, lambda: AVIA_FAIR_LAMBDA, emoji: "💨" },
  turbo:  { label: "Turbo",  unitsPerSec: 170, lambda: AVIA_FAIR_LAMBDA, emoji: "⚡" },
};
const AVIA_STAR_VALUES = [
  { v: 0.2, w: 20 }, { v: 0.3, w: 18 }, { v: 0.5, w: 16 }, { v: 0.8, w: 12 }, { v: 1, w: 10 },
  { v: 1.5, w: 9 }, { v: 2, w: 8 }, { v: 3, w: 6 }, { v: 4, w: 5 }, { v: 5, w: 4 },
  { v: 7, w: 3 }, { v: 10, w: 2 }, { v: 15, w: 1 }, { v: 25, w: 0.5 }, { v: 50, w: 0.2 },
];
 
const aviaSessions = new Map(); 
 
function aviaPickStarValue() {
  const total = AVIA_STAR_VALUES.reduce((s, x) => s + x.w, 0);
  const SCALE = 1000;
  const roll = crypto.randomInt(Math.round(total * SCALE)) / SCALE;
  let acc = 0;
  for (const s of AVIA_STAR_VALUES) {
    acc += s.w;
    if (roll < acc) return s.v;
  }
  return AVIA_STAR_VALUES[AVIA_STAR_VALUES.length - 1].v;
}
 
function aviaGenerateStars(trackLength) {
  const count = 8 + crypto.randomInt(3); 
  const segment = (trackLength - 160) / count;
  const stars = [];
  for (let i = 0; i < count; i++) {
    const base = 100 + i * segment;
    const jitter = crypto.randomInt(Math.max(1, Math.floor(segment * 0.6)));
    const distance = Math.round(base + jitter);
    stars.push({ distance, value: aviaPickStarValue() });
  }
  return stars.sort((a, b) => a.distance - b.distance);
}
 
function aviaGenerateCrashDistance(lambda) {
  const r = Math.min(crypto.randomInt(0, 1000000) / 1000000, 0.999999);
  return -Math.log(1 - r) / lambda;
}
 
function aviaMultiplierAt(stars, distance) {
  let mult = 1;
  for (const s of stars) {
    if (s.distance <= distance) mult += s.value;
  }
  return Math.round(mult * AVIA_HOUSE_EDGE * 100) / 100;
}
 
function aviaClearTimer(session) {
  if (session && session.timer) {
    clearTimeout(session.timer);
    session.timer = null;
  }
}
 
function aviaResolveEnd(userId) {
  const session = aviaSessions.get(userId);
  if (!session || !session.active) return;
 
  const endDistance = Math.min(session.crashDistance, AVIA_TRACK_LENGTH);
 
  if (session.crashDistance >= AVIA_TRACK_LENGTH) {
    const multiplier = aviaMultiplierAt(session.stars, AVIA_TRACK_LENGTH);
    const payoutChips = Math.floor(session.betChips * multiplier);
 
    if (session.useBonus) creditBonusWin(userId, payoutChips);
    else adjustUserXp(userId, payoutChips * BJ_XP_PER_CHIP);
 
    emitToUser(userId, "aviaFullClear", {
      multiplier,
      payoutChips,
      account: session.useBonus ? "bonus" : "normal",
      balance: session.useBonus ? getBonusBalance(userId) : getChipBalance(userId)
    });

    if (aviaRecordResult(userId, multiplier, payoutChips)) aviaBroadcastLeaderboard();

  
 
    console.log(`🏆 Avia full clear: ${onlineUsers.get(userId)?.username || userId} landed at ${multiplier.toFixed(2)}x -> ${payoutChips}`);
  } else {
    const multiplierAtCrash = aviaMultiplierAt(session.stars, endDistance);
    emitToUser(userId, "aviaCrashed", {
      crashDistance: endDistance,
      multiplierAtCrash,
      betChips: session.betChips
    });
    console.log(`💥 Avia crash: ${onlineUsers.get(userId)?.username || userId} went down at distance ${endDistance.toFixed(0)} (would've been ${multiplierAtCrash.toFixed(2)}x)`);
  }
 
  session.active = false;
  aviaSessions.delete(userId);
}

const wgClickHistory = new Map();
const WG_CLICK_HISTORY_MAX = 50;
const WG_AUTOCLICK_INTERVAL_THRESHOLD_MS = 120; 
const WG_AUTOCLICK_VARIANCE_THRESHOLD = 15;  
const AS_ROUND_GAP_MS = 8000;    
const AS_GROWTH_RATE = 0.17;      
const AS_HOUSE_EDGE = 0.97;         
const AS_MAX_BET_CHIPS = 20000;
const AS_POST_CRASH_DELAY_MS = 3000; 
const AS_LEADERBOARD_FILE = path.join(__dirname, "./data/airstrikeLeaderboard.json");
const AS_LEADERBOARD_TOP_N = 10;
 
let airstrikeLeaderboard = new Map(); 
 
function asLoadLeaderboard() {
  if (fs.existsSync(AS_LEADERBOARD_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(AS_LEADERBOARD_FILE, "utf8"));
      airstrikeLeaderboard = new Map(Object.entries(data));
      console.log(`✅ Loaded airstrike leaderboard (${airstrikeLeaderboard.size} players)`);
    } catch (e) {
      console.error("❌ airstrikeLeaderboard.json load failed", e);
    }
  }
}
function asSaveLeaderboard() {
  try {
    fs.writeFileSync(AS_LEADERBOARD_FILE, JSON.stringify(Object.fromEntries(airstrikeLeaderboard), null, 2));
  } catch (e) {
    console.error("❌ Failed to save airstrikeLeaderboard.json:", e);
  }
}
asLoadLeaderboard();
 
function asRecordMultiplier(userId, multiplier) {
  const current = airstrikeLeaderboard.get(userId) || 0;
  if (multiplier > current) {
    airstrikeLeaderboard.set(userId, multiplier);
    asSaveLeaderboard();
    return true;
  }
  return false;
}
 
function asBuildLeaderboardPayload() {
  const entries = Array.from(airstrikeLeaderboard.entries())
    .map(([userId, mult]) => {
      const online = onlineUsers.get(userId);
      const db = allUsers.get(userId);
      return {
        userId,
        username: online?.username || db?.username || "Unknown",
        avatar: online?.avatar || db?.avatar || "/avatars/default1.png",
        multiplier: mult
      };
    })
    .sort((a, b) => b.multiplier - a.multiplier)
    .slice(0, AS_LEADERBOARD_TOP_N);
  return { leaders: entries };
}
function asBroadcastLeaderboard() {
  io.emit("airstrikeLeaderboardState", asBuildLeaderboardPayload());
}
 
const airstrikeRound = {
  state: "waiting",      
  roundId: 0,
  crashPoint: 1,
  startedAt: 0,
  countdownEndsAt: Date.now() + AS_ROUND_GAP_MS,
  bets: new Map(),       
  timer: null,
  liveInterval: null
};
 
function asGenerateCrashPoint() {
  const r = crypto.randomInt(0, 1000000) / 1000000;
  if (r < 0.03) return 1.00; 
  const raw = AS_HOUSE_EDGE / (1 - r);
  return Math.max(1.00, Math.floor(raw * 100) / 100);
}
 
function asCurrentMultiplier() {
  if (airstrikeRound.state === "crashed") return airstrikeRound.crashPoint;
  if (airstrikeRound.state !== "flying") return 1;
  const elapsed = (Date.now() - airstrikeRound.startedAt) / 1000;
  const growth = Math.pow(Math.E, elapsed * AS_GROWTH_RATE);
  return Math.min(Math.round(growth * 100) / 100, airstrikeRound.crashPoint);
}
 
function asBuildStateFor(userId) {
  const myBet = userId ? airstrikeRound.bets.get(userId) : null;
  return {
    state: airstrikeRound.state,
    roundId: airstrikeRound.roundId,
    multiplier: asCurrentMultiplier(),
    countdownMsLeft: airstrikeRound.state === "waiting" ? Math.max(0, airstrikeRound.countdownEndsAt - Date.now()) : 0,
    crashPoint: airstrikeRound.state === "crashed" ? airstrikeRound.crashPoint : null,
    balance: userId ? getChipBalance(userId) : null,
    bonusBalance: userId ? getBonusBalance(userId) : null,
    yourBet: myBet ? { amount: myBet.amount, cashedOutAt: myBet.cashedOutAt, useBonus: myBet.useBonus } : null,
    players: Array.from(airstrikeRound.bets.values()).map(b => ({
      username: b.username,
      avatar: b.avatar,
      amount: b.amount,
      cashedOutAt: b.cashedOutAt
    }))
  };
}
 
function asBroadcastState() {
  io.sockets.sockets.forEach(sock => {
    if (!sock.userId || sock.isBot) return;
    sock.emit("airstrikeState", asBuildStateFor(sock.userId));
  });
}
 
function asStartCountdown() {
  airstrikeRound.state = "waiting";
  airstrikeRound.bets.clear();
  airstrikeRound.countdownEndsAt = Date.now() + AS_ROUND_GAP_MS;
  asBroadcastState();
 
  clearTimeout(airstrikeRound.timer);
  airstrikeRound.timer = setTimeout(asStartFlight, AS_ROUND_GAP_MS);
}
 
function asStartFlight() {
  airstrikeRound.roundId++;
  airstrikeRound.crashPoint = asGenerateCrashPoint();
  airstrikeRound.startedAt = Date.now();
  airstrikeRound.state = "flying";
  asBroadcastState();
  const neededSeconds = Math.log(Math.max(airstrikeRound.crashPoint, 1.0001)) / AS_GROWTH_RATE;
  const flightMs = Math.max(300, neededSeconds * 1000);
 
  clearTimeout(airstrikeRound.timer);
  airstrikeRound.timer = setTimeout(asTriggerCrash, flightMs);
 
  clearInterval(airstrikeRound.liveInterval);
  airstrikeRound.liveInterval = setInterval(() => {
    if (airstrikeRound.state !== "flying") {
      clearInterval(airstrikeRound.liveInterval);
      return;
    }
    asBroadcastState();
  }, 150);
 
  
}
 
function asTriggerCrash() {
  airstrikeRound.state = "crashed";
  clearInterval(airstrikeRound.liveInterval);
 
  let leaderboardChanged = false;
  airstrikeRound.bets.forEach((bet, userId) => {
    if (bet.cashedOutAt) {
      if (asRecordMultiplier(userId, bet.cashedOutAt)) leaderboardChanged = true;
    }
  });
  if (leaderboardChanged) asBroadcastLeaderboard();
 
  asBroadcastState();
  
 
  clearTimeout(airstrikeRound.timer);
  airstrikeRound.timer = setTimeout(asStartCountdown, AS_POST_CRASH_DELAY_MS);
}
 

asStartCountdown();

const WG_POT_COUNT = 3;
const WG_GROW_MS = 60 * 60 * 1000;           
const WG_WATER_INTERVAL_MIN_MS = 10 * 60 * 1000;
const WG_WATER_INTERVAL_MAX_MS = 20 * 60 * 1000;
const WG_DEATH_GRACE_MS = 10 * 60 * 1000;   
const WG_HARVEST_XP = 30;
const WG_LEADERBOARD_FILE = path.join(__dirname, "./data/weedLeaderboard.json");
const WG_LEADERBOARD_TOP_N = 10;
function wgRandomWaterInterval() {
  return WG_WATER_INTERVAL_MIN_MS + crypto.randomInt(0, WG_WATER_INTERVAL_MAX_MS - WG_WATER_INTERVAL_MIN_MS + 1);
}
let weedLeaderboard = new Map();

function wgLoadLeaderboard() {
  if (fs.existsSync(WG_LEADERBOARD_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(WG_LEADERBOARD_FILE, "utf8"));
      weedLeaderboard = new Map(Object.entries(data));
      console.log(`✅ Loaded weed grow leaderboard (${weedLeaderboard.size} growers)`);
    } catch (e) {
      console.error("❌ weedLeaderboard.json load failed", e);
    }
  }
}
function wgSaveLeaderboard() {
  try {
    fs.writeFileSync(WG_LEADERBOARD_FILE, JSON.stringify(Object.fromEntries(weedLeaderboard), null, 2));
  } catch (e) {
    console.error("❌ Failed to save weedLeaderboard.json:", e);
  }
}
wgLoadLeaderboard();

function wgRecordHarvest(userId) {
  weedLeaderboard.set(userId, (weedLeaderboard.get(userId) || 0) + 1);
  wgSaveLeaderboard();
}

function wgBuildLeaderboardPayload() {
  const entries = Array.from(weedLeaderboard.entries())
    .map(([userId, count]) => {
      const online = onlineUsers.get(userId);
      const db = allUsers.get(userId);
      return {
        userId,
        username: online?.username || db?.username || "Unknown",
        avatar: online?.avatar || db?.avatar || "/avatars/default1.png",
        count
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, WG_LEADERBOARD_TOP_N);
  return { leaders: entries };
}
function wgBroadcastLeaderboard() {
  io.emit("weedLeaderboardState", wgBuildLeaderboardPayload());
}

const weedGardens = new Map();

function wgEmptyPot() {
  return {
    stage: "empty",
    plantedAt: null,
    wateredAt: null,
    nextWaterDueAt: null,
    wilted: false,
    wiltedAt: null,
    growAccumMs: 0,   
    growSince: null,  
    timer: null
  };
}

function wgGetGarden(userId) {
  let garden = weedGardens.get(userId);
  if (!garden) {
    garden = Array.from({ length: WG_POT_COUNT }, () => wgEmptyPot());
    weedGardens.set(userId, garden);
  }
  return garden;
}


function wgProgress(pot, now = Date.now()) {
  if (!pot || pot.stage === "empty") return 0;
  const activeMs = pot.growAccumMs + (pot.wilted ? 0 : Math.max(0, now - pot.growSince));
  return Math.min(1, activeMs / WG_GROW_MS);
}

function wgSerializePot(pot) {
  if (!pot || pot.stage === "empty") return { stage: "empty" };
  const now = Date.now();
  const progress = wgProgress(pot, now);
  const stage = progress >= 1 ? "ready" : "growing";
  const needsWater = stage !== "ready" && !pot.wilted && pot.nextWaterDueAt !== null && now >= pot.nextWaterDueAt;

  return {
    stage,
    plantedAt: pot.plantedAt,
    progress,
    needsWater,
    wilted: !!pot.wilted,
    deathInMs: pot.wilted ? Math.max(0, (pot.wiltedAt + WG_DEATH_GRACE_MS) - now) : null,
    growMsLeft: stage === "ready" ? 0 : Math.max(0, WG_GROW_MS - (pot.growAccumMs + (pot.wilted ? 0 : Math.max(0, now - pot.growSince))))
  };
}

function wgBroadcastState(userId) {
  const garden = wgGetGarden(userId);
  emitToUser(userId, "weedState", { pots: garden.map(wgSerializePot) });
}

function wgClearTimer(pot) {
  if (pot && pot.timer) {
    clearTimeout(pot.timer);
    pot.timer = null;
  }
}


function wgScheduleNext(userId, potIndex, pot) {
  wgClearTimer(pot);
  if (!pot || pot.stage === "empty") return;

  const now = Date.now();

  if (pot.wilted) {
    const delay = Math.max(0, (pot.wiltedAt + WG_DEATH_GRACE_MS) - now);
    pot.timer = setTimeout(() => wgHandleTimer(userId, potIndex, pot), delay);
    return;
  }

  const activeMs = pot.growAccumMs + Math.max(0, now - pot.growSince);
  const msToReady = Math.max(0, WG_GROW_MS - activeMs);
  const msToWaterDue = Math.max(0, pot.nextWaterDueAt - now);
  pot.timer = setTimeout(() => wgHandleTimer(userId, potIndex, pot), Math.min(msToReady, msToWaterDue));
}

function wgHandleTimer(userId, potIndex, pot) {
  const garden = wgGetGarden(userId);
  if (garden[potIndex] !== pot) return; 
  if (pot.stage === "empty") return;

  const now = Date.now();
  const progress = wgProgress(pot, now);

  if (!pot.wilted && progress >= 1) {
    emitToUser(userId, "weedReady", { potIndex, pot: wgSerializePot(pot) });
    return;
  }

  if (!pot.wilted && pot.nextWaterDueAt !== null && now >= pot.nextWaterDueAt) {
    pot.wilted = true;
    pot.wiltedAt = now;
    pot.growAccumMs += Math.max(0, now - pot.growSince);
    pot.growSince = null;
    emitToUser(userId, "weedWilted", { potIndex, pot: wgSerializePot(pot) });
    wgScheduleNext(userId, potIndex, pot);
    return;
  }

if (pot.wilted && now >= pot.wiltedAt + WG_DEATH_GRACE_MS) {
    garden[potIndex] = wgEmptyPot();
    emitToUser(userId, "weedDied", { potIndex, pot: wgSerializePot(garden[potIndex]) });

    const displayName = onlineUsers.get(userId)?.username || allUsers.get(userId)?.username || userId;
    console.log(`💀 Plant died from neglect in pot ${potIndex} for ${displayName}`);
    return;
}

  wgScheduleNext(userId, potIndex, pot);
}


const DARTS_MAX_BET_CHIPS = 20000;
const DARTS_HOUSE_EDGE = 0.97;
const DARTS_ANIMATION_MS = 1600;


const DARTS_RINGS = [
  { id: "bullseye",  label: "Bullseye",   weight: 3,  multiplier: 15 },
  { id: "inner",     label: "Inner Ring", weight: 10, multiplier: 4  },
  { id: "middle",    label: "Middle Ring",weight: 22, multiplier: 2  },
  { id: "outer",     label: "Outer Ring", weight: 30, multiplier: 1.2},
  { id: "miss",      label: "Miss",       weight: 35, multiplier: 0  },
];

function dartsPickRing() {
  const totalWeight = DARTS_RINGS.reduce((s, r) => s + r.weight, 0);
  const SCALE = 1000;
  const roll = crypto.randomInt(Math.round(totalWeight * SCALE)) / SCALE;
  let acc = 0;
  for (let i = 0; i < DARTS_RINGS.length; i++) {
    acc += DARTS_RINGS[i].weight;
    if (roll < acc) return i;
  }
  return DARTS_RINGS.length - 1;
}

function dartsEvaluate(ringIndex, betChips) {
  const ring = DARTS_RINGS[ringIndex];
  const multiplier = Math.round(ring.multiplier * DARTS_HOUSE_EDGE * 100) / 100;
  const payoutChips = Math.floor(betChips * multiplier);
  return { multiplier, payoutChips, ring };
}

const DARTS_LEADERBOARD_FILE = path.join(__dirname, "./data/dartsLeaderboard.json");
const DARTS_LEADERBOARD_TOP_N = 10;
let dartsLeaderboard = new Map();

function dartsLoadLeaderboard() {
  if (fs.existsSync(DARTS_LEADERBOARD_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(DARTS_LEADERBOARD_FILE, "utf8"));
      dartsLeaderboard = new Map(Object.entries(data));
      console.log(`✅ Loaded darts leaderboard (${dartsLeaderboard.size} players)`);
    } catch (e) {
      console.error("❌ dartsLeaderboard.json load failed", e);
    }
  }
}
function dartsSaveLeaderboard() {
  try {
    fs.writeFileSync(DARTS_LEADERBOARD_FILE, JSON.stringify(Object.fromEntries(dartsLeaderboard), null, 2));
  } catch (e) {
    console.error("❌ Failed to save dartsLeaderboard.json:", e);
  }
}
dartsLoadLeaderboard();

function dartsRecordWin(userId, payoutChips) {
  const current = dartsLeaderboard.get(userId) || 0;
  if (payoutChips > current) {
    dartsLeaderboard.set(userId, payoutChips);
    dartsSaveLeaderboard();
    return true;
  }
  return false;
}

function dartsBuildLeaderboardPayload() {
  const leaders = Array.from(dartsLeaderboard.entries())
    .map(([userId, payout]) => {
      const online = onlineUsers.get(userId);
      const db = allUsers.get(userId);
      return {
        userId,
        username: online?.username || db?.username || "Unknown",
        avatar: online?.avatar || db?.avatar || "/avatars/default1.png",
        payout
      };
    })
    .sort((a, b) => b.payout - a.payout)
    .slice(0, DARTS_LEADERBOARD_TOP_N);
  return { leaders }; 
}
function dartsBroadcastLeaderboard() {
  io.emit("dartsLeaderboardState", dartsBuildLeaderboardPayload());
}

const DT_ROWS = 9;
const DT_HOUSE_EDGE = 0.97;
const DT_MAX_BET_CHIPS = 20000;

const DT_DIFFICULTIES = {
  easy:   { tiles: 4, mines: 1 },
  medium: { tiles: 3, mines: 1 },
  hard:   { tiles: 2, mines: 1 },
  expert: { tiles: 3, mines: 2 },
  master: { tiles: 4, mines: 3 },
};

const DT_LEADERBOARD_FILE = path.join(__dirname, "./data/dragonTowerLeaderboard.json");
const DT_LEADERBOARD_TOP_N = 10;
let dragonTowerLeaderboard = new Map();

function dtLoadLeaderboard() {
  if (fs.existsSync(DT_LEADERBOARD_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(DT_LEADERBOARD_FILE, "utf8"));
      dragonTowerLeaderboard = new Map(Object.entries(data));
      console.log(`✅ Loaded dragon tower leaderboard (${dragonTowerLeaderboard.size} players)`);
    } catch (e) {
      console.error("❌ dragonTowerLeaderboard.json load failed", e);
    }
  }
}
function dtSaveLeaderboard() {
  try {
    fs.writeFileSync(DT_LEADERBOARD_FILE, JSON.stringify(Object.fromEntries(dragonTowerLeaderboard), null, 2));
  } catch (e) {
    console.error("❌ Failed to save dragonTowerLeaderboard.json:", e);
  }
}
dtLoadLeaderboard();

function dtRecordResult(userId, multiplier, payoutChips) {
  const current = dragonTowerLeaderboard.get(userId);
  if (!current || multiplier > current.multiplier) {
    dragonTowerLeaderboard.set(userId, { multiplier, payout: payoutChips, ts: Date.now() });
    dtSaveLeaderboard();
    return true;
  }
  return false;
}

function dtBuildLeaderboardPayload() {
  return Array.from(dragonTowerLeaderboard.entries())
    .map(([userId, entry]) => {
      const online = onlineUsers.get(userId);
      const db = allUsers.get(userId);
      return {
        userId,
        username: online?.username || db?.username || "Unknown",
        avatar: online?.avatar || db?.avatar || "/avatars/default1.png",
        multiplier: entry.multiplier,
        payout: entry.payout
      };
    })
    .sort((a, b) => b.multiplier - a.multiplier)
    .slice(0, DT_LEADERBOARD_TOP_N);
}
function dtBroadcastLeaderboard() {
  io.emit("dragonTowerLeaderboard", dtBuildLeaderboardPayload());
}


const dragonTowerSessions = new Map();

function dtGenerateRowMines(cfg) {
  const indices = Array.from({ length: cfg.tiles }, (_, i) => i);
  const mines = new Set();
  while (mines.size < cfg.mines) {
    mines.add(indices[crypto.randomInt(indices.length)]);
  }
  return mines;
}

function dtMultiplierForLevel(cfg, level) {
  const safeTiles = cfg.tiles - cfg.mines;
  let mult = 1;
  for (let i = 0; i < level; i++) {
    mult *= cfg.tiles / safeTiles;
  }
  return Math.round(mult * DT_HOUSE_EDGE * 10000) / 10000;
}

function dtEmitState(userId, socket) {
  const session = dragonTowerSessions.get(userId);
  const target = socket || null;
  const payload = (!session || !session.active)
    ? { active: false, balance: getChipBalance(userId), bonusBalance: getBonusBalance(userId) }
    : {
        active: true,
        difficulty: session.difficulty,
        tiles: DT_DIFFICULTIES[session.difficulty].tiles,
        rows: DT_ROWS,
        betChips: session.betChips,
        account: session.useBonus ? "bonus" : "normal",
        currentLevel: session.currentLevel,
        multiplier: dtMultiplierForLevel(DT_DIFFICULTIES[session.difficulty], session.currentLevel),
        revealedRows: session.revealedRows 
      };
  if (target) target.emit("dragonTowerState", payload);
  else emitToUser(userId, "dragonTowerState", payload);
}

const ROULETTE_ROUND_GAP_MS = 15000;      
const ROULETTE_SPIN_MS = 5500;            
const ROULETTE_RESULT_DISPLAY_MS = 5000;   
const ROULETTE_MAX_BET_CHIPS = 20000;
const ROULETTE_HOUSE_EDGE_NUMBERS = 37;   

const ROULETTE_WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5,
  24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];
const ROULETTE_RED_NUMBERS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);

function rouletteNumberColor(n) {
  if (n === 0) return "green";
  return ROULETTE_RED_NUMBERS.has(n) ? "red" : "black";
}


const ROULETTE_PAYOUTS = {
  straight: 35, red: 1, black: 1, odd: 1, even: 1, low: 1, high: 1,
  dozen1: 2, dozen2: 2, dozen3: 2, col1: 2, col2: 2, col3: 2
};

function rouletteBetWins(bet, winningNumber) {
  const color = rouletteNumberColor(winningNumber);
  switch (bet.type) {
    case "straight": return bet.number === winningNumber;
    case "red": return color === "red";
    case "black": return color === "black";
    case "odd": return winningNumber !== 0 && winningNumber % 2 === 1;
    case "even": return winningNumber !== 0 && winningNumber % 2 === 0;
    case "low": return winningNumber >= 1 && winningNumber <= 18;
    case "high": return winningNumber >= 19 && winningNumber <= 36;
    case "dozen1": return winningNumber >= 1 && winningNumber <= 12;
    case "dozen2": return winningNumber >= 13 && winningNumber <= 24;
    case "dozen3": return winningNumber >= 25 && winningNumber <= 36;
    case "col1": return winningNumber !== 0 && (winningNumber - 1) % 3 === 0;
    case "col2": return winningNumber !== 0 && (winningNumber - 2) % 3 === 0;
    case "col3": return winningNumber !== 0 && (winningNumber - 3) % 3 === 0;
    default: return false;
  }
}

const ROULETTE_LEADERBOARD_FILE = path.join(__dirname, "./data/rouletteLeaderboard.json");
const ROULETTE_LEADERBOARD_TOP_N = 10;
let rouletteLeaderboard = new Map();

function rouletteLoadLeaderboard() {
  if (fs.existsSync(ROULETTE_LEADERBOARD_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(ROULETTE_LEADERBOARD_FILE, "utf8"));
      rouletteLeaderboard = new Map(Object.entries(data));
      console.log(`✅ Loaded roulette leaderboard (${rouletteLeaderboard.size} players)`);
    } catch (e) { console.error("❌ rouletteLeaderboard.json load failed", e); }
  }
}
function rouletteSaveLeaderboard() {
  try {
    fs.writeFileSync(ROULETTE_LEADERBOARD_FILE, JSON.stringify(Object.fromEntries(rouletteLeaderboard), null, 2));
  } catch (e) { console.error("❌ Failed to save rouletteLeaderboard.json:", e); }
}
rouletteLoadLeaderboard();

function rouletteRecordWin(userId, netWin) {
  const current = rouletteLeaderboard.get(userId) || 0;
  if (netWin > current) {
    rouletteLeaderboard.set(userId, netWin);
    rouletteSaveLeaderboard();
    return true;
  }
  return false;
}

function rouletteBuildLeaderboardPayload() {
  const entries = Array.from(rouletteLeaderboard.entries())
    .map(([userId, netWin]) => {
      const online = onlineUsers.get(userId);
      const db = allUsers.get(userId);
      return {
        userId,
        username: online?.username || db?.username || "Unknown",
        avatar: online?.avatar || db?.avatar || "/avatars/default1.png",
        netWin
      };
    })
    .sort((a, b) => b.netWin - a.netWin)
    .slice(0, ROULETTE_LEADERBOARD_TOP_N);
  return { leaders: entries };
}
function rouletteBroadcastLeaderboard() {
  io.emit("rouletteLeaderboardState", rouletteBuildLeaderboardPayload());
}

const rouletteRound = {
  state: "betting",       
  roundId: 0,
  bettingEndsAt: Date.now() + ROULETTE_ROUND_GAP_MS,
  winningNumber: null,
  bets: new Map(),        
  timer: null
};

function rouletteGenerateWinningNumber() {
  return crypto.randomInt(0, 37);
}

function rouletteBuildStateFor(userId) {
  const myBets = userId ? (rouletteRound.bets.get(userId) || []) : [];
  const allBetsFlat = [];
  rouletteRound.bets.forEach((betsArr, uid) => {
    const u = onlineUsers.get(uid) || allUsers.get(uid) || {};
    betsArr.forEach(b => {
      allBetsFlat.push({
        userId: uid,
        username: u.username || "Anonymous",
        avatar: u.avatar || "/avatars/default1.png",
        type: b.type,
        number: b.number,
        amount: b.amount
      });
    });
  });

  return {
    state: rouletteRound.state,
    roundId: rouletteRound.roundId,
    bettingMsLeft: rouletteRound.state === "betting" ? Math.max(0, rouletteRound.bettingEndsAt - Date.now()) : 0,
    winningNumber: (rouletteRound.state === "results" || rouletteRound.state === "spinning") ? rouletteRound.winningNumber : null,
    winningColor: (rouletteRound.state === "results" || rouletteRound.state === "spinning") ? rouletteNumberColor(rouletteRound.winningNumber) : null,
    yourBets: myBets,
    yourBalance: userId ? getChipBalance(userId) : null,
    yourBonusBalance: userId ? getBonusBalance(userId) : null,
    allBets: allBetsFlat,
    maxBet: ROULETTE_MAX_BET_CHIPS
  };
}

function rouletteBroadcastState() {
  io.sockets.sockets.forEach(sock => {
    if (!sock.userId || sock.isBot) return;
    sock.emit("rouletteState", rouletteBuildStateFor(sock.userId));
  });
}

function rouletteStartBetting() {
  rouletteRound.state = "betting";
  rouletteRound.roundId++;
  rouletteRound.bets.clear();
  rouletteRound.winningNumber = null;
  rouletteRound.bettingEndsAt = Date.now() + ROULETTE_ROUND_GAP_MS;
  rouletteBroadcastState();

  clearTimeout(rouletteRound.timer);
  rouletteRound.timer = setTimeout(rouletteStartSpin, ROULETTE_ROUND_GAP_MS);
}

function rouletteStartSpin() {
  rouletteRound.state = "spinning";
  rouletteRound.winningNumber = rouletteGenerateWinningNumber();
  rouletteBroadcastState();

  clearTimeout(rouletteRound.timer);
  rouletteRound.timer = setTimeout(rouletteResolveRound, ROULETTE_SPIN_MS);
}

function rouletteResolveRound() {
  rouletteRound.state = "results";
  const winningNumber = rouletteRound.winningNumber;
  let leaderboardChanged = false;

  rouletteRound.bets.forEach((betsArr, userId) => {
    let totalStaked = 0;
    let totalPayout = 0;

    betsArr.forEach(bet => {
      totalStaked += bet.amount;
      if (rouletteBetWins(bet, winningNumber)) {
        const mult = ROULETTE_PAYOUTS[bet.type] || 0;
        totalPayout += bet.amount + (bet.amount * mult);
      }
    });

    const netWin = totalPayout - totalStaked;

    
    if (totalPayout > 0) {
      const useBonus = betsArr[0]?.useBonus; 
      if (useBonus) creditBonusWin(userId, totalPayout);
      else adjustUserXp(userId, totalPayout * BJ_XP_PER_CHIP);
    }

    if (netWin > 0 && rouletteRecordWin(userId, netWin)) leaderboardChanged = true;

    emitToUser(userId, "rouletteRoundResult", {
      winningNumber,
      winningColor: rouletteNumberColor(winningNumber),
      totalStaked,
      totalPayout,
      netWin,
      balance: getChipBalance(userId),
      bonusBalance: getBonusBalance(userId)
    });
  });

  if (leaderboardChanged) rouletteBroadcastLeaderboard();
  rouletteBroadcastState();

  clearTimeout(rouletteRound.timer);
  rouletteRound.timer = setTimeout(rouletteStartBetting, ROULETTE_RESULT_DISPLAY_MS);
}

rouletteStartBetting();
const PLINKO_ROWS = 16;              
const PLINKO_MAX_BET_CHIPS = 20000; 
const PLINKO_MULTIPLIERS = [1000, 130, 26, 9, 4, 2, 0.4, 0.2, 0.2, 0.2, 0.4, 2, 4, 9, 26, 130, 1000];
const PLINKO_ANIMATION_MS = 150 + PLINKO_ROWS * 230 + 300;
const MS_GRID_SIZE = 5;
const MS_TILE_COUNT = MS_GRID_SIZE * MS_GRID_SIZE;
const MS_MAX_BET_CHIPS = 20000;
const MS_ALLOWED_MINE_COUNTS = [3, 5, 8, 12];
const msSessions = new Map();
const BJ_SEATS = 5;
const BJ_MIN_BET = 1;
const BJ_MAX_BET_CHIPS = 100000;
const BJ_XP_PER_CHIP = 10;
const BJ_SUITS = ["♠", "♥", "♦", "♣"];
const BJ_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const BJ_BETTING_WINDOW_MS = 15000;
const BJ_TURN_TIMEOUT_MS = 20000;
const BJ_RESULT_DISPLAY_MS = 6000;

function bjFreshDeck() {
  const d = [];
  for (const s of BJ_SUITS) for (const r of BJ_RANKS) d.push({ r, s });
  for (let i = d.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
function bjCardValue(card) {
  if (card.r === "A") return 11;
  if (["K", "Q", "J"].includes(card.r)) return 10;
  return parseInt(card.r, 10);
}
function bjHandTotal(hand) {
  let total = hand.reduce((sum, c) => sum + bjCardValue(c), 0);
  let aces = hand.filter((c) => c.r === "A").length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}
function bjIsBlackjack(hand) {
  return hand.length === 2 && bjHandTotal(hand) === 21;
}


const bjTable = {
  seats: Array.from({ length: BJ_SEATS }, () => null),
 
  deck: [],
  dealerHand: [],
  dealerHoleHidden: true,
  stage: "waiting",
  currentTurnIndex: -1,
  bettingDeadline: 0,
  turnDeadline: 0,
  handNumber: 0,
  timers: { betting: null, turn: null, results: null }
};

function bjOccupiedSeats() {
  return bjTable.seats
    .map((s, i) => ({ s, i }))
    .filter(x => x.s && !x.s.sittingOut);
}

function bjFindUserSeatIndex(userId) {
  return bjTable.seats.findIndex(s => s && s.userId === userId);
}

function bjClearTimers() {
  Object.keys(bjTable.timers).forEach(k => {
    if (bjTable.timers[k]) { clearTimeout(bjTable.timers[k]); bjTable.timers[k] = null; }
  });
}

function bjBroadcastState() {
  bjTable.seats.forEach(s => {
    if (!s) return;
    const sockets = userSockets.get(s.userId);
    if (!sockets) return;
    sockets.forEach(sockId => io.to(sockId).emit("bjState", bjBuildStateFor(s.userId)));
  });
  const seatedIds = new Set(bjTable.seats.filter(Boolean).map(s => s.userId));
  userSockets.forEach((sockets, userId) => {
    if (seatedIds.has(userId)) return;
    sockets.forEach(sockId => io.to(sockId).emit("bjSpectatorState", bjBuildStateFor(userId)));
  });
}

function bjBuildStateFor(viewerUserId) {
  return {
    stage: bjTable.stage,
    handNumber: bjTable.handNumber,
    minBet: BJ_MIN_BET,
    maxBet: BJ_MAX_BET_CHIPS,
    dealerHand: bjTable.dealerHoleHidden && bjTable.dealerHand.length
      ? [bjTable.dealerHand[0], null]
      : bjTable.dealerHand,
    dealerHoleHidden: bjTable.dealerHoleHidden,
    currentTurnIndex: bjTable.currentTurnIndex,
    bettingMsLeft: bjTable.stage === "betting" ? Math.max(0, bjTable.bettingDeadline - Date.now()) : 0,
    turnMsLeft: bjTable.stage === "playing" ? Math.max(0, bjTable.turnDeadline - Date.now()) : 0,
    yourBalance: viewerUserId ? getChipBalance(viewerUserId) : null,
    yourSeatIndex: viewerUserId ? bjFindUserSeatIndex(viewerUserId) : -1,
    seats: bjTable.seats.map((s, i) => {
      if (!s) return null;
      return {
        userId: s.userId,
        username: s.username,
        avatar: s.avatar,
        chips: s.chips,
        bet: s.bet,
        hand: s.hand,
        done: s.done,
        busted: s.busted,
        doubled: s.doubled,
        sittingOut: s.sittingOut,
        seatIndex: i,
        isTurn: i === bjTable.currentTurnIndex,
        result: s.result || null
      };
    })
  };
}

function bjMaybeStartBettingRound() {
  if (bjTable.stage !== "waiting") return;
  const occ = bjOccupiedSeats();
  if (occ.length === 0) return;

  bjTable.handNumber++;
  bjTable.stage = "betting";
  bjTable.bettingDeadline = Date.now() + BJ_BETTING_WINDOW_MS;
  bjTable.seats.forEach(s => {
    if (!s) return;
    s.bet = 0;
    s.hand = [];
    s.done = false;
    s.busted = false;
    s.doubled = false;
    s.result = null;
  });

  bjClearTimers();
  bjTable.timers.betting = setTimeout(bjLockBetsAndDeal, BJ_BETTING_WINDOW_MS);
  bjBroadcastState();
}

function bjLockBetsAndDeal() {
  bjClearTimers();
  const bettors = bjOccupiedSeats().filter(({ s }) => s.bet > 0);
  if (bettors.length === 0) {
    bjTable.stage = "waiting";
    bjBroadcastState();
    return;
  }

  bjTable.deck = bjFreshDeck();
  bjTable.dealerHand = [];
  bjTable.dealerHoleHidden = true;
  bjTable.stage = "playing";

  bettors.forEach(({ s }) => { s.hand = [bjTable.deck.pop(), bjTable.deck.pop()]; });
  bjTable.dealerHand.push(bjTable.deck.pop(), bjTable.deck.pop());

 
  bjOccupiedSeats().forEach(({ s }) => { if (s.bet <= 0) s.done = true; });

  bjTable.currentTurnIndex = bjNextToAct(-1);
  if (bjTable.currentTurnIndex === -1) {
    bjResolveTable();
    return;
  }
  bjStartTurnTimer();
  bjBroadcastState();
}

function bjNextToAct(fromIndex) {
  let idx = fromIndex;
  for (let n = 0; n < BJ_SEATS; n++) {
    idx = (idx + 1) % BJ_SEATS;
    const s = bjTable.seats[idx];
    if (s && !s.sittingOut && s.bet > 0 && !s.done) return idx;
  }
  return -1;
}

function bjStartTurnTimer() {
  if (bjTable.timers.turn) clearTimeout(bjTable.timers.turn);
  bjTable.turnDeadline = Date.now() + BJ_TURN_TIMEOUT_MS;
  bjTable.timers.turn = setTimeout(() => {
  
    const idx = bjTable.currentTurnIndex;
    const s = bjTable.seats[idx];
    if (s) s.done = true;
    bjAdvanceTurn(idx);
  }, BJ_TURN_TIMEOUT_MS);
}

function bjAdvanceTurn(actedIndex) {
  const next = bjNextToAct(actedIndex);
  if (next === -1) {
    bjResolveTable();
    return;
  }
  bjTable.currentTurnIndex = next;
  bjStartTurnTimer();
  bjBroadcastState();
}

function bjResolveTable() {
  bjClearTimers();
  bjTable.stage = "dealer";
  bjTable.currentTurnIndex = -1;
  bjTable.dealerHoleHidden = false;

  const active = bjOccupiedSeats().filter(({ s }) => s.bet > 0 && !s.busted);
  if (active.length > 0) {
    while (bjHandTotal(bjTable.dealerHand) < 17) {
      bjTable.dealerHand.push(bjTable.deck.pop());
    }
  }

  const dealerTotal = bjHandTotal(bjTable.dealerHand);
  const dealerBJ = bjIsBlackjack(bjTable.dealerHand);

  bjOccupiedSeats().forEach(({ s }) => {
  if (s.bet <= 0) return;
  const total = bjHandTotal(s.hand);
  const playerBJ = bjIsBlackjack(s.hand);
  let type, text, payoutChips; 

  if (total > 21) {
    type = "lose"; text = "Bust"; payoutChips = 0;
  } else if (playerBJ && !dealerBJ) {
    type = "win"; text = `Blackjack! +${Math.floor(s.bet * 1.5)}`; payoutChips = s.bet + Math.floor(s.bet * 1.5);
  } else if (dealerBJ && !playerBJ) {
    type = "lose"; text = "Dealer Blackjack"; payoutChips = 0;
  } else if (dealerTotal > 21 || total > dealerTotal) {
    type = "win"; text = `Win +${s.bet}`; payoutChips = s.bet * 2;
  } else if (total === dealerTotal) {
    type = "push"; text = "Push"; payoutChips = s.bet;
  } else {
    type = "lose"; text = "Lose"; payoutChips = 0;
  }

  s.result = { type, text };
  const netChipsChange = payoutChips - s.bet; 
  if (netChipsChange !== 0) {
    adjustUserXp(s.userId, netChipsChange * BJ_XP_PER_CHIP);
  }
});

  bjTable.stage = "results";
  bjBroadcastState();

  bjTable.timers.results = setTimeout(() => {
    bjTable.seats.forEach(s => { if (s) { s.bet = 0; s.hand = []; s.result = null; } });
    bjTable.stage = "waiting";
    bjBroadcastState();
    bjMaybeStartBettingRound();
  }, BJ_RESULT_DISPLAY_MS);
}

function getChipBalance(userId) {
  const user = allUsers.get(userId);
  const xp = user?.xp || 0;
  return Math.floor(xp / BJ_XP_PER_CHIP);
}
 
function msMultiplierForReveal(safeRevealedCount, mines) {
  const total = MS_TILE_COUNT;
  let mult = 1;
  for (let i = 0; i < safeRevealedCount; i++) {
    const tilesLeft = total - i;
    const safeLeft = (total - mines) - i;
    mult *= tilesLeft / safeLeft;
  }
  return mult * 0.97;
}
 
function msGenerateMines(mineCount) {
  const indexes = Array.from({ length: MS_TILE_COUNT }, (_, i) => i);
  const mines = new Set();
  while (mines.size < mineCount) {
    const pick = indexes[crypto.randomInt(indexes.length)];
    mines.add(pick);
  }
  return mines;
}
 
function msEmitState(userId, socket) {
  const session = msSessions.get(userId);
  if (!session || !session.active) {
    socket.emit("minesweeperState", { balance: getChipBalance(userId), active: false });
    return;
  }
  const balance = session.useBonus ? getBonusBalance(userId) : getChipBalance(userId);
  socket.emit("minesweeperState", {
    balance,
    active: true,
    account: session.useBonus ? "bonus" : "normal",
    betChips: session.betChips,
    mines: session.mineCount,
    multiplier: msMultiplierForReveal(session.revealed.size, session.mineCount),
    revealedIndexes: Array.from(session.revealed)
  });
}
 

 function ensureBonusFields(user) {
  if (user.bonusXp === undefined) user.bonusXp = 0;
  if (user.bonusWagerRequired === undefined) user.bonusWagerRequired = 0;
  if (user.bonusWagered === undefined) user.bonusWagered = 0;
  return user;
}

function getBonusBalance(userId) {
  const user = allUsers.get(userId);
  if (!user) return 0;
  ensureBonusFields(user);
  return Math.floor(user.bonusXp / BJ_XP_PER_CHIP);
}

function getBonusState(userId) {
  const user = allUsers.get(userId);
  if (!user) return { bonusXp: 0, bonusChips: 0, wagered: 0, required: 0, claimable: false };
  ensureBonusFields(user);


  if (user.bonusXp <= 0) {
    if (user.bonusWagerRequired !== 0 || user.bonusWagered !== 0) {
      user.bonusXp = 0;
      user.bonusWagerRequired = 0;
      user.bonusWagered = 0;
      allUsers.set(userId, user);
      saveUsers();
    }
    return { bonusXp: 0, bonusChips: 0, wagered: 0, required: 0, claimable: false };
  }

  const bonusChips = Math.floor(user.bonusXp / BJ_XP_PER_CHIP);
  const remainingUnwagered = user.bonusWagerRequired - user.bonusWagered;
  const dustLocked = bonusChips === 0 && remainingUnwagered > 0 && remainingUnwagered < BJ_XP_PER_CHIP;

  return {
    bonusXp: user.bonusXp,
    bonusChips,
    wagered: user.bonusWagered,
    required: user.bonusWagerRequired,
   claimable: (user.bonusWagerRequired <= 0 || user.bonusWagered >= user.bonusWagerRequired) || dustLocked
  };
}

function addBonusXp(userId, amount) {
  if (!userId || amount <= 0) return;
  let user = allUsers.get(userId);
  if (!user) return;
  ensureBonusFields(user);
  user.bonusXp += amount;
  user.bonusWagerRequired += amount;
  allUsers.set(userId, user);
  saveUsers();
  emitToUser(userId, "bonusUpdate", getBonusState(userId));
}

function placeBonusBet(userId, chipAmount) {
  const user = allUsers.get(userId);
  if (!user) return false;
  ensureBonusFields(user);
  const xpAmount = chipAmount * BJ_XP_PER_CHIP;
  if (user.bonusXp < xpAmount) return false;
  user.bonusXp -= xpAmount;
  user.bonusWagered += xpAmount;
  allUsers.set(userId, user);
  saveUsers();
  emitToUser(userId, "bonusUpdate", getBonusState(userId));
  return true;
}

function creditBonusWin(userId, chipAmount) {
  if (chipAmount <= 0) return;
  const user = allUsers.get(userId);
  if (!user) return;
  ensureBonusFields(user);
  user.bonusXp += chipAmount * BJ_XP_PER_CHIP;
  allUsers.set(userId, user);
  saveUsers();
  emitToUser(userId, "bonusUpdate", getBonusState(userId));
}

function claimBonus(userId) {
  const user = allUsers.get(userId);
  if (!user) return { success: false, msg: "User not found." };
  ensureBonusFields(user);
  const state = getBonusState(userId);
  if (!state.claimable) return { success: false, msg: "You haven't wagered enough of your bonus yet." };

  const amountToClaim = user.bonusXp;
  user.bonusXp = 0;
  user.bonusWagerRequired = 0;
  user.bonusWagered = 0;
  allUsers.set(userId, user);
  saveUsers();

  addServerXP(userId, amountToClaim);
  emitToUser(userId, "bonusUpdate", getBonusState(userId));
  return { success: true, claimedXp: amountToClaim };
}

function adjustUserXp(userId, deltaXp) {
  const user = allUsers.get(userId);
  if (!user) return;
 
  user.xp = Math.max(0, (user.xp || 0) + deltaXp);
 
  let level = 1;
  let xpRequired = 0;
  while (user.xp >= xpRequired + getXpForLevel(level)) {
    xpRequired += getXpForLevel(level);
    level++;
  }
  user.level = level;
 
  allUsers.set(userId, user);
  saveUsers();
 
  const online = onlineUsers.get(userId);
  if (online) {
    online.xp = user.xp;
    online.level = user.level;
  }
 
  io.emit("userData", { id: userId, xp: user.xp, level: user.level });
}


const PEPE_LEADERBOARD_FILE = path.join(__dirname, "./data/pepeLeaderboard.json");
const PEPE_LEADERBOARD_TOP_N = 10;
let pepeLeaderboard = new Map(); 
 
function pepeLoadLeaderboard() {
  if (fs.existsSync(PEPE_LEADERBOARD_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(PEPE_LEADERBOARD_FILE, "utf8"));
      pepeLeaderboard = new Map(Object.entries(data));
      console.log(`✅ Loaded pepe runner leaderboard (${pepeLeaderboard.size} players)`);
    } catch (e) {
      console.error("❌ pepeLeaderboard.json load failed", e);
    }
  }
}
function pepeSaveLeaderboard() {
  try {
    fs.writeFileSync(PEPE_LEADERBOARD_FILE, JSON.stringify(Object.fromEntries(pepeLeaderboard), null, 2));
  } catch (e) {
    console.error("❌ Failed to save pepeLeaderboard.json:", e);
  }
}
pepeLoadLeaderboard();
 

function pepeRecordScore(userId, score) {
  const current = pepeLeaderboard.get(userId) || 0;
  if (score > current) {
    pepeLeaderboard.set(userId, score);
    pepeSaveLeaderboard();
    return true;
  }
  return false;
}
 
function pepeBuildLeaderboardPayload() {
  const entries = Array.from(pepeLeaderboard.entries())
    .map(([userId, score]) => {
      const online = onlineUsers.get(userId);
      const db = allUsers.get(userId);
      return {
        userId,
        username: online?.username || db?.username || "Unknown",
        avatar: online?.avatar || db?.avatar || "/avatars/default1.png",
        score
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, PEPE_LEADERBOARD_TOP_N);
  return { leaders: entries };
}
function pepeBroadcastLeaderboard() {
  io.emit("pepeLeaderboardState", pepeBuildLeaderboardPayload());
}
 



let apiHitsToday = 0;
let hourlyCounts = [];
let lastHourLogged = -1;
let lastDayLogged = -1;

async function checkLiveStreams() {
  const now = Date.now();
  const currentHour = new Date(now).getHours();
  const currentDay = new Date(now).getDate();
  if (currentDay !== lastDayLogged) {
    if (lastDayLogged !== -1) {
      console.log(`\n📅 --- END OF DAY (${lastDayLogged}) ---`);
      console.log(`📊 TOTAL API CALLS YESTERDAY: ${apiHitsToday}`);
    }
    apiHitsToday = 0;
    hourlyCounts = [];
    lastDayLogged = currentDay;
  }

  if (currentHour !== lastHourLogged) {
    if (lastHourLogged !== -1) {
      const hourLabel = `Hour ${lastHourLogged}:00 - ${lastHourLogged}:59`;
      const countInHour = hourlyCounts.find(h => h.hour === lastHourLogged)?.count || 0;
      if (countInHour > 0 || apiHitsToday > 0) {
        console.log(`⏰ --- END OF HOUR ${hourLabel} ---`);
        console.log(`📊 API Calls this hour: ${countInHour}`);
        console.log(`📊 Running Total (Today): ${apiHitsToday}`);
      }
    }
    lastHourLogged = currentHour;
    hourlyCounts.push({ hour: currentHour, count: 0 });
  }

  apiHitsToday++;
  const currentHourEntry = hourlyCounts.find(h => h.hour === currentHour);
  if (currentHourEntry) {
    currentHourEntry.count++;
  }

  try {
    let currentConfig = streamersConfig;
    try {
      const fresh = fs.readFileSync(STREAMERS_CONFIG_PATH, 'utf8');
      currentConfig = JSON.parse(fresh);
    } catch (e) { console.warn("⚠️ Config reload failed, using old data"); }

    const prevKickList = streamersConfig?.kick
  ? streamersConfig.kick.map(k => typeof k === 'string' ? k : k.slug).sort().join(',')
  : '';
    const prevYtList = streamersConfig?.youtube ? [...streamersConfig.youtube].sort().join(',') : '';
    const currKickList = currentConfig?.kick
  ? currentConfig.kick.map(k => typeof k === 'string' ? k : k.slug).sort().join(',')
  : '';
    const currYtList = currentConfig?.youtube ? [...currentConfig.youtube].sort().join(',') : '';
    const configChanged = (prevKickList !== currKickList) || (prevYtList !== currYtList);

    if (configChanged) {
      console.log("🔄 Streamer CONFIG changed! Will force broadcast at end of check.");
    }

    streamersConfig = currentConfig;

    const liveStreamers = [];
    let kickCheckSucceeded = false;
    let ytCheckSucceeded = false;

    function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

const KICK_ACCESS_TOKEN = loadTokenFromFile();
if (KICK_ACCESS_TOKEN) {
  try {
    const allSlugs = streamersConfig.kick.map(k => (typeof k === 'string' ? k : k.slug));
    const slugChunks = chunkArray(allSlugs, 50);

    const list = [];
    let anyChunkFailed = false;

for (const chunk of slugChunks) {
  const slugsParam = chunk.map(s => `slug=${encodeURIComponent(s)}`).join('&');
  const url = `https://api.kick.com/public/v1/channels?${slugsParam}`;

  try {
    const resp = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${KICK_ACCESS_TOKEN}`,
        Accept: 'application/json',
      },
      timeout: 10000,
    });

    const chunkList = Array.isArray(resp.data?.data)
      ? resp.data.data
      : (Array.isArray(resp.data) ? resp.data : []);
    list.push(...chunkList);
  } catch (err) {
    anyChunkFailed = true;
    console.error(`❌ Kick API error on chunk [${chunk.slice(0, 3).join(',')}...]:`, {
      message: err.message,
      status: err.response?.status,
      statusText: err.response?.statusText,
      data: err.response?.data,
      code: err.code,
    });
  }
}

    const liveChannels = list.filter(c => Boolean(c?.livestream) || c?.stream?.is_live === true);

    let userProfiles = {};
    if (liveChannels.length > 0) {
      const userIdChunks = chunkArray(liveChannels.map(c => c.broadcaster_user_id), 50);

      for (const idChunk of userIdChunks) {
        try {
          const idsParam = idChunk.map(id => `id=${id}`).join('&');
          const usersResp = await axios.get(`https://api.kick.com/public/v1/users?${idsParam}`, {
            headers: {
              Authorization: `Bearer ${KICK_ACCESS_TOKEN}`,
              Accept: 'application/json',
            },
            timeout: 10000,
          });

          const users = Array.isArray(usersResp.data?.data) ? usersResp.data.data : [];
          users.forEach(u => {
            userProfiles[u.user_id] = u.profile_picture || null;
          });
        } catch (err) {
          console.error('❌ Kick API error:', {
            message: err.message,
            status: err.response?.status,
            statusText: err.response?.statusText,
            data: err.response?.data,
            code: err.code,
          }, '- skipping offline-pruning for Kick this cycle');
          kickCheckSucceeded = false;
        }
      }
    }

    liveChannels.forEach(c => {
      const avatar = userProfiles[c.broadcaster_user_id] || null;
      liveStreamers.push({
        name: c?.slug || 'unknown',
        live: true,
        viewers: parseInt(c?.stream?.viewer_count || 0),
        url: `https://kick.com/${c?.slug || 'unknown'}`,
        title: c?.stream_title || '',
        thumbnail: c?.stream?.thumbnail || '',
        platform: 'kick',
        logo: avatar || null
      });
    });


    kickCheckSucceeded = !anyChunkFailed;

    if (anyChunkFailed) {
      console.warn('⚠️ Kick check had partial failures - skipping offline-pruning for Kick this cycle');
    }

  } catch (err) {
    console.error('❌ Kick API error:', err.message, '- skipping offline-pruning for Kick this cycle');
    kickCheckSucceeded = false; 
  }

} else {
  console.log('⚠️ Kick token not found. Skipping Kick check.');
}

    try {
      const ytStreams = await getYouTubeLiveV2(streamersConfig.youtube);

      ytStreams.forEach(s => {
        liveStreamers.push({
          ...s,
          platform: 'youtube',
          viewers: s.viewerCount ? parseInt(s.viewerCount.replace(/,/g, '')) : 0,
          logo: s.logo || null
        });
      });

      ytCheckSucceeded = true;

    } catch (ytErr) {
      console.error('❌ YouTube check failed:', ytErr.message, '- skipping offline-pruning for YouTube this cycle');
    }

    const currentlyLive = new Set();
    let changesDetected = false;

    liveStreamers.forEach(stream => {
      const streamId = `${stream.platform}-${stream.name}`;
      currentlyLive.add(streamId);

      const wasTracked = trackedStreams.has(streamId);

      if (!wasTracked) {
        console.log(`🔴 NEW LIVE: ${stream.name} on ${stream.platform}`);
        broadcastStreamNotification(stream);
        trackedStreams.set(streamId, {
          name: stream.name,
          title: stream.title || '',
          platform: stream.platform,
          url: stream.url,
          viewers: stream.viewers,
          logo: stream.logo,
          startTime: now
        });
        changesDetected = true;
      } else {
        const existing = trackedStreams.get(streamId);
        if (existing.viewers !== stream.viewers) {
          existing.viewers = stream.viewers;
          changesDetected = true;
        }
      }
    });

    for (const [streamId, streamData] of trackedStreams) {
      const platformSucceeded =
        (streamData.platform === 'kick' && kickCheckSucceeded) ||
        (streamData.platform === 'youtube' && ytCheckSucceeded);

      if (platformSucceeded && !currentlyLive.has(streamId)) {
        console.log(`⚫ OFFLINE: ${streamData.name}`);
        trackedStreams.delete(streamId);
        changesDetected = true;
      }
    }

    if (changesDetected || liveStreamers.length > 0) {
      const sortedStreams = Array.from(trackedStreams.values()).sort((a, b) => b.viewers - a.viewers);
      io.emit("streamsUpdate", { allStreams: sortedStreams });
    }

  } catch (error) {
    console.error('❌ Stream check failed:', error.message);
  }
}

function broadcastStreamNotification(stream) {
  io.emit("streamLive", {
    stream: {
      name: stream.name,
      title: stream.title || '',
      platform: stream.platform,
      url: stream.url,
      viewers: stream.viewers || stream.viewerCount || 0,
      logo: stream.logo || ''
    }
  });
}

if (debugmode === false) {
  checkLiveStreams().then(() => {
  console.log("✅ Initial stream check complete.");
  setInterval(checkLiveStreams, 120000); 
});
}


const ytAvatarCache = new Map();
setInterval(() => {
  ytAvatarCache.clear();
  console.log('🧹 YouTube avatar cache cleared');
}, 6 * 60 * 60 * 1000);

async function getYouTubeChannelAvatar(channelHandle, existingHtml = null) {
  if (ytAvatarCache.has(channelHandle)) return ytAvatarCache.get(channelHandle);

  try {
    const html = existingHtml || (await axios.get(`https://www.youtube.com/@${channelHandle}/live`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.5'
      },
      timeout: 8000
    })).data;

   
    const googleUrls = [...html.matchAll(/"url":"(https?:\/\/yt3\.googleusercontent\.com[^"]+)"/g)].map(m => m[1]);
    const avatar = googleUrls.find(url => !url.includes('fcrop64') && !url.includes('=w')) || null;

    if (avatar) {
      const sized = avatar.replace(/=s\d+-c-k/, '=s256-c-k');
      console.log(`🖼️ Got avatar for ${channelHandle}: ${sized}`);
      ytAvatarCache.set(channelHandle, sized);
      return sized;
    }

  
    const ggphtUrls = [...html.matchAll(/"url":"(https?:\/\/yt3\.ggpht\.com[^"]+)"/g)].map(m => m[1]);
    const ggphtAvatar = ggphtUrls.find(url => !url.includes('fcrop64') && !url.includes('-nd-')) || null;

    if (ggphtAvatar) {
      const sized = ggphtAvatar.replace(/=s\d+-c-k/, '=s256-c-k');
      ytAvatarCache.set(channelHandle, sized);
      return sized;
    }

    console.log(`❌ No avatar found for ${channelHandle}`);
    return null;

  } catch (err) {
    console.error(`❌ Avatar fetch failed for ${channelHandle}:`, err.message);
    return null;
  }
}


app.get("/login", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Anon Chat - Login</title>
      <meta charset="UTF-8">
      <link rel="icon" type="image/svg+xml" href="/r00ted.svg">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

        body {
          margin: 0;
          font-family: 'Inter', system-ui, sans-serif;
          background: #202225 url('${serverConfig.public.loginImageUrl}') center/cover no-repeat fixed;
          color: #dcddde;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
        }

        .login-container {
          background: #2b2d31;
          width: 380px;
          padding: 50px 197px;
          border-radius: 16px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
          text-align: center;
          border: 1px solid #40444b;
        }

        .logo {
          font-size: 28px;
          font-weight: 600;
          margin-bottom: 8px;
          color: #fff;
          letter-spacing: -0.5px;
        }

        .subtitle {
          color: #b9bbbe;
          font-size: 15px;
          margin-bottom: 35px;
        }

        .input-group {
          position: relative;
          margin-bottom: 25px;
        }

        input {
          width: 100%;
          padding: 14px 16px;
          background: #40444b;
          border: 1px solid #40444b;
          border-radius: 8px;
          color: white;
          font-size: 16px;
          transition: all 0.2s;
          box-sizing: border-box;
        }

        input:focus {
          outline: none;
          border-color: #FF0000;
          box-shadow: 0 0 0 3px rgba(255,0,0,0.3);
        }

        button {
          width: 100%;
          padding: 14px;
          background: #FF0000;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
          margin-top: 10px;
          box-sizing: border-box;
        }

        button:hover {
          background: #cc0000;
        }

        .error {
          color: #ed4245;
          font-size: 14px;
          margin-top: 15px;
          min-height: 20px;
        }

        .footer {
          margin-top: 30px;
          color: #72767d;
          font-size: 13px;
        }
      </style>
    </head>
    <body>
      <div class="login-container">
        <div class="logo">R00TED</div>
        <p class="subtitle">Private Anonymous Chat</p>

        <div class="input-group">
          <input type="password" id="passwordInput" placeholder="Enter password" required autofocus>
        </div>

        <button type="button" id="loginBtn">Join Chat</button>

        <p class="error" id="loginError"></p>

        <div class="footer">
          Protected access • Only authorized users
        </div>
      </div>

      <script>
       document.getElementById("loginBtn").addEventListener("click", async () => {
  const password = document.getElementById("passwordInput").value;
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
  const data = await res.json();
  if (data.success) {
    localStorage.setItem("chatToken", data.token);
    window.location.href = "/";
  } else {
    document.getElementById("loginError").textContent = data.error;
  }
});

document.getElementById("passwordInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("loginBtn").click();
});
      </script>
    </body>
    </html>
  `);
});


app.get('/api/kick-chatroom/:slug', (req, res) => {
  const entry = (streamersConfig.kick || []).find(k => (typeof k === 'string' ? k : k.slug) === req.params.slug);
  const chatroomId = entry && typeof entry === 'object' ? entry.chatroomId : null;
  if (!chatroomId) return res.status(404).json({ error: 'No chatroomId configured' });
  res.json({ chatroomId });
});

const MUSIC_ROOT = path.resolve(path.join(__dirname, "public", "music"));
 
const AUDIO_EXTS = [".mp3", ".flac", ".wav", ".ogg", ".m4a", ".aac", ".opus"];
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"];
const VIDEO_ART_EXTS = [".mp4"];
function safeMusicPath(subPath = "") {
  const cleaned = String(subPath || "").replace(/\\/g, "/").replace(/\.\.+/g, "");
  const resolved = path.resolve(path.join(MUSIC_ROOT, cleaned));
  const rootResolved = path.resolve(MUSIC_ROOT);

  if (resolved !== rootResolved && !resolved.startsWith(rootResolved + path.sep)) {
    return rootResolved;
  }
  return resolved;
}


const RADIO_MAX_REDIRECTS = 5;
const RADIO_FETCH_TIMEOUT = 15000;

function isPrivateOrLocalHost(hostname) {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local")) return true;
  const ipMatch = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipMatch) {
    const [a, b] = ipMatch.slice(1).map(Number);
    if (a === 127) return true;                     
    if (a === 10) return true;                       
    if (a === 172 && b >= 16 && b <= 31) return true;  
    if (a === 192 && b === 168) return true;          
    if (a === 169 && b === 254) return true;           
    if (a === 0) return true;
  }
  if (h === "::1") return true;
  return false;
}


const radioProxyActive = new Map();
const RADIO_PROXY_MAX_PER_IP = 4;

app.get("/api/radio/proxy", async (req, res) => {
  if (req.query.token !== CHAT_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const target = req.query.url;
  if (!target || typeof target !== "string") {
    return res.status(400).json({ error: "Missing url" });
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch (e) {
    return res.status(400).json({ error: "Invalid URL" });
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return res.status(400).json({ error: "Only http/https URLs are allowed" });
  }
  if (isPrivateOrLocalHost(parsed.hostname)) {
    return res.status(400).json({ error: "That host is not allowed" });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  const activeCount = radioProxyActive.get(ip) || 0;
  if (activeCount >= RADIO_PROXY_MAX_PER_IP) {
    return res.status(429).json({ error: "Too many active radio streams from your connection" });
  }
  radioProxyActive.set(ip, activeCount + 1);

  let upstream;
  const cleanup = () => {
    const c = (radioProxyActive.get(ip) || 1) - 1;
    if (c <= 0) radioProxyActive.delete(ip);
    else radioProxyActive.set(ip, c);
  };

  try {
    upstream = await axios({
      method: "get",
      url: parsed.toString(),
      responseType: "stream",
      maxRedirects: RADIO_MAX_REDIRECTS,
      timeout: RADIO_FETCH_TIMEOUT,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RadioProxy/1.0)",
        "Icy-MetaData": "0",
        ...(req.headers.range ? { Range: req.headers.range } : {})
      },
      validateStatus: () => true
    });
  } catch (err) {
    cleanup();
    console.error("❌ Radio proxy fetch failed:", err.message);
    return res.status(502).json({ error: "Could not reach the radio stream" });
  }

  if (upstream.status >= 400) {
    cleanup();
    return res.status(502).json({ error: `Upstream returned ${upstream.status}` });
  }

  res.status(upstream.status === 206 ? 206 : 200);
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Cache-Control", "no-cache, no-store");
  res.set("Connection", "keep-alive");

  const passthroughHeaders = ["content-type", "content-length", "accept-ranges", "content-range", "icy-name", "icy-genre"];
  passthroughHeaders.forEach(h => {
    if (upstream.headers[h]) res.set(h, upstream.headers[h]);
  });
  if (!upstream.headers["content-type"]) {
    res.set("Content-Type", "audio/mpeg");
  }

  upstream.data.pipe(res);

  const onClose = () => {
    cleanup();
    upstream.data.destroy();
  };
  req.on("close", onClose);
  res.on("close", onClose);
  upstream.data.on("error", (err) => {
    console.error("❌ Radio proxy stream error:", err.message);
    cleanup();
    if (!res.headersSent) res.status(502).end();
    else res.end();
  });
});
 
app.get("/api/music/browse", requireAuth, (req, res) => {
  const reqPath = req.query.path || "";
  const dirPath = safeMusicPath(reqPath);

  fs.readdir(dirPath, { withFileTypes: true }, (err, entries) => {
    if (err) return res.status(404).json({ error: "Folder not found" });

    const folders = [];
    const filesInDir = [];

    entries.forEach(entry => {
      if (entry.name.startsWith(".")) return;
      if (entry.isDirectory()) {
        folders.push(entry.name);
      } else {
        filesInDir.push(entry.name);
      }
    });

   const tracks = filesInDir
  .filter(name => AUDIO_EXTS.includes(path.extname(name).toLowerCase()))
  .map(name => {
    const base = name.replace(/\.[^/.]+$/, "");
    const artFile = filesInDir.find(f => {
      const fExt = path.extname(f).toLowerCase();
      return IMAGE_EXTS.includes(fExt) && f.replace(/\.[^/.]+$/, "") === base;
    });
   
    const videoFile = filesInDir.find(f => {
      const fExt = path.extname(f).toLowerCase();
      return VIDEO_ART_EXTS.includes(fExt) && f.replace(/\.[^/.]+$/, "") === base;
    });

    const relDir = reqPath ? reqPath.replace(/\\/g, "/").replace(/\/+$/, "") + "/" : "";
    const relPath = `${relDir}${name}`;
    const ext = path.extname(name).toLowerCase();
    let artUrl;
    if (artFile) {
      artUrl = `/music/${encodeURI(relDir + artFile)}`;
    } else if (ext === ".mp3" || ext === ".flac") {
      artUrl = `/api/music/art?path=${encodeURIComponent(relPath)}`;
    } else {
      artUrl = null;
    }

    const videoUrl = videoFile ? `/music/${encodeURI(relDir + videoFile)}` : null;

    let mtime = 0;
    try {
      mtime = fs.statSync(path.join(dirPath, name)).mtimeMs;
    } catch (e) {}

    return {
      name,
      relPath,
      url: `/music/${encodeURI(relDir + name)}`,
      artUrl,
      videoUrl,
      mtime
    };
  });

    folders.sort((a, b) => a.localeCompare(b));
    tracks.sort((a, b) => a.name.localeCompare(b.name));

    res.json({ path: reqPath, folders, tracks });
  });
});

const gamesFilePath = path.join(__dirname, 'games.json');

app.get('/games.json', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(gamesFilePath, 'utf8'));
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'failed to load games.json' });
  }
});


const MUSIC_SEARCH_MAX_RESULTS = 200;
const MUSIC_SEARCH_MAX_FILES_SCANNED = 20000;

function walkMusicDir(absDir, relDir, query, results, scannedCounter) {
  if (results.length >= MUSIC_SEARCH_MAX_RESULTS) return;
  if (scannedCounter.count >= MUSIC_SEARCH_MAX_FILES_SCANNED) return;

  let entries;
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch (e) {
    return;
  }

  const filesInDir = entries.filter(e => !e.isDirectory() && !e.name.startsWith(".")).map(e => e.name);
  const subDirs = entries.filter(e => e.isDirectory() && !e.name.startsWith("."));

  if (!relDir) {
  }

  for (const name of filesInDir) {
    scannedCounter.count++;
    if (scannedCounter.count > MUSIC_SEARCH_MAX_FILES_SCANNED) return;
    if (!AUDIO_EXTS.includes(path.extname(name).toLowerCase())) continue;
    if (!name.toLowerCase().includes(query)) continue;

    const base = name.replace(/\.[^/.]+$/, "");
    const artFile = filesInDir.find(f => {
      const fExt = path.extname(f).toLowerCase();
      return IMAGE_EXTS.includes(fExt) && f.replace(/\.[^/.]+$/, "") === base;
    });
  
    const videoFile = filesInDir.find(f => {
      const fExt = path.extname(f).toLowerCase();
      return VIDEO_ART_EXTS.includes(fExt) && f.replace(/\.[^/.]+$/, "") === base;
    });

    const relPath = relDir ? `${relDir}/${name}` : name;
    const ext = path.extname(name).toLowerCase();
    let artUrl;
    if (artFile) {
      artUrl = `/music/${encodeURI((relDir ? relDir + "/" : "") + artFile)}`;
    } else if (ext === ".mp3" || ext === ".flac") {
      artUrl = `/api/music/art?path=${encodeURIComponent(relPath)}`;
    } else {
      artUrl = null;
    }


    const videoUrl = videoFile ? `/music/${encodeURI((relDir ? relDir + "/" : "") + videoFile)}` : null;

    let mtime = 0;
    try {
      mtime = fs.statSync(path.join(absDir, name)).mtimeMs;
    } catch (e) {}

    results.push({
      name,
      relPath,
      dir: relDir,
      url: `/music/${encodeURI(relPath)}`,
      artUrl,
      videoUrl,
      mtime
    });

    if (results.length >= MUSIC_SEARCH_MAX_RESULTS) return;
  }

for (const d of subDirs) {
    const nextRel = relDir ? `${relDir}/${d.name}` : d.name;
    walkMusicDir(path.join(absDir, d.name), nextRel, query, results, scannedCounter);
    if (results.length >= MUSIC_SEARCH_MAX_RESULTS) return;
  }
}

app.get("/api/music/search", requireAuth, (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  if (!q) return res.json({ query: "", results: [] });

  const results = [];
  const scannedCounter = { count: 0 };
  walkMusicDir(MUSIC_ROOT, "", q, results, scannedCounter);

  res.json({ query: q, results, truncated: results.length >= MUSIC_SEARCH_MAX_RESULTS });
});


const PLAYLISTS_FILE = path.join(__dirname, "./data/playlists.json");
 
function loadPlaylistsFromDisk() {
  if (fs.existsSync(PLAYLISTS_FILE)) {
    try { return JSON.parse(fs.readFileSync(PLAYLISTS_FILE, "utf8")); }
    catch (e) { console.error("❌ playlists.json load failed", e); }
  }
  return {};
}


const ROLES_FILE = path.join(__dirname, "./data/roles.json");

function loadRoles() {
  if (fs.existsSync(ROLES_FILE)) {
    try { return JSON.parse(fs.readFileSync(ROLES_FILE, "utf8")); }
    catch (e) { console.error("❌ roles.json load failed", e); }
  }
  return [];
}
function saveRoles(roles) {
  fs.writeFileSync(ROLES_FILE, JSON.stringify(roles, null, 2));
}
let customRoles = loadRoles();
 
function savePlaylistsToDisk(playlists) {
  try {
    fs.writeFileSync(PLAYLISTS_FILE, JSON.stringify(playlists, null, 2));
  } catch (err) {
    console.error("❌ Failed to save playlists.json:", err);
  }
}
 
let savedPlaylists = loadPlaylistsFromDisk();
 

app.get("/api/music/playlists", requireAuth, (req, res) => {
  res.json({ playlists: savedPlaylists });
});
 
app.post("/api/music/playlists", express.json(), requireAuth, (req, res) => {
  const { name, tracks, createdBy, userId } = req.body || {};
  const cleanName = (typeof name === "string" ? name.trim() : "").slice(0, 60);
  if (["__proto__", "constructor", "prototype"].includes(cleanName)) {
    return res.status(400).json({ error: "Invalid playlist name" });
  }
  if (!cleanName) return res.status(400).json({ error: "Playlist name is required" });
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return res.status(400).json({ error: "Playlist must contain at least one track" });
  }

  const requester = userId ? allUsers.get(userId) : null;
  const isPrivileged = !!(requester && (requester.isAdmin || requester.isDeveloper));

  const existing = savedPlaylists[cleanName];
  if (existing && existing.ownerId && existing.ownerId !== userId && !isPrivileged) {
    return res.status(409).json({ error: `A playlist named "${cleanName}" already exists and belongs to someone else. Choose a different name.` });
  }

  const cleanTracks = tracks.map(t => {
    if (!t) return null;
    if (t.type === "radio") {
      if (typeof t.rawUrl !== "string") return null;
      let parsed;
      try {
        parsed = new URL(t.rawUrl);
        if (!["http:", "https:"].includes(parsed.protocol)) return null;
      } catch (e) { return null; }
      return {
        type: "radio",
        name: String(t.name || "Live Radio Stream").slice(0, 200),
        rawUrl: String(t.rawUrl).slice(0, 1000)
      };
    }
    if (typeof t.relPath === "string" && typeof t.url === "string") {
      return {
        type: "server",
        name: String(t.name || "").slice(0, 200),
        relPath: String(t.relPath).slice(0, 500),
        url: String(t.url).slice(0, 500),
        artUrl: t.artUrl ? String(t.artUrl).slice(0, 500) : null,
        videoUrl: t.videoUrl ? String(t.videoUrl).slice(0, 500) : null
      };
    }
    return null;
  }).filter(Boolean);

  if (cleanTracks.length === 0) {
    return res.status(400).json({ error: "No valid tracks provided" });
  }

  savedPlaylists[cleanName] = {
    createdAt: existing?.createdAt || Date.now(),
    createdBy: sanitizeString(String(requester?.username || createdBy || "Unknown"), 32),
    ownerId: userId || existing?.ownerId || null,
    tracks: cleanTracks
  };
  savePlaylistsToDisk(savedPlaylists);

  io.emit("playlistsUpdated", { playlists: savedPlaylists });
  res.json({ success: true, name: cleanName, playlist: savedPlaylists[cleanName] });
});
 

app.delete("/api/music/playlists/:name", express.json(), requireAuth, (req, res) => {
  const { userId } = req.body || {};
  const requester = userId ? allUsers.get(userId) : null;
  const isPrivileged = !!(requester && (requester.isAdmin || requester.isDeveloper));

  if (!isPrivileged) {
    return res.status(403).json({ error: "Only admins or developers can delete playlists." });
  }

  const name = decodeURIComponent(req.params.name || "");
  if (!savedPlaylists[name]) return res.status(404).json({ error: "Playlist not found" });
  delete savedPlaylists[name];
  savePlaylistsToDisk(savedPlaylists);
  io.emit("playlistsUpdated", { playlists: savedPlaylists });
  res.json({ success: true });
});



const embeddedArtCache = new Map(); 
const EMBEDDED_ART_CACHE_TTL = 60 * 60 * 1000; 

function cacheGetArt(key) {
  const entry = embeddedArtCache.get(key);
  if (!entry) return undefined; 
  if (Date.now() > entry.expiresAt) {
    embeddedArtCache.delete(key);
    return undefined;
  }
  return entry.value;
}
function cacheSetArt(key, value) {
  embeddedArtCache.set(key, { value, expiresAt: Date.now() + EMBEDDED_ART_CACHE_TTL });
}

async function readFileSlice(fh, start, length) {
  const buf = Buffer.alloc(length);
  const { bytesRead } = await fh.read(buf, 0, length, start);
  return buf.subarray(0, bytesRead);
}
function isGameBanned(userId) {
  const user = allUsers.get(userId);
  return !!(user && user.weedGameBanned);
}

async function extractID3ArtNode(absPath) {
  let fh;
  try {
    fh = await fs.promises.open(absPath, "r");
    const head = await readFileSlice(fh, 0, 10);
    if (head.length < 10 || head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return null;
    const ver = head[3];
    const size =
      ((head[6] & 0x7f) << 21) | ((head[7] & 0x7f) << 14) |
      ((head[8] & 0x7f) << 7) | (head[9] & 0x7f);
    const data = await readFileSlice(fh, 10, size);
    let offset = 0;
    const frameHeaderSize = ver >= 3 ? 10 : 6;

    while (offset < data.length - frameHeaderSize) {
      let frameId, frameSize;
      if (ver >= 3) {
        frameId = data.toString("latin1", offset, offset + 4);
        frameSize = ver === 4
          ? ((data[offset+4]&0x7f)<<21)|((data[offset+5]&0x7f)<<14)|((data[offset+6]&0x7f)<<7)|(data[offset+7]&0x7f)
          : (data[offset+4]<<24)|(data[offset+5]<<16)|(data[offset+6]<<8)|data[offset+7];
        offset += 10;
      } else {
        frameId = data.toString("latin1", offset, offset + 3);
        frameSize = (data[offset+3]<<16)|(data[offset+4]<<8)|data[offset+5];
        offset += 6;
      }
      if (frameSize <= 0 || offset + frameSize > data.length) break;

      if (frameId === "APIC" || frameId === "PIC") {
        const frameData = data.subarray(offset, offset + frameSize);
        let p = 1;
        let mime = "image/jpeg";
        if (frameId === "APIC") {
          let mimeEnd = p;
          while (frameData[mimeEnd] !== 0 && mimeEnd < frameData.length) mimeEnd++;
          mime = frameData.toString("latin1", p, mimeEnd) || "image/jpeg";
          p = mimeEnd + 1;
        } else {
          const fmt = frameData.toString("latin1", p, p + 3);
          mime = fmt.toUpperCase() === "PNG" ? "image/png" : "image/jpeg";
          p += 3;
        }
        p += 1;
        while (frameData[p] !== 0 && p < frameData.length) p++;
        p += 1;
        const imgBytes = frameData.subarray(p);
        if (imgBytes.length === 0) return null;
        return { buffer: Buffer.from(imgBytes), mime };
      }
      offset += frameSize;
    }
    return null;
  } catch (e) {
    return null;
  } finally {
    if (fh) await fh.close().catch(() => {});
  }
}


async function extractFlacArtNode(absPath) {
  let fh;
  try {
    fh = await fs.promises.open(absPath, "r");
    const CHUNK = 2 * 1024 * 1024;
    const data = await readFileSlice(fh, 0, CHUNK);
    if (data.length < 4 || data.toString("latin1", 0, 4) !== "fLaC") return null;
    let offset = 4;
    while (offset < data.length) {
      const blockHeader = data[offset];
      const isLast = (blockHeader & 0x80) !== 0;
      const blockType = blockHeader & 0x7f;
      const blockSize = (data[offset+1]<<16)|(data[offset+2]<<8)|data[offset+3];
      offset += 4;
      if (blockType === 6) { 
        const block = data.subarray(offset, offset + blockSize);
        let p = 4; 
        const mimeLen = (block[p]<<24)|(block[p+1]<<16)|(block[p+2]<<8)|block[p+3]; p += 4;
        const mime = block.toString("latin1", p, p + mimeLen); p += mimeLen;
        const descLen = (block[p]<<24)|(block[p+1]<<16)|(block[p+2]<<8)|block[p+3]; p += 4 + descLen;
        p += 16; 
        const dataLen = (block[p]<<24)|(block[p+1]<<16)|(block[p+2]<<8)|block[p+3]; p += 4;
        const imgBytes = block.subarray(p, p + dataLen);
        if (imgBytes.length === 0) return null;
        return { buffer: Buffer.from(imgBytes), mime: mime || "image/jpeg" };
      }
      offset += blockSize;
      if (isLast) break;
    }
    return null;
  } catch (e) {
    return null;
  } finally {
    if (fh) await fh.close().catch(() => {});
  }
}

async function getEmbeddedArt(relPath, absPath) {
  const cached = cacheGetArt(relPath);
  if (cached !== undefined) return cached;

  const ext = path.extname(absPath).toLowerCase();
  let art = null;
  if (ext === ".mp3") art = await extractID3ArtNode(absPath);
  else if (ext === ".flac") art = await extractFlacArtNode(absPath);

  cacheSetArt(relPath, art);
  return art;
}


app.get("/api/music/art", async (req, res) => {
  const reqPath = req.query.path || "";
  if (!reqPath) return res.status(400).end();
  const absPath = safeMusicPath(reqPath);

  const art = await getEmbeddedArt(reqPath, absPath);
  if (!art) return res.status(404).end();

  res.set("Content-Type", art.mime || "image/jpeg");
  res.set("Cache-Control", "public, max-age=3600");
  res.send(art.buffer);
});


let voiceRooms = new Map();

app.use(express.json());

app.post("/api/login", express.json(), (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  const now = Date.now();
  
  const attempts = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  
  if (attempts.lockedUntil > now) {
    const minutesLeft = Math.ceil((attempts.lockedUntil - now) / 60000);
    return res.status(429).json({ success: false, error: `Too many attempts. Try again at some point or don't` });
  }

  if (attempts.lockedUntil !== 0 && attempts.lockedUntil <= now) {
    loginAttempts.delete(ip);
    attempts.count = 0;
    attempts.lockedUntil = 0;
  }

  const password = req.body.password;
  if (password === CHAT_PASSWORD) {
    loginAttempts.delete(ip);
    return res.json({ success: true, token: CHAT_PASSWORD });
  }

  attempts.count++;
  loginAttempts.set(ip, attempts);

  if (attempts.count >= 3) {
    attempts.lockedUntil = now + (60 * 60 * 1000);
    loginAttempts.set(ip, attempts);
    return res.status(429).json({ success: false, error: "Too many attempts. Locked until i says so :)." });
  }

  const remaining = 3 - attempts.count;
  return res.status(401).json({ 
    success: false, 
    error: `Incorrect password. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
  });
});
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (token !== CHAT_PASSWORD) return res.status(401).json({ error: "Unauthorized" });
  next();
}


let whisperGroups = []; 
let groupWhispers = []; 



function getGroupMembersPayload(group) {
  return group.memberIds.map(id => {
    const dbUser = allUsers.get(id);
    const onlineUser = onlineUsers.get(id);
    return {
      userId: id,
      username: onlineUser?.username || dbUser?.username || "Unknown",
      avatar: onlineUser?.avatar || dbUser?.avatar || "/avatars/default1.png"
    };
  });
}


function emitToUser(userId, event, payload) {
  const sockets = userSockets.get(userId);
  console.log(`[emitToUser] ${event} -> ${userId} | found sockets:`, sockets ? [...sockets] : null);
  if (!sockets) return;
  sockets.forEach(sockId => io.to(sockId).emit(event, payload));
}

function requirePageAuth(req, res, next) {
  const token = req.query.token || req.headers['x-auth-token'];
  if (token === CHAT_PASSWORD) return next();
  res.redirect('/login');
}

app.get('/', requirePageAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


app.get('/api/gifs/search', async (req, res) => {
  const query = req.query.q;
  const limit = req.query.limit || 100;

  if (!query) {
    return res.status(400).json({ error: 'Query required' });
  }

  const cacheKey = `search:${query.toLowerCase().trim()}:${limit}`;
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`⚡ Cache hit: "${query}"`);
    return res.json(cached);
  }

  try {
    const response = await fetch(
      `https://api.klipy.co/api/v1/${KLIPY_API_KEY}/gifs/search?q=${encodeURIComponent(query)}&per_page=${limit}&content_filter=high`
    );

    const raw = await response.json();

    const items = raw?.data?.data || raw?.data?.items || [];
    const normalized = items.map(item => ({
      id: item.id,
      images: {
        fixed_height_small: { url: item.file?.sm?.gif?.url || item.file?.md?.gif?.url },
        original: { url: item.file?.hd?.gif?.url || item.file?.md?.gif?.url }
      }
    }));

    const result = { data: normalized };
    setCached(cacheKey, result, GIF_SEARCH_TTL);
    res.json(result);
  } catch (error) {
    console.error('Klipy error:', error);
    res.status(500).json({ error: 'Failed to fetch GIFs' });
  }
});

app.get('/api/gifs/trending', async (req, res) => {
  const limit = req.query.limit || 48;
  const cacheKey = `trending:${limit}`;
  const cached = getCached(cacheKey);
  if (cached) {
    console.log(`⚡ Cache hit: trending`);
    return res.json(cached);
  }

  try {
    const response = await fetch(
      `https://api.klipy.co/api/v1/${KLIPY_API_KEY}/gifs/trending?per_page=${limit}&content_filter=high`
    );

    const raw = await response.json();
    const items = raw?.data?.data || raw?.data?.items || [];
    const normalized = items.map(item => ({
      id: item.id,
      images: {
        fixed_height_small: { url: item.file?.sm?.gif?.url || item.file?.md?.gif?.url },
        original: { url: item.file?.hd?.gif?.url || item.file?.md?.gif?.url }
      }
    }));

    const result = { data: normalized };
    setCached(cacheKey, result, GIF_TRENDING_TTL);
    res.json(result);
  } catch (error) {
    console.error('Klipy error:', error);
    res.status(500).json({ error: 'Failed to fetch GIFs' });
  }
});


const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, "public/avatars/"),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];
    if (!allowed.includes(file.mimetype)) return cb(new Error("Invalid file type"), false);
    cb(null, true);
  }
});

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/"),
    filename: (req, file, cb) => {
      const ext = ALLOWED_UPLOAD_EXT[file.mimetype];
      if (!ext) return cb(new Error("Unsupported file type"), false);
      cb(null, `${crypto.randomUUID()}${ext}`);
    }
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_UPLOAD_EXT[file.mimetype]) return cb(new Error("Invalid file type"), false);
    cb(null, true);
  }
});

app.post("/upload-avatar", requireAuth, avatarUpload.single("avatar"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  res.json({ url: `/avatars/${req.file.filename}` });
});

app.post("/upload-image", requireAuth, upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const isVideo = req.file.mimetype.startsWith("video/");
  const isAudio = req.file.mimetype.startsWith("audio/");
  const isText = req.file.mimetype.startsWith("text/") || req.file.mimetype === "application/json";

  if (isVideo) {
    return res.json({ url: `/uploads/${req.file.filename}`, type: "video" });
  }

  if (isAudio) {
    const safeDisplayName = path.basename(req.file.originalname || "audio")
      .replace(/[\/\\]/g, "")
      .slice(0, 100);
    return res.json({
      url: `/uploads/${req.file.filename}`,
      type: "audio",
      filename: safeDisplayName,
      size: req.file.size
    });
  }

  if (isText) {
    const safeDisplayName = path.basename(req.file.originalname || "file")
      .replace(/[\/\\]/g, "")
      .slice(0, 100);

    return res.json({
      url: `/uploads/${req.file.filename}`,
      type: "file",
      filename: safeDisplayName,
      size: req.file.size
    });
  }

  const ext = path.extname(req.file.filename).toLowerCase(); 
  const gifAllowed = ext === ".gif";

  try {
    if (!gifAllowed) {
      const tempPath = req.file.path + "_tmp";
      await sharp(req.file.path, { limitInputPixels: 25000000 })
        .resize({ width: 2000, fit: 'inside', withoutEnlargement: true })
        .toFile(tempPath);
      await fs.promises.unlink(req.file.path);
      await fs.promises.rename(tempPath, req.file.path);
    }
    res.json({ url: `/uploads/${req.file.filename}` });
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    console.error(err);
    res.status(500).json({ error: "Failed to process image" });
  }
});



io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (token === CHAT_PASSWORD) return next();
  if (token === serverConfig.botPassword) {
    socket.isBotToken = true;
    return next();
  }
  return next(new Error("Invalid or missing token"));
});



const accountCreationAttempts = new Map(); 
const ACCOUNT_CREATION_LIMIT = 2;
const ACCOUNT_CREATION_WINDOW = 60 * 60 * 1000;
const packageJson = require('./package.json');

io.on("connection", (socket) => {
  socket.emit('serverConfig', {
    jitsi: serverConfig.jitsi,
    server:serverConfig.public,
    serverBanner: currentServerBanner,
    pepeList: emoteConfig.pepeList,
    prestigeBadges: emoteConfig.prestigeBadges || [],
    version: packageJson.version
  });
  const liveStreamsList = Array.from(trackedStreams.values()).sort((a, b) => b.viewers - a.viewers);
  socket.emit("initialStreams", {
    allStreams: liveStreamsList
  });
socket.emit("channelList", dynamicChannels);

socket.on("getChannels", () => {
  socket.emit("channelList", dynamicChannels);
});

socket.emit("roleList", customRoles);

socket.on("getRoles", () => {
  socket.emit("roleList", customRoles);
});

socket.on("createRole", (data) => {
  if (!socket.isAdmin) { socket.emit("error", { msg: "❌ Admin only." }); return; }
  const name = sanitizeString((data?.name || "").trim(), 24);
  let color = (data?.color || "#00f2ff").trim();
  let badge = null;
  if (typeof data?.badge === "string" && (emoteConfig.pepeList || []).includes(data.badge)) {
    badge = data.badge;
  }

  const isHex = /^#[0-9a-fA-F]{6}$/.test(color);
  const isRgba = /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0|1|0?\.\d+)\s*\)$/.test(color);

  if (!isHex && !isRgba) {
    color = "#00f2ff";
  } else if (isRgba) {
    const m = color.match(/^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(0|1|0?\.\d+)\s*\)$/);
    const r = Math.min(255, parseInt(m[1], 10));
    const g = Math.min(255, parseInt(m[2], 10));
    const b = Math.min(255, parseInt(m[3], 10));
    const a = Math.min(1, parseFloat(m[4]));
    color = `rgba(${r},${g},${b},${a})`;
  }

  const role = { id: crypto.randomUUID(), name, color, badge, createdAt: Date.now() };
  customRoles.push(role);
  saveRoles(customRoles);
  io.emit("roleList", customRoles);
  socket.emit("systemMessage", { msg: `✅ Role created.`, type: "success" });
});


socket.on("setUserRole", (data) => {
  if (!socket.isAdmin) { socket.emit("error", { msg: "❌ Admin only." }); return; }

  const { userId, role, value } = data || {};
  const validRoles = ["isAdmin", "isDeveloper", "isPromptEngineer"];
  if (!userId || !validRoles.includes(role) || typeof value !== "boolean") return;

  const dbUser = allUsers.get(userId);
  if (!dbUser) {
    socket.emit("error", { msg: "❌ User not found." });
    return;
  }


  dbUser[role] = value;
  allUsers.set(userId, dbUser);
  saveUsers();
  const onlineUser = onlineUsers.get(userId);
  if (onlineUser) {
    onlineUser[role] = value;
  }


  io.sockets.sockets.forEach((sock) => {
    if (sock.userId === userId) {
      if (role === "isAdmin") sock.isAdmin = value;
      if (role === "isDeveloper") { sock.isDeveloper = value; sock.isAdmin = value || sock.isAdmin; }
      if (role === "isPromptEngineer") sock.isPromptEngineer = value;

      sock.emit("userData", {
        id: userId,
        isAdmin: dbUser.isAdmin || false,
        isDeveloper: dbUser.isDeveloper || false,
        isPromptEngineer: dbUser.isPromptEngineer || false,
        level: dbUser.level || 1,
        xp: dbUser.xp || 0
      });
    }
  });

  io.emit("userPropertiesUpdated", { userId, properties: { [role]: value } });
  broadcastOnlineUsers();

  socket.emit("systemMessage", {
    msg: `✅ Set ${role} = ${value} for ${dbUser.username}`,
    type: "success"
  });

  console.log(`🔧 Role updated via setUserRole: ${dbUser.username} | ${role} = ${value} by ${onlineUsers.get(socket.userId)?.username}`);
});

socket.on("deleteRole", (data) => {
  if (!socket.isAdmin) { socket.emit("error", { msg: "❌ Admin only." }); return; }
  const { id } = data || {};
  const role = customRoles.find(r => r.id === id);
  if (!role) { socket.emit("error", { msg: "❌ Role not found." }); return; }

  customRoles = customRoles.filter(r => r.id !== id);
  saveRoles(customRoles);

allUsers.forEach((u) => {
    if (Array.isArray(u.customRoleIds)) u.customRoleIds = u.customRoleIds.filter(rid => rid !== id);
  });
  saveUsers();

  onlineUsers.forEach((u, uid) => {
    if (Array.isArray(u.customRoleIds) && u.customRoleIds.includes(id)) {
      u.customRoleIds = u.customRoleIds.filter(rid => rid !== id);
      io.emit("userPropertiesUpdated", { userId: uid, properties: { customRoleIds: u.customRoleIds } });
    }
  });

  io.emit("roleList", customRoles);
  broadcastOnlineUsers();
  socket.emit("systemMessage", { msg: `🗑️ Role "${role.name}" deleted.`, type: "success" });
});

socket.on("assignRole", (data) => {
  if (!socket.isAdmin) { socket.emit("error", { msg: "❌ Admin only." }); return; }
  const targetUsername = stripAtPrefix(data?.username || "").toLowerCase();
  const roleId = data?.roleId;
  const action = data?.action;

  if (!["add", "remove"].includes(action)) {
    socket.emit("error", { msg: "❌ Invalid role action." });
    return;
  }

  let targetId = null;
  allUsers.forEach((u, id) => { if (u.username.toLowerCase() === targetUsername) targetId = id; });
  if (!targetId) { socket.emit("error", { msg: `❌ User "${data?.username}" not found.` }); return; }

  const role = customRoles.find(r => r.id === roleId);
  if (!role) { socket.emit("error", { msg: "❌ Role not found." }); return; }

  const dbUser = allUsers.get(targetId);
  if (!Array.isArray(dbUser.customRoleIds)) dbUser.customRoleIds = [];

  if (action === "add") {
    if (!dbUser.customRoleIds.includes(roleId)) dbUser.customRoleIds.push(roleId);
  } else {
    dbUser.customRoleIds = dbUser.customRoleIds.filter(id => id !== roleId);
  }

  allUsers.set(targetId, dbUser);
  saveUsers();

  const onlineUser = onlineUsers.get(targetId);
  if (onlineUser) onlineUser.customRoleIds = dbUser.customRoleIds;

  io.emit("userPropertiesUpdated", {
    userId: targetId,
    properties: { customRoleIds: dbUser.customRoleIds }
  });
  broadcastOnlineUsers();

  io.sockets.sockets.forEach(sock => {
    if (sock.userId === targetId) {
      sock.emit("userData", { id: targetId, customRoleIds: dbUser.customRoleIds });
    }
  });

  socket.emit("systemMessage", {
    msg: action === "add" ? `✅ Added "${role.name}" to ${dbUser.username}` : `✅ Removed "${role.name}" from ${dbUser.username}`,
    type: "success"
  });
});

socket.on('updateServerBanner', (data) => {
  if (!socket.isAdmin && !socket.isDeveloper) return;

  currentServerBanner = data.url || null;
  serverConfig.serverBanner = currentServerBanner;

  try {
    fs.writeFileSync(SERVER_CONFIG_PATH, JSON.stringify(serverConfig, null, 2));
    console.log('🖼️ Server banner saved to server-config.json:', currentServerBanner);
  } catch (err) {
    console.error('❌ Failed to save server banner:', err);
  }

  io.emit('serverBannerUpdated', { url: currentServerBanner });
});

socket.on("markAllSeen", (data) => {
  const { messageIds, userId, username, avatar, seenAt } = data;
  if (!Array.isArray(messageIds)) return;

  messageIds.forEach(messageId => {
    for (const [ch, channelMessages] of messagesByChannel) {
      const msg = channelMessages.find(m => m.id === messageId);
      if (msg) {
        if (!msg.seenBy) msg.seenBy = [];
        if (!msg.seenBy.some(u => u.userId === userId)) {
          msg.seenBy.push({ userId, username, avatar, seenAt });
        }
        break;
      }
    }
  
    const globalMsg = messages.find(m => m.id === messageId);
    if (globalMsg) {
      if (!globalMsg.seenBy) globalMsg.seenBy = [];
      if (!globalMsg.seenBy.some(u => u.userId === userId)) {
        globalMsg.seenBy.push({ userId, username, avatar, seenAt });
      }
    }
  });

  saveMessages();
  io.emit("messageSeen", { messageIds, userId, username, avatar, seenAt });
});

socket.on("createChannel", (data) => {
  if (!socket.isAdmin) { socket.emit("channelError", { msg: "❌ Admin only." }); return; }
  const { name, type = "text", embed = false } = data || {};
  if (!name || typeof name !== "string") return;
  if (!["text", "voice"].includes(type)) return;

  const displayName = sanitizeString(name.trim(), 32); 
  if (!displayName) return;

  let clean = name.toLowerCase().replace(/[^a-z0-9-_]/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  if (!clean) clean = "channel";

  let id = clean;
  if (dynamicChannels.find(c => c.id === id)) {
    let suffix;
    do {
      suffix = crypto.randomBytes(3).toString("hex"); 
      id = `${clean}-${suffix}`;
    } while (dynamicChannels.find(c => c.id === id));
  }

  const channel = {
    id,
    name: displayName,
    type,
    embed: type === "voice" ? !!embed : undefined,
    createdAt: Date.now(),
    createdBy: onlineUsers.get(socket.userId)?.username || "Unknown"
  };
  dynamicChannels.push(channel);
  if (type === "text") messagesByChannel.set(id, []);
  syncChannelsArray();
  saveChannels(dynamicChannels);
  io.emit("channelList", dynamicChannels);
  io.emit("channelCreated", channel);
});


socket.on("resetAccountCreation", () => {
  if (!socket.isAdmin) {
    socket.emit("error", { msg: "❌ Admin only." });
    return;
  }

  const count = accountCreationAttempts.size;
  accountCreationAttempts.clear();

  socket.emit("systemMessage", {
    msg: `✅ Cleared account creation limits for ${count} IP${count === 1 ? "" : "s"}.`,
    type: "success"
  });

  console.log(`🧹 Account creation limits reset by ${onlineUsers.get(socket.userId)?.username || "Admin"} (cleared ${count} tracked IPs)`);
});

socket.on("deleteChannel", (data) => {
    if (!socket.isAdmin) {
    socket.emit("channelError", { msg: "❌ Admin only." });
    return;
  }
  const { id } = data || {};
  if (!id) { socket.emit("channelError", { msg: "No channel specified." }); return; }
  if (dynamicChannels.length <= 1) { socket.emit("channelError", { msg: "Cannot delete the last channel." }); return; }
  const idx = dynamicChannels.findIndex(c => c.id === id);
  if (idx === -1) { socket.emit("channelError", { msg: "Channel not found." }); return; }
  
  dynamicChannels.splice(idx, 1);
  messagesByChannel.delete(id);     
  messages = messages.filter(m => m.channel !== id);  
  syncChannelsArray();
  saveChannels(dynamicChannels);
  saveMessages();                  
  io.emit("channelList", dynamicChannels);
  io.emit("channelDeleted", { id });
  console.log(`🗑️ Channel deleted: #${id}`);
});
   
socket.on("join", (clientData) => {

   const isBot = clientData.isBot === true;

  if (socket.isBotToken && !isBot) {
    socket.disconnect(true);
    return;
  }

  if (!socket.isBotToken && isBot) {
    socket.disconnect(true);
    return;
  }

  if (!isBot) {
    const claimedId = clientData?.id;
    const sessionToken = clientData?.sessionToken;
    let verifiedId;

    if (claimedId && sessionToken && verifySession(claimedId, sessionToken) && allUsers.has(claimedId)) {
      verifiedId = claimedId;
    } else {
      verifiedId = crypto.randomUUID();
    }

    if (verifiedId !== claimedId) {
      const newSessionToken = signSession(verifiedId);
      socket.emit("sessionIssued", { id: verifiedId, sessionToken: newSessionToken });
      console.log(`🔐 Rejected unverified id "${claimedId || "(none)"}" - issued fresh identity ${verifiedId}`);
    }

    clientData = { ...clientData, id: verifiedId };
  }

  let ip = 'unknown';
  try {
    ip = getClientIp(socket);
  } catch (e) {
    console.error("Failed to get client IP:", e);
  }

const isNewUser = !allUsers.has(clientData.id);
    if (isNewUser && !isBot) {
      const now = Date.now();
      let attempts = accountCreationAttempts.get(ip) || { count: 0, resetTime: now + ACCOUNT_CREATION_WINDOW };
      if (now > attempts.resetTime) {
        attempts = { count: 0, resetTime: now + ACCOUNT_CREATION_WINDOW };
      }

      attempts.count++;

      if (attempts.count > ACCOUNT_CREATION_LIMIT) {
        console.log(`🚫 Account creation blocked: IP ${ip} exceeded limit (${attempts.count}/${ACCOUNT_CREATION_LIMIT})`);
        socket.emit("error", { 
          msg: `Too many new accounts from your IP. Limit is ${ACCOUNT_CREATION_LIMIT} per hour.` 
        });
        socket.disconnect(true);
        return;
      }

      accountCreationAttempts.set(ip, attempts);
      console.log(`📝 New account created: ${clientData.username} | Attempts: ${attempts.count}/${ACCOUNT_CREATION_LIMIT}`);
    }
  if (!clientData?.id) return;


   if (!isBot) {
  socket.xpTimer = setInterval(() => {
    if (!socket.userId) return;

    const user = onlineUsers.get(socket.userId);
    if (!user) return;

    if (isGameBanned(socket.userId)) {
      console.log(`🚫 ${user.username || socket.userId} is game-banned - skipping XP award`);
      return;
    }

    const AFK_THRESHOLD = 4 * 60 * 60 * 1000;
    const timeSinceActive = Date.now() - (user.lastActive || 0);

    if (timeSinceActive >= AFK_THRESHOLD) {
      console.log(`💤 ${socket.userId} is AFK - skipping XP award`);
      return;
    }

    const xpAmount = 10.0;
    addBonusXp(socket.userId, xpAmount);
  }, 10 * 60 * 1000);
}

  console.log(`📝 ${clientData.username} connected ${isBot ? '(BOT)' : ''} IP: ${ip}`);

const isReconnect = disconnectTimeouts.has(clientData.id);
const wasAlreadyOnline = !isBot && userSockets.has(clientData.id) && userSockets.get(clientData.id).size > 0;

socket.userId = clientData.id;
socket.isBot = isBot;

if (!userSockets.has(clientData.id)) userSockets.set(clientData.id, new Set());
userSockets.get(clientData.id).add(socket.id);

    if (isBot) {
    const botUser = {
      id: clientData.id,
      username: clientData.username || "Aira",
      avatar: clientData.avatar || "/avatars/bot.gif",
      status: "online",
      customStatus:clientData.customStatus,
      usernameColor: clientData.usernameColor,
      lastActive: Date.now(),
      isBot: true,
      level: clientData.level,
      userAgent: clientData.userAgent || socket.handshake.headers['user-agent'] || 'Unknown'
    };
    onlineUsers.set(clientData.id, botUser);
    broadcastOnlineUsers();
    console.log(`🤖 Bot "${botUser.username}" connected successfully`);
    return;
  }

  let dbUser = allUsers.get(clientData.id);
  const userAgent = socket.handshake.headers['user-agent'] || 'Unknown';
  if (!dbUser) {
    dbUser = {
      id: clientData.id,
      username: clientData.username || "Anonymous",
      avatar: clientData.avatar || "/avatars/default1.png",
      xp: 0,
      level: 1,
      usernameColor: clientData.usernameColor || "username-cyan",
      badge: null,
      banner: "",
      isAdmin: false,
      lastActive: Date.now(),
      userAgent: socket.handshake.headers['user-agent'] || 'Unknown'
    };
    allUsers.set(clientData.id, dbUser);
    saveUsers();
  }

 
  const isAdmin = dbUser.isAdmin === true;
  const isDeveloper = dbUser.isDeveloper === true;
  const isPromptEngineer = dbUser.isPromptEngineer === true;
  socket.isAdmin = isAdmin || isDeveloper;
  socket.isDeveloper = isDeveloper;
  socket.isPromptEngineer = isPromptEngineer;
  const serverUser = {
  id: clientData.id,
  username:      clientData.username      || dbUser.username      || "Anonymous",
  avatar:        clientData.avatar        || dbUser.avatar        || "/avatars/default1.png",
  banner:        clientData.banner        ?? dbUser.banner        ?? "",
  usernameColor: clientData.usernameColor || dbUser.usernameColor || "username-cyan",
  badge:         clientData.badge         ?? dbUser.badge         ?? null,
  customRoleIds: dbUser.customRoleIds ?? [],
  profileHeader: clientData.profileHeader ?? dbUser.profileHeader ?? "",
  customStatus:  dbUser.statusLocked ? dbUser.customStatus : (clientData.customStatus ?? dbUser.customStatus ?? ""),
  xp:      dbUser.xp      || 0,
  level:   dbUser.level   || 1,
  isAdmin:          dbUser.isAdmin      || false,
  isDeveloper:      dbUser.isDeveloper  || false,
  isPromptEngineer: dbUser.isPromptEngineer || false,
  status:     "online",
  lastActive: Date.now(),
  userAgent:  socket.handshake.headers['user-agent'] || 'Unknown'
};

  onlineUsers.set(clientData.id, serverUser);
socket.emit("bonusUpdate", getBonusState(clientData.id));
socket.emit("userData", {
  id:               serverUser.id,
  xp:               serverUser.xp,
  level:            serverUser.level,
  usernameColor:    serverUser.usernameColor,
  badge:            serverUser.badge,
  banner:           serverUser.banner,
  isAdmin:          isAdmin,
  isDeveloper:      isDeveloper,
  isPromptEngineer: isPromptEngineer,
  unlockedPrestigeBadges: dbUser.unlockedPrestigeBadges || []
});

 socket.emit("whisperHistory", { conversations: buildWhisperHistoryFor(clientData.id) });
  if (isAdmin) {
    console.log(`👑 ADMIN CONNECTED: ${serverUser.username}`);
    io.emit("adminOnline", { userId: serverUser.id, username: serverUser.username });
  }

  if (isReconnect) {
    clearTimeout(disconnectTimeouts.get(clientData.id));
    disconnectTimeouts.delete(clientData.id);
  }

  updatePersistentUser(serverUser);
  broadcastOnlineUsers();

if (!socket.isBot && !isReconnect && !wasAlreadyOnline) {
    socket.broadcast.emit("userOnline", serverUser);
  }


  voiceRooms.forEach((participants, roomName) => {
    const cleaned = participants.filter(p => {
      if (p.userId === clientData.id) return true;
      if (onlineUsers.has(p.userId)) return true;
      return false;
    });
    if (cleaned.length !== participants.length) {
      voiceRooms.set(roomName, cleaned);
      console.log(`🧹 Cleaned stale entries from ${roomName}: ${participants.length} -> ${cleaned.length}`);
    }
    socket.emit("voiceRoomUpdate", {
      roomName,
      participants: cleaned,
      count: cleaned.length
    });
  });


if (!socket.isBot) {
    const unseenByChannel = {};
    CHANNELS.forEach(ch => {
      const channelMessages = messagesByChannel.get(ch) || [];
      let unseenCount = 0;

      channelMessages.forEach(msg => {
        const hasSeen = msg.seenBy && msg.seenBy.some(s => s.userId === clientData.id);
        if (!hasSeen && msg.userId !== clientData.id) {
          unseenCount++;
        }
      });

      if (unseenCount > 0) {
        unseenByChannel[ch] = unseenCount;
      }
    });

    socket.emit("unreadMessages", {
      unreadByChannel: unseenByChannel
    });


    const generalMessages = messagesByChannel.get("general") || [];
    socket.emit("history", { 
      channel: "general",
      messages: generalMessages 
    });
  }
});


socket.on("editMessage", (data) => {
  if (!data || !data.id) return;
  const userId = socket.userId;
  if (!userId) return;

  let message = null;
  let channel = null;
  for (const [ch, channelMessages] of messagesByChannel) {
    const found = channelMessages.find(m => m.id === data.id);
    if (found) { message = found; channel = ch; break; }
  }
  if (!message) message = messages.find(m => m.id === data.id);
  if (!message) return;

  if (message.userId !== userId) {
    socket.emit("error", { msg: "❌ You can only edit your own messages." });
    return;
  }
  if (message.encrypted) {
    socket.emit("error", { msg: "❌ Encrypted messages can't be edited." });
    return;
  }

  if (message.type === "text") {
    const newText = sanitizeString((data.text || "").toString().trim(), 4000);
    if (!newText) { socket.emit("error", { msg: "❌ Message can't be empty." }); return; }
    message.text = newText;
    message.isRoomMention = newText.includes("@room");

  } else if (message.type === "embed" && data.embed && typeof data.embed === "object") {
    if (!socket.isBot && !socket.isAdmin && !socket.isDeveloper) {
      socket.emit("error", { msg: "❌ Only bots or admins can edit embeds." });
      return;
    }
  
    const allowedEmbedFields = ["title", "description", "color", "image", "images", "footer", "fields", "buttons"];
    const newEmbed = { ...message.embed };
    allowedEmbedFields.forEach(f => {
      if (data.embed[f] !== undefined) newEmbed[f] = data.embed[f];
    });
    message.embed = newEmbed;

  } else {
    socket.emit("error", { msg: "❌ This message type can't be edited." });
    return;
  }

  message.edited = true;
  message.editedAt = Date.now();
  saveMessages();

  io.emit("messageEdited", {
    id: message.id,
    channel: message.channel || channel || "general",
    type: message.type,
    text: message.text,
    embed: message.embed,
    edited: true,
    editedAt: message.editedAt
  });

  console.log(`✏️ Message edited: ${data.id} by ${onlineUsers.get(userId)?.username || userId}`);
});



socket.on("whisperTyping", (data) => {
  if (socket.isBot) return;
  const fromId = socket.userId;
  if (!fromId) return;

  const senderInfo = onlineUsers.get(fromId) || allUsers.get(fromId) || {};
  const username = senderInfo.username || "Anonymous";

  if (data?.groupId) {
    const group = whisperGroups.find(g => g.id === data.groupId);
    if (!group || !group.memberIds.includes(fromId)) return;

    const payload = {
  from: fromId,
  username: senderInfo.username || "Anonymous",
  avatar: senderInfo.avatar || "/avatars/default1.png",
  usernameColor: senderInfo.usernameColor || "username-cyan"
};
    group.memberIds.forEach(uid => {
      if (uid !== fromId) emitToUser(uid, "whisperTyping", payload);
    });
    return;
  }

  const toId = data?.to;
  if (!toId || toId === fromId) return;

  emitToUser(toId, "whisperTyping", { from: fromId, username });
});

socket.on("getWhisperHistory", () => {
  if (socket.isBot || !socket.userId) return;
  socket.emit("whisperHistory", { conversations: buildWhisperHistoryFor(socket.userId) });
});

socket.on("whisperStopTyping", (data) => {
  if (socket.isBot) return;
  const fromId = socket.userId;
  if (!fromId) return;

  if (data?.groupId) {
    const group = whisperGroups.find(g => g.id === data.groupId);
    if (!group || !group.memberIds.includes(fromId)) return;

    const payload = { from: fromId, groupId: group.id };
    group.memberIds.forEach(uid => {
      if (uid !== fromId) emitToUser(uid, "whisperStopTyping", payload);
    });
    return;
  }

  const toId = data?.to;
  if (!toId || toId === fromId) return;

  emitToUser(toId, "whisperStopTyping", { from: fromId });
});

socket.on("embedButtonClick", (data) => {
  if (!data || !data.messageId || !data.buttonId) return;
  const userId = socket.userId;
  if (!userId) return;

  const now = Date.now();
  const last = embedButtonRateLimit.get(userId) || 0;
  if (now - last < 500) return;
  embedButtonRateLimit.set(userId, now);

  const user = onlineUsers.get(userId) || allUsers.get(userId) || {};
  const message = messages.find(m => m.id === data.messageId);
  if (!message) return;

  const payload = {
    messageId: data.messageId,
    buttonId: data.buttonId,
    channel: message.channel || "general",
    userId,
    username: sanitizeString(user.username || "Anonymous", 32),
    avatar: user.avatar || "/avatars/default1.png",
    time: now
  };


  emitToUser(message.userId, "embedButtonClick", payload);
});
  socket.on("voiceJoin", (data) => {
  const { roomName, userId, username, avatar, usernameColor, level, badge } = data;
  
  if (!voiceRooms.has(roomName)) {
    voiceRooms.set(roomName, []);
  }
  
  const room = voiceRooms.get(roomName);
  const filtered = room.filter(u => u.userId !== userId);
  filtered.push({ 
    userId, 
    username, 
    avatar: sanitizeAvatar(avatar), 
    usernameColor: usernameColor || "username-cyan", 
    level: level || 1, 
    badge: badge || null 
  });
  
  voiceRooms.set(roomName, filtered);
  voiceUserStates.delete(userId);
  io.emit("voiceRoomUpdate", { 
    roomName, 
    participants: filtered, 
    count: filtered.length 
  });

  const states = {};
  voiceUserStates.forEach((state, id) => {
    states[id] = state;
  });
  io.emit("voiceStatesSync", states);
  
  console.log(`🎤 ${username} joined vc ${roomName} (${filtered.length} total)`);
});


socket.on("whisperGroupCreate", (data) => {
  if (socket.isBot) return;
  const creatorId = socket.userId;
  if (!creatorId) return;

  const rawMemberIds = Array.isArray(data?.memberIds) ? data.memberIds : [];
  const memberIds = [...new Set([creatorId, ...rawMemberIds])].filter(id => allUsers.has(id));

  if (memberIds.length < 3) {
    socket.emit("error", { msg: "❌ A group needs at least 3 members total." });
    return;
  }

  const name = sanitizeString((data?.name || "").trim(), 40) || "Unnamed Group";

  const group = {
    id: crypto.randomUUID(),
    name,
    memberIds,
    createdAt: Date.now(),
    createdBy: creatorId
  };

  whisperGroups.push(group);
   saveWhispers();

  const payload = {
    groupId: group.id,
    name: group.name,
    members: getGroupMembersPayload(group)
  };


  memberIds.forEach(uid => emitToUser(uid, "whisperGroupCreated", payload));
  console.log(`👥 Group "${group.name}" created by ${onlineUsers.get(creatorId)?.username} with ${memberIds.length} members`);
});



socket.on("whisperGroupAddMembers", (data) => {
  if (socket.isBot) return;
  const requesterId = socket.userId;
  if (!requesterId) return;

  const group = whisperGroups.find(g => g.id === data?.groupId);
  if (!group) { socket.emit("error", { msg: "❌ Group not found." }); return; }
  if (!group.memberIds.includes(requesterId)) { socket.emit("error", { msg: "❌ You're not in this group." }); return; }

  const newIds = Array.isArray(data?.memberIds) ? data.memberIds : [];
  const toAdd = newIds.filter(id => allUsers.has(id) && !group.memberIds.includes(id));

  if (toAdd.length === 0) {
    socket.emit("error", { msg: "❌ No new members to add." });
    return;
  }

  group.memberIds.push(...toAdd);
   saveWhispers();

  const payload = {
    groupId: group.id,
    name: group.name,
    members: getGroupMembersPayload(group),
    addedBy: onlineUsers.get(requesterId)?.username || "Someone",
    addedUserIds: toAdd
  };

 
  group.memberIds.forEach(uid => emitToUser(uid, "whisperGroupUpdated", payload));
  const msgs = groupWhispers.filter(m => m.groupId === group.id).sort((a, b) => a.time - b.time);
  toAdd.forEach(uid => {
    emitToUser(uid, "whisperGroupCreated", {
      groupId: group.id,
      name: group.name,
      members: getGroupMembersPayload(group),
      messages: msgs
    });
  });

  console.log(`👥 ${toAdd.length} member(s) added to group "${group.name}" by ${onlineUsers.get(requesterId)?.username}`);
});



socket.on("whisperGroupLeave", (data) => {
  if (socket.isBot) return;
  const leavingId = socket.userId;
  if (!leavingId) return;

  const group = whisperGroups.find(g => g.id === data?.groupId);
  if (!group) return;
  if (!group.memberIds.includes(leavingId)) return;

  const leavingUsername = onlineUsers.get(leavingId)?.username || allUsers.get(leavingId)?.username || "Someone";

  group.memberIds = group.memberIds.filter(id => id !== leavingId);
  if (group.memberIds.length <= 1) {
    whisperGroups = whisperGroups.filter(g => g.id !== group.id);
    groupWhispers = groupWhispers.filter(m => m.groupId !== group.id);
    saveGroupWhispers();
  }

   saveWhispers();
  emitToUser(leavingId, "whisperGroupLeft", { groupId: group.id });
  if (whisperGroups.some(g => g.id === group.id)) {
    const payload = {
      groupId: group.id,
      name: group.name,
      members: getGroupMembersPayload(group),
      leftUsername: leavingUsername,
      leftUserId: leavingId
    };
    group.memberIds.forEach(uid => emitToUser(uid, "whisperGroupUpdated", payload));
  }

  console.log(`👋 ${leavingUsername} left group "${group.name}"`);
});


socket.on("whisperSend", (data) => {
  if (socket.isBot) return;
  const fromId = socket.userId;
  if (!fromId) return;

  const text = sanitizeString((data?.text || "").toString().trim(), 2000);
  if (!text) return;

  const isEncrypted = !!data?.encrypted;
  const encPayload = isEncrypted ? (data?.encPayload || null) : null;
  const now = Date.now();
  if (!userRateLimit.has(fromId)) {
    userRateLimit.set(fromId, { count: 0, lastReset: now, cooldownUntil: 0 });
  }
  const limit = userRateLimit.get(fromId);
  if (limit.cooldownUntil > now) {
    socket.emit("cooldown", {
      remaining: Math.ceil((limit.cooldownUntil - now) / 1000),
      message: "Slow down! You're sending too fast."
    });
    return;
  }
  if (now - limit.lastReset > 10000) {
    limit.count = 0;
    limit.lastReset = now;
  }
  limit.count++;
  if (limit.count >= 3) {
    limit.cooldownUntil = now + 15000;
    limit.count = 0;
  }

  const senderInfo = onlineUsers.get(fromId) || allUsers.get(fromId) || {};
  if (data?.groupId) {
    const group = whisperGroups.find(g => g.id === data.groupId);
    if (!group) return;
    if (!group.memberIds.includes(fromId)) return;

    const msg = {
      id: crypto.randomUUID(),
      from: fromId,
      groupId: group.id,
      fromUsername: senderInfo.username || "Anonymous",
      fromAvatar: senderInfo.avatar || "/avatars/default1.png",
      fromUsernameColor: senderInfo.usernameColor || "username-cyan",
      text,
      encrypted: isEncrypted,
      encPayload,
      time: now
    };

   groupWhispers.push(msg);
    saveWhispers();

    group.memberIds.forEach(uid => emitToUser(uid, "whisperMessage", msg));
    return;
  }


  const toId = data?.to;
  if (!toId || toId === fromId) return;

  if (mutedUsers.has(fromId)) {
    socket.emit("error", { msg: "❌ You are muted and cannot send messages." });
    return;
  }

  const msg = {
    id: crypto.randomUUID(),
    from: fromId,
    to: toId,
    fromUsername: senderInfo.username || "Anonymous",
    fromAvatar: senderInfo.avatar || "/avatars/default1.png",
    fromUsernameColor: senderInfo.usernameColor || "username-cyan",
    text,
    encrypted: isEncrypted,
    encPayload,
    time: now
  };

  whispers.push(msg);
  saveWhispers();

  emitToUser(toId, "whisperMessage", msg);
  emitToUser(fromId, "whisperMessage", msg);
});

socket.on("voiceLeave", (data) => {
  const { roomName, userId } = data;
  
  if (voiceRooms.has(roomName)) {
    const room = voiceRooms.get(roomName);
    const filtered = room.filter(u => u.userId !== userId);
    voiceRooms.set(roomName, filtered);
    voiceUserStates.delete(userId);
    
    io.emit("voiceRoomUpdate", { 
      roomName, 
      participants: filtered, 
      count: filtered.length 
    });
    
    console.log(`📞 User left ${roomName} (${filtered.length} remaining)`);
  }
});


  socket.on("message", (data) => {
    if (!data) return;
    const userId = socket.userId;
      const now = Date.now();


if (!socket.isBot) {
      const authoritativeUser = onlineUsers.get(userId) || allUsers.get(userId);
      if (!authoritativeUser) return;

      data.userId          = userId;
      data.username         = authoritativeUser.username;
      data.avatar            = authoritativeUser.avatar;
      data.usernameColor     = authoritativeUser.usernameColor || "username-cyan";
      data.badge              = authoritativeUser.badge || null;
      data.level               = authoritativeUser.level || 1;
      data.isAdmin              = !!authoritativeUser.isAdmin;
      data.isDeveloper           = !!authoritativeUser.isDeveloper;
      data.isPromptEngineer        = !!authoritativeUser.isPromptEngineer;
      data.prestigeBadge             = authoritativeUser.prestigeBadge || null;
      data.customRoleIds               = authoritativeUser.customRoleIds || [];
    }


if (data.type === "text" && typeof data.text === "string" && data.text.startsWith("/ree ")) {
  
  if (!socket.isAdmin && !socket.isDeveloper) {
    socket.emit("error", { msg: "❌ Admin or Developer only command." });
    return;
  }

  const fullText = data.text.substring(5).trim();
  const lastSpaceIndex = fullText.lastIndexOf(' ');
  if (lastSpaceIndex === -1) {
    socket.emit("error", { msg: "❌ Usage: /ree <username> <url>" });
    return;
  }

  const usernamePart = stripAtPrefix(fullText.substring(0, lastSpaceIndex));
  const url = fullText.substring(lastSpaceIndex + 1).trim();

  console.log(`REE Debug --> Username: "${usernamePart}" | URL: ${url}`);

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    socket.emit("error", { msg: "❌ URL must start with http:// or https://" });
    return;
  }

  let targetId = null;
  let targetUser = null;
  onlineUsers.forEach((user, id) => {
    if (user.username.toLowerCase() === usernamePart.toLowerCase()) {
      targetId = id;
      targetUser = user;
    }
  });

  if (!targetId) {
    socket.emit("error", { msg: `❌ User "${usernamePart}" not found.` });
    return;
  }

  let targetSocket = null;
  for (const sock of io.sockets.sockets.values()) {
    if (sock.userId === targetId) {
      targetSocket = sock;
      break;
    }
  }

  if (!targetSocket) {
    socket.emit("error", { msg: `❌ ${usernamePart} is not online.` });
    return;
  }

  targetSocket.emit("forceRedirect", { url });

  socket.emit("systemMessage", {
    msg: `✅ Redirected ${targetUser.username} to ${url}`,
    type: "success"
  });

  console.log(`🔀 ${onlineUsers.get(socket.userId)?.username || 'Admin'} redirected ${targetUser.username} -> ${url}`);
  return;
}


if (data.type === "text" && typeof data.text === "string" && data.text.startsWith("/setrole ")) {
  if (!socket.isAdmin) {
    socket.emit("error", { msg: "❌ Admin only command." });
    return;
  }

  const parts = data.text.substring(9).trim().split(" ");
  if (parts.length < 3) {
    socket.emit("error", { msg: "❌ Usage: /setrole <username> <admin|developer|promptengineer> <true|false>" });
    return;
  }

const value = parts.pop();
const role = parts.pop().toLowerCase();
const targetUsername = stripAtPrefix(parts.join(" ")).toLowerCase();

  if (!["admin", "developer", "promptengineer"].includes(role)) {
    socket.emit("error", { msg: "❌ Valid roles: admin, developer, promptengineer" });
    return;
  }

  if (!["true", "false"].includes(value)) {
    socket.emit("error", { msg: "❌ Value must be true or false" });
    return;
  }

  const boolValue = value === "true";
  let targetId = null;
  allUsers.forEach((u, id) => {
    if (u.username.toLowerCase() === targetUsername) targetId = id;
  });

  if (!targetId) {
    socket.emit("error", { msg: `❌ User "${targetUsername}" not found.` });
    return;
  }

  const dbUser = allUsers.get(targetId);
  const fieldMap = {
    "admin": "isAdmin",
    "developer": "isDeveloper",
    "promptengineer": "isPromptEngineer"
  };

  const field = fieldMap[role];
  dbUser[field] = boolValue;
  allUsers.set(targetId, dbUser);
  saveUsers();
  const onlineUser = onlineUsers.get(targetId);
  if (onlineUser) {
    onlineUser[field] = boolValue;
    io.sockets.sockets.forEach((sock) => {
      if (sock.userId === targetId) {
        if (field === "isAdmin") sock.isAdmin = boolValue;
        if (field === "isDeveloper") { sock.isDeveloper = boolValue; sock.isAdmin = boolValue || sock.isAdmin; }
        if (field === "isPromptEngineer") sock.isPromptEngineer = boolValue;
        sock.emit("userData", {
          id: targetId,
          isAdmin: dbUser.isAdmin || false,
          isDeveloper: dbUser.isDeveloper || false,
          isPromptEngineer: dbUser.isPromptEngineer || false,
          level: dbUser.level || 1,
          xp: dbUser.xp || 0
        });
      }
    });

    broadcastOnlineUsers();

    io.emit("userPropertiesUpdated", {
      userId: targetId,
      properties: {
        isAdmin: dbUser.isAdmin || false,
        isDeveloper: dbUser.isDeveloper || false,
        isPromptEngineer: dbUser.isPromptEngineer || false,
        username: onlineUser.username,
        avatar: onlineUser.avatar,
        usernameColor: onlineUser.usernameColor,
        badge: onlineUser.badge,
        level: onlineUser.level,
        banner: onlineUser.banner
      }
    });
  }

  socket.emit("systemMessage", {
    msg: `✅ Set ${field} = ${boolValue} for ${dbUser.username}`,
    type: "success"
  });

  console.log(`🔧 Role updated: ${dbUser.username} | ${field} = ${boolValue} by ${onlineUsers.get(socket.userId)?.username}`);
  return;
}


    if (data.type === "text" && typeof data.text === "string" && data.text.startsWith("/rm")) {
    if (!socket.isAdmin) {
      socket.emit("error", { msg: "❌ Admin only command." });
      return;
    }
    io.emit('removePrivateYoutube');
    socket.emit("systemMessage", { msg: `✅ Removed private video.`, type: "success" });
    console.log(`🗑️ Private video removed by ${onlineUsers.get(userId)?.username}`);
    return;
  }

  if (data.type === "text" && typeof data.text === "string" && data.text.startsWith("/lo ")) {
    if (!socket.isAdmin) {
      socket.emit("error", { msg: "❌ Admin only command." });
      return;
    }

const commandParts = data.text.substring(4).trim().split(" ");
const youtubeUrl = commandParts.pop();
const targetUsername = stripAtPrefix(commandParts.join(" ")).toLowerCase();
console.log(`TARGET USERNAME: ${targetUsername}`);
console.log(`YOUTUBE URL: ${youtubeUrl}`);
    let targetId = null;
    let targetUserData = null;
    onlineUsers.forEach((user, id) => {
       console.log(`🕵️ TARGET ${user.username.toLowerCase()}`)
       console.log(`🕵️ TARGET MATCH ${targetUsername}`)
      if (user.username.toLowerCase() === targetUsername) {
        targetId = id;
        targetUserData = user;
        console.log(`🎯 TARGET USERNAME: ${targetUsername} ID: ${targetId}`)
      }
    });

    if (!targetId) {
      socket.emit("error", { msg: `❌ User "${targetUsername}" not found or offline.` });
      return;
    }

    const youtubeRegex =
  /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;

if (!youtubeRegex.test(youtubeUrl)) {
  console.log(`YOUTUBE: ${targetUsername} ID: ${targetId}`);

  socket.emit("error", {
    msg: "❌ Invalid YouTube URL. Must be a valid YouTube link.",
  });

  return;
}

const match = youtubeUrl.match(
  /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
);

const embedId = match ? match[1] : null;

if (!embedId) {
  socket.emit("error", {
    msg: "❌ Could not extract video ID from URL.",
  });

  return;
}

const embedUrl = `https://www.youtube.com/embed/${embedId}`;
console.log(`▶️ TARGET URL ${embedUrl}`);
let targetSocket = null;
io.sockets.sockets.forEach((sock) => {
  if (sock.userId === targetId) {
    targetSocket = sock.id;
    return;
  }
});

if (!targetSocket) {
  socket.emit("error", { msg: `User is not connected.` });
  return;
}


io.to(targetSocket).emit('receivePrivateYoutube', {
  url: embedUrl,
  senderId: userId,
  senderName: onlineUsers.get(userId)?.username || "Anonymous",
  timestamp: now
});

    socket.emit("systemMessage", {
      msg: `✅ Sent private video to ${targetUserData.username}.`,
      type: "success"
    });

    console.log(`🎥 Private YouTube sent: ${onlineUsers.get(userId)?.username} -> ${targetUserData.username}`);
    return;
  }
  
      const channel = data.channel || "general";
      if (mutedUsers.has(userId)) {
        socket.emit("error", { msg: "❌ You are muted and cannot send messages." });
        return;
      }

    if ((data.type === "video" || data.type === "file" || data.type === "audio") && typeof data.text === "string") {
      const safeUploadPattern = /^\/uploads\/[a-f0-9-]{36}\.(mp4|webm|ogv|mov|mp3|wav|oga|weba|txt|md|csv|json)$/i;
      if (!safeUploadPattern.test(data.text)) {
        socket.emit("error", { msg: "❌ Invalid file reference." });
        return;
      }
    }

    if (data.fileName !== undefined) {
      data.fileName = sanitizeString(String(data.fileName), 100);
    }

  
    if (!userRateLimit.has(userId)) {
      userRateLimit.set(userId, { count: 0, lastReset: now, cooldownUntil: 0 });
    }

    const limit = userRateLimit.get(userId);

    if (limit.cooldownUntil > now) {
      socket.emit("cooldown", {
        remaining: Math.ceil((limit.cooldownUntil - now) / 1000),
        message: "Slow down! You're sending too fast."
      });
      return;
    }

    if (now - limit.lastReset > 10000) {
      limit.count = 0;
      limit.lastReset = now;
    }

    limit.count++;

    if (limit.count >= 3) {
      limit.cooldownUntil = now + 15000;
      limit.count = 0;
    }

   
    if (data.type === "text" && typeof data.text === "string") {
      if (data.text.includes("@room")) {
        data.isRoomMention = true;
      }
    }


    if (!data.seenBy) {
      data.seenBy = [];
    }

      messages.push(data);
  if (!messagesByChannel.has(channel)) {
    messagesByChannel.set(channel, []);
  }
  messagesByChannel.get(channel).push(data);
  saveMessages();
  io.emit("message", data); 
  });

 socket.on("voiceStateChange", (data) => {
  if (!data?.userId) return;
  voiceUserStates.set(data.userId, {
    isMuted: !!data.isMuted,
    isDeafened: !!data.isDeafened
  });

  io.emit("voiceStateUpdate", data);
});


socket.on("botUpdateStatus", (data) => {
  if (!socket.isBot || !socket.userId) return;

  const botUser = onlineUsers.get(socket.userId);
  if (!botUser) return;

  const ALLOWED_BOT_FIELDS = ["customStatus", "status", "avatar", "username", "usernameColor"];
  let changed = false;

  ALLOWED_BOT_FIELDS.forEach(field => {
    if (data[field] !== undefined) {
      if (field === "customStatus" || field === "username") {
        botUser[field] = sanitizeString(String(data[field]), field === "username" ? 32 : 100);
      } else {
        botUser[field] = data[field];
      }
      changed = true;
    }
  });

  if (!changed) return;

  botUser.lastActive = Date.now();
  onlineUsers.set(socket.userId, botUser);
  broadcastOnlineUsers();

  console.log(`🤖 Bot "${botUser.username}" updated status: ${botUser.customStatus || botUser.status || ""}`);
});


socket.on("joinChannel", (data) => {
  const channel = data.channel || "general";
  socket.currentChannel = channel;
  
  const channelMessages = messagesByChannel.get(channel) || [];
  socket.emit("history", { 
    channel: channel,
    messages: channelMessages 
  });
  
  const unseenByChannel = {};
  CHANNELS.forEach(ch => {
    const messages = messagesByChannel.get(ch) || [];
    let unseenCount = 0;
    
    messages.forEach(msg => {
      const hasSeen = msg.seenBy && msg.seenBy.some(s => s.userId === socket.userId);
      if (!hasSeen && msg.userId !== socket.userId) {
        unseenCount++;
      }
    });
    
    if (unseenCount > 0) {
      unseenByChannel[ch] = unseenCount;
    }
  });
  
  socket.emit("unreadMessages", {
    unreadByChannel: unseenByChannel
  });
  
  console.log(`📢 User looked at channel: ${channel}, unseen:`, unseenByChannel);
});

socket.on("requestVoiceStates", (data) => {
  const states = {};
  voiceUserStates.forEach((state, id) => {
    states[id] = state;
  });
  socket.emit("voiceStatesSync", states);
});
  
 socket.on("messageSeen", (data) => {
  if (!data || !data.messageId || !data.userId) return;
  let message = null;
  let foundInChannel = null;
  for (const [channel, channelMessages] of messagesByChannel) {
    const found = channelMessages.find(m => m.id === data.messageId);
    if (found) {
      message = found;
      foundInChannel = channel;
      break;
    }
  }
  
  if (!message) {
    message = messages.find(m => m.id === data.messageId);
  }
  
  if (message) {
    if (!message.seenBy) {
      message.seenBy = [];
    }

    const alreadySeen = message.seenBy.some(s => s.userId === data.userId);
    if (!alreadySeen) {
      message.seenBy.push({
        userId: data.userId,
        username: data.username,
        avatar: data.avatar,
        seenAt: Date.now()
      });
      saveMessages();
    }
  } else {
    console.warn(`⚠️ Message not found: ${data.messageId}`);
  }

  io.emit("messageSeen", {
    messageId: data.messageId,
    userId: data.userId,
    username: data.username,
    avatar: data.avatar,
    seenAt: Date.now()
  });

  const channel = foundInChannel || "general";
  const channelMessages = messagesByChannel.get(channel) || [];
  let unseenCount = 0;
  channelMessages.forEach(msg => {
    const hasSeen = msg.seenBy && msg.seenBy.some(s => s.userId === data.userId);
    if (!hasSeen && msg.userId !== data.userId) {
      unseenCount++;
    }
  });

  socket.emit("unreadMessages", {
    unreadByChannel: {
      [channel]: unseenCount
    }
  });
});


socket.on("typing", (data) => {
  if (socket.userId && onlineUsers.has(socket.userId)) {
    const currentUser = onlineUsers.get(socket.userId);
    socket.broadcast.emit("typing", {
      userId: socket.userId,
      username: currentUser.username,
      avatar: currentUser.avatar || '/avatars/default1.png',
      usernameColor: currentUser.usernameColor || 'username-cyan'
    });
  }
});

  socket.on("stopTyping", () => {
    if (socket.userId) {
      socket.broadcast.emit("stopTyping", {
        userId: socket.userId
      });
    }
  });


 socket.on("updateUser", (data) => {
  if (socket.isBot) return;
  if (!socket.userId || !onlineUsers.has(socket.userId)) return;

  const currentUser = onlineUsers.get(socket.userId);
  const dbUser = allUsers.get(socket.userId);
  const SERVER_ONLY_FIELDS = ['level', 'xp', 'isAdmin', 'isDeveloper', 'isPromptEngineer'];
 const ALLOWED_CLIENT_FIELDS = [
  'username', 'avatar', 'banner', 'customStatus',
  'usernameColor', 'badge', 'profileHeader', 'prestigeBadge'
];

ALLOWED_CLIENT_FIELDS.forEach(field => {
  if (data.user[field] !== undefined) {
    if (field === "customStatus" && dbUser?.statusLocked) return; 
    if (field === 'username' || field === 'customStatus') {
      currentUser[field] = sanitizeString(data.user[field], field === 'username' ? 32 : 100);
    } else {
      currentUser[field] = data.user[field];
    }
  }

});


if (data.user.username !== undefined) {
  currentUser.username = sanitizeString(data.user.username, 32);
}

  if (data.user.status === "online") {
    currentUser.status = "online";
    currentUser.lastActive = Date.now();
  }
  if (data.user.lastActive) {
    currentUser.lastActive = data.user.lastActive;
  }

  currentUser.level   = dbUser?.level   || 1;
  currentUser.xp      = dbUser?.xp      || 0;
  currentUser.isAdmin = dbUser?.isAdmin  || false;
  currentUser.isDeveloper = dbUser?.isDeveloper  || false;
  currentUser.isPromptEngineer = dbUser?.isPromptEngineer || false;
  const existingDb = allUsers.get(socket.userId) || {};
  const dbUpdate = { ...existingDb, lastActive: currentUser.lastActive };

ALLOWED_CLIENT_FIELDS.forEach(field => {
  if (data.user[field] !== undefined) {
    if (field === "customStatus" && dbUser?.statusLocked) return;
    if (field === 'username' || field === 'customStatus') {
      currentUser[field] = sanitizeString(data.user[field], field === 'username' ? 32 : 100);
    } else {
      currentUser[field] = data.user[field];
    }
  }
});

  
  dbUpdate.level   = existingDb.level   || 1;
  dbUpdate.xp      = existingDb.xp      || 0;
  dbUpdate.isAdmin = existingDb.isAdmin  || false;
  dbUpdate.isDeveloper = existingDb?.isDeveloper  || false;
  dbUpdate.isPromptEngineer = existingDb?.isPromptEngineer || false;

  allUsers.set(socket.userId, dbUpdate);
  saveUsers();

  broadcastOnlineUsers();
io.emit("userPropertiesUpdated", {
  userId: socket.userId,
  properties: {
    username:         currentUser.username,
    avatar:           currentUser.avatar,
    usernameColor:    currentUser.usernameColor,
    badge:            currentUser.badge,
    profileHeader:    currentUser.profileHeader,
    level:            currentUser.level,
    banner:           currentUser.banner,
    isDeveloper:      currentUser.isDeveloper || false,      
    isPromptEngineer: currentUser.isPromptEngineer || false  
  }
});
});

 
socket.on("muteUser", (data) => {
  if (!socket.isAdmin) return;
  const targetUsername = stripAtPrefix(data.target || "").toLowerCase();
  if (!targetUsername) return;

    let targetId = null;
    onlineUsers.forEach((u, id) => {
      if (u.username.toLowerCase() === targetUsername) targetId = id;
    });

    if (targetId) {
      mutedUsers.add(targetId);
      broadcastOnlineUsers();

      io.to(targetId).emit("youAreMuted", {
        muted: true,
        message: "You have been muted by a higher power"
      });
    }
  });

socket.on("unmuteUser", (data) => {
  if (!socket.isAdmin) return;
  const targetUsername = stripAtPrefix(data.target || "").toLowerCase();
  if (!targetUsername) return;

    let targetId = null;
    onlineUsers.forEach((u, id) => {
      if (u.username.toLowerCase() === targetUsername) targetId = id;
    });

    if (targetId) {
      mutedUsers.delete(targetId);
      broadcastOnlineUsers();

      io.to(targetId).emit("youAreMuted", {
        muted: false,
        message: "You have been unmuted."
      });
    }
  });

 
socket.on("delete", (data) => {
  const message = messages.find(m => m && m.id === data.id);
   if (message && message.protected && !socket.isAdmin) {
    socket.emit("error", { msg: "This message cannot be deleted." });
    return;
  }

  const channel = message?.channel || "general";

  messages = messages.filter(m => m.id !== data.id);
  messagesByChannel.forEach((channelMessages, ch) => {
    messagesByChannel.set(ch, channelMessages.filter(m => m.id !== data.id));
  });

  saveMessages();
  io.emit("delete", { id: data.id });
  const channelMessages = messagesByChannel.get(channel) || [];
  io.sockets.sockets.forEach((clientSocket) => {
    const userId = clientSocket.userId;
    if (!userId) return;
    let unseenCount = 0;
    channelMessages.forEach(msg => {
      const hasSeen = msg.seenBy && msg.seenBy.some(s => s.userId === userId);
      if (!hasSeen && msg.userId !== userId) {
        unseenCount++;
      }
    });

    clientSocket.emit("unreadMessages", {
      unreadByChannel: { [channel]: unseenCount }
    });
  });

  console.log(`🗑️ Message deleted: ${data.id} from ${channel}`);
});

 
socket.on("clear", () => {
   if (!socket.isAdmin) return;
  const uploadDir = path.join(__dirname, "uploads");
  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      console.error("Failed to read uploads folder:", err);
      return;
    }
    files.forEach(file => {
      fs.unlink(path.join(uploadDir, file), err => {
        if (err) console.error("Failed to delete file:", file, err);
      });
    });
  });

  messages = [];
  messagesByChannel.forEach((_, channel) => {
    messagesByChannel.set(channel, []);
  });

  saveMessages();
  io.emit("clear");
});

 
socket.on("disconnect", () => {
  if (!socket.userId) return;
  if (socket.xpTimer) {
    clearInterval(socket.xpTimer);
    console.log(`⏹️ XP timer stopped for ${socket.userId}`);
  }
  pepeRunStarts.delete(socket.userId); 
  dragonTowerSessions.delete(socket.userId);
  msSessions.delete(socket.userId);        
  pongHandleLeave(socket.userId, "disconnect");

if (socket.isBot) {
  console.log(`🤖 Bot disconnected: ${socket.userId}`);
  const sockets = userSockets.get(socket.userId);
  if (sockets) {
    sockets.delete(socket.id);
    if (sockets.size === 0) userSockets.delete(socket.userId);
  }
  onlineUsers.delete(socket.userId);
  broadcastOnlineUsers();
  return;
}


  const sockets = userSockets.get(socket.userId);
  if (sockets) {
    sockets.delete(socket.id);
    if (sockets.size === 0) {
      userSockets.delete(socket.userId);
    } else {
      console.log(`🔁 ${socket.userId} still has ${sockets.size} other connection(s), skipping offline logic`);
      return;
    }
  }

  voiceRooms.forEach((participants, roomName) => {
    const filtered = participants.filter(u => u.userId !== socket.userId);
    if (filtered.length !== participants.length) {
      voiceRooms.set(roomName, filtered);
      io.emit("voiceRoomUpdate", {
        roomName,
        participants: filtered,
        count: filtered.length
      });
    }
  });

  const user = onlineUsers.get(socket.userId);
  if (!user) return;

  console.log(`👋 User disconnected (grace period started): ${user.username}`);
  if (disconnectTimeouts.has(socket.userId)) {
    clearTimeout(disconnectTimeouts.get(socket.userId));
  }

  const timeoutId = setTimeout(() => {
    if (userSockets.has(socket.userId)) {
      console.log(`🔁 ${socket.userId} reconnected during grace period, aborting offline`);
      disconnectTimeouts.delete(socket.userId);
      return;
    }

    console.log(`⏰ Grace period ended - removing ${user.username} from online`);

    let clearedStatus = user.customStatus;
    if (clearedStatus && clearedStatus.startsWith("🎮 Playing")) {
      console.log(`CLEARED BTW`);
      clearedStatus = "";
    }

    updatePersistentUser({
      id: socket.userId,
      status: "offline",
      lastActive: Date.now(),
      username: user.username,
      avatar: user.avatar,
      profileHeader: user.profileHeader,
      usernameColor: user.usernameColor || "username-cyan",
      badge: user.badge,
      level: user.level || 1,
      customStatus: clearedStatus
    });

    onlineUsers.delete(socket.userId);
    mutedUsers.delete(socket.userId);
    disconnectTimeouts.delete(socket.userId);

    broadcastOnlineUsers();
  }, DISCONNECT_GRACE_PERIOD);

  disconnectTimeouts.set(socket.userId, timeoutId);
  user.status = "idle";
  broadcastOnlineUsers();
});

  socket.on("error", (error) => {
    console.error(`❌ Socket error for ${socket.id}:`, error);
  });


function renderChannelList(channels) {
  const container = document.getElementById("channelList");
  if (!container) return;
  container.innerHTML = "";
  channels.forEach(ch => {
    const item = document.createElement("div");
    item.className = "channel-item" + (ch.id === currentChannel ? " active" : "");
    item.dataset.channel = ch.id;
    item.style.cssText = `
      position: relative;
      display: flex;
      align-items: center;
      padding: 6px 10px;
      border-radius: 4px;
      cursor: pointer;
      color: ${ch.id === currentChannel ? "#fff" : "#b9bbbe"};
      background: ${ch.id === currentChannel ? "rgb(24,24,24)" : "transparent"};
      border-left: 4px solid ${ch.id === currentChannel ? "#FF0000" : "transparent"};
      user-select: none;
      gap: 6px;
      font-size: 15px;
      transition: background 0.15s;
    `;

    const hash = document.createElement("span");
    hash.textContent = "#";
    hash.style.cssText = "color:#72767d; font-weight:700; font-size:16px; flex-shrink:0;";
    const name = document.createElement("span");
    name.style.cssText = "flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;";
    name.textContent = ch.name;
    item.appendChild(hash);
    item.appendChild(name);
    item.addEventListener("click", () => switchChannel(ch.id));
    const bell = document.createElement("img");
    bell.className = "channel-bell";
    const bellEnabled = localStorage.getItem(`notif_${ch.id}`) !== "false";
    bell.src = bellEnabled ? "/avatars/bell-on.svg" : "/avatars/bell-off.svg";
    bell.style.cssText = `
      width:14px; height:14px; cursor:pointer; opacity:${bellEnabled ? "1" : "0.3"};
      filter:brightness(0) invert(1); flex-shrink:0; transition:opacity 0.2s;
    `;
    bell.title = bellEnabled ? "Mute channel" : "Unmute channel";
    bell.onclick = (e) => {
      e.stopPropagation();
      const enabled = localStorage.getItem(`notif_${ch.id}`) !== "false";
      localStorage.setItem(`notif_${ch.id}`, enabled ? "false" : "true");
      bell.src = enabled ? "/avatars/bell-off.svg" : "/avatars/bell-on.svg";
      bell.style.opacity = enabled ? "0.3" : "1";
      bell.title = enabled ? "Unmute channel" : "Mute channel";
    };
    item.appendChild(bell);
    
      const del = document.createElement("button");
      del.textContent = "✕";
      del.title = `Delete #${ch.name}`;
      del.style.cssText = `
        background: none; border: none; color: #72767d; font-size: 13px;
        cursor: pointer; padding: 0 2px; line-height:1; flex-shrink:0;
        transition: color 0.15s;
      `;
      del.onmouseover = () => del.style.color = "#ff3333";
      del.onmouseout  = () => del.style.color = "#72767d";
      del.onclick = (e) => {
        e.stopPropagation();
        if (confirm(`Delete #${ch.name}? All messages will be lost.`)) {
          socket.emit("deleteChannel", { id: ch.id });
        }
      };
      item.appendChild(del);
    const count = unreadCounts.get(ch.id) || 0;
    if (count > 0) updateChannelBadge(ch.id, count);

    container.appendChild(item);
  });

  const addBtn = document.createElement("button");
  addBtn.id = "addChannelBtn";
  addBtn.title = "Create channel";
  addBtn.style.cssText = `
    display: flex; align-items: center; gap: 6px;
    background: none; border: none; color: #72767d;
    font-size: 13px; cursor: pointer; padding: 6px 10px;
    border-radius: 4px; width: 100%; text-align: left;
    transition: color 0.15s, background 0.15s;
    margin-top: 4px;
  `;
  addBtn.innerHTML = `<span style="font-size:18px;line-height:1;">＋</span> Add Channel`;
  addBtn.onmouseover = () => { addBtn.style.color = "#fff"; addBtn.style.background = "rgba(255,255,255,0.05)"; };
  addBtn.onmouseout  = () => { addBtn.style.color = "#72767d"; addBtn.style.background = "none"; };
  addBtn.onclick = openCreateChannelModal;
  container.appendChild(addBtn);
}

function openCreateChannelModal() {
  document.getElementById("createChannelModal")?.remove();
  const modal = document.createElement("div");
  modal.id = "createChannelModal";
  modal.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.75);
    display: flex; align-items: center; justify-content: center; z-index: 20000;
  `;

  modal.innerHTML = `
    <div style="
      background: #2b2d31; border-radius: 12px; padding: 28px 32px;
      width: 380px; box-shadow: 0 20px 60px rgba(0,0,0,0.6);
      border: 1px solid #3a3c42;
    ">
      <h3 style="margin:0 0 6px; color:#fff; font-size:18px;">Create Channel</h3>
      <p style="margin:0 0 20px; color:#b9bbbe; font-size:13px;">
        Lowercase letters, numbers, hyphens and underscores only.
      </p>
      <input id="newChannelNameInput" type="text" placeholder="new-channel" maxlength="32"
        style="
          width:100%; padding:10px 14px; background:#40444b; border:1px solid #40444b;
          border-radius:8px; color:#fff; font-size:15px; box-sizing:border-box;
          outline:none; transition:border-color 0.2s;
        "
      >
      <p id="createChannelError" style="color:#ff3333; font-size:13px; min-height:18px; margin:8px 0 0;"></p>
      <div style="display:flex; gap:10px; margin-top:16px; justify-content:flex-end;">
        <button id="cancelCreateChannel" style="
          background:#40444b; border:none; color:#fff; padding:9px 18px;
          border-radius:8px; cursor:pointer; font-size:14px; transition:background 0.2s;
        ">Cancel</button>
        <button id="confirmCreateChannel" style="
          background:#FF0000; border:none; color:#fff; padding:9px 18px;
          border-radius:8px; cursor:pointer; font-size:14px; font-weight:600;
          transition:background 0.2s;
        ">Create</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const input = modal.querySelector("#newChannelNameInput");
  const errEl = modal.querySelector("#createChannelError");

  input.focus();
  input.addEventListener("focus", () => input.style.borderColor = "#FF0000");
  input.addEventListener("blur",  () => input.style.borderColor = "#40444b");
  const submit = () => {
    const name = input.value.trim();
    if (!name) { errEl.textContent = "Channel name cannot be empty."; return; }
    socket.emit("createChannel", { name });
  };

  modal.querySelector("#confirmCreateChannel").onclick = submit;
  modal.querySelector("#cancelCreateChannel").onclick  = () => modal.remove();
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
    if (e.key === "Escape") modal.remove();
  });
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
  const onError = (data) => {
    errEl.textContent = data.msg;
    socket.off("channelError", onError);
  };
  socket.on("channelError", onError);
}

socket.on("setGameStatus", (data) => {
  if (!socket.userId || !onlineUsers.has(socket.userId)) return;
  const currentUser = onlineUsers.get(socket.userId);
  currentUser.gameStatus = data.gameStatus || null;
  broadcastOnlineUsers();
});


socket.on("setMusicStatus", (data) => {
  if (!socket.userId || !onlineUsers.has(socket.userId)) return;
  const currentUser = onlineUsers.get(socket.userId);
  currentUser.musicStatus = data.musicStatus || null;
  currentUser.musicArtUrl = data.musicArtUrl || null;
  broadcastOnlineUsers();
});

socket.on("channelList", (channels) => {
  channels.forEach(ch => {
    if (!unreadCounts.has(ch.id)) unreadCounts.set(ch.id, 0);
  });
  renderChannelList(channels);
});

socket.on("channelCreated", (channel) => {
  document.getElementById("createChannelModal")?.remove();
  unreadCounts.set(channel.id, 0);
  socket.emit("getChannels");
  const existing = [...document.querySelectorAll(".channel-item")].map(el => el.dataset.channel);
  if (!existing.includes(channel.id)) {
  }
  console.log(`📢 Channel created: #${channel.name}`);
});

socket.on("channelDeleted", (data) => {
  unreadCounts.delete(data.id);
  if (currentChannel === data.id) {
    switchChannel("general");
  }
  console.log(`🗑️ Channel deleted: #${data.id}`);
});


socket.on("bonusGetState", () => {
  if (!socket.userId || socket.isBot) return;
  socket.emit("bonusUpdate", getBonusState(socket.userId));
});

socket.on("bonusClaim", () => {
  if (!socket.userId || socket.isBot) return;
  const result = claimBonus(socket.userId);
  if (!result.success) {
    socket.emit("bonusClaimError", { msg: result.msg });
  } else {
    socket.emit("bonusClaimed", { claimedXp: result.claimedXp, balance: getChipBalance(socket.userId) });
  }
});

socket.on("plinkoGetState", () => {
  if (!socket.userId || socket.isBot) return;
  socket.emit("plinkoState", {
    balance: getChipBalance(socket.userId),
    rows: PLINKO_ROWS,
    multipliers: PLINKO_MULTIPLIERS
  });
});
 
socket.on("plinkoDrop", (data) => {
  if (!socket.userId || socket.isBot) return;
  const userId = socket.userId;
  const useBonus = data?.account === "bonus";

  const amount = Math.floor(Number(data?.amount));
  const balance = useBonus ? getBonusBalance(userId) : getChipBalance(userId);

  if (!Number.isFinite(amount) || amount <= 0) {
    socket.emit("plinkoError", { msg: "Invalid bet." });
    return;
  }
  if (amount > balance) {
    socket.emit("plinkoError", { msg: "Insufficient XP for that bet." });
    return;
  }
  if (amount > PLINKO_MAX_BET_CHIPS) {
    socket.emit("plinkoError", { msg: `Max bet is ${PLINKO_MAX_BET_CHIPS} chips.` });
    return;
  }

 
  if (useBonus) placeBonusBet(userId, amount);
  else adjustUserXp(userId, -amount * BJ_XP_PER_CHIP);
  
  const path = [];
  let slotIndex = 0;
  for (let i = 0; i < PLINKO_ROWS; i++) {
    const bit = crypto.randomInt(2);
    path.push(bit);
    slotIndex += bit;
  }

  const multiplier = PLINKO_MULTIPLIERS[slotIndex];
  const payoutChips = Math.floor(amount * multiplier);

 
socket.emit("plinkoResult", {
    path,
    slotIndex,
    multiplier,
    betChips: amount,
    payoutChips,
    netChips: payoutChips - amount,
    account: useBonus ? "bonus" : "normal",
    balance: useBonus ? getBonusBalance(userId) : getChipBalance(userId)
  });

  setTimeout(() => {
    const bettorUser = onlineUsers.get(userId) || allUsers.get(userId) || {};
    plinkoBroadcastRecentBet({
      userId,
      username: bettorUser.username || "Anonymous",
      avatar: bettorUser.avatar || "/avatars/default1.png",
      betChips: amount,
      multiplier,
      payoutChips,
      account: useBonus ? "bonus" : "normal",
      ts: Date.now()
    });
  }, PLINKO_ANIMATION_MS);

  
if (payoutChips > 0) {
    setTimeout(() => {
      if (useBonus) {
        creditBonusWin(userId, payoutChips);
      } else {
        adjustUserXp(userId, payoutChips * BJ_XP_PER_CHIP);
        io.emit("userData", {
          id: userId,
          xp: allUsers.get(userId)?.xp || 0,
          level: allUsers.get(userId)?.level || 1
        });
      }
      if (plinkoRecordWin(userId, payoutChips, multiplier)) plinkoBroadcastLeaderboard();
      socket.emit("plinkoPayoutCredited", {
        payoutChips,
        account: useBonus ? "bonus" : "normal",
        balance: useBonus ? getBonusBalance(userId) : getChipBalance(userId)
      });
    }, PLINKO_ANIMATION_MS);
  }

  console.log(`🎯 Plinko: ${onlineUsers.get(userId)?.username || userId} bet ${amount} -> slot ${slotIndex} (x${multiplier}) -> ${payoutChips}`);
});


socket.on("plinkoLeaderboardGet", () => {
  if (socket.isBot) return;
  socket.emit("plinkoLeaderboardState", plinkoBuildLeaderboardPayload());
});


socket.on("minesweeperGetState", () => {
  if (!socket.userId || socket.isBot) return;
  msEmitState(socket.userId, socket);
});
 
socket.on("minesweeperStart", (data) => {
  if (!socket.userId || socket.isBot) return;
  const userId = socket.userId;
  const useBonus = data?.account === "bonus";
 
  const existing = msSessions.get(userId);
  if (existing && existing.active) {
    socket.emit("minesweeperError", { msg: "Round already in progress." });
    return;
  }
 
  const amount = Math.floor(Number(data?.amount));
  const mines = Math.floor(Number(data?.mines));
  const balance = useBonus ? getBonusBalance(userId) : getChipBalance(userId);
 
  if (!Number.isFinite(amount) || amount <= 0) {
    socket.emit("minesweeperError", { msg: "Invalid bet." });
    return;
  }
  if (amount > balance) {
    socket.emit("minesweeperError", { msg: "Insufficient XP for that bet." });
    return;
  }
  if (amount > MS_MAX_BET_CHIPS) {
    socket.emit("minesweeperError", { msg: `Max bet is ${MS_MAX_BET_CHIPS} chips.` });
    return;
  }
  if (!MS_ALLOWED_MINE_COUNTS.includes(mines)) {
    socket.emit("minesweeperError", { msg: "Invalid mine count." });
    return;
  }
 
  if (useBonus) placeBonusBet(userId, amount);
  else adjustUserXp(userId, -amount * BJ_XP_PER_CHIP);
 
  const session = {
    active: true,
    betChips: amount,
    mineCount: mines,
    mines: msGenerateMines(mines),
    revealed: new Set(),
    useBonus
  };
  msSessions.set(userId, session);
 
  socket.emit("minesweeperStarted", {
    betChips: amount,
    mines,
    account: useBonus ? "bonus" : "normal",
    balance: useBonus ? getBonusBalance(userId) : getChipBalance(userId)
  });
 
  console.log(`💣 Minesweeper start: ${onlineUsers.get(userId)?.username || userId} bet ${amount}, ${mines} mines`);
});
 
socket.on("minesweeperReveal", (data) => {
  if (!socket.userId || socket.isBot) return;
  const userId = socket.userId;
  const session = msSessions.get(userId);
  if (!session || !session.active) {
    socket.emit("minesweeperError", { msg: "No active round." });
    return;
  }
 
  const index = Math.floor(Number(data?.index));
  if (!Number.isInteger(index) || index < 0 || index >= MS_TILE_COUNT) {
    socket.emit("minesweeperError", { msg: "Invalid tile." });
    return;
  }
  if (session.revealed.has(index)) return;
 
  if (session.mines.has(index)) {
    session.active = false;
    const allMines = Array.from(session.mines);
    socket.emit("minesweeperTileResult", {
      index,
      hitMine: true,
      allMines,
      betChips: session.betChips,
      balance: getChipBalance(userId)
    });
    msSessions.delete(userId);
    console.log(`💥 Minesweeper loss: ${onlineUsers.get(userId)?.username || userId} lost ${session.betChips}`);
    return;
  }
 
 session.revealed.add(index);
  const multiplier = msMultiplierForReveal(session.revealed.size, session.mineCount);
  const safeTiles = MS_TILE_COUNT - session.mineCount;
  if (session.revealed.size >= safeTiles) {
    const payoutChips = Math.floor(session.betChips * multiplier);
    session.active = false;
    if (session.useBonus) creditBonusWin(userId, payoutChips);
    else adjustUserXp(userId, payoutChips * BJ_XP_PER_CHIP);
    socket.emit("minesweeperTileResult", {
      index,
      hitMine: false,
      multiplier,
      betChips: session.betChips
    });
    socket.emit("minesweeperCashoutResult", {
      payoutChips,
      multiplier,
      account: session.useBonus ? "bonus" : "normal",
      balance: session.useBonus ? getBonusBalance(userId) : getChipBalance(userId)
    });
    msSessions.delete(userId);
    return;
  }
 
  socket.emit("minesweeperTileResult", {
    index,
    hitMine: false,
    multiplier,
    betChips: session.betChips
  });
});
 
socket.on("minesweeperCashout", () => {
  if (!socket.userId || socket.isBot) return;
  const userId = socket.userId;
  const session = msSessions.get(userId);
  if (!session || !session.active) {
    socket.emit("minesweeperError", { msg: "No active round." });
    return;
  }
  if (session.revealed.size === 0) {
    socket.emit("minesweeperError", { msg: "Reveal at least one tile before cashing out." });
    return;
  }
 
const multiplier = msMultiplierForReveal(session.revealed.size, session.mineCount);
  const payoutChips = Math.floor(session.betChips * multiplier);
  session.active = false;
 
  if (session.useBonus) creditBonusWin(userId, payoutChips);
  else adjustUserXp(userId, payoutChips * BJ_XP_PER_CHIP);
 
  socket.emit("minesweeperCashoutResult", {
    payoutChips,
    multiplier,
    account: session.useBonus ? "bonus" : "normal",
    balance: session.useBonus ? getBonusBalance(userId) : getChipBalance(userId)
  });
 
  msSessions.delete(userId);
  console.log(`💰 Minesweeper cashout: ${onlineUsers.get(userId)?.username || userId} won ${payoutChips} at ${multiplier.toFixed(2)}x`);
});


socket.on("wheelGetState", () => {
  if (!socket.userId || socket.isBot) return;
  socket.emit("wheelState", {
    spinsLeft: getWheelSpinsLeft(socket.userId),
    spinsPerDay: WHEEL_SPINS_PER_DAY,
    segments: WHEEL_SEGMENTS.map(s => ({ label: s.label }))
  });
});
 
socket.on("wheelSpin", () => {
  if (!socket.userId || socket.isBot) return;
  const userId = socket.userId;

  if (isGameBanned(userId)) {
    socket.emit("wheelError", { msg: "You've been restricted from bonus games by an admin." });
    return;
  }

  let user = allUsers.get(userId);
  if (!user) {
    socket.emit("wheelError", { msg: "User not found." });
    return;
  }

  const today = getUtcDateString();
  if (user.wheelDate !== today) {
    user.wheelDate = today;
    user.wheelSpinsUsed = 0;
  }

  if ((user.wheelSpinsUsed || 0) >= WHEEL_SPINS_PER_DAY) {
    socket.emit("wheelError", { msg: "No spins left today. Come back tomorrow!" });
    return;
  }

  user.wheelSpinsUsed = (user.wheelSpinsUsed || 0) + 1;
  allUsers.set(userId, user);
  saveUsers();

  const segmentIndex = pickWheelSegment();
  const segment = WHEEL_SEGMENTS[segmentIndex];
  socket.emit("wheelResult", {
    segmentIndex,
    label: segment.label,
    xpWon: segment.xp,
    spinsLeft: WHEEL_SPINS_PER_DAY - user.wheelSpinsUsed
  });

  console.log(`🎡 Wheel spin: ${onlineUsers.get(userId)?.username || userId} landed on ${segment.label} - crediting in ${WHEEL_ANIMATION_MS}ms`);

  setTimeout(() => {
    if (segment.xp > 0) {
      addBonusXp(userId, segment.xp);
    }

    socket.emit("wheelXpAwarded", { xpWon: segment.xp });
    console.log(`🎡 Wheel XP credited: ${onlineUsers.get(userId)?.username || userId} +${segment.xp} XP`);
  }, WHEEL_ANIMATION_MS);
});


socket.on("lockUserStatus", (data) => {
  if (!socket.isAdmin) { socket.emit("error", { msg: "❌ Admin only." }); return; }
  const targetUsername = stripAtPrefix(data?.target || "").toLowerCase();
  const statusText = sanitizeString((data?.status || "").trim(), 100);
  if (!targetUsername || !statusText) return;

  let targetId = null;
  onlineUsers.forEach((u, id) => { if (u.username.toLowerCase() === targetUsername) targetId = id; });
  if (!targetId) {
    allUsers.forEach((u, id) => { if (u.username.toLowerCase() === targetUsername) targetId = id; });
  }
  if (!targetId) {
    socket.emit("error", { msg: `❌ User "${data?.target}" not found.` });
    return;
  }

  const dbUser = allUsers.get(targetId);
  dbUser.customStatus = statusText;
  dbUser.statusLocked = true;
  allUsers.set(targetId, dbUser);
  saveUsers();

  const onlineUser = onlineUsers.get(targetId);
  if (onlineUser) {
    onlineUser.customStatus = statusText;
    broadcastOnlineUsers();
    io.emit("userPropertiesUpdated", { userId: targetId, properties: { customStatus: statusText } });
  }

  const adminName = onlineUsers.get(socket.userId)?.username || "Admin";
  socket.emit("systemMessage", { msg: `✅ Locked ${dbUser.username}'s status to "${statusText}".`, type: "success" });
  console.log(`🔒 Status locked: ${dbUser.username} -> "${statusText}" by ${adminName}`);
});

socket.on("unlockUserStatus", (data) => {
  if (!socket.isAdmin) { socket.emit("error", { msg: "❌ Admin only." }); return; }
  const targetUsername = stripAtPrefix(data?.target || "").toLowerCase();
  if (!targetUsername) return;

  let targetId = null;
  allUsers.forEach((u, id) => { if (u.username.toLowerCase() === targetUsername) targetId = id; });
  if (!targetId) {
    socket.emit("error", { msg: `❌ User "${data?.target}" not found.` });
    return;
  }

  const dbUser = allUsers.get(targetId);
  dbUser.statusLocked = false;
  allUsers.set(targetId, dbUser);
  saveUsers();

  const adminName = onlineUsers.get(socket.userId)?.username || "Admin";
  socket.emit("systemMessage", { msg: `✅ Unlocked ${dbUser.username}'s status.`, type: "success" });
  console.log(`🔓 Status unlocked: ${dbUser.username} by ${adminName}`);
});


socket.on("diceGetState", () => {
  if (!socket.userId || socket.isBot) return;
  socket.emit("diceState", {
    balance: getChipBalance(socket.userId),
    maxBet: DICE_MAX_BET_CHIPS,
    minTarget: DICE_MIN_TARGET,
    maxTarget: DICE_MAX_TARGET
  });
});
 
socket.on("diceRoll", (data) => {
  if (!socket.userId || socket.isBot) return;
  const userId = socket.userId;
  const useBonus = data?.account === "bonus";
 
  const amount = Math.floor(Number(data?.amount));
  const target = Number(data?.target);
  const mode = data?.mode === "over" ? "over" : "under";
  const balance = useBonus ? getBonusBalance(userId) : getChipBalance(userId);
 
  if (!Number.isFinite(amount) || amount <= 0) {
    socket.emit("diceError", { msg: "Invalid bet." });
    return;
  }
  if (amount > balance) {
    socket.emit("diceError", { msg: "Insufficient XP for that bet." });
    return;
  }
  if (amount > DICE_MAX_BET_CHIPS) {
    socket.emit("diceError", { msg: `Max bet is ${DICE_MAX_BET_CHIPS} chips.` });
    return;
  }
  if (!Number.isFinite(target) || target < DICE_MIN_TARGET || target > DICE_MAX_TARGET) {
    socket.emit("diceError", { msg: `Target must be between ${DICE_MIN_TARGET} and ${DICE_MAX_TARGET}.` });
    return;
  }
 

  if (useBonus) placeBonusBet(userId, amount);
  else adjustUserXp(userId, -amount * BJ_XP_PER_CHIP);
 
  const roll = diceRoll();
  const winChance = diceWinChance(target, mode);
  const multiplier = diceMultiplier(winChance);
  const won = mode === "under" ? roll < target : roll > target;
  const payoutChips = won ? Math.floor(amount * multiplier) : 0;
  socket.emit("diceResult", {
    roll,
    target,
    mode,
    won,
    multiplier,
    betChips: amount,
    payoutChips,
    account: useBonus ? "bonus" : "normal",
    balance: useBonus ? getBonusBalance(userId) : getChipBalance(userId)
  });

  setTimeout(() => {
    const rollerUser = onlineUsers.get(userId) || allUsers.get(userId) || {};
    diceBroadcastRecentBet({
      userId,
      username: rollerUser.username || "Anonymous",
      avatar: rollerUser.avatar || "/avatars/default1.png",
      betChips: amount,
      multiplier,
      payoutChips,
      won,
      ts: Date.now()
    });
  }, DICE_ANIMATION_MS);
 
  console.log(`🎲 Dice: ${onlineUsers.get(userId)?.username || userId} bet ${amount} on ${mode} ${target} -> rolled ${roll} (${won ? "WIN" : "lose"})`);
 
  if (payoutChips > 0) {
    setTimeout(() => {
      if (useBonus) creditBonusWin(userId, payoutChips);
      else {
        adjustUserXp(userId, payoutChips * BJ_XP_PER_CHIP);
        io.emit("userData", {
          id: userId,
          xp: allUsers.get(userId)?.xp || 0,
          level: allUsers.get(userId)?.level || 1
        });
      }
      if (diceRecordWin(userId, payoutChips)) diceBroadcastLeaderboard(); 
      socket.emit("dicePayoutCredited", {
        payoutChips,
        account: useBonus ? "bonus" : "normal",
        balance: useBonus ? getBonusBalance(userId) : getChipBalance(userId)
      });
    }, DICE_ANIMATION_MS);
  } else {
    setTimeout(() => {
      socket.emit("dicePayoutCredited", {
        payoutChips: 0,
        account: useBonus ? "bonus" : "normal",
        balance: useBonus ? getBonusBalance(userId) : getChipBalance(userId)
      });
    }, DICE_ANIMATION_MS);
  }
});

socket.on("pokerGetState", () => {
  if (socket.isBot) return;
  socket.emit("pokerState", pokerBuildStateFor(socket.userId || null));
});
 
socket.on("pokerSit", (data) => {
  if (!socket.userId || socket.isBot) return;
  const userId = socket.userId;
  if (pokerFindUserSeatIndex(userId) !== -1) return;
 
  const seatIndex = Math.floor(Number(data?.seatIndex));
  if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= POKER_SEATS) return;
  if (pokerTable.seats[seatIndex]) { socket.emit("pokerError", { msg: "Seat is taken." }); return; }
 
  const buyIn = Math.floor(Number(data?.buyIn));
  const balance = getChipBalance(userId);
  if (!Number.isFinite(buyIn) || buyIn < POKER_MIN_BUYIN) {
    socket.emit("pokerError", { msg: `Minimum buy-in is ${POKER_MIN_BUYIN} chips.` });
    return;
  }
  if (buyIn > POKER_MAX_BUYIN) {
    socket.emit("pokerError", { msg: `Maximum buy-in is ${POKER_MAX_BUYIN} chips.` });
    return;
  }
  if (buyIn > balance) {
    socket.emit("pokerError", { msg: "Insufficient XP for that buy-in." });
    return;
  }
 
  adjustUserXp(userId, -buyIn * BJ_XP_PER_CHIP);
 
  const user = onlineUsers.get(userId) || allUsers.get(userId) || {};
  pokerTable.seats[seatIndex] = {
    userId,
    username: user.username || "Anonymous",
    avatar: user.avatar || "/avatars/default1.png",
    chips: buyIn,
    cards: [],
    folded: false,
    allIn: false,
    inHand: false,
    betThisRound: 0,
    totalBet: 0,
    actedThisRound: false,
    sittingOut: false
  };
 
  console.log(`♠️ ${user.username} sat at poker seat ${seatIndex} with ${buyIn} chips`);
 
  const occ = pokerOccupiedSeats();
  if (pokerTable.stage === "waiting" && occ.length >= 2) {
    pokerStartHand();
  } else {
    pokerBroadcastState();
  }
});
 
socket.on("pokerLeave", () => {
  if (!socket.userId || socket.isBot) return;
  const idx = pokerFindUserSeatIndex(socket.userId);
  if (idx === -1) return;
  const seat = pokerTable.seats[idx];

  if (seat.inHand && pokerTable.stage !== "waiting" && pokerTable.stage !== "showdown") {
    seat.folded = true;
    seat.sittingOut = true;
    if (idx === pokerTable.currentTurnIndex) pokerAfterAction(idx);
  }

  if (seat.chips > 0) adjustUserXp(socket.userId, seat.chips * BJ_XP_PER_CHIP);
  pokerTable.seats[idx] = null;
  console.log(`♠️ ${seat.username} left the poker table with ${seat.chips} chips`);
  pokerBroadcastState();
  socket.emit("pokerState", pokerBuildStateFor(socket.userId));
});
 
socket.on("pokerAction", (data) => {
  if (!socket.userId || socket.isBot) return;
  const action = data?.action;
  if (action === "fold") pokerHandleFold(socket.userId);
  else if (action === "check") pokerHandleCheck(socket.userId);
  else if (action === "call") pokerHandleCall(socket.userId);
  else if (action === "raise") pokerHandleBetRaise(socket.userId, data?.amount);
});

socket.on("bjGetState", () => {
  if (socket.isBot) return;
  socket.emit("bjState", bjBuildStateFor(socket.userId || null));
});

socket.on("bjSit", (data) => {
  if (!socket.userId || socket.isBot) return;
  const userId = socket.userId;
  if (bjFindUserSeatIndex(userId) !== -1) return;

  const seatIndex = Math.floor(Number(data?.seatIndex));
  if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= BJ_SEATS) return;
  if (bjTable.seats[seatIndex]) { socket.emit("bjError", { msg: "Seat is taken." }); return; }

  const user = onlineUsers.get(userId) || allUsers.get(userId) || {};
  bjTable.seats[seatIndex] = {
    userId,
    username: user.username || "Anonymous",
    avatar: user.avatar || "/avatars/default1.png",
    chips: 0, 
    bet: 0,
    hand: [],
    done: false,
    busted: false,
    doubled: false,
    sittingOut: false,
    result: null
  };

  console.log(`🃏 ${user.username} sat at blackjack seat ${seatIndex}`);
  bjBroadcastState();
  bjMaybeStartBettingRound();
});

socket.on("bjLeave", () => {
  if (!socket.userId || socket.isBot) return;
  const idx = bjFindUserSeatIndex(socket.userId);
  if (idx === -1) return;
  const s = bjTable.seats[idx];

  if (bjTable.stage === "playing" && s.bet > 0 && !s.done) {
    s.done = true;
    s.result = { type: "lose", text: "Left table" };
    if (idx === bjTable.currentTurnIndex) bjAdvanceTurn(idx);
  }

  bjTable.seats[idx] = null;
  console.log(`🃏 ${s.username} left the blackjack table`);
  bjBroadcastState();
  socket.emit("bjState", bjBuildStateFor(socket.userId));
});

socket.on("bjPlaceBet", (data) => {
  if (!socket.userId || socket.isBot) return;
  const idx = bjFindUserSeatIndex(socket.userId);
  if (idx === -1) { socket.emit("bjError", { msg: "Sit down first." }); return; }
  if (bjTable.stage !== "betting" && bjTable.stage !== "waiting") {
    socket.emit("bjError", { msg: "Betting is closed for this hand." });
    return;
  }

  const s = bjTable.seats[idx];
  const amount = Math.floor(Number(data?.amount));
  const balance = getChipBalance(socket.userId); 

  if (!Number.isFinite(amount) || amount < BJ_MIN_BET) {
    socket.emit("bjError", { msg: `Minimum bet is ${BJ_MIN_BET} chip.` });
    return;
  }
  if (amount > BJ_MAX_BET_CHIPS) {
    socket.emit("bjError", { msg: `Max bet is ${BJ_MAX_BET_CHIPS} chips.` });
    return;
  }
  if (amount > balance) {
    socket.emit("bjError", { msg: "Insufficient XP for that bet." });
    return;
  }

  
  s.bet = amount;

  if (bjTable.stage === "waiting") {
    bjBroadcastState();
    bjMaybeStartBettingRound();
  } else {
    bjBroadcastState();
  }
});

function bjRequireTurn(socket) {
  if (!socket.userId || socket.isBot) return null;
  const idx = bjFindUserSeatIndex(socket.userId);
  if (idx === -1 || idx !== bjTable.currentTurnIndex || bjTable.stage !== "playing") return null;
  return idx;
}

socket.on("bjHit", () => {
  const idx = bjRequireTurn(socket);
  if (idx === null) return;
  const s = bjTable.seats[idx];
  s.hand.push(bjTable.deck.pop());
  if (bjHandTotal(s.hand) >= 21) {
    s.done = true;
    if (bjHandTotal(s.hand) > 21) s.busted = true;
    bjAdvanceTurn(idx);
  } else {
    bjBroadcastState();
  }
});

socket.on("bjStand", () => {
  const idx = bjRequireTurn(socket);
  if (idx === null) return;
  bjTable.seats[idx].done = true;
  bjAdvanceTurn(idx);
});

socket.on("bjDouble", () => {
  const idx = bjRequireTurn(socket);
  if (idx === null) return;
  const s = bjTable.seats[idx];
  if (s.hand.length !== 2) return;
  const balance = getChipBalance(socket.userId);
  if (balance < s.bet) { socket.emit("bjError", { msg: "Insufficient XP to double." }); return; }

  
  s.bet *= 2;
  s.doubled = true;
  s.hand.push(bjTable.deck.pop());
  if (bjHandTotal(s.hand) > 21) s.busted = true;
  s.done = true;
  bjAdvanceTurn(idx);
});

socket.on("pepeGetHighscore", () => {
  socket.emit("pepeHighscoreState", pepeHighscore);
});

socket.on("pepeRunStart", () => {
  if (!socket.userId || socket.isBot) return;
  pepeRunStarts.set(socket.userId, Date.now());
});

socket.on("pepeSubmitScore", (data) => {
  if (!socket.userId || socket.isBot) return;
  const userId = socket.userId;

  const startedAt = pepeRunStarts.get(userId);
  pepeRunStarts.delete(userId); 

  if (!startedAt) return; 

  const score = Math.floor(Number(data?.score));
  if (!Number.isFinite(score) || score < 0) return;

  const elapsedSeconds = (Date.now() - startedAt) / 1000;
  const maxPlausible = elapsedSeconds * PEPE_SCORE_RATE_CAP * PEPE_RATE_BUFFER;

  if (score > maxPlausible) {
    console.log(`🚩 Rejected implausible Pepe Runner score: ${score} from ${onlineUsers.get(userId)?.username} (elapsed ${elapsedSeconds.toFixed(1)}s, cap ${maxPlausible.toFixed(0)})`);
    return; 
  }

  if (score > pepeHighscore.score) {
    const user = onlineUsers.get(userId) || allUsers.get(userId) || {};
    pepeHighscore = {
      username: user.username || "Anonymous",
      userId,
      score,
      ts: Date.now()
    };

     const improvedLeaderboard = pepeRecordScore(userId, score);
     if (improvedLeaderboard) pepeBroadcastLeaderboard();
   
    savePepeHighscore();
    io.emit("pepeHighscoreState", pepeHighscore);
    console.log(`🐸 New Pepe Runner high score: ${pepeHighscore.username} - ${score}`);
  }
});

socket.on("pepeLeaderboardGet", () => {
  if (socket.isBot) return;
  socket.emit("pepeLeaderboardState", pepeBuildLeaderboardPayload());
});

socket.on("pongJoinQueue", () => {
  if (!socket.userId || socket.isBot) return;
  const userId = socket.userId;
 
  if (pongUserRoom.has(userId)) {
    const room = pongRooms.get(pongUserRoom.get(userId));
    if (room) { socket.emit("pongState", pongBuildState(room)); return; }
  }
  if (pongQueue.includes(userId)) return;
 
  pongQueue.push(userId);
  socket.emit("pongQueued");
 
  if (pongQueue.length >= 2) {
    const a = pongQueue.shift();
    const b = pongQueue.shift();
    if (a === b) { pongQueue.push(a); return; }
    pongCreateRoom(a, b);
  }
});
 
socket.on("pongLeaveQueue", () => {
  if (!socket.userId) return;
  pongQueue = pongQueue.filter(id => id !== socket.userId);
});
 
socket.on("pongInput", (data) => {
  if (!socket.userId) return;
  const roomId = pongUserRoom.get(socket.userId);
  if (!roomId) return;
  const room = pongRooms.get(roomId);
  if (!room || room.status !== "playing") return;
  const player = room.players.find(p => p.userId === socket.userId);
  if (!player) return;
  if (typeof data?.y === "number") {
    player.y = Math.max(0, Math.min(PONG_HEIGHT - PONG_PADDLE_HEIGHT, data.y - PONG_PADDLE_HEIGHT / 2));
  }
  if (typeof data?.up === "boolean") player.keys.up = data.up;
  if (typeof data?.down === "boolean") player.keys.down = data.down;
});
 
socket.on("pongServe", () => {
  if (!socket.userId) return;
  const roomId = pongUserRoom.get(socket.userId);
  if (!roomId) return;
  const room = pongRooms.get(roomId);
  if (!room || room.status !== "serving") return;
 
  const served = pongServeBall(room, socket.userId);
  if (!served) {
    socket.emit("pongError", { msg: "It's not your serve." });
    return;
  }
  pongBroadcastState(room);
});
 
socket.on("pongLeaveGame", () => {
  if (!socket.userId) return;
  pongHandleLeave(socket.userId, "left");
});

socket.on("weedGetState", () => {
  if (!socket.userId || socket.isBot) return;
  wgBroadcastState(socket.userId);
});
 
socket.on("weedPlant", (data) => {
  if (!socket.userId || socket.isBot) return;
  const userId = socket.userId;

  if (isGameBanned(userId)) {
    const username = onlineUsers.get(userId)?.username || allUsers.get(userId)?.username;
    console.log(`🚫 Blocked weed-grow action from banned user: ${username}`);
    emitToUser(userId, "weedError", { msg: "You've been restricted from Weed Grow by an admin." });
    return;
  }

  const potIndex = Math.floor(Number(data?.potIndex));
  if (!Number.isInteger(potIndex) || potIndex < 0 || potIndex >= WG_POT_COUNT) return;

  const garden = wgGetGarden(userId);
  if (garden[potIndex].stage !== "empty") {
    emitToUser(userId, "weedError", { msg: "That pot is already in use." });
    return;
  }

  const now = Date.now();
  const pot = {
    stage: "alive",
    plantedAt: now,
    wateredAt: now,
    nextWaterDueAt: now + wgRandomWaterInterval(),
    wilted: false,
    wiltedAt: null,
    growAccumMs: 0,
    growSince: now,
    timer: null
  };
  garden[potIndex] = pot;
  wgScheduleNext(userId, potIndex, pot);

  emitToUser(userId, "weedPlanted", { potIndex, pot: wgSerializePot(pot) });
  console.log(`🌱 ${onlineUsers.get(userId)?.username || userId} planted pot ${potIndex}`);
});

socket.on("weedWater", (data) => {
  if (!socket.userId || socket.isBot) return;
  const userId = socket.userId;

  if (isGameBanned(userId)) {
    emitToUser(userId, "weedError", { msg: "You've been restricted from Weed Grow by an admin." });
    return;
  }

  const potIndex = Math.floor(Number(data?.potIndex));
  if (!Number.isInteger(potIndex) || potIndex < 0 || potIndex >= WG_POT_COUNT) return;

  const garden = wgGetGarden(userId);
  const pot = garden[potIndex];
  if (!pot || pot.stage === "empty") {
    emitToUser(userId, "weedError", { msg: "Nothing planted in that pot." });
    return;
  }

  const now = Date.now();
  if (!pot.wilted && wgProgress(pot, now) >= 1) {
    emitToUser(userId, "weedError", { msg: "That plant is already fully grown." });
    return;
  }

const needsWater = pot.wilted || (pot.nextWaterDueAt !== null && now >= pot.nextWaterDueAt);
if (!needsWater) {
  const name = onlineUsers.get(userId)?.username || userId;
  console.warn(`🚫 [weedgrow] ${name} tried to water pot ${potIndex} but it doesn't need water`);
  return;
}

  if (pot.wilted) {
    pot.wilted = false;
    pot.wiltedAt = null;
    pot.growSince = now;
  }
  pot.wateredAt = now;
  pot.nextWaterDueAt = now + wgRandomWaterInterval();

  wgScheduleNext(userId, potIndex, pot);
  emitToUser(userId, "weedWatered", { potIndex, pot: wgSerializePot(pot) });
});

socket.on("weedHarvest", (data) => {
  if (!socket.userId || socket.isBot) return;
  const userId = socket.userId;

  if (isGameBanned(userId)) {
    const username = onlineUsers.get(userId)?.username || allUsers.get(userId)?.username;
    console.log(`🚫 Blocked weed-grow action from banned user: ${username}`);
    emitToUser(userId, "weedError", { msg: "You've been restricted from Weed Grow by an admin." });
    return;
  }

  const potIndex = Math.floor(Number(data?.potIndex));
  if (!Number.isInteger(potIndex) || potIndex < 0 || potIndex >= WG_POT_COUNT) return;

  const garden = wgGetGarden(userId);
  const pot = garden[potIndex];
  if (!pot || pot.stage === "empty") {
    emitToUser(userId, "weedError", { msg: "Nothing to harvest." });
    return;
  }
  if (wgProgress(pot, Date.now()) < 1) {
    emitToUser(userId, "weedError", { msg: "That plant isn't ready yet." });
    return;
  }

  wgClearTimer(pot);
  garden[potIndex] = wgEmptyPot();

  addBonusXp(userId, WG_HARVEST_XP);
  wgRecordHarvest(userId);
  wgBroadcastLeaderboard();

  emitToUser(userId, "weedHarvested", { potIndex, pot: wgSerializePot(garden[potIndex]), xpAwarded: WG_HARVEST_XP });
  console.log(`🌳 ${onlineUsers.get(userId)?.username || userId} harvested pot ${potIndex} (+${WG_HARVEST_XP} XP)`);
});
 
socket.on("weedLeaderboardGet", () => {
  if (socket.isBot) return;
  socket.emit("weedLeaderboardState", wgBuildLeaderboardPayload());
});

socket.on("slotsGetState", () => {
  if (!socket.userId || socket.isBot) return;
  socket.emit("slotsState", {
    balance: getChipBalance(socket.userId),
    maxBet: SLOTS_MAX_BET_CHIPS,
    symbols: SLOTS_SYMBOLS.map((s) => s.id),
    payouts: SLOTS_PAYOUTS,
    freeSpins: slotsFreeSpinsState(socket.userId)
  });
});
 
socket.on("slotsSpin", (data) => {
  if (!socket.userId || socket.isBot) return;
  const userId = socket.userId;

  const freeSession = slotsFreeSpinSessions.get(userId);
  const isFreeSpin = !!freeSession && freeSession.remaining > 0;

  const useBonus = isFreeSpin ? freeSession.account === "bonus" : data?.account === "bonus";
  const amount = isFreeSpin ? SLOTS_FREE_SPIN_BET : Math.floor(Number(data?.amount));
  const balance = useBonus ? getBonusBalance(userId) : getChipBalance(userId);

  if (!isFreeSpin) {
    if (!Number.isFinite(amount) || amount <= 0) {
      socket.emit("slotsError", { msg: "Invalid bet." });
      return;
    }
    if (amount > balance) {
      socket.emit("slotsError", { msg: "Insufficient XP for that bet." });
      return;
    }
    if (amount > SLOTS_MAX_BET_CHIPS) {
      socket.emit("slotsError", { msg: `Max bet is ${SLOTS_MAX_BET_CHIPS} chips.` });
      return;
    }
    if (useBonus) placeBonusBet(userId, amount);
    else adjustUserXp(userId, -amount * BJ_XP_PER_CHIP);
  } else {
    freeSession.remaining--;
    if (freeSession.remaining <= 0) slotsFreeSpinSessions.delete(userId);
  }

  const reels = slotsSpinReels();
  const { multiplier, payoutChips } = slotsEvaluate(reels, amount);

  socket.emit("slotsResult", {
    reels,
    multiplier,
    betChips: amount,
    payoutChips,
    account: useBonus ? "bonus" : "normal",
    balance: useBonus ? getBonusBalance(userId) : getChipBalance(userId),
    freeSpin: isFreeSpin,
    freeSpinsRemaining: isFreeSpin ? (freeSession ? freeSession.remaining : 0) : 0
  });

  if (payoutChips > 0) {
    setTimeout(() => {
      if (useBonus) {
        creditBonusWin(userId, payoutChips);
      } else {
        adjustUserXp(userId, payoutChips * BJ_XP_PER_CHIP);
        io.emit("userData", {
          id: userId,
          xp: allUsers.get(userId)?.xp || 0,
          level: allUsers.get(userId)?.level || 1,
        });
      }
      socket.emit("slotsPayoutCredited", {
        payoutChips,
        account: useBonus ? "bonus" : "normal",
        balance: useBonus ? getBonusBalance(userId) : getChipBalance(userId),
      });
    }, SLOTS_ANIMATION_MS);
  } else {
    setTimeout(() => {
      socket.emit("slotsPayoutCredited", {
        payoutChips: 0,
        account: useBonus ? "bonus" : "normal",
        balance: useBonus ? getBonusBalance(userId) : getChipBalance(userId),
      });
    }, SLOTS_ANIMATION_MS);
  }

  console.log(
    `🎰 Slots: ${onlineUsers.get(userId)?.username || userId} ${isFreeSpin ? "(FREE SPIN)" : `bet ${amount}`} → [${reels.join(", ")}] (x${multiplier}) → ${payoutChips}`
  );
});


socket.on("airstrikeGetState", () => {
  if (socket.isBot) return;
  socket.emit("airstrikeState", asBuildStateFor(socket.userId));
});
 
socket.on("airstrikeLeaderboardGet", () => {
  if (socket.isBot) return;
  socket.emit("airstrikeLeaderboardState", asBuildLeaderboardPayload());
});
 
socket.on("airstrikeBet", (data) => {
  if (!socket.userId || socket.isBot) return;
  const userId = socket.userId;
 
  if (airstrikeRound.state !== "waiting") {
    socket.emit("airstrikeError", { msg: "Betting is closed for this round." });
    return;
  }
  if (airstrikeRound.bets.has(userId)) {
    socket.emit("airstrikeError", { msg: "You already placed a bet this round." });
    return;
  }
 
  const amount = Math.floor(Number(data?.amount));
  const useBonus = data?.account === "bonus";
  const balance = useBonus ? getBonusBalance(userId) : getChipBalance(userId);
 
  if (!Number.isFinite(amount) || amount <= 0) {
    socket.emit("airstrikeError", { msg: "Invalid bet." });
    return;
  }
  if (amount > AS_MAX_BET_CHIPS) {
    socket.emit("airstrikeError", { msg: `Max bet is ${AS_MAX_BET_CHIPS} chips.` });
    return;
  }
  if (amount > balance) {
    socket.emit("airstrikeError", { msg: "Insufficient XP for that bet." });
    return;
  }
 
  if (useBonus) placeBonusBet(userId, amount);
  else adjustUserXp(userId, -amount * BJ_XP_PER_CHIP);
 
  const user = onlineUsers.get(userId) || allUsers.get(userId) || {};
  airstrikeRound.bets.set(userId, {
    amount,
    useBonus,
    cashedOutAt: null,
    username: user.username || "Anonymous",
    avatar: user.avatar || "/avatars/default1.png"
  });
 
  asBroadcastState();
  console.log(`✈️ Airstrike bet: ${user.username} bet ${amount} chips (round #${airstrikeRound.roundId + 1})`);
});
 
socket.on("airstrikeCashout", () => {
  if (!socket.userId || socket.isBot) return;
  const userId = socket.userId;
 
  if (airstrikeRound.state !== "flying") return;
  const bet = airstrikeRound.bets.get(userId);
  if (!bet || bet.cashedOutAt) return;
 
  const multiplier = asCurrentMultiplier();
  bet.cashedOutAt = multiplier;
  const payoutChips = Math.floor(bet.amount * multiplier);
 
  if (bet.useBonus) creditBonusWin(userId, payoutChips);
  else adjustUserXp(userId, payoutChips * BJ_XP_PER_CHIP);
 
  socket.emit("airstrikeCashoutResult", {
    multiplier,
    payoutChips,
    account: bet.useBonus ? "bonus" : "normal",
    balance: bet.useBonus ? getBonusBalance(userId) : getChipBalance(userId)
  });
 
  asBroadcastState();
  console.log(`💰 Airstrike cashout: ${bet.username} at ${multiplier.toFixed(2)}x -> ${payoutChips} chips`);
});

socket.on("aviaGetLeaderboard", () => {
  if (socket.isBot) return;
  socket.emit("aviaLeaderboard", aviaBuildLeaderboardPayload());
});


socket.on("aviaGetState", () => {
  if (!socket.userId || socket.isBot) return;
  const session = aviaSessions.get(socket.userId);
  if (!session || !session.active) {
    socket.emit("aviaState", { active: false, balance: getChipBalance(socket.userId) });
    return;
  }
  socket.emit("aviaState", {
    active: true,
    betChips: session.betChips,
    speedKey: session.speedKey,
    unitsPerSec: AVIA_SPEEDS[session.speedKey].unitsPerSec,
    trackLength: AVIA_TRACK_LENGTH,
    stars: session.stars,
    startedAt: session.startedAt,
    account: session.useBonus ? "bonus" : "normal"
  });
});
 
socket.on("aviaStart", (data) => {
  if (!socket.userId || socket.isBot) return;
  const userId = socket.userId;
 
  const existing = aviaSessions.get(userId);
  if (existing && existing.active) {
    socket.emit("aviaError", { msg: "A flight is already in progress." });
    return;
  }
 
  const amount = Math.floor(Number(data?.amount));
  const speedKey = typeof data?.speed === "string" ? data.speed : "";
  const useBonus = data?.account === "bonus";
  const speed = AVIA_SPEEDS[speedKey];
  const balance = useBonus ? getBonusBalance(userId) : getChipBalance(userId);
 
  if (!speed) {
    socket.emit("aviaError", { msg: "Invalid speed." });
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    socket.emit("aviaError", { msg: "Invalid bet." });
    return;
  }
  if (amount > AVIA_MAX_BET_CHIPS) {
    socket.emit("aviaError", { msg: `Max bet is ${AVIA_MAX_BET_CHIPS} chips.` });
    return;
  }
  if (amount > balance) {
    socket.emit("aviaError", { msg: "Insufficient XP for that bet." });
    return;
  }
 
  if (useBonus) placeBonusBet(userId, amount);
  else adjustUserXp(userId, -amount * BJ_XP_PER_CHIP);
 
  const stars = aviaGenerateStars(AVIA_TRACK_LENGTH);
  const crashDistance = aviaGenerateCrashDistance(speed.lambda);
  const endDistance = Math.min(crashDistance, AVIA_TRACK_LENGTH);
  const endMs = (endDistance / speed.unitsPerSec) * 1000;
  
 
  const session = {
    active: true,
    betChips: amount,
    useBonus,
    speedKey,
    startedAt: Date.now(),
    crashDistance,
    stars,
    timer: null
  };
  session.timer = setTimeout(() => aviaResolveEnd(userId), endMs);
  aviaSessions.set(userId, session);
 
  socket.emit("aviaStarted", {
    betChips: amount,
    speedKey,
    unitsPerSec: speed.unitsPerSec,
    trackLength: AVIA_TRACK_LENGTH,
    stars,
    startedAt: session.startedAt,
    account: useBonus ? "bonus" : "normal",
    balance: useBonus ? getBonusBalance(userId) : getChipBalance(userId)
  });
 
  console.log(`🛫 Avia start: ${onlineUsers.get(userId)?.username || userId} bet ${amount} on ${speed.label}`);
});
 
socket.on("aviaCashout", () => {
  if (!socket.userId || socket.isBot) return;
  const userId = socket.userId;
  const session = aviaSessions.get(userId);
  if (!session || !session.active) {
    socket.emit("aviaError", { msg: "No active flight." });
    return;
  }
 
  const speed = AVIA_SPEEDS[session.speedKey];
  const elapsedSec = (Date.now() - session.startedAt) / 1000;
  const distanceNow = elapsedSec * speed.unitsPerSec;
  if (distanceNow >= session.crashDistance) {
    socket.emit("aviaError", { msg: "Too late - the plane already went down." });
    return;
  }
 
  const cappedDistance = Math.min(distanceNow, AVIA_TRACK_LENGTH);
  const multiplier = aviaMultiplierAt(session.stars, cappedDistance);
  const payoutChips = Math.floor(session.betChips * multiplier);
 
  aviaClearTimer(session);
  session.active = false;
  aviaSessions.delete(userId);
 
  if (session.useBonus) creditBonusWin(userId, payoutChips);
  else adjustUserXp(userId, payoutChips * BJ_XP_PER_CHIP);
 
 socket.emit("aviaCashoutResult", {
    distance: cappedDistance,
    multiplier,
    payoutChips,
    account: session.useBonus ? "bonus" : "normal",
    balance: session.useBonus ? getBonusBalance(userId) : getChipBalance(userId)
  });

  if (aviaRecordResult(userId, multiplier, payoutChips)) aviaBroadcastLeaderboard();


 
  console.log(`💰 Avia cashout: ${onlineUsers.get(userId)?.username || userId} bailed at ${multiplier.toFixed(2)}x -> ${payoutChips}`);
});



socket.on("dragonTowerGetState", () => {
  if (!socket.userId || socket.isBot) return;
  dtEmitState(socket.userId, socket);
});

socket.on("dragonTowerLeaderboardGet", () => {
  if (socket.isBot) return;
  socket.emit("dragonTowerLeaderboard", dtBuildLeaderboardPayload());
});



socket.on("dragonTowerStart", (data) => {
  if (!socket.userId || socket.isBot) return;
  const userId = socket.userId;

  const existing = dragonTowerSessions.get(userId);
  if (existing && existing.active) {
    socket.emit("dragonTowerError", { msg: "A climb is already in progress." });
    return;
  }

  const amount = Math.floor(Number(data?.amount));
  const difficulty = typeof data?.difficulty === "string" ? data.difficulty : "";
  const useBonus = data?.account === "bonus";
  const cfg = DT_DIFFICULTIES[difficulty];
  const balance = useBonus ? getBonusBalance(userId) : getChipBalance(userId);

  if (!cfg) {
    socket.emit("dragonTowerError", { msg: "Invalid difficulty." });
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    socket.emit("dragonTowerError", { msg: "Invalid bet." });
    return;
  }
  if (amount > DT_MAX_BET_CHIPS) {
    socket.emit("dragonTowerError", { msg: `Max bet is ${DT_MAX_BET_CHIPS} chips.` });
    return;
  }
  if (amount > balance) {
    socket.emit("dragonTowerError", { msg: "Insufficient XP for that bet." });
    return;
  }

  if (useBonus) placeBonusBet(userId, amount);
  else adjustUserXp(userId, -amount * BJ_XP_PER_CHIP);
  const rowMines = [];
  for (let i = 0; i < DT_ROWS; i++) rowMines.push(dtGenerateRowMines(cfg));

  const session = {
    active: true,
    betChips: amount,
    useBonus,
    difficulty,
    currentLevel: 0,       
    rowMines,
    revealedRows: []
  };
  dragonTowerSessions.set(userId, session);

  socket.emit("dragonTowerStarted", {
    difficulty,
    tiles: cfg.tiles,
    rows: DT_ROWS,
    betChips: amount,
    account: useBonus ? "bonus" : "normal",
    balance: useBonus ? getBonusBalance(userId) : getChipBalance(userId)
  });

  console.log(`🐉 Dragon Tower start: ${onlineUsers.get(userId)?.username || userId} bet ${amount} on ${difficulty}`);
});

socket.on("dragonTowerPick", (data) => {
  if (!socket.userId || socket.isBot) return;
  const userId = socket.userId;
  const session = dragonTowerSessions.get(userId);
  if (!session || !session.active) {
    socket.emit("dragonTowerError", { msg: "No active climb." });
    return;
  }

  const cfg = DT_DIFFICULTIES[session.difficulty];
  const tileIndex = Math.floor(Number(data?.tileIndex));
  if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex >= cfg.tiles) {
    socket.emit("dragonTowerError", { msg: "Invalid tile." });
    return;
  }
  if (session.currentLevel >= DT_ROWS) {
    socket.emit("dragonTowerError", { msg: "Tower already complete." });
    return;
  }

  const rowIdx = session.currentLevel;
  const mines = session.rowMines[rowIdx];
  const hitMine = mines.has(tileIndex);

  if (hitMine) {
    session.active = false;
    const fullRow = mines;
    socket.emit("dragonTowerDied", {
      level: rowIdx,
      pickedIndex: tileIndex,
      mineIndices: Array.from(fullRow),
      betChips: session.betChips,
      account: session.useBonus ? "bonus" : "normal",
      balance: session.useBonus ? getBonusBalance(userId) : getChipBalance(userId)
    });
    dragonTowerSessions.delete(userId);
    console.log(`💀 Dragon Tower loss: ${onlineUsers.get(userId)?.username || userId} died on level ${rowIdx + 1}`);
    return;
  }

  session.currentLevel++;
  session.revealedRows.push({ level: rowIdx, pickedIndex: tileIndex });
  const multiplier = dtMultiplierForLevel(cfg, session.currentLevel);

  const towerComplete = session.currentLevel >= DT_ROWS;

  if (towerComplete) {
    const payoutChips = Math.floor(session.betChips * multiplier);
    session.active = false;

    if (session.useBonus) creditBonusWin(userId, payoutChips);
    else adjustUserXp(userId, payoutChips * BJ_XP_PER_CHIP);

    if (dtRecordResult(userId, multiplier, payoutChips)) dtBroadcastLeaderboard();

    socket.emit("dragonTowerTileResult", {
      level: rowIdx,
      pickedIndex: tileIndex,
      hitMine: false,
      multiplier,
      towerComplete: true
    });
    socket.emit("dragonTowerFullClear", {
      multiplier,
      payoutChips,
      account: session.useBonus ? "bonus" : "normal",
      balance: session.useBonus ? getBonusBalance(userId) : getChipBalance(userId)
    });

    dragonTowerSessions.delete(userId);
    console.log(`🏆 Dragon Tower full clear: ${onlineUsers.get(userId)?.username || userId} -> ${multiplier.toFixed(2)}x -> ${payoutChips}`);
    return;
  }

  socket.emit("dragonTowerTileResult", {
    level: rowIdx,
    pickedIndex: tileIndex,
    hitMine: false,
    multiplier,
    towerComplete: false
  });
});

socket.on("weedGameBan", (data) => {
  if (!socket.isAdmin) { socket.emit("error", { msg: "❌ Admin only." }); return; }
  const targetUsername = stripAtPrefix(data?.target || "").toLowerCase();
  if (!targetUsername) return;

  let targetId = null;
  let targetUser = null;
  onlineUsers.forEach((u, id) => {
    if (u.username.toLowerCase() === targetUsername) { targetId = id; targetUser = u; }
  });

  if (!targetId) {
    let dbTargetId = null;
    allUsers.forEach((u, id) => { if (u.username.toLowerCase() === targetUsername) dbTargetId = id; });
    if (!dbTargetId) {
      socket.emit("error", { msg: `❌ User "${data?.target}" not found.` });
      return;
    }
    const dbUser = allUsers.get(dbTargetId);
    dbUser.weedGameBanned = true;
    allUsers.set(dbTargetId, dbUser);
    saveUsers();
    socket.emit("systemMessage", { msg: `✅ ${dbUser.username} restricted from Weed Grow (offline).`, type: "success" });
    console.log(`🚫 Weed Grow ban (offline user): ${dbUser.username} by ${onlineUsers.get(socket.userId)?.username}`);
    return;
  }

  const dbUser = allUsers.get(targetId);
  if (dbUser) {
    dbUser.weedGameBanned = true;
    allUsers.set(targetId, dbUser);
    saveUsers();
  }

  emitToUser(targetId, "weedError", { msg: "You've been restricted from Weed Grow by an admin." });
  socket.emit("systemMessage", { msg: `✅ ${targetUser.username} restricted from Weed Grow.`, type: "success" });
  console.log(`🚫 Weed Grow ban: ${targetUser.username} by ${onlineUsers.get(socket.userId)?.username}`);
});

socket.on("weedGameUnban", (data) => {
  if (!socket.isAdmin) { socket.emit("error", { msg: "❌ Admin only." }); return; }
  const targetUsername = stripAtPrefix(data?.target || "").toLowerCase();
  if (!targetUsername) return;

  let targetId = null;
  allUsers.forEach((u, id) => { if (u.username.toLowerCase() === targetUsername) targetId = id; });

  if (!targetId) {
    socket.emit("error", { msg: `❌ User "${data?.target}" not found.` });
    return;
  }

  const dbUser = allUsers.get(targetId);
  dbUser.weedGameBanned = false;
  allUsers.set(targetId, dbUser);
  saveUsers();

  emitToUser(targetId, "systemMessage", { msg: "Your Weed Grow access has been restored.", type: "success" });
  socket.emit("systemMessage", { msg: `✅ ${dbUser.username} restored to Weed Grow.`, type: "success" });
  console.log(`✅ Weed Grow unban: ${dbUser.username} by ${onlineUsers.get(socket.userId)?.username}`);
});

socket.on("dragonTowerCashout", () => {
  if (!socket.userId || socket.isBot) return;
  const userId = socket.userId;
  const session = dragonTowerSessions.get(userId);
  if (!session || !session.active) {
    socket.emit("dragonTowerError", { msg: "No active climb." });
    return;
  }
  if (session.currentLevel === 0) {
    socket.emit("dragonTowerError", { msg: "Clear at least one level before cashing out." });
    return;
  }

  const cfg = DT_DIFFICULTIES[session.difficulty];
  const multiplier = dtMultiplierForLevel(cfg, session.currentLevel);
  const payoutChips = Math.floor(session.betChips * multiplier);
  session.active = false;

  if (session.useBonus) creditBonusWin(userId, payoutChips);
  else adjustUserXp(userId, payoutChips * BJ_XP_PER_CHIP);

  if (dtRecordResult(userId, multiplier, payoutChips)) dtBroadcastLeaderboard();

  socket.emit("dragonTowerCashoutResult", {
    multiplier,
    payoutChips,
    level: session.currentLevel,
    account: session.useBonus ? "bonus" : "normal",
    balance: session.useBonus ? getBonusBalance(userId) : getChipBalance(userId)
  });

  dragonTowerSessions.delete(userId);
  console.log(`💰 Dragon Tower cashout: ${onlineUsers.get(userId)?.username || userId} at level ${session.currentLevel} (${multiplier.toFixed(2)}x) -> ${payoutChips}`);
});

socket.on("dartsGetState", () => {
  if (!socket.userId || socket.isBot) return;
  socket.emit("dartsState", {
    balance: getChipBalance(socket.userId),
    bonusBalance: getBonusBalance(socket.userId),
    maxBet: DARTS_MAX_BET_CHIPS,
    rings: DARTS_RINGS.map(r => ({ id: r.id, label: r.label, multiplier: r.multiplier }))
  });
});

socket.on("dartsLeaderboardGet", () => {
  if (socket.isBot) return;
  socket.emit("dartsLeaderboardState", dartsBuildLeaderboardPayload());
});

socket.on("dartsThrow", (data) => {
  if (!socket.userId || socket.isBot) return;
  const userId = socket.userId;
  const useBonus = data?.account === "bonus";

  const amount = Math.floor(Number(data?.amount));
  const balance = useBonus ? getBonusBalance(userId) : getChipBalance(userId);

  if (!Number.isFinite(amount) || amount <= 0) {
    socket.emit("dartsError", { msg: "Invalid bet." });
    return;
  }
  if (amount > balance) {
    socket.emit("dartsError", { msg: "Insufficient XP for that bet." });
    return;
  }
  if (amount > DARTS_MAX_BET_CHIPS) {
    socket.emit("dartsError", { msg: `Max bet is ${DARTS_MAX_BET_CHIPS} chips.` });
    return;
  }

  if (useBonus) placeBonusBet(userId, amount);
  else adjustUserXp(userId, -amount * BJ_XP_PER_CHIP);

  const ringIndex = dartsPickRing();
  const { multiplier, payoutChips, ring } = dartsEvaluate(ringIndex, amount);
  const angleDeg = crypto.randomInt(0, 3600) / 10;

  socket.emit("dartsResult", {
    ringIndex,
    ringId: ring.id,
    ringLabel: ring.label,
    angleDeg,
    multiplier,
    betChips: amount,
    payoutChips,
    account: useBonus ? "bonus" : "normal",
    balance: useBonus ? getBonusBalance(userId) : getChipBalance(userId)
  });

  if (payoutChips > 0) {
    setTimeout(() => {
      if (useBonus) {
        creditBonusWin(userId, payoutChips);
      } else {
        adjustUserXp(userId, payoutChips * BJ_XP_PER_CHIP);
        io.emit("userData", {
          id: userId,
          xp: allUsers.get(userId)?.xp || 0,
          level: allUsers.get(userId)?.level || 1
        });
      }
      if (dartsRecordWin(userId, payoutChips)) dartsBroadcastLeaderboard();
      socket.emit("dartsPayoutCredited", {
        payoutChips,
        account: useBonus ? "bonus" : "normal",
        balance: useBonus ? getBonusBalance(userId) : getChipBalance(userId)
      });
    }, DARTS_ANIMATION_MS);
  } else {
    setTimeout(() => {
      socket.emit("dartsPayoutCredited", {
        payoutChips: 0,
        account: useBonus ? "bonus" : "normal",
        balance: useBonus ? getBonusBalance(userId) : getChipBalance(userId)
      });
    }, DARTS_ANIMATION_MS);
  }

  console.log(`🎯 Darts: ${onlineUsers.get(userId)?.username || userId} bet ${amount} -> ${ring.label} (x${multiplier}) -> ${payoutChips}`);
});

socket.on("slotsBuyFreeSpins", (data) => {
  if (!socket.userId || socket.isBot) return;
  const userId = socket.userId;

  const existing = slotsFreeSpinSessions.get(userId);
  if (existing && existing.remaining > 0) {
    socket.emit("slotsError", { msg: "You already have free spins remaining." });
    return;
  }

  const useBonus = data?.account === "bonus";
  const balance = useBonus ? getBonusBalance(userId) : getChipBalance(userId);

  if (SLOTS_FREE_SPINS_COST > balance) {
    socket.emit("slotsError", { msg: "Insufficient XP to buy free spins." });
    return;
  }

  if (useBonus) placeBonusBet(userId, SLOTS_FREE_SPINS_COST);
  else adjustUserXp(userId, -SLOTS_FREE_SPINS_COST * BJ_XP_PER_CHIP);

  slotsFreeSpinSessions.set(userId, { remaining: SLOTS_FREE_SPINS_COUNT, account: useBonus ? "bonus" : "normal" });

  socket.emit("slotsFreeSpinsBought", {
    remaining: SLOTS_FREE_SPINS_COUNT,
    account: useBonus ? "bonus" : "normal",
    balance: useBonus ? getBonusBalance(userId) : getChipBalance(userId)
  });

  console.log(`🎰 Free spins bought: ${onlineUsers.get(userId)?.username || userId} paid ${SLOTS_FREE_SPINS_COST} for ${SLOTS_FREE_SPINS_COUNT} spins`);
});

socket.on("weedButtonClick", (data) => {
  if (!socket.userId || socket.isBot) return;
  const userId = socket.userId;
  const potIndex = Number(data?.potIndex);
  const action = ["plant", "water", "harvest"].includes(data?.action) ? data.action : "unknown";
  const serverTs = Date.now();

  console.log(`🖱️ [weedgrow] ${onlineUsers.get(userId)?.username || userId} ${socket.handshake.headers['user-agent'] || 'Unknown'} clicked ${action} (pot ${potIndex}) @ ${serverTs}`);

  if (!wgClickHistory.has(userId)) wgClickHistory.set(userId, []);
  const history = wgClickHistory.get(userId);
  history.push({ action, potIndex, ts: serverTs });
  if (history.length > WG_CLICK_HISTORY_MAX) history.shift();

  if (history.length >= 8) {
    const intervals = [];
    for (let i = 1; i < history.length; i++) {
      intervals.push(history[i].ts - history[i - 1].ts);
    }
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length;
    const stddev = Math.sqrt(variance);

    if (mean < WG_AUTOCLICK_INTERVAL_THRESHOLD_MS && stddev < WG_AUTOCLICK_VARIANCE_THRESHOLD) {
      console.warn(`🚨 [weedgrow] Possible autoclicker: ${onlineUsers.get(userId)?.username || userId} - mean interval ${mean.toFixed(1)}ms, stddev ${stddev.toFixed(1)}ms`);
  
    }
  }
});


socket.on("rouletteGetState", () => {
  if (socket.isBot) return;
  socket.emit("rouletteState", rouletteBuildStateFor(socket.userId || null));
});

socket.on("rouletteLeaderboardGet", () => {
  if (socket.isBot) return;
  socket.emit("rouletteLeaderboardState", rouletteBuildLeaderboardPayload());
});

socket.on("roulettePlaceBet", (data) => {
  if (!socket.userId || socket.isBot) return;
  const userId = socket.userId;


  if (rouletteRound.state !== "betting") {
    socket.emit("rouletteError", { msg: "Betting is closed for this round." });
    return;
  }

  const type = String(data?.type || "");
  const validTypes = Object.keys(ROULETTE_PAYOUTS);
  if (!validTypes.includes(type)) {
    socket.emit("rouletteError", { msg: "Invalid bet type." });
    return;
  }

  let number = null;
  if (type === "straight") {
    number = Math.floor(Number(data?.number));
    if (!Number.isInteger(number) || number < 0 || number > 36) {
      socket.emit("rouletteError", { msg: "Invalid number." });
      return;
    }
  }

  const amount = Math.floor(Number(data?.amount));
  const useBonus = data?.account === "bonus";
  const balance = useBonus ? getBonusBalance(userId) : getChipBalance(userId);

  if (!Number.isFinite(amount) || amount <= 0) {
    socket.emit("rouletteError", { msg: "Invalid bet amount." });
    return;
  }
  if (amount > ROULETTE_MAX_BET_CHIPS) {
    socket.emit("rouletteError", { msg: `Max bet is ${ROULETTE_MAX_BET_CHIPS} chips.` });
    return;
  }
  if (amount > balance) {
    socket.emit("rouletteError", { msg: "Insufficient balance for that bet." });
    return;
  }

  const existing = rouletteRound.bets.get(userId) || [];
  if (existing.length > 0 && existing[0].useBonus !== useBonus) {
    socket.emit("rouletteError", { msg: "You can't mix normal and bonus chips in the same round." });
    return;
  }

  if (useBonus) placeBonusBet(userId, amount);
  else adjustUserXp(userId, -amount * BJ_XP_PER_CHIP);

  existing.push({ type, number, amount, useBonus });
  rouletteRound.bets.set(userId, existing);

  socket.emit("rouletteBetPlaced", {
    type, number, amount,
    balance: useBonus ? getBonusBalance(userId) : getChipBalance(userId)
  });
  rouletteBroadcastState();

  const user = onlineUsers.get(userId) || {};
  console.log(`🎡 Roulette bet: ${user.username || userId} bet ${amount} on ${type}${number !== null ? " #" + number : ""}`);
});

socket.on("diceLeaderboardGet", () => {
  if (socket.isBot) return;
  socket.emit("diceLeaderboardState", diceBuildLeaderboardPayload());
});
});


function getClientIp(socket) {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const cfIp = socket.handshake.headers['cf-connecting-ip'];
  if (cfIp) return Array.isArray(cfIp) ? cfIp[0] : cfIp;

  return socket.handshake.address || 'unknown';
}
setInterval(() => {
  const now = Date.now();
  let changed = false;

  onlineUsers.forEach((user, userId) => {
    const inactiveTime = now - (user.lastActive || 0);
    if (inactiveTime > 180000) {         
      if (user.status !== "idle") {
        user.status = "idle";
        changed = true;
      }
    } else {
      if (user.status !== "online") {
        user.status = "online";
        changed = true;
      }
    }
  });

  if (changed) broadcastOnlineUsers();
}, 5000);

setInterval(() => {
  const now = Date.now();
  let cleaned = 0;

  accountCreationAttempts.forEach((attempts, ip) => {
    if (now > attempts.resetTime) {
      accountCreationAttempts.delete(ip);
      cleaned++;
    }
  });

  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} stale account creation attempts`);
  }
}, 30 * 60 * 1000);


function migratePrestigeBadges() {
  const prestigeBadges = emoteConfig.prestigeBadges || [];
  let changed = false;

  allUsers.forEach((user, id) => {
    if (!user.level || user.level < 10) return;
    if (!user.unlockedPrestigeBadges) user.unlockedPrestigeBadges = [];

    prestigeBadges.forEach(p => {
      if (user.level >= p.level && !user.unlockedPrestigeBadges.includes(p.badge)) {
        user.unlockedPrestigeBadges.push(p.badge);
        console.log(`✅ Migrated prestige badge "${p.label}" for ${user.username} (Level ${user.level})`);
        changed = true;
      }
    });

    allUsers.set(id, user);
  });

  if (changed) saveUsers();
  console.log("✅ Prestige badge migration complete");
}


const emoteUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, "public/avatars/"),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const rawName = (req.body?.name || "").toString();
      const cleanName = rawName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "")
        .slice(0, 40);

      const baseName = cleanName || `emote_${crypto.randomUUID()}`;
      let finalName = `${baseName}${ext}`;
      let counter = 1;
      while (fs.existsSync(path.join(__dirname, "public/avatars", finalName))) {
        finalName = `${baseName}_${counter}${ext}`;
        counter++;
      }

      cb(null, finalName);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"];
    if (!allowed.includes(file.mimetype)) return cb(new Error("Invalid file type"), false);
    cb(null, true);
  }
});

app.post("/upload-emote", requireAuth, emoteUpload.single("emote"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const filename = req.file.filename;
  if (!emoteConfig.pepeList) emoteConfig.pepeList = [];
  emoteConfig.pepeList.push(filename);
  try {
    fs.writeFileSync(EMOTE_CONFIG_PATH, JSON.stringify(emoteConfig, null, 2));
    console.log(`✅ Emote added: ${filename}`);
  } catch (err) {
    console.error("❌ Failed to save emote config:", err);
    return res.status(500).json({ error: "Failed to save config" });
  }

  io.emit("emoteListUpdated", { pepeList: emoteConfig.pepeList });

  res.json({ url: `/avatars/${filename}`, filename });
});

app.delete("/delete-emote/:filename", requireAuth, (req, res) => {

  const filename = req.params.filename;
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return res.status(400).json({ error: "Invalid filename" });
  }

  emoteConfig.pepeList = (emoteConfig.pepeList || []).filter(f => f !== filename);

  try {
    fs.writeFileSync(EMOTE_CONFIG_PATH, JSON.stringify(emoteConfig, null, 2));
  } catch (err) {
    return res.status(500).json({ error: "Failed to save config" });
  }

  const filePath = path.join(__dirname, "public/avatars", filename);
  fs.unlink(filePath, (err) => {
    if (err) console.warn("⚠️ Could not delete file:", err.message);
  });

  io.emit("emoteListUpdated", { pepeList: emoteConfig.pepeList });
  res.json({ success: true });
});




let whispers = [];
let groupWhispersAll = groupWhispers;

let whispersSaveTimer = null;
function saveWhispers() {
  clearTimeout(whispersSaveTimer);
  whispersSaveTimer = setTimeout(() => {
    persistAllMessages();
  }, 2000);
}

function persistAllMessages() {
  try {
    const allChannelMsgs = Array.from(messagesByChannel.values()).flat();
    const combined = {
      channelMessages: allChannelMsgs,
      whispers: whispers,
      groupWhispers: groupWhispers,
      whisperGroups: whisperGroups
    };
    fs.writeFile("./data/messages.json", JSON.stringify(combined, null, 2), (err) => {
      if (err) console.error("❌ Failed to save messages.json:", err);
    });
  } catch (err) {
    console.error("❌ Failed to persist messages:", err);
  }
}

if (fs.existsSync("./data/messages.json")) {
  try {
    const raw = JSON.parse(fs.readFileSync("./data/messages.json", "utf8"));
    if (Array.isArray(raw)) {
      messages = raw.filter(m => m && m.id);
      messages.forEach(msg => {
        const ch = msg.channel || "general";
        if (!messagesByChannel.has(ch)) messagesByChannel.set(ch, []);
        messagesByChannel.get(ch).push(msg);
      });
    } else {
      messages = Array.isArray(raw.channelMessages) ? raw.channelMessages.filter(m => m && m.id) : [];
      messages.forEach(msg => {
        const ch = msg.channel || "general";
        if (!messagesByChannel.has(ch)) messagesByChannel.set(ch, []);
        messagesByChannel.get(ch).push(msg);
      });
      whispers = Array.isArray(raw.whispers) ? raw.whispers.filter(m => m && m.id && m.from && m.to) : [];
      groupWhispers = Array.isArray(raw.groupWhispers) ? raw.groupWhispers.filter(m => m && m.id && m.groupId && m.from) : [];
      whisperGroups = Array.isArray(raw.whisperGroups) ? raw.whisperGroups.filter(g => g && g.id && Array.isArray(g.memberIds)) : whisperGroups;
    }
    console.log(`✅ Loaded ${messages.length} channel messages, ${whispers.length} whispers, ${groupWhispers.length} group whispers from messages.json`);
  } catch (e) {
    console.error("Failed to load ./data/messages.json for whispers", e);
  }
}


function buildWhisperHistoryFor(userId) {
  const byOther = new Map();

  whispers.forEach(w => {
    if (w.from !== userId && w.to !== userId) return;
    const otherId = w.from === userId ? w.to : w.from;
    if (!byOther.has(otherId)) byOther.set(otherId, []);
    byOther.get(otherId).push(w);
  });

  const conversations = [];
  byOther.forEach((msgs, otherId) => {
    const otherDb = allUsers.get(otherId);
    const otherOnline = onlineUsers.get(otherId);
    conversations.push({
      type: "dm",
      userId: otherId,
      username: otherOnline?.username || otherDb?.username || "Unknown",
      avatar: otherOnline?.avatar || otherDb?.avatar || "/avatars/default1.png",
      usernameColor: otherOnline?.usernameColor || otherDb?.usernameColor || "username-cyan",
      messages: msgs.sort((a, b) => a.time - b.time)
    });
  });

 
  whisperGroups.forEach(group => {
    if (!group.memberIds.includes(userId)) return;
    const msgs = groupWhispers.filter(m => m.groupId === group.id).sort((a, b) => a.time - b.time);
    conversations.push({
      type: "group",
      groupId: group.id,
      name: group.name,
      members: getGroupMembersPayload(group),
      messages: msgs
    });
  });

  return conversations;
}


function isEmoteUrlServer(url) {
  return typeof url === "string" && /\/avatars\/[^/]+\.(png|jpe?g|gif|webp)$/i.test(url);
}


server.listen(5350, '127.0.0.1', () => {
  console.log("🚀 Node.js server running on http://127.0.0.1:5350");
  console.log("📡 Socket.IO enabled with auto-reconnection");
});

