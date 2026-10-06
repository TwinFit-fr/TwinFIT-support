import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MuscleMapWorkspace } from "@/components/images/muscle-maps/muscle-map-workspace";
import { muscleMapKindOf } from "@/lib/images/urls";

export default async function MuscleMapPage({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind: segment, id } = await params;
  const kind = muscleMapKindOf(segment);
  if (!kind) notFound();
  return (
    <Suspense>
      <MuscleMapWorkspace target={{ kind, id }} />
    </Suspense>
  );
}
