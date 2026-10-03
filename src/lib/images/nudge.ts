/** Nudge within the same canvas. (0,0,1) is a no-op. */
export type FrameNudge = {
  /** Horizontal shift as a fraction of canvas width (positive → right). */
  dx: number;
  /** Vertical shift as a fraction of canvas height (positive → down). */
  dy: number;
  /** Scale around the canvas center. */
  scale: number;
};

export const IDENTITY_NUDGE: FrameNudge = { dx: 0, dy: 0, scale: 1 };

export function isIdentityNudge(n: FrameNudge): boolean {
  return (
    Math.abs(n.dx) < 1e-4 &&
    Math.abs(n.dy) < 1e-4 &&
    Math.abs(n.scale - 1) < 1e-4
  );
}
