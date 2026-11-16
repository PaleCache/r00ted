const userJoinAudio = new Audio('/sounds/power-plug.oga');
const userLeaveAudio = new Audio('/sounds/power-unplug.oga');
const localStreamStatus = window.currentStreamStatus || null;

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

  document.getElementById('vcButtons').style.display = 'flex';
  initVoicePanelIdentity();
  const statusEl = document.getElementById('voiceStatusLabel');
  document.getElementById('pingDisplay').style.display = 'flex';
  const roomLabelEl = document.getElementById('voiceRoomLabel');
  if (roomLabelEl) roomLabelEl.textContent = roomSlug;

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


conference.on(
  JitsiMeetJS.events.connectionQuality.LOCAL_STATS_UPDATED,
  stats => {
    if (!currentVoiceRoom || !conference) return;

    const transport = stats.transport?.[0];
    const rtt = transport?.rtt ?? stats.jvbRTT;

    if (rtt === undefined || rtt === null) return;

    updatePingDisplay(Math.round(rtt));
  }
);

 
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
  updateVcPresence();
  const thisConf = conference;
  setTimeout(() => {
    if (conference !== thisConf || currentVoiceRoom !== roomSlug) return;
    if (!localAudioTrack) {
      console.warn("👻 Ghost join no local audio track after 4s, rejoining");
      leaveVoice();
      setTimeout(() => joinVoiceChannelWithTimeout(roomSlug), 1000);
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
    applyMicState();
    localAudioTrack.addEventListener(
      JitsiMeetJS.events.track.TRACK_AUDIO_LEVEL_CHANGED,
      (level) => handleAudioLevel("local", level)
    );
    console.log("Local microphone added");
     updateVcPresence();
} catch (e) {
    console.error("Microphone error:", e);
   showToast("🎙️ No microphone detected - you have been removed from the voice channel.\n\nPlease check your mic in system settings and try again.");
  }

 
  conference.join();

  voiceStates.set(user.id, { isMuted: false, isDeafened: false });
  updateVoiceUI();
  setActiveVoiceChannel(roomSlug);
}


const miniKeys = new Set();

(function injectMiniPlayerStyles() {
  const st = document.createElement('style');
  st.textContent = `
    #r00tedMiniDock{position:fixed;right:16px;bottom:16px;z-index:35000;display:flex;flex-direction:column;gap:10px;align-items:flex-end;touch-action:none;}
    #r00tedMiniDock:empty{display:none;}
    #r00tedMiniDock .ss-card.ss-mini{position:relative!important;width:300px!important;max-width:80vw!important;height:auto!important;min-height:0!important;max-height:none!important;aspect-ratio:16/9;flex:none!important;margin:0!important;overflow:hidden;cursor:grab;border:1px solid var(--mini-border,rgba(255,255,255,.12));border-radius:var(--mini-radius,12px);box-shadow:0 10px 30px rgba(0,0,0,.55);}
    #r00tedMiniDock .ss-card.ss-mini:active{cursor:grabbing;}
    .ss-mini .ss-video{width:100%;height:100%;object-fit:contain;}
    .ss-mini .ss-chip,.ss-mini .ss-volume{display:none!important;}
    .ss-mini .ss-controls>*:not([data-mini-toggle]):not(.ss-btn-danger){display:none!important;}
    .ss-mini .ss-controls{opacity:0;transition:opacity .15s;}
    .ss-mini:hover .ss-controls{opacity:1!important;visibility:visible!important;pointer-events:auto!important;}
    .ss-mini-label{display:none;}
    .ss-mini .ss-mini-label{display:block;position:absolute;left:8px;right:8px;bottom:6px;font-size:11px;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.9);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;}
    #r00tedCallView .cv-streams .ss-card{position:relative;overflow:hidden;background:#000;}
    #r00tedCallView .cv-streams .ss-card .ss-video{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;object-fit:contain!important;}
  
    `;
  (document.head || document.documentElement).appendChild(st);
})();


const STAGE_CHAT_SELECTOR = '#chatArea';
const STAGE_NAV_SELECTOR  = '.text-channel, .dm-item, .channel-item:not(.voice-channel)';

let callViewActive = false;
let bulkToggling = false;
let callViewTimer = null;
let cvOrigParent = null, cvOrigNext = null, cvSig = '';

(function injectCallViewStyles() {
  const st = document.createElement('style');
  st.textContent = `
    #r00tedCallView{display:none;position:fixed;z-index:999;flex-direction:column;gap:12px;padding:12px;background:#000;overflow:auto;box-sizing:border-box;}
    body.ss-stage #r00tedCallView{display:flex;}
    #r00tedCallView .cv-grid{display:none!important;}
    #r00tedCallView .cv-streams{display:flex;flex:1 1 0;min-height:160px;container-type:size;align-items:center;justify-content:center;}
    #r00tedCallView .cv-streams:not(:has(.ss-card, .cv-tile)){display:none;}
    #r00tedCallView .cv-streams #screenContainer{
      width:100%!important;height:100%!important;max-height:none!important;
      display:flex;flex-wrap:wrap;align-content:center;align-items:center;
      justify-content:center;gap:12px;
    }
    #r00tedCallView .cv-streams #screenContainer > .ss-card,
    #r00tedCallView .cv-streams #screenContainer > .cv-tile{
      flex:0 0 auto!important;
      width:var(--cv-tile-w,100%)!important;
      height:auto!important;
      aspect-ratio:16/9;
      min-width:0!important;max-width:none!important;
      margin:0!important;
      box-sizing:border-box!important;
      cursor:pointer;
    }


    #r00tedCallView .cv-streams #screenContainer.cv-focus{
      display:grid!important;
      grid-template-rows:minmax(0,1fr);
      grid-auto-rows:auto;
      align-items:center;justify-content:center;gap:10px;
    }
    #r00tedCallView .cv-streams #screenContainer.cv-focus > .ss-card,
    #r00tedCallView .cv-streams #screenContainer.cv-focus > .cv-tile{
      width:var(--cv-thumb-w)!important;
      border-radius:8px;opacity:.8;transition:opacity .12s;
    }
    #r00tedCallView .cv-streams #screenContainer.cv-focus > .ss-card:hover,
    #r00tedCallView .cv-streams #screenContainer.cv-focus > .cv-tile:hover{opacity:1;}
    #r00tedCallView .cv-streams #screenContainer.cv-focus > .cv-focused{
      width:var(--cv-focus-w)!important;
      grid-row:1;grid-column:1/-1;justify-self:center;
      opacity:1;cursor:zoom-out;
    }
   
    #r00tedCallView .cv-focus .ss-card:not(.cv-focused) .ss-chip,
    #r00tedCallView .cv-focus .ss-card:not(.cv-focused) .ss-volume,
    #r00tedCallView .cv-focus .ss-card:not(.cv-focused) .ss-controls{display:none!important;}
    #r00tedCallView .cv-focus .ss-card:not(.cv-focused) .ss-mini-label{
      display:block;position:absolute;left:6px;right:6px;bottom:4px;
      font-size:11px;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.9);
      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none;
    }
 
    #r00tedCallView .cv-focus .cv-tile:not(.cv-focused) .cv-name{transform-origin:left bottom;transform:scale(.7);left:4px;bottom:4px;}
    #r00tedCallView .cv-focus .cv-tile.cv-focused .cv-av{max-width:200px;}
    #r00tedCallView .cv-focused::after{
      content:"✕ Back to grid";
      position:absolute;top:10px;left:10px;z-index:5;
      padding:5px 10px;border-radius:6px;
      background:rgba(0,0,0,.7);color:#fff;font-size:12px;
      opacity:0;transition:opacity .15s;pointer-events:none;
    }
    #r00tedCallView .cv-focused:hover::after{opacity:1;}

    @media (max-height:640px), (max-width:700px){
      #r00tedCallView{padding:8px;gap:8px;}
      .cv-tile .cv-name{transform-origin:left bottom;transform:scale(.85);}
    }


    .cv-tile{position:relative;background:rgba(255,255,255,.06);aspect-ratio:16/9;border-radius:12px;display:flex;align-items:center;justify-content:center;overflow:hidden;outline:3px solid transparent;outline-offset:3px;transition:outline-color .1s, box-shadow .1s;}
    .cv-tile.speaking{outline-color:var(--cv-color,#fff);}
    .cv-tile .cv-av{width:25%;max-width:96px;aspect-ratio:1;border-radius:50%;object-fit:cover;}
    .cv-tile .cv-name{position:absolute;left:8px;bottom:8px;display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:6px;background:rgba(0,0,0,.6);max-width:calc(100% - 16px);overflow:hidden;white-space:nowrap;box-sizing:border-box;}
    .cv-tile .cv-name .username-wrapper {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-weight: 600;
        font-size: 12px;
    }

    #r00tedMiniDock .ss-card.ss-mini{cursor:pointer;}
  `;
  (document.head || document.documentElement).appendChild(st);
})();

function streamingIds() {
  const ids = new Set();
  document.querySelectorAll('#screenContainer > .ss-card[data-video-id]')
    .forEach(el => ids.add(el.getAttribute('data-video-id')));
  if (document.querySelector('#screenContainer > .ss-card[data-screen-id="local-screen"], #screenContainer > .ss-card[data-camera-id="local-camera"]')) ids.add('local');
  return ids;
}


function updateStageMode() {}

function getCallView() {
  let v = document.getElementById('r00tedCallView');
  if (v) return v;
  v = document.createElement('div');
  v.id = 'r00tedCallView';
  v.innerHTML = '<div class="cv-streams"></div><div class="cv-grid"></div>';
  const chat = document.querySelector(STAGE_CHAT_SELECTOR);
  if (chat && chat.parentNode) chat.parentNode.insertBefore(v, chat.nextSibling);
  else document.body.appendChild(v);
  return v;
}

function mountScreenContainer(into) {
  const c = document.getElementById('screenContainer');
  if (!c) return;
  if (into) {
    if (!cvOrigParent) { cvOrigParent = c.parentNode; cvOrigNext = c.nextSibling; }
    getCallView().querySelector('.cv-streams').appendChild(c);
  } else if (cvOrigParent) {
    try {
      cvOrigParent.insertBefore(c, cvOrigNext && cvOrigNext.parentNode === cvOrigParent ? cvOrigNext : null);
    } catch (e) { cvOrigParent.appendChild(c); }
  }
}

let cvFocusKey = null;

function cvKey(el) {
  if (el.classList.contains('cv-tile')) return 'p:' + el.dataset.cvId;
  const v = el.getAttribute('data-video-id');
  if (v) return 's:' + v + ':' + el.getAttribute('data-video-type');
  return 's:' + (el.getAttribute('data-screen-id') || el.getAttribute('data-camera-id'));
}

function callViewItems() {
  const sc = document.getElementById('screenContainer');
  return sc ? [...sc.querySelectorAll(':scope > .ss-card, :scope > .cv-tile')] : [];
}

function layoutCallStreams() {
  const box = document.querySelector('#r00tedCallView .cv-streams');
  const c = document.getElementById('screenContainer');
  if (!box || !c) return;
  const items = callViewItems();
  const n = items.length;
  if (!n) {
    cvFocusKey = null;
    c.classList.remove('cv-focus');
    c.style.gridTemplateColumns = '';
    return;
  }
  const W = box.clientWidth, H = box.clientHeight, gap = 12;
  if (W < 50 || H < 50) return;

  const focused = cvFocusKey ? items.find(el => cvKey(el) === cvFocusKey) : null;
  if (!focused) cvFocusKey = null;
  if (focused && n > 1) {
    items.forEach(el => el.classList.toggle('cv-focused', el === focused));
    const k = n - 1;
    const thumbW = Math.max(100, Math.floor(Math.min(160, (W - gap * (k - 1)) / k)) - 2);
    const thumbH = thumbW * 9 / 16;
    const cols = Math.max(1, Math.floor((W + gap) / (thumbW + gap)));
    const rows = Math.ceil(k / cols);
    const stripH = rows * thumbH + rows * gap;
    c.classList.add('cv-focus');
    c.style.setProperty('--cv-thumb-w', thumbW + 'px');
    c.style.setProperty('--cv-focus-w', Math.floor(Math.max(100, Math.min(W, (H - stripH) * 16 / 9))) + 'px');
    c.style.gridTemplateColumns = `repeat(${Math.min(k, cols)}, ${thumbW}px)`;
    return;
  }

  if (n <= 1) cvFocusKey = null; 
  items.forEach(el => el.classList.remove('cv-focused'));
  c.classList.remove('cv-focus');
  c.style.gridTemplateColumns = '';
  let best = 0;
  for (let cols = n; cols >= 1; cols--) {
    const rows = Math.ceil(n / cols);
    const w = Math.min(
      (W - gap * (cols - 1)) / cols,
      ((H - gap * (rows - 1)) / rows) * 16 / 9
    );
    if (best === 0 || w > best * 1.3) best = w;
  }
  c.style.setProperty('--cv-tile-w', Math.max(0, Math.floor(best) - 4) + 'px');
}

function callViewTick() {
  const sc = document.getElementById('screenContainer');
  if (!sc) return;
  sc.classList.add('show');
  sc.style.display = 'flex';

  const hidden = streamingIds();
  const people = getCallPeople().filter(p => !hidden.has(String(p.id)));
  const sig = JSON.stringify(people);
  if (sig !== cvSig) {
    cvSig = sig;
    sc.querySelectorAll(':scope > .cv-tile').forEach(t => t.remove());
    sc.append(...people.map(buildCallTile));
  }

  layoutCallStreams();
  sc.querySelectorAll(':scope > .cv-tile').forEach(t =>
    t.classList.toggle('speaking', !!speakingState.get(t.dataset.cvId)));
    sc.querySelectorAll(':scope > .ss-card').forEach(c => {
  const pid = c.getAttribute('data-video-id')
    || (c.hasAttribute('data-screen-id') || c.hasAttribute('data-camera-id') ? 'local' : null);
  if (!pid) return;
  if (!c.style.getPropertyValue('--cv-color')) {
    let glow = '#2bc4ff';
    try {
      const color = pid === 'local'
        ? (user.usernameColor || 'username-cyan')
        : (getCallPeople().find(p => String(p.id) === String(pid))?.color || 'username-cyan');
      glow = getAvatarGlowColor(color);
    } catch (e) {}
    c.style.setProperty('--cv-color', glow);
  }
  c.classList.toggle('speaking', !!speakingState.get(pid));
});
}

function bulkToggle(selector) {
  bulkToggling = true;
  try { document.querySelectorAll(selector).forEach(b => b.click()); }
  finally { bulkToggling = false; }
}

function getCallPeople() {
  const people = [{
    id: 'local', name: user.username || 'You', avatar: user.avatar,
    color: user.usernameColor || 'username-cyan', level: user.level || 1,
    badge: user.badge || null, isAdmin: !!user.isAdmin, isDeveloper: !!user.isDeveloper,
    isPromptEngineer: !!user.isPromptEngineer, prestigeBadge: user.prestigeBadge || null,
    customRoleIds: user.customRoleIds || [], muted: !!isCurrentlyMuted, deaf: !!isDeafened
  }];
  remoteTracks.forEach((a, id) => {
    const p = conference ? conference.getParticipantById(id) : null;
    if (!p) return;
    const st = voiceStates.get(p.getProperty('userId') || id) || {};
    let roles = [];
    try { roles = JSON.parse(p.getProperty('customRoleIds') || '[]'); } catch (e) {}
    people.push({
      id, name: p.getDisplayName() || 'Anonymous',
      avatar: p.getProperty('avatar') || '/avatars/default1.png',
      color: p.getProperty('usernameColor') || 'username-cyan',
      level: parseInt(p.getProperty('level')) || 1,
      badge: p.getProperty('badge') || null,
      isAdmin: p.getProperty('isAdmin') === 'true',
      isDeveloper: p.getProperty('isDeveloper') === 'true',
      isPromptEngineer: p.getProperty('isPromptEngineer') === 'true',
      prestigeBadge: p.getProperty('prestigeBadge') || null,
      customRoleIds: roles, muted: !!st.isMuted, deaf: !!st.isDeafened
    });
  });
  return people;
}

function buildCallTile(p) {
  const t = document.createElement('div');
  t.className = 'cv-tile';
  t.dataset.cvId = p.id;

  let glow = '#2bc4ff';
  try { glow = getAvatarGlowColor(p.color || 'username-cyan'); } catch (e) {}
  t.style.setProperty('--cv-color', glow);

  const av = document.createElement('img');
  av.className = 'cv-av';
  av.src = sanitizeAvatar(p.avatar);
  const label = document.createElement('div');
  label.className = 'cv-name';
  try {
    const row = buildParticipantRow(p.id, p.avatar, p.name, p.color, p.level, p.badge,
      p.isAdmin, p.isDeveloper, p.isPromptEngineer, p.prestigeBadge, p.customRoleIds);
    const nameEl = row.querySelector('.username-wrapper');
    const meta = nameEl ? nameEl.nextElementSibling : null;
    if (nameEl) label.appendChild(nameEl);
    if (meta) label.appendChild(meta);
  } catch (e) {
    label.textContent = p.name;
    label.style.color = '#fff';
  }

  t.append(av, label);
  return t;
}


function positionCallView() {
  const v = getCallView();
  const chat = document.querySelector(STAGE_CHAT_SELECTOR);
  let r = chat ? chat.getBoundingClientRect() : null;
  if (!r || r.width < 50 || r.height < 50) {
    console.warn('[callview] STAGE_CHAT_SELECTOR matched nothing usable:', STAGE_CHAT_SELECTOR, '- using fallback position');
    const side = document.querySelector('.sidebar2-content') || document.querySelector('.voice-channel');
    let left = 0;
    let el = side;
    while (el && el !== document.body) {
      const b = el.getBoundingClientRect();
      if (b.height > innerHeight * 0.6 && b.width < innerWidth * 0.6) left = Math.max(left, b.right);
      el = el.parentElement;
    }
    left = left || 300;
    r = { left, top: 0, width: innerWidth - left, height: innerHeight };
  }
  const left = Math.max(0, r.left);
  const top = Math.max(0, r.top);
  v.style.left = left + 'px';
  v.style.top = top + 'px';
  v.style.width = Math.max(0, Math.min(r.width, innerWidth - left)) + 'px';
  v.style.height = Math.max(0, Math.min(r.height, innerHeight - top)) + 'px';
}

function setCallView(on) {
  if (on && !currentVoiceRoom) return;
  if (on) positionCallView();
  callViewActive = on;
  document.body.classList.toggle('ss-stage', on);
  if (on) {
    mountScreenContainer(true);
    bulkToggle('#r00tedMiniDock [data-mini-toggle]');
    cvSig = '';
    callViewTick();
    clearInterval(callViewTimer);
    callViewTimer = setInterval(callViewTick, 250);
  }  else {
    clearInterval(callViewTimer);
    callViewTimer = null;
    cvFocusKey = null;
    cvSig = '';
    const sc = document.getElementById('screenContainer');
    if (sc) {
      sc.querySelectorAll(':scope > .cv-tile').forEach(t => t.remove());
      sc.classList.remove('cv-focus');
      sc.style.gridTemplateColumns = '';
      sc.querySelectorAll(':scope > .cv-focused').forEach(el => el.classList.remove('cv-focused'));
    }
    bulkToggle('#screenContainer .ss-card:not(.ss-mini) [data-mini-toggle]');
    mountScreenContainer(false);
    syncScreenContainer();
  }
}
window.addEventListener('resize', () => { if (callViewActive) positionCallView(); });

document.addEventListener('click', e => {
  if (bulkToggling) return;
  const t = e.target;
  const dock = t.closest('#r00tedMiniDock');
  if (dock) {
    if (dock.__justDragged) return;
    if (t.closest('[data-mini-toggle]') || !t.closest('button, input')) {
      e.stopImmediatePropagation();
      e.preventDefault();
      setCallView(true);
    }
    return;
  }


  const item = t.closest('#r00tedCallView #screenContainer > .ss-card, #r00tedCallView #screenContainer > .cv-tile');
  if (item && !t.closest('button, input')) {
    const key = cvKey(item);
    if (cvFocusKey === key) cvFocusKey = null;                
    else if (callViewItems().length > 1) cvFocusKey = key;   
    callViewTick();
    return;
  }


  if (t.closest(STAGE_NAV_SELECTOR)) { setCallView(false); return; }
  if (t.closest('.voice-channel.active') && currentVoiceRoom && !t.closest('button, input')) {
    e.stopImmediatePropagation();
    e.preventDefault();
    setCallView(true);
  }
}, true);



document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && callViewActive && cvFocusKey && !document.fullscreenElement) {
    cvFocusKey = null;
    callViewTick();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const c = document.getElementById('screenContainer');
  if (c) new MutationObserver(() => { syncScreenContainer(); updateStageMode(); }).observe(c, { childList: true });
});

const MINI_ICON_MINIMIZE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>`;
const MINI_ICON_EXPAND = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>`;

function getMiniDock() {
  let dock = document.getElementById('r00tedMiniDock');
  if (dock) return dock;

  dock = document.createElement('div');
  dock.id = 'r00tedMiniDock';
  try {
    const T = getSharePickerTheme();
    dock.style.setProperty('--mini-border', T.border);
    dock.style.setProperty('--mini-radius', T.radius);
  } catch (e) {}
  document.body.appendChild(dock);

  const clampToViewport = () => {
    if (!dock.style.left) return;
    const x = Math.min(Math.max(0, parseFloat(dock.style.left)), Math.max(0, innerWidth - dock.offsetWidth));
    const y = Math.min(Math.max(0, parseFloat(dock.style.top)), Math.max(0, innerHeight - dock.offsetHeight));
    dock.style.left = x + 'px';
    dock.style.top = y + 'px';
  };
  try {
    const saved = JSON.parse(localStorage.getItem('miniDockPos') || 'null');
    if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      dock.style.left = saved.x + 'px';
      dock.style.top = saved.y + 'px';
      dock.style.right = 'auto';
      dock.style.bottom = 'auto';
    }
  } catch (e) {}

  let drag = null;
  dock.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button, input')) return;
    const r = dock.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY, moved: false };
    try { dock.setPointerCapture(e.pointerId); } catch (err) {}
  });
  dock.addEventListener('pointermove', e => {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy) > 4) drag.moved = true;
    if (!drag.moved) return;
    const x = Math.min(Math.max(0, e.clientX - drag.dx), Math.max(0, innerWidth - dock.offsetWidth));
    const y = Math.min(Math.max(0, e.clientY - drag.dy), Math.max(0, innerHeight - dock.offsetHeight));
    dock.style.left = x + 'px';
    dock.style.top = y + 'px';
    dock.style.right = 'auto';
    dock.style.bottom = 'auto';
  });
  const endDrag = e => {
    if (!drag) return;
    dock.__justDragged = drag.moved;
    setTimeout(() => { dock.__justDragged = false; }, 0);
    drag = null;
    try { dock.releasePointerCapture(e.pointerId); } catch (err) {}
    try { localStorage.setItem('miniDockPos', JSON.stringify({ x: parseFloat(dock.style.left), y: parseFloat(dock.style.top) })); } catch (err) {}
  };
  dock.addEventListener('pointerup', endDrag);
  dock.addEventListener('pointercancel', endDrag);
  window.addEventListener('resize', clampToViewport);
  return dock;
}


function syncScreenContainer() {
  const c = document.getElementById('screenContainer');
  if (!c) return;
  if (c.querySelector('.ss-card') || callViewActive) {
    c.classList.add('show');
    c.style.display = 'flex';
  } else {
    c.classList.remove('show');
    c.style.display = 'none';
  }
  updateStageMode();
}

function setCardMinimized(wrapper, video, toggleBtn, minimized) {
  installRemoveHook();
  const container = document.getElementById('screenContainer');
  wrapper.classList.toggle('ss-mini', minimized);
  if (minimized) {
    getMiniDock().appendChild(wrapper);
  } else if (container) {
    container.appendChild(wrapper);
  }

  try { video.play().catch(() => {}); } catch (e) {}
  toggleBtn.innerHTML = minimized ? MINI_ICON_EXPAND : MINI_ICON_MINIMIZE;
  toggleBtn.title = minimized ? 'Expand' : 'Minimize';
  syncScreenContainer();
  updateStageMode();
}

function addMiniPlayerToggle(wrapper, controls, video, label, key) {
  const btn = document.createElement('button');
  btn.className = 'ss-btn';
  btn.setAttribute('data-mini-toggle', '1');
  btn.title = 'Minimize';
  btn.innerHTML = MINI_ICON_MINIMIZE;

  const labelEl = document.createElement('div');
  labelEl.className = 'ss-mini-label';
  labelEl.textContent = label;
  wrapper.appendChild(labelEl);

  const toggle = () => {
    const goMini = !wrapper.classList.contains('ss-mini');
    if (goMini) miniKeys.add(key); else miniKeys.delete(key);
    setCardMinimized(wrapper, video, btn, goMini);
  };
  btn.addEventListener('click', e => { e.stopPropagation(); toggle(); });
  wrapper.addEventListener('dblclick', e => {
    if (wrapper.classList.contains('ss-mini') && !e.target.closest('button, input')) toggle();
  });
  controls.appendChild(btn);
    const isLocal = key === 'local-screen' || key === 'local-camera';
  if (isLocal || !callViewActive) miniKeys.add(key); else miniKeys.delete(key);
  if (miniKeys.has(key)) {
    setTimeout(() => { if (wrapper.isConnected) setCardMinimized(wrapper, video, btn, true); }, 0);
  }
}


let removeHookInstalled = false;
function installRemoveHook() {
  if (removeHookInstalled || typeof removeScreenCard !== 'function') return;
  removeHookInstalled = true;
  const orig = removeScreenCard;
  window.removeScreenCard = function (attr, id) {
    const el = document.querySelector(`[${attr}="${id}"]`);
    if (el && el.classList.contains('ss-mini')) {
      el.remove();
      syncScreenContainer();
      return;
    }
    return orig.apply(this, arguments);
  };
}

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
  const chipText = document.createElement("span");
  chipText.textContent = isScreenShare ? `${name} is sharing their screen` : `${name}'s camera`;
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
  addMiniPlayerToggle(wrapper, controls, video,
    isScreenShare ? `${name}'s screen` : `${name}'s camera`,
    `${participantId}:${isScreenShare ? 'screen' : 'camera'}`);
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
  applyVolumeToUser(participantId, volume);
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

  let stallTimeout = null;
  let metadataLoaded = false;

  const clearStallWatch = () => {
    if (stallTimeout) {
      clearTimeout(stallTimeout);
      stallTimeout = null;
    }
  };

  const attemptReattach = (attempt = 1) => {
    if (metadataLoaded) return;
    console.warn(`⚠️ Video stalled for ${participantId}, attempting reattach (try ${attempt})`);

    try { track.detach(video); } catch (e) {}
    try { track.attach(video); } catch (e) {}

    if (attempt < 3) {
      stallTimeout = setTimeout(() => attemptReattach(attempt + 1), 5000);
      video.__mpStallTimeout = stallTimeout;
    } else {
      loadingText.textContent = "Having trouble loading this stream. Try refreshing.";
      console.error(`❌ Gave up on video for ${participantId} after 3 reattach attempts`);
    }
  };

  stallTimeout = setTimeout(() => attemptReattach(1), 5000);
  video.__mpStallTimeout = stallTimeout;

  video.addEventListener('loadedmetadata', () => {
    metadataLoaded = true;
    clearStallWatch();
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






let screenTrack = null;
let screenAudioTrack = null;
let currentActiveAudioTrack = null;
let shareMix = null;
const IS_LINUX = /Linux/i.test(navigator.userAgent) && !/Android/i.test(navigator.userAgent);

function pickApp(apps) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:40000;display:flex;align-items:center;justify-content:center;';
    const box = document.createElement('div');
    box.style.cssText = 'background:#181818;color:#fff;padding:20px;border-radius:10px;min-width:320px;display:flex;flex-direction:column;gap:8px;';
    box.innerHTML = '<div style="font-weight:600;font-size:16px;margin-bottom:6px;">Share audio from which app?</div>';
    const done = v => { overlay.remove(); resolve(v); };
    apps.forEach(a => {
      const b = document.createElement('button');
      b.textContent = a.name;
      b.style.cssText = 'padding:8px 12px;border-radius:6px;border:1px solid #333;background:#222;color:#fff;cursor:pointer;text-align:left;';
      b.onclick = () => done(a.id);
      box.appendChild(b);
    });
    const skip = document.createElement('button');
    skip.textContent = 'Share without app audio';
    skip.style.cssText = 'margin-top:6px;padding:8px 12px;border-radius:6px;border:none;background:#ed4245;color:#fff;cursor:pointer;';
    skip.onclick = () => done(null);
    box.appendChild(skip);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  });
}

const IS_WINDOWS = /Windows/i.test(navigator.userAgent);
const SHARE_PICKER_THEME_OVERRIDE = {};

function getSharePickerTheme() {
  const clear = c => !c || c === 'transparent' || /rgba\([^)]*,\s*0(\.0+)?\)\s*$/.test(c);
  const sample = (tag, cls) => {
    const el = document.createElement(tag);
    el.className = cls;
    el.style.cssText = 'position:fixed;left:-9999px;top:0;visibility:hidden;';
    document.body.appendChild(el);
    const cs = getComputedStyle(el);
    const r = { bg: cs.backgroundColor, color: cs.color, border: cs.borderTopColor, radius: cs.borderTopLeftRadius };
    el.remove();
    return r;
  };
  const body = getComputedStyle(document.body);
  const card = sample('div', 'ss-card');
  const danger = sample('button', 'ss-btn ss-btn-danger');
  const dot = sample('span', 'ss-dot');
  const first = (...c) => c.find(x => !clear(x));
  return {
    bg: first(card.bg, body.backgroundColor) || '#0d0d0d',
    text: first(body.color) || '#fff',
    border: first(card.border) || 'rgba(255,255,255,.1)',
    radius: card.radius && card.radius !== '0px' ? card.radius : '12px',
    accent: first(danger.bg, dot.bg, danger.color) || '#ed4245',
    font: body.fontFamily,
    ...SHARE_PICKER_THEME_OVERRIDE
  };
}

async function pickShareSource(sources) {
  window.__r00tedShareCancelled = false;
  window.__r00tedShareAudioChoice = null;

  let devices = [];
  if (IS_WINDOWS) {
    try {
      devices = (await navigator.mediaDevices.enumerateDevices()).filter(d =>
        d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications');
    } catch (e) { console.warn("Could not list audio devices:", e); }
  }

  const T = getSharePickerTheme();
  const soft = 'rgba(255,255,255,.06)';
  let selectedId = null;

  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:40000;display:flex;align-items:center;justify-content:center;';

    const box = document.createElement('div');
    box.style.cssText = `background:#000000d1;color:${T.text};font-family:${T.font};border:1px solid #232529; border-radius:${T.radius};padding:18px;width:640px;max-width:94vw;max-height:86vh;display:flex;flex-direction:column;gap:12px;box-shadow:0 20px 60px rgba(0,0,0,.6);`;

    const title = document.createElement('div');
    title.textContent = 'Share your screen';
    title.style.cssText = 'font-weight:600;font-size:16px;';
    box.appendChild(title);

    const scroller = document.createElement('div');
    scroller.style.cssText = 'overflow-y:auto;display:flex;flex-direction:column;gap:12px;padding-right:2px;';
    box.appendChild(scroller);

    let shareBtn;
    const tiles = new Map();

    const select = id => {
      selectedId = id;
      tiles.forEach((el, k) => { el.style.borderColor = k === id ? T.accent : 'transparent'; });
      shareBtn.disabled = false;
      shareBtn.style.opacity = '1';
    };

    const section = (label, items) => {
      if (!items.length) return;
      const h = document.createElement('div');
      h.textContent = label;
      h.style.cssText = 'font-size:12px;opacity:.6;text-transform:uppercase;letter-spacing:.06em;';
      scroller.appendChild(h);
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;';
      items.forEach(src => {
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.style.cssText = `background:${soft};color:inherit;font:inherit;border:2px solid transparent;border-radius:10px;padding:6px;cursor:pointer;display:flex;flex-direction:column;gap:6px;text-align:left;`;
        const img = document.createElement('div');
        img.style.cssText = `aspect-ratio:16/9;border-radius:6px;background:#000 ${src.thumb ? `url(${src.thumb})` : ''} center/contain no-repeat;`;
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:6px;min-width:0;';
        if (src.icon) {
          const ic = document.createElement('img');
          ic.src = src.icon;
          ic.style.cssText = 'width:16px;height:16px;flex:none;';
          row.appendChild(ic);
        }
        const name = document.createElement('span');
        name.textContent = src.name || 'Screen';
        name.style.cssText = 'font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        row.appendChild(name);
        tile.appendChild(img);
        tile.appendChild(row);
        tile.onclick = () => select(src.id);
        tile.ondblclick = () => { select(src.id); finish(true); };
        tiles.set(src.id, tile);
        grid.appendChild(tile);
      });
      scroller.appendChild(grid);
    };

    section('Screens', sources.filter(x => x.isScreen));
    section('Windows', sources.filter(x => !x.isScreen));
    const audioRow = document.createElement('div');
    audioRow.style.cssText = 'display:flex;align-items:center;gap:10px;';
    const audioLabel = document.createElement('span');
    audioLabel.textContent = 'Audio';
    audioLabel.style.cssText = 'font-size:13px;opacity:.8;flex:none;';
    const audioSel = document.createElement('select');
    audioSel.style.cssText = `flex:1;min-width:0;background:${soft};color:inherit;font:inherit;font-size:13px; border:2px solid #232529 ;border-radius:8px;padding:8px 10px;outline:none;`;
    const addOpt = (value, text) => {
      const o = document.createElement('option');
      o.value = value;
      o.textContent = text;
      o.style.cssText = `background:${T.bg};color:${T.text};`;
      audioSel.appendChild(o);
    };
    addOpt('default', IS_WINDOWS ? 'With audio (default output device)' : 'With audio');
    devices.forEach(d => addOpt('device:' + d.deviceId, `With audio: ${d.label || 'Unnamed input'}`));
    addOpt('none', 'Without audio');
    try {
      const saved = localStorage.getItem('shareAudioChoice');
      if (saved && [...audioSel.options].some(o => o.value === saved)) audioSel.value = saved;
    } catch (e) {}
    audioRow.appendChild(audioLabel);
    audioRow.appendChild(audioSel);
    box.appendChild(audioRow);

    if (IS_WINDOWS) {
      const hint = document.createElement('div');
      hint.textContent = 'Using Voicemeeter? Pick its virtual output (e.g. "Voicemeeter Out B1") to share that bus instead of the default device.';
      hint.style.cssText = 'font-size:12px;opacity:.55;margin-top:-6px;';
      box.appendChild(hint);
    }

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;';
    const mkBtn = (text, css) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.style.cssText = `font:inherit;font-size:14px;border-radius:8px;padding:8px 18px;cursor:pointer;border:1px solid #232529; ${css}`;
      return b;
    };
    const cancelBtn = mkBtn('Cancel', `background:transparent;color:${T.text};`);
    shareBtn = mkBtn('Share', `background:${T.accent};border-color:${T.accent};color:#fff;font-weight:600;opacity:.45;`);
    shareBtn.disabled = sources.length > 0;
    if (!sources.length) shareBtn.style.opacity = '1';
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(shareBtn);
    box.appendChild(btnRow);

    const close = result => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const finish = ok => {
         if (!ok || (!selectedId && sources.length)) {
        window.__r00tedShareCancelled = true;
        return close(null);
      }
      const v = audioSel.value;
      try { localStorage.setItem('shareAudioChoice', v); } catch (e) {}
      let audio = { mode: 'default' };
      if (v === 'none') audio = { mode: 'none' };
      else if (v.startsWith('device:')) {
        const deviceId = v.slice(7);
        audio = { mode: 'device', deviceId, label: devices.find(d => d.deviceId === deviceId)?.label };
      }
      window.__r00tedShareAudioChoice = audio;
      close({ sourceId: selectedId, audio });
    };
    const onKey = e => {
      if (e.key === 'Escape') finish(false);
         else if (e.key === 'Enter' && (selectedId || !sources.length)) finish(true);
    };

    cancelBtn.onclick = () => finish(false);
    shareBtn.onclick = () => finish(true);
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) finish(false); });
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    const firstScreen = sources.find(x => x.isScreen) || sources[0];
    if (firstScreen) select(firstScreen.id);
  });
}
window.__r00tedPickShare = pickShareSource;

async function teardownShareAudio() {
  const mix = shareMix;
  shareMix = null;
  if (!mix) return;
  if (conference && mix.mixedTrack && localAudioTrack) {
    try { await conference.replaceTrack(mix.mixedTrack, localAudioTrack); } catch (e) {}
  }
  currentActiveAudioTrack = localAudioTrack;
  try { mix.mixedTrack?.dispose(); } catch (e) {}
  try { await mix.ctx?.close(); } catch (e) {}
  try { mix.monitorStream?.getTracks().forEach(t => t.stop()); } catch (e) {}
  if (mix.shareState) {
    try { await window.electronAPI.linuxAudioShareStop(mix.shareState); } catch (e) {}
  }
}

async function stopScreenShare() {
  miniKeys.delete('local-screen');
  if (conference && screenTrack) { try { await conference.removeTrack(screenTrack); } catch (e) {} }
  await teardownShareAudio();
  try { screenTrack?.dispose(); } catch (e) {}
  try { screenAudioTrack?.dispose(); } catch (e) {}
  screenTrack = null;
  screenAudioTrack = null;
  const btn = document.getElementById('screenBtn');
  if (btn) { btn.style.background = ''; btn.classList.remove('sharing'); }
  removeScreenCard("data-screen-id", "local-screen");
  socket.emit("screenShareStop", { userId: user.id, username: user.username, roomName: currentVoiceRoom });
}

async function toggleScreenShare() {
  if (screenTrack) { await stopScreenShare(); return; }

  let linuxShareState = null;
  let monitorStream = null;
  const cleanupLinux = () => {
    if (monitorStream) { monitorStream.getTracks().forEach(t => t.stop()); monitorStream = null; }
    if (linuxShareState) { window.electronAPI.linuxAudioShareStop(linuxShareState).catch(() => {}); linuxShareState = null; }
  };

  try {
    if (!conference) { showToast("❌ You must join voice first to share screen"); return; }

    window.__r00tedShareCancelled = false;
    window.__r00tedShareAudioChoice = null;
    let tracks = [];
    try {
      tracks = await JitsiMeetJS.createLocalTracks({
        devices: ['desktop'],
        desktopSharingFrameRate: { min: 5, max: 30 },
        constraints: { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, restrictOwnAudio: true } }
      });
    } catch (e) {
      console.error("❌ Desktop capture failed:", e);
      if (!window.__r00tedShareCancelled) showToast("❌ Screen capture failed. Make sure you selected a window/screen.");
      cleanupLinux();
      return;
    }

  
    const shareChoice = window.__r00tedShareAudioChoice || { mode: 'none' };
    window.__r00tedShareAudioChoice = null;

    screenTrack = null;
    screenAudioTrack = null;
    for (const t of tracks) {
      if (!t || typeof t.getType !== 'function') continue;
      const type = t.getType();
      if (type === 'video' && !screenTrack) {
        screenTrack = t;
      } else if (type === 'audio') {
        if (IS_LINUX || shareChoice.mode !== 'default' || screenAudioTrack) { try { t.dispose(); } catch (e) {} }
        else screenAudioTrack = t;
      }
    }

    if (!screenTrack) {
      showToast("❌ Could not capture screen video");
      cleanupLinux();
      return;
    }

    if (IS_LINUX && shareChoice.mode !== 'none' && window.electronAPI?.linuxAudioShareStart && localAudioTrack) {
  try {
    linuxShareState = await window.electronAPI.linuxAudioShareStart();
    await new Promise(r => setTimeout(r, 400));
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mon = devices.find(d => d.kind === 'audioinput' && /R00TED-Share|r00ted_share/i.test(d.label));
    if (mon) {
      monitorStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: mon.deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
    } else {
      showToast("Couldn't find the share audio device. Sharing without app audio.");
    }
  } catch (e) {
    console.error("Linux audio setup failed:", e);
    showToast("System audio setup failed. Sharing without audio.");
  }
}

    if (!IS_LINUX && shareChoice.mode === 'device') {
      try {
        monitorStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: shareChoice.deviceId },
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 2
          }
        });
      } catch (e) {
        console.error("Share audio device failed:", e);
        showToast("Couldn't open that audio device. Sharing without audio.");
      }
    }

    await new Promise(r => setTimeout(r, 1000));

    try {
      await conference.addTrack(screenTrack);

      const extraAudio = monitorStream?.getAudioTracks()[0] || screenAudioTrack?.getTrack?.() || null;

      if (extraAudio && localAudioTrack) {
        try {
          const ctx = new AudioContext();
          if (ctx.state === 'suspended') await ctx.resume();

          const micSource = ctx.createMediaStreamSource(new MediaStream([localAudioTrack.getTrack()]));
          const micGain = ctx.createGain();
          micGain.gain.value = (isCurrentlyMuted || (pttEnabled() && !pttHeld)) ? 0 : 1;
          const shareSource = ctx.createMediaStreamSource(new MediaStream([extraAudio]));
          const destination = ctx.createMediaStreamDestination();

          micSource.connect(micGain);
          micGain.connect(destination);
          shareSource.connect(destination);

          destination.stream.getAudioTracks()[0].contentHint = 'music';

          const [mixedJitsiTrack] = await JitsiMeetJS.createLocalTracksFromMediaStreams([{
            stream: destination.stream, sourceType: 'mic', mediaType: 'audio'
          }]);

          try { mixedJitsiTrack.getTrack().contentHint = 'music'; } catch (e) {}

          await conference.replaceTrack(localAudioTrack, mixedJitsiTrack);
          currentActiveAudioTrack = mixedJitsiTrack;

          shareMix = { ctx, micGain, mixedTrack: mixedJitsiTrack, monitorStream, shareState: linuxShareState };
          const probe = (label, stream) => {
  const a = ctx.createAnalyser();
  ctx.createMediaStreamSource(stream).connect(a);
  const buf = new Uint8Array(a.fftSize);
  let n = 0;
  const t = setInterval(() => {
    a.getByteTimeDomainData(buf);
    const peak = Math.max(...buf.map(v => Math.abs(v - 128)));
    console.log(`[probe] ${label} peak=${peak}`);
    if (++n >= 8) clearInterval(t);
  }, 500);
};
console.log("[probe] ctx.state:", ctx.state,
  "| monitor track:", extraAudio.readyState, "muted:", extraAudio.muted,
  "| mixed jitsi muted:", mixedJitsiTrack.isMuted());
probe("monitor (app audio)", new MediaStream([extraAudio]));
probe("mixed output", destination.stream);
          monitorStream = null;
          linuxShareState = null;
        } catch (e) {
          console.warn("Audio mixing failed:", e);
          try { screenAudioTrack?.dispose(); } catch (_) {}
          screenAudioTrack = null;
        }
      }
      cleanupLinux();
    } catch (e) {
      console.error("❌ Failed to add tracks:", e);
      try { screenTrack.dispose(); } catch (_) {}
      try { screenAudioTrack?.dispose(); } catch (_) {}
      screenTrack = null;
      screenAudioTrack = null;
      await teardownShareAudio();
      cleanupLinux();
      return;
    }

    await new Promise(r => setTimeout(r, 2500));
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
    const chipText = document.createElement("span");
    chipText.textContent = "You're sharing your screen";
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
    stopBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleScreenShare(); });

    controls.appendChild(fullscreenBtn);
    addMiniPlayerToggle(wrapper, controls, video, 'Your screen', 'local-screen');
    controls.appendChild(stopBtn);
    wrapper.appendChild(controls);
    screenContainer.appendChild(wrapper);

    screenTrack.attach(video);
    video.addEventListener('loadedmetadata', () => {
      loading.style.display = "none";
      video.style.opacity = "1";
    }, { once: true });

    screenContainer.classList.add("show");
    screenContainer.style.display = "flex";
    document.getElementById('screenBtn').classList.add('sharing');

    socket.emit("screenShareStart", {
      userId: user.id, username: user.username, roomName: currentVoiceRoom,
      avatar: user.avatar, usernameColor: user.usernameColor, level: user.level || 1
    });

    const trackRef = screenTrack;
    screenTrack.addEventListener(JitsiMeetJS.events.track.LOCAL_TRACK_STOPPED, async () => {
      if (screenTrack !== trackRef) return;
      await stopScreenShare();
    });

  } catch (err) {
    console.error("❌ Screen share error:", err);
    screenTrack = null;
    screenAudioTrack = null;
    await teardownShareAudio();
    cleanupLinux();
    const btn = document.getElementById('screenBtn');
    if (btn) btn.style.background = '';
    showToast(err.name === "NotAllowedError" ? "❌ Screen share cancelled" : "❌ Screen share failed: " + err.message);
  }
}




function leaveVoice() {
  try { setCallView(false); } catch (e) {}
  const roomSlug = currentVoiceRoom || document.querySelector('.voice-channel.active')?.dataset.room;
  currentVoiceRoom = null;

  try {
    try { stopPingMonitor(); } catch (e) { console.error("stopPingMonitor error:", e); }

    const roomLabelEl = document.getElementById('voiceRoomLabel');
    if (roomLabelEl) roomLabelEl.textContent = '';

    if (roomSlug) {
      try {
        socket.emit("voiceLeave", { roomName: roomSlug, userId: user.id });
      } catch (e) { console.error("voiceLeave emit error:", e); }
    }

    if (conference) {
      try { conference.leave(); } catch (e) { console.error("conference.leave error:", e); }
      conference = null;
    }

    if (localAudioTrack) {
      try { localAudioTrack.dispose(); } catch (e) { console.error("localAudioTrack dispose error:", e); }
      localAudioTrack = null;
    }

    try {
      screenShareIntervals.forEach((interval) => clearInterval(interval));
      screenShareIntervals.clear();
    } catch (e) { console.error("screenShareIntervals cleanup error:", e); }

    try {
      remoteTracks.forEach((audio, id) => {
        try { audio.srcObject = null; audio.remove(); } catch (e) {}
        if (audioContexts.has(id)) {
          audioContexts.get(id).context.close().catch(() => {});
          audioContexts.delete(id);
        }
        if (audioGainNodes.has(id)) audioGainNodes.delete(id);
      });
      remoteTracks.clear();
    } catch (e) { console.error("remoteTracks cleanup error:", e); }

    voiceStates.clear();
    lastLoudAt.clear();
    speakingState.clear();
    isCurrentlyMuted = false;
    isDeafened = false;

    try { document.getElementById('muteBtn')?.classList.remove('muted'); } catch (e) {}
    try { document.getElementById('deafenBtn')?.classList.remove('muted'); } catch (e) {}
    try { document.querySelectorAll('.voice-channel').forEach(ch => ch.classList.remove('active')); } catch (e) {}

    try {
      const panel = document.getElementById('voicePanel');
      if (panel) {
        panel.classList.remove('show');
        panel.style.display = 'none';
        document.querySelector('.sidebar2-content')?.appendChild(panel);
      }
    } catch (e) { console.error("voicePanel cleanup error:", e); }

    if (window.electronAPI?.overlayVoiceUpdate) {
      try { window.electronAPI.overlayVoiceUpdate([]); } catch (e) {}
    }

    try { updateVcPresence(); } catch (e) { console.error("updateVcPresence error:", e); }

  } catch (e) {
    console.error("leaveVoice unexpected error:", e);
  } finally {
   


    if (cameraTrack) {
      try { cameraTrack.dispose(); } catch (e) {}
      cameraTrack = null;
    }
    const cameraBtn = document.getElementById('cameraBtn');
    if (cameraBtn) {
      cameraBtn.classList.remove('active');
      cameraBtn.style.background = '';
    }
    try { removeCameraPreview(); } catch (e) { console.error("removeCameraPreview error:", e); }
    if (screenTrack) {
      try { screenTrack.dispose(); } catch (e) {}
      screenTrack = null;
    }
    if (screenAudioTrack) {
      try { screenAudioTrack.dispose(); } catch (e) {}
      screenAudioTrack = null;
    }
    const screenBtn = document.getElementById('screenBtn');
    if (screenBtn) {
      screenBtn.classList.remove('sharing');
      screenBtn.style.background = '';
    }
    try { removeScreenCard("data-screen-id", "local-screen"); } catch (e) {}

  
    const vcButtons = document.getElementById('vcButtons');
    if (vcButtons) vcButtons.style.display = 'none';

  
    const pingEl = document.getElementById('pingDisplay');
    if (pingEl) pingEl.style.display = 'none';

    ['voiceControls', 'voiceStatusBar', 'voiceStatusLabel'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.remove('ping-good', 'ping-warning', 'ping-bad');
        el.style.color = '';
      }
    });
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
  remoteTracks.forEach((audio, id) => {
  const g = audioGainNodes.get(id);
  if (g) g.gain.value = isDeafened ? 0 : (currentVolumeSliders.get(id) ?? 1);
  else audio.muted = isDeafened;
});
  document.getElementById('deafenBtn').classList.toggle('muted', isDeafened);
  voiceStates.set(user.id, { isMuted: isCurrentlyMuted, isDeafened: isDeafened });
  socket.emit("voiceStateChange", {
    userId: user.id,
    isMuted: isCurrentlyMuted,
    isDeafened: isDeafened
  });

  updateVoiceUI();
  updateVcStatusText();
}
let liveStreams = []; 

document.addEventListener('DOMContentLoaded', function() {
    if (typeof user !== 'undefined' && user.avatar) {
    initVoicePanelIdentity();
    updateVcPresence();
  }
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
    miniKeys.delete(`${participantId}:${track.getVideoType && track.getVideoType() === 'desktop' ? 'screen' : 'camera'}`);
    if (screenShareIntervals.has(participantId)) {
      clearInterval(screenShareIntervals.get(participantId));
      screenShareIntervals.delete(participantId);
      console.log("Cleared interval for", participantId);
    }
    
       const wrapper = document.querySelector(`[data-screen-id="${participantId}"]`);
    if (wrapper) {
      const video = wrapper.querySelector('video');
      if (video) {
        if (video.__mpStallTimeout) {
          clearTimeout(video.__mpStallTimeout);
          video.__mpStallTimeout = null;
        }
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

  function rowSig(id, avatar, username, colorClass, level, badge, isAdmin, isDeveloper, isPromptEngineer, prestigeBadge, customRoleIds, isMuted, isDeafened, streamStatus) {
    return [id, avatar, username, colorClass, level, badge, isAdmin, isDeveloper, isPromptEngineer, prestigeBadge, (customRoleIds||[]).join(","), isMuted, isDeafened, streamStatus || ""].join("|");
  }

  const existingRows = new Map();
  container.querySelectorAll('[data-vp-row-id]').forEach(el => existingRows.set(el.dataset.vpRowId, el));

  const fragment = document.createDocumentFragment();
  const usedIds = new Set();
  {
    const id = "local";
    const localStreamStatus = window.currentStreamStatus || null;
    const sig = rowSig(id, user.avatar, user.username, user.usernameColor || "username-cyan", user.level || 1, user.badge || null, user.isAdmin || false, user.isDeveloper || false, user.isPromptEngineer || false, user.prestigeBadge || null, user.customRoleIds || [], isCurrentlyMuted, isDeafened, localStreamStatus);
    const existing = existingRows.get(id);
    usedIds.add(id);
    if (existing && existing.dataset.vpRowSig === sig) {
      fragment.appendChild(existing);
    } else {
      const row = buildParticipantRow("local", user.avatar, user.username, user.usernameColor || "username-cyan", user.level || 1, user.badge || null, user.isAdmin || false, user.isDeveloper || false, user.isPromptEngineer || false, user.prestigeBadge || null, user.customRoleIds || [], localStreamStatus);
      row.dataset.vpRowId = id;
      row.dataset.vpRowSig = sig;
      row.addEventListener('contextmenu', (e) => {
        const usernameEl = row.querySelector('.username-wrapper');
        showVolumeContextMenu(e, "local", usernameEl ? usernameEl.textContent.trim() : 'You');
      });
      fragment.appendChild(row);
    }
  }

  remoteTracks.forEach((audio, id) => {
    const participant = conference ? conference.getParticipantById(id) : null;
    if (!participant) return;

    const remoteCustomRoleIds = (() => {
      try { return JSON.parse(participant.getProperty("customRoleIds") || "[]"); }
      catch { return []; }
    })();

    const avatar = participant.getProperty("avatar") || "/avatars/default1.png";
    const username = participant.getDisplayName() || "Anonymous";
    const colorClass = participant.getProperty("usernameColor") || "username-cyan";
    const level = parseInt(participant.getProperty("level")) || 1;
    const badge = participant.getProperty("badge") || null;
    const isAdmin = participant.getProperty("isAdmin") === "true";
    const isDeveloper = participant.getProperty("isDeveloper") === "true";
    const isPromptEngineer = participant.getProperty("isPromptEngineer") === "true";
    const prestigeBadge = participant.getProperty("prestigeBadge") || null;
    const streamStatus = participant.getProperty("streamStatus") || null;
    const stateKey = participant.getProperty("userId") || id;
    const state = voiceStates.get(stateKey) || { isMuted: false, isDeafened: false };

    const sig = rowSig(id, avatar, username, colorClass, level, badge, isAdmin, isDeveloper, isPromptEngineer, prestigeBadge, remoteCustomRoleIds, state.isMuted, state.isDeafened, streamStatus);
    const existing = existingRows.get(id);
    usedIds.add(id);

    if (existing && existing.dataset.vpRowSig === sig) {
      fragment.appendChild(existing);
    } else {
      const remoteRow = buildParticipantRow(id, avatar, username, colorClass, level, badge, isAdmin, isDeveloper, isPromptEngineer, prestigeBadge, remoteCustomRoleIds, streamStatus);
      remoteRow.dataset.vpRowId = id;
      remoteRow.dataset.vpRowSig = sig;
      remoteRow.addEventListener('contextmenu', (e) => {
        const usernameEl = remoteRow.querySelector('.username-wrapper');
        showVolumeContextMenu(e, id, usernameEl ? usernameEl.textContent.trim() : 'User');
      });
      fragment.appendChild(remoteRow);
    }
  });

  container.innerHTML = "";
  container.appendChild(fragment);

  if (currentVoiceRoom) {
    const countEl = document.getElementById(`vcCount-${currentVoiceRoom}`);
    if (countEl) {
      countEl.textContent = remoteTracks.size + 1;
    }
  }

  document.querySelectorAll('.voice-participant').forEach(el => {
    const id = el.getAttribute('data-id');
    const isSpeaking = !!speakingState.get(id);
    el.classList.toggle("speaking", isSpeaking);
    applySpeakingStyle(el, isSpeaking);
  });
  pushOverlayVoiceUpdate();
  updateVoiceChannelParticipantLists();
  try { initVoicePanelIdentity(); } catch (e) { console.warn("initVoicePanelIdentity failed:", e); }
}

function getAvatarGlowColor(colorClass) {
  const gradEntry = colors.find(c => c.cls === colorClass);
  if (gradEntry) {
    const match = gradEntry.grad.match(/#([0-9a-fA-F]{3,8})/);
    if (match) return '#' + match[1];
  }
  return colorClassToHex[colorClass] || '#00f2ff';
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
  if (speakingState.get(id)) {
    const glowColor = getAvatarGlowColor(colorClass || 'username-cyan');
    img.style.setProperty('outline', `3px solid ${glowColor}`, 'important');
    img.style.setProperty('outline-offset', '2px', 'important');
  }
  

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

  if (clampedVolume <= 1 && !audioGainNodes.has(participantId)) {
    audio.volume = clampedVolume;
    return;
  }

 
  audio.volume = 1;

if (!audioGainNodes.has(participantId)) {
  try {
    const ctx = getAudioContext();
    const stream = audio.srcObject;
    if (!stream) return;
    const source = ctx.createMediaStreamSource(stream);
    const gainNode = ctx.createGain();
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    audio.muted = true;
    audioGainNodes.set(participantId, gainNode);
  } catch (e) {
    console.warn("GainNode setup failed:", e);
    return;
  }
}
audioGainNodes.get(participantId).gain.value = isDeafened ? 0 : clampedVolume;
}

function toggleMute() {
  if (!localAudioTrack) return;

  isCurrentlyMuted = !isCurrentlyMuted;

  applyMicState();
  if (shareMix?.micGain) shareMix.micGain.gain.value = isCurrentlyMuted ? 0 : 1;

  document.getElementById('muteBtn').classList.toggle('muted', isCurrentlyMuted);
  voiceStates.set(user.id, { isMuted: isCurrentlyMuted, isDeafened: isDeafened });
  socket.emit("voiceStateChange", {
    userId: user.id,
    isMuted: isCurrentlyMuted,
    isDeafened: isDeafened
  });

  updateVoiceUI();
  updateVcStatusText();
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




function userjoinSound() {
  userJoinAudio.currentTime = 0;
  userJoinAudio.play().catch(e => console.warn("Join sound blocked:", e));
}

function userleaveSound() {
  userLeaveAudio.currentTime = 0;
  userLeaveAudio.play().catch(e => console.warn("Leave sound blocked:", e));
}

function initVoicePanelIdentity() {
  const avatarEl = document.getElementById('vcPanelAvatar');
  const nameEl = document.getElementById('vcPanelUsername');
  const colorClass = user.usernameColor || 'username-cyan';

  if (avatarEl) {
    avatarEl.src = sanitizeAvatar(user.avatar) || '/avatars/default1.png';
    avatarEl.setAttribute('data-color', colorClass);
    applyAvatarBorder(avatarEl, colorClass, 3);
  }

  if (nameEl) {
    const newClass = `username-wrapper ${colorClass}`;
    if (nameEl.className !== newClass) nameEl.className = newClass;

    const text = user.username || 'You';
    if (nameEl.getAttribute('data-text') !== text) {
      nameEl.setAttribute('data-text', text);
      nameEl.textContent = text;
    }

    nameEl.style.setProperty('-webkit-background-clip', 'text', 'important');
    nameEl.style.setProperty('background-clip', 'text', 'important');
    nameEl.style.setProperty('color', 'transparent', 'important');

    
    let rowEl = document.getElementById('vcPanelNameRow');
    if (!rowEl) {
      rowEl = document.createElement('div');
      rowEl.id = 'vcPanelNameRow';
      rowEl.style.cssText = 'display:flex; align-items:center; gap:4px; min-width:0;';
      nameEl.parentNode.insertBefore(rowEl, nameEl);
      rowEl.appendChild(nameEl);
    }

    let metaEl = document.getElementById('vcPanelMeta');
    if (!metaEl) {
      metaEl = document.createElement('span');
      metaEl.id = 'vcPanelMeta';
      metaEl.style.cssText = 'display:inline-flex; align-items:center; gap:4px; flex-shrink:0;';
      rowEl.appendChild(metaEl);
    }
    metaEl.innerHTML = '';
    try {
      const row = buildParticipantRow(
        "local", user.avatar, user.username, colorClass,
        user.level || 1, user.badge || null,
        user.isAdmin || false, user.isDeveloper || false, user.isPromptEngineer || false,
        user.prestigeBadge || null, user.customRoleIds || []
      );
      const rowName = row.querySelector('.username-wrapper');
      const rowMeta = rowName ? rowName.nextElementSibling : null;
      if (rowMeta) {
        rowMeta.style.marginLeft = '0';
        metaEl.appendChild(rowMeta);
      }
    } catch (e) {
      console.warn('vc panel meta failed:', e);
    }
  }

  updateVcPresence();
}

function updateVcStatusText() {
  const statusEl = document.getElementById('voiceStatusLabel');
  if (!statusEl) return;
  if (user.gameStatus) {
    statusEl.textContent = user.gameStatus;
    return;
  }
  if (user.musicStatus) {
    statusEl.textContent = user.musicStatus;
    return;
  }
  if (window.currentStreamStatus) {
    statusEl.textContent = window.currentStreamStatus;
    return;
  }


  if (isDeafened && isCurrentlyMuted) {
    statusEl.textContent = 'Muted & Deafened';
  } else if (isDeafened) {
    statusEl.textContent = 'Deafened';
  } else if (isCurrentlyMuted) {
    statusEl.textContent = 'Muted';
  } else if (user.customStatus) {
    statusEl.textContent = user.customStatus;
  } else {
    statusEl.textContent = 'Online';
  }
}
function updateVcPresence() {
  const dot = document.getElementById('vcStatusDot');
  const label = document.getElementById('voiceStatusLabel');
  if (!dot || !label) return;

  label.style.color = '';

  const status = user.status || 'online';
  dot.className = `status-dot status-${status}`;
  if (conference) {
    updateVcStatusText();
    return;
  }
  if (user.gameStatus) {
    label.textContent = user.gameStatus;
  } else if (user.musicStatus) {
    label.textContent = user.musicStatus;
  } else if (window.currentStreamStatus) {
    label.textContent = window.currentStreamStatus;
  } else if (user.customStatus) {
    label.textContent = user.customStatus;
  } else {
    label.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  }
}

let cameraTrack = null;

function removeCameraPreview() {
  removeScreenCard("data-camera-id", "local-camera");
}

async function toggleCamera() {
  if (cameraTrack) {
    if (conference) {
      try { await conference.removeTrack(cameraTrack); } catch (e) {}
    }
    try { cameraTrack.dispose(); } catch (e) {}
    cameraTrack = null;
    miniKeys.delete('local-camera');
    const btn = document.getElementById('cameraBtn');
    btn.classList.remove('active');
    btn.style.background = '#181818';
    removeCameraPreview();
    return;
  }

  try {
    if (!conference) {
      showToast("❌ You must join voice first to use your camera");
      return;
    }

    const tracks = await JitsiMeetJS.createLocalTracks({ devices: ['video'] });
    cameraTrack = tracks[0];
    if (!cameraTrack) {
      showToast("❌ Could not access camera");
      return;
    }

    await conference.addTrack(cameraTrack);
    const btn = document.getElementById('cameraBtn');
    btn.classList.add('active');
    btn.style.background = '#ed4245';
    removeCameraPreview();
    const screenContainer = document.getElementById("screenContainer");

    const wrapper = document.createElement("div");
    wrapper.className = "ss-card ss-local";
    wrapper.setAttribute("data-camera-id", "local-camera");

    const loading = document.createElement("div");
    loading.className = "ss-loading";
    const spinner = document.createElement("div");
    spinner.className = "ss-spinner";
    const loadingText = document.createElement("div");
    loadingText.textContent = "Starting your camera…";
    loading.appendChild(spinner);
    loading.appendChild(loadingText);
    wrapper.appendChild(loading);

    const video = document.createElement("video");
    video.className = "ss-video";
    video.autoplay = true;
    video.muted = true;
    video.style.objectFit = "cover";
    video.style.transform = "scaleX(-1)"; 
    video.style.opacity = "0";
    video.style.transition = "opacity 0.2s ease";
    wrapper.appendChild(video);

    const chip = document.createElement("div");
    chip.className = "ss-chip";
    const chipText = document.createElement("span");
    chipText.textContent = "Your camera";
    chip.appendChild(chipText);
    wrapper.appendChild(chip);

    const controls = document.createElement("div");
    controls.className = "ss-controls";

    const stopBtn = document.createElement("button");
    stopBtn.className = "ss-btn ss-btn-danger";
    stopBtn.title = "Turn off camera";
    stopBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
    stopBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleCamera();
    });
    addMiniPlayerToggle(wrapper, controls, video, 'Your camera', 'local-camera');
    controls.appendChild(stopBtn);
    wrapper.appendChild(controls);

    screenContainer.appendChild(wrapper);
    cameraTrack.attach(video);

    video.addEventListener('loadedmetadata', () => {
      loading.style.display = "none";
      video.style.opacity = "1";
      video.play().catch(e => console.error("Play error:", e));
    }, { once: true });

    screenContainer.classList.add("show");
    screenContainer.style.display = "flex";

    cameraTrack.addEventListener(
      JitsiMeetJS.events.track.TRACK_STOPPED,
      () => {
        cameraTrack = null;
        const btn = document.getElementById('cameraBtn');
        btn.classList.remove('active');
        btn.style.background = '#181818';
        removeCameraPreview();
      }
    );

    console.log("📹 Camera enabled");
  } catch (e) {
    console.error("Camera error:", e);
    if (e.name === "NotAllowedError") {
      showToast("❌ Camera permission denied");
    } else {
      showToast("❌ Could not start camera: " + e.message);
    }
  }
}