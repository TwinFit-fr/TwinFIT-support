"use client";

import { ToggleChips } from "@/components/images/generation-controls";
import type { MuscleMapChoices, MuscleMapCrop, MuscleMapView } from "@/lib/images/types";
import {
  MUSCLE_MAP_CROPS,
  MUSCLE_MAP_CROP_LABEL,
  MUSCLE_MAP_VIEWS,
  MUSCLE_MAP_VIEW_LABEL,
} from "@/lib/images/types";

const selectClass = "rounded-md border border-zinc-300 px-2 py-1 text-xs";

/** A region's choices: both views drawn, full body, card front / full. */
export const DEFAULT_REGION_MAP_CHOICES: MuscleMapChoices = {
  map_views: [...MUSCLE_MAP_VIEWS],
  map_crops: ["full"],
  map_view: "front",
  map_crop: "full",
};

/** A group's or muscle's choices: both views, full body, card inherited. */
export const DEFAULT_MAP_CHOICES: MuscleMapChoices = {
  map_views: [...MUSCLE_MAP_VIEWS],
  map_crops: ["full"],
  map_view: null,
  map_crop: null,
};

/** The row's saved choices, or the defaults of its table. */
export function mapChoicesOf(
  row: Partial<MuscleMapChoices>,
  inheritable: boolean,
): MuscleMapChoices {
  const fallback = inheritable ? DEFAULT_MAP_CHOICES : DEFAULT_REGION_MAP_CHOICES;
  return {
    map_views: row.map_views?.length ? row.map_views : fallback.map_views,
    map_crops: row.map_crops?.length ? row.map_crops : fallback.map_crops,
    map_view: row.map_view ?? fallback.map_view,
    map_crop: row.map_crop ?? fallback.map_crop,
  };
}

/**
 * Keeps the card choice inside the allowed views / crops: an inherited (null) card stays, an
 * own choice that is no longer allowed becomes the first allowed one (inherit when it can).
 */
function fitCard(next: MuscleMapChoices, inheritable: boolean): MuscleMapChoices {
  const fit = <T extends string>(card: T | null, allowed: T[]): T | null =>
    card == null || allowed.includes(card) ? card : inheritable ? null : allowed[0];
  return {
    ...next,
    map_view: fit(next.map_view, next.map_views),
    map_crop: fit(next.map_crop, next.map_crops),
  };
}

/**
 * Which muscle maps a region, group or muscle has (views × crops, each its own image) and the
 * one its app card shows. Groups and muscles may inherit the card (group → region, muscle →
 * its home group).
 */
export function MapChoicesEditor({
  value,
  onChange,
  inheritable,
}: {
  value: MuscleMapChoices;
  onChange: (next: MuscleMapChoices) => void;
  /** Groups and muscles: the card can be inherited (null). */
  inheritable: boolean;
}) {
  const set = (patch: Partial<MuscleMapChoices>) =>
    onChange(fitCard({ ...value, ...patch }, inheritable));

  return (
    <div className="flex min-w-[15rem] flex-col gap-1.5">
      <ToggleChips
        label="Views with a map"
        value={value.map_views}
        onChange={(map_views) => set({ map_views })}
        options={MUSCLE_MAP_VIEWS.map((v) => ({ value: v, label: MUSCLE_MAP_VIEW_LABEL[v] }))}
      />
      <ToggleChips
        label="Crops with a map"
        value={value.map_crops}
        onChange={(map_crops) => set({ map_crops })}
        options={MUSCLE_MAP_CROPS.map((c) => ({ value: c, label: MUSCLE_MAP_CROP_LABEL[c] }))}
      />
      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
        <span>Card</span>
        <select
          className={selectClass}
          aria-label="Card view"
          value={value.map_view ?? ""}
          onChange={(e) => set({ map_view: (e.target.value || null) as MuscleMapView | null })}
        >
          {inheritable && <option value="">Inherit view</option>}
          {value.map_views.map((view) => (
            <option key={view} value={view}>
              {MUSCLE_MAP_VIEW_LABEL[view]}
            </option>
          ))}
        </select>
        <select
          className={selectClass}
          aria-label="Card crop"
          value={value.map_crop ?? ""}
          onChange={(e) => set({ map_crop: (e.target.value || null) as MuscleMapCrop | null })}
        >
          {inheritable && <option value="">Inherit crop</option>}
          {value.map_crops.map((crop) => (
            <option key={crop} value={crop}>
              {MUSCLE_MAP_CROP_LABEL[crop]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
