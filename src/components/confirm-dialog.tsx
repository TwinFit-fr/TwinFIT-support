"use client";

import { ConfirmSurface } from "@/components/ui/confirm";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Controlled confirmation; for a one-off question in an async flow, prefer `useConfirm`. */
export function ConfirmDialog({ open, ...props }: ConfirmDialogProps) {
  return open ? <ConfirmSurface {...props} /> : null;
}
