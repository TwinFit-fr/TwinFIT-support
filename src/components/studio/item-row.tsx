// One equipment row of the generator: the item's code, the socket it hangs from, how many and how heavy.
"use client";

import { Trash2 } from "lucide-react";
import type { EquipmentItem } from "@/lib/studio/types";
import { Chip, IconButton, NumberField, Select } from "./ui";

/** Select value for an item held with both hands (socket hand_r + socket_b hand_l). */
const BOTH_HANDS = "__both__";

export function ItemRow({
  item,
  sockets,
  codes,
  onChange,
  onRemove,
}: {
  item: EquipmentItem;
  sockets: string[];
  codes: string[];
  onChange: (next: EquipmentItem) => void;
  onRemove: () => void;
}) {
  return (
    <li className="space-y-1.5 rounded-xl bg-(--m3-surface-container) p-2">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
        <Chip tone={item.kind === "load" ? "primary" : "neutral"} className="h-6 px-2">
          {item.kind}
        </Chip>
        <Select
          value={item.code}
          onChange={(e) => onChange({ ...item, code: e.target.value })}
          className="h-8 py-0 pl-2.5 text-xs"
          aria-label="Equipment code"
          title={item.code}
        >
          {!codes.includes(item.code) ? <option value={item.code}>{item.code}</option> : null}
          {codes.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </Select>
        <IconButton label="Remove" onClick={onRemove} className="h-8 w-8">
          <Trash2 className="h-3.5 w-3.5" />
        </IconButton>
      </div>
      {item.kind === "load" ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-1 text-[11px] text-(--m3-on-surface-variant)">
          <label className="flex min-w-0 flex-1 basis-24 items-center gap-1.5" title="Where the item is held">
            on
            <Select
              value={item.socket_b ? BOTH_HANDS : (item.socket ?? "")}
              onChange={(e) => {
                const value = e.target.value;
                if (value === BOTH_HANDS) onChange({ ...item, socket: "hand_r", socket_b: "hand_l" });
                else onChange({ ...item, socket: value || undefined, socket_b: undefined });
              }}
              className="h-7 min-w-0 py-0 pl-2.5 pr-2 text-[11px]"
              aria-label="Socket"
            >
              <option value="">no socket</option>
              {sockets.includes("hand_l") && sockets.includes("hand_r") ? <option value={BOTH_HANDS}>both hands</option> : null}
              {sockets.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex items-center gap-1" title="How many of this item (two dumbbells, …)">
            count
            <NumberField aria-label="Count" min={1} max={20} step={1} value={item.count ?? 1} onCommit={(v) => onChange({ ...item, count: Math.round(v) })} className="h-7 w-11 px-1 py-0 text-[11px]" />
          </label>
          <label className="flex items-center gap-1" title="Load in kilograms (a hint for the prompt; 0 = unspecified)">
            kg
            <NumberField
              aria-label="Weight in kilograms"
              min={0}
              max={1000}
              step={0.5}
              digits={1}
              value={item.weight_kg ?? 0}
              onCommit={(v) => onChange({ ...item, weight_kg: v > 0 ? v : undefined })}
              className="h-7 w-12 px-1 py-0 text-[11px]"
            />
          </label>
        </div>
      ) : (
        <div className="pl-1 text-[11px] text-(--m3-on-surface-variant)">Stands on the floor</div>
      )}
    </li>
  );
}
