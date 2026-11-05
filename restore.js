const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { backupName, listBackups } = require("./storage");

const backupDir = path.join(__dirname, "backups");
const dataDir = path.join(__dirname, "data");

const backups = listBackups(backupDir).reverse();
if (!backups.length) { console.log("No backups found."); process.exit(1); }

console.log("Available backups (newest first):\n");
backups.slice(0, 20).forEach((b, i) => console.log(`  [${i}] ${b}`));

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("\nNumber to restore (make sure the server is STOPPED): ", (ans) => {
  const pick = backups[Number(ans)];
  if (!pick) { console.log("Invalid choice."); return rl.close(); }

  const safety = path.join(backupDir, `before-restore ${backupName()}`);
  if (fs.existsSync(dataDir)) fs.cpSync(dataDir, safety, { recursive: true });

  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.cpSync(path.join(backupDir, pick), dataDir, { recursive: true });
  console.log(`✅ Restored ${pick}. Previous data saved to ${safety}. Start the server again.`);
  rl.close();
});
