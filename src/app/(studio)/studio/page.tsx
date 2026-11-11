import { Suspense } from "react";
import { StudioBootSkeleton } from "@/components/studio/shell/boot-skeleton";
import { StudioWorkspace } from "@/components/studio/studio-workspace";

export const metadata = { title: "TwinFIT 3D Studio" };

export default function StudioPage() {
  return (
    <Suspense fallback={<StudioBootSkeleton label="Opening the workspace…" />}>
      <StudioWorkspace />
    </Suspense>
  );
}
