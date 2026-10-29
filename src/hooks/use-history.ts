"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Undo/redo over a value. `commit` pushes the current value onto the past; commits that share a
 * `group` within `GROUP_MS` of each other (typing in one field) replace the top entry instead, so
 * one undo reverts a burst of keystrokes rather than one character.
 */

const GROUP_MS = 1200;
const MAX_PAST = 200;

type Stacks<T> = { past: T[]; present: T; future: T[] };

export function useHistory<T>(initial: T) {
  const [stacks, setStacks] = useState<Stacks<T>>({ past: [], present: initial, future: [] });
  const lastGroup = useRef<{ group: string; at: number } | null>(null);

  const commit = useCallback((next: T | ((present: T) => T), group?: string) => {
    const now = Date.now();
    const merge = Boolean(
      group && lastGroup.current && lastGroup.current.group === group && now - lastGroup.current.at < GROUP_MS,
    );
    lastGroup.current = group ? { group, at: now } : null;
    setStacks((s) => {
      const value = typeof next === "function" ? (next as (present: T) => T)(s.present) : next;
      if (value === s.present) return s;
      const past = merge ? s.past : [...s.past, s.present].slice(-MAX_PAST);
      return { past, present: value, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    lastGroup.current = null;
    setStacks((s) => {
      if (s.past.length === 0) return s;
      const present = s.past[s.past.length - 1];
      return { past: s.past.slice(0, -1), present, future: [s.present, ...s.future] };
    });
  }, []);

  const redo = useCallback(() => {
    lastGroup.current = null;
    setStacks((s) => {
      if (s.future.length === 0) return s;
      const [present, ...future] = s.future;
      return { past: [...s.past, s.present], present, future };
    });
  }, []);

  /** Replaces the value and forgets the history (after Save, Discard, or a server refresh). */
  const reset = useCallback((value: T) => {
    lastGroup.current = null;
    setStacks({ past: [], present: value, future: [] });
  }, []);

  return {
    value: stacks.present,
    commit,
    undo,
    redo,
    reset,
    canUndo: stacks.past.length > 0,
    canRedo: stacks.future.length > 0,
  };
}
