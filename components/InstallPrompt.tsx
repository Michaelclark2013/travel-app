"use client";

// Listens for the `beforeinstallprompt` event (Chrome/Edge/Android) and
// surfaces a small "Install Voyage" banner. iOS Safari doesn't fire that
// event, so we show alternative iOS-specific instructions instead.

import { useEffect, useState } from "react";

const DISMISS_KEY = "voyage:install-dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export default function InstallPrompt() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosVisible, setIosVisible] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(DISMISS_KEY)) return;

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
      // Defer slightly so it doesn't compete with the cookie banner.
      window.setTimeout(() => setShow(true), 4000);
    };

    window.addEventListener("beforeinstallprompt", onPrompt);

    if (isIosSafari()) {
      window.setTimeout(() => {
        setIosVisible(true);
        setShow(true);
      }, 4000);
    }

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_KEY, "1");
    }
    setShow(false);
  }

  async function install() {
    if (!evt) return;
    await evt.prompt();
    const choice = await evt.userChoice;
    if (choice.outcome === "accepted") dismiss();
    else setShow(false);
  }

  if (!show) return null;

  return (
    <div
      className="fixed left-4 bottom-20 lg:bottom-5 z-50 sm:left-5 sm:max-w-xs pointer-events-none"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div
        className="pointer-events-auto rounded-xl p-4 backdrop-blur-xl shadow-2xl border"
        style={{
          background: "var(--background-soft)",
          borderColor: "var(--border-strong)",
        }}
        role="dialog"
        aria-label="Install Voyage"
      >
        <div className="flex items-start gap-3">
          <span className="text-2xl">📲</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold">Install Voyage</div>
            {iosVisible ? (
              <div className="text-xs text-[var(--muted)] mt-1 leading-snug">
                Tap <span className="text-white">Share</span> in Safari, then{" "}
                <span className="text-white">Add to Home Screen</span>.
              </div>
            ) : (
              <div className="text-xs text-[var(--muted)] mt-1">
                One-tap access. Works offline. No store needed.
              </div>
            )}
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss"
            className="text-[var(--muted)] hover:text-white text-lg leading-none -mt-1"
          >
            ×
          </button>
        </div>
        {!iosVisible && (
          <div className="mt-3 flex gap-2">
            <button
              onClick={dismiss}
              className="btn-ghost text-xs px-3 py-1.5 flex-1"
            >
              Later
            </button>
            <button
              onClick={install}
              className="btn-primary text-xs px-3 py-1.5 flex-1"
            >
              Install
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
