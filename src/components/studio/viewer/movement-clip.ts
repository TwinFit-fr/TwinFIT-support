"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";
import { isPoseClipJson, type PoseClipJson } from "@/lib/studio/anatomy";
import { loadMocap, type MocapClip } from "@/lib/studio/mocap";
import type { VectorFormat } from "@/lib/studio/types";

/**
 * Keyframe JSON accepted as a movement vector of format `json`:
 *   { "fps"?: number,
 *     "tracks": { "<boneName>": { "rotation"?: [[t, x, y, z, w], ...], "position"?: [[t, x, y, z], ...] } } }
 * Times in seconds, rotations as quaternions, positions in the avatar's units.
 * A bone name may also map straight to a rotation array (shorthand).
 */
type JsonTrack = { rotation?: number[][]; position?: number[][] } | number[][];
type JsonClip = { fps?: number; duration?: number; tracks: Record<string, JsonTrack> };

export function clipFromJson(data: JsonClip, name = "movement"): THREE.AnimationClip {
  const tracks: THREE.KeyframeTrack[] = [];
  for (const [bone, track] of Object.entries(data.tracks ?? {})) {
    const rotation = Array.isArray(track) ? track : track.rotation;
    const position = Array.isArray(track) ? undefined : track.position;
    if (rotation?.length) {
      tracks.push(
        new THREE.QuaternionKeyframeTrack(
          `${bone}.quaternion`,
          rotation.map((k) => k[0]),
          rotation.flatMap((k) => k.slice(1, 5)),
        ),
      );
    }
    if (position?.length) {
      tracks.push(
        new THREE.VectorKeyframeTrack(
          `${bone}.position`,
          position.map((k) => k[0]),
          position.flatMap((k) => k.slice(1, 4)),
        ),
      );
    }
  }
  if (!tracks.length) throw new Error("The keyframe file has no tracks");
  return new THREE.AnimationClip(name, data.duration ?? -1, tracks);
}

/**
 * What the canvas receives: a keyframe clip ready to play, anatomical keyframes it solves on the
 * loaded rig (pose-clip.ts), or a mocap file it retargets to the rig (mocap.ts).
 */
export type LoadedClip = THREE.AnimationClip | PoseClipJson | MocapClip;

export type ClipState = {
  clip: LoadedClip | null;
  loading: boolean;
  error: string | null;
};

type Loaded = { key: string; clip: LoadedClip | null; error: string | null };

/** Load the clip of a movement vector: glb / gltf / fbx / bvh (retargeted in the canvas) or json. */
export function useMovementClip(url: string | null, format: VectorFormat | null): ClipState {
  // The result is keyed by what was asked for: a request in flight is simply one whose key is not
  // the current one, so no state is written synchronously when the inputs change.
  const key = url && format ? `${format}:${url}` : null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!url || !format || !key) return;
    let cancelled = false;

    const load = async (): Promise<LoadedClip> => {
      if (format === "glb" || format === "gltf" || format === "fbx" || format === "bvh") {
        return loadMocap(url, format);
      }
      if (format === "json") {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Clip download failed (${res.status})`);
        const data = (await res.json()) as unknown;
        if (isPoseClipJson(data)) return data;
        return clipFromJson(data as JsonClip);
      }
      throw new Error(`Format ${format} is not played in the viewer yet`);
    };

    load().then(
      (clip) => {
        if (!cancelled) setLoaded({ key, clip, error: null });
      },
      (err: unknown) => {
        if (!cancelled)
          setLoaded({ key, clip: null, error: err instanceof Error ? err.message : String(err) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [url, format, key]);

  if (!key) return { clip: null, loading: false, error: null };
  if (!loaded || loaded.key !== key) return { clip: null, loading: true, error: null };
  return { clip: loaded.clip, loading: false, error: loaded.error };
}
