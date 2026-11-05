const { app, BrowserWindow, Menu, Tray, shell, desktopCapturer, dialog, screen, ipcMain, nativeImage, Notification, net, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
let lastMusicData = null;
const { autoUpdater } = require('electron-updater');
const { exec } = require('child_process');
const util = require('util');
const STREAMING_APP_HINTS = ['fossflix'];
const isStreamingApp = (s) => !!s && STREAMING_APP_HINTS.some(h => s.toLowerCase().includes(h));
const BROWSER_HINTS = ['chromium', 'chrome', 'firefox', 'brave', 'edge', 'vivaldi', 'opera', 'librewolf', 'plasma-browser-integration'];
const isBrowserSource = (s) => !!s && BROWSER_HINTS.some(h => s.toLowerCase().includes(h));
const MUSIC_APP_ALLOWLIST = ['neonkat'];

function getProcessName(pid) {
  if (!pid) return '';
  try {
    const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').toLowerCase();
    const comm = fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim().toLowerCase();
    return `${comm} ${cmdline}`;
  } catch {
    return '';
  }
}

function isAllowlistedMusicApp(dest) {
  const pid = dest.match(/instance_?(\d+)/i)?.[1];
  const info = getProcessName(pid ? parseInt(pid, 10) : null);
  return MUSIC_APP_ALLOWLIST.some(n => info.includes(n));
}
const execAsync = util.promisify(exec);const { execSync } = require('child_process');
//if (process.platform === 'linux') {
  //app.commandLine.appendSwitch('ozone-platform', 'x11');
//}
//app.commandLine.appendSwitch('ozone-platform', 'x11');
//app.commandLine.appendSwitch('disable-features', 'VaapiVideoDecoder,VaapiVideoEncoder');
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
let overlaySettings = { enabled: true, x: null, y: null, displayId: null };
try {
  overlaySettings = { ...overlaySettings, ...JSON.parse(fs.readFileSync(overlayConfigPath, 'utf8')) };
} catch (e) {
  console.log('⚠️ No saved overlay settings found, using defaults:', e.message);
}

function getOverlayDisplay() {
  const displays = screen.getAllDisplays();
  if (overlaySettings.displayId != null) {
    const match = displays.find(d => d.id === overlaySettings.displayId);
    if (match) return match;
  }
  return screen.getPrimaryDisplay();
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
    { label: 'Quit', click: () => { mainWindow.destroy(); app.quit(); } }
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
  mainWindow.setIcon(buildWindowIconWithBadge(safeCount));
}
});

const SHARE_SINK = 'r00ted_share';
let linuxShareState = null;
let relinkTimer = null;

async function cleanupShareModules() {
  const { stdout } = await execAsync('pactl list short modules');
  for (const line of stdout.split('\n')) {
    if (line.includes('r00ted_share')) {
      await execAsync(`pactl unload-module ${line.split('\t')[0]}`).catch(() => {});
    }
  }
}

const OWN_BINARY = path.basename(process.execPath).toLowerCase();
function isExcludedStream(props) {
  const pid = Number(props['application.process.id']);
  if (pid && isOwnProcess(pid)) return true;
  const bin = (props['application.process.binary'] || '').toLowerCase();
  const name = (props['application.name'] || '').toLowerCase();
  if (bin === OWN_BINARY || name.includes('r00ted')) return true;
  if (/easyeffects|r00ted_share/.test(name) || /easyeffects/.test(bin)) return true;
  return false;
}

async function linkAllStreams() {
  const { stdout } = await execAsync('pw-dump', { maxBuffer: 64 * 1024 * 1024 });
  const objs = JSON.parse(stdout);
  const nodes = objs.filter(o => o.type === 'PipeWire:Interface:Node');
  const ports = objs.filter(o => o.type === 'PipeWire:Interface:Port');

  const sink = nodes
    .filter(n => n.info?.props?.['node.name'] === SHARE_SINK)
    .sort((a, b) => b.info.props['object.serial'] - a.info.props['object.serial'])[0];
  if (!sink) return;

  const ins = ports.filter(p => p.info?.props?.['node.id'] === sink.id && p.info.props['port.direction'] === 'in');

  const streams = nodes.filter(n =>
    n.info?.props?.['media.class'] === 'Stream/Output/Audio' &&
    !isExcludedStream(n.info.props)
  );

  for (const stream of streams) {
    const outs = ports.filter(p => p.info?.props?.['node.id'] === stream.id && p.info.props['port.direction'] === 'out');
    for (const o of outs) {
      const ch = o.info.props['audio.channel'];
      const targets = ch === 'MONO' ? ins : ins.filter(p => p.info.props['audio.channel'] === ch);
      for (const t of targets) {
        await execAsync(`pw-link ${o.id} ${t.id}`).catch(() => {});
      }
    }
  }
}

ipcMain.handle('linux-audio-share-start', async () => {
  await cleanupShareModules();

  const nullModule = (await execAsync(
    `pactl load-module module-null-sink sink_name=${SHARE_SINK} sink_properties=device.description=R00TED-Share-Sink`
  )).stdout.trim();
  const remapModule = (await execAsync(
    `pactl load-module module-remap-source master=${SHARE_SINK}.monitor source_name=r00ted_share_src source_properties=device.description=R00TED-Share`
  )).stdout.trim();

  await linkAllStreams().catch(err => console.warn('link failed:', err.message));
  clearInterval(relinkTimer);
  relinkTimer = setInterval(() => linkAllStreams().catch(() => {}), 2000);

  linuxShareState = { nullModule, remapModule };
  return linuxShareState;
});

ipcMain.handle('linux-audio-share-stop', async (e, state) => {
  clearInterval(relinkTimer);
  relinkTimer = null;
  const s = state || linuxShareState;
  if (s) {
    for (const m of [s.remapModule, s.nullModule]) {
      if (m) await execAsync(`pactl unload-module ${m}`).catch(() => {});
    }
  }
  linuxShareState = null;
});

app.on('before-quit', () => {
  clearInterval(relinkTimer);
  if (!linuxShareState) return;
  for (const m of [linuxShareState.remapModule, linuxShareState.nullModule]) {
    try { if (m) execSync(`pactl unload-module ${m}`); } catch {}
  }
});


ipcMain.handle('copy-to-clipboard', (event, text) => {
  try {
    clipboard.writeText(text);
    return true;
  } catch (e) {
    console.error('Clipboard write failed:', e);
    return false;
  }
});

ipcMain.on('overlay-music-update', (event, musicData) => {
  lastMusicData = musicData; 
  if (!overlayWindow || !overlaySettings.enabled) return;
  if (!overlayReady) return;
  overlayWindow.webContents.send('music-update', musicData);
});

ipcMain.on('show-notification', async (event, { title, body, icon, url, tag, silent, requireInteraction }) => {
  if (!Notification.isSupported()) return;

  const fallbackIcon = nativeImage.createFromPath(path.join(__dirname, '../public/r00ted.png'));
  let notifIcon = fallbackIcon;

  if (icon && icon.startsWith('http')) {
    try {
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
      if (!callbackCalled) { callbackCalled = true; callback({
        video: sources[response],
        ...(process.platform === 'win32' ? { audio: 'loopback' } : {})
    }); }
    } catch (err) {
      console.error('Screen share error:', err.message);
      if (!callbackCalled) { callbackCalled = true; callback({ video: false }); }
    }
  });

  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['display-capture', 'media', 'microphone', 'camera', 'screen-wake-lock', 'notifications', 'fullscreen', 'clipboard-read', 'clipboard-write'];
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
  setupAutoUpdater();
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


async function fetchArtViaItunes(title, artist) {
  try {
    const term = encodeURIComponent(`${title} ${artist || ''}`.trim());
    const response = await net.fetch(
      `https://itunes.apple.com/search?term=${term}&entity=song&limit=1`
    );
    const data = await response.json();
    const result = data.results?.[0];
    if (!result?.artworkUrl100) return null;
    return result.artworkUrl100.replace('100x100bb', '512x512bb');
  } catch (e) {
    return null;
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged || !CONFIG.updateUrl) return;

  autoUpdater.setFeedURL({ provider: 'generic', url: CONFIG.updateUrl });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', (info) => {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      title: 'Update ready',
      message: `R00TED ${info.version} has been downloaded.`
    }).then(({ response }) => {
      if (response !== 0) return;
      if (overlayWindow) overlayWindow.destroy();
      mainWindow.destroy();
      autoUpdater.quitAndInstall(false, true);
    });
  });

  autoUpdater.on('error', (err) => console.error('Updater error:', err.message));

  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, 4 * 60 * 60 * 1000);
}

async function loadGamesConfig() {
  try {
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
        ? 'powershell -NoProfile -NonInteractive -Command "Get-CimInstance Win32_Process | ForEach-Object { if ($_.ExecutablePath) { $_.ExecutablePath } else { $_.Name } }"'
        : 'ps -eo args=',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 10000 }
    );
    return raw.split('\n').map(l => l.replace(/\\/g, '/').trim().toLowerCase()).filter(Boolean);
  } catch (e) {
    console.warn('getRunningProcesses failed:', e.message);
    return [];
  }
}

function normDir(p) {
  const s = String(p || '').replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
  return s.length > 5 ? s + '/' : null;
}

let installedCache = { time: 0, list: [] };

function getInstalledWindowsGames() {
  if (process.platform !== 'win32') return [];
  if (Date.now() - installedCache.time < 5 * 60 * 1000) return installedCache.list;

  const list = [];

  try {
    const dir = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests';
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.item'))) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        const d = normDir(j.InstallLocation);
        if (j.DisplayName && d) list.push({ name: j.DisplayName, dir: d });
      } catch {}
    }
  } catch {}

 
  try {
    const known = new Set(Object.values(MANUAL_GAMES).map(n => String(n).toLowerCase()));
    const raw = execSync(
      `powershell -NoProfile -NonInteractive -Command "Get-ItemProperty 'HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -and $_.InstallLocation } | Select-Object DisplayName,InstallLocation | ConvertTo-Json -Compress"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 15000 }
    );
    for (const a of [].concat(JSON.parse(raw.trim() || '[]'))) {
      const d = normDir(a.InstallLocation);
      if (d && known.has(String(a.DisplayName).toLowerCase())) list.push({ name: a.DisplayName, dir: d });
    }
  } catch (e) {
    console.warn('registry scan failed:', e.message);
  }

  installedCache = { time: Date.now(), list };
  return list;
}

function getWindowTitles() {
  if (process.platform !== 'win32') return [];
  try {
    const raw = execSync(
      'powershell -NoProfile -NonInteractive -Command "Get-Process | Where-Object { $_.MainWindowTitle -and $_.Id -ne ' + process.pid + ' -and $_.ProcessName -notmatch \'chrome|firefox|msedge|brave|opera|vivaldi|explorer\' } | ForEach-Object { $_.MainWindowTitle }"',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], timeout: 10000 }
    );
    return raw.split('\n').map(l => l.trim().toLowerCase()).filter(Boolean);
  } catch { return []; }
}

function matchByWindowTitle(titles) {
  for (const [key, name] of Object.entries(MANUAL_GAMES)) {
    const k = key.toLowerCase();
    if (k.startsWith('folder:') || k.startsWith('title:')) continue;

    const n = k.replace(/\.exe$/i, '');
    if (n.length < 4) continue;

    for (const t of titles) {
      if (t === n || t.startsWith(n + ' ') || t.startsWith(n + ' -') || t.startsWith(n + ':')) {
        return name;
      }
    }
  }
  return null;
}

ipcMain.on('get-running-games', (event) => {
  let result = null;
  try {
    const processPaths = getRunningProcesses().map(p => p.replace(/\\/g, '/'));

    for (const [installdir, { name }] of getInstalledSteamGames()) {
      if (name.toLowerCase().includes('proton') ||
          name.toLowerCase().includes('runtime') ||
          name.toLowerCase().includes('redistributable')) continue;
      if (processPaths.some(p => p.includes(`steamapps/common/${installdir}`.toLowerCase()))) {
        result = name;
        break;
      }
    }

  
    if (!result) {
      for (const g of getInstalledWindowsGames()) {
        if (processPaths.some(p => p.startsWith(g.dir))) { result = g.name; break; }
      }
    }

  
    if (!result) {
      const exeNames = new Set();
      for (const line of processPaths) {
        for (const m of line.matchAll(/([^\/\s"']+)\.exe\b/gi)) exeNames.add(m[1].toLowerCase());
        const first = line.split(/\s+/)[0];
        exeNames.add(path.basename(first).replace(/\.exe$/i, '').toLowerCase());
      }

      let titles = null;
      for (const [key, name] of Object.entries(MANUAL_GAMES)) {
        const k = key.toLowerCase();
        if (k.startsWith('folder:')) {
          const folder = k.slice(7).replace(/\\/g, '/');
          if (processPaths.some(p => p.includes(`/${folder}/`))) { result = name; break; }
        } else if (k.startsWith('title:')) {
          titles = titles || getWindowTitles();
          const t = k.slice(6);
          if (titles.some(w => w === t || w.includes(t))) { result = name; break; }
        } else if (exeNames.has(k.replace(/\.exe$/i, ''))) {
          result = name; break;
        }
      }
    }


    if (!result) result = matchByWindowTitle(getWindowTitles());
  } catch (e) {
    console.warn('get-running-games failed:', e.message);
  }

  event.reply('running-games-reply', result);
});

app.on('window-all-closed', () => {});

function isOwnProcess(pid) {
  if (!pid) return false;
  if (pid === process.pid) return true;
  try {
    let current = pid;
    for (let i = 0; i < 6; i++) { 
      const stat = fs.readFileSync(`/proc/${current}/stat`, 'utf8');
      const match = stat.match(/\)\s+\S\s+(\d+)/);
      const ppid = match ? parseInt(match[1], 10) : null;
      if (!ppid || ppid === 1) return false;
      if (ppid === process.pid) return true;
      current = ppid;
    }
    return false;
  } catch {
    return false;
  }
}

async function getLinuxNowPlaying() {
  const result = { music: null, browser: null, streaming: null };
  try {
    const { stdout: listOut } = await execAsync(
      `dbus-send --session --print-reply --dest=org.freedesktop.DBus /org/freedesktop/DBus org.freedesktop.DBus.ListNames`,
      { timeout: 2000 }
    );
    const players = [...listOut.matchAll(/"(org\.mpris\.MediaPlayer2\.[^"]+)"/g)].map(m => m[1]);
    const externalPlayers = players.filter(dest => {
      const pid = dest.match(/instance(\d+)/i)?.[1];
      return !isOwnProcess(pid ? parseInt(pid, 10) : null);
    });

    for (const dest of externalPlayers) {
      try {
        let source;
        try {
          const { stdout } = await execAsync(
            `dbus-send --session --print-reply --dest=${dest} /org/mpris/MediaPlayer2 org.freedesktop.DBus.Properties.Get string:'org.mpris.MediaPlayer2' string:'Identity'`,
            { timeout: 1500 }
          );
          source = stdout.match(/string "([^"]*)"/)?.[1];
        } catch {}
        if (!source) {
          const raw = dest.replace('org.mpris.MediaPlayer2.', '').split('.')[0];
          source = raw.charAt(0).toUpperCase() + raw.slice(1);
        }

        const { stdout: statusOut } = await execAsync(
          `dbus-send --session --print-reply --dest=${dest} /org/mpris/MediaPlayer2 org.freedesktop.DBus.Properties.Get string:'org.mpris.MediaPlayer2.Player' string:'PlaybackStatus'`,
          { timeout: 1500 }
        );
        if (!/string "Playing"/.test(statusOut)) continue;

        if (isStreamingApp(dest) || isStreamingApp(source)) {
        if (!result.streaming) {
          let title = null, artist = null, artUrl = null;
          try {
            const { stdout: mOut } = await execAsync(
              `dbus-send --session --print-reply --dest=${dest} /org/mpris/MediaPlayer2 org.freedesktop.DBus.Properties.Get string:'org.mpris.MediaPlayer2.Player' string:'Metadata'`,
              { timeout: 1500 }
            );
            title  = mOut.match(/"xesam:title"\s*\n\s*variant\s+string "([^"]*)"/)?.[1] || null;
            artist = mOut.match(/"xesam:artist"[\s\S]*?string "([^"]*)"/)?.[1] || null;
            artUrl = await normalizeArtUrl(mOut.match(/"mpris:artUrl"\s*\n\s*variant\s+string "([^"]*)"/)?.[1]);
          } catch {}
          result.streaming = { isPlaying: true, source, title, artist, artUrl };
        }
        continue;
      }

    if (!isAllowlistedMusicApp(dest) && (isBrowserSource(dest) || isBrowserSource(source))) {
      if (!result.browser || !result.browser.title) {
        let title = null, artist = null, artUrl = null;
        try {
          const { stdout: mOut } = await execAsync(
            `dbus-send --session --print-reply --dest=${dest} /org/mpris/MediaPlayer2 org.freedesktop.DBus.Properties.Get string:'org.mpris.MediaPlayer2.Player' string:'Metadata'`,
            { timeout: 1500 }
          );
          title  = mOut.match(/"xesam:title"\s*\n\s*variant\s+string "([^"]*)"/)?.[1] || null;
          artist = mOut.match(/"xesam:artist"[\s\S]*?string "([^"]*)"/)?.[1] || null;
          artUrl = await normalizeArtUrl(mOut.match(/"mpris:artUrl"\s*\n\s*variant\s+string "([^"]*)"/)?.[1]);
        } catch {}
        result.browser = { isPlaying: true, source, title, artist, artUrl };
      }
      continue;
    }

        const { stdout: out } = await execAsync(
          `dbus-send --session --print-reply --dest=${dest} /org/mpris/MediaPlayer2 org.freedesktop.DBus.Properties.Get string:'org.mpris.MediaPlayer2.Player' string:'Metadata'`,
          { timeout: 1500 }
        );
        const title  = out.match(/"xesam:title"\s*\n\s*variant\s+string "([^"]*)"/)?.[1];
        const artist = out.match(/"xesam:artist"[\s\S]*?string "([^"]*)"/)?.[1];
        let artUrl   = out.match(/"mpris:artUrl"\s*\n\s*variant\s+string "([^"]*)"/)?.[1];
        if (!title) continue;

        if (artUrl && !/^(https?|file):\/\//i.test(artUrl)) artUrl = null;
        if (artUrl?.startsWith('file://')) {
          try {
            const filePath = decodeURIComponent(artUrl.replace('file://', ''));
            const mime = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
            artUrl = `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
          } catch {
            artUrl = await fetchArtViaItunes(title, artist);
          }
        }
        result.music = { isPlaying: true, title, artist: artist || null, artUrl: artUrl || null, source };
      } catch { continue; }
    }
  } catch {}
  return result;
}

const NOW_PLAYING_PS1_CONTENT = `Add-Type -AssemblyName System.Runtime.WindowsRuntime

Function Await($WinRtTask, $ResultType) {
    $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
    })[0]
    $asTaskAsync = $asTask.MakeGenericMethod($ResultType)
    $netTask = $asTaskAsync.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    $netTask.Result
}

$browserHints = @('chrome', 'brave', 'edge', 'firefox', 'vivaldi', 'opera', 'msedge', 'librewolf')
$selfHints = @('r00ted', 'electron')

function Is-Browser($appId) {
    foreach ($hint in $browserHints) {
        if ($appId.ToLower().Contains($hint)) { return $true }
    }
    return $false
}

function Is-Self($appId) {
    foreach ($hint in $selfHints) {
        if ($appId.ToLower().Contains($hint)) { return $true }
    }
    return $false
}

[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null
$mgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])

$playing = $mgr.GetSessions() | Where-Object {
    [int]$_.GetPlaybackInfo().PlaybackStatus.value__ -eq 4 -and -not (Is-Self $_.SourceAppUserModelId)
}
$sorted = @($playing | Where-Object { -not (Is-Browser $_.SourceAppUserModelId) }) + @($playing | Where-Object { Is-Browser $_.SourceAppUserModelId })

$out = @($sorted | ForEach-Object {
    $props = Await ($_.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
    [PSCustomObject]@{
        isPlaying = $true
        title     = $props.Title
        artist    = $props.Artist
        appId     = $_.SourceAppUserModelId
    }
})
if ($out.Count -gt 0) { ConvertTo-Json -InputObject $out -Compress }
`;


const nowPlayingPs1Path = path.join(app.getPath('temp'), 'r00ted-now-playing.ps1');
fs.writeFileSync(nowPlayingPs1Path, NOW_PLAYING_PS1_CONTENT);

function ensureNowPlayingScript() {
  try {
    if (!fs.existsSync(nowPlayingPs1Path)) {
      fs.writeFileSync(nowPlayingPs1Path, NOW_PLAYING_PS1_CONTENT);
    }
  } catch (e) {
    console.error('Could not write now-playing script:', e.message);
    return false;
  }
  return true;
}


async function normalizeArtUrl(artUrl) {
  if (!artUrl || !/^(https?|file):\/\//i.test(artUrl)) return null;
  if (!artUrl.startsWith('file://')) return artUrl;
  try {
    const filePath = decodeURIComponent(artUrl.replace('file://', ''));
    const mime = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`;
  } catch {
    return null;
  }
}

async function getWindowsNowPlaying() {
  const result = { music: null, browser: null };
  if (!ensureNowPlayingScript()) return result;
  try {
    const { stdout: out } = await execAsync(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${nowPlayingPs1Path}"`,
      { timeout: 3000 }
    );

    const trimmed = out.trim();
    if (!trimmed) return result;

    const parsed = JSON.parse(trimmed);
    const sessions = (Array.isArray(parsed) ? parsed : [parsed]).filter(s => s && s.title);

    for (const data of sessions) {
      let rawApp = (data.appId || 'Unknown').split('!')[0];
      rawApp = rawApp.split(/[\\/]/).pop();
      rawApp = rawApp.replace(/\.exe$/i, '');
      const source = rawApp;

      if (isStreamingApp(data.appId)) {
        if (!result.streaming) {
          result.streaming = { isPlaying: true, source, title: data.title, artist: data.artist || null };
        }
        continue;
      }

      if (isBrowserSource(data.appId)) {
        if (!result.browser) {
          result.browser = { isPlaying: true, source, title: data.title, artist: data.artist || null };
        }
        continue;
      }

      if (!result.music) {
        const artUrl = await fetchArtViaItunes(data.title, data.artist);
        result.music = {
          isPlaying: true,
          title: data.title,
          artist: data.artist || null,
          artUrl,
          source
        };
      }
    }
  } catch (e) {
    console.error('getWindowsNowPlaying failed:', e.message);
  }
  return result;
}

async function getNativeNowPlaying() {
  if (process.platform === 'linux') return getLinuxNowPlaying();
  if (process.platform === 'win32') return await getWindowsNowPlaying();
  return null;
}

setInterval(async () => {
  const np = await getNativeNowPlaying();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('native-now-playing', np);
  }
}, 5000);


let overlayWindow = null;
let overlayReady = false;

function createOverlayWindow() {
  overlayReady = false;
  const { width, height, x, y } = getOverlayDisplay().bounds;

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
  const { width, height } = getOverlayDisplay().bounds;
  return {
    screenWidth: width,
    screenHeight: height,
    x: overlaySettings.x ?? 20,
    y: overlaySettings.y ?? 420,
    enabled: overlaySettings.enabled,
    displayId: getOverlayDisplay().id
  };
});


ipcMain.handle('overlay-list-displays', () => {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: `Display ${i + 1}${d.id === primaryId ? ' (primary)' : ''} - ${d.bounds.width}x${d.bounds.height}`,
    bounds: d.bounds
  }));
});

ipcMain.on('overlay-set-display', (event, displayId) => {
  overlaySettings.displayId = displayId;
  overlaySettings.x = null; 
  overlaySettings.y = null;
  saveOverlaySettings();

  if (overlayWindow) {
    const { x, y, width, height } = getOverlayDisplay().bounds;
    overlayWindow.setBounds({ x, y, width, height });
    overlayWindow.webContents.send('load-config', {
      serverUrl: CONFIG.serverUrl || 'http://127.0.0.1:5350/',
      position: { x: null, y: null },
      enabled: overlaySettings.enabled,
      version: app.getVersion()
    });
  }
});

ipcMain.handle('get-app-version', () => app.getVersion());

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
