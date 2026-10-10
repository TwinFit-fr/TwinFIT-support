"use client";

import { useRef } from "react";
import { Upload as UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { CHECKER_STYLE } from "@/components/images/checker";
import { readAsBase64 } from "@/components/images/settings/form-ui";
import { imageThumbUrl } from "@/lib/images/urls";
import type { MapBase, MapMask } from "@/lib/muscle-map/types";
import type { Upload } from "./use-muscle-map";

/**
 * A base with masks tinted over it (CSS masks on the public files; Storage serves CORS). Masks
 * are drawn in order, so put the target last.
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={baseUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />
      {layers.map(({ mask, color }) => {
        const url = `url("${imageThumbUrl(mask.image_url, width) ?? mask.image_url}")`;
        return (
          <div
            key={mask.id}
            className="absolute inset-0"
            style={{
              backgroundColor: color,
              maskImage: url,
              WebkitMaskImage: url,
              maskSize: "100% 100%",
              WebkitMaskSize: "100% 100%",
            }}
          />
        );
      })}
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
