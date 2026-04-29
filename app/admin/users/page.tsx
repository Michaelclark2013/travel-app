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
// ENV VARS
//   None.

import { ComingSoon } from "../_components/ComingSoon";

export default function UsersPlaceholder() {
  return <ComingSoon track={2} title="Users" />;
}
