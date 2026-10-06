"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useJobKeeper } from "@/hooks/use-generation-jobs";

/**
 * Header pill on every staff page while images are being generated on the server. Mounting it
 * also keeps the queue moving (see useJobKeeper), whatever page is open.
 */
export function GenerationIndicator() {
  const { queued, running } = useJobKeeper();
  const pending = queued + running;
  if (!pending) return null;
  return (
    <Link
      href="/images"
      title={`${running} generating, ${queued} waiting`}
      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 shadow-2xs hover:border-zinc-300 hover:bg-zinc-50"
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />
      <span className="tabular-nums">{pending}</span>
      <span className="hidden sm:inline">generating</span>
    </Link>
  );
}
