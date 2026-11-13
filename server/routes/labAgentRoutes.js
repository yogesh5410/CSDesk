import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { labAgentHub, LAB_AGENT_TOKEN } from '../services/labAgentHub.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Security Middleware: Ensure only authenticated users with 'admin' role can execute commands
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      error: 'Access denied. Only system administrators can run remote commands on lab PCs.'
    });
  }
  next();
}

// 1. Get currently connected fleet (filtered by lab) - Authenticated users
router.get('/fleet', requireAuth, (req, res) => {
  const lab = req.query.lab || 'ALL';
  const fleet = labAgentHub.getFleet(lab);
  res.json({
    lab,
    totalOnline: fleet.length,
    agents: fleet
  });
});

// 2. Dispatch command to selected PCs - STRICTLY ADMIN ONLY
router.post('/execute', requireAuth, requireAdmin, (req, res) => {
  const { lab, targetPcs, script } = req.body;

  if (!script || !script.trim()) {
    return res.status(400).json({ error: "Script/command cannot be empty." });
  }

  const result = labAgentHub.executeCommand({
    lab: lab || 'ALL',
    targetPcs: targetPcs || [],
    script: script.trim()
  });

  res.json({
    success: true,
    executionId: result.executionId,
    dispatchedCount: result.dispatchedCount,
    message: `Dispatched command to ${result.dispatchedCount} connected PC(s).`
  });
});

// 2b. Get live status of an execution job - Authenticated users
router.get('/status/:executionId', requireAuth, (req, res) => {
  const status = labAgentHub.getExecutionStatus(req.params.executionId);
  if (!status) {
    return res.status(404).json({ error: "Execution ID not found" });
  }
  res.json(status);
});

// 2c. Rename a PC / Set friendly display alias - STRICTLY ADMIN ONLY
router.post('/rename-pc', requireAuth, requireAdmin, (req, res) => {
  const { targetIdentifier, newName } = req.body;
  if (!targetIdentifier || !newName || !newName.trim()) {
    return res.status(400).json({ error: "Target PC identifier and newName are required." });
  }

  const success = labAgentHub.renamePc(targetIdentifier, newName.trim());
  res.json({ success, newName: newName.trim() });
});

// 3. Serve the agent Python script directly for curl downloads
router.get('/csdesk_agent.py', (req, res) => {
  const agentPath = path.join(__dirname, '..', 'optimization', 'lab_agent', 'csdesk_agent.py');
  if (fs.existsSync(agentPath)) {
    res.setHeader('Content-Type', 'text/x-python');
    res.sendFile(agentPath);
  } else {
    res.status(404).send('# Error: csdesk_agent.py not found on server');
  }
});

// 4. Generate dynamic 1-line install bash script
router.get('/install.sh', (req, res) => {
  const host = req.get('host') || 'localhost:5000';
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const serverUrl = `${protocol}://${host}`;

  const bashScript = `#!/usr/bin/env bash
# CSDesk Lab Agent One-Line Installer
set -e

LAB="\${1:-TL1}"
SERVER_URL="\${2:-${serverUrl}}"
CUSTOM_PC_NAME="\${3:-}"

echo "=========================================================="
echo "  CSDesk Lab Agent Installer"
echo "  Target Lab: \$LAB"
echo "  Server:     \$SERVER_URL"
if [ -n "$CUSTOM_PC_NAME" ]; then
echo "  PC Name:    \$CUSTOM_PC_NAME"
fi
echo "=========================================================="

if [ "$EUID" -ne 0 ]; then
  echo "[!] Please run as root (use sudo bash install.sh <LAB_NAME>)"
  exit 1
fi

INSTALL_DIR="/opt/csdesk-agent"
mkdir -p "\$INSTALL_DIR"

echo "[*] Downloading csdesk_agent.py..."
curl -sSL "\$SERVER_URL/api/lab-automation/csdesk_agent.py" -o "\$INSTALL_DIR/csdesk_agent.py"
chmod +x "\$INSTALL_DIR/csdesk_agent.py"

echo "[*] Creating systemd service..."
cat << 'EOF' > /etc/systemd/system/csdesk-agent.service
[Unit]
Description=CSDesk Lab Remote Automation Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/csdesk-agent
ExecStart=/usr/bin/python3 /opt/csdesk-agent/csdesk_agent.py --server __SERVER_URL__ --lab __LAB__ --token __TOKEN__ __EXTRA_ARGS__
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sed -i "s|__SERVER_URL__|\$SERVER_URL|g" /etc/systemd/system/csdesk-agent.service
sed -i "s|__LAB__|\$LAB|g" /etc/systemd/system/csdesk-agent.service
sed -i "s|__TOKEN__|${LAB_AGENT_TOKEN}|g" /etc/systemd/system/csdesk-agent.service

if [ -n "$CUSTOM_PC_NAME" ]; then
  sed -i "s|__EXTRA_ARGS__|--pc \$CUSTOM_PC_NAME|g" /etc/systemd/system/csdesk-agent.service
else
  sed -i "s|__EXTRA_ARGS__||g" /etc/systemd/system/csdesk-agent.service
fi

systemctl daemon-reload
systemctl enable --now csdesk-agent

echo "[✓] CSDesk Lab Agent installed and active!"
systemctl status csdesk-agent --no-pager
`;

  res.setHeader('Content-Type', 'text/x-shellscript');
  res.send(bashScript);
});

// 5. Clean 1-line uninstall script
router.get('/uninstall.sh', (req, res) => {
  const uninstallScript = `#!/usr/bin/env bash
# CSDesk Lab Agent Clean Uninstaller
set -e

echo "=========================================================="
echo "  CSDesk Lab Agent Uninstaller"
echo "=========================================================="

if [ "$EUID" -ne 0 ]; then
  echo "[!] Please run as root (use sudo bash)"
  exit 1
fi

echo "[*] Stopping csdesk-agent service..."
systemctl stop csdesk-agent 2>/dev/null || true
systemctl disable csdesk-agent 2>/dev/null || true

echo "[*] Removing service file and agent files..."
rm -f /etc/systemd/system/csdesk-agent.service
rm -rf /opt/csdesk-agent

systemctl daemon-reload

echo "[✓] CSDesk Lab Agent completely removed from this PC!"
`;

  res.setHeader('Content-Type', 'text/x-shellscript');
  res.send(uninstallScript);
});

export default router;
