import { supabase } from "../supabaseClient.js";

const ALLOWED_EMAIL_DOMAIN = (
  process.env.ALLOWED_EMAIL_DOMAIN || "iitbhilai.ac.in"
).toLowerCase();

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing authorization token" });
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  const email = (data.user.email || "").toLowerCase();
  if (!email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
    return res
      .status(403)
      .json({ error: `Access restricted to @${ALLOWED_EMAIL_DOMAIN} accounts` });
  }

  req.user = data.user;
  next();
}
