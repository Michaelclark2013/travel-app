"use client";

import { getSession } from "./auth";
import { loadConfirmations } from "./wallet";
import { parseEmailRaw } from "./wallet-rules";
import type { Receipt } from "./types";

const KEY = "voyage:receipts";

function localKey(): string | null {
  const u = getSession();
  return u ? `${KEY}:${u.id}` : null;
}

export function loadReceipts(tripId?: string): Receipt[] {
  if (typeof window === "undefined") return [];
  const k = localKey();
  if (!k) return [];
  try {
    const all: Receipt[] = JSON.parse(window.localStorage.getItem(k) ?? "[]");
    return tripId ? all.filter((r) => r.tripId === tripId) : all;
  } catch {
    return [];
  }
}

export function saveReceipt(r: Receipt) {
  const k = localKey();
  if (!k || typeof window === "undefined") return;
  const all = loadReceipts();
  const idx = all.findIndex((x) => x.id === r.id);
  if (idx >= 0) all[idx] = r;
  else all.unshift(r);
  window.localStorage.setItem(k, JSON.stringify(all));
}

export function deleteReceipt(id: string) {
  const k = localKey();
  if (!k || typeof window === "undefined") return;
  const all = loadReceipts().filter((r) => r.id !== id);
  window.localStorage.setItem(k, JSON.stringify(all));
}

// "OCR-style" parser — applies the wallet-rules engine to a free-text receipt
// dump. Real OCR would feed Tesseract.js output through this same function.
export function parseReceiptText(text: string): Partial<Receipt> {
  const parsed = parseEmailRaw(text);
  if (parsed) {
    return {
      vendor: parsed.vendor,
      totalUsd: parsed.totalUsd,
      currency: parsed.currency,
      totalOriginal: parsed.totalOriginal,
      date: parsed.date,
      category:
        parsed.type === "restaurant"
          ? "food"
          : parsed.type === "hotel"
            ? "lodging"
            : parsed.type === "flight" || parsed.type === "train" || parsed.type === "car"
              ? "transport"
              : parsed.type === "activity"
                ? "activity"
                : "other",
    };
  }
  // Fall back to raw extraction when the wallet parser doesn't hit.
  const dateMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const totalMatch = text.match(/\$?(\d{1,5}\.\d{2})/);
  return {
    vendor: text.split(/\n|,/)[0]?.slice(0, 60),
    totalUsd: totalMatch ? parseFloat(totalMatch[1]) : undefined,
    date: dateMatch ? dateMatch[1] : new Date().toISOString().slice(0, 10),
    category: "other",
  };
}

// Mock OCR: turn a File into a synthetic receipt by reading the filename + a
// random subset of nearby wallet items. Real Tesseract.js integration would
// replace the body of this function — same return type.
export async function ocrReceipt(file: File): Promise<Partial<Receipt>> {
  await new Promise((r) => setTimeout(r, 600));
  const reader = await new Promise<string | null>((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : null);
    fr.onerror = () => resolve(null);
    fr.readAsDataURL(file);
  });
  const wallet = loadConfirmations();
  const candidate = wallet.find(
    (c) => c.totalUsd != null && /restaurant|food|cafe/i.test(c.vendor + c.title)
  );
  return {
    vendor: candidate?.vendor ?? guessVendorFromFilename(file.name),
    totalUsd: candidate?.totalUsd ?? roundToCents(20 + Math.random() * 60),
    date: new Date().toISOString().slice(0, 10),
    category: "food",
    imageDataUrl: reader ?? undefined,
  };
}

function guessVendorFromFilename(name: string): string {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40) || "Receipt";
}

function roundToCents(n: number): number {
  return Math.round(n * 100) / 100;
}
