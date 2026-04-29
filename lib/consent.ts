// lib/consent.ts — Track 8 cookie-consent helper.
//
// WHAT
//   getConsent(category)  — synchronous, client-side check whether the user
//                           has opted in to a given cookie category.
//   setConsent(payload)   — persist a per-category choice locally + dispatch a
//                           browser event (CookieConsent.tsx posts to the
//                           server registry separately).
//   readStoredConsent()   — returns the parsed Consent record or null.
//
// WHY
//   The legacy CookieBanner stored a single 'all' | 'essential' string. Track 8
//   needs per-category granularity (analytics / marketing / functional) and a
//   server-side registry. Keep the legacy key for back-compat — older clients
//   can still pass through ClientObservability — and layer on the v2 record.

export type ConsentCategory = "analytics" | "marketing" | "functional";

export type Consent = {
  analytics: boolean;
  marketing: boolean;
  functional: boolean;
  consentedAt: string; // ISO
};

const STORAGE_KEY = "voyage:cookie-consent-v2";
const LEGACY_KEY = "voyage:cookie-consent";

// Strict default: nothing on. Functional stays opt-in too — the *banner*
// defaults the toggle ON so accepting "All" is one click, but absence of
// consent means OFF for everything non-essential.
const DEFAULT_CONSENT: Consent = {
  analytics: false,
  marketing: false,
  functional: false,
  consentedAt: "",
};

export function readStoredConsent(): Consent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed === "object" && parsed) {
        return {
          analytics: Boolean(parsed.analytics),
          marketing: Boolean(parsed.marketing),
          functional: Boolean(parsed.functional),
          consentedAt: String(parsed.consentedAt ?? ""),
        };
      }
    }
    // Migrate the legacy "all" | "essential" record.
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy === "all") {
      return { analytics: true, marketing: true, functional: true, consentedAt: "" };
    }
    if (legacy === "essential") {
      return { ...DEFAULT_CONSENT };
    }
  } catch {
    // localStorage may throw in privacy mode — treat as "no choice yet".
  }
  return null;
}

export function getConsent(category: ConsentCategory): boolean {
  const c = readStoredConsent();
  if (!c) return false;
  return Boolean(c[category]);
}

export function setConsent(c: Omit<Consent, "consentedAt">): Consent {
  const stamped: Consent = { ...c, consentedAt: new Date().toISOString() };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stamped));
      // Keep the legacy key in sync so ClientObservability still works for any
      // mid-session listener that hasn't been migrated yet.
      window.localStorage.setItem(LEGACY_KEY, c.analytics ? "all" : "essential");
      window.dispatchEvent(
        new CustomEvent("voyage:cookie-consent", {
          detail: c.analytics ? "all" : "essential",
        })
      );
      window.dispatchEvent(
        new CustomEvent("voyage:cookie-consent-v2", { detail: stamped })
      );
    } catch {
      // ignore quota/disabled-storage errors.
    }
  }
  return stamped;
}
