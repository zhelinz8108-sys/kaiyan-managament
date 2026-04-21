import "dotenv/config";

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const MIGRATION_TABLE = "__app_migrations";
const LEGACY_BASELINE_MIGRATIONS = [
  "202604190001_init_phase1",
  "202604190002_room_economics",
  "202604190003_room_area",
  "202604190004_room_property_fee",
  "202604200001_room_management_assignment",
];

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

function migrationNames() {
  const migrationsDir = path.resolve(process.cwd(), "prisma", "migrations");
  return fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function ensureMigrationTable(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS "${MIGRATION_TABLE}" (
      "name" TEXT NOT NULL PRIMARY KEY,
      "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function tableExists(db: DatabaseSync, tableName: string) {
  const statement = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
    LIMIT 1;
  `);

  return Boolean(statement.get(tableName));
}

function appliedMigrationNames(db: DatabaseSync) {
  const statement = db.prepare(`SELECT name FROM "${MIGRATION_TABLE}" ORDER BY name ASC;`);
  return new Set(statement.all().map((row) => String((row as { name: string }).name)));
}

function markLegacyBaselineMigrations(db: DatabaseSync, migrations: string[]) {
  const applied = appliedMigrationNames(db);
  if (applied.size > 0 || !tableExists(db, "Property")) {
    return;
  }

  const knownLegacyMigrations = LEGACY_BASELINE_MIGRATIONS.filter((name) => migrations.includes(name));
  if (knownLegacyMigrations.length === 0) {
    return;
  }

  const insert = db.prepare(`INSERT OR IGNORE INTO "${MIGRATION_TABLE}" ("name") VALUES (?);`);
  for (const migration of knownLegacyMigrations) {
    insert.run(migration);
  }
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

  const sqlFiles = migrationPaths();
  const migrationDirectories = migrationNames();
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON;");
  ensureMigrationTable(db);
  markLegacyBaselineMigrations(db, migrationDirectories);

  const applied = appliedMigrationNames(db);
  const insertMigration = db.prepare(`INSERT INTO "${MIGRATION_TABLE}" ("name") VALUES (?);`);

  let appliedCount = 0;
  for (const [index, sqlFile] of sqlFiles.entries()) {
    const migrationName = migrationDirectories[index];
    if (!migrationName || applied.has(migrationName)) {
      continue;
    }

    const sql = fs.readFileSync(sqlFile, "utf8");
    db.exec("BEGIN;");
    try {
      db.exec(sql);
      insertMigration.run(migrationName);
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }

    appliedCount += 1;
  }

  if (appliedCount === 0) {
    console.log(`Database already up to date at ${databasePath}`);
  } else {
    console.log(`Database initialized at ${databasePath} with ${appliedCount} migration(s)`);
  }

  db.close();
}

main();
