"use client";

import { styleLabel } from "@/components/images/generation-controls";
import { Button } from "@/components/ui/primitives";
import type { ImageStyle } from "@/lib/images/types";
import { selectClass } from "./form-ui";

export function StyleBar({
  styles,
  styleId,
  published,
  isDefault,
  busy,
  onSelect,
  onPublishedChange,
  onDefaultChange,
  onNew,
  onDelete,
}: {
  styles: ImageStyle[];
  styleId: string;
  published: boolean;
  isDefault: boolean;
  busy: boolean;
  onSelect: (id: string) => void;
  onPublishedChange: (published: boolean) => void;
  onDefaultChange: (isDefault: boolean) => void;
  onNew: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-4">
      <label className="block min-w-[12rem] flex-1 text-xs font-medium text-zinc-600">
        Style
        <select
          className={selectClass}
          value={styleId}
          disabled={busy}
          onChange={(e) => onSelect(e.target.value)}
        >
          {styles.map((style) => (
            <option key={style.id} value={style.id}>
              {styleLabel(style)}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 pb-1.5 text-xs text-zinc-700">
        <input
          type="checkbox"
          checked={published}
          disabled={busy || isDefault}
          title={isDefault ? "Default style must stay published" : undefined}
          onChange={(e) => onPublishedChange(e.target.checked)}
          className="h-4 w-4 rounded border-zinc-300"
        />
        Published
      </label>
      <label className="flex items-center gap-2 pb-1.5 text-xs text-zinc-700">
        <input
          type="checkbox"
          checked={isDefault}
          disabled={busy || isDefault}
          title={isDefault ? "Mark another style as default to change this" : undefined}
          onChange={(e) => {
            if (e.target.checked) onDefaultChange(true);
          }}
          className="h-4 w-4 rounded border-zinc-300"
        />
        Default
      </label>
      <Button type="button" variant="secondary" disabled={busy} onClick={onNew}>
        New style
      </Button>
      <Button
        type="button"
        variant="ghost"
        disabled={busy || isDefault}
        title={isDefault ? "Cannot delete the default style" : undefined}
        onClick={onDelete}
      >
        Delete
      </Button>
    </div>
  );
}
