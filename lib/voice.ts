"use client";

// Web Speech API wrapper. Returns the recognition instance and a cleanup
// function. Falls back gracefully if the API isn't supported.

export type RecognitionHandle = {
  start: () => void;
  stop: () => void;
};

type SRGlobal = {
  SpeechRecognition?: new () => unknown;
  webkitSpeechRecognition?: new () => unknown;
};

function getSRCtor(): (new () => unknown) | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as SRGlobal;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function speechRecognitionAvailable(): boolean {
  return getSRCtor() !== undefined;
}

export function createRecognition(args: {
  onResult: (transcript: string, isFinal: boolean) => void;
  onError?: (err: string) => void;
  onEnd?: () => void;
}): RecognitionHandle | null {
  const ctor = getSRCtor();
  if (!ctor) return null;
  // The runtime instance has the SpeechRecognition shape; we type via `any`
  // because lib.dom typings differ across browsers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = new ctor();
  r.lang = "en-US";
  r.continuous = false;
  r.interimResults = true;
  r.maxAlternatives = 1;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  r.onresult = (e: any) => {
    let transcript = "";
    let isFinal = false;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      transcript += e.results[i][0].transcript;
      if (e.results[i].isFinal) isFinal = true;
    }
    args.onResult(transcript.trim(), isFinal);
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  r.onerror = (e: any) => args.onError?.(e?.error ?? "unknown");
  r.onend = () => args.onEnd?.();
  return {
    start: () => r.start(),
    stop: () => r.stop(),
  };
}

// ----- Command interpreter -----

export type VoiceCommand =
  | { kind: "next-item" }
  | { kind: "navigate"; query: string }
  | { kind: "spending" }
  | { kind: "add-restaurant"; query?: string }
  | { kind: "add-activity"; query?: string }
  | { kind: "show-tickets" }
  | { kind: "show-itinerary" }
  | { kind: "show-flights" }
  | { kind: "show-hotel" }
  | { kind: "unknown"; transcript: string };

export function interpretCommand(transcript: string): VoiceCommand {
  const t = transcript.trim().toLowerCase();
  if (!t) return { kind: "unknown", transcript };
  if (/(what'?s|whats) next|up next|next stop|now what/.test(t)) {
    return { kind: "next-item" };
  }
  if (/spend|spent|spending|how much.*money/.test(t)) {
    return { kind: "spending" };
  }
  if (/(navigate|directions?) to (.+)/.test(t)) {
    const m = /(?:navigate|directions?) to (.+)/.exec(t);
    return { kind: "navigate", query: m?.[1]?.trim() ?? "" };
  }
  if (/add (a |the )?(restaurant|dinner|lunch|breakfast)/.test(t)) {
    const m = /add (?:a |the )?(?:restaurant|dinner|lunch|breakfast)\s*(.+)?/.exec(t);
    return { kind: "add-restaurant", query: m?.[1]?.trim() };
  }
  if (/add (a |an |the )?(activity|tour|tickets?)/.test(t)) {
    const m = /add (?:a |an |the )?(?:activity|tour|tickets?)\s*(.+)?/.exec(t);
    return { kind: "add-activity", query: m?.[1]?.trim() };
  }
  if (/(show|open) (my )?(tickets?|wallet|confirmations?)/.test(t)) {
    return { kind: "show-tickets" };
  }
  if (/(show|open) (my )?itinerary|day plan/.test(t)) {
    return { kind: "show-itinerary" };
  }
  if (/(show|open) (my )?flights?/.test(t)) {
    return { kind: "show-flights" };
  }
  if (/(show|open) (my )?(hotel|stay)/.test(t)) {
    return { kind: "show-hotel" };
  }
  return { kind: "unknown", transcript };
}
