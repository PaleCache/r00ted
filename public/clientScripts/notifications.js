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