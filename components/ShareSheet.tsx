"use client";

// Universal Share Sheet. One component handles every "share this" flow:
//  - Inline DM to a recent / followed user
//  - Repost to your own feed
//  - Copy link
//  - System share sheet (Web Share API)
//  - External quick-link buttons (X, WhatsApp, mail)
//
// The thing being shared is described as a ShareTarget (lib/social.ts) — same
// convention as likes/comments/reposts, so wiring it into a new surface is
// always one prop.

import { useEffect, useMemo, useState } from "react";
import { Copy, MessageCircle, Repeat2, Send, Share2, X } from "lucide-react";
import {
  avatarStyle,
  followingUsers,
  loadShareRecents,
  MOCK_BY_ID,
  pushShareRecent,
  sendMessage,
  startThreadWith,
  type MockUser,
  type ShareTarget,
} from "@/lib/social";
import { isReposted, repost, unrepost } from "@/lib/comments-reposts";
import { toast } from "@/lib/toast";

export default function ShareSheet({
  open,
  onClose,
  target,
  url,
  shareText,
}: {
  open: boolean;
  onClose: () => void;
  target: ShareTarget;
  /** Public URL for copy/external share. Defaults to current page. */
  url?: string;
  /** Default body for external shares + DM if user doesn't type. */
  shareText?: string;
}) {
  const [reposted, setReposted] = useState(false);
  const [busyDmId, setBusyDmId] = useState<string | null>(null);

  const targetKey = useMemo(() => keyFor(target), [target]);
  useEffect(() => {
    if (open) setReposted(isReposted(targetKey));
  }, [open, targetKey]);

  if (!open) return null;

  const link =
    url ??
    (typeof window !== "undefined" ? window.location.href : "");

  // Recent peers first, then anyone you follow you haven't messaged recently.
  const recentIds = loadShareRecents();
  const recents = recentIds
    .map((id) => MOCK_BY_ID[id])
    .filter(Boolean) as MockUser[];
  const followingList = followingUsers().filter(
    (u) => !recentIds.includes(u.id)
  );
  const peers = [...recents, ...followingList];

  function copy() {
    try {
      navigator.clipboard.writeText(link);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy");
    }
  }

  async function nativeShare() {
    if (!navigator.share) {
      copy();
      return;
    }
    try {
      await navigator.share({
        title: shareText ?? "Voyage",
        text: shareText ?? "",
        url: link,
      });
    } catch {
      // User cancelled — silent.
    }
  }

  function toggleRepost() {
    if (reposted) {
      unrepost(targetKey);
      setReposted(false);
      toast.success("Repost removed");
    } else {
      repost(targetKey);
      setReposted(true);
      toast.success("Reposted to your feed");
    }
  }

  async function dm(u: MockUser) {
    setBusyDmId(u.id);
    try {
      const tid = startThreadWith(u.id);
      sendMessage(tid, shareText ?? "Look at this 👀", target);
      pushShareRecent(u.id);
      toast.success(`Sent to ${u.displayName}`);
      onClose();
    } finally {
      setBusyDmId(null);
    }
  }

  function externalShare(network: "twitter" | "whatsapp" | "mail") {
    const text = shareText ?? "Check this out on Voyage";
    let href = "";
    if (network === "twitter") {
      href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`;
    } else if (network === "whatsapp") {
      href = `https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`;
    } else {
      href = `mailto:?subject=${encodeURIComponent("Voyage")}&body=${encodeURIComponent(`${text}\n\n${link}`)}`;
    }
    window.open(href, "_blank", "noopener,noreferrer");
  }

  return (
    <div
      className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-label="Share"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-[var(--border-strong)] shadow-2xl p-5"
        style={{
          background: "var(--background-soft)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="font-mono text-[10px] tracking-[0.22em] text-[var(--accent)] uppercase">
              // SHARE
            </div>
            <h3 className="text-lg font-semibold mt-0.5">Send to…</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--muted)] hover:text-white"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {/* Recents + following row */}
        {peers.length > 0 ? (
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-5 px-5">
            {peers.slice(0, 12).map((u) => (
              <button
                key={u.id}
                onClick={() => dm(u)}
                disabled={busyDmId !== null}
                className="shrink-0 w-16 text-center disabled:opacity-50"
              >
                <div
                  className="h-14 w-14 rounded-full mx-auto"
                  style={avatarStyle(u.hue)}
                />
                <div className="text-[10px] mt-1.5 truncate">
                  @{u.username}
                </div>
                {busyDmId === u.id && (
                  <div className="text-[9px] font-mono text-[var(--accent)] uppercase tracking-[0.16em]">
                    sending…
                  </div>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="text-xs text-[var(--muted)]">
            Follow people on Explore to send moments to them.
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <SquareButton onClick={toggleRepost} icon={<Repeat2 size={16} strokeWidth={2} />} label={reposted ? "Reposted" : "Repost"} active={reposted} />
          <SquareButton onClick={copy} icon={<Copy size={16} strokeWidth={2} />} label="Copy link" />
          <SquareButton onClick={nativeShare} icon={<Share2 size={16} strokeWidth={2} />} label="System" />
          <SquareButton onClick={() => externalShare("twitter")} icon={<span className="font-bold">𝕏</span>} label="X / Twitter" />
          <SquareButton onClick={() => externalShare("whatsapp")} icon={<MessageCircle size={16} strokeWidth={2} />} label="WhatsApp" />
          <SquareButton onClick={() => externalShare("mail")} icon={<Send size={16} strokeWidth={2} />} label="Email" />
        </div>
      </div>
    </div>
  );
}

function SquareButton({
  onClick,
  icon,
  label,
  active,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border px-3 py-3 flex flex-col items-center gap-1.5 transition ${
        active
          ? "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]"
          : "bg-[var(--card-strong)] border-[var(--border)] hover:border-[var(--border-strong)]"
      }`}
    >
      <span className="text-base leading-none">{icon}</span>
      <span className="text-[11px]">{label}</span>
    </button>
  );
}

function keyFor(t: ShareTarget): string {
  switch (t.kind) {
    case "moment":
      return `mom:${t.id}`;
    case "trip":
      return `trip:${t.id}`;
    case "mock-moment":
      return `mock:${t.momentId}`;
    case "place":
      return `place:${t.name.toLowerCase()}`;
  }
}
