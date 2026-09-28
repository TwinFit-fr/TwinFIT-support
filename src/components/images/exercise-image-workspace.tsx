"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { mutate } from "swr";
import { Button, Input, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import { usePresetState } from "@/hooks/use-generation-queue";
import type { ExerciseImage, ExerciseImageDetail } from "@/lib/images/types";
import { FRAME_POSITIONS } from "@/lib/images/types";
import { gifPlaybackOrder, imageDisplayUrl } from "@/lib/images/urls";
import { cn } from "@/lib/utils";

function CheckerFrame({
  src,
  alt,
  label,
}: {
  src: string | null;
  alt: string;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</div>
      <div
        className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100"
        style={{
          backgroundImage:
            "linear-gradient(45deg,#e4e4e7 25%,transparent 25%),linear-gradient(-45deg,#e4e4e7 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e4e4e7 75%),linear-gradient(-45deg,transparent 75%,#e4e4e7 75%)",
          backgroundSize: "18px 18px",
          backgroundPosition: "0 0,0 9px,9px -9px,-9px 0",
        }}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-sm text-zinc-400">Empty</span>
        )}
      </div>
    </div>
  );
}

function SequencePreview({ images }: { images: ExerciseImage[] }) {
  const active = images
    .filter((img) => img.active && img.position != null)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const byPos = new Map(active.map((img) => [img.position as number, img]));
  const order = gifPlaybackOrder(active.map((img) => img.position as number));
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (order.length < 2) return;
    const timer = window.setInterval(() => {
      setFrame((i) => (i + 1) % order.length);
    }, 450);
    return () => window.clearInterval(timer);
  }, [order.join(",")]);

  const current = byPos.get(order[frame] ?? -1) ?? null;

  return (
    <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-zinc-800">GIF preview (0→1→2→1→0)</div>
        <div className="text-xs text-zinc-500">
          {active.length}/3 active · order {order.join("→") || "—"}
        </div>
      </div>
      <CheckerFrame
        src={imageDisplayUrl(current?.image_url)}
        alt="Sequence preview"
        label={current ? `Position ${current.position}` : "Need active frames"}
      />
    </div>
  );
}

export function ExerciseImageWorkspace({ exoId }: { exoId: number }) {
  const router = useRouter();
  const staffFetch = useStaffFetch();
  const { success, error: toastError } = useToast();
  const [preset] = usePresetState();
  const { data, isLoading, error } = useStaffSWR<{ exercise: ExerciseImageDetail }>(
    `/api/images/exercises/${exoId}`,
    { refreshInterval: 5000 },
  );
  const exercise = data?.exercise;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (!exercise) return;
    setSelectedId((current) => {
      if (current && exercise.images.some((img) => img.id === current)) return current;
      return exercise.images[0]?.id ?? null;
    });
  }, [exercise]);

  const selected: ExerciseImage | null = useMemo(
    () => exercise?.images.find((img) => img.id === selectedId) ?? null,
    [exercise, selectedId],
  );

  const activeByPosition = useMemo(() => {
    const map = new Map<number, ExerciseImage>();
    for (const img of exercise?.images ?? []) {
      if (img.active && img.position != null) map.set(img.position, img);
    }
    return map;
  }, [exercise]);

  const refresh = useCallback(async () => {
    await mutate(`/api/images/exercises/${exoId}`);
    await mutate("/api/images/exercises");
  }, [exoId]);

  async function runGenerate(mode: "generate" | "refine") {
    if (!exercise) return;
    setBusy(true);
    try {
      await staffFetch("/api/images/generate", {
        method: "POST",
        body: JSON.stringify({
          exoId: exercise.exo_id,
          mode,
          sourceImageId: mode === "refine" ? selected?.id : null,
          instruction: mode === "refine" ? instruction : null,
          systemPromptId: preset.systemPromptId,
          exercisePromptId: preset.exercisePromptId,
          params: {
            model: preset.model,
            shape: preset.shape,
            size: preset.size,
            background: preset.background,
            format: preset.format,
            quality: preset.quality,
          },
        }),
      });
      success(mode === "refine" ? "Refine finished" : "Image generated");
      setInstruction("");
      await refresh();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  async function setPosition(imageId: string, position: number | null, active: boolean) {
    setBusy(true);
    try {
      await staffFetch(`/api/images/items/${imageId}`, {
        method: "PATCH",
        body: JSON.stringify({ position, active }),
      });
      success(active ? `Active at position ${position}` : "Deactivated");
      await refresh();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeImage() {
    if (!selected) return;
    if (!window.confirm("Delete this image permanently?")) return;
    setBusy(true);
    try {
      await staffFetch(`/api/images/items/${selected.id}`, { method: "DELETE" });
      success("Image deleted");
      setSelectedId(null);
      await refresh();
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        void runGenerate("generate");
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        void removeImage();
      } else if (event.key === "0" || event.key === "1" || event.key === "2") {
        if (!selected) return;
        event.preventDefault();
        void setPosition(selected.id, Number(event.key), true);
      } else if (event.key === "x" || event.key === "X") {
        if (!selected) return;
        event.preventDefault();
        void setPosition(selected.id, null, false);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        if (!exercise?.images.length) return;
        const index = exercise.images.findIndex((img) => img.id === selectedId);
        const next =
          event.key === "ArrowLeft"
            ? Math.max(0, index - 1)
            : Math.min(exercise.images.length - 1, index + 1);
        setSelectedId(exercise.images[next]?.id ?? null);
      } else if (event.key === "[") {
        router.push(`/images/${Math.max(1, exoId - 1)}`);
      } else if (event.key === "]") {
        router.push(`/images/${exoId + 1}`);
      } else if (event.key === "Escape") {
        router.push("/images");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise, selectedId, selected, exoId, instruction, busy]);

  if (isLoading) {
    return <Skeleton className="h-[70vh] w-full rounded-xl" />;
  }
  if (error || !exercise) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
        {error?.message ?? "Exercise not found"}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 text-xs text-zinc-500">
            <Link href="/images" className="hover:underline">
              Images
            </Link>{" "}
            / #{exercise.exo_id}
          </div>
          <h1 className="text-xl font-semibold text-zinc-900">{exercise.display_name}</h1>
          <p className="text-sm text-zinc-500">
            {exercise.primary_muscle_group?.name ?? "—"} · {exercise.equipment?.name ?? "—"} ·{" "}
            {exercise.active_count}/3 active frames
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void runGenerate("generate")}>
            Generate
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={busy || !selected}
            onClick={() => void removeImage()}
          >
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {FRAME_POSITIONS.map((frame) => {
          const img = activeByPosition.get(frame.id) ?? null;
          return (
            <CheckerFrame
              key={frame.id}
              src={imageDisplayUrl(img?.image_url)}
              alt={`${frame.label} frame`}
              label={`${frame.id} · ${frame.label}`}
            />
          );
        })}
        <SequencePreview images={exercise.images} />
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium text-zinc-800">All images</div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {exercise.images.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setSelectedId(img.id)}
              className={cn(
                "min-w-[120px] rounded-lg border p-2 text-left",
                selectedId === img.id
                  ? "border-zinc-900 ring-1 ring-zinc-900"
                  : "border-zinc-200 hover:border-zinc-300",
              )}
            >
              <div
                className="mb-2 aspect-square overflow-hidden rounded-md bg-zinc-100"
                style={{
                  backgroundImage:
                    "linear-gradient(45deg,#e4e4e7 25%,transparent 25%),linear-gradient(-45deg,#e4e4e7 25%,transparent 25%)",
                  backgroundSize: "12px 12px",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.image_url}
                  alt=""
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="truncate text-[11px] font-medium text-zinc-800">
                {img.active ? `Pos ${img.position}` : "Inactive"}
              </div>
              <div className="truncate text-[10px] text-zinc-500">{img.model}</div>
            </button>
          ))}
          {exercise.images.length === 0 && (
            <div className="text-sm text-zinc-500">No images yet. Generate one.</div>
          )}
        </div>
      </div>

      {selected && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
          <div className="text-sm font-medium text-zinc-800">Selected image</div>
          <div className="flex flex-wrap gap-2">
            {FRAME_POSITIONS.map((frame) => (
              <Button
                key={frame.id}
                type="button"
                variant={selected.active && selected.position === frame.id ? "default" : "secondary"}
                disabled={busy}
                onClick={() => void setPosition(selected.id, frame.id, true)}
              >
                Set {frame.label} ({frame.id})
              </Button>
            ))}
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !selected.active}
              onClick={() => void setPosition(selected.id, null, false)}
            >
              Deactivate
            </Button>
          </div>
          <p className="text-xs text-zinc-500">
            Activating a position replaces any other active image already at that slot.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-4">
          <div className="text-sm font-medium text-zinc-800">Refine</div>
          <Input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. Make the elbows more bent"
          />
          <Button
            type="button"
            variant="secondary"
            disabled={busy || !selected || !instruction.trim()}
            onClick={() => void runGenerate("refine")}
          >
            Refine selected
          </Button>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <button
            type="button"
            className="text-sm font-medium text-zinc-800"
            onClick={() => setShowPrompt((v) => !v)}
          >
            {showPrompt ? "Hide" : "Show"} assembled prompt
          </button>
          {showPrompt && (
            <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700">
              {selected?.prompt || exercise.assembled_prompt}
            </pre>
          )}
          {exercise.description && (
            <p className="mt-3 text-sm text-zinc-600">{exercise.description}</p>
          )}
        </div>
      </div>

      <p className="text-xs text-zinc-400">
        Shortcuts: R generate · 0/1/2 set position · X deactivate · Del delete · ←/→ images · [/]
        prev/next · Esc back
      </p>
    </div>
  );
}
