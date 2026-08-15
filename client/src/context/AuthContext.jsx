import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import {
  supabase,
  isAllowedEmail,
  ALLOWED_EMAIL_DOMAIN,
} from "../lib/supabaseClient";

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    let active = true;

    async function applySession(session) {
      const email = session?.user?.email;

      if (session && !isAllowedEmail(email)) {
        await supabase.auth.signOut();
        if (active) {
          setUser(null);
          setAuthError(
            `Access is restricted to @${ALLOWED_EMAIL_DOMAIN} email addresses. Signed in as ${email}.`,
          );
        }
        return;
      }

      if (active) {
        setUser(session?.user ?? null);
      }
    }

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) console.error("[auth] getSession failed:", error.message);
      applySession(session).finally(() => {
        if (active) setLoading(false);
      });
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log("[auth] state change:", event, session?.user?.email ?? null);
        applySession(session);
      },
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: {
          hd: ALLOWED_EMAIL_DOMAIN,
          prompt: "select_account",
        },
      },
    });
    if (error) {
      console.error("[auth] signInWithOAuth failed:", error.message);
      setAuthError(error.message);
    }
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        authError,
        setAuthError,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
