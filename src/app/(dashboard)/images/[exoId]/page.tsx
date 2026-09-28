import { ExerciseImageWorkspace } from "@/components/images/exercise-image-workspace";

export default async function ExerciseImagePage({
  params,
}: {
  params: Promise<{ exoId: string }>;
}) {
  const { exoId: raw } = await params;
  const exoId = Number(raw);
  if (!Number.isFinite(exoId)) {
    return <div className="text-sm text-red-600">Invalid exercise id</div>;
  }
  return <ExerciseImageWorkspace exoId={exoId} />;
}
