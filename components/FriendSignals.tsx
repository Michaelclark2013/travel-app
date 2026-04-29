"use client";

import { useEffect, useState } from "react";
import { inviteFriend, loadFriends, signalsFor, type FriendSignal } from "@/lib/friends";

export default function FriendSignals({ destination }: { destination: string }) {
  const [signals, setSignals] = useState<FriendSignal[]>([]);
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [invited, setInvited] = useState(0);

  useEffect(() => {
    setSignals(signalsFor(destination));
    setInvited(loadFriends().length);
  }, [destination]);

  function submitInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    inviteFriend(email, name);
    setEmail("");
    setName("");
    setInvited((n) => n + 1);
    setShowInvite(false);
  }

  return (
    <div className="surface rounded-2xl p-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--accent)] uppercase">
            // 06 · FRIEND-GRAPH
          </div>
          <div className="text-lg font-semibold mt-1">
            People you trust have been here
          </div>
        </div>
        <button
          onClick={() => setShowInvite((v) => !v)}
          className="btn-ghost text-xs px-3 py-1.5"
        >
          {showInvite ? "Cancel" : "+ Invite"}
        </button>
      </div>

      {signals.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {signals.map((s, i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--card-strong)] p-3"
            >
              <div className="h-9 w-9 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] font-mono text-sm font-semibold flex items-center justify-center shrink-0">
                {s.friendName.charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm">
                  <strong>{s.friendName}</strong>{" "}
                  <span className="text-[var(--muted)]">
                    · was here{" "}
                    {new Date(s.visitedAt).toLocaleDateString(undefined, {
                      month: "long",
                      year: "numeric",
                    })}{" "}
                    · {"⭐".repeat(s.rating)}
                  </span>
                </div>
                {s.note && (
                  <div className="text-sm text-[var(--muted)] mt-1 italic">
                    &ldquo;{s.note}&rdquo;
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 text-sm text-[var(--muted)]">
          {invited > 0
            ? `You've invited ${invited} friend${invited === 1 ? "" : "s"}. When they sign up + tag a trip, their picks show here.`
            : "Invite friends to unlock recommendations from people you actually trust."}
        </div>
      )}

      {showInvite && (
        <form
          onSubmit={submitInvite}
          className="mt-4 flex flex-col sm:flex-row gap-2"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="input"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@friend.com"
            type="email"
            required
            className="input"
          />
          <button
            type="submit"
            className="btn-primary px-4 text-sm whitespace-nowrap"
          >
            Send invite
          </button>
        </form>
      )}
    </div>
  );
}
