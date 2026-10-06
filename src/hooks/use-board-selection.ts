"use client";

import { useCallback, useMemo, useState } from "react";

/**
 * Selection on a filtered board. Only the cards on screen are selected: what the count shows is
 * exactly what a run acts on, and cards hidden by a filter are never included.
 */
export function useBoardSelection<K>(visible: readonly K[]) {
  const [picked, setPicked] = useState<ReadonlySet<K>>(() => new Set());
  const selected = useMemo(() => new Set(visible.filter((key) => picked.has(key))), [
    visible,
    picked,
  ]);

  const toggle = useCallback(
    (key: K) => {
      const next = new Set(selected);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      setPicked(next);
    },
    [selected],
  );
  const selectAll = useCallback(() => setPicked(new Set(visible)), [visible]);
  const clear = useCallback(() => setPicked(new Set()), []);

  return {
    count: selected.size,
    has: (key: K) => selected.has(key),
    allSelected: visible.length > 0 && selected.size === visible.length,
    toggle,
    selectAll,
    clear,
  };
}
