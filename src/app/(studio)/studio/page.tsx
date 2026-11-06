import { Suspense } from "react";
import { StudioWorkspace } from "@/components/studio/studio-workspace";

export const metadata = { title: "TwinFIT 3D Studio" };

export default function StudioPage() {
  return (
    <Suspense>
      <StudioWorkspace />
    </Suspense>
  );
}
