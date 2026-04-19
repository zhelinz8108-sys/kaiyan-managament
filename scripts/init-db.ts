import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

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

function migrationPaths() {
  const migrationsDir = path.resolve(process.cwd(), "prisma", "migrations");
  const directories = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (directories.length === 0) {
    throw new Error("No migration directories found");
  }

  return directories.map((directory) => path.join(migrationsDir, directory, "migration.sql"));
}

function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const databasePath = resolveDatabasePath(databaseUrl);
  const shouldReset = process.argv.includes("--reset");

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  if (shouldReset && fs.existsSync(databasePath)) {
    fs.rmSync(databasePath);
  }

  if (fs.existsSync(databasePath) && !shouldReset) {
    console.log(`Database already exists at ${databasePath}`);
    return;
  }

  const sqlFiles = migrationPaths();
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON;");
  for (const sqlFile of sqlFiles) {
    const sql = fs.readFileSync(sqlFile, "utf8");
    db.exec(sql);
  }
  db.close();

  console.log(`Database initialized at ${databasePath}`);
}

main();
