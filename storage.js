const fs = require("fs");
const path = require("path");

function writeJsonSync(file, obj) {
  const data = JSON.stringify(obj, null, 2);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  let fd;
  try {
    fd = fs.openSync(tmp, "w");
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    if (fs.existsSync(file)) {
      try { fs.copyFileSync(file, file + ".bak"); } catch {}
    }
    fs.renameSync(tmp, file);
  } catch (e) {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
    try { fs.unlinkSync(tmp); } catch {}
    throw e;
  }
}

function readJsonSafe(file, fallback) {
  const tryRead = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

  if (!fs.existsSync(file) && !fs.existsSync(file + ".bak")) return fallback;

  try {
    return tryRead(file);
  } catch (e) {
    console.error(`❌ ${file} unreadable: ${e.message}`);
    if (fs.existsSync(file)) {
      const quarantined = `${file}.corrupt-${Date.now()}`;
      try { fs.renameSync(file, quarantined); console.error(`   moved to ${quarantined}`); } catch {}
    }
    try {
      const data = tryRead(file + ".bak");
      console.warn(`⚠️ Recovered ${file} from .bak`);
      return data;
    } catch {
      console.error(`💥 No usable backup for ${file}. Restore from ./backups with "node restore.js", or delete the quarantined file to start fresh.`);
      process.exit(1);
    }
  }
}

const savers = [];

function createSaver(file, getData, delayMs = 1000) {
  let timer = null;
  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    try { writeJsonSync(file, getData()); }
    catch (e) { console.error(`❌ Failed to save ${file}:`, e); }
  };
  const save = () => { if (!timer) timer = setTimeout(flush, delayMs); };
  const pending = () => !!timer;
  const s = { save, flush, pending };
  savers.push(s);
  return s;
}

function flushAll() {
  savers.forEach(s => { if (s.pending()) s.flush(); });
}

["SIGINT", "SIGTERM"].forEach(sig => process.on(sig, () => { flushAll(); process.exit(0); }));
process.on("exit", flushAll);

function pad(n) {
  return String(n).padStart(2, "0");
}

function backupName(d = new Date()) {
  const h = d.getHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(h12)}-${pad(d.getMinutes())}-${pad(d.getSeconds())} ${ampm}`;
}

function parseBackupTime(name) {
  let m = name.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2})-(\d{2})-(\d{2}) (AM|PM)$/);
  if (m) {
    let h = Number(m[4]) % 12;
    if (m[7] === "PM") h += 12;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, Number(m[5]), Number(m[6])).getTime();
  }
  m = name.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/);
  if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]), Number(m[7]));
  return 0;
}

function listBackups(backupDir) {
  if (!fs.existsSync(backupDir)) return [];
  return fs.readdirSync(backupDir)
    .filter(d => !d.startsWith("before-restore"))
    .sort((a, b) => parseBackupTime(a) - parseBackupTime(b));
}

function startBackups({ dataDir, backupDir, everyMs = 60 * 60 * 1000, keep = 48 }) {
  fs.mkdirSync(backupDir, { recursive: true });
  const run = () => {
    flushAll();
    const stamp = backupName();
    const dest = path.join(backupDir, stamp);
    try {
      fs.cpSync(dataDir, dest, { recursive: true });
      const all = listBackups(backupDir);
      all.slice(0, Math.max(0, all.length - keep)).forEach(d =>
        fs.rmSync(path.join(backupDir, d), { recursive: true, force: true })
      );
      console.log(`💾 Backup created: ${stamp}`);
    } catch (e) {
      console.error("❌ Backup failed:", e);
    }
  };
  run();
  return setInterval(run, everyMs);
}

module.exports = { writeJsonSync, readJsonSafe, createSaver, flushAll, startBackups, backupName, listBackups };
