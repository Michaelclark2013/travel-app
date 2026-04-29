import { Resend } from "resend";

const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM ?? "Voyage <hello@voyage.app>";

const client = KEY ? new Resend(KEY) : null;

export const emailEnabled = !!client;

export type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export async function sendEmail(
  args: SendArgs
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!client) {
    return { ok: false, error: "Email not configured (RESEND_API_KEY)" };
  }
  const res = await client.emails.send({
    from: FROM,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text,
  });
  if (res.error) {
    return { ok: false, error: res.error.message };
  }
  return { ok: true, id: res.data?.id ?? "" };
}

// Preset templates so callers don't reinvent the wheel.
export function tripSharedEmail(to: string, sharerName: string, tripName: string, link: string) {
  return sendEmail({
    to,
    subject: `${sharerName} shared a trip with you on Voyage`,
    html: `<p>${escapeHtml(sharerName)} shared their trip — <strong>${escapeHtml(tripName)}</strong> — with you.</p>
           <p><a href="${link}">View it on Voyage →</a></p>`,
    text: `${sharerName} shared their trip "${tripName}" with you. ${link}`,
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!;
  });
}
