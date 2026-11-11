"use client";

import { useMemo, useState } from "react";
import { Hand, Sparkles, TriangleAlert } from "lucide-react";
import { draftParams } from "@/lib/studio/draft-params";
import { useDragMode } from "@/lib/studio/drag-mode";
import type { TemplateParams } from "@/lib/studio/exercise-templates";
import { rebuildWarning } from "@/lib/studio/rebuild-words";
import { useStudioStore } from "@/lib/studio/store";
import { hasTemplate } from "@/lib/studio/template-draft";
import { TEMPO_S, normalizeParams, optionOf, settingChange, settingsFor, tempoMatters, type ChoiceKey } from "@/lib/studio/template-settings";
import { cn } from "@/lib/utils";
import { AiDraftControl } from "./ai-draft";
import { applyTemplateSettings, useRebuildNotice } from "./hooks/use-template-settings";
import { ClipGuardNotice, RebuildConfirm } from "./rebuild-guard";
import { NumberField, Segmented } from "./ui";

const ROW = "grid grid-cols-1 items-center gap-1 rounded-(--studio-radius-sm) @[24rem]/pane:grid-cols-[4.25rem_minmax(0,1fr)] @[24rem]/pane:gap-2";

/** The setting label, with a mark when the AI set the value shown. */
function RowLabel({ label, ai }: { label: string; ai: boolean }) {
  return (
    <span className="flex items-center gap-1 text-[11px] font-medium text-(--m3-on-surface)">
      {label}
      {ai ? (
        <span title="Set by the AI draft" className="inline-flex text-(--m3-tertiary)">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          <span className="sr-only">(set by the AI)</span>
        </span>
      ) : null}
    </span>
  );
}

/**
 * The exercise's template settings, in the pose editor: only those that change something for this
 * exercise (range, stance, grip, lean, side, tempo), and "Draft with AI", which sets the same
 * settings for you. A change rebuilds every pose in the browser at once, as one undo step, and the
 * origin label names the settings. What was set by hand is kept when each pose has its automatic
 * pose (point-state.ts); otherwise a saved clip is locked until the user confirms a rebuild once
 * (rebuild-guard.ts) and other edits get a warning that says what cannot be kept.
 */
export function ExerciseSettings() {
  const { exercise, manualEdits, replaced, match, mode, draggable, guard, agree } = useDragMode();
  const edit = useStudioStore((s) => s.poseEdit);
  const exerciseId = useStudioStore((s) => s.exerciseId);
  const notice = useRebuildNotice();
  const templated = Boolean(exercise && hasTemplate(exercise));
  const settings = useMemo(() => (exercise && templated ? settingsFor(exercise) : []), [exercise, templated]);
  const tempo = useMemo(() => Boolean(exercise && templated && tempoMatters(exercise)), [exercise, templated]);
  /** A rebuild of a locked clip waiting for the user's yes: the settings it would apply. */
  const [asking, setAsking] = useState<{ params: TemplateParams; change: string | null; editId: number } | null>(null);
  if (!exercise || !edit) return null;
  const hasSettings = settings.length > 0 || tempo;
  const params = hasSettings ? draftParams(exercise, edit) : null;
  const question = asking && asking.editId === edit.editId && guard.locked ? asking : null;
  // What the AI chose, while it is still what the settings show.
  const aiParams = edit.origin.kind === "ai" && edit.origin.params ? (edit.origin.params as Partial<TemplateParams>) : null;
  const byAi = (key: keyof TemplateParams) => Boolean(aiParams && params && aiParams[key] === params[key]);

  const apply = (next: TemplateParams) => {
    if (guard.locked) {
      setAsking({ params: next, change: params ? settingChange(normalizeParams(exercise, params), normalizeParams(exercise, next)) : null, editId: edit.editId });
      return;
    }
    notice(applyTemplateSettings(exercise, next));
  };
  const choose = (key: ChoiceKey, value: string) => {
    if (!params) return;
    const setting = settings.find((s) => s.key === key);
    if (setting && optionOf(setting, params[key])?.value === value && !manualEdits) return;
    apply({ ...params, [key]: value });
  };
  const confirm = () => {
    if (!question || !guard.locked) return;
    agree(guard.vectorId);
    setAsking(null);
    // Agreed in the confirm just now: no toast after the fact, the origin label says what happened.
    applyTemplateSettings(exercise, question.params);
  };
  const warning = guard.locked ? null : rebuildWarning(replaced, match);

  return (
    <section aria-labelledby="exercise-settings-title" className="border-b border-(--m3-outline-variant) px-4 py-3" data-exercise-settings>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 id="exercise-settings-title" className="text-[10px] font-medium uppercase tracking-[0.16em] text-(--m3-on-surface-variant)">
          {hasSettings ? "Exercise settings" : "AI draft"}
        </h3>
        {hasSettings ? <span className="text-[11px] text-(--m3-on-surface-variant)">{guard.locked ? "locked to keep the saved clip" : "every pose follows, instantly"}</span> : null}
      </div>
      {question && guard.locked ? (
        <RebuildConfirm guard={guard} change={question.change} onConfirm={confirm} onCancel={() => setAsking(null)} />
      ) : guard.locked && params ? (
        <ClipGuardNotice guard={guard} onRebuild={() => setAsking({ params, change: null, editId: edit.editId })} />
      ) : null}
      {hasSettings && params ? (
        <div className="space-y-1.5">
          {settings.map((setting) => {
            const ai = byAi(setting.key);
            const chosen = optionOf(setting, params[setting.key])?.value ?? "";
            return (
              <div key={setting.key} className={cn(ROW, ai && "ai-landed")} data-ai-set={ai || undefined}>
                <RowLabel label={setting.label} ai={ai} />
                <Segmented
                  size="sm"
                  label={setting.label}
                  value={chosen}
                  onChange={(value) => choose(setting.key, value)}
                  options={setting.options.map((o) => ({ value: o.value, label: o.label, title: o.hint }))}
                  className="w-full justify-between [&>button]:flex-1"
                />
              </div>
            );
          })}
          {tempo ? (
            <div className={cn(ROW, byAi("down_s") && byAi("up_s") && "ai-landed")}>
              <RowLabel label="Tempo" ai={byAi("down_s") && byAi("up_s")} />
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
      ) : null}
      {warning ? (
        <p className="mt-2 flex items-start gap-1.5 rounded-(--studio-radius-md) bg-(--m3-warning)/10 px-2 py-1.5 text-[11px] leading-snug text-(--m3-on-surface)" data-settings-warning={replaced ?? undefined}>
          <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0 text-(--m3-warning)" aria-hidden="true" />
          <span>{warning}</span>
        </p>
      ) : hasSettings && draggable && mode === "exercise" ? (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-(--m3-on-surface-variant)">
          <Hand className="mt-px h-3.5 w-3.5 shrink-0 text-(--m3-tertiary)" aria-hidden="true" />
          <span>Or drag a point of the body on the stage: the setting that takes it towards the pointer is picked for you.</span>
        </p>
      ) : null}
      <AiDraftControl key={exerciseId ?? "none"} templated={templated && hasSettings} />
    </section>
  );
}
