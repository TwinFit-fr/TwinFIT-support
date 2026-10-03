"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ImageOff } from "lucide-react";
import { frameHoldMs, gifPlaybackOrder, imageThumbUrl } from "@/lib/images/urls";
import { framePositionLabel } from "@/lib/images/types";

/** True once every URL is downloaded and decoded, so the first loop never shows a gap. */
function useFramesDecoded(urls: string[], enabled: boolean): boolean {
  const key = urls.join("|");
  const [decodedKey, setDecodedKey] = useState<string | null>(null);
  useEffect(() => {
    if (!urls.length || !enabled || decodedKey === key) return;
    let cancelled = false;
    void Promise.all(
      urls.map((url) => {
        const img = new Image();
        img.src = url;
        return img.decode().catch(() => undefined);
      }),
    ).then(() => {
      if (!cancelled) setDecodedKey(key);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  return decodedKey === key;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const media = window.matchMedia(REDUCED_MOTION);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function usePlaybackAllowed(ref: React.RefObject<HTMLElement | null>): boolean {
  const [visible, setVisible] = useState(false);
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: "100px",
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);

  return visible && !reducedMotion;
}

/** Loops active frames (0→1→2→1 or 0→2) in a fixed-length cycle; static with fewer than two. */
export function FramePlayer({
  frames,
  fallbackUrl,
  alt,
  width,
  showLabel = true,
}: {
  frames: { position: number; image_url: string }[];
  fallbackUrl: string | null;
  alt: string;
  width: number;
  showLabel?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const playing = usePlaybackAllowed(ref);
  const order = useMemo(() => gifPlaybackOrder(frames.map((f) => f.position)), [frames]);
  const [step, setStep] = useState(0);
  const animated = order.length > 1;
  const urls = useMemo(
    () => (animated ? frames.map((f) => imageThumbUrl(f.image_url, width) ?? "") : []),
    [animated, frames, width],
  );
  const decoded = useFramesDecoded(urls, playing);

  const currentPosition = order[step % order.length];

  useEffect(() => {
    if (!animated || !playing || !decoded) return;
    const timer = window.setTimeout(
      () => setStep((i) => (i + 1) % order.length),
      frameHoldMs(order, step % order.length),
    );
    return () => window.clearTimeout(timer);
  }, [animated, playing, decoded, order, step]);

  const staticSrc = animated ? null : imageThumbUrl(frames[0]?.image_url ?? fallbackUrl, width);

  return (
    <div
      ref={ref}
      className="relative h-full w-full"
      {...(animated ? { role: "img", "aria-label": `${alt} (animated)` } : {})}
    >
      {animated ? (
        <>
          {frames.map((frame, i) => (
            // Hard cuts: crossfading transparent frames makes the figure see-through mid-way.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={frame.position}
              src={urls[i] || undefined}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-contain"
              style={{ visibility: frame.position === currentPosition ? "visible" : "hidden" }}
            />
          ))}
          {showLabel && (
            <span className="absolute bottom-1.5 right-1.5 rounded bg-black/55 px-1.5 py-px text-[10px] font-medium text-white">
              {framePositionLabel(currentPosition)}
            </span>
          )}
        </>
      ) : staticSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={staticSrc} alt={alt} loading="lazy" className="h-full w-full object-contain" />
      ) : (
        <div className="flex h-full items-center justify-center text-zinc-300" aria-label="No image">
          <ImageOff className="h-5 w-5" strokeWidth={1.5} />
        </div>
      )}
    </div>
  );
}
