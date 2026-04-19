import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

loadEnv({ path: path.join(ROOT_DIR, ".env") });
loadEnv({ path: path.join(ROOT_DIR, ".test.env"), override: true });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const TEST_GITHUB_TOKEN = required("TEST_GITHUB_TOKEN");
export const TEST_GITHUB_REPO = required("TEST_GITHUB_REPO");
export const TEST_GITHUB_EMAIL = required("TEST_GITHUB_EMAIL");
export const TEST_DATABASE_PATH = required("DATABASE_PATH");
