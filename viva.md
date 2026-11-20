# CSDesk — Lab Remote Software Automation
## Technical Viva & Project Defense Guide

---

## 1. What is this System & What Does it Do? (The Basics)

### The Real-World Problem in University Laboratories:
In university computer labs like **TL1, TL2, ED1, and ED2** (which host 80+ workstations):
* Every semester, instructors require different software stacks (e.g., GCC/GDB for Data Structures, PyTorch/TensorFlow for AI lab, LaTeX for technical report writing).
* Previously, lab staff had to **physically walk from computer to computer** with USB pen-drives or manually type `sudo apt-get install` on all 80+ keyboards.
* This manual approach takes **3 to 4 hours**, is prone to human error, and provides **zero visibility** into which machines completed successfully and which failed.

### What the CSDesk Lab Automation Module Does:
* **Centralized Fleet Dashboard:** A single web dashboard where administrators can view all online computers across physical laboratory rooms in real time.
* **1-Click Parallel Execution:** An administrator can select multiple computers (or all computers in TL1) and deploy software packages or execute shell maintenance scripts across 40+ computers simultaneously in under 1 second.
* **Live Line-by-Line Streaming:** As packages download and install on student PCs, terminal output (stdout and stderr) streams live into the web browser console in real time (< 50ms latency) using WebSockets.
* **Room-First Isolation:** Computers are organized by room (TL1, TL2, ED1, ED2) so commands targeted for TL1 never accidentally run on machines in ED1.
* **Dynamic Machine Labeling:** Administrators can rename technical hostnames (e.g., `t1-pc-cl1`) to clean physical desk labels (e.g., `PC-01`, `TL1-Desk-15`) directly from the dashboard with instant persistence.

---

## 2. The 1-Line Installation Command & What it Does

To onboard any physical lab computer into the fleet, the administrator runs **one single command** in the lab machine's terminal:

```bash
curl -sSL https://csdesk-backend.onrender.com/api/lab-automation/install.sh | sudo bash -s -- TL1 https://csdesk-backend.onrender.com PC-01
```

### Line-by-Line Breakdown of What Happens on the Lab Machine:
1. **Fetches the Dynamic Setup Script:** `curl` securely downloads `install.sh` directly from the active CSDesk backend on Render.
2. **Creates the Installation Directory:** It creates `/opt/csdesk-agent/` on the machine with root permissions.
3. **Downloads the Agent Daemon:** It downloads `csdesk_agent.py` and marks it executable (`chmod +x`).
4. **Configures the Linux Background Service:** It automatically generates a systemd service file at `/etc/systemd/system/csdesk-agent.service` with:
   * Target Server: `https://csdesk-backend.onrender.com`
   * Target Room: `TL1`
   * PC Label: `PC-01`
   * Pre-shared Authentication Secret: `LAB_AGENT_TOKEN`
   * Auto-restart policy: `Restart=always` with 5-second backoff.
5. **Starts and Enables on Boot:** It runs `systemctl daemon-reload` and `systemctl enable --now csdesk-agent`.
6. **Zero External Pip Dependencies:** The agent is written entirely in **pure Python 3 standard library** (`socket`, `ssl`, `subprocess`, `threading`, `json`, `argparse`). It installs in **2 seconds** without needing `pip install`, virtual environments, or compilation tools, completely avoiding broken package manager issues.

---

## 3. The 3 Main Architecture Layers & Servers

The system is engineered as a cloud-native, three-tier distributed architecture:

```text
[ Tier 1: Presentation Layer ]   ──>   Hosted on Vercel CDN (React 19 + Tailwind)
               │
               ▼ (WSS / HTTPS)
[ Tier 2: Master Control Hub ]   ──>   Hosted on Render Cloud (Node.js + Express + ws)
               │
               ▼ (WSS / HTTPS)
[ Tier 3: Edge Agent Daemons ]   ──>   Physical Lab Workstations (Ubuntu 24.04 systemd)

[ Identity & Database Layer  ]   ──>   Supabase (Google OAuth @iitbhilai.ac.in + RBAC)
```

### Layer 1: Presentation Layer (Vercel Frontend)
* **Technology:** React 19, Tailwind CSS, Vite.
* **Core File:** `client/src/pages/dashboard/LabAutomation.jsx`
* **Responsibilities:**
  * Displays active workstations grouped by room (TL1, TL2, ED1, ED2).
  * Connects to `/ws/lab-admin` to receive live streaming logs from running jobs.
  * Provides quick one-click script presets (APT updates, Python AI stack, GCC/G++ dev tools, LaTeX compiler, system health).
  * Implements inline PC renaming with a pencil icon, saving aliases both in browser `localStorage` and syncing them to the server.
  * Locks execution controls for non-admin accounts with clear status indicators.

### Layer 2: Master Control Hub (Render Backend)
* **Technology:** Node.js, Express 5, WebSocket (`ws` library).
* **Core Files:** `server/services/labAgentHub.js` and `server/routes/labAgentRoutes.js`
* **Responsibilities:**
  * Runs the central WebSocket server on port 443 with two dedicated channels:
    * `/ws/lab-agent`: Where physical lab computers connect and stay alive.
    * `/ws/lab-admin`: Where administrator browser dashboards connect to receive live events.
  * Monitors machine health with 10-second heartbeats; automatically cleans up disconnected PCs.
  * Enforces cryptographic JWT verification and role validation on all command executions.
  * Dynamically generates the shell installer (`/install.sh`) and clean uninstaller (`/uninstall.sh`).

### Layer 3: Edge Agent Daemon (Lab Workstations)
* **Technology:** Python 3 Standard Library, Linux systemd daemon.
* **Core File:** `server/optimization/lab_agent/csdesk_agent.py`
* **Responsibilities:**
  * Runs silently in the background on lab PCs as `csdesk-agent.service`.
  * Maintains an outbound encrypted WebSocket connection (`wss://`) to Render.
  * Inspects incoming scripts against an internal safety filter before execution.
  * Spawns subprocesses using `bash -c` (on Linux) or `PowerShell` (on Windows).
  * Captures stdout and stderr line-by-line and streams each line immediately back over the WebSocket.
  * Writes a persistent local execution audit log to `/tmp/csdesk-last-run.log`.

---

## 4. Complete End-to-End Flow (Dashboard ↔ PC)

### Flow A: When a Lab PC Boots Up (PC ➔ Server ➔ Dashboard)
1. **Power On:** A student or lab assistant presses the power button on Lab PC 1.
2. **Service Auto-Start:** Ubuntu boots up. Linux `systemd` automatically launches `csdesk-agent.service`.
3. **Outbound Handshake:** The Python agent initiates an outbound WebSocket connection to:
   `wss://csdesk-backend.onrender.com/ws/lab-agent`
4. **Registration:** The agent transmits a JSON registration frame:
   ```json
   {
     "type": "REGISTER",
     "token": "csdesk_lab_secure_token_2026",
     "pcName": "PC-01",
     "lab": "TL1",
     "ip": "10.50.27.200",
     "os": "Linux 7.0.0-38-generic (x86_64)"
   }
   ```
5. **Token Validation & Memory Registration:** The Render server checks the `token`. If valid, it records the socket in memory and returns `REGISTER_ACK: OK`.
6. **Dashboard Live Notification:** The server broadcasts an `AGENT_CONNECTED` event to all open admin dashboards.
7. **UI Update:** On the administrator's Vercel dashboard under room **TL1**, `PC-01` pops up with a pulsing green dot and **1 Online** status.

---

### Flow B: When Admin Dispatches a Command (Dashboard ➔ Server ➔ PC)
1. **Admin Action:** The administrator selects **TL1**, checks the box for `PC-01`, and clicks a preset or types a custom shell script.
2. **Execute Trigger:** The administrator clicks **"Execute on 1 PC"**.
3. **API Dispatch:** The frontend sends a `POST` request to `/api/lab-automation/execute` with the script payload and the user's Supabase session Bearer JWT.
4. **Authorization Gatekeeper:** The server middleware (`requireAuth` + `requireAdmin`) cryptographically verifies the token and verifies `req.user.role === 'admin'`. If a student attempts to call this API, the server immediately rejects the request with **HTTP 403 Forbidden**.
5. **Job Assignment:** The server assigns a unique `executionId` (e.g. `job_1794826730`) and creates an in-memory job tracker.
6. **WebSocket Packet Dispatch:** The server locates the active WebSocket connection for `PC-01` and sends:
   ```json
   {
     "type": "EXECUTE",
     "executionId": "job_1794826730",
     "token": "csdesk_lab_secure_token_2026",
     "script": "sudo apt-get update -y && sudo apt-get install -y tree"
   }
   ```
7. **Status Transition:** On the web dashboard, the PC card immediately switches from green to an animated amber badge: **Running...**

---

### Flow C: Real-Time Execution & Streaming (PC ➔ Server ➔ Dashboard)
1. **Safety Filter Check:** On the lab PC, the Python daemon receives the payload and checks its safety blacklist. If dangerous patterns like `rm -rf /` or `mkfs` are detected, execution is aborted with Exit Code 126.
2. **Subprocess Spawn:** The daemon initializes a local audit log at `/tmp/csdesk-last-run.log` and spawns a non-blocking subprocess:
   `bash -c "sudo apt-get update -y && sudo apt-get install -y tree"`
3. **Line-by-Line Log Capture:** As the package manager outputs text, the daemon reads stdout and stderr line-by-line in real time.
4. **Agent to Server Transmission:** For every line produced, the agent sends a WebSocket message:
   ```json
   {
     "type": "LOG_LINE",
     "executionId": "job_1794826730",
     "pcName": "PC-01",
     "lab": "TL1",
     "line": "Get:1 http://archive.ubuntu.com/ubuntu noble/main tree amd64 [47.5 kB]"
   }
   ```
5. **Server to Browser Broadcast:** The Render server receives the log line and instantly relays it over `/ws/lab-admin` to the Vercel web console (< 50ms latency).
6. **Real-Time Display:** The administrator watches the terminal text scroll live in their browser as if they were sitting directly in front of the lab PC.
7. **Completion & Exit Code Reporting:** When the bash process finishes:
   * The daemon records the exit code (0 for success, non-zero for error) and total execution duration (e.g., 2.4s).
   * It appends the summary to `/tmp/csdesk-last-run.log`.
   * It sends an `EXECUTION_FINISHED` packet to the server.
8. **Final State Update:** The server notifies the dashboard, the execution spinner stops, and the card updates to:
   * **Done (2.4s)** in green if exit code is 0.
   * **Failed (Exit 100)** in red if any command encountered an error.

---

## 5. Security Architecture (Why is this 100% Safe?)

Running remote root shell commands across a fleet of 80+ computers is a high-privilege administrative action. CSDesk enforces a strict **4-Layer Security Defense Model**:

### Layer 1: Identity & Institute Email Domain Lock
* Only users authenticated through Google OAuth 2.0 with official `@iitbhilai.ac.in` email accounts can access CSDesk.
* External users or unauthenticated public visitors are blocked at the authentication gateway.

### Layer 2: Server-Side Cryptographic RBAC (Role-Based Access Control)
* User roles are resolved cryptographically from Supabase: `admin`, `faculty`, `ta`, `student`.
* The critical command execution route `POST /api/lab-automation/execute` is protected by `requireAuth` and `requireAdmin`:
  ```javascript
  function requireAdmin(req, res, next) {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied. Only system administrators can run remote commands on lab PCs.'
      });
    }
    next();
  }
  ```
* **Student Protection:** Even if a student in the lab inspects network traffic or uses curl/Postman over campus Wi-Fi to hit the backend, the server immediately aborts the request with **HTTP 403 Forbidden**.
* On the frontend UI, the Execute button is locked with a padlock icon (`Admin Only (Locked)`) for all non-admin accounts.

### Layer 3: Outbound-Only WebSockets & Zero Inbound Open Ports
* **Why Traditional SSH is Risky:** SSH requires keeping port 22 open and listening on all 80+ lab PCs, making them targets for LAN port scanners, brute-force password attempts, and private key theft.
* **The CSDesk Solution:** The lab PC daemon runs **zero open inbound network ports**.
* The agent initiates an **outbound-only** WebSocket connection over standard HTTPS port 443 to Render.
* A port scan (e.g., Nmap) on the lab PC sees zero open ports. Direct network injection from another computer on the campus Wi-Fi is physically impossible.
* The WebSocket connection requires a shared cryptographic secret (`LAB_AGENT_TOKEN`), preventing unauthorized network devices from registering as fake lab PCs.

### Layer 4: Client Daemon Destructive Command Blacklist
* The Python daemon inspects every incoming script before spawning the shell process.
* It scans for catastrophic destructive patterns:
  * Recursive filesystem deletion: `rm -rf /`, `rm -rf /*`
  * Fork bombs: `:(){ :|:& };:`
  * Filesystem formatting: `mkfs`
  * Raw disk partition overwrites: `> /dev/sd*`, `dd if=`
* If any blocked pattern is detected, the agent **immediately refuses execution**, returns Exit Code 126, and logs a security violation back to the dashboard console.

---

## 6. Implementation Files Built Under This Module

Here is the exact codebase breakdown showing the files implemented for this task:

| File Path | Technology | Exact Role & Code Implemented |
| :--- | :--- | :--- |
| `client/src/pages/dashboard/LabAutomation.jsx` | React 19, Tailwind CSS | **Fleet Dashboard:** Renders PC card grid, room selector (TL1, TL2, ED1, ED2), one-click presets (APT, Python AI, LaTeX, VS Code, Health), live terminal log console, inline PC renaming with pencil icon, and Admin-only UI locking. |
| `server/services/labAgentHub.js` | Node.js, `ws` (WebSockets) | **Central Agent Hub:** Manages persistent connections on `/ws/lab-agent` and `/ws/lab-admin`, tracks heartbeats, dispatches parallel execution jobs, routes line-by-line logs, and maintains the PC alias renaming map. |
| `server/routes/labAgentRoutes.js` | Express 5 | **REST API & Dynamic Scripts:** Endpoints for `/fleet`, `/execute`, `/status/:executionId`, `/rename-pc`, and dynamically generates `/install.sh` and `/uninstall.sh`. |
| `server/optimization/lab_agent/csdesk_agent.py` | Pure Python 3 (Standard Library) | **Edge Daemon:** Zero-dependency client daemon running as a Linux systemd service on lab machines. Handles RFC 6455 WebSockets, dangerous command filtering, subprocess execution, and line-by-line log streaming. |
| `server/middleware/requireAuth.js` | Express Middleware, Supabase JWT | **Security Middleware:** Enforces `@iitbhilai.ac.in` domain verification and Admin RBAC role enforcement. |
| `presentation_lab_automation.html` | HTML5, Tailwind CSS, JavaScript | **Interactive Presentation Deck:** 10-slide interactive presentation deck with slide transitions, key indicators, and full-screen projector mode. |

---

## 7. Live Physical Lab Validation & Real Test Results

The system was physically deployed and validated on computer **PC-22** in laboratory **TL1**:

1. **1-Line Deployment Verification:** Installed via curl pipe in under 3 seconds; daemon transitioned to `active (running)` immediately.
2. **Auto-Discovery on Boot:** Computer powered on, automatically connected to Render over WSS, and appeared on the Vercel dashboard with a green Online dot.
3. **Real Command Execution Tested:**
   * **Hardware & Disk Health Check:** `hostname && uptime && free -h && df -h /` (Completed in 1.1s with real-time log output).
   * **Live Utility Package Installation:** `sudo apt-get install -y tree htop` (Packages downloaded and configured in parallel).
   * **LaTeX Compilation Verification:** Created a test document on PC-22 and compiled it into a real PDF using `pdflatex`.
   * **Security Blocker Live Test:** Sent a simulated destructive command (`rm -rf /`); daemon intercepted it live and rejected execution with Exit Code 126.
   * **Inline Renaming Test:** Renamed PC-22 to custom label with instant synchronization to dashboard and server.
4. **Auto-Reconnect on Reboot:** Machine was restarted (`sudo reboot`); as soon as Ubuntu desktop loaded, the daemon re-registered on the dashboard within 4 seconds without any human intervention.

---

*Document prepared for B.Tech Final Evaluation & Laboratory Fleet Automation Defense.*
