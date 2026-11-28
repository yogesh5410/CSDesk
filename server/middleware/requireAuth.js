import { supabase } from "../supabaseClient.js";

const ALLOWED_EMAIL_DOMAIN = (
  process.env.ALLOWED_EMAIL_DOMAIN || "iitbhilai.ac.in"
).toLowerCase();

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  // Developer testing override: allow switching role dynamically via X-Simulate-Role in non-production
  const simulatedRole = req.headers["x-simulate-role"];
  if (!token && simulatedRole && process.env.NODE_ENV !== "production") {
    req.user = {
      email: (req.headers["x-simulate-user"] || `dev-${simulatedRole}@${ALLOWED_EMAIL_DOMAIN}`).toLowerCase(),
      name: `Simulated ${simulatedRole}`,
      role: simulatedRole.toLowerCase(),
    };
    return next();
  }

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
        if (!simulatedRole) req.user.role = simUser.role;
      } else {
        req.user.email = cleanEmail;
      }
    } catch {
      // ignore
    }
  } else if (req.user.role === "faculty") {
    // If testing as faculty without explicit simulated user, ensure email belongs to a faculty
    try {
      const { data: isFac } = await supabase
        .from("users")
        .select("role")
        .eq("email", req.user.email)
        .maybeSingle();
      if (isFac?.role !== "faculty") {
        const { data: defaultFac } = await supabase
          .from("users")
          .select("email, name")
          .eq("role", "faculty")
          .order("name")
          .limit(1);
        if (defaultFac?.[0]) {
          req.user.email = defaultFac[0].email;
          req.user.name = defaultFac[0].name;
        }
      }
    } catch {
      // ignore
    }
  } else if (req.user.role === "ta") {
    try {
      const { data: isTa } = await supabase
        .from("users")
        .select("role")
        .eq("email", req.user.email)
        .maybeSingle();
      if (isTa?.role !== "ta") {
        const { data: defaultTa } = await supabase
          .from("users")
          .select("email, name")
          .eq("role", "ta")
          .order("name")
          .limit(1);
        if (defaultTa?.[0]) {
          req.user.email = defaultTa[0].email;
          req.user.name = defaultTa[0].name;
        }
      }
    } catch {
      // ignore
    }
  }

  next();
}
