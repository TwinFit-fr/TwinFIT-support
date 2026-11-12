// One queue / history row of the inspector, with the actions its status allows.
"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Clock3, Loader2, OctagonX, PenLine, RotateCw, Trash2, Upload } from "lucide-react";
import { relativeTime } from "@/lib/studio/format";
import type { MovementVector } from "@/lib/studio/types";
import { VECTOR_STATUS_LABEL } from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import { ClipProblemNote } from "./clip-problem-note";
import { useClipProblem } from "./hooks/use-clip-problems";
import { Chip, IconButton, M3Button, StatusDot, TextArea } from "./ui";

/** stop = mark a queued / running row failed; prompt = change a queued row's prompt (payload: the text). */
export type VectorAction = "activate" | "deactivate" | "requeue" | "upload" | "delete" | "edit" | "stop" | "prompt";

/** One queue / history entry with the actions its status allows. */
export function VectorRow({
  vector,
  selected,
  busy,
  onSelect,
  onEdit,
  onAction,
}: {
  vector: MovementVector;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  /** The edit control: a pose clip opens in the editor, a capture as key poses. */
  onEdit: () => void;
  onAction: (action: VectorAction, payload?: File | string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [promptText, setPromptText] = useState(vector.prompt);
  const ready = vector.status === "ready";
  const running = vector.status === "processing";
  const queued = vector.status === "pending";
  // A file found not to load, or a .json without poses: said on the row, and no edit control that leads nowhere.
  const problem = useClipProblem(vector);
  return (
    <li
      className={cn(
        "rounded-xl transition-colors",
        selected ? "bg-(--m3-secondary-container) text-(--m3-on-secondary-container)" : "bg-(--m3-surface-container)",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        title={ready ? (vector.format === "json" ? `Open #${vector.seq} on the stage to adjust its poses` : `Play #${vector.seq} on the stage`) : undefined}
        className="studio-state flex w-full cursor-pointer items-start gap-3 rounded-xl px-3 pt-2.5 pb-1.5 text-left">
        <StatusDot status={vector.status} className="mt-1.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono tabular-nums opacity-70">#{vector.seq}</span>
            <span className="font-medium">{VECTOR_STATUS_LABEL[vector.status]}</span>
            {vector.active ? (
              <Chip tone="success" className="h-5 px-1.5 text-[10px]">
                active
              </Chip>
            ) : null}
            <span className="ml-auto flex items-center gap-1 text-[10px] text-(--m3-on-surface-variant)">
              <Clock3 className="h-3 w-3" /> {relativeTime(vector.inserted_at)}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-(--m3-on-surface-variant)">
            {vector.error ? vector.error : vector.prompt}
          </p>
          {ready && problem ? <ClipProblemNote problem={problem} className="mt-1" /> : null}
          <div className="mt-1.5 flex flex-wrap gap-1 text-[10px] text-(--m3-on-surface-variant)">
            <span>{vector.avatar?.code ?? "avatar"}</span>
            <span>· {vector.format}</span>
            {vector.fps ?? vector.params.fps ? <span>· {String(vector.fps ?? vector.params.fps)} fps</span> : null}
            {vector.duration_ms ? (
              <span>· {(vector.duration_ms / 1000).toFixed(1)} s</span>
            ) : vector.params.duration_s ? (
              <span>· {String(vector.params.duration_s)} s</span>
            ) : null}
            {vector.attempts > 1 ? <span>· attempt {vector.attempts}</span> : null}
            {vector.model ? <span>· {vector.model}</span> : null}
          </div>
        </div>
      </button>
      {editingPrompt ? (
        <div className="space-y-1.5 px-3 pb-2">
          <TextArea rows={3} value={promptText} onChange={(e) => setPromptText(e.target.value)} aria-label="Prompt of this queued row" className="text-[11px]" />
          <div className="flex justify-end gap-1">
            <M3Button size="sm" variant="text" onClick={() => setEditingPrompt(false)}>
              Cancel
            </M3Button>
            <M3Button
              size="sm"
              variant="tonal"
              disabled={!promptText.trim() || promptText.trim() === vector.prompt}
              onClick={() => {
                onAction("prompt", promptText);
                setEditingPrompt(false);
              }}
            >
              Save prompt
            </M3Button>
          </div>
        </div>
      ) : null}
      <div className="flex items-center gap-0.5 px-2 pb-1.5">
        {busy ? <Loader2 className="ml-2 h-3.5 w-3.5 animate-spin text-(--m3-on-surface-variant)" /> : null}
        {ready ? (
          <IconButton
            label={vector.active ? "Stop using this clip" : "Use this clip for the exercise"}
            active={vector.active}
            onClick={() => onAction(vector.active ? "deactivate" : "activate")}
            disabled={busy}
            className="h-7 w-7"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
          </IconButton>
        ) : null}
        {ready && !problem ? (
          <IconButton label={vector.format === "json" ? `Open the poses of #${vector.seq} in the editor` : `Edit capture #${vector.seq} as key poses (the capture stays as it is)`} onClick={onEdit} disabled={busy} className="h-7 w-7" data-vector-edit={vector.id}>
            <PenLine className="h-3.5 w-3.5" />
          </IconButton>
        ) : null}
        {queued ? (
          <IconButton label="Edit the prompt before it runs" onClick={() => setEditingPrompt((v) => !v)} disabled={busy} className="h-7 w-7">
            <PenLine className="h-3.5 w-3.5" />
          </IconButton>
        ) : null}
        {vector.status === "error" ? (
          <IconButton label="Put back in the queue" onClick={() => onAction("requeue")} disabled={busy} className="h-7 w-7">
            <RotateCw className="h-3.5 w-3.5" />
          </IconButton>
        ) : null}
        {queued || running ? (
          <IconButton label={running ? "Stop: mark this run failed (a worker that died, or one you do not want to wait for)" : "Take it out of the queue (marked failed; delete it after)"} onClick={() => onAction("stop")} disabled={busy} className="h-7 w-7">
            <OctagonX className="h-3.5 w-3.5" />
          </IconButton>
        ) : null}
        {!running ? (
          <>
            <IconButton
              label={
                ready
                  ? "Replace the clip with a file (.glb, .gltf, .fbx, .bvh, .json)"
                  : "Attach a finished clip (.glb, .gltf, .fbx, .bvh, .json): a DeepMotion or Mixamo export is retargeted to the avatar"
              }
              onClick={() => fileInput.current?.click()}
              disabled={busy}
              className="h-7 w-7"
            >
              <Upload className="h-3.5 w-3.5" />
            </IconButton>
            <input
              ref={fileInput}
              type="file"
              accept=".glb,.gltf,.fbx,.bvh,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) onAction("upload", file);
              }}
            />
          </>
        ) : null}
        {!vector.active && !running ? (
          <IconButton label="Delete" onClick={() => onAction("delete")} disabled={busy} className="ml-auto h-7 w-7">
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        ) : null}
      </div>
    </li>
  );
}
