"use client";

import { useState } from "react";
import { Button } from "@/components/ui/primitives";
import { useConfirm } from "@/components/ui/confirm";
import {
  MuscleSetChips,
  MuscleSetEditor,
  type MuscleOption,
  type MuscleSet,
} from "@/components/catalog/muscle-set-editor";
import {
  PROFILE_REASON_REQUIRED,
  profileTargetCodes,
  profileUserCount,
  type PairExerciseRef,
  type ProfileRef,
} from "@/lib/catalog/pair-profiles";

/** A target profile as the editor sends it. */
export type ProfileDraft = { target: string; secondary: string[]; reason: string };

type Props = {
  groupCode: string;
  pairTarget: string;
  profiles: ProfileRef[];
  exercises: PairExerciseRef[];
  /** The group's home muscles (possible targets). */
  homeMuscles: MuscleOption[];
  /** Every muscle a secondary may be (active, anatomical). */
  muscles: MuscleOption[];
  /** Resolve null when saved, else the error (the form stays open). */
  onSave: (profile: ProfileDraft) => Promise<string | null>;
  onDelete: (target: string) => Promise<string | null>;
};

/**
 * Target profiles of one pair (backend 2.10.0, 1790000000107): for an exercise of the pair that
 * keeps another of the group's muscles as target (incline press → UPPER_PECTORALS, cross-body
 * crunch → OBLIQUES), its ordered secondaries and the biomechanical reason. Inherited exercises
 * with that target follow the profile; the others follow the pair.
 */
export function PairProfilesEditor({
  groupCode,
  pairTarget,
  profiles,
  exercises,
  homeMuscles,
  muscles,
  onSave,
  onDelete,
}: Props) {
  const confirm = useConfirm();
  /** `null`: no form; `""` target with `isNew`: a new profile. */
  const [form, setForm] = useState<(ProfileDraft & { isNew: boolean }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const homeCodes = homeMuscles.map((m) => m.code);
  const newTargets = profileTargetCodes(homeCodes, pairTarget, profiles);
  const targetOptions = (draft: ProfileDraft & { isNew: boolean }) =>
    draft.isNew
      ? homeMuscles.filter((m) => newTargets.includes(m.code))
      : homeMuscles.filter((m) => m.code === draft.target);

  function openNew() {
    setError(null);
    setForm({ isNew: true, target: "", secondary: [], reason: "" });
  }

  function openEdit(profile: ProfileRef) {
    setError(null);
    setForm({
      isNew: false,
      target: profile.target,
      secondary: profile.secondary,
      reason: profile.reason ?? "",
    });
  }

  async function save() {
    if (!form) return;
    if (!form.reason.trim()) {
      setError(PROFILE_REASON_REQUIRED);
      return;
    }
    setBusy(true);
    try {
      const failure = await onSave({ target: form.target, secondary: form.secondary, reason: form.reason });
      setError(failure);
      if (!failure) setForm(null);
    } finally {
      setBusy(false);
    }
  }

  async function remove(profile: ProfileRef) {
    const ok = await confirm({
      title: `Delete the ${profile.target} profile?`,
      description:
        "Exercises of this pair that target this muscle with their own muscles keep them; custom user exercises with this target then resolve the pair's secondaries.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      setError(await onDelete(profile.target));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {profiles.length === 0 && !form && (
        <p className="text-sm text-zinc-500">No target profile: every inherited exercise uses the pair&apos;s muscles.</p>
      )}
      {profiles.map((profile) => {
        const users = profileUserCount(exercises, profile.target);
        const editingThis = form && !form.isNew && form.target === profile.target;
        if (editingThis) return null;
        return (
          <div key={profile.target} className="space-y-2 rounded-lg border border-zinc-200 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <MuscleSetChips muscles={muscles.concat(homeMuscles)} value={profile} />
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-7 px-2 text-xs"
                  disabled={busy || form !== null}
                  onClick={() => openEdit(profile)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  disabled={busy || form !== null || users > 0}
                  title={
                    users > 0
                      ? `${users} inherited exercise(s) resolve through this profile: give them their own muscles or another target first`
                      : undefined
                  }
                  onClick={() => void remove(profile)}
                >
                  Delete
                </Button>
              </div>
            </div>
            <p className="text-xs text-zinc-500">
              {users === 0 ? "No inherited exercise uses it yet." : `${users} inherited exercise(s) follow it.`}
              {profile.reason ? ` Reason: ${profile.reason}` : ""}
            </p>
          </div>
        );
      })}

      {form ? (
        <div className="space-y-3 rounded-lg border border-zinc-300 bg-zinc-50 p-3">
          <p className="text-xs font-medium text-zinc-600">
            {form.isNew ? "New target profile" : `Profile ${form.target}`}
          </p>
          <MuscleSetEditor
            muscles={muscles}
            targetMuscles={targetOptions(form)}
            targetHint={
              form.isNew
                ? `Targets: ${groupCode}'s muscles other than the pair's target (${pairTarget || "none"}) and the targets that already have a profile.`
                : "A profile's target is its key: delete the profile and add another to change it."
            }
            value={{ target: form.target, secondary: form.secondary }}
            onChange={(value: MuscleSet) => setForm({ ...form, ...value })}
            disabled={busy}
          />
          <label className="block text-xs font-medium text-zinc-600">
            Reason (staff only, required)
            <textarea
              className="mt-1 block min-h-[4rem] w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
              value={form.reason}
              disabled={busy}
              placeholder="Why exercises with this target use other secondaries (biomechanics, source)"
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={busy || !form.target || !form.reason.trim()}
              onClick={() => void save()}
            >
              {busy ? "Saving…" : "Save profile"}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          className="text-xs"
          disabled={busy || newTargets.length === 0}
          title={newTargets.length === 0 ? `Every muscle of ${groupCode} is the pair's target or has a profile` : undefined}
          onClick={openNew}
        >
          + Target profile
        </Button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
