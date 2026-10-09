import express from 'express';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';
import { supabase } from '../supabaseClient.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const upload = multer({ dest: '/tmp/' });

router.post('/parse-pdf', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const filePath = req.file.path;
  const optimizationDir = path.join(__dirname, '..', 'optimization', 'lab_allocation');
  const pythonExecutable = path.join(__dirname, '..', 'optimization', 'venv', 'bin', 'python');
  const parserScript = path.join(optimizationDir, 'parser.py');

  exec(`${pythonExecutable} ${parserScript} ${filePath}`, { cwd: optimizationDir }, (error, stdout, stderr) => {
    try { fs.unlinkSync(filePath); } catch (e) {}
    if (error) return res.status(500).json({ error: "Failed to parse PDF", details: stderr });
    try {
      const result = JSON.parse(stdout);
      if (result.error) return res.status(500).json({ error: result.error });
      res.json(result);
    } catch (parseError) {
      res.status(500).json({ error: "Invalid parser output", details: parseError.message });
    }
  });
});

router.post('/parse-timetable-pdf', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const filePath = req.file.path;
  const optimizationDir = path.join(__dirname, '..', 'optimization', 'lab_allocation');
  const pythonExecutable = path.join(__dirname, '..', 'optimization', 'venv', 'bin', 'python');
  const parserScript = path.join(optimizationDir, 'parse_timetable.py');

  exec(`${pythonExecutable} ${parserScript} ${filePath}`, { cwd: optimizationDir }, (error, stdout, stderr) => {
    try { fs.unlinkSync(filePath); } catch (e) {}
    if (error) return res.status(500).json({ error: "Failed to parse timetable PDF", details: stderr });
    try {
      const result = JSON.parse(stdout);
      if (result.error) return res.status(500).json({ error: result.error });
      res.json(result);
    } catch (parseError) {
      res.status(500).json({ error: "Invalid parser output", details: parseError.message });
    }
  });
});

router.get('/data', async (req, res) => {
  try {
    const { data: labs, error: labsErr } = await supabase.from('lab_allocation_labs').select('*');
    if (labsErr) throw labsErr;
    const { data: courses, error: coursesErr } = await supabase.from('lab_allocation_courses').select('*');
    if (coursesErr) throw coursesErr;
    const { data: timetable, error: timeErr } = await supabase.from('lab_allocation_timetable').select('*').eq('id', 'singleton').maybeSingle();
    if (timeErr) throw timeErr;

    res.json({
      data: { labs: labs || [], courses: courses || [], slots: [] },
      timetableData: timetable ? { headers: timetable.headers, slots: timetable.slots } : null
    });
  } catch (error) {
    console.error("DB read error:", error);
    res.status(500).json({ error: "Could not read data from db" });
  }
});

router.post('/save', async (req, res) => {
  const { labs, courses, timetableData } = req.body;
  try {
    if (labs) {
      const { error: delErr } = await supabase.from('lab_allocation_labs').delete().neq('id', 'xyz123'); // delete all
      if (delErr) throw delErr;
      if (labs.length > 0) {
        const { error: insErr } = await supabase.from('lab_allocation_labs').insert(labs.map(l => ({
          id: l.id || Math.random().toString(36).substr(2, 9),
          name: l.name, capacity: parseInt(l.capacity) || 0, has_gpu: Boolean(l.has_gpu)
        })));
        if (insErr) throw insErr;
      }
    }
    if (courses) {
      const { error: delErr } = await supabase.from('lab_allocation_courses').delete().neq('code', 'xyz123');
      if (delErr) throw delErr;
      if (courses.length > 0) {
        const { error: insErr } = await supabase.from('lab_allocation_courses').insert(courses.map(c => ({
          code: c.code, name: c.name, student_count: parseInt(c.student_count) || 0,
          gpu_required: Boolean(c.gpu_required), academic_year: c.academic_year,
          instructor: c.instructor, duration: parseInt(c.duration) || 2, periods: c.periods || []
        })));
        if (insErr) throw insErr;
      }
    }
    if (timetableData) {
      const { error: upsErr } = await supabase.from('lab_allocation_timetable').upsert({
        id: 'singleton',
        headers: timetableData.headers || [],
        slots: timetableData.slots || {}
      });
      if (upsErr) throw upsErr;
    }
    res.json({ success: true });
  } catch (error) {
    console.error("DB write error:", error);
    res.status(500).json({ error: "Could not save data to db", details: error.message || error });
  }
});

router.post('/allocate', async (req, res) => {
  const optimizationDir = path.join(__dirname, '..', 'optimization', 'lab_allocation');
  const pythonExecutable = path.join(__dirname, '..', 'optimization', 'venv', 'bin', 'python');
  const solverScript = path.join(optimizationDir, 'solver.py');
  const dummyDataPath = path.join(optimizationDir, 'dummy_data.json');

  if (req.body && req.body.labs && req.body.courses) {
    try {
      fs.writeFileSync(dummyDataPath, JSON.stringify(req.body, null, 2));
    } catch (err) {
      return res.status(500).json({ status: "ERROR", message: "Failed to write data" });
    }
  }

  exec(`${pythonExecutable} ${solverScript} ${dummyDataPath}`, { cwd: optimizationDir }, (error, stdout, stderr) => {
    if (error) return res.status(500).json({ status: "ERROR", message: "Failed to run optimization solver", details: stderr });
    try {
      const result = JSON.parse(stdout);
      res.json(result);
    } catch (parseError) {
      res.status(500).json({ status: "ERROR", message: "Invalid output from solver", details: parseError.message });
    }
  });
});

export default router;
