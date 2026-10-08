import { useCallback, useEffect, useState } from "react";
import {
  UsersRound, Database, Table2, Cpu, ClipboardList, RefreshCw, BookOpen,
} from "lucide-react";
import { apiGet } from "../../lib/api";
import { PDF_UPLOADS, CSV_UPLOADS } from "../../config/taTables";
import UploadCard from "../../components/ta/UploadCard";
import TablePreview from "../../components/ta/TablePreview";
import RunPanel from "../../components/ta/RunPanel";
import ResultsPanel from "../../components/ta/ResultsPanel";
import AlgorithmNotes from "../../components/ta/AlgorithmNotes";

const TABS = [
  { key: "data", label: "Data Sources", icon: Database },
  { key: "preview", label: "Preview", icon: Table2 },
  { key: "run", label: "Run", icon: Cpu },
  { key: "results", label: "Results", icon: ClipboardList },
  { key: "algorithm", label: "Algorithm", icon: BookOpen },
];

export default function TAAllocation() {
  const [tab, setTab] = useState("data");
  const [tables, setTables] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { tables } = await apiGet("/api/ta/tables");
      setTables(tables);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // reopen the most recent saved run so results survive a page reload
  useEffect(() => {
    (async () => {
      try {
        const { runs } = await apiGet("/api/ta/runs");
        if (!runs?.length) return;
        const run = runs[0];
        const { allocations } = await apiGet(`/api/ta/runs/${run.id}/allocations`);
        const { unfilled = [], starved = [], ...stats } = run.summary || {};
        setResult((cur) => cur ?? {
          status: run.status, allocations, unfilled, starved, stats,
          run_id: run.id, restored: true,
        });
      } catch { /* no previous run */ }
    })();
  }, []);

  const count = (t) => tables?.[t]?.count ?? 0;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <UsersRound size={22} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                TA Allocation
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Upload the inputs, run the solver, and assign teaching assistants
                without timetable clashes.
              </p>
            </div>
          </div>
          <button
            onClick={refresh}
            className="inline-flex items-center justify-center gap-2 self-start rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        <nav className="-mx-1 mt-5 overflow-x-auto pb-1">
          <div className="flex min-w-max gap-1.5 rounded-xl bg-slate-100 p-1.5">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition ${
                  tab === key ? "bg-white text-indigo-700 shadow-sm"
                              : "text-slate-500 hover:text-slate-700"}`}
              >
                <Icon size={16} /> {label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      {error && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {tab === "data" && (
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              PDF sources
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {PDF_UPLOADS.map((spec) => (
                <UploadCard key={spec.key} spec={spec} kind="pdf"
                            rowCount={count(spec.table)} onUploaded={refresh} />
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              CSV sources
            </h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {CSV_UPLOADS.map((spec) => (
                <UploadCard key={spec.key} spec={spec} kind="csv"
                            rowCount={count(spec.table)} onUploaded={refresh} />
              ))}
            </div>
          </section>
        </div>
      )}

      {tab === "preview" && tables && <TablePreview tables={tables} />}

      {tab === "run" && (
        <RunPanel
          counts={tables}
          onDone={(r) => { setResult(r); setTab("results"); refresh(); }}
        />
      )}

      {tab === "results" && <ResultsPanel result={result} />}

      {tab === "algorithm" && <AlgorithmNotes />}
    </div>
  );
}
