"use client";

// Image upload abstraction. When Supabase is configured we push to the
// `moments` bucket and return its public URL; otherwise we keep the bytes as
// a data URI on the device. Memory.imageDataUri / filteredDataUri can hold
// either — consumers don't need to care.
//
// Wired by lib/memory-roll.ts:keepMemory — when the user keeps a moment, we
// upload the filtered image then write the public URL back into the local
// Memory record (replacing the heavy data URI). The `moments` bucket is
// declared in supabase/migrations/0003_social.sql with RLS that scopes
// writes to `<userId>/...` paths, which is why `userId` is the first folder
// segment below.
//
// TODO(track-a): Memory now supports an optional `videoUri` (Reels-style).
// Today the capture page stores it as a transient `URL.createObjectURL(blob)`
// — fine for the current session, lost on reload. When you wire up the video
// bucket migration, add an `uploadMomentVideo(blob, userId, key)` here that
// mirrors `uploadMomentImage` but writes to a `moments-video` bucket with
// content-type from the recorder's mimeType. The capture page expects an
// `(blob, userId, key) => Promise<UploadResult>` shape so swapping in is a
// 3-line change there.

import { supabase, supabaseEnabled } from "./supabase";

export type UploadResult =
  | { ok: true; url: string; storage: "supabase" | "data-uri" }
  | { ok: false; error: string };

/**
 * @param dataUri — JPEG/PNG data: URI from a canvas or FileReader
 * @param userId  — auth.users.id (used as the storage folder for RLS)
 * @param key     — short ID; combined with userId to form the storage path
 */
export async function uploadMomentImage(
  dataUri: string,
  userId: string,
  key: string
): Promise<UploadResult> {
  if (!supabaseEnabled || !supabase) {
    return { ok: true, url: dataUri, storage: "data-uri" };
  }

  try {
    const blob = await dataUriToBlob(dataUri);
    const ext = blob.type === "image/png" ? "png" : "jpg";
    const path = `${userId}/${key}.${ext}`;
    const { error } = await supabase.storage
      .from("moments")
      .upload(path, blob, {
        contentType: blob.type,
        cacheControl: "31536000",
        upsert: true,
      });
    if (error) return { ok: false, error: error.message };
    const { data } = supabase.storage.from("moments").getPublicUrl(path);
    return { ok: true, url: data.publicUrl, storage: "supabase" };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Upload failed",
    };
  }
}

async function dataUriToBlob(uri: string): Promise<Blob> {
  if (uri.startsWith("blob:")) {
    const r = await fetch(uri);
    return r.blob();
  }
  const m = uri.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("Not a data URI");
  const mime = m[1];
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
