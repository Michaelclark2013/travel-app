"use client";

// Tiny event-bus toast system. Anywhere in the app:
//   import { toast } from "@/lib/toast";
//   toast.success("Trip saved");
//   toast.undo("Trip deleted", () => restoreTrip());
// The <Toaster /> component (mounted globally) listens and renders.

export type ToastKind = "info" | "success" | "error" | "undo";

export type ToastEvent = {
  id: string;
  kind: ToastKind;
  message: string;
  durationMs: number;
  /** Only meaningful for kind === "undo". */
  onUndo?: () => void;
  /** Optional secondary action label + handler. */
  actionLabel?: string;
  onAction?: () => void;
};

const EVENT = "voyage:toast";

function emit(t: ToastEvent) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastEvent>(EVENT, { detail: t }));
}

function makeId() {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export const toast = {
  info(message: string, opts: Partial<ToastEvent> = {}) {
    emit({ id: makeId(), kind: "info", message, durationMs: 3500, ...opts });
  },
  success(message: string, opts: Partial<ToastEvent> = {}) {
    emit({ id: makeId(), kind: "success", message, durationMs: 3500, ...opts });
  },
  error(message: string, opts: Partial<ToastEvent> = {}) {
    emit({ id: makeId(), kind: "error", message, durationMs: 5000, ...opts });
  },
  undo(message: string, onUndo: () => void, opts: Partial<ToastEvent> = {}) {
    emit({
      id: makeId(),
      kind: "undo",
      message,
      durationMs: 8000,
      onUndo,
      ...opts,
    });
  },
};

/** For the Toaster component to subscribe. */
export function onToast(handler: (t: ToastEvent) => void) {
  if (typeof window === "undefined") return () => {};
  const fn = (e: Event) => handler((e as CustomEvent<ToastEvent>).detail);
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
