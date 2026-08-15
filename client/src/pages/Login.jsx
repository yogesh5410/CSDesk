import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ALLOWED_EMAIL_DOMAIN } from "../lib/supabaseClient";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A9 9 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.581C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}

export default function Login() {
  const { user, loading, authError, signInWithGoogle } = useAuth();

  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-blue-700 text-sm font-bold text-white">
          CS
        </div>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">
          Sign in to CSDesk
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Use your official @{ALLOWED_EMAIL_DOMAIN} Google account.
        </p>

        {authError && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {authError}
          </p>
        )}

        <button
          type="button"
          onClick={signInWithGoogle}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          <GoogleIcon />
          Sign in with Google
        </button>

        <p className="mt-6 text-xs text-slate-400">
          Access is restricted to IIT Bhilai CS Office members.
        </p>
      </div>
    </div>
  );
}
