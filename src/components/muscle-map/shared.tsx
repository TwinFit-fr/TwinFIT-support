"use client";

import { useRef } from "react";
import { Upload as UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { CHECKER_STYLE } from "@/components/images/checker";
import { readAsBase64 } from "@/components/images/settings/form-ui";
import { imageThumbUrl } from "@/lib/images/urls";
import type { MapBase, MapMask } from "@/lib/muscle-map/types";
import type { Upload } from "./use-muscle-map";

/** `#RRGGBB[AA]` → the opaque color and its alpha (0..1). */
function splitColor(color: string): { rgb: string; alpha: number } {
  const match = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(color.trim());
  if (!match) return { rgb: color, alpha: 1 };
  return { rgb: `#${match[1]}`, alpha: match[2] ? parseInt(match[2], 16) / 255 : 1 };
}

/**
 * A base with masks painted over it as clients paint them: base × color × the mask's volume
 * shade (multiply), weighted by mask alpha × color alpha. Masks are drawn in order, so put the
 * target last. CSS masks read the public files (Storage serves CORS).
 */
export function MaskedBase({
  base,
  layers,
  width = 320,
  className,
}: {
  base: MapBase;
  layers: Array<{ mask: MapMask; color: string }>;
  width?: number;
  className?: string;
}) {
  const baseUrl = imageThumbUrl(base.image_url, width) ?? base.image_url;
  return (
    <div
      className={`relative w-full overflow-hidden rounded-md ${className ?? ""}`}
      style={{ ...CHECKER_STYLE, aspectRatio: `${base.width} / ${base.height}` }}
    >
      <div className="absolute inset-0 isolate">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={baseUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />
        {layers.map(({ mask, color }) => {
          const url = `url("${imageThumbUrl(mask.image_url, width) ?? mask.image_url}")`;
          const { rgb, alpha } = splitColor(color);
          return (
            <div
              key={mask.id}
              className="absolute inset-0"
              style={{
                // color × shade inside the mask, then multiplied onto the base.
                backgroundColor: rgb,
                backgroundImage: url,
                backgroundSize: "100% 100%",
                backgroundBlendMode: "multiply",
                mixBlendMode: "multiply",
                opacity: alpha,
                maskImage: url,
                WebkitMaskImage: url,
                maskSize: "100% 100%",
                WebkitMaskSize: "100% 100%",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

/** A button that picks an image file and hands it over as base64. */
export function UploadButton({
  label = "Upload",
  disabled,
  onUpload,
}: {
  label?: string;
  disabled?: boolean;
  onUpload: (upload: Upload) => void | Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/png,image/webp,image/jpeg"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) await onUpload({ mimeType: file.type, data: await readAsBase64(file) });
        }}
      />
      <Button
        type="button"
        variant="secondary"
        className="h-8 px-2 text-xs"
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        <UploadIcon className="h-3.5 w-3.5" />
        {label}
      </Button>
    </>
  );
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

export function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/**
 * `MaskedBase` cropped to a normalized box (the painted masks plus a margin), the way the app
 * would show it on a card.
 */
export function CroppedMaskedBase({
  base,
  layers,
  rect,
  width = 320,
}: {
  base: MapBase;
  layers: Array<{ mask: MapMask; color: string }>;
  rect: { x: number; y: number; w: number; h: number };
  width?: number;
}) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-md"
      style={{ aspectRatio: `${rect.w * base.width} / ${rect.h * base.height}` }}
    >
      <div
        className="absolute"
        style={{
          left: `${(-rect.x / rect.w) * 100}%`,
          top: `${(-rect.y / rect.h) * 100}%`,
          width: `${100 / rect.w}%`,
        }}
      >
        <MaskedBase
          base={base}
          layers={layers}
          width={Math.min(1024, Math.round(width / rect.w))}
          className="rounded-none"
        />
      </div>
    </div>
  );
}
