"use client";

import { useEffect, useRef, useState } from "react";
import { DETAILS, DETAIL_SPEC, type Detail } from "@/lib/studio/key-poses";
import { useStudioStore } from "@/lib/studio/store";
import { captureFramesKept, rebuildFromCapture } from "./hooks/use-capture-edit";
import { M3Button, Segmented } from "./ui";

const HINT: Record<Detail, string> = {
  fewer: `At most ${DETAIL_SPEC.fewer.cap} key poses, within ${DETAIL_SPEC.fewer.tolerance}° of the capture: the simplest to edit`,
  balanced: `At most ${DETAIL_SPEC.balanced.cap} key poses, within ${DETAIL_SPEC.balanced.tolerance}° of the capture`,
  more: `Up to ${DETAIL_SPEC.more.cap} key poses, within ${DETAIL_SPEC.more.tolerance}° of the capture: closest to it`,
};

/**
 * With the exercise settings, for key poses made from a capture: how many key poses to keep.
 * A change rebuilds them from the capture at once, as one undo step; after a change made by hand
 * it asks first (keep the edits, or rebuild and replace them), never dropping them silently.
 */
export function CaptureDetail({ rowClass }: { rowClass: string }) {
  const origin = useStudioStore((s) => (s.poseEdit?.origin.kind === "capture" ? s.poseEdit.origin : null));
  const edited = useStudioStore((s) => s.poseEdit?.edited ?? false);
  const avatarId = useStudioStore((s) => s.poseEdit?.avatarId ?? null);
  const editId = useStudioStore((s) => s.poseEdit?.editId ?? null);
  const [asking, setAsking] = useState<{ detail: Detail; editId: number | null } | null>(null);
  const [gone, setGone] = useState(false);
  /** The last change found the same key poses: said, so the setting is not thought broken. */
  const [same, setSame] = useState<{ detail: Detail; keys: number; maxDiff: number; editId: number | null } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const question = asking && asking.editId === editId && edited ? asking : null;
  useEffect(() => {
    if (question) box.current?.querySelector<HTMLButtonElement>("[data-keep]")?.focus();
  }, [question]);
  if (!origin || !avatarId) return null;
  const kept = captureFramesKept(origin, avatarId);

  const apply = (detail: Detail) => {
    const result = rebuildFromCapture(detail);
    if (!result) setGone(true);
    setSame(result && !result.changed ? { detail, keys: result.keys, maxDiff: result.maxDiff, editId } : null);
    setAsking(null);
  };
  const sameNow = same && same.detail === origin.detail && same.editId === editId && !edited ? same : null;
  const choose = (detail: Detail) => {
    if (detail === origin.detail && !edited) return;
    if (edited) setAsking({ detail, editId });
    else apply(detail);
  };

  return (
    <div className="mb-2 space-y-1.5" data-capture-detail={origin.detail}>
      <div className={rowClass}>
        <span className="text-[11px] font-medium text-(--m3-on-surface)">Detail</span>
        <Segmented
          size="sm"
          label="Detail: how many key poses are kept from the capture"
          value={origin.detail}
          onChange={choose}
          options={DETAILS.map((d) => ({ value: d, label: DETAIL_SPEC[d].label, title: HINT[d] }))}
          className="w-full justify-between [&>button]:flex-1"
        />
      </div>
      {question ? (
        <div
          ref={box}
          role="alertdialog"
          aria-labelledby="capture-detail-question"
          aria-describedby="capture-detail-detail"
          className="rounded-(--studio-radius-md) border border-(--m3-warning)/50 bg-(--m3-warning)/10 px-2.5 py-2"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setAsking(null);
            }
          }}
          data-capture-rebuild-confirm
        >
          <p id="capture-detail-question" className="text-[12px] font-semibold leading-snug text-(--m3-on-surface)">
            Rebuild the key poses from the capture with {DETAIL_SPEC[question.detail].label.toLowerCase()} detail?
          </p>
          <p id="capture-detail-detail" className="mt-0.5 text-[11px] leading-snug text-(--m3-on-surface)/85">
            Your changes to these poses are replaced by poses read again from the capture. Ctrl+Z brings them back.
          </p>
          <div className="mt-2 flex justify-end gap-1.5">
            <M3Button data-keep size="sm" variant="text" onClick={() => setAsking(null)} className="text-(--m3-on-surface)">
              Keep my edits
            </M3Button>
            <M3Button size="sm" variant="filled" onClick={() => apply(question.detail)}>
              Rebuild
            </M3Button>
          </div>
        </div>
      ) : null}
      {sameNow ? (
        <p role="status" className="text-[11px] leading-snug text-(--m3-on-surface-variant)" data-capture-detail-same>
          {sameNow.detail === "more"
            ? `More detail finds no closer key poses: these ${sameNow.keys} already follow the capture within ${Math.max(1, Math.round(sameNow.maxDiff))}°, and a key pose in mid-motion would make the body stop there.`
            : `The same ${sameNow.keys} key poses: they are the capture's turning points.`}
        </p>
      ) : null}
      {gone || !kept ? (
        <p role="status" className="text-[11px] leading-snug text-(--m3-on-surface-variant)">
          The capture&apos;s frames are no longer loaded: open the capture again from Clips &amp; queue to change the detail.
        </p>
      ) : null}
    </div>
  );
}
