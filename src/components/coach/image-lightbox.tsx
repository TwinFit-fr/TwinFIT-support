"use client";

import { useId, useState } from "react";
import { Maximize2, Minus, Plus, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/primitives";

const STEPS = [0.5, 0.75, 1, 1.5, 2, 3, 4];

/**
 * A full-screen view of one image. "Fit" scales it into the window; a zoom level draws it at that
 * multiple of its natural size and the view scrolls. Clicking the picture toggles fit and 2×.
 */
export function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const titleId = useId();
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);

  const step = (direction: 1 | -1) => {
    setZoom((current) => {
      const value = current === "fit" ? 1 : current;
      const index = STEPS.findIndex((s) => s >= value - 1e-6);
      const at = index < 0 ? STEPS.length - 1 : index;
      return STEPS[Math.min(STEPS.length - 1, Math.max(0, at + direction))];
    });
  };

  return (
    <Modal
      onClose={onClose}
      labelledBy={titleId}
      className="h-dvh max-h-none w-dvw max-w-none rounded-none border-0 bg-black/95 text-white"
    >
      <div
        className="flex h-full flex-col"
        onKeyDown={(event) => {
          if (event.key === "+" || event.key === "=") step(1);
          else if (event.key === "-") step(-1);
          else if (event.key === "0") setZoom("fit");
        }}
      >
        <div className="flex items-center gap-2 px-4 py-3">
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-sm">
            {alt || "Image"}
            {natural && (
              <span className="ml-2 text-xs text-zinc-400">
                {natural.width}×{natural.height}
              </span>
            )}
          </h2>
          <span className="text-xs tabular-nums text-zinc-400" aria-live="polite">
            {zoom === "fit" ? "Fit" : `${Math.round(zoom * 100)}%`}
          </span>
          <Button type="button" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" aria-label="Zoom out" title="Zoom out (-)" onClick={() => step(-1)}>
            <Minus className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" aria-label="Zoom in" title="Zoom in (+)" onClick={() => step(1)}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" aria-label="Fit to window" title="Fit to window (0)" onClick={() => setZoom("fit")}>
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" aria-label="Close" title="Close (Escape)" onClick={onClose} autoFocus>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- storage and blob URLs, no optimisation */}
          <img
            src={src}
            alt={alt}
            onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            onClick={() => setZoom((current) => (current === "fit" ? 2 : "fit"))}
            className={zoom === "fit" ? "max-h-full max-w-full cursor-zoom-in object-contain" : "max-w-none cursor-zoom-out"}
            style={
              zoom === "fit" || !natural
                ? undefined
                : { width: natural.width * zoom, height: natural.height * zoom, margin: "auto", flexShrink: 0 }
            }
          />
        </div>
      </div>
    </Modal>
  );
}
