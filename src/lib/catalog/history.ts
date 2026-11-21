/** One row of `catalog_change_log` as Support reads it. */
export type ChangeLogRow = {
  id: number;
  changed_at: string;
  actor: string | null;
  table_name: string;
  row_key: string;
  op: "INSERT" | "UPDATE" | "DELETE";
  old_row: Record<string, unknown> | null;
  new_row: Record<string, unknown> | null;
};

export type HistoryEntry = {
  id: number;
  changed_at: string;
  actor: string;
  /** What changed: the exercise, a locale (`name es`) or a secondary muscle. */
  what: string;
  op: ChangeLogRow["op"];
  /** Fields an update changed (ids and timestamps left out). */
  changes: Array<{ field: string; from: unknown; to: unknown }>;
};

const NOISE = new Set(["id", "inserted_at", "updated_at", "exercise_id"]);

const LABEL: Record<string, string> = {
  exercises: "exercise",
  exercise_localizations: "name",
  exercise_secondary_muscles: "secondary muscle",
};

/**
 * The exercise history shown in the editor, from `catalog.change_log` (backend 2.10.0): who
 * changed what, and for an update the fields that changed. Foreign keys stay as ids (the log
 * stores rows as written); names, muscles and flags read as they are.
 */
export function summarizeChange(row: ChangeLogRow): HistoryEntry {
  const suffix = row.row_key.includes(":") ? ` ${row.row_key.split(":").slice(1).join(":")}` : "";
  const changes: HistoryEntry["changes"] = [];
  if (row.op === "UPDATE" && row.old_row && row.new_row) {
    for (const field of Object.keys(row.new_row)) {
      if (NOISE.has(field)) continue;
      const from = row.old_row[field];
      const to = row.new_row[field];
      if (JSON.stringify(from) !== JSON.stringify(to)) changes.push({ field, from, to });
    }
  }
  return {
    id: row.id,
    changed_at: row.changed_at,
    actor: row.actor ?? "",
    what: `${LABEL[row.table_name] ?? row.table_name}${suffix}`,
    op: row.op,
    changes,
  };
}
