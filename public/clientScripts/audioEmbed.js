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


  const playIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>`;
  const pauseIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>`;
  playBtn.innerHTML = playIcon;
  const seekWrap = document.createElement("div");
  seekWrap.style.cssText = `
    flex:1; height:18px; display:flex; align-items:center;
    position:relative; cursor:pointer;
  `;

  const seekTrack = document.createElement("div");
  seekTrack.style.cssText = `
    width:100%; height:5px; background:#40444b;
    border-radius:3px; position:relative; overflow:visible;
    user-select:none; -webkit-user-select:none;
  `;

  const seekFill = document.createElement("div");
  seekFill.style.cssText = `
    height:100%; width:0%; background:#FF0000;
    border-radius:3px; pointer-events:none;
  `;


  const seekThumb = document.createElement("div");
  seekThumb.style.cssText = `
    width:14px; height:14px; border-radius:50%;
    background:#FF0000;
    position:absolute; top:50%; left:0%;
    transform:translate(-50%, -50%);
    cursor:grab; box-shadow:0 0 3px rgba(0,0,0,0.5);
    transition:transform 0.1s, box-shadow 0.1s;
    pointer-events:all;
    user-select:none; -webkit-user-select:none;
  `;
  seekThumb.setAttribute("tabindex", "0");
  seekThumb.setAttribute("role", "slider");
  seekThumb.setAttribute("draggable", "false");
  seekThumb.setAttribute("aria-label", "Seek");
  seekThumb.setAttribute("aria-valuemin", "0");
  seekThumb.setAttribute("aria-valuemax", "100");
  seekThumb.setAttribute("aria-valuenow", "0");

  seekTrack.appendChild(seekFill);
  seekTrack.appendChild(seekThumb);
  seekWrap.appendChild(seekTrack);

  const timeEl = document.createElement("span");
  timeEl.textContent = "0:00 / 0:00";
  timeEl.style.cssText = "color:#b9bbbe; font-size:11px; flex-shrink:0; min-width:72px; text-align:right;";

  controls.appendChild(playBtn);
  controls.appendChild(seekWrap);
  controls.appendChild(timeEl);

  const volumeRow = document.createElement("div");
  volumeRow.style.cssText = "display:flex; align-items:center; gap:8px;";

  const volBtn = document.createElement("button");
  volBtn.style.cssText = `
    background:none; border:none; color:#b9bbbe; cursor:pointer;
    padding:2px; flex-shrink:0; display:flex; align-items:center;
    transition: color 0.15s;
  `;


  const volIconLoud = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 10v4h4l5 5V5L7 10H3z"/><path d="M16.5 12c0-1.77-.77-3.29-2-4.3v8.6c1.23-1.01 2-2.53 2-4.3z"/><path d="M14.5 3.23v2.06c2.89 1.2 4.5 4.14 4.5 6.71 0 2.57-1.61 5.51-4.5 6.71v2.06c4.01-1.24 6.5-4.9 6.5-8.77s-2.49-7.53-6.5-8.77z"/></svg>`;
  const volIconMuted = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 10v4h4l5 5V5L7 10H3z"/><path d="M19 12l2.5-2.5-1.4-1.4L17.6 10.6 15.1 8.1l-1.4 1.4L16.2 12l-2.5 2.5 1.4 1.4 2.5-2.5 2.5 2.5 1.4-1.4L19 12z"/></svg>`;
  volBtn.innerHTML = volIconLoud;

  const volSlider = document.createElement("input");
  volSlider.type = "range";
  volSlider.min = "0";
  volSlider.max = "100";
  volSlider.value = "100";
  volSlider.style.cssText = `width:70px; height:4px; accent-color:#FF0000; cursor:pointer;`;

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
  let isDragging = false;

  function setProgress(pct) {
    pct = Math.max(0, Math.min(100, pct));
    seekFill.style.width = pct + "%";
    seekThumb.style.left = pct + "%";
    seekThumb.setAttribute("aria-valuenow", Math.round(pct));
  }

  function getPct(clientX) {
    const rect = seekTrack.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }

  function seekTo(pct) {
    setProgress(pct * 100);
    if (audioEl.duration) {
      audioEl.currentTime = pct * audioEl.duration;
      timeEl.textContent = `${formatAudioTime(audioEl.currentTime)} / ${formatAudioTime(audioEl.duration)}`;
    }
  }


  seekTrack.addEventListener("mousedown", (e) => {
    e.preventDefault();
    isDragging = true;

    seekThumb.style.cursor = "grabbing";
    seekTo(getPct(e.clientX));
  });

  seekThumb.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    seekThumb.style.cursor = "grabbing";
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    e.preventDefault();
    seekTo(getPct(e.clientX));
  });

  document.addEventListener("mouseup", () => {
    if (!isDragging) return;
    isDragging = false;
    seekThumb.style.cursor = "grab";
    seekThumb.style.boxShadow = "0 0 3px rgba(0,0,0,0.5)";
  });


  seekTrack.addEventListener("touchstart", (e) => {
    isDragging = true;
    seekTo(getPct(e.touches[0].clientX));
  }, { passive: true });

  document.addEventListener("touchmove", (e) => {
    if (!isDragging) return;
    seekTo(getPct(e.touches[0].clientX));
  }, { passive: true });

  document.addEventListener("touchend", () => { isDragging = false; });
  seekThumb.addEventListener("keydown", (e) => {
    if (!audioEl.duration) return;
    if (e.key === "ArrowRight") audioEl.currentTime = Math.min(audioEl.duration, audioEl.currentTime + 5);
    else if (e.key === "ArrowLeft") audioEl.currentTime = Math.max(0, audioEl.currentTime - 5);
  });


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
  audioEl.addEventListener("ended", () => { playBtn.innerHTML = playIcon; setProgress(0); });

  audioEl.addEventListener("loadedmetadata", () => {
    timeEl.textContent = `0:00 / ${formatAudioTime(audioEl.duration)}`;
  });

  audioEl.addEventListener("timeupdate", () => {
    if (!audioEl.duration || isDragging) return;
    const pct = (audioEl.currentTime / audioEl.duration) * 100;
    setProgress(pct);
    timeEl.textContent = `${formatAudioTime(audioEl.currentTime)} / ${formatAudioTime(audioEl.duration)}`;
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