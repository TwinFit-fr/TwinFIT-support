import { z } from "zod";
import { INCLINATIONS, LATERALITIES, WIDTHS } from "./facets.ts";
import type { ExercisePayload } from "./normalize.ts";

/**
 * Bodies of the catalog API routes. They check shapes and sizes; the catalog functions keep their
 * own rules (codes that exist, completeness, guard rails), so values stay as loose as the editors
 * send them (codes as typed, numbers as text from inputs).
 */

const code = z.string().max(100);
const optionalCode = code.nullish();
const name = z.string().max(300);
const longText = z.string().max(20_000);
/** A number field as an input sends it: a number, or its text (blank = default). */
const numeric = z.union([z.number(), z.string().max(40)]).nullish();
/** `exo_id`: a positive integer, or its digits. */
export const exoIdSchema = z.union([
  z.int().positive(),
  z.string().trim().regex(/^\d{1,9}$/, "exo_id must be a positive integer"),
]);

const exerciseLocalization = z.object({
  display_name: name.nullish(),
  description: longText.nullish(),
});

/** Compose and update bodies (`ExercisePayload`, legacy aliases included). */
export const exercisePayloadSchema = z.object({
  exo_id: exoIdSchema.optional(),
  display_name: name.optional(),
  description: longText.nullish(),
  primary_muscle_group_code: optionalCode,
  muscle_group: optionalCode,
  movement_type_code: optionalCode,
  movement_type: optionalCode,
  equipment_code: optionalCode,
  equipment: optionalCode,
  support_equipment_code: optionalCode,
  support_equipment: optionalCode,
  variation_code: optionalCode,
  variation: optionalCode,
  position_code: optionalCode,
  position: optionalCode,
  grip_code: optionalCode,
  grip: optionalCode,
  load_modality_code: optionalCode,
  load_modality: optionalCode,
  logging_mode_code: optionalCode,
  logging_mode: optionalCode,
  target_muscle_code: optionalCode,
  secondary_muscle_codes: z.array(code).max(50).optional(),
  muscles_inherited: z.boolean().optional(),
  muscles_custom_reason: z.string().max(2000).nullish(),
  taxonomy_status: z.string().max(40).optional(),
  taxonomy_notes: z.string().max(5000).nullish(),
  body_mass_coefficient: numeric,
  default_pulley_ratio: numeric,
  // Facets of backend 2.10.0: closed CHECK lists, so the values are checked here.
  width: z.enum(WIDTHS).optional(),
  inclination: z.enum(INCLINATIONS).optional(),
  laterality: z.enum(LATERALITIES).optional(),
  app_visible: z.boolean().optional(),
  localizations: z
    .object({
      en: exerciseLocalization.optional(),
      es: exerciseLocalization.optional(),
      fr: exerciseLocalization.optional(),
    })
    .optional(),
}) satisfies z.ZodType<ExercisePayload>;

export const deactivateSchema = z.object({ exo_id: exoIdSchema });

/** Labels per catalog locale (`en` required by the functions that need it). */
const labels = z.object({
  en: name.nullish(),
  es: name.nullish(),
  fr: name.nullish(),
});

const table = z.string().max(64);
const pairKeys = { muscle_group_code: code, movement_type_code: code };

/** Body of `POST /api/catalog/taxonomy`, by `kind`; no kind adds (or finds) a lookup row. */
export const taxonomyActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("relation"),
    action: z.enum(["link", "unlink"], { error: "action must be link|unlink" }),
    relationKind: z.enum(["muscle", "movement"]).optional(),
    relation_kind: z.enum(["muscle", "movement"]).optional(),
    muscle_group_code: code,
    code,
    role: z.string().max(40).optional(),
  }),
  z.object({ kind: z.literal("group_movement_labels"), ...pairKeys, labels: labels.optional() }),
  z.object({
    kind: z.literal("pair_muscles"),
    ...pairKeys,
    target_muscle_code: code,
    secondary_muscle_codes: z.array(code).max(50).optional(),
  }),
  z.object({
    kind: z.literal("pair_strength_pattern"),
    ...pairKeys,
    strength_pattern: z.string().max(100).nullish(),
  }),
  z.object({
    kind: z.literal("update"),
    table,
    id: z.guid({ error: "id required" }),
    name: name.nullish(),
    labels: labels.optional(),
    active: z.boolean().nullish(),
    sort_order: z.int().nullish(),
    description: z.string().max(5000).nullish(),
    body_region_code: optionalCode,
  }),
  z.object({
    kind: z.literal("upsert").optional(),
    table,
    code,
    name: name.nullish(),
    labels: labels.optional(),
    muscle_group_code: optionalCode,
    role: z.string().max(40).optional(),
    body_region_code: optionalCode,
  }),
]);

export type TaxonomyAction = z.infer<typeof taxonomyActionSchema>;
