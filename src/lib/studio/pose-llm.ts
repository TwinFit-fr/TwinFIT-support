/**
 * Turns the catalog pose texts (images.exercise_poses, one per frame) into anatomical angles with
 * OpenAI structured outputs. Server side only. The model only has to read angles already written
 * in the texts ("knees at about 90°", "elbows bent 90°", "torso 45° from vertical") into a fixed
 * vocabulary; the kinematics happen in the viewer.
 */

import { createOpenAIClient } from "@/lib/images/openai";
import { POSE_SET_SCHEMA, sanitizePose, type PoseAngles } from "./anatomy";

export const DEFAULT_POSE_LLM_MODEL = "gpt-5-mini";

const SYSTEM_PROMPT = `You convert written exercise poses into joint angles for a 3D avatar.

You receive one exercise (name, description, equipment) and the exact text of its three frames: start (0), mid (1) and end (2) of one repetition. Return one angle set per frame, in that order.

Conventions (degrees; the avatar faces +Z, its left is +X):
- orientation: standing when the feet carry the body; prone (face down: plank, push-up), supine (on the back), side_lying, kneeling, seated (on a bench or the floor), hanging (from a bar).
- hips.pitch tilts the WHOLE body at the pelvis: 0 upright, 45 a hip hinge, 90 horizontal face down, -90 lying on the back. Keep the spine neutral (torso.flexion 0) unless the text says the back rounds or arches.
- hips.height_m: pelvis height above the floor only when not standing (prone about 0.25 in a plank, supine about 0.15, seated on a bench about 0.5); null when standing.
- hips.forward_m: pelvis shift from the standing position; a hinge sends it back (-0.1 to -0.2), a squat slightly back (-0.05).
- Shoulders: abduction 0 = arm hanging, 90 = out to the side, 180 = overhead; flexion 0 = frontal plane, 90 = pointing forward. An arm hanging at the side is abduction 10, flexion 0. Hands at the shoulders for a press: abduction about 80, flexion about 20, elbow 110. Arms locked out overhead: abduction 170, flexion 10, elbow 5. A push-up top: abduction 60, flexion 85, elbow 5; push-up bottom: elbow 90.
- Elbows: 0 straight, 90 right angle. Knees: 0 straight, 90 right angle, 120-130 a deep squat. Hip flexion: 0 standing tall, 90 thigh horizontal, 110-120 a deep squat; in a hinge the hip flexion equals the hips.pitch (thighs stay near vertical).
- Ankle dorsiflexion rises with knee flexion while standing (about 0.2 x knee flexion).
- Read the angles the text gives; interpolate sensibly when it gives a range; when a joint is not mentioned keep it near neutral and consistent with the frame. Use the same values for both sides unless the text describes an asymmetry (lunges, single-arm rows, side planks).
- Frames must be physically consistent with each other: the same orientation across the three frames unless the movement itself changes it.
- implement: when the message says the exercise uses a two-handed implement, give its centre (height above the floor, forward of the standing midline) and the grip width in EVERY frame, read from the text ("bar at mid-thigh", "bar over mid-foot", "locked out overhead", "at the shoulders") and scaled to the avatar height; the arms are then solved to reach it, so make the implement position the truthful one and let the shoulder / elbow angles be approximate. Otherwise implement is null.`;

export type PoseSetResult = { poses: PoseAngles[]; notes: string; usage: Record<string, unknown> };

export async function extractPoseAngles(input: {
  model?: string | null;
  exerciseName: string;
  description: string;
  equipment: string;
  avatarHeightM: number | null;
  poses: { position: number; pose: string }[];
  /** The exercise's load is held with both hands (a barbell, a plate): ask for the implement position. */
  twoHanded: boolean;
  /** Catalog grip code (STANDARD, WIDE, NARROW, UNDERHAND, HAMMER, MIXED). */
  grip: string | null;
}): Promise<PoseSetResult> {
  const model = input.model?.trim() || DEFAULT_POSE_LLM_MODEL;
  const frames = [...input.poses]
    .sort((a, b) => a.position - b.position)
    .map((p) => `Frame ${p.position} (${["start", "mid", "end"][p.position] ?? p.position}):\n${p.pose.trim()}`)
    .join("\n\n");
  const user = [
    `Exercise: ${input.exerciseName}`,
    `Equipment: ${input.equipment}`,
    input.twoHanded
      ? `The load is a two-handed implement held in both hands${input.grip ? ` with a ${input.grip.toLowerCase()} grip` : ""}: fill "implement" in every frame.`
      : `No two-handed implement: "implement" is null.`,
    input.avatarHeightM ? `Avatar height: ${input.avatarHeightM.toFixed(2)} m` : null,
    input.description.trim() ? `Description: ${input.description.trim()}` : null,
    "",
    frames,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const completion = await createOpenAIClient().chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: user },
    ],
    response_format: { type: "json_schema", json_schema: POSE_SET_SCHEMA },
  });
  const content = completion.choices[0]?.message?.content ?? "";
  let parsed: { poses?: PoseAngles[]; notes?: string };
  try {
    parsed = JSON.parse(content) as { poses?: PoseAngles[]; notes?: string };
  } catch {
    throw new Error("The pose model returned no JSON");
  }
  const poses = (parsed.poses ?? []).map(sanitizePose);
  if (poses.length !== 3) throw new Error(`The pose model returned ${poses.length} frames instead of 3`);
  return {
    poses,
    notes: parsed.notes?.trim() ?? "",
    usage: {
      model,
      prompt_tokens: completion.usage?.prompt_tokens ?? null,
      completion_tokens: completion.usage?.completion_tokens ?? null,
    },
  };
}
