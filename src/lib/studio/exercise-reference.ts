/**
 * The catalog reference of an exercise as the stage's Reference card shows it: the start and end
 * position frames (the frames the AI draft reads) with their position texts, and the card's
 * remembered place. Pure, for node:test.
 */

export type ReferenceFrame = { position: number; image_url: string };
export type ReferencePose = { position: number; pose: string };
export type ReferenceResponse = { frames: ReferenceFrame[]; poses: ReferencePose[] };

export type ReferenceSlot = {
  /** "Start" or "End". */
  label: string;
  position: number;
  image: string | null;
  /** The catalog's position text, whole. */
  text: string | null;
};

export type ExerciseReference = { start: ReferenceSlot | null; end: ReferenceSlot | null; hasImages: boolean };

/**
 * Start is the first position (0 in the Images tool), end the last one. A position without a
 * frame keeps its text; a frame without its own text takes the nearest text on its side.
 */
export function referenceOf({ frames, poses }: ReferenceResponse): ExerciseReference {
  const images = [...frames].filter((f) => f.image_url).sort((a, b) => a.position - b.position);
  const texts = [...poses].filter((p) => p.pose?.trim()).sort((a, b) => a.position - b.position);
  const positions = [...images.map((f) => f.position), ...texts.map((p) => p.position)];
  if (!positions.length) return { start: null, end: null, hasImages: false };
  const first = Math.min(...positions);
  const last = Math.max(...positions);
  const slot = (label: string, position: number, side: "first" | "last"): ReferenceSlot => {
    const image = images.find((f) => f.position === position) ?? (side === "first" ? images[0] : images[images.length - 1]) ?? null;
    const at = image ? image.position : position;
    const text = texts.find((p) => p.position === at) ?? (side === "first" ? texts[0] : texts[texts.length - 1]) ?? null;
    return { label, position: at, image: image?.image_url ?? null, text: text?.pose.trim() ?? null };
  };
  const start = slot("Start", first, "first");
  const end = last > first ? slot("End", last, "last") : null;
  // One frame only: it is the start, there is no end to show twice.
  return { start, end: end && (end.image !== start.image || end.text !== start.text) ? end : null, hasImages: images.length > 0 };
}

/** The first sentence of a position text, for the card's short caption (the whole text is one press away). */
export function shortText(text: string, max = 150): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const m = /^(.+?[.;])(\s|$)/.exec(clean);
  const first = m ? m[1] : clean;
  if (first.length <= max) return first.replace(/;$/, ".");
  const cut = first.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 20)).replace(/[,;:\s]+$/, "")}…`;
}

// ---- the card's place on the stage, remembered per browser ------------------------------------

export const REFERENCE_STORAGE_KEY = "twinfit.studio.reference-card.v1";

export type ReferenceCorner = "bottom-left" | "bottom-right" | "top-right" | "top-left";
export const REFERENCE_CORNERS: readonly ReferenceCorner[] = ["bottom-left", "top-left", "top-right", "bottom-right"];

/** `open` is null until the user opens or closes the card: then the stage's width decides (cardOpen). */
export type ReferencePrefs = { open: boolean | null; corner: ReferenceCorner; large: boolean };
export const DEFAULT_REFERENCE_PREFS: ReferencePrefs = { open: null, corner: "bottom-left", large: false };

/** Below this stage width (CSS pixels) the card starts closed: an open one would leave a lying body a thin strip. */
export const OPEN_BY_DEFAULT_MIN_STAGE_PX = 640;

/** Is the card open: as the user left it, else open on a stage wide enough to keep room for the body. */
export function cardOpen(prefs: ReferencePrefs, stageWidth: number): boolean {
  return prefs.open ?? stageWidth >= OPEN_BY_DEFAULT_MIN_STAGE_PX;
}

export function parseReferencePrefs(json: string | null): ReferencePrefs {
  if (!json) return DEFAULT_REFERENCE_PREFS;
  try {
    const raw = JSON.parse(json) as Partial<ReferencePrefs>;
    return {
      open: typeof raw.open === "boolean" ? raw.open : DEFAULT_REFERENCE_PREFS.open,
      corner: REFERENCE_CORNERS.includes(raw.corner as ReferenceCorner) ? (raw.corner as ReferenceCorner) : DEFAULT_REFERENCE_PREFS.corner,
      large: typeof raw.large === "boolean" ? raw.large : DEFAULT_REFERENCE_PREFS.large,
    };
  } catch {
    return DEFAULT_REFERENCE_PREFS;
  }
}

/** The next corner going round the stage clockwise (the card's Move button). */
export function nextCorner(corner: ReferenceCorner): ReferenceCorner {
  return REFERENCE_CORNERS[(REFERENCE_CORNERS.indexOf(corner) + 1) % REFERENCE_CORNERS.length];
}

/** The corner of a `width` by `height` stage nearest to a point (where a dragged card is let go). */
export function nearestCorner(x: number, y: number, width: number, height: number): ReferenceCorner {
  const right = x > width / 2;
  const bottom = y > height / 2;
  return bottom ? (right ? "bottom-right" : "bottom-left") : right ? "top-right" : "top-left";
}

export const CORNER_NAME: Record<ReferenceCorner, string> = {
  "bottom-left": "bottom left",
  "bottom-right": "bottom right",
  "top-right": "top right",
  "top-left": "top left",
};

// ---- the card's size on the stage -----------------------------------------------------------

/** Pixel heights of the card's parts besides the two frames. */
export const CARD_PARTS = { header: 36, subtitle: 30, captions: 52, footer: 37, padding: 10, gap: 8, side: 8 } as const;
export const TILE_PX = { small: 88, large: 168, min: 80, floor: 64 } as const;

export type CardLayout = { tile: number; width: number; subtitle: boolean; captions: boolean };

/**
 * The card's size for the height it has in its corner: the frames as large as chosen while they
 * fit; on a short stage the subtitle and then the captions give way before the frames shrink
 * below TILE_PX.min (the whole texts stay one press away).
 */
export function cardLayout(maxHeight: number, large: boolean, hasText: boolean): CardLayout {
  const preferred = large ? TILE_PX.large : TILE_PX.small;
  const levels = [
    { subtitle: true, captions: true },
    { subtitle: false, captions: true },
    { subtitle: false, captions: false },
  ];
  let layout: CardLayout | null = null;
  for (const level of levels) {
    const chrome = CARD_PARTS.header + (level.subtitle ? CARD_PARTS.subtitle : 0) + (level.captions && hasText ? CARD_PARTS.captions : 0) + (hasText ? CARD_PARTS.footer : 0) + CARD_PARTS.padding;
    const tile = Math.floor(Math.min(preferred, maxHeight - chrome));
    layout = { tile: Math.max(TILE_PX.floor, tile), width: 0, ...level };
    if (tile >= Math.min(preferred, TILE_PX.min)) break;
  }
  return { ...layout!, width: 2 * layout!.tile + CARD_PARTS.gap + 2 * CARD_PARTS.side };
}

/** The widest the card can be (for keeping its column clear of the stage's overlays). */
export function cardMaxWidth(large: boolean): number {
  return 2 * (large ? TILE_PX.large : TILE_PX.small) + CARD_PARTS.gap + 2 * CARD_PARTS.side;
}
