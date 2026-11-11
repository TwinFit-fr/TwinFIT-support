/**
 * The body checks turned into problems a person can find: which part of the body (the body point
 * to select and the joint to mark on the stage), when in the movement (the key pose, the stretches
 * of the clip where it fails), the floor area that carries the body for balance, and plainly which
 * checks did not run and why. Pure functions over what pose-validate.ts measured (its `located`
 * output); no three.js, no store, no DOM.
 */
import { LIMITS, type FrameReading, type PoseLocations, type RangeReading } from "./pose-validate.ts";
import { jointName } from "./joint-props.ts";
import { POINT_LABEL, type PointId } from "./pose-points.ts";
import { formatSeconds, poseName } from "./timeline.ts";

export type IssueKind = "balance" | "tilt" | "sink" | "slide" | "lifted" | "floor" | "range" | "training" | "extension" | "symmetry";
export type Side = "left" | "right";
export type Severity = "error" | "warning";
export type Span = { from: number; to: number };

/** The floor under one failing frame, for drawing balance: metres, x across (left foot +x), z forward. */
export type BalanceSpot = { t: number; com: [number, number, number]; heel: number; toes: number; left: number; right: number };

export type BodyIssue = {
  /** Stable while the problem lasts (kind, part and pose), so a selection survives a re-check. */
  id: string;
  kind: IssueKind;
  severity: Severity;
  /** Plain words: "Left foot slides". */
  title: string;
  /** The measure: "Moves 6 cm while it carries the body". */
  detail: string;
  /** What to do about it, in a few words: "Bring the hips forward over the feet". */
  fix: string;
  /** The body point to select to fix it. */
  point: PointId;
  /** The part concerned, in words ("Left foot"). */
  part: string;
  /** Logical joint marked on the stage ("LeftForeArm", "HeadCenter"). */
  joint: string;
  /** The key pose the playhead goes to, when the problem is on one. */
  pose: number | null;
  /** Where the playhead goes, seconds. */
  t: number;
  /** Stretches of the clip where it fails (sampled frames); empty for a key pose only. */
  spans: Span[];
  /** Times of the key poses where it fails (range checks). */
  keyTimes: number[];
  /** "Pose 2 · bottom" or "1.2–2.0 s". */
  where: string;
  /** Balance only: the floor under each failing frame. */
  balance: BalanceSpot[] | null;
};

export type CoverageNote = { checks: string[]; why: string };

export type BodyReport = {
  issues: BodyIssue[];
  /** The checks that ran on at least one frame. */
  ran: string[];
  /** Checks that did not run at all, and why. */
  skipped: CoverageNote[];
  /** Checks that ran only on part of the clip: "Feet and balance checked only while standing (0.0–1.2 s)". */
  partial: string | null;
  /** Seconds between sampled frames. */
  step: number;
};

/** The timeline's keys as the report needs them: a pose reached at `t`. */
export type ReportKey = { t: number; pose: number };

/**
 * What the exercise itself does with the feet, per pose (in the poses' order): the sides its
 * template lifts off the floor on purpose (a lunge's rear foot, a single-leg deadlift). Null when
 * there is no template to ask; a lifted foot is then reported as a warning, since nobody can say
 * it was meant.
 */
export type FreeFeet = Side[][] | null;

/** A foot this far above its place on the floor (metres) while the other carries the body is off the floor. */
export const LIFTED_M = 0.05;

export const CHECK_NAMES = {
  feet: "Soles flat on the floor",
  stay: "Feet that stay put",
  balance: "Balance over the feet",
  sides: "Both sides alike",
  floor: "Nothing through the floor",
  ranges: "Joints in range",
} as const;

const ORIENTATION_WORDS: Record<string, string> = {
  prone: "lying face down",
  supine: "lying on the back",
  side_lying: "lying on the side",
  kneeling: "kneeling",
  seated: "seated",
  hanging: "hanging",
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Distances in whole centimetres: what someone fixing a pose by eye can picture. */
const m = (v: number) => `${Math.max(1, Math.round(v * 100))} cm`;
const deg = (v: number) => `${Math.round(v)}°`;

/** "1.2–2.0 s" (one value for a span shorter than a tenth). */
export function spanWords(span: Span): string {
  const a = Math.round(span.from * 10) / 10;
  const b = Math.round(span.to * 10) / 10;
  return a === b ? formatSeconds(a) : `${a.toFixed(1)}–${b.toFixed(1)} s`;
}

// ---- which body point and joint a part of the body is -------------------------------------------

type Place = { point: PointId; joint: string; part: string };

/** Where a joint value lives on the body: the point that shows its control, the joint to mark. */
export function placeOfPath(path: string): Place {
  const [group, field = ""] = path.split(".");
  const limb = /^(left|right)_(arm|leg)$/.exec(group);
  if (limb) {
    const side = limb[1] as "left" | "right";
    const Side = side === "left" ? "Left" : "Right";
    if (limb[2] === "arm") {
      if (field.startsWith("elbow")) return { point: `${side}_elbow`, joint: `${Side}ForeArm`, part: `${cap(side)} elbow` };
      if (field.startsWith("forearm") || field.startsWith("wrist")) return { point: `${side}_hand`, joint: `${Side}Hand`, part: `${cap(side)} wrist` };
      return { point: `${side}_elbow`, joint: `${Side}Arm`, part: `${cap(side)} shoulder` };
    }
    if (field.startsWith("knee")) return { point: `${side}_knee`, joint: `${Side}Leg`, part: `${cap(side)} knee` };
    if (field.startsWith("ankle")) return { point: `${side}_foot`, joint: `${Side}Foot`, part: `${cap(side)} ankle` };
    return { point: `${side}_knee`, joint: `${Side}UpLeg`, part: `${cap(side)} hip` };
  }
  if (group === "lumbar") return { point: "chest", joint: "Spine", part: "Lower back" };
  if (group === "thoracic") return { point: "chest", joint: "Spine2", part: "Upper back" };
  if (group === "head") return { point: "head", joint: "Neck", part: "Neck" };
  return { point: "hips", joint: "Hips", part: "Pelvis" };
}

/** The body point nearest a joint of the rig (for "goes through the floor"). */
export function placeOfBone(logical: string | null): Place {
  const m = logical ? /^(Left|Right)(.*)$/.exec(logical) : null;
  if (m) {
    const side = m[1].toLowerCase() as "left" | "right";
    const rest = m[2];
    const point: PointId =
      rest === "Foot" || rest === "ToeBase" ? `${side}_foot` : rest === "Leg" ? `${side}_knee` : rest === "Hand" ? `${side}_hand` : rest === "UpLeg" ? "hips" : `${side}_elbow`;
    const part = rest === "ToeBase" ? `${m[1]} toes` : rest === "UpLeg" ? `${m[1]} hip` : POINT_LABEL[point];
    return { point, joint: logical!, part };
  }
  if (logical === "Head" || logical === "Neck") return { point: "head", joint: logical === "Head" ? "HeadCenter" : "Neck", part: "Head" };
  if (logical && logical.startsWith("Spine")) return { point: "chest", joint: logical, part: "Back" };
  return { point: "hips", joint: "Hips", part: "Pelvis" };
}

const footPlace = (side: "left" | "right"): Place => ({ point: `${side}_foot`, joint: side === "left" ? "LeftFoot" : "RightFoot", part: POINT_LABEL[`${side}_foot`] });

// ---- one frame: what fails on it -----------------------------------------------------------------

type Hit = { key: string; kind: IssueKind; severity: Severity; place: Place; value: number; spot?: BalanceSpot; meant?: boolean | null };

/**
 * Every check that fails on one sampled frame, with how far past its limit it is. `free` is the
 * sides the exercise lifts on purpose around this frame (null: no template to ask).
 */
export function frameHits(frame: FrameReading, flags: Pick<PoseLocations, "moving" | "airborne">, free: Side[] | null = null): Hit[] {
  const hits: Hit[] = [];
  // A foot off the floor while standing: fine when the exercise lifts it, else the stance is not the exercise's.
  if (!flags.moving && !flags.airborne) {
    for (const foot of frame.lifted ?? []) {
      if (foot.height < LIFTED_M || free?.includes(foot.side)) continue;
      hits.push({ key: `lifted:${foot.side}`, kind: "lifted", severity: "warning", place: footPlace(foot.side), value: foot.height, meant: free ? false : null });
    }
  }
  for (const foot of frame.feet) {
    const place = footPlace(foot.side);
    if (foot.tilt !== null && foot.tilt > LIMITS.tilt) hits.push({ key: `tilt:${foot.side}`, kind: "tilt", severity: "error", place, value: foot.tilt });
    if (foot.sink !== null && foot.sink > LIMITS.sink) hits.push({ key: `sink:${foot.side}`, kind: "sink", severity: "error", place, value: foot.sink });
    if (!flags.moving && !flags.airborne && foot.slide > LIMITS.slide) hits.push({ key: `slide:${foot.side}`, kind: "slide", severity: "error", place, value: foot.slide });
  }
  if (frame.lowest.y < -LIMITS.floor) {
    const place = placeOfBone(frame.lowest.logical);
    hits.push({ key: `floor:${frame.lowest.logical ?? frame.lowest.bone}`, kind: "floor", severity: "error", place, value: -frame.lowest.y });
  }
  const b = frame.balance;
  if (b) {
    const spot: BalanceSpot = { t: frame.t, com: b.com, heel: b.heel, toes: b.toes, left: b.left, right: b.right };
    const hips: Place = { point: "hips", joint: "Hips", part: "Centre of mass" };
    const ahead = b.com[2] - b.toes;
    const behind = b.heel - b.com[2];
    const side = Math.max(b.com[0] - b.left, b.right - b.com[0]);
    if (ahead > LIMITS.comFront) hits.push({ key: "balance-front", kind: "balance", severity: "error", place: hips, value: ahead, spot });
    if (behind > LIMITS.comBack) hits.push({ key: "balance-back", kind: "balance", severity: "error", place: hips, value: behind, spot });
    if (side > LIMITS.comSide) hits.push({ key: "balance-side", kind: "balance", severity: "warning", place: hips, value: side, spot });
  }
  if (frame.handGap !== null && frame.hands && frame.handGap > LIMITS.handGap) {
    const lower = frame.hands.left < frame.hands.right ? "left" : "right";
    hits.push({ key: "symmetry", kind: "symmetry", severity: "warning", place: { point: `${lower}_hand`, joint: lower === "left" ? "LeftHand" : "RightHand", part: "Hands" }, value: frame.handGap });
  }
  return hits;
}

type Words = { title: string; detail: string; fix: string };

function words(key: string, hit: Pick<Hit, "kind" | "place" | "value" | "meant">): Words {
  const { kind, place, value } = hit;
  const side = place.part;
  const low = side.toLowerCase();
  switch (kind) {
    case "tilt":
      return { title: `${side} sole not flat`, detail: `Tilts ${deg(value)} while it carries the body`, fix: `Level the ${low}, or give it back to automatic` };
    case "sink":
      return { title: `${side} sinks into the floor`, detail: `The ankle is ${m(value)} too low`, fix: "Raise the pelvis or straighten that leg" };
    case "slide":
      return { title: `${side} slides`, detail: `Moves ${m(value)} while it carries the body`, fix: `Put the ${low} back where it stood: give it back to automatic` };
    case "lifted":
      return {
        title: `${side} off the floor`,
        detail: hit.meant === false ? `${m(value)} up; this exercise keeps both feet down` : `${m(value)} up while the other foot carries the body`,
        fix: hit.meant === false ? `Give the ${low} back to automatic` : `Check it is meant, or give the ${low} back to automatic`,
      };
    case "floor":
      return { title: `${side} ${side.endsWith("toes") ? "go" : "goes"} through the floor`, detail: `${m(value)} below the floor`, fix: `Lift the ${low} above the floor` };
    case "symmetry":
      return { title: "Hands at different heights", detail: `${m(value)} apart in a two-sided exercise`, fix: "Bring the hands level" };
    default:
      if (key === "balance-front") return { title: "Off balance: tips forward", detail: `Centre of mass ${m(value)} ahead of the toes`, fix: "Bring the hips back over the feet" };
      if (key === "balance-back") return { title: "Off balance: tips backward", detail: `Centre of mass ${m(value)} behind the heels`, fix: "Bring the hips and chest forward over the feet" };
      return { title: "Off balance to the side", detail: `Centre of mass ${m(value)} outside the feet`, fix: "Shift the hips over the feet" };
  }
}

/** Runs of consecutive frame indices, as time spans half a sample wide on each side. */
export function spansOf(indices: number[], frames: FrameReading[], step: number, duration: number): Span[] {
  const spans: Span[] = [];
  let start = -1;
  let prev = -2;
  const close = () => {
    if (start < 0) return;
    spans.push({ from: Math.max(0, frames[start].t - step / 2), to: Math.min(duration, frames[prev].t + step / 2) });
  };
  for (const i of [...indices].sort((a, b) => a - b)) {
    if (i !== prev + 1) {
      close();
      start = i;
    }
    prev = i;
  }
  close();
  return spans;
}

const inSpans = (spans: Span[], t: number, slack = 1e-6) => spans.some((s) => t >= s.from - slack && t <= s.to + slack);

/** Index of the key at `t` (within `tolerance`), else -1. */
function keyIndexAt(keys: ReportKey[], t: number, tolerance: number): number {
  let best = -1;
  let gap = Infinity;
  keys.forEach((k, i) => {
    const d = Math.abs(k.t - t);
    if (d < gap) [best, gap] = [i, d];
  });
  return best >= 0 && gap <= tolerance ? best : -1;
}

function rangeWords(r: RangeReading): Words {
  const name = jointName(r.path);
  const into = `Set ${name.charAt(0).toLowerCase()}${name.slice(1)} between ${r.limit[0]} and ${r.limit[1]}°`;
  if (r.kind === "extension") return { title: `${cap(r.path.split("_")[0])} arm too far behind the body`, detail: `Raised ${deg(r.value)} behind the body (about ${deg(r.limit[1])} at most)`, fix: "Lower the arm or bring it forward" };
  if (r.kind === "range") return { title: `${name} past its range`, detail: `${deg(r.value)}, the body allows ${r.limit[0]} to ${r.limit[1]}°`, fix: into };
  return { title: `${name} outside normal training`, detail: `${deg(r.value)}, usual training range ${r.limit[0]} to ${r.limit[1]}°`, fix: into };
}

/**
 * The sides the exercise lifts on purpose at time `t`: those of the key poses on either side of
 * it (a foot rising towards a pose that lifts it is meant too). Null when there is no template.
 */
export function freeSidesAt(keys: ReportKey[], freeFeet: FreeFeet, t: number): Side[] | null {
  if (!freeFeet || !keys.length) return null;
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  const after = sorted.findIndex((k) => k.t >= t - 1e-6);
  const around = after < 0 ? [sorted[sorted.length - 1]] : after === 0 || Math.abs(sorted[after].t - t) < 1e-6 ? [sorted[after]] : [sorted[after - 1], sorted[after]];
  const sides = new Set<Side>();
  for (const k of around) for (const side of freeFeet[k.pose] ?? []) sides.add(side);
  return [...sides];
}

// ---- coverage ------------------------------------------------------------------------------------

function coverage(loc: PoseLocations, step: number): Pick<BodyReport, "ran" | "skipped" | "partial"> {
  const frames = loc.frames;
  const standing = frames.map((f, i) => (f.orientation === "standing" ? i : -1)).filter((i) => i >= 0);
  const notStanding = frames.map((f, i) => (f.orientation !== "standing" ? i : -1)).filter((i) => i >= 0);
  const skipped: CoverageNote[] = [];
  const ran: string[] = [CHECK_NAMES.ranges, CHECK_NAMES.floor];
  const orientations = [...new Set(notStanding.map((i) => frames[i].orientation))].map((o) => ORIENTATION_WORDS[o] ?? o.replace(/_/g, " "));
  const how = orientations.join(" or ");
  let partial: string | null = null;
  if (frames.length && !standing.length) {
    skipped.push({
      checks: [CHECK_NAMES.feet, CHECK_NAMES.stay, CHECK_NAMES.balance, CHECK_NAMES.sides],
      why: `The body is ${how} for the whole movement; these checks need it standing on its feet.`,
    });
    return { ran, skipped, partial };
  }
  if (notStanding.length) {
    const on = spansOf(standing, frames, step, loc.duration).map(spanWords).join(", ");
    partial = `Feet, balance and both sides were checked only while standing (${on}), not while ${how}.`;
  }
  const flatFeet = standing.some((i) => frames[i].feet.some((f) => f.tilt !== null));
  if (flatFeet) ran.push(CHECK_NAMES.feet);
  else if (standing.length) skipped.push({ checks: [CHECK_NAMES.feet], why: "Flat feet is off for these poses, so the soles may tilt." });
  if (loc.moving || loc.airborne) {
    skipped.push({
      checks: [CHECK_NAMES.stay, CHECK_NAMES.balance, ...(loc.moving ? [CHECK_NAMES.sides] : [])],
      why: loc.airborne ? "The exercise leaves the floor, so the feet do not stay put and the body is not balanced on them." : "The body travels across the floor, so the feet do not stay put.",
    });
  } else {
    ran.push(CHECK_NAMES.stay, CHECK_NAMES.balance);
  }
  if (loc.unilateral && !loc.moving) skipped.push({ checks: [CHECK_NAMES.sides], why: "One side works at a time, so the two sides are meant to differ." });
  else if (!loc.moving) ran.push(CHECK_NAMES.sides);
  return { ran, skipped, partial };
}

// ---- the report ----------------------------------------------------------------------------------

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1 };

/**
 * Every problem of the clip, located: one per check, part of the body and (for a joint range) key
 * pose. A problem found on sampled frames lands on the key pose inside its worst stretch when there
 * is one (that is the pose to fix), else on its worst frame. `keys` are the timeline's keys, in the
 * clip's keyframe order; `labels` the pose names.
 */
/** What the poses themselves say, beyond what was measured: the feet the template lifts, the points pinned in each pose. */
export type IssueContext = { freeFeet?: FreeFeet; pinned?: PointId[][] | null };

export function locateIssues(loc: PoseLocations, keys: ReportKey[], labels: (string | null | undefined)[] | null = null, context: IssueContext = {}): BodyReport {
  const freeFeet = context.freeFeet ?? null;
  const frames = loc.frames;
  const step = frames.length > 1 ? frames[1].t - frames[0].t : loc.duration || 1;
  const tolerance = Math.max(1e-3, step / 2);
  const issues: BodyIssue[] = [];

  // Sampled frames: group hits by check and part.
  const groups = new Map<string, { hit: Hit; indices: number[]; values: number[]; spots: BalanceSpot[] }>();
  frames.forEach((frame, i) => {
    for (const hit of frameHits(frame, loc, freeSidesAt(keys, freeFeet, frame.t))) {
      const g = groups.get(hit.key) ?? { hit, indices: [], values: [], spots: [] };
      g.indices.push(i);
      g.values.push(hit.value);
      if (hit.spot) g.spots.push(hit.spot);
      if (hit.value > g.hit.value) g.hit = hit;
      groups.set(hit.key, g);
    }
  });
  for (const [key, g] of groups) {
    const spans = spansOf(g.indices, frames, step, loc.duration);
    // The key pose to fix: the one inside a failing stretch whose nearest frame fails the most.
    let pose: number | null = null;
    let t = frames[g.indices[g.values.indexOf(Math.max(...g.values))]].t;
    let best = -Infinity;
    for (const k of keys) {
      if (!inSpans(spans, k.t)) continue;
      const near = g.indices.reduce((a, idx, j) => (Math.abs(frames[idx].t - k.t) < Math.abs(frames[a.idx].t - k.t) ? { idx, j } : a), { idx: g.indices[0], j: 0 });
      if (g.values[near.j] > best) [best, pose, t] = [g.values[near.j], k.pose, k.t];
    }
    const { title, detail, fix } = words(key, g.hit);
    issues.push({
      id: key,
      kind: g.hit.kind,
      severity: g.hit.severity,
      title,
      detail,
      fix,
      point: g.hit.place.point,
      part: g.hit.place.part,
      joint: g.hit.place.joint,
      pose,
      t,
      spans,
      keyTimes: [],
      where: pose !== null ? poseName(pose, labels) : spans.map(spanWords).join(", "),
      balance: g.spots.length ? g.spots : null,
    });
  }

  // Key poses: one problem per joint and pose (a pose reached again is the same pose).
  const ranges = new Map<string, { r: RangeReading; pose: number | null; times: number[] }>();
  for (const r of loc.ranges) {
    const k = keyIndexAt(keys, r.t, tolerance);
    const pose = k >= 0 ? keys[k].pose : null;
    const id = `${r.kind}:${r.path}:${pose ?? r.key}`;
    const prev = ranges.get(id);
    if (prev) prev.times.push(r.t);
    else ranges.set(id, { r, pose, times: [r.t] });
  }
  for (const [id, { r, pose, times }] of ranges) {
    const place = placeOfPath(r.path);
    const { title, detail, fix } = rangeWords(r);
    issues.push({
      id,
      kind: r.kind,
      severity: r.severity,
      title,
      detail,
      fix,
      point: place.point,
      part: place.part,
      joint: place.joint,
      pose,
      t: times[0],
      spans: [],
      keyTimes: times,
      where: pose !== null ? poseName(pose, labels) : formatSeconds(r.t),
      balance: null,
    });
  }

  // A pinned point stays where its pin holds it whatever its joints say: the pin goes first.
  for (const issue of issues) {
    if (issue.pose !== null && context.pinned?.[issue.pose]?.includes(issue.point)) issue.fix = `Unpin it (P), then ${issue.fix.charAt(0).toLowerCase()}${issue.fix.slice(1)}`;
  }
  issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.t - b.t || a.title.localeCompare(b.title));
  return { issues, step, ...coverage(loc, step) };
}

/** Is the problem happening at time `t`: in one of its failing stretches, or on a key pose that fails (within `tolerance` s)? */
export function showsAt(issue: BodyIssue, t: number, tolerance: number): boolean {
  return inSpans(issue.spans, t) || issue.keyTimes.some((k) => Math.abs(k - t) <= tolerance);
}

/** The problems showing at time `t`. */
export function issuesAt(report: BodyReport | null, t: number, tolerance: number): BodyIssue[] {
  return report ? report.issues.filter((issue) => showsAt(issue, t, tolerance)) : [];
}

/** The worst severity at each key of the timeline (null: nothing fails there), in the keys' order. */
export function keySeverities(report: BodyReport | null, keys: ReportKey[], tolerance: number): (Severity | null)[] {
  return keys.map((k) => {
    const at = issuesAt(report, k.t, tolerance);
    return at.length ? (at.some((i) => i.severity === "error") ? "error" : "warning") : null;
  });
}

/** The failing stretches along the clip, merged per severity, for the ruler. */
export function failingStretches(report: BodyReport | null): { span: Span; severity: Severity; titles: string[] }[] {
  if (!report) return [];
  const out: { span: Span; severity: Severity; titles: string[] }[] = [];
  for (const severity of ["warning", "error"] as const) {
    const items = report.issues
      .filter((i) => i.severity === severity)
      .flatMap((i) => i.spans.map((span) => ({ span, title: i.title })))
      .sort((a, b) => a.span.from - b.span.from);
    for (const item of items) {
      const last = out[out.length - 1];
      if (last && last.severity === severity && item.span.from <= last.span.to + 1e-6) {
        last.span = { from: last.span.from, to: Math.max(last.span.to, item.span.to) };
        if (!last.titles.includes(item.title)) last.titles.push(item.title);
      } else out.push({ span: { ...item.span }, severity, titles: [item.title] });
    }
  }
  return out;
}

/** The balance spot nearest `t` among an issue's failing frames, when `t` is in one of its stretches. */
export function balanceAt(issue: BodyIssue, t: number): BalanceSpot | null {
  if (!issue.balance?.length || !inSpans(issue.spans, t)) return null;
  return issue.balance.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));
}

/** The headline of the body checks: counts, or what passed and how much was checked. */
export function reportHeadline(report: BodyReport | null): { tone: "pass" | "partial" | "warn" | "fail"; text: string } {
  if (!report) return { tone: "pass", text: "Body checks pass" };
  const errors = report.issues.filter((i) => i.severity === "error").length;
  const warnings = report.issues.length - errors;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (errors) return { tone: "fail", text: [plural(errors, "problem"), warnings ? plural(warnings, "warning") : ""].filter(Boolean).join(", ") };
  if (warnings) return { tone: "warn", text: plural(warnings, "warning") };
  const all = Object.keys(CHECK_NAMES).length;
  if (report.skipped.length || report.partial) return { tone: "partial", text: `No problems · ${report.ran.length} of ${all} checks ran` };
  return { tone: "pass", text: "Body checks pass" };
}

/** "a, b and c", lower case after the first word kept as it is. */
export function listWords(items: string[]): string {
  const low = items.map((w) => w.charAt(0).toLowerCase() + w.slice(1));
  return low.length > 1 ? `${low.slice(0, -1).join(", ")} and ${low[low.length - 1]}` : (low[0] ?? "");
}
