"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { FRAME_POSITIONS, MUSCLE_MAP_CROPS, MUSCLE_MAP_VIEWS, SUBJECTS } from "@/lib/images/types";
import type { FrameCountChoice, MuscleMapCrop, MuscleMapView, Subject } from "@/lib/images/types";

/**
 * Choices the Images pages remember per browser (style, subjects, positions, views, crops,
 * frame count), shared live across pages and tabs through localStorage.
 */

const listeners = new Set<() => void>();
const written = new Map<string, string>();

function subscribeStorage(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key) written.delete(event.key);
    onChange();
  };
  listeners.add(onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function readStorage(key: string): string | null {
  if (written.has(key)) return written.get(key)!;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function useStoredChoice<T>(key: string, fallback: T, parse: (raw: unknown) => T | null) {
  const raw = useSyncExternalStore(
    subscribeStorage,
    () => readStorage(key),
    () => null,
  );
  const value = useMemo(() => {
    if (raw == null) return fallback;
    try {
      return parse(JSON.parse(raw)) ?? fallback;
    } catch {
      return fallback;
    }
  }, [raw, fallback, parse]);
  const set = useCallback(
    (next: T) => {
      const json = JSON.stringify(next);
      written.set(key, json);
      try {
        localStorage.setItem(key, json);
      } catch {
        /* preference only */
      }
      listeners.forEach((notify) => notify());
    },
    [key],
  );
  return [value, set] as const;
}

const ALL_POSITIONS = FRAME_POSITIONS.map((p) => p.id as number);
const ALL_SUBJECTS = [...SUBJECTS];

function parsePositions(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const valid = ALL_POSITIONS.filter((p) => raw.includes(p));
  return valid.length ? valid : null;
}

function parseSubjects(raw: unknown): Subject[] | null {
  if (!Array.isArray(raw)) return null;
  const valid = ALL_SUBJECTS.filter((s) => raw.includes(s));
  return valid.length ? valid : null;
}

function parseViews(raw: unknown): MuscleMapView[] | null {
  if (!Array.isArray(raw)) return null;
  const valid = MUSCLE_MAP_VIEWS.filter((v) => raw.includes(v));
  return valid.length ? valid : null;
}

function parseCrops(raw: unknown): MuscleMapCrop[] | null {
  if (!Array.isArray(raw)) return null;
  const valid = MUSCLE_MAP_CROPS.filter((c) => raw.includes(c));
  return valid.length ? valid : null;
}

function parseFrameCount(raw: unknown): FrameCountChoice | null {
  return raw === "exercise" || raw === 2 || raw === 3 ? raw : null;
}

function parseStyleId(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

const DEFAULT_FRAME_COUNT: FrameCountChoice = "exercise";

export function usePositionSelection() {
  const [positions, setPositions] = useStoredChoice(
    "twinfit.images.positions",
    ALL_POSITIONS,
    parsePositions,
  );
  const setSorted = useCallback(
    (next: number[]) => setPositions(ALL_POSITIONS.filter((p) => next.includes(p))),
    [setPositions],
  );
  return [positions, setSorted] as const;
}

/** Subjects to generate for; default is both man and woman. */
export function useSubjectSelection() {
  const [subjects, setSubjects] = useStoredChoice(
    "twinfit.images.subjects",
    ALL_SUBJECTS,
    parseSubjects,
  );
  const setSorted = useCallback(
    (next: Subject[]) => setSubjects(ALL_SUBJECTS.filter((s) => next.includes(s))),
    [setSubjects],
  );
  return [subjects, setSorted] as const;
}

const ALL_VIEWS = [...MUSCLE_MAP_VIEWS];

/** Muscle map views to generate; default is front and back. */
export function useViewSelection() {
  const [views, setViews] = useStoredChoice("twinfit.images.views", ALL_VIEWS, parseViews);
  const setSorted = useCallback(
    (next: MuscleMapView[]) => setViews(ALL_VIEWS.filter((v) => next.includes(v))),
    [setViews],
  );
  return [views, setSorted] as const;
}

const ALL_CROPS = [...MUSCLE_MAP_CROPS];

/** Muscle map crops to generate; default is all (each target keeps only the crops it has). */
export function useCropSelection() {
  const [crops, setCrops] = useStoredChoice("twinfit.images.crops", ALL_CROPS, parseCrops);
  const setSorted = useCallback(
    (next: MuscleMapCrop[]) => setCrops(ALL_CROPS.filter((c) => next.includes(c))),
    [setCrops],
  );
  return [crops, setSorted] as const;
}

function parseStringList(raw: unknown): string[] | null {
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : null;
}

const NO_GROUPS: string[] = [];

/** Whether a Styles → Assets group is folded; remembered per browser, open by default. */
export function useAssetGroupCollapsed(id: string) {
  const [collapsed, setCollapsed] = useStoredChoice(
    "twinfit.images.assets.collapsed",
    NO_GROUPS,
    parseStringList,
  );
  const isCollapsed = collapsed.includes(id);
  const toggle = useCallback(
    () => setCollapsed(isCollapsed ? collapsed.filter((g) => g !== id) : [...collapsed, id]),
    [collapsed, id, isCollapsed, setCollapsed],
  );
  return [isCollapsed, toggle] as const;
}

export function useFrameCountChoice() {
  return useStoredChoice("twinfit.images.frame-count", DEFAULT_FRAME_COUNT, parseFrameCount);
}

/**
 * The style every Images page works on, shared and persisted across pages and tabs. A stored id
 * that is no longer in `styles` (deleted) resolves to the default style, then the first one;
 * null until the styles load.
 */
export function useStyleChoice(styles: readonly { id: string; is_default: boolean }[]) {
  const [stored, setStored] = useStoredChoice<string | null>(
    "twinfit.images.styleId",
    null,
    parseStyleId,
  );
  const styleId =
    styles.find((s) => s.id === stored)?.id ??
    styles.find((s) => s.is_default)?.id ??
    styles[0]?.id ??
    null;
  return [styleId, setStored] as const;
}
