// app/api/admin/compliance/export/[requestId]/run/route.ts — Track 8.
//
// POST: build a ZIP archive of the user's data, upload to Storage 'exports',
// generate a 7-day signed URL, mark the DSAR row 'fulfilled', and email the
// link to the user via Resend.

import { audit } from "@/lib/admin/audit";
import { requirePerm } from "@/lib/admin/rbac";
import { sendEmail } from "@/lib/email";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { buildZip, jsonEntry, type ZipEntry } from "@/lib/zip";

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ requestId: string }> }
) {
  await requirePerm(req, "compliance.action");
  const { requestId } = await ctx.params;
  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json({ ok: false, error: "Supabase not configured." }, { status: 503 });
  }

  const { data: dsar, error: dsarErr } = await supa
    .from("dsar_requests")
    .select("id, user_id, kind, status")
    .eq("id", requestId)
    .maybeSingle();
  if (dsarErr || !dsar) {
    return Response.json({ ok: false, error: "DSAR not found" }, { status: 404 });
  }
  if (dsar.kind !== "export") {
    return Response.json({ ok: false, error: "Wrong kind — use erasure handler" }, { status: 400 });
  }

  const userId: string = dsar.user_id;

  return audit(
    "compliance.export.run",
    { kind: "dsar", id: requestId },
    { before: { status: dsar.status }, after: { status: "fulfilled" } },
    async () => {
      // 1. Mark processing.
      await supa.from("dsar_requests").update({ status: "processing" }).eq("id", requestId);

      // 2. Pull every user-owned dataset using the service role.
      const [
        profile,
        profilePub,
        trips,
        moments,
        likes,
        saves,
        comments,
        reposts,
        follows,
        dms,
        consent,
        wallet,
      ] = await Promise.all([
        supa.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
        supa.from("profiles_public").select("*").eq("user_id", userId).maybeSingle(),
        supa.from("trips").select("*").eq("user_id", userId),
        supa.from("moments").select("*").eq("user_id", userId),
        supa.from("likes").select("*").eq("user_id", userId),
        supa.from("saves").select("*").eq("user_id", userId),
        supa.from("comments").select("*").eq("author_id", userId),
        supa.from("reposts").select("*").eq("user_id", userId),
        supa
          .from("follows")
          .select("*")
          .or(`follower_id.eq.${userId},followee_id.eq.${userId}`),
        supa.from("dm_messages").select("*").eq("from_user_id", userId),
        supa.from("cookie_consents").select("*").eq("user_id", userId).maybeSingle(),
        supa.from("wallet_items").select("*").eq("user_id", userId),
      ]);

      // Audit references — IDs only, no other admins' actions, just rows
      // *about* this user. The compliance brief asks for a marker that an
      // audit trail exists, not the trail itself.
      const auditRefs = await supa
        .from("admin_audit")
        .select("id, action, ts")
        .eq("target_kind", "user")
        .eq("target_id", userId);

      const userInfo = await supa.auth.admin.getUserById(userId).catch(() => null);

      const entries: ZipEntry[] = [
        jsonEntry("README.txt", {
          summary: "Voyage data export. Generated for DSAR " + requestId,
          generatedAt: new Date().toISOString(),
          user: { id: userId, email: userInfo?.data.user?.email ?? null },
        }),
        jsonEntry("profile.json", { profile: profile.data, profilePublic: profilePub.data }),
        jsonEntry("trips.json", trips.data ?? []),
        jsonEntry("moments.json", moments.data ?? []),
        jsonEntry("likes.json", likes.data ?? []),
        jsonEntry("saves.json", saves.data ?? []),
        jsonEntry("comments.json", comments.data ?? []),
        jsonEntry("reposts.json", reposts.data ?? []),
        jsonEntry("follows.json", follows.data ?? []),
        jsonEntry("messages.json", dms.data ?? []),
        jsonEntry("consent.json", consent.data),
        jsonEntry("wallet.json", wallet.data ?? []),
        jsonEntry("audit-references.json", auditRefs.data ?? []),
      ];
      const zipBytes = buildZip(entries);

      // 3. Upload to Storage 'exports' bucket. The bucket is private; access
      //    only happens through the signed URL we'll generate next.
      const path = `${userId}/${requestId}.zip`;
      const { error: uploadErr } = await supa.storage
        .from("exports")
        .upload(path, zipBytes, {
          contentType: "application/zip",
          upsert: true,
        });
      if (uploadErr) {
        await supa
          .from("dsar_requests")
          .update({ status: "rejected", notes: "Upload failed: " + uploadErr.message })
          .eq("id", requestId);
        throw new Error("Storage upload failed: " + uploadErr.message);
      }

      // 4. Sign for 7 days.
      const { data: signed, error: signErr } = await supa.storage
        .from("exports")
        .createSignedUrl(path, SEVEN_DAYS_SECONDS);
      if (signErr || !signed) {
        throw new Error("Sign URL failed: " + (signErr?.message ?? "unknown"));
      }

      // 5. Mark fulfilled with link + expiry.
      const expiresAt = new Date(Date.now() + SEVEN_DAYS_SECONDS * 1000).toISOString();
      await supa
        .from("dsar_requests")
        .update({
          status: "fulfilled",
          fulfilled_at: new Date().toISOString(),
          expires_at: expiresAt,
          download_url: signed.signedUrl,
        })
        .eq("id", requestId);

      // 6. Email the user.
      const email = userInfo?.data.user?.email;
      if (email) {
        await sendEmail({
          to: email,
          subject: "Your Voyage data export is ready",
          html: `<p>Your data export is ready to download. The link expires on
                 ${new Date(expiresAt).toLocaleString()}.</p>
                 <p><a href="${signed.signedUrl}">Download your archive</a></p>
                 <p>If you didn't request this, please contact privacy@voyage.app immediately.</p>`,
          text: `Your data export is ready: ${signed.signedUrl} (expires ${expiresAt}).`,
        });
      }

      return Response.json({ ok: true, downloadUrl: signed.signedUrl, expiresAt });
    }
  );
}
