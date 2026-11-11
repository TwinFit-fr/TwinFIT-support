"use client";

import { MousePointerClick, Pin } from "lucide-react";
import { ANCHOR_IDS, ORIENTATIONS, type Orientation } from "@/lib/studio/anatomy";
import { POINT_LABEL } from "@/lib/studio/pose-points";
import { useStudioStore } from "@/lib/studio/store";
import { Switch } from "./pose-joint";
import { Select } from "./ui";

/**
 * What applies to the whole held pose: how the body is supported, a bar in both hands, flat
 * feet, and which points are pinned (each opens that point's properties, where its pin is set).
 * The way into the joints is the body itself: select a point on the stage.
 */
export function PoseBody() {
  const draft = useStudioStore((s) => s.poseEdit);
  const updatePose = useStudioStore((s) => s.updatePose);
  const setOptions = useStudioStore((s) => s.setPoseEditOptions);
  const setTarget = useStudioStore((s) => s.setPoseDragTarget);
  if (!draft) return null;
  const i = draft.keyframe;
  const pose = draft.poses[i];
  const standing = pose.orientation === "standing";
  const feetFlat = pose.feet_flat !== false;
  const pinned = ANCHOR_IDS.filter((id) => pose.anchors?.[id]);
  return (
    <section aria-labelledby="pose-body-title" className="border-b border-(--m3-outline-variant) px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="pose-body-title" className="text-[10px] font-semibold tracking-[0.16em] text-(--m3-on-surface-variant) uppercase">
          Body in pose {i + 1}
        </h3>
      </div>
      <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-(--m3-on-surface)" data-pose-editor-help>
        <MousePointerClick className="mt-px h-3.5 w-3.5 shrink-0 text-(--m3-tertiary)" aria-hidden="true" />
        <span>
          Select a point on the body to see its joints, or press and drag it to pose it.
        </span>
      </p>
      <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 text-[11px] text-(--m3-on-surface-variant)">
        <label htmlFor="pose-support">Support</label>
        <Select id="pose-support" value={pose.orientation} onChange={(e) => updatePose(i, { ...pose, orientation: e.target.value as Orientation })} className="h-8 py-0 text-[11px]">
          {ORIENTATIONS.map((o) => (
            <option key={o} value={o}>
              {o.replace("_", " ")}
            </option>
          ))}
        </Select>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Switch checked={draft.twoHanded} onChange={(twoHanded) => setOptions({ twoHanded })} title="The hands hold a bar: its position per pose drives the arms (set it in a hand's properties)">
          Bar in both hands
        </Switch>
        {standing ? (
          <Switch
            checked={feetFlat}
            onChange={(flat) => updatePose(i, { ...pose, feet_flat: flat })}
            title="On: the soles stay flat on the floor and the ankles follow from the legs. Off: the ankles lift the heels (calf raise, tiptoe) and the toes stay down."
          >
            Flat feet
          </Switch>
        ) : null}
      </div>
      <div className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug text-(--m3-on-surface-variant)" data-pinned-summary>
        <Pin className="mt-1 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {pinned.length ? (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span>Pinned:</span>
            {pinned.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setTarget(id)}
                title={`Open the ${POINT_LABEL[id].toLowerCase()} properties`}
                className="studio-state inline-flex h-6 cursor-pointer items-center rounded-md border border-(--m3-outline-variant) px-2 font-medium text-(--m3-on-surface) outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/60"
              >
                {POINT_LABEL[id]}
              </button>
            ))}
          </div>
        ) : (
          <span className="mt-0.5 min-w-0">Nothing pinned in this pose. Select a hand, knee or foot to pin it.</span>
        )}
      </div>
    </section>
  );
}
