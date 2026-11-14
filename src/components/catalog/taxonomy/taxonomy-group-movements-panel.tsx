"use client";

import { useMemo, useState } from "react";
import { Button, Card, Input } from "@/components/ui/primitives";
import { useConfirm } from "@/components/ui/confirm";
import { Modal } from "@/components/ui/modal";
import {
  MuscleSetChips,
  MuscleSetEditor,
  type MuscleOption,
  type MuscleSet,
} from "@/components/catalog/muscle-set-editor";
import { resolveLocalizedName, type LocalizedLookup } from "@/lib/catalog/locales";
import type { LookupRowFull, MuscleGroupRow, StrengthPatternRow } from "./types";

type PairRow = {
  key: string;
  groupCode: string;
  groupName: string;
  movementCode: string;
  movementName: string;
  muscles: MuscleSet;
  exerciseCount: number;
  inheritingCount: number;
  /** Pair-level pattern: "inherit" (movement type's), "none" (isolation) or a pattern code. */
  patternChoice: string;
  /** Pattern code in force (the pair's when it overrides, else the movement type's); "" = isolation. */
  effectivePattern: string;
  movementPattern: string;
};

const INHERIT = "inherit";
const ISOLATION = "none";

type Props = {
  groups: MuscleGroupRow[];
  movements: LookupRowFull[];
  muscles: LookupRowFull[];
  strengthPatterns: StrengthPatternRow[];
  onLink: (groupCode: string, movementCode: string) => Promise<void>;
  onUnlink: (groupCode: string, movementCode: string) => Promise<void>;
  /** Resolves null when saved, else the error; the editor stays open on error. */
  onSaveMuscles: (
    groupCode: string,
    movementCode: string,
    muscles: MuscleSet,
  ) => Promise<string | null>;
  /** `inherit` clears the pair's pattern, `none` = isolation, else a pattern code. Same contract. */
  onSaveStrengthPattern: (
    groupCode: string,
    movementCode: string,
    strengthPattern: string,
  ) => Promise<string | null>;
};

function selectClass(extra = "") {
  return `rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm ${extra}`;
}

/**
 * Which movement types each muscle group can use, and each pair's default muscles (inherited by
 * its exercises). Pair names are on Catalog → Localizations.
 */
export function TaxonomyGroupMovementsPanel({
  groups,
  movements,
  muscles,
  strengthPatterns,
  onLink,
  onUnlink,
  onSaveMuscles,
  onSaveStrengthPattern,
}: Props) {
  const [filter, setFilter] = useState("");
  const confirm = useConfirm();
  const [groupFilter, setGroupFilter] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [linkGroup, setLinkGroup] = useState(groups[0]?.code ?? "");
  const [linkMovement, setLinkMovement] = useState("");
  const [linking, setLinking] = useState(false);
  const [editing, setEditing] = useState<PairRow | null>(null);
  const [draft, setDraft] = useState<MuscleSet>({ target: "", secondary: [] });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [patternRow, setPatternRow] = useState<PairRow | null>(null);
  const [patternDraft, setPatternDraft] = useState(INHERIT);

  const muscleOptions = useMemo(
    (): MuscleOption[] =>
      muscles
        .filter((m) => m.active !== false)
        .map((m) => ({ code: m.code, name: resolveLocalizedName(m as LocalizedLookup, "en") }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [muscles],
  );

  const pairs = useMemo((): PairRow[] => {
    const rows: PairRow[] = [];
    for (const group of groups) {
      for (const x of group.group_movement_types) {
        const movementPattern =
          movements.find((m) => m.code === x.movement_type.code)?.strength_pattern?.code ?? "";
        const override = x.strength_pattern_override === true;
        const pairPattern = x.strength_pattern?.code ?? "";
        rows.push({
          key: `${group.code}::${x.movement_type.code}`,
          groupCode: group.code,
          groupName: resolveLocalizedName(group as LocalizedLookup, "en"),
          movementCode: x.movement_type.code,
          movementName: resolveLocalizedName(x.movement_type as LocalizedLookup, "en"),
          muscles: {
            target: x.target_muscle?.code ?? "",
            secondary: (x.secondary_muscles ?? []).map((s) => s.muscle.code),
          },
          exerciseCount: x.exercises?.length ?? 0,
          inheritingCount: (x.exercises ?? []).filter((e) => e.muscles_inherited).length,
          patternChoice: override ? pairPattern || ISOLATION : INHERIT,
          effectivePattern: override ? pairPattern : movementPattern,
          movementPattern,
        });
      }
    }
    return rows.sort((a, b) => {
      const g = a.groupCode.localeCompare(b.groupCode);
      return g !== 0 ? g : a.movementCode.localeCompare(b.movementCode);
    });
  }, [groups, movements]);

  const linkedForGroup = useMemo(() => {
    const set = new Set<string>();
    for (const p of pairs) {
      if (p.groupCode === linkGroup) set.add(p.movementCode);
    }
    return set;
  }, [pairs, linkGroup]);

  const availableMovements = useMemo(
    () =>
      movements
        .filter((m) => m.active !== false && !linkedForGroup.has(m.code))
        .sort((a, b) => a.code.localeCompare(b.code)),
    [movements, linkedForGroup],
  );

  const q = filter.trim().toLowerCase();
  const filtered = pairs.filter((p) => {
    if (groupFilter && p.groupCode !== groupFilter) return false;
    if (!q) return true;
    return (
      p.groupCode.toLowerCase().includes(q) ||
      p.movementCode.toLowerCase().includes(q) ||
      p.groupName.toLowerCase().includes(q) ||
      p.movementName.toLowerCase().includes(q)
    );
  });

  async function unlinkRow(row: PairRow) {
    const unlink = await confirm({
      title: `Unlink ${row.groupCode} + ${row.movementCode}?`,
      description: "Custom names for this pair will be removed.",
      confirmLabel: "Unlink",
      variant: "danger",
    });
    if (!unlink) return;
    setBusyKey(row.key);
    try {
      await onUnlink(row.groupCode, row.movementCode);
    } finally {
      setBusyKey(null);
    }
  }

  function openMuscles(row: PairRow) {
    setDraft(row.muscles);
    setSaveError(null);
    setEditing(row);
  }

  async function saveMuscles() {
    if (!editing || !draft.target) return;
    setSaving(true);
    try {
      const error = await onSaveMuscles(editing.groupCode, editing.movementCode, draft);
      setSaveError(error);
      if (!error) setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  function openPattern(row: PairRow) {
    setPatternDraft(row.patternChoice);
    setSaveError(null);
    setPatternRow(row);
  }

  async function savePattern() {
    if (!patternRow) return;
    setSaving(true);
    try {
      const error = await onSaveStrengthPattern(
        patternRow.groupCode,
        patternRow.movementCode,
        patternDraft,
      );
      setSaveError(error);
      if (!error) setPatternRow(null);
    } finally {
      setSaving(false);
    }
  }

  async function linkPair() {
    if (!linkGroup || !linkMovement) return;
    setLinking(true);
    try {
      await onLink(linkGroup, linkMovement);
      setLinkMovement("");
    } finally {
      setLinking(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Group movements</h2>
          <p className="text-xs text-zinc-500">
            Which movement types each muscle group can use, and each pair&apos;s default muscles
            (exercises that inherit follow them). Pair names per language (e.g. Chest Press
            instead of Chest - Press) are on Catalog → Localizations.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-zinc-600">
            Group
            <select
              className={`${selectClass("mt-1 block min-w-[10rem]")}`}
              value={linkGroup}
              onChange={(e) => {
                setLinkGroup(e.target.value);
                setLinkMovement("");
              }}
            >
              {groups.map((g) => (
                <option key={g.id} value={g.code}>
                  {g.code}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Movement
            <select
              className={`${selectClass("mt-1 block min-w-[12rem]")}`}
              value={linkMovement}
              onChange={(e) => setLinkMovement(e.target.value)}
            >
              <option value="">Select…</option>
              {availableMovements.map((m) => (
                <option key={m.id} value={m.code}>
                  {m.code} — {resolveLocalizedName(m as LocalizedLookup, "en")}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            disabled={!linkGroup || !linkMovement || linking}
            onClick={() => void linkPair()}
          >
            {linking ? "Linking…" : "Link"}
          </Button>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Filter group or movement…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-sm"
        />
        <select
          className={selectClass("min-w-[10rem]")}
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
        >
          <option value="">All groups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.code}>
              {g.code}
            </option>
          ))}
        </select>
        <span className="text-xs text-zinc-500">
          {filtered.length} / {pairs.length} pairs
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-medium">Group</th>
              <th className="px-3 py-2 font-medium">Movement</th>
              <th className="px-3 py-2 font-medium">Muscles</th>
              <th className="px-3 py-2 font-medium">Strength pattern</th>
              <th className="px-3 py-2 font-medium">Exercises</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-zinc-500">
                  No group–movement pairs yet. Link one above.
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const busy = busyKey === row.key;
                return (
                  <tr key={row.key} className="border-b border-zinc-100 align-top">
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs">{row.groupCode}</div>
                      <div className="text-xs text-zinc-500">{row.groupName}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-mono text-xs">{row.movementCode}</div>
                      <div className="text-xs text-zinc-500">{row.movementName}</div>
                    </td>
                    <td className="px-3 py-2">
                      <MuscleSetChips muscles={muscleOptions} value={row.muscles} />
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-600">
                      <div className="font-mono">{row.effectivePattern || "Isolation"}</div>
                      <div className="text-zinc-500">
                        {row.patternChoice === INHERIT ? "from movement" : "pair override"}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-600">
                      {row.exerciseCount === 0
                        ? "None"
                        : `${row.inheritingCount} / ${row.exerciseCount} inherit`}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy}
                          className="h-8 px-2 text-xs"
                          onClick={() => openMuscles(row)}
                        >
                          Muscles
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy}
                          className="h-8 px-2 text-xs"
                          onClick={() => openPattern(row)}
                        >
                          Pattern
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={busy}
                          className="h-8 px-2 text-xs"
                          onClick={() => void unlinkRow(row)}
                        >
                          Unlink
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {patternRow && (
        <Modal
          onClose={() => setPatternRow(null)}
          labelledBy="pair-pattern-title"
          dismissible={!saving}
          className="max-w-lg"
        >
          <div className="space-y-4 p-6">
            <div>
              <h2 id="pair-pattern-title" className="text-lg font-semibold">
                {patternRow.groupName} + {patternRow.movementName}
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Strength pattern of this pair (Strength Focus Fit, recovery horizon, Coach compound
                lifts). By default the pair takes its movement type&apos;s pattern; override it for
                exceptions such as Leg Press = SQUAT or Calf Press = isolation.
              </p>
            </div>
            <label className="block text-xs font-medium text-zinc-600">
              Strength pattern
              <select
                className={selectClass("mt-1 block w-full")}
                value={patternDraft}
                disabled={saving}
                onChange={(e) => setPatternDraft(e.target.value)}
              >
                <option value={INHERIT}>
                  Same as movement ({patternRow.movementPattern || "isolation"})
                </option>
                <option value={ISOLATION}>Isolation (no pattern)</option>
                {strengthPatterns
                  .filter((p) => p.active !== false || p.code === patternRow.patternChoice)
                  .map((p) => (
                    <option key={p.id} value={p.code}>
                      {p.code} — {p.name}
                    </option>
                  ))}
              </select>
            </label>
            {saveError && <p className="text-sm text-red-600">{saveError}</p>}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => setPatternRow(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={saving || patternDraft === patternRow.patternChoice}
                onClick={() => void savePattern()}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal
          onClose={() => setEditing(null)}
          labelledBy="pair-muscles-title"
          dismissible={!saving}
          className="max-w-lg"
        >
          <div className="space-y-4 p-6">
            <div>
              <h2 id="pair-muscles-title" className="text-lg font-semibold">
                {editing.groupName} + {editing.movementName}
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Default muscles of this pair.{" "}
                {editing.inheritingCount > 0
                  ? `${editing.inheritingCount} inheriting exercise(s) follow these muscles.`
                  : "No exercise inherits them yet."}
              </p>
            </div>
            <MuscleSetEditor
              muscles={muscleOptions}
              value={draft}
              onChange={setDraft}
              disabled={saving}
            />
            {saveError && <p className="text-sm text-red-600">{saveError}</p>}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => setEditing(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={saving || !draft.target}
                onClick={() => void saveMuscles()}
              >
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
