import { useState, useMemo, useEffect } from "react";
import { Search, Check, X, Users, Mail, AlertCircle, Loader2, ChevronDown, ChevronsUpDown, CheckCircle2 } from "lucide-react";
import { apiPost } from "../../lib/api";

export default function FacultyRequirementsSection({
  facultyData,
  onRefresh,
  selectedCourse = "all",
}) {
  const isCollecting = facultyData?.isCollecting ?? false;
  const allCourses = facultyData?.courses || [];
  const taList = facultyData?.taList || [];

  // Filter courses if a specific course is selected
  const courses = useMemo(() => {
    if (!selectedCourse || selectedCourse === "all") return allCourses;
    return allCourses.filter((c) => c.course_code === selectedCourse);
  }, [allCourses, selectedCourse]);

  // Track expanded state for each course card
  const [expandedCourses, setExpandedCourses] = useState({});

  // Initialize: if 1 course, open it; otherwise open all or courses with pending status
  useEffect(() => {
    const init = {};
    courses.forEach((c, idx) => {
      // Default: open the first one or any pending courses
      init[c.course_code] = courses.length === 1 || !c.has_submitted || idx === 0;
    });
    setExpandedCourses(init);
  }, [courses]);

  const toggleCourse = (code) => {
    setExpandedCourses((prev) => ({ ...prev, [code]: !prev[code] }));
  };

  const expandAll = () => {
    const next = {};
    courses.forEach((c) => (next[c.course_code] = true));
    setExpandedCourses(next);
  };

  const collapseAll = () => {
    const next = {};
    courses.forEach((c) => (next[c.course_code] = false));
    setExpandedCourses(next);
  };

  const submittedCount = courses.filter((c) => c.has_submitted).length;
  const pendingCount = courses.length - submittedCount;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 to-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                isCollecting
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-200 text-slate-700"
              }`}>
                <span className={`h-2 w-2 rounded-full ${isCollecting ? "bg-emerald-500 animate-pulse" : "bg-slate-400"}`} />
                {isCollecting ? "Requirements Collection Active" : "Collection Closed / Read-Only"}
              </span>

              <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                {courses.length} Course{courses.length !== 1 ? "s" : ""}
              </span>

              {courses.length > 0 && (
                <span className="text-xs text-slate-500">
                  • <span className="font-semibold text-emerald-700">{submittedCount} submitted</span>
                  {pendingCount > 0 && (
                    <span className="ml-1 text-amber-700 font-semibold">({pendingCount} pending)</span>
                  )}
                </span>
              )}
            </div>

            <h2 className="mt-2 text-xl font-bold text-slate-900">
              Submit TA Requirements for Your Courses
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Specify how many Teaching Assistants you need for each course and rank your preferred TAs.
              Any co-instructor can submit or update the requirements.
            </p>
          </div>

          {courses.length > 1 && (
            <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
              <button
                type="button"
                onClick={expandAll}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
              >
                Expand All
              </button>
              <button
                type="button"
                onClick={collapseAll}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
              >
                Collapse All
              </button>
            </div>
          )}
        </div>
      </div>

      {courses.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          No courses matching the current filter.
        </div>
      ) : (
        <div className="space-y-4">
          {courses.map((course) => (
            <CourseRequirementCard
              key={course.course_code}
              course={course}
              taList={taList}
              isCollecting={isCollecting}
              isOpen={expandedCourses[course.course_code] ?? true}
              onToggle={() => toggleCourse(course.course_code)}
              onSaved={onRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CourseRequirementCard({ course, taList, isCollecting, isOpen, onToggle, onSaved }) {
  const [tasRequired, setTasRequired] = useState(course.tas_required ?? 0);
  const [selectedTAs, setSelectedTAs] = useState(() => {
    if (!course.preferred_ta_rolls) return [];
    return course.preferred_ta_rolls.split(";").map((r) => r.trim()).filter(Boolean);
  });
  const [taSearch, setTaSearch] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // Map for easy TA lookup
  const taMap = useMemo(() => {
    return Object.fromEntries(taList.map((t) => [t.roll_no, t]));
  }, [taList]);

  // Filtered TAs in searchable dropdown
  const filteredTAs = useMemo(() => {
    const q = taSearch.toLowerCase();
    return taList.filter((t) => {
      if (selectedTAs.includes(t.roll_no)) return false; // don't show already selected
      if (!q) return true;
      return (
        t.roll_no?.toLowerCase().includes(q) ||
        t.name?.toLowerCase().includes(q) ||
        t.email?.toLowerCase().includes(q)
      );
    });
  }, [taList, selectedTAs, taSearch]);

  function handleSelectTA(rollNo) {
    setSelectedTAs((prev) => [...prev, rollNo]);
    setTaSearch("");
    setIsDropdownOpen(false);
  }

  function handleRemoveTA(rollNo) {
    setSelectedTAs((prev) => prev.filter((r) => r !== rollNo));
  }

  function handleMoveUp(index) {
    if (index === 0) return;
    setSelectedTAs((prev) => {
      const copy = [...prev];
      const tmp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = tmp;
      return copy;
    });
  }

  function handleMoveDown(index) {
    if (index >= selectedTAs.length - 1) return;
    setSelectedTAs((prev) => {
      const copy = [...prev];
      const tmp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = tmp;
      return copy;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      await apiPost("/api/ta/requirements/submit", {
        course_code: course.course_code,
        tas_required: Number(tasRequired),
        preferred_ta_rolls: selectedTAs.join(";"),
      });

      setMessage({ type: "success", text: "Requirements submitted successfully!" });
      onSaved?.();
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow">
      <div
        onClick={onToggle}
        className="flex cursor-pointer items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/70 p-4 sm:p-5 hover:bg-slate-100/60 transition select-none"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-base font-bold text-indigo-700">{course.course_code}</span>
            <h3 className="font-bold text-slate-900">{course.course_name}</h3>
            {course.has_submitted ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                <Check size={12} /> Submitted ({course.tas_required} TAs{selectedTAs.length > 0 ? `, ${selectedTAs.length} preferred` : ""})
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                Pending Submission
              </span>
            )}
          </div>
          {course.co_instructors?.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              <span className="font-medium text-slate-700">Co-instructors:</span>{" "}
              {course.co_instructors.join(", ")}
            </p>
          )}
          {course.submitted_by && !isOpen && (
            <p className="mt-1 text-[11px] text-slate-400">
              Last saved by {course.submitted_by} {course.updated_at && `• ${new Date(course.updated_at).toLocaleDateString()}`}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-medium text-slate-400 hidden sm:inline">
            {isOpen ? "Collapse" : "Edit / View"}
          </span>
          <button
            type="button"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition"
            aria-label={isOpen ? "Collapse course" : "Expand course"}
          >
            <ChevronDown
              size={18}
              className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
            />
          </button>
        </div>
      </div>

      {isOpen && (
        <form onSubmit={handleSubmit} className="p-5 space-y-5 animate-in fade-in duration-200">
        {/* TAs Required input */}
        <div className="max-w-xs">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
            Number of TAs Required
          </label>
          <input
            type="number"
            min="0"
            max="30"
            value={tasRequired}
            onChange={(e) => setTasRequired(e.target.value)}
            disabled={!isCollecting || saving}
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50"
            placeholder="e.g. 3"
            required
          />
          <p className="mt-1 text-xs text-slate-500">Set to 0 if no TAs are required for this course.</p>
        </div>

        {/* Searchable TA Preference Dropdown */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-700">
            Preferred TAs (In order of preference)
          </label>
          <p className="text-xs text-slate-500 mb-2">
            Search and select TAs to add them to your preference ranking (Rank #1 gets highest algorithm weight).
          </p>

          {isCollecting && (
            <div className="relative">
              <div className="relative">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search TA by ID (e.g. M25...), name, or email..."
                  value={taSearch}
                  onFocus={() => setIsDropdownOpen(true)}
                  onChange={(e) => {
                    setTaSearch(e.target.value);
                    setIsDropdownOpen(true);
                  }}
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              {isDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setIsDropdownOpen(false)}
                  />
                  <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                    {filteredTAs.length === 0 ? (
                      <p className="p-3 text-center text-xs text-slate-400">
                        No matching TAs found or all already selected.
                      </p>
                    ) : (
                      filteredTAs.slice(0, 30).map((ta) => (
                        <button
                          key={ta.roll_no}
                          type="button"
                          onClick={() => handleSelectTA(ta.roll_no)}
                          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs hover:bg-indigo-50/70 transition"
                        >
                          <div>
                            <span className="font-mono font-bold text-indigo-700">{ta.roll_no}</span>
                            <span className="ml-2 font-medium text-slate-800">{ta.name}</span>
                            <span className="ml-2 text-slate-400 text-[11px]">{ta.program}</span>
                          </div>
                          <span className="text-slate-400 truncate max-w-xs">{ta.email}</span>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Selected TAs List with Ranking */}
          <div className="mt-3 space-y-2">
            {selectedTAs.length === 0 ? (
              <p className="text-xs italic text-slate-400">No preferred TAs chosen yet.</p>
            ) : (
              selectedTAs.map((roll, idx) => {
                const ta = taMap[roll] || { name: "Unknown", program: "—", email: "" };
                return (
                  <div
                    key={roll}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-100 font-bold text-indigo-700 text-[11px]">
                        #{idx + 1}
                      </span>
                      <div>
                        <span className="font-mono font-bold text-slate-900">{roll}</span>
                        <span className="ml-2 font-medium text-slate-700">{ta.name}</span>
                        {ta.email && <span className="ml-2 text-slate-400">({ta.email})</span>}
                      </div>
                    </div>

                    {isCollecting && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMoveUp(idx)}
                          disabled={idx === 0}
                          className="rounded p-1 text-slate-500 hover:bg-slate-200 disabled:opacity-30"
                          title="Move priority up"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveDown(idx)}
                          disabled={idx === selectedTAs.length - 1}
                          className="rounded p-1 text-slate-500 hover:bg-slate-200 disabled:opacity-30"
                          title="Move priority down"
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveTA(roll)}
                          className="rounded p-1 text-red-500 hover:bg-red-50 ml-1"
                          title="Remove TA"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {message && (
          <div
            className={`flex items-center gap-2 rounded-xl p-3 text-xs ${
              message.type === "success"
                ? "bg-emerald-50 text-emerald-800"
                : "bg-red-50 text-red-700"
            }`}
          >
            {message.type === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
            <span>{message.text}</span>
          </div>
        )}

        {isCollecting && (
          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:bg-slate-300"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              Save Requirements for {course.course_code}
            </button>
          </div>
        )}
      </form>
      )}
    </div>
  );
}

