#!/usr/bin/env node
/**
 * Versioned GALEEN PostgreSQL migrations.
 * Automatic only in Vercel production; manual via npm run db:migrate.
 */
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const auto = process.argv.includes("--auto");
const statusOnly = process.argv.includes("--status");

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("GALEEN migrations: --auto (production only), --status, or no flags (apply explicitly).");
  process.exit(0);
}
const valid = new Set(["--auto", "--status"]);
if (process.argv.slice(2).some(arg => !valid.has(arg)) || (auto && statusOnly)) {
  console.error("[galeen:migrate] Invalid arguments.");
  process.exit(2);
}
if (auto) {
  if (process.env.VERCEL !== "1" || process.env.VERCEL_ENV !== "production") {
    console.log("[galeen:migrate] Preview or local build; migration skipped.");
    process.exit(0);
  }
  const branch = process.env.VERCEL_GIT_COMMIT_REF;
  if (branch && branch !== "main") {
    console.error("[galeen:migrate] Migration refused: non-main ref.");
    process.exit(1);
  }
}

const connectionString = process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[galeen:migrate] Missing Neon database connection variable.");
  process.exit(1);
}

const migrationDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
const names = (await readdir(migrationDir)).filter(
  name => /^[0-9]{3,}_[a-z0-9_]+\.sql$/.test(name)
).sort();
if (!names.length) {
  console.error("[galeen:migrate] No SQL migration files.");
  process.exit(1);
}
const migrations = await Promise.all(names.map(async name => {
  const sql = await readFile(path.join(migrationDir, name), "utf8");
  if (/(^|\n)\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im.test(sql)) {
    throw new Error("SQL migration contains transaction control: " + name);
  }
  const checksum = createHash("sha256").update(sql).digest("hex");
  return { name, sql, checksum };
}));

const client = new Client({ connectionString, connectionTimeoutMillis: 15000 });
let inTransaction = false;
try {
  await client.connect();
  await client.query("BEGIN");
  inTransaction = true;
  await client.query("SET LOCAL lock_timeout = '20s'");
  await client.query("SET LOCAL statement_timeout = '120s'");
  await client.query("SELECT pg_advisory_xact_lock(1195460174, 1163284052)");
  await client.query(
    "CREATE TABLE IF NOT EXISTS public.galeen_schema_migrations (" +
    "filename text PRIMARY KEY, " +
    "checksum char(64) NOT NULL, " +
    "applied_at timestamptz NOT NULL DEFAULT now())"
  );
  const { rows } = await client.query(
    "SELECT filename, checksum FROM public.galeen_schema_migrations ORDER BY filename"
  );
  const done = new Map(rows.map(r => [r.filename, r.checksum.trim()]));
  const present = new Set(migrations.map(m => m.name));
  for (const name of done.keys()) {
    if (!present.has(name)) throw new Error("Previously applied migration was removed: " + name);
  }
  let count = 0;
  for (const migration of migrations) {
    if (done.has(migration.name)) {
      if (done.get(migration.name) !== migration.checksum) {
        throw new Error("Applied SQL migration has changed: " + migration.name);
      }
      console.log("[galeen:migrate] Already applied: " + migration.name);
      continue;
    }
    if (statusOnly) {
      console.log("[galeen:migrate] Pending: " + migration.name);
      continue;
    }
    console.log("[galeen:migrate] Applying: " + migration.name);
    await client.query(migration.sql);
    await client.query(
      "INSERT INTO public.galeen_schema_migrations (filename, checksum) VALUES ($1, $2)",
      [migration.name, migration.checksum]
    );
    count++;
  }
  if (statusOnly) {
    await client.query("ROLLBACK");
    inTransaction = false;
    console.log("[galeen:migrate] Status verified.");
  } else {
    await client.query("COMMIT");
    inTransaction = false;
    console.log("[galeen:migrate] Complete. Applied " + count + " migration(s).");
  }
} catch (err) {
  if (inTransaction) {
    try { await client.query("ROLLBACK"); } catch {}
  }
  const code = err?.code ? String(err.code).slice(0,8) : "unknown";
  const message = String(err?.message || "Migration error");
  const safeMessage = /password|credential|authentication|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|certificate/i.test(message)
    ? "Database connection/authentication failure" : message.slice(0,250);
  console.error("[galeen:migrate] Failed (" + code + "): " + safeMessage);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
