import { Suspense } from "react";
import { ScorecardClient } from "./ScorecardClient";

export default function ScorecardPage() {
  return (
    <Suspense
      fallback={
        <div className="h-64 animate-pulse rounded-2xl bg-neutral-100" />
      }
    >
      <ScorecardClient />
    </Suspense>
  );
}
