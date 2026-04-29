// lib/zip.ts — store-only ZIP encoder. Pure JS, zero deps.
//
// WHAT
//   buildZip(files): packs an array of {name, data} entries into a single ZIP
//   buffer using STORE (no compression). Sufficient for DSAR exports because
//   the contents are already JSON text and the bundle is downloaded once.
//
// WHY hand-rolled
//   - Avoid adding a dependency for a feature that needs ~50 lines of byte
//     pushing.
//   - Strict store-only keeps the on-disk format trivially decodable by any
//     unzip(1) and removes a class of compression-engine bugs.
//
// FORMAT
//   See APPNOTE.TXT (PKWARE) §4.3 — local file header, file data, and the
//   central directory + end-of-central-directory record at the end.

// ---------------------------------------------------------------------------
// CRC-32 (IEEE 802.3 polynomial 0xedb88320) — required by the ZIP spec.
// ---------------------------------------------------------------------------
const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------------------
// Helpers — emit little-endian uint16/uint32 directly into a Uint8Array.
// ---------------------------------------------------------------------------
function u16(buf: number[], v: number): void {
  buf.push(v & 0xff, (v >>> 8) & 0xff);
}
function u32(buf: number[], v: number): void {
  buf.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
}

export type ZipEntry = { name: string; data: Uint8Array };

export function buildZip(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  // DOS time = midnight 2026-01-01 (good enough — auditors don't care).
  const dosTime = 0;
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;

  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const crc = crc32(e.data);
    const size = e.data.length;

    // ---- Local file header: signature 0x04034b50 ----
    const lfh: number[] = [];
    u32(lfh, 0x04034b50);
    u16(lfh, 20);                 // version needed
    u16(lfh, 0);                  // flags
    u16(lfh, 0);                  // STORE
    u16(lfh, dosTime);
    u16(lfh, dosDate);
    u32(lfh, crc);
    u32(lfh, size);               // compressed size
    u32(lfh, size);               // uncompressed size
    u16(lfh, nameBytes.length);
    u16(lfh, 0);                  // extra length
    const lfhBytes = new Uint8Array(lfh);
    localChunks.push(lfhBytes, nameBytes, e.data);

    // ---- Central dir entry: signature 0x02014b50 ----
    const cd: number[] = [];
    u32(cd, 0x02014b50);
    u16(cd, 20);                  // version made by
    u16(cd, 20);                  // version needed
    u16(cd, 0);                   // flags
    u16(cd, 0);                   // STORE
    u16(cd, dosTime);
    u16(cd, dosDate);
    u32(cd, crc);
    u32(cd, size);
    u32(cd, size);
    u16(cd, nameBytes.length);
    u16(cd, 0);                   // extra
    u16(cd, 0);                   // comment
    u16(cd, 0);                   // disk number
    u16(cd, 0);                   // internal attrs
    u32(cd, 0);                   // external attrs
    u32(cd, offset);              // local header offset
    centralChunks.push(new Uint8Array(cd), nameBytes);

    offset += lfhBytes.length + nameBytes.length + e.data.length;
  }

  // Concatenate central directory chunks to compute its size.
  const cdParts = centralChunks;
  const cdSize = cdParts.reduce((s, c) => s + c.length, 0);
  const cdOffset = offset;

  // ---- End of central dir: signature 0x06054b50 ----
  const eocd: number[] = [];
  u32(eocd, 0x06054b50);
  u16(eocd, 0);                   // disk
  u16(eocd, 0);                   // start disk
  u16(eocd, entries.length);      // entries on this disk
  u16(eocd, entries.length);      // total entries
  u32(eocd, cdSize);
  u32(eocd, cdOffset);
  u16(eocd, 0);                   // comment length

  // Stitch everything into one buffer.
  const total =
    localChunks.reduce((s, c) => s + c.length, 0) + cdSize + eocd.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of localChunks) { out.set(c, p); p += c.length; }
  for (const c of cdParts) { out.set(c, p); p += c.length; }
  out.set(new Uint8Array(eocd), p);
  return out;
}

export function jsonEntry(name: string, value: unknown): ZipEntry {
  return { name, data: new TextEncoder().encode(JSON.stringify(value, null, 2)) };
}
