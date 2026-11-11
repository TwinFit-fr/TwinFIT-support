"use client";

import { ArrowLeftRight, X } from "lucide-react";
import type { AnchorId } from "@/lib/studio/anatomy";
import { limbOf, mirrorNote, pointJoints } from "@/lib/studio/joint-props";
import { POINT_LABEL, type PointId } from "@/lib/studio/pose-points";
import { useStudioStore } from "@/lib/studio/store";
import { useJointEdit } from "./hooks/use-joint-edit";
import { RangeKey } from "./joint-control";
import { PoseJoint, Switch } from "./pose-joint";

const PINNABLE: readonly PointId[] = ["left_hand", "right_hand", "left_knee", "right_knee", "left_foot", "right_foot"];

/**
 * The properties of the body point selected on the stage (or from the keyboard): its own joints
 * and nothing from other body parts, its pinned state in this pose, and what Mirror will copy
 * from it. Closing it (or Escape on the stage) brings back the pose-level panel.
 */
export function PointProperties({ point }: { point: PointId }) {
  const edit = useJointEdit();
  const draft = useStudioStore((s) => s.poseEdit);
  const probe = useStudioStore((s) => s.poseProbe);
  const setTarget = useStudioStore((s) => s.setPoseDragTarget);
  const setOptions = useStudioStore((s) => s.setPoseEditOptions);
  const copyLimb = useStudioStore((s) => s.copyLimbToOtherSide);
  if (!edit || !draft) return null;
  const { pose, index } = edit;
  const name = POINT_LABEL[point];
  const sections = pointJoints(point, { twoHanded: draft.twoHanded });
  const limb = limbOf(point);
  const side = point.startsWith("left_") ? "left" : "right";
  const other = side === "left" ? "right" : "left";
  const anchor = PINNABLE.includes(point) ? (point as AnchorId) : null;
  const pinned = anchor ? Boolean(pose.anchors?.[anchor]) : false;
  const togglePin = (next: boolean) => {
    if (!anchor) return;
    const anchors = { ...(pose.anchors ?? {}) };
    if (!next) delete anchors[anchor];
    else if (probe[anchor]) anchors[anchor] = probe[anchor];
    else return;
    edit.setPose({ ...pose, anchors });
  };
  const poseName = draft.labels?.[index]?.trim();
  return (
    <section aria-labelledby="point-properties-title" className="flex flex-col" data-point-properties={point}>
      <header className="flex items-center gap-2 border-b border-(--m3-outline-variant) px-4 py-2">
        <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full bg-(--m3-warning) shadow-[0_0_0_2px_var(--m3-surface-container-low),0_0_0_3.5px_var(--m3-warning)]" />
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
          <h2 id="point-properties-title" className="text-sm leading-tight font-semibold text-(--m3-on-surface)">
            {name}
          </h2>
          <p className="text-[11px] leading-snug text-(--m3-on-surface-variant)">
            Pose {index + 1} of {draft.poses.length}
            {poseName ? ` · ${poseName}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setTarget(null)}
          aria-label={`Close ${name.toLowerCase()} properties (Esc on the stage)`}
          title="Close: back to the pose (Esc on the stage)"
          className="studio-state -mr-1.5 inline-flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-full px-2.5 text-[11px] font-medium text-(--m3-on-surface-variant) outline-none hover:text-(--m3-on-surface) focus-visible:ring-2 focus-visible:ring-(--m3-primary)/60"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Close
        </button>
      </header>

      {/* State of the point in this pose: pinned, and what Mirror does with a change here. */}
      <div className="space-y-1 border-b border-(--m3-outline-variant) px-4 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {anchor ? (
            <Switch checked={pinned} onChange={togglePin} disabled={!pinned && !probe[anchor]} title={probe[anchor] ? "A pinned point stays exactly where it is while you move the rest of the body" : "Position not known yet"}>
              Pinned in this pose
            </Switch>
          ) : null}
          {limb ? (
            <Switch checked={draft.mirror} onChange={(mirror) => setOptions({ mirror })}>
              Mirror
            </Switch>
          ) : null}
        </div>
        <p className="text-[11px] leading-snug text-(--m3-on-surface-variant)" data-mirror-note>
          {mirrorNote(point, { mirror: draft.mirror, standing: pose.orientation === "standing" })}
          {pinned ? " Pinned: it stays where it is while the rest moves." : ""}
        </p>
      </div>

      <div className="px-2 pt-1 pb-3">
        {sections.map((section, k) => (
          <div key={section.id} role="group" aria-labelledby={`point-section-${section.id}`} className="mt-0.5 first:mt-0">
            <div className="flex items-center justify-between gap-2 px-2 pt-1 pb-0.5">
              <h3 id={`point-section-${section.id}`} className="text-[10px] font-semibold tracking-[0.14em] text-(--m3-on-surface-variant) uppercase">
                {section.title}
              </h3>
              {k === 0 ? <RangeKey /> : null}
            </div>
            {section.paths.map((path) => (
              <PoseJoint key={path} path={path} edit={edit} />
            ))}
          </div>
        ))}
        {limb ? (
          <div className="mt-2 px-2">
            <button
              type="button"
              onClick={() => copyLimb(index, limb, side)}
              className="studio-state inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-2 text-[11px] font-medium text-(--m3-primary) outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/60"
              title={`Copy every angle of the ${side} ${limb} to the ${other} ${limb}, mirrored`}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
              Copy this {limb} to the {other} side
            </button>
          </div>
        ) : null}
        {point === "left_foot" || point === "right_foot" ? (
          pose.orientation === "standing" ? (
            <div className="mt-2 px-2">
              <Switch checked={pose.feet_flat !== false} onChange={(flat) => edit.setPose({ ...pose, feet_flat: flat })} title="On: the soles stay flat on the floor and the ankles follow from the legs. Off: the ankles lift the heels (calf raise, tiptoe) and the toes stay down.">
                Flat feet (both)
              </Switch>
            </div>
          ) : null
        ) : null}
      </div>
    </section>
  );
}
