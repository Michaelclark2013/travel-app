"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

function SignInInner() {
  const { signIn, signUp } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/plan";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const err = await signIn(email, password);
    setSubmitting(false);
    if (err) {
      setError(err);
      return;
    }
    router.replace(next);
  }

  async function handleDemo() {
    setSubmitting(true);
    setError(null);
    const demoEmail = "demo@voyage.app";
    const demoPassword = "voyage12345";
    // Try sign in first; if no account exists, create one with the demo creds.
    const signInErr = await signIn(demoEmail, demoPassword);
    if (!signInErr) {
      router.replace(next);
      return;
    }
    const signUpErr = await signUp(demoEmail, demoPassword, "Demo Voyager");
    setSubmitting(false);
    if (signUpErr) {
      setError(signUpErr);
      return;
    }
    router.replace(next);
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16 md:py-24">
      <div className="font-mono text-xs tracking-[0.18em] text-[var(--accent)] uppercase mb-3">
        // AUTH · SIGN IN
      </div>
      <h1 className="text-4xl font-semibold tracking-tight">Welcome back.</h1>
      <p className="text-[var(--muted)] mt-3">
        Sign in to access your trips and start planning.
      </p>

      <button
        onClick={handleDemo}
        disabled={submitting}
        className="surface mt-6 w-full rounded-xl px-4 py-3 text-left hover:border-[var(--accent)]/40 transition disabled:opacity-50"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Try the demo account</div>
            <div className="text-xs text-[var(--muted)] mt-0.5 font-mono">
              demo@voyage.app · one-tap sign-in
            </div>
          </div>
          <span className="text-[var(--accent)]">→</span>
        </div>
      </button>

      <div className="my-6 flex items-center gap-3 text-xs text-[var(--muted)] font-mono">
        <span className="flex-1 h-px bg-[var(--border)]" />
        OR USE YOUR ACCOUNT
        <span className="flex-1 h-px bg-[var(--border)]" />
      </div>

      <form onSubmit={handleSubmit} className="surface rounded-2xl p-6 space-y-4">
        <Field label="Email">
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@email.com"
            className="input"
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="input"
          />
        </Field>
        {error && (
          <div className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
            {error}{" "}
            {error.toLowerCase().includes("invalid") && (
              <Link
                href={`/sign-up${next !== "/plan" ? `?next=${encodeURIComponent(next)}` : ""}`}
                className="underline ml-1"
              >
                Create an account?
              </Link>
            )}
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full py-3 text-base disabled:opacity-50"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
        <div className="text-sm text-[var(--muted)] text-center">
          New here?{" "}
          <Link
            href={`/sign-up${next !== "/plan" ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="text-[var(--accent)] hover:underline"
          >
            Create a free account
          </Link>
        </div>
      </form>

      <p className="mt-6 text-xs text-[var(--muted)] text-center">
        Accounts are stored locally in your browser for now — sign up in
        each browser you use, or use the demo account.
      </p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-mono tracking-[0.18em] uppercase text-[var(--muted)] mb-1.5 block">
        {label}
      </span>
      {children}
    </label>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-[var(--muted)]">Loading…</div>}>
      <SignInInner />
    </Suspense>
  );
}
