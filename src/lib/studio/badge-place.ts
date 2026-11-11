/**
 * Where a small badge drawn beside a point on the stage goes so that it never sits on the stage's
 * own controls (the drag hint and the view toolbar at the bottom, the status cards at the top):
 * pure geometry in CSS pixels, relative to the stage.
 */

export type Box = { left: number; top: number; right: number; bottom: number };

/** Badge size in pixels (globals.css, .body-mark-badge). */
export const BADGE_PX = 26;
const EDGE = 4;

/**
 * Where a badge goes so it does not sit on the stage's controls: from its place beside the joint,
 * up above any control it would cover (the drag hint and the toolbar are at the bottom), else down
 * below one at the top; kept inside the stage. Returns the badge's top-left corner.
 */
export function clearOf(x: number, y: number, boxes: Box[], width: number, height: number, size = BADGE_PX): { x: number; y: number } {
  let bx = Math.min(Math.max(EDGE, x), width - size - EDGE);
  let by = Math.min(Math.max(EDGE, y), height - size - EDGE);
  for (let pass = 0; pass < 4; pass += 1) {
    const hit = boxes.find((b) => bx < b.right && bx + size > b.left && by < b.bottom && by + size > b.top);
    if (!hit) break;
    const above = hit.top - size;
    if (above >= EDGE && (hit.top > height / 2 || hit.bottom + size > height - EDGE)) by = above;
    else if (hit.bottom + size <= height - EDGE) by = hit.bottom;
    else bx = hit.left - size >= EDGE ? hit.left - size : hit.right;
  }
  return { x: bx, y: by };
}
