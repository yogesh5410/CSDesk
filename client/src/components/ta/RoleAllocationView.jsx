import { useState, useMemo } from "react";
import { BookOpen, Users, Mail, GraduationCap, ChevronDown, CheckCircle2, FileText, Filter, Check } from "lucide-react";
import FacultyRequirementsSection from "./FacultyRequirementsSection";

export default function RoleAllocationView({ roleView, facultyReqData, onRefresh }) {
  const [expandedCourse, setExpandedCourse] = useState(null);
  const [selectedCourse, setSelectedCourse] = useState("all");
  const [activeSection, setActiveSection] = useState("all"); // "all", "requirements", "allocations"
  const [expandedAllocCourses, setExpandedAllocCourses] = useState({});

  const role = roleView?.role || "student";

  // If faculty, they always have access to submit TA requirements when collection is active or view submitted requirements
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
        {/* Sticky Control Bar for Course Selection & Section Switching */}
        {allCoursesList.length > 0 && (
          <div className="sticky top-20 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur-md p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              {/* Course Selector Dropdown */}
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

              <div className="hidden sm:block h-5 w-px bg-slate-200" />

              {/* Section Filter Pills */}
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 whitespace-nowrap hidden sm:inline">
                  Section:
                </label>
                <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setActiveSection("all")}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      activeSection === "all"
                        ? "bg-white text-indigo-700 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    All Sections
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSection("requirements")}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      activeSection === "requirements"
                        ? "bg-white text-indigo-700 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <FileText size={13} />
                    <span>TA Requirements</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSection("allocations")}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                      activeSection === "allocations"
                        ? "bg-white text-indigo-700 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    <Users size={13} />
                    <span>Allocated TAs</span>
                    {roleView?.isPublished && (
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    )}
                  </button>
                </div>
              </div>
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

        {/* Section 1: Requirement submission section */}
        {(activeSection === "all" || activeSection === "requirements") && (
          <FacultyRequirementsSection
            facultyData={facultyReqData}
            onRefresh={onRefresh}
            selectedCourse={selectedCourse}
          />
        )}

        {/* Section 2: Published Allocations section (if published) */}
        {(activeSection === "all" || activeSection === "allocations") && (
          roleView && roleView.isPublished ? (
            <div className="space-y-6 pt-2">
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
                <div className="space-y-4">
                  {filteredAllocCourses.map((c) => {
                    const isAllocOpen = expandedAllocCourses[c.course_code] ?? true;
                    return (
                      <div key={c.course_code} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow">
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
                              {isAllocOpen ? "Collapse" : "View TAs"}
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
                          <div className="p-4 sm:p-5 animate-in fade-in duration-200">
                            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                              Teaching Assistants
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
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
              TA allocations have not been published by the administration yet.
            </div>
          )
        )}
      </div>
    );
  }

  if (!roleView || !roleView.isPublished) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
        <BookOpen size={40} className="text-slate-400" />
        <h3 className="mt-4 text-base font-semibold text-slate-800">
          No Allocations Published Yet
        </h3>
        <p className="mt-1 max-w-md text-sm text-slate-500">
          The departmental administration has not published the TA allocations yet.
          Please check back later once the results are announced.
        </p>
      </div>
    );
  }

  // -------------------------------------------------------------
  // TA View: Course assigned to this specific TA
  // -------------------------------------------------------------
  if (role === "ta") {
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
  // Student View: All courses with faculties and TAs (name, id, email)
  // -------------------------------------------------------------
  const courses = roleView.courses || [];
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
              Browse teaching assistants and course instructors for the current semester.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
            <CheckCircle2 size={14} /> Official Directory
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {courses.map((c) => {
          const isOpen = expandedCourse === c.course_code;
          return (
            <div key={c.course_code} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
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
                <div className="border-t border-slate-100 bg-slate-50/50 p-4 sm:p-5">
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Assigned Teaching Assistants
                  </h4>
                  {c.tas.length === 0 ? (
                    <p className="text-xs text-slate-400">No teaching assistants assigned to this course.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-4 py-2.5 font-semibold">Roll No</th>
                            <th className="px-4 py-2.5 font-semibold">Name</th>
                            <th className="px-4 py-2.5 font-semibold">Email</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {c.tas.map((ta) => (
                            <tr key={ta.roll_no} className="hover:bg-slate-50/60">
                              <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs font-bold text-slate-800">
                                {ta.roll_no}
                              </td>
                              <td className="px-4 py-2.5 font-medium text-slate-700">{ta.name}</td>
                              <td className="px-4 py-2.5 text-xs text-slate-600">
                                {ta.email ? (
                                  <a href={`mailto:${ta.email}`} className="text-indigo-600 hover:underline">
                                    {ta.email}
                                  </a>
                                ) : (
                                  "—"
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

