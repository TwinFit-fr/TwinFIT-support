"use client";

import { useEffect, useRef, useState } from "react";
import { TransformControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { nudgeOffset, pointerOnCameraPlane, toScreen } from "@/lib/studio/pose-points";
import { SNAP_DEG, SNAP_MM, equipmentLabel, roundOffset, snapOffset, socketLabel } from "@/lib/studio/rig-points";
import { useStudioStore } from "@/lib/studio/store";
import type { AvatarSocket, Vec3 } from "@/lib/studio/types";
import type { ScreenXY } from "./pose-stage";
import { rigStage, type RigFrame } from "./rig-stage";

type Drag = {
  id: string;
  /** "pointer": the point dragged in the camera's plane. "keys": arrow-key nudges. */
  by: "pointer" | "keys";
  /** Plane point and grab offset of a pointer drag (world). */
  through: THREE.Vector3;
  offset: THREE.Vector3;
  /** Next position to apply (world), consumed once per frame. */
  pending: THREE.Vector3 | null;
  moved: boolean;
};

const r1 = (rad: number) => Math.round(THREE.MathUtils.radToDeg(rad) * 10) / 10;
/** Arrow-key nudges in the camera's plane: a millimetre, a centimetre with Shift. */
const NUDGE_M = 0.001;
const NUDGE_COARSE_M = 0.01;

export const rigPointName = (id: string, mode: string) => (mode === "model" ? equipmentLabel(id) : socketLabel(id));

/**
 * Write a point's transform into the draft: its position, and its rotation when it was turned.
 * `gesture`: part of a drag, which is one undo step.
 */
function commitPoint(id: string, o: THREE.Object3D, rotated: boolean, avatarId: string | null, saved: AvatarSocket[]) {
  const st = useStudioStore.getState();
  const offset = roundOffset([o.position.x, o.position.y, o.position.z]);
  const rotation: Vec3 = [r1(o.rotation.x), r1(o.rotation.y), r1(o.rotation.z)];
  const label = `${rotated ? "Rotated" : "Moved"} ${rigPointName(id, st.edit.mode)}`;
  if (st.edit.mode === "sockets" && avatarId) {
    st.updateDraftSocket(avatarId, saved, id, rotated ? { offset, rotation } : { offset }, { gesture: true, label });
  } else if (st.edit.mode === "model") {
    const current = st.draftPlacements[id] ?? st.equipmentModels[id]?.placement;
    if (current) st.setDraftPlacement(id, { ...current, offset, rotation: rotated ? rotation : current.rotation }, { gesture: true, label });
  }
}

/**
 * The rig editor on the stage: the selected point's gizmo (move or rotate along one axis), the
 * points projected for the DOM layer every frame, and the drags the layer starts (a point pulled
 * in the camera's plane, arrow-key nudges). Every change is written into the draft as it happens,
 * once per frame, so the panel's numbers follow the drag; a drag is one undo step.
 */
export function RigEditScene({ avatarId, sockets }: { avatarId: string | null; sockets: AvatarSocket[] }) {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const edit = useStudioStore((s) => s.edit);
  const [object, setObject] = useState<THREE.Object3D | null>(null);
  const shown = useRef<THREE.Object3D | null>(null);
  const drag = useRef<Drag | null>(null);
  /** The gizmo is held; it has moved its object since the last draft write (changed), during this hold (moved). */
  const gizmo = useRef({ held: false, changed: false, moved: false });
  const [pointerDragging, setPointerDragging] = useState(false);
  const frame = useRef<(() => void) | null>(null);
  const live = useRef({ camera, size, sockets, avatarId });
  useEffect(() => {
    live.current = { camera, size, sockets, avatarId };
  });

  /** Write what the gizmo did since the last write. */
  const flushGizmo = () => {
    const target = useStudioStore.getState().edit.target;
    if (!gizmo.current.changed || !shown.current || !target) return;
    gizmo.current.changed = false;
    commitPoint(target, shown.current, useStudioStore.getState().edit.tool === "rotate", live.current.avatarId, live.current.sockets);
  };

  useEffect(() => {
    const world = new THREE.Vector3();
    const project = new THREE.Vector3();
    const toNdc = (at: ScreenXY) => ({ x: (at.x / live.current.size.width) * 2 - 1, y: 1 - (at.y / live.current.size.height) * 2 });

    /** A pending world position of the dragged point, applied to its object in its parent's frame. */
    const apply = (d: Drag) => {
      const o = rigStage.targets.get(d.id);
      if (!o?.parent || !d.pending) return;
      const local = o.parent.worldToLocal(d.pending.clone());
      const next: Vec3 = [local.x, local.y, local.z];
      o.position.set(...(useStudioStore.getState().edit.snap ? snapOffset(next, SNAP_MM) : next));
      commitPoint(d.id, o, false, live.current.avatarId, live.current.sockets);
      d.pending = null;
      d.moved = true;
    };

    const finish = () => {
      const d = drag.current;
      if (!d) return;
      apply(d);
      drag.current = null;
      useStudioStore.getState().endRigGesture();
      rigStage.layer?.setDragging(null);
      if (d.by === "pointer") setPointerDragging(false);
      if (d.moved) rigStage.layer?.announce(`${rigPointName(d.id, useStudioStore.getState().edit.mode)} moved. Undo with Ctrl+Z.`);
    };

    rigStage.scene = {
      beginDrag(id, at) {
        finish();
        const o = rigStage.targets.get(id);
        if (!o) return;
        const through = o.getWorldPosition(new THREE.Vector3());
        const hit = pointerOnCameraPlane(live.current.camera, toNdc(at), through);
        drag.current = { id, by: "pointer", through, offset: hit ? through.clone().sub(hit) : new THREE.Vector3(), pending: null, moved: false };
        rigStage.layer?.setDragging(id);
        setPointerDragging(true);
      },
      dragTo(at) {
        const d = drag.current;
        if (!d || d.by !== "pointer") return;
        const hit = pointerOnCameraPlane(live.current.camera, toNdc(at), d.through);
        if (hit) d.pending = hit.add(d.offset);
      },
      endDrag: finish,
      nudge(id, key, coarse) {
        if (!drag.current || drag.current.id !== id || drag.current.by !== "keys") {
          finish();
          drag.current = { id, by: "keys", through: new THREE.Vector3(), offset: new THREE.Vector3(), pending: null, moved: false };
        }
        const o = rigStage.targets.get(id);
        if (!o) return;
        const base = drag.current.pending ?? o.getWorldPosition(new THREE.Vector3());
        drag.current.pending = base.clone().add(nudgeOffset(live.current.camera, key, coarse ? NUDGE_COARSE_M : NUDGE_M));
      },
      endNudge() {
        if (drag.current?.by === "keys") finish();
      },
    };

    frame.current = () => {
      const st = useStudioStore.getState();
      if (st.edit.mode === "off") {
        rigStage.layer?.frame(null);
        return;
      }
      if (drag.current?.pending) apply(drag.current);
      // An object taken out of the scene (a model reloading, a removed point) is no point any more.
      for (const [id, o] of rigStage.targets) if (!o.parent) rigStage.targets.delete(id);
      // The selected point's object can mount after the selection (a model still loading): follow it.
      const want = st.edit.target ? (rigStage.targets.get(st.edit.target) ?? null) : null;
      if (want !== shown.current) {
        shown.current = want;
        setObject(want);
      }
      const { width, height } = live.current.size;
      const out: RigFrame = { points: {} };
      for (const [id, o] of rigStage.targets) {
        o.getWorldPosition(world);
        const xy = toScreen(live.current.camera, world, width, height, project);
        if (xy) out.points[id] = xy;
      }
      rigStage.layer?.frame(out);
    };

    return () => {
      finish();
      frame.current = null;
      rigStage.scene = null;
      rigStage.layer?.frame(null);
    };
  }, []);

  useFrame(() => {
    // One draft write per frame while the gizmo is dragged, folded into the drag's undo step.
    flushGizmo();
    frame.current?.();
  });

  // The gizmo steps aside while the point itself is dragged, as the pose editor's does.
  // Only on the object the selection names now: after a mode change or an undo the previous one may be leaving the scene.
  const current = edit.target ? rigStage.targets.get(edit.target) : undefined;
  if (!object?.parent || object !== current || pointerDragging || edit.mode === "off") return null;
  return (
    <TransformControls
      object={object}
      mode={edit.tool}
      space="local"
      size={0.7}
      rotationSnap={edit.snap ? THREE.MathUtils.degToRad(SNAP_DEG) : null}
      translationSnap={edit.snap ? SNAP_MM / 1000 : null}
      onMouseDown={() => {
        gizmo.current = { held: true, changed: false, moved: false };
      }}
      onObjectChange={() => {
        if (gizmo.current.held) gizmo.current = { ...gizmo.current, changed: true, moved: true };
      }}
      onMouseUp={() => {
        flushGizmo();
        const moved = gizmo.current.moved;
        gizmo.current = { held: false, changed: false, moved: false };
        const st = useStudioStore.getState();
        st.endRigGesture();
        if (moved && st.edit.target) rigStage.layer?.announce(`${rigPointName(st.edit.target, st.edit.mode)} ${st.edit.tool === "rotate" ? "rotated" : "moved"}. Undo with Ctrl+Z.`);
      }}
    />
  );
}
