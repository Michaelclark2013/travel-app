"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/AuthProvider";

export default function Nav() {
  const { user, ready, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--background)]/70 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-strong)] bg-[var(--card-strong)] font-mono text-sm font-bold tracking-tight">
            <span className="text-[var(--accent)] text-glow">V</span>
          </span>
          <div className="leading-tight">
            <div className="font-mono text-sm tracking-[0.18em] font-semibold">
              VOYAGE
            </div>
            <div className="font-mono text-[10px] text-[var(--muted)] tracking-[0.2em]">
              TRIP&nbsp;OS
            </div>
          </div>
        </Link>
        <nav className="hidden lg:flex items-center gap-0.5 text-sm">
          <NavLink href="/plan">Plan</NavLink>
          <NavLink href="/inspire">Inspire</NavLink>
          <NavLink href="/flights">Flights</NavLink>
          <NavLink href="/hotels">Hotels</NavLink>
          <NavLink href="/nearby">Nearby</NavLink>
          <NavLink href="/guides">Guides</NavLink>
          <NavLink href="/trips">Trips</NavLink>
        </nav>
        <div className="flex items-center gap-2">
          {!ready ? (
            <div className="h-9 w-24 rounded-md bg-[var(--card-strong)] shimmer" />
          ) : user ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card-strong)] px-2.5 py-1.5 hover:bg-white/5 transition"
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] font-mono text-xs font-semibold">
                  {user.name.charAt(0).toUpperCase()}
                </span>
                <span className="font-mono text-xs tracking-wide max-w-[120px] truncate">
                  {user.name.split(" ")[0]}
                </span>
                <span className="text-[var(--muted)] text-xs">▾</span>
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-60 rounded-xl border border-[var(--border-strong)] bg-[var(--background-soft)] backdrop-blur-xl p-2 shadow-2xl">
                  <div className="px-3 py-2 border-b border-[var(--border)] mb-1">
                    <div className="font-medium truncate">{user.name}</div>
                    <div className="text-xs text-[var(--muted)] truncate">
                      {user.email}
                    </div>
                  </div>
                  <DropLink href="/trips" onClick={() => setMenuOpen(false)}>
                    My trips
                  </DropLink>
                  <DropLink href="/wallet" onClick={() => setMenuOpen(false)}>
                    Trip wallet
                  </DropLink>
                  <DropLink href="/receipts" onClick={() => setMenuOpen(false)}>
                    Receipts
                  </DropLink>
                  <DropLink href="/points" onClick={() => setMenuOpen(false)}>
                    Points & rewards
                  </DropLink>
                  <DropLink href="/sos" onClick={() => setMenuOpen(false)}>
                    Emergency SOS
                  </DropLink>
                  <DropLink href="/profile" onClick={() => setMenuOpen(false)}>
                    Profile
                  </DropLink>
                  <div className="border-t border-[var(--border)] my-1" />
                  <DropLink href="/plan" onClick={() => setMenuOpen(false)}>
                    + New trip
                  </DropLink>
                  <DropLink href="/inspire" onClick={() => setMenuOpen(false)}>
                    Inspire me
                  </DropLink>
                  <DropLink href="/guides" onClick={() => setMenuOpen(false)}>
                    Local guides
                  </DropLink>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      signOut();
                    }}
                    className="block w-full text-left rounded-md px-3 py-2 text-sm text-[var(--danger)] hover:bg-white/5"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="text-sm font-medium text-[var(--foreground)]/80 hover:text-[var(--foreground)] px-3 py-1.5"
              >
                Sign in
              </Link>
              <Link
                href="/sign-up"
                className="btn-primary text-sm font-medium px-4 py-1.5"
              >
                Sign up
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-2 text-[var(--foreground)]/75 hover:text-[var(--foreground)] hover:bg-white/5 transition"
    >
      {children}
    </Link>
  );
}

function DropLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="block rounded-md px-3 py-2 text-sm hover:bg-white/5"
    >
      {children}
    </Link>
  );
}
