/**
 * What a capture leaves out, in the body-part words the staff use: the parts of the avatar it
 * does not move (a capture without arm bones) and its own bones the avatar has nothing for
 * (fingers, a jaw). Shown with the origin of poses made from a capture. Pure.
 */

import type { Logical } from "./pose-clip.ts";

/** The avatar's body parts by the bone that carries each one. */
const PARTS: [string, Logical][] = [
  ["pelvis", "Hips"],
  ["spine", "Spine"],
  ["head", "Head"],
  ["left arm", "LeftArm"],
  ["left forearm", "LeftForeArm"],
  ["left hand", "LeftHand"],
  ["right arm", "RightArm"],
  ["right forearm", "RightForeArm"],
  ["right hand", "RightHand"],
  ["left leg", "LeftUpLeg"],
  ["left lower leg", "LeftLeg"],
  ["left foot", "LeftFoot"],
  ["right leg", "RightUpLeg"],
  ["right lower leg", "RightLeg"],
  ["right foot", "RightFoot"],
];

/** A part is not named when the larger part holding it is already missing (no "left hand" after "left arm"). */
const WITHIN: Record<string, string> = {
  "left forearm": "left arm",
  "left hand": "left arm",
  "right forearm": "right arm",
  "right hand": "right arm",
  "left lower leg": "left leg",
  "left foot": "left leg",
  "right lower leg": "right leg",
  "right foot": "right leg",
};

/** "a", "a and b", "a, b and c". */
export function listWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** Left and right of the same part become one plural ("left arm" + "right arm" -> "arms"). */
function pairUp(parts: string[]): string[] {
  const out: string[] = [];
  for (const part of parts) {
    const m = /^(left|right) (.+)$/.exec(part);
    if (m && parts.includes(`${m[1] === "left" ? "right" : "left"} ${m[2]}`)) {
      if (m[1] === "left") out.push(m[2].endsWith("foot") ? m[2].replace(/foot$/, "feet") : `${m[2]}s`);
      continue;
    }
    out.push(part);
  }
  return out;
}

/**
 * The body parts the avatar has and the capture does not move: `present` says whether the
 * avatar has a bone, `driven` whether the capture moves it.
 */
export function missingParts(present: (logical: Logical) => boolean, driven: (logical: Logical) => boolean): string[] {
  const missing = PARTS.filter(([, logical]) => present(logical) && !driven(logical)).map(([word]) => word);
  return pairUp(missing.filter((word) => !(WITHIN[word] && missing.includes(WITHIN[word]))));
}

/** One sentence on what the capture does not move, or null. */
export function missingSentence(parts: string[]): string | null {
  if (!parts.length) return null;
  const plural = parts.length > 1 || /s$|feet$/.test(parts[0]);
  return `The capture has no ${listWords(parts)}: ${plural ? "they stay" : "it stays"} in the starting position.`;
}

/** Bones of the capture with nothing on the avatar, as body parts (end markers and helpers are not motion). */
export function unusedParts(sourceBones: string[]): string[] {
  const words = new Set<string>();
  let other = 0;
  for (const raw of sourceBones) {
    const name = raw.toLowerCase();
    if (!name || /endsite|_end$|end$|nub|site/.test(name)) continue;
    if (/thumb|index|middle|ring|pinky|little|finger|digit|metacarpal/.test(name)) words.add("fingers");
    else if (/jaw|eye|tongue|brow|lip|teeth|face|cheek/.test(name)) words.add("face");
    else if (/toe|ball/.test(name)) words.add("toes");
    else if (/twist|roll/.test(name)) words.add("twist bones");
    else if (/root|reference|ctrl|control|ik|pole|prop|weapon|attach/.test(name)) words.add("helper bones");
    else if (/spine|chest|back|abdomen/.test(name)) words.add("extra spine bones");
    else if (/neck/.test(name)) words.add("extra neck bones");
    else if (/head/.test(name)) words.add("top of the head");
    else other += 1;
  }
  const out = [...words];
  if (other) out.push(`${other} other bone${other === 1 ? "" : "s"}`);
  return out;
}

/** One sentence on the capture's bones that were not used, or null. */
export function unusedSentence(parts: string[]): string | null {
  return parts.length ? `Not used from the capture: ${listWords(parts)}.` : null;
}
