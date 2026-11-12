"use client";

import { useState } from "react";
import { BrushCleaning, Settings2 } from "lucide-react";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { changedFields } from "@/lib/studio/form-dirty";
import { STORAGE_ORPHANS_KEY, deleteStorageOrphans, patchSettings } from "@/lib/studio/studio-api";
import type { StudioSettings } from "@/lib/studio/types";
import { DialogRow, DialogSection, rowDescription } from "./dialog-form";
import { StudioDialog } from "./studio-dialog";
import { M3Button, NumberField, Select, TextArea, TextInput } from "./ui";

type OrphansResponse = { orphans: { id: string; name: string; size: number | null; createdAt: string }[]; sweepable: number };

const SLOTS = ["{subject}", "{exercise_name}", "{exercise_description}", "{equipment}", "{user_prompt}"];

function fromSettings(settings: StudioSettings) {
  return {
    maxConcurrency: settings.max_concurrency,
    staleAfter: settings.stale_after_minutes,
    template: settings.prompt_template,
    fps: Number(settings.pipeline.fps ?? 30),
    duration: Number(settings.pipeline.duration_s ?? 4),
    loop: settings.pipeline.loop !== false,
    loopMode: typeof settings.pipeline.loop_mode === "string" ? settings.pipeline.loop_mode : "",
    model: typeof settings.pipeline.model === "string" ? settings.pipeline.model : "",
  };
}

function Unit({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <span id={id} className="text-[13px] leading-snug text-(--m3-on-surface-variant)">
      {children}
    </span>
  );
}

/**
 * The workspace settings (animation_studio.settings): the generation queue, the defaults of a new
 * clip, the prompt template; plus unused files in storage, with a sweep. Save is offered once
 * something changed; closing with changes asks first.
 */
export function SettingsDialog({ settings, onClose, onSaved }: { settings: StudioSettings; onClose: () => void; onSaved: () => void }) {
  const staffFetch = useStaffFetch();
  const toast = useToast();
  const confirm = useConfirm();
  const [baseline] = useState(() => fromSettings(settings));
  const [v, setV] = useState(baseline);
  const set = <K extends keyof typeof v>(key: K, value: (typeof v)[K]) => setV((s) => ({ ...s, [key]: value }));
  const [busy, setBusy] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: orphans, mutate: mutateOrphans } = useStaffSWR<OrphansResponse>(STORAGE_ORPHANS_KEY);
  const changed = changedFields(baseline, v).length;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const { loop_mode: _lm, model: _m, ...rest } = settings.pipeline;
      await patchSettings(staffFetch, {
        max_concurrency: v.maxConcurrency,
        stale_after_minutes: v.staleAfter,
        prompt_template: v.template,
        pipeline: { ...rest, fps: v.fps, duration_s: v.duration, loop: v.loop, ...(v.loopMode ? { loop_mode: v.loopMode } : {}), ...(v.model.trim() ? { model: v.model.trim() } : {}) },
      });
      toast.success("Studio settings saved");
      onSaved();
      onClose();
    } catch (err) {
      setError(`The settings were not saved. ${err instanceof Error ? err.message : ""}`.trim());
    } finally {
      setBusy(false);
    }
  };

  const sweep = async () => {
    const count = orphans?.sweepable ?? 0;
    const ok = await confirm({
      title: `Delete ${count} unused file${count === 1 ? "" : "s"}?`,
      description: "Files in storage that no avatar, clip or equipment model uses, older than an hour. This cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setSweeping(true);
    setError(null);
    try {
      const result = (await deleteStorageOrphans(staffFetch)) as { deleted: number; failed: unknown[] };
      toast.success(`${result.deleted} file${result.deleted === 1 ? "" : "s"} removed${result.failed.length ? `, ${result.failed.length} could not be` : ""}`);
      await mutateOrphans();
    } catch (err) {
      setError(`The sweep did not finish. ${err instanceof Error ? err.message : ""}`.trim());
    } finally {
      setSweeping(false);
    }
  };

  const orphanBytes = (orphans?.orphans ?? []).reduce((n, f) => n + (f.size ?? 0), 0);
  const modelHint = "Used by queued generations; empty means gpt-5-mini. The pose editor's AI draft does not use it.";

  return (
    <StudioDialog
      data-settings-dialog=""
      title="Studio settings"
      icon={<Settings2 />}
      subtitle="Shared by everyone who uses the Studio."
      onClose={onClose}
      dirty={changed > 0}
      busy={busy}
      error={error}
      onDismissError={() => setError(null)}
      footerNote={changed ? `${changed} unsaved change${changed === 1 ? "" : "s"}` : "No changes"}
      actions={
        <M3Button variant="filled" onClick={() => void save()} busy={busy} disabled={!changed} data-settings-save>
          Save settings
        </M3Button>
      }
    >
      <DialogSection title="Generation queue">
        <DialogRow id="set-concurrency" label="Clips at once">
          <div className="flex items-center gap-2">
            <NumberField decimalPoint id="set-concurrency" min={1} max={8} step={1} value={v.maxConcurrency} onCommit={(n) => set("maxConcurrency", Math.round(n))} className="w-24" aria-describedby="set-concurrency-unit" />
            <Unit id="set-concurrency-unit">generating at the same time (1 to 8)</Unit>
          </div>
        </DialogRow>
        <DialogRow id="set-stale" label="Retry after">
          <div className="flex items-center gap-2">
            <NumberField decimalPoint id="set-stale" min={1} max={120} step={1} value={v.staleAfter} onCommit={(n) => set("staleAfter", Math.round(n))} className="w-24" aria-describedby="set-stale-unit" />
            <Unit id="set-stale-unit">minutes; a clip still generating by then goes back in the queue</Unit>
          </div>
        </DialogRow>
      </DialogSection>

      <DialogSection title="New clip defaults">
        <DialogRow id="set-fps" label="Frame rate">
          <div className="flex items-center gap-2">
            <NumberField decimalPoint id="set-fps" min={1} max={240} step={1} value={v.fps} onCommit={(n) => set("fps", Math.round(n))} className="w-24" />
            <Unit>frames per second (1 to 240)</Unit>
          </div>
        </DialogRow>
        <DialogRow id="set-duration" label="Length">
          <div className="flex items-center gap-2">
            <NumberField decimalPoint id="set-duration" min={0.5} max={60} step={0.5} digits={1} value={v.duration} onCommit={(n) => set("duration", n)} className="w-24" />
            <Unit>seconds (0.5 to 60)</Unit>
          </div>
        </DialogRow>
        <DialogRow id="set-loop-shape" label="Loop">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Select id="set-loop-shape" aria-label="Loop shape" value={v.loopMode} onChange={(e) => set("loopMode", e.target.value)} className="w-56">
              <option value="">The model chooses</option>
              <option value="pingpong">Boomerang (there and back)</option>
              <option value="cycle">Cycle (repeats forward)</option>
            </Select>
            <label className="flex w-fit cursor-pointer items-center gap-2 text-[13px] text-(--m3-on-surface)">
              <input id="set-loop" type="checkbox" checked={v.loop} onChange={(e) => set("loop", e.target.checked)} className="h-4 w-4 accent-(--m3-primary)" />
              Seamless: ends in its start position
            </label>
          </div>
        </DialogRow>
        <DialogRow id="set-model" label="AI model" optional hint={modelHint}>
          <TextInput id="set-model" value={v.model} onChange={(e) => set("model", e.target.value)} placeholder="gpt-5-mini" spellCheck={false} className="w-56 font-mono" {...rowDescription("set-model", { hint: true })} />
        </DialogRow>
      </DialogSection>

      <DialogSection title="Prompt template">
        <DialogRow id="set-template" label="Template" hint={<>Placeholders filled for each clip: {SLOTS.map((s) => <code key={s} className="mr-1 rounded bg-(--m3-surface-container-highest) px-1 py-px font-mono text-[12px] text-(--m3-on-surface)">{s}</code>)}</>}>
          <TextArea id="set-template" rows={4} value={v.template} onChange={(e) => set("template", e.target.value)} className="font-mono text-[12px]" {...rowDescription("set-template", { hint: true })} />
        </DialogRow>
      </DialogSection>

      <DialogSection title="Storage">
        <DialogRow id="set-sweep" label="Unused files" group>
          <div className="flex min-h-10 items-center gap-3">
            <p id="set-sweep-status" className="min-w-0 flex-1 text-[13px] text-(--m3-on-surface-variant)" data-orphans>
              {orphans
                ? orphans.orphans.length
                  ? `${orphans.orphans.length} file${orphans.orphans.length === 1 ? "" : "s"} no avatar, clip or model uses (${(orphanBytes / 1024 / 1024).toFixed(1)} MB), ${orphans.sweepable} older than an hour.`
                  : "None: every stored file is in use."
                : "Counting…"}
            </p>
            <M3Button aria-describedby="set-sweep-status" size="sm" variant="tonal" disabled={!orphans?.sweepable || sweeping} busy={sweeping} onClick={() => void sweep()}>
              <BrushCleaning aria-hidden className="h-3.5 w-3.5" /> Sweep
            </M3Button>
          </div>
        </DialogRow>
      </DialogSection>
    </StudioDialog>
  );
}
