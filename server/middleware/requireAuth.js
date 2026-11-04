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

  // Resolve user role from public.users table (admin, faculty, ta, student)
  try {
    const { data: dbUser } = await supabase
      .from("users")
      .select("email, name, role")
      .eq("email", email)
      .maybeSingle();

    if (dbUser) {
      req.user.role = dbUser.role || "student";
      req.user.name = dbUser.name || data.user.user_metadata?.full_name || email.split("@")[0];
    } else {
      // Default fallback for any domain account not explicitly assigned
      req.user.role = "student";
      req.user.name = data.user.user_metadata?.full_name || email.split("@")[0];
    }
  } catch (err) {
    req.user.role = "student";
  }

  // Developer testing override: allow switching role dynamically via X-Simulate-Role / X-Simulate-User
  const simulatedRole = req.headers["x-simulate-role"];
  if (simulatedRole && ["admin", "faculty", "ta", "student"].includes(simulatedRole.toLowerCase())) {
    req.user.role = simulatedRole.toLowerCase();
  }

  const simulatedUserEmail = req.headers["x-simulate-user"];
  if (simulatedUserEmail) {
    try {
      const cleanEmail = simulatedUserEmail.toLowerCase().trim();
      const { data: simUser } = await supabase
        .from("users")
        .select("email, name, role")
        .eq("email", cleanEmail)
        .maybeSingle();

      if (simUser) {
        req.user.email = simUser.email;
        req.user.name = simUser.name;
        req.user.role = simUser.role;
      } else {
        req.user.email = cleanEmail;
      }
    } catch {
      // ignore
    }
  }

  next();
}
