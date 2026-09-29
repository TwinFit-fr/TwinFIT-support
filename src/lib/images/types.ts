export type ImagePromptKind = "system" | "exercise" | "position";

export type GenerationParams = {
  model: string;
  shape: string;
  size: string;
  background: string;
  format: string;
  quality: string;
  compression: number;
  moderation: string;
  background_color: string;
  input_fidelity: string;
  max_concurrency: number;
};

export type Subject = "man" | "woman";
export type SubjectChoice = Subject | "random";
export const SUBJECTS: readonly Subject[] = ["man", "woman"];

export const POSITION_PROMPT_KEYS = ["start_prompt_id", "mid_prompt_id", "end_prompt_id"] as const;
export const REFERENCE_KEYS = {
  man: "man_reference_file_id",
  woman: "woman_reference_file_id",
} as const;

export type ImageSettings = {
  params: GenerationParams;
  system_prompt_id: string | null;
  start_prompt_id: string | null;
  mid_prompt_id: string | null;
  end_prompt_id: string | null;
  man_reference_file_id: string | null;
  woman_reference_file_id: string | null;
  updated_at: string;
  updated_by: string | null;
};

export type SettingsSelection = Pick<
  ImageSettings,
  "system_prompt_id" | "start_prompt_id" | "mid_prompt_id" | "end_prompt_id"
>;

/** Snapshot stored on each generated image. */
export type GenerationSnapshot = Partial<GenerationParams> & {
  target_position?: number;
  subject?: Subject;
  reference_file_id?: string | null;
  guide_image_id?: string | null;
  feet_shift_px?: number;
  system_prompt_id?: string | null;
  position_prompt_id?: string | null;
};

export type ImagePrompt = {
  id: string;
  kind: ImagePromptKind;
  position: number | null;
  name: string;
  content: string;
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
  params: GenerationSnapshot | null;
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
  active_frames: { position: number; image_url: string }[];
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

export type FramePosition = (typeof FRAME_POSITIONS)[number]["id"];

export function framePositionLabel(position: number | null | undefined): string {
  return FRAME_POSITIONS.find((p) => p.id === position)?.label ?? "—";
}

export function targetPosition(image: Pick<ExerciseImage, "params">): number | null {
  const value = image.params?.target_position;
  return typeof value === "number" ? value : null;
}

/** Staff may only delete frames that are not assigned to any position. */
export function isDeletableImage(image: Pick<ExerciseImage, "active" | "position">): boolean {
  return !image.active && image.position == null;
}

export const IMAGES_BUCKET = "exercise-images";
