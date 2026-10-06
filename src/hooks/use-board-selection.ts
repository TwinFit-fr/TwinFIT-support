"use client";

import { useCallback, useMemo, useState } from "react";

/**
 * Selection on a filtered board. Only the cards on screen are selected: what the count shows is
 * exactly what a run acts on, and cards hidden by a filter are never included. A range toggle
 * (Shift-click) sets every card from the last toggled one to the clicked one like the clicked one.
 */
export function useBoardSelection<K>(visible: readonly K[]) {
  const [picked, setPicked] = useState<ReadonlySet<K>>(() => new Set());
  const [anchor, setAnchor] = useState<K | null>(null);
  const selected = useMemo(
    () => new Set(visible.filter((key) => picked.has(key))),
    [visible, picked],
  );

  const toggle = useCallback(
    (key: K, range = false) => {
      const next = new Set(selected);
      const on = !selected.has(key);
      const from = range && anchor !== null ? visible.indexOf(anchor) : -1;
      const to = visible.indexOf(key);
      const keys =
        from >= 0 && to >= 0 ? visible.slice(Math.min(from, to), Math.max(from, to) + 1) : [key];
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      setPicked(next);
      setAnchor(key);
    },
    [selected, anchor, visible],
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
