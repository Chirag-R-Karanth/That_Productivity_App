import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

const rootEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env");
if (fs.existsSync(rootEnv)) {
  config({ path: rootEnv });
}

/**
 * A separate database for `migrate diff` and `migrate dev` to build and throw
 * away a shadow of the schema.
 *
 * Derived from DATABASE_URL by renaming the database rather than read from its
 * own variable, so it can only ever be a sibling of the real one. A tool that
 * replays migrations must never be pointed at the database it is checking.
 */
function shadowDatabaseUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    const name = parsed.pathname.replace(/^\//, "");
    if (!name) return undefined;
    parsed.pathname = `/${name}_shadow`;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL,
    shadowDatabaseUrl: shadowDatabaseUrl(process.env.DATABASE_URL),
  },
});
