import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { supabase } from "../supabaseClient.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { parseCsvObjects, toCsv } from "../lib/csv.js";
import { replaceTable as replaceTableTx } from "../lib/replaceTable.js";

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OPT_DIR = path.join(__dirname, "..", "optimization");
const PYTHON = path.join(OPT_DIR, "venv", "bin", "python");

const upload = multer({
  dest: "/tmp/csdesk-uploads/",
  limits: { fileSize: 25 * 1024 * 1024 },
});

router.use(requireAuth);

/* ------------------------------------------------------------------ *
 * Table catalogue -- drives both the CSV importers and the UI preview
 * ------------------------------------------------------------------ */
export const TABLES = {
  courses: {
    label: "Courses",
    source: "List of courses (PDF)",
    columns: ["course_code", "course_name", "discipline", "program",
              "lecture_slot", "tutorial_slot", "lab_slot", "instructors"],
    orderBy: "course_code",
  },
  timetable: {
    label: "Common Timetable",
    source: "Common Time Table (PDF)",
    columns: ["day", "start_time", "end_time", "theory_slot", "lab_slot"],
    orderBy: "id",
  },
  ta_details: {
    label: "TA Details",
    source: "CSV upload",
    columns: ["roll_no", "name", "program", "thesis_supervisor", "email"],
    required: ["roll_no", "name"],
    orderBy: "roll_no",
  },
  course_registration: {
    label: "Course Registration",
    source: "CSV upload",
    columns: ["student_roll_no", "course_code"],
    required: ["student_roll_no", "course_code"],
    orderBy: "id",
  },
  ta_requirements: {
    label: "TA Requirements",
    source: "CSV upload",
    columns: ["course_code", "tas_required", "preferred_ta_rolls"],
    required: ["course_code", "tas_required"],
    numeric: ["tas_required"],
    orderBy: "course_code",
  },
  users: {
    label: "Users",
    source: "Seeded",
    columns: ["email", "name", "role"],
    orderBy: "email",
    readOnly: true,
  },
};

function runPython(script, args, { input, onLine } = {}) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(PYTHON)) {
      return reject(new Error(
        "Python environment missing. Run:  cd server/optimization && " +
        "python3 -m venv venv && ./venv/bin/pip install ortools"));
    }
    const proc = spawn(PYTHON, [script, ...args], { cwd: OPT_DIR });
    let out = "", err = "", buf = "";

    proc.stdout.on("data", (chunk) => {
      out += chunk;
      if (!onLine) return;
      buf += chunk;
      const lines = buf.split("\n");
      buf = lines.pop();
      lines.filter(Boolean).forEach(onLine);
    });
    if (input !== undefined) { proc.stdin.write(input); }
    proc.stdin.end();

    proc.stderr.on("data", (c) => { err += c; });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (buf.trim() && onLine) onLine(buf.trim());
      if (code !== 0 && !out.trim()) {
        return reject(new Error(err.trim() || `exited with code ${code}`));
      }
      resolve(out);
    });
  });
}

/** Replace a table's entire contents -- every upload is a whole-file load.
 *  Transactional where the direct DB connection is configured, so a rejected
 *  row leaves the previous data intact. */
async function replaceTable(table, rows, keyColumn) {
  const { inserted } = await replaceTableTx(table, rows, keyColumn, Object.keys(TABLES));
  return inserted;
}

const cleanup = (file) => { try { fs.unlinkSync(file.path); } catch { /* gone */ } };

/* ------------------------------------------------------------------ *
 * PDF uploads
 * ------------------------------------------------------------------ */
router.post("/upload/courses-pdf", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  try {
    const out = await runPython("parse_courses.py", [req.file.path]);
    const parsed = JSON.parse(out);
    if (parsed.error) throw new Error(parsed.error);
    if (!parsed.courses?.length) {
      throw new Error("No CSE courses found -- is this the course list PDF?");
    }
    const n = await replaceTable("courses", parsed.courses, "course_code");
    res.json({ table: "courses", inserted: n, skipped: parsed.skipped,
               message: `${n} CSE courses stored (${parsed.skipped} non-CSE rows ignored).` });
  } catch (e) {
    res.status(400).json({ error: e.message });
  } finally { cleanup(req.file); }
});

router.post("/upload/timetable-pdf", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  try {
    const out = await runPython("parse_timetable.py", [req.file.path]);
    const parsed = JSON.parse(out);
    if (parsed.error) throw new Error(parsed.error);
    if (!parsed.rows?.length) throw new Error("No timetable grid found in this PDF.");
    await replaceTable("timetable", parsed.rows, "day");
    res.json({ table: "timetable", inserted: parsed.rows.length,
               periods: parsed.periods.length,
               message: `${parsed.rows.length} cells stored across ${parsed.periods.length} periods x 5 days.` });
  } catch (e) {
    res.status(400).json({ error: e.message });
  } finally { cleanup(req.file); }
});

/* ------------------------------------------------------------------ *
 * CSV uploads
 * ------------------------------------------------------------------ */
router.post("/upload/csv/:table", upload.single("file"), async (req, res) => {
  const name = req.params.table;
  const spec = TABLES[name];
  if (!spec || spec.readOnly) return res.status(400).json({ error: `Unknown table '${name}'` });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const objects = parseCsvObjects(fs.readFileSync(req.file.path, "utf8"));
    if (!objects.length) throw new Error("The CSV has no data rows.");

    const header = Object.keys(objects[0]);
    const missing = spec.columns.filter((c) => !header.includes(c));
    if (missing.length) {
      throw new Error(
        `Missing column(s): ${missing.join(", ")}. Expected header: ${spec.columns.join(",")}`);
    }

    const rows = [], problems = [];
    const seen = new Set();
    objects.forEach((o, i) => {
      const line = i + 2;
      const row = {};
      for (const c of spec.columns) row[c] = o[c] ?? "";
      for (const c of spec.required || []) {
        if (!row[c]) problems.push(`row ${line}: '${c}' is empty`);
      }
      for (const c of spec.numeric || []) {
        const v = Number(row[c]);
        if (!Number.isInteger(v) || v <= 0) problems.push(`row ${line}: '${c}' must be a positive whole number`);
        else row[c] = v;
      }
      // de-duplicate on the natural key so a repeated row cannot break the insert
      const key = name === "course_registration"
        ? `${row.student_roll_no}|${row.course_code}`
        : row[spec.orderBy] ?? JSON.stringify(row);
      if (seen.has(key)) { problems.push(`row ${line}: duplicate of an earlier row, ignored`); return; }
      seen.add(key);
      if (!(spec.required || []).some((c) => !row[c])) rows.push(row);
    });

    if (!rows.length) throw new Error(`No valid rows. ${problems.slice(0, 3).join("; ")}`);

    const keyCol = spec.columns[0];
    const n = await replaceTable(name, rows, keyCol);
    res.json({
      table: name, inserted: n, rejected: objects.length - n,
      problems: problems.slice(0, 10),
      message: `${n} row(s) stored${problems.length ? `, ${problems.length} row(s) skipped` : ""}.`,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  } finally { cleanup(req.file); }
});

/* ------------------------------------------------------------------ *
 * Preview
 * ------------------------------------------------------------------ */
router.get("/tables", async (_req, res) => {
  const out = {};
  for (const [name, spec] of Object.entries(TABLES)) {
    const { count, error } = await supabase
      .from(name).select("*", { count: "exact", head: true });
    out[name] = {
      label: spec.label, source: spec.source, columns: spec.columns,
      readOnly: !!spec.readOnly, count: error ? 0 : count ?? 0,
      error: error ? error.message : null,
    };
  }
  res.json({ tables: out });
});

router.get("/table/:name", async (req, res) => {
  const spec = TABLES[req.params.name];
  if (!spec) return res.status(404).json({ error: "Unknown table" });
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  const offset = Number(req.query.offset) || 0;
  const search = (req.query.q || "").trim();

  let q = supabase.from(req.params.name)
    .select(spec.columns.join(","), { count: "exact" })
    .order(spec.orderBy, { ascending: true })
    .range(offset, offset + limit - 1);

  if (search) {
    const escaped = search.replace(/[%,()]/g, " ");
    q = q.or(spec.columns.map((c) => `${c}.ilike.%${escaped}%`).join(","));
  }
  const { data, count, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ columns: spec.columns, rows: data, total: count ?? 0, limit, offset });
});


/* ------------------------------------------------------------------ *
 * Run the allocator.  Streams newline-delimited JSON so the UI can show
 * live phase/progress instead of a spinner.
 * ------------------------------------------------------------------ */
const ALL = { from: 0, to: 49999 };

async function loadAll(table, columns, orderBy) {
  const { data, error } = await supabase
    .from(table).select(columns.join(",")).order(orderBy, { ascending: true })
    .range(ALL.from, ALL.to);
  if (error) throw new Error(`reading ${table}: ${error.message}`);
  return data || [];
}

router.post("/allocate", async (req, res) => {
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (obj) => res.write(JSON.stringify(obj) + "\n");

  try {
    send({ type: "progress", phase: "loading", pct: 3, detail: "reading tables from the database" });

    const [courses, timetable, taDetails, registrations, requirements] = await Promise.all([
      loadAll("courses", TABLES.courses.columns, "course_code"),
      loadAll("timetable", TABLES.timetable.columns, "id"),
      loadAll("ta_details", TABLES.ta_details.columns, "roll_no"),
      loadAll("course_registration", TABLES.course_registration.columns, "id"),
      loadAll("ta_requirements", TABLES.ta_requirements.columns, "course_code"),
    ]);

    const blockers = [];
    if (!requirements.length) blockers.push("TA Requirements is empty -- nothing to allocate");
    if (!taDetails.length) blockers.push("TA Details is empty -- no one to allocate");
    if (!timetable.length) blockers.push("Common Timetable is empty -- cannot detect clashes");
    if (!courses.length) blockers.push("Courses is empty -- cannot resolve course slots");
    if (blockers.length) {
      send({ type: "result", status: "ERROR", message: blockers.join(". ") + ".",
             allocations: [], unfilled: [], starved: [], stats: {} });
      return res.end();
    }

    const payload = JSON.stringify({
      courses, timetable, ta_details: taDetails, registrations, requirements,
      max_courses_per_ta: Number(req.body?.max_courses_per_ta) || 1,
    });

    let final = null;
    await runPython("ta_solver.py", [], {
      input: payload,
      onLine: (line) => {
        let msg;
        try { msg = JSON.parse(line); } catch { return; }
        if (msg.type === "result") final = msg;
        send(msg);
      },
    });

    if (!final) {
      send({ type: "result", status: "ERROR", message: "Solver produced no result.",
             allocations: [], unfilled: [], starved: [], stats: {} });
      return res.end();
    }

    // persist the run so it can be reopened and downloaded later
    if (final.status !== "ERROR") {
      const { data: run, error: runErr } = await supabase
        .from("allocation_runs")
        .insert({ status: final.status,
                  summary: { ...final.stats, unfilled: final.unfilled, starved: final.starved } })
        .select().single();

      if (runErr) {
        send({ type: "warning", message: `Result not saved: ${runErr.message}` });
      } else {
        const rows = final.allocations.map((a) => ({
          run_id: run.id, course_code: a.course_code, ta_roll_no: a.ta_roll_no,
          ta_name: a.ta_name, ta_program: a.ta_program,
          is_preferred: a.is_preferred, is_supervisor: a.is_supervisor,
        }));
        for (let i = 0; i < rows.length; i += 500) {
          await supabase.from("allocations").insert(rows.slice(i, i + 500));
        }
        send({ type: "saved", run_id: run.id });
      }
    }
    res.end();
  } catch (e) {
    send({ type: "result", status: "ERROR", message: e.message,
           allocations: [], unfilled: [], starved: [], stats: {} });
    res.end();
  }
});

router.get("/runs", async (_req, res) => {
  const { data, error } = await supabase.from("allocation_runs")
    .select("id, created_at, status, summary")
    .order("id", { ascending: false }).limit(20);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ runs: data });
});

router.get("/runs/:id/allocations", async (req, res) => {
  const { data, error } = await supabase.from("allocations")
    .select("course_code, ta_roll_no, ta_name, ta_program, is_preferred, is_supervisor")
    .eq("run_id", req.params.id).order("course_code", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ allocations: data });
});

const EXPORT_COLUMNS = ["course_code", "course_name", "instructors", "ta_roll_no",
                        "ta_name", "ta_program", "is_preferred", "is_supervisor"];

router.get("/runs/:id/export.csv", async (req, res) => {
  const [{ data: rows, error }, { data: courses }] = await Promise.all([
    supabase.from("allocations").select("*").eq("run_id", req.params.id)
      .order("course_code", { ascending: true }),
    supabase.from("courses").select("course_code, course_name, instructors"),
  ]);
  if (error) return res.status(500).json({ error: error.message });
  const byCode = Object.fromEntries((courses || []).map((c) => [c.course_code, c]));
  const enriched = (rows || []).map((r) => ({
    ...r,
    course_name: byCode[r.course_code]?.course_name || "",
    instructors: byCode[r.course_code]?.instructors || "",
  }));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition",
                `attachment; filename="ta-allocation-run-${req.params.id}.csv"`);
  res.send(toCsv(EXPORT_COLUMNS, enriched));
});

export default router;
export { runPython, TABLES as taTables };
