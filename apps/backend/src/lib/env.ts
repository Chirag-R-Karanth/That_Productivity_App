import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { config } from "dotenv";

const rootEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../.env");
// Only load the root .env when present (containers/CI inject env directly).
if (fs.existsSync(rootEnv)) {
  config({ path: rootEnv });
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT) || 4000,
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  // OAuth redirect_uri. Defaults to the webAppUrl origin + callback path (prod:
  // nginx proxies /api/* to the backend). Set GOOGLE_REDIRECT_URI explicitly
  // when the backend is NOT behind the same origin as the web app (e.g. local
  // dev with backend on :4000: http://localhost:4000/api/auth/google/callback).
  googleRedirectUri:
    process.env.GOOGLE_REDIRECT_URI ?? `${process.env.WEB_APP_URL ?? "http://localhost:3000"}/api/auth/google/callback`,
  // Known browser origin of the web app — OAuth callbacks redirect back here.
  webAppUrl: process.env.WEB_APP_URL ?? "http://localhost:3000",
  // Where server-side snapshots (backups + pre-restore safety copies) live.
  // Defaults to a local ./snapshots dir; mount a volume in Docker.
  snapshotsDir: process.env.PRODAPP_SNAPSHOTS_DIR ?? path.resolve(process.cwd(), "snapshots"),
  fcmProjectId: process.env.FCM_PROJECT_ID ?? "",
  fcmPrivateKey: process.env.FCM_PRIVATE_KEY ?? "",
  fcmClientEmail: process.env.FCM_CLIENT_EMAIL ?? "",
} as const;