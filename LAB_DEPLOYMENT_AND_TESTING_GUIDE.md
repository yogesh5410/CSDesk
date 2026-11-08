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
curl -sSL http://<MASTER_IP>:5000/api/lab-automation/install.sh | sudo bash -s -- TL1 http://<MASTER_IP>:5000
```
*(Replace `<MASTER_IP>` with your master laptop's local IP, e.g. `192.168.1.15`)*.

**What this 1-line command does:**
1. Downloads `csdesk_agent.py` into `/opt/csdesk-agent/`.
2. Creates `/etc/systemd/system/csdesk-agent.service`.
3. Enables and starts the background service (`systemctl enable --now csdesk-agent`).
4. **Done!** You never have to touch this machine again. Whenever it turns on, it connects to CSDesk automatically.

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

## 6. Viva & Project Presentation Summary

If your professor or external examiner asks how this feature works:

> *"Our Lab Remote Software Automation module provides automated, parallel software deployment across departmental computer laboratories. We engineered a lightweight, zero-dependency Python daemon that runs as a Linux systemd service on each student computer.*
>
> *When a machine boots into Ubuntu, it establishes a persistent, token-authenticated WebSocket connection to the CSDesk backend. The dashboard filters machines by room (e.g. TL1, ED1), allowing the administrator to dispatch shell commands across 40+ computers simultaneously. Terminal output (stdout and stderr) is captured line-by-line and streamed in real-time to the web browser via WebSockets, supported by REST fallback polling for maximum reliability. The architecture is protected with authentication tokens, dangerous-command safety filters, and a one-line clean uninstaller."*
