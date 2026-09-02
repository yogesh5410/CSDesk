import express from 'express';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import fs from 'fs';
import multer from 'multer';

const upload = multer({ dest: '/tmp/' });

router.post('/parse-pdf', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const filePath = req.file.path;
  const optimizationDir = path.join(__dirname, '..', 'optimization');
  const pythonExecutable = path.join(optimizationDir, 'venv', 'bin', 'python');
  const parserScript = path.join(optimizationDir, 'parser.py');

  const command = `${pythonExecutable} ${parserScript} ${filePath}`;

  exec(command, { cwd: optimizationDir }, (error, stdout, stderr) => {
    // Clean up uploaded file
    try {
      fs.unlinkSync(filePath);
    } catch (e) {}

    if (error) {
      console.error(`Parser exec error: ${error}`);
      return res.status(500).json({ error: "Failed to parse PDF", details: stderr });
    }
    
    try {
      const result = JSON.parse(stdout);
      if (result.error) {
        return res.status(500).json({ error: result.error });
      }
      res.json(result);
    } catch (parseError) {
      console.error("Failed to parse Python output:", stdout);
      res.status(500).json({ error: "Invalid parser output", details: parseError.message });
    }
  });
});

router.get('/data', (req, res) => {
  const dummyDataPath = path.join(__dirname, '..', 'optimization', 'dummy_data.json');
  try {
    const data = fs.readFileSync(dummyDataPath, 'utf8');
    res.json(JSON.parse(data));
  } catch (error) {
    res.status(500).json({ error: "Could not read data" });
  }
});

router.post('/allocate', (req, res) => {
  const optimizationDir = path.join(__dirname, '..', 'optimization');
  const pythonExecutable = path.join(optimizationDir, 'venv', 'bin', 'python');
  const solverScript = path.join(optimizationDir, 'solver.py');
  const dummyDataPath = path.join(optimizationDir, 'dummy_data.json');

  // If data is provided, overwrite dummy_data.json
  if (req.body && req.body.labs && req.body.courses && req.body.slots) {
    try {
      fs.writeFileSync(dummyDataPath, JSON.stringify(req.body, null, 2));
    } catch (err) {
      return res.status(500).json({ status: "ERROR", message: "Failed to write data" });
    }
  }

  const command = `${pythonExecutable} ${solverScript} ${dummyDataPath}`;

  exec(command, { cwd: optimizationDir }, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return res.status(500).json({ status: "ERROR", message: "Failed to run optimization solver", details: stderr });
    }
    
    try {
      const result = JSON.parse(stdout);
      res.json(result);
    } catch (parseError) {
      console.error("Failed to parse Python output:", stdout);
      res.status(500).json({ status: "ERROR", message: "Invalid output from solver", details: parseError.message });
    }
  });
});

export default router;
