/**
 * Applies the .sql files in db/migrations/ to the Supabase project.
 *
 *   npm run db:migrate
 *
 * Credentials come from .env. Schema changes (CREATE TABLE, RLS policies) are
 * not reachable through SUPABASE_KEY -- that key talks to PostgREST, which
 * only serves data. DDL needs one of these instead; the script uses whichever
 * it finds:
 *
 *   SUPABASE_DB_URL        full Postgres connection string
 *                          (Dashboard -> Project Settings -> Database ->
 *                           Connection string -> URI, with the password filled in)
 *
 *   SUPABASE_ACCESS_TOKEN  personal access token, starts with "sbp_"
 *                          (Dashboard -> Account -> Access Tokens)
 *
 * Migrations are written to be re-runnable, so applying them twice is safe.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

const { SUPABASE_URL, SUPABASE_DB_URL, SUPABASE_ACCESS_TOKEN } = process.env;

function loadMigrations() {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  return files.map((file) => ({
    file,
    sql: fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"),
  }));
}

/** Run the migrations over a direct Postgres connection. */
async function viaPostgres(migrations) {
  let pg;
  try {
    pg = await import("pg");
  } catch {
    throw new Error(
      "SUPABASE_DB_URL is set but the 'pg' driver is missing. Run: npm install pg",
    );
  }
  const client = new pg.default.Client({
    connectionString: SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    for (const { file, sql } of migrations) {
      await client.query(sql);
      console.log(`  applied ${file}`);
    }
  } finally {
    await client.end();
  }
}

/** Run the migrations through the Supabase Management API. */
async function viaManagementApi(migrations) {
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  for (const { file, sql } of migrations) {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${ref}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sql }),
      },
    );
    if (!res.ok) {
      throw new Error(
        `${file} failed (HTTP ${res.status}): ${(await res.text()).slice(0, 300)}`,
      );
    }
    console.log(`  applied ${file}`);
  }
}

async function main() {
  if (!SUPABASE_URL) throw new Error("SUPABASE_URL is missing from .env");

  const migrations = loadMigrations();
  if (!migrations.length) {
    console.log("No migrations found in db/migrations/.");
    return;
  }

  let run;
  if (SUPABASE_DB_URL) {
    console.log("Applying migrations over a direct Postgres connection ...");
    run = viaPostgres;
  } else if (SUPABASE_ACCESS_TOKEN) {
    console.log("Applying migrations through the Supabase Management API ...");
    run = viaManagementApi;
  } else {
    console.error(
      "\nNo credential in .env that can run schema changes.\n\n" +
        "SUPABASE_KEY cannot do this: it talks to PostgREST, which serves rows,\n" +
        "not DDL. Supabase keeps schema changes off the API keys that ship to\n" +
        "the browser on purpose.\n\n" +
        "Add ONE of these to server/.env, then re-run `npm run db:migrate`:\n\n" +
        "  SUPABASE_DB_URL=postgresql://postgres:<password>@<host>:5432/postgres\n" +
        "      Dashboard -> Project Settings -> Database -> Connection string -> URI\n" +
        "      (also run: npm install pg)\n\n" +
        "  SUPABASE_ACCESS_TOKEN=sbp_...\n" +
        "      Dashboard -> Account -> Access Tokens -> Generate new token\n\n" +
        "Or skip the script and paste db/migrations/001_create_users.sql into\n" +
        "the Supabase SQL Editor.\n",
    );
    process.exit(1);
  }

  await run(migrations);
  console.log(`\nDone: ${migrations.length} migration(s) applied.`);
}

main().catch((err) => {
  console.error(`\nMigration failed: ${err.message}\n`);
  process.exit(1);
});
