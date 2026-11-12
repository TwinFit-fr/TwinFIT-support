"use client";

import { useState } from "react";
import { Download, RotateCw, Star, Trash2, Users } from "lucide-react";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { downloadStudioAsset } from "@/lib/studio/asset-auth";
import { MESHY_AVATAR, avatarBuildRequest } from "@/lib/studio/paid-actions";
import { relativeTime } from "@/lib/studio/format";
import { studioAssetUrl } from "@/lib/studio/storage-url";
import type { BaseAvatar } from "@/lib/studio/types";
import { VECTOR_STATUS_LABEL } from "@/lib/studio/types";
import { usePaidConfirm } from "./studio-confirm";
import { StudioDialog } from "./studio-dialog";
import { Chip, IconButton, M3Button, NumberField, StatusDot, TextInput } from "./ui";

function AvatarRow({ avatar, busy, onAction }: { avatar: BaseAvatar; busy: boolean; onAction: (action: "rename" | "height" | "default" | "retry" | "delete" | "download", value?: string | number) => void }) {
  const [name, setName] = useState(avatar.name);
  const building = avatar.status === "pending" || avatar.status === "processing";
  const modelUrl = studioAssetUrl(avatar.file_id, avatar.model_url);
  return (
    <li data-avatar-row={avatar.code} className="space-y-2 rounded-(--studio-radius-lg) border border-(--m3-outline-variant) bg-(--m3-surface-container-low) p-3">
      <div className="flex items-center gap-2">
        <StatusDot status={avatar.status} />
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== avatar.name && onAction("rename", name.trim())}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            // Escape takes back a rename being typed, without closing the dialog.
            if (e.key === "Escape" && name !== avatar.name) {
              e.preventDefault();
              setName(avatar.name);
            }
          }}
          aria-label={`Name of ${avatar.code}`}
          className="h-8 flex-1 px-2.5 py-0 text-sm"
        />
        {avatar.is_default ? (
          <Chip tone="primary" className="h-6">
            <Star aria-hidden className="h-3 w-3" /> Default
          </Chip>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-(--m3-on-surface-variant)">
        <span className="font-mono">{avatar.code}</span>
        <span>{avatar.subject}</span>
        <span>{avatar.rig}</span>
        <span>{avatar.provider}</span>
        <span>{VECTOR_STATUS_LABEL[avatar.status]}</span>
        <span>{relativeTime(avatar.inserted_at)}</span>
        <label className="ml-auto flex items-center gap-1.5" title="Height in metres (scales the model and the equipment)">
          Height
          <NumberField
            decimalPoint
            aria-label={`Height of ${avatar.name} in metres`}
            min={0.5}
            max={2.5}
            step={0.01}
            digits={2}
            value={avatar.height_m ?? 0}
            onCommit={(v) => onAction("height", v)}
            className="h-7 w-[4.5rem] px-2 py-0 text-[12px]"
          />
          m
        </label>
      </div>
      {building ? (
        <div className="flex items-center gap-2 text-[12px] text-(--m3-on-surface-variant)">
          <div
            role="progressbar"
            aria-label={`${avatar.name} build`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={avatar.progress}
            className="h-1 flex-1 overflow-hidden rounded-full bg-(--m3-surface-container-highest)"
          >
            <div className="h-full rounded-full bg-(--m3-primary) motion-safe:transition-[width]" style={{ width: `${Math.max(4, avatar.progress)}%` }} />
          </div>
          <span className="tabular-nums">{avatar.progress}%</span>
        </div>
      ) : null}
      {avatar.status === "error" && avatar.error ? (
        <p className="whitespace-pre-wrap break-words rounded-(--studio-radius-sm) bg-(--m3-error-container)/40 px-2.5 py-1.5 text-[12px] leading-snug text-(--m3-error)">{avatar.error}</p>
      ) : null}
      <div className="flex items-center gap-1">
        {avatar.status === "ready" && !avatar.is_default ? (
          <M3Button size="sm" variant="text" disabled={busy} onClick={() => onAction("default")}>
            <Star className="h-3.5 w-3.5" /> Make default
          </M3Button>
        ) : null}
        {avatar.status === "error" && avatar.provider === "meshy" ? (
          <M3Button size="sm" variant="tonal" disabled={busy} onClick={() => onAction("retry")} title={`Run the Meshy build again from the same reference image (about ${MESHY_AVATAR.credits} credits; asks first)`}>
            <RotateCw className="h-3.5 w-3.5" /> Retry build
          </M3Button>
        ) : null}
        {modelUrl ? (
          <IconButton label={`Download ${avatar.name} (.glb)`} disabled={busy} onClick={() => onAction("download")} className="h-8 w-8">
            <Download className="h-3.5 w-3.5" />
          </IconButton>
        ) : null}
        {!building ? (
          <IconButton label={`Delete ${avatar.name}`} disabled={busy} onClick={() => onAction("delete")} className="ml-auto h-8 w-8">
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
  const paidConfirm = usePaidConfirm();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (avatar: BaseAvatar, action: "rename" | "height" | "default" | "retry" | "delete" | "download", value?: string | number) => {
    if (action === "retry" && !(await paidConfirm(avatarBuildRequest({ name: avatar.name, subject: avatar.subject, retry: true })))) return;
    setBusyId(avatar.id);
    setError(null);
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
        toast.success(`${avatar.name}: Meshy is building it again. Follow it in Jobs.`);
      }
      onChanged();
    } catch (err) {
      setError(`${avatar.name}: ${err instanceof Error ? err.message : "the action failed."}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <StudioDialog
      data-manage-dialog=""
      title="Base avatars"
      icon={<Users />}
      subtitle="Rename, set the height or the default, retry a failed build, download or delete."
      onClose={onClose}
      error={error}
      onDismissError={() => setError(null)}
      cancelLabel="Close"
      footerNote={avatars.length ? `${avatars.length} avatar${avatars.length === 1 ? "" : "s"}. A rename or height is saved when you leave the field.` : null}
    >
      {avatars.length ? (
        <ul className="space-y-2">
          {avatars.map((a) => (
            <AvatarRow key={a.id} avatar={a} busy={busyId === a.id} onAction={(action, value) => void act(a, action, value)} />
          ))}
        </ul>
      ) : (
        <p className="py-8 text-center text-[13px] text-(--m3-on-surface-variant)">No avatar yet. Add one from the avatar menu in the top bar.</p>
      )}
    </StudioDialog>
  );
}
