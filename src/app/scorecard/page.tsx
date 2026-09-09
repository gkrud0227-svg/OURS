import { Suspense } from "react";
import { ScorecardClient } from "./ScorecardClient";

export default function ScorecardPage() {
  return (
    <Suspense
      fallback={
        <div className="h-64 animate-pulse rounded-[5px] bg-neutral-100" />
      }
    >
      <ScorecardClient />
    </Suspense>
  );
}
