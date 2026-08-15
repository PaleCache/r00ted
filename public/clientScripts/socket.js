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
  if (data.profileGradient !== undefined) user.profileGradient = data.profileGradient;
  if (data.profileEffect !== undefined) user.profileEffect = data.profileEffect;
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
      if (properties.profileGradient !== undefined) user.profileGradient = properties.profileGradient;
      if (properties.profileEffect !== undefined) user.profileEffect = properties.profileEffect;
      
    }
  }

   if (userId === user.id) {
    if (properties.isAdmin !== undefined) user.isAdmin = properties.isAdmin;
    if (properties.isDeveloper !== undefined) user.isDeveloper = properties.isDeveloper;
    if (properties.isPromptEngineer !== undefined) user.isPromptEngineer = properties.isPromptEngineer;
    if (properties.level !== undefined) user.level = properties.level;
    if (properties.profileGradient !== undefined) user.profileGradient = properties.profileGradient;
    if (properties.profileEffect !== undefined) user.profileEffect = properties.profileEffect;
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
    if (data.user.profileGradient !== undefined) target.profileGradient = data.user.profileGradient;
    if (data.user.profileEffect !== undefined) target.profileEffect = data.user.profileEffect;
  }

  if (data.user.id === user.id) {
    if (data.user.level !== undefined) user.level = data.user.level;
    if (data.user.xp !== undefined) user.xp = data.user.xp;
    if (data.user.usernameColor) user.usernameColor = data.user.usernameColor;
    if (data.user.badge !== undefined) user.badge = data.user.badge;
    if (data.user.customRoleIds !== undefined) user.customRoleIds = data.user.customRoleIds;
    if (data.user.profileGradient !== undefined) user.profileGradient = data.user.profileGradient;
    if (data.user.profileEffect !== undefined) user.profileEffect = data.user.profileEffect;

    localStorage.setItem("chatUser", JSON.stringify(user));
    updateCircularLevel();
    console.log(`🔄 Self update Level ${user.level} | XP ${user.xp}`);
  }

  if (data.user.level !== undefined){
    target.level = data.user.level;
  }

  renderUsers(currentUsers);

  

});


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

socket.on('serverBannerUpdated', (data) => {
  applyServerBanner(data.url);
});


socket.on('connect', () => {
  console.log('[DEBUG] connected', socket.id, Date.now())
  if (window.electronAPI?.getRunningGames) {
    gameDetection.start();
    if (gameDetection.currentGame) {
      gameDetection.updateStatus(gameDetection.currentGame);
    }
  }
});


socket.on('whisperTyping', (data) => {
  const key = data.groupId ? convoKeyForGroup(data.groupId) : data.from;
  if (!key || data.from === user.id) return;
  if (!whisperTypingUsers.has(key)) whisperTypingUsers.set(key, new Map());
  const map = whisperTypingUsers.get(key);
  clearTimeout(map.get(data.from)?.timeout);
  map.set(data.from, {
    username: data.username || 'Someone',
    timeout: setTimeout(() => {
      map.delete(data.from);
      updateWhisperTypingIndicator(key);
    }, 4000)
  });
  updateWhisperTypingIndicator(key);
});

socket.on('whisperStopTyping', (data) => {
  const key = data.groupId ? convoKeyForGroup(data.groupId) : data.from;
  if (!key) return;
  const map = whisperTypingUsers.get(key);
  if (map && map.has(data.from)) {
    clearTimeout(map.get(data.from).timeout);
    map.delete(data.from);
    updateWhisperTypingIndicator(key);
  }
});


socket.on('whisperGroupCreated', (group) => {
  const key = convoKeyForGroup(group.groupId);
  const convo = getOrCreateWhisperConvo(key, {
    isGroup: true,
    groupId: group.groupId,
    name: group.name,
    members: group.members
  });

  if (Array.isArray(group.messages)) {
    convo.messages = group.messages.map(m => ({ ...m, outgoing: m.from === user.id }));
  }

  updateWhispersLauncherBadge();
  if (whispersModalOpen) renderWhisperConvoList();
  showToast(`Added to group "${group.name}"`);
});


socket.on('whisperGroupUpdated', (data) => {
  const key = convoKeyForGroup(data.groupId);
  const convo = whisperConversations.get(key);
  if (!convo) return;

  convo.members = data.members;
  if (data.name) convo.name = data.name;

  if (data.addedUserIds) {
    showToast(`${data.addedBy} added ${data.addedUserIds.length} member(s) to "${convo.name}"`);
  } else if (data.leftUsername) {
    showToast(`${data.leftUsername} left "${convo.name}"`);
  }

  if (whispersModalOpen) {
    renderWhisperConvoList();
    if (activeWhisperKey === key) renderWhisperThread(key);
  }
});

socket.on('whisperGroupLeft', (data) => {
  const key = convoKeyForGroup(data.groupId);
  whisperConversations.delete(key);
  if (activeWhisperKey === key) activeWhisperKey = null;
  updateWhispersLauncherBadge();
  if (whispersModalOpen) {
    renderWhisperConvoList();
    renderWhisperThread(activeWhisperKey);
  }
});




socket.on('whisperMessage', (data) => {
  const isGroup = !!data.groupId;
  const key = isGroup ? convoKeyForGroup(data.groupId) : (data.from === user.id ? data.to : data.from);
  const isIncoming = data.from !== user.id;

  const convo = getOrCreateWhisperConvo(key, isGroup
    ? { isGroup: true, groupId: data.groupId }
    : {
        isGroup: false,
        userId: key,
        name: isIncoming ? data.fromUsername : undefined,
        avatar: isIncoming ? data.fromAvatar : undefined,
        usernameColor: isIncoming ? data.fromUsernameColor : undefined
      });

  const alreadyHave = convo.messages.some(m =>
    (data.id && m.id === data.id) ||
    (!data.id && m.text === data.text && m.time === data.time && m.from === data.from)
  );
  if (!alreadyHave) {
    convo.messages.push({ ...data, outgoing: data.from === user.id });
  }

  if (isIncoming) {
    const isViewingThisConvo = whispersModalOpen && activeWhisperKey === key;

    if (!isViewingThisConvo) {
      convo.unread = (convo.unread || 0) + 1;

      if (notifSettings?.browser && Notification.permission === 'granted') {
        sendNotification(
          isGroup ? `${data.fromUsername} in ${convo.name}` : `Whisper from ${data.fromUsername}`,
          data.text?.substring(0, 100) || 'New whisper',
          { icon: sanitizeAvatar(data.fromAvatar), tag: `whisper-${key}`, requireInteraction: false }
        );
      }

      if (notifSettings?.sound) {
        const audio = new Audio('/sounds/message-new-email.oga');
        audio.volume = 0.5;
        audio.play().catch(() => {});
      }

      showWhisperNotificationBanner(data, key, convo);
    }
     else {
      setLastReadTime(key, data.time); 
    }
  }

  updateWhispersLauncherBadge();
  renderWhisperConvoList();
  if (whispersModalOpen && activeWhisperKey === key) {
    renderWhisperThread(key);
  }
});

socket.on('whisperHistory', (data) => {
   console.log('[DEBUG] whisperHistory received,', data?.conversations?.length, 'convos, user =', typeof user, 'user.id =', user?.id, 'at', Date.now());
  if (!user || !user.id) {
    window.pendingWhisperHistory = data;
    return;
  }
  applyWhisperHistory(data);
});


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
        profileGradient: user.profileGradient || null
      }
    });
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
        profileGradient: user.profileGradient || null
      }
    });
  }

 showToast(`Name color changed to ${colorClass.replace('username-', '')}`);
 renderGradientButtons();
renderAnimatedGradientButtons();
}






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
        profileHeader: user.profileHeader,
        profileGradient: user.profileGradient || null
      }
    });
  }

 showToast("Custom status updated!");
};




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