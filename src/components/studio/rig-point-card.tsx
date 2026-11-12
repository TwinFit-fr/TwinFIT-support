"use client";

import { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { OFFSET_LIMIT_MM, ROTATION_LIMIT_DEG, fromMm, toMm, type SocketOrigin } from "@/lib/studio/rig-points";
import type { Vec3 } from "@/lib/studio/types";
import { cn } from "@/lib/utils";
import { PointMark } from "./point-mark";
import { RigVectorFields } from "./rig-number-field";
import { IconButton } from "./ui";

const ORIGIN_CHIP: Record<SocketOrigin, string> = { detected: "Auto-detected", moved: "Moved", manual: "Added by hand" };

/**
 * The selected point's properties: its name and where it comes from, the bone (or the attachment
 * point) it hangs from, its position in millimetres and its rotation in degrees. A point that was
 * auto-detected and moved since can go back to where it was detected.
 */
export function RigPointCard({
  name,
  under,
  origin,
  offset,
  rotation,
  rotationIsQuaternion,
  onOffset,
  onRotation,
  onStepEnd,
  onReset,
  onRemove,
}: {
  name: string;
  /** "on mixamorigLeftHand", "on hand_r · grip mirrored to the left hand". */
  under: string;
  origin: SocketOrigin | null;
  /** Metres and degrees, as stored. */
  offset: Vec3;
  rotation: Vec3;
  rotationIsQuaternion: boolean;
  onOffset: (next: Vec3, stepping: boolean) => void;
  onRotation: (next: Vec3, stepping: boolean) => void;
  onStepEnd: () => void;
  onReset?: () => void;
  onRemove?: () => void;
}) {
  // What a clamp said stays while the numbers are the ones it set; a drag, an undo or another entry clears it.
  const [clampState, setClampState] = useState<{ text: string; key: string | null } | null>(null);
  const key = JSON.stringify([offset, rotation]);
  if (clampState && clampState.key === null) setClampState({ ...clampState, key });
  else if (clampState && clampState.key !== key) setClampState(null);
  const clamp = clampState?.text ?? null;
  const setClamp = (text: string | null) => setClampState(text ? { text, key: null } : null);
  return (
    <section aria-label={`Selected point: ${name}`} className="rounded-xl bg-(--m3-surface-container) p-2.5" data-rig-card>
      <div className="flex items-center gap-2">
        <PointMark kind={origin && origin !== "detected" ? "set" : "automatic"} size={15} />
        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-(--m3-on-surface)" data-rig-card-name>
          {name}
        </h3>
        {origin ? (
          <span
            className={cn(
              "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold",
              origin === "detected" ? "bg-(--pose-auto)/15 text-(--pose-auto)" : "bg-(--pose-set)/15 text-(--pose-set)",
            )}
            data-rig-origin={origin}
          >
            {ORIGIN_CHIP[origin]}
          </span>
        ) : null}
        {onRemove ? (
          <IconButton label={`Remove ${name}`} onClick={onRemove} className="-mr-1 h-7 w-7">
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        ) : null}
      </div>
      <div className="mt-0.5 flex min-h-6 items-center gap-2">
        <p className="min-w-0 flex-1 truncate font-mono text-[10px] text-(--m3-on-surface-variant)" title={under}>
          {under}
        </p>
        {onReset ? (
          <button
            type="button"
            onClick={onReset}
            title="Put this point back where it was detected when the avatar was made (undo brings your position back)"
            className="studio-state inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-full px-2 text-[11px] font-medium text-(--m3-primary) outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70"
            data-rig-reset
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" /> Reset to detected
          </button>
        ) : null}
      </div>
      <div className="mt-2 space-y-2.5">
        <RigVectorFields
          caption="Position"
          name={name}
          unit="mm"
          step={1}
          limit={OFFSET_LIMIT_MM}
          value={offset.map(toMm) as Vec3}
          onCommit={(next, stepping) => onOffset(next.map(fromMm) as Vec3, stepping)}
          onClamp={setClamp}
          onStepEnd={onStepEnd}
        />
        {rotationIsQuaternion ? (
          <p className="text-[11px] leading-snug text-(--m3-on-surface-variant)">Rotation is stored as a quaternion: turn it once with the gizmo (T) to edit it in degrees.</p>
        ) : (
          <RigVectorFields
            caption="Rotation"
            name={name}
            unit="°"
            step={1}
            digits={1}
            limit={ROTATION_LIMIT_DEG}
            value={rotation}
            onCommit={onRotation}
            onClamp={setClamp}
            onStepEnd={onStepEnd}
          />
        )}
      </div>
      <p role="status" aria-live="polite" className={cn("text-[11px] leading-snug text-(--m3-warning)", clamp ? "mt-2" : "sr-only")}>
        {clamp ?? ""}
      </p>
    </section>
  );
}
