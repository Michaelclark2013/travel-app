// app/admin/users/page.tsx — STUB owned by Track 2 (User management).
//
// WHAT
//   Placeholder page. Track 2 will replace this with the user search /
//   suspend / impersonate / delete UI.
//
// WHY this exists in Track 1's commit
//   So that the admin nav links from app/admin/_components/AdminShell.tsx
//   compile against real routes. Track 2 should overwrite the file.
//
// TRACK 9 INTEGRATION
//   The Track 9 AdminCopilot is mounted here with a page-scoped context. When
//   Track 2 adds /admin/users/[id]/page.tsx it should pass
//     <AdminCopilot context={{ page: "users", userId }} />
//   so the copilot can default RPC calls to that user. The launcher button
//   below the fold gets the keybinding wiring (cmd-period) for free.
//
// ENV VARS
//   None.

import { ComingSoon } from "../_components/ComingSoon";
import AdminCopilot from "@/components/AdminCopilot";

export default function UsersPlaceholder() {
  return (
    <>
      <ComingSoon track={2} title="Users" />
      <AdminCopilot context={{ page: "users" }} />
    </>
  );
}
