// app/admin/inbox/page.tsx — STUB owned by Track 7 (Support inbox).
//
// TRACK 9 INTEGRATION
//   When Track 7 adds /admin/inbox/[ticketId]/page.tsx it should pass
//     <AdminCopilot context={{ page: "inbox", ticketId }} />
//   so the copilot defaults to that ticket's subject + history.

import { ComingSoon } from "../_components/ComingSoon";
import AdminCopilot from "@/components/AdminCopilot";

export default function InboxPlaceholder() {
  return (
    <>
      <ComingSoon track={7} title="Inbox" />
      <AdminCopilot context={{ page: "inbox" }} />
    </>
  );
}
