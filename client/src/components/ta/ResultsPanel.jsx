import { useMemo, useState } from "react";
import {
  Download, Star, GraduationCap, AlertTriangle, CheckCircle2,
  ChevronDown, Inbox, Users, Globe, Lock, Loader2,
  Search, Filter, Info, ChevronUp,
} from "lucide-react";
import { apiDownload, apiPatch } from "../../lib/api";

function Stat({ label, value, sub, tone = "slate" }) {
  const tones = {
    slate: "text-slate-900",
    green: "text-emerald-700",
    amber: "text-amber-700",
    indigo: "text-indigo-700",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${tones[tone]}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export default function ResultsPanel({ result, onPublishedChange }) {
  const [open, setOpen] = useState(() => new Set());
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(result?.is_published ?? false);

  // Unmet preferences review state
  const [showUnmet, setShowUnmet] = useState(true);
  const [unmetFilter, setUnmetFilter] = useState("all"); // 'all' | 'supervisor' | 'clash'
  const [unmetSearch, setUnmetSearch] = useState("");

  async function handleTogglePublish() {
    if (!result?.run_id) return;
    setPublishing(true);
    try {
      const nextState = !published;
      await apiPatch(`/api/ta/runs/${result.run_id}/publish`, {
        is_published: nextState,
      });
      setPublished(nextState);
      onPublishedChange?.(nextState);
    } catch (err) {
      alert("Failed to update publish state: " + err.message);
    } finally {
      setPublishing(false);
    }
  }

  const grouped = useMemo(() => {
    const map = new Map();
    for (const a of result?.allocations ?? []) {
      if (!map.has(a.course_code)) {
        map.set(a.course_code, {
          course_code: a.course_code,
          course_name: a.course_name,
          instructors: a.instructors,
          tas: [],
        });
      }
      map.get(a.course_code).tas.push(a);
    }
    return [...map.values()].sort((a, b) => a.course_code.localeCompare(b.course_code));
  }, [result]);

  const s = result?.stats || {};
  const unmetPreferences = result?.unmet_preferences || [];

  const prefMet = s.preferred_honoured ?? 0;
  const prefTotal = s.preferred_requested;
  const prefVal = prefTotal !== undefined ? `${prefMet} / ${prefTotal}` : `${prefMet}`;
  const prefPct = prefTotal ? Math.round((prefMet / prefTotal) * 100) : null;
  const prefSub = prefPct !== null ? `${prefPct}% of submitted preferences` : "named by instructor";

  const supMet = s.supervisor_preferred_honoured ?? s.supervisor_matches ?? 0;
  const supTotal = s.supervisor_preferred_requested;
  const supVal = supTotal !== undefined ? `${supMet} / ${supTotal}` : `${s.supervisor_matches ?? 0}`;
  const supPct = supTotal ? Math.round((supMet / supTotal) * 100) : null;
  const supSub = supTotal !== undefined 
    ? `${supPct}% guide preferences met (${s.supervisor_matches ?? supMet} total matches)` 
    : "TA works for their guide";

  const supUnmetCount = useMemo(
    () => unmetPreferences.filter((u) => u.is_supervisor).length,
    [unmetPreferences]
  );
  const clashUnmetCount = useMemo(
    () => unmetPreferences.filter((u) => u.reason?.toLowerCase().includes("clash")).length,
    [unmetPreferences]
  );

  const filteredUnmet = useMemo(() => {
    return unmetPreferences.filter((u) => {
      if (unmetFilter === "supervisor" && !u.is_supervisor) return false;
      if (unmetFilter === "clash" && !u.reason?.toLowerCase().includes("clash")) return false;
      if (unmetSearch.trim()) {
        const q = unmetSearch.toLowerCase();
        const str = `${u.course_code} ${u.course_name} ${u.instructors} ${u.ta_name} ${u.roll_no} ${u.reason}`.toLowerCase();
        if (!str.includes(q)) return false;
      }
      return true;
    });
  }, [unmetPreferences, unmetFilter, unmetSearch]);

  function renderReasonBadge(reason) {
    const isClash = reason.toLowerCase().includes("clash");
    const isSup = reason.toLowerCase().includes("supervisor’s course") || reason.toLowerCase().includes("supervisor's course");
    const isAssigned = reason.toLowerCase().includes("assigned to");
    const isFilled = reason.toLowerCase().includes("capacity") || reason.toLowerCase().includes("demand filled");

    if (isClash) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 border border-rose-200/80 px-2.5 py-1 text-xs font-semibold text-rose-700">
          <AlertTriangle size={13} className="shrink-0 text-rose-600" />
          {reason}
        </span>
      );
    }
    if (isSup) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-purple-50 border border-purple-200/80 px-2.5 py-1 text-xs font-semibold text-purple-700">
          <GraduationCap size={13} className="shrink-0 text-purple-600" />
          {reason}
        </span>
      );
    }
    if (isAssigned) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-200/80 px-2.5 py-1 text-xs font-semibold text-blue-700">
          <Users size={13} className="shrink-0 text-blue-600" />
          {reason}
        </span>
      );
    }
    if (isFilled) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">
          <CheckCircle2 size={13} className="shrink-0 text-slate-500" />
          {reason}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs font-medium text-amber-800">
        <Info size={13} className="shrink-0 text-amber-600" />
        {reason}
      </span>
    );
  }

  if (!result) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-slate-400">
        <Inbox size={30} />
        <p className="text-sm">No allocation yet — run the algorithm to see results here.</p>
      </div>
    );
  }

  const unfilledFor = Object.fromEntries((result.unfilled || []).map((u) => [u.course_code, u]));
  const toggle = (code) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  return (
    <div className="space-y-6">
      {/* 5-Card Stats Overview */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Stat
          label="Status"
          value={result.status === "OPTIMAL" ? "Optimal" : result.status}
          tone={result.status === "OPTIMAL" ? "green" : "amber"}
          sub={`solved in ${s.solve_seconds ?? 0}s`}
        />
        <Stat
          label="Seats filled"
          value={`${s.seats_filled ?? 0}/${s.seats_requested ?? 0}`}
          tone="indigo"
          sub={`${s.courses_requesting ?? 0} courses`}
        />
        <Stat
          label="TAs used"
          value={s.tas_used ?? 0}
          sub={`of ${s.tas_available ?? 0} available`}
        />
        <Stat
          label="Preferences met"
          value={prefVal}
          tone={prefTotal && prefMet === prefTotal ? "green" : "indigo"}
          sub={prefSub}
        />
        <Stat
          label="Supervisor pairs"
          value={supVal}
          tone={supTotal && supMet === supTotal ? "green" : "indigo"}
          sub={supSub}
        />
      </div>

      {/* Unfilled warnings if any */}
      {result.unfilled?.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold text-amber-900">Some courses could not be fully staffed</p>
              <ul className="mt-2 space-y-1 text-sm text-amber-800">
                {result.unfilled.map((u) => (
                  <li key={u.course_code}>
                    <span className="font-medium">{u.course_code}</span>: got {u.allocated} of{" "}
                    {u.required} — only {u.eligible_pool} TA(s) had no timetable clash.
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Unmet Preferences & Supervisor Analysis Section */}
      {unmetPreferences.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div
            onClick={() => setShowUnmet(!showUnmet)}
            className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5 bg-gradient-to-r from-slate-50 to-indigo-50/30 border-b border-slate-100 cursor-pointer select-none hover:bg-slate-100/60 transition"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800 font-bold text-sm">
                {unmetPreferences.length}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                    Preferences Not Met &amp; Reason Breakdown
                  </h3>
                  <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                    {unmetPreferences.length} of {prefTotal ?? unmetPreferences.length + prefMet} unmet
                  </span>
                  {supUnmetCount > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-[11px] font-bold text-purple-800">
                      <GraduationCap size={13} /> {supUnmetCount} supervisor pair{supUnmetCount > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Detailed inspection of faculty preferences that could not be satisfied, with exact constraint reasons (timetable clashes, priority tradeoffs).
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-indigo-600">
                {showUnmet ? "Collapse details" : "Expand details"}
              </span>
              {showUnmet ? (
                <ChevronUp size={18} className="text-slate-400" />
              ) : (
                <ChevronDown size={18} className="text-slate-400" />
              )}
            </div>
          </div>

          {showUnmet && (
            <div className="p-4 sm:p-5 space-y-4">
              {/* Filter pills and Search bar */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setUnmetFilter("all")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      unmetFilter === "all"
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    All Unmet ({unmetPreferences.length})
                  </button>

                  <button
                    type="button"
                    onClick={() => setUnmetFilter("supervisor")}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      unmetFilter === "supervisor"
                        ? "bg-purple-700 text-white"
                        : "bg-purple-50 text-purple-700 hover:bg-purple-100"
                    }`}
                  >
                    <GraduationCap size={14} />
                    Supervisor Pairs ({supUnmetCount})
                  </button>

                  <button
                    type="button"
                    onClick={() => setUnmetFilter("clash")}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      unmetFilter === "clash"
                        ? "bg-rose-700 text-white"
                        : "bg-rose-50 text-rose-700 hover:bg-rose-100"
                    }`}
                  >
                    <AlertTriangle size={14} />
                    Timetable Clashes ({clashUnmetCount})
                  </button>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search course, TA, reason..."
                    value={unmetSearch}
                    onChange={(e) => setUnmetSearch(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 pl-8 pr-3 py-1.5 text-xs outline-none focus:border-indigo-400"
                  />
                </div>
              </div>

              {/* Unmet Preferences List */}
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden">
                {filteredUnmet.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No unmet preferences matching the selected filters.
                  </div>
                ) : (
                  filteredUnmet.map((u, i) => (
                    <div
                      key={`${u.course_code}-${u.roll_no}-${i}`}
                      className="p-3.5 sm:p-4 hover:bg-slate-50/70 transition flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                    >
                      {/* Course & Faculty */}
                      <div className="min-w-0 md:w-1/3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-indigo-700">
                            {u.course_code}
                          </span>
                          <span className="font-semibold text-slate-900 truncate">
                            {u.course_name}
                          </span>
                        </div>
                        {u.instructors && (
                          <p className="mt-0.5 text-[11px] text-slate-500 truncate">
                            Faculty: <strong className="text-slate-700">{u.instructors}</strong>
                          </p>
                        )}
                      </div>

                      {/* TA & Supervisor */}
                      <div className="min-w-0 md:w-1/3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-900">{u.ta_name}</span>
                          <span className="font-mono text-slate-500 text-[11px]">({u.roll_no})</span>
                          {u.ta_program && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] text-slate-600 font-medium">
                              {u.ta_program}
                            </span>
                          )}
                          <span className="rounded bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 text-[10px] font-bold text-indigo-700">
                            Rank #{u.rank}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                          <span>Thesis Guide:</span>
                          <span className="font-medium text-slate-700 truncate">
                            {u.thesis_supervisor || "—"}
                          </span>
                          {u.is_supervisor && (
                            <span className="inline-flex items-center gap-1 rounded bg-purple-100 text-purple-800 px-1.5 py-0.2 text-[10px] font-bold">
                              <GraduationCap size={11} /> Supervisor Pair
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Reason Badge */}
                      <div className="md:w-1/3 flex md:justify-end">
                        {renderReasonBadge(u.reason)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Course Allocation Section Header & Action Buttons */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-2">
        <h3 className="font-semibold text-slate-900">
          Allocation by course
          <span className="ml-2 text-sm font-normal text-slate-500">
            {grouped.length} courses · {result.allocations.length} assignments
          </span>
        </h3>
        <div className="flex items-center gap-2">
          {result.run_id && (
            <button
              onClick={handleTogglePublish}
              disabled={publishing}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition ${
                published
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {publishing ? (
                <Loader2 size={16} className="animate-spin" />
              ) : published ? (
                <Lock size={16} />
              ) : (
                <Globe size={16} />
              )}
              {published ? "Unpublish Results" : "Publish Results"}
            </button>
          )}
          {result.run_id && (
            <button
              onClick={() =>
                apiDownload(
                  `/api/ta/runs/${result.run_id}/export.csv`,
                  `ta-allocation-run-${result.run_id}.csv`
                )
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <Download size={16} /> Download CSV
            </button>
          )}
        </div>
      </div>

      {/* Course Cards List */}
      <div className="space-y-3">
        {grouped.map((g) => {
          const short = unfilledFor[g.course_code];
          const isOpen = open.has(g.course_code) || grouped.length <= 3;
          return (
            <div key={g.course_code} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <button
                onClick={() => toggle(g.course_code)}
                className="flex w-full items-start justify-between gap-3 p-4 text-left transition hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-indigo-700">{g.course_code}</span>
                    <span className="truncate font-medium text-slate-800">{g.course_name}</span>
                    {short ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        {short.allocated}/{short.required}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                        <CheckCircle2 size={12} /> {g.tas.length} TA{g.tas.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  {g.instructors && (
                    <p className="mt-1 truncate text-xs text-slate-500">{g.instructors}</p>
                  )}
                </div>
                <ChevronDown size={18}
                  className={`mt-1 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>

              {isOpen && (
                <div className="border-t border-slate-100">
                  {/* cards on mobile, table from sm up */}
                  <ul className="divide-y divide-slate-100 sm:hidden">
                    {g.tas.map((t) => (
                      <li key={t.ta_roll_no} className="p-4">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-sm text-slate-900">{t.ta_roll_no}</span>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                            {t.ta_program}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-700">{t.ta_name}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {t.is_preferred && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                              <Star size={11} /> preferred
                            </span>
                          )}
                          {t.is_supervisor && (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                              <GraduationCap size={11} /> supervisor
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>

                  <div className="hidden overflow-x-auto sm:block">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-2.5 font-semibold">Roll no</th>
                          <th className="px-4 py-2.5 font-semibold">Name</th>
                          <th className="px-4 py-2.5 font-semibold">Program</th>
                          <th className="px-4 py-2.5 font-semibold">Why</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {g.tas.map((t) => (
                          <tr key={t.ta_roll_no} className="hover:bg-slate-50/70">
                            <td className="whitespace-nowrap px-4 py-2.5 font-mono text-slate-900">{t.ta_roll_no}</td>
                            <td className="px-4 py-2.5 text-slate-700">{t.ta_name}</td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{t.ta_program}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex flex-wrap gap-1.5">
                                {t.is_preferred && (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                                    <Star size={11} /> preferred
                                    {t.preference_rank ? ` #${t.preference_rank}` : ""}
                                  </span>
                                )}
                                {t.is_supervisor && (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                                    <GraduationCap size={11} /> supervisor
                                  </span>
                                )}
                                {!t.is_preferred && !t.is_supervisor && (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                                    <Users size={11} /> available
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
