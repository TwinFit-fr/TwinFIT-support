"use client";

import { Magnet } from "lucide-react";
import { SNAP_DEG, SNAP_MM } from "@/lib/studio/rig-points";
import { useStudioStore, type EditTool } from "@/lib/studio/store";
import { cn } from "@/lib/utils";
import { Segmented } from "./ui";
import { RIG_KEYS } from "./viewer/rig-help";

function ToolLabel({ name, shortcut }: { name: string; shortcut: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      {name}
      <kbd aria-hidden="true" className="font-mono text-[10px] opacity-75">
        {shortcut}
      </kbd>
    </span>
  );
}

const TOOLS: { value: EditTool; label: React.ReactNode; title: string }[] = [
  { value: "translate", label: <ToolLabel name="Move" shortcut={RIG_KEYS.move} />, title: `The gizmo moves the point along one axis (${RIG_KEYS.move})` },
  { value: "rotate", label: <ToolLabel name="Rotate" shortcut={RIG_KEYS.rotate} />, title: `The gizmo turns the point around one axis (${RIG_KEYS.rotate})` },
];

/** What the gizmo does (Move or Rotate, M and T) and whether moves and turns snap, with the steps said on the switch. */
export function RigTools() {
  const tool = useStudioStore((s) => s.edit.tool);
  const snap = useStudioStore((s) => s.edit.snap);
  const setEdit = useStudioStore((s) => s.setEdit);
  return (
    <div className="space-y-1.5" role="group" aria-label="Gizmo">
      <p className="text-[10px] font-semibold tracking-[0.12em] text-(--m3-on-surface-variant) uppercase">Gizmo</p>
      <Segmented label="Gizmo tool" value={tool} onChange={(next) => setEdit({ tool: next })} size="sm" options={TOOLS} className="flex w-full [&>button]:flex-1" />
      <button
        type="button"
        role="switch"
        aria-checked={snap}
        onClick={() => setEdit({ snap: !snap })}
        title={snap ? `Snap on: moves land on ${SNAP_MM} mm steps, turns on ${SNAP_DEG}° steps. Click to move freely.` : `Snap off: moves and turns are free. Click to snap moves to ${SNAP_MM} mm and turns to ${SNAP_DEG}°.`}
        className="studio-state flex h-9 w-full cursor-pointer items-center gap-2 rounded-xl px-2 text-left text-xs outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70"
        data-rig-snap
      >
        <Magnet className={cn("h-3.5 w-3.5 shrink-0", snap ? "text-(--m3-primary)" : "text-(--m3-on-surface-variant)")} aria-hidden="true" />
        <span className="font-medium text-(--m3-on-surface)">Snap</span>
        <span className="flex-1 font-mono text-[11px] text-(--m3-on-surface-variant)">
          {SNAP_MM} mm · {SNAP_DEG}°
        </span>
        <span className="text-[11px] text-(--m3-on-surface-variant)">{snap ? "On" : "Off"}</span>
        <span aria-hidden="true" className={cn("relative h-4 w-7 shrink-0 rounded-full transition-colors motion-reduce:transition-none", snap ? "bg-(--m3-primary)" : "bg-(--m3-surface-container-highest) ring-1 ring-(--m3-outline) ring-inset")}>
          <span className={cn("absolute top-0.5 h-3 w-3 rounded-full transition-[left] motion-reduce:transition-none", snap ? "left-3.5 bg-(--m3-on-primary)" : "left-0.5 bg-(--m3-on-surface-variant)")} />
        </span>
      </button>
    </div>
  );
}
