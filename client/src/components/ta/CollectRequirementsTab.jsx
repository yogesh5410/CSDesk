import { useState, useMemo } from "react";
import {
  Users, CheckCircle2, Clock, Search, Send, Upload, FileText, Check, AlertCircle, Loader2
} from "lucide-react";
import { apiPost, apiUpload } from "../../lib/api";
import { TA_REQUIREMENTS_CSV_SPEC } from "../../config/taTables";
import UploadCard from "./UploadCard";

export default function CollectRequirementsTab({
  statusData,
  onRefresh,
}) {
  const [toggling, setToggling] = useState(false);
  const [filter, setFilter] = useState("all"); // 'all' | 'submitted' | 'pending'
  const [search, setSearch] = useState("");

  const isCollecting = statusData?.isCollecting ?? false;
  const courses = statusData?.courses || [];

  async function handleToggleCollection() {
    setToggling(true);
    try {
      await apiPost("/api/ta/requirements/toggle-collection", { active: !isCollecting });
      await onRefresh?.();
    } catch (err) {
      alert("Error changing status: " + err.message);
    } finally {
      setToggling(false);
    }
  }

  const filteredCourses = useMemo(() => {
    return courses.filter((c) => {
      if (filter === "submitted" && !c.has_submitted) return false;
      if (filter === "pending" && c.has_submitted) return false;
      if (search) {
        const q = search.toLowerCase();
        const code = (c.course_code || "").toLowerCase();
        const name = (c.course_name || "").toLowerCase();
        const instructors = (c.instructors || "").toLowerCase();
        return code.includes(q) || name.includes(q) || instructors.includes(q);
      }
      return true;
    });
  }, [courses, filter, search]);

  const reqUploadSpec = TA_REQUIREMENTS_CSV_SPEC;

  return (
    <div className="space-y-6">
      {/* Header action banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                isCollecting ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                             : "bg-slate-100 text-slate-600"
              }`}>
                <span className={`h-2 w-2 rounded-full ${isCollecting ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                {isCollecting ? "Collection In Progress (Active)" : "Collection Closed (Inactive)"}
              </span>
            </div>
            <h2 className="mt-2 text-xl font-bold text-slate-900">
              Faculty TA Requirements Collection
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              When enabled, faculty members will see requirement submission forms for their assigned courses.
              Unsubmitted courses will be treated as requiring 0 TAs during allocation.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-3">
            <button
              onClick={handleToggleCollection}
              disabled={toggling}
              className={`inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-sm transition ${
                isCollecting
                  ? "bg-amber-600 hover:bg-amber-700"
                  : "bg-indigo-600 hover:bg-indigo-700"
              }`}
            >
              {toggling && <Loader2 size={16} className="animate-spin" />}
              {isCollecting ? "Close Requirements Collection" : "Start Requirements Collection"}
            </button>
          </div>
        </div>

        {/* Progress stats */}
        <div className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-100 pt-5 sm:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3.5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Courses</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{statusData?.totalCourses ?? 0}</p>
          </div>
          <div className="rounded-xl bg-emerald-50/70 p-3.5">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-800">Requirements Submitted</p>
            <p className="mt-1 text-2xl font-bold text-emerald-700">{statusData?.submittedCount ?? 0}</p>
          </div>
          <div className="rounded-xl bg-amber-50/70 p-3.5">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-800">Pending Courses</p>
            <p className="mt-1 text-2xl font-bold text-amber-700">{statusData?.pendingCount ?? 0}</p>
          </div>
          <div className="rounded-xl bg-indigo-50/70 p-3.5">
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-800">Available TAs Pool</p>
            <p className="mt-1 text-2xl font-bold text-indigo-700">{statusData?.taList?.length ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Courses Status Tracker */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="flex items-center gap-1.5 rounded-xl bg-slate-100 p-1">
            <button
              onClick={() => setFilter("all")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                filter === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All ({courses.length})
            </button>
            <button
              onClick={() => setFilter("submitted")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                filter === "submitted" ? "bg-white text-emerald-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Submitted ({statusData?.submittedCount ?? 0})
            </button>
            <button
              onClick={() => setFilter("pending")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                filter === "pending" ? "bg-white text-amber-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Pending ({statusData?.pendingCount ?? 0})
            </button>
          </div>

          <div className="relative w-full sm:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search course or instructor..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 py-1.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Course Code</th>
                <th className="px-5 py-3 font-semibold">Course Name</th>
                <th className="px-5 py-3 font-semibold">Instructors</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">TAs Requested</th>
                <th className="px-5 py-3 font-semibold">Preferred TAs</th>
                <th className="px-5 py-3 font-semibold">Submitted By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCourses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-400">
                    No courses match the current filter.
                  </td>
                </tr>
              ) : (
                filteredCourses.map((c) => (
                  <tr key={c.course_code} className="hover:bg-slate-50/70 transition">
                    <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs font-bold text-indigo-700">
                      {c.course_code}
                    </td>
                    <td className="max-w-xs truncate px-5 py-3.5 font-medium text-slate-800" title={c.course_name}>
                      {c.course_name}
                    </td>
                    <td className="max-w-xs truncate px-5 py-3.5 text-xs text-slate-600" title={c.instructors}>
                      {c.instructors || "—"}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      {c.has_submitted ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                          <CheckCircle2 size={13} /> Submitted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                          <Clock size={13} /> Pending
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-center font-semibold text-slate-800">
                      {c.has_submitted ? c.tas_required : "—"}
                    </td>
                    <td className="max-w-xs truncate px-5 py-3.5 font-mono text-xs text-slate-600" title={c.preferred_ta_rolls}>
                      {c.preferred_ta_rolls ? (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700">
                          {c.preferred_ta_rolls.split(";").join(", ")}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-xs text-slate-500">
                      {c.submitted_by || "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Alternative option: Upload CSV directly */}
      <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <Upload size={20} />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Alternative: Upload Requirements CSV File
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Prefer to bulk upload or restore previous requirements? You can still upload the standard{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-xs font-medium text-slate-800">ta_requirements.csv</code>{" "}
              file at any time.
            </p>
          </div>
        </div>

        {reqUploadSpec && (
          <div className="mt-4 max-w-xl">
            <UploadCard
              spec={reqUploadSpec}
              kind="csv"
              rowCount={courses.filter((c) => c.has_submitted).length}
              onUploaded={onRefresh}
            />
          </div>
        )}
      </div>
    </div>
  );
}

