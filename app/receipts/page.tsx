"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Camera,
  CheckCircle2,
  FileText,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useRequireAuth } from "@/components/AuthProvider";
import {
  deleteReceipt,
  loadReceipts,
  ocrReceipt,
  parseReceiptText,
  saveReceipt,
} from "@/lib/receipts";
import { loadTrips } from "@/lib/storage";
import type { Receipt } from "@/lib/types";

const CATEGORY_LABELS: Record<Receipt["category"], string> = {
  food: "Food",
  transport: "Transport",
  lodging: "Lodging",
  activity: "Activity",
  shopping: "Shopping",
  other: "Other",
};

function Inner() {
  const params = useSearchParams();
  const { user, ready } = useRequireAuth();
  const initialTripId = params.get("trip") ?? undefined;

  const [items, setItems] = useState<Receipt[]>([]);
  const [draft, setDraft] = useState<Partial<Receipt> | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    setItems(loadReceipts());
  }, []);

  function refresh() {
    setItems(loadReceipts());
  }

  async function handleFile(file: File) {
    setScanning(true);
    try {
      const parsed = await ocrReceipt(file);
      setDraft({
        tripId: initialTripId,
        category: "food",
        date: new Date().toISOString().slice(0, 10),
        ...parsed,
      });
    } finally {
      setScanning(false);
    }
  }

  function handlePaste() {
    const parsed = parseReceiptText(pasteText);
    setDraft({
      tripId: initialTripId,
      category: "other",
      date: new Date().toISOString().slice(0, 10),
      ...parsed,
    });
    setPasteOpen(false);
    setPasteText("");
  }

  function commitDraft() {
    if (!draft || !draft.vendor || draft.totalUsd == null) return;
    const r: Receipt = {
      id: `rcp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      tripId: draft.tripId,
      vendor: draft.vendor,
      totalUsd: draft.totalUsd,
      date: draft.date ?? new Date().toISOString().slice(0, 10),
      category: draft.category ?? "other",
      notes: draft.notes,
      imageDataUrl: draft.imageDataUrl,
      createdAt: new Date().toISOString(),
    };
    saveReceipt(r);
    setDraft(null);
    refresh();
  }

  const trips = useMemo(() => loadTrips(), []);
  const total = items.reduce((s, r) => s + r.totalUsd, 0);

  if (!ready || !user) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-20 text-center text-[var(--muted)]">
        Authenticating…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Receipts</h1>
          <p className="text-[var(--muted)] mt-2">
            Upload a photo or paste the text — we&apos;ll extract the vendor,
            total, and date so you can split it later.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-[var(--muted)]">Total</div>
          <div className="text-2xl font-bold">${total.toFixed(2)}</div>
        </div>
      </div>

      <div className="steel mt-6 p-4 flex items-center gap-2 flex-wrap">
        <button
          onClick={() => fileRef.current?.click()}
          className="btn-primary px-4 py-2 text-sm inline-flex items-center gap-2"
          disabled={scanning}
        >
          <Camera size={14} strokeWidth={1.75} aria-hidden />
          {scanning ? "Reading…" : "Photo / image"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => setPasteOpen((v) => !v)}
          className="btn-steel px-4 py-2 text-sm inline-flex items-center gap-2"
        >
          <FileText size={14} strokeWidth={1.75} aria-hidden />
          Paste text
        </button>
        <span className="text-xs text-[var(--muted)] ml-2">
          OCR is heuristic-based — verify the parsed fields before saving.
        </span>
      </div>

      {pasteOpen && (
        <div className="steel mt-4 p-4">
          <textarea
            className="input"
            rows={5}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste the visible text from the receipt…"
            style={{ height: "auto", padding: "10px 12px", fontSize: 13 }}
          />
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setPasteOpen(false)}
              className="btn-steel px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handlePaste}
              className="btn-primary px-4 py-2 text-sm"
            >
              Parse
            </button>
          </div>
        </div>
      )}

      {draft && (
        <div className="steel mt-4 p-5">
          <div className="text-xs font-bold tracking-[0.18em] text-[var(--muted)] uppercase mb-3">
            Confirm details
          </div>
          {draft.imageDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={draft.imageDataUrl}
              alt="Receipt preview"
              className="rounded-md max-h-40 mb-3"
            />
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Vendor">
              <input
                className="input"
                value={draft.vendor ?? ""}
                onChange={(e) => setDraft({ ...draft, vendor: e.target.value })}
              />
            </Field>
            <Field label="Total (USD)">
              <input
                className="input"
                inputMode="decimal"
                value={draft.totalUsd ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    totalUsd: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </Field>
            <Field label="Date">
              <input
                className="input"
                type="date"
                value={draft.date ?? ""}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </Field>
            <Field label="Category">
              <select
                className="input"
                value={draft.category ?? "other"}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    category: e.target.value as Receipt["category"],
                  })
                }
              >
                {(Object.keys(CATEGORY_LABELS) as Receipt["category"][]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Trip">
              <select
                className="input"
                value={draft.tripId ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, tripId: e.target.value || undefined })
                }
              >
                <option value="">Unassigned</option>
                {trips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.destination}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notes">
              <input
                className="input"
                value={draft.notes ?? ""}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setDraft(null)}
              className="btn-steel px-4 py-2 text-sm"
            >
              Discard
            </button>
            <button
              onClick={commitDraft}
              className="btn-primary px-4 py-2 text-sm inline-flex items-center gap-2"
            >
              <CheckCircle2 size={14} strokeWidth={1.75} aria-hidden />
              Save receipt
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 space-y-2">
        {items.length === 0 && (
          <div className="text-sm text-[var(--muted)] text-center py-8">
            No receipts yet.
          </div>
        )}
        {items.map((r) => (
          <div
            key={r.id}
            className="border border-[var(--border)] rounded-lg p-3 flex items-center gap-3"
          >
            <Upload
              size={14}
              strokeWidth={1.75}
              className="text-[var(--muted)] flex-none"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{r.vendor}</div>
              <div className="text-xs text-[var(--muted)]">
                {new Date(r.date).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}{" "}
                · {CATEGORY_LABELS[r.category]}
                {r.tripId && (
                  <>
                    {" · "}
                    {trips.find((t) => t.id === r.tripId)?.destination ?? "Trip"}
                  </>
                )}
              </div>
            </div>
            <div className="font-bold">${r.totalUsd.toFixed(2)}</div>
            <button
              onClick={() => {
                deleteReceipt(r.id);
                refresh();
              }}
              className="text-[var(--muted)] hover:text-[var(--danger)] p-1.5"
              aria-label="Delete"
            >
              <Trash2 size={13} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        ))}
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

export default function ReceiptsPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
