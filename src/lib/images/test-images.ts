import type { ExerciseImage } from "./types.ts";

let counter = 0;

/** A frame for tests: a pending, inactive candidate of the Man's Start unless overridden. */
export function frame(overrides: Partial<ExerciseImage> & { target?: number } = {}): ExerciseImage {
  counter += 1;
  const { target, ...rest } = overrides;
  const id = rest.id ?? `img-${counter}`;
  return {
    id,
    style_id: "style",
    exo_id: 1,
    subject: "man",
    file_id: `file-${id}`,
    image_url: `https://files.test/${id}`,
    position: null,
    active: false,
    model: "gpt-image-1",
    prompt: "",
    params: { target_position: target ?? 0 },
    usage: null,
    created_by: null,
    created_at: `2026-11-19T10:${String(counter).padStart(2, "0")}:00Z`,
    updated_at: "2026-11-19T10:00:00Z",
    review_status: "pending",
    reviewed_by: null,
    reviewed_at: null,
    drawing_id: id,
    start_drawing_id: null,
    ...rest,
  };
}

/** An active, approved frame at `position`; Mid / End are drawn on `startDrawing`. */
export function live(position: number, startDrawing?: string, overrides: Partial<ExerciseImage> = {}) {
  return frame({
    active: true,
    position,
    review_status: "approved",
    target: position,
    start_drawing_id: position === 0 ? null : (startDrawing ?? null),
    ...overrides,
  });
}
