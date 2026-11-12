"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import type { SocketOrigin } from "@/lib/studio/rig-points";
import { cn } from "@/lib/utils";
import { PointMark } from "./point-mark";
import { M3Button, Select, TextInput } from "./ui";

export type RigListItem = { id: string; label: string; detail: string; origin: SocketOrigin | null };

const ORIGIN_TAG: Record<SocketOrigin, string> = { detected: "Auto", moved: "Moved", manual: "Added" };
const ORIGIN_TITLE: Record<SocketOrigin, string> = {
  detected: "Auto-detected when the avatar was made, not moved since",
  moved: "Auto-detected, then moved: it can be reset to where it was detected",
  manual: "Added by hand",
};

/**
 * The points of the rig editor as a list, the second way to select one (the first is clicking
 * it on the body); the row of the selected point is lit and follows a selection made on the stage.
 */
export function RigPointList({
  items,
  selected,
  empty,
  onSelect,
}: {
  items: RigListItem[];
  selected: string | null;
  empty: string;
  onSelect: (id: string) => void;
}) {
  if (!items.length) return <p className="rounded-xl bg-(--m3-surface-container) px-3 py-2.5 text-[11px] leading-snug text-(--m3-on-surface-variant)">{empty}</p>;
  return (
    <ul className="space-y-0.5" data-rig-list>
      {items.map((item) => {
        const on = item.id === selected;
        return (
          <li key={item.id}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => onSelect(item.id)}
              data-rig-row={item.id}
              className={cn(
                "studio-state flex h-7 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70",
                on ? "bg-(--m3-secondary-container) text-(--m3-on-secondary-container)" : "text-(--m3-on-surface)",
              )}
            >
              <PointMark kind={item.origin && item.origin !== "detected" ? "set" : "automatic"} size={13} />
              <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
              <span className={cn("truncate font-mono text-[10px]", on ? "text-(--m3-on-secondary-container)" : "text-(--m3-on-surface-variant)")}>{item.detail}</span>
              {item.origin ? (
                <span
                  title={ORIGIN_TITLE[item.origin]}
                  className={cn(
                    "shrink-0 rounded-md px-1.5 py-px text-[10px] font-semibold",
                    item.origin === "detected" ? "bg-(--pose-auto)/15 text-(--pose-auto)" : "bg-(--pose-set)/15 text-(--pose-set)",
                  )}
                >
                  {ORIGIN_TAG[item.origin]}
                  <span className="sr-only">{`: ${ORIGIN_TITLE[item.origin]}`}</span>
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Adding an attachment point: an id and the bone it hangs from. */
export function AddPointForm({ bones, taken, onAdd, onCancel }: { bones: string[]; taken: (id: string) => boolean; onAdd: (id: string, bone: string) => void; onCancel: () => void }) {
  const [id, setId] = useState("");
  const [bone, setBone] = useState("");
  const clean = id.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  const clash = Boolean(clean) && taken(clean);
  return (
    <form
      className="space-y-1.5 rounded-xl border border-(--m3-outline-variant) p-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (clean && bone && !clash) onAdd(clean, bone);
      }}
    >
      <TextInput value={id} onChange={(e) => setId(e.target.value)} placeholder="Point id (head, hip_l…)" aria-label="New point id" className="h-8 px-2 py-0 text-xs" autoFocus />
      <Select value={bone} onChange={(e) => setBone(e.target.value)} aria-label="Bone of the new point" className="h-8 py-0 text-xs">
        <option value="">Bone it hangs from…</option>
        {bones.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </Select>
      {clash ? (
        <p role="status" className="text-[11px] text-(--m3-error)">
          A point {clean} exists already.
        </p>
      ) : null}
      <div className="flex justify-end gap-1">
        <M3Button size="sm" variant="text" onClick={onCancel}>
          Cancel
        </M3Button>
        <M3Button size="sm" variant="tonal" type="submit" disabled={!clean || !bone || clash}>
          <Plus className="h-3.5 w-3.5" /> Add point
        </M3Button>
      </div>
    </form>
  );
}
