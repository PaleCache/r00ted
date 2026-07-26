const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlayAPI', {
  onVoiceUpdate: (callback) => {
    ipcRenderer.on('voice-update', (event, participants) => callback(participants));
  },

  onMusicUpdate: (cb) => ipcRenderer.on('music-update', (e, data) => cb(data)),
  onConfig: (callback) => {
    ipcRenderer.on('load-config', (event, config) => callback(config));
  },

  ackConfig: () => ipcRenderer.send('overlay-config-ack'),
  onReposition: (cb) => ipcRenderer.on('reposition', (e, pos) => cb(pos)),
  savePosition: (pos) => ipcRenderer.send('overlay-save-position', pos),
  onMusicLevel: (cb) => ipcRenderer.on('music-level', (e, level) => cb(level)),
  onPingUpdate: (cb) => ipcRenderer.on('ping-update', (e, ping) => cb(ping)),
});