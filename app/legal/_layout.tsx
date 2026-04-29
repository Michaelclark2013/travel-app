// Shared shell helpers for legal pages.
import Link from "next/link";

export function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 md:py-20">
      <Link
        href="/"
        className="text-xs font-mono tracking-[0.18em] text-[var(--muted)] hover:text-white uppercase"
      >
        ← Back to Voyage
      </Link>
      <h1 className="mt-6 text-4xl md:text-5xl font-semibold tracking-tight">
        {title}
      </h1>
      <div className="mt-3 text-xs font-mono text-[var(--muted)] uppercase tracking-[0.18em]">
        Last updated · {updated}
      </div>
      <div className="prose-voyage mt-10 space-y-6 text-[var(--foreground)]/90">
        {children}
      </div>
      <div className="mt-16 pt-8 border-t border-[var(--border)] flex flex-wrap gap-4 text-sm">
        <Link href="/legal/terms" className="text-[var(--muted)] hover:text-white">
          Terms
        </Link>
        <Link href="/legal/privacy" className="text-[var(--muted)] hover:text-white">
          Privacy
        </Link>
        <Link href="/legal/cookies" className="text-[var(--muted)] hover:text-white">
          Cookies
        </Link>
      </div>
    </div>
  );
}
