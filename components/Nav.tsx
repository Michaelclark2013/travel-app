"use client";

// Top navigation. Track B (perf/a11y) added focus-visible rings on every
// interactive element, aria-label on icon-only triggers, and aria-expanded
// on the user-menu disclosure so screen readers announce its state.

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, MessageCircle, Search as SearchIcon } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import {
  unreadNotificationCount,
  unreadThreadCount,
} from "@/lib/social";
import { openGlobalSearch } from "@/components/GlobalSearch";

// Reusable focus-ring class — applied to every <button>/<a> in this file so
// keyboard users can always see where focus is. Uses the brand accent color.
const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]";

export default function Nav() {
  const { user, ready, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [unreadDms, setUnreadDms] = useState(0);

  useEffect(() => {
    if (!ready || !user) return;
    function refresh() {
      try {
        setUnreadNotifs(unreadNotificationCount());
        setUnreadDms(unreadThreadCount());
      } catch {}
    }
    refresh();
    const id = window.setInterval(refresh, 15_000);
    const dm = () => refresh();
    window.addEventListener("voyage:dm-updated", dm);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("voyage:dm-updated", dm);
    };
  }, [ready, user]);

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--background)]/70 backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
        <Link
          href="/"
          aria-label="Voyage home"
          className={`flex items-center gap-3 group rounded-md ${FOCUS_RING}`}
        >
          <span
            aria-hidden
            className="relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-strong)] bg-[var(--card-strong)] font-mono text-sm font-bold tracking-tight"
          >
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
        <nav
          aria-label="Primary"
          className="hidden lg:flex items-center gap-0.5 text-sm"
        >
          <NavLink href="/plan">Plan</NavLink>
          <NavLink href="/explore">Explore</NavLink>
          <NavLink href="/flights">Flights</NavLink>
          <NavLink href="/hotels">Hotels</NavLink>
          <NavLink href="/guides">Guides</NavLink>
          <NavLink href="/trips">Trips</NavLink>
        </nav>
        <div className="flex items-center gap-2">
          {ready && user && (
            <>
              <button
                onClick={openGlobalSearch}
                aria-label="Search"
                title="Search (or press /)"
                className="h-9 w-9 rounded-md hover:bg-white/5 flex items-center justify-center text-[var(--foreground)]/85 hover:text-white transition"
              >
                <SearchIcon size={18} strokeWidth={1.75} />
              </button>
              <Link
                href="/messages"
                aria-label={
                  unreadDms > 0 ? `Messages — ${unreadDms} unread` : "Messages"
                }
                className="relative h-9 w-9 rounded-md hover:bg-white/5 flex items-center justify-center text-[var(--foreground)]/85 hover:text-white transition"
              >
                <MessageCircle size={18} strokeWidth={1.75} />
                {unreadDms > 0 && (
                  <span className="absolute top-1.5 right-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-[var(--accent)] text-black text-[9px] font-mono font-bold flex items-center justify-center">
                    {unreadDms > 9 ? "9+" : unreadDms}
                  </span>
                )}
              </Link>
              <Link
                href="/notifications"
                aria-label={
                  unreadNotifs > 0
                    ? `Notifications — ${unreadNotifs} unread`
                    : "Notifications"
                }
                className="relative h-9 w-9 rounded-md hover:bg-white/5 flex items-center justify-center text-[var(--foreground)]/85 hover:text-white transition"
              >
                <Bell size={18} strokeWidth={1.75} />
                {unreadNotifs > 0 && (
                  <span className="absolute top-1.5 right-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full bg-rose-400 text-black text-[9px] font-mono font-bold flex items-center justify-center">
                    {unreadNotifs > 9 ? "9+" : unreadNotifs}
                  </span>
                )}
              </Link>
            </>
          )}
          {!ready ? (
            <div
              className="h-9 w-24 rounded-md bg-[var(--card-strong)] shimmer"
              aria-hidden
            />
          ) : user ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label={`Account menu for ${user.name}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className={`flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card-strong)] px-2.5 py-1.5 hover:bg-white/5 transition ${FOCUS_RING}`}
              >
                <span
                  aria-hidden
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] font-mono text-xs font-semibold"
                >
                  {user.name.charAt(0).toUpperCase()}
                </span>
                <span className="font-mono text-xs tracking-wide max-w-[120px] truncate">
                  {user.name.split(" ")[0]}
                </span>
                <span aria-hidden className="text-[var(--muted)] text-xs">▾</span>
              </button>
              {menuOpen && (
                <div
                  role="menu"
                  aria-label="Account menu"
                  className="absolute right-0 mt-2 w-60 rounded-xl border border-[var(--border-strong)] bg-[var(--background-soft)] backdrop-blur-xl p-2 shadow-2xl"
                >
                  <div className="px-3 py-2 border-b border-[var(--border)] mb-1">
                    <div className="font-medium truncate">{user.name}</div>
                    <div className="text-xs text-[var(--muted)] truncate">
                      {user.email}
                    </div>
                  </div>
                  {/* Primary — what users come here for */}
                  <DropLink href="/profile" onClick={() => setMenuOpen(false)}>
                    Your profile
                  </DropLink>
                  <DropLink href="/trips" onClick={() => setMenuOpen(false)}>
                    My trips
                  </DropLink>
                  <DropLink href="/profile/following" onClick={() => setMenuOpen(false)}>
                    Following
                  </DropLink>
                  <DropLink href="/notifications" onClick={() => setMenuOpen(false)}>
                    Notifications
                  </DropLink>
                  <DropLink href="/messages" onClick={() => setMenuOpen(false)}>
                    Messages
                  </DropLink>
                  <div className="border-t border-[var(--border)] my-1" />
                  {/* Trip-prep tools */}
                  <DropLink href="/plan" onClick={() => setMenuOpen(false)}>
                    + New trip
                  </DropLink>
                  <DropLink href="/profile/capture" onClick={() => setMenuOpen(false)}>
                    📷 Catch a moment
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
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      signOut();
                    }}
                    className={`block w-full text-left rounded-md px-3 py-2 text-sm text-[var(--danger)] hover:bg-white/5 ${FOCUS_RING}`}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/sign-in"
              className={`btn-primary text-sm font-medium px-4 py-1.5 ${FOCUS_RING}`}
            >
              Launch app
            </Link>
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
      className={`rounded-md px-3 py-2 text-[var(--foreground)]/75 hover:text-[var(--foreground)] hover:bg-white/5 transition ${FOCUS_RING}`}
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
      role="menuitem"
      onClick={onClick}
      className={`block rounded-md px-3 py-2 text-sm hover:bg-white/5 ${FOCUS_RING}`}
    >
      {children}
    </Link>
  );
}
