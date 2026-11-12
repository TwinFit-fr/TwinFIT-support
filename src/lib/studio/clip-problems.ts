/**
 * A clip row whose file the Studio cannot use, in words for the people who animate: a capture
 * that does not load (a damaged or mislabelled file, a skeleton with no hips), or a .json clip
 * that is not made of poses. The loaders' own messages ("THREE.FBXLoader: Unknown format.") are
 * turned into a sentence that says what is wrong and what can be done. Pure.
 */

/** The capture files (as capture-convert.ts isCaptureFormat; kept here so this module needs no three.js). */
const CAPTURE = new Set(["fbx", "bvh", "glb", "gltf"]);

export type ClipProblem = {
  /** "unreadable": the file does not load at all; "not-poses": a .json clip that plays but holds no poses. */
  kind: "unreadable" | "not-poses";
  /** One short line: "Capture #800 could not be read". */
  title: string;
  /** What is wrong with the file and what to do, in a sentence or two. */
  detail: string;
  /** A few words for the stage's status line: "not a valid FBX file". */
  short: string;
};

const FILE_KIND: Record<string, string> = { fbx: "FBX", bvh: "BVH", glb: "GLB", gltf: "glTF", json: "JSON" };

/** "Capture #800", "Clip #801". */
export function clipName(format: string | null | undefined, seq: number | null): string {
  const noun = CAPTURE.has(format ?? "") ? "Capture" : "Clip";
  return seq !== null ? `${noun} #${seq}` : `This ${noun.toLowerCase()}`;
}

const FIX = "Upload the file again from Clips & queue, or start from the template.";

/**
 * The problem of a clip whose file failed to load ("load") or to go onto the avatar ("solve");
 * `error` is the raw message.
 */
export function unreadableClip(error: string, format: string | null | undefined, seq: number | null, step: "load" | "solve" = "load"): ClipProblem {
  const name = clipName(format, seq);
  const kind = FILE_KIND[format ?? ""] ?? (format ? format.toUpperCase() : "clip");
  const title = `${name} could not be read`;
  const http = /\((\d{3})\)|responded with (\d{3})/.exec(error);
  if (http) {
    const status = Number(http[1] ?? http[2]);
    const why = status === 404 ? "the file is no longer in storage" : status === 401 || status === 403 ? "you are not allowed to open the file" : `the server answered ${status}`;
    return { kind: "unreadable", title, short: "file not downloaded", detail: `The file could not be downloaded: ${why}. ${FIX}` };
  }
  if (/failed to fetch|networkerror|load failed/i.test(error)) {
    return { kind: "unreadable", title, short: "file not downloaded", detail: `The file could not be downloaded: check the connection and try again. ${FIX}` };
  }
  if (/no hips bone/i.test(error)) {
    return {
      kind: "unreadable",
      title,
      short: "skeleton not recognised",
      detail: `Its skeleton has no hips bone the Studio recognises, so it cannot be put on the avatar. Export it with a standard humanoid skeleton (Mixamo or DeepMotion names). ${FIX}`,
    };
  }
  if (/has no animation/i.test(error)) {
    return { kind: "unreadable", title, short: "no motion in the file", detail: `The ${kind} file holds a model but no motion. ${FIX}` };
  }
  if (/keyframe file has no tracks/i.test(error)) {
    return { kind: "unreadable", title, short: "neither poses nor keyframes", detail: `The JSON file holds neither poses nor keyframe tracks, so there is nothing to play or edit. ${FIX}` };
  }
  if (step === "solve") {
    return { kind: "unreadable", title, short: "does not fit this avatar", detail: `Its motion could not be put on this avatar's skeleton. Try another avatar, or upload the file again from Clips & queue.` };
  }
  // A loader that could not parse the file at all ("Unknown format", "HIERARCHY expected", a JSON parse error).
  return { kind: "unreadable", title, short: `not a valid ${kind} file`, detail: `The file is not a valid ${kind} file: it may be damaged, or saved in another format under this name. ${FIX}` };
}

/** A .json clip that is not made of poses (a keyframe clip): it plays as it is but has nothing for the pose editor. */
export function notPosesClip(seq: number | null): ClipProblem {
  const name = clipName("json", seq);
  return {
    kind: "not-poses",
    title: `${name} is not made of poses`,
    short: "keyframes, not poses",
    detail: `It is a keyframe clip: it plays as it is, but has no key poses to open in the editor. Start from the template to make an editable version; the clip stays as it is.`,
  };
}

/** The status line of the stage for a clip that failed: "Capture #800 could not be read · not a valid FBX file". */
export function stageProblemText(problem: ClipProblem): string {
  return `${problem.title} · ${problem.short}`;
}
