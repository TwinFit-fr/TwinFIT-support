"use client";

import Link from "next/link";
import type { ImagePrompt } from "@/lib/images/types";
import { FRAME_POSITIONS, POSITION_PROMPT_KEYS } from "@/lib/images/types";
import { Section, selectClass } from "./form-ui";

export type StylePromptDraft = {
  system_prompt_id: string | null;
  start_prompt_id: string | null;
  mid_prompt_id: string | null;
  end_prompt_id: string | null;
  support_prompt_id: string | null;
};

type PromptsResponse = {
  system: ImagePrompt[];
  position: ImagePrompt[];
  support: ImagePrompt[];
};

export function PromptsSection({
  draft,
  prompts,
  onChange,
}: {
  draft: StylePromptDraft;
  prompts: PromptsResponse | undefined;
  onChange: (patch: Partial<StylePromptDraft>) => void;
}) {
  return (
    <Section
      title="Prompts"
      description="Which templates are combined for each position (system + position) and for support equipment."
    >
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <label className="block text-xs font-medium text-zinc-600">
          System (style)
          <select
            className={selectClass}
            value={draft.system_prompt_id ?? ""}
            onChange={(e) => onChange({ system_prompt_id: e.target.value || null })}
          >
            <option value="">— first available —</option>
            {(prompts?.system ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {FRAME_POSITIONS.map((frame, i) => {
          const key = POSITION_PROMPT_KEYS[i];
          return (
            <label key={frame.id} className="block text-xs font-medium text-zinc-600">
              Position {frame.id} · {frame.label}
              <select
                className={selectClass}
                value={draft[key] ?? ""}
                onChange={(e) => onChange({ [key]: e.target.value || null })}
              >
                <option value="">— first available —</option>
                {(prompts?.position ?? [])
                  .filter((p) => p.position === frame.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
          );
        })}
        <label className="block text-xs font-medium text-zinc-600">
          Support
          <select
            className={selectClass}
            value={draft.support_prompt_id ?? ""}
            onChange={(e) => onChange({ support_prompt_id: e.target.value || null })}
          >
            <option value="">— first available —</option>
            {(prompts?.support ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Link href="/images/prompts" className="text-xs text-zinc-600 underline">
        Edit prompt texts
      </Link>
    </Section>
  );
}
