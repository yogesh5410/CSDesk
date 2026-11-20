import { useCallback, useEffect, useState } from "react";
import {
  UsersRound, Database, Table2, Cpu, ClipboardList, RefreshCw, UserCheck, CheckSquare,
  GitPullRequest, Calendar, Plus, CheckCircle2, X, Edit3,
} from "lucide-react";
import { apiGet, apiPost, apiPatch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { DATA_SOURCES } from "../../config/taTables";
import UploadCard from "../../components/ta/UploadCard";
import TablePreview from "../../components/ta/TablePreview";
import RunPanel from "../../components/ta/RunPanel";
import ResultsPanel from "../../components/ta/ResultsPanel";
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
];

export default function TAAllocation() {
  const { role, simulatedUser, switchSimulatedEmail } = useAuth();
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

  // Multi-semester state
  const [semesters, setSemesters] = useState([]);
  const [selectedSemester, setSelectedSemester] = useState(
    () => localStorage.getItem("csdesk_selected_semester") || "2025-26-even"
  );
  const [showAddSemesterModal, setShowAddSemesterModal] = useState(false);
  const [newSemData, setNewSemData] = useState({
    name: "",
    academic_year: "2026-27",
    term: "Monsoon",
    is_active: false,
  });
  const [submittingSemester, setSubmittingSemester] = useState(false);

  // Rename Semester Modal state
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameSemData, setRenameSemData] = useState({
    name: "",
    academic_year: "",
    term: "Monsoon",
  });
  const [submittingRename, setSubmittingRename] = useState(false);

  // Faculty users list for testing & preview
  const [facultyUsers, setFacultyUsers] = useState([]);

  useEffect(() => {
    apiGet("/api/ta/users/by-role")
      .then((res) => {
        if (res?.users) {
          const facs = res.users.filter((u) => u.role === "faculty");
          setFacultyUsers(facs);
        }
      })
      .catch(() => {});
  }, []);

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
      // 1. Fetch semesters
      const semRes = await apiGet("/api/ta/semesters").catch(() => null);
      if (semRes?.semesters?.length) {
        setSemesters(semRes.semesters);
        const stored = localStorage.getItem("csdesk_selected_semester");
        const exists = semRes.semesters.some((s) => s.id === stored);
        if (!exists) {
          const fallbackId = semRes.activeSemester?.id || semRes.semesters[0]?.id || "2025-26-even";
          setSelectedSemester(fallbackId);
          localStorage.setItem("csdesk_selected_semester", fallbackId);
        }
      }

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

  useEffect(() => {
    refresh();
  }, [refresh, role, simulatedUser]);

  // Reopen the most recent saved run for the selected semester
  useEffect(() => {
    (async () => {
      try {
        const { runs } = await apiGet("/api/ta/runs");
        if (!runs?.length) {
          setResult(null);
          return;
        }
        const run = runs[0];
        const { allocations } = await apiGet(`/api/ta/runs/${run.id}/allocations`);
        const { unfilled = [], starved = [], unmet_preferences = [], ...stats } = run.summary || {};
        setResult({
          status: run.status, allocations, unfilled, starved, unmet_preferences, stats,
          run_id: run.id, is_published: run.is_published, restored: true,
        });
      } catch {
        setResult(null);
      }
    })();
  }, [selectedSemester]);

  const handleSemesterChange = (newId) => {
    setSelectedSemester(newId);
    localStorage.setItem("csdesk_selected_semester", newId);
    setResult(null);
    refresh();
  };

  const handleCreateSemester = async (e) => {
    e.preventDefault();
    if (!newSemData.name.trim()) return;
    setSubmittingSemester(true);
    try {
      const res = await apiPost("/api/ta/semesters", {
        name: newSemData.name.trim(),
        academic_year: newSemData.academic_year.trim(),
        term: newSemData.term,
        is_active: newSemData.is_active,
      });
      setShowAddSemesterModal(false);
      setNewSemData({
        name: "",
        academic_year: "2026-27",
        term: "Monsoon",
        is_active: false,
      });
      if (res?.semester?.id) {
        handleSemesterChange(res.semester.id);
      } else {
        refresh();
      }
    } catch (err) {
      alert(`Failed to create semester: ${err.message}`);
    } finally {
      setSubmittingSemester(false);
    }
  };

  const openRenameModal = () => {
    const cur = semesters.find((s) => s.id === selectedSemester);
    setRenameSemData({
      name: cur?.name || "",
      academic_year: cur?.academic_year || "",
      term: cur?.term || "Monsoon",
    });
    setShowRenameModal(true);
  };

  const handleRenameSemester = async (e) => {
    e.preventDefault();
    if (!renameSemData.name.trim()) return;
    setSubmittingRename(true);
    try {
      await apiPatch(`/api/ta/semesters/${selectedSemester}`, {
        name: renameSemData.name.trim(),
        academic_year: renameSemData.academic_year.trim(),
        term: renameSemData.term,
      });
      setShowRenameModal(false);
      refresh();
    } catch (err) {
      alert(`Failed to rename semester: ${err.message}`);
    } finally {
      setSubmittingRename(false);
    }
  };

  const handleActivateSemester = async (semId) => {
    const sem = semesters.find((s) => s.id === semId);
    const ok = confirm(
      `Set '${sem?.name || semId}' as the CURRENT ACTIVE semester?\n\nThis will make it the default semester for all students and faculty across CSDesk.`
    );
    if (!ok) return;
    try {
      await apiPatch(`/api/ta/semesters/${semId}/activate`);
      refresh();
    } catch (err) {
      alert(`Failed to activate semester: ${err.message}`);
    }
  };

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
                  ? "Manage data inputs, solver runs, requirements, and allocations across academic semesters."
                  : "View published course teaching assistants, faculty preferences, and change requests."}
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

        {/* Multi-Semester Selector Bar (Applies to Admin, Faculty, TA, Student) */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 uppercase tracking-wider">
              <Calendar size={15} className="text-indigo-600" />
              <span>Academic Semester:</span>
            </span>

            <select
              value={selectedSemester}
              onChange={(e) => handleSemesterChange(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-indigo-500 shadow-2xs cursor-pointer hover:border-slate-400"
            >
              {semesters.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.academic_year}){s.is_active ? " — [ACTIVE]" : ""}
                </option>
              ))}
            </select>

            {/* Active chip indicator */}
            {(() => {
              const cur = semesters.find((s) => s.id === selectedSemester);
              if (cur?.is_active) {
                return (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Current Active Semester
                  </span>
                );
              }
              return (
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-[11px] font-medium text-slate-600">
                    Archived / Historical View
                  </span>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleActivateSemester(selectedSemester)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
                    >
                      <CheckCircle2 size={12} /> Set as Active
                    </button>
                  )}
                </div>
              );
            })()}

            {/* Rename Semester Button (for Admin) */}
            {isAdmin && (
              <button
                type="button"
                onClick={openRenameModal}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs transition"
                title="Rename this semester"
              >
                <Edit3 size={13} className="text-slate-500" />
                <span>Rename</span>
              </button>
            )}
          </div>

          {/* Admin "+ Add New Semester" button */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowAddSemesterModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-1.5 text-xs font-semibold shadow-xs transition active:scale-[0.98] self-start sm:self-auto"
            >
              <Plus size={14} /> Add New Semester
            </button>
          )}
        </div>

        {/* Faculty Testing Banner when role === 'faculty' */}
        {role === "faculty" && facultyUsers.length > 0 && (
          <div className="mt-3.5 rounded-xl border border-indigo-200 bg-indigo-50/70 p-3 text-xs flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-indigo-950 flex items-center gap-1.5">
                <UserCheck size={16} className="text-indigo-600" />
                Faculty Preview / Impersonate:
              </span>
              <select
                value={simulatedUser || roleViewData?.user?.email || facultyUsers[0]?.email}
                onChange={(e) => {
                  switchSimulatedEmail(e.target.value);
                }}
                className="rounded-lg border border-indigo-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-2xs outline-none focus:ring-2 focus:ring-indigo-400"
              >
                {facultyUsers.map((f) => (
                  <option key={f.email} value={f.email}>
                    {f.name} ({f.email})
                  </option>
                ))}
              </select>
            </div>
            <span className="text-[11px] font-medium text-indigo-700">
              Viewing as <strong className="text-indigo-900">{roleViewData?.user?.name || "Faculty"}</strong> ({roleViewData?.user?.email})
            </span>
          </div>
        )}

        {/* Admin Navigation Tabs */}
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
                <UserCheck size={16} /> Admin View
              </button>
            </div>
          </nav>
        ) : null}
      </header>

      {error && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {/* Non-admin view OR admin in "Admin View" mode */}
      {(!isAdmin || tab === "roleView") && (
        <RoleAllocationView
          roleView={roleViewData}
          facultyReqData={facultyReqData}
          onRefresh={refresh}
          facultyUsers={facultyUsers}
          onSwitchFaculty={(email) => {
            switchSimulatedEmail(email);
          }}
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
                Manage all 4 core input sources for TA allocation in the selected semester.
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

      {/* Modal: Rename Semester */}
      {showRenameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 p-5 space-y-4 animate-scaleIn">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                  <Edit3 size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Rename Academic Semester</h3>
                  <p className="text-[11px] text-slate-500">Update semester name, academic year, and term</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRenameModal(false)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleRenameSemester} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Semester Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Monsoon 2026 or Winter 2026"
                  value={renameSemData.name}
                  onChange={(e) => setRenameSemData((p) => ({ ...p, name: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Academic Year
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 2025-26"
                    value={renameSemData.academic_year}
                    onChange={(e) => setRenameSemData((p) => ({ ...p, academic_year: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Term / Session
                  </label>
                  <select
                    value={renameSemData.term}
                    onChange={(e) => setRenameSemData((p) => ({ ...p, term: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-500"
                  >
                    <option value="Monsoon">Monsoon</option>
                    <option value="Winter">Winter</option>
                    <option value="Summer">Summer</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRenameModal(false)}
                  className="rounded-xl px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRename || !renameSemData.name.trim()}
                  className="rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold px-4 py-2 shadow-xs transition active:scale-[0.98]"
                >
                  {submittingRename ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add New Semester */}
      {showAddSemesterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 p-5 space-y-4 animate-scaleIn">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                  <Calendar size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Add New Semester</h3>
                  <p className="text-[11px] text-slate-500">Configure a new academic session for TA Allocation</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddSemesterModal(false)}
                className="text-slate-400 hover:text-slate-600 rounded-lg p-1"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateSemester} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Semester Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Monsoon 2026 or Winter 2026"
                  value={newSemData.name}
                  onChange={(e) => setNewSemData((p) => ({ ...p, name: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Academic Year
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 2026-27"
                    value={newSemData.academic_year}
                    onChange={(e) => setNewSemData((p) => ({ ...p, academic_year: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Term / Session
                  </label>
                  <select
                    value={newSemData.term}
                    onChange={(e) => setNewSemData((p) => ({ ...p, term: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-500"
                  >
                    <option value="Monsoon">Monsoon</option>
                    <option value="Winter">Winter</option>
                    <option value="Summer">Summer</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={newSemData.is_active}
                  onChange={(e) => setNewSemData((p) => ({ ...p, is_active: e.target.checked }))}
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
                <span className="font-medium text-slate-700">
                  Set as current active semester immediately
                </span>
              </label>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddSemesterModal(false)}
                  className="rounded-xl px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingSemester || !newSemData.name.trim()}
                  className="rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold px-4 py-2 shadow-xs transition active:scale-[0.98]"
                >
                  {submittingSemester ? "Creating..." : "Create Semester"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
