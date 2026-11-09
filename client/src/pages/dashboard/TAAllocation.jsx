import { useCallback, useEffect, useState } from "react";
import {
  UsersRound, Database, Table2, Cpu, ClipboardList, RefreshCw, BookOpen, UserCheck, CheckSquare,
  GitPullRequest,
} from "lucide-react";
import { apiGet } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { DATA_SOURCES } from "../../config/taTables";
import UploadCard from "../../components/ta/UploadCard";
import TablePreview from "../../components/ta/TablePreview";
import RunPanel from "../../components/ta/RunPanel";
import ResultsPanel from "../../components/ta/ResultsPanel";
import AlgorithmNotes from "../../components/ta/AlgorithmNotes";
import RoleAllocationView from "../../components/ta/RoleAllocationView";
import CollectRequirementsTab from "../../components/ta/CollectRequirementsTab";
import RequestsTab from "../../components/ta/RequestsTab";

const ADMIN_TABS = [
  { key: "data", label: "Data Sources", icon: Database },
  { key: "collect", label: "Collect Requirements", icon: CheckSquare },
  { key: "preview", label: "Preview", icon: Table2 },
  { key: "run", label: "Run", icon: Cpu },
  { key: "results", label: "Results", icon: ClipboardList },
  { key: "requests", label: "Requests", icon: GitPullRequest },
  { key: "algorithm", label: "Algorithm", icon: BookOpen },
];

export default function TAAllocation() {
  const { role, simulatedUser } = useAuth();
  const isAdmin = role === "admin";

  const [tab, setTab] = useState(isAdmin ? "data" : "roleView");
  const [tables, setTables] = useState(null);
  const [result, setResult] = useState(null);
  const [roleViewData, setRoleViewData] = useState(null);
  const [requirementsStatus, setRequirementsStatus] = useState(null);
  const [facultyReqData, setFacultyReqData] = useState(null);
  const [pendingReqCount, setPendingReqCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Sync tab if role switches between admin and non-admin
  useEffect(() => {
    if (!isAdmin) {
      setTab("roleView");
    } else if (tab === "roleView") {
      setTab("data");
    }
  }, [isAdmin]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (isAdmin) {
        const [{ tables }, reqStatus, reqData] = await Promise.all([
          apiGet("/api/ta/tables"),
          apiGet("/api/ta/requirements/status"),
          apiGet("/api/ta/requests").catch(() => ({ pendingCount: 0 })),
        ]);
        setTables(tables);
        setRequirementsStatus(reqStatus);
        setPendingReqCount(reqData.pendingCount || 0);
      }
      const [roleData, facReq] = await Promise.all([
        apiGet("/api/ta/role-view"),
        apiGet("/api/ta/requirements/my-courses"),
      ]);
      setRoleViewData(roleData);
      setFacultyReqData(facReq);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { refresh(); }, [refresh, role, simulatedUser]);

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
          run_id: run.id, is_published: run.is_published, restored: true,
        });
      } catch { /* no previous run or not admin */ }
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
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                  TA Allocation
                </h1>
                <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-indigo-700 ring-1 ring-indigo-200">
                  {role} view
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {isAdmin
                  ? "Upload the inputs, run the solver, and publish teaching assistant allocations."
                  : "View published course teaching assistants and faculty allocations."}
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

        {isAdmin ? (
          <nav className="-mx-1 mt-5 overflow-x-auto pb-1">
            <div className="flex min-w-max gap-1.5 rounded-xl bg-slate-100 p-1.5">
              {ADMIN_TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition ${
                    tab === key ? "bg-white text-indigo-700 shadow-sm"
                                : "text-slate-500 hover:text-slate-700"}`}
                >
                  <Icon size={16} /> {label}
                  {key === "requests" && pendingReqCount > 0 && (
                    <span className="rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.2 text-[10px] font-bold">
                      {pendingReqCount}
                    </span>
                  )}
                </button>
              ))}
              <button
                onClick={() => setTab("roleView")}
                className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition ${
                  tab === "roleView" ? "bg-white text-indigo-700 shadow-sm"
                                     : "text-slate-500 hover:text-slate-700"}`}
              >
                <UserCheck size={16} /> Preview Role View
              </button>
            </div>
          </nav>
        ) : null}
      </header>

      {error && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {/* Non-admin view OR admin previewing the role view */}
      {(!isAdmin || tab === "roleView") && (
        <RoleAllocationView
          roleView={roleViewData}
          facultyReqData={facultyReqData}
          onRefresh={refresh}
        />
      )}

      {isAdmin && tab === "data" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Input Data Sources
              </h2>
              <p className="text-xs text-slate-500">
                Manage all 4 core input sources for TA allocation. Uploading any source replaces its whole table.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
            {DATA_SOURCES.map((spec) => (
              <UploadCard
                key={spec.key}
                spec={spec}
                rowCount={count(spec.table)}
                onUploaded={refresh}
              />
            ))}
          </div>
        </div>
      )}

      {isAdmin && tab === "collect" && (
        <CollectRequirementsTab
          statusData={requirementsStatus}
          onRefresh={refresh}
        />
      )}

      {isAdmin && tab === "preview" && tables && (
        <TablePreview tables={tables} onRefresh={refresh} />
      )}

      {isAdmin && tab === "run" && (
        <RunPanel
          counts={tables}
          onDone={(r) => { setResult(r); setTab("results"); refresh(); }}
        />
      )}

      {isAdmin && tab === "results" && (
        <ResultsPanel
          result={result}
          onPublishedChange={(isPublished) => {
            setResult((r) => r ? { ...r, is_published: isPublished } : r);
            refresh();
          }}
        />
      )}

      {isAdmin && tab === "requests" && (
        <RequestsTab onRefresh={refresh} />
      )}

      {isAdmin && tab === "algorithm" && <AlgorithmNotes />}
    </div>
  );
}
