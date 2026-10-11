"use client";

import { useState } from "react";
import { mutate } from "swr";
import { Badge, Button } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import { FRAME_POSITIONS, MID_POSITION } from "@/lib/images/types";
import type { ExercisePose } from "@/lib/images/types";
import { cn } from "@/lib/utils";

export const posesKey = (exoId: number) => `/api/images/exercises/${exoId}/poses`;

function PoseField({
  label,
  saved,
  greyed,
  busy,
  onSave,
}: {
  label: string;
  saved: ExercisePose | undefined;
  /** Mid of a two-frame exercise: kept and editable, but never drawn. */
  greyed: boolean;
  busy: boolean;
  onSave: (pose: string, status: "approved") => Promise<void>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? saved?.pose ?? "";
  const dirty = draft != null && draft !== (saved?.pose ?? "");
  const approved = saved?.status === "approved";

  async function save() {
    await onSave(text, "approved");
    setDraft(null);
  }

  return (
    <div className={cn("space-y-1", greyed && "opacity-50")}>
      <div className="flex items-center justify-between gap-2 text-xs font-medium text-zinc-600">
        <span>
          {label}
          {greyed && <span className="ml-2 font-normal text-zinc-400">not drawn (two frames)</span>}
        </span>
        {saved ? (
          <Badge
            className={
              approved ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
            }
          >
            {dirty ? "edited" : saved.status}
          </Badge>
        ) : (
          <Badge>no pose · uses description</Badge>
        )}
      </div>
      <textarea
        value={text}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        className={cn(
          "min-h-32 w-full rounded-md border px-3 py-2 text-xs",
          dirty ? "border-amber-300 bg-amber-50/40" : "border-zinc-300",
        )}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-zinc-400">
          {saved?.model ? `Written by ${saved.model}` : saved ? "Written by hand" : ""}
        </span>
        <div className="flex gap-2">
          {dirty && (
            <Button variant="ghost" disabled={busy} onClick={() => setDraft(null)}>
              Reset
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={busy || !text.trim() || (!dirty && approved)}
            onClick={() => void save()}
          >
            {dirty ? "Save & approve" : "Approve"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Start / Mid / End poses of an exercise: injected as `{pose}` in the frame prompts. */
export function ExercisePosesPanel({
  exoId,
  twoFrames,
}: {
  exoId: number;
  twoFrames: boolean;
}) {
  const staffFetch = useStaffFetch();
  const { success, error: toastError } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { data } = useStaffSWR<{ poses: ExercisePose[] }>(posesKey(exoId));
  const poses = data?.poses ?? [];
  const pending = poses.filter((p) => p.status !== "approved").length;

  async function save(position: number, pose: string, status: "approved") {
    setBusy(true);
    try {
      const res = await staffFetch(posesKey(exoId), {
        method: "PUT",
        body: JSON.stringify({ position, pose, status }),
      });
      await mutate(posesKey(exoId), res, { revalidate: false });
      success("Pose approved");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function regenerate() {
    setBusy(true);
    try {
      const res = await staffFetch(posesKey(exoId), { method: "POST" });
      await mutate(posesKey(exoId), res, { revalidate: false });
      success("Poses regenerated");
    } catch (err) {
      toastError(err instanceof Error ? err.message : "Regeneration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-sm font-medium text-zinc-800"
        >
          Poses
          <span className="ml-2 text-xs font-normal text-zinc-400">
            {poses.length === 0
              ? "none yet · prompts use the description"
              : pending > 0
                ? `${pending} to review`
                : "all approved"}
          </span>
        </button>
        <div className="flex gap-2">
          {open && (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void regenerate()}
              title="Overwrites the three poses, including approved ones"
            >
              Regenerate poses
            </Button>
          )}
          <Button variant="ghost" onClick={() => setOpen((v) => !v)}>
            {open ? "Hide" : "Show"}
          </Button>
        </div>
      </div>
      {open && (
        <div className="grid gap-3 lg:grid-cols-3">
          {FRAME_POSITIONS.map((frame) => (
            <PoseField
              key={`${exoId}-${frame.id}-${poses.find((p) => p.position === frame.id)?.updated_at}`}
              label={frame.label}
              saved={poses.find((p) => p.position === frame.id)}
              greyed={twoFrames && frame.id === MID_POSITION}
              busy={busy}
              onSave={(pose, status) => save(frame.id, pose, status)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
