import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import ws from "ws";

dotenv.config();

const { SUPABASE_URL, SUPABASE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_KEY in .env");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { transport: ws },
});

export async function testSupabaseConnection() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: { apikey: SUPABASE_KEY },
  });
  if (!res.ok) {
    throw new Error(`Supabase responded with status ${res.status}`);
  }
}
