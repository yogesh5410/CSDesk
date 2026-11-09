import { useState } from "react";
import {
  BookOpen, Users, Mail, GraduationCap, ChevronDown, CheckCircle2,
  FileText, Filter, Plus, Trash2, Clock, XCircle, AlertTriangle, MessageSquare, Loader2,
} from "lucide-react";
import FacultyRequirementsSection from "./FacultyRequirementsSection";
import { apiPost } from "../../lib/api";

export default function RoleAllocationView({ roleView, facultyReqData, onRefresh }) {
  const [expandedCourse, setExpandedCourse] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState("all");
  const [expandedAllocCourses, setExpandedAllocCourses] = useState({});

  // Faculty Change Request State
  const [addTaSelection, setAddTaSelection] = useState({}); // { [course_code]: roll_no }
  const [addTaReason, setAddTaReason] = useState({});
  const [deleteTaSelection, setDeleteTaSelection] = useState({});
  const [deleteTaReason, setDeleteTaReason] = useState({});
  const [submittingReq, setSubmittingReq] = useState({}); // { [course_code]: boolean }
  const [reqFeedback, setReqFeedback] = useState({}); // { [course_code]: { type: 'success'|'error', msg } }

  // Admin Manual Management State (Requirement 6)
  const [adminAddSelection, setAdminAddSelection] = useState({}); // { [course_code]: roll_no }
  const [adminDeleteSelection, setAdminDeleteSelection] = useState({});
  const [busyAction, setBusyAction] = useState(false);
  const [reallocWarning, setReallocWarning] = useState(null); // { targetCourse, taRoll, taName, existingCourse }

  const role = roleView?.role || "student";
  const isAdmin = Boolean(roleView?.isAdmin || role === "admin");
  const isCollecting = Boolean(facultyReqData?.isCollecting);
  const allTAs = roleView?.allTAs || [];

  // -------------------------------------------------------------
  // Faculty Handler: Submit change request to Admin (Requirement 2)
  // -------------------------------------------------------------
  async function handleSubmitChangeRequest(courseCode, requestType) {
    const rollNo = requestType === "ADD" ? addTaSelection[courseCode] : deleteTaSelection[courseCode];
    const reason = requestType === "ADD" ? addTaReason[courseCode] : deleteTaReason[courseCode];

    if (!rollNo) {
      setReqFeedback((prev) => ({
        ...prev,
        [courseCode]: { type: "error", msg: "Please select a TA from the dropdown." },
      }));
      return;
    }

    setSubmittingReq((prev) => ({ ...prev, [courseCode]: true }));
    setReqFeedback((prev) => ({ ...prev, [courseCode]: null }));

    try {
      const res = await apiPost("/api/ta/requests", {
        course_code: courseCode,
        request_type: requestType,
        ta_roll_no: rollNo,
        reason: (reason || "").trim(),
      });

      setReqFeedback((prev) => ({
        ...prev,
        [courseCode]: { type: "success", msg: res.message || "Request submitted successfully to Admin." },
      }));

      // Reset form fields
      if (requestType === "ADD") {
        setAddTaSelection((prev) => ({ ...prev, [courseCode]: "" }));
        setAddTaReason((prev) => ({ ...prev, [courseCode]: "" }));
      } else {
        setDeleteTaSelection((prev) => ({ ...prev, [courseCode]: "" }));
        setDeleteTaReason((prev) => ({ ...prev, [courseCode]: "" }));
      }

      onRefresh?.();
      setTimeout(() => {
        setReqFeedback((prev) => ({ ...prev, [courseCode]: null }));
      }, 5000);
    } catch (err) {
      setReqFeedback((prev) => ({
        ...prev,
        [courseCode]: { type: "error", msg: err.message },
      }));
    } finally {
      setSubmittingReq((prev) => ({ ...prev, [courseCode]: false }));
    }
  }

  // -------------------------------------------------------------
  // Admin Handler: Direct Manual Add / Remove TA (Requirement 6)
  // -------------------------------------------------------------
  async function executeAdminAdd(courseCode, taRollNo) {
    setBusyAction(true);
    try {
      await apiPost("/api/ta/allocations/manual-add", {
        course_code: courseCode,
        ta_roll_no: taRollNo,
      });
      setReallocWarning(null);
      setAdminAddSelection((prev) => ({ ...prev, [courseCode]: "" }));
      onRefresh?.();
    } catch (err) {
      alert("Failed to add TA: " + err.message);
    } finally {
      setBusyAction(false);
    }
  }

  function handleAdminAddClick(courseCode) {
    const rollNo = adminAddSelection[courseCode];
    if (!rollNo) return;

    const taObj = allTAs.find((t) => t.roll_no === rollNo);
    if (taObj?.assigned_to && taObj.assigned_to.course_code !== courseCode) {
      // Busy TA assigned to another course -> Show confirmation popup
      setReallocWarning({
        targetCourse: courseCode,
        taRoll: rollNo,
        taName: taObj.name || rollNo,
        existingCourse: taObj.assigned_to.course_code,
      });
    } else {
      executeAdminAdd(courseCode, rollNo);
    }
  }

  async function handleAdminRemove(courseCode) {
    const rollNo = adminDeleteSelection[courseCode];
    if (!rollNo) return;
    if (!confirm(`Are you sure you want to remove TA ${rollNo} from course ${courseCode}?`)) return;

    setBusyAction(true);
    try {
      await apiPost("/api/ta/allocations/manual-remove", {
        course_code: courseCode,
        ta_roll_no: rollNo,
      });
      setAdminDeleteSelection((prev) => ({ ...prev, [courseCode]: "" }));
      onRefresh?.();
    } catch (err) {
      alert("Failed to remove TA: " + err.message);
    } finally {
      setBusyAction(false);
    }
  }

  // -------------------------------------------------------------
  // Faculty View (Requirement 1 & 2)
  // -------------------------------------------------------------
  if (role === "faculty") {
    const reqCourses = facultyReqData?.courses || [];
    const allocCourses = roleView?.courses || [];

    // Build unique courses list for filter dropdown
    const allCoursesMap = new Map();
    reqCourses.forEach((c) => allCoursesMap.set(c.course_code, c));
    allocCourses.forEach((c) => {
      if (!allCoursesMap.has(c.course_code)) allCoursesMap.set(c.course_code, c);
    });
    const allCoursesList = Array.from(allCoursesMap.values());

    const filteredAllocCourses = selectedCourse === "all"
      ? allocCourses
      : allocCourses.filter((c) => c.course_code === selectedCourse);

    const toggleAllocCourse = (code) => {
      setExpandedAllocCourses((prev) => ({
        ...prev,
        [code]: !(prev[code] ?? true),
      }));
    };

    const expandAllAlloc = () => {
      const next = {};
      filteredAllocCourses.forEach((c) => (next[c.course_code] = true));
      setExpandedAllocCourses(next);
    };

    const collapseAllAlloc = () => {
      const next = {};
      filteredAllocCourses.forEach((c) => (next[c.course_code] = false));
      setExpandedAllocCourses(next);
    };

    return (
      <div className="space-y-6">
        {/* Course Filter Dropdown Header (Section toggle removed per Requirement 1) */}
        {allCoursesList.length > 0 && (
          <div className="sticky top-20 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur-md p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                <Filter size={15} />
              </span>
              <label htmlFor="course-filter" className="text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap">
                Course:
              </label>
              <select
                id="course-filter"
                value={selectedCourse}
                onChange={(e) => setSelectedCourse(e.target.value)}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs sm:text-sm font-semibold text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 max-w-xs truncate"
              >
                <option value="all">All Courses ({allCoursesList.length})</option>
                {allCoursesList.map((c) => (
                  <option key={c.course_code} value={c.course_code}>
                    {c.course_code} — {c.course_name}
                  </option>
                ))}
              </select>
            </div>

            {selectedCourse !== "all" && (
              <button
                type="button"
                onClick={() => setSelectedCourse("all")}
                className="text-xs font-medium text-indigo-600 hover:underline"
              >
                Reset to All Courses
              </button>
            )}
          </div>
        )}

        {/* Requirement 1: If admin is collecting requirements, show Submit TA Requirements */}
        {isCollecting ? (
          <FacultyRequirementsSection
            facultyData={facultyReqData}
            onRefresh={onRefresh}
            selectedCourse={selectedCourse}
          />
        ) : (
          /* Requirement 1: Otherwise, show Your Assigned Courses & TAs */
          roleView && roleView.isPublished ? (
            <div className="space-y-6">
              <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 to-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                      Faculty Portal
                    </span>
                    <h2 className="mt-1 text-lg font-bold text-slate-900">Your Assigned Courses &amp; TAs</h2>
                    <p className="text-sm text-slate-500">
                      Logged in as <span className="font-medium text-slate-700">{roleView.user?.name}</span> ({roleView.user?.email})
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                      <CheckCircle2 size={14} /> Official Published Allocations
                    </span>
                    {filteredAllocCourses.length > 1 && (
                      <div className="flex items-center gap-1.5 ml-2">
                        <button
                          type="button"
                          onClick={expandAllAlloc}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                        >
                          Expand All
                        </button>
                        <button
                          type="button"
                          onClick={collapseAllAlloc}
                          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                        >
                          Collapse All
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {filteredAllocCourses.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
                  No courses matching the selected filter in published allocations.
                </div>
              ) : (
                <div className="space-y-5">
                  {filteredAllocCourses.map((c) => {
                    const isAllocOpen = expandedAllocCourses[c.course_code] ?? true;
                    const courseRequests = (roleView.change_requests || []).filter(
                      (r) => r.course_code === c.course_code
                    );

                    return (
                      <div key={c.course_code} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow">
                        {/* Course Header */}
                        <div
                          onClick={() => toggleAllocCourse(c.course_code)}
                          className="flex cursor-pointer items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/60 p-4 sm:p-5 hover:bg-slate-100/60 transition select-none"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-base font-bold text-indigo-700">{c.course_code}</span>
                              <h3 className="font-semibold text-slate-900">{c.course_name}</h3>
                              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                                {c.tas.length} TA{c.tas.length !== 1 ? "s" : ""} Assigned
                              </span>
                            </div>
                            {c.co_instructors?.length > 0 && (
                              <p className="mt-1 text-xs text-slate-500">
                                <span className="font-medium text-slate-700">Co-instructors:</span>{" "}
                                {c.co_instructors.join(", ")}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-medium text-slate-400 hidden sm:inline">
                              {isAllocOpen ? "Collapse" : "View TAs & Manage"}
                            </span>
                            <button
                              type="button"
                              className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"
                              aria-label={isAllocOpen ? "Collapse" : "Expand"}
                            >
                              <ChevronDown
                                size={18}
                                className={`transition-transform duration-200 ${isAllocOpen ? "rotate-180" : ""}`}
                              />
                            </button>
                          </div>
                        </div>

                        {isAllocOpen && (
                          <div className="p-4 sm:p-5 space-y-6 animate-in fade-in duration-200">
                            {/* Assigned TAs cards */}
                            <div>
                              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                                Assigned Teaching Assistants
                              </h4>
                              {c.tas.length === 0 ? (
                                <p className="text-sm text-slate-400">No TAs were allocated to this course.</p>
                              ) : (
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                  {c.tas.map((ta) => (
                                    <div
                                      key={ta.roll_no}
                                      className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 transition hover:bg-slate-50"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div>
                                          <p className="font-mono text-xs font-bold text-slate-900">{ta.roll_no}</p>
                                          <p className="font-medium text-slate-800">{ta.name}</p>
                                        </div>
                                        <span className="rounded-md bg-white px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                                          {ta.program || "Student"}
                                        </span>
                                      </div>

                                      <div className="mt-3 space-y-1 text-xs text-slate-500">
                                        {ta.email && (
                                          <div className="flex items-center gap-1.5 truncate">
                                            <Mail size={12} className="shrink-0 text-slate-400" />
                                            <a href={`mailto:${ta.email}`} className="truncate hover:text-indigo-600">
                                              {ta.email}
                                            </a>
                                          </div>
                                        )}
                                        {ta.thesis_supervisor && (
                                          <div className="flex items-center gap-1.5 truncate">
                                            <GraduationCap size={12} className="shrink-0 text-slate-400" />
                                            <span className="truncate">Guide: {ta.thesis_supervisor}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Requirement 2: Request TA Changes Section */}
                            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5 space-y-4">
                              <div>
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                                  Request TA Changes for {c.course_code}
                                </h4>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  Submit a request to Admin to add or remove a TA. Admin will review and update the allocations.
                                </p>
                              </div>

                              {/* Feedback banner */}
                              {reqFeedback[c.course_code] && (
                                <div className={`p-3 rounded-xl text-xs font-medium border ${
                                  reqFeedback[c.course_code].type === "success"
                                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                    : "bg-rose-50 text-rose-800 border-rose-200"
                                }`}>
                                  {reqFeedback[c.course_code].msg}
                                </div>
                              )}

                              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {/* Form A: Request to ADD TA (from dropdown of all TAs) */}
                                <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-700">
                                    <Plus size={15} />
                                    <span>Request to ADD a TA</span>
                                  </div>

                                  <div>
                                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                      Select TA (All TAs in Department):
                                    </label>
                                    <select
                                      value={addTaSelection[c.course_code] || ""}
                                      onChange={(e) =>
                                        setAddTaSelection((prev) => ({ ...prev, [c.course_code]: e.target.value }))
                                      }
                                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 font-medium"
                                    >
                                      <option value="">— Choose a TA to Add —</option>

                                      {/* Free TAs Optgroup (Green) */}
                                      {allTAs.filter((t) => !t.assigned_to).length > 0 && (
                                        <optgroup
                                          label={`🟢 Available / Free TAs (${allTAs.filter((t) => !t.assigned_to).length})`}
                                          style={{ fontWeight: "bold", color: "#047857" }}
                                        >
                                          {allTAs
                                            .filter((t) => !t.assigned_to)
                                            .map((t) => (
                                              <option
                                                key={t.roll_no}
                                                value={t.roll_no}
                                                style={{ color: "#065f46", fontWeight: "normal" }}
                                              >
                                                🟢 [FREE] {t.roll_no} — {t.name} ({t.program || "Student"})
                                              </option>
                                            ))}
                                        </optgroup>
                                      )}

                                      {/* Busy TAs Optgroup (Orange / Amber) */}
                                      {allTAs.filter((t) => Boolean(t.assigned_to)).length > 0 && (
                                        <optgroup
                                          label={`🟠 Busy / Assigned TAs (${allTAs.filter((t) => Boolean(t.assigned_to)).length})`}
                                          style={{ fontWeight: "bold", color: "#b45309" }}
                                        >
                                          {allTAs
                                            .filter((t) => Boolean(t.assigned_to))
                                            .map((t) => (
                                              <option
                                                key={t.roll_no}
                                                value={t.roll_no}
                                                style={{ color: "#92400e", fontWeight: "normal" }}
                                              >
                                                🟠 [BUSY: {t.assigned_to.course_code}] {t.roll_no} — {t.name} ({t.program || "Student"})
                                              </option>
                                            ))}
                                        </optgroup>
                                      )}
                                    </select>

                                    {/* Live Selected TA Status Badge Card */}
                                    {(() => {
                                      const selRoll = addTaSelection[c.course_code];
                                      const selTa = allTAs.find((t) => t.roll_no === selRoll);
                                      if (!selTa) return null;

                                      return selTa.assigned_to ? (
                                        <div className="mt-2.5 rounded-xl border border-amber-300 bg-amber-50/90 p-2.5 text-xs text-amber-950 animate-fadeIn">
                                          <div className="flex items-center gap-1.5">
                                            <span className="rounded-md bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900">
                                              🟠 Status: Busy / Assigned
                                            </span>
                                            <span className="font-mono font-bold text-slate-900">{selTa.roll_no}</span>
                                          </div>
                                          <p className="mt-1 text-[11px] text-slate-800">
                                            Currently allocated to <strong className="font-mono text-indigo-700">{selTa.assigned_to.course_code}</strong> ({selTa.assigned_to.course_name}).
                                          </p>
                                          <p className="text-[11px] text-amber-800 mt-0.5 font-medium">
                                            ℹ️ If Admin approves, they will be transferred from {selTa.assigned_to.course_code} to {c.course_code}.
                                          </p>
                                        </div>
                                      ) : (
                                        <div className="mt-2.5 rounded-xl border border-emerald-200 bg-emerald-50/90 p-2.5 text-xs text-emerald-950 animate-fadeIn">
                                          <div className="flex items-center gap-1.5">
                                            <span className="rounded-md bg-emerald-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-900">
                                              🟢 Status: Free / Available
                                            </span>
                                            <span className="font-mono font-bold text-slate-900">{selTa.roll_no}</span>
                                          </div>
                                          <p className="mt-1 text-[11px] text-emerald-800">
                                            This TA is currently unassigned and available for immediate allocation.
                                          </p>
                                        </div>
                                      );
                                    })()}
                                  </div>

                                  <div>
                                    <input
                                      type="text"
                                      placeholder="Reason / Note for admin (optional)"
                                      value={addTaReason[c.course_code] || ""}
                                      onChange={(e) =>
                                        setAddTaReason((prev) => ({ ...prev, [c.course_code]: e.target.value }))
                                      }
                                      className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
                                    />
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleSubmitChangeRequest(c.course_code, "ADD")}
                                    disabled={submittingReq[c.course_code] || !addTaSelection[c.course_code]}
                                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold text-xs py-2 shadow-xs transition active:scale-[0.98]"
                                  >
                                    {submittingReq[c.course_code] ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                                    <span>Send Request to Add TA</span>
                                  </button>
                                </div>

                                {/* Form B: Request to DELETE TA (from dropdown of TAs in this course) */}
                                <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                                  <div className="flex items-center gap-2 text-xs font-bold text-rose-700">
                                    <Trash2 size={15} />
                                    <span>Request to REMOVE a TA</span>
                                  </div>

                                  <div>
                                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                      Select TA from {c.course_code}:
                                    </label>
                                    <select
                                      value={deleteTaSelection[c.course_code] || ""}
                                      onChange={(e) =>
                                        setDeleteTaSelection((prev) => ({ ...prev, [c.course_code]: e.target.value }))
                                      }
                                      disabled={c.tas.length === 0}
                                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100 disabled:bg-slate-50"
                                    >
                                      <option value="">
                                        {c.tas.length === 0 ? "— No TAs assigned to this course —" : "— Choose TA to Remove —"}
                                      </option>
                                      {c.tas.map((t) => (
                                        <option key={t.roll_no} value={t.roll_no}>
                                          {t.roll_no} — {t.name} ({t.program || "Student"})
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <div>
                                    <input
                                      type="text"
                                      placeholder="Reason / Note for removal (optional)"
                                      value={deleteTaReason[c.course_code] || ""}
                                      onChange={(e) =>
                                        setDeleteTaReason((prev) => ({ ...prev, [c.course_code]: e.target.value }))
                                      }
                                      className="w-full rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-100"
                                    />
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleSubmitChangeRequest(c.course_code, "DELETE")}
                                    disabled={submittingReq[c.course_code] || !deleteTaSelection[c.course_code]}
                                    className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 hover:bg-rose-50 disabled:opacity-40 text-rose-700 font-semibold text-xs py-2 transition active:scale-[0.98]"
                                  >
                                    {submittingReq[c.course_code] ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                    <span>Send Request to Remove TA</span>
                                  </button>
                                </div>
                              </div>

                              {/* Recent Requests for this course */}
                              {courseRequests.length > 0 && (
                                <div className="mt-4 pt-3 border-t border-slate-200/80">
                                  <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                                    Your Submitted Requests for {c.course_code}
                                  </h5>
                                  <div className="space-y-2">
                                    {courseRequests.map((r) => (
                                      <div key={r.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-xl border bg-white text-xs">
                                        <div className="flex items-center gap-2">
                                          <span className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                                            r.request_type === "ADD" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                                          }`}>
                                            {r.request_type}
                                          </span>
                                          <span className="font-mono font-semibold">{r.ta_roll_no}</span>
                                          <span className="text-slate-600">({r.ta_name})</span>
                                          {r.reason && <span className="text-slate-400 italic">"{r.reason}"</span>}
                                        </div>

                                        <div className="flex items-center gap-2">
                                          {r.status === "pending" && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                                              <Clock size={11} /> Pending Review
                                            </span>
                                          )}
                                          {r.status === "approved" && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                                              <CheckCircle2 size={11} /> Approved
                                            </span>
                                          )}
                                          {r.status === "rejected" && (
                                            <div className="flex items-center gap-1.5">
                                              <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200">
                                                <XCircle size={11} /> Rejected
                                              </span>
                                              {r.admin_remark && (
                                                <span className="text-rose-700 text-[11px] font-medium bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                                                  Remark: {r.admin_remark}
                                                </span>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-400 shadow-sm">
              TA allocations have not been published by the administration yet.
            </div>
          )
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // TA Portal View
  // -------------------------------------------------------------
  if (role === "ta") {
    if (!roleView || !roleView.isPublished) {
      return (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
          <BookOpen size={40} className="text-slate-400" />
          <h3 className="mt-4 text-base font-semibold text-slate-800">No Allocations Published Yet</h3>
          <p className="mt-1 max-w-md text-sm text-slate-500">
            The departmental administration has not published the TA allocations yet. Please check back later.
          </p>
        </div>
      );
    }

    const assigned = roleView.assigned_courses || [];
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-emerald-50/70 to-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-emerald-800">
                TA Portal
              </span>
              <h2 className="mt-1 text-lg font-bold text-slate-900">Your TA Assignment</h2>
              <p className="text-sm text-slate-500">
                Logged in as <span className="font-medium text-slate-700">{roleView.user?.name}</span> ({roleView.user?.roll_no || roleView.user?.email})
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
              <CheckCircle2 size={14} /> Official Allocation
            </span>
          </div>
        </div>

        {assigned.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            You have not been assigned as a TA to any course in this allocation run.
          </div>
        ) : (
          <div className="space-y-4">
            {assigned.map((a) => (
              <div key={a.course_code} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <span className="font-mono text-sm font-bold text-indigo-700">{a.course_code}</span>
                    <h3 className="mt-0.5 text-xl font-bold text-slate-900">{a.course_name}</h3>
                    <p className="mt-2 text-sm text-slate-600">
                      <span className="font-semibold text-slate-800">Instructors:</span> {a.instructors || "—"}
                    </p>
                  </div>
                  <span className="rounded-xl bg-emerald-50 px-3.5 py-1.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                    Assigned TA
                  </span>
                </div>

                <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50/70 p-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Your Details On Record</h4>
                  <div className="mt-2 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                    <div>
                      <p className="text-xs text-slate-400">Roll Number</p>
                      <p className="font-mono font-medium text-slate-800">{a.ta_details?.roll_no || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Program</p>
                      <p className="font-medium text-slate-800">{a.ta_details?.program || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Thesis Supervisor</p>
                      <p className="font-medium text-slate-800">{a.ta_details?.thesis_supervisor || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400">Email</p>
                      <p className="truncate font-medium text-slate-800">{a.ta_details?.email || "—"}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // Student & General Directory View: "Courses, Instructors & Assigned TAs"
  // Plus Admin Live Management Controls (Requirement 6)
  // -------------------------------------------------------------
  const courses = roleView?.courses || [];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
              Department Course Directory
            </span>
            <h2 className="mt-1 text-lg font-bold text-slate-900">Courses, Instructors &amp; Assigned TAs</h2>
            <p className="text-sm text-slate-500">
              {isAdmin
                ? "Manage course teaching assistants directly: add or delete TAs with real-time reallocation protection."
                : "Browse teaching assistants and course instructors for the current semester."}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
            <CheckCircle2 size={14} /> Official Directory
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {courses.map((c) => {
          const isOpen = expandedCourse === c.course_code;

          return (
            <div key={c.course_code} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md">
              <button
                type="button"
                onClick={() => setExpandedCourse(isOpen ? null : c.course_code)}
                className="flex w-full items-start justify-between gap-3 p-4 text-left transition hover:bg-slate-50 sm:p-5"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-bold text-indigo-700">{c.course_code}</span>
                    <span className="font-semibold text-slate-900">{c.course_name}</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                      {c.tas.length} TA{c.tas.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {c.instructors && (
                    <p className="mt-1 text-xs text-slate-500">
                      <span className="font-medium text-slate-700">Faculty:</span> {c.instructors}
                    </p>
                  )}
                </div>
                <ChevronDown
                  size={18}
                  className={`mt-1 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>

              {isOpen && (
                <div className="border-t border-slate-100 bg-slate-50/50 p-4 sm:p-5 space-y-4">
                  <div>
                    <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Assigned Teaching Assistants
                    </h4>
                    {c.tas.length === 0 ? (
                      <p className="text-xs text-slate-400">No teaching assistants assigned to this course.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                        <table className="min-w-full text-left text-xs sm:text-sm">
                          <thead className="border-b border-slate-100 bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
                            <tr>
                              <th className="px-4 py-2.5">Roll No</th>
                              <th className="px-4 py-2.5">Name</th>
                              <th className="px-4 py-2.5">Email</th>
                              {isAdmin && <th className="px-4 py-2.5 text-right">Quick Action</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {c.tas.map((t) => (
                              <tr key={t.roll_no} className="hover:bg-slate-50/70">
                                <td className="whitespace-nowrap px-4 py-2 font-mono font-medium text-slate-900">{t.roll_no}</td>
                                <td className="whitespace-nowrap px-4 py-2 text-slate-700">{t.name}</td>
                                <td className="whitespace-nowrap px-4 py-2 text-slate-500">{t.email || "—"}</td>
                                {isAdmin && (
                                  <td className="whitespace-nowrap px-4 py-2 text-right">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setAdminDeleteSelection({ [c.course_code]: t.roll_no });
                                        if (confirm(`Remove TA ${t.roll_no} (${t.name}) from ${c.course_code}?`)) {
                                          apiPost("/api/ta/allocations/manual-remove", {
                                            course_code: c.course_code,
                                            ta_roll_no: t.roll_no,
                                          }).then(() => onRefresh?.()).catch((e) => alert(e.message));
                                        }
                                      }}
                                      className="text-xs text-rose-600 hover:text-rose-800 hover:underline font-medium"
                                    >
                                      Remove
                                    </button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Requirement 6: Admin Option to Add a new TA or Delete a TA directly in this tab */}
                  {isAdmin && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                          Admin Controls: Modify {c.course_code} TAs
                        </span>
                        <span className="text-[11px] text-slate-400">Direct Database Operations</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                        {/* 1. Add new TA dropdown */}
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-semibold text-slate-600">
                            Add a TA to {c.course_code}:
                          </label>
                          <div className="flex items-center gap-2">
                            <select
                              value={adminAddSelection[c.course_code] || ""}
                              onChange={(e) =>
                                setAdminAddSelection((prev) => ({ ...prev, [c.course_code]: e.target.value }))
                              }
                              className="flex-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-indigo-400 font-medium"
                            >
                              <option value="">— Select TA to Add —</option>

                              {/* Free TAs Optgroup (Green) */}
                              {allTAs.filter((t) => !t.assigned_to).length > 0 && (
                                <optgroup
                                  label={`🟢 Available / Free TAs (${allTAs.filter((t) => !t.assigned_to).length})`}
                                  style={{ fontWeight: "bold", color: "#047857" }}
                                >
                                  {allTAs
                                    .filter((t) => !t.assigned_to)
                                    .map((t) => (
                                      <option
                                        key={t.roll_no}
                                        value={t.roll_no}
                                        style={{ color: "#065f46", fontWeight: "normal" }}
                                      >
                                        🟢 [FREE] {t.roll_no} — {t.name} ({t.program || "Student"})
                                      </option>
                                    ))}
                                </optgroup>
                              )}

                              {/* Busy TAs Optgroup (Orange / Amber) */}
                              {allTAs.filter((t) => Boolean(t.assigned_to)).length > 0 && (
                                <optgroup
                                  label={`🟠 Busy / Assigned TAs (${allTAs.filter((t) => Boolean(t.assigned_to)).length})`}
                                  style={{ fontWeight: "bold", color: "#b45309" }}
                                >
                                  {allTAs
                                    .filter((t) => Boolean(t.assigned_to))
                                    .map((t) => (
                                      <option
                                        key={t.roll_no}
                                        value={t.roll_no}
                                        style={{ color: "#92400e", fontWeight: "normal" }}
                                      >
                                        🟠 [BUSY: {t.assigned_to.course_code}] {t.roll_no} — {t.name} ({t.program || "Student"})
                                      </option>
                                    ))}
                                </optgroup>
                              )}
                            </select>

                            <button
                              type="button"
                              onClick={() => handleAdminAddClick(c.course_code)}
                              disabled={busyAction || !adminAddSelection[c.course_code]}
                              className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-semibold text-xs px-3 py-1.5 shadow-2xs transition active:scale-[0.98]"
                            >
                              <Plus size={13} /> Add
                            </button>
                          </div>

                          {/* Live Status indicator for selected TA in Admin view */}
                          {(() => {
                            const selRoll = adminAddSelection[c.course_code];
                            const selTa = allTAs.find((t) => t.roll_no === selRoll);
                            if (!selTa) return null;

                            return selTa.assigned_to ? (
                              <div className="mt-1.5 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-950 animate-fadeIn">
                                <span className="font-semibold text-amber-900">⚠️ Reallocation Notice:</span> Currently assigned to <strong className="font-mono text-indigo-700">{selTa.assigned_to.course_code}</strong>. Clicking Add will show confirmation to reallocate.
                              </div>
                            ) : (
                              <div className="mt-1.5 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-[11px] text-emerald-900 animate-fadeIn">
                                <span className="font-semibold text-emerald-900">🟢 Free TA:</span> Not assigned to any course. Ready to allocate directly.
                              </div>
                            );
                          })()}
                        </div>

                        {/* 2. Delete TA dropdown */}
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-semibold text-slate-600">
                            Remove a TA from {c.course_code}:
                          </label>
                          <div className="flex items-center gap-2">
                            <select
                              value={adminDeleteSelection[c.course_code] || ""}
                              onChange={(e) =>
                                setAdminDeleteSelection((prev) => ({ ...prev, [c.course_code]: e.target.value }))
                              }
                              disabled={c.tas.length === 0}
                              className="flex-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-indigo-400 disabled:bg-slate-50"
                            >
                              <option value="">
                                {c.tas.length === 0 ? "— No TAs to remove —" : "— Select TA to Remove —"}
                              </option>
                              {c.tas.map((t) => (
                                <option key={t.roll_no} value={t.roll_no}>
                                  {t.roll_no} — {t.name}
                                </option>
                              ))}
                            </select>

                            <button
                              type="button"
                              onClick={() => handleAdminRemove(c.course_code)}
                              disabled={busyAction || !adminDeleteSelection[c.course_code]}
                              className="inline-flex items-center gap-1 rounded-xl border border-rose-200 hover:bg-rose-50 disabled:opacity-40 text-rose-700 font-semibold text-xs px-3 py-1.5 transition active:scale-[0.98]"
                            >
                              <Trash2 size={13} /> Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Requirement 6: Reallocation Warning Modal for Admin */}
      {reallocWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-amber-200 p-5 space-y-4 animate-scaleIn">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-200">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Reallocate Busy TA?</h3>
                <p className="mt-1 text-xs sm:text-sm text-slate-600 leading-relaxed">
                  TA <strong className="font-mono text-slate-900">{reallocWarning.taRoll} ({reallocWarning.taName})</strong> is currently allocated to course <strong className="font-mono text-indigo-700">{reallocWarning.existingCourse}</strong>.
                </p>
                <p className="mt-2 text-xs text-amber-800 bg-amber-50/80 p-2.5 rounded-xl border border-amber-200/60">
                  Adding them to <strong>{reallocWarning.targetCourse}</strong> will automatically remove them from <strong>{reallocWarning.existingCourse}</strong>. Do you want to proceed?
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setReallocWarning(null)}
                disabled={busyAction}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeAdminAdd(reallocWarning.targetCourse, reallocWarning.taRoll)}
                disabled={busyAction}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition active:scale-[0.98] disabled:opacity-50"
              >
                {busyAction && <Loader2 size={14} className="animate-spin" />}
                <span>Yes, Reallocate TA</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
