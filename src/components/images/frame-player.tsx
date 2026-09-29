"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { gifPlaybackOrder, imageThumbUrl } from "@/lib/images/urls";
import { framePositionLabel } from "@/lib/images/types";

// Real movement pauses at the extremes and passes quickly through the middle.
const HOLD_MS: Record<number, number> = { 0: 600, 1: 300, 2: 600 };
const FADE_MS = 250;

function usePlaybackAllowed(ref: React.RefObject<HTMLElement | null>): boolean {
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(media.matches);
    const onChange = () => setReducedMotion(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

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

/** Plays active frames as a 0→1→2→1→0 loop with crossfades; static with fewer than two frames. */
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

  const currentPosition = order[step % order.length];

  useEffect(() => {
    if (!animated || !playing) return;
    const timer = window.setTimeout(
      () => setStep((i) => (i + 1) % order.length),
      HOLD_MS[currentPosition] ?? 450,
    );
    return () => window.clearTimeout(timer);
  }, [animated, playing, order.length, currentPosition, step]);

  const staticSrc = animated ? null : imageThumbUrl(frames[0]?.image_url ?? fallbackUrl, width);

  return (
    <div
      ref={ref}
      className="relative h-full w-full"
      {...(animated ? { role: "img", "aria-label": `${alt} (animated)` } : {})}
    >
      {animated ? (
        <>
          {frames.map((frame) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={frame.position}
              src={imageThumbUrl(frame.image_url, width) ?? undefined}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-contain"
              style={{
                opacity: frame.position === currentPosition ? 1 : 0,
                transition: `opacity ${FADE_MS}ms ease-in-out`,
              }}
            />
          ))}
          {showLabel && (
            <span className="absolute bottom-1 right-1 rounded bg-black/50 px-1 text-[10px] text-white">
              {framePositionLabel(currentPosition)}
            </span>
          )}
        </>
      ) : staticSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={staticSrc} alt={alt} loading="lazy" className="h-full w-full object-contain" />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-zinc-400">No image</div>
      )}
    </div>
  );
}
