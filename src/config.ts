import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const GITHUB_APP_ID = required("GITHUB_APP_ID");
export const GITHUB_APP_PRIVATE_KEY = required(
  "GITHUB_APP_PRIVATE_KEY",
).replace(/\\n/g, "\n");
const hasPkcs8Markers =
  GITHUB_APP_PRIVATE_KEY.includes("-----BEGIN PRIVATE KEY-----") &&
  GITHUB_APP_PRIVATE_KEY.includes("-----END PRIVATE KEY-----");
const hasRsaMarkers =
  GITHUB_APP_PRIVATE_KEY.includes("-----BEGIN RSA PRIVATE KEY-----") &&
  GITHUB_APP_PRIVATE_KEY.includes("-----END RSA PRIVATE KEY-----");
if (!hasPkcs8Markers && !hasRsaMarkers) {
  throw new Error(
    "GITHUB_APP_PRIVATE_KEY must be a valid PEM private key with matching BEGIN/END markers.",
  );
}
export const ENCRYPTION_KEY = required("ENCRYPTION_KEY");
export const DATABASE_PATH = required("DATABASE_PATH");
export const PORT = parseInt(required("PORT"), 10);
