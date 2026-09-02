import express from 'express';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import fs from 'fs';

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
