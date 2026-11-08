import { useState, useEffect, useRef } from "react";
import { apiUrl } from "../../lib/api";
import {
  Monitor,
  Terminal,
  Play,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Copy,
  Check,
  Cpu,
  Layers,
  Sparkles,
  RotateCcw,
  Trash2
} from "lucide-react";

const LAB_OPTIONS = [
  { id: "TL1", name: "TL1 (106)", capacity: 84 },
  { id: "TL2", name: "TL2 (105)", capacity: 20 },
  { id: "ED1_312", name: "ED1 (312)", capacity: 32 },
  { id: "ED1_308", name: "ED1 (308)", capacity: 32 },
  { id: "ED1_320", name: "ED1 (320)", capacity: 80 },
  { id: "ED2_302", name: "ED2 (302)", capacity: 80 },
];

const PRESETS = [
  {
    label: "Update APT Packages",
    cmd: "sudo apt-get update -y && sudo apt-get upgrade -y",
  },
  {
    label: "Install Python AI Stack",
    cmd: "sudo apt-get install -y python3-pip python3-dev && pip install numpy pandas torch torchvision --break-system-packages",
  },
  {
    label: "Install Dev Tools (GCC/G++/Git)",
    cmd: "sudo apt-get install -y build-essential gcc g++ gdb make git curl",
  },
  {
    label: "Install VS Code",
    cmd: "sudo snap install code --classic",
  },
  {
    label: "System Health & Disk Space",
    cmd: "hostname && uptime && df -h / && free -m",
  },
];

export default function LabAutomation() {
  const [selectedLab, setSelectedLab] = useState("TL1");
  const [fleet, setFleet] = useState([]);
  const [selectedPcs, setSelectedPcs] = useState([]);
  const [script, setScript] = useState("hostname && uptime && free -m");
  const [copied, setCopied] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionId, setExecutionId] = useState(null);

  // Per-PC execution tracking: { [pcName]: { status: 'idle'|'running'|'success'|'failed', logs: [], duration: null, exitCode: null } }
  const [pcStates, setPcStates] = useState({});
  const [activeConsolePc, setActiveConsolePc] = useState(null);

  const terminalEndRef = useRef(null);

  // 1. Fetch Fleet & Filter for Selected Lab
  const fetchFleet = async () => {
    try {
      const res = await fetch(apiUrl(`/api/lab-automation/fleet?lab=${selectedLab}`));
      const data = await res.json();
      if (data.agents) {
        setFleet(data.agents);
        // By default select all online PCs in this lab if none selected
        setSelectedPcs(data.agents.map((a) => a.pcName));
      }
    } catch (err) {
      console.error("Failed to fetch fleet:", err);
    }
  };

  useEffect(() => {
    fetchFleet();
    setActiveConsolePc(null);
    setPcStates({});
    const interval = setInterval(fetchFleet, 5000);
    return () => clearInterval(interval);
  }, [selectedLab]);

  // 2. Connect to Admin WebSocket for live logs and events
  useEffect(() => {
    let ws;
    try {
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = import.meta.env.VITE_API_BASE_URL
        ? import.meta.env.VITE_API_BASE_URL.replace(/^https?:\/\//, "").replace(/\/+$/, "")
        : window.location.host;
      const wsUrl = `${wsProtocol}//${host}/ws/lab-admin`;

      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleWebSocketMessage(msg);
        } catch (e) {}
      };

      ws.onerror = () => {};
    } catch (err) {
      console.error("Admin WS error:", err);
    }

    return () => {
      if (ws) ws.close();
    };
  }, [selectedLab]);

  // 3. Dual Redundancy: Fallback REST polling during execution
  useEffect(() => {
    if (!isExecuting || !executionId) return;

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(apiUrl(`/api/lab-automation/status/${executionId}`));
        if (!res.ok) return;
        const data = await res.json();
        if (data.pcs) {
          setPcStates((prev) => {
            const next = { ...prev };
            let hasChanges = false;
            let allDone = true;

            for (const [pcName, pcInfo] of Object.entries(data.pcs)) {
              if (next[pcName]) {
                if (next[pcName].status !== pcInfo.status || (pcInfo.logs && next[pcName].logs.length !== pcInfo.logs.length)) {
                  next[pcName] = {
                    ...next[pcName],
                    status: pcInfo.status,
                    logs: pcInfo.logs && pcInfo.logs.length > 0 ? pcInfo.logs : next[pcName].logs,
                    exitCode: pcInfo.exitCode,
                    duration: pcInfo.duration,
                    error: pcInfo.error,
                  };
                  hasChanges = true;
                }
              }
              if (pcInfo.status === "running") {
                allDone = false;
              }
            }

            if (allDone) {
              setIsExecuting(false);
            }

            return hasChanges ? next : prev;
          });
        }
      } catch (err) {}
    }, 1000);

    return () => clearInterval(pollInterval);
  }, [isExecuting, executionId]);

  const handleWebSocketMessage = (msg) => {
    if (msg.type === "EXECUTION_LOG") {
      setPcStates((prev) => {
        const current = prev[msg.pcName] || { status: "running", logs: [] };
        return {
          ...prev,
          [msg.pcName]: {
            ...current,
            status: "running",
            logs: [...current.logs, msg.line],
          },
        };
      });
    } else if (msg.type === "EXECUTION_RESULT") {
      setPcStates((prev) => {
        const current = prev[msg.pcName] || { logs: [] };
        const isSuccess = msg.exitCode === 0;
        const updated = {
          ...prev,
          [msg.pcName]: {
            ...current,
            status: isSuccess ? "success" : "failed",
            exitCode: msg.exitCode,
            duration: msg.duration,
            error: msg.error,
          },
        };

        // If all active PCs have completed, turn off executing spinner
        const allDone = Object.values(updated).every(
          (s) => s.status === "success" || s.status === "failed"
        );
        if (allDone) {
          setIsExecuting(false);
        }

        return updated;
      });
    } else if (msg.type === "AGENT_DISCONNECTED") {
      setPcStates((prev) => {
        if (prev[msg.pcName] && prev[msg.pcName].status === "running") {
          const updated = {
            ...prev,
            [msg.pcName]: {
              ...prev[msg.pcName],
              status: "failed",
              error: "Disconnected unexpectedly",
            },
          };
          const allDone = Object.values(updated).every(
            (s) => s.status === "success" || s.status === "failed"
          );
          if (allDone) setIsExecuting(false);
          return updated;
        }
        return prev;
      });
      fetchFleet();
    } else if (msg.type === "AGENT_CONNECTED") {
      fetchFleet();
    }
  };

  // Auto-scroll terminal console
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [pcStates, activeConsolePc]);

  // Auto-reset and clean console when all PCs disconnect
  useEffect(() => {
    if (fleet.length === 0) {
      setIsExecuting(false);
      setActiveConsolePc(null);
      setPcStates({});
      setSelectedPcs([]);
    } else {
      if (activeConsolePc && !fleet.some((p) => p.pcName === activeConsolePc)) {
        setActiveConsolePc(fleet[0]?.pcName || null);
      } else if (!activeConsolePc && fleet.length > 0) {
        setActiveConsolePc(fleet[0]?.pcName || null);
      }
    }
  }, [fleet]);

  const clearConsole = () => {
    if (activeConsolePc) {
      setPcStates((prev) => ({
        ...prev,
        [activeConsolePc]: {
          ...(prev[activeConsolePc] || {}),
          logs: [],
        },
      }));
    } else {
      setPcStates({});
    }
  };

  // Handle PC Selection Checkboxes
  const toggleSelectPc = (pcName) => {
    setSelectedPcs((prev) =>
      prev.includes(pcName) ? prev.filter((p) => p !== pcName) : [...prev, pcName]
    );
  };

  const toggleSelectAll = () => {
    if (selectedPcs.length === fleet.length) {
      setSelectedPcs([]);
    } else {
      setSelectedPcs(fleet.map((a) => a.pcName));
    }
  };

  // Execute Command
  const handleExecute = async () => {
    if (!script.trim() || selectedPcs.length === 0) return;

    setIsExecuting(true);
    const newExecId = `job_${Date.now()}`;
    setExecutionId(newExecId);

    // Initialize state for each selected PC
    const initial = {};
    selectedPcs.forEach((pc) => {
      initial[pc] = { status: "running", logs: [`[>] Launching execution on ${pc}...`], exitCode: null };
    });
    setPcStates(initial);
    setActiveConsolePc(selectedPcs[0]);

    try {
      const res = await fetch(apiUrl("/api/lab-automation/execute"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lab: selectedLab,
          targetPcs: selectedPcs,
          script: script.trim(),
          executionId: newExecId,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        alert("Execution failed to dispatch: " + (data.error || "Unknown"));
        setIsExecuting(false);
      }
    } catch (err) {
      alert("Network error: " + err.message);
      setIsExecuting(false);
    }
  };

  const copyInstallCommand = () => {
    const host = window.location.hostname;
    const cmd = `curl -sSL http://${host}:5000/api/lab-automation/install.sh | sudo bash -s -- ${selectedLab}`;
    navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeLogs = activeConsolePc && pcStates[activeConsolePc] ? pcStates[activeConsolePc].logs : [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-indigo-900 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-blue-500/30 text-blue-200 text-xs px-2.5 py-0.5 rounded-full font-medium border border-blue-400/30">
              Live Fleet Control
            </span>
            <span className="flex items-center gap-1.5 text-xs text-emerald-300 font-medium bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-400/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              WebSocket Connected
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Lab Remote Software Automation</h1>
          <p className="text-blue-200 text-sm mt-0.5">
            Select a lab room to manage its active machines and deploy packages in parallel.
          </p>
        </div>

        {/* Room Selector Dropdown */}
        <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md p-2 rounded-xl border border-white/20">
          <Layers className="w-5 h-5 text-blue-200" />
          <div className="flex flex-col">
            <span className="text-[11px] text-blue-200 uppercase font-semibold tracking-wider">Target Lab Room</span>
            <select
              value={selectedLab}
              onChange={(e) => setSelectedLab(e.target.value)}
              className="bg-transparent text-white font-bold text-base focus:outline-none cursor-pointer pr-4"
            >
              {LAB_OPTIONS.map((lab) => (
                <option key={lab.id} value={lab.id} className="text-slate-900">
                  {lab.name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={fetchFleet}
            title="Refresh Fleet"
            className="p-2 hover:bg-white/20 rounded-lg transition-colors text-white"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Room Fleet Cards & Status */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <Monitor className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-800">
              Active PCs in <span className="text-indigo-600">{selectedLab}</span>
            </h2>
            <span className="bg-emerald-50 text-emerald-700 text-xs px-2.5 py-0.5 rounded-full font-bold border border-emerald-200">
              {fleet.length} Online
            </span>
          </div>

          {fleet.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSelectAll}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors"
              >
                {selectedPcs.length === fleet.length ? "Deselect All" : "Select All Online"}
              </button>
              <span className="text-xs text-slate-500 font-medium">
                ({selectedPcs.length} of {fleet.length} selected)
              </span>
            </div>
          )}
        </div>

        {/* Fleet Grid */}
        {fleet.length === 0 ? (
          <div className="text-center py-10 px-4">
            <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Monitor className="w-7 h-7" />
            </div>
            <h3 className="text-base font-semibold text-slate-800 mb-1">
              No PCs currently connected in {selectedLab}
            </h3>
            <p className="text-sm text-slate-500 max-w-lg mx-auto mb-5">
              Machines in this room are either turned off or booted into Windows. To connect an Ubuntu PC to this room, run this 1-line command on that PC:
            </p>

            <div className="max-w-xl mx-auto flex items-center bg-slate-900 text-slate-200 px-4 py-2.5 rounded-xl font-mono text-xs text-left shadow-inner">
              <span className="text-emerald-400 mr-2">$</span>
              <span className="flex-1 overflow-x-auto select-all">
                curl -sSL http://{window.location.hostname}:5000/api/lab-automation/install.sh | sudo bash -s -- {selectedLab}
              </span>
              <button
                onClick={copyInstallCommand}
                className="ml-3 p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                title="Copy Command"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 pt-4">
            {fleet.map((pc) => {
              const isSelected = selectedPcs.includes(pc.pcName);
              const pcState = pcStates[pc.pcName];

              return (
                <div
                  key={pc.pcName}
                  onClick={() => toggleSelectPc(pc.pcName)}
                  className={`p-3 rounded-xl border transition-all cursor-pointer select-none relative ${
                    isSelected
                      ? "bg-indigo-50/70 border-indigo-500 shadow-sm ring-1 ring-indigo-500"
                      : "bg-white border-slate-200 hover:border-slate-300 opacity-60"
                  }`}
                >
                  <div className="flex justify-between items-start mb-1.5">
                    <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5 truncate">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      {pc.pcName}
                    </span>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="rounded text-indigo-600 focus:ring-0 cursor-pointer"
                    />
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 truncate">{pc.ip}</div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">{pc.os}</div>

                  {pcState && (
                    <div className="mt-2 pt-1.5 border-t border-slate-200/60 flex items-center justify-between text-[11px]">
                      {pcState.status === "running" && (
                        <span className="text-amber-600 font-semibold flex items-center gap-1">
                          <RefreshCw className="w-3 h-3 animate-spin" /> Running
                        </span>
                      )}
                      {pcState.status === "success" && (
                        <span className="text-emerald-600 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Done ({pcState.duration}s)
                        </span>
                      )}
                      {pcState.status === "failed" && (
                        <span className="text-rose-600 font-semibold flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Failed
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Script Editor & Execution Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Command Box & Presets */}
        <div className="lg:col-span-6 bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-800 text-sm">Shell Command / Script</h3>
              </div>
              <span className="text-[11px] font-medium text-slate-400">Runs as root on all targets</span>
            </div>

            {/* Presets */}
            <div className="mb-3">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1.5">
                Quick Presets:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setScript(p.cmd)}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-700 border border-slate-200 transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Textarea */}
            <div className="relative">
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                rows={6}
                placeholder="Type shell script or bash commands here..."
                className="w-full bg-slate-900 text-emerald-400 font-mono text-xs p-3.5 rounded-xl border border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none shadow-inner leading-relaxed"
              />
            </div>
          </div>

          <div className="pt-4 mt-2 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">
              Target: <strong className="text-slate-800">{selectedPcs.length} PC(s)</strong> in{" "}
              <strong className="text-indigo-600">{selectedLab}</strong>
            </span>
            <div className="flex items-center gap-2">
              {isExecuting && (
                <button
                  type="button"
                  onClick={() => setIsExecuting(false)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition-colors"
                >
                  Reset Status
                </button>
              )}
              <button
                type="button"
                onClick={handleExecute}
                disabled={isExecuting || selectedPcs.length === 0 || !script.trim()}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold text-sm px-5 py-2.5 rounded-xl shadow-md transition-all active:scale-[0.98]"
              >
                <Play className="w-4 h-4 fill-current" />
                {isExecuting ? "Executing..." : `Execute on ${selectedPcs.length} PCs`}
              </button>
            </div>
          </div>
        </div>

        {/* Right: Live Terminal Log Viewer */}
        <div className="lg:col-span-6 bg-slate-950 rounded-xl border border-slate-800 shadow-xl p-4 flex flex-col h-[380px]">
          {/* Terminal Header */}
          <div className="flex justify-between items-center pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500/80"></span>
              <span className="w-3 h-3 rounded-full bg-amber-500/80"></span>
              <span className="w-3 h-3 rounded-full bg-emerald-500/80"></span>
              <span className="text-xs font-mono text-slate-400 ml-2">Live Console Stream</span>
            </div>

            {/* PC Selector and Clear Button */}
            <div className="flex items-center gap-2">
              {selectedPcs.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 font-mono">Viewing PC:</span>
                  <select
                    value={activeConsolePc || ""}
                    onChange={(e) => setActiveConsolePc(e.target.value)}
                    className="bg-slate-900 border border-slate-700 text-emerald-400 text-xs font-mono rounded px-2 py-1 focus:outline-none cursor-pointer"
                  >
                    {selectedPcs.map((pc) => (
                      <option key={pc} value={pc}>
                        {pc}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {activeLogs.length > 0 && (
                <button
                  type="button"
                  onClick={clearConsole}
                  title="Clear Console Output"
                  className="p-1 hover:bg-slate-800 text-slate-500 hover:text-slate-300 rounded transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Terminal Body */}
          <div className="flex-1 overflow-y-auto font-mono text-[11px] text-slate-300 space-y-1 p-2 pt-3 select-text">
            {activeLogs.length === 0 ? (
              <div className="text-slate-600 italic py-8 text-center">
                {fleet.length === 0
                  ? "Console clean. No active PCs connected in this room."
                  : isExecuting
                  ? "Waiting for output from " + activeConsolePc + "..."
                  : "Console idle. Click 'Execute' to see real-time streaming output here."}
              </div>
            ) : (
              activeLogs.map((log, idx) => (
                <div key={idx} className="leading-tight break-all">
                  <span className="text-slate-600 select-none mr-2">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <span className="text-emerald-300">{log}</span>
                </div>
              ))
            )}
            <div ref={terminalEndRef} />
          </div>

          {/* Terminal Footer */}
          {activeConsolePc && pcStates[activeConsolePc] && (
            <div className="pt-2 border-t border-slate-800/80 flex justify-between items-center text-[10px] text-slate-400 font-mono">
              <span>Host: {activeConsolePc}</span>
              {pcStates[activeConsolePc].status === "success" && (
                <span className="text-emerald-400">Status: SUCCESS (Exit 0)</span>
              )}
              {pcStates[activeConsolePc].status === "failed" && (
                <span className="text-rose-400">Status: FAILED (Exit {pcStates[activeConsolePc].exitCode})</span>
              )}
              {pcStates[activeConsolePc].status === "running" && (
                <span className="text-amber-400 animate-pulse">Status: IN PROGRESS...</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
