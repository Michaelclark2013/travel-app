"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Award,
  BarChart3,
  CreditCard as CreditCardIcon,
  HeartPulse,
  Lock,
  Plus,
  Settings2,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { useAuth, useRequireAuth } from "@/components/AuthProvider";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { TripPreferencesPanel } from "@/components/TripPreferencesPanel";
import {
  computeTravelPatterns,
  loadProfile,
  loadProfileAsync,
  saveProfile,
  type TravelPatterns,
} from "@/lib/profile";
import { loadTrips } from "@/lib/storage";
import { loadConfirmations } from "@/lib/wallet";
import { POPULAR_CARDS } from "@/lib/credit-cards";
import { computeAchievements, computeStats } from "@/lib/achievements";
import type {
  CreditCard,
  TravelCompanion,
  TravelerProfile,
  TripPreferences,
} from "@/lib/types";

export default function ProfilePage() {
  const { user, ready, signOut } = useAuth();
  useRequireAuth();
  const [profile, setProfile] = useState<TravelerProfile>({});
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    setProfile(loadProfile());
    loadProfileAsync().then((remote) => {
      if (Object.keys(remote).length > 0) setProfile(remote);
    });
  }, [ready, user]);

  function patch(p: Partial<TravelerProfile>) {
    const next = { ...profile, ...p, updatedAt: new Date().toISOString() };
    setProfile(next);
    saveProfile(next);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  }

  const patterns = useMemo<TravelPatterns | null>(() => {
    if (!ready || !user) return null;
    return computeTravelPatterns({
      trips: loadTrips(),
      wallet: loadConfirmations(),
    });
  }, [ready, user, profile.updatedAt]);

  if (!ready || !user) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-20 text-center text-[var(--muted)]">
        Authenticating…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-4xl font-bold tracking-tight">Your profile</h1>
          <p className="text-[var(--muted)] mt-2">
            Set this once. Every new trip pre-fills these defaults so you never
            re-enter the same info.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {savedFlash && <span className="text-xs text-[var(--accent)]">✓ Saved</span>}
          <button onClick={signOut} className="btn-steel px-4 py-2.5 text-sm">
            Sign out
          </button>
        </div>
      </div>

      <div className="steel mt-8 p-6">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 bg-white text-black flex items-center justify-center font-bold text-2xl rounded-xl">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="text-xl font-bold">{user.name}</div>
            <div className="text-sm text-[var(--muted)]">{user.email}</div>
          </div>
        </div>
      </div>

      {/* Identity */}
      <div className="steel mt-6 p-6">
        <SectionHeader icon={User} title="Identity" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          <Field label="Full name (as on tickets)">
            <input
              className="input"
              value={profile.fullName ?? ""}
              onChange={(e) => patch({ fullName: e.target.value || undefined })}
            />
          </Field>
          <Field label="Passport name (if different)">
            <input
              className="input"
              value={profile.passportName ?? ""}
              onChange={(e) => patch({ passportName: e.target.value || undefined })}
            />
          </Field>
          <Field label="Date of birth">
            <input
              type="date"
              className="input"
              value={profile.dateOfBirth ?? ""}
              onChange={(e) => patch({ dateOfBirth: e.target.value || undefined })}
            />
          </Field>
          <Field label="Home airport">
            <LocationAutocomplete
              value={profile.homeAirport ?? ""}
              onText={(s) =>
                patch({ homeAirport: s.toUpperCase() || undefined })
              }
              onPick={(loc) =>
                patch({
                  homeAirport:
                    (loc.iata ?? loc.name).toUpperCase() || undefined,
                })
              }
              placeholder="e.g. SFO, LAX, JFK"
              showRecent={false}
            />
          </Field>
        </div>
      </div>

      {/* Default trip preferences */}
      <TripPreferencesPanel
        value={profile.defaultPreferences}
        onChange={(prefs: TripPreferences) =>
          patch({ defaultPreferences: prefs })
        }
        storageKey="voyage:profile-default-prefs-open"
      />

      {/* Companions */}
      <CompanionsSection
        companions={profile.companions ?? []}
        onChange={(companions) =>
          patch({ companions: companions.length > 0 ? companions : undefined })
        }
      />

      {/* Credit cards */}
      <CreditCardsSection
        cards={profile.creditCards ?? []}
        onChange={(creditCards) =>
          patch({ creditCards: creditCards.length > 0 ? creditCards : undefined })
        }
      />

      {/* Medical info (used by SOS page) */}
      <div className="steel mt-6 p-6">
        <SectionHeader icon={HeartPulse} title="Medical info (for SOS screen)" />
        <p className="text-xs text-[var(--muted)] mt-1">
          Stored only on this device + your Supabase profile. Surfaces on the
          /sos page so first responders can find it quickly.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          <Field label="Blood type">
            <input
              className="input"
              placeholder="e.g. O+"
              value={profile.bloodType ?? ""}
              onChange={(e) => patch({ bloodType: e.target.value || undefined })}
            />
          </Field>
          <Field label="Allergies">
            <input
              className="input"
              value={profile.medicalAllergies ?? ""}
              onChange={(e) =>
                patch({ medicalAllergies: e.target.value || undefined })
              }
            />
          </Field>
          <Field label="Current medications">
            <input
              className="input"
              value={profile.currentMedications ?? ""}
              onChange={(e) =>
                patch({ currentMedications: e.target.value || undefined })
              }
            />
          </Field>
        </div>
      </div>

      {/* Achievements */}
      <AchievementsSection />

      {/* Patterns */}
      {patterns && patterns.totalTrips > 0 && (
        <div className="steel mt-6 p-6">
          <SectionHeader icon={BarChart3} title="Travel patterns" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
            <Stat label="Trips" value={patterns.totalTrips.toString()} />
            <Stat
              label="Upcoming"
              value={patterns.upcomingTrips.toString()}
            />
            <Stat label="Avg days" value={patterns.avgTripDays.toString()} />
            <Stat
              label="Total spend"
              value={`$${Math.round(patterns.totalSpend).toLocaleString()}`}
            />
          </div>

          {patterns.topDestinations.length > 0 && (
            <PatternList
              title="Most-visited destinations"
              items={patterns.topDestinations}
            />
          )}
          {patterns.topAirlines.length > 0 && (
            <PatternList title="Favorite airlines" items={patterns.topAirlines} />
          )}
          {patterns.topHotels.length > 0 && (
            <PatternList
              title="Most-booked hotel brands"
              items={patterns.topHotels}
            />
          )}

          {patterns.preferredSeason && (
            <div className="mt-5 text-sm">
              <span className="text-[var(--muted)]">You travel most in </span>
              <span className="font-medium capitalize">
                {patterns.preferredSeason}
              </span>
              <span className="text-[var(--muted)]">
                {" "}
                — average daily spend ~${patterns.avgDailySpend}.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CompanionsSection({
  companions,
  onChange,
}: {
  companions: TravelCompanion[];
  onChange: (next: TravelCompanion[]) => void;
}) {
  function add() {
    onChange([
      ...companions,
      {
        id: `cmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: "",
        relation: "",
      },
    ]);
  }
  function update(id: string, p: Partial<TravelCompanion>) {
    onChange(companions.map((c) => (c.id === id ? { ...c, ...p } : c)));
  }
  function remove(id: string) {
    onChange(companions.filter((c) => c.id !== id));
  }
  return (
    <div className="steel mt-6 p-6">
      <SectionHeader icon={Users} title="Frequent travel companions" />
      <p className="text-xs text-[var(--muted)] mt-1">
        Save the people you travel with most so you can quick-add them to a new
        trip.
      </p>
      <div className="mt-4 space-y-2">
        {companions.map((c) => (
          <div
            key={c.id}
            className="grid grid-cols-1 md:grid-cols-[1fr_140px_1fr_auto] gap-2 items-center"
          >
            <input
              className="input"
              placeholder="Name"
              value={c.name}
              onChange={(e) => update(c.id, { name: e.target.value })}
            />
            <input
              className="input"
              placeholder="Relation"
              value={c.relation ?? ""}
              onChange={(e) =>
                update(c.id, { relation: e.target.value || undefined })
              }
            />
            <input
              className="input"
              placeholder="Email (optional)"
              value={c.email ?? ""}
              onChange={(e) =>
                update(c.id, { email: e.target.value || undefined })
              }
            />
            <button
              type="button"
              onClick={() => remove(c.id)}
              className="text-[var(--muted)] hover:text-[var(--danger)] p-2 justify-self-end"
              aria-label="Remove"
            >
              <Trash2 size={14} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        className="mt-3 inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        <Plus size={12} strokeWidth={1.75} aria-hidden />
        Add companion
      </button>
    </div>
  );
}

function CreditCardsSection({
  cards,
  onChange,
}: {
  cards: CreditCard[];
  onChange: (cards: CreditCard[]) => void;
}) {
  function add(card: CreditCard) {
    if (cards.some((c) => c.id === card.id)) return;
    onChange([...cards, card]);
  }
  function remove(id: string) {
    onChange(cards.filter((c) => c.id !== id));
  }
  return (
    <div className="steel mt-6 p-6">
      <SectionHeader icon={CreditCardIcon} title="Credit cards (rewards optimizer)" />
      <p className="text-xs text-[var(--muted)] mt-1">
        We&apos;ll recommend which card to use on each booking based on its
        reward categories.
      </p>
      <div className="mt-4 space-y-2">
        {cards.length === 0 && (
          <div className="text-sm text-[var(--muted)]">
            No cards added. Pick from popular cards below or add your own.
          </div>
        )}
        {cards.map((c) => (
          <div
            key={c.id}
            className="border border-[var(--border)] rounded-lg p-3 flex items-start gap-3"
          >
            <CreditCardIcon
              size={16}
              strokeWidth={1.75}
              className="text-[var(--accent)] flex-none mt-0.5"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm">{c.name}</div>
              <div className="text-xs text-[var(--muted)] mt-1">
                {c.rewards
                  .map((r) => `${r.multiplier}× ${r.category}`)
                  .join(" · ")}
              </div>
              {c.notes && (
                <div className="text-xs text-[var(--muted)] mt-1 italic">
                  {c.notes}
                </div>
              )}
            </div>
            <button
              onClick={() => remove(c.id)}
              className="text-[var(--muted)] hover:text-[var(--danger)] p-1"
              aria-label="Remove"
            >
              <Trash2 size={13} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <div className="text-xs text-[var(--muted)] mb-2">Quick add</div>
        <div className="flex flex-wrap gap-2">
          {POPULAR_CARDS.map((c) => {
            const owned = cards.some((x) => x.id === c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => add(c)}
                disabled={owned}
                className={
                  "px-3 py-1.5 text-xs rounded-full border transition " +
                  (owned
                    ? "border-[var(--border)] text-[var(--muted)] cursor-default"
                    : "border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)]")
                }
              >
                {owned ? "✓ " : "+ "}
                {c.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AchievementsSection() {
  const stats = computeStats();
  const achievements = computeAchievements(stats);
  const unlocked = achievements.filter((a) => a.unlocked).length;

  return (
    <div className="steel mt-6 p-6">
      <SectionHeader icon={Award} title="Travel achievements" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
        <Stat label="Countries" value={stats.countryCount.toString()} />
        <Stat
          label="Est. miles"
          value={stats.estimatedMiles.toLocaleString()}
        />
        <Stat
          label="Longest trip"
          value={stats.longestTripDays > 0 ? `${stats.longestTripDays}d` : "—"}
        />
        <Stat
          label="Unlocked"
          value={`${unlocked} / ${achievements.length}`}
        />
      </div>
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
        {achievements.map((a) => (
          <div
            key={a.id}
            className={
              "border rounded-lg p-3 flex items-start gap-3 " +
              (a.unlocked
                ? "border-[var(--accent)]/40 bg-[var(--accent-soft)]"
                : "border-[var(--border)]")
            }
          >
            {a.unlocked ? (
              <Award
                size={16}
                strokeWidth={1.75}
                className="text-[var(--accent)] flex-none mt-0.5"
                aria-hidden
              />
            ) : (
              <Lock
                size={14}
                strokeWidth={1.75}
                className="text-[var(--muted)] flex-none mt-1"
                aria-hidden
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{a.title}</div>
              <div className="text-xs text-[var(--muted)] mt-0.5">
                {a.description}
              </div>
              {a.progress != null && a.progress > 0 && a.progress < 1 && (
                <div className="mt-2 h-1 rounded-full bg-[var(--border)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)]"
                    style={{ width: `${a.progress * 100}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      {stats.countries.length > 0 && (
        <div className="mt-5">
          <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-2">
            Countries you&apos;ve visited
          </div>
          <div className="flex flex-wrap gap-2">
            {stats.countries.map((c) => (
              <span
                key={c}
                className="bg-white/8 border border-[var(--edge)] px-3 py-1 text-xs rounded-full"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
}: {
  icon: typeof Settings2;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon
        size={16}
        strokeWidth={1.75}
        className="text-[var(--accent)]"
        aria-hidden
      />
      <div className="text-xs font-bold tracking-[0.2em] text-[var(--muted)]">
        {title.toUpperCase()}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[var(--muted)] mb-1 text-xs">{label}</div>
      {children}
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      <div className="text-xs text-[var(--muted)] mt-0.5">{label}</div>
    </div>
  );
}

function PatternList({
  title,
  items,
}: {
  title: string;
  items: { name: string; count: number }[];
}) {
  return (
    <div className="mt-5">
      <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-2">
        {title}
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((i) => (
          <span
            key={i.name}
            className="bg-white/8 border border-[var(--edge)] px-3 py-1.5 text-sm rounded-full"
          >
            {i.name}
            <span className="text-[var(--muted)] text-xs ml-1.5">×{i.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
