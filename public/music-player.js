
let cachedPlaylists = {};
(function () {
  "use strict";
  const css = `
  #mpBtn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: #1e1f22;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 9px 0;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.15s, transform 0.1s;
    width: 100%;
  }
  #mpBtn:hover {
    background: #FF0000;
    transform: translateY(-1px);
  }

  #mpModal {
    display: none; position: fixed; inset: 0; z-index: 20050;
    align-items: center; justify-content: center;
  }
  #mpModal.show { display: flex; }

  #mpWindow {
    position: relative; width: 860px; max-width: 94vw; height: 568px; max-height: 90vh;
    background: rgba(0, 0, 0, 0.875); border-radius: 16px; overflow: hidden;
    display: flex; flex-direction: column;
    font-family: inherit;
    -webkit-user-drag: none;
    box-shadow: rgb(103, 103, 103) 0px 0px 3px;
  }

  #mpBgArt {
    position: absolute; inset: -20px; background-size: cover; background-position: center;
    transform: scale(1.15);
    transition: background-image 0.5s ease; z-index: 0;
  }
  #mpBgOverlay {
    position: absolute; inset: 0; background: linear-gradient(195deg, rgb(0 0 0 / 51%), rgba(0, 0, 0, 0.92) 60%, #000000 100%);
    z-index: 1;
  }

  #mpHeader {
    position: relative; z-index: 2; display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px; flex-shrink: 0;
  }
  #mpHeader h3 { margin: 0; color: #fff; font-size: 15px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
  #mpHeader h3 svg { flex-shrink: 0; }
  #mpCloseBtn {
    background: rgba(255,255,255,0.08); border: none; color: #b9bbbe; font-size: 16px; cursor: pointer;
    width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    transition: 0.15s;
  }
  #mpCloseBtn:hover { background: #FF0000; color: #fff; }

  #mpBody {
    position: relative; z-index: 2; flex: 1; display: flex; overflow: hidden; min-height: 0;
  }

  #mpMain {
    flex: 1.15; display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 10px 30px 20px; min-width: 0;
  }

  #mpArtWrap {
    width: 491px; height: 230px; border-radius: 14px; overflow: hidden; flex-shrink: 0;
    box-shadow: 0 20px 50px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06);
    background: linear-gradient(135deg,#2b2d31,#1a1b1e);
    display: flex; align-items: center; justify-content: center; position: relative;
    transition: transform 0.25s ease;
  }
  #mpArtImg { width: 100%; height: 100%; object-fit: cover; display: block; }
#mpArtFallback {
  width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
  color: rgba(255,255,255,0.85);
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(circle at 30% 20%, rgba(255,255,255,0.10), transparent 55%),
    radial-gradient(circle at 75% 85%, rgba(255,0,0,0.20), transparent 55%);
}
#mpArtFallback svg {
  filter: drop-shadow(0 6px 14px rgba(0,0,0,0.45));
}

  #mpTitle { color: #fff; font-size: 17px; font-weight: 700; margin-top: 20px; text-align: center; max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #mpArtist { color: #9a9ca3; font-size: 13px; margin-top: 4px; text-align: center; max-width: 380px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  #mpProgressRow { width: 100%; max-width: 420px; margin-top: 22px; display: flex; align-items: center; gap: 10px; }
  #mpTimeCur, #mpTimeDur { font-size: 11px; color: #7a7d85; width: 38px; flex-shrink: 0; text-align: center; font-variant-numeric: tabular-nums; }
  #mpSeek {
    flex: 1; -webkit-appearance: none; appearance: none; height: 5px; border-radius: 3px;
    background: linear-gradient(to right, #FF0000 0%, #FF0000 0%, #3a3c42 0%, #3a3c42 100%);
    outline: none; cursor: pointer;
  }
  #mpSeek::-webkit-slider-thumb {
    -webkit-appearance: none; width: 13px; height: 13px; border-radius: 50%; background: #fff;
    box-shadow: 0 0 6px rgba(0,0,0,0.5); cursor: pointer; margin-top: -0.5px;
  }

  #mpControls { display: flex; align-items: center; gap: 18px; margin-top: 20px; }
  .mp-ctrl-btn {
    background: none; border: none; color: #d8d9db; cursor: pointer; display: flex;
    align-items: center; justify-content: center; transition: 0.15s; padding: 6px; border-radius: 50%;
  }
  .mp-ctrl-btn:hover { color: #fff; background: rgba(255,255,255,0.08); }
  .mp-ctrl-btn.active { color: #FF0000; }
  #mpPlayBtn {
    width: 52px; height: 52px; border-radius: 50%; background: #FF0000; color: #fff;
    display: flex; align-items: center; justify-content: center; cursor: pointer; border: none;
    transition: 0.15s;
  }
  #mpPlayBtn:hover { background: #d40000; transform: scale(1.04); }

  #mpVolRow { display: flex; align-items: center; gap: 8px; margin-top: 22px; width: 160px; }
  #mpVolRow svg { flex-shrink: 0; color: #9a9ca3; }
  #mpVol {
    flex: 1; -webkit-appearance: none; appearance: none; height: 4px; border-radius: 2px;
    background: #3a3c42; outline: none; cursor: pointer;
  }
  #mpVol::-webkit-slider-thumb { -webkit-appearance: none; width: 11px; height: 11px; border-radius: 50%; background: #d8d9db; cursor: pointer; }

#mpSide {
  width: 300px; flex-shrink: 0; border-left: 1px solid rgba(255,255,255,0.06);
  background: rgba(0, 0, 0, 0.5); display: flex; flex-direction: column; min-height: 0;
  padding-top: 14px;
  border-radius: 9px;
}
 #mpSideHeader {
    padding: 14px 16px 10px;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    flex-shrink: 0;
  }
  #mpSideHeader > span {
    color: #b9bbbe; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px;
  }
  #mpSideHeader > div {
    display: flex; gap: 6px; flex-wrap: wrap;
  }
#mpAddBtn, #mpAddFolderBtn, #mpAddRadioBtn, #mpClearQueueBtn {
    background: #FF0000; border: 1px solid rgba(255,0,0,0.4); color: #ffffff;
    font-size: 10px; font-weight: 600; padding: 5px 7px; border-radius: 6px; cursor: pointer; transition: 0.15s;
    white-space: nowrap;
  }
  #mpAddBtn:hover, #mpAddFolderBtn:hover, #mpAddRadioBtn:hover { background: #FF0000; color: #fff; }
  #mpPlaylist { flex: 1; overflow-y: auto; padding: 4px 8px 12px; }
  #mpPlaylist::-webkit-scrollbar { width: 7px; }
  #mpPlaylist::-webkit-scrollbar-thumb { background: #34363b; border-radius: 8px; }

  .mp-track {
    display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 8px; cursor: pointer;
    transition: background 0.12s; margin-bottom: 2px;
  }
  .mp-track:hover { background: rgba(255,255,255,0.05); }
  .mp-track.active { background: rgba(255,0,0,0.14); }
  .mp-track-thumb { width: 36px; height: 36px; border-radius: 6px; object-fit: cover; flex-shrink: 0; background: #2b2d31; }
  .mp-track-info { flex: 1; min-width: 0; }
  .mp-track-title { color: #e6e6e7; font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mp-track.active .mp-track-title { color: white; }
  .mp-track-artist { color: #7a7d85; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mp-track-remove { background: none; border: none; color: #55575d; cursor: pointer; font-size: 12px; padding: 4px; flex-shrink: 0; transition: 0.15s; }
  .mp-track-remove:hover { color: #ff3333; }
  .mp-track-eq { width: 14px; height: 14px; flex-shrink: 0; }

  #mpEmptyState {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    color: #55575d; font-size: 12.5px; text-align: center; padding: 20px; gap: 10px;
  }
  #mpEmptyState button {
    background: #FF0000; border: none; color: white; padding: 8px 16px; border-radius: 8px;
    font-size: 12px; font-weight: 600; cursor: pointer; margin-top: 4px;
  }

 
  #mpTabs {
    display: flex; gap: 4px; padding: 0 12px 10px; flex-shrink: 0;
  }
  .mp-tab {
    flex: 1; background: none; border: none; color: #7a7d85; font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.3px; padding: 7px 4px; border-radius: 6px; cursor: pointer;
    transition: 0.15s;
  }
  .mp-tab:hover { color: #d8d9db; background: rgba(255,255,255,0.05); }
  .mp-tab.active { color: #fff; background: rgba(255, 0, 0, 0.57); }

  .mp-panel { display: none; flex: 1; min-height: 0; flex-direction: column; }
  .mp-panel.active { display: flex; }

  #mpLibBreadcrumb {
    padding: 0 12px 8px; color: #7a7d85; font-size: 11.5px; display: flex; flex-wrap: wrap;
    align-items: center; gap: 3px; flex-shrink: 0;
  }
  #mpLibBreadcrumb span.crumb { cursor: pointer; transition: 0.15s; }
  #mpLibBreadcrumb span.crumb:hover { color: white; }
  #mpLibBreadcrumb span.sep { color: #454850; }

  .mp-search-row { padding: 10px 12px 8px; flex-shrink: 0; position: relative; }
  .mp-search-input {
    width: 100%; box-sizing: border-box; background: #26282c; border: 1px solid #34363b; border-radius: 8px;
    color: #fff; font-size: 12.5px; padding: 8px 30px 8px 10px; outline: none; transition: border-color 0.15s;
  }
  .mp-search-input:focus { border-color: #FF0000; }
  .mp-search-clear {
    position: absolute; right: 18px; top: 50%; transform: translateY(-50%);
    background: none; border: none; color: #55575d; cursor: pointer; font-size: 13px; padding: 4px; display: none;
  }
  .mp-search-clear:hover { color: white; }
  .mp-search-clear.show { display: block; }
  .mp-lib-result-dir { color: #7a7d85; font-size: 10.5px; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  #mpLibList { flex: 1; overflow-y: auto; padding: 0 8px 12px; }
  #mpLibList::-webkit-scrollbar { width: 7px; }
  #mpLibList::-webkit-scrollbar-thumb { background: #34363b; border-radius: 8px; }

  .mp-lib-folder, .mp-lib-track {
    display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 8px; cursor: pointer;
    transition: background 0.12s; margin-bottom: 2px;
  }
  .mp-lib-folder:hover, .mp-lib-track:hover { background: rgba(255,255,255,0.05); }
  .mp-lib-folder svg, .mp-lib-track-icon { flex-shrink: 0; color: #9a9ca3; }
  .mp-lib-name { flex: 1; min-width: 0; font-size: 12.5px; color: #e6e6e7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mp-lib-track .mp-lib-name-wrap { flex: 1; min-width: 0; }
  .mp-lib-track .mp-lib-artist { color: #7a7d85; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mp-lib-thumb { width: 32px; height: 32px; border-radius: 6px; object-fit: cover; flex-shrink: 0; background: #2b2d31; }
  .mp-lib-add {
    background: #FF0000; border: 1px solid rgba(255,0,0,0.4); color: white;
    font-size: 10.5px; font-weight: 600; padding: 4px 8px; border-radius: 6px; cursor: pointer; flex-shrink: 0;
    transition: 0.15s;
  }
  .mp-lib-add:hover { background: #FF0000; color: #fff; }
  #mpLibStatus { padding: 20px 16px; text-align: center; color: #55575d; font-size: 12.5px; }
  #mpLibAddAllBtn {
    margin: 0 12px 10px; background: #FF0000; border: 1px solid rgba(255,0,0,0.4); color: white;
    font-size: 11px; font-weight: 600; padding: 7px 10px; border-radius: 6px; cursor: pointer; transition: 0.15s;
    flex-shrink: 0;
  }
  #mpLibAddAllBtn:hover { background: #FF0000; color: #fff; }

  #mpPlaylistsList { flex: 1; overflow-y: auto; padding: 0 8px 12px; }
  #mpPlaylistsList::-webkit-scrollbar { width: 7px; }
  #mpPlaylistsList::-webkit-scrollbar-thumb { background: #34363b; border-radius: 8px; }
  .mp-saved-pl {
    display: flex; align-items: center; gap: 10px; padding: 9px 8px; border-radius: 8px; cursor: pointer;
    transition: background 0.12s; margin-bottom: 2px;
  }
  .mp-saved-pl:hover { background: rgba(255,255,255,0.05); }
  .mp-saved-pl-info { flex: 1; min-width: 0; }
  .mp-saved-pl-name { color: #e6e6e7; font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mp-saved-pl-meta { color: #7a7d85; font-size: 11px; }
  .mp-saved-pl-del { background: none; border: none; color: #55575d; cursor: pointer; font-size: 12px; padding: 4px; flex-shrink: 0; }
  .mp-saved-pl-del:hover { color: white; }
  #mpSavePlaylistRow { padding: 10px 12px; flex-shrink: 0; display: flex; gap: 6px; }
  #mpNewPlaylistName {
    flex: 1; background: #26282c; border: 1px solid #34363b; border-radius: 6px; color: #fff;
    font-size: 12px; padding: 7px 9px; outline: none;
  }
  #mpNewPlaylistName:focus { border-color: #FF0000; }
#mpSavePlaylistBtn {
    background: #FF0000; border: 1px solid rgba(255,0,0,0.4); color: white;
    font-size: 11px; font-weight: 600; padding: 0 12px; border-radius: 6px; cursor: pointer; transition: 0.15s;
    white-space: nowrap;
  }
  #mpSavePlaylistBtn:hover { background: #FF0000; color: #fff; }
  #mpPlaylistHint { padding: 0 12px 8px; color: #55575d; font-size: 10.5px; flex-shrink: 0; }

   #mpMini {
    display: none;
    position: fixed;
    top: 20px;
    left: 20px;
    z-index: 20040;
    background: #111214;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 5px;
    box-shadow: 0 16px 40px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04);
    width: 300px;
    height: 112px;
    user-select: none;
    overflow: hidden;
  }
  #mpMini.show { display: block; }

  #mpMiniBgArt {
    position: absolute; inset: -20px; background-size: cover; background-position: center;
    transform: scale(1.15); transition: background-image 0.5s ease; z-index: 0;
  }
  #mpMiniBgOverlay {
    position: absolute; inset: 0; z-index: 1;
    background: linear-gradient(181deg, rgb(0 0 0 / 55%), rgb(0 0 0 / 80%) 55%, #000000 100%);
  }

  #mpMiniDrag {
    cursor: grab;
    height: 86%;
    position: relative;
    z-index: 2;
  }
  #mpMiniDrag:active { cursor: grabbing; }

  #mpMiniTitle, #mpMiniArtist {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
#mpMiniArt, #mpMiniArtFallback {
  width: 56px; height: 56px; border-radius: 10px; flex-shrink: 0;
  object-fit: cover; background: linear-gradient(135deg,#2b2d31,#1a1b1e);
  display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.85);
  box-shadow: 0 6px 16px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06);
  position: relative; overflow: hidden;
}
#mpMiniArtFallback::before {
  content: "";
  position: absolute; inset: 0;
  background:
    radial-gradient(circle at 30% 20%, rgba(255,255,255,0.10), transparent 55%),
    radial-gradient(circle at 75% 85%, rgba(255,0,0,0.20), transparent 55%);
}
#mpMiniArtFallback svg { position: relative; z-index: 1; }
  #mpMiniText { flex: 1; min-width: 0; }
  #mpMiniTitle { font-size: 13.5px; }
  #mpMiniArtist { font-size: 11px; margin-top: 2px; }

  #mpMiniVolRow { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; }
  #mpMiniVolRow svg { flex-shrink: 0; color: #9a9ca3; }
  #mpMiniVol {
    flex: 1; -webkit-appearance: none; appearance: none; height: 4px; border-radius: 2px;
    background: #3a3c42; outline: none; cursor: pointer;
  }
  #mpMiniVol::-webkit-slider-thumb {
    -webkit-appearance: none; width: 10px; height: 10px; border-radius: 50%;
    background: #d8d9db; cursor: pointer;
  }

  .mp-mini-ctrl {
    background: none; border: none; color: #d8d9db; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    padding: 5px; border-radius: 50%; flex-shrink: 0; transition: 0.15s;
  }
  .mp-mini-ctrl:hover { color: #fff; background: rgba(255,255,255,0.08); }
  #mpMiniToggleBtn {
    background: rgba(255,255,255,0.08); border: none; color: #b9bbbe; font-size: 14px; cursor: pointer;
    width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    transition: 0.15s; margin-right: 6px;
  }
  #mpMiniToggleBtn:hover { background: rgba(255,255,255,0.15); color: #fff; }

  #mpWindow, #mpMini, #mpWindow *, #mpMini * {
    -webkit-user-drag: none !important;
    user-drag: none !important;
    user-select: none !important;
    -webkit-user-select: none !important;
  }

  .mp-sort-select {
  width: 100%;
  box-sizing: border-box;
  background: #26282c;
  border: 1px solid #34363b;
  border-radius: 8px;
  color: #d8d9db;
  font-size: 11.5px;
  padding: 6px 8px;
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s;
}

#mpArtVideo { width: 100%; height: 100%; object-fit: cover; display: block; }
.mp-sort-select:focus { border-color: #FF0000; }
#mpBroadcastLabel {
    display: flex; align-items: center; gap: 8px;
    font-size: 11px; color: #b9bbbe; cursor: pointer;
    padding: 6px 10px; border-radius: 20px;
    background: rgba(255,255,255,0.05);
    transition: background 0.15s;
    user-select: none;
  }
  #mpBroadcastLabel:hover { background: rgba(255,255,255,0.08); }
  #mpBroadcastLabel.active { color: #fff; }

  #mpBroadcastToggle { display: none; }

  .mp-toggle-track {
    position: relative;
    width: 32px; height: 18px;
    background: #3a3c42;
    border-radius: 10px;
    flex-shrink: 0;
    transition: background 0.2s;
  }
  .mp-toggle-thumb {
    position: absolute;
    top: 2px; left: 2px;
    width: 14px; height: 14px;
    border-radius: 50%;
    background: #d8d9db;
    box-shadow: 0 1px 3px rgba(0,0,0,0.4);
    transition: transform 0.2s, background 0.2s;
  }
  #mpBroadcastLabel.active .mp-toggle-track { background: #FF0000; }
  #mpBroadcastLabel.active .mp-toggle-thumb {
    transform: translateX(14px);
    background: #fff;
}

#mpEqBass, #mpEqMid, #mpEqTreble {
  accent-color: #FF0000 !important;
}

#mpMiniProgress {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  height: 3px;
  background: rgba(255,255,255,0.08);
  z-index: 5;
}
#mpMiniProgressBar {
  height: 100%;
  width: 0%;
  background: #FF0000;
  box-shadow: 0 0 6px rgba(255,0,0,0.6);
  transition: width 0.1s linear;
}
#mpProgressRow {
  position: relative;
}




#mpMiniProgressEmote {
  position: absolute;
  width: 14px;
  height: 14px;
  border-radius: 3px;
  object-fit: contain;
  pointer-events: none;
  bottom: 2px;
  left: 0%;
  transform: translateX(-50%);
  z-index: 6;
  transition: left 0.1s linear;
}

#mpSeekWrap {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
}

#mpProgressEmote {
  position: absolute;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  object-fit: contain;
  pointer-events: none;
  left: 0%;
  transform: translate(-50%, -50%);
  z-index: 3;
  transition: left 0.1s linear;
}

#mpSeek::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 0;
  height: 0;
  background: transparent;
  box-shadow: none;
}
#mpSeek::-moz-range-thumb {
  width: 0;
  height: 0;
  background: transparent;
  border: none;
}


  `;
  const styleTag = document.createElement("style");
  styleTag.id = "mpStyles";
  styleTag.textContent = css;
  document.head.appendChild(styleTag);
const btn = document.createElement("button");
btn.id = "mpBtn";
btn.className = "sidebar-icon-btn";
btn.innerHTML = `
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M9 18V5l12-2v13"/>
    <circle cx="6" cy="18" r="3"/>
    <circle cx="18" cy="16" r="3"/>
  </svg>
`;
btn.title = "Music Player";

  const modal = document.createElement("div");
  modal.id = "mpModal";
  modal.innerHTML = `
    <div id="mpWindow">
      <div id="mpBgArt"></div>
      <div id="mpBgOverlay"></div>

    <div id="mpHeader">
        <h3>
          <img src="/icon.png" width="78" height="78" alt="" style="display:block;">
        </h3>
          <div style="display:flex; align-items:center;">
          <button id="mpMiniToggleBtn" title="Mini player">▁</button>
          <button id="mpCloseBtn">✕</button>
        </div>
      </div>

      <div id="mpBody">
        <div id="mpMain">
        <div id="mpArtWrap">
        <video id="mpArtVideo" style="display:none;" muted loop playsinline></video>
        <img id="mpArtImg" style="display:none;">
<div id="mpArtFallback">
  <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
    <defs>
      <linearGradient id="mpNoteGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="100%" stop-color="#c9c9c9"/>
      </linearGradient>
    </defs>
    <path d="M9 18V5l12-2v13" stroke="url(#mpNoteGrad)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="6" cy="18" r="3.2" fill="url(#mpNoteGrad)"/>
    <circle cx="18" cy="16" r="3.2" fill="url(#mpNoteGrad)"/>
  </svg>
</div>
          </div>

          <div id="mpTitle">No track loaded</div>
          <div id="mpArtist">Add some music to get started</div>

            <div id="mpProgressRow">
            <span id="mpTimeCur">0:00</span>
            <div id="mpSeekWrap">
              <input type="range" id="mpSeek" min="0" max="100" value="0" step="0.1">
              <img id="mpProgressEmote" src="/avatars/pepedance.webp" alt="" title="Kick">
            </div>
            <span id="mpTimeDur">0:00</span>
          </div>

            <div id="mpControls">
            <button class="mp-ctrl-btn" id="mpShuffleBtn" title="Shuffle">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>
            </button>
            <button class="mp-ctrl-btn" id="mpPrevBtn" title="Previous">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
            </button>
            <button id="mpPlayBtn" title="Play/Pause">
                <svg id="mpPlayIcon" width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                <svg id="mpPauseIcon" width="22" height="22" viewBox="0 0 24 24" fill="white" style="display:none;"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>
            </button>
            <button class="mp-ctrl-btn" id="mpNextBtn" title="Next">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16 18h2V6h-2zM6 18l8.5-6L6 6z"/></svg>
            </button>
            <button class="mp-ctrl-btn" id="mpRepeatBtn" title="Repeat">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 2l4 4-4 4M3 11V9a4 4 0 014-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 01-4 4H3"/></svg>
            </button>
            <button class="mp-ctrl-btn" id="mpVideoArtBtn" title="Toggle video artwork">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="5" width="14" height="14" rx="2"/><path d="M16 9l6-4v14l-6-4"/>
                </svg>
            </button>
            <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:#b9bbbe;cursor:pointer;">
          <label id="mpBroadcastLabel">
            <input type="checkbox" id="mpBroadcastToggle">
            <span class="mp-toggle-track"><span class="mp-toggle-thumb"></span></span>
            <span>Listen Togeather</span>
          </label>
            </div>

            <div id="mpVolRow">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
            <input type="range" id="mpVol" min="0" max="100" value="80">
          </div>
          <div id="mpEqRow" style="width:100%; max-width:420px; margin-top:16px; display:flex; align-items:center; gap:12px;">
            <span style="font-size:10px; color:#7a7d85; width:34px;">Bass</span>
            <input type="range" id="mpEqBass" min="-24" max="24" value="0" step="1" style="flex:1; accent-color:#FF0000;">
            <span style="font-size:10px; color:#7a7d85; width:34px; text-align:right;">Mid</span>
            <input type="range" id="mpEqMid" min="-12" max="12" value="0" step="1" style="flex:1; accent-color:#FF0000;">
            <span style="font-size:10px; color:#7a7d85; width:34px; text-align:right;">Treble</span>
            <input type="range" id="mpEqTreble" min="-12" max="12" value="0" step="1" style="flex:1; accent-color:#FF0000;">
            <button id="mpEqReset" title="Reset EQ" style="background:none; border:none; color:#7a7d85; cursor:pointer; font-size:14px; padding:0 4px;">↺</button>
          </div>
        </div>

        <div id="mpSide">
          <div id="mpTabs">
            <button class="mp-tab active" data-tab="queue">Queue</button>
            <button class="mp-tab" data-tab="library">Library</button>
            <button class="mp-tab" data-tab="playlists">Playlists</button>
          </div>

         <div class="mp-panel active" id="mpPanelQueue">
<div id="mpSideHeader">
    <span id="mpQueueLabel">Queue (0)</span>
    <div style="display:flex; gap:6px;">
    <button id="mpAddBtn">+ Files</button>
    <button id="mpAddFolderBtn">+ Folder</button>
    <button id="mpAddRadioBtn">+ Radio</button>
    <button id="mpClearQueueBtn" title="Clear queue">Clear</button>
    </div>
</div>
        <div style="padding: 0 16px 8px;">
            <select id="mpQueueSort" class="mp-sort-select">
            <option value="added-desc">Date Added (Newest)</option>
            <option value="added-asc">Date Added (Oldest)</option>
            <option value="title-asc">Title (A–Z)</option>
            <option value="title-desc">Title (Z–A)</option>
            </select>
        </div>
        <div id="mpPlaylist"></div>
        </div>

        <div class="mp-panel" id="mpPanelLibrary">
        <div class="mp-search-row">
            <input type="text" id="mpLibSearchInput" class="mp-search-input" placeholder="Search server library…">
            <button id="mpLibSearchClear" class="mp-search-clear" title="Clear search">✕</button>
        </div>
        <div style="padding: 0 12px 8px;">
            <select id="mpLibSort" class="mp-sort-select">
            <option value="name-asc">Name (A–Z)</option>
            <option value="name-desc">Name (Z–A)</option>
            <option value="date-desc">Date Modified (Newest)</option>
            <option value="date-asc">Date Modified (Oldest)</option>
            </select>
        </div>
        <div id="mpLibBreadcrumb"></div>
        <div id="mpLibList"></div>
        </div>

          <div class="mp-panel" id="mpPanelPlaylists">
            <div class="mp-search-row">
              <input type="text" id="mpPlaylistSearchInput" class="mp-search-input" placeholder="Search saved playlists…">
              <button id="mpPlaylistSearchClear" class="mp-search-clear" title="Clear search">✕</button>
            </div>
            <div id="mpSavePlaylistRow">
              <input type="text" id="mpNewPlaylistName" placeholder="Playlist name…" maxlength="60">
              <button id="mpSavePlaylistBtn">Save Queue</button>
            </div>
            <div id="mpPlaylistHint">Server library tracks and radio stations are saved. Local files can't be restored after reload.</div>
            <div id="mpPlaylistsList"></div>
          </div>
        </div>
</div>
      <input type="file" id="mpFileInput" multiple accept="audio/*,image/*,video/mp4" style="display:none;">
      <input type="file" id="mpFolderInput" multiple webkitdirectory directory mozdirectory style="display:none;">
    </div>
  `;

  const miniPlayer = document.createElement("div");
  miniPlayer.id = "mpMini";
  miniPlayer.innerHTML = `
  <div id="mpMiniBgArt"></div>
  <div id="mpMiniBgOverlay"></div>
  <div id="mpMiniDrag" style="display: flex; flex-direction: column; height: 86%; padding: 10px; gap: 8px;">
    <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-height: 0;">
      <img id="mpMiniArt" style="display:none;">
      <div id="mpMiniArtFallback">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M9 18V5l12-2v13" stroke="#e6e6e7" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="6" cy="18" r="3" fill="#e6e6e7"/>
          <circle cx="18" cy="16" r="3" fill="#e6e6e7"/>
        </svg>
      </div>
      <div id="mpMiniText">
        <div id="mpMiniTitle">No track loaded</div>
        <div id="mpMiniArtist">-</div>
      </div>
    </div>
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.06);">
      <div id="mpMiniVolRow">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
        <input type="range" id="mpMiniVol" min="0" max="100" value="80">
      </div>
      <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
        <button class="mp-mini-ctrl" id="mpMiniPrevBtn" title="Previous">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
        </button>
        <button class="mp-mini-ctrl" id="mpMiniPlayBtn" title="Play/Pause">
          <svg id="mpMiniPlayIcon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          <svg id="mpMiniPauseIcon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="display:none;"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>
        </button>
        <button class="mp-mini-ctrl" id="mpMiniNextBtn" title="Next">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16 18h2V6h-2zM6 18l8.5-6L6 6z"/></svg>
        </button>
        <button class="mp-mini-ctrl" id="mpMiniExpandBtn" title="Expand player">▢</button>
      </div>
    </div>
  </div>
<div id="mpMiniProgress">
  <div id="mpMiniProgressBar"></div>
  <img id="mpMiniProgressEmote" src="/avatars/pepedance.webp" alt="" title="Kick">
</div>

  `;


(function patchSetLocalDescriptionForBot() {
  const origSLD = RTCPeerConnection.prototype.setLocalDescription;
RTCPeerConnection.prototype.setLocalDescription = function(desc) {
  if (this.__isBotPC && desc && desc.sdp) {
    const opusMatch = desc.sdp.match(/a=rtpmap:(\d+) opus\/48000/);
    if (opusMatch) {
      const pt = opusMatch[1];
      const fmtpRegex = new RegExp(`(a=fmtp:${pt} )([^\r\n]*)`, 'g');
      desc.sdp = desc.sdp.replace(fmtpRegex, (match, prefix, params) => {
        let cleaned = params
          .split(';')
          .filter(p => !p.startsWith('maxaveragebitrate') && !p.startsWith('stereo') && !p.startsWith('sprop-stereo'))
          .join(';');
        return `${prefix}${cleaned};maxaveragebitrate=256000;stereo=1;sprop-stereo=1`;
      });
    }
  }
  return origSLD.call(this, desc);
};
})();

function mountUI() {
  const actionsContainer = document.querySelector(".sidebar-actions");
  if (actionsContainer) {
    actionsContainer.appendChild(btn);
  } else {
    document.body.appendChild(btn);
  }
  document.body.appendChild(modal);
  document.body.appendChild(miniPlayer);
}


  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountUI);
  } else {
    mountUI();
  }

  const audio = new Audio();
  audio.preload = "metadata";
  let queue = [];      
  let currentIndex = -1;
  let shuffleOn = false;
  let repeatMode = 0;
  let shuffleHistory = [];
  let libPath = "";   
  let queueSort = "added-desc";
let librarySort = "name-asc";
  let preShuffleOrder = null;        


  function authToken() {
    try { return localStorage.getItem("chatToken") || ""; } catch (e) { return ""; }
  }

  const el = (id) => document.getElementById(id);

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }


  let videoArtEnabled = (() => {
  try { return localStorage.getItem("mpVideoArtEnabled") !== "false"; }
  catch (e) { return true; }
})();

function setVideoArtEnabled(enabled) {
  videoArtEnabled = enabled;
  el("mpVideoArtBtn").classList.toggle("active", enabled);
  try { localStorage.setItem("mpVideoArtEnabled", String(enabled)); } catch (e) {}
  updateNowPlayingUI();
  syncBotVideoTrack();
}

 function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

  function readSlice(file, start, end) {
    return file.slice(start, end).arrayBuffer();
  }

 
  async function extractID3Art(file) {
    try {
      const headBuf = await readSlice(file, 0, 10);
      const head = new Uint8Array(headBuf);
      if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return null; 
      const ver = head[3];
      const size =
        ((head[6] & 0x7f) << 21) | ((head[7] & 0x7f) << 14) |
        ((head[8] & 0x7f) << 7) | (head[9] & 0x7f);
      const tagBuf = await readSlice(file, 10, 10 + size);
      const data = new Uint8Array(tagBuf);
      let offset = 0;
      const frameHeaderSize = ver >= 3 ? 10 : 6;

      while (offset < data.length - frameHeaderSize) {
        let frameId, frameSize;
        if (ver >= 3) {
          frameId = String.fromCharCode(data[offset], data[offset+1], data[offset+2], data[offset+3]);
          frameSize = ver === 4
            ? ((data[offset+4]&0x7f)<<21)|((data[offset+5]&0x7f)<<14)|((data[offset+6]&0x7f)<<7)|(data[offset+7]&0x7f)
            : (data[offset+4]<<24)|(data[offset+5]<<16)|(data[offset+6]<<8)|data[offset+7];
          offset += 10;
        } else {
          frameId = String.fromCharCode(data[offset], data[offset+1], data[offset+2]);
          frameSize = (data[offset+3]<<16)|(data[offset+4]<<8)|data[offset+5];
          offset += 6;
        }
        if (frameSize <= 0 || offset + frameSize > data.length) break;

        if (frameId === "APIC" || frameId === "PIC") {
          const frameData = data.slice(offset, offset + frameSize);
          let p = 1; 
          let mime = "image/jpeg";
          if (frameId === "APIC") {
            let mimeEnd = p;
            while (frameData[mimeEnd] !== 0 && mimeEnd < frameData.length) mimeEnd++;
            mime = new TextDecoder().decode(frameData.slice(p, mimeEnd)) || "image/jpeg";
            p = mimeEnd + 1;
          } else {
            const fmt = String.fromCharCode(frameData[p], frameData[p+1], frameData[p+2]);
            mime = fmt.toUpperCase() === "PNG" ? "image/png" : "image/jpeg";
            p += 3;
          }
          p += 1;
          while (frameData[p] !== 0 && p < frameData.length) p++; 
          p += 1;
          const imgBytes = frameData.slice(p);
          const blob = new Blob([imgBytes], { type: mime });
          return URL.createObjectURL(blob);
        }
        offset += frameSize;
      }
      return null;
    } catch (e) {
      return null;
    }
  }


  async function extractFlacArt(file) {
    try {
      const CHUNK = 2 * 1024 * 1024; 
      const buf = await readSlice(file, 0, Math.min(file.size, CHUNK));
      const data = new Uint8Array(buf);
      if (!(data[0]===0x66 && data[1]===0x4C && data[2]===0x61 && data[3]===0x43)) return null; 
      let offset = 4;
      while (offset < data.length) {
        const blockHeader = data[offset];
        const isLast = (blockHeader & 0x80) !== 0;
        const blockType = blockHeader & 0x7f;
        const blockSize = (data[offset+1]<<16)|(data[offset+2]<<8)|data[offset+3];
        offset += 4;
        if (blockType === 6) { 
          const block = data.slice(offset, offset + blockSize);
          let p = 4; 
          const mimeLen = (block[p]<<24)|(block[p+1]<<16)|(block[p+2]<<8)|block[p+3]; p += 4;
          const mime = new TextDecoder().decode(block.slice(p, p + mimeLen)); p += mimeLen;
          const descLen = (block[p]<<24)|(block[p+1]<<16)|(block[p+2]<<8)|block[p+3]; p += 4 + descLen;
          p += 16; 
          const dataLen = (block[p]<<24)|(block[p+1]<<16)|(block[p+2]<<8)|block[p+3]; p += 4;
          const imgBytes = block.slice(p, p + dataLen);
          const blob = new Blob([imgBytes], { type: mime || "image/jpeg" });
          return URL.createObjectURL(blob);
        }
        offset += blockSize;
        if (isLast) break;
      }
      return null;
    } catch (e) {
      return null;
    }
  }


  async function resolveArtForOverlay(track) {
  if (!track.artUrl) return null;
  if (track.artUrl.startsWith('data:')) return track.artUrl;
  try {
    const res = await fetch(track.artUrl, {
      headers: { Authorization: `Bearer ${authToken()}` }
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}


const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 256;
const source = audioCtx.createMediaElementSource(audio);

const subBassFilter = audioCtx.createBiquadFilter();
subBassFilter.type = "lowshelf";
subBassFilter.frequency.value = 80;
subBassFilter.gain.value = 0;

const bassFilter = audioCtx.createBiquadFilter();
bassFilter.type = "lowshelf";
bassFilter.frequency.value = 250;
bassFilter.gain.value = 0;

const midFilter = audioCtx.createBiquadFilter();
midFilter.type = "peaking";
midFilter.frequency.value = 1000;
midFilter.Q.value = 1;
midFilter.gain.value = 0;

const trebleFilter = audioCtx.createBiquadFilter();
trebleFilter.type = "highshelf";
trebleFilter.frequency.value = 3000;
trebleFilter.gain.value = 0;


source.connect(subBassFilter);
subBassFilter.connect(bassFilter);
bassFilter.connect(midFilter);
midFilter.connect(trebleFilter);
trebleFilter.connect(analyser);
analyser.connect(audioCtx.destination);

const dataArray = new Uint8Array(analyser.frequencyBinCount);


let musicStreamDestination = null;
let musicJitsiTrack = null;

function getMusicStreamDestination() {
  if (!musicStreamDestination) {
    musicStreamDestination = audioCtx.createMediaStreamDestination();
    analyser.connect(musicStreamDestination);
  }
  return musicStreamDestination;
}


let botConnection = null;
let botConference = null;
let botAudioTrack = null;
let botVideoTrack = null; 

let isBroadcasting = false;

function toggleLocalOutput(mute) {
  try {
    if (mute) {
      analyser.disconnect(audioCtx.destination);
    } else {
      analyser.connect(audioCtx.destination);
    }
  } catch (e) {}
}

async function enableVoiceBroadcast() {
  if (!currentVoiceRoom) {
    window.showToast?.("❌ Join a voice channel first");
    el("mpBroadcastToggle").checked = false;
    el("mpBroadcastLabel").classList.remove("active");
    return;
  }
 if (botConference) return;

  const existingBot = conference?.getParticipants?.()
    .find(p => p.getProperty("isBot") === "true");
  if (existingBot) {
    window.showToast?.("❌ A music bot is already active in this voice channel");
    el("mpBroadcastToggle").checked = false;
    el("mpBroadcastLabel").classList.remove("active");
    return;
  }

  try {
    isBroadcasting = true;
    toggleLocalOutput(true);
    window.showToast?.("🎵 Music bot joing please wait");

    botConnection = new JitsiMeetJS.JitsiConnection(null, null, {
      hosts: { domain: JITSI_CONFIG.domain, muc: JITSI_CONFIG.muc },
      serviceUrl: JITSI_CONFIG.bosh,
      p2p: { enabled: false }
    });

    await new Promise((resolve, reject) => {
      const onConnected = () => {
        botConnection.removeEventListener(JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED, onConnected);
        resolve();
      };
      const onFailed = (err) => {
        botConnection.removeEventListener(JitsiMeetJS.events.connection.CONNECTION_FAILED, onFailed);
        reject(err);
      };
      botConnection.addEventListener(JitsiMeetJS.events.connection.CONNECTION_ESTABLISHED, onConnected);
      botConnection.addEventListener(JitsiMeetJS.events.connection.CONNECTION_FAILED, onFailed);
      botConnection.connect();
    });

    botConference = botConnection.initJitsiConference(currentVoiceRoom, {
      p2p: { enabled: false },
      disableAudioLevels: true
    });

    botConference.setLocalParticipantProperty("isBot", "true");
    updateBotIdentity();
    resetMusicStreamDestination();
    const flagPcInterval = setInterval(() => {
      const pc = botConference.jvbJingleSession?.peerconnection?.peerconnection;
      if (pc) {
        pc.__isBotPC = true;
        clearInterval(flagPcInterval);
      }
    }, 50);
    setTimeout(() => clearInterval(flagPcInterval), 10000); 

    const dest = getMusicStreamDestination();
    const [track] = await JitsiMeetJS.createLocalTracksFromMediaStreams([{
      stream: dest.stream,
      sourceType: "mic",
      mediaType: "audio",
      effects: [],
      constraints: {
        autoGainControl: false,
        noiseSuppression: false,
        echoCancellation: false,
        channelCount: 2
      }
    }]);

    botAudioTrack = track;

    await new Promise((resolve) => {
      botConference.on(JitsiMeetJS.events.conference.CONFERENCE_JOINED, resolve);
      botConference.join();
    });

    botConference.addTrack(botAudioTrack);
    syncBotVideoTrack();
    window.__debugBotConference = botConference;
    setTimeout(async () => {
      try {
        const pc = botConference.jvbJingleSession?.peerconnection?.peerconnection;
        pc && (pc.__isBotPC = true);
        const sender = pc?.getSenders().find(s => s.track === botAudioTrack.getTrack());
        if (sender) {
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
          params.encodings[0].maxBitrate = 256000;
          params.encodings[0].priority = "high";
          params.encodings[0].networkPriority = "high";
          await sender.setParameters(params);
          console.log("✅ Bot audio sender params updated:", sender.getParameters());
        } else {
          console.warn("⚠️ Could not find bot audio sender to tune params");
        }
      } catch (e) {
        console.warn("Failed to set bot sender parameters:", e);
      }
    }, 1500);

    

  } catch (e) {
    console.error("Failed to start music bot:", e);
    window.showToast?.("❌ Couldn't start music bot");
    await disableVoiceBroadcast();
  }
}




function openAddRadioModal() {
  document.getElementById("mpAddRadioModal")?.remove();
  const modal = document.createElement("div");
  modal.id = "mpAddRadioModal";
  modal.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.75);
    display: flex; align-items: center; justify-content: center; z-index: 21000;
  `;

  modal.innerHTML = `
    <div style="
      background: #2b2d31; border-radius: 12px; padding: 28px 32px;
      width: 380px; box-shadow: 0 20px 60px rgba(0,0,0,0.6);
      border: 1px solid #3a3c42;
    ">
      <h3 style="margin:0 0 6px; color:#fff; font-size:18px;">Add Radio Station</h3>
      <p style="margin:0 0 20px; color:#b9bbbe; font-size:13px;">
        Paste a direct stream URL (mp3, aac, Icecast, etc).
      </p>
      <input id="mpRadioUrlInput" type="text" placeholder="https://stream.example.com/live.mp3"
        style="
          width:100%; padding:10px 14px; background:#40444b; border:1px solid #40444b;
          border-radius:8px; color:#fff; font-size:14px; box-sizing:border-box;
          outline:none; transition:border-color 0.2s; margin-bottom:12px;
        "
      >
      <input id="mpRadioNameInput" type="text" placeholder="Station name (optional)" maxlength="60"
        style="
          width:100%; padding:10px 14px; background:#40444b; border:1px solid #40444b;
          border-radius:8px; color:#fff; font-size:14px; box-sizing:border-box;
          outline:none; transition:border-color 0.2s;
        "
      >
      <p id="mpRadioError" style="color:#ff3333; font-size:13px; min-height:18px; margin:8px 0 0;"></p>
      <div style="display:flex; gap:10px; margin-top:8px; justify-content:flex-end;">
        <button id="mpRadioCancel" style="
          background:#40444b; border:none; color:#fff; padding:9px 18px;
          border-radius:8px; cursor:pointer; font-size:14px; transition:background 0.2s;
        ">Cancel</button>
        <button id="mpRadioConfirm" style="
          background:#FF0000; border:none; color:#fff; padding:9px 18px;
          border-radius:8px; cursor:pointer; font-size:14px; font-weight:600;
          transition:background 0.2s;
        ">Add</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const urlInput = modal.querySelector("#mpRadioUrlInput");
  const nameInput = modal.querySelector("#mpRadioNameInput");
  const errEl = modal.querySelector("#mpRadioError");

  urlInput.focus();
  [urlInput, nameInput].forEach(inp => {
    inp.addEventListener("focus", () => inp.style.borderColor = "#FF0000");
    inp.addEventListener("blur", () => inp.style.borderColor = "#40444b");
  });

  const submit = () => {
    const url = urlInput.value.trim();
    if (!url) { errEl.textContent = "Stream URL is required."; return; }
    let parsed;
    try {
      parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    } catch (e) {
      errEl.textContent = "Enter a valid http/https URL.";
      return;
    }
    const name = nameInput.value.trim();
    const item = buildRadioTrack(url, name || null);
    queue.push(item);
    if (shuffleOn && preShuffleOrder) preShuffleOrder.push(item);
    renderPlaylist();
    if (currentIndex === -1) playTrackAt(queue.length - 1);
    window.showToast?.(`Added station "${item.title}" to Queue`);
    modal.remove();
  };

  modal.querySelector("#mpRadioConfirm").onclick = submit;
  modal.querySelector("#mpRadioCancel").onclick = () => modal.remove();
  [urlInput, nameInput].forEach(inp => {
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
      if (e.key === "Escape") modal.remove();
    });
  });
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
}

async function disableVoiceBroadcast() {
  isBroadcasting = false;
  await removeBotVideoTrack();
  toggleLocalOutput(false);     

  if (botAudioTrack) {
    try { await botConference?.removeTrack(botAudioTrack); } catch (e) {}
    botAudioTrack.dispose();
    botAudioTrack = null;
  }
  if (botConference) {
    try { botConference.leave(); } catch (e) {}
    botConference = null;
  }
  if (botConnection) {
    try { botConnection.disconnect(); } catch (e) {}
    botConnection = null;
  }

  window.showToast?.("Music bot left, local audio restored");
  resetMusicStreamDestination();
}


function resetMusicStreamDestination() {
  if (musicStreamDestination) {
    try {
      analyser.disconnect(musicStreamDestination);
    } catch (e) {}
    musicStreamDestination = null;
  }
}


function updateBotIdentity() {
  if (!botConference) return;
  const track = queue[currentIndex];
  const displayName = track ? `🎵 ${track.title}` : "🎵 Music Bot";
  const avatarUrl = track?.artUrl || "/icon.png";

  botConference.setDisplayName(displayName);
  botConference.setLocalParticipantProperty("avatar", avatarUrl);
  botConference.setLocalParticipantProperty("usernameColor", "username-cyberpunk");
  botConference.setLocalParticipantProperty("isBot", "true");
  botConference.setLocalParticipantProperty("level", String(1337));
}


function getBotVideoStream() {
  const videoEl = el("mpArtVideo");
  const capture = videoEl.captureStream || videoEl.mozCaptureStream;
  if (!capture) return null;

  if (videoEl.readyState < 2) {
    console.warn("Video not ready for captureStream yet");
    return null;
  }

  const cached = videoEl.__mpCaptureStream;
  const cachedTrack = cached?.getVideoTracks()[0];
  if (!cached || !cachedTrack || cachedTrack.readyState === "ended") {
    videoEl.__mpCaptureStream = capture.call(videoEl, 30);
  }
  return videoEl.__mpCaptureStream;
}

function botShouldSendVideo() {
  const track = queue[currentIndex];
  return !!(isBroadcasting && videoArtEnabled && track?.videoUrl && el("mpArtVideo").style.display !== "none");
}

async function addBotVideoTrack() {
  if (!botConference || botVideoTrack) return;
  await waitForRealVideoFrame(el("mpArtVideo"));
  const stream = getBotVideoStream();
  const vTrack = stream?.getVideoTracks()[0];
  if (!vTrack) return;

  try { vTrack.contentHint = "motion"; } catch (e) {}

  try {
    await vTrack.applyConstraints({ frameRate: { ideal: 30, max: 60 } });
  } catch (e) {
    console.warn("Couldn't apply frameRate constraint to bot video track:", e);
  }

  try {
    const [jitsiTrack] = await JitsiMeetJS.createLocalTracksFromMediaStreams([{
      stream,
      track: vTrack,
      sourceType: "screen",
      mediaType: "video",
      videoType: "desktop",
      effects: []
    }]);
    botVideoTrack = jitsiTrack;
    await botConference.addTrack(botVideoTrack);

    tuneBotVideoSender();
  } catch (e) {
    console.warn("Failed to add bot video track:", e);
    botVideoTrack = null;
  }
}

function tuneBotVideoSender() {
  setTimeout(async () => {
    try {
      const pc = botConference?.jvbJingleSession?.peerconnection?.peerconnection;
      if (!pc) return;
      const sender = pc.getSenders().find(s => s.track === botVideoTrack.getTrack());
      if (!sender) {
        console.warn("⚠️ Could not find bot video sender to tune params");
        return;
      }
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }


      const enc = params.encodings[0];
      enc.minBitrate = 3000000;
      enc.maxBitrate = 12000000;
      enc.maxFramerate = 30;
      enc.scaleResolutionDownBy = 1;
      enc.priority = "high";
      enc.networkPriority = "high";
      if ("degradationPreference" in params) {
        params.degradationPreference = "maintain-framerate";
      }

      await sender.setParameters(params);
      console.log("✅ Bot video sender params updated:", sender.getParameters());
    } catch (e) {
      console.warn("Failed to set bot video sender parameters:", e);
    }
  }, 1500);
}
async function removeBotVideoTrack() {
  if (!botVideoTrack) return;
  try { await botConference?.removeTrack(botVideoTrack); } catch (e) {}
  botVideoTrack.dispose();
  botVideoTrack = null;

  const videoEl = el("mpArtVideo");
  videoEl.__mpCaptureStream = null; 
}


function waitForRealVideoFrame(videoEl) {
  return new Promise((resolve) => {
    if (typeof videoEl.requestVideoFrameCallback === "function") {
      videoEl.requestVideoFrameCallback(() => resolve());
    } else if (videoEl.readyState >= 2) {
      resolve();
    } else {
      videoEl.addEventListener("loadeddata", () => resolve(), { once: true });
    }
  });
}

function syncBotVideoTrack() {
  if (botShouldSendVideo()) {
    const videoEl = el("mpArtVideo");
    if (videoEl.readyState < 2) {
      videoEl.addEventListener("loadeddata", () => syncBotVideoTrack(), { once: true });
      return;
    }
    addBotVideoTrack();
  } else {
    removeBotVideoTrack();
  }
}


function pushAudioLevel() {
  analyser.getByteFrequencyData(dataArray);
  const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
  const level = avg / 255;
  if (window.electronAPI?.overlayMusicLevel) {
    window.electronAPI.overlayMusicLevel(level);
  }
  requestAnimationFrame(pushAudioLevel);
}
requestAnimationFrame(pushAudioLevel);


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
    ping: currentVoiceRoom ? currentPingMs : null
  });

  remoteTracks.forEach((audio, id) => {
    const participant = conference?.getParticipantById(id);
    if (!participant) return;
    const state = voiceStates.get(id) || {};
    const remoteColorClass = participant.getProperty("usernameColor") || 'username-cyan';
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
      speaking: document.querySelector(`.voice-participant[data-id="${id}"]`)?.classList.contains('speaking') || false
    });
  });

  window.electronAPI.overlayVoiceUpdate(participants);
}


async function updateMusicStatus() {
  if (typeof socket === "undefined" || !socket?.connected) return;
  const track = queue[currentIndex];
  const isActuallyPlaying = track && !audio.paused;
  const musicStatus = isActuallyPlaying ? `${track.title} - ${track.artist}` : null;
  const musicArtUrl = isActuallyPlaying ? (track.artUrl || null) : null;
  window.currentMusicStatus = musicStatus;
  window.currentMusicArtUrl = musicArtUrl;
  socket.emit("setMusicStatus", { musicStatus, musicArtUrl });

  if (window.electronAPI?.overlayMusicUpdate) {
    if (isActuallyPlaying) {
      const artDataUrl = await resolveArtForOverlay(track);
      window.electronAPI.overlayMusicUpdate({ title: track.title, artist: track.artist, artUrl: artDataUrl });
    } else {
      window.electronAPI.overlayMusicUpdate(null);
    }
  }
}

 
  async function extractID3Text(file) {
    try {
      const headBuf = await readSlice(file, 0, 10);
      const head = new Uint8Array(headBuf);
      if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return {};
      const ver = head[3];
      const size = ((head[6]&0x7f)<<21)|((head[7]&0x7f)<<14)|((head[8]&0x7f)<<7)|(head[9]&0x7f);
      const tagBuf = await readSlice(file, 10, 10 + size);
      const data = new Uint8Array(tagBuf);
      let offset = 0;
      const out = {};
      const frameHeaderSize = ver >= 3 ? 10 : 6;
      while (offset < data.length - frameHeaderSize) {
        let frameId, frameSize;
        if (ver >= 3) {
          frameId = String.fromCharCode(data[offset], data[offset+1], data[offset+2], data[offset+3]);
          frameSize = ver === 4
            ? ((data[offset+4]&0x7f)<<21)|((data[offset+5]&0x7f)<<14)|((data[offset+6]&0x7f)<<7)|(data[offset+7]&0x7f)
            : (data[offset+4]<<24)|(data[offset+5]<<16)|(data[offset+6]<<8)|data[offset+7];
          offset += 10;
        } else {
          frameId = String.fromCharCode(data[offset], data[offset+1], data[offset+2]);
          frameSize = (data[offset+3]<<16)|(data[offset+4]<<8)|data[offset+5];
          offset += 6;
        }
        if (frameSize <= 0 || offset + frameSize > data.length) break;
        const isTitle = frameId === "TIT2" || frameId === "TT2";
        const isArtist = frameId === "TPE1" || frameId === "TP1";
        if (isTitle || isArtist) {
          const frameData = data.slice(offset, offset + frameSize);
          const enc = frameData[0];
          let text;
          try {
            if (enc === 1 || enc === 2) text = new TextDecoder("utf-16").decode(frameData.slice(1));
            else text = new TextDecoder("utf-8").decode(frameData.slice(1));
          } catch { text = ""; }
          text = text.replace(/\u0000/g, "").trim();
          if (isTitle) out.title = text;
          if (isArtist) out.artist = text;
        }
        offset += frameSize;
      }
      return out;
    } catch (e) {
      return {};
    }
  }

  function baseName(name) {
    return name.replace(/\.[^/.]+$/, "").toLowerCase();
  }

  function fileDir(file) {
    const rel = file.webkitRelativePath || "";
    const idx = rel.lastIndexOf("/");
    return idx === -1 ? "" : rel.slice(0, idx);
  }

  function findSiblingImage(file, allFiles) {
    const targetBase = baseName(file.name);
    const targetDir = fileDir(file);
    const imgExts = ["jpg","jpeg","png","webp","gif","bmp"];
    const inSameDir = (f) => fileDir(f) === targetDir;

    for (const f of allFiles) {
      if (f === file) continue;
      const ext = f.name.split(".").pop().toLowerCase();
      if (imgExts.includes(ext) && baseName(f.name) === targetBase && inSameDir(f)) {
        return URL.createObjectURL(f);
      }
    }
  
    for (const f of allFiles) {
      const ext = f.name.split(".").pop().toLowerCase();
      if (imgExts.includes(ext) && /cover|folder|art/i.test(f.name) && inSameDir(f)) {
        return URL.createObjectURL(f);
      }
    }
    return null;
  }


  function findSiblingVideo(file, allFiles) {
  const targetBase = baseName(file.name);
  const targetDir = fileDir(file);
  const inSameDir = (f) => fileDir(f) === targetDir;

  for (const f of allFiles) {
    if (f === file) continue;
    const ext = f.name.split(".").pop().toLowerCase();
    if (ext === "mp4" && baseName(f.name) === targetBase && inSameDir(f)) {
      return URL.createObjectURL(f);
    }
  }
  return null;
}

 async function buildTrack(file, allFiles) {
    const ext = file.name.split(".").pop().toLowerCase();
    let art = null;
    let tags = {};

    if (ext === "mp3") {
      [art, tags] = await Promise.all([extractID3Art(file), extractID3Text(file)]);
    } else if (ext === "flac") {
      art = await extractFlacArt(file);
    }

    if (!art) art = findSiblingImage(file, allFiles);
    const videoUrl = findSiblingVideo(file, allFiles); 

    const rawName = file.name.replace(/\.[^/.]+$/, "");
    let title = tags.title || rawName;
    let artist = tags.artist || "Unknown Artist";
  
    if (!tags.title && !tags.artist) {
      const m = rawName.match(/^(.+?)\s*-\s*(.+)$/);
      if (m) {
        artist = m[1].trim(); title = m[2].trim();
      } else {
        const dir = fileDir(file);
        if (dir) {
          const folderName = dir.split("/").pop();
          if (folderName) artist = folderName;
        }
      }
    }

    return {
      id: Math.random().toString(36).slice(2),
      file,
      title,
      artist,
      artUrl: art,
      videoUrl,      
      url: URL.createObjectURL(file),
      addedAt: file.lastModified || Date.now(),
    };
  }


  function gradientForString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    const h1 = hash % 360;
    const h2 = (h1 + 55) % 360;
    return `linear-gradient(135deg, hsl(${h1},65%,32%), hsl(${h2},70%,18%))`;
  }


  function sortQueue() {
  const currentTrack = queue[currentIndex] || null;
  queue.sort((a, b) => {
    switch (queueSort) {
      case "added-asc":  return (a.addedAt || 0) - (b.addedAt || 0);
      case "added-desc": return (b.addedAt || 0) - (a.addedAt || 0);
      case "title-asc":  return a.title.localeCompare(b.title);
      case "title-desc": return b.title.localeCompare(a.title);
      default: return 0;
    }
  });
  if (currentTrack) currentIndex = queue.findIndex(t => t.id === currentTrack.id);
  if (shuffleOn) preShuffleOrder = queue.slice();
  renderPlaylist();
}


  function renderPlaylist() {
  const list = el("mpPlaylist");
  el("mpQueueLabel").textContent = `Queue (${queue.length})`;
  if (queue.length === 0) {
    list.innerHTML = "";
    return;
  }

  const fragment = document.createDocumentFragment();
  queue.forEach((track, i) => {
    const row = document.createElement("div");
    row.className = "mp-track" + (i === currentIndex ? " active" : "");
    const seed = escapeHtml(track.title + track.artist);
    const artOk = track.artUrl && !knownBadArt.has(track.artUrl);
    const safeArtUrl = escapeHtml(artOk ? track.artUrl : "");
    row.innerHTML = `
      <img class="mp-track-thumb" loading="lazy" src="${safeArtUrl}" style="${artOk ? "" : "display:none;"}" onerror="window.__mpThumbFallback(this, '${seed.replace(/'/g, "\\'")}', '${(track.artUrl||"").replace(/'/g, "\\'")}')">
      <div class="mp-track-thumb" style="${artOk ? "display:none;" : `background:${gradientForString(track.title+track.artist)};`}"></div>
      <div class="mp-track-info">
        <div class="mp-track-title">${escapeHtml(track.title)}</div>
        <div class="mp-track-artist">${escapeHtml(track.artist)}</div>
      </div>
      ${i === currentIndex ? `<svg class="mp-track-eq" viewBox="0 0 24 24" fill="#FF0000"><rect x="4" y="10" width="3" height="8"><animate attributeName="height" values="8;16;8" dur="0.8s" repeatCount="indefinite"/></rect><rect x="10" y="6" width="3" height="12"><animate attributeName="height" values="12;4;12" dur="0.9s" repeatCount="indefinite"/></rect><rect x="16" y="9" width="3" height="9"><animate attributeName="height" values="9;15;9" dur="0.7s" repeatCount="indefinite"/></rect></svg>` : ""}
      <button class="mp-track-remove" data-idx="${i}" title="Remove">✕</button>
    `;
    row.addEventListener("click", (e) => {
      if (e.target.closest(".mp-track-remove")) return;
      playTrackAt(i);
    });
    row.querySelector(".mp-track-remove").addEventListener("click", (e) => {
      e.stopPropagation();
      removeTrackAt(i);
    });
    fragment.appendChild(row);
    if (i === currentIndex) {
      requestAnimationFrame(() => row.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    }
  });

  list.innerHTML = "";
  list.appendChild(fragment);
}


const knownBadArt = new Set();
function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

window.__mpThumbFallback = function (imgEl, seed, artUrl) {
  if (artUrl) knownBadArt.add(artUrl);
  imgEl.style.display = "none";
  const sibling = imgEl.nextElementSibling;
  if (sibling) {
    sibling.style.display = "flex";
    sibling.style.background = gradientForString(seed);
  }
};

function updateNowPlayingUI() {
    const track = queue[currentIndex];
    const videoEl = el("mpArtVideo");

    if (!track) {
      el("mpTitle").textContent = "No track loaded";
      el("mpArtist").textContent = "Add some music to get started";
      videoEl.pause();
      videoEl.removeAttribute("src");
      videoEl.style.display = "none";
      el("mpArtImg").style.display = "none";
      el("mpArtFallback").style.display = "flex";
      el("mpBgArt").style.backgroundImage = "";
      el("mpMiniTitle").textContent = "No track loaded";
      el("mpMiniArtist").textContent = "-";
      el("mpMiniArt").style.display = "none";
      el("mpMiniArtFallback").style.display = "flex";
      el("mpMiniBgArt").style.backgroundImage = "";
      updateMusicStatus();
      updateBotIdentity();
      return;
    }

    el("mpTitle").textContent = track.title;
    el("mpArtist").textContent = track.artist;

    const useVideo = videoArtEnabled && !!track.videoUrl;

     if (useVideo) {
      el("mpArtImg").style.display = "none";
      el("mpArtFallback").style.display = "none";

      const isSameSrc = videoEl.dataset.trackId === track.id && videoEl.src;
      if (!isSameSrc) {
        videoEl.src = track.videoUrl;
        videoEl.dataset.trackId = track.id;
        videoEl.addEventListener("loadedmetadata", function onMeta() {
          videoEl.currentTime = audio.currentTime;
          videoEl.removeEventListener("loadedmetadata", onMeta);
        });

        videoEl.__mpCaptureStream = null;
        if (isBroadcasting) {
          videoEl.addEventListener("loadeddata", async function onData() {
            videoEl.removeEventListener("loadeddata", onData);
            await removeBotVideoTrack();
            syncBotVideoTrack();
          }, { once: true });
        }
      }

      videoEl.style.display = "block";
      if (!audio.paused) videoEl.play().catch(() => {});
    } else {
      videoEl.pause();
      videoEl.removeAttribute("src");
      videoEl.load();              
      videoEl.style.display = "none";
      syncBotVideoTrack();

      if (track.artUrl) {
        el("mpArtImg").onerror = () => {
          el("mpArtImg").onerror = null;
          el("mpArtImg").style.display = "none";
          el("mpArtFallback").style.display = "flex";
          el("mpArtWrap").style.background = gradientForString(track.title + track.artist);
        };
        el("mpArtImg").src = track.artUrl;
        el("mpArtImg").style.display = "block";
        el("mpArtFallback").style.display = "none";
      } else {
        el("mpArtImg").style.display = "none";
        el("mpArtFallback").style.display = "flex";
        el("mpArtWrap").style.background = gradientForString(track.title + track.artist);
      }
    }
    if (track.artUrl) {
      el("mpBgArt").style.backgroundImage = `url('${track.artUrl}')`;
      el("mpMiniBgArt").style.backgroundImage = `url('${track.artUrl}')`;
    } else {
      el("mpBgArt").style.backgroundImage = "";
    }

    el("mpMiniTitle").textContent = track.title;
    el("mpMiniArtist").textContent = track.artist;
    if (track.artUrl) {
      el("mpMiniArt").src = track.artUrl;
      el("mpMiniArt").style.display = "block";
      el("mpMiniArtFallback").style.display = "none";
    } else {
      el("mpMiniArt").style.display = "none";
      el("mpMiniArtFallback").style.display = "flex";
    }

    renderPlaylist();
    updateMusicStatus();
    updateBotIdentity();
  }

function playTrackAt(index) {
    if (index < 0 || index >= queue.length) return;
    currentIndex = index;
    const track = queue[currentIndex];
    audio.src = track.url;
    audio.play().catch(() => {});
    updateNowPlayingUI();
    setPlayIcon(true);
}

  function removeTrackAt(index) {
    const removed = queue[index];
    if (removed) {
      if (removed.url) URL.revokeObjectURL(removed.url);
    }
    queue.splice(index, 1);
    if (index === currentIndex) {
      audio.pause();
      currentIndex = -1;
      if (queue.length > 0) playTrackAt(Math.min(index, queue.length - 1));
      else updateNowPlayingUI();
    } else if (index < currentIndex) {
      currentIndex--;
    }
    renderPlaylist();
  }




 function setupEqControls() {
  const bassSlider = el("mpEqBass");
  const midSlider = el("mpEqMid");
  const trebleSlider = el("mpEqTreble");
  const resetBtn = el("mpEqReset");
  if (!bassSlider || !midSlider || !trebleSlider) return;

  function applyEq(filter, db) {
    filter.gain.setTargetAtTime(db, audioCtx.currentTime, 0.05);
  }

  function applyBass(db) {
    applyEq(subBassFilter, db);
    applyEq(bassFilter, db * 0.6);
  }

  const savedEq = (() => {
    try { return JSON.parse(localStorage.getItem("mpEqSettings")) || { bass: 0, mid: 0, treble: 0 }; }
    catch (e) { return { bass: 0, mid: 0, treble: 0 }; }
  })();

  bassSlider.value = savedEq.bass;
  midSlider.value = savedEq.mid;
  trebleSlider.value = savedEq.treble;
  applyBass(savedEq.bass);
  applyEq(midFilter, savedEq.mid);
  applyEq(trebleFilter, savedEq.treble);

  function saveEq() {
    try {
      localStorage.setItem("mpEqSettings", JSON.stringify({
        bass: bassSlider.value, mid: midSlider.value, treble: trebleSlider.value
      }));
    } catch (e) {}
  }

  bassSlider.addEventListener("input", () => { applyBass(bassSlider.value); saveEq(); });
  midSlider.addEventListener("input", () => { applyEq(midFilter, midSlider.value); saveEq(); });
  trebleSlider.addEventListener("input", () => { applyEq(trebleFilter, trebleSlider.value); saveEq(); });

  resetBtn.addEventListener("click", () => {
    bassSlider.value = 0; midSlider.value = 0; trebleSlider.value = 0;
    applyBass(0); applyEq(midFilter, 0); applyEq(trebleFilter, 0);
    saveEq();
  });
}

function setRepeatMode(mode) {
  repeatMode = mode;
  const btnEl = el("mpRepeatBtn");
  btnEl.classList.toggle("active", repeatMode === 1);
  btnEl.title = repeatMode === 0 ? "Repeat off" : "Repeat on";
}

function setPlayIcon(isPlaying) {
    el("mpPlayIcon").style.display = isPlaying ? "none" : "block";
    el("mpPauseIcon").style.display = isPlaying ? "block" : "none";
    el("mpArtWrap").classList.toggle("playing", isPlaying);
    el("mpMiniPlayIcon").style.display = isPlaying ? "none" : "block";
    el("mpMiniPauseIcon").style.display = isPlaying ? "block" : "none";
  }

  function togglePlay() {
    if (currentIndex === -1) {
      if (queue.length > 0) playTrackAt(0);
      return;
    }
    if (audio.paused) { audio.play().catch(() => {}); setPlayIcon(true); }
    else { audio.pause(); setPlayIcon(false); }
  }

function nextTrack(auto) {
  if (queue.length === 0) return;
  let next = currentIndex + 1;
  if (next >= queue.length) next = 0;
  playTrackAt(next);
}

function prevTrack() {
  if (queue.length === 0) return;
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  let prev = currentIndex - 1;
  if (prev < 0) prev = queue.length - 1;
  playTrackAt(prev);
}

async function handleFiles(fileList) {
  const allFiles = Array.from(fileList);
  const audioFiles = allFiles.filter(f => /audio\//.test(f.type) || /\.(mp3|flac|wav|ogg|m4a|aac|opus)$/i.test(f.name));
  if (audioFiles.length === 0) return;

  const wasEmpty = queue.length === 0;
  for (const file of audioFiles) {
    const track = await buildTrack(file, allFiles);
    queue.push(track);
    if (shuffleOn && preShuffleOrder) preShuffleOrder.push(track);
  }
  renderPlaylist();
  if (wasEmpty && queue.length > 0) playTrackAt(0);
}


  function libIconFolder() {
    return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>`;
  }
  function libIconTrack() {
    return `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" class="mp-lib-track-icon"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
  }

function buildRadioTrack(streamUrl, name) {
  return {
    id: Math.random().toString(36).slice(2),
    file: null,
    title: name || "Live Radio Stream",
    artist: "Radio",
    artUrl: null,
    videoUrl: null,
    rawUrl: streamUrl,
    url: `/api/radio/proxy?url=${encodeURIComponent(streamUrl)}&token=${encodeURIComponent(authToken())}`,
    source: "radio",
    isRadio: true,
    addedAt: Date.now(),
  };
}

function addRadioStream() {
  const url = prompt("Enter the radio stream URL (e.g. an .mp3/.aac/.m3u8/Icecast URL):");
  if (!url) return;
  const trimmed = url.trim();
  if (!trimmed) return;
  let name = prompt("Name this station (optional):", "");
  const item = buildRadioTrack(trimmed, name?.trim() || null);
  queue.push(item);
  if (shuffleOn && preShuffleOrder) preShuffleOrder.push(item);
  renderPlaylist();
  if (currentIndex === -1) playTrackAt(queue.length - 1);
  window.showToast?.(`Added station "${item.title}" to Queue`);
}

function serverTrackToQueueItem(t) {
  return {
    id: Math.random().toString(36).slice(2),
    file: null,
    title: t.name.replace(/\.[^/.]+$/, ""),
    artist: "Server Library",
    artUrl: t.artUrl || null,
    videoUrl: t.videoUrl || null,  
    url: t.url,
    source: "server",
    relPath: t.relPath,
    addedAt: t.mtime || Date.now(),
  };
}

  
  let libSearchDebounce = null;
  let librarySearchActive = false;

  function buildTrackRow(t, opts) {
    opts = opts || {};
    const row = document.createElement("div");
    row.className = "mp-lib-track";
    const base = t.name.replace(/\.[^/.]+$/, "");
    const libArtOk = t.artUrl && !knownBadArt.has(t.artUrl);
    const safeArtUrl = escapeHtml(t.artUrl || "");  
row.innerHTML = `
  ${libArtOk
    ? `<img class="mp-lib-thumb" loading="lazy" src="${safeArtUrl}" onerror="...">
       <div class="mp-lib-thumb" style="display:none;align-items:center;justify-content:center;">${libIconTrack()}</div>`
    : `<div class="mp-lib-thumb" style="display:flex;align-items:center;justify-content:center;">${libIconTrack()}</div>`}
      <div class="mp-lib-name-wrap">
        <div class="mp-lib-name">${escapeHtml(base)}</div>
        ${opts.showDir
          ? `<div class="mp-lib-result-dir">${escapeHtml(t.dir ? "/" + t.dir : "/ (root)")}</div>`
          : `<div class="mp-lib-artist">Server Library</div>`}
      </div>
      <button class="mp-lib-add">+ Queue</button>
    `;
row.addEventListener("click", (e) => {
  if (e.target.closest(".mp-lib-add")) return;
  const item = serverTrackToQueueItem(t);
  queue.push(item);
  if (shuffleOn && preShuffleOrder) preShuffleOrder.push(item);
  renderPlaylist();
  playTrackAt(queue.length - 1);
});
row.querySelector(".mp-lib-add").addEventListener("click", (e) => {
  e.stopPropagation();
  const item = serverTrackToQueueItem(t);
  queue.push(item);
  if (shuffleOn && preShuffleOrder) preShuffleOrder.push(item);
  renderPlaylist();
  if (currentIndex === -1) playTrackAt(0);
  window.showToast?.(`Added ${item.title} to Queue`);
});
    return row;
  }

  async function fetchLibrary(subPath) {
    librarySearchActive = false;
    const list = el("mpLibList");
    list.innerHTML = `<div id="mpLibStatus">Loading…</div>`;
    try {
      const res = await fetch(`/api/music/browse?path=${encodeURIComponent(subPath)}`, {
        headers: { Authorization: `Bearer ${authToken()}` }
      });
      if (!res.ok) {
        list.innerHTML = `<div id="mpLibStatus">Couldn't load folder (${res.status}).</div>`;
        return;
      }
      const data = await res.json();
      libPath = data.path || "";
      renderBreadcrumb();
      el("mpLibBreadcrumb").style.display = "";
      renderLibrary(data.folders || [], data.tracks || []);
    } catch (e) {
      list.innerHTML = `<div id="mpLibStatus">Couldn't reach server music library.</div>`;
    }
  }

  async function searchLibrary(query) {
    librarySearchActive = true;
    const list = el("mpLibList");
    const existingBtn = el("mpLibAddAllBtn");
    if (existingBtn) existingBtn.remove();
    el("mpLibBreadcrumb").style.display = "none";
    list.innerHTML = `<div id="mpLibStatus">Searching…</div>`;
    try {
      const res = await fetch(`/api/music/search?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${authToken()}` }
      });
      if (!res.ok) {
        list.innerHTML = `<div id="mpLibStatus">Search failed (${res.status}).</div>`;
        return;
      }
      const data = await res.json();
      renderSearchResults(data.results || [], data.truncated);
    } catch (e) {
      list.innerHTML = `<div id="mpLibStatus">Couldn't reach server music library.</div>`;
    }
  }


  let previousVolume = null;



function renderSearchResults(results, truncated) {
    const list = el("mpLibList");
    const existingBtn = el("mpLibAddAllBtn");
    if (existingBtn) existingBtn.remove();
    list.innerHTML = "";
    if (results.length === 0) {
      list.innerHTML = `<div id="mpLibStatus">No matching tracks found.</div>`;
      return;
    }

    results.sort((a, b) => {
      if (librarySort === "date-desc") return (b.mtime || 0) - (a.mtime || 0);
      if (librarySort === "date-asc")  return (a.mtime || 0) - (b.mtime || 0);
      if (librarySort === "name-desc") return b.name.localeCompare(a.name);
      return a.name.localeCompare(b.name);
    });

    const addAll = document.createElement("button");
    addAll.id = "mpLibAddAllBtn";
    addAll.textContent = `+ Add all ${results.length} result${results.length === 1 ? "" : "s"} to queue`;
    addAll.addEventListener("click", () => {
    results.forEach(t => {
        const item = serverTrackToQueueItem(t);
        queue.push(item);
        if (shuffleOn && preShuffleOrder) preShuffleOrder.push(item);
    });
    renderPlaylist();
    if (currentIndex === -1 && queue.length > 0) playTrackAt(0);
    window.showToast?.(`Added ${results.length} result${results.length === 1 ? "" : "s"} to Queue`);
    });
    el("mpPanelLibrary").insertBefore(addAll, list);

    if (truncated) {
      const note = document.createElement("div");
      note.style.cssText = "padding:0 8px 8px; color:#55575d; font-size:10.5px;";
      note.textContent = "Showing the first batch of matches, try a more specific search.";
      list.appendChild(note);
    }

    results.forEach(t => list.appendChild(buildTrackRow(t, { showDir: true })));
  }

  function renderBreadcrumb() {
    const crumbBar = el("mpLibBreadcrumb");
    const parts = libPath ? libPath.split("/").filter(Boolean) : [];
    let html = `<span class="crumb" data-path="">Library</span>`;
    let acc = "";
    parts.forEach(p => {
      acc = acc ? `${acc}/${p}` : p;
      html += `<span class="sep">/</span><span class="crumb" data-path="${escapeHtml(acc)}">${escapeHtml(p)}</span>`;
    });
    crumbBar.innerHTML = html;
    crumbBar.querySelectorAll(".crumb").forEach(c => {
      c.addEventListener("click", () => {
        el("mpLibSearchInput").value = "";
        el("mpLibSearchClear").classList.remove("show");
        fetchLibrary(c.dataset.path);
      });
    });
  }

function renderLibrary(folders, tracks) {
    const list = el("mpLibList");
    const existingBtn = el("mpLibAddAllBtn");
    if (existingBtn) existingBtn.remove();
    list.innerHTML = "";

    if (folders.length === 0 && tracks.length === 0) {
      list.innerHTML = `<div id="mpLibStatus">This folder is empty.</div>`;
      return;
    }

    folders.sort((a, b) => librarySort === "name-desc" ? b.localeCompare(a) : a.localeCompare(b));
    tracks.sort((a, b) => {
        if (librarySort === "date-desc") return (b.mtime || 0) - (a.mtime || 0);
        if (librarySort === "date-asc")  return (a.mtime || 0) - (b.mtime || 0);
        if (librarySort === "name-desc") return b.name.localeCompare(a.name);
        return a.name.localeCompare(b.name);
    });

    if (tracks.length > 0) {
      const addAll = document.createElement("button");
      addAll.id = "mpLibAddAllBtn";
      addAll.textContent = `+ Add all ${tracks.length} track${tracks.length === 1 ? "" : "s"} to queue`;
        addAll.addEventListener("click", () => {
        tracks.forEach(t => {
            const item = serverTrackToQueueItem(t);
            queue.push(item);
            if (shuffleOn && preShuffleOrder) preShuffleOrder.push(item);
        });
        renderPlaylist();
        if (currentIndex === -1 && queue.length > 0) playTrackAt(0);
        window.showToast?.(`Added ${tracks.length} track${tracks.length === 1 ? "" : "s"} to Queue`);
        });
            el("mpPanelLibrary").insertBefore(addAll, list);
    }

    folders.forEach(name => {
      const row = document.createElement("div");
      row.className = "mp-lib-folder";
      row.innerHTML = `${libIconFolder()}<div class="mp-lib-name">${escapeHtml(name)}</div>`;
      row.addEventListener("click", () => {
        const next = libPath ? `${libPath}/${name}` : name;
        fetchLibrary(next);
      });
      list.appendChild(row);
    });

    tracks.forEach(t => list.appendChild(buildTrackRow(t, { showDir: false })));
  }


    async function deletePlaylist(name) {
    try {
      const res = await fetch(`/api/music/playlists/${encodeURIComponent(name)}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken()}`
        },
        body: JSON.stringify({ userId: window.user?.id || null })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        window.showToast?.(data.error || "Failed to delete playlist.");
        return;
      }
      cachedPlaylists = await fetchPlaylists();
      renderPlaylistsPanel();
      window.showToast?.(`🗑️ Playlist "${name}" deleted`);
    } catch (e) {
      console.error("Failed to delete playlist:", e);
      window.showToast?.("Couldn't reach the server to delete the playlist.");
    }
  }

  function renderPlaylistsPanel(filterText) {
    const list = el("mpPlaylistsList");
    let names = Object.keys(cachedPlaylists);
 
    const q = (filterText || "").trim().toLowerCase();
    if (q) {
      names = names.filter(name => {
        if (name.toLowerCase().includes(q)) return true;
        return cachedPlaylists[name].tracks.some(t => (t.name || "").toLowerCase().includes(q));
      });
    }
 
    if (names.length === 0) {
      list.innerHTML = `<div id="mpLibStatus">${q ? "No playlists match your search." : "No saved playlists yet."}</div>`;
      return;
    }
 
    const canDelete = !!(window.user && (window.user.isAdmin || window.user.isDeveloper));
 
    list.innerHTML = "";
    names.sort((a, b) => (cachedPlaylists[b].createdAt || 0) - (cachedPlaylists[a].createdAt || 0));
    names.forEach(name => {
      const pl = cachedPlaylists[name];
      const row = document.createElement("div");
      row.className = "mp-saved-pl";
      const meta = `${pl.tracks.length} track${pl.tracks.length === 1 ? "" : "s"}${pl.createdBy ? ` • by ${escapeHtml(pl.createdBy)}` : ""}`;
      row.innerHTML = `
        <div class="mp-saved-pl-info">
          <div class="mp-saved-pl-name">${escapeHtml(name)}</div>
          <div class="mp-saved-pl-meta">${meta}</div>
        </div>
        ${canDelete ? `<button class="mp-saved-pl-del" title="Delete">✕</button>` : ""}
      `;
      row.addEventListener("click", (e) => {
        if (e.target.closest(".mp-saved-pl-del")) return;
        loadPlaylistIntoQueue(name);
      });
      const delBtn = row.querySelector(".mp-saved-pl-del");
      if (delBtn) {
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (typeof window.showConfirmModal === "function") {
            window.showConfirmModal(
              "This removes it for everyone.",
              () => deletePlaylist(name),
              { title: `Delete playlist "${name}"?`, confirmLabel: "Delete" }
            );
          } else {
            deletePlaylist(name);
          }
        });
      }
      list.appendChild(row);
    });
  }
 

 

    async function fetchPlaylists() {
    try {
      const res = await fetch("/api/music/playlists", {
        headers: { Authorization: `Bearer ${authToken()}` }
      });
      if (!res.ok) return {};
      const data = await res.json();
      return data.playlists || {};
    } catch (e) {
      console.error("Failed to fetch playlists:", e);
      return {};
    }
  }



  function switchTab(tab) {
    document.querySelectorAll(".mp-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
    el("mpPanelQueue").classList.toggle("active", tab === "queue");
    el("mpPanelLibrary").classList.toggle("active", tab === "library");
    el("mpPanelPlaylists").classList.toggle("active", tab === "playlists");
    if (tab === "library" && !el("mpLibList").hasChildNodes()) fetchLibrary("");
    if (tab === "playlists") {
  fetchPlaylists().then(pl => {
    cachedPlaylists = pl;
    renderPlaylistsPanel(el("mpPlaylistSearchInput").value);
  });
}
  }
  



 async function saveCurrentQueueAsPlaylist(name) {
    if (!name) return;
    const saveable = queue.filter(t => t.source === "server" || t.source === "radio");
    if (saveable.length === 0) {
      window.showToast?.("No server library tracks or radio stations in the queue to save. Local files can't be saved.");
      return;
    }
    try {
      const res = await fetch("/api/music/playlists", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken()}`
        },
        body: JSON.stringify({
        name,
        userId: window.user?.id || null,
        createdBy: (window.user?.username || "Unknown"),
        tracks: saveable.map(t => t.source === "radio" ? ({
            type: "radio",
            name: t.title,
            rawUrl: t.rawUrl,
        }) : ({
            type: "server",
            name: t.title,
            relPath: t.relPath,
            url: t.url,
            artUrl: t.artUrl || null,
            videoUrl: t.videoUrl || null,
        })),
        })
      });
      const data = await res.json();
      if (!res.ok) {
        window.showToast?.(data.error || "Failed to save playlist.");
        return;
      }
      cachedPlaylists = await fetchPlaylists();
      renderPlaylistsPanel();
      window.showToast?.(`Playlist "${name}" saved!`);
    } catch (e) {
      console.error("Failed to save playlist:", e);
      window.showToast?.("Couldn't reach the server to save the playlist.");
    }
  }





function loadPlaylistIntoQueue(name) {
  const pl = cachedPlaylists[name];
  if (!pl) return;
  queue = pl.tracks.map(t => {
    if (t.type === "radio") {
      return buildRadioTrack(t.rawUrl, t.name);
    }
    const item = serverTrackToQueueItem({
      name: t.name + ".track",
      relPath: t.relPath,
      url: t.url,
      artUrl: t.artUrl,
      videoUrl: t.videoUrl,
    });
    item.title = t.name;
    return item;
  });

  preShuffleOrder = shuffleOn ? queue.slice() : null;
  currentIndex = -1;
  renderPlaylist();
  if (queue.length > 0) playTrackAt(0);
  switchTab("queue");

  window.showToast?.(`Loaded playlist "${name}" (${pl.tracks.length} tracks) into Queue`);
}


 function clearQueue() {
  if (queue.length === 0) return;
  const doClear = () => {
    audio.pause();
    audio.src = "";
    el("mpArtVideo").removeAttribute("src");
    el("mpArtVideo").dataset.trackId = "";
    queue.forEach(t => { if (t.url && t.source !== "server") URL.revokeObjectURL(t.url); });
    queue = [];
    preShuffleOrder = null; 
    currentIndex = -1;
    renderPlaylist();
    updateNowPlayingUI();

    el("mpSeek").value = 0;
    el("mpSeek").style.background = `linear-gradient(to right, #FF0000 0%, #FF0000 0%, #3a3c42 0%, #3a3c42 100%)`;
    el("mpTimeCur").textContent = "0:00";
    el("mpTimeDur").textContent = "0:00";
    const miniBar = el("mpMiniProgressBar");
    if (miniBar) miniBar.style.width = "0%";

    window.showToast?.("🗑️ Queue cleared");
  };

  if (typeof window.showConfirmModal === "function") {
    window.showConfirmModal(
      "This will remove all tracks from the current queue.",
      doClear,
      { title: "Clear the queue?", confirmLabel: "Clear" }
    );
  } else {
    doClear();
  }
}




  function wireEvents() {
    btn.addEventListener("click", () => modal.classList.add("show"));
    el("mpCloseBtn").addEventListener("click", () => modal.classList.remove("show"));
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.classList.remove("show"); });

    document.querySelectorAll(".mp-tab").forEach(t => {
      t.addEventListener("click", () => switchTab(t.dataset.tab));
    });

    el("mpLibSearchInput").addEventListener("input", (e) => {
      const val = e.target.value;
      el("mpLibSearchClear").classList.toggle("show", val.length > 0);
      clearTimeout(libSearchDebounce);
      libSearchDebounce = setTimeout(() => {
        const q = val.trim();
        if (q.length === 0) {
          fetchLibrary(libPath || "");
        } else {
          searchLibrary(q);
        }
      }, 300);
    });
    el("mpLibSearchClear").addEventListener("click", () => {
      el("mpLibSearchInput").value = "";
      el("mpLibSearchClear").classList.remove("show");
      fetchLibrary(libPath || "");
    });

    el("mpAddRadioBtn").addEventListener("click", openAddRadioModal);

    el("mpPlaylistSearchInput").addEventListener("input", (e) => {
      const val = e.target.value;
      el("mpPlaylistSearchClear").classList.toggle("show", val.length > 0);
      renderPlaylistsPanel(val);
    });
    el("mpPlaylistSearchClear").addEventListener("click", () => {
      el("mpPlaylistSearchInput").value = "";
      el("mpPlaylistSearchClear").classList.remove("show");
      renderPlaylistsPanel("");
    });
    setupEqControls();
    el("mpVideoArtBtn").classList.toggle("active", videoArtEnabled);

    el("mpVideoArtBtn").classList.toggle("active", videoArtEnabled);
    el("mpVideoArtBtn").addEventListener("click", () => setVideoArtEnabled(!videoArtEnabled));

    el("mpBroadcastToggle").addEventListener("change", (e) => {
      el("mpBroadcastLabel").classList.toggle("active", e.target.checked);
      if (e.target.checked) enableVoiceBroadcast();
      else disableVoiceBroadcast();
    });

    el("mpSavePlaylistBtn").addEventListener("click", () => {
      const input = el("mpNewPlaylistName");
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      saveCurrentQueueAsPlaylist(name);
      input.value = "";
    });
    el("mpNewPlaylistName").addEventListener("keydown", (e) => {
      if (e.key === "Enter") el("mpSavePlaylistBtn").click();
    });

    el("mpQueueSort").addEventListener("change", (e) => {
    queueSort = e.target.value;
    sortQueue();
    });

    el("mpLibSort").addEventListener("change", (e) => {
    librarySort = e.target.value;
    const searchVal = el("mpLibSearchInput").value.trim();
    if (searchVal) searchLibrary(searchVal);
    else fetchLibrary(libPath || "");
    });

    el("mpAddBtn").addEventListener("click", () => el("mpFileInput").click());
    el("mpFileInput").addEventListener("change", (e) => {
      handleFiles(e.target.files);
      e.target.value = "";
    });

    el("mpAddFolderBtn").addEventListener("click", () => el("mpFolderInput").click());
    el("mpFolderInput").addEventListener("change", (e) => {
      handleFiles(e.target.files);
      e.target.value = "";
    });
    el("mpClearQueueBtn").addEventListener("click", () => clearQueue());
    el("mpPlayBtn").addEventListener("click", togglePlay);
    el("mpNextBtn").addEventListener("click", () => nextTrack(false));
    el("mpPrevBtn").addEventListener("click", prevTrack);

    el("mpShuffleBtn").addEventListener("click", () => {
    shuffleOn = !shuffleOn;
    el("mpShuffleBtn").classList.toggle("active", shuffleOn);

    if (queue.length === 0) return;

    const currentTrack = queue[currentIndex] || null;

    if (shuffleOn) {
        preShuffleOrder = queue.slice();
        const rest = queue.filter((_, i) => i !== currentIndex);
        const shuffledRest = shuffleArray(rest);
        queue = currentTrack ? [currentTrack, ...shuffledRest] : shuffledRest;
        currentIndex = currentTrack ? 0 : -1;
    } else {
        if (preShuffleOrder) {
        queue = preShuffleOrder;
        preShuffleOrder = null;
        currentIndex = currentTrack ? queue.findIndex(t => t.id === currentTrack.id) : -1;
        }
    }

    renderPlaylist();
    });
    el("mpRepeatBtn").addEventListener("click", () => {
    setRepeatMode(repeatMode === 0 ? 1 : 0);
    });

    el("mpSeek").addEventListener("input", (e) => {
        const track = queue[currentIndex];
  if (track?.isRadio || !audio.duration) return;
      if (!audio.duration) return;
      audio.currentTime = (e.target.value / 100) * audio.duration;
      const videoEl = el("mpArtVideo");
      if (videoEl.style.display !== "none") {
        videoEl.currentTime = audio.currentTime;
      }
    });

    el("mpVol").addEventListener("input", (e) => {
    const vol = e.target.value / 100;
    audio.volume = vol;

    const fill = `linear-gradient(to right, #FF0000 0%, #FF0000 ${vol*100}%, #3a3c42 ${vol*100}%, #3a3c42 100%)`;
    el("mpVol").style.background = fill;
    el("mpMiniVol").value = e.target.value;
    el("mpMiniVol").style.background = fill;

    try { localStorage.setItem("mpVolume", String(e.target.value)); } catch (err) {}
    });

    el("mpMiniToggleBtn").addEventListener("click", () => {
      modal.classList.remove("show");
      miniPlayer.classList.add("show");
    });
    el("mpMiniExpandBtn").addEventListener("click", () => {
      miniPlayer.classList.remove("show");
      modal.classList.add("show");
    });
    el("mpMiniPlayBtn").addEventListener("click", togglePlay);
    el("mpMiniNextBtn").addEventListener("click", () => nextTrack(false));
    el("mpMiniPrevBtn").addEventListener("click", prevTrack);

    el("mpMiniVol").addEventListener("input", (e) => {
    const vol = e.target.value / 100;
    audio.volume = vol;

    const fill = `linear-gradient(to right, #FF0000 0%, #FF0000 ${vol*100}%, #3a3c42 ${vol*100}%, #3a3c42 100%)`;
    el("mpMiniVol").style.background = fill;
    el("mpVol").value = e.target.value;
    el("mpVol").style.background = fill;

    try { localStorage.setItem("mpVolume", String(e.target.value)); } catch (err) {}
    });


    (function makeMainDraggable() {
  const dragHandle = el("mpHeader");
  const win = el("mpWindow");
  let isDragging = false, startX, startY, startLeft, startTop;
  function ensureAbsolutePositioning() {
    if (win.dataset.dragEnabled) return;
    const rect = win.getBoundingClientRect();
    modal.style.justifyContent = "flex-start";
    modal.style.alignItems = "flex-start";
    win.style.position = "fixed";
    win.style.left = rect.left + "px";
    win.style.top = rect.top + "px";
    win.style.margin = "0";
    win.dataset.dragEnabled = "true";
  }

  dragHandle.addEventListener("mousedown", (e) => {
    if (e.target.closest("button")) return;
    ensureAbsolutePositioning();
    isDragging = true;
    const rect = win.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    let left = startLeft + dx;
    let top = startTop + dy;
    left = Math.max(0, Math.min(left, window.innerWidth - win.offsetWidth));
    top = Math.max(0, Math.min(top, window.innerHeight - win.offsetHeight));
    win.style.left = left + "px";
    win.style.top = top + "px";
  });

  document.addEventListener("mouseup", () => { isDragging = false; });
})();

    (function makeMiniDraggable() {
      const dragHandle = el("mpMiniDrag");
      let isDragging = false, startX, startY, startLeft, startTop;

        dragHandle.addEventListener("mousedown", (e) => {
        if (e.target.closest(".mp-mini-ctrl") || e.target.closest("input")) return;
        isDragging = true;
        const rect = miniPlayer.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        e.preventDefault();
      });
      document.addEventListener("mousemove", (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        let left = startLeft + dx;
        let top = startTop + dy;
        left = Math.max(0, Math.min(left, window.innerWidth - miniPlayer.offsetWidth));
        top = Math.max(0, Math.min(top, window.innerHeight - miniPlayer.offsetHeight));
        miniPlayer.style.left = left + "px";
        miniPlayer.style.top = top + "px";
      });

      document.addEventListener("mouseup", () => { isDragging = false; });
    })();
    const savedVol = (() => {
      try { return localStorage.getItem("mpVolume"); } catch (err) { return null; }
    })();
    const initialVol = savedVol !== null ? parseInt(savedVol, 10) : 80;
    el("mpVol").value = initialVol;
    el("mpMiniVol").value = initialVol;
    audio.volume = initialVol / 100;

    const initialFill = `linear-gradient(to right, #FF0000 0%, #FF0000 ${initialVol}%, #3a3c42 ${initialVol}%, #3a3c42 100%)`;
    el("mpVol").style.background = initialFill;
    el("mpMiniVol").style.background = initialFill;
 audio.addEventListener("timeupdate", () => {
  const track = queue[currentIndex];
  if (track?.isRadio) {
    el("mpSeek").value = 100;
    el("mpSeek").style.background = `linear-gradient(to right, #FF0000 0%, #FF0000 100%, #3a3c42 100%, #3a3c42 100%)`;
    el("mpSeek").disabled = true;
    el("mpTimeCur").textContent = "LIVE";
    el("mpTimeDur").textContent = "";
    const miniBar = el("mpMiniProgressBar");
    if (miniBar) miniBar.style.width = "100%";
    return;
  }
  el("mpSeek").disabled = false;
  if (!audio.duration) return;
      const pct = (audio.currentTime / audio.duration) * 100;
      el("mpSeek").value = pct;
      el("mpSeek").style.background = `linear-gradient(to right, #FF0000 0%, #FF0000 ${pct}%, #3a3c42 ${pct}%, #3a3c42 100%)`;
      el("mpTimeCur").textContent = formatTime(audio.currentTime);
      el("mpTimeDur").textContent = formatTime(audio.duration);

      const miniBar = el("mpMiniProgressBar");
      if (miniBar) miniBar.style.width = pct + "%";

    
      el("mpProgressEmote").style.left = pct + "%";
      el("mpMiniProgressEmote").style.left = pct + "%";

      const videoEl = el("mpArtVideo");
      if (videoEl.style.display !== "none" && Math.abs(videoEl.currentTime - audio.currentTime) > 0.3) {
        videoEl.currentTime = audio.currentTime;
      }
    });

    audio.addEventListener("ended", () => {
    if (repeatMode === 1) { audio.currentTime = 0; audio.play().catch(() => {}); return; }
    nextTrack(true);
    });

    audio.addEventListener("play", () => {
      setPlayIcon(true);
      const videoEl = el("mpArtVideo");
      if (videoArtEnabled && videoEl.style.display !== "none") videoEl.play().catch(() => {});
      if (isBroadcasting) toggleLocalOutput(true);
      updateMusicStatus();
    });
    audio.addEventListener("pause", () => {
      setPlayIcon(false);
      el("mpArtVideo").pause();
      updateMusicStatus();
    });
    document.addEventListener("keydown", (e) => {
      if (!modal.classList.contains("show")) return;
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      if (e.key === "Escape") modal.classList.remove("show");
    });
  }

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      wireEvents();
      renderPlaylist();
    });
  } else {
    wireEvents();
    renderPlaylist();
  }
})();

