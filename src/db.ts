import Database, { type Database as DatabaseType } from "better-sqlite3";
import { DATABASE_PATH } from "./config.js";

export const DB_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    githubId TEXT UNIQUE NOT NULL,
    githubLogin TEXT NOT NULL,
    principalKeyHash TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agentKeys (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prefix TEXT NOT NULL,
    keyHash TEXT UNIQUE NOT NULL,
    permissions TEXT NOT NULL DEFAULT '{}',
    createdAt INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_agentKeys_keyHash ON agentKeys(keyHash);
  CREATE INDEX IF NOT EXISTS idx_agentKeys_userId ON agentKeys(userId);

  CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    agentKeyId TEXT NOT NULL REFERENCES agentKeys(id) ON DELETE CASCADE,
    encryptedRequest TEXT NOT NULL,
    encryptedResponse TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_requests_userId ON requests(userId);
  CREATE INDEX IF NOT EXISTS idx_requests_agentKeyId ON requests(agentKeyId);
`;

export function initializeDb(db: DatabaseType): void {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(DB_SCHEMA);
  const userColumns = db.prepare("PRAGMA table_info(users)").all() as Array<{ name: string }>;
  const hasLegacyPrincipalColumn = userColumns.some((column) => column.name === "principleKeyHash");
  const hasPrincipalColumn = userColumns.some((column) => column.name === "principalKeyHash");
  if (hasLegacyPrincipalColumn && !hasPrincipalColumn) {
    db.exec("ALTER TABLE users RENAME COLUMN principleKeyHash TO principalKeyHash");
  }
}

export const db: DatabaseType = new Database(DATABASE_PATH);

initializeDb(db);
