// /inspire was the legacy "destination ideas" surface. The new social /explore
// page replaces it. This redirect keeps old links + bookmarks valid.

import { redirect } from "next/navigation";

export default function InspirePage() {
  redirect("/explore");
}
