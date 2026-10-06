import { Suspense } from "react";
import { MuscleMapBoard } from "@/components/images/muscle-maps/muscle-map-board";

export default function MuscleMapsPage() {
  return (
    <Suspense>
      <MuscleMapBoard />
    </Suspense>
  );
}
