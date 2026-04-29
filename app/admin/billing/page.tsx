// app/admin/billing/page.tsx — STUB owned by Track 5 (Billing).
//
// TRACK 9 INTEGRATION
//   When Track 5 adds /admin/billing/[customerId]/page.tsx it should pass
//     <AdminCopilot context={{ page: "billing", customerId }} />
//   so the copilot defaults to that customer's revenue + churn signals.

import { ComingSoon } from "../_components/ComingSoon";
import AdminCopilot from "@/components/AdminCopilot";

export default function BillingPlaceholder() {
  return (
    <>
      <ComingSoon track={5} title="Billing" />
      <AdminCopilot context={{ page: "billing" }} />
    </>
  );
}
