import { createOpenAIClient } from "./openai";
import { exerciseDetails, type ExerciseTaxonomy } from "./prompt";

/** Same model, system prompt and schema as TwinFIT-backend/scripts/catalog/generate_exercise_poses.py. */
export const POSE_MODEL = "gpt-5";

const SYSTEM_PROMPT = `You write exact body poses for an exercise illustration catalog. An image model will \
draw each pose from your text alone, so it must be unambiguous and physically correct.

For each exercise you receive the catalog taxonomy and a how-to description. Return three poses:
- position 0 START: the athlete set up and ready, right before the first rep begins.
- position 1 MID: halfway through the primary motion (the point where the movement changes visibly).
- position 2 END: the end of the primary motion (the peak contraction or the fully lowered/raised point), \
not the return to start.

Rules for every pose:
- One short paragraph (50-90 words), plain English, present tense, no bullets, no numbering.
- State the whole body: body orientation (standing, seated, lying face up/down, hanging, ...), torso angle \
in degrees from vertical or horizontal, head and gaze, shoulders, elbow angle in degrees, wrist/hand \
position and grip, hip and knee angles in degrees, feet position and stance width, which side is which.
- State where the equipment and the support (bench, bar, cable handle, dumbbells, machine pad, ...) are \
relative to the body, and what is fixed in place.
- Use the athlete's own left/right when it matters; for symmetric exercises say "both" explicitly. \
For unilateral exercises, always use the right side as the working side unless the description says otherwise.
- Describe only what is visible at that instant. Do not describe motion ("then", "rises", "moves"), \
tempo, breathing, muscles felt, or advice.
- Keep everything that does not move identical across the three poses (feet, bench, torso base, equipment \
anchors) and describe it with the same wording.
- Do not mention the camera, drawing style, clothing, or background.
- Draw the standard, most common way to perform the exercise under its name. Never invent equipment, \
supports, attachments, unilateral work or extra movements that the taxonomy and the description do not \
imply. If the name implies a typical setup, use it (a cable row is seated, low pulley, feet on the \
platform, both hands on the handle). Without equipment or support listed, there is none besides the floor.
- Give an angle or distance only where it defines the pose (torso, elbows, knees, hips, bar height); skip \
irrelevant precision such as toe-out angles, centimetres, or equipment brands and shapes.
- Follow the catalog taxonomy (body position, equipment, support, grip, variation) when the description is \
vague, and the description when the taxonomy is generic. Static holds and cardio still get a Start, Mid \
and End (use the entry, the held/steady phase and the exit, or the two extremes of one cycle).
`;

const RESPONSE_SCHEMA = {
  name: "exercise_poses",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["poses"],
    properties: {
      poses: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["position", "pose"],
          properties: {
            position: { type: "integer", enum: [0, 1, 2] },
            pose: { type: "string" },
          },
        },
      },
    },
  },
} as const;

/** Writes the Start / Mid / End poses of one exercise from its taxonomy and EN description. */
export async function generateExercisePoses(
  exercise: ExerciseTaxonomy & { display_name: string },
  description: string,
): Promise<{ position: number; pose: string }[]> {
  const details = exerciseDetails(exercise).replace(/^EXERCISE DETAILS[^\n]*\n/, "");
  const user = [
    `Exercise: ${exercise.display_name}`,
    details,
    `Description:\n${description.trim() || "(none)"}`,
  ]
    .filter(Boolean)
    .join("\n");
  const completion = await createOpenAIClient().chat.completions.create({
    model: POSE_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: user },
    ],
    response_format: { type: "json_schema", json_schema: RESPONSE_SCHEMA },
  });
  const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as {
    poses?: { position: number; pose: string }[];
  };
  const poses = [...(parsed.poses ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((item) => ({ position: item.position, pose: item.pose.trim() }));
  if (poses.map((item) => item.position).join() !== "0,1,2" || poses.some((item) => !item.pose)) {
    throw new Error("The model returned an invalid pose set");
  }
  return poses;
}
