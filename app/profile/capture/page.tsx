"use client";

// Memory Roll camera — minimal full-screen capture. Two modes:
//
//   "photo": tap shutter → grab a frame → captureMoment(imageDataUri)
//   "video": tap-and-hold (or tap shutter while in Video mode) → record up to
//            ~15s with MediaRecorder → grab a poster frame → captureMoment
//            with both imageDataUri (poster) and videoUri (object URL of the
//            Blob).
//
// Long-press shortcut: while in Photo mode, holding the shutter for 350ms
// enters Video mode automatically and starts recording. Release to stop.
//
// MediaRecorder mimeType is probed via isTypeSupported and falls back through
// 'video/webm;codecs=vp9' → 'video/webm;codecs=vp8' → 'video/webm' → 'video/mp4'
// → ''. Safari on iOS only supports MP4 with H.264 (and only on newer
// versions); on older Safari versions MediaRecorder may be missing entirely
// and we hide the Video toggle.
//
// After capture we navigate back to /profile with a "Moment Saved" toast.
//
// The page is rendered above everything else (z-index above MobileTabBar /
// Toaster / etc.) and uses fixed positioning to fill the viewport.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/components/AuthProvider";
import { captureMoment } from "@/lib/memory-roll";
import { toast } from "@/lib/toast";

type Facing = "user" | "environment";

type FlashSupport = "torch" | "screen" | "none";

type CaptureMode = "photo" | "video";

// Track type for the experimental "torch" capability — not in the standard lib.
type TorchTrack = MediaStreamTrack & {
  getCapabilities?: () => MediaTrackCapabilities & { torch?: boolean };
  applyConstraints: (
    c: MediaTrackConstraints & { advanced?: { torch?: boolean }[] }
  ) => Promise<void>;
};

/** Hard cap on a single recording — keeps blobs reasonable for localStorage-adjacent flows. */
const MAX_RECORD_MS = 15_000;
/** Long-press threshold (ms) that promotes a Photo-mode shutter hold into a recording. */
const LONG_PRESS_MS = 350;

/**
 * Pick a MediaRecorder mimeType the current browser actually supports. We
 * prefer webm (Chromium / Firefox / modern Android) and fall back to mp4
 * (Safari ≥ 14.5 on iOS) and finally let the browser choose with `''`.
 */
function pickRecorderMime(): string {
  if (typeof window === "undefined") return "";
  const MR = (window as unknown as { MediaRecorder?: typeof MediaRecorder })
    .MediaRecorder;
  if (!MR || typeof MR.isTypeSupported !== "function") return "";
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
    "video/mp4;codecs=h264,aac",
    "video/mp4",
  ];
  for (const t of candidates) {
    try {
      if (MR.isTypeSupported(t)) return t;
    } catch {
      /* some browsers throw on probe */
    }
  }
  return "";
}

function isMediaRecorderAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return typeof (window as unknown as { MediaRecorder?: unknown })
    .MediaRecorder === "function";
}

export default function CapturePage() {
  const { user, ready } = useRequireAuth();
  const router = useRouter();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<TorchTrack | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderMimeRef = useRef<string>("");
  const recorderChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);
  const recordStartedAtRef = useRef<number>(0);
  const longPressTimerRef = useRef<number | null>(null);

  const [facing, setFacing] = useState<Facing>("environment");
  const [flashOn, setFlashOn] = useState(false);
  const [flashSupport, setFlashSupport] = useState<FlashSupport>("screen");
  const [permState, setPermState] = useState<
    "checking" | "granted" | "denied" | "unsupported"
  >("checking");
  const [busy, setBusy] = useState(false);
  const [screenFlash, setScreenFlash] = useState(false);
  const [mode, setMode] = useState<CaptureMode>("photo");
  const [recording, setRecording] = useState(false);
  const [recordMs, setRecordMs] = useState(0);
  const [videoSupported] = useState<boolean>(() => isMediaRecorderAvailable());

  // Spin up (and tear down) the camera whenever the facing direction changes
  // OR the mode changes (video mode also requests audio).
  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setPermState("unsupported");
        return;
      }
      try {
        // Stop any prior stream first so a flip doesn't double-occupy the camera.
        if (streamRef.current) {
          for (const t of streamRef.current.getTracks()) t.stop();
          streamRef.current = null;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            // Hint at a good capture size; getUserMedia is free to ignore.
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          // Only request the mic when video-recording is actually enabled.
          audio: mode === "video",
        });
        if (cancelled) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0] as TorchTrack;
        trackRef.current = track;

        // Detect torch capability — only some Chrome/Android camera tracks
        // expose it. iOS Safari does not, so we fall back to a screen flash.
        const caps = track.getCapabilities?.() ?? {};
        setFlashSupport((caps as { torch?: boolean }).torch ? "torch" : "screen");

        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          v.muted = true;
          // iOS requires playsInline + a play() call after a user gesture.
          v.playsInline = true;
          await v.play().catch(() => {});
        }
        setPermState("granted");
      } catch (err) {
        const msg = err instanceof Error ? err.name : "";
        // NotAllowedError / SecurityError — user denied or origin not secure.
        if (msg === "NotAllowedError" || msg === "SecurityError") {
          setPermState("denied");
        } else if (msg === "NotFoundError" || msg === "OverconstrainedError") {
          // No camera matching the constraint (or no camera at all).
          setPermState("unsupported");
        } else {
          setPermState("denied");
        }
      }
    }
    start();
    return () => {
      cancelled = true;
      if (streamRef.current) {
        for (const t of streamRef.current.getTracks()) t.stop();
        streamRef.current = null;
      }
    };
  }, [facing, mode]);

  // Flip torch on/off when supported.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || flashSupport !== "torch") return;
    track
      .applyConstraints({ advanced: [{ torch: flashOn }] })
      .catch(() => {
        // Some devices report the capability but reject the constraint —
        // downgrade to screen flash silently.
        setFlashSupport("screen");
      });
  }, [flashOn, flashSupport]);

  // Cleanup any in-flight long-press / record timers on unmount.
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      if (recorderRef.current && recorderRef.current.state === "recording") {
        try {
          recorderRef.current.stop();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  /** Grab a JPEG data URI from the current video frame (mirrored for selfies). */
  function snapPosterFromVideo(): string | null {
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return null;
    const w = v.videoWidth;
    const h = v.videoHeight;
    if (!w || !h) return null;
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (facing === "user") {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.85);
  }

  async function shootPhoto() {
    if (busy) return;
    if (permState !== "granted") return;
    setBusy(true);

    try {
      navigator.vibrate?.(15);
    } catch {
      /* haptic not supported */
    }

    if (flashOn && flashSupport === "screen") {
      setScreenFlash(true);
      await new Promise((r) => window.setTimeout(r, 130));
    }

    try {
      const dataUri = snapPosterFromVideo();
      if (!dataUri) throw new Error("Video not ready");
      captureMoment({ imageDataUri: dataUri });
      toast.success("Moment Saved — Processing", { durationMs: 3500 });
      window.setTimeout(() => {
        setScreenFlash(false);
        router.push("/profile");
      }, 150);
    } catch (err) {
      console.error("[capture]", err);
      toast.error("Couldn't capture — try again.");
      setScreenFlash(false);
      setBusy(false);
    }
  }

  function startRecording() {
    if (recording || busy) return;
    if (permState !== "granted") return;
    if (!videoSupported) {
      toast.error("Video isn't supported in this browser.");
      return;
    }
    const stream = streamRef.current;
    if (!stream) return;

    // Re-probe each time — the user might have entered video mode via long-
    // press without us having run the audio-on permission flow yet, in which
    // case the stream has no audio track. That's fine; MediaRecorder records
    // video-only streams happily.
    const mime = pickRecorderMime();
    recorderMimeRef.current = mime;
    recorderChunksRef.current = [];

    let recorder: MediaRecorder;
    try {
      recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
    } catch (err) {
      console.error("[capture] MediaRecorder ctor failed", err);
      toast.error("Couldn't start recording.");
      return;
    }

    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        recorderChunksRef.current.push(ev.data);
      }
    };
    recorder.onstop = handleRecorderStop;

    try {
      // 100ms timeslice so we get periodic chunks (more resilient if the user
      // backgrounds the page mid-recording on iOS).
      recorder.start(100);
    } catch (err) {
      console.error("[capture] recorder.start failed", err);
      toast.error("Couldn't start recording.");
      return;
    }

    recorderRef.current = recorder;
    recordStartedAtRef.current = Date.now();
    setRecordMs(0);
    setRecording(true);

    try {
      navigator.vibrate?.(10);
    } catch {
      /* ignore */
    }

    // Tick the visible timer.
    recordTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - recordStartedAtRef.current;
      setRecordMs(elapsed);
      if (elapsed >= MAX_RECORD_MS) stopRecording();
    }, 100);
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (recorder.state === "recording") {
      try {
        recorder.stop();
      } catch (err) {
        console.error("[capture] recorder.stop failed", err);
      }
    }
    if (recordTimerRef.current) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    setRecording(false);
  }

  function handleRecorderStop() {
    setBusy(true);
    try {
      const chunks = recorderChunksRef.current;
      const type = recorderMimeRef.current || "video/webm";
      const blob = new Blob(chunks, { type });
      if (!blob.size) {
        throw new Error("Empty recording");
      }
      // Object URL — fast, doesn't bloat localStorage with a base64 payload.
      // Track A's storage migration will lift this into a Supabase video bucket.
      const videoUri = URL.createObjectURL(blob);
      const posterUri = snapPosterFromVideo() ?? "";
      // imageDataUri is required on Memory; reuse the poster as the image so
      // existing image-only consumers (Journal grid, share sheet) still work.
      captureMoment({
        imageDataUri: posterUri,
        posterUri,
        videoUri,
      });
      toast.success("Reel Saved — Processing", { durationMs: 3500 });
      window.setTimeout(() => {
        router.push("/profile");
      }, 150);
    } catch (err) {
      console.error("[capture] handleRecorderStop", err);
      toast.error("Couldn't save the reel — try again.");
      setBusy(false);
    } finally {
      recorderRef.current = null;
      recorderChunksRef.current = [];
    }
  }

  // Long-press promotes Photo mode into a Video recording. Pointer events
  // unify mouse + touch + pen so we don't have to wire up both.
  function onShutterPointerDown() {
    if (busy) return;
    if (permState !== "granted") return;
    if (mode === "video") {
      // In explicit Video mode, tap = start; release = stop.
      startRecording();
      return;
    }
    if (!videoSupported) return; // fall through to onClick → photo
    longPressTimerRef.current = window.setTimeout(() => {
      // Promote to video without permanently flipping the mode toggle so the
      // user returns to photo on next tap. We need an audio track if the
      // current stream lacks one — for the demo recording that's acceptable
      // (silent reel), but flag in console.
      const hasAudio =
        streamRef.current?.getAudioTracks().length ?? 0;
      if (!hasAudio) {
        console.info("[capture] long-press recording without audio");
      }
      startRecording();
    }, LONG_PRESS_MS);
  }
  function onShutterPointerUp() {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (recording) {
      stopRecording();
    }
  }
  function onShutterPointerLeave() {
    // If the user drags off the button mid-record, treat it the same as
    // pointer-up (stop). Avoids stuck recordings.
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (recording) {
      stopRecording();
    }
  }

  function onShutterClick() {
    // The pointer flow already covers video; click is the keyboard / fallback
    // path for photo-mode shutter.
    if (mode === "photo" && !recording) {
      shootPhoto();
    }
  }

  function flip() {
    setFacing((f) => (f === "environment" ? "user" : "environment"));
  }

  function close() {
    if (recording) stopRecording();
    router.push("/profile");
  }

  if (!ready || !user) {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center text-[var(--muted)] font-mono text-sm">
        Authenticating…
      </div>
    );
  }

  const recordSeconds = (recordMs / 1000).toFixed(1);
  const recordPct = Math.min(100, (recordMs / MAX_RECORD_MS) * 100);

  return (
    <div className="fixed inset-0 z-[80] bg-black text-white overflow-hidden">
      {/* Camera feed */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={`absolute inset-0 w-full h-full object-cover ${
          facing === "user" ? "scale-x-[-1]" : ""
        }`}
      />
      {/* Hidden capture target */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Screen-flash overlay */}
      {screenFlash && (
        <div
          className="absolute inset-0 bg-white pointer-events-none"
          aria-hidden
        />
      )}

      {/* Subtle vignette to keep the controls readable over bright scenes */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 18%, transparent 70%, rgba(0,0,0,0.6) 100%)",
        }}
        aria-hidden
      />

      {/* Permission / unsupported overlays */}
      {permState !== "granted" && permState !== "checking" && (
        <PermissionOverlay state={permState} onClose={close} />
      )}
      {permState === "checking" && (
        <div className="absolute inset-0 flex items-center justify-center font-mono text-xs tracking-[0.2em] text-white/70">
          <span className="inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] pulse-dot" />
            Waking the camera…
          </span>
        </div>
      )}

      {/* Top bar — Close + Flash toggle */}
      <div
        className="absolute top-0 inset-x-0 flex items-center justify-between px-5 py-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 1rem)" }}
      >
        <button
          onClick={close}
          aria-label="Close"
          className="h-10 w-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-2xl leading-none active:scale-95"
        >
          ×
        </button>
        <div className="font-mono text-[10px] tracking-[0.22em] uppercase text-white/80">
          {recording ? (
            <span className="inline-flex items-center gap-2 text-red-300">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400 pulse-dot" />
              REC · {recordSeconds}s
            </span>
          ) : (
            "// MEMORY ROLL"
          )}
        </div>
        <button
          onClick={() => setFlashOn((v) => !v)}
          aria-label={flashOn ? "Flash on" : "Flash off"}
          aria-pressed={flashOn}
          className={`h-10 w-10 rounded-full backdrop-blur-sm flex items-center justify-center text-lg active:scale-95 ${
            flashOn ? "bg-yellow-200/90 text-black" : "bg-black/40"
          }`}
          disabled={flashSupport === "none" || permState !== "granted"}
          title={
            flashSupport === "torch"
              ? "Torch flash"
              : flashSupport === "screen"
              ? "Screen flash (no torch on this device)"
              : "Flash unavailable"
          }
        >
          {flashOn ? "⚡" : "✦"}
        </button>
      </div>

      {/* Mode toggle — only shown when MediaRecorder is available. */}
      {videoSupported && permState === "granted" && !recording && (
        <div
          className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-black/45 backdrop-blur-sm p-1 text-[11px] font-mono tracking-[0.18em] uppercase"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 8.5rem)" }}
        >
          <button
            onClick={() => setMode("photo")}
            aria-pressed={mode === "photo"}
            className={`px-3 py-1.5 rounded-full transition ${
              mode === "photo" ? "bg-white text-black" : "text-white/80"
            }`}
          >
            Photo
          </button>
          <button
            onClick={() => setMode("video")}
            aria-pressed={mode === "video"}
            className={`px-3 py-1.5 rounded-full transition ${
              mode === "video" ? "bg-white text-black" : "text-white/80"
            }`}
          >
            Video
          </button>
        </div>
      )}

      {/* Bottom controls — shutter + flip */}
      <div
        className="absolute bottom-0 inset-x-0 flex items-center justify-around px-8 py-8"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
      >
        <div className="w-12" /> {/* spacer to balance flip button */}
        <button
          onPointerDown={onShutterPointerDown}
          onPointerUp={onShutterPointerUp}
          onPointerLeave={onShutterPointerLeave}
          onPointerCancel={onShutterPointerLeave}
          onClick={onShutterClick}
          disabled={busy || permState !== "granted"}
          aria-label={
            recording
              ? "Stop recording"
              : mode === "video"
              ? "Hold to record"
              : "Capture moment (long-press to record)"
          }
          className={`relative h-20 w-20 rounded-full active:scale-95 transition-transform shadow-2xl disabled:opacity-50 ${
            recording
              ? "bg-red-500 ring-4 ring-red-400/40"
              : mode === "video"
              ? "bg-white/90 ring-4 ring-red-400/60"
              : "bg-white/90 ring-4 ring-white/30"
          }`}
        >
          <span
            className={`block h-full w-full rounded-full ring-2 ring-black/20 ${
              recording ? "scale-50 rounded-md bg-red-700/0" : ""
            } transition-transform`}
          />
          {/* Recording progress ring */}
          {recording && (
            <svg
              className="absolute inset-0 h-full w-full -rotate-90"
              viewBox="0 0 100 100"
              aria-hidden
            >
              <circle
                cx="50"
                cy="50"
                r="46"
                fill="none"
                stroke="rgba(255,255,255,0.85)"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 46}
                strokeDashoffset={(1 - recordPct / 100) * 2 * Math.PI * 46}
              />
            </svg>
          )}
        </button>
        <button
          onClick={flip}
          disabled={permState !== "granted" || recording}
          aria-label="Flip camera"
          className="h-12 w-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-xl active:scale-95 disabled:opacity-50"
        >
          ↺
        </button>
      </div>
    </div>
  );
}

function PermissionOverlay({
  state,
  onClose,
}: {
  state: "denied" | "unsupported";
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[var(--background-soft)] p-6 text-center">
        <div className="text-3xl mb-2">🚫</div>
        <h2 className="text-lg font-semibold">
          {state === "denied" ? "Camera permission needed" : "Camera not available"}
        </h2>
        <p className="mt-2 text-sm text-white/70 leading-snug">
          {state === "denied"
            ? "Voyage needs camera access to catch a moment. Enable it in your browser settings, or use the Demo capture button on your profile to pick a photo instead."
            : "This device or browser doesn't expose a camera we can use. Try a phone, or use the Demo capture button on your profile."}
        </p>
        <button
          onClick={onClose}
          className="btn-primary mt-5 w-full py-2.5 text-sm font-medium"
        >
          Back to profile
        </button>
      </div>
    </div>
  );
}
