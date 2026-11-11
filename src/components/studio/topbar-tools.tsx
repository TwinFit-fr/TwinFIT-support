"use client";

import { ChevronDown, Download, Dumbbell, MoreHorizontal, Plus, Settings2, Users } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { downloadStudioAsset } from "@/lib/studio/asset-auth";
import { useStudioStore } from "@/lib/studio/store";
import { studioAssetUrl } from "@/lib/studio/storage-url";
import type { BaseAvatar, StudioExercise } from "@/lib/studio/types";
import { ToolButton, ToolDivider } from "./shell/tool-button";
import { ToolMenu, type ToolMenuItem } from "./shell/tool-menu";

function avatarOptionText(a: BaseAvatar): string {
  const state = a.status === "processing" || a.status === "pending" ? ` · building ${a.progress}%` : a.status === "error" ? " · failed" : "";
  return `${a.name} · ${a.rig}${a.is_default ? " · default" : ""}${state}`;
}

/** The exercise being worked on, in the middle of the top bar. */
export function CurrentExercise({ exercise }: { exercise: StudioExercise | null }) {
  const editing = useStudioStore((s) => Boolean(s.poseEdit));
  const dirty = useStudioStore((s) => s.poseEdit?.dirty ?? false);
  if (!exercise) {
    return <span className="truncate text-(length:--studio-text-sm) text-(--m3-on-surface-variant)">Pick an exercise in the catalog</span>;
  }
  return (
    <div className="flex min-w-0 items-center gap-(--studio-space-2)" title={`${exercise.display_name} · #${exercise.exo_id}`}>
      <span className="truncate text-(length:--studio-text-sm) font-medium text-(--m3-on-surface)">{exercise.display_name}</span>
      <span className="shrink-0 font-mono text-(length:--studio-text-xs) text-(--m3-on-surface-variant)">#{exercise.exo_id}</span>
      {editing ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-(--studio-radius-sm) bg-(--m3-surface-container-high) px-(--studio-space-2) py-0.5 text-(length:--studio-text-xs) text-(--m3-on-surface-variant)">
          Editing poses
          {dirty ? (
            <>
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-(--m3-warning)" />
              <span className="text-(--m3-warning)">unsaved</span>
            </>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The right-hand tool group: the base avatar (picker plus a menu with new / manage / download),
 * the equipment library and the settings. Text labels drop on narrow windows; every tool keeps
 * its name in a tooltip and in aria-label.
 */
export function TopbarTools({
  avatars,
  selected,
  settingsReady,
  onSelectAvatar,
  onAddAvatar,
  onManageAvatars,
  onEquipment,
  onSettings,
}: {
  avatars: BaseAvatar[];
  selected: BaseAvatar | null;
  settingsReady: boolean;
  onSelectAvatar: (id: string) => void;
  onAddAvatar: () => void;
  onManageAvatars: () => void;
  onEquipment: () => void;
  onSettings: () => void;
}) {
  const toast = useToast();
  const modelUrl = selected ? studioAssetUrl(selected.file_id, selected.model_url) : null;
  const avatarItems: ToolMenuItem[] = [
    { label: "New avatar…", hint: "Upload a rigged .glb, use the mannequin or generate one", icon: <Plus className="h-4 w-4" />, onSelect: onAddAvatar },
    { label: "Manage avatars…", hint: "Rename, set the default, retry or delete", icon: <Users className="h-4 w-4" />, onSelect: onManageAvatars },
    {
      label: "Download this avatar (.glb)",
      hint: "For a capture tool's custom character, so its exports fit the rig",
      icon: <Download className="h-4 w-4" />,
      disabled: !modelUrl || !selected,
      onSelect: () => {
        if (!modelUrl || !selected) return;
        void downloadStudioAsset(modelUrl, `${selected.code.toLowerCase()}.glb`).catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Download failed"));
      },
    },
  ];

  return (
    <div role="toolbar" aria-label="Avatar, equipment and settings" className="flex items-center gap-(--studio-space-1)">
      {/* The native select (keyboard, screen readers, the OS list) sits invisible over a face that
          shows the avatar's name, plus its rig and status where the bar has room. */}
      <div
        title={selected ? avatarOptionText(selected) : undefined}
        className="studio-state relative flex h-(--studio-control-md) w-(--studio-avatar-select-w) min-w-0 max-w-(--studio-avatar-select-max) items-center rounded-(--studio-radius-md) border border-(--m3-outline-variant) bg-(--m3-surface-container-high) pl-(--studio-space-3) pr-8 text-(length:--studio-text-xs) text-(--m3-on-surface) has-[select:focus-visible]:border-(--m3-primary) has-[select:focus-visible]:ring-2 has-[select:focus-visible]:ring-(--m3-primary)/70 xl:w-auto"
      >
        <span aria-hidden className="min-w-0 truncate">
          {selected ? selected.name : avatars.length ? "Choose an avatar" : "No avatar"}
          {selected ? <span className="hidden text-(--m3-on-surface-variant) xl:inline">{avatarOptionText(selected).slice(selected.name.length)}</span> : null}
        </span>
        <select
          value={selected?.id ?? ""}
          onChange={(e) => onSelectAvatar(e.target.value)}
          aria-label="Base avatar"
          // Colours still apply to the open list, which the browser draws without the opacity.
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-(--m3-surface-container-high) text-(length:--studio-text-xs) text-(--m3-on-surface) opacity-0 outline-none"
        >
          {!avatars.length ? <option value="">No avatar</option> : null}
          {avatars.map((a) => (
            <option key={a.id} value={a.id} disabled={a.status !== "ready"}>
              {avatarOptionText(a)}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-(--m3-on-surface-variant)" />
      </div>
      <ToolMenu label="Avatar actions" icon={<MoreHorizontal className="h-4 w-4" />} items={avatarItems} />
      <ToolDivider />
      <ToolButton label="Equipment library: 3D models of the catalog equipment" tipAlign="end" text="Equipment" textClassName="hidden min-[1440px]:inline" onClick={onEquipment}>
        <Dumbbell className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="Studio settings: pipeline, defaults, prompt template, storage" tipAlign="end" onClick={onSettings} disabled={!settingsReady}>
        <Settings2 className="h-4 w-4" />
      </ToolButton>
    </div>
  );
}
