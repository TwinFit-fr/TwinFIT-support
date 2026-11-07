/**
 * The catalog's pose texts (images.exercise_poses) mix two ways of writing a joint angle: flexion
 * ("knees bent 20°", straight is 0) and the included angle ("knees at about 160°", straight is
 * 180), and almost all of them are unreviewed model output. They belong to the Images tool and
 * feed its prompts, so they are not rewritten: what the Studio reads is normalised here, on the
 * way to the pose model, by spelling out the flexion next to every included angle it can tell.
 */

const JOINT = "(?:hips?|knees?|elbows?)";
/** "knees at about 160°", "hip angle near 170 degrees", "elbows around 150°". */
const INCLUDED = new RegExp(`\\b(${JOINT})(?:\\s+(?:joints?|angles?))?\\s+(?:are |is |remain |stay |held |kept )?(?:at|near|around|of)\\s+(?:about |approximately |roughly |nearly |almost |~)?(\\d{2,3})\\s*(?:°|degrees?)`, "gi");
/** Below this "at N°" is more likely flexion than an included angle: a knee "at 90°" is the same either way. */
const INCLUDED_FROM = 100;

export type NormalizedText = { text: string; included: number };

export function normalizePoseText(text: string): NormalizedText {
  let included = 0;
  const out = text.replace(INCLUDED, (match, joint: string, value: string) => {
    const angle = Number(value);
    if (angle < INCLUDED_FROM || angle > 180) return match;
    included += 1;
    return `${match} (${joint} flexion ${180 - angle}°)`;
  });
  return { text: out, included };
}
