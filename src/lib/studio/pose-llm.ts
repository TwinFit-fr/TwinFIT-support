/**
 * Drafts the key poses of an exercise as anatomical angles with OpenAI structured outputs, from
 * the catalog pose texts (images.exercise_poses) and frames. Server side only. The model reads
 * angles already written in the texts ("knees at about 90°", "torso 45° from vertical") into a
 * fixed vocabulary; the kinematics happen in the viewer.
 */

import { createOpenAIClient } from "@/lib/images/openai";
import { POSE_DRAFT_SCHEMA, jointLimitsText, sanitizePose, type LoopMode, type PoseAngles } from "./anatomy";

export const DEFAULT_POSE_LLM_MODEL = "gpt-5-mini";

/*
 * Every worked example below was solved on a rig before being written here, and pose-clip.test.ts
 * keeps them honest: change one there too. Wrong examples in this prompt have ruined clips before.
 */
const DRAFT_SYSTEM_PROMPT = `You convert a written exercise into the key poses of one repetition, as joint angles for a 3D avatar. An animator corrects them by hand afterwards.

ZERO. Every angle is measured from the anatomical position: standing erect, arms along the trunk, palms facing forward, feet parallel. A pose of all zeros is exactly that position. The avatar faces +Z, its left is +X, units are degrees and metres.

WHAT EACH ANGLE IS RELATIVE TO. This matters more than anything else here.
- hips.pitch is the lean of the pelvis and everything above it: 0 upright, 45 hinged forward, 90 face down, -90 on the back. A neutral spine keeps torso.flexion 0 at any lean; use torso.flexion only when the text says the back rounds or arches.
- Legs are relative to the pelvis, so the thigh's forward angle from vertical is hip_flexion minus hips.pitch. The shank's forward angle from vertical is that minus knee_flexion. A thigh parallel to the floor is 90 from vertical: at hips.pitch 35 that is hip_flexion 125.
- Arms are relative to the trunk, not to the floor. An arm hanging straight down while the trunk leans by hips.pitch P has shoulder_flexion P. An arm vertical in a plank is the same rule.

STANDING (orientation standing). feet_flat true means the soles stay on the floor: the ankles and the pelvis are worked out from the legs, so give no ankle_dorsiflexion (0), hips.height_m null and hips.forward_m 0. Only set hip and knee so that the thigh and shank angles above describe the leg you want. The pelvis goes back by itself in a hinge. feet_flat false is for lifted heels only (calf raise, tiptoe): there ankle_dorsiflexion is read, negative lifting the heels. A leg lifted off the floor keeps its own ankle value.

OTHER SUPPORTS (prone, supine, side_lying, kneeling, seated, hanging). Give hips.height_m. Lying face down or up also needs hips.pitch, the orientation does not turn the body by itself.

SHOULDERS AND FOREARMS.
- shoulder_abduction lifts the arm to the side (90 horizontal, 175 overhead), shoulder_flexion to the front (90 horizontal, 175 overhead). Do not combine them near 90 hoping to add up: with flexion near 90 abduction only twists the arm. For an arm straight in front use flexion alone.
- shoulder_rotation + is external. Forearms vertical with the elbows out to the side need about 90.
- forearm_pronation: 0 palm forward, 90 thumb forward (neutral: hammer grip, arms relaxed at the sides), 170 palm back. Those are for the arm in the anatomical position: the forearm turns with the humerus, so with shoulder_rotation 90 palms facing forward need forearm_pronation 90, as in the press below.

ANGLES IN THE TEXTS. Flexion angles are 0 when straight. Texts often give the included angle instead, where straight is 180: "knees at about 150", "hips at 170", "arms near 180". Convert those: flexion = 180 - included. A joint "slightly bent" is 10 to 20, never 160.

WORKED EXAMPLES (both sides alike, angles not listed are 0).
- Arms relaxed at the sides: forearm_pronation 90.
- Press at the shoulders: shoulder_abduction 80, shoulder_flexion 20, shoulder_rotation 90, elbow_flexion 110, forearm_pronation 90. Locked out overhead: shoulder_abduction 175, forearm_pronation 0.
- Front raise, palms down: shoulder_flexion 90, forearm_pronation 170. Lateral raise: shoulder_abduction 90, forearm_pronation 90.
- Top of a curl, palms up: elbow_flexion 140.
- Bottom of a parallel squat: hips.pitch 35, hip_flexion 125, knee_flexion 110, hip_abduction 8, hip_rotation 10, shoulder_flexion as the arms need.
- Romanian deadlift, bottom: hips.pitch 60, hip_flexion 75, knee_flexion 20, shoulder_flexion 60, forearm_pronation 170.
- Deadlift from the floor: hips.pitch 65, hip_flexion 130, knee_flexion 90, implement height_m 0.22, forward_m 0.05. Lockout: all legs 0, hips.pitch 0, implement height_m 0.80, forward_m 0.05 (arms hang straight, so the bar is at mid-thigh, not at the hips).
- Plank or top of a push-up: orientation prone, hips.pitch 70, hips.height_m 0.40, shoulder_flexion 70, forearm_pronation 170, wrist_flexion -70.
- Seated upright: orientation seated, hips.height_m 0.55, hip_flexion 90, knee_flexion 90.
- On a bench on the back, feet on the floor: orientation supine, hips.pitch -90, hips.height_m 0.55, knee_flexion 90, shoulder_flexion 90 for arms pointing up.

IMPLEMENT. When the message says the exercise uses a two-handed implement, give its centre (height above the floor, forward of the standing midline) and the grip width in EVERY pose, read from the text and scaled to the avatar height; the arms are solved to reach it, so the implement position is what must be true and the shoulder and elbow angles only steer the elbows. A bar reachable with straight arms must be within arm's length of the shoulders, and heights must agree with how low the body is in that pose. Otherwise implement is null.

KEY POSES. Return 2 to 6 poses in order, the first being the start position, each with a short label and transition_s (seconds taken to move into it; lowering phases are usually slower than lifting). Choose loop_mode pingpong when the repetition retraces the same poses backwards (presses, squats, curls, rows) and cycle when it returns to the start another way. Keep the same stance (hip_abduction, hip_rotation) in every pose unless the feet really move. Use the same values on both sides unless the exercise is unilateral. Keep the orientation across poses unless the movement itself changes it. Read the angles the text gives; when a joint is not mentioned keep it at 0.

Joint ranges of motion, degrees (never exceed them): ${jointLimitsText()}.

When images are attached they show the start, middle and end of the repetition: read trunk lean, knee and elbow angles, stance width, where the hands and the bar are, and prefer them over the text when the two disagree.`;

export type PoseDraftResult = {
  poses: PoseAngles[];
  labels: string[];
  /** Relative time into each pose (transition seconds as given). */
  weights: number[];
  mode: LoopMode;
  notes: string;
  usage: Record<string, unknown>;
};

type DraftContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail?: "low" | "high" | "auto" } };

export async function draftPoses(input: {
  model?: string | null;
  exerciseName: string;
  description: string;
  equipment: string;
  avatarHeightM: number | null;
  poses: { position: number; pose: string }[];
  twoHanded: boolean;
  grip: string | null;
  /** Catalog frames as data URIs or public URLs, start → mid → end. */
  images: string[];
  /** Free instructions from the animator ("5 poses", "deeper squat", "elbows tucked"). */
  instructions?: string | null;
  poseCount?: number | null;
}): Promise<PoseDraftResult> {
  const model = input.model?.trim() || DEFAULT_POSE_LLM_MODEL;
  const frames = [...input.poses]
    .sort((a, b) => a.position - b.position)
    .map((p) => `Frame ${p.position} (${["start", "mid", "end"][p.position] ?? p.position}):\n${p.pose.trim()}`)
    .join("\n\n");
  const text = [
    `Exercise: ${input.exerciseName}`,
    `Equipment: ${input.equipment}`,
    input.twoHanded
      ? `The load is a two-handed implement held in both hands${input.grip ? ` with a ${input.grip.toLowerCase()} grip` : ""}: fill "implement" in every pose.`
      : `No two-handed implement: "implement" is null.`,
    input.avatarHeightM ? `Avatar height: ${input.avatarHeightM.toFixed(2)} m` : null,
    input.description.trim() ? `Description: ${input.description.trim()}` : null,
    input.poseCount ? `Return exactly ${input.poseCount} poses.` : "Return as many poses as the movement needs (usually 3; 4 or 5 when there are distinct phases).",
    input.instructions?.trim() ? `Animator's instructions: ${input.instructions.trim()}` : null,
    "",
    frames,
    input.images.length ? `\nAttached: ${input.images.length} catalog frame(s) of this exercise, in order.` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");
  const content: DraftContentPart[] = [{ type: "text", text }, ...input.images.map((url) => ({ type: "image_url" as const, image_url: { url, detail: "low" as const } }))];

  const completion = await createOpenAIClient().chat.completions.create({
    model,
    messages: [
      { role: "system", content: DRAFT_SYSTEM_PROMPT },
      { role: "user", content },
    ],
    response_format: { type: "json_schema", json_schema: POSE_DRAFT_SCHEMA },
  });
  const raw = completion.choices[0]?.message?.content ?? "";
  let parsed: { poses?: (PoseAngles & { label?: string; transition_s?: number })[]; loop_mode?: string; notes?: string };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    throw new Error("The pose model returned no JSON");
  }
  const items = parsed.poses ?? [];
  if (items.length < 2) throw new Error(`The pose model returned ${items.length} poses`);
  return {
    poses: items.map((p) => sanitizePose(p)),
    labels: items.map((p, i) => p.label?.trim() || `Pose ${i + 1}`),
    weights: items.map((p) => (typeof p.transition_s === "number" && p.transition_s > 0 ? Math.min(10, p.transition_s) : 1)),
    mode: parsed.loop_mode === "cycle" ? "cycle" : "pingpong",
    notes: parsed.notes?.trim() ?? "",
    usage: { model, prompt_tokens: completion.usage?.prompt_tokens ?? null, completion_tokens: completion.usage?.completion_tokens ?? null, images: input.images.length },
  };
}
