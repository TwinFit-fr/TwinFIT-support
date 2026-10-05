export type ImagePromptKind = "system" | "position" | "support" | "muscle_base" | "muscle_map";

/** OpenAI generation params stored on a style (no logo / concurrency). */
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
};

export type Subject = "man" | "woman";
export const SUBJECTS: readonly Subject[] = ["man", "woman"];

/** Muscle maps are drawn on a front and a back body, each its own image. */
export type MuscleMapView = "front" | "back";
export const MUSCLE_MAP_VIEWS: readonly MuscleMapView[] = ["front", "back"];

export type MuscleMapTargetKind = "muscle" | "muscle_group";

/** Frames per sequence chosen for a batch; "exercise" keeps each exercise's own setting. */
export type FrameCountChoice = "exercise" | 2 | 3;

export type ImageStyle = {
  id: string;
  code: string;
  name: string;
  published: boolean;
  is_default: boolean;
  params: GenerationParams;
  logo_file_id: string | null;
  logo_in_exercises: boolean;
  inserted_at: string;
  updated_at: string;
  updated_by: string | null;
  characters: { subject: Subject; file_id: string }[];
  /** Blank body per view: the input image of every muscle map of that view. */
  muscle_bases: { view: MuscleMapView; file_id: string }[];
  supports: {
    support_equipment_id: string;
    file_id: string;
    support_equipment: {
      id: string;
      code: string;
      name: string;
      description: string | null;
      active: boolean;
    } | null;
  }[];
};

/** Workspace-level settings (singleton). */
export type ImageSettings = {
  max_concurrency: number;
  updated_at: string;
  updated_by: string | null;
};

/** The prompt slots owned by a style. */
export type StylePrompts = {
  system: ImagePrompt;
  start: ImagePrompt;
  mid: ImagePrompt;
  end: ImagePrompt;
  support: ImagePrompt;
  muscleBase: ImagePrompt;
  muscleMap: ImagePrompt;
};

/** Snapshot stored on each generated image (subject lives on the row column). */
export type GenerationSnapshot = Partial<GenerationParams> & {
  target_position?: number;
  reference_file_id?: string | null;
  support_reference_file_id?: string | null;
  /** Library references sent with this frame. */
  reference_ids?: string[];
  guide_image_id?: string | null;
  logo_sent?: boolean;
  feet_shift_px?: number;
  /** Legacy: set on images cut from a multi-pose strip (no longer generated). */
  sequence?: { strip_size: string; cuts: number[] };
  system_prompt_id?: string | null;
  position_prompt_id?: string | null;
  system_prompt_edited?: boolean;
  position_prompt_edited?: boolean;
  /** Legacy: baked two-image composite (replaced by frame_align). */
  manual_overlay?: boolean;
  /** Active frame was geometrically nudged to align the GIF. */
  frame_align?: boolean;
  align_source_image_id?: string | null;
  align_dx?: number;
  align_dy?: number;
  align_scale?: number;
  /** Legacy rows may still carry subject in params until backfilled. */
  subject?: Subject;
};

/** Snapshot stored on each generated muscle map. */
export type MuscleMapSnapshot = Partial<GenerationParams> & {
  base_file_id?: string | null;
  prompt_id?: string | null;
  prompt_edited?: boolean;
  reference_ids?: string[];
};

export type MuscleMapImage = {
  id: string;
  style_id: string;
  muscle_id: string | null;
  muscle_group_id: string | null;
  view: MuscleMapView;
  file_id: string;
  image_url: string;
  active: boolean;
  model: string;
  prompt: string;
  params: MuscleMapSnapshot | null;
  usage: Record<string, unknown> | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type MuscleMapTargetRef = { kind: MuscleMapTargetKind; id: string };

/** A muscle or a muscle group on the muscle map board, with its maps for one style. */
export type MuscleMapBoardTarget = MuscleMapTargetRef & {
  code: string;
  name: string;
  description: string | null;
  /** Newest first. */
  images: MuscleMapImage[];
  active: Partial<Record<MuscleMapView, MuscleMapImage>>;
  /** Complete when both views have an active map. */
  status: "complete" | "partial" | "inactive_only" | "empty";
};

/** A group and the muscles whose home it is; group is null for muscles without one. */
export type MuscleMapBoardRow = {
  group: MuscleMapBoardTarget | null;
  muscles: MuscleMapBoardTarget[];
};

export function muscleMapTargetKey(ref: MuscleMapTargetRef): string {
  return `${ref.kind}:${ref.id}`;
}

/** What a library reference is used for: one exercise, muscle or muscle group. */
export type ReferenceTarget =
  | { kind: "exercise"; id: number }
  | { kind: "muscle"; id: string }
  | { kind: "muscle_group"; id: string };

export type ReferenceLink = ReferenceTarget & { name: string };

/** A free reference image of a style, sent when generating its linked targets. */
export type StyleReference = {
  id: string;
  style_id: string;
  name: string;
  /** Appended to the prompt when the image is sent: how the model should use it. */
  instruction: string;
  /** Text used by Generate; null when the image is only uploaded. */
  prompt: string | null;
  file_id: string | null;
  inserted_at: string;
  updated_at: string;
  links: ReferenceLink[];
};

/** Library images one generation may send, on top of the style's automatic inputs. */
export const MAX_RUN_REFERENCES = 6;

export function referenceTargetKey(target: ReferenceTarget): string {
  return `${target.kind}:${target.id}`;
}

export type ImagePrompt = {
  id: string;
  style_id: string;
  kind: ImagePromptKind;
  position: number | null;
  content: string;
  inserted_at: string;
  updated_at: string;
};

export type ExerciseImage = {
  id: string;
  style_id: string;
  exo_id: number;
  subject: Subject;
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

export type SubjectFrameStatus = {
  subject: Subject;
  active_count: number;
  active_positions: number[];
  active_frames: { position: number; image_url: string }[];
  preview_image: ExerciseImage | null;
  status: "complete" | "partial" | "inactive_only" | "empty";
};

export type ExerciseImageBoardItem = {
  id: string;
  exo_id: number;
  display_name: string;
  active: boolean;
  primary_muscle_group: { id: string; name: string } | null;
  equipment: { id: string; name: string } | null;
  /** Its reference image (style supports) is sent with Start frames. */
  support_equipment: { id: string; name: string } | null;
  description: string | null;
  image_count: number;
  active_count: number;
  active_positions: number[];
  active_frames: { position: number; image_url: string }[];
  /** Start + End only (position 1 unused). */
  two_frames: boolean;
  /** Positions this exercise's sequence uses: [0, 2] or [0, 1, 2]. */
  frame_positions: number[];
  preview_image: ExerciseImage | null;
  by_subject: SubjectFrameStatus[];
  /** EXERCISE DETAILS block appended to generation prompts (may be empty). */
  prompt_details: string;
  /** Complete only when every selected subject is complete for the style. */
  status: "complete" | "partial" | "inactive_only" | "empty";
};

export type ExerciseImageDetail = ExerciseImageBoardItem & {
  images: ExerciseImage[];
  localizations: { locale: string; display_name: string; description: string | null }[];
};

/** Positions for a 0→1→2→1→0 GIF sequence. */
export const FRAME_POSITIONS = [
  { id: 0, label: "Start" },
  { id: 1, label: "Mid" },
  { id: 2, label: "End" },
] as const;

export type FramePosition = (typeof FRAME_POSITIONS)[number]["id"];

export const MID_POSITION = 1;

export function framePositionsFor(twoFrames: boolean): number[] {
  return FRAME_POSITIONS.map((p) => p.id as number).filter(
    (id) => !twoFrames || id !== MID_POSITION,
  );
}

/**
 * Explicit exercise_options.two_frames wins. Otherwise empty exercises default to
 * two frames (Start+End); exercises that already have images keep three-frame legacy.
 */
export function resolveTwoFrames(
  stored: boolean | null | undefined,
  hasImages: boolean,
): boolean {
  if (stored != null) return stored;
  return !hasImages;
}

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
