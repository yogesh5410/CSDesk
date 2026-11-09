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
const PYTHON = process.env.PYTHON_PATH || (fs.existsSync(path.join(OPT_DIR, "venv", "bin", "python")) ? path.join(OPT_DIR, "venv", "bin", "python") : "python3");

const upload = multer({
  dest: "/tmp/csdesk-uploads/",
  limits: { fileSize: 25 * 1024 * 1024 },
});

router.use(requireAuth);

router.get("/users/by-role", async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from("users")
      .select("email, name, role")
      .order("name");
    if (error) throw new Error(error.message);
    res.json({ users: users || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Access denied. Admin role required." });
  }
  next();
}

/* ------------------------------------------------------------------ *
 * Helper name matching for faculty role matching
 * ------------------------------------------------------------------ */
const TITLES = new Set(["dr", "prof", "mr", "ms", "mrs", "shri", "smt"]);
const PLACEHOLDERS = new Set(["dpgc", "dugc", "tba", "na", "none", ""]);

function tokenize(name) {
  const words = (name || "").toLowerCase().split(/[^a-z]+/);
  return words.filter((w) => w && !TITLES.has(w));
}

function levenshtein(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const cur = [i + 1];
    for (let j = 0; j < b.length; j++) {
      cur.push(Math.min(prev[j + 1] + 1, cur[j] + 1, prev[j] + (a[i] !== b[j] ? 1 : 0)));
    }
    prev = cur;
  }
  return prev[prev.length - 1];
}

function samePerson(a, b) {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.length || !tb.length) return false;
  if (ta.some((w) => PLACEHOLDERS.has(w)) || tb.some((w) => PLACEHOLDERS.has(w))) return false;
  if (ta.length === 1 || tb.length === 1) {
    return ta.some((w) => tb.includes(w));
  }
  if (levenshtein(ta[ta.length - 1], tb[tb.length - 1]) > 1) return false;
  const givenA = ta.slice(0, -1);
  const givenB = tb.slice(0, -1);
  return givenA.some((w) => givenB.includes(w));
}

function splitPeople(raw) {
  if (!raw) return [];
  const parts = raw.split(/,| and /);
  return parts
    .map((p) => p.trim())
    .filter((p) => p && !PLACEHOLDERS.has(p.toLowerCase()) && !/^(DPGC|DUGC)(_\w+)?$/i.test(p));
}

/* ------------------------------------------------------------------ *
 * Table catalogue -- drives both the CSV importers and the UI preview
 * ------------------------------------------------------------------ */
export const TABLES = {
  courses: {
    label: "Courses",
    source: "List of courses (PDF or CSV)",
    columns: ["course_code", "course_name", "discipline", "program",
              "lecture_slot", "tutorial_slot", "lab_slot", "instructors"],
    required: ["course_code", "course_name"],
    primaryKey: "course_code",
    orderBy: "course_code",
  },
  timetable: {
    label: "Common Timetable",
    source: "Common Time Table (PDF)",
    columns: ["day", "start_time", "end_time", "theory_slot", "lab_slot"],
    required: ["day", "start_time", "end_time"],
    primaryKey: "id",
    orderBy: "id",
  },
  ta_details: {
    label: "TA Details",
    source: "CSV upload",
    columns: ["roll_no", "name", "program", "thesis_supervisor", "email"],
    required: ["roll_no", "name"],
    primaryKey: "roll_no",
    orderBy: "roll_no",
  },
  course_registration: {
    label: "Course Registration",
    source: "CSV upload",
    columns: ["student_roll_no", "course_code"],
    required: ["student_roll_no", "course_code"],
    primaryKey: "id",
    orderBy: "id",
  },
  ta_requirements: {
    label: "TA Requirements",
    source: "CSV upload",
    columns: ["course_code", "tas_required", "preferred_ta_rolls"],
    required: ["course_code", "tas_required"],
    numeric: ["tas_required"],
    primaryKey: "course_code",
    orderBy: "course_code",
  },
  users: {
    label: "Users",
    source: "Seeded",
    columns: ["email", "name", "role"],
    primaryKey: "email",
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
 * PDF uploads (Admin only)
 * ------------------------------------------------------------------ */
router.post("/upload/courses-pdf", requireAdmin, upload.single("file"), async (req, res) => {
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

router.post("/upload/timetable-pdf", requireAdmin, upload.single("file"), async (req, res) => {
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
 * CSV uploads (Admin only)
 * ------------------------------------------------------------------ */
router.post("/upload/csv/:table", requireAdmin, upload.single("file"), async (req, res) => {
  const name = req.params.table;
  const spec = TABLES[name];
  if (!spec || spec.readOnly) return res.status(400).json({ error: `Unknown table '${name}'` });
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const rawObjects = parseCsvObjects(fs.readFileSync(req.file.path, "utf8"));
    if (!rawObjects.length) throw new Error("The CSV has no data rows.");

    // Normalize keys to snake_case so "Course Code" or "Roll No" works smoothly
    const objects = rawObjects.map((obj) => {
      const normalized = {};
      for (const [k, v] of Object.entries(obj)) {
        normalized[k.trim().toLowerCase().replace(/[\s-]+/g, "_")] = v;
      }
      return normalized;
    });

    const header = Object.keys(objects[0]);
    const requiredCols = spec.required || spec.columns;
    const missing = requiredCols.filter((c) => !header.includes(c));
    if (missing.length) {
      throw new Error(
        `Missing required column(s): ${missing.join(", ")}. Header must include: ${requiredCols.join(", ")}`);
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

  const fetchCols = Array.from(new Set([spec.primaryKey, ...spec.columns])).filter(Boolean);

  let q = supabase.from(req.params.name)
    .select(fetchCols.join(","), { count: "exact" })
    .order(spec.orderBy, { ascending: true })
    .range(offset, offset + limit - 1);

  if (search) {
    const escaped = search.replace(/[%,()]/g, " ");
    q = q.or(spec.columns.map((c) => `${c}.ilike.%${escaped}%`).join(","));
  }
  const { data, count, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  res.json({
    columns: spec.columns,
    primaryKey: spec.primaryKey,
    required: spec.required || [],
    numeric: spec.numeric || [],
    readOnly: !!spec.readOnly,
    rows: data,
    total: count ?? 0,
    limit,
    offset,
  });
});

function validateAndNormalizeRow(name, spec, input, isPatch = false) {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid request body: expected an object.");
  }

  const out = {};
  const allowedCols = spec.columns;

  // For POST (not patch), ensure all required columns are present and non-empty
  if (!isPatch) {
    for (const c of spec.required || []) {
      if (input[c] === undefined || input[c] === null || String(input[c]).trim() === "") {
        throw new Error(`Field '${c.replace(/_/g, " ")}' is required and cannot be empty.`);
      }
    }
  }

  for (const [k, v] of Object.entries(input)) {
    // Only accept columns that belong to the table or its primary key
    if (!allowedCols.includes(k) && k !== spec.primaryKey) {
      continue;
    }

    const strVal = v === null || v === undefined ? "" : String(v).trim();

    // Required check if present in patch
    if (spec.required?.includes(k) && !strVal) {
      throw new Error(`Field '${k.replace(/_/g, " ")}' is required and cannot be empty.`);
    }

    // Specific field validations
    if (k === "course_code" || k === "student_roll_no" || k === "roll_no") {
      if (strVal) {
        if (!/^[A-Za-z0-9_-]+$/.test(strVal)) {
          throw new Error(`'${k.replace(/_/g, " ")}' must be alphanumeric (e.g. CSL301, M25CS002).`);
        }
        out[k] = strVal.toUpperCase();
      } else {
        out[k] = "";
      }
    } else if (k === "tas_required") {
      const num = Number(v);
      if (!Number.isInteger(num) || num < 1) {
        throw new Error("'tas_required' must be a positive whole integer (at least 1).");
      }
      out[k] = num;
    } else if (k === "day") {
      const validDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
      const match = validDays.find((d) => d.toLowerCase() === strVal.toLowerCase());
      if (!match) {
        throw new Error(`'day' must be one of: ${validDays.join(", ")}`);
      }
      out[k] = match;
    } else if (k === "start_time" || k === "end_time") {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(strVal)) {
        throw new Error(`'${k}' must be in 24-hour HH:MM format (e.g. 09:30, 14:00).`);
      }
      out[k] = strVal;
    } else if (k === "email") {
      if (strVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strVal)) {
        throw new Error(`Invalid email format: '${strVal}'`);
      }
      out[k] = strVal.toLowerCase();
    } else {
      out[k] = strVal;
    }
  }

  // Cross-field validation for timetable
  if (out.start_time && out.end_time) {
    if (out.start_time >= out.end_time) {
      throw new Error(`'start_time' (${out.start_time}) must be earlier than 'end_time' (${out.end_time}).`);
    }
  }

  return out;
}

router.post("/table/:name", requireAdmin, async (req, res) => {
  const name = req.params.name;
  const spec = TABLES[name];
  if (!spec || spec.readOnly) return res.status(400).json({ error: `Table '${name}' is not editable.` });

  try {
    const rowData = validateAndNormalizeRow(name, spec, req.body, false);
    const { data, error } = await supabase.from(name).insert([rowData]).select();
    if (error) throw new Error(error.message);
    res.status(201).json({
      success: true,
      row: data?.[0] || rowData,
      message: `Row added successfully to ${spec.label}.`,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.patch("/table/:name/:id", requireAdmin, async (req, res) => {
  const name = req.params.name;
  const spec = TABLES[name];
  if (!spec || spec.readOnly) return res.status(400).json({ error: `Table '${name}' is not editable.` });
  const id = decodeURIComponent(req.params.id);

  try {
    const rowData = validateAndNormalizeRow(name, spec, req.body, true);
    if (Object.keys(rowData).length === 0) {
      return res.status(400).json({ error: "No fields provided to update." });
    }
    const pkCol = spec.primaryKey || spec.orderBy;
    const { data, error } = await supabase.from(name).update(rowData).eq(pkCol, id).select();
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) {
      return res.status(404).json({ error: `Row with ${pkCol}='${id}' not found.` });
    }
    res.json({
      success: true,
      row: data[0],
      message: `Row updated successfully.`,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/table/:name/:id", requireAdmin, async (req, res) => {
  const name = req.params.name;
  const spec = TABLES[name];
  if (!spec || spec.readOnly) return res.status(400).json({ error: `Table '${name}' is not editable.` });
  const id = decodeURIComponent(req.params.id);

  try {
    const pkCol = spec.primaryKey || spec.orderBy;
    const { error } = await supabase.from(name).delete().eq(pkCol, id);
    if (error) throw new Error(error.message);
    res.json({
      success: true,
      message: `Row deleted successfully from ${spec.label}.`,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
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

router.post("/allocate", requireAdmin, async (req, res) => {
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

    // Note: If some courses have not submitted requirements yet, they are simply omitted from
    // ta_requirements (or considered as having 0 demand). We only require that AT LEAST ONE
    // course has requirements submitted so the solver has something to allocate.
    const blockers = [];
    if (!requirements.length) blockers.push("TA Requirements is empty -- no course has submitted requirements yet");
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

/* ------------------------------------------------------------------ *
 * Requirements Collection Endpoints
 * ------------------------------------------------------------------ */

// GET collection status and overview (Admin view & Faculty check)
router.get("/requirements/status", async (req, res) => {
  try {
    const [{ data: setting }, { data: courses }, { data: reqs }, { data: tas }] = await Promise.all([
      supabase.from("department_settings").select("value").eq("key", "collecting_requirements").maybeSingle(),
      supabase.from("courses").select("course_code, course_name, discipline, program, instructors").order("course_code"),
      supabase.from("ta_requirements").select("course_code, tas_required, preferred_ta_rolls, submitted_by, updated_at"),
      supabase.from("ta_details").select("roll_no, name, program, email, thesis_supervisor").order("roll_no"),
    ]);

    const isCollecting = setting?.value?.active ?? false;
    const reqsByCode = Object.fromEntries((reqs || []).map((r) => [r.course_code, r]));

    const coursesList = (courses || []).map((c) => {
      const existing = reqsByCode[c.course_code];
      return {
        course_code: c.course_code,
        course_name: c.course_name,
        discipline: c.discipline,
        program: c.program,
        instructors: c.instructors,
        has_submitted: !!existing,
        tas_required: existing ? existing.tas_required : 0,
        preferred_ta_rolls: existing?.preferred_ta_rolls || "",
        submitted_by: existing?.submitted_by || null,
        updated_at: existing?.updated_at || null,
      };
    });

    const submittedCount = coursesList.filter((c) => c.has_submitted).length;
    const pendingCount = coursesList.length - submittedCount;

    res.json({
      isCollecting,
      totalCourses: coursesList.length,
      submittedCount,
      pendingCount,
      courses: coursesList,
      taList: tas || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin toggle: start or stop collecting requirements
router.post("/requirements/toggle-collection", requireAdmin, async (req, res) => {
  const active = req.body?.active !== undefined ? !!req.body.active : true;
  try {
    const { data, error } = await supabase
      .from("department_settings")
      .upsert({
        key: "collecting_requirements",
        value: { active, started_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      }, { onConflict: "key" })
      .select()
      .single();

    if (error) throw new Error(error.message);
    res.json({
      isCollecting: active,
      message: active ? "TA requirements collection is now OPEN." : "TA requirements collection is now CLOSED.",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET requirements submission form data for a faculty member
router.get("/requirements/my-courses", async (req, res) => {
  const user = req.user;
  const userEmail = (user?.email || "").toLowerCase().trim();
  const userName = user?.name || "";
  const isAdmin = user?.role === "admin";

  try {
    const [{ data: setting }, { data: courses }, { data: reqs }, { data: tas }] = await Promise.all([
      supabase.from("department_settings").select("value").eq("key", "collecting_requirements").maybeSingle(),
      supabase.from("courses").select("course_code, course_name, instructors, lecture_slot, tutorial_slot, lab_slot").order("course_code"),
      supabase.from("ta_requirements").select("course_code, tas_required, preferred_ta_rolls, submitted_by, updated_at"),
      supabase.from("ta_details").select("roll_no, name, program, email, thesis_supervisor").order("roll_no"),
    ]);

    const isCollecting = setting?.value?.active ?? false;
    const reqsByCode = Object.fromEntries((reqs || []).map((r) => [r.course_code, r]));

    // Match faculty courses
    const facultyCourses = [];
    for (const c of courses || []) {
      const instructors = splitPeople(c.instructors);
      const isTeaching = isAdmin || instructors.some((i) => {
        if (samePerson(i, userName)) return true;
        const emailPrefix = userEmail.split("@")[0];
        if (i.toLowerCase().includes(emailPrefix)) return true;
        return false;
      });

      if (isTeaching) {
        const existing = reqsByCode[c.course_code];
        facultyCourses.push({
          course_code: c.course_code,
          course_name: c.course_name,
          instructors: c.instructors,
          co_instructors: instructors.filter((i) => !samePerson(i, userName)),
          has_submitted: !!existing,
          tas_required: existing ? existing.tas_required : "",
          preferred_ta_rolls: existing?.preferred_ta_rolls || "",
          submitted_by: existing?.submitted_by || null,
          updated_at: existing?.updated_at || null,
        });
      }
    }

    res.json({
      isCollecting,
      courses: facultyCourses,
      taList: tas || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST submit / update requirements for a specific course (Faculty or Admin)
router.post("/requirements/submit", async (req, res) => {
  const { course_code, tas_required, preferred_ta_rolls } = req.body;
  if (!course_code) return res.status(400).json({ error: "Missing course_code" });
  
  const count = Number(tas_required);
  if (!Number.isInteger(count) || count < 0) {
    return res.status(400).json({ error: "tas_required must be a non-negative whole number" });
  }

  const user = req.user;
  const userEmail = (user?.email || "").toLowerCase().trim();
  const userName = user?.name || userEmail;
  const isAdmin = user?.role === "admin";

  try {
    // Verify instructor permissions unless admin
    if (!isAdmin) {
      const { data: course, error: cErr } = await supabase
        .from("courses")
        .select("instructors")
        .eq("course_code", course_code)
        .maybeSingle();

      if (cErr || !course) return res.status(404).json({ error: "Course not found" });

      const instructors = splitPeople(course.instructors);
      const isTeaching = instructors.some((i) => {
        if (samePerson(i, userName)) return true;
        const emailPrefix = userEmail.split("@")[0];
        return i.toLowerCase().includes(emailPrefix);
      });

      if (!isTeaching) {
        return res.status(403).json({ error: "You are not listed as an instructor for this course" });
      }
    }

    // Clean preferred TAs: strip whitespace and format as semicolon-separated
    let cleanPreferred = "";
    if (preferred_ta_rolls) {
      const list = (Array.isArray(preferred_ta_rolls) ? preferred_ta_rolls : preferred_ta_rolls.split(/[;,]/))
        .map((r) => r.trim())
        .filter(Boolean);
      cleanPreferred = [...new Set(list)].join(";");
    }

    if (count === 0) {
      // If 0, remove requirement or store as 0
      await supabase.from("ta_requirements").delete().eq("course_code", course_code);
      return res.json({ success: true, message: `Removed requirement for ${course_code}.` });
    }

    const { data, error } = await supabase
      .from("ta_requirements")
      .upsert({
        course_code,
        tas_required: count,
        preferred_ta_rolls: cleanPreferred,
        submitted_by: `${userName} (${userEmail})`,
        updated_at: new Date().toISOString(),
      }, { onConflict: "course_code" })
      .select()
      .single();

    if (error) throw new Error(error.message);

    res.json({
      success: true,
      requirement: data,
      message: `Requirements for ${course_code} saved successfully.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/runs", async (req, res) => {
  let query = supabase.from("allocation_runs")
    .select("id, created_at, status, summary, is_published")
    .order("id", { ascending: false }).limit(20);

  if (req.user?.role !== "admin") {
    query = query.eq("is_published", true);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json({ runs: data });
});

router.patch("/runs/:id/publish", requireAdmin, async (req, res) => {
  const is_published = req.body?.is_published !== undefined ? !!req.body.is_published : true;
  const { data, error } = await supabase
    .from("allocation_runs")
    .update({ is_published })
    .eq("id", req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ run: data, message: is_published ? "Results published successfully!" : "Results unpublished." });
});

/* ------------------------------------------------------------------ *
 * Role-Based View for Courses & Assigned TAs (Faculty, TA, Student)
 * ------------------------------------------------------------------ */
router.get("/role-view", async (req, res) => {
  const user = req.user;
  const role = user?.role || "student";
  const userEmail = (user?.email || "").toLowerCase().trim();
  const userName = user?.name || "";

  try {
    // 1. Find the latest published allocation run (or latest run if admin)
    let runQuery = supabase.from("allocation_runs")
      .select("id, status, is_published, created_at")
      .order("id", { ascending: false });

    if (role !== "admin") {
      runQuery = runQuery.eq("is_published", true);
    }

    const { data: runs, error: runError } = await runQuery.limit(1);
    if (runError) throw new Error(runError.message);

    const activeRun = runs?.[0] || null;

    if (!activeRun) {
      return res.json({
        role,
        isPublished: false,
        runId: null,
        message: "No published TA allocations are currently available.",
        data: [],
      });
    }

    // 2. Load allocations, courses, and ta_details
    const [allocRes, courseRes, taRes] = await Promise.all([
      supabase.from("allocations").select("*").eq("run_id", activeRun.id),
      supabase.from("courses").select("course_code, course_name, instructors, lecture_slot, tutorial_slot, lab_slot"),
      supabase.from("ta_details").select("roll_no, name, program, thesis_supervisor, email"),
    ]);

    if (allocRes.error) throw new Error(allocRes.error.message);
    if (courseRes.error) throw new Error(courseRes.error.message);
    if (taRes.error) throw new Error(taRes.error.message);

    const courses = courseRes.data || [];
    const tasByRoll = Object.fromEntries((taRes.data || []).map((t) => [t.roll_no, t]));
    const tasByEmail = Object.fromEntries(
      (taRes.data || [])
        .filter((t) => t.email)
        .map((t) => [t.email.toLowerCase().trim(), t])
    );

    // Group allocations by course_code
    const courseAllocations = {};
    const taAssignmentMap = {};
    for (const alloc of allocRes.data || []) {
      if (!courseAllocations[alloc.course_code]) {
        courseAllocations[alloc.course_code] = [];
      }
      const fullTa = tasByRoll[alloc.ta_roll_no] || {};
      const course = courses.find((c) => c.course_code === alloc.course_code);
      taAssignmentMap[alloc.ta_roll_no] = {
        course_code: alloc.course_code,
        course_name: course?.course_name || alloc.course_code,
        instructors: course?.instructors || "",
      };

      courseAllocations[alloc.course_code].push({
        roll_no: alloc.ta_roll_no,
        name: alloc.ta_name || fullTa.name || "",
        program: alloc.ta_program || fullTa.program || "",
        thesis_supervisor: fullTa.thesis_supervisor || "",
        email: fullTa.email || (alloc.ta_roll_no ? `${alloc.ta_roll_no}@iitbhilai.ac.in` : ""),
        is_preferred: alloc.is_preferred,
        is_supervisor: alloc.is_supervisor,
      });
    }

    const allTAsList = (taRes.data || []).map((t) => ({
      roll_no: t.roll_no,
      name: t.name,
      program: t.program || "",
      email: t.email || "",
      thesis_supervisor: t.thesis_supervisor || "",
      assigned_to: taAssignmentMap[t.roll_no] || null,
    }));

    // 3. Filter and project based on role
    if (role === "faculty") {
      // Find courses where the faculty member is an instructor
      // Name matching using token overlap or surname match against userName
      const myCourses = [];

      for (const c of courses) {
        const instructors = splitPeople(c.instructors);
        const isTeaching = instructors.some((i) => {
          if (samePerson(i, userName)) return true;
          // check email prefix if name contains it
          const emailPrefix = userEmail.split("@")[0];
          if (i.toLowerCase().includes(emailPrefix)) return true;
          return false;
        });

        if (isTeaching) {
          myCourses.push({
            course_code: c.course_code,
            course_name: c.course_name,
            instructors: c.instructors,
            co_instructors: instructors.filter((i) => !samePerson(i, userName)),
            slots: { lecture: c.lecture_slot, tutorial: c.tutorial_slot, lab: c.lab_slot },
            tas: courseAllocations[c.course_code] || [],
          });
        }
      }

      // Fetch recent change requests submitted by this faculty member
      const { data: facultyRequests } = await supabase
        .from("ta_change_requests")
        .select("*")
        .eq("faculty_email", userEmail)
        .order("created_at", { ascending: false });

      return res.json({
        role: "faculty",
        isAdmin: user?.role === "admin",
        isPublished: activeRun.is_published,
        runId: activeRun.id,
        user: { name: userName, email: userEmail },
        courses: myCourses,
        allTAs: allTAsList,
        change_requests: facultyRequests || [],
      });
    }

    if (role === "ta") {
      // Look up current user's roll_no from email or roll match
      const taRecord = tasByEmail[userEmail] || tasByRoll[userEmail.split("@")[0].toUpperCase()] || null;
      const myRoll = taRecord?.roll_no || userEmail.split("@")[0].toUpperCase();

      // Find allocations for this TA
      const myAllocations = (allocRes.data || []).filter(
        (a) => a.ta_roll_no?.toUpperCase() === myRoll.toUpperCase()
      );

      const assignedCourses = myAllocations.map((a) => {
        const course = courses.find((c) => c.course_code === a.course_code) || {};
        return {
          course_code: a.course_code,
          course_name: course.course_name || "",
          instructors: course.instructors || "",
          slots: { lecture: course.lecture_slot, tutorial: course.tutorial_slot, lab: course.lab_slot },
          ta_details: {
            roll_no: a.ta_roll_no,
            name: a.ta_name || taRecord?.name,
            program: a.ta_program || taRecord?.program,
            thesis_supervisor: taRecord?.thesis_supervisor,
            email: taRecord?.email || userEmail,
          },
        };
      });

      return res.json({
        role: "ta",
        isAdmin: user?.role === "admin",
        isPublished: activeRun.is_published,
        runId: activeRun.id,
        user: { name: userName, email: userEmail, roll_no: myRoll },
        assigned_courses: assignedCourses,
      });
    }

    // Default for student (and faculty/admin when viewing all or as student)
    // Students see list of all courses and corresponding faculties and TAs (only name, roll/id, email)
    const publicCourseList = courses.map((c) => {
      const tas = (courseAllocations[c.course_code] || []).map((t) => ({
        roll_no: t.roll_no,
        name: t.name,
        email: t.email,
        program: t.program,
        thesis_supervisor: t.thesis_supervisor,
      }));

      return {
        course_code: c.course_code,
        course_name: c.course_name,
        instructors: c.instructors,
        tas,
      };
    });

    return res.json({
      role: "student",
      isAdmin: user?.role === "admin",
      isPublished: activeRun.is_published,
      runId: activeRun.id,
      courses: publicCourseList,
      allTAs: allTAsList,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
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

/* ------------------------------------------------------------------ *
 * Faculty Change Requests & Admin Review (Requirements 2, 3, 4, 5, 6)
 * ------------------------------------------------------------------ */

// GET /api/ta/requests
// Admin gets all requests; Faculty gets only their own requests.
router.get("/requests", async (req, res) => {
  const user = req.user;
  const isAdmin = user?.role === "admin";
  const userEmail = (user?.email || "").toLowerCase().trim();

  try {
    let q = supabase.from("ta_change_requests").select("*").order("created_at", { ascending: false });
    if (!isAdmin) {
      q = q.eq("faculty_email", userEmail);
    }

    const { data: activeRuns } = await supabase
      .from("allocation_runs")
      .select("id, is_published")
      .order("id", { ascending: false })
      .limit(1);

    const activeRun = activeRuns?.[0] || null;

    let allocQuery = supabase.from("allocations").select("run_id, course_code, ta_roll_no");
    if (activeRun) {
      allocQuery = allocQuery.eq("run_id", activeRun.id);
    }

    const [{ data: requests, error }, { data: courses }, { data: allocs }] = await Promise.all([
      q,
      supabase.from("courses").select("course_code, course_name, instructors"),
      allocQuery,
    ]);

    if (error) throw new Error(error.message);

    const coursesMap = Object.fromEntries((courses || []).map((c) => [c.course_code, c]));

    // Find current active allocations for each TA in the latest active run
    const currentAllocMap = {};
    if (activeRun) {
      for (const a of allocs || []) {
        const c = coursesMap[a.course_code];
        const normRoll = (a.ta_roll_no || "").trim().toUpperCase();
        currentAllocMap[normRoll] = {
          course_code: a.course_code,
          course_name: c?.course_name || a.course_code,
          instructors: c?.instructors || "",
        };
      }
    }

    const enriched = (requests || []).map((r) => {
      const normRoll = (r.ta_roll_no || "").trim().toUpperCase();
      return {
        ...r,
        course_name: coursesMap[r.course_code]?.course_name || r.course_code,
        course_instructors: coursesMap[r.course_code]?.instructors || "",
        current_allocation: currentAllocMap[normRoll] || null,
      };
    });

    const pendingCount = enriched.filter((r) => r.status === "pending").length;

    res.json({
      requests: enriched,
      pendingCount,
      activeRunId: activeRun?.id || null,
      isPublished: activeRun?.is_published || false,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ta/requests
// Faculty submits a change request to ADD or DELETE a TA
router.post("/requests", async (req, res) => {
  const user = req.user;
  const userEmail = (user?.email || "").toLowerCase().trim();
  const userName = user?.name || userEmail;
  const { course_code, request_type, ta_roll_no, reason } = req.body;

  if (!course_code || !request_type || !ta_roll_no) {
    return res.status(400).json({ error: "Missing required fields: course_code, request_type, ta_roll_no." });
  }
  if (!["ADD", "DELETE"].includes(request_type)) {
    return res.status(400).json({ error: "request_type must be either 'ADD' or 'DELETE'." });
  }

  try {
    const { data: runs } = await supabase
      .from("allocation_runs")
      .select("id, is_published")
      .order("id", { ascending: false })
      .limit(1);

    const activeRun = runs?.[0];
    if (!activeRun || !activeRun.is_published) {
      return res.status(400).json({ error: "TA allocations have not been published yet. Change requests can only be made after publication." });
    }

    const { data: taRecord } = await supabase
      .from("ta_details")
      .select("roll_no, name, program, email")
      .eq("roll_no", ta_roll_no.trim())
      .maybeSingle();

    const cleanRoll = taRecord?.roll_no || ta_roll_no.trim().toUpperCase();
    const taName = taRecord?.name || cleanRoll;
    const taProgram = taRecord?.program || "";

    if (request_type === "DELETE") {
      const { data: existingAlloc } = await supabase
        .from("allocations")
        .select("id")
        .eq("run_id", activeRun.id)
        .eq("course_code", course_code.trim())
        .eq("ta_roll_no", cleanRoll)
        .maybeSingle();

      if (!existingAlloc) {
        return res.status(400).json({ error: `TA ${cleanRoll} is not currently assigned to course ${course_code}.` });
      }
    }

    const { data: inserted, error: insertError } = await supabase
      .from("ta_change_requests")
      .insert([{
        run_id: activeRun.id,
        course_code: course_code.trim(),
        faculty_email: userEmail,
        faculty_name: userName,
        request_type,
        ta_roll_no: cleanRoll,
        ta_name: taName,
        ta_program: taProgram,
        reason: (reason || "").trim(),
        status: "pending",
      }])
      .select()
      .single();

    if (insertError) throw new Error(insertError.message);

    res.status(201).json({
      success: true,
      request: inserted,
      message: `Request to ${request_type} TA ${cleanRoll} submitted successfully for admin review.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ta/requests/:id/review
// Admin approves or rejects a change request
router.post("/requests/:id/review", requireAdmin, async (req, res) => {
  const { action, admin_remark } = req.body;
  const requestId = req.params.id;
  const reviewerEmail = (req.user?.email || "admin").toLowerCase().trim();

  if (!["approve", "reject"].includes(action)) {
    return res.status(400).json({ error: "Action must be 'approve' or 'reject'." });
  }

  try {
    const { data: request, error: reqError } = await supabase
      .from("ta_change_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();

    if (reqError || !request) {
      return res.status(404).json({ error: "Change request not found." });
    }

    if (request.status !== "pending") {
      return res.status(400).json({ error: `Request has already been ${request.status}.` });
    }

    if (action === "reject") {
      const { data: updated, error: updateError } = await supabase
        .from("ta_change_requests")
        .update({
          status: "rejected",
          admin_remark: (admin_remark || "").trim(),
          reviewed_by: reviewerEmail,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", requestId)
        .select()
        .single();

      if (updateError) throw new Error(updateError.message);

      return res.json({
        success: true,
        request: updated,
        message: "Change request rejected.",
      });
    }

    const runId = request.run_id;
    if (!runId) {
      return res.status(400).json({ error: "No associated allocation run for this request." });
    }

    if (request.request_type === "ADD") {
      // Remove TA from previous course in this run (if assigned)
      await supabase
        .from("allocations")
        .delete()
        .eq("run_id", runId)
        .eq("ta_roll_no", request.ta_roll_no);

      // Insert into target course
      const { error: insertError } = await supabase
        .from("allocations")
        .insert([{
          run_id: runId,
          course_code: request.course_code,
          ta_roll_no: request.ta_roll_no,
          ta_name: request.ta_name,
          ta_program: request.ta_program,
          is_preferred: false,
          is_supervisor: false,
        }]);

      if (insertError) throw new Error(`Failed to allocate TA: ${insertError.message}`);
    } else if (request.request_type === "DELETE") {
      const { error: deleteError } = await supabase
        .from("allocations")
        .delete()
        .eq("run_id", runId)
        .eq("course_code", request.course_code)
        .eq("ta_roll_no", request.ta_roll_no);

      if (deleteError) throw new Error(`Failed to remove TA: ${deleteError.message}`);
    }

    const { data: updated, error: updateError } = await supabase
      .from("ta_change_requests")
      .update({
        status: "approved",
        admin_remark: (admin_remark || "").trim(),
        reviewed_by: reviewerEmail,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", requestId)
      .select()
      .single();

    if (updateError) throw new Error(updateError.message);

    res.json({
      success: true,
      request: updated,
      message: `Request approved. Allocations updated successfully.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ta/allocations/manual-add (Requirement 6)
// Admin directly adds a TA to a course in the active published run.
router.post("/allocations/manual-add", requireAdmin, async (req, res) => {
  const { course_code, ta_roll_no } = req.body;
  if (!course_code || !ta_roll_no) {
    return res.status(400).json({ error: "Missing course_code or ta_roll_no" });
  }

  try {
    const { data: runs } = await supabase
      .from("allocation_runs")
      .select("id, is_published")
      .order("id", { ascending: false })
      .limit(1);

    const activeRun = runs?.[0];
    if (!activeRun) {
      return res.status(400).json({ error: "No allocation run found." });
    }

    const { data: taRecord } = await supabase
      .from("ta_details")
      .select("roll_no, name, program")
      .eq("roll_no", ta_roll_no.trim())
      .maybeSingle();

    const cleanRoll = taRecord?.roll_no || ta_roll_no.trim().toUpperCase();
    const taName = taRecord?.name || cleanRoll;
    const taProgram = taRecord?.program || "";

    // Delete existing assignment for this TA in this run (if any)
    await supabase
      .from("allocations")
      .delete()
      .eq("run_id", activeRun.id)
      .eq("ta_roll_no", cleanRoll);

    // Insert into target course
    const { error: insertError } = await supabase
      .from("allocations")
      .insert([{
        run_id: activeRun.id,
        course_code: course_code.trim(),
        ta_roll_no: cleanRoll,
        ta_name: taName,
        ta_program: taProgram,
        is_preferred: false,
        is_supervisor: false,
      }]);

    if (insertError) throw new Error(insertError.message);

    res.json({
      success: true,
      message: `TA ${cleanRoll} assigned to ${course_code.trim()} successfully.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ta/allocations/manual-remove (Requirement 6)
// Admin directly removes a TA from a course in the active published run.
router.post("/allocations/manual-remove", requireAdmin, async (req, res) => {
  const { course_code, ta_roll_no } = req.body;
  if (!course_code || !ta_roll_no) {
    return res.status(400).json({ error: "Missing course_code or ta_roll_no" });
  }

  try {
    const { data: runs } = await supabase
      .from("allocation_runs")
      .select("id")
      .order("id", { ascending: false })
      .limit(1);

    const activeRun = runs?.[0];
    if (!activeRun) {
      return res.status(400).json({ error: "No allocation run found." });
    }

    const cleanRoll = ta_roll_no.trim().toUpperCase();

    const { error: deleteError } = await supabase
      .from("allocations")
      .delete()
      .eq("run_id", activeRun.id)
      .eq("course_code", course_code.trim())
      .eq("ta_roll_no", cleanRoll);

    if (deleteError) throw new Error(deleteError.message);

    res.json({
      success: true,
      message: `TA ${cleanRoll} removed from ${course_code.trim()} successfully.`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
export { runPython, TABLES as taTables };
