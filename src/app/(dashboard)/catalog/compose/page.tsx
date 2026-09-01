"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ExerciseComposeForm } from "@/components/catalog/exercise-compose-form";
import { parseFromPath } from "@/lib/catalog/exercise-path";

function ComposeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editExoId = searchParams.get("exo_id");
  const fromPathRaw = searchParams.get("from_path");

  const createFromSelection = fromPathRaw
    ? (() => {
        const path = parseFromPath(fromPathRaw);
        if (!path.length) return undefined;
        return {
          muscle_group: path[0],
          movement_type: path[1],
          equipment: path[2],
          position: path[3],
          grip: path[4],
          variation: path[5],
          load_modality: path[6],
        };
      })()
    : undefined;

  return (
    <ExerciseComposeForm
      editExoId={editExoId ? Number(editExoId) : null}
      createFromSelection={createFromSelection}
      onSuccess={() => router.push("/catalog")}
      onCancel={() => router.push("/catalog")}
    />
  );
}

export default function CatalogComposePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Compose exercise</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Create or edit a system catalog exercise.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading form…</p>}>
        <ComposeForm />
      </Suspense>
      <Link href="/catalog" className="text-sm underline">
        Back to catalog
      </Link>
    </div>
  );
}
