import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const TIMEOUT_MS = 8000;

export default function AuthCallback() {
  const { user, loading, authError, setAuthError } = useAuth();
  const [timedOut, setTimedOut] = useState(false);
  const [snapshot] = useState(() => ({
    href: window.location.href,
    search: window.location.search,
    hash: window.location.hash,
  }));

  useEffect(() => {
    const description = new URLSearchParams(snapshot.search).get(
      "error_description",
    );
    if (description) {
      setAuthError(decodeURIComponent(description.replace(/\+/g, " ")));
    }

    const timer = setTimeout(() => setTimedOut(true), TIMEOUT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  const failed = !loading && (authError || timedOut);

  if (failed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
        <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">
            Sign-in didn&apos;t complete
          </h1>

          {authError ? (
            <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {authError}
            </p>
          ) : (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
              No session was established within {TIMEOUT_MS / 1000}s.
            </p>
          )}

          <div className="mt-4 rounded-md bg-slate-50 p-3 text-xs text-slate-500">
            <p className="font-medium text-slate-600">
              Debug info — screenshot this if you need help:
            </p>
            <p className="mt-2 break-all">
              <span className="font-medium text-slate-600">url:</span>{" "}
              {snapshot.href}
            </p>
            <p className="mt-1 break-all">
              <span className="font-medium text-slate-600">search:</span>{" "}
              {snapshot.search || "(empty)"}
            </p>
            <p className="mt-1 break-all">
              <span className="font-medium text-slate-600">hash:</span>{" "}
              {snapshot.hash || "(empty)"}
            </p>
          </div>

          <a
            href="/login"
            className="mt-6 inline-block rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-800"
          >
            Back to sign in
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center text-slate-500">
      Signing you in…
    </div>
  );
}
