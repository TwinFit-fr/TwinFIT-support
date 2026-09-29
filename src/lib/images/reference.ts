import type { Subject } from "./types";

/** Appended when a generation uses the global character reference as input image. */
export const REFERENCE_USE_DIRECTIVE = `CHARACTER REFERENCE: the input image is the official TwinFIT character. Draw exactly this same person — same face, hair, body type, skin tone, clothing, colors and illustration style. Do NOT copy the pose, framing or camera angle of the reference: use only the pose described above, and show any equipment it requires.`;

/** Appended to the system prompt when generating a reference sheet. */
export function referenceSheetDirective(subject: Subject): string {
  return `CHARACTER REFERENCE SHEET: a single ${subject}, full body, standing upright in a neutral relaxed pose, front view, arms relaxed at the sides, feet hip-width apart, no equipment, centered with the whole body visible. This image will be reused as the reference for every exercise illustration, so keep the design clean and distinctive.`;
}

export function referenceFileName(subject: Subject, extension: string): string {
  return `references/${subject}_${Date.now()}.${extension}`;
}

/** Appended when Mid/End are produced by editing the exercise's active Start frame. */
export const START_GUIDE_DIRECTIVE = `EDIT OF THE START FRAME: the input image is the start position of this same exercise. Keep EXACTLY the same character, face, clothing, colors, illustration style, background, camera angle, zoom level and scale. Keep the feet in exactly the same place and do not move, resize or re-frame the person. Change ONLY the body pose (and the equipment it holds) to the position described above.`;

/** Appended whenever the brand logo is one of the input images. */
export const LOGO_DIRECTIVE = `BRAND LOGO: one of the input images is the TwinFIT brand symbol (a stylized letter "T" on a transparent background). Print exactly this symbol — same shape and same colors, no added text or letters — small and centered on the chest of the navy t-shirt. Do not draw the symbol anywhere else and do not copy its background.`;

export function logoFileName(extension: string): string {
  return `brand/logo_${Date.now()}.${extension}`;
}
