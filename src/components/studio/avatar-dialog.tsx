"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import { useToast } from "@/components/ui/toast";
import { explainAvatarError } from "@/lib/studio/avatar-form";
import { readAsDataUrl } from "@/lib/studio/format";
import { MESHY_AVATAR, avatarBuildRequest, shortEstimate } from "@/lib/studio/paid-actions";
import { defaultSockets } from "@/lib/studio/prompt";
import { createAvatar } from "@/lib/studio/studio-api";
import type { AvatarRig, AvatarSubject, BaseAvatar } from "@/lib/studio/types";
import { AVATAR_RIGS, AVATAR_SUBJECTS } from "@/lib/studio/types";
import { AVATAR_SOURCES, AvatarSourceList } from "./avatar-sources";
import { DialogRow, FilePick, rowDescription } from "./dialog-form";
import { useAvatarForm, type ImageChoice } from "./hooks/use-avatar-form";
import { postMannequin } from "./hooks/use-mannequin";
import { usePaidConfirm } from "./studio-confirm";
import { StudioDialog } from "./studio-dialog";
import { M3Button, Segmented, Select, TextInput } from "./ui";

const RIG_LABEL: Record<AvatarRig, string> = { mixamo: "Mixamo skeleton", vrm: "VRM (VRoid, avatar apps)", custom: "Other skeleton" };
const SUBMIT_LABEL = { generate: "Create the mannequin", upload: "Upload avatar", url: "Import avatar", style: `Build with Meshy · ${shortEstimate(MESHY_AVATAR)}` } as const;

/**
 * Register a base avatar: the free in-browser mannequin (the default, first in the list), a rigged
 * model upload, an import from a link, or the paid Meshy build of the catalog's character.
 * Attachment points are not typed here: each rig starts on its default bones, and the rig editor
 * corrects them on the loaded model. Every field is checked while typing with the server's rules;
 * a refusal shows in the dialog's alert line.
 */
export function AvatarDialog({
  hasDefault,
  takenCodes,
  onClose,
  onCreated,
}: {
  hasDefault: boolean;
  /** Codes other avatars already use (a code is unique). */
  takenCodes: readonly string[];
  onClose: () => void;
  onCreated: (avatar: BaseAvatar) => void;
}) {
  const staffFetch = useStaffFetch();
  const toast = useToast();
  const paidConfirm = usePaidConfirm();
  const form = useAvatarForm({ hasDefault, takenCodes });
  const { source, values, set, errors } = form;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const about = AVATAR_SOURCES.find((s) => s.value === source)!;

  const post = async (body: FormData | object): Promise<BaseAvatar> =>
    ((await createAvatar(staffFetch, body)) as { avatar: BaseAvatar }).avatar;

  const submit = async () => {
    setError(null);
    if (form.blocker) {
      form.revealErrors();
      return;
    }
    const fields = { code: values.code.trim(), name: values.name.trim(), subject: values.subject, rig: values.rig, height_m: form.height, sockets: defaultSockets(values.rig), is_default: values.isDefault };
    // The paid build states what it does, its cost and its time first; Cancel sends nothing.
    if (source === "style" && !(await paidConfirm(avatarBuildRequest({ name: fields.name, subject: fields.subject, customImage: form.image?.name ?? null })))) return;
    setBusy(true);
    try {
      let avatar: BaseAvatar;
      if (source === "style") {
        const image_data_url = form.image ? await readAsDataUrl(form.image) : null;
        avatar = await post({ mode: "style", code: fields.code, name: fields.name, subject: fields.subject, height_m: fields.height_m ?? 1.75, is_default: fields.is_default, image_data_url });
        toast.success(`${avatar.name}: Meshy is building it (${MESHY_AVATAR.duration}). Follow it in Jobs; your current avatar stays until you choose the new one.`, "Avatar started");
      } else {
        if (source === "generate") avatar = await postMannequin(staffFetch, fields);
        else if (source === "upload" && form.file) {
          const body = new FormData();
          body.set("file", form.file);
          body.set("fields", JSON.stringify(fields));
          avatar = await post(body);
        } else avatar = await post({ url: form.url.trim(), fields });
        toast.success(`${avatar.name} is ready`, "Avatar added");
      }
      onCreated(avatar);
    } catch (err) {
      setError(explainAvatarError(err instanceof Error ? err.message : "Could not add the avatar."));
    } finally {
      setBusy(false);
    }
  };

  const subjects = AVATAR_SUBJECTS.filter((s) => source !== "style" || s !== "neutral");

  return (
    <StudioDialog
      data-avatar-dialog=""
      title="New base avatar"
      icon={<UserPlus />}
      subtitle="Poses are shown and edited on a base avatar. Choose where it comes from."
      onClose={onClose}
      dirty={form.dirty}
      busy={busy}
      error={error}
      onDismissError={() => setError(null)}
      bodyClassName="p-0"
      footerNote={form.blocker ?? (about.paid ? `Paid: about ${MESHY_AVATAR.credits} Meshy credits. You confirm the cost next.` : source === "generate" ? "Free. Nothing is sent to a paid service." : null)}
      actions={
        <M3Button variant="filled" onClick={() => void submit()} busy={busy} disabled={Boolean(form.blocker)} data-avatar-submit>
          {SUBMIT_LABEL[source]}
        </M3Button>
      }
    >
      <div className="grid min-h-full grid-cols-[232px_minmax(0,1fr)]">
        <div className="border-r border-(--m3-outline-variant) bg-(--m3-surface-container-low) p-3">
          <p className="px-1 pb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-(--m3-on-surface-variant)">Source</p>
          <AvatarSourceList value={source} onChange={form.changeSource} disabled={busy} />
        </div>
        <div className="min-w-0 px-5 py-4">
          <p className="mb-2 text-[13px] leading-relaxed text-(--m3-on-surface-variant)" data-source-about>
            {about.about}
          </p>
          {source === "upload" ? (
            <DialogRow id="avatar-file" label="Model file" hint="A rigged .glb or .gltf, up to 100 MB. The name and code below follow the file name." error={errors.file}>
              <FilePick id="avatar-file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" file={form.file} onPick={form.pickFile} placeholder="No file chosen" describedBy={rowDescription("avatar-file", { hint: true, error: errors.file })} />
            </DialogRow>
          ) : null}
          {source === "url" ? (
            <DialogRow id="avatar-url" label="Model link" hint="An https link to a .glb or .gltf. The name and code below follow the file name in the link." error={errors.url}>
              <TextInput id="avatar-url" type="url" value={form.url} onChange={(e) => form.setUrl(e.target.value)} placeholder="https://models.readyplayer.me/….glb" inputMode="url" spellCheck={false} autoComplete="off" {...rowDescription("avatar-url", { hint: true, error: errors.url })} />
            </DialogRow>
          ) : null}
          {source === "style" ? (
            <DialogRow id="avatar-image" label="Reference image" hint={form.imageChoice === "own" ? "Full body, front view, plain background. PNG, JPEG or WebP, up to 20 MB." : `Meshy builds from the ${values.subject} character image of the default style (Images → Styles).`} error={form.imageChoice === "own" ? errors.image : null}>
              <Segmented
                label="Reference image"
                size="sm"
                value={form.imageChoice}
                onChange={(v: ImageChoice) => form.setImageChoice(v)}
                options={[
                  { value: "own", label: "My image" },
                  { value: "style", label: "The style's image" },
                ]}
                className="mb-2"
              />
              {form.imageChoice === "own" ? (
                <FilePick id="avatar-image" accept="image/png,image/jpeg,image/webp" file={form.image} onPick={form.pickImage} placeholder="No image chosen" buttonLabel="Choose image…" preview describedBy={rowDescription("avatar-image", { hint: true, error: errors.image })} />
              ) : null}
            </DialogRow>
          ) : null}
          <DialogRow id="avatar-name" label="Name" hint="Shown in the avatar menu." error={errors.name}>
            <TextInput id="avatar-name" value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="Neutral man" {...rowDescription("avatar-name", { hint: true, error: errors.name })} />
          </DialogRow>
          <DialogRow id="avatar-code" label="Code" hint="A unique ID in capitals, such as NEUTRAL_MAN." error={errors.code}>
            <TextInput id="avatar-code" value={values.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="NEUTRAL_MAN" spellCheck={false} autoComplete="off" className="font-mono" {...rowDescription("avatar-code", { hint: true, error: errors.code })} />
          </DialogRow>
          <DialogRow id="avatar-subject" label="Subject" group>
            <Segmented label="Subject" value={values.subject} onChange={(v: AvatarSubject) => set("subject", v)} options={subjects.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} />
          </DialogRow>
          <DialogRow
            id="avatar-height"
            label="Height"
            optional={source === "upload" || source === "url"}
            hint={source === "generate" ? "In metres, 0.5 to 2.5. The mannequin is built at this size." : source === "style" ? "In metres, 0.5 to 2.5. Meshy rigs the character at this height." : "In metres, 0.5 to 2.5. Leave empty to keep the model's own size."}
            error={errors.height}
          >
            <div className="flex items-center gap-2">
              <TextInput id="avatar-height" inputMode="decimal" value={values.height} onChange={(e) => set("height", e.target.value)} className="w-28 font-mono tabular-nums" {...rowDescription("avatar-height", { hint: true, error: errors.height })} />
              <span className="text-[13px] text-(--m3-on-surface-variant)">m</span>
            </div>
          </DialogRow>
          {source === "upload" || source === "url" ? (
            <DialogRow id="avatar-rig" label="Skeleton" hint="Sets where the attachment points start; fix them later in the rig editor.">
              <Select id="avatar-rig" value={values.rig} onChange={(e) => set("rig", e.target.value as AvatarRig)} {...rowDescription("avatar-rig", { hint: true })}>
                {AVATAR_RIGS.map((r) => (
                  <option key={r} value={r}>
                    {RIG_LABEL[r]}
                  </option>
                ))}
              </Select>
            </DialogRow>
          ) : null}
          <div className="grid grid-cols-[136px_minmax(0,1fr)] gap-x-4 py-2">
            <span />
            <label className="flex w-fit cursor-pointer items-center gap-2 text-[13px] text-(--m3-on-surface)">
              <input type="checkbox" checked={values.isDefault} onChange={(e) => set("isDefault", e.target.checked)} className="h-4 w-4 accent-(--m3-primary)" />
              Make it the default avatar
            </label>
          </div>
        </div>
      </div>
    </StudioDialog>
  );
}
