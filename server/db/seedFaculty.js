/**
 * Seeds public.users with the CSE faculty from "Test data/faculty.csv",
 * each with role = 'faculty'.
 *
 *   npm run seed:faculty
 *
 * Idempotent: re-running upserts on the email primary key, so it refreshes
 * names without creating duplicates.  Uses the server's secret key, which
 * bypasses RLS.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { supabase } from "../supabaseClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV = path.join(__dirname, "..", "..", "Test data", "faculty.csv");
const ROLE = "faculty";

function parseCsv(text) {
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const cols = header.split(",").map((c) => c.trim());
  return lines
    .filter((l) => l.trim())
    .map((line) => Object.fromEntries(
      line.split(",").map((v, i) => [cols[i], v.trim()]),
    ));
}

async function main() {
  const rows = parseCsv(fs.readFileSync(CSV, "utf8"));

  const users = [];
  for (const r of rows) {
    const email = (r.email || "").toLowerCase();
    const name = r.name || "";
    if (!email || !name) {
      console.warn(`  skipped (missing email or name): ${JSON.stringify(r)}`);
      continue;
    }
    users.push({ email, name, role: ROLE });
  }

  console.log(`Seeding ${users.length} faculty from ${path.basename(CSV)} ...`);

  const { data, error } = await supabase
    .from("users")
    .upsert(users, { onConflict: "email" })
    .select();

  if (error) {
    if (error.code === "PGRST205") {
      console.error(
        "\npublic.users does not exist yet. Run this first in the Supabase " +
        "SQL editor:\n  server/db/migrations/001_create_users.sql\n",
      );
    } else {
      console.error("\nSeed failed:", error.message);
    }
    process.exit(1);
  }

  console.log(`Upserted ${data.length} rows.`);
  const { count } = await supabase
    .from("users")
    .select("*", { count: "exact", head: true })
    .eq("role", ROLE);
  console.log(`public.users now holds ${count} user(s) with role '${ROLE}'.`);
}

main();
