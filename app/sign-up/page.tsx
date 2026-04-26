"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

function SignUpInner() {
  const { signUp } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/plan";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const err = await signUp(email, password, name);
    setSubmitting(false);
    if (err) {
      setError(err);
      return;
    }
    router.replace(next);
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16 md:py-24">
      <div className="font-mono text-xs tracking-[0.18em] text-[var(--accent)] uppercase mb-3">
        // AUTH · CREATE ACCOUNT
      </div>
      <h1 className="text-4xl font-semibold tracking-tight">
        Start planning.
      </h1>
      <p className="text-[var(--muted)] mt-3">
        Create a free account to save trips and access them anywhere.
      </p>
      <form onSubmit={handleSubmit} className="surface mt-8 rounded-2xl p-6 space-y-4">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
            placeholder="Alex Rivera"
            className="input"
          />
        </Field>
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
        <Field label="Password (min 6 chars)">
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="input"
          />
        </Field>
        {error && (
          <div className="rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full py-3 text-base disabled:opacity-50"
        >
          {submitting ? "Creating account…" : "Create my account"}
        </button>
        <div className="text-sm text-[var(--muted)] text-center">
          Already have an account?{" "}
          <Link
            href={`/sign-in${next !== "/plan" ? `?next=${encodeURIComponent(next)}` : ""}`}
            className="text-[var(--accent)] hover:underline"
          >
            Sign in
          </Link>
        </div>
      </form>
      <p className="mt-6 text-xs text-[var(--muted)] text-center">
        Accounts are stored in your browser. We&apos;ll never share your trips.
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

export default function SignUpPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-[var(--muted)]">Loading…</div>}>
      <SignUpInner />
    </Suspense>
  );
}
