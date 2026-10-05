import type { MuscleMapTargetKind, MuscleMapView, Subject } from "./types";

/** Appended when a generation uses the style character reference as input image. */
export const REFERENCE_USE_DIRECTIVE = `CHARACTER REFERENCE: the input image is the official character for this style. Draw exactly this same person — same face, hair, body type, skin tone, clothing, colors and illustration style. Do NOT copy the pose, framing or camera angle of the reference: use only the pose described above, and show any equipment it requires.`;

/** Appended when a Start generation also receives a support-equipment reference. */
export const SUPPORT_REFERENCE_DIRECTIVE = `SUPPORT EQUIPMENT REFERENCE: one of the input images is the official support equipment for this style (bench, machine, bars, etc.). Draw exactly this same equipment — same shape, proportions, colors and illustration style. Place it where the exercise requires it. Do not invent a different bench or machine.`;

/** Appended to the system prompt when generating a character reference sheet. */
export function referenceSheetDirective(subject: Subject): string {
  return `CHARACTER REFERENCE SHEET: a single ${subject}, full body, standing upright in a neutral relaxed pose, front view, arms relaxed at the sides, feet hip-width apart, no equipment, centered with the whole body visible. This image will be reused as the reference for every exercise illustration, so keep the design clean and distinctive.`;
}

/** Appended when Mid/End are produced by editing the exercise's Start frame. */
export const START_GUIDE_DIRECTIVE = `EDIT OF THE START FRAME: the input image is the start position of this same exercise. Keep EXACTLY the same character, face, clothing, colors, illustration style, background, camera angle, zoom level and scale. Keep the feet in exactly the same place and do not move, resize or re-frame the person. Change ONLY the body pose (and the equipment it holds) to the position described above.`;

/** Appended whenever the brand logo is one of the input images. */
export const LOGO_DIRECTIVE = `BRAND LOGO: one of the input images is the brand symbol (on a transparent background). Print exactly this symbol — same shape and same colors, no added text or letters — small and centered on the chest of the character's shirt. Do not draw the symbol anywhere else and do not copy its background.`;

/** Appended when a muscle map edits the style's blank body of that view. */
export function muscleBaseDirective(view: MuscleMapView): string {
  return `BODY MAP BASE: the first input image is this style's blank body map, ${view} view. Keep EXACTLY the same figure, pose, framing, scale, background, line work and colors. Change ONLY the fill of the muscles to highlight; never redraw or move the body.`;
}

/** Appended for each library reference sent; `inputNumber` is its 1-based input position. */
export function libraryReferenceDirective(
  inputNumber: number,
  reference: { name: string; instruction: string },
): string {
  const use = reference.instruction.trim() || "Use it as the visual reference for this detail.";
  return `REFERENCE IMAGE ${inputNumber} ("${reference.name}"): ${use}`;
}

export function styleAssetPath(
  styleCode: string,
  kind: "characters" | "supports" | "brand" | "frames" | "muscles" | "library",
  name: string,
): string {
  return `styles/${styleCode.toLowerCase()}/${kind}/${name}`;
}

export function characterFileName(styleCode: string, subject: Subject, extension: string): string {
  return styleAssetPath(styleCode, "characters", `${subject}_${Date.now()}.${extension}`);
}

export function supportFileName(styleCode: string, supportCode: string, extension: string): string {
  return styleAssetPath(
    styleCode,
    "supports",
    `${supportCode.toLowerCase()}_${Date.now()}.${extension}`,
  );
}

export function muscleBaseFileName(
  styleCode: string,
  view: MuscleMapView,
  extension: string,
): string {
  return styleAssetPath(styleCode, "muscles", `base_${view}_${Date.now()}.${extension}`);
}

export function muscleMapFileName(
  styleCode: string,
  target: { kind: MuscleMapTargetKind; code: string },
  view: MuscleMapView,
  extension: string,
): string {
  const prefix = target.kind === "muscle_group" ? "group" : "muscle";
  return styleAssetPath(
    styleCode,
    "muscles",
    `${prefix}_${target.code.toLowerCase()}_${view}_${Date.now()}.${extension}`,
  );
}

export function libraryReferenceFileName(
  styleCode: string,
  referenceId: string,
  extension: string,
): string {
  return styleAssetPath(styleCode, "library", `${referenceId}_${Date.now()}.${extension}`);
}

export function logoFileName(styleCode: string, extension: string): string {
  return styleAssetPath(styleCode, "brand", `logo_${Date.now()}.${extension}`);
}

export function frameFileName(
  styleCode: string,
  exoId: number,
  subject: Subject,
  position: number,
  extension: string,
): string {
  return styleAssetPath(
    styleCode,
    "frames",
    `exo_${exoId}/${subject}_p${position}_${Date.now()}.${extension}`,
  );
}
