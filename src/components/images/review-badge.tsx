import { REVIEW_LABEL } from "@/lib/images/types";
import type { ReviewStatus } from "@/lib/images/types";
import { cn } from "@/lib/utils";

const TONE: Record<ReviewStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-700",
};

/** The review status of a frame (images.exercise_images.review_status). */
export function ReviewBadge({
  status,
  className,
  title,
}: {
  status: ReviewStatus;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title ?? `Review: ${REVIEW_LABEL[status].toLowerCase()}`}
      className={cn(
        "inline-flex items-center rounded px-1 text-[9px] font-semibold leading-4",
        TONE[status],
        className,
      )}
    >
      {REVIEW_LABEL[status]}
    </span>
  );
}
