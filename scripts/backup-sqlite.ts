import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

function resolveDatabasePath(databaseUrl: string) {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error(`Unsupported DATABASE_URL: ${databaseUrl}`);
  }

  const raw = databaseUrl.slice("file:".length);
  if (raw.startsWith("/")) {
    return raw;
  }

  return path.resolve(process.cwd(), "prisma", raw.replace(/^\.\/?/, ""));
}

function parseArg(flag: string) {
  const argv = process.argv.slice(2);
  const index = argv.findIndex((item) => item === flag || item.startsWith(`${flag}=`));
  if (index === -1) {
    return null;
  }

  const current = argv[index];
  if (current.includes("=")) {
    return current.split("=").slice(1).join("=");
  }

  return argv[index + 1] ?? null;
}

function timestamp() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ];

  return `${parts[0]}${parts[1]}${parts[2]}-${parts[3]}${parts[4]}${parts[5]}`;
}

function pruneBackups(backupDir: string, keepCount: number) {
  const entries = fs
    .readdirSync(backupDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".db"))
    .map((entry) => ({
      name: entry.name,
      fullPath: path.join(backupDir, entry.name),
      mtime: fs.statSync(path.join(backupDir, entry.name)).mtimeMs,
    }))
    .sort((left, right) => right.mtime - left.mtime);

  for (const staleEntry of entries.slice(keepCount)) {
    fs.rmSync(staleEntry.fullPath, { force: true });
  }
}

function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const databasePath = resolveDatabasePath(databaseUrl);
  if (!fs.existsSync(databasePath)) {
    throw new Error(`Database file not found: ${databasePath}`);
  }

  const label = (parseArg("--label") ?? "manual").trim().replace(/[^a-zA-Z0-9_-]+/g, "-");
  const keepCount = Number.parseInt(process.env.SQLITE_BACKUP_KEEP_COUNT ?? "30", 10);
  const normalizedKeepCount = Number.isFinite(keepCount) && keepCount > 0 ? keepCount : 30;
  const backupDir = path.resolve(
    process.cwd(),
    process.env.SQLITE_BACKUP_DIR?.trim() || "prisma/backups",
  );

  fs.mkdirSync(backupDir, { recursive: true });
  const backupName = `${path.basename(databasePath, ".db")}-${label}-${timestamp()}.db`;
  const backupPath = path.join(backupDir, backupName);
  fs.copyFileSync(databasePath, backupPath);
  pruneBackups(backupDir, normalizedKeepCount);

  console.log(`SQLite backup created at ${backupPath}`);
}

main();
