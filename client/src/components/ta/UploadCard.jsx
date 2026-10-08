import { useRef, useState } from "react";
import {
  Upload, FileText, FileSpreadsheet, Check, AlertTriangle,
  Loader2, Download, ChevronDown,
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

export default function UploadCard({ spec, kind, rowCount, onUploaded }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [showFormat, setShowFormat] = useState(false);
  const isCsv = kind === "csv";

  async function handleFile(file) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiUpload(spec.endpoint, file);
      setResult(res);
      onUploaded?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
          isCsv ? "bg-emerald-50 text-emerald-700" : "bg-indigo-50 text-indigo-700"}`}>
          {isCsv ? <FileSpreadsheet size={20} /> : <FileText size={20} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-900">{spec.title}</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {rowCount ?? 0} rows
            </span>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            {spec.blurb ||
              `Upload a .csv with the exact header shown below. The file replaces the whole table.`}
          </p>
        </div>
      </div>

      {spec.extracts && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {spec.extracts.map((f) => (
            <span key={f} className="rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600 ring-1 ring-slate-200">
              {f}
            </span>
          ))}
        </div>
      )}

      {isCsv && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70">
          <button
            type="button"
            onClick={() => setShowFormat((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            Required CSV format
            <ChevronDown size={16} className={`transition-transform ${showFormat ? "rotate-180" : ""}`} />
          </button>
          {showFormat && (
            <div className="border-t border-slate-200 px-3 py-3">
              <div className="overflow-x-auto">
                <pre className="min-w-full whitespace-pre text-[11px] leading-relaxed text-slate-700">
{templateCsv(spec)}
                </pre>
              </div>
              <ul className="mt-3 space-y-1">
                {spec.required?.length > 0 && (
                  <li className="text-xs text-slate-500">
                    <span className="font-medium text-slate-700">Required:</span>{" "}
                    {spec.required.join(", ")}
                  </li>
                )}
                {spec.notes?.map((n) => (
                  <li key={n} className="text-xs text-slate-500">• {n}</li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => downloadText(`${spec.table}_template.csv`, templateCsv(spec))}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <Download size={14} /> Download template
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex-1" />

      <label
        className={`mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition ${
          busy ? "cursor-wait bg-slate-400"
               : isCsv ? "bg-emerald-600 hover:bg-emerald-700"
                       : "bg-indigo-600 hover:bg-indigo-700"}`}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
        {busy ? "Parsing…" : `Upload ${isCsv ? ".csv" : ".pdf"}`}
        <input
          ref={inputRef}
          type="file"
          accept={spec.accept || ".csv,text/csv"}
          className="hidden"
          disabled={busy}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </label>

      {result && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <Check size={16} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p>{result.message}</p>
            {result.problems?.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs text-emerald-700/80">
                {result.problems.map((p) => <li key={p}>• {p}</li>)}
              </ul>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p className="min-w-0 break-words">{error}</p>
        </div>
      )}
    </div>
  );
}
