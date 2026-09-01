"use client";

import { useEffect } from "react";
import { ExerciseComposeForm } from "@/components/catalog/exercise-compose-form";

type ExerciseComposeDialogProps = {
  open: boolean;
  editExoId?: number | null;
  copyFromExoId?: number | null;
  createFromSelection?: Record<string, string>;
  onClose: () => void;
  onSaved: (message: string) => void;
};

export function ExerciseComposeDialog({
  open,
  editExoId,
  copyFromExoId,
  createFromSelection,
  onClose,
  onSaved,
}: ExerciseComposeDialogProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const title = editExoId
    ? `Edit exercise #${editExoId}`
    : copyFromExoId != null
      ? `Copy exercise #${copyFromExoId}`
      : createFromSelection && Object.keys(createFromSelection).length > 0
        ? "New exercise on this path"
        : "New exercise";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex h-[min(90vh,720px)] w-full max-w-2xl flex-col rounded-xl border border-zinc-200 bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-compose-title"
      >
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 id="exercise-compose-title" className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Changes are saved without leaving the catalog view.
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {open && (
            <ExerciseComposeForm
              editExoId={editExoId}
              copyFromExoId={copyFromExoId}
              createFromSelection={createFromSelection}
              onSuccess={(msg) => {
                onSaved(msg);
                onClose();
              }}
              onCancel={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}
