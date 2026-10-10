"use client";

import { useEffect, useRef, useState } from "react";
import { useAccessToken } from "@nhost/react";
import { Button } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/modal";
import { CHECKER_STYLE } from "@/components/images/checker";
import {
  ADJUST_LIMITS,
  DEFAULT_ADJUST,
  UPLOAD_ADJUST,
  buildMask,
  normalizeAdjust,
  rectOf,
  type AdjustParams,
  type Raster,
} from "@/lib/muscle-map/mask-ops";
import { drawPixels, loadRaster, tintInPlace } from "@/lib/muscle-map/paint";
import type { MapBase, MapMask, Rect } from "@/lib/muscle-map/types";
import { errorText } from "./shared";
import type { MuscleMapApi } from "./use-muscle-map";

const PREVIEW_TINT = "#E53935CC";

const SLIDERS: Array<{ key: keyof typeof ADJUST_LIMITS; label: string; unit: string }> = [
  { key: "tolerance", label: "Color tolerance", unit: "%" },
  { key: "grow", label: "Grow / shrink", unit: "px" },
  { key: "smooth", label: "Smooth", unit: "px" },
  { key: "min_area", label: "Remove islands and holes under", unit: "% of image" },
  { key: "offset_x", label: "Offset x", unit: "px" },
  { key: "offset_y", label: "Offset y", unit: "px" },
];

/**
 * Re-extracts a mask from its source with live preview: the browser runs the same `mask-ops`
 * as the server, which recomputes the file on save (no new generation).
 */
export function MaskAdjustDialog({
  api,
  mask,
  base,
  muscleName,
  keyColor,
  onClose,
}: {
  api: MuscleMapApi;
  mask: MapMask;
  base: MapBase;
  muscleName: string;
  keyColor: string;
  onClose: () => void;
}) {
  const token = useAccessToken();
  const defaults = mask.method === "uploaded" ? UPLOAD_ADJUST : DEFAULT_ADJUST;
  const [params, setParams] = useState<AdjustParams>(() =>
    normalizeAdjust(mask.params.adjust, defaults),
  );
  const [rasters, setRasters] = useState<{ source: Raster; base: Raster } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [show, setShow] = useState<"mask" | "source">("mask");
  const [rect, setRect] = useState<Rect | null>(mask.rect);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!token || !mask.source_file_id) return;
    const size = { width: base.width, height: base.height };
    let cancelled = false;
    Promise.all([loadRaster(mask.source_file_id, token, size), loadRaster(base.file_id, token, size)])
      .then(([source, baseRaster]) => {
        if (!cancelled) setRasters({ source, base: baseRaster });
      })
      .catch((error) => {
        if (!cancelled) setLoadError(errorText(error, "Could not load the images"));
      });
    return () => {
      cancelled = true;
    };
  }, [token, mask.source_file_id, base.file_id, base.width, base.height]);

  useEffect(() => {
    if (!rasters || !canvas.current) return;
    const target = canvas.current;
    const timer = window.setTimeout(() => {
      const { width, height } = rasters.base;
      if (show === "source") {
        drawPixels(target, new Uint8ClampedArray(rasters.source.data), width, height);
        return;
      }
      const alpha = buildMask(rasters.source, rasters.base, keyColor, params);
      const pixels = new Uint8ClampedArray(rasters.base.data);
      tintInPlace(pixels, alpha, PREVIEW_TINT);
      drawPixels(target, pixels, width, height);
      setRect(rectOf(alpha, width, height));
    }, 80);
    return () => window.clearTimeout(timer);
  }, [rasters, params, show, keyColor]);

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await api.adjustMask(mask.id, params);
      onClose();
    } catch (error) {
      setSaveError(errorText(error, "Saving the mask failed"));
    } finally {
      setSaving(false);
    }
  }

  const set = (patch: Partial<AdjustParams>) => setParams((current) => ({ ...current, ...patch }));

  return (
    <Modal
      onClose={onClose}
      labelledBy="mask-adjust-title"
      dismissible={!saving}
      className="max-w-5xl"
    >
      <div className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-2">
          <div
            className="flex aspect-square items-center justify-center overflow-hidden rounded-md"
            style={CHECKER_STYLE}
          >
            {!mask.source_file_id ? (
              <p className="text-sm text-zinc-500">This mask has no source image to adjust.</p>
            ) : loadError ? (
              <p className="text-sm text-red-600">{loadError}</p>
            ) : !rasters ? (
              <p className="text-sm text-zinc-500">Loading…</p>
            ) : null}
            <canvas
              ref={canvas}
              className={rasters ? "max-h-full max-w-full object-contain" : "hidden"}
            />
          </div>
          <p className="text-xs text-zinc-500">
            {rect
              ? `Box: x ${rect.x.toFixed(3)} · y ${rect.y.toFixed(3)} · w ${rect.w.toFixed(3)} · h ${rect.h.toFixed(3)}`
              : "Empty mask: raise the tolerance or check the source."}
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <h2 id="mask-adjust-title" className="text-lg font-semibold">
              Adjust {muscleName}
            </h2>
            <p className="text-xs text-zinc-500">
              From the {mask.method === "uploaded" ? "uploaded image" : "model output"}; no new
              generation.
            </p>
          </div>

          <div className="flex gap-1">
            {(["mask", "source"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setShow(mode)}
                className={`rounded-md px-2.5 py-1 text-xs ${
                  show === mode ? "bg-zinc-900 text-white" : "border border-zinc-300"
                }`}
              >
                {mode === "mask" ? "Mask on base" : "Show source"}
              </button>
            ))}
          </div>

          <label className="block text-xs font-medium text-zinc-600">
            Extract by
            <select
              className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              value={params.mode}
              onChange={(e) => set({ mode: e.target.value as AdjustParams["mode"] })}
            >
              <option value="key">Key color {keyColor}</option>
              <option value="alpha">Image alpha</option>
            </select>
          </label>

          {SLIDERS.map(({ key, label, unit }) => {
            const limits = ADJUST_LIMITS[key];
            if (key === "tolerance" && params.mode === "alpha") return null;
            return (
              <label key={key} className="block text-xs font-medium text-zinc-600">
                {label}: {params[key]} {unit}
                <input
                  type="range"
                  min={limits.min}
                  max={limits.max}
                  step={limits.step}
                  value={params[key]}
                  onChange={(e) => set({ [key]: Number(e.target.value) })}
                  className="mt-1 w-full"
                />
              </label>
            );
          })}

          <label className="flex items-center gap-2 text-xs font-medium text-zinc-600">
            <input
              type="checkbox"
              checked={params.clip_to_body}
              onChange={(e) => set({ clip_to_body: e.target.checked })}
            />
            Keep inside the body
          </label>

          <Button
            type="button"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={() => setParams({ ...defaults })}
          >
            Reset to defaults
          </Button>

          {saveError && <p className="text-sm text-red-600">{saveError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving || !rasters}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save mask"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
