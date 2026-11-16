"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  SUPPORT_CONTRACT_VERSION,
  type ApiInfo,
  type CompatibilityStatus,
} from "@/lib/backend-compatibility";

const RECHECK_MS = 10 * 60 * 1000;

type Verdict = Partial<ApiInfo> & { status: CompatibilityStatus };

/**
 * Lightweight banner when the backend's contract is out of Support's range. It does not block
 * day-to-day work; a failed probe shows nothing.
 */
export function BackendCompatBanner() {
  const [verdict, setVerdict] = useState<Verdict>({ status: "unknown" });

  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      try {
        const res = await fetch("/api/backend-compat", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Verdict;
        if (!cancelled) setVerdict(data);
      } catch {
        // Fail open: keep the current verdict.
      }
    };
    void probe();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void probe();
    }, RECHECK_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (verdict.status === "update-required") {
    return (
      <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900">
        <div className="mx-auto flex max-w-7xl items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>This Support build is out of date.</strong> The backend no longer supports contract{" "}
            {SUPPORT_CONTRACT_VERSION} (it needs {verdict.minClientContractVersion} or newer). Pages may fail
            or save wrong data: reload, and if this stays, deploy a newer Support.
          </span>
        </div>
      </div>
    );
  }
  if (verdict.status === "backend-behind") {
    return (
      <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        <div className="mx-auto flex max-w-7xl items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>The backend is older than this Support build.</strong> It speaks contract{" "}
            {verdict.contractVersion}, Support expects {SUPPORT_CONTRACT_VERSION}. Some screens may not work
            until the backend is deployed.
          </span>
        </div>
      </div>
    );
  }
  return null;
}
