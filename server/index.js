import express from "express";
import dotenv from "dotenv";
import { testSupabaseConnection } from "./supabaseClient.js";
import { requireAuth } from "./middleware/requireAuth.js";

dotenv.config();

const app = express();
app.use(express.json());

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
