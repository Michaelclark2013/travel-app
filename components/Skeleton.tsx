"use client";

// Reusable skeleton primitives. Reuses the existing `.shimmer` keyframe in
// globals.css so loading states feel consistent across the app.

export function SkeletonRow({ className = "" }: { className?: string }) {
  return (
    <div
      className={`shimmer rounded-md bg-[var(--card-strong)] ${className}`}
      aria-hidden
    />
  );
}

export function SkeletonFlightCard() {
  return (
    <div className="steel p-5 flex items-center gap-6">
      <div className="h-12 w-12 shrink-0 shimmer bg-[var(--card-strong)]" />
      <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
        <SkeletonRow className="h-3 w-16" />
        <SkeletonRow className="h-3 w-24" />
        <SkeletonRow className="h-3 w-20" />
        <SkeletonRow className="h-3 w-20" />
      </div>
      <div className="text-right space-y-2 shrink-0">
        <SkeletonRow className="h-6 w-16 ml-auto" />
        <SkeletonRow className="h-3 w-12 ml-auto" />
      </div>
    </div>
  );
}

export function SkeletonHotelCard() {
  return (
    <div className="steel overflow-hidden">
      <div className="h-40 w-full shimmer bg-[var(--card-strong)]" />
      <div className="p-5 space-y-3">
        <SkeletonRow className="h-4 w-2/3" />
        <SkeletonRow className="h-3 w-1/3" />
        <SkeletonRow className="h-3 w-1/2" />
      </div>
    </div>
  );
}

export function SkeletonList({
  count = 4,
  variant,
}: {
  count?: number;
  variant: "flight" | "hotel" | "row";
}) {
  return (
    <div
      className={
        variant === "hotel"
          ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          : "space-y-3"
      }
    >
      {Array.from({ length: count }).map((_, i) =>
        variant === "flight" ? (
          <SkeletonFlightCard key={i} />
        ) : variant === "hotel" ? (
          <SkeletonHotelCard key={i} />
        ) : (
          <SkeletonRow key={i} className="h-12" />
        )
      )}
    </div>
  );
}
