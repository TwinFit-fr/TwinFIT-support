"use client";

import { useState } from "react";
import { BrushCleaning, Settings2, X } from "lucide-react";
import { useStaffFetch, useStaffSWR } from "@/hooks/use-staff-fetch";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import type { StudioSettings } from "@/lib/studio/types";
import { Field, M3Button, NumberField, Select, TextArea } from "./ui";

type OrphansResponse = { orphans: { id: string; name: string; size: number | null; createdAt: string }[]; sweepable: number };

/**
 * The workspace settings (animation_studio.settings): pipeline concurrency and stale limit, the
 * defaults of a generation, the prompt template; plus the bucket's orphan files, with a sweep.
 */
export function SettingsDialog({ settings, onClose, onSaved }: { settings: StudioSettings; onClose: () => void; onSaved: () => void }) {
  const staffFetch = useStaffFetch();
  const toast = useToast();
  const confirm = useConfirm();
  const [maxConcurrency, setMaxConcurrency] = useState(settings.max_concurrency);
  const [staleAfter, setStaleAfter] = useState(settings.stale_after_minutes);
  const [template, setTemplate] = useState(settings.prompt_template);
  const [fps, setFps] = useState(Number(settings.pipeline.fps ?? 30));
  const [duration, setDuration] = useState(Number(settings.pipeline.duration_s ?? 4));
  const [loop, setLoop] = useState(settings.pipeline.loop !== false);
  const [loopMode, setLoopMode] = useState<string>(typeof settings.pipeline.loop_mode === "string" ? settings.pipeline.loop_mode : "");
  const [model, setModel] = useState<string>(typeof settings.pipeline.model === "string" ? settings.pipeline.model : "");
  const [busy, setBusy] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const { data: orphans, mutate: mutateOrphans } = useStaffSWR<OrphansResponse>("/api/studio/storage/orphans");

  const save = async () => {
    setBusy(true);
    try {
      const { loop_mode: _lm, model: _m, ...rest } = settings.pipeline;
      await staffFetch("/api/studio/settings", {
        method: "PATCH",
        body: JSON.stringify({
          max_concurrency: maxConcurrency,
          stale_after_minutes: staleAfter,
          prompt_template: template,
          pipeline: {
            ...rest,
            fps,
            duration_s: duration,
            loop,
            ...(loopMode ? { loop_mode: loopMode } : {}),
            ...(model.trim() ? { model: model.trim() } : {}),
          },
        }),
      });
      toast.success("Studio settings saved");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the settings");
    } finally {
      setBusy(false);
    }
  };

  const sweep = async () => {
    const count = orphans?.sweepable ?? 0;
    const ok = await confirm({
      title: `Delete ${count} orphan file${count === 1 ? "" : "s"}?`,
      description: "Files in 3d-workspace that no avatar, clip or equipment model points at, older than an hour. This cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setSweeping(true);
    try {
      const result = (await staffFetch("/api/studio/storage/orphans", { method: "DELETE" })) as { deleted: number; failed: unknown[] };
      toast.success(`${result.deleted} file${result.deleted === 1 ? "" : "s"} removed${result.failed.length ? `, ${result.failed.length} could not be` : ""}`);
      await mutateOrphans();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The sweep failed");
    } finally {
      setSweeping(false);
    }
  };

  const orphanBytes = (orphans?.orphans ?? []).reduce((n, f) => n + (f.size ?? 0), 0);

  return (
    <Modal
      onClose={onClose}
      labelledBy="studio-settings-title"
      dismissible={!busy}
      className="studio-root w-[640px] max-w-[calc(100vw-2rem)] rounded-3xl border border-(--m3-outline-variant) bg-(--m3-surface-container) p-0 text-(--m3-on-surface) shadow-2xl backdrop:bg-(--m3-scrim)"
    >
      <div className="flex items-center justify-between border-b border-(--m3-outline-variant) px-5 py-4">
        <h2 id="studio-settings-title" className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <Settings2 className="h-4 w-4 text-(--m3-primary)" /> Studio settings
        </h2>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="studio-state flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-(--m3-on-surface-variant)">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="studio-scroll max-h-[70vh] space-y-5 overflow-y-auto px-5 py-4">
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--m3-on-surface-variant)">Pipeline</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Max concurrency" hint="Rows generated at once (1–8)">
              <NumberField min={1} max={8} step={1} value={maxConcurrency} onCommit={(v) => setMaxConcurrency(Math.round(v))} />
            </Field>
            <Field label="Stale after (min)" hint="A row still generating after this long is requeued (the worker request lives 5 min)">
              <NumberField min={1} max={120} step={1} value={staleAfter} onCommit={(v) => setStaleAfter(Math.round(v))} />
            </Field>
          </div>
        </section>
        <section>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--m3-on-surface-variant)">Defaults of a generation</h3>
          <div className="grid grid-cols-3 gap-3">
            <Field label="FPS">
              <NumberField min={1} max={240} step={1} value={fps} onCommit={(v) => setFps(Math.round(v))} />
            </Field>
            <Field label="Seconds">
              <NumberField min={0.5} max={60} step={0.5} digits={1} value={duration} onCommit={setDuration} />
            </Field>
            <Field label="Loop shape">
              <Select value={loopMode} onChange={(e) => setLoopMode(e.target.value)}>
                <option value="">model&apos;s choice</option>
                <option value="pingpong">boomerang</option>
                <option value="cycle">cycle</option>
              </Select>
            </Field>
            <Field label="Model" hint="OpenAI model (empty = gpt-5-mini)">
              <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-5-mini" className="w-full rounded-xl border border-(--m3-outline) bg-(--m3-surface-container-high) px-3.5 py-2.5 text-sm text-(--m3-on-surface) outline-none focus:border-(--m3-primary)" />
            </Field>
            <label className="flex items-end gap-2 pb-2.5 text-xs text-(--m3-on-surface-variant)">
              <input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} className="h-4 w-4 accent-(--m3-primary)" />
              Seamless loop
            </label>
          </div>
        </section>
        <section>
          <Field label="Prompt template" hint="Slots: {subject} {exercise_name} {exercise_description} {equipment} {user_prompt}">
            <TextArea rows={5} value={template} onChange={(e) => setTemplate(e.target.value)} className="font-mono text-[11px]" />
          </Field>
        </section>
        <section className="rounded-2xl border border-(--m3-outline-variant) bg-(--m3-surface-container-low) p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-(--m3-on-surface-variant)">Storage</h3>
              <p className="mt-1 text-xs text-(--m3-on-surface-variant)">
                {orphans
                  ? orphans.orphans.length
                    ? `${orphans.orphans.length} orphan file${orphans.orphans.length === 1 ? "" : "s"} in 3d-workspace (${(orphanBytes / 1024 / 1024).toFixed(1)} MiB), ${orphans.sweepable} older than an hour.`
                    : "No orphan files in 3d-workspace."
                  : "Counting orphan files…"}
              </p>
            </div>
            <M3Button size="sm" variant="tonal" disabled={!orphans?.sweepable || sweeping} busy={sweeping} onClick={sweep}>
              <BrushCleaning className="h-3.5 w-3.5" /> Sweep
            </M3Button>
          </div>
        </section>
      </div>
      <div className="flex justify-end gap-2 border-t border-(--m3-outline-variant) px-5 py-4">
        <M3Button variant="text" onClick={onClose} disabled={busy}>
          Cancel
        </M3Button>
        <M3Button variant="filled" onClick={save} busy={busy}>
          Save settings
        </M3Button>
      </div>
    </Modal>
  );
}
