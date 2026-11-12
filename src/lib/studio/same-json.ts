// Value equality the studio store's slices use to skip a set() that would change nothing.

export function sameJson(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}
