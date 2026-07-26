var debugmode = true;
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

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
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
        console.error(`❌ Kick API error on chunk [${chunk.slice(0, 3).join(',')}...]:`, err.message);
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
          console.error('❌ Kick users API error on chunk:', err.message);
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

    kickCheckSucceeded = true;

  } catch (err) {
    console.error('❌ Kick API error:', err.message, '- skipping offline-pruning for Kick this cycle');
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
    if (!relDir) continue; 
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
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${crypto.randomUUID()}${ext}`);
    }
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp",
      "video/mp4", "video/webm", "video/ogg", "video/quicktime"
    ];
    if (!allowedMimes.includes(file.mimetype)) return cb(new Error("Invalid file type"), false);
    cb(null, true);
  }
});

app.post("/upload-avatar", requireAuth, avatarUpload.single("avatar"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  res.json({ url: `/avatars/${req.file.filename}` });
});

app.post("/upload-image", requireAuth, upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const ext = path.extname(req.file.originalname).toLowerCase();
  const isVideo = req.file.mimetype.startsWith("video/");

  if (isVideo) {
    return res.json({
      url: `/uploads/${req.file.filename}`,
      type: "video"
    });
  }

  if (ext === ".svg") {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: "SVG not allowed" });
  }

  const gifAllowed = ext === ".gif";

  try {
    if (!gifAllowed) {
  const tempPath = req.file.path + "_tmp";

await sharp(req.file.path, {
  limitInputPixels: 25000000
})
  .resize({
    width: 2000,
    fit: 'inside',           
    withoutEnlargement: true 
  })
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
  const targetUsername = (data?.username || "").toLowerCase().trim();
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

  let ip = 'unknown';
  try {
    ip = getClientIp(socket);
  } catch (e) {
    console.error("Failed to get client IP:", e);
  }

      const isNewUser = !allUsers.has(clientData.id);
    if (isNewUser) {
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

    const AFK_THRESHOLD = 4 * 60 * 60 * 1000;
    const timeSinceActive = Date.now() - (user.lastActive || 0);

    if (timeSinceActive >= AFK_THRESHOLD) {
      console.log(`💤 ${socket.userId} is AFK — skipping XP award`);
      return;
    }

    const xpAmount = 10.0;
    const xpResult = addServerXP(socket.userId, xpAmount);
  }, 10 * 60 * 1000);
}

  console.log(`📝 ${clientData.username} connected ${isBot ? '(BOT)' : ''} IP: ${ip}`);

const isReconnect = disconnectTimeouts.has(clientData.id);
const wasAlreadyOnline = !isBot && userSockets.has(clientData.id) && userSockets.get(clientData.id).size > 0;

socket.userId = clientData.id;
socket.isBot = isBot;

if (!isBot) {
  if (!userSockets.has(clientData.id)) userSockets.set(clientData.id, new Set());
  userSockets.get(clientData.id).add(socket.id);
}

  if (isBot) {
    const botUser = {
      id: clientData.id,
      username: clientData.username || "Aira",
      avatar: clientData.avatar || "/avatars/bot.gif",
      status: "online",
      lastActive: Date.now(),
      isBot: true,
      level: 1337
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

  socket.emit("whisperHistory", { conversations: buildWhisperHistoryFor(clientData.id) });

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
  customStatus:  clientData.customStatus  ?? dbUser.customStatus  ?? "",
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
      console.log(`🧹 Cleaned stale entries from ${roomName}: ${participants.length} → ${cleaned.length}`);
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

  const usernamePart = fullText.substring(0, lastSpaceIndex).trim();
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

  console.log(`🔀 ${onlineUsers.get(socket.userId)?.username || 'Admin'} redirected ${targetUser.username} → ${url}`);
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
  const targetUsername = parts.join(" ").toLowerCase();

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
const targetUsername = commandParts.join(" ").toLowerCase();
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

    console.log(`🎥 Private YouTube sent: ${onlineUsers.get(userId)?.username} → ${targetUserData.username}`);
    return;
  }
  
      const channel = data.channel || "general";
    if (mutedUsers.has(userId)) {
      socket.emit("error", { msg: "❌ You are muted and cannot send messages." });
      return;
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
    const targetUsername = (data.target || "").toLowerCase().trim();
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
    const targetUsername = (data.target || "").toLowerCase().trim();
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

  if (socket.isBot) {
    console.log(`🤖 Bot disconnected: ${socket.userId}`);
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





server.listen(5350, '127.0.0.1', () => {
  console.log("🚀 Node.js server running on http://127.0.0.1:5350");
  console.log("📡 Socket.IO enabled with auto-reconnection");
});