import type { Subject } from "./types";

/** Which images an exercise frame sends, in input order: primary, support, equipment, references, logo. */
export type FrameInputs = {
  /** "start": the Start frame, drawn from the character; "edit": Mid/End, an edit of the Start. */
  kind: "start" | "edit";
  /** Input 1 is the character (start) or the Start frame (edit). */
  primary: boolean;
  support: boolean;
  equipment: boolean;
  references: { name: string; instruction: string }[];
  logo: boolean;
};

/**
 * Directives appended to an exercise frame prompt, each naming its input by number.
 * Mid/End keep the bench, machine and logo of the Start: the cards only keep shapes right.
 */
export function frameDirectives(inputs: FrameInputs): string[] {
  let n = 0;
  const primaryNo = inputs.primary ? ++n : null;
  const supportNo = inputs.support ? ++n : null;
  const equipmentNo = inputs.equipment ? ++n : null;
  const referenceNos = inputs.references.map(() => ++n);
  const logoNo = inputs.logo ? ++n : null;
  const edit = inputs.kind === "edit" && primaryNo !== null;
  const out: string[] = [];

  if (edit) {
    out.push(startGuideDirective(primaryNo, n > 1));
  } else if (primaryNo !== null) {
    out.push(
      `CHARACTER REFERENCE (INPUT IMAGE ${primaryNo}): the official character for this style. Draw exactly this same person — same face, hair, body type, skin tone, clothing, colors and illustration style. Do NOT copy the pose, framing or camera angle of the reference: use only the pose described above, and show any equipment it requires.`,
    );
  }
  if (supportNo !== null) {
    out.push(
      edit
        ? `SUPPORT EQUIPMENT CARD (INPUT IMAGE ${supportNo}): the same bench, machine or bars already drawn in input image ${primaryNo}. Do not move, rotate, mirror, resize or redraw it: keep it exactly where and how it is in input image ${primaryNo}. Use the card only to keep its shape and details correct.`
        : `SUPPORT EQUIPMENT REFERENCE (INPUT IMAGE ${supportNo}): the official support equipment for this style (bench, machine, bars, etc.). Draw exactly this same equipment — same shape, proportions, colors and illustration style. Place it where the exercise requires it. Do not invent a different bench or machine. Copy only the object, not the camera angle or the left/right orientation of this reference. Rotate or mirror it so the athlete faces its working side in the view described above.`,
    );
  }
  if (equipmentNo !== null) {
    out.push(
      edit
        ? `LOAD EQUIPMENT CARD (INPUT IMAGE ${equipmentNo}): the same equipment the athlete uses in input image ${primaryNo}. Keep the same size and look as in input image ${primaryNo}; it moves only with the hands, as the pose requires, and stays in the hands. Use the card only to keep its shape correct, not its angle or orientation.`
        : `LOAD EQUIPMENT REFERENCE (INPUT IMAGE ${equipmentNo}): the official load equipment of this exercise (dumbbell, barbell, kettlebell, cable machine, etc.). Draw exactly this same equipment — same shape, proportions, colors and illustration style. The athlete uses it as the exercise requires; do not invent a different one. Copy only the object, not the camera angle or the left/right orientation of this reference. Rotate or mirror it so the athlete faces its working side in the view described above.`,
    );
  }
  inputs.references.forEach((reference, i) =>
    out.push(libraryReferenceDirective(referenceNos[i], reference)),
  );
  if (logoNo !== null) out.push(logoDirective(logoNo));
  return out;
}

/** Appended to the system prompt when generating a character reference sheet. */
export function referenceSheetDirective(subject: Subject): string {
  return `CHARACTER REFERENCE SHEET: a single ${subject}, full body, standing upright in a neutral relaxed pose, front view, arms relaxed at the sides, feet hip-width apart, no equipment, centered with the whole body visible. This image will be reused as the reference for every exercise illustration, so keep the design clean and distinctive.`;
}

/** Mid/End: input image `primaryNo` is the Start frame to edit; `withCards` when more inputs follow. */
export function startGuideDirective(primaryNo = 1, withCards = false): string {
  const cards = withCards
    ? ` The other input images are reference cards only: never take their background, camera angle, orientation or position.`
    : "";
  return `EDIT OF THE START FRAME (INPUT IMAGE ${primaryNo}): input image ${primaryNo} is the start position of this same exercise and the image to edit. Keep EXACTLY the same character, face, clothing, chest logo, colors, illustration style, background, camera angle, zoom level and scale. Do not move, resize or re-frame the person. Everything that does not move in this exercise — the bench, machine or bars, and the feet while they stay planted — keeps exactly the same place, size and orientation as in input image ${primaryNo}. Change ONLY the body pose, and the equipment the hands move, to the position described above.${cards}`;
}

/** The whole prompt of an edit: the input image is the current version; change only this. */
export function imageEditDirective(instruction: string): string {
  return `EDIT OF THIS IMAGE: the input image is the current version. Apply ONLY this change: ${instruction.trim()}

Keep everything else EXACTLY the same: character, face, clothing, colors, illustration style, background, camera angle, zoom level, scale and position in the frame.`;
}

/** Appended whenever the brand logo is one of the input images (`inputNumber`, 1-based, when known). */
export function logoDirective(inputNumber?: number): string {
  const which = inputNumber ? `input image ${inputNumber}` : "one of the input images";
  return `BRAND LOGO: ${which} is the brand symbol (on a transparent background). Print exactly this symbol — same shape and same colors, no added text or letters — small on the left side of the chest of the character's shirt (the wearer's left), not centered. Do not draw the symbol anywhere else and do not copy its background.`;
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
  kind: "characters" | "supports" | "equipment" | "brand" | "frames" | "library",
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

export function equipmentFileName(
  styleCode: string,
  equipmentCode: string,
  extension: string,
): string {
  return styleAssetPath(
    styleCode,
    "equipment",
    `${equipmentCode.toLowerCase()}_${Date.now()}.${extension}`,
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
