import crypto from "node:crypto";
import { ENCRYPTION_KEY, ENCRYPTION_SALT } from "../config.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const MAX_BODY_LENGTH = 50_000;
const DERIVED_KEY = crypto.scryptSync(ENCRYPTION_KEY, ENCRYPTION_SALT, 32);

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, DERIVED_KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // iv:tag:ciphertext, all base64
  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decrypt(packed: string): string {
  const [ivB64, tagB64, dataB64] = packed.split(":");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv(ALGORITHM, DERIVED_KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final("utf8");
}

export function truncateForStorage(obj: unknown): string {
  const json = JSON.stringify(obj);
  if (json.length <= MAX_BODY_LENGTH) {
    return json;
  }

  return JSON.stringify({
    truncated: true,
    originalLength: json.length,
    preview: json.slice(0, MAX_BODY_LENGTH),
  });
}
