// The avatar in the scene: the GLB laid out in metres, its clip solved and played, its equipment on its sockets.
"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useShallow } from "zustand/react/shallow";
import { isPoseClipJson, poseClipFromDraft } from "@/lib/studio/anatomy";
import { studioAssetHeaders } from "@/lib/studio/asset-auth";
import { DEFAULT_CLEANUP, cleanupClip } from "@/lib/studio/clip-cleanup";
import { isMocapClip, retargetToAvatar, type RetargetReport } from "@/lib/studio/mocap";
import { buildPoseClip, captureRestPose, restoreRestPose, type RestPose } from "@/lib/studio/pose-clip";
import { useStudioStore } from "@/lib/studio/store";
import type { AvatarSocket, EquipmentItem } from "@/lib/studio/types";
import { EquipmentMesh } from "./equipment-proxies";
import { equipmentKey } from "@/lib/studio/equipment";
import { showBody } from "./stage-body";
import { PoseRig } from "./pose-rig";
import { RigEditScene } from "./rig-edit-scene";
import { rigTargetRef } from "./rig-stage";
import { usePoseChecks } from "./use-pose-checks";
import { bakeDraftClip, useClipPlayback } from "./use-clip-playback";
import { usePublishCapture } from "./capture-stage";
import { BilateralAttachment, socketTransform } from "./equipment-attach";
import type { ModelInfo, SceneProps } from "./scene-props";

/** Bone names of a model, for the rig editor's socket picker. */
function boneNames(model: THREE.Object3D): string[] {
  const names: string[] = [];
  model.traverse((o) => {
    if ((o as THREE.Bone).isBone) names.push(o.name);
  });
  return names;
}

/** The previous avatar's GLB leaves drei's cache when another one loads (100 MiB rigs add up over a session). */
let cachedModelUrl: string | null = null;
function recycleModelCache(url: string) {
  if (cachedModelUrl && cachedModelUrl !== url) useGLTF.clear(cachedModelUrl);
  cachedModelUrl = url;
}

export function AvatarModel({ avatarId, modelUrl, heightM, sockets, clip, onModelInfo, onClipError }: SceneProps & { modelUrl: string }) {
  recycleModelCache(modelUrl);
  const { scene, animations } = useGLTF(modelUrl, true, true, (loader) => loader.setRequestHeader(studioAssetHeaders(modelUrl)));
  const model = useMemo(() => cloneSkeleton(scene), [scene]);
  const items = useStudioStore((s) => s.previewItems);
  const models = useStudioStore((s) => s.equipmentModels);
  const showEquipment = useStudioStore((s) => s.showEquipment);
  const cleanMocap = useStudioStore((s) => s.cleanMocap);

  // The pose editor's draft replaces the selected clip while it is open. Holding a key pose, the
  // pose is written straight onto the bones by PoseRig (no clip at all); playing or showing an
  // in-between, the draft is baked once and sampled. Only what shapes the clip is read, and only
  // then, so a drag or a slider tick on a held pose never re-renders this component, and moving
  // the playhead never does either (the time is read in the frame loop).
  const editorOpen = useStudioStore((s) => Boolean(s.poseEdit));
  const editorPlaying = useStudioStore((s) => Boolean(s.poseEdit) && s.playing);
  const scrubbing = useStudioStore((s) => s.scrubTime !== null);
  const draftSource = useStudioStore(
    useShallow((s) =>
      s.poseEdit && (s.playing || s.scrubTime !== null)
        ? {
            poses: s.poseEdit.poses,
            weights: s.poseEdit.weights,
            mode: s.poseEdit.mode,
            durationS: s.poseEdit.durationS,
            fps: s.poseEdit.fps,
            twoHanded: s.poseEdit.twoHanded,
            grip: s.poseEdit.grip,
            meta: s.poseEdit.meta,
          }
        : null,
    ),
  );
  const draft = useMemo(() => (draftSource ? poseClipFromDraft(draftSource) : null), [draftSource]);

  // The bones as loaded. Their local transforms do not depend on the layout below, so a later
  // re-layout (the height was edited) starts from them instead of from a frame of the clip.
  const loaded = useMemo(() => captureRestPose(model), [model]);

  // Ground the model, centre it and bring it to metres (Mixamo exports are often in centimetres).
  // The three object is mutated in place: it is scene state, not React state.
  const { info, rest } = useMemo<{ info: ModelInfo; rest: RestPose }>(() => {
    restoreRestPose(model, loaded);
    model.position.set(0, 0, 0);
    model.scale.setScalar(1);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const rawHeight = Math.max(size.y, 1e-6);
    const scale = heightM ? heightM / rawHeight : rawHeight > 10 ? 0.01 : 1;
    model.scale.setScalar(scale);
    model.updateMatrixWorld(true);
    const scaled = new THREE.Box3().setFromObject(model);
    const center = scaled.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -scaled.min.y, -center.z);
    model.updateMatrixWorld(true);
    let bones = 0;
    let meshes = 0;
    model.traverse((o: THREE.Object3D) => {
      if ((o as THREE.Bone).isBone) bones += 1;
      if ((o as THREE.Mesh).isMesh) {
        meshes += 1;
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });
    return {
      info: {
        bones,
        meshes,
        animations: animations.map((a) => a.name),
        heightM: rawHeight * scale,
        missingSockets: sockets.filter((s) => !model.getObjectByName(s.bone)).map((s) => s.id),
      },
      // The rest pose in its final layout: pose clips are solved against it.
      rest: captureRestPose(model),
    };
  }, [model, loaded, heightM, sockets, animations]);

  // The rig editor: drafts of this avatar replace the saved sockets / placements while they are being moved.
  const edit = useStudioStore((s) => s.edit);
  const draftSockets = useStudioStore((s) => (s.draftSockets?.avatarId === avatarId ? s.draftSockets.sockets : null));
  const draftPlacements = useStudioStore((s) => s.draftPlacements);
  const liveSockets = draftSockets ?? sockets;
  const editing = edit.mode !== "off";
  // While the rig is edited the avatar stands still: the clip and the body checks keep the sockets
  // they had (a drag writes the draft every frame), and take the edited ones once the editor closes.
  const [heldSockets, setHeldSockets] = useState(liveSockets);
  if (!editing && heldSockets !== liveSockets) setHeldSockets(liveSockets);
  const solveSockets = editing ? heldSockets : liveSockets;

  // Anatomical keyframes become a three.js clip for this very rig; a ready clip is used as it is.
  // A capture is retargeted (what matched is kept, for the side panel to say).
  const [resolvedClip, clipError, retarget] = useMemo<[THREE.AnimationClip | null, string | null, RetargetReport | null]>(() => {
    if (editorOpen && !draft) return [null, null, null]; // a held key pose: PoseRig holds it
    if (draft) {
      try {
        return [bakeDraftClip(model, draft, rest, solveSockets, draftSource?.poses[0]), null, null];
      } catch (error) {
        return [null, error instanceof Error ? error.message : String(error), null];
      }
    }
    if (!clip) return [null, null, null];
    try {
      if (isPoseClipJson(clip)) return [buildPoseClip(model, clip, rest, solveSockets), null, null];
      if (isMocapClip(clip)) {
        const { clip: retargeted, report } = retargetToAvatar(model, clip, rest);
        if (!cleanMocap) return [retargeted, null, report];
        const cleaned = cleanupClip(model, retargeted, rest, DEFAULT_CLEANUP);
        if (process.env.NODE_ENV !== "production") console.info("[studio] mocap clean-up:", cleaned.report);
        return [cleaned.clip, null, report];
      }
      return [clip, null, null];
    } catch (error) {
      return [null, error instanceof Error ? error.message : String(error), null];
    }
  }, [clip, draft, draftSource, editorOpen, model, rest, solveSockets, cleanMocap]);
  useEffect(() => {
    if (clipError) onClipError?.(clipError);
  }, [clipError, onClipError]);

  // The capture being played, for the side panel to turn into key poses (the clip the stage plays, clean-up included).
  usePublishCapture({ report: retarget, clip: resolvedClip, mocap: isMocapClip(clip) ? clip : null, avatarId, model, rest });

  // The clip on screen, checked as a body on this rig once the edits settle.
  usePoseChecks(model, rest, solveSockets, clip);

  // The camera frames the body once it shows something new: this avatar, another clip, the pose
  // editor, the rig editor (beside its panel, in the free part of the stage).
  const shown = editing ? "rig" : editorOpen ? "editor" : resolvedClip;
  useEffect(() => {
    showBody(model);
    return () => showBody(null);
  }, [model, rest, shown]);

  useEffect(() => {
    onModelInfo?.(info);
    useStudioStore.getState().setModelBones(boneNames(model));
    return () => onModelInfo?.(null);
  }, [info, model, onModelInfo]);

  // The GPU resources of the clone go with it; the cached source scene stays until another avatar loads.
  useEffect(
    () => () => {
      model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry?.dispose();
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material?.dispose();
      });
    },
    [model],
  );

  const modelFor = (kind: EquipmentItem["kind"], code: string) => {
    const key = equipmentKey(kind, code);
    const saved = models[key];
    if (!saved) return undefined;
    const draft = draftPlacements[key];
    return draft ? { ...saved, placement: draft } : saved;
  };

  // Items by the socket they hang from; bilateral items are drawn between two bones (see below).
  const { socketGroups, bilateral, rootItems } = useMemo(() => {
    const groups = new Map<string, { socket: AvatarSocket; bone: THREE.Object3D; scale: number; items: EquipmentItem[] }>();
    const bilateral: { item: EquipmentItem; bone: THREE.Object3D; boneB: THREE.Object3D }[] = [];
    const rootItems: EquipmentItem[] = [];
    const groupFor = (socket: AvatarSocket) => {
      let group = groups.get(socket.id);
      if (!group) {
        const bone = model.getObjectByName(socket.bone) || model;
        group = { socket, bone, scale: 1 / (bone.getWorldScale(new THREE.Vector3()).x || 1), items: [] };
        groups.set(socket.id, group);
      }
      return group;
    };
    // Every socket gets a group, so the editor can show and move the empty ones too.
    for (const socket of liveSockets) groupFor(socket);
    for (const item of items) {
      if (item.kind !== "load") continue;
      const socket = liveSockets.find((s) => s.id === item.socket);
      const socketB = item.socket_b ? liveSockets.find((s) => s.id === item.socket_b) : undefined;
      const bone = socket ? model.getObjectByName(socket.bone) : undefined;
      const boneB = socketB ? model.getObjectByName(socketB.bone) : undefined;
      if (bone && boneB && bone !== boneB) bilateral.push({ item, bone, boneB });
      else if (socket) groupFor(socket).items.push(item);
      else rootItems.push(item);
    }
    return { socketGroups: [...groups.values()], bilateral, rootItems };
    // info changes whenever the model was re-laid out, which moves the bones' world scale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, liveSockets, model, info]);

  // Play the selected clip, else the model's own first animation. Not while editing the rig: the
  // avatar stands in its bind pose so sockets are placed on a still body.
  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model]);
  useEffect(() => () => mixer.uncacheRoot(model), [mixer, model]);
  const holding = editorOpen && !editorPlaying && !scrubbing;
  // The pose editor's frame (held pose, drag, points) runs after the mixer, so its points sit on the bones as drawn.
  const poseFrame = useRef<(() => void) | null>(null);
  useClipPlayback({ mixer, model, rest, clip: resolvedClip, fallback: animations[0] ?? null, editing, holding, poseFrame });

  const supports = items.filter((i) => i.kind === "support");
  // In the rig editor each point (a socket, or a generated model's placement) registers the group its numbers move.
  const modelRef = (kind: EquipmentItem["kind"], code: string) => (edit.mode === "model" ? rigTargetRef(equipmentKey(kind, code)) : undefined);

  return (
    <>
      <primitive object={model} />
      {socketGroups.map((g) => {
        const { offset, quaternion } = socketTransform(g.socket);
        const show = (showEquipment && g.items.length > 0) || edit.mode === "sockets";
        if (!show) return null;
        return (
          // The key belongs to the element in this list (the portal), not to the group inside it.
          <Fragment key={g.socket.id}>
            {createPortal(
              // Outer group: bone units → metres. Inner group: the socket itself (offset in metres,
              // rotation), which is what the rig editor moves in sockets mode (its point is drawn by rig-points-layer.tsx).
              <group scale={g.scale}>
                <group ref={edit.mode === "sockets" ? rigTargetRef(g.socket.id) : undefined} position={offset} quaternion={quaternion}>
                  {showEquipment
                    ? g.items.map((item, i) => (
                        <EquipmentMesh
                          key={`${item.code}-${i}`}
                          item={item}
                          index={i}
                          model={modelFor("load", item.code)}
                          editRef={modelRef("load", item.code)}
                          // A grip is defined for the right hand; the left hand gets its mirror image.
                          mirrored={g.socket.id === "hand_l" || /left/i.test(g.socket.bone)}
                        />
                      ))
                    : null}
                </group>
              </group>,
              g.bone,
            )}
          </Fragment>
        );
      })}
      {showEquipment
        ? bilateral.map((b, i) => (
            <BilateralAttachment key={`${b.item.code}-both-${i}`} a={b.bone} b={b.boneB}>
              <EquipmentMesh
                item={b.item}
                index={i}
                model={modelFor("load", b.item.code)}
                alignLongAxis
                editRef={modelRef("load", b.item.code)}
              />
            </BilateralAttachment>
          ))
        : null}
      {showEquipment
        ? rootItems.map((item, i) => (
            <EquipmentMesh key={`${item.code}-root-${i}`} item={item} index={i} model={modelFor("load", item.code)} editRef={modelRef("load", item.code)} />
          ))
        : null}
      {showEquipment
        ? supports.map((item, i) => (
            <EquipmentMesh
              key={`${item.code}-${i}`}
              item={item}
              index={i}
              model={modelFor("support", item.code)}
              editRef={modelRef("support", item.code)}
            />
          ))
        : null}
      <PoseRig model={model} rest={rest} sockets={liveSockets} frameRef={poseFrame} />
      {editing ? <RigEditScene avatarId={avatarId} sockets={sockets} /> : null}
    </>
  );
}
