"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  getSession,
  signIn as signInLocal,
  signUp as signUpLocal,
  signOut as signOutLocal,
  type User,
} from "@/lib/auth";
import { supabase, supabaseEnabled } from "@/lib/supabase";

type AuthContextValue = {
  user: User | null;
  ready: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (
    email: string,
    password: string,
    name: string
  ) => Promise<string | null>;
  signOut: () => Promise<void> | void;
  /** True when wired to Supabase, false when running on localStorage shim. */
  remoteAuth: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  // ---------------- Bootstrap ----------------
  useEffect(() => {
    if (supabaseEnabled && supabase) {
      // Hydrate from existing Supabase session, then subscribe to changes.
      supabase.auth.getSession().then(({ data }) => {
        const s = data.session;
        if (s?.user) {
          setUser(supabaseToUser(s.user));
        }
        setReady(true);
      });
      const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
        setUser(session?.user ? supabaseToUser(session.user) : null);
      });
      return () => {
        sub.subscription.unsubscribe();
      };
    } else {
      // Local-only: read from localStorage.
      setUser(getSession());
      setReady(true);
    }
  }, []);

  // ---------------- Sign in ----------------
  const signIn = useCallback(async (email: string, password: string) => {
    if (supabaseEnabled && supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) return error.message;
      if (data.user) setUser(supabaseToUser(data.user));
      return null;
    }
    const res = await signInLocal(email, password);
    if (!res.ok) return res.error;
    setUser(res.user);
    return null;
  }, []);

  // ---------------- Sign up ----------------
  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      if (supabaseEnabled && supabase) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: { data: { name: name.trim() } },
        });
        if (error) return error.message;
        if (data.user) {
          // Supabase may require email confirmation depending on project settings.
          if (!data.session) {
            return "Check your email to confirm your account, then sign in.";
          }
          setUser(supabaseToUser(data.user));
        }
        return null;
      }
      const res = await signUpLocal(email, password, name);
      if (!res.ok) return res.error;
      setUser(res.user);
      return null;
    },
    []
  );

  // ---------------- Sign out ----------------
  const signOut = useCallback(async () => {
    if (supabaseEnabled && supabase) {
      await supabase.auth.signOut();
      setUser(null);
      return;
    }
    signOutLocal();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, ready, signIn, signUp, signOut, remoteAuth: supabaseEnabled }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function supabaseToUser(u: {
  id: string;
  email?: string | null;
  user_metadata?: { name?: string };
  created_at?: string;
}): User {
  return {
    id: u.id,
    email: u.email ?? "",
    name: u.user_metadata?.name ?? (u.email ? u.email.split("@")[0] : "Voyager"),
    createdAt: u.created_at ?? new Date().toISOString(),
  };
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function useRequireAuth() {
  const { user, ready } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (ready && !user) {
      router.replace(
        `/sign-in?next=${encodeURIComponent(window.location.pathname + window.location.search)}`
      );
    }
  }, [ready, user, router]);
  return { user, ready };
}
