// Reports the loading manager's progress from inside the canvas to the DOM overlay.
"use client";

import { useEffect } from "react";
import { useProgress } from "@react-three/drei";

/**
 * Reports the loading manager's progress to the DOM overlay; renders nothing in the scene.
 * It subscribes to drei's progress store outside React's render and defers each report, because
 * the store updates synchronously while a sibling (a model, an equipment GLB) is still rendering
 * and suspending; a hook subscription there would set state during another component's render.
 */
export function LoadReporter({ onProgress }: { onProgress?: (progress: number | null) => void }) {
  useEffect(() => {
    let timer = 0;
    const emit = () => {
      const { active, progress } = useProgress.getState();
      onProgress?.(active ? progress : null);
    };
    const unsubscribe = useProgress.subscribe(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(emit, 0);
    });
    emit();
    return () => {
      unsubscribe();
      window.clearTimeout(timer);
      onProgress?.(null);
    };
  }, [onProgress]);
  return null;
}
