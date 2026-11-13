# 🖥️ CSDesk — Lab Remote Software Automation (Complete Guide)

## 1. Overview & Architecture

The **Lab Remote Software Automation** module in CSDesk enables university lab administrators to deploy software packages, execute shell commands, and monitor machine status across all computers in a lab simultaneously (e.g., TL1, TL2, ED1, ED2).

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CSDesk Master Dashboard                         │
│                    (Your Laptop / Admin PC in Lab)                     │
│                                                                        │
│ • Select Lab: [ TL1 (106) ▼ ]                                          │
│ • Target Fleet: Filters and displays ONLY online PCs in selected room  │
│ • Script Editor: Presets + Custom Bash / Shell script box              │
│ • Live Streaming Console: Real-time terminal output stream per PC      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ WebSockets over LAN
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│  Lab PC #1 (TL1) │       │  Lab PC #2 (TL1) │       │  Lab PC #N (TL1) │
│   csdesk-agent   │       │   csdesk-agent   │       │   csdesk-agent   │
│ (systemd daemon) │       │ (systemd daemon) │       │ (systemd daemon) │
└──────────────────┘       └──────────────────┘       └──────────────────┘
```

---

## 2. Key Highlights of the Architecture

* **Zero Pip Dependencies on Student PCs:** The agent script uses **pure Python 3 standard library**. It installs in 2 seconds with no pip packages required.
* **Auto-Discovery on Power-On:** When a lab PC powers on and boots into Ubuntu, the Linux `systemd` daemon automatically connects to the CSDesk master server.
* **Room-First Filtering:** Selecting a lab room (e.g., `TL1`) displays **only the machines connected in that room**. Other rooms (`ED1`, `ED2`) are completely isolated.
* **Dual-Redundancy Streaming:** Real-time WebSockets for sub-second terminal streaming + automatic REST status polling fallback.
* **Built-in Security:**
  * Shared Secret Token (`LAB_AGENT_TOKEN`) rejects rogue devices.
  * Command Safety Blocker refuses destructive commands like `rm -rf /` or `mkfs`.

---

## 3. How to Set Up the Lab PCs (Run ONCE per PC)

You have two easy ways to set up the lab machines:

### **Method A: The 1-Line Setup (Walk-up method)**

Go to a lab machine in **TL1**, open terminal, and run:

```bash
curl -sSL http://<MASTER_IP>:5000/api/lab-automation/install.sh | sudo bash -s -- TL1 http://<MASTER_IP>:5000 [OPTIONAL_CUSTOM_PC_NAME]
```

*(Examples)*:
* Auto hostname: `curl -sSL http://192.168.1.15:5000/api/lab-automation/install.sh | sudo bash -s -- TL1 http://192.168.1.15:5000`
* With Custom Name: `curl -sSL http://192.168.1.15:5000/api/lab-automation/install.sh | sudo bash -s -- TL1 http://192.168.1.15:5000 PC-01`

**What this 1-line command does:**

1. Downloads `csdesk_agent.py` into `/opt/csdesk-agent/`.
2. Creates `/etc/systemd/system/csdesk-agent.service`.
3. Enables and starts the background service (`systemctl enable --now csdesk-agent`).
4. **Done!** You never have to touch this machine again. Whenever it turns on, it connects to CSDesk automatically.

---

### **Editing / Renaming PC Labels Directly from the Dashboard**
You can also change any PC's label at any time without touching the machine:
1. On the CSDesk dashboard, find the PC's card (e.g. `t1-pc-cl1`).
2. Click the small **Pencil (Edit)** icon next to its name.
3. Type your custom label (e.g., `PC 01` or `TL1-Desk-15`) and press **Enter** (or click the green checkmark).
4. The name is saved instantly, persisted in `localStorage`, and synced to the server hub. The original hostname remains visible in subtle text below the custom label.

---

### **Method B: Mass Automated Setup via SSH (All 40 PCs in 30 Seconds!)**

Because all lab PCs share the same credentials and have SSH enabled, you don't even need to walk to each machine:

Run this loop from your master laptop:

```bash
MASTER_IP="192.168.1.15"   # Your laptop's IP
LAB_ROOM="TL1"
PASSWORD="your_lab_password"

for ip in 192.168.1.{101..140}; do
  sshpass -p "$PASSWORD" ssh -o StrictHostKeyChecking=no student@$ip \
    "curl -sSL http://${MASTER_IP}:5000/api/lab-automation/install.sh | sudo -S bash -s -- ${LAB_ROOM} http://${MASTER_IP}:5000" &
done
wait
echo "[✓] All lab machines configured and online!"
```

---

## 4. How to Test and Run Commands in the Lab

### **Step 1: Start Dev Servers on Master Laptop**

```bash
# Terminal 1:
cd /home/durgesh/Desktop/BTech-Project/CSDesk/server && npm run dev

# Terminal 2:
cd /home/durgesh/Desktop/BTech-Project/CSDesk/client && npm run dev
```

### **Step 2: Open Master Dashboard**

1. Open browser at: **`http://localhost:5173/dashboard/lab-software`**
2. In the top dropdown, select your lab room: **TL1 (106)**.
3. All powered-on PCs in TL1 will appear with a 🟢 green dot showing their hostname and local IP.

---

### **Step 3: Real Test Scenarios to Try**

#### **Scenario 1: System Health & Uptime Check**

In the script box, type:

```bash
hostname && uptime && free -m && df -h /
```

Click **"Execute on Selected PCs"**.

* **Result:** You will see the memory and disk space of each lab PC stream live in the console.

#### **Scenario 2: Update Package Index & Install Packages**

```bash
sudo apt-get update -y && sudo apt-get install -y gcc g++ python3-pip
```

* **Result:** The installation progress lines stream in real-time. Cards turn 🟢 **Done (X.XXs)** when finished.

#### **Scenario 3: Send Desktop Notification Banner**

```bash
notify-send "CSDesk Notification" "Software installation completed successfully by Lab Admin."
```

* **Result:** A notification banner pops up on the student desktop screen.

---

### **How to Check the Error Directly on the Physical PC**

If a PC shows an error on your dashboard and you physically walk up to that machine in the lab, you can inspect what happened locally using **3 easy methods**:

#### **Method 1: View the Dedicated Execution Log (Easiest)**

Open terminal on that PC and run:

```bash
cat /tmp/csdesk-last-run.log
```

* **What you see:** The exact command sent from CSDesk, start timestamp, complete terminal output line-by-line, and the final exit code and error.

#### **Method 2: Check Systemd Service Logs**

```bash
journalctl -u csdesk-agent -e
```

* Jumps directly to the end of the background service logs.

#### **Method 3: Check Agent Status**

```bash
systemctl status csdesk-agent
```

* Shows whether the daemon is active, its PID, and the last 10 log messages.

---

## 5. How to Cleanly Remove / Uninstall from a PC

If you ever want to completely remove the agent from a PC at the end of the semester:

Run this single command on the machine:

```bash
curl -sSL http://<MASTER_IP>:5000/api/lab-automation/uninstall.sh | sudo bash
```

**What it does:**

* Stops the running background daemon (`systemctl stop csdesk-agent`).
* Disables auto-start on boot (`systemctl disable csdesk-agent`).
* Deletes `/etc/systemd/system/csdesk-agent.service` and `/opt/csdesk-agent/`.
* Reloads systemd daemon.
* Leaves the PC 100% clean with zero leftover files.

---

## 6. Security Architecture & Access Control (Admin-Only Enforcement)

Running remote shell commands with root privileges across a fleet of 80+ computers is a high-privilege administrative action. To guarantee that students, unauthorized users, or external network visitors **CANNOT** execute commands or tamper with lab machines, CSDesk implements **4 Strict Layers of Security Defense**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              4 LAYERS OF DEFENSE                                       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Layer 1: Google OAuth + Domain Whitelist                                                │
│          Only authenticated @iitbhilai.ac.in institute accounts can log into CSDesk    │
│                                                                                        │
│ Layer 2: Server-Side Role-Based Access Control (RBAC)                                  │
│          POST /api/lab-automation/execute strictly requires user.role === 'admin'       │
│          Students & faculty receive HTTP 403 Forbidden. Frontend UI is locked.        │
│                                                                                        │
│ Layer 3: Cryptographic Shared Secret Token (LAB_AGENT_TOKEN)                           │
│          Every lab machine requires a matching secret token to register & run commands │
│          Rogue network devices or unauthorized scripts are immediately disconnected   │
│                                                                                        │
│ Layer 4: Client Daemon Safety Blocker & Execution Auditing                             │
│          Blocks catastrophic commands: rm -rf /, :(){ :|:& };:, mkfs, > /dev/sd*       │
│          All executions logged locally to /tmp/csdesk-last-run.log with timestamps     │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### **1. Who Can Execute Commands?**

* **Admin Role (System Administrators / Lab Incharge):** Full authority to view fleet and dispatch remote commands.
* **Student Role:** Can view the fleet status (if permitted) but the execution interface is **locked** and any API dispatch is blocked with `403 Forbidden`.
* **Unauthenticated Network Visitors:** Completely blocked by `requireAuth` middleware with `401 Unauthorized`.

### **2. Why Can't a Student on the Same Wi-Fi Send Commands?**

Even if a student in the lab uses `curl` or Postman on the college Wi-Fi to hit your backend:

1. They do not have an active Supabase JWT with `role === 'admin'`.
2. The server's `requireAuth` + `requireAdmin` middleware immediately rejects their request:
   ```json
   {
     "error": "Access denied. Only system administrators can run remote commands on lab PCs."
   }
   ```
3. The lab agent daemon only accepts execution payloads that arrive over its established authenticated WebSocket connection with the verified `LAB_AGENT_TOKEN`. Direct socket injection is impossible.

---

## 7. Viva & Project Presentation Summary

If your professor or external examiner asks how this feature works:

> *"Our Lab Remote Software Automation module provides automated, parallel software deployment across departmental computer laboratories. We engineered a lightweight, zero-dependency Python daemon that runs as a Linux systemd service on each student computer.*
>
> *When a machine boots into Ubuntu, it establishes a persistent, token-authenticated WebSocket connection to the CSDesk backend. The dashboard filters machines by room (e.g. TL1, ED1), allowing the administrator to dispatch shell commands across 40+ computers simultaneously. Terminal output (stdout and stderr) is captured line-by-line and streamed in real-time to the web browser via WebSockets, supported by REST fallback polling for maximum reliability. The architecture is protected with authentication tokens, dangerous-command safety filters, and a one-line clean uninstaller."*
