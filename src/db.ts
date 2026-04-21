import Database, { type Database as DatabaseType } from "better-sqlite3";
import { DATABASE_PATH } from "./config.js";

export const DB_SCHEMA = `
  CREATE TABLE IF NOT EXISTS principalKeys (
    id TEXT PRIMARY KEY,
    githubId TEXT UNIQUE NOT NULL,
    keyHash TEXT NOT NULL,
    githubLogin TEXT,
    createdAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agentKeys (
    id TEXT PRIMARY KEY,
    principalKeyId TEXT NOT NULL REFERENCES principalKeys(id) ON DELETE CASCADE,
    prefix TEXT NOT NULL,
    keyHash TEXT UNIQUE NOT NULL,
    permissions TEXT NOT NULL DEFAULT '{}',
    createdAt INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_agentKeys_keyHash ON agentKeys(keyHash);
  CREATE INDEX IF NOT EXISTS idx_agentKeys_principalKeyId ON agentKeys(principalKeyId);

  CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    agentKeyId TEXT NOT NULL REFERENCES agentKeys(id) ON DELETE CASCADE,
    encryptedRequest TEXT NOT NULL,
    encryptedResponse TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_requests_agentKeyId ON requests(agentKeyId);
`;

export function initializeDb(db: DatabaseType): void {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(DB_SCHEMA);
}

export const db: DatabaseType = new Database(DATABASE_PATH);

initializeDb(db);
