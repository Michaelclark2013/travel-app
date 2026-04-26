"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Building2,
  ChevronDown,
  ChevronUp,
  Compass,
  CreditCard,
  ExternalLink,
  Globe,
  HeartPulse,
  Info,
  Languages,
  Plug,
  ShieldAlert,
  Stamp,
  Users,
} from "lucide-react";
import {
  type CountryIntel,
  genericIntel,
  resolveCountry,
} from "@/lib/destination-intel";
import type { Trip } from "@/lib/types";

export function DestinationIntelPanel({
  trip,
  storageKey,
}: {
  trip: Trip;
  storageKey?: string;
}) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    const v = window.localStorage.getItem(storageKey);
    if (v === "0") setOpen(false);
    else if (v === "1") setOpen(true);
  }, [storageKey]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (storageKey && typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, next ? "1" : "0");
    }
  }

  const intel = resolveCountry(trip.destination) ?? genericIntel(trip.destination);
  const isGeneric = intel.code === "??";

  const advisorySev =
    intel.travelAdvisory?.level === 4
      ? "alert"
      : intel.travelAdvisory?.level === 3
        ? "warn"
        : intel.travelAdvisory?.level === 2
          ? "info"
          : "good";

  return (
    <div className="steel mt-6 overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between gap-3 px-6 py-4 hover:bg-white/[0.02] transition"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Compass
            size={18}
            strokeWidth={1.75}
            className="text-[var(--accent)] flex-none"
            aria-hidden
          />
          <div className="text-left min-w-0">
            <div className="text-xs font-bold tracking-[0.2em] text-[var(--muted)]">
              KNOW BEFORE YOU GO
            </div>
            <div className="text-sm mt-0.5 truncate">
              {isGeneric
                ? "Generic intel — curated data unavailable"
                : `${intel.country} · ${intel.currency.code} · ${intel.language}`}
            </div>
          </div>
        </div>
        {open ? (
          <ChevronUp size={18} strokeWidth={1.75} aria-hidden />
        ) : (
          <ChevronDown size={18} strokeWidth={1.75} aria-hidden />
        )}
      </button>

      {open && (
        <div className="border-t border-[var(--edge)] divide-y divide-[var(--edge)]">
          {/* Critical badges row */}
          <div className="px-6 py-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <Badge
              icon={Stamp}
              label="Visa"
              value={intel.visa.required ? `Required (${intel.visa.type.toUpperCase()})` : "Visa-free"}
              detail={
                intel.visa.stayDays
                  ? `up to ${intel.visa.stayDays} days`
                  : intel.visa.type === "domestic"
                    ? "domestic travel"
                    : undefined
              }
              severity={intel.visa.required ? "warn" : "good"}
              href={intel.visa.portalUrl}
            />
            <Badge
              icon={ShieldAlert}
              label="Advisory"
              value={
                intel.travelAdvisory
                  ? `Level ${intel.travelAdvisory.level}`
                  : "—"
              }
              detail={intel.travelAdvisory?.notes}
              severity={advisorySev}
              href="https://travel.state.gov/"
            />
            <Badge
              icon={Plug}
              label="Plug & power"
              value={intel.plug}
              detail={intel.voltage}
              severity="info"
            />
          </div>

          <Section icon={Stamp} title="Travel essentials">
            <Row
              label="Visa"
              value={intel.visa.notes}
              cta={
                intel.visa.portalUrl
                  ? { href: intel.visa.portalUrl, label: "Apply / portal" }
                  : undefined
              }
            />
            {intel.passportValidityMonths > 0 && (
              <Row
                label="Passport"
                value={`Must be valid for at least ${intel.passportValidityMonths} months past your entry date.`}
              />
            )}
            {intel.vaccinations && (
              <Row label="Vaccinations" value={intel.vaccinations} />
            )}
            {intel.travelAdvisory && (
              <Row
                label={`Travel advisory · Level ${intel.travelAdvisory.level}`}
                value={intel.travelAdvisory.notes}
                cta={{ href: "https://travel.state.gov/", label: "State Dept page" }}
              />
            )}
          </Section>

          <Section icon={Globe} title="Local info">
            <Row
              label="Currency"
              value={`${intel.currency.code} · ${intel.currency.symbol}`}
            />
            <Row label="Language" value={intel.language} />
            <Row label="Calling code" value={intel.callingCode} />
            <Row
              label="Emergency"
              value={`${intel.emergencyNumber} (${intel.policeNumber ? `police ${intel.policeNumber}, ` : ""}${intel.ambulanceNumber ? `ambulance ${intel.ambulanceNumber}` : ""})`}
            />
            {intel.embassyUrl && (
              <Row
                label="US embassy"
                value="Direct link to the US embassy site for this country."
                cta={{ href: intel.embassyUrl, label: "embassy.gov" }}
              />
            )}
            <Row
              label="Tap water"
              value={intel.tapWaterSafe ? "Safe to drink." : "Not safe — bottled or filtered only."}
            />
            <Row
              label="Driving"
              value={intel.drivingSide === "left" ? "Drives on the left." : "Drives on the right."}
            />
          </Section>

          <Section icon={CreditCard} title="Tipping">
            <Row label="Restaurants" value={intel.tipping.restaurants} />
            <Row label="Taxis" value={intel.tipping.taxis} />
            <Row label="Hotels" value={intel.tipping.hotels} />
          </Section>

          {intel.phrases && intel.phrases.length > 0 && (
            <Section icon={Languages} title="Key phrases">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                {intel.phrases.map((p) => (
                  <div
                    key={p.en}
                    className="border border-[var(--border)] rounded-lg p-3"
                  >
                    <div className="text-xs text-[var(--muted)]">{p.en}</div>
                    <div className="font-medium mt-1">{p.local}</div>
                    {p.pron && (
                      <div className="text-xs text-[var(--muted)] mt-1 italic">
                        {p.pron}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {(intel.culture?.length || intel.scams?.length) && (
            <Section icon={Users} title="Cultural awareness">
              {intel.culture?.map((c, i) => (
                <Row key={`c-${i}`} label="Etiquette" value={c} />
              ))}
              {intel.scams?.map((c, i) => (
                <Row key={`s-${i}`} label="Watch out" value={c} severity="warn" />
              ))}
            </Section>
          )}

          {(intel.airportToCity ||
            intel.transitPass ||
            intel.averageCosts) && (
            <Section icon={Building2} title="Practical logistics">
              {intel.airportToCity && (
                <Row label="Airport → city" value={intel.airportToCity} />
              )}
              {intel.transitPass && (
                <Row label="Transit pass" value={intel.transitPass} />
              )}
              {intel.averageCosts && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-sm">
                  {intel.averageCosts.meal && (
                    <CostStat label="Meal" value={intel.averageCosts.meal} />
                  )}
                  {intel.averageCosts.coffee && (
                    <CostStat label="Coffee" value={intel.averageCosts.coffee} />
                  )}
                  {intel.averageCosts.metro && (
                    <CostStat label="Metro" value={intel.averageCosts.metro} />
                  )}
                  {intel.averageCosts.taxi && (
                    <CostStat label="Taxi" value={intel.averageCosts.taxi} />
                  )}
                </div>
              )}
            </Section>
          )}

          {intel.healthRisks && intel.healthRisks.length > 0 && (
            <Section icon={HeartPulse} title="Health & safety">
              {intel.healthRisks.map((h, i) => (
                <Row key={i} label="Heads up" value={h} />
              ))}
            </Section>
          )}

          {isGeneric && (
            <div className="px-6 py-4 text-xs text-[var(--muted)] flex items-start gap-2">
              <Info size={14} strokeWidth={1.75} aria-hidden className="mt-0.5 flex-none" />
              <span>
                Curated intel for {trip.destination} isn&apos;t available yet.
                The fields above are generic defaults — verify visa,
                vaccination, and safety details on{" "}
                <a
                  href="https://travel.state.gov/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--accent)] hover:underline"
                >
                  travel.state.gov
                </a>{" "}
                before booking.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof BookOpen;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-6 py-4">
      <div className="flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-[var(--muted)] uppercase mb-2">
        <Icon size={14} strokeWidth={1.75} aria-hidden />
        <span>{title}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  cta,
  severity = "info",
}: {
  label: string;
  value: string;
  cta?: { href: string; label: string };
  severity?: "info" | "good" | "warn" | "alert";
}) {
  const color =
    severity === "warn"
      ? "border-l-amber-400"
      : severity === "alert"
        ? "border-l-[var(--danger)]"
        : "border-l-[var(--accent)]";
  return (
    <div className={`pl-3 border-l-2 ${color}`}>
      <div className="text-[11px] text-[var(--muted)] uppercase tracking-wider">
        {label}
      </div>
      <div className="text-sm mt-0.5">
        {value}
        {cta && (
          <>
            {" — "}
            <a
              href={cta.href}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--accent)] hover:underline inline-flex items-center gap-1"
            >
              {cta.label}
              <ExternalLink size={11} strokeWidth={1.75} aria-hidden />
            </a>
          </>
        )}
      </div>
    </div>
  );
}

function Badge({
  icon: Icon,
  label,
  value,
  detail,
  severity,
  href,
}: {
  icon: typeof Stamp;
  label: string;
  value: string;
  detail?: string;
  severity: "info" | "good" | "warn" | "alert";
  href?: string;
}) {
  const palette: Record<typeof severity, string> = {
    good: "border-emerald-500/30 bg-emerald-500/5 text-emerald-300",
    info: "border-[var(--border)] bg-white/[0.02]",
    warn: "border-amber-500/40 bg-amber-500/5 text-amber-300",
    alert: "border-rose-500/40 bg-rose-500/5 text-rose-300",
  };
  const Wrapper = href ? "a" : "div";
  return (
    <Wrapper
      {...(href
        ? { href, target: "_blank", rel: "noreferrer" }
        : ({} as Record<string, never>))}
      className={`block border rounded-xl p-3 transition ${palette[severity]} ${href ? "hover:brightness-125" : ""}`}
    >
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider opacity-80">
        <Icon size={12} strokeWidth={1.75} aria-hidden />
        {label}
      </div>
      <div className="font-bold mt-1 text-sm">{value}</div>
      {detail && (
        <div className="text-[11px] opacity-80 mt-0.5">{detail}</div>
      )}
    </Wrapper>
  );
}

function CostStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--border)] rounded-lg p-2">
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
        {label}
      </div>
      <div className="font-bold mt-0.5">{value}</div>
    </div>
  );
}

// Re-export the AlertTriangle import so tree-shaking keeps it for callers
// that style their own warnings against this module.
export const _DestinationIntelIcons = { AlertTriangle };
