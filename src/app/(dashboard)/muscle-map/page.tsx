import { Suspense } from "react";
import { MuscleMapPage } from "@/components/muscle-map/muscle-map-page";

export default function MuscleMapRoute() {
  return (
    <Suspense>
      <MuscleMapPage />
    </Suspense>
  );
}
