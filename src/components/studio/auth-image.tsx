"use client";

import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { studioAssetObjectUrl } from "@/lib/studio/asset-auth";
import { isStudioStorageUrl } from "@/lib/studio/storage-url";
import { cn } from "@/lib/utils";

/**
 * An image that may live in the staff-only bucket: those are fetched with the JWT into a blob
 * URL; any other URL is shown as it is. A placeholder while loading or when there is nothing, and
 * `fallback` (else the placeholder) instead of a broken image when the file cannot be loaded.
 */
export function AuthImage({ src, alt, className, fallback }: { src: string | null; alt: string; className?: string; fallback?: React.ReactNode }) {
  const needsAuth = Boolean(src && isStudioStorageUrl(src));
  // The blob URL is keyed by the src it was fetched for: a stale one is never shown for a new src.
  const [loaded, setLoaded] = useState<{ src: string; url: string } | null>(null);
  // The src that could not be loaded (fetch or decode): another src gets its own try.
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!src || !isStudioStorageUrl(src)) return;
    let cancelled = false;
    studioAssetObjectUrl(src).then(
      (url) => {
        if (!cancelled) setLoaded({ src, url });
      },
      () => {
        if (!cancelled) setFailed(src);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [src]);
  const broken = Boolean(src) && failed === src;
  if (broken && fallback) return <>{fallback}</>;
  const resolved = !src || broken ? null : !needsAuth ? src : loaded?.src === src ? loaded.url : null;
  if (!resolved) {
    return (
      <div className={cn("flex h-full w-full items-center justify-center text-(--m3-on-surface-variant)", className)}>
        <ImageOff className="h-4 w-4" />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={resolved} alt={alt} className={cn("h-full w-full object-cover", className)} loading="lazy" onError={() => setFailed(src)} />;
}
