import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

const rootEnv = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env");
if (fs.existsSync(rootEnv)) {
  config({ path: rootEnv });
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});