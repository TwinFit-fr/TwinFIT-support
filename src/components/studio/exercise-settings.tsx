"use client";

import { useMemo } from "react";
import { Hand, TriangleAlert } from "lucide-react";
import { draftParams } from "@/lib/studio/draft-params";
import { useDragMode } from "@/lib/studio/drag-mode";
import type { TemplateParams } from "@/lib/studio/exercise-templates";
import { rebuildWarning } from "@/lib/studio/rebuild-words";
import { useStudioStore } from "@/lib/studio/store";
import { hasTemplate } from "@/lib/studio/template-draft";
import { TEMPO_S, optionOf, settingsFor, tempoMatters, type ChoiceKey } from "@/lib/studio/template-settings";
import { applyTemplateSettings, useRebuildNotice } from "./hooks/use-template-settings";
import { NumberField, Segmented } from "./ui";

/**
 * The exercise's template settings, in the pose editor: only those that change something for this
 * exercise (range, stance, grip, lean, side, tempo). A change rebuilds every pose in the browser at
 * once, as one undo step, and the origin label names the settings. When the poses hold manual
 * edits the group says, before anything is touched, that a change replaces them.
 */
export function ExerciseSettings() {
  const { exercise, manualEdits, replaced, mode, draggable } = useDragMode();
  const edit = useStudioStore((s) => s.poseEdit);
  const notice = useRebuildNotice();
  const settings = useMemo(() => (exercise && hasTemplate(exercise) ? settingsFor(exercise) : []), [exercise]);
  const tempo = useMemo(() => Boolean(exercise && hasTemplate(exercise) && tempoMatters(exercise)), [exercise]);
  if (!exercise || !edit || (!settings.length && !tempo)) return null;
  const params = draftParams(exercise, edit);
  const warning = rebuildWarning(replaced);
  const apply = (next: TemplateParams) => notice(applyTemplateSettings(exercise, next));
  const choose = (key: ChoiceKey, value: string) => {
    const setting = settings.find((s) => s.key === key);
    if (setting && optionOf(setting, params[key])?.value === value && !manualEdits) return;
    apply({ ...params, [key]: value });
  };

  return (
    <section aria-labelledby="exercise-settings-title" className="border-b border-(--m3-outline-variant) px-4 py-3" data-exercise-settings>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 id="exercise-settings-title" className="text-[10px] font-medium uppercase tracking-[0.16em] text-(--m3-on-surface-variant)">
          Exercise settings
        </h3>
        <span className="text-[11px] text-(--m3-on-surface-variant)">every pose follows, instantly</span>
      </div>
      <div className="space-y-1.5">
        {settings.map((setting) => (
          <div key={setting.key} className="grid grid-cols-1 items-center gap-1 @[24rem]/pane:grid-cols-[4.25rem_minmax(0,1fr)] @[24rem]/pane:gap-2">
            <span className="text-[11px] font-medium text-(--m3-on-surface)">{setting.label}</span>
            <Segmented
              size="sm"
              label={setting.label}
              value={optionOf(setting, params[setting.key])?.value ?? ""}
              onChange={(value) => choose(setting.key, value)}
              options={setting.options.map((o) => ({ value: o.value, label: o.label, title: o.hint }))}
              className="w-full justify-between [&>button]:flex-1"
            />
          </div>
        ))}
        {tempo ? (
          <div className="grid grid-cols-1 items-center gap-1 @[24rem]/pane:grid-cols-[4.25rem_minmax(0,1fr)] @[24rem]/pane:gap-2">
            <span className="text-[11px] font-medium text-(--m3-on-surface)">Tempo</span>
            <div className="flex items-center gap-3 text-[11px] text-(--m3-on-surface-variant)">
              <label className="flex items-center gap-1.5" title="Seconds lowering (against the load)">
                <NumberField
                  aria-label="Seconds lowering"
                  min={TEMPO_S.min}
                  max={TEMPO_S.max}
                  step={TEMPO_S.step}
                  digits={1}
                  value={params.down_s}
                  onCommit={(down_s) => apply({ ...params, down_s })}
                  className="h-7 w-14 px-1.5 py-0 text-right text-[11px]"
                />
                s down
              </label>
              <label className="flex items-center gap-1.5" title="Seconds lifting">
                <NumberField
                  aria-label="Seconds lifting"
                  min={TEMPO_S.min}
                  max={TEMPO_S.max}
                  step={TEMPO_S.step}
                  digits={1}
                  value={params.up_s}
                  onCommit={(up_s) => apply({ ...params, up_s })}
                  className="h-7 w-14 px-1.5 py-0 text-right text-[11px]"
                />
                s up
              </label>
            </div>
          </div>
        ) : null}
      </div>
      {warning ? (
        <p className="mt-2 flex items-start gap-1.5 rounded-(--studio-radius-md) bg-(--m3-warning)/10 px-2 py-1.5 text-[11px] leading-snug text-(--m3-on-surface)" data-settings-warning={replaced ?? undefined}>
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-(--m3-warning)" aria-hidden="true" />
          <span>{warning}</span>
        </p>
      ) : draggable && mode === "exercise" ? (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-(--m3-on-surface-variant)">
          <Hand className="mt-px h-3.5 w-3.5 shrink-0 text-(--m3-tertiary)" aria-hidden="true" />
          <span>Or drag a point of the body on the stage: the setting that takes it towards the pointer is picked for you.</span>
        </p>
      ) : null}
    </section>
  );
}
