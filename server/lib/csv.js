/** Minimal RFC-4180 CSV reader/writer -- handles quoted fields, embedded
 *  commas/newlines and doubled quotes, which the uploaded files contain. */

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const src = text.replace(/^﻿/, "");          // strip BOM

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** CSV text -> array of objects keyed by the header row. */
export function parseCsvObjects(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) =>
    Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

export function toCsv(columns, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","),
          ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\n");
}
