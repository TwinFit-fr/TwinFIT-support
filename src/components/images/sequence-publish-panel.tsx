"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { CHECKER_STYLE } from "@/components/images/checker";
import { ReviewBadge } from "@/components/images/review-badge";
import { activeByPosition } from "@/lib/images/publication";
import {
  PICK_SLOTS,
  effectivePick,
  isEmptyPick,
  needsPublish,
  slotLabel,
  slotPosition,
  suggestPick,
  validatePick,
} from "@/lib/images/sequence";
import type { PickSlot, SequencePick } from "@/lib/images/sequence";
import { SUBJECTS } from "@/lib/images/types";
import type {
  ExerciseImage,
  ExerciseImageDetail,
  SequenceState,
  Subject,
} from "@/lib/images/types";
import { imageThumbUrl } from "@/lib/images/urls";
import { cn } from "@/lib/utils";

const SUBJECT_LABEL: Record<Subject, string> = { man: "Man", woman: "Woman" };

const STATE_LABEL: Record<SequenceState, { text: string; tone: string }> = {
  published: { text: "In the app", tone: "bg-emerald-100 text-emerald-800" },
  unpublished: { text: "Active, not in the app", tone: "bg-amber-100 text-amber-800" },
  empty: { text: "No active frames", tone: "bg-zinc-100 text-zinc-600" },
};

function SlotChip({
  slot,
  image,
  picked,
  selected,
  onSelect,
}: {
  slot: PickSlot;
  image: ExerciseImage | null;
  /** Chosen for this publish (a draft), not the live frame. */
  picked: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      disabled={!image}
      onClick={() => image && onSelect(image.id)}
      title={
        image ? `${slotLabel(slot)}: ${picked ? "picked" : "live"} (select)` : `${slotLabel(slot)}: none`
      }
      className={cn(
        "flex items-center gap-1.5 rounded-lg border bg-white py-1 pl-1 pr-2 text-left text-[11px] transition",
        selected ? "border-zinc-900" : "border-zinc-200 enabled:hover:border-zinc-400",
        !image && "border-dashed text-zinc-400",
      )}
    >
      <span
        className="relative h-8 w-8 shrink-0 overflow-hidden rounded border border-zinc-200"
        style={CHECKER_STYLE}
      >
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageThumbUrl(image.image_url, 80) ?? undefined}
            alt=""
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}
      </span>
      <span className="space-y-0.5">
        <span className="block font-medium text-zinc-800">{slotLabel(slot)}</span>
        {image ? (
          <span className="flex items-center gap-1">
            <span
              className={cn(
                "rounded px-1 text-[9px] font-semibold leading-4",
                picked ? "bg-sky-100 text-sky-800" : "bg-zinc-100 text-zinc-600",
              )}
            >
              {picked ? "Picked" : "Live"}
            </span>
            <ReviewBadge status={image.review_status} />
          </span>
        ) : (
          <span className="block text-[10px]">none</span>
        )}
      </span>
    </button>
  );
}

/**
 * Publish sequence, per subject: the frames that would go live (picked ones over the live ones),
 * what is wrong with them, and the action. Generated frames are candidates; this is the only
 * place where they are activated, through the backend's atomic publish.
 */
export function SequencePublishPanel({
  exercise,
  picks,
  styleName,
  styleUnpublished,
  poseWarning,
  busy,
  publishing,
  errors,
  selectedId,
  onSelect,
  onSuggest,
  onReset,
  onPublish,
}: {
  exercise: ExerciseImageDetail;
  /** The picks of each subject, without deleted images. */
  picks: Record<Subject, SequencePick>;
  styleName: string;
  /** The style is not published: the app shows none of its frames. */
  styleUnpublished: boolean;
  /** "Pose not approved: …", empty when every pose of the sequence is approved. */
  poseWarning: string;
  busy: boolean;
  publishing: Subject | null;
  /** The last publish error of each subject. */
  errors: Partial<Record<Subject, string>>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSuggest: (subject: Subject) => void;
  onReset: (subject: Subject) => void;
  onPublish: (subject: Subject) => void;
}) {
  const twoFrames = exercise.two_frames;
  const slots = PICK_SLOTS.filter((slot) => !(twoFrames && slot === "mid"));

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-sm font-medium text-zinc-900">Publish sequence</span>
        <span className="text-[11px] text-zinc-500">
          Generated frames are candidates. Select a frame and use it as Start
          {twoFrames ? " or End" : ", Mid or End"}, then publish: the app switches to the
          sequence at once.
        </span>
      </div>
      {styleUnpublished && (
        <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
          Style {styleName} is not published: the app shows none of its frames, whatever is
          published here.
        </p>
      )}
      {poseWarning && (
        <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">{poseWarning}</p>
      )}
      <div className="divide-y divide-zinc-100">
        {SUBJECTS.map((subject) => {
          const images = exercise.images.filter((img) => img.subject === subject);
          const pick = picks[subject];
          const active = activeByPosition(images);
          const chosen = effectivePick(pick, images, twoFrames);
          const byId = new Map(images.map((img) => [img.id, img]));
          const state = exercise.by_subject.find((s) => s.subject === subject)?.sequence ?? "empty";
          const found = validatePick(pick, images, twoFrames);
          const blocking = found.filter((p) => p.blocking);
          // An untouched published (or empty) subject has nothing to report.
          const problems = isEmptyPick(pick) && state !== "unpublished" ? [] : found;
          const changes = needsPublish(pick, images, twoFrames);
          const canSuggest = !isEmptyPick(suggestPick(images, twoFrames));
          const ready = blocking.length === 0 && changes && !busy;
          const label = STATE_LABEL[state];
          const error = errors[subject];

          return (
            <div key={subject} className="space-y-2 py-2.5 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-14 text-xs font-semibold text-zinc-900">
                  {SUBJECT_LABEL[subject]}
                </span>
                <span
                  className={cn("rounded px-1.5 text-[10px] font-semibold leading-4", label.tone)}
                >
                  {label.text}
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-7 px-2 py-0 text-xs"
                    disabled={busy || !canSuggest}
                    onClick={() => onSuggest(subject)}
                    title="Pick the newest candidate of each slot (a Mid or End only when drawn on the Start that results)"
                  >
                    Use newest
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-7 px-2 py-0 text-xs"
                    disabled={busy || isEmptyPick(pick)}
                    onClick={() => onReset(subject)}
                  >
                    Reset
                  </Button>
                  <Button
                    type="button"
                    className="h-7 px-3 py-0 text-xs"
                    disabled={!ready}
                    onClick={() => onPublish(subject)}
                    title={
                      blocking.length
                        ? "Fix the problems first"
                        : changes
                          ? "Publish the Start, Mid and End together"
                          : "Nothing to publish: the active frames are already in the app"
                    }
                  >
                    {publishing === subject && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Publish sequence
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {slots.map((slot) => {
                  const id = chosen[slot];
                  const image = id ? (byId.get(id) ?? null) : null;
                  return (
                    <SlotChip
                      key={slot}
                      slot={slot}
                      image={image}
                      picked={
                        pick[slot] != null && image?.id !== active.get(slotPosition(slot))?.id
                      }
                      selected={image?.id === selectedId}
                      onSelect={onSelect}
                    />
                  );
                })}
              </div>
              {(problems.length > 0 || error) && (
                <ul className="space-y-0.5 text-xs">
                  {error && <li className="font-medium text-red-700">{error}</li>}
                  {problems.map((problem) => (
                    <li
                      key={`${problem.slot}-${problem.message}`}
                      className={problem.blocking ? "text-red-700" : "text-amber-700"}
                    >
                      {problem.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
