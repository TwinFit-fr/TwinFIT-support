"use client";

import { useState } from "react";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/primitives";

/**
 * "Edit with an instruction": a short request ("lower the arms a little") applied to the shown
 * image. The result is a candidate next to it, never a replacement.
 */
export function EditInstruction({
  onSubmit,
  disabled,
}: {
  onSubmit: (instruction: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        className="h-7 px-2.5 text-xs"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Wand2 className="h-3.5 w-3.5" />
        Edit with an instruction
      </Button>
    );
  }

  return (
    <form
      className="space-y-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!text.trim()) return;
        onSubmit(text.trim());
        setText("");
        setOpen(false);
      }}
    >
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Lower the arms a little; make the bar black"
        className="min-h-16 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-xs"
        maxLength={2000}
      />
      <p className="text-[11px] text-zinc-500">
        Only this change is made; the result appears as a candidate next to this image.
      </p>
      <div className="flex gap-1.5">
        <Button type="submit" className="h-7 px-2.5 text-xs" disabled={disabled || !text.trim()}>
          Queue edit
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-7 px-2.5 text-xs"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
