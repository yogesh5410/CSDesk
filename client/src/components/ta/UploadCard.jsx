import { useRef, useState } from "react";
import {
  Upload, FileText, FileSpreadsheet, Check, AlertTriangle,
  Loader2, Download, ChevronDown, BookOpen, Calendar, Users, GraduationCap,
} from "lucide-react";
import { apiUpload } from "../../lib/api";
import { templateCsv } from "../../config/taTables";

function downloadText(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function getCardIcon(iconKey) {
  switch (iconKey) {
    case "book":
      return <BookOpen size={20} className="text-indigo-600" />;
    case "calendar":
      return <Calendar size={20} className="text-indigo-600" />;
    case "users":
      return <Users size={20} className="text-emerald-600" />;
    case "registration":
      return <GraduationCap size={20} className="text-emerald-600" />;
    default:
      return <FileText size={20} className="text-indigo-600" />;
  }
}

export default function UploadCard({ spec, kind, rowCount, onUploaded }) {
  const pdfInputRef = useRef(null);
  const csvInputRef = useRef(null);

  const [busyType, setBusyType] = useState(null); // 'pdf' | 'csv' | null
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showFormat, setShowFormat] = useState(false);

  // Resolve upload endpoints
  const pdfEndpoint = spec.pdfEndpoint || (kind === "pdf" ? spec.endpoint : null);
  const csvEndpoint = spec.csvEndpoint || (kind === "csv" ? spec.endpoint : null);
  const isDual = Boolean(pdfEndpoint && csvEndpoint);
  const hasPdf = Boolean(pdfEndpoint);
  const hasCsv = Boolean(csvEndpoint || spec.columns?.length);

  const busy = busyType !== null;

  async function handleFile(file, endpoint, type) {
    if (!file || !endpoint) return;
    setBusyType(type);
    setError(null);
    setResult(null);
    try {
      const res = await apiUpload(endpoint, file);
      setResult(res);
      onUploaded?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyType(null);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
      if (csvInputRef.current) csvInputRef.current.value = "";
    }
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition hover:shadow-md">
      {/* Header */}
      <div className="flex items-start gap-3.5">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${
          isDual
            ? "bg-gradient-to-br from-indigo-50 to-emerald-50 ring-indigo-200/60"
            : hasPdf
              ? "bg-indigo-50/80 ring-indigo-200/60"
              : "bg-emerald-50/80 ring-emerald-200/60"
        }`}>
          {getCardIcon(spec.icon)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-900 tracking-tight">{spec.title}</h3>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
              <span className={`h-1.5 w-1.5 rounded-full ${
                (rowCount ?? 0) > 0 ? "bg-emerald-500" : "bg-slate-300"
              }`} />
              {rowCount ?? 0} {rowCount === 1 ? "row" : "rows"}
            </span>

            {isDual ? (
              <span className="rounded-full bg-indigo-50 border border-indigo-200/70 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                PDF or CSV
              </span>
            ) : hasPdf ? (
              <span className="rounded-full bg-indigo-50 border border-indigo-200/70 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                PDF
              </span>
            ) : (
              <span className="rounded-full bg-emerald-50 border border-emerald-200/70 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                CSV
              </span>
            )}
          </div>

          <p className="mt-1 text-xs leading-relaxed text-slate-500 line-clamp-2">
            {spec.blurb || "Upload the input file to update this table."}
          </p>
        </div>
      </div>

      {/* Middle: Schema or Extracts */}
      <div className="mt-4 flex-1">
        {spec.extracts && !spec.columns && (
          <div className="flex flex-wrap gap-1.5">
            {spec.extracts.map((f) => (
              <span
                key={f}
                className="inline-flex items-center rounded-md bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200/80"
              >
                {f}
              </span>
            ))}
          </div>
        )}

        {hasCsv && spec.columns && (
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2">
              <button
                type="button"
                onClick={() => setShowFormat((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 transition"
              >
                <ChevronDown
                  size={15}
                  className={`transition-transform duration-200 ${showFormat ? "rotate-180" : ""}`}
                />
                <span>CSV Template & Schema</span>
              </button>

              <button
                type="button"
                onClick={() => downloadText(`${spec.table || spec.key}_template.csv`, templateCsv(spec))}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 shadow-2xs hover:bg-slate-50 transition"
                title="Download CSV Template"
              >
                <Download size={12} className="text-slate-500" />
                <span>Template</span>
              </button>
            </div>

            {showFormat && (
              <div className="border-t border-slate-200/80 bg-white px-3 py-2.5">
                <div className="overflow-x-auto rounded bg-slate-900 p-2 text-[11px] font-mono text-emerald-300">
                  <pre>{templateCsv(spec)}</pre>
                </div>
                <ul className="mt-2 space-y-1 text-[11px] text-slate-500">
                  {spec.required?.length > 0 && (
                    <li>
                      <span className="font-semibold text-slate-700">Required:</span>{" "}
                      {spec.required.join(", ")}
                    </li>
                  )}
                  {spec.notes?.map((n) => (
                    <li key={n} className="leading-snug">• {n}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer: Upload Actions */}
      <div className="mt-5 pt-3.5 border-t border-slate-100">
        {isDual ? (
          /* Split button in 2 parts for Course List */
          <div className="grid grid-cols-2 gap-2.5">
            <label
              className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-[0.98] ${
                busy ? "cursor-not-allowed opacity-60 pointer-events-none" : ""
              }`}
            >
              {busyType === "pdf" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <FileText size={14} />
              )}
              <span>{busyType === "pdf" ? "Parsing…" : "Upload .pdf"}</span>
              <input
                ref={pdfInputRef}
                type="file"
                accept={spec.acceptPdf || ".pdf,application/pdf"}
                className="hidden"
                disabled={busy}
                onChange={(e) => handleFile(e.target.files?.[0], pdfEndpoint, "pdf")}
              />
            </label>

            <label
              className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98] ${
                busy ? "cursor-not-allowed opacity-60 pointer-events-none" : ""
              }`}
            >
              {busyType === "csv" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <FileSpreadsheet size={14} />
              )}
              <span>{busyType === "csv" ? "Parsing…" : "Upload .csv"}</span>
              <input
                ref={csvInputRef}
                type="file"
                accept={spec.acceptCsv || ".csv,text/csv"}
                className="hidden"
                disabled={busy}
                onChange={(e) => handleFile(e.target.files?.[0], csvEndpoint, "csv")}
              />
            </label>
          </div>
        ) : hasPdf ? (
          /* Single button: PDF */
          <label
            className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-[0.98] ${
              busy ? "cursor-not-allowed opacity-60 pointer-events-none" : ""
            }`}
          >
            {busyType === "pdf" ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Upload size={16} />
            )}
            <span>{busyType === "pdf" ? "Parsing PDF…" : "Upload .pdf"}</span>
            <input
              ref={pdfInputRef}
              type="file"
              accept={spec.acceptPdf || spec.accept || ".pdf,application/pdf"}
              className="hidden"
              disabled={busy}
              onChange={(e) => handleFile(e.target.files?.[0], pdfEndpoint, "pdf")}
            />
          </label>
        ) : (
          /* Single button: CSV */
          <label
            className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 active:scale-[0.98] ${
              busy ? "cursor-not-allowed opacity-60 pointer-events-none" : ""
            }`}
          >
            {busyType === "csv" ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Upload size={16} />
            )}
            <span>{busyType === "csv" ? "Parsing CSV…" : "Upload .csv"}</span>
            <input
              ref={csvInputRef}
              type="file"
              accept={spec.acceptCsv || spec.accept || ".csv,text/csv"}
              className="hidden"
              disabled={busy}
              onChange={(e) => handleFile(e.target.files?.[0], csvEndpoint, "csv")}
            />
          </label>
        )}

        {/* Success Feedback */}
        {result && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800 border border-emerald-100">
            <Check size={15} className="mt-0.5 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{result.message}</p>
              {result.problems?.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-[11px] text-emerald-700/80">
                  {result.problems.map((p) => (
                    <li key={p}>• {p}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {/* Error Feedback */}
        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 border border-red-100">
            <AlertTriangle size={15} className="mt-0.5 shrink-0 text-red-600" />
            <p className="min-w-0 break-words flex-1 font-medium">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
