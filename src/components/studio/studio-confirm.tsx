"use client";

import { useEffect, useId } from "react";
import { create } from "zustand";
import { AlertTriangle, Coins, Info, X } from "lucide-react";
import { useStaffSWR } from "@/hooks/use-staff-fetch";
import { Modal } from "@/components/ui/modal";
import { EQUIPMENT_KEY, type EquipmentResponse } from "@/lib/studio/equipment";
import { balanceCheck, type PaidRequest } from "@/lib/studio/paid-actions";
import { cn } from "@/lib/utils";
import { M3Button } from "./ui";

/** A plain question in the Studio's own dark dialog (Stop a queued job…). */
type PlainRequest = { title: string; description: string; confirmLabel: string; danger?: boolean };
type Request = ({ kind: "paid" } & PaidRequest) | ({ kind: "plain" } & PlainRequest);

type ConfirmStore = {
  request: Request | null;
  resolve: ((ok: boolean) => void) | null;
  ask: (request: Request) => Promise<boolean>;
  settle: (ok: boolean) => void;
};

/** One question at a time; a newer one answers the pending one with "no". */
const useConfirmStore = create<ConfirmStore>((set, get) => ({
  request: null,
  resolve: null,
  ask: (request) => {
    get().resolve?.(false);
    return new Promise<boolean>((resolve) => set({ request, resolve }));
  },
  settle: (ok) => {
    get().resolve?.(ok);
    set({ request: null, resolve: null });
  },
}));

/**
 * `await paidConfirm(request)` before any call that spends provider credits: it states what will
 * happen, its cost and its expected duration, and resolves true only on Start. Cancel, Escape or
 * the backdrop send nothing.
 */
export function usePaidConfirm(): (request: PaidRequest) => Promise<boolean> {
  const ask = useConfirmStore((s) => s.ask);
  return (request) => ask({ kind: "paid", ...request });
}

export function useStudioConfirm(): (request: PlainRequest) => Promise<boolean> {
  const ask = useConfirmStore((s) => s.ask);
  return (request) => ask({ kind: "plain", ...request });
}

function Row({ label, children, tone }: { label: string; children: React.ReactNode; tone?: "warning" | "strong" }) {
  return (
    <>
      <dt className="pt-px text-(length:--studio-text-xs) text-(--m3-on-surface-variant)">{label}</dt>
      <dd
        className={cn(
          "min-w-0 text-(length:--studio-text-sm) leading-snug text-(--m3-on-surface)",
          tone === "strong" && "font-semibold tabular-nums",
          tone === "warning" && "font-medium text-(--m3-warning)",
        )}
      >
        {children}
      </dd>
    </>
  );
}

/**
 * The Studio's confirmation dialog, dark like the rest of the workspace. A native modal, so it
 * stacks over the dialog that asked (the avatar or equipment dialog) and keeps focus inside;
 * focus starts on Cancel, so a stray Enter spends nothing. Mounted once in the workspace.
 */
export function StudioConfirmHost() {
  const request = useConfirmStore((s) => s.request);
  const settle = useConfirmStore((s) => s.settle);
  // The Meshy balance comes with the equipment list the workspace already polls (same key, no extra request).
  const { data: equipment } = useStaffSWR<EquipmentResponse>(EQUIPMENT_KEY);
  const titleId = useId();
  // showModal() focuses the first control (the close button) after this subtree mounted; Cancel takes it back.
  useEffect(() => {
    if (request) document.querySelector<HTMLButtonElement>("[data-confirm-cancel]")?.focus();
  }, [request]);
  if (!request) return null;

  const paid = request.kind === "paid";
  // The only balance the Studio knows is Meshy's: an OpenAI action shows none rather than the wrong one.
  const balance = paid && request.provider === "Meshy" ? balanceCheck(equipment?.credits?.balance, request.credits) : null;
  const blocked = balance?.enough === false;

  return (
    <Modal
      onClose={() => settle(false)}
      labelledBy={titleId}
      restoreFocus
      className="studio-root w-[520px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-(--studio-radius-lg) border border-(--m3-outline) bg-(--m3-surface-container) p-0 text-(--m3-on-surface) shadow-(--studio-float-shadow) backdrop:bg-(--m3-scrim)"
    >
      <div data-studio-confirm={request.kind} className="flex flex-col">
        <header className="flex items-start gap-(--studio-space-3) px-5 pb-4 pt-5">
          <span
            aria-hidden
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-(--studio-radius-md)",
              paid ? "bg-(--m3-primary-container) text-(--m3-on-primary-container)" : request.danger ? "bg-(--m3-error-container) text-(--m3-error)" : "bg-(--m3-secondary-container) text-(--m3-on-secondary-container)",
            )}
          >
            {paid ? <Coins className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            {paid ? <p className="text-(length:--studio-text-2xs) font-semibold uppercase tracking-[0.14em] text-(--m3-on-surface-variant)">Paid action · {request.provider}</p> : null}
            <h2 id={titleId} className="mt-0.5 text-base font-semibold leading-snug tracking-tight">
              {request.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => settle(false)}
            aria-label="Cancel and close"
            className="studio-state -mr-1 -mt-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-(--m3-on-surface-variant) outline-none focus-visible:ring-2 focus-visible:ring-(--m3-primary)/70"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {paid ? (
          <div className="border-y border-(--m3-outline-variant) bg-(--m3-surface-container-low) px-5 py-4">
            <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-4 gap-y-3">
              <Row label="What it does">{request.action}</Row>
              <Row label="For">{request.subject}</Row>
              {request.source ? <Row label="From">{request.source}</Row> : null}
              <Row label="Cost" tone="strong">
                {request.cost}
              </Row>
              <Row label="Time" tone="strong">
                {request.duration}
              </Row>
              {balance ? (
                <Row label="Balance" tone={blocked ? "warning" : undefined}>
                  {balance.text}
                  {blocked ? <span className="mt-0.5 block text-(length:--studio-text-xs) font-normal text-(--m3-on-surface-variant)">Not enough for this estimate: top up the Meshy account first.</span> : null}
                </Row>
              ) : null}
            </dl>
            <p className="mt-4 flex items-start gap-2 rounded-(--studio-radius-md) bg-(--m3-surface-container-high) px-3 py-2.5 text-(length:--studio-text-xs) leading-relaxed text-(--m3-on-surface-variant)">
              <Info aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-(--m3-primary)" />
              <span>
                It runs in the background: follow it in <strong className="font-semibold text-(--m3-on-surface)">Jobs</strong> in the top bar and keep working. Nothing is sent until you press{" "}
                {request.confirmLabel.split(" · ")[0]}.{request.provider === "OpenAI" ? " This tab runs the queue, so keep a Studio tab open until it finishes." : null}
              </span>
            </p>
          </div>
        ) : (
          <p className="border-t border-(--m3-outline-variant) px-5 py-4 text-(length:--studio-text-sm) leading-relaxed text-(--m3-on-surface-variant)">{request.description}</p>
        )}

        <footer className="flex items-center justify-end gap-2 px-5 py-4">
          {/* Focus starts here: Enter on a freshly opened paid dialog cancels. */}
          <M3Button data-confirm-cancel variant="text" onClick={() => settle(false)}>
            Cancel
          </M3Button>
          <M3Button
            variant="filled"
            disabled={blocked}
            onClick={() => settle(true)}
            className={cn(!paid && request.danger && "bg-(--m3-error) text-(--m3-error-container) shadow-none")}
          >
            {request.confirmLabel}
          </M3Button>
        </footer>
      </div>
    </Modal>
  );
}
