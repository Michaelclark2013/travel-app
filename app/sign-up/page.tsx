"use client";

// Sign-up is bypassed in v1 — forwards into the same auto-launch flow used
// by /sign-in. Real signup form lives in git history.

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function Forward() {
  const router = useRouter();
  const search = useSearchParams();
  useEffect(() => {
    const next = search.get("next") || "/plan";
    router.replace(`/sign-in?next=${encodeURIComponent(next)}`);
  }, [router, search]);
  return null;
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Forward />
    </Suspense>
  );
}
