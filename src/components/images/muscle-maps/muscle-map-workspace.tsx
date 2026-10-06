"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight, Loader2 } from "lucide-react";
import { BOARD_REFRESH_MS, EmptyState, NeighbourLink } from "@/components/images/board-ui";
import { CHECKER_STYLE } from "@/components/images/checker";
import { JobFailures } from "@/components/images/run-status";
import {
  LabeledControl,
  SegmentedControl,
  StyleSelector,
} from "@/components/images/generation-controls";
import { MuscleMapMetadataPanel } from "@/components/images/image-metadata";
import {
  RunInputsPanel,
  type AutomaticInput,
  type RunReferences,
} from "@/components/images/run-inputs-panel";
import { Button, Skeleton } from "@/components/ui/primitives";
import { useStyleChoice } from "@/hooks/use-image-preferences";
import {
  muscleMapBoardKey,
  useMuscleMapActions,
  type MuscleMapRun,
} from "@/hooks/use-muscle-map-actions";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { useStaffSWR } from "@/hooks/use-staff-fetch";
import {
  mapBoardFiltersQuery,
  mapBoardNeighbours,
  readMapBoardFilters,
} from "@/lib/images/board-filters";
import { PROMPT_PLACEHOLDERS } from "@/lib/images/prompt";
import type {
  ImageStyle,
  MuscleMapBoardRow,
  MuscleMapBoardTarget,
  MuscleMapImage,
  MuscleMapTargetRef,
  MuscleMapView,
  StylePrompts,
  StyleReference,
} from "@/lib/images/types";
import { MUSCLE_MAP_VIEWS, muscleMapTargetKey } from "@/lib/images/types";
import { imageThumbUrl, muscleMapPath } from "@/lib/images/urls";
import { cn } from "@/lib/utils";
import { VIEW_LABEL } from "./muscle-map-card";

function ViewColumn({
  view,
  images,
  library,
  hasBase,
  busy,
  onGenerate,
  onActivate,
  onDeactivate,
  onDelete,
}: {
  view: MuscleMapView;
  images: MuscleMapImage[];
  library: StyleReference[];
  hasBase: boolean;
  busy: boolean;
  onGenerate: () => void;
  onActivate: (image: MuscleMapImage) => void;
  onDeactivate: (image: MuscleMapImage) => void;
  onDelete: (image: MuscleMapImage) => void;
}) {
  const [pickedId, setPickedId] = useState<string | null>(null);
  const shown =
    images.find((img) => img.id === pickedId) ?? images.find((img) => img.active) ?? images[0];
  const url = imageThumbUrl(shown?.image_url, 720);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900">{VIEW_LABEL[view]}</h3>
        <Button
          type="button"
          className="h-8 px-3 text-xs"
          disabled={busy || !hasBase}
          title={hasBase ? undefined : `Add the ${view} base on Styles first`}
          onClick={onGenerate}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Generate"}
        </Button>
      </div>
      <div
        className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-zinc-200"
        style={CHECKER_STYLE}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={VIEW_LABEL[view]} className="h-full w-full object-contain" />
        ) : (
          <span className="px-4 text-center text-xs text-zinc-500">
            {hasBase ? (
              "No map yet"
            ) : (
              <>
                No {view} base.{" "}
                <Link href="/images/styles?tab=assets" className="underline">
                  Add it on Styles
                </Link>
              </>
            )}
          </span>
        )}
        {shown?.active && (
          <span className="absolute left-2 top-2 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
            Active
          </span>
        )}
      </div>
      {shown && (
        <div className="flex flex-wrap gap-1.5">
          {shown.active ? (
            <Button
              type="button"
              variant="secondary"
              className="h-7 px-2.5 text-xs"
              onClick={() => onDeactivate(shown)}
            >
              Deactivate
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                className="h-7 px-2.5 text-xs"
                onClick={() => onActivate(shown)}
              >
                Make active
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-7 px-2.5 text-xs"
                onClick={() => onDelete(shown)}
              >
                Delete
              </Button>
            </>
          )}
        </div>
      )}
      {images.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {images.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setPickedId(img.id)}
              className={cn(
                "relative h-14 w-14 shrink-0 overflow-hidden rounded-md border",
                img.id === shown?.id ? "border-zinc-900" : "border-zinc-200",
              )}
              style={CHECKER_STYLE}
              title={new Date(img.created_at).toLocaleString()}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageThumbUrl(img.image_url, 120) ?? ""}
                alt=""
                className="h-full w-full object-contain"
              />
              {img.active && (
                <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
              )}
            </button>
          ))}
        </div>
      )}
      {shown && <MuscleMapMetadataPanel image={shown} references={library} />}
    </div>
  );
}

/** Both views of one muscle or group, its inputs and a one-off prompt for its next maps. */
function TargetMaps({
  target,
  template,
  bases,
  library,
  isBusy,
  onGenerate,
  onUpdate,
}: {
  target: MuscleMapBoardTarget;
  /** The style's muscle map prompt, the starting point of a one-off edit. */
  template: string;
  /** The style's base file per view. */
  bases: { view: MuscleMapView; file_id: string }[];
  /** Every reference of the style; the ones linked to this target start on. */
  library: StyleReference[];
  isBusy: (view: MuscleMapView) => boolean;
  onGenerate: (view: MuscleMapView, run: MuscleMapRun, variants: number) => void;
  onUpdate: (image: MuscleMapImage, change: "activate" | "deactivate" | "delete") => void;
}) {
  const [prompt, setPrompt] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const edited = prompt != null && prompt !== template;
  const [references, setReferences] = useState<RunReferences>(undefined);
  // 1 replaces the active map; more add candidates to the view's history to pick from.
  const [variants, setVariants] = useState(1);
  const baseViews = bases.map((b) => b.view);
  const linked = library.filter((r) =>
    r.links.some((l) => l.kind === target.kind && l.id === target.id),
  );
  const automatic: AutomaticInput[] = MUSCLE_MAP_VIEWS.map((view) => ({
    label: `Base · ${VIEW_LABEL[view]}`,
    detail: `For the ${view} map`,
    fileId: bases.find((b) => b.view === view)?.file_id ?? null,
  }));
  const anyBusy = MUSCLE_MAP_VIEWS.some(isBusy);

  const run: MuscleMapRun = {
    ...(edited ? { promptOverride: prompt ?? undefined } : {}),
    ...(references !== undefined ? { referenceIds: references } : {}),
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-3 sm:grid-cols-2">
        {MUSCLE_MAP_VIEWS.map((view) => (
          <ViewColumn
            key={view}
            view={view}
            images={target.images.filter((img) => img.view === view)}
            library={library}
            hasBase={baseViews.includes(view)}
            busy={isBusy(view)}
            onGenerate={() => onGenerate(view, run, variants)}
            onActivate={(image) => onUpdate(image, "activate")}
            onDeactivate={(image) => onUpdate(image, "deactivate")}
            onDelete={(image) => onUpdate(image, "delete")}
          />
        ))}
      </div>

      <aside className="space-y-4 lg:sticky lg:top-28">
        <div className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2">
          <LabeledControl label="Variants">
            <SegmentedControl
              label="Candidates per Generate"
              value={variants}
              onChange={setVariants}
              disabled={anyBusy}
              options={[1, 2, 3, 4].map((n) => ({
                value: n,
                label: String(n),
                title: n === 1 ? "Replace the active map" : `${n} candidates, kept in history`,
              }))}
            />
          </LabeledControl>
          <span className="text-[11px] text-zinc-500">
            {variants === 1 ? "Replaces the active map" : "Candidates stay inactive"}
          </span>
        </div>
        <RunInputsPanel
          automatic={automatic}
          linked={linked}
          library={library}
          value={references}
          onChange={setReferences}
          note="Each map edits the base of its view; library references are sent with both views."
          disabled={anyBusy}
        />

        <section className="rounded-xl border border-zinc-200 bg-white">
          <button
            type="button"
            onClick={() => setPromptOpen((v) => !v)}
            aria-expanded={promptOpen}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
          >
            <span className="text-sm font-medium text-zinc-900">
              Prompt
              {edited && (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                  edited for this run
                </span>
              )}
            </span>
            <span className="text-xs text-zinc-500">{promptOpen ? "Hide" : "Edit"}</span>
          </button>
          {promptOpen && (
            <div className="space-y-2 border-t border-zinc-100 px-3 py-3">
              <textarea
                className={cn(
                  "min-h-48 w-full rounded-md border px-3 py-2 font-mono text-xs",
                  edited ? "border-amber-300 bg-amber-50/40" : "border-zinc-300",
                )}
                value={prompt ?? template}
                onChange={(e) => setPrompt(e.target.value)}
              />
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>Placeholders: {PROMPT_PLACEHOLDERS.muscleMap.join(", ")}</span>
                {edited && (
                  <button
                    type="button"
                    className="text-zinc-600 underline"
                    onClick={() => setPrompt(null)}
                  >
                    Reset
                  </button>
                )}
              </div>
              <p className="text-[11px] text-zinc-500">
                Not saved: it applies to the next Generate here. Edit the style prompt on{" "}
                <Link href="/images/styles?tab=prompts" className="underline">
                  Styles → Prompts
                </Link>
                .
              </p>
            </div>
          )}
        </section>
      </aside>
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ["[ ]", "Prev / next"],
  ["Esc", "Back"],
];

/** The page of one muscle or group: both map views, their history, inputs and prompt. */
export function MuscleMapWorkspace({ target: ref }: { target: MuscleMapTargetRef }) {
  const router = useRouter();
  const { data: stylesData } = useStaffSWR<{ styles: ImageStyle[] }>("/api/images/styles");
  const styles = stylesData?.styles ?? [];
  const [styleId, setStyleId] = useStyleChoice(styles);
  const style = styles.find((s) => s.id === styleId) ?? null;
  const { data, isLoading, error } = useStaffSWR<{ rows: MuscleMapBoardRow[] }>(
    muscleMapBoardKey(styleId),
    { refreshInterval: BOARD_REFRESH_MS },
  );
  const { data: prompts } = useStaffSWR<StylePrompts>(
    styleId ? `/api/images/prompts?styleId=${styleId}` : null,
  );
  const { data: referencesData } = useStaffSWR<{ references: StyleReference[] }>(
    styleId ? `/api/images/styles/${styleId}/references` : null,
  );
  const actions = useMuscleMapActions(styleId);

  const targets = useMemo(
    () =>
      (data?.rows ?? []).flatMap((row) => (row.group ? [row.group, ...row.muscles] : row.muscles)),
    [data],
  );
  const target = targets.find((t) => t.kind === ref.kind && t.id === ref.id) ?? null;

  // Previous / next browse the board list with the filters the board was left with.
  const filters = readMapBoardFilters(useSearchParams());
  const filtersQuery = mapBoardFiltersQuery(filters);
  const neighbours = mapBoardNeighbours(targets, filters, ref);
  const hrefOf = (t: MuscleMapTargetRef | null) =>
    t ? `${muscleMapPath(t)}${filtersQuery}` : null;
  const previousHref = hrefOf(neighbours.previous);
  const nextHref = hrefOf(neighbours.next);
  const boardHref = `/images/muscle-maps${filtersQuery}`;

  useShortcuts({
    "[": () => previousHref && router.push(previousHref),
    "]": () => nextHref && router.push(nextHref),
    Escape: () => router.push(boardHref),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <nav className="mb-1 flex items-center gap-1 text-xs text-zinc-500">
            <Link href={boardHref} className="hover:text-zinc-900">
              Muscle maps
            </Link>
            <ChevronRight className="h-3 w-3 text-zinc-400" />
            <span>{ref.kind === "muscle_group" ? "Group" : "Muscle"}</span>
          </nav>
          {target && (
            <>
              <h1 className="truncate text-xl font-semibold tracking-tight text-zinc-900">
                {target.name}
              </h1>
              <p className="text-sm text-zinc-500">
                {target.code}
                {target.description ? ` · ${target.description}` : ""}
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StyleSelector styles={styles} value={styleId} onChange={setStyleId} />
          <div className="flex">
            <NeighbourLink direction="previous" href={previousHref} noun="target" />
            <NeighbourLink direction="next" href={nextHref} noun="target" />
          </div>
        </div>
      </div>

      {style && style.muscle_bases.length < MUSCLE_MAP_VIEWS.length && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {style.name} has no{" "}
          {MUSCLE_MAP_VIEWS.filter((v) => !style.muscle_bases.some((b) => b.view === v)).join(
            " or ",
          )}{" "}
          base yet. Maps edit the base of their view:{" "}
          <Link href="/images/styles?tab=assets" className="font-medium underline">
            add it on Styles → Assets
          </Link>
          .
        </div>
      )}

      {target && (
        <JobFailures
          jobs={actions.failedFor(target)}
          labelOf={(job) => (job.view ? `${VIEW_LABEL[job.view]} map` : "Map")}
          canAct={!MUSCLE_MAP_VIEWS.some((view) => actions.isBusy(target, view))}
          onRetry={() => void actions.jobs.retryFailed()}
          onDismiss={() => void actions.jobs.dismissFinished()}
        />
      )}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error.message}
        </div>
      ) : isLoading || !styleId ? (
        <Skeleton className="h-[32rem] w-full rounded-xl" />
      ) : !target ? (
        <EmptyState>This muscle or group is not on the board.</EmptyState>
      ) : (
        <TargetMaps
          // Per-target choices (prompt edit, references, picked image) reset on navigation.
          key={muscleMapTargetKey(target)}
          target={target}
          template={prompts?.muscleMap?.content ?? ""}
          bases={style?.muscle_bases ?? []}
          library={referencesData?.references ?? []}
          isBusy={(view) => actions.isBusy(target, view)}
          onGenerate={(view, run, variants) =>
            void actions.generateOne(target, view, run, variants)
          }
          onUpdate={(image, change) => void actions.update(target, image, change)}
        />
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-400">
        {SHORTCUTS.map(([keys, label]) => (
          <span key={label} className="inline-flex items-center gap-1">
            <kbd className="rounded border border-zinc-200 bg-white px-1 font-sans text-[10px] text-zinc-500">
              {keys}
            </kbd>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
