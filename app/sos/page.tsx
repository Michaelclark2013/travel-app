"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertOctagon,
  Building,
  ExternalLink,
  HeartPulse,
  Phone,
  Pill,
  ShieldAlert,
  User,
} from "lucide-react";
import { useRequireAuth } from "@/components/AuthProvider";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { genericIntel, resolveCountry } from "@/lib/destination-intel";
import { loadProfile } from "@/lib/profile";
import { loadTrips } from "@/lib/storage";
import type { TravelerProfile } from "@/lib/types";

function Inner() {
  const params = useSearchParams();
  const trips = useMemo(() => loadTrips(), []);
  const today = new Date().toISOString().slice(0, 10);
  const activeTrip = trips.find(
    (t) => today >= t.startDate && today <= t.endDate
  );
  const fallback = trips
    .filter((t) => t.startDate >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];

  const initial = params.get("destination") ?? activeTrip?.destination ?? fallback?.destination ?? "";
  const [destination, setDestination] = useState(initial);
  const [profile, setProfile] = useState<TravelerProfile>({});

  useEffect(() => {
    setProfile(loadProfile());
  }, []);

  const intel = resolveCountry(destination) ?? genericIntel(destination || "your destination");

  const nearestHospitalUrl = `https://www.google.com/maps/search/${encodeURIComponent(
    `nearest hospital ${destination || "near me"}`
  )}`;
  const pharmacyUrl = `https://www.google.com/maps/search/${encodeURIComponent(
    `pharmacy ${destination || "near me"}`
  )}`;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex items-center gap-3">
        <AlertOctagon size={26} strokeWidth={1.75} className="text-[var(--danger)]" aria-hidden />
        <h1 className="text-3xl font-bold tracking-tight">Emergency SOS</h1>
      </div>
      <p className="text-[var(--muted)] mt-2 max-w-prose">
        All info on this page is cached locally so it&apos;s available offline.
        Pick the destination you&apos;re currently in to surface the right
        numbers + embassy.
      </p>

      <div className="steel mt-6 p-4">
        <LocationAutocomplete
          value={destination}
          onText={setDestination}
          onPick={(loc) => setDestination(loc.city ?? loc.name ?? loc.fullName)}
          placeholder="Where are you right now?"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
        <CallTile
          label="Emergency"
          value={intel.emergencyNumber}
          severity="alert"
        />
        {intel.policeNumber && (
          <CallTile
            label="Police"
            value={intel.policeNumber}
            severity="warn"
          />
        )}
        {intel.ambulanceNumber && (
          <CallTile
            label="Ambulance"
            value={intel.ambulanceNumber}
            severity="warn"
          />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
        <a
          href={nearestHospitalUrl}
          target="_blank"
          rel="noreferrer"
          className="steel p-4 hover:brightness-125"
        >
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--muted)]">
            <HeartPulse size={12} strokeWidth={1.75} aria-hidden />
            Nearest hospital
          </div>
          <div className="mt-1 font-bold flex items-center gap-2">
            Open in Maps
            <ExternalLink size={12} strokeWidth={1.75} aria-hidden />
          </div>
        </a>
        <a
          href={pharmacyUrl}
          target="_blank"
          rel="noreferrer"
          className="steel p-4 hover:brightness-125"
        >
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--muted)]">
            <Pill size={12} strokeWidth={1.75} aria-hidden />
            Nearest pharmacy
          </div>
          <div className="mt-1 font-bold flex items-center gap-2">
            Open in Maps
            <ExternalLink size={12} strokeWidth={1.75} aria-hidden />
          </div>
        </a>
        {intel.embassyUrl && (
          <a
            href={intel.embassyUrl}
            target="_blank"
            rel="noreferrer"
            className="steel p-4 hover:brightness-125 sm:col-span-2"
          >
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--muted)]">
              <Building size={12} strokeWidth={1.75} aria-hidden />
              US embassy / consulate
            </div>
            <div className="mt-1 font-bold flex items-center gap-2">
              {intel.country}
              <ExternalLink size={12} strokeWidth={1.75} aria-hidden />
            </div>
          </a>
        )}
      </div>

      <div className="steel mt-6 p-5">
        <div className="flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-[var(--muted)] uppercase">
          <User size={14} strokeWidth={1.75} aria-hidden />
          MEDICAL INFO
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 text-sm">
          <Stat label="Blood type" value={profile.bloodType ?? "—"} />
          <Stat
            label="Allergies"
            value={profile.medicalAllergies ?? "—"}
          />
          <Stat
            label="Medications"
            value={profile.currentMedications ?? "—"}
          />
        </div>
        <p className="text-[11px] text-[var(--muted)] mt-3">
          Set these in your profile so first responders can find them on this
          page even if your phone is locked-but-accessible.
        </p>
      </div>

      <div className="steel mt-4 p-5">
        <div className="flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-[var(--muted)] uppercase">
          <Phone size={14} strokeWidth={1.75} aria-hidden />
          EMERGENCY CONTACTS
        </div>
        {(profile.defaultPreferences?.emergencyContacts ?? []).length === 0 ? (
          <div className="text-sm text-[var(--muted)] mt-3">
            None set yet. Add them in your profile.
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {(profile.defaultPreferences?.emergencyContacts ?? []).map((c, i) => (
              <li key={i} className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{c.name}</div>
                  <div className="text-xs text-[var(--muted)]">{c.relation}</div>
                </div>
                <a
                  href={`tel:${c.phone}`}
                  className="btn-primary px-4 py-2 text-sm font-mono"
                >
                  {c.phone}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {profile.defaultPreferences?.insurance?.policyNumber && (
        <div className="steel mt-4 p-5">
          <div className="flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-[var(--muted)] uppercase">
            <ShieldAlert size={14} strokeWidth={1.75} aria-hidden />
            TRAVEL INSURANCE
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 text-sm">
            <Stat
              label="Provider"
              value={profile.defaultPreferences.insurance.provider ?? "—"}
            />
            <Stat
              label="Policy #"
              value={profile.defaultPreferences.insurance.policyNumber}
            />
            <Stat
              label="24h support"
              value={profile.defaultPreferences.insurance.phone ?? "—"}
              tel={profile.defaultPreferences.insurance.phone}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function CallTile({
  label,
  value,
  severity,
}: {
  label: string;
  value: string;
  severity: "alert" | "warn" | "info";
}) {
  const palette: Record<typeof severity, string> = {
    alert: "border-rose-500/50 bg-rose-500/10 text-rose-200",
    warn: "border-amber-500/50 bg-amber-500/10 text-amber-200",
    info: "border-[var(--border)]",
  };
  // Build a tel: link from the first number in the string.
  const num = value.replace(/[^\d+\/]/g, " ").trim().split(/\s+/)[0];
  return (
    <a
      href={`tel:${num}`}
      className={`block border rounded-xl p-4 ${palette[severity]} hover:brightness-110`}
    >
      <div className="text-[10px] uppercase tracking-wider opacity-80">
        {label}
      </div>
      <div className="text-2xl font-bold tracking-tight mt-1 font-mono">
        {value}
      </div>
    </a>
  );
}

function Stat({
  label,
  value,
  tel,
}: {
  label: string;
  value: string;
  tel?: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">
        {label}
      </div>
      {tel ? (
        <a
          href={`tel:${tel}`}
          className="font-mono text-sm mt-1 text-[var(--accent)] block break-words"
        >
          {value}
        </a>
      ) : (
        <div className="font-medium mt-1 break-words">{value}</div>
      )}
    </div>
  );
}

export default function SOSPage() {
  // Allow this page to be hit without auth — emergencies don't wait.
  // useRequireAuth still redirects on most pages; bypass here.
  const { ready } = useRequireAuth();
  void ready;
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
