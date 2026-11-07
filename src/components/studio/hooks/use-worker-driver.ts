"use client";

import { useCallback, useEffect, useRef } from "react";
import { useStaffFetch } from "@/hooks/use-staff-fetch";

/** While the queue has rows the workspace drives the pipeline: one claim per tick. */
const WORKER_TICK_MS = 4000;

type TickResponse = { results?: ({ claimed: false } | { id: string; status: string; outcome: string })[] };

/**
 * Runs the movement pipeline from the browser while any exercise in the catalog has queued rows
 * (not only the open one): each tick asks the server to claim and process one row; the claim
 * also requeues rows left processing by a dead request. Several tabs may tick, the claim keeps
 * the concurrency cap. After a tick that did something the lists refresh.
 */
export function useWorkerDriver(active: boolean, onTicked: (claimed: boolean) => void) {
  const staffFetch = useStaffFetch();
  const ticking = useRef(false);
  const onTickedRef = useRef(onTicked);
  useEffect(() => {
    onTickedRef.current = onTicked;
  }, [onTicked]);

  const tick = useCallback(async () => {
    if (ticking.current) return;
    ticking.current = true;
    let claimed = false;
    try {
      const body = (await staffFetch("/api/studio/worker", { method: "POST", body: JSON.stringify({ max: 1 }) })) as TickResponse;
      claimed = Boolean(body.results?.some((r) => "id" in r));
    } catch {
      // The row reports its own error on the next poll.
    } finally {
      ticking.current = false;
      onTickedRef.current(claimed);
    }
  }, [staffFetch]);

  useEffect(() => {
    if (!active) return;
    void tick();
    const id = window.setInterval(() => void tick(), WORKER_TICK_MS);
    return () => window.clearInterval(id);
  }, [active, tick]);
}
