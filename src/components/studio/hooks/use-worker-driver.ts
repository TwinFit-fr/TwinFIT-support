"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import { STALL_AFTER_FAILURES, tickDelayMs } from "@/lib/studio/jobs";
import { tickWorker } from "@/lib/studio/studio-api";

type TickResponse = { results?: ({ claimed: false } | { id: string; status: string; outcome: string })[] };

/** What the jobs tray says about the queue: idle (nothing to drive), advancing, or not advancing with the reason. */
export type QueueDriver = {
  status: "idle" | "advancing" | "stalled";
  /** The last failed tick's message while ticks keep failing. */
  error: string | null;
  /** Milliseconds between tries now (longer while failing). */
  delayMs: number;
  /** One tick right away (the tray's "Try again"). */
  retry: () => Promise<void>;
};

/**
 * Runs the movement pipeline from the browser while any exercise in the catalog has queued rows
 * (not only the open one): each tick asks the server to claim and process one row; the claim
 * also requeues rows left processing by a dead request. Several tabs may tick, the claim keeps
 * the concurrency cap. After a tick that did something the lists refresh. A tick that fails is
 * counted: after STALL_AFTER_FAILURES in a row the queue is reported as not advancing, with the
 * reason, and the ticks back off until one succeeds.
 */
export function useWorkerDriver(active: boolean, onTicked: (claimed: boolean) => void): QueueDriver {
  const staffFetch = useStaffFetch();
  const ticking = useRef(false);
  const onTickedRef = useRef(onTicked);
  const [health, setHealth] = useState<{ failures: number; error: string | null }>({ failures: 0, error: null });
  useEffect(() => {
    onTickedRef.current = onTicked;
  }, [onTicked]);

  const tick = useCallback(async () => {
    if (ticking.current) return;
    ticking.current = true;
    let claimed = false;
    try {
      const body = (await tickWorker(staffFetch, { max: 1 })) as TickResponse;
      claimed = Boolean(body.results?.some((r) => "id" in r));
      setHealth((h) => (h.failures ? { failures: 0, error: null } : h));
    } catch (err) {
      // A failure before or during the claim never reaches a row: it is reported here instead.
      const message = err instanceof Error && err.message ? err.message : "The worker request failed";
      setHealth((h) => ({ failures: h.failures + 1, error: message === "Failed to fetch" ? "The worker could not be reached (network error)" : message }));
    } finally {
      ticking.current = false;
      onTickedRef.current(claimed);
    }
  }, [staffFetch]);

  const delayMs = tickDelayMs(health.failures);
  // The first tick as soon as there is work (next task, so the effect itself sets no state).
  useEffect(() => {
    if (!active) return;
    const id = window.setTimeout(() => void tick(), 0);
    return () => window.clearTimeout(id);
  }, [active, tick]);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => void tick(), delayMs);
    return () => window.clearInterval(id);
  }, [active, delayMs, tick]);

  const stalled = active && health.failures >= STALL_AFTER_FAILURES;
  return { status: !active ? "idle" : stalled ? "stalled" : "advancing", error: stalled ? health.error : null, delayMs, retry: tick };
}
