import { useState, useEffect, useCallback, useMemo } from "react";
import {
  GitPullRequest, CheckCircle2, XCircle, Clock, AlertTriangle,
  Search, Filter, Check, X, MessageSquare, Loader2, RefreshCw, User, BookOpen,
} from "lucide-react";
import { apiGet, apiPost } from "../../lib/api";

export default function RequestsTab({ onRefresh }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all"); // 'all', 'pending', 'approved', 'rejected'
  const [searchQuery, setSearchQuery] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  // Modal states
  const [rejectModalReq, setRejectModalReq] = useState(null);
  const [rejectRemark, setRejectRemark] = useState("");
  const [approveConfirmReq, setApproveConfirmReq] = useState(null);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet("/api/ta/requests");
      setRequests(res.requests || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const stats = useMemo(() => {
    const total = requests.length;
    const pending = requests.filter((r) => r.status === "pending").length;
    const approved = requests.filter((r) => r.status === "approved").length;
    const rejected = requests.filter((r) => r.status === "rejected").length;
    return { total, pending, approved, rejected };
  }, [requests]);

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchCourse = r.course_code?.toLowerCase().includes(q) || r.course_name?.toLowerCase().includes(q);
        const matchFaculty = r.faculty_name?.toLowerCase().includes(q) || r.faculty_email?.toLowerCase().includes(q);
        const matchTa = r.ta_roll_no?.toLowerCase().includes(q) || r.ta_name?.toLowerCase().includes(q);
        if (!matchCourse && !matchFaculty && !matchTa) return false;
      }
      return true;
    });
  }, [requests, filterStatus, searchQuery]);

  // Handle Approve
  async function executeApprove(reqItem) {
    setActionBusy(true);
    try {
      await apiPost(`/api/ta/requests/${reqItem.id}/review`, {
        action: "approve",
        admin_remark: "",
      });
      setApproveConfirmReq(null);
      await fetchRequests();
      onRefresh?.();
    } catch (err) {
      alert("Failed to approve request: " + err.message);
    } finally {
      setActionBusy(false);
    }
  }

  function handleApproveClick(reqItem) {
    if (reqItem.request_type === "ADD" && reqItem.current_allocation) {
      // Show warning that TA is already assigned elsewhere
      setApproveConfirmReq(reqItem);
    } else {
      executeApprove(reqItem);
    }
  }

  // Handle Reject
  async function executeReject() {
    if (!rejectModalReq) return;
    setActionBusy(true);
    try {
      await apiPost(`/api/ta/requests/${rejectModalReq.id}/review`, {
        action: "reject",
        admin_remark: rejectRemark.trim(),
      });
      setRejectModalReq(null);
      setRejectRemark("");
      await fetchRequests();
      onRefresh?.();
    } catch (err) {
      alert("Failed to reject request: " + err.message);
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Overview Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Requests</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{stats.total}</p>
          <p className="mt-0.5 text-xs text-slate-400">All submitted requests</p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">Pending Review</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{stats.pending}</p>
          <p className="mt-0.5 text-xs text-amber-600">Awaiting your approval</p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Approved</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{stats.approved}</p>
          <p className="mt-0.5 text-xs text-emerald-600">Allocations adjusted</p>
        </div>

        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-rose-800">Rejected</p>
          <p className="mt-1 text-2xl font-bold text-rose-700">{stats.rejected}</p>
          <p className="mt-0.5 text-xs text-rose-600">With feedback remark</p>
        </div>
      </div>

      {/* Main Container */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Controls Toolbar */}
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between bg-slate-50/50">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 mr-1">Status:</span>
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
              {[
                { key: "all", label: "All" },
                { key: "pending", label: "Pending", count: stats.pending },
                { key: "approved", label: "Approved" },
                { key: "rejected", label: "Rejected" },
              ].map(({ key, label, count }) => (
                <button
                  key={key}
                  onClick={() => setFilterStatus(key)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold transition ${
                    filterStatus === key
                      ? "bg-white text-indigo-700 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <span>{label}</span>
                  {count !== undefined && count > 0 && (
                    <span className="rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.2 text-[10px] font-bold">
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search course, faculty, TA…"
                className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs sm:text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            <button
              type="button"
              onClick={fetchRequests}
              className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 transition"
              title="Refresh requests"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Requests List */}
        {loading ? (
          <div className="flex items-center justify-center p-12 text-slate-400">
            <Loader2 className="animate-spin text-indigo-600 mr-2" size={24} />
            <span className="text-sm">Loading change requests…</span>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-sm text-rose-600">{error}</div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <GitPullRequest size={36} className="mx-auto text-slate-300 mb-2" />
            <p className="text-sm font-medium">No faculty change requests found.</p>
            <p className="text-xs text-slate-400 mt-1">
              {filterStatus !== "all"
                ? `No requests matching status '${filterStatus}'.`
                : "Faculty requests to add or delete TAs will appear here for your review."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredRequests.map((reqItem) => {
              const isAdd = reqItem.request_type === "ADD";
              const isPending = reqItem.status === "pending";
              const isApproved = reqItem.status === "approved";
              const isRejected = reqItem.status === "rejected";
              const isAssignedElsewhere = isAdd && reqItem.current_allocation;

              return (
                <div key={reqItem.id} className="p-4 sm:p-5 hover:bg-slate-50/50 transition">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    {/* Left: Course & Request Details */}
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${
                          isAdd ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                        }`}>
                          {isAdd ? "+ Request to Add TA" : "- Request to Delete TA"}
                        </span>

                        <span className="font-mono text-sm font-bold text-indigo-700">
                          {reqItem.course_code}
                        </span>
                        <span className="font-semibold text-slate-900 truncate">
                          {reqItem.course_name}
                        </span>

                        {/* Status Badge */}
                        {isPending && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                            <Clock size={12} /> Pending Review
                          </span>
                        )}
                        {isApproved && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                            <CheckCircle2 size={12} /> Approved
                          </span>
                        )}
                        {isRejected && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
                            <XCircle size={12} /> Rejected
                          </span>
                        )}
                      </div>

                      {/* TA & Faculty Details Box */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs rounded-xl bg-slate-50 p-3 border border-slate-100">
                        <div>
                          <p className="text-slate-400 font-medium">Requested TA:</p>
                          <p className="font-semibold text-slate-800 mt-0.5 font-mono">
                            {reqItem.ta_roll_no} — {reqItem.ta_name}{" "}
                            {reqItem.ta_program && (
                              <span className="text-slate-500 font-sans">({reqItem.ta_program})</span>
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-400 font-medium">Requested By (Faculty):</p>
                          <p className="font-semibold text-slate-800 mt-0.5">
                            {reqItem.faculty_name || reqItem.faculty_email}
                          </p>
                          <p className="text-slate-500 text-[11px]">{reqItem.faculty_email}</p>
                        </div>
                      </div>

                      {/* Informed Decision Banner: Is TA assigned elsewhere? */}
                      {isAdd && (
                        <div>
                          {isAssignedElsewhere ? (
                            <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                              <AlertTriangle size={15} className="shrink-0 text-amber-600" />
                              <div>
                                <span className="font-semibold">⚠️ Note for Admin:</span> This TA is currently allocated to{" "}
                                <strong className="font-mono text-indigo-700">
                                  {reqItem.current_allocation.course_code}
                                </strong>{" "}
                                ({reqItem.current_allocation.course_name})
                                {reqItem.current_allocation.instructors && (
                                  <span className="text-amber-700">
                                    {" "}taught by {reqItem.current_allocation.instructors}
                                  </span>
                                )}. Approving will reallocate them from {reqItem.current_allocation.course_code} to {reqItem.course_code}.
                              </div>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                              <CheckCircle2 size={13} className="text-emerald-600" />
                              <span>TA is currently free / not assigned to any other course</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Faculty's Reason / Note */}
                      {reqItem.reason && (
                        <div className="flex items-start gap-2 text-xs text-slate-600 pt-1">
                          <MessageSquare size={13} className="shrink-0 text-slate-400 mt-0.5" />
                          <div>
                            <span className="font-semibold text-slate-700">Faculty Reason:</span>{" "}
                            {reqItem.reason}
                          </div>
                        </div>
                      )}

                      {/* Admin Remark if rejected */}
                      {isRejected && reqItem.admin_remark && (
                        <div className="rounded-xl border border-rose-100 bg-rose-50/70 p-3 text-xs text-rose-800">
                          <span className="font-bold">Admin Rejection Remark:</span> {reqItem.admin_remark}
                        </div>
                      )}

                      {/* Timestamp & Reviewed info */}
                      <p className="text-[11px] text-slate-400">
                        Submitted: {new Date(reqItem.created_at).toLocaleString()}
                        {reqItem.reviewed_by && (
                          <span> · Reviewed by {reqItem.reviewed_by} on {new Date(reqItem.reviewed_at || reqItem.updated_at).toLocaleString()}</span>
                        )}
                      </p>
                    </div>

                    {/* Right: Action Buttons (Approve / Reject) */}
                    {isPending && (
                      <div className="flex sm:flex-col items-center gap-2 shrink-0 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleApproveClick(reqItem)}
                          disabled={actionBusy}
                          className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-4 py-2 shadow-sm transition active:scale-[0.98] disabled:opacity-50"
                        >
                          <Check size={14} />
                          <span>Approve</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setRejectModalReq(reqItem);
                            setRejectRemark("");
                          }}
                          disabled={actionBusy}
                          className="flex items-center justify-center gap-1.5 rounded-xl border border-rose-200 hover:bg-rose-50 text-rose-700 font-semibold text-xs px-4 py-2 transition active:scale-[0.98] disabled:opacity-50"
                        >
                          <X size={14} />
                          <span>Reject…</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reject Modal with optional remark */}
      {rejectModalReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 p-5 space-y-4 animate-scaleIn">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-slate-900">Reject Change Request</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Request to {rejectModalReq.request_type} TA <strong className="font-mono">{rejectModalReq.ta_roll_no}</strong> for <strong>{rejectModalReq.course_code}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRejectModalReq(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Optional Message / Reason for Faculty:
              </label>
              <textarea
                rows={3}
                value={rejectRemark}
                onChange={(e) => setRejectRemark(e.target.value)}
                placeholder="e.g. TA has schedule clash with course slot; Maximum course TA quota reached."
                className="w-full rounded-xl border border-slate-200 p-3 text-xs sm:text-sm outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                This remark will be visible to the requesting faculty member.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRejectModalReq(null)}
                disabled={actionBusy}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeReject}
                disabled={actionBusy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-rose-700 transition active:scale-[0.98] disabled:opacity-50"
              >
                {actionBusy && <Loader2 size={14} className="animate-spin" />}
                <span>Confirm Rejection</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve Confirmation Dialog when TA is already assigned to another course */}
      {approveConfirmReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-amber-200 p-5 space-y-4 animate-scaleIn">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-200">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Reallocate Contested TA?</h3>
                <p className="mt-1 text-xs sm:text-sm text-slate-600 leading-relaxed">
                  TA <strong className="font-mono text-slate-900">{approveConfirmReq.ta_roll_no} ({approveConfirmReq.ta_name})</strong> is currently assigned to <strong className="font-mono text-indigo-700">{approveConfirmReq.current_allocation?.course_code}</strong>.
                </p>
                <p className="mt-2 text-xs text-amber-800 bg-amber-50/80 p-2.5 rounded-xl border border-amber-200/60">
                  Approving this request will automatically remove them from <strong>{approveConfirmReq.current_allocation?.course_code}</strong> and assign them to <strong>{approveConfirmReq.course_code}</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setApproveConfirmReq(null)}
                disabled={actionBusy}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => executeApprove(approveConfirmReq)}
                disabled={actionBusy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition active:scale-[0.98] disabled:opacity-50"
              >
                {actionBusy && <Loader2 size={14} className="animate-spin" />}
                <span>Yes, Reallocate &amp; Approve</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
