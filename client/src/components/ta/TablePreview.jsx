import { useCallback, useEffect, useState } from "react";
import {
  Search, ChevronLeft, ChevronRight, Loader2, Database, Inbox,
  Plus, Pencil, Trash2, X, Check, AlertTriangle, Lock,
} from "lucide-react";
import { apiGet, apiPost, apiPatch, apiDelete } from "../../lib/api";

const PAGE = 25;

function validateRowInput(tableName, columns, requiredCols, formData) {
  const errors = {};

  for (const col of columns) {
    const val = formData[col];
    const strVal = val === null || val === undefined ? "" : String(val).trim();

    // Check required fields
    if (requiredCols.includes(col) && !strVal) {
      errors[col] = "This field is required.";
      continue;
    }

    if (!strVal) continue; // Optional field is empty, which is valid

    // Field-specific validation
    if (col === "course_code" || col === "student_roll_no" || col === "roll_no") {
      if (!/^[A-Za-z0-9_-]+$/.test(strVal)) {
        errors[col] = "Must be alphanumeric (e.g. CSL301, M25CS002).";
      }
    } else if (col === "tas_required") {
      const num = Number(val);
      if (!Number.isInteger(num) || num < 1) {
        errors[col] = "Must be a positive integer (>= 1).";
      }
    } else if (col === "day") {
      const validDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
      if (!validDays.some((d) => d.toLowerCase() === strVal.toLowerCase())) {
        errors[col] = "Must be Monday, Tuesday, Wednesday, Thursday, or Friday.";
      }
    } else if (col === "start_time" || col === "end_time") {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(strVal)) {
        errors[col] = "Must be HH:MM in 24-hr format (e.g. 09:30, 14:00).";
      }
    } else if (col === "email") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strVal)) {
        errors[col] = "Must be a valid email address.";
      }
    }
  }

  // Cross-field validation for timetable
  if (formData.start_time && formData.end_time && !errors.start_time && !errors.end_time) {
    if (formData.start_time >= formData.end_time) {
      errors.end_time = "End time must be later than start time.";
    }
  }

  return errors;
}

function getRowId(row, primaryKey, columns) {
  if (primaryKey && row[primaryKey] !== undefined && row[primaryKey] !== null) {
    return row[primaryKey];
  }
  if (row.id !== undefined && row.id !== null) {
    return row.id;
  }
  return row[columns[0]];
}

export default function TablePreview({ tables, onRefresh }) {
  const names = Object.keys(tables || {});
  const [active, setActive] = useState(names[0] || "courses");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Modals state
  const [modalMode, setModalMode] = useState(null); // 'add' | 'edit' | null
  const [currentRow, setCurrentRow] = useState(null);
  const [formData, setFormData] = useState({});
  const [formErrors, setFormErrors] = useState({});
  const [actionBusy, setActionBusy] = useState(false);
  const [modalApiError, setModalApiError] = useState(null);

  // Delete confirmation
  const [deleteRow, setDeleteRow] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(query); setOffset(0); }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q = debounced ? `&q=${encodeURIComponent(debounced)}` : "";
      setData(await apiGet(`/api/ta/table/${active}?limit=${PAGE}&offset=${offset}${q}`));
    } catch (e) {
      setError(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [active, debounced, offset]);

  useEffect(() => { load(); }, [load]);

  const isReadOnly = Boolean(data?.readOnly);
  const columns = data?.columns || [];
  const primaryKey = data?.primaryKey || "id";
  const requiredCols = data?.required || [];
  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE, total);

  // Open Add Modal
  function handleOpenAdd() {
    const initial = {};
    columns.forEach((col) => {
      initial[col] = col === "day" ? "Monday" : "";
    });
    setFormData(initial);
    setFormErrors({});
    setModalApiError(null);
    setCurrentRow(null);
    setModalMode("add");
  }

  // Open Edit Modal
  function handleOpenEdit(row) {
    const initial = {};
    columns.forEach((col) => {
      initial[col] = row[col] ?? "";
    });
    setFormData(initial);
    setFormErrors({});
    setModalApiError(null);
    setCurrentRow(row);
    setModalMode("edit");
  }

  // Handle Form Change with real-time field validation
  function handleFieldChange(col, val) {
    const updated = { ...formData, [col]: val };
    setFormData(updated);

    // Validate this specific field live
    const errs = validateRowInput(active, [col], requiredCols, updated);
    setFormErrors((prev) => ({
      ...prev,
      [col]: errs[col] || null,
      ...(col === "start_time" || col === "end_time"
        ? { end_time: errs.end_time || null }
        : {}),
    }));
  }

  // Submit Add or Edit
  async function handleSaveRow(e) {
    e.preventDefault();
    setModalApiError(null);

    // Validate entire form
    const errors = validateRowInput(active, columns, requiredCols, formData);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setActionBusy(true);
    try {
      if (modalMode === "add") {
        await apiPost(`/api/ta/table/${active}`, formData);
        setSuccessMsg("Row successfully added to database.");
      } else {
        const rowId = getRowId(currentRow, primaryKey, columns);
        await apiPatch(`/api/ta/table/${active}/${encodeURIComponent(rowId)}`, formData);
        setSuccessMsg("Row successfully updated in database.");
      }
      setModalMode(null);
      await load();
      onRefresh?.();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setModalApiError(err.message);
    } finally {
      setActionBusy(false);
    }
  }

  // Confirm Delete
  async function handleConfirmDelete() {
    if (!deleteRow) return;
    setActionBusy(true);
    try {
      const rowId = getRowId(deleteRow, primaryKey, columns);
      await apiDelete(`/api/ta/table/${active}/${encodeURIComponent(rowId)}`);
      setSuccessMsg("Row successfully deleted from database.");
      setDeleteRow(null);
      await load();
      onRefresh?.();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setError(err.message);
      setDeleteRow(null);
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Table switcher tabs */}
      <div className="-mx-1 overflow-x-auto pb-1">
        <div className="flex min-w-max gap-2 px-1">
          {names.map((name) => {
            const t = tables[name];
            const on = name === active;
            return (
              <button
                key={name}
                onClick={() => { setActive(name); setOffset(0); setQuery(""); setSuccessMsg(null); }}
                className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition ${
                  on ? "bg-indigo-600 text-white shadow-sm"
                     : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {t.label}
                <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                  on ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                }`}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main card */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Card header / controls */}
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between bg-slate-50/50">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Database size={16} className="text-slate-400 shrink-0" />
            <span>
              <strong className="text-slate-800">{tables[active]?.label}</strong> · {tables[active]?.source} · showing {from}–{to} of {total}
            </span>
            {isReadOnly && (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
                <Lock size={12} /> Read-only
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <div className="relative w-full sm:w-64">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search table…"
                className="w-full rounded-xl border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs sm:text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </div>

            {!isReadOnly && (
              <button
                type="button"
                onClick={handleOpenAdd}
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl bg-indigo-600 px-3.5 py-1.5 text-xs sm:text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-[0.98]"
              >
                <Plus size={16} /> Add Row
              </button>
            )}
          </div>
        </div>

        {/* Success toast / alert */}
        {successMsg && (
          <div className="flex items-center justify-between border-b border-emerald-100 bg-emerald-50 px-4 py-2.5 text-xs sm:text-sm text-emerald-800 animate-fadeIn">
            <div className="flex items-center gap-2">
              <Check size={16} className="text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessMsg(null)}
              className="text-emerald-600 hover:text-emerald-800 p-0.5"
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* Global error banner */}
        {error && (
          <div className="flex items-center justify-between border-b border-red-100 bg-red-50 px-4 py-2.5 text-xs sm:text-sm text-red-700">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-800 p-0.5"
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* Table content */}
        <div className="relative overflow-x-auto">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
              <Loader2 className="animate-spin text-indigo-600" size={28} />
            </div>
          )}

          {data?.rows?.length ? (
            <table className="min-w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-100/80 text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                <tr>
                  {columns.map((c) => (
                    <th key={c} className="whitespace-nowrap px-4 py-3">
                      {c.replace(/_/g, " ")}
                      {requiredCols.includes(c) && (
                        <span className="text-rose-500 ml-0.5" title="Required field">*</span>
                      )}
                    </th>
                  ))}
                  {!isReadOnly && (
                    <th className="whitespace-nowrap px-4 py-3 text-right">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.rows.map((row, i) => {
                  const rowId = getRowId(row, primaryKey, columns);
                  return (
                    <tr
                      key={rowId || i}
                      className="group transition hover:bg-slate-50/80"
                    >
                      {columns.map((c) => (
                        <td
                          key={c}
                          className="max-w-[20rem] truncate px-4 py-2.5 text-slate-700"
                          title={String(row[c] ?? "")}
                        >
                          {String(row[c] ?? "") || <span className="text-slate-300">—</span>}
                        </td>
                      ))}

                      {!isReadOnly && (
                        <td className="whitespace-nowrap px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(row)}
                              title="Edit Row"
                              className="inline-flex items-center justify-center rounded-lg p-1.5 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteRow(row)}
                              title="Delete Row"
                              className="inline-flex items-center justify-center rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            !loading && (
              <div className="flex flex-col items-center gap-2 px-4 py-16 text-slate-400">
                <Inbox size={32} />
                <p className="text-sm font-medium">
                  {debounced ? "No rows match your search query." : "No rows found in this table."}
                </p>
                {!isReadOnly && !debounced && (
                  <button
                    type="button"
                    onClick={handleOpenAdd}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Plus size={14} /> Add First Row
                  </button>
                )}
              </div>
            )
          )}
        </div>

        {/* Pagination footer */}
        {total > PAGE && (
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/40 px-4 py-3">
            <button
              onClick={() => setOffset((o) => Math.max(0, o - PAGE))}
              disabled={offset === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-600 transition enabled:hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <span className="text-xs text-slate-500 font-medium">
              Page {Math.floor(offset / PAGE) + 1} of {Math.max(1, Math.ceil(total / PAGE))} ({total} total)
            </span>
            <button
              onClick={() => setOffset((o) => (o + PAGE < total ? o + PAGE : o))}
              disabled={offset + PAGE >= total}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-600 transition enabled:hover:bg-slate-50 disabled:opacity-40"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Add / Edit Row Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-scaleIn">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 bg-slate-50/60">
              <div>
                <h3 className="font-bold text-slate-900">
                  {modalMode === "add" ? `Add New Row to ${tables[active]?.label}` : `Edit Row (${tables[active]?.label})`}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {modalMode === "add"
                    ? "Enter row details. Formats and datatypes are strictly validated before saving."
                    : "Update row values. All modifications are immediately saved to the database."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveRow} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {modalApiError && (
                <div className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700 border border-red-100">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-600" />
                  <p className="font-medium">{modalApiError}</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {columns.map((col) => {
                  const isPk = modalMode === "edit" && col === primaryKey;
                  const isReq = requiredCols.includes(col);
                  const err = formErrors[col];

                  return (
                    <div
                      key={col}
                      className={
                        col === "course_name" || col === "instructors" || col === "preferred_ta_rolls"
                          ? "sm:col-span-2"
                          : ""
                      }
                    >
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        {col.replace(/_/g, " ")}
                        {isReq && <span className="text-rose-500 ml-0.5">*</span>}
                        {isPk && <span className="ml-1 text-[10px] text-slate-400 font-normal">(Primary Key)</span>}
                      </label>

                      {col === "day" ? (
                        <select
                          value={formData[col] ?? "Monday"}
                          onChange={(e) => handleFieldChange(col, e.target.value)}
                          disabled={isPk}
                          className={`w-full rounded-xl border px-3 py-2 text-xs sm:text-sm outline-none transition ${
                            err
                              ? "border-red-400 bg-red-50/20 focus:ring-2 focus:ring-red-100"
                              : "border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                          } ${isPk ? "bg-slate-100 text-slate-500 cursor-not-allowed" : "bg-white"}`}
                        >
                          <option value="Monday">Monday</option>
                          <option value="Tuesday">Tuesday</option>
                          <option value="Wednesday">Wednesday</option>
                          <option value="Thursday">Thursday</option>
                          <option value="Friday">Friday</option>
                        </select>
                      ) : (
                        <input
                          type={
                            col === "tas_required"
                              ? "number"
                              : col === "email"
                              ? "email"
                              : "text"
                          }
                          min={col === "tas_required" ? "1" : undefined}
                          step={col === "tas_required" ? "1" : undefined}
                          placeholder={
                            col === "start_time"
                              ? "09:30"
                              : col === "end_time"
                              ? "10:30"
                              : col === "course_code"
                              ? "CSL301"
                              : col === "roll_no" || col === "student_roll_no"
                              ? "M25CS002"
                              : col === "email"
                              ? "user@iitbhilai.ac.in"
                              : ""
                          }
                          value={formData[col] ?? ""}
                          onChange={(e) => handleFieldChange(col, e.target.value)}
                          disabled={isPk}
                          className={`w-full rounded-xl border px-3 py-2 text-xs sm:text-sm outline-none transition ${
                            err
                              ? "border-red-400 bg-red-50/20 focus:ring-2 focus:ring-red-100"
                              : "border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                          } ${isPk ? "bg-slate-100 text-slate-500 cursor-not-allowed" : "bg-white"}`}
                        />
                      )}

                      {err && (
                        <p className="mt-1 text-[11px] font-medium text-rose-600 animate-fadeIn">
                          {err}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  disabled={actionBusy}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionBusy}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50"
                >
                  {actionBusy && <Loader2 size={14} className="animate-spin" />}
                  <span>{modalMode === "add" ? "Save to Database" : "Update Database"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 p-5 space-y-4 animate-scaleIn">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600 ring-1 ring-red-200">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900">Delete Row?</h3>
                <p className="mt-1 text-xs sm:text-sm text-slate-500">
                  Are you sure you want to delete row with {primaryKey} <strong className="text-slate-800 font-mono">"{String(getRowId(deleteRow, primaryKey, columns))}"</strong> from <strong>{tables[active]?.label}</strong>? This action directly removes the record from the database.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteRow(null)}
                disabled={actionBusy}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs sm:text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={actionBusy}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 active:scale-[0.98] disabled:opacity-50"
              >
                {actionBusy && <Loader2 size={14} className="animate-spin" />}
                <span>Delete Immediately</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
