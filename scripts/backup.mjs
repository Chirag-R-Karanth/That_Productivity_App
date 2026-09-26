#!/usr/bin/env node
/**
 * That Productivity App — database backup tooling.
 *
 * Commands:
 *   node scripts/backup.mjs backup            create a timestamped pg_dump + row-count snapshot
 *   node scripts/backup.mjs verify [file]     check the given backup (default: newest) against
 *                                             the row-count snapshot recorded at backup time
 *   node scripts/backup.mjs list              list existing backups
 *
 * The database the deployed app uses runs in a docker container; this script prefers
 * `docker exec`, falling back to host `pg_dump`/`psql` when the container is absent.
 * No third-party dependencies. Connection settings come from the root `.env`.
 *
 * Which database is production is NOT something to guess: this repo has had two
 * postgres containers up at once, one of them the deployed app's and one a dev
 * copy, and a silent fallback to the dev copy produces a backup, a row-count
 * snapshot and a green "IDENTICAL" that all describe the wrong data. So the
 * container is resolved explicitly, the resolved target is printed on every run,
 * and `DB_CONTAINER` overrides it.
 *
 * Data safety: a backup is a full SQL dump (plain format) plus a `.meta.json`
 * sidecar recording per-table row counts and a SHA-256 of the dump. `verify` diffs the
 * current database counts against that snapshot, so a restore can be proven complete.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BACKUP_DIR = join(ROOT, "deploy", "backups");

/**
 * Containers this app's database has lived in, most-current first. The first
 * one that is actually running wins, so a renamed or re-created container does
 * not need a code change — but an explicit `DB_CONTAINER` still beats both.
 */
const KNOWN_CONTAINERS = ["prodapp-postgres-1", "productivity-db"];

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

function loadRootEnv() {
  const path = join(ROOT, ".env");
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function dbConnection() {
  loadRootEnv();
  const urlRaw = process.env.DATABASE_URL;
  if (!urlRaw) throw new Error("DATABASE_URL is not set (checked root .env)");
  const url = new URL(urlRaw);
  const user = decodeURIComponent(url.username || "postgres");
  const password = decodeURIComponent(url.password || "");
  const host = url.hostname || "localhost";
  const port = url.port || "5432";
  const db = decodeURIComponent((url.pathname || "/").slice(1));
  return { user, password, host, port, db };
}

const PGPASSWORD_ENV = (pass) => ({ ...process.env, PGPASSWORD: pass });

// ---------------------------------------------------------------------------
// Docker detection
// ---------------------------------------------------------------------------

let cachedContainer;

/**
 * Which container holds the database to back up, or null to use host tools.
 *
 * Resolved once and printed, because "which database did that actually capture"
 * is the one question a backup cannot answer from its own output otherwise.
 */
async function resolveContainer() {
  if (cachedContainer !== undefined) return cachedContainer;
  const forced = process.env.DB_CONTAINER;
  let running = [];
  try {
    const out = await execCapture("docker", ["ps", "--format", "{{.Names}}"], {});
    running = out.split("\n").map((l) => l.trim()).filter(Boolean);
  } catch {
    running = [];
  }
  if (forced) {
    if (!running.includes(forced)) {
      throw new Error(
        `DB_CONTAINER=${forced} is not running. Set it to a container that is up, ` +
          `or unset it to fall back to the host tools in .env.`,
      );
    }
    cachedContainer = forced;
  } else {
    cachedContainer = KNOWN_CONTAINERS.find((name) => running.includes(name)) ?? null;
  }
  return cachedContainer;
}

/** A one-line description of the database this run will touch. */
function describeTarget(conn, container) {
  return container
    ? `container ${container} database ${conn.db}`
    : `host ${conn.host}:${conn.port} database ${conn.db} (from DATABASE_URL)`
      + `\nwarning: no known database container is running, so this fell back to the`
      + `\n         host connection in .env. If that is not the deployed database,`
      + `         this backup describes the wrong data.`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function execCapture(cmd, args, env, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => reject(e));
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`${cmd} exited ${code}: ${stderr.trim()}`));
      else resolve(stdout);
    });
  });
}

function execStream(cmd, args, env, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env,
      stdio: ["ignore", "pipe", process.stderr],
      ...opts,
    });
    let stdout = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.on("error", (e) => reject(e));
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} exited ${code}`));
    });
  });
}

const TABLES = [
  ["users", "users"],
  ["tasks", "tasks"],
  ["courses", "courses"],
  ["attendance_records", "attendance_records"],
  ["calendar_events", "calendar_events"],
  ["pomodoro_sessions", "pomodoro_sessions"],
  ["linked_google_calendars", "linked_google_calendars"],
  ["PendingSync", '"PendingSync"'],
  ["push_subscriptions", "push_subscriptions"],
];

function countQuery() {
  const parts = TABLES.map(
    ([label, expr]) => `SELECT '${label}', count(*) FROM ${expr}`,
  );
  return parts.join(" UNION ALL ");
}

function parseCounts(psqlOut) {
  const counts = {};
  for (const line of psqlOut.split("\n")) {
    const parts = line.split("|").map((s) => s.trim());
    if (parts.length === 2 && /^\d+$/.test(parts[1])) counts[parts[0]] = Number(parts[1]);
  }
  return counts;
}

function sha256(filePath) {
  const data = readFileSync(filePath);
  return createHash("sha256").update(data).digest("hex");
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function pgDumpArgs(conn, container) {
  if (container) {
    return {
      cmd: "docker",
      args: [
        "exec",
        "-e",
        `PGPASSWORD=${conn.password}`,
        container,
        "pg_dump",
        "-U",
        conn.user,
        "-d",
        conn.db,
        "--no-owner",
        "--no-privileges",
      ],
      env: {},
    };
  }
  return {
    cmd: "pg_dump",
    args: [
      "--username", conn.user,
      "--host", conn.host,
      "--port", conn.port,
      "--dbname", conn.db,
      "--no-owner",
      "--no-privileges",
    ],
    env: PGPASSWORD_ENV(conn.password),
  };
}

async function psqlArgs(conn, sql, container) {
  if (container) {
    return {
      cmd: "docker",
      args: [
        "exec", "-e", `PGPASSWORD=${conn.password}`, container,
        "psql", "-U", conn.user, "-d", conn.db, "-t", "-A", "-F|", "-c", sql,
      ],
      env: {},
    };
  }
  return {
    cmd: "psql",
    args: [
      "--username", conn.user,
      "--host", conn.host,
      "--port", conn.port,
      "--dbname", conn.db,
      "--tuples-only", "--no-align", "--field-separator=|", "-c", sql,
    ],
    env: PGPASSWORD_ENV(conn.password),
  };
}

async function currentCounts(conn, container) {
  const { cmd, args, env } = await psqlArgs(conn, countQuery(), container);
  const out = await execCapture(cmd, args, env);
  return parseCounts(out);
}

async function backup(conn, container) {
  const stamp = timestamp();
  const file = join(BACKUP_DIR, `productivity-${stamp}.sql`);
  if (!existsSync(BACKUP_DIR)) {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const { cmd, args, env } = await pgDumpArgs(conn, container);
  const dump = await execCapture(cmd, args, env);
  writeFileSync(file, dump, "utf8");

  const counts = await currentCounts(conn, container);
  const meta = {
    file: file,
    createdAt: new Date().toISOString(),
    container,
    tables: counts,
    sha256: sha256(file),
    bytes: Buffer.byteLength(dump, "utf8"),
  };
  writeFileSync(`${file}.meta.json`, JSON.stringify(meta, null, 2) + "\n", "utf8");

  process.stdout.write(
    `backed up ${conn.db} -> ${file}\ncounts: ${JSON.stringify(counts)}\nsha256: ${meta.sha256}\n`,
  );
  return meta;
}

async function verify(conn, container, target) {
  const candidates = readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .reverse();
  const file = target ?? join(BACKUP_DIR, candidates[0] ?? "");
  if (!existsSync(file)) {
    throw new Error(`backup file not found: ${file}`);
  }
  const metaPath = `${file}.meta.json`;
  if (!existsSync(metaPath)) {
    throw new Error(`no snapshot (.meta.json) for ${file} — cannot verify row counts`);
  }
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));

  // Comparing a snapshot taken of one database against another one is the exact
  // failure this script exists to prevent, and it produces a confident "no
  // differences" when it happens. The dump itself records which container it
  // came from, so the two can be required to match.
  const tookIn = meta.container ?? (meta.viaContainer ? "productivity-db" : null);
  if ((tookIn ?? null) !== (container ?? null)) {
    throw new Error(
      [
        `refusing to verify: this snapshot was taken of ${tookIn ? `container ${tookIn}` : "a host connection"},`,
        `but this run is pointed at ${container ? `container ${container}` : "a host connection"}.`,
        "Those are different databases, so every row count below would be meaningless.",
        "Either point at the right one (DB_CONTAINER=...) or verify the other file by path:",
        "  node scripts/backup.mjs verify deploy/backups/<file>.sql",
      ].join("\n"),
    );
  }

  const size = statSync(file).size;
  const hash = sha256(file);
  const integrityOk = hash === meta.sha256;
  const counts = await currentCounts(conn, container);

  const changed = {};
  for (const key of Object.keys({ ...meta.tables, ...counts })) {
    const a = meta.tables[key] ?? 0;
    const b = counts[key] ?? 0;
    if (a !== b) changed[key] = { atBackup: a, now: b };
  }

  process.stdout.write(`backup: ${file}\n`);
  process.stdout.write(`size: ${size} bytes (${(size / 1024).toFixed(1)} KiB)\n`);
  process.stdout.write(`sha256: ${hash}\n`);
  process.stdout.write(`integrity: ${integrityOk ? "OK (matches snapshot)" : "MISMATCH"}\n`);
  process.stdout.write(
    `row counts: ${Object.keys(changed).length === 0 ? "IDENTICAL to backup snapshot" : JSON.stringify(changed)}\n`,
  );
  return { integrityOk, changed };
}

async function listBackups() {
  if (!existsSync(BACKUP_DIR)) {
    process.stdout.write("no backups yet\n");
    return;
  }
  const files = readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (files.length === 0) {
    process.stdout.write("no backups yet\n");
    return;
  }
  for (const f of files) {
    const p = join(BACKUP_DIR, f);
    process.stdout.write(`  ${f}  ${(statSync(p).size / 1024).toFixed(1)} KiB\n`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (!cmd) {
    process.stdout.write("usage: node scripts/backup.mjs <backup|verify [file]|list>\n");
    process.exitCode = 1;
    return;
  }

  if (cmd === "list") {
    await listBackups();
    return;
  }

  const conn = dbConnection();
  const container = await resolveContainer();
  // Printed before anything else happens, and printed on every command, so a
  // backup or a verify can never be mistaken for one about the other database.
  process.stdout.write(`target: ${describeTarget(conn, container)}\n`);

  try {
    if (cmd === "backup") {
      await backup(conn, container);
    } else if (cmd === "verify") {
      const { integrityOk, changed } = await verify(conn, container, arg);
      if (!integrityOk || Object.keys(changed).length > 0) process.exitCode = 1;
    } else {
      process.stdout.write(`unknown command: ${cmd}\n`);
      process.exitCode = 1;
    }
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    process.exitCode = 1;
  }
}

main();