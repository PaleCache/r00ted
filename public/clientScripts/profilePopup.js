function showProfilePopup(userData, clickX, clickY) {
  currentProfileUser = userData;
    console.log('popup data:', JSON.stringify({
    music: userData.musicStatus,
    stream: userData.streamStatus,
    custom: userData.customStatus,
    game: userData.gameStatus
  }));
  const popup = document.getElementById('userProfilePopup');
  const bannerEl = document.getElementById('popupBanner');
  const popupContent = document.querySelector('.popup-content'); 
  const avatar = document.getElementById('popupAvatar');
  const usernameEl = document.getElementById('popupUsername');
  const statusDot = document.getElementById('popupStatusDot');
  const statusText = document.getElementById('popupStatusText');
  const LevelText = document.getElementById('popupLevel');
  const borderGradient = userData.profileGradient || 'linear-gradient(135deg, #181818, #ffffff)';
  let popupBorderStyle = document.getElementById('userProfilePopupBorderStyle');
  if (popupBorderStyle) popupBorderStyle.remove();

   let effectOverlay = document.getElementById('popupEffectOverlay');
  if (!effectOverlay) {
    effectOverlay = document.createElement('div');
    effectOverlay.id = 'popupEffectOverlay';
    effectOverlay.style.cssText = `
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 2;
      border-radius: inherit;
      overflow: hidden;
    `;
    popup.appendChild(effectOverlay);
  }

const REPLAY_INTERVAL_MS = 10000; 
const PLAY_DURATION_MS = 6000;   

if (window._profileEffectTimers) {
  window._profileEffectTimers.forEach(id => { clearTimeout(id); clearInterval(id); });
}
window._profileEffectTimers = [];

if (userData.profileEffect) {
  const effectUrl = sanitizeAvatar(userData.profileEffect);
  effectOverlay.innerHTML = '';
  effectOverlay.style.display = 'block';

  function playOnce() {
    effectOverlay.innerHTML = '';

    const effectImg = document.createElement('img');
    effectImg.style.cssText = `
      width: 100%;
      height: 100%;
      object-fit: cover;
    `;
    effectImg.src = effectUrl + (effectUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
    effectOverlay.appendChild(effectImg);

    const removeTimer = setTimeout(() => {
      effectOverlay.innerHTML = '';
    }, PLAY_DURATION_MS);

    window._profileEffectTimers.push(removeTimer);
  }

  playOnce();
  const loopTimer = setInterval(playOnce, REPLAY_INTERVAL_MS);
  window._profileEffectTimers.push(loopTimer);

} else {
  effectOverlay.innerHTML = '';
  effectOverlay.style.display = 'none';
}

  popupBorderStyle = document.createElement('style');
  popupBorderStyle.id = 'userProfilePopupBorderStyle';
  popupBorderStyle.textContent = `
    #userProfilePopup {
      background: 
        linear-gradient(#1e1f22, #1e1f22) padding-box,
        ${borderGradient} border-box !important;
      border: 3px solid transparent !important;
      border-radius: 12px;
    }
  `;
  document.head.appendChild(popupBorderStyle);

  popup.style.background = '';
  popup.style.border = '';

  if (userData.banner && userData.banner.trim() !== "") {
    bannerEl.style.backgroundImage = `url('${sanitizeAvatar(userData.banner)}'), ${userData.profileGradient || 'linear-gradient(135deg, #181818, #ffffff)'}`;
    bannerEl.style.backgroundSize = "cover";
    bannerEl.style.backgroundPosition = "center";
  } else {
    bannerEl.style.backgroundImage = userData.profileGradient || 'linear-gradient(135deg, #181818, #ffffff)';
  }

  if (userData.profileGradient) {
    popupContent.style.background = `linear-gradient(rgba(30, 31, 34, 0), rgba(30,31,34,0.93)), ${userData.profileGradient}`;
    popupContent.style.backgroundBlendMode = 'normal';
  } else {
    popupContent.style.background = '#1e1f22';
  }

  avatar.src = sanitizeAvatar(userData.avatar);
  const colorClass = userData.usernameColor || 'username-cyan';
  avatar.setAttribute('data-color', colorClass);
  applyAvatarBorder(avatar, colorClass, 4);

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

  if (userData.gameStatus) {
  const gameDiv = document.createElement('div');
  gameDiv.style.marginBottom = '8px';
  const gameStrong = document.createElement('strong');
  gameStrong.style.color = '#fff';
  gameStrong.textContent = 'Playing: ';
  gameDiv.appendChild(gameStrong);
  gameDiv.appendChild(document.createTextNode(userData.gameStatus));
  infoDiv.appendChild(gameDiv);
}

  if (userData.streamStatus) {
  const streamDiv = document.createElement('div');
  streamDiv.style.cssText = 'margin-bottom:8px; display:flex; align-items:center; gap:8px;';

  const streamIconSvg = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="14" height="10" rx="2" stroke="#e6e6e7" stroke-width="1.8"/>
      <path d="M17 9l4-2v8l-4-2" stroke="#e6e6e7" stroke-width="1.8" stroke-linejoin="round"/>
    </svg>
  `;

  const iconBox = document.createElement('div');
  iconBox.style.cssText = `
    width:32px; height:32px; border-radius:4px; flex-shrink:0;
    background: linear-gradient(135deg,#2b2d31,#1a1b1e);
    display:flex; align-items:center; justify-content:center;
  `;
  iconBox.innerHTML = streamIconSvg;
  streamDiv.appendChild(iconBox);

  const textWrap = document.createElement('div');
  const streamStrong = document.createElement('strong');
  streamStrong.style.color = '#fff';
  streamStrong.textContent = 'Streaming: ';
  textWrap.appendChild(streamStrong);

  const streamText = document.createElement('span');
  streamText.textContent = userData.streamStatus;
  streamText.style.fontSize = '10px';
  streamText.style.color = '#e6e6e7';
  textWrap.appendChild(streamText);
  streamDiv.appendChild(textWrap);

  infoDiv.appendChild(streamDiv);
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

    const songName = document.createElement('span');
    songName.textContent = userData.musicStatus;
    songName.style.fontSize = '10px'; 
    songName.style.color = '#e6e6e7';   
    textWrap.appendChild(songName);
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
  console.log('infoDiv children:', infoDiv.children.length, [...infoDiv.children].map(c => c.textContent));
  
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

  if (window._profileEffectTimers) {
    window._profileEffectTimers.forEach(id => { clearTimeout(id); clearInterval(id); });
    window._profileEffectTimers = [];
  }
  const effectOverlay = document.getElementById('popupEffectOverlay');
  if (effectOverlay) effectOverlay.innerHTML = '';
}




