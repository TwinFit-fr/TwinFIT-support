"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { allJointGroups } from "@/lib/studio/joint-props";
import { POINT_LABEL } from "@/lib/studio/pose-points";
import { useStudioStore } from "@/lib/studio/store";
import { cn } from "@/lib/utils";
import { useJointEdit } from "./hooks/use-joint-edit";
import { RangeKey } from "./joint-control";
import { PoseJoint } from "./pose-joint";

/**
 * Every joint of the held pose, folded away: one disclosure, then one per body part, holding the
 * same named controls as the properties of a selected point. Nothing is lost by editing through
 * the body, and nothing here crowds the panel until it is opened.
 */
export function AllJoints() {
  const edit = useJointEdit();
  const twoHanded = useStudioStore((s) => s.poseEdit?.twoHanded ?? false);
  const setTarget = useStudioStore((s) => s.setPoseDragTarget);
  const [open, setOpen] = useState(false);
  const [parts, setParts] = useState<Record<string, boolean>>({});
  if (!edit) return null;
  const groups = allJointGroups({ twoHanded });
  const count = groups.reduce((sum, g) => sum + g.paths.length, 0);
  return (
    <section className="border-b border-(--m3-outline-variant)" data-all-joints={open ? "open" : "closed"}>
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="all-joints-list"
          onClick={() => setOpen(!open)}
          className="studio-state flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/60 focus-visible:ring-inset"
        >
          {open ? <ChevronDown className="h-4 w-4 shrink-0 text-(--m3-on-surface-variant)" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 shrink-0 text-(--m3-on-surface-variant)" aria-hidden="true" />}
          <span className="text-[12px] font-semibold text-(--m3-on-surface)">All joints</span>
          <span className="text-[11px] text-(--m3-on-surface-variant)">{count} angles and positions, by body part</span>
        </button>
      </h3>
      {open ? (
        <div id="all-joints-list" className="px-2 pb-3">
          <div className="flex justify-end px-2 pb-1">
            <RangeKey />
          </div>
          {groups.map((group) => {
            const expanded = parts[group.id] ?? false;
            return (
              <div key={group.id} className="rounded-lg">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={`all-joints-${group.id}`}
                    onClick={() => setParts({ ...parts, [group.id]: !expanded })}
                    className={cn("studio-state flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-2 text-left text-[12px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/60", expanded ? "text-(--m3-on-surface)" : "text-(--m3-on-surface-variant)")}
                  >
                    {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                    {group.title}
                    <span className="text-[11px] font-normal text-(--m3-on-surface-variant)">{group.paths.length}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTarget(group.point)}
                    title={`Select the ${POINT_LABEL[group.point].toLowerCase()} on the body and show its properties`}
                    className="studio-state shrink-0 cursor-pointer rounded-full px-2 py-1 text-[11px] font-medium text-(--m3-primary) outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/60"
                  >
                    Select {POINT_LABEL[group.point].toLowerCase()}
                  </button>
                </div>
                {expanded ? (
                  <div id={`all-joints-${group.id}`} role="group" aria-label={group.title} className="pb-1">
                    {group.paths.map((path) => (
                      <PoseJoint key={path} path={path} edit={edit} />
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
