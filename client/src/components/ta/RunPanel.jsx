import { useEffect, useRef, useState } from "react";
import {
  Play, Loader2, Check, AlertTriangle, Cpu, Users, CalendarClock,
  ListChecks, Boxes, Sparkles, Database, Info,
} from "lucide-react";
import { apiStream } from "../../lib/api";

// Mirrors the phases emitted by server/optimization/ta_solver.py.
const PHASES = [
  { key: "loading",      label: "Load tables",       icon: Database,      hint: "reading the six inputs from the database" },
  { key: "grid",         label: "Build time grid",   icon: CalendarClock, hint: "mapping every slot letter onto day + period" },
  { key: "slots",        label: "Resolve courses",   icon: ListChecks,    hint: "turning M12 / O23 into concrete time cells" },
  { key: "availability", label: "TA availability",   icon: Users,         hint: "PhD are always free; M.Tech blocked by their own classes" },
  { key: "eligibility",  label: "Match eligibility", icon: Sparkles,      hint: "dropping TAs whose classes clash with the course" },
  { key: "model",        label: "Build model",       icon: Boxes,         hint: "one boolean per (TA, course) pair that is still possible" },
  { key: "solving",      label: "Solve (CP-SAT)",    icon: Cpu,           hint: "searching for the best complete assignment" },
  { key: "collecting",   label: "Collect result",    icon: Check,         hint: "reading the assignment back out" },
];

export default function RunPanel({ counts, onDone }) {
  const [running, setRunning] = useState(false);
  const [pct, setPct] = useState(0);
  const [phase, setPhase] = useState(null);
  const [detail, setDetail] = useState("");
  const [log, setLog] = useState([]);
  const [error, setError] = useState(null);
  const [maxPerTa, setMaxPerTa] = useState(1);
  const logRef = useRef(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [log]);

  const missing = ["courses", "timetable", "ta_details", "ta_requirements"]
    .filter((t) => !counts?.[t]?.count);

  async function run() {
    setRunning(true);
    setError(null);
    setLog([]);
    setPct(0);
    setPhase(null);
    setDetail("");
    let final = null;
    let runId = null;

    try {
      await apiStream("/api/ta/allocate", { max_courses_per_ta: maxPerTa }, (ev) => {
        if (ev.type === "progress") {
          setPct(ev.pct);
          setPhase(ev.phase);
          setDetail(ev.detail);
          setLog((l) => [...l, { phase: ev.phase, detail: ev.detail, pct: ev.pct }]);
        } else if (ev.type === "saved") {
          runId = ev.run_id;
        } else if (ev.type === "warning") {
          setLog((l) => [...l, { phase: "warning", detail: ev.message }]);
        } else if (ev.type === "result") {
          final = ev;
        }
      });

      if (!final) throw new Error("The solver returned no result.");
      if (final.status === "ERROR") throw new Error(final.message || "Solver error");
      setPct(100);
      onDone?.({ ...final, run_id: runId });
    } catch (e) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  }

  const activeIndex = PHASES.findIndex((p) => p.key === phase);

  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <div className="space-y-4 lg:col-span-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-slate-900">Run the allocator</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            Assigns TAs to every course that requested them, honouring class
            clashes and preferences.
          </p>

          <label className="mt-4 block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Maximum courses per TA
            </span>
            <input
              type="number"
              min="1"
              max="10"
              value={maxPerTa}
              onChange={(e) => setMaxPerTa(Math.max(1, Number(e.target.value)))}
              disabled={running}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50"
            />
            <span className="mt-1.5 flex gap-1.5 text-xs text-slate-500">
              <Info size={14} className="mt-px shrink-0" />
              If &gt; 1, the solver also forbids pairs whose timings overlap.
            </span>
          </label>

          {missing.length > 0 && (
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <p>Upload these first: {missing.join(", ").replace(/_/g, " ")}.</p>
            </div>
          )}

          <button
            onClick={run}
            disabled={running || missing.length > 0}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {running ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} className="fill-current" />}
            {running ? "Running…" : "Run algorithm"}
          </button>

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <p className="min-w-0 break-words">{error}</p>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4 lg:col-span-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Progress</h3>
            <span className="tabular-nums text-sm font-semibold text-indigo-600">{pct}%</span>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 h-5 truncate text-sm text-slate-500">{detail}</p>

          <ol className="mt-4 space-y-1.5">
            {PHASES.map((p, i) => {
              const done = activeIndex > i || pct === 100;
              const now = activeIndex === i && pct < 100;
              const Icon = p.icon;
              return (
                <li
                  key={p.key}
                  className={`flex items-start gap-3 rounded-xl px-3 py-2 transition-colors ${
                    now ? "bg-indigo-50" : done ? "bg-emerald-50/50" : ""}`}
                >
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${
                    done ? "bg-emerald-100 text-emerald-700"
                         : now ? "bg-indigo-600 text-white"
                               : "bg-slate-100 text-slate-400"}`}>
                    {done ? <Check size={14} />
                          : now ? <Loader2 size={14} className="animate-spin" />
                                : <Icon size={14} />}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${
                      now ? "text-indigo-900" : done ? "text-emerald-900" : "text-slate-500"}`}>
                      {p.label}
                    </p>
                    <p className="truncate text-xs text-slate-500">{p.hint}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          {log.length > 0 && (
            <div ref={logRef} className="mt-4 max-h-40 overflow-y-auto rounded-xl bg-slate-900 p-3">
              {log.map((l, i) => (
                <p key={i} className="font-mono text-[11px] leading-relaxed text-slate-300">
                  <span className={l.phase === "warning" ? "text-amber-400" : "text-indigo-400"}>
                    {String(l.pct ?? "!").toString().padStart(3)}
                  </span>{" "}
                  <span className="text-slate-500">{l.phase}</span> {l.detail}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
