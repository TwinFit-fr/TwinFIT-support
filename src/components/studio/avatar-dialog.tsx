"use client";

import { useState } from "react";
import { Bone, ImagePlus, Link2, Sparkles, Upload, X } from "lucide-react";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { readAsDataUrl } from "@/lib/studio/format";
import { codeFromFileName, defaultSockets } from "@/lib/studio/prompt";
import type { AvatarRig, AvatarSocket, AvatarSubject, BaseAvatar } from "@/lib/studio/types";
import { AVATAR_RIGS, AVATAR_SUBJECTS } from "@/lib/studio/types";
import { MANNEQUIN_DEFAULTS, postMannequin } from "./hooks/use-mannequin";
import { Field, M3Button, Segmented, Select, TextArea, TextInput } from "./ui";

type Mode = "style" | "generate" | "upload" | "url";

/** What the paid Meshy build costs, said on its tab and on its button. */
const STYLE_COST = "about 35 credits, 3–5 min";

// The free, instant mannequin comes first and is the default; the paid build says its cost where it is chosen.
const MODES: { value: Mode; label: React.ReactNode; title: string }[] = [
  { value: "generate", label: "Mannequin · free", title: "Build a mannequin with the Mixamo skeleton right here: free, ready in seconds, no file needed" },
  { value: "upload", label: "Upload", title: "Upload a rigged .glb / .gltf" },
  { value: "url", label: "From URL", title: "Import a .glb from an https URL (Ready Player Me, a CDN…)" },
  {
    value: "style",
    label: (
      <>
        TwinFIT style <span className="font-normal opacity-80">· 35 cr · 3–5 min</span>
      </>
    ),
    title: `Build the catalog's character with Meshy from its reference image, auto-rigged (${STYLE_COST})`,
  },
];

type Fields = {
  code: string;
  name: string;
  subject: AvatarSubject;
  rig: AvatarRig;
  height_m: number | null;
  sockets: AvatarSocket[];
  is_default: boolean;
  params?: Record<string, unknown>;
};

type StyleBody = { mode: "style"; code: string; name: string; subject: "man" | "woman"; height_m: number; is_default: boolean; image_data_url?: string | null };

/**
 * Register a base avatar: the free in-browser mannequin (the default), a rigged model upload, an
 * import from a URL, or the paid Meshy build of the catalog's character.
 */
export function AvatarDialog({
  hasDefault,
  onClose,
  onCreated,
}: {
  hasDefault: boolean;
  onClose: () => void;
  onCreated: (avatar: BaseAvatar) => void;
}) {
  const staffFetch = useStaffFetch();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("generate");
  /** POST /api/studio/avatars: multipart (file + fields), `{url, fields}` or the style body; a 502 carries the provider's message. */
  const postAvatar = async (body: FormData | { url: string; fields: Fields } | StyleBody): Promise<BaseAvatar> => {
    const json = (await staffFetch("/api/studio/avatars", { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body) })) as { avatar: BaseAvatar };
    return json.avatar;
  };
  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [code, setCode] = useState(MANNEQUIN_DEFAULTS.code);
  const [name, setName] = useState(MANNEQUIN_DEFAULTS.name);
  const [subject, setSubject] = useState<AvatarSubject>(MANNEQUIN_DEFAULTS.subject);
  const [rig, setRig] = useState<AvatarRig>("mixamo");
  const [height, setHeight] = useState("1.75");
  const [socketsText, setSocketsText] = useState(() => JSON.stringify(defaultSockets("mixamo"), null, 2));
  const [isDefault, setIsDefault] = useState(!hasDefault);
  const [busy, setBusy] = useState(false);

  const changeMode = (next: Mode) => {
    setMode(next);
    if (next === "generate") {
      setCode(MANNEQUIN_DEFAULTS.code);
      setName(MANNEQUIN_DEFAULTS.name);
      setSubject(MANNEQUIN_DEFAULTS.subject);
      setRig("mixamo");
      setSocketsText(JSON.stringify(defaultSockets("mixamo"), null, 2));
    } else if (next === "style") {
      const s = subject === "woman" ? "woman" : "man";
      setSubject(s);
      setCode(`TWINFIT_${s.toUpperCase()}`);
      setName(`TwinFIT ${s}`);
    } else if (code === MANNEQUIN_DEFAULTS.code || code.startsWith("TWINFIT_")) {
      setCode("");
      setName("");
    }
  };
  const changeSubject = (next: AvatarSubject) => {
    setSubject(next);
    if (mode === "style" && next !== "neutral") {
      setCode(`TWINFIT_${next.toUpperCase()}`);
      setName(`TwinFIT ${next}`);
    }
  };

  const pickFile = (next: File | null) => {
    setFile(next);
    if (next && !code) setCode(codeFromFileName(next.name));
    if (next && !name) setName(next.name.replace(/\.(glb|gltf)$/i, ""));
  };

  const changeRig = (next: AvatarRig) => {
    setRig(next);
    setSocketsText(JSON.stringify(defaultSockets(next), null, 2));
  };

  const readFields = (): Fields | null => {
    try {
      const sockets = JSON.parse(socketsText || "[]") as AvatarSocket[];
      if (!Array.isArray(sockets)) throw new Error("sockets must be a JSON array");
      return {
        code: code.trim(),
        name: name.trim(),
        subject,
        rig,
        height_m: height.trim() ? Number(height) : null,
        sockets,
        is_default: isDefault,
      };
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid sockets JSON");
      return null;
    }
  };

  const submit = async () => {
    const fields = readFields();
    if (!fields) return;
    setBusy(true);
    try {
      let avatar: BaseAvatar;
      if (mode === "style") {
        if (subject === "neutral") throw new Error("Pick man or woman: the style has a character for each");
        const image_data_url = image ? await readAsDataUrl(image) : null;
        avatar = await postAvatar({
          mode: "style",
          code: fields.code,
          name: fields.name,
          subject,
          height_m: fields.height_m ?? 1.75,
          is_default: isDefault,
          image_data_url,
        });
        toast.success(`${avatar.name}: Meshy is building it (about 3–5 minutes). It appears in the avatar menu when ready.`, "Avatar started");
        onCreated(avatar);
        return;
      }
      if (mode === "generate") {
        avatar = await postMannequin(staffFetch, fields);
      } else if (mode === "upload") {
        if (!file) return;
        const form = new FormData();
        form.set("file", file);
        form.set("fields", JSON.stringify(fields));
        avatar = await postAvatar(form);
      } else {
        avatar = await postAvatar({ url: url.trim(), fields });
      }
      toast.success(`${avatar.name} is ready`, "Avatar added");
      onCreated(avatar);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the avatar");
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    Boolean(code.trim() && name.trim()) &&
    (mode === "generate" ||
      (mode === "style" && subject !== "neutral") ||
      (mode === "upload" && Boolean(file)) ||
      (mode === "url" && /^https:\/\/\S+/.test(url.trim())));

  return (
    <Modal
      onClose={onClose}
      labelledBy="avatar-dialog-title"
      dismissible={!busy}
      className="studio-root w-[580px] max-w-[calc(100vw-2rem)] rounded-3xl border border-(--m3-outline-variant) bg-(--m3-surface-container) p-0 text-(--m3-on-surface) shadow-2xl backdrop:bg-(--m3-scrim)"
    >
      <div className="flex items-center justify-between border-b border-(--m3-outline-variant) px-5 py-4">
        <h2 id="avatar-dialog-title" className="text-base font-semibold tracking-tight">
          New base avatar
        </h2>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Close"
          className="studio-state flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-(--m3-on-surface-variant)"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="studio-scroll max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
        <Segmented value={mode} onChange={changeMode} options={MODES} className="w-full justify-between" />

        {mode === "style" ? (
          <div className="space-y-3 rounded-2xl border border-(--m3-outline-variant) bg-(--m3-surface-container-low) px-4 py-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-(--m3-primary-container) text-(--m3-on-primary-container)">
                <Sparkles className="h-4 w-4" />
              </span>
              <p className="text-xs leading-relaxed text-(--m3-on-surface-variant)">
                Takes the character reference image of the default style (Images → Styles) for the subject, asks Meshy for the model in a
                T-pose with PBR textures, auto-rigs it and stores the rigged <code className="font-mono">.glb</code>. Sockets land on the
                rig&apos;s own hand, back and hip bones. About 35 credits; 3 to 5 minutes. The avatar shows as “building” in the menu meanwhile.
              </p>
            </div>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-(--m3-outline) px-3 py-2 text-xs transition-colors hover:border-(--m3-primary)">
              <ImagePlus className="h-4 w-4 shrink-0 text-(--m3-primary)" />
              <span className="min-w-0 flex-1 truncate text-(--m3-on-surface-variant)">
                {image ? image.name : "Optional: another reference image instead of the style's (full body, plain background)"}
              </span>
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
            </label>
          </div>
        ) : null}

        {mode === "generate" ? (
          <div className="flex items-start gap-3 rounded-2xl border border-(--m3-outline-variant) bg-(--m3-surface-container-low) px-4 py-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-(--m3-primary-container) text-(--m3-on-primary-container)">
              <Bone className="h-4 w-4" />
            </span>
            <p className="text-xs leading-relaxed text-(--m3-on-surface-variant)">
              <strong className="font-medium text-(--m3-on-surface)">Free, ready in a few seconds.</strong> Builds a neutral mannequin right here: the Mixamo skeleton (<code className="font-mono">mixamorigHips</code>,
              arms, legs, head) in T-pose, capsule limbs, sockets on the hands, back and feet. No file, no licence; any
              clip authored for Mixamo drives it. Scaled to the height below.
            </p>
          </div>
        ) : null}

        {mode === "upload" ? (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-(--m3-outline) bg-(--m3-surface-container-low) px-4 py-6 text-center transition-colors hover:border-(--m3-primary)">
            <Upload className="h-5 w-5 text-(--m3-primary)" />
            <span className="text-sm">{file ? file.name : "Choose a rigged .glb or .gltf"}</span>
            <span className="text-[11px] text-(--m3-on-surface-variant)">
              {file ? `${(file.size / 1024 / 1024).toFixed(1)} MiB` : "Up to 100 MiB · Mixamo, VRM or a custom skeleton"}
            </span>
            <input
              type="file"
              accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </label>
        ) : null}

        {mode === "url" ? (
          <Field label="Model URL" hint="https link to a .glb or .gltf; the server downloads it into the 3d-workspace bucket.">
            <div className="relative">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--m3-on-surface-variant)" />
              <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://models.readyplayer.me/….glb" className="pl-10" />
            </div>
          </Field>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Code" hint="SCREAMING_SNAKE, unique">
            <TextInput value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="NEUTRAL_MAN" />
          </Field>
          <Field label="Name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Neutral man" />
          </Field>
          <Field label="Subject" group>
            <Segmented
              value={subject}
              onChange={changeSubject}
              options={AVATAR_SUBJECTS.filter((s) => mode !== "style" || s !== "neutral").map((s) => ({ value: s, label: s }))}
              className="w-full justify-between"
            />
          </Field>
          <Field label="Height (m)" hint={mode === "generate" ? "Size of the mannequin" : mode === "style" ? "Height Meshy rigs the character at" : "Scales the model; empty keeps its own units"}>
            <TextInput type="number" min={0.5} max={2.5} step={0.01} value={height} onChange={(e) => setHeight(e.target.value)} />
          </Field>
          {mode !== "generate" && mode !== "style" ? (
            <>
              <Field label="Rig" className="col-span-2">
                <Select value={rig} onChange={(e) => changeRig(e.target.value as AvatarRig)}>
                  {AVATAR_RIGS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Sockets"
                className="col-span-2"
                hint="JSON array of {id, bone, offset?, rotation?}; the bone names must exist in the model."
              >
                <TextArea rows={6} value={socketsText} onChange={(e) => setSocketsText(e.target.value)} className="font-mono text-[11px]" />
              </Field>
            </>
          ) : null}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-(--m3-on-surface-variant)">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="h-4 w-4 accent-(--m3-primary)" />
          Make it the default avatar
        </label>
      </div>
      <div className="flex justify-end gap-2 border-t border-(--m3-outline-variant) px-5 py-4">
        <M3Button variant="text" onClick={onClose} disabled={busy}>
          Cancel
        </M3Button>
        <M3Button variant="filled" onClick={submit} busy={busy} disabled={!canSubmit}>
          {mode === "style" ? `Build with Meshy (${STYLE_COST})` : mode === "generate" ? "Create the mannequin" : mode === "upload" ? "Upload avatar" : "Import avatar"}
        </M3Button>
      </div>
    </Modal>
  );
}
