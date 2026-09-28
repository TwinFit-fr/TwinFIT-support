export type ImagePromptKind = "system" | "exercise";

export type GenerationParams = {
  model: string;
  shape: string;
  size: string;
  background: string;
  format: string;
  quality: string;
};

export type ImagePrompt = {
  id: string;
  kind: ImagePromptKind;
  name: string;
  content: string;
  is_default: boolean;
  inserted_at: string;
  updated_at: string;
};

export type ExerciseImage = {
  id: string;
  exo_id: number;
  file_id: string;
  image_url: string;
  position: number | null;
  active: boolean;
  model: string;
  prompt: string;
  params: GenerationParams | Record<string, unknown>;
  usage: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ExerciseImageBoardItem = {
  id: string;
  exo_id: number;
  display_name: string;
  active: boolean;
  primary_muscle_group: { id: string; name: string } | null;
  equipment: { id: string; name: string } | null;
  description: string | null;
  image_count: number;
  active_count: number;
  active_positions: number[];
  preview_image: ExerciseImage | null;
  status: "complete" | "partial" | "inactive_only" | "empty";
};

export type ExerciseImageDetail = ExerciseImageBoardItem & {
  images: ExerciseImage[];
  assembled_prompt: string;
  localizations: { locale: string; display_name: string; description: string | null }[];
};

/** Positions for a 0→1→2→1→0 GIF sequence. */
export const FRAME_POSITIONS = [
  { id: 0, label: "Start" },
  { id: 1, label: "Mid" },
  { id: 2, label: "End" },
] as const;

export const IMAGES_BUCKET = "exercise-images";
export const PRESET_STORAGE_KEY = "twinfit.images.generationPreset";
