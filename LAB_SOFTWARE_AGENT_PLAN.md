
# 🛠️ Lab Software Automation (Agent-Based Architecture) — Implementation & Testing Plan

## 1. Executive Summary

This document specifies the architecture, component implementation, user experience flow, and testing strategy for **Lab Software Installs** (`/dashboard/lab-software`) in CSDesk.

The system uses a **Lightweight Client-Server Agent Architecture**:

* A tiny Python background agent runs on lab PCs and connects via **WebSockets** to the CSDesk Master Server.
* **No IP tracking needed:** PCs report their own hostname, lab room, and OS automatically.
* **Instant Dual-Boot awareness:** If a machine is in Windows or off, it doesn't connect. Only active Linux PCs show as Online.
* **Filtered by Room:** The administrator selects a lab room (e.g., `TL1`, `TL2`, `ED1`, `ED2`), and the dashboard displays **only the online PCs belonging to that selected room**.
* **Live Streaming:** Terminal logs stream directly to the web dashboard in real time as commands execute.

---

## 2. End-to-End Workflow & User Interface

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Lab Software Installs Dashboard                       │
│                                                                             │
│  1. SELECT LAB ROOM:                                                        │
│     [ TL1 (106) ▼ ]   • 38 PCs Online | 2 Offline                          │
│                                                                             │
│  2. ONLINE FLEET FOR THIS ROOM:                                             │
│     ☑ Select All (38 Online)                                                │
│     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
│     │ ☑ TL1-PC01   │ │ ☑ TL1-PC02   │ │ ☑ TL1-PC03   │ │ ☑ TL1-PC04   │    │
│     │ 🟢 192.168.1.5│ │ 🟢 192.168.1.6│ │ 🟢 192.168.1.7│ │ 🟢 192.168.1.8│    │
│     │ Ubuntu 24.04 │ │ Ubuntu 24.04 │ │ Ubuntu 24.04 │ │ Ubuntu 24.04 │    │
│     └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘    │
│                                                                             │
│  3. COMMAND / SCRIPT TO EXECUTE:                                            │
│     Presets: [Update APT] [Python AI Stack] [VS Code & Git] [Clean Cache]   │
│     ┌─────────────────────────────────────────────────────────────────────┐ │
│     │ sudo apt-get update && sudo apt-get install -y gcc g++ python3-pip  │ │
│     │ pip install numpy torch --break-system-packages                     │ │
│     └─────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│                      [ 🚀 Execute on 38 Selected PCs ]                     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  4. REAL-TIME STREAMING EXECUTION VIEWER                                     │
│     Progress: [██████████████████████████████░░░░] 35/38 Finished           │
│                                                                             │
│     Sidebar (PC List):           Terminal Console (Selected PC: TL1-PC01):  │
│     ┌──────────────────────┐    ┌─────────────────────────────────────────┐ │
│     │ 🟢 TL1-PC01 (Done 14s)│    │ [TL1-PC01] Hit:1 http://archive.ubuntu  │ │
│     │ 🟡 TL1-PC02 (Running)│    │ [TL1-PC01] Reading package lists...     │ │
│     │ 🟢 TL1-PC03 (Done 12s)│    │ [TL1-PC01] Unpacking gcc-11 (11.4.0)... │ │
│     │ 🔴 TL1-PC04 (Failed) │    │ [TL1-PC01] Setting up gcc-11...         │ │
│     └──────────────────────┘    │ [TL1-PC01] [SUCCESS] Completed in 14.2s │ │
│                                 └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. System Architecture & Components

### 3.1. Master Server (`server/services/labAgentHub.js`)

* Mounts a WebSocket server on the Express HTTP server at path `/ws/lab-agent`.
* Maintains in-memory connected agent registry:
  ```typescript
  Map<string, {
    socketId: string,
    pcName: string,      // e.g. "TL1-PC01"
    lab: string,         // e.g. "TL1"
    ip: string,          // e.g. "192.168.1.101"
    os: string,          // e.g. "Linux 6.8 (Ubuntu 24.04)"
    status: "idle" | "busy",
    lastHeartbeat: number
  }>
  ```
* Provides REST/WebSocket endpoints for the React frontend:
  * `GET /api/lab-automation/fleet`: Get currently online PCs (filtered by lab room).
  * `POST /api/lab-automation/execute`: Broadcast command to selected PCs.
  * `GET /api/lab-automation/install-agent.sh`: Serves the 1-line client install script.

### 3.2. Lab PC Agent (`server/optimization/lab_agent/csdesk_agent.py`)

* Pure Python 3 (standard library only — **no pip install needed**).
* Uses Python `urllib` / raw sockets for WebSocket connection.
* Periodically sends heartbeats every 5 seconds.
* Listens for `EXECUTE_COMMAND`:
  * Spawns bash subprocess: `subprocess.Popen(['/bin/bash', '-c', command], stdout=PIPE, stderr=STDOUT)`.
  * Streams stdout line-by-line back to the master server.
  * Sends completion event with `exit_code` and duration.

### 3.3. 1-Line Client Installer (`install-agent.sh`)

* Executed once on a student PC (or baked into the lab disk image):
  ```bash
  curl -sSL http://<MASTER_IP>:5000/api/lab-automation/install-agent.sh | sudo bash -s -- --lab TL1
  ```
* Creates a `systemd` service (`/etc/systemd/system/csdesk-agent.service`) so the agent automatically connects on boot.

### 3.4. React Frontend (`client/src/pages/dashboard/LabAutomation.jsx`)

* **Room Selector:** Top dropdown allowing selection of `TL1`, `TL2`, `ED1`, `ED2`, or `All Labs`.
* **Filtered Grid:** Only displays online PCs matching the selected room.
* **Command Box:** Quick presets + full script editor.
* **Live Streaming Console:** Split-pane with PC status list and live terminal output.

---

## 4. Implementation Steps (Execution Order)

1. **Step 1: Backend Hub**

   * Create `server/services/labAgentHub.js` to manage WebSocket connections and event dispatching.
   * Update `server/index.js` to attach the WebSocket server to the HTTP instance.
   * Add `server/routes/labAgentRoutes.js` for fleet queries and command execution.
2. **Step 2: Python Agent**

   * Write `server/optimization/lab_agent/csdesk_agent.py` using pure Python 3 standard library.
   * Add support for auto-reconnect, command execution, and real-time line streaming.
3. **Step 3: 1-Line Installer Script**

   * Write `server/optimization/lab_agent/install-agent.sh` that installs the systemd service.
4. **Step 4: Frontend UI**

   * Create `client/src/pages/dashboard/LabAutomation.jsx`.
   * Wire it into `client/src/App.jsx` at path `/dashboard/lab-software`.
   * Implement Room filtering, PC selection, command editor, and live streaming console.
5. **Step 5: End-to-End Verification**

   * Run local agent instances to simulate multiple PCs in TL1 and ED1.
   * Test room filtering in the browser.
   * Execute real commands and observe live terminal streaming.

---

## 5. How We Will Test This Locally

We can test the entire system right now on your machine without needing 40 physical PCs:

1. **Start CSDesk backend and frontend**.
2. **Launch Simulated Agents:**
   * Run simulated Agent 1: `python3 csdesk_agent.py --server http://localhost:5000 --lab TL1 --pc TL1-PC01`
   * Run simulated Agent 2: `python3 csdesk_agent.py --server http://localhost:5000 --lab TL1 --pc TL1-PC02`
   * Run simulated Agent 3: `python3 csdesk_agent.py --server http://localhost:5000 --lab ED1 --pc ED1-PC01`
3. **Verify in Browser (`/dashboard/lab-software`)**:
   * Select `TL1`: Should only show `TL1-PC01` and `TL1-PC02`!
   * Select `ED1`: Should only show `ED1-PC01`!
4. **Test Live Command Execution**:
   * Type: `echo "Hello from $(hostname)"; uname -a; date`
   * Click **Execute**.
   * Observe live progress, color change to 🟢, and real-time terminal output!
