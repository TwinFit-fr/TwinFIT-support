"use client";

import { useMemo, useState } from "react";
import { avatarFormBlocker, freeCode, identityFromModel, parseHeight, validateAvatarForm, type AvatarFormErrors, type AvatarFormField } from "@/lib/studio/avatar-form";
import { isFormDirty, refillUntouched } from "@/lib/studio/form-dirty";
import type { AvatarRig, AvatarSubject } from "@/lib/studio/types";
import type { AvatarSource } from "../avatar-sources";
import { MANNEQUIN_DEFAULTS } from "./use-mannequin";

/** The paid build's reference: an image staff choose, or the default style's character image. */
export type ImageChoice = "own" | "style";

export type AvatarFormValues = { code: string; name: string; subject: AvatarSubject; rig: AvatarRig; height: string; isDefault: boolean };

/** What a source fills in by itself (a code no other avatar uses). */
function sourceDefaults(source: AvatarSource, subject: AvatarSubject, taken: readonly string[]): Partial<AvatarFormValues> {
  if (source === "generate") return { code: freeCode(MANNEQUIN_DEFAULTS.code, taken), name: MANNEQUIN_DEFAULTS.name, subject: "neutral", rig: "mixamo" };
  if (source === "style") {
    const s = subject === "woman" ? "woman" : "man";
    return { code: freeCode(`TWINFIT_${s.toUpperCase()}`, taken), name: `TwinFIT ${s}`, subject: s, rig: "mixamo" };
  }
  return { code: "", name: "" };
}

/**
 * The add-avatar form: its values, what it filled in by itself (the baseline, so a source switch
 * never overwrites what was typed), the inline checks shown once a field is touched (all of them
 * after a submit attempt) and whether closing would lose work.
 */
export function useAvatarForm({ hasDefault, takenCodes }: { hasDefault: boolean; takenCodes: readonly string[] }) {
  const [source, setSource] = useState<AvatarSource>("generate");
  const [initial] = useState<AvatarFormValues>(() => ({
    ...(sourceDefaults("generate", "neutral", takenCodes) as Pick<AvatarFormValues, "code" | "name" | "subject" | "rig">),
    height: String(MANNEQUIN_DEFAULTS.height_m),
    isDefault: !hasDefault,
  }));
  const [values, setValues] = useState<AvatarFormValues>(initial);
  const [baseline, setBaseline] = useState<AvatarFormValues>(initial);
  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [url, setUrlText] = useState("");
  const [imageChoice, setImageChoice] = useState<ImageChoice>("own");
  const [touched, setTouched] = useState<Set<AvatarFormField>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const refill = (next: Partial<AvatarFormValues>, from = values) => {
    const r = refillUntouched(from, baseline, next);
    setValues(r.values);
    setBaseline(r.baseline);
  };

  const set = <K extends keyof AvatarFormValues>(key: K, value: AvatarFormValues[K]) => {
    const next = { ...values, [key]: value };
    if (key === "code" || key === "name" || key === "height") setTouched((t) => new Set(t).add(key as AvatarFormField));
    // The paid build names its character after the subject: an untouched code and name follow it.
    if (key === "subject" && source === "style") return refill(sourceDefaults("style", value as AvatarSubject, takenCodes), next);
    setValues(next);
  };

  const changeSource = (next: AvatarSource) => {
    if (next === source) return;
    setSource(next);
    setShowAll(false);
    refill(sourceDefaults(next, values.subject, takenCodes));
  };

  const touch = (field: AvatarFormField) => setTouched((t) => (t.has(field) ? t : new Set(t).add(field)));

  /** A chosen file or a typed link names the avatar: an untouched name and code follow it. */
  const followModel = (nameOrUrl: string) => {
    const identity = identityFromModel(nameOrUrl, takenCodes);
    if (identity) refill(identity);
  };

  const pickFile = (next: File | null) => {
    setFile(next);
    touch("file");
    if (next) followModel(next.name);
  };

  const setUrl = (next: string) => {
    setUrlText(next);
    if (next.trim()) touch("url");
    followModel(next);
  };

  const pickImage = (next: File | null) => {
    setImage(next);
    touch("image");
  };

  const allErrors: AvatarFormErrors = useMemo(
    () =>
      validateAvatarForm({
        code: values.code,
        name: values.name,
        height: values.height,
        heightOptional: source === "upload" || source === "url",
        takenCodes,
        fileBytes: source === "upload" ? (file?.size ?? null) : null,
        fileRequired: source === "upload",
        url: source === "url" ? url : undefined,
        imageBytes: source === "style" && imageChoice === "own" ? (image?.size ?? null) : null,
        imageRequired: source === "style" && imageChoice === "own",
      }),
    [values.code, values.name, values.height, source, takenCodes, file, url, image, imageChoice],
  );
  const errors: AvatarFormErrors = Object.fromEntries(Object.entries(allErrors).filter(([k]) => showAll || touched.has(k as AvatarFormField)));

  /** Why the main action is disabled, in words, or null when the form can be sent. */
  const blocker = avatarFormBlocker(allErrors);

  const dirty = isFormDirty(baseline, values) || Boolean(file) || Boolean(image) || Boolean(url.trim());
  const height = parseHeight(values.height);

  return {
    source,
    changeSource,
    values,
    set,
    file,
    pickFile,
    image: imageChoice === "own" ? image : null,
    pickImage,
    imageChoice,
    setImageChoice,
    url,
    setUrl,
    errors,
    blocker,
    dirty,
    height: Number.isNaN(height) ? null : height,
    revealErrors: () => setShowAll(true),
  };
}
