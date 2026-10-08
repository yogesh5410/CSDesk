import express from "express";
import dotenv from "dotenv";
import { testSupabaseConnection } from "./supabaseClient.js";
import { requireAuth } from "./middleware/requireAuth.js";
import optimizationRoutes from "./routes/optimizationRoutes.js";
import taRoutes from "./routes/taRoutes.js";

dotenv.config();

const app = express();
app.use(express.json({ limit: "2mb" }));

// The client may be served from another origin once deployed (see
// VITE_API_BASE_URL). In development it stays same-origin through the Vite
// proxy, so this is a no-op there.
const ALLOWED_ORIGINS = (process.env.CLIENT_ORIGIN || "")
  .split(",").map((o) => o.trim()).filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.get("/", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/supabase-check", async (req, res) => {
  try {
    await testSupabaseConnection();
    res.json({ connected: true });
  } catch (error) {
    res.status(500).json({ connected: false, error: error.message });
  }
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.use("/api/optimization", optimizationRoutes);
app.use("/api/ta", taRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  try {
    await testSupabaseConnection();
    console.log("Connected to Supabase");
  } catch (error) {
    console.error("Supabase connection failed:", error.message);
  }
});
