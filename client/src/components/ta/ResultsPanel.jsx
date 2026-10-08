import { useMemo, useState } from "react";
import {
  Download, Star, GraduationCap, AlertTriangle, CheckCircle2,
  ChevronDown, Inbox, Users,
} from "lucide-react";
import { apiDownload } from "../../lib/api";

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

export default function ResultsPanel({ result }) {
  const [open, setOpen] = useState(() => new Set());

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

  if (!result) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-slate-400">
        <Inbox size={30} />
        <p className="text-sm">No allocation yet — run the algorithm to see results here.</p>
      </div>
    );
  }

  const s = result.stats || {};
  const unfilledFor = Object.fromEntries((result.unfilled || []).map((u) => [u.course_code, u]));
  const toggle = (code) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Stat label="Status" value={result.status === "OPTIMAL" ? "Optimal" : result.status}
              tone={result.status === "OPTIMAL" ? "green" : "amber"}
              sub={`solved in ${s.solve_seconds ?? 0}s`} />
        <Stat label="Seats filled" value={`${s.seats_filled ?? 0}/${s.seats_requested ?? 0}`}
              tone="indigo" sub={`${s.courses_requesting ?? 0} courses`} />
        <Stat label="TAs used" value={s.tas_used ?? 0} sub={`of ${s.tas_available ?? 0} available`} />
        <Stat label="Preferences met" value={s.preferred_honoured ?? 0}
              sub="named by the instructor" />
        <Stat label="Supervisor pairs" value={s.supervisor_matches ?? 0}
              sub="TA works for their guide" />
      </div>

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

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-semibold text-slate-900">
          Allocation by course
          <span className="ml-2 text-sm font-normal text-slate-500">
            {grouped.length} courses · {result.allocations.length} assignments
          </span>
        </h3>
        {result.run_id && (
          <button
            onClick={() => apiDownload(`/api/ta/runs/${result.run_id}/export.csv`,
                                       `ta-allocation-run-${result.run_id}.csv`)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            <Download size={16} /> Download CSV
          </button>
        )}
      </div>

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
