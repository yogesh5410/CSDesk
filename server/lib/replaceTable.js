import pg from "pg";
import { supabase } from "../supabaseClient.js";

/**
 * Every upload is a whole-file load: the table's existing contents are
 * discarded and replaced by the uploaded rows.
 *
 * When SUPABASE_DB_URL is configured the delete and the inserts run inside one
 * transaction, so a bad row rolls the whole thing back and the previous data
 * survives. Without it we fall back to the REST client, which cannot span a
 * transaction -- there, a mid-insert failure leaves the table partially
 * loaded, and the caller is told so.
 */
export async function replaceTable(table, rows, keyColumn, allowed, semesterId = null) {
  if (!allowed.includes(table)) {
    throw new Error(`refusing to replace unknown table '${table}'`);
  }
  const scopedRows = (semesterId && table !== "users")
    ? rows.map((r) => ({ ...r, semester_id: semesterId }))
    : rows;

  if (process.env.SUPABASE_DB_URL) {
    return replaceAtomic(table, scopedRows, semesterId);
  }
  return replaceBestEffort(table, scopedRows, keyColumn, semesterId);
}

async function replaceAtomic(table, rows, semesterId) {
  const client = new pg.Client({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query("BEGIN");
    if (semesterId && table !== "users") {
      await client.query(`DELETE FROM public."${table}" WHERE semester_id = $1`, [semesterId]);
    } else {
      await client.query(`DELETE FROM public."${table}"`);
    }

    if (rows.length) {
      const columns = Object.keys(rows[0]);
      const quoted = columns.map((c) => `"${c}"`).join(", ");
      // keep each statement well under Postgres' 65535 parameter ceiling
      const perChunk = Math.max(1, Math.floor(5000 / columns.length));

      for (let i = 0; i < rows.length; i += perChunk) {
        const chunk = rows.slice(i, i + perChunk);
        const values = [];
        const placeholders = chunk.map((row, r) =>
          `(${columns.map((c, k) => {
            values.push(row[c]);
            return `$${r * columns.length + k + 1}`;
          }).join(", ")})`);
        await client.query(
          `INSERT INTO public."${table}" (${quoted}) VALUES ${placeholders.join(", ")}`,
          values);
      }
    }

    await client.query("COMMIT");
    return { inserted: rows.length, atomic: true };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw new Error(`${table} not changed -- upload rolled back: ${e.message}`);
  } finally {
    await client.end().catch(() => {});
  }
}

async function replaceBestEffort(table, rows, keyColumn, semesterId) {
  let delQuery = supabase.from(table).delete();
  if (semesterId && table !== "users") {
    delQuery = delQuery.eq("semester_id", semesterId);
  } else {
    delQuery = delQuery.not(keyColumn, "is", null);
  }
  const del = await delQuery;
  if (del.error) throw new Error(`clearing ${table}: ${del.error.message}`);

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + 500));
    if (error) {
      throw new Error(
        `inserting into ${table}: ${error.message}. The table was cleared before ` +
        `this failure, so it is now incomplete -- re-upload a corrected file.`);
    }
  }
  return { inserted: rows.length, atomic: false };
}
