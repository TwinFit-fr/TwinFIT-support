"use client";

import { useState } from "react";
import { Download, RotateCw, Star, Trash2, Users, X } from "lucide-react";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import { Modal } from "@/components/ui/modal";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { downloadStudioAsset } from "@/lib/studio/asset-auth";
import { relativeTime } from "@/lib/studio/format";
import { studioAssetUrl } from "@/lib/studio/storage-url";
import type { BaseAvatar } from "@/lib/studio/types";
import { VECTOR_STATUS_LABEL } from "@/lib/studio/types";
import { Chip, IconButton, M3Button, NumberField, StatusDot, TextInput } from "./ui";

function AvatarRow({ avatar, busy, onAction }: { avatar: BaseAvatar; busy: boolean; onAction: (action: "rename" | "height" | "default" | "retry" | "delete" | "download", value?: string | number) => void }) {
  const [name, setName] = useState(avatar.name);
  const building = avatar.status === "pending" || avatar.status === "processing";
  const modelUrl = studioAssetUrl(avatar.file_id, avatar.model_url);
  return (
    <li className="space-y-2 rounded-2xl border border-(--m3-outline-variant) bg-(--m3-surface-container-low) p-3">
      <div className="flex items-center gap-2">
        <StatusDot status={avatar.status} />
        <TextInput value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name.trim() !== avatar.name && onAction("rename", name.trim())} aria-label={`Name of ${avatar.code}`} className="h-8 flex-1 px-2.5 py-0 text-sm" />
        {avatar.is_default ? (
          <Chip tone="primary" className="h-6">
            <Star className="h-3 w-3" /> default
          </Chip>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-(--m3-on-surface-variant)">
        <span className="font-mono">{avatar.code}</span>
        <span>{avatar.subject}</span>
        <span>{avatar.rig}</span>
        <span>{avatar.provider}</span>
        <span>
          {VECTOR_STATUS_LABEL[avatar.status]}
          {building ? ` ${avatar.progress}%` : ""}
        </span>
        <span>{relativeTime(avatar.inserted_at)}</span>
        <label className="ml-auto flex items-center gap-1" title="Height in metres (scales the model and the equipment)">
          height
          <NumberField
            aria-label={`Height of ${avatar.name} in metres`}
            min={0.5}
            max={2.5}
            step={0.01}
            digits={2}
            value={avatar.height_m ?? 0}
            onCommit={(v) => onAction("height", v)}
            className="h-6 w-16 px-1.5 py-0 text-[11px]"
          />
          m
        </label>
      </div>
      {avatar.status === "error" ? <p className="text-[11px] text-(--m3-error)">{avatar.error}</p> : null}
      <div className="flex items-center gap-1">
        {avatar.status === "ready" && !avatar.is_default ? (
          <M3Button size="sm" variant="text" disabled={busy} onClick={() => onAction("default")}>
            <Star className="h-3.5 w-3.5" /> Make default
          </M3Button>
        ) : null}
        {avatar.status === "error" && avatar.provider === "meshy" ? (
          <M3Button size="sm" variant="tonal" disabled={busy} onClick={() => onAction("retry")} title="Run the Meshy build again from the same reference image (about 35 credits)">
            <RotateCw className="h-3.5 w-3.5" /> Retry build
          </M3Button>
        ) : null}
        {modelUrl ? (
          <IconButton label="Download the .glb (use it as the custom character of a capture tool)" disabled={busy} onClick={() => onAction("download")} className="h-8 w-8">
            <Download className="h-3.5 w-3.5" />
          </IconButton>
        ) : null}
        {!building ? (
          <IconButton label="Delete this avatar (refused while clips are authored for it)" disabled={busy} onClick={() => onAction("delete")} className="ml-auto h-8 w-8">
            <Trash2 className="h-3.5 w-3.5" />
          </IconButton>
        ) : null}
      </div>
    </li>
  );
}

/** Every base avatar: rename, height, default, retry a failed build, download, delete. */
export function AvatarManageDialog({ avatars, onClose, onChanged }: { avatars: BaseAvatar[]; onClose: () => void; onChanged: () => void }) {
  const staffFetch = useStaffFetch();
  const toast = useToast();
  const confirm = useConfirm();
  const [busyId, setBusyId] = useState<string | null>(null);

  const act = async (avatar: BaseAvatar, action: "rename" | "height" | "default" | "retry" | "delete" | "download", value?: string | number) => {
    setBusyId(avatar.id);
    try {
      if (action === "download") {
        const url = studioAssetUrl(avatar.file_id, avatar.model_url);
        if (url) await downloadStudioAsset(url, `${avatar.code.toLowerCase()}.glb`);
        return;
      }
      if (action === "delete") {
        const ok = await confirm({
          title: `Delete ${avatar.name}?`,
          description: "The avatar and its .glb are removed. Refused while movement clips are authored for it.",
          confirmLabel: "Delete",
          variant: "danger",
        });
        if (!ok) return;
        await staffFetch(`/api/studio/avatars/${avatar.id}`, { method: "DELETE" });
        toast.success(`${avatar.name} deleted`);
      } else if (action === "rename") {
        await staffFetch(`/api/studio/avatars/${avatar.id}`, { method: "PATCH", body: JSON.stringify({ name: value }) });
      } else if (action === "height") {
        await staffFetch(`/api/studio/avatars/${avatar.id}`, { method: "PATCH", body: JSON.stringify({ height_m: value }) });
      } else if (action === "default") {
        await staffFetch(`/api/studio/avatars/${avatar.id}`, { method: "PATCH", body: JSON.stringify({ action: "set_default" }) });
        toast.success(`${avatar.name} is the default avatar`);
      } else if (action === "retry") {
        await staffFetch(`/api/studio/avatars/${avatar.id}`, { method: "PATCH", body: JSON.stringify({ action: "retry" }) });
        toast.success(`${avatar.name}: Meshy is building it again`);
      }
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The action failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal
      onClose={onClose}
      labelledBy="avatar-manage-title"
      className="studio-root w-[640px] max-w-[calc(100vw-2rem)] rounded-3xl border border-(--m3-outline-variant) bg-(--m3-surface-container) p-0 text-(--m3-on-surface) shadow-2xl backdrop:bg-(--m3-scrim)"
    >
      <div className="flex items-center justify-between border-b border-(--m3-outline-variant) px-5 py-4">
        <h2 id="avatar-manage-title" className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <Users className="h-4 w-4 text-(--m3-primary)" /> Base avatars
        </h2>
        <button type="button" onClick={onClose} aria-label="Close" className="studio-state flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-(--m3-on-surface-variant)">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="studio-scroll max-h-[70vh] overflow-y-auto px-5 py-4">
        {avatars.length ? (
          <ul className="space-y-2">
            {avatars.map((a) => (
              <AvatarRow key={a.id} avatar={a} busy={busyId === a.id} onAction={(action, value) => void act(a, action, value)} />
            ))}
          </ul>
        ) : (
          <p className="py-8 text-center text-xs text-(--m3-on-surface-variant)">No avatar yet. Add one from the top bar.</p>
        )}
      </div>
    </Modal>
  );
}
