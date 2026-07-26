
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
   updateBadge: (count) => ipcRenderer.send('update-badge', count),
   toggleOverlay: (enabled) => ipcRenderer.send('toggle-overlay', enabled),
   updateOverlay: (userData) => ipcRenderer.send('update-overlay', userData),
   notify: (data) => ipcRenderer.send('show-notification', data),
   overlayVoiceUpdate: (participants) => ipcRenderer.send('overlay-voice-update', participants),
   overlayGetInfo: () => ipcRenderer.invoke('overlay-get-info'),
   overlaySavePosition: (pos) => ipcRenderer.send('overlay-save-position', pos),
   overlaySetEnabled: (enabled) => ipcRenderer.send('overlay-set-enabled', enabled),
   overlayResetPosition: () => ipcRenderer.send('overlay-reset-position'),
   onOverlayRequestRefresh: (callback) => ipcRenderer.on('overlay-request-refresh', () => callback()),
   overlayMusicUpdate: (data) => ipcRenderer.send('overlay-music-update', data),
   overlayMusicLevel: (level) => ipcRenderer.send('overlay-music-level', level),
   overlayPingUpdate: (ping) => ipcRenderer.send('overlay-ping-update', ping),
   getRunningGames: () => {
    return new Promise((resolve) => {
      const handler = (event, game) => {
        ipcRenderer.removeListener('running-games-reply', handler);
        resolve(game);
      };
      ipcRenderer.on('running-games-reply', handler);
      ipcRenderer.send('get-running-games');
    });
  }
});