"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Badge, Button, Card, Input } from "@/components/ui/primitives";
import { CHECKER_STYLE } from "@/components/images/checker";
import { useStaffSWR } from "@/hooks/use-staff-fetch";
import { imageThumbUrl } from "@/lib/images/urls";
import { pickMapA, type PickedA } from "@/lib/muscle-map/compare-a";
import { cropRect } from "@/lib/muscle-map/paint";
import type { PilotData, PilotExercise } from "@/lib/muscle-map/pilot";
import {
  MAP_VIEWS,
  MAP_VIEW_LABEL,
  type MapBase,
  type MapMask,
  type MuscleMapBoard,
  type MapView,
} from "@/lib/muscle-map/types";
import { CroppedMaskedBase } from "./shared";
import type { MuscleMapApi } from "./use-muscle-map";

/** Pilot pairs: a few inherited exercises of each, plus custom ones of the same pairs. */
const PILOT_PAIRS: Array<[string, string]> = [
  ["CHEST", "PRESS"],
  ["QUADS", "SQUAT"],
  ["BACK", "ROW"],
  ["BACK", "DEADLIFT"],
];
const PILOT_INHERITED_PER_PAIR = 2;
const PILOT_CUSTOM = 3;

function pilotSelection(exercises: PilotExercise[]): number[] {
  const inPair = (ex: PilotExercise, [g, m]: [string, string]) =>
    ex.primary_muscle_group.code === g && ex.movement_type.code === m;
  const inherited = PILOT_PAIRS.flatMap((pair) =>
    exercises
      .filter((ex) => ex.muscles_inherited && inPair(ex, pair))
      .slice(0, PILOT_INHERITED_PER_PAIR),
  );
  const custom = exercises
    .filter((ex) => !ex.muscles_inherited && PILOT_PAIRS.some((pair) => inPair(ex, pair)))
    .slice(0, PILOT_CUSTOM);
  return [...inherited, ...custom].map((ex) => ex.exo_id);
}

type PaintedView = {
  view: MapView;
  base: MapBase;
  layers: Array<{ mask: MapMask; color: string }>;
  rect: { x: number; y: number; w: number; h: number } | null;
};

/**
 * How B paints an exercise: per view with painted muscles, its active base, the secondary
 * masks, then the target mask on top; cropped to the union of the painted masks. Also lists
 * muscles that can't be painted yet.
 */
function paintB(board: MuscleMapBoard, exercise: PilotExercise) {
  const { target_color, secondary_color } = board.settings;
  const views = new Map<MapView, PaintedView>();
  const issues: string[] = [];
  // Secondaries first, the target last: it is drawn on top.
  const ordered = [...exercise.resolved_muscles].sort(
    (a, b) => (a.role === "target" ? 1 : 0) - (b.role === "target" ? 1 : 0) || a.sort_order - b.sort_order,
  );
  for (const resolved of ordered) {
    const name = resolved.muscle.name;
    const mapMuscle = board.muscles.find((m) => m.muscle_id === resolved.muscle_id);
    if (!mapMuscle) {
      issues.push(`${name}: not painted`);
      continue;
    }
    const base = board.bases.find((b) => b.view === mapMuscle.view && b.active);
    if (!base) {
      issues.push(`${name}: no active ${mapMuscle.view} base`);
      continue;
    }
    const mask = board.masks.find(
      (m) => m.base_id === base.id && m.muscle_id === resolved.muscle_id && m.active,
    );
    if (!mask) {
      issues.push(`${name}: no mask`);
      continue;
    }
    const entry = views.get(mapMuscle.view) ?? { view: mapMuscle.view, base, layers: [], rect: null };
    entry.layers.push({
      mask,
      color: resolved.role === "target" ? target_color : secondary_color,
    });
    views.set(mapMuscle.view, entry);
  }
  const painted = MAP_VIEWS.flatMap((view) => {
    const entry = views.get(view);
    return entry ? [{ ...entry, rect: cropRect(entry.layers.map((l) => l.mask.rect)) }] : [];
  });
  return { painted, issues };
}

/** Exercises painted with B next to their A map; the selection lives in the URL (`?exo=`). */
export function PreviewPanel({ api }: { api: MuscleMapApi }) {
  const board = api.data!;
  const pilot = useStaffSWR<PilotData>("/api/muscle-map/exercises");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState("");

  const selected = useMemo(
    () =>
      (params.get("exo") ?? "")
        .split(",")
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0),
    [params],
  );

  function select(next: number[]) {
    const search = new URLSearchParams(params.toString());
    if (next.length) search.set("exo", [...new Set(next)].join(","));
    else search.delete("exo");
    router.replace(`${pathname}?${search.toString()}`, { scroll: false });
  }

  if (pilot.error) return <p className="text-sm text-red-600">{pilot.error.message}</p>;
  if (!pilot.data) return <p className="text-sm text-zinc-500">Loading exercises…</p>;
  const { exercises, a } = pilot.data;
  const byExoId = new Map(exercises.map((ex) => [ex.exo_id, ex]));
  const q = query.trim().toLowerCase();
  const matches = q
    ? exercises
        .filter(
          (ex) =>
            !selected.includes(ex.exo_id) &&
            (ex.display_name.toLowerCase().includes(q) || String(ex.exo_id) === q),
        )
        .slice(0, 8)
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="relative w-full max-w-sm">
          <Input
            placeholder="Add an exercise (name or #)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {matches.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full rounded-md border border-zinc-200 bg-white py-1 shadow-md">
              {matches.map((ex) => (
                <li key={ex.exo_id}>
                  <button
                    type="button"
                    className="w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-50"
                    onClick={() => {
                      select([...selected, ex.exo_id]);
                      setQuery("");
                    }}
                  >
                    #{ex.exo_id} {ex.display_name}{" "}
                    <span className="text-xs text-zinc-500">
                      {ex.muscles_inherited ? "inherited" : "custom"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => select([...selected, ...pilotSelection(exercises)])}
          title="Chest Press, Squat, Row and Deadlift: 2 inherited each, plus 3 custom"
        >
          Pilot
        </Button>
        {selected.length > 0 && (
          <Button type="button" variant="ghost" onClick={() => select([])}>
            Clear
          </Button>
        )}
        <p className="basis-full text-xs text-zinc-500">
          A: the default style&apos;s map of the target muscle, else its group, else its region,
          at the card view and crop (as the app picks it). B: the resolved muscles painted on the
          bases, target over secondaries, cropped to them.
        </p>
      </div>

      {selected.length === 0 ? (
        <Card className="text-sm text-zinc-500">
          Pick exercises, or press Pilot for the side-by-side pilot.
        </Card>
      ) : (
        <div className="space-y-3">
          {selected.map((exoId) => {
            const exercise = byExoId.get(exoId);
            if (!exercise) return null;
            const target = exercise.resolved_muscles.find((m) => m.role === "target");
            const mapA = pickMapA(a, {
              primary_muscle_group_id: exercise.primary_muscle_group_id,
              target_muscle_id: target?.muscle_id ?? null,
            });
            return (
              <ComparisonRow
                key={exoId}
                exercise={exercise}
                mapA={mapA}
                b={paintB(board, exercise)}
                onRemove={() => select(selected.filter((id) => id !== exoId))}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function ComparisonRow({
  exercise,
  mapA,
  b,
  onRemove,
}: {
  exercise: PilotExercise;
  mapA: PickedA | null;
  b: ReturnType<typeof paintB>;
  onRemove: () => void;
}) {
  return (
    <Card className="grid gap-4 p-3 md:grid-cols-[14rem_minmax(0,1fr)_minmax(0,2fr)]">
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-medium">{exercise.display_name}</div>
            <div className="text-xs text-zinc-500">
              #{exercise.exo_id} · {exercise.primary_muscle_group.code} +{" "}
              {exercise.movement_type.code}
            </div>
          </div>
          <button
            type="button"
            aria-label="Remove"
            className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
            onClick={onRemove}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <Badge>{exercise.muscles_inherited ? "Inherited" : "Custom"}</Badge>
        <div className="flex flex-wrap gap-1">
          {exercise.resolved_muscles.map((m) => (
            <span
              key={m.muscle_id}
              className={`rounded-md border px-1.5 py-0.5 text-[11px] ${
                m.role === "target"
                  ? "border-red-300 bg-red-50 text-red-900"
                  : "border-zinc-200 bg-zinc-50 text-zinc-600"
              }`}
            >
              {m.muscle.name}
            </span>
          ))}
        </div>
        {b.issues.length > 0 && (
          <ul className="space-y-0.5 text-[11px] text-amber-700">
            {b.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">A · generated</p>
        {mapA ? (
          <>
            <div className="overflow-hidden rounded-md" style={CHECKER_STYLE}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageThumbUrl(mapA.image_url, 480) ?? mapA.image_url}
                alt=""
                className="mx-auto max-h-72 w-full object-contain"
              />
            </div>
            <p className="text-[11px] text-zinc-500">
              {mapA.level} {mapA.code} · {mapA.view} / {mapA.crop}
            </p>
          </>
        ) : (
          <p className="text-sm text-zinc-500">No A map</p>
        )}
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">B · base + masks</p>
        {b.painted.length === 0 ? (
          <p className="text-sm text-zinc-500">Nothing painted yet</p>
        ) : (
          <div className="flex flex-wrap items-start gap-3">
            {b.painted.map((p) => (
              <div key={p.view} className="w-full max-w-[16rem] flex-1 space-y-1">
                {p.rect && (
                  <div
                    style={{
                      ...CHECKER_STYLE,
                      // At most ~18rem tall: tall crops (back chain) get narrower.
                      maxWidth: `${(18 * p.rect.w * p.base.width) / (p.rect.h * p.base.height)}rem`,
                    }}
                  >
                    <CroppedMaskedBase base={p.base} layers={p.layers} rect={p.rect} width={320} />
                  </div>
                )}
                <p className="text-[11px] text-zinc-500">{MAP_VIEW_LABEL[p.view]}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
