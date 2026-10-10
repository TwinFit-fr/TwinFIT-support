"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { MAP_VIEWS, MAP_VIEW_LABEL, type MapBase, type MapView } from "@/lib/muscle-map/types";
import { MaskedBase, UploadButton, errorText, formatDate } from "./shared";
import type { MuscleMapApi } from "./use-muscle-map";

/** One card per view: the active base, how to make a new one, and the older bases. */
export function BasesPanel({ api }: { api: MuscleMapApi }) {
  const board = api.data!;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {MAP_VIEWS.map((view) => (
        <ViewBases
          key={view}
          view={view}
          api={api}
          bases={board.bases.filter((b) => b.view === view)}
          maskCount={(baseId) => board.masks.filter((m) => m.base_id === baseId).length}
          activeMaskCount={(baseId) =>
            board.masks.filter((m) => m.base_id === baseId && m.active).length
          }
        />
      ))}
    </div>
  );
}

function ViewBases({
  view,
  api,
  bases,
  maskCount,
  activeMaskCount,
}: {
  view: MapView;
  api: MuscleMapApi;
  bases: MapBase[];
  maskCount: (baseId: string) => number;
  activeMaskCount: (baseId: string) => number;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const active = bases.find((b) => b.active) ?? null;
  const older = bases.filter((b) => !b.active);
  const copySources = active
    ? older.filter(
        (b) => b.width === active.width && b.height === active.height && activeMaskCount(b.id) > 0,
      )
    : [];

  async function run(label: string, task: () => Promise<unknown>, done?: string) {
    setBusy(label);
    try {
      await task();
      if (done) toast.success(done);
    } catch (error) {
      toast.error(errorText(error, `${label} failed`));
    } finally {
      setBusy(null);
    }
  }

  async function remove(base: MapBase) {
    const masks = maskCount(base.id);
    const ok = await confirm({
      title: `Delete this ${view} base?`,
      description: `Its file and its ${masks} mask(s) with their files are deleted too.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (ok) await run("Delete", () => api.deleteBase(base.id), "Base deleted");
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{MAP_VIEW_LABEL[view]}</h2>
        <div className="flex gap-1">
          <Button
            type="button"
            className="h-8 px-2 text-xs"
            disabled={busy !== null}
            onClick={() =>
              void run("Generate", () => api.createBase(view), `New ${view} base generated`)
            }
          >
            <Sparkles className="h-3.5 w-3.5" />
            {busy === "Generate" ? "Generating…" : "Generate"}
          </Button>
          <UploadButton
            disabled={busy !== null}
            onUpload={(upload) =>
              run("Upload", () => api.createBase(view, upload), `New ${view} base uploaded`)
            }
          />
        </div>
      </div>

      {active ? (
        <div className="space-y-2">
          <MaskedBase base={active} layers={[]} width={480} />
          <p className="text-xs text-zinc-500">
            Active · {active.width}×{active.height} · {activeMaskCount(active.id)} active mask(s)
            · {active.model || "uploaded"} · {formatDate(active.created_at)}
          </p>
          {copySources.length > 0 && (
            <label className="block text-xs font-medium text-zinc-600">
              Copy masks from an older base of the same size
              <select
                className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                value=""
                disabled={busy !== null}
                onChange={(e) => {
                  const from = e.target.value;
                  if (!from) return;
                  void run("Copy", async () => {
                    const result = await api.copyMasks(active.id, from);
                    if (result.failed) {
                      throw new Error(`${result.copied} copied, ${result.failed} failed`);
                    }
                    toast.success(`${result.copied} mask(s) copied`);
                  });
                }}
              >
                <option value="">{busy === "Copy" ? "Copying…" : "Select a base…"}</option>
                {copySources.map((b) => (
                  <option key={b.id} value={b.id}>
                    {formatDate(b.created_at)} · {activeMaskCount(b.id)} mask(s)
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button
            type="button"
            variant="ghost"
            className="h-8 px-2 text-xs"
            disabled={busy !== null}
            onClick={() => void run("Deactivate", () => api.setBaseActive(active.id, false))}
          >
            Deactivate
          </Button>
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
          No active {view} base. Generate or upload one.
        </p>
      )}

      {older.length > 0 && (
        <div className="space-y-2 border-t border-zinc-100 pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
            Older bases ({older.length})
          </p>
          {older.map((base) => (
            <div key={base.id} className="flex items-center gap-3">
              <div className="w-16 shrink-0">
                <MaskedBase base={base} layers={[]} width={128} />
              </div>
              <div className="min-w-0 flex-1 text-xs text-zinc-600">
                <div>{formatDate(base.created_at)}</div>
                <div className="text-zinc-400">
                  {base.width}×{base.height} · {maskCount(base.id)} mask(s)
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-7 px-2 text-xs"
                  disabled={busy !== null}
                  onClick={() => void run("Activate", () => api.setBaseActive(base.id, true))}
                >
                  Activate
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-red-600"
                  disabled={busy !== null}
                  onClick={() => void remove(base)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {busy && busy !== "Copy" && <Badge>{busy}…</Badge>}
    </Card>
  );
}
