"use client";

import { clinicalForearm } from "@/lib/studio/anatomy";
import { cn } from "@/lib/utils";
import type { JointEdit } from "./hooks/use-joint-edit";
import { JointControl } from "./joint-control";

/** The forearm as a goniometer reads it, next to the Studio's zero at full supination. */
function forearmNote(value: number): string {
  const clinical = Math.round(clinicalForearm(value));
  return clinical === 0 ? "mid-position" : clinical > 0 ? `${clinical}° pronation` : `${-clinical}° supination`;
}

/** An on / off control with its state in words, announced as a switch. */
export function Switch({
  checked,
  onChange,
  children,
  disabled = false,
  title,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: React.ReactNode;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      title={title}
      onClick={() => onChange(!checked)}
      className={cn(
        "studio-state inline-flex h-7 shrink-0 cursor-pointer items-center gap-2 rounded-full pr-2.5 pl-1 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-(--m3-secondary-container) text-(--m3-on-secondary-container)" : "text-(--m3-on-surface-variant)",
        className,
      )}
    >
      <span aria-hidden="true" className={cn("relative h-4 w-7 rounded-full transition-colors", checked ? "bg-(--m3-primary)" : "bg-(--m3-outline)")}>
        <span className={cn("absolute top-0.5 h-3 w-3 rounded-full transition-[left] motion-reduce:transition-none", checked ? "left-3.5 bg-(--m3-on-primary)" : "left-0.5 bg-(--m3-on-surface-variant)")} />
      </span>
      {children}
    </button>
  );
}

/**
 * One field of the held pose as a joint control, with what only that field needs: the pelvis
 * height shows the solved height on Auto (a drag starts from it and sets it by hand); a flat-footed
 * ankle follows the floor and says how to free it; the forearm adds its clinical reading.
 */
export function PoseJoint({ path, edit }: { path: string; edit: JointEdit }) {
  const { pose, shown, change, endGesture, setPose } = edit;
  const s = shown(path);
  if (path === "hips.height_m") {
    return (
      <JointControl
        path={path}
        value={s.value}
        onChange={(v, g) => change(path, v, g)}
        onGestureEnd={endGesture}
        aside={
          <Switch
            checked={s.auto}
            onChange={(auto) => setPose({ ...pose, hips: { ...pose.hips, height_m: auto ? null : s.value } })}
            title="Auto: from the legs when standing, else the support's default. Off: you set it, and standing the feet stay put while the legs follow."
          >
            Auto
          </Switch>
        }
        note={s.auto ? "Worked out from the legs. Moving it sets the height by hand." : null}
      />
    );
  }
  if (s.follows) {
    return (
      <JointControl
        path={path}
        value={s.value}
        onChange={(v, g) => change(path, v, g)}
        onGestureEnd={endGesture}
        locked={
          <>
            Follows the floor: the sole stays flat.{" "}
            <button type="button" className="cursor-pointer font-medium text-(--m3-primary) underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none" onClick={() => setPose({ ...pose, feet_flat: false })}>
              Turn off Flat feet
            </button>{" "}
            to lift the heel.
          </>
        }
      />
    );
  }
  return (
    <JointControl
      path={path}
      value={s.value}
      onChange={(v, g) => change(path, v, g)}
      onGestureEnd={endGesture}
      aside={
        path.endsWith(".forearm_pronation") ? (
          <span className="shrink-0 text-[10px] text-(--m3-on-surface-variant)" title="The same rotation as a goniometer reads it, from the thumb-forward mid-position">
            {forearmNote(s.value)}
          </span>
        ) : null
      }
    />
  );
}
