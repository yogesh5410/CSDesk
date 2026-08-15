import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env",
  );
}

// Default options: detectSessionInUrl stays on (true) so the client
// auto-completes the OAuth redirect, whether Supabase returns it as a
// ?code= (PKCE) or a #access_token= (implicit) — handling both is exactly
// what this built-in does, so there's no reason to reimplement it.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const ALLOWED_EMAIL_DOMAIN =
  import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN || "iitbhilai.ac.in";

export function isAllowedEmail(email) {
  return (
    typeof email === "string" &&
    email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN.toLowerCase()}`)
  );
}
