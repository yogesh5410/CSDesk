import { supabase } from "./supabaseClient";

// Empty in development: requests stay relative and Vite proxies /api to the
// server. Set VITE_API_BASE_URL when the API lives on another origin.
const BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

export const apiUrl = (path) => `${BASE}${path}`;

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function unwrap(res) {
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!res.ok) {
    throw new Error(body.error || body.message || `Request failed (${res.status})`);
  }
  return body;
}

export async function apiGet(path) {
  return unwrap(await fetch(apiUrl(path), { headers: await authHeaders() }));
}

export async function apiPost(path, body) {
  return unwrap(await fetch(apiUrl(path), {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  }));
}

export async function apiUpload(path, file) {
  const form = new FormData();
  form.append("file", file);
  return unwrap(await fetch(apiUrl(path), {
    method: "POST",
    headers: await authHeaders(),          // no Content-Type: the browser sets the boundary
    body: form,
  }));
}

/**
 * POST that reads a newline-delimited JSON response as it arrives, calling
 * onEvent for each object. Used by the allocator so the UI can show live
 * phase and progress rather than waiting on one big response.
 */
export async function apiStream(path, body, onEvent) {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try { onEvent(JSON.parse(line)); } catch { /* partial line */ }
    }
  }
  if (buffer.trim()) {
    try { onEvent(JSON.parse(buffer)); } catch { /* ignore */ }
  }
}

/** Authenticated file download -- needs a Bearer header, so it cannot be a
 *  plain <a href>. Fetches the bytes, then hands the browser a blob. */
export async function apiDownload(path, filename) {
  const res = await fetch(apiUrl(path), { headers: await authHeaders() });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
