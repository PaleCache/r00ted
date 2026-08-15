const userJoinAudio = new Audio('/sounds/power-plug.oga');
const userLeaveAudio = new Audio('/sounds/power-unplug.oga');
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

  function rowSig(id, avatar, username, colorClass, level, badge, isAdmin, isDeveloper, isPromptEngineer, prestigeBadge, customRoleIds) {
    return [id, avatar, username, colorClass, level, badge, isAdmin, isDeveloper, isPromptEngineer, prestigeBadge, (customRoleIds||[]).join(",")].join("|");
  }

  const existingRows = new Map();
  container.querySelectorAll('[data-vp-row-id]').forEach(el => existingRows.set(el.dataset.vpRowId, el));

  const fragment = document.createDocumentFragment();
  const usedIds = new Set();
  {
    const id = "local";
    const sig = rowSig(id, user.avatar, user.username, user.usernameColor || "username-cyan", user.level || 1, user.badge || null, user.isAdmin || false, user.isDeveloper || false, user.isPromptEngineer || false, user.prestigeBadge || null, user.customRoleIds || []);
    const existing = existingRows.get(id);
    usedIds.add(id);
    if (existing && existing.dataset.vpRowSig === sig) {
      fragment.appendChild(existing);
    } else {
      const row = buildParticipantRow("local", user.avatar, user.username, user.usernameColor || "username-cyan", user.level || 1, user.badge || null, user.isAdmin || false, user.isDeveloper || false, user.isPromptEngineer || false, user.prestigeBadge || null, user.customRoleIds || []);
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

    const sig = rowSig(id, avatar, username, colorClass, level, badge, isAdmin, isDeveloper, isPromptEngineer, prestigeBadge, remoteCustomRoleIds);
    const existing = existingRows.get(id);
    usedIds.add(id);

    if (existing && existing.dataset.vpRowSig === sig) {
      fragment.appendChild(existing);
    } else {
      const remoteRow = buildParticipantRow(id, avatar, username, colorClass, level, badge, isAdmin, isDeveloper, isPromptEngineer, prestigeBadge, remoteCustomRoleIds);
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