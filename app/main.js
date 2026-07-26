const { app, BrowserWindow, Menu, Tray, shell, desktopCapturer, dialog, screen, ipcMain, nativeImage, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
let lastMusicData = null;
const { execSync } = require('child_process');
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('ozone-platform', 'x11');
}
app.commandLine.appendSwitch('ozone-platform', 'x11');
app.commandLine.appendSwitch('disable-features', 'VaapiVideoDecoder,VaapiVideoEncoder');
let mainWindow;
let tray;
const trayIcons = new Map();


function applyNativeClickThrough() {
  if (process.platform !== 'linux') return;
  if (!overlayWindow) return;
  try {
    const winId = execSync(
      `xdotool search --name "r00ted-overlay-unique-id" | head -1`
    ).toString().trim();

    if (!winId) {
      fs.appendFileSync('/tmp/overlay-debug.log', 'xdotool found no window\n');
      return;
    }

    const helperPath = app.isPackaged
      ? path.join(process.resourcesPath, 'shape-clickthrough')
      : path.join(__dirname, '../helpers/shape-clickthrough');

    execSync(`${helperPath} ${winId}`);
    fs.appendFileSync('/tmp/overlay-debug.log', `applied click-through to window ${winId}\n`);
  } catch (e) {
    fs.appendFileSync('/tmp/overlay-debug.log', `click-through helper failed: ${e.message}\n`);
  }
}

const overlayConfigPath = path.join(app.getPath('userData'), 'overlay-settings.json');
let overlaySettings = { enabled: true, x: null, y: null };
try {
  overlaySettings = { ...overlaySettings, ...JSON.parse(fs.readFileSync(overlayConfigPath, 'utf8')) };
} catch (e) {
  console.log('⚠️ No saved overlay settings found, using defaults:', e.message);
}

function saveOverlaySettings() {
  try {
    fs.writeFileSync(overlayConfigPath, JSON.stringify(overlaySettings));
  } catch (e) {
    console.error('❌ Failed to save overlay settings:', e);
  }
}

let overlayEditMode = false;

const { createCanvas, loadImage } = require('@napi-rs/canvas');



const baseTrayImage = nativeImage
  .createFromPath(path.join(__dirname, '../public/r00ted.png'))
  .resize({ width: 256, height: 256 });

const baseTrayBuffer = baseTrayImage.toPNG();

let cachedBaseImage = null;
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

//app.commandLine.appendSwitch('ozone-platform', 'x11');


function createBadgeImage(count) {
  const label = count > 99 ? '99+' : String(count);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
      <circle cx="16" cy="16" r="16" fill="#FF0000"/>
      <text x="16" y="20" font-family="Arial" font-weight="bold"
            font-size="${label.length > 2 ? 9 : 13}"
            fill="white" text-anchor="middle">${label}</text>
    </svg>`;
  return nativeImage.createFromDataURL(
    `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  );
}

async function generateTrayIcons() {
  cachedBaseImage = await loadImage(baseTrayBuffer);

  for (let i = 0; i <= 99; i++) {
    trayIcons.set(i, buildTrayIcon(i));
  }

  trayIcons.set('99+', buildTrayIcon('99+'));
}

function buildTrayIcon(labelValue) {
  const label = String(labelValue);

  const canvas = createCanvas(256, 256);
  const ctx = canvas.getContext('2d');

  ctx.drawImage(cachedBaseImage, 0, 0, 256, 256);

  if (label !== '0') {
    ctx.beginPath();
    ctx.arc(192, 64, 72, 0, Math.PI * 2);

    ctx.fillStyle = '#FF0000';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 12;

    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${label.length > 2 ? 56 : 76}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillText(label, 192, 66);
  }

  return nativeImage.createFromBuffer(
    canvas.toBuffer('image/png')
  );
}


function buildWindowIconWithBadge(count) {
  if (!cachedBaseImage || count <= 0) {
    return baseTrayImage;
  }
  const key = count > 99 ? '99+' : count;
  return trayIcons.get(key) || baseTrayImage;
}

let trayUpdateTimeout = null;

function updateTrayIcon(count) {
  if (!tray) return;
  clearTimeout(trayUpdateTimeout);
  trayUpdateTimeout = setTimeout(() => {
    if (count <= 0) {
      tray.setImage(baseTrayImage);
      tray.setToolTip('R00TED');
      return;
    }
    const key = count > 99 ? '99+' : count;
    const icon = trayIcons.get(key) || baseTrayImage;
    tray.setImage(icon);
    tray.setToolTip(`R00TED (${count} unread)`);
  }, 1500);
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.on('ready', async () => {
  try {
    await generateTrayIcons();
    await loadGamesConfig();
  } catch (err) {
    console.error('❌ Failed to generate tray icons:', err);
  }
mainWindow = new BrowserWindow({
  width: 1400,
  height: 900,
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    enableRemoteModule: false,
    sandbox: false,
    preload: path.join(__dirname, 'preload.js'),
    allowRunningInsecureContent: false,
    webSecurity: true,
  },
  icon: path.join(__dirname, '../public/r00ted.png')
});
  mainWindow.webContents.setBackgroundThrottling(false);
  await mainWindow.webContents.session.clearCache();
  mainWindow.loadURL(CONFIG.serverUrl);

  tray = new Tray(baseTrayImage);
  tray.setToolTip('R00TED');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show', click: () => mainWindow.show() },
    { label: 'Hide', click: () => mainWindow.hide() },
    { type: 'separator' },
    { label: 'Quit', click: () => { mainWindow.destroy(); app.exit(0); } }
  ]));
  tray.on('click', () => {
    if (mainWindow.isVisible()) { mainWindow.hide(); } else { mainWindow.show(); }
  });

ipcMain.on('update-badge', (event, count) => {
  const safeCount = Number.isFinite(count) ? count : 0;
  updateTrayIcon(safeCount);
  try { app.setBadgeCount(safeCount); } catch(e) {}

  if (process.platform === 'darwin') {
    app.dock.setBadge(safeCount > 0 ? (safeCount > 99 ? '99+' : String(safeCount)) : '');
  } else if (process.platform === 'win32') {
    mainWindow.setOverlayIcon(
      safeCount > 0 ? createBadgeImage(safeCount) : null,
      safeCount > 0 ? `${safeCount} unread` : ''
    );
} else if (process.platform === 'linux') {
  console.log('Setting window icon, count:', safeCount);
  mainWindow.setIcon(buildWindowIconWithBadge(safeCount));
}
});


ipcMain.on('overlay-music-update', (event, musicData) => {
  lastMusicData = musicData; 
  if (!overlayWindow || !overlaySettings.enabled) return;
  if (!overlayReady) return;
  overlayWindow.webContents.send('music-update', musicData);
});;

ipcMain.on('show-notification', async (event, { title, body, icon, url, tag, silent, requireInteraction }) => {
  if (!Notification.isSupported()) return;

  const fallbackIcon = nativeImage.createFromPath(path.join(__dirname, '../public/r00ted.png'));
  let notifIcon = fallbackIcon;

  if (icon && icon.startsWith('http')) {
    try {
      const net = require('electron').net;
      const response = await net.fetch(icon);
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

     const img = await loadImage(buffer);
      const canvas = createCanvas(img.width, img.height);
      canvas.getContext('2d').drawImage(img, 0, 0);
      const pngBuffer = canvas.toBuffer('image/png');

      const downloaded = nativeImage.createFromBuffer(pngBuffer);
      if (!downloaded.isEmpty()) notifIcon = downloaded;
    } catch (e) {
      console.log('Failed to fetch notification icon, using fallback:', e.message);
    }
  } else if (icon) {
    const local = nativeImage.createFromPath(icon);
    if (!local.isEmpty()) notifIcon = local;
  }

  const notif = new Notification({
    title: title || 'R00TED',
    body:  body  || '',
    icon: notifIcon,
    ...(tag    !== undefined && { tag }),
    ...(silent !== undefined && { silent })
  });

  notif.on('click', () => {
    mainWindow.show();
    mainWindow.focus();
    if (url) mainWindow.webContents.send('notification-clicked', { url });
  });

  notif.on('close', () => notif.removeAllListeners());
  notif.show();
});

  mainWindow.webContents.session.setDisplayMediaRequestHandler(async (request, callback) => {
    let callbackCalled = false;
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      if (!sources || sources.length === 0) {
        if (!callbackCalled) { callbackCalled = true; callback({ video: false }); }
        return;
      }
      const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: sources.map(s => s.name || 'Screen'),
        defaultId: 0,
        title: 'Select Screen to Share',
        message: 'Choose screen or window'
      });
      if (response === undefined || response === -1) {
        if (!callbackCalled) { callbackCalled = true; callback({ video: false }); }
        return;
      }
      if (!callbackCalled) { callbackCalled = true; callback({ video: sources[response] }); }
    } catch (err) {
      console.error('Screen share error:', err.message);
      if (!callbackCalled) { callbackCalled = true; callback({ video: false }); }
    }
  });

  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['display-capture', 'media', 'microphone', 'camera', 'screen-wake-lock', 'notifications', 'fullscreen'];
    callback(allowedPermissions.includes(permission));
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (event) => {
    event.preventDefault();
    mainWindow.hide();
  });
});



let CONFIG = {
  serverUrl: "",
  debugMode: true
};

try {
  const configPath = path.join(__dirname, './configs/appconfig.json');
  CONFIG = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  console.log(`✅ Loaded appconfig.json ${CONFIG.serverUrl}`);
} catch (err) {
  console.warn('⚠️ Could not load appconfig.json, using defaults');
}

const gamesConfigPath = path.join(app.getPath('userData'), 'games.json');
let MANUAL_GAMES = {};



function loadLocalGamesFallback() {
  try {
    const bundled = path.join(__dirname, '../public/games.json');
    return JSON.parse(fs.readFileSync(bundled, 'utf8'));
  } catch {
    return {};
  }
}

async function loadGamesConfig() {
  try {
    const net = require('electron').net;
    const response = await net.fetch(`${CONFIG.serverUrl}/games.json`);
    const data = await response.json();
    fs.writeFileSync(gamesConfigPath, JSON.stringify(data));
    MANUAL_GAMES = data;
    console.log(`✅ Loaded ${Object.keys(MANUAL_GAMES).length} games from server`);
  } catch (err) {
    console.warn('⚠️ Server fetch failed, falling back to cache:', err.message);
    try {
      MANUAL_GAMES = JSON.parse(fs.readFileSync(gamesConfigPath, 'utf8'));
    } catch {
      MANUAL_GAMES = loadLocalGamesFallback();
    }
  }
}

const AMBIGUOUS_APPIDS = new Set(['252490', '730', '570', '4000']);

function getInstalledSteamGames() {
  const steamPaths = ({
    linux: [
      path.join(os.homedir(), '.steam/steam'),
      path.join(os.homedir(), '.steam/root'),
      path.join(os.homedir(), '.local/share/Steam'),
    ],
    darwin: [path.join(os.homedir(), 'Library/Application Support/Steam')],
    win32:  ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam'],
  })[process.platform] || [];

  const games = new Map();
  const seenDirs = new Set();

  for (const steamPath of steamPaths) {
    const vdfPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
    if (!fs.existsSync(vdfPath)) continue;

    const libraryDirs = [path.join(steamPath, 'steamapps')];
    try {
      const vdf = fs.readFileSync(vdfPath, 'utf8');
      for (const m of vdf.matchAll(/"path"\s+"([^"]+)"/gi)) {
        const libPath = path.join(m[1], 'steamapps');
        if (!libraryDirs.includes(libPath)) libraryDirs.push(libPath);
      }
    } catch {}



    for (const dir of libraryDirs) {
      if (seenDirs.has(dir)) continue;
      seenDirs.add(dir);
      try {
        for (const file of fs.readdirSync(dir).filter(f => f.startsWith('appmanifest_') && f.endsWith('.acf'))) {
          try {
            const content    = fs.readFileSync(path.join(dir, file), 'utf8');
            const name       = content.match(/"name"\s+"([^"]+)"/i)?.[1];
            const appid      = content.match(/"appid"\s+"(\d+)"/i)?.[1];
            const installdir = content.match(/"installdir"\s+"([^"]+)"/i)?.[1];
            if (!name || !appid || !installdir) continue;
            if (name.toLowerCase().includes('proton') || 
                name.toLowerCase().includes('runtime') ||
                name.toLowerCase().includes('redistributable')) continue;
            const gamePath = path.join(dir, 'common', installdir).toLowerCase();
            games.set(installdir.toLowerCase(), { name, appid, gamePath });
          } catch {}
        }
      } catch {}
    }
  }

  return games;
}

function getRunningProcesses() {
  try {
    const raw = execSync(
      process.platform === 'win32'
        ? 'powershell -NoProfile -NonInteractive -Command "Get-CimInstance Win32_Process | Select-Object -ExpandProperty ExecutablePath"'
        : 'ps -eo args=',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 3000 }
    );
    return raw.split('\n')
      .map(l => l.replace(/^executablepath=/i, '').replace(/\\/g, '/').trim().toLowerCase())
      .filter(Boolean);
  } catch (e) {
    console.warn('getRunningProcesses failed:', e.message);
    return [];
  }
}

ipcMain.on('get-running-games', (event) => {
  let result = null;
  try {
    const processPaths = getRunningProcesses().map(p => p.replace(/\\/g, '/'));
    const steamGames = getInstalledSteamGames();

    for (const [installdir, { name, appid }] of steamGames) {
      if (name.toLowerCase().includes('proton') ||
          name.toLowerCase().includes('runtime') ||
          name.toLowerCase().includes('redistributable')) continue;
      const needle = `steamapps/common/${installdir}`.toLowerCase();
      const matched = processPaths.some(p => p.includes(needle));

      if (matched) {
        result = name;
        break;
      }
    }

  
    if (!result) {
      const exeNames = new Set(
        processPaths.map(p => path.basename(p).replace(/\.exe$/i, '').trim().toLowerCase())
      );
      for (const [exe, name] of Object.entries(MANUAL_GAMES)) {
        if (exeNames.has(exe.toLowerCase())) { result = name; break; }
      }
    }
  } catch (e) {
  }

  event.reply('running-games-reply', result);
});

app.on('window-all-closed', () => {});


let overlayWindow = null;

function createOverlayWindow() {
   overlayReady = false;
  const { screen } = require('electron');
  const { width, height, x, y } = screen.getPrimaryDisplay().bounds;

  overlayWindow = new BrowserWindow({
    title: 'r00ted-overlay-unique-id',
    width,
    height,
    x,
    y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    fullscreenable: false,
    hasShadow: false,
    focusable: false,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'overlay-preload.js'),
    }
  });



overlayWindow.setAlwaysOnTop(true, 'screen-saver');
overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

overlayWindow.webContents.on('page-title-updated', (event) => {
  event.preventDefault();
});
overlayWindow.webContents.on('dom-ready', () => {
    overlayWindow.webContents.send('load-config', {
      serverUrl: CONFIG.serverUrl || 'http://127.0.0.1:5350/',
      position: { x: overlaySettings.x, y: overlaySettings.y },
      enabled: overlaySettings.enabled,
      version: app.getVersion()
    });
  });

overlayWindow.loadFile(path.join(__dirname, '/overlay.html'));

if(CONFIG.debugMode){
overlayWindow.webContents.openDevTools({ mode: 'detach' })
}

if (process.platform === 'win32') {
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
} else {
  overlayWindow.setIgnoreMouseEvents(true);
}

const b = overlayWindow.getBounds();
overlayWindow.setBounds({ ...b, width: b.width + 1 });
setImmediate(() => overlayWindow.setBounds(b));



  

  overlayWindow.on('closed', () => { overlayWindow = null; });
}

app.on('ready', () => {
  if (overlaySettings.enabled) {
    createOverlayWindow();
  }
});

ipcMain.on('overlay-config-ack', () => {
  overlayReady = true;
  console.log('✅ overlay acked config, requesting fresh voice push');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('overlay-request-refresh');
  }
 
  if (overlayWindow && overlaySettings.enabled) {
    overlayWindow.webContents.send('music-update', lastMusicData);
  }
});


let lastLevelSent = 0;
ipcMain.on('overlay-music-level', (event, level) => {
  const now = Date.now();
  if (now - lastLevelSent < 50) return;
  lastLevelSent = now;
  if (overlayWindow && overlaySettings.enabled && overlayReady) {
    overlayWindow.webContents.send('music-level', level);
  }
});


ipcMain.on('overlay-voice-update', (event, participants) => {
  if (!overlayWindow || !overlaySettings.enabled) return;
  if (!overlayReady) return;
  if (participants && participants.length > 0) {
    if (!overlayWindow.isVisible()) {
      overlayWindow.showInactive();
      if (process.platform === 'linux') setTimeout(() => applyNativeClickThrough(), 150);
    }
    overlayWindow.webContents.send('voice-update', participants);
  } else if (!overlayEditMode) {
    overlayWindow.hide();
  }
});


ipcMain.on('overlay-ping-update', (event, ping) => {
  if (!overlayWindow || !overlaySettings.enabled) return;
  if (!overlayReady) return;
  overlayWindow.webContents.send('ping-update', ping);
});

ipcMain.on('overlay-set-enabled', (event, enabled) => {
  console.log('🔧 overlay-set-enabled called with:', enabled);
  overlaySettings.enabled = enabled;
  saveOverlaySettings();

  if (!enabled) {
    if (overlayWindow) {
      overlayWindow.removeAllListeners();
      overlayWindow.destroy();
      overlayWindow = null;
      console.log('💥 overlay window destroyed');
    }
  } else {
    if (!overlayWindow) {
      createOverlayWindow();
      console.log('🆕 overlay window recreated');
    }
  }
});


ipcMain.handle('overlay-get-info', () => {
  const { width, height } = screen.getPrimaryDisplay().bounds;
  return {
    screenWidth: width,
    screenHeight: height,
    x: overlaySettings.x ?? 20,
    y: overlaySettings.y ?? 420,
    enabled: overlaySettings.enabled
  };
});


ipcMain.on('overlay-reset-position', (event) => {
  overlaySettings.x = null;
  overlaySettings.y = null;
  saveOverlaySettings();
  if (overlayWindow) {
    overlayWindow.webContents.send('reposition', { x: 20, y: 420 });
  }
});

ipcMain.on('overlay-save-position', (event, pos) => {
  overlaySettings.x = pos.x;
  overlaySettings.y = pos.y;
  saveOverlaySettings();
  if (overlayWindow) overlayWindow.webContents.send('reposition', pos);
});
