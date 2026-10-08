import { useCallback, useEffect, useState } from "react";
import { Search, ChevronLeft, ChevronRight, Loader2, Database, Inbox } from "lucide-react";
import { apiGet } from "../../lib/api";

const PAGE = 25;

export default function TablePreview({ tables }) {
  const names = Object.keys(tables || {});
  const [active, setActive] = useState(names[0] || "courses");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE, total);

  return (
    <div className="space-y-4">
      {/* table switcher -- scrolls sideways instead of wrapping on narrow screens */}
      <div className="-mx-1 overflow-x-auto pb-1">
        <div className="flex min-w-max gap-2 px-1">
          {names.map((name) => {
            const t = tables[name];
            const on = name === active;
            return (
              <button
                key={name}
                onClick={() => { setActive(name); setOffset(0); setQuery(""); }}
                className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium transition ${
                  on ? "bg-indigo-600 text-white shadow-sm"
                     : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}
              >
                {t.label}
                <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                  on ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Database size={16} className="text-slate-400" />
            <span>
              {tables[active]?.source} · showing {from}–{to} of {total}
            </span>
          </div>
          <div className="relative sm:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search this table…"
              className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>

        {error && (
          <p className="px-4 py-6 text-sm text-red-600">{error}</p>
        )}

        {!error && (
          <div className="relative overflow-x-auto">
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70">
                <Loader2 className="animate-spin text-indigo-600" />
              </div>
            )}
            {data?.rows?.length ? (
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    {data.columns.map((c) => (
                      <th key={c} className="whitespace-nowrap px-4 py-3 font-semibold">
                        {c.replace(/_/g, " ")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.rows.map((row, i) => (
                    <tr key={i} className="transition hover:bg-slate-50/70">
                      {data.columns.map((c) => (
                        <td key={c} className="max-w-[22rem] truncate px-4 py-2.5 text-slate-700"
                            title={String(row[c] ?? "")}>
                          {String(row[c] ?? "") || <span className="text-slate-300">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              !loading && (
                <div className="flex flex-col items-center gap-2 px-4 py-14 text-slate-400">
                  <Inbox size={28} />
                  <p className="text-sm">
                    {debounced ? "Nothing matches that search." : "No rows yet — upload this file first."}
                  </p>
                </div>
              )
            )}
          </div>
        )}

        {total > PAGE && (
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <button
              onClick={() => setOffset((o) => Math.max(0, o - PAGE))}
              disabled={offset === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition enabled:hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <span className="text-xs text-slate-500">
              Page {Math.floor(offset / PAGE) + 1} of {Math.max(1, Math.ceil(total / PAGE))}
            </span>
            <button
              onClick={() => setOffset((o) => (o + PAGE < total ? o + PAGE : o))}
              disabled={offset + PAGE >= total}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition enabled:hover:bg-slate-50 disabled:opacity-40"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
