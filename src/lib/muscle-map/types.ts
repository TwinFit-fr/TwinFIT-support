import type { GenerationParams } from "@/lib/images/types";
import type { AdjustParams } from "./mask-ops";

/**
 * Muscle map prototype B (schema `muscle_map`, staff only): one blank body per view and one
 * mask per muscle, painted by the client. Independent of `images` (own params, prompts, colors).
 */
export const MAP_VIEWS = ["front", "back", "side"] as const;
export type MapView = (typeof MAP_VIEWS)[number];
export const MAP_VIEW_LABEL: Record<MapView, string> = {
  front: "Front",
  back: "Back",
  side: "Side",
};

/** Normalized bounding box (0..1) of a mask. */
export type Rect = { x: number; y: number; w: number; h: number };

export type MuscleMapSettings = {
  target_color: string;
  secondary_color: string;
  key_color: string;
  /** Image model params; may omit fields (merged with the defaults before use). */
  generation: Partial<GenerationParams>;
  base_prompt: string;
  mask_prompt: string;
  updated_at: string;
};

export type CatalogMuscle = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  active?: boolean;
};

/** A paintable muscle and the one view it is drawn on. */
export type MapMuscle = {
  muscle_id: string;
  view: MapView;
  muscle: CatalogMuscle;
};

export type MapBase = {
  id: string;
  view: MapView;
  file_id: string;
  image_url: string;
  width: number;
  height: number;
  active: boolean;
  /** Empty for uploads. */
  model: string;
  prompt: string;
  params: Record<string, unknown>;
  created_at: string;
};

export type MaskMethod = "generated" | "uploaded" | "copied";

/** What a mask's `params` holds: how it was made and adjusted. */
export type MaskParams = {
  generation?: Partial<GenerationParams>;
  adjust?: AdjustParams;
  copied_from?: string;
};

export type MapMask = {
  id: string;
  base_id: string;
  muscle_id: string;
  view: MapView;
  file_id: string;
  source_file_id: string | null;
  image_url: string;
  rect: Rect | null;
  method: MaskMethod;
  active: boolean;
  /** Empty for uploads. */
  model: string;
  prompt: string;
  params: MaskParams;
  created_at: string;
};

export type MuscleMapBoard = {
  settings: MuscleMapSettings;
  muscles: MapMuscle[];
  bases: MapBase[];
  masks: MapMask[];
  /** Every catalog muscle, to add paintable ones. */
  catalog_muscles: CatalogMuscle[];
};
