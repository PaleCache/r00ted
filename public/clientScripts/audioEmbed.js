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