"use client";

import { useEffect, useState } from "react";
import { onToast, type ToastEvent } from "@/lib/toast";

export default function Toaster() {
  const [items, setItems] = useState<ToastEvent[]>([]);

  useEffect(() => {
    return onToast((t) => {
      setItems((prev) => [...prev, t]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== t.id));
      }, t.durationMs);
    });
  }, []);

  function dismiss(id: string) {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <div className="fixed left-1/2 -translate-x-1/2 bottom-24 sm:bottom-8 z-[60] flex flex-col-reverse gap-2 px-4 w-full max-w-md pointer-events-none">
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto rounded-xl border backdrop-blur-xl shadow-2xl px-4 py-3 flex items-center gap-3 text-sm ${cls(
            t.kind
          )}`}
          style={{ background: "var(--background-soft)" }}
        >
          <span className="flex-1 leading-snug">{t.message}</span>
          {t.kind === "undo" && t.onUndo && (
            <button
              onClick={() => {
                t.onUndo!();
                dismiss(t.id);
              }}
              className="text-[var(--accent)] hover:underline font-medium"
            >
              Undo
            </button>
          )}
          {t.actionLabel && t.onAction && (
            <button
              onClick={() => {
                t.onAction!();
                dismiss(t.id);
              }}
              className="text-[var(--accent)] hover:underline font-medium"
            >
              {t.actionLabel}
            </button>
          )}
          <button
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            className="text-[var(--muted)] hover:text-white"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function cls(k: ToastEvent["kind"]) {
  switch (k) {
    case "success":
      return "border-emerald-500/40";
    case "error":
      return "border-rose-500/40";
    case "undo":
      return "border-[var(--accent)]/50";
    default:
      return "border-[var(--border-strong)]";
  }
}
