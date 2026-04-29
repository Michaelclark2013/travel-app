"use client";

import { useEffect, useMemo, useState } from "react";
import {
  intelForCity,
  mockEvents,
  mockSafety,
  mockWeather,
  visaRule,
  type WeatherDay,
} from "@/lib/travel-intel";

type LiveCountry = {
  ok: boolean;
  country?: string;
  capital?: string;
  languages?: string[];
  currencies?: { code: string; name: string; symbol: string }[];
  timezones?: string[];
  drivingSide?: "left" | "right";
  callingCode?: string;
  flag?: string;
  plugTypes?: string[];
  population?: number;
};

const SAFETY_LABEL = {
  1: "Level 1 · Normal precautions",
  2: "Level 2 · Increased caution",
  3: "Level 3 · Reconsider travel",
  4: "Level 4 · Do not travel",
};
const SAFETY_COLOR = {
  1: "text-emerald-300",
  2: "text-amber-300",
  3: "text-orange-300",
  4: "text-rose-300",
};

export default function TravelIntel({
  destination,
  durationDays,
  passport = "US",
  tripStartDate,
  tripEndDate,
}: {
  destination: string;
  durationDays: number;
  passport?: string;
  tripStartDate?: string;
  tripEndDate?: string;
}) {
  const intel = useMemo(() => intelForCity(destination), [destination]);
  const visa = useMemo(
    () => (intel ? visaRule(passport, intel.country) : null),
    [intel, passport]
  );
  const events = useMemo(() => mockEvents(destination), [destination]);
  const safety = useMemo(
    () => (intel ? mockSafety(intel.country) : null),
    [intel]
  );

  // Live data: weather (Open-Meteo) + country facts (REST Countries) + about
  // (Wikipedia) + holidays (date.nager.at). All fall back gracefully so the
  // UI never empties.
  const [liveWeather, setLiveWeather] = useState<WeatherDay[] | null>(null);
  const [liveCountry, setLiveCountry] = useState<LiveCountry | null>(null);
  const [weatherSource, setWeatherSource] = useState<"live" | "mock">("mock");
  const [countrySource, setCountrySource] = useState<"live" | "mock">("mock");
  const [about, setAbout] = useState<{
    title: string;
    description?: string;
    extract?: string;
    imageUrl?: string;
    pageUrl?: string;
  } | null>(null);
  const [liveHolidays, setLiveHolidays] = useState<
    { date: string; name: string; localName: string }[] | null
  >(null);

  useEffect(() => {
    let aborted = false;
    const days = Math.min(7, Math.max(1, durationDays));
    fetch(`/api/intel/weather?city=${encodeURIComponent(destination)}&days=${days}`)
      .then((r) => r.json())
      .then((data) => {
        if (aborted || !data?.ok) return;
        setLiveWeather(data.days);
        setWeatherSource("live");
      })
      .catch(() => {});
    return () => {
      aborted = true;
    };
  }, [destination, durationDays]);

  useEffect(() => {
    if (!intel) return;
    let aborted = false;
    fetch(`/api/intel/country?name=${encodeURIComponent(intel.country)}`)
      .then((r) => r.json())
      .then((data) => {
        if (aborted || !data?.ok) return;
        setLiveCountry(data);
        setCountrySource("live");
      })
      .catch(() => {});
    return () => {
      aborted = true;
    };
  }, [intel]);

  // Wikipedia summary — try the city first, fall back to country if no page.
  useEffect(() => {
    let aborted = false;
    async function fetchAbout() {
      const tryFetch = async (q: string) => {
        const r = await fetch(`/api/intel/wikipedia?title=${encodeURIComponent(q)}`);
        const j = await r.json();
        return j?.ok ? j : null;
      };
      const a = (await tryFetch(destination)) ?? (intel ? await tryFetch(intel.country) : null);
      if (!aborted && a) setAbout(a);
    }
    fetchAbout();
    return () => {
      aborted = true;
    };
  }, [destination, intel]);

  // Public holidays during the trip (or upcoming if no dates given).
  useEffect(() => {
    if (!intel) return;
    let aborted = false;
    const params = new URLSearchParams({ countryName: intel.country.toLowerCase() });
    if (tripStartDate) params.set("from", tripStartDate);
    if (tripEndDate) params.set("to", tripEndDate);
    fetch(`/api/intel/holidays?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (aborted || !data?.ok) return;
        setLiveHolidays(data.holidays ?? []);
      })
      .catch(() => {});
    return () => {
      aborted = true;
    };
  }, [intel, tripStartDate, tripEndDate]);

  const weather = liveWeather ?? mockWeather(destination, Math.min(7, durationDays));

  const [tab, setTab] = useState<
    "about" | "facts" | "weather" | "events" | "visa"
  >("about");

  if (!intel) {
    return null;
  }

  return (
    <div className="surface rounded-2xl p-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--accent)] uppercase flex items-center gap-2">
            // 07 · TRAVEL INTELLIGENCE
            {(weatherSource === "live" || countrySource === "live") && (
              <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-300 normal-case tracking-normal">
                ● Live
              </span>
            )}
          </div>
          <div className="text-lg font-semibold mt-1">
            {liveCountry?.flag ?? ""} {intel.country} · what you need to know
          </div>
        </div>
        {safety && (
          <div className={`text-xs font-mono ${SAFETY_COLOR[safety.level]}`}>
            {SAFETY_LABEL[safety.level]}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {(["about", "facts", "weather", "events", "visa"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full border px-3 py-1.5 capitalize ${
              tab === t
                ? "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]"
                : "border-[var(--border)] hover:bg-white/5"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "about" && <AboutView about={about} destination={destination} />}
        {tab === "facts" && <FactsView intel={intel} live={liveCountry} />}
        {tab === "weather" && <WeatherView days={weather} />}
        {tab === "events" && (
          <EventsView events={events} liveHolidays={liveHolidays ?? undefined} />
        )}
        {tab === "visa" && <VisaView passport={passport} rule={visa} country={intel.country} />}
      </div>
    </div>
  );
}

function FactsView({
  intel,
  live,
}: {
  intel: ReturnType<typeof intelForCity>;
  live: LiveCountry | null;
}) {
  if (!intel) return null;
  // Prefer live country data when available, fall back to the static intel table.
  const currency = live?.currencies?.[0]
    ? `${live.currencies[0].code} (${live.currencies[0].symbol})`
    : intel.currency;
  const drivingRaw = (live?.drivingSide ?? intel.drivingSide) as "left" | "right";
  const languages = live?.languages?.length ? live.languages : intel.language;
  const plug = (live?.plugTypes && live.plugTypes.length
    ? live.plugTypes
    : intel.plug
  ).join(", ");

  const rows: Array<[string, string]> = [
    ["Currency", currency],
    ["Plug type", `${plug} · ${intel.voltage}`],
    ["Driving", drivingRaw === "left" ? "Left side" : "Right side"],
    ["Tap water", intel.tapWaterSafe ? "Safe to drink" : "Bottled only"],
    ["Tipping", intel.tipNorm],
    ["Languages", languages.join(", ")],
    ["Emergency", intel.emergency],
  ];
  if (live?.capital) rows.splice(0, 0, ["Capital", live.capital]);
  if (live?.callingCode) rows.push(["Calling code", live.callingCode]);
  if (live?.timezones?.[0]) rows.push(["Timezone", live.timezones[0]]);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 border-b border-[var(--hairline)] pb-2">
          <span className="text-[var(--muted)] shrink-0">{k}</span>
          <span className="text-right">{v}</span>
        </div>
      ))}
    </div>
  );
}

function WeatherView({ days }: { days: WeatherDay[] }) {
  const icon = (c: string) =>
    c === "Rain" ? "🌧" : c === "Cloudy" ? "☁️" : c === "Partly cloudy" ? "⛅" : "☀️";
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-center">
      {days.map((d) => (
        <div
          key={d.date}
          className="rounded-xl border border-[var(--border)] bg-[var(--card-strong)] p-3"
        >
          <div className="text-[10px] font-mono text-[var(--muted)] uppercase">
            {new Date(d.date).toLocaleDateString(undefined, {
              weekday: "short",
            })}
          </div>
          <div className="text-2xl mt-1">{icon(d.conditions)}</div>
          <div className="text-sm font-semibold mt-1">{d.highC}°/{d.lowC}°</div>
          {d.precipMm > 0 && (
            <div className="text-[10px] text-[var(--muted)] mt-0.5">
              {d.precipMm}mm
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function EventsView({
  events,
  liveHolidays,
}: {
  events: Array<{ title: string; date: string; category: string; venue: string }>;
  liveHolidays?: { date: string; name: string; localName: string }[];
}) {
  const icons: Record<string, string> = {
    concert: "🎵",
    sport: "🏟",
    festival: "🎪",
    exhibit: "🖼",
  };
  return (
    <div className="space-y-4">
      {liveHolidays && liveHolidays.length > 0 && (
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] text-emerald-300 uppercase mb-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5">
            ● Live · Public holidays
          </div>
          <ul className="space-y-2">
            {liveHolidays.map((h, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--card-strong)] px-3 py-2.5 text-sm"
              >
                <span className="text-xl">🎉</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {h.localName}
                    {h.localName !== h.name && (
                      <span className="text-[var(--muted)] text-xs ml-2">
                        · {h.name}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    {new Date(h.date).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--muted)] uppercase mb-2">
          // Around town
        </div>
        <ul className="space-y-2">
          {events.map((e, i) => (
            <li
              key={i}
              className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--card-strong)] px-3 py-2.5 text-sm"
            >
              <span className="text-xl">{icons[e.category] ?? "•"}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{e.title}</div>
                <div className="text-xs text-[var(--muted)]">
                  {new Date(e.date).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}{" "}
                  · {e.venue}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function AboutView({
  about,
  destination,
}: {
  about: {
    title: string;
    description?: string;
    extract?: string;
    imageUrl?: string;
    pageUrl?: string;
  } | null;
  destination: string;
}) {
  if (!about) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card-strong)] p-4 space-y-2">
        <div className="shimmer h-32 w-full rounded-lg" />
        <div className="shimmer h-3 w-2/3 rounded" />
        <div className="shimmer h-3 w-full rounded" />
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card-strong)] overflow-hidden">
      {about.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={about.imageUrl}
          alt={about.title}
          className="w-full h-44 object-cover"
        />
      )}
      <div className="p-4">
        <div className="text-xs font-mono uppercase tracking-[0.16em] text-[var(--accent)]">
          {about.description || "About"}
        </div>
        <div className="font-semibold text-base mt-1">
          {about.title || destination}
        </div>
        {about.extract && (
          <p className="text-sm text-[var(--foreground)]/85 mt-2 leading-relaxed">
            {about.extract}
          </p>
        )}
        {about.pageUrl && (
          <a
            href={about.pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--accent)] hover:underline mt-3 inline-block"
          >
            Source · Wikipedia →
          </a>
        )}
      </div>
    </div>
  );
}

function VisaView({
  passport,
  country,
  rule,
}: {
  passport: string;
  country: string;
  rule: ReturnType<typeof visaRule>;
}) {
  if (!rule) {
    return (
      <div className="text-sm text-[var(--muted)]">
        Confirm visa requirements with the embassy or an official source for{" "}
        {country}.
      </div>
    );
  }
  const badge =
    rule.status === "visa-free"
      ? { label: "✓ Visa-free", color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" }
      : rule.status === "eta"
      ? { label: "ETA required", color: "bg-amber-500/15 text-amber-300 border-amber-500/40" }
      : rule.status === "visa-on-arrival"
      ? { label: "Visa on arrival", color: "bg-sky-500/15 text-sky-300 border-sky-500/40" }
      : { label: "Visa required", color: "bg-rose-500/15 text-rose-300 border-rose-500/40" };
  return (
    <div className="space-y-3 text-sm">
      <div>
        <span className={`inline-block rounded-full border px-2.5 py-1 text-xs font-medium ${badge.color}`}>
          {badge.label}
        </span>
      </div>
      <div className="text-[var(--muted)]">
        With a <strong className="text-white">{passport}</strong> passport, you
        can stay in {country} for {rule.duration} per visit.
      </div>
      {rule.notes && <div className="text-[var(--muted)]">{rule.notes}</div>}
      {rule.applicationUrl && (
        <a
          href={rule.applicationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary inline-block px-4 py-2 text-xs"
        >
          Apply / official portal →
        </a>
      )}
      <div className="text-[10px] font-mono text-[var(--muted)] uppercase tracking-wider">
        Source · {rule.source}
      </div>
    </div>
  );
}
