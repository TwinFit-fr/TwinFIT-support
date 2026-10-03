"use client";

import { useRef } from "react";
import { AuthedImage } from "@/components/images/authed-image";
import { Button } from "@/components/ui/primitives";
import { INPUT_FIDELITIES, capabilitiesFor } from "@/lib/images/capabilities";
import type { GenerationParams, ImageStyle, Subject } from "@/lib/images/types";
import { SUBJECTS } from "@/lib/images/types";
import { Chip, Field, Section } from "./form-ui";

function LogoCard({
  fileId,
  busy,
  onUpload,
  onRemove,
}: {
  fileId: string | null | undefined;
  busy: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2 rounded-lg border border-zinc-200 p-3">
      <div className="text-sm font-medium text-zinc-800">Brand logo</div>
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-zinc-100 p-4">
        {fileId ? (
          <AuthedImage fileId={fileId} alt="Brand logo" className="h-full w-full object-contain" />
        ) : (
          <span className="px-4 text-center text-xs text-zinc-400">
            No logo — references are generated from the prompt only.
          </span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/webp,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onUpload(file);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Uploading…" : fileId ? "Replace" : "Upload"}
        </Button>
        <Button type="button" variant="ghost" disabled={busy || !fileId} onClick={onRemove}>
          Remove
        </Button>
      </div>
      <p className="text-[11px] text-zinc-500">
        Sent with every reference generation. Replacing keeps the previous file in storage.
      </p>
    </div>
  );
}

function ReferenceCard({
  subject,
  fileId,
  busy,
  onAction,
}: {
  subject: Subject;
  fileId: string | null;
  busy: boolean;
  onAction: (subject: Subject, action: "generate" | "remove" | File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2 rounded-lg border border-zinc-200 p-3">
      <div className="text-sm font-medium capitalize text-zinc-800">{subject}</div>
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-zinc-100">
        {fileId ? (
          <AuthedImage
            fileId={fileId}
            alt={`${subject} reference`}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="px-4 text-center text-xs text-zinc-400">
            No reference — generations for this subject use the prompt only.
          </span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/webp,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onAction(subject, file);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          Upload
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => onAction(subject, "generate")}
        >
          {busy ? "Working…" : "Generate"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy || !fileId}
          onClick={() => onAction(subject, "remove")}
        >
          Remove
        </Button>
      </div>
    </div>
  );
}

export function CharactersSection({
  style,
  params,
  logoInExercises,
  dirty,
  characterBusy,
  logoBusy,
  onLogoInExercisesChange,
  onInputFidelityChange,
  onCharacterAction,
  onLogoUpload,
  onLogoRemove,
}: {
  style: ImageStyle;
  params: GenerationParams;
  logoInExercises: boolean;
  dirty: boolean;
  characterBusy: Subject | null;
  logoBusy: boolean;
  onLogoInExercisesChange: (value: boolean) => void;
  onInputFidelityChange: (value: string) => void;
  onCharacterAction: (subject: Subject, action: "generate" | "remove" | File) => void;
  onLogoUpload: (file: File) => void;
  onLogoRemove: () => void;
}) {
  const caps = capabilitiesFor(params.model);
  const fileFor = (subject: Subject) =>
    style.characters.find((c) => c.subject === subject)?.file_id ?? null;

  return (
    <Section
      title="Character references"
      description="One reference per subject for this style. When present, every generation for that subject starts from it so the same character appears across the catalog. Upload, Generate and Remove apply immediately."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:max-w-4xl lg:grid-cols-3">
        {SUBJECTS.map((subject) => (
          <ReferenceCard
            key={subject}
            subject={subject}
            fileId={fileFor(subject)}
            busy={characterBusy === subject}
            onAction={(s, a) => {
              if (a === "generate" && dirty) {
                if (
                  !window.confirm(
                    `Generate a new ${s} reference with OpenAI?\n\nUnsaved changes are ignored: the saved style is used.`,
                  )
                ) {
                  return;
                }
              }
              onCharacterAction(s, a);
            }}
          />
        ))}
        <LogoCard
          fileId={style.logo_file_id}
          busy={logoBusy}
          onUpload={onLogoUpload}
          onRemove={onLogoRemove}
        />
      </div>
      <label className="flex items-start gap-2 text-xs text-zinc-700">
        <input
          type="checkbox"
          checked={logoInExercises}
          disabled={!style.logo_file_id}
          onChange={(e) => onLogoInExercisesChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-zinc-300"
        />
        <span>
          Also send the logo when generating exercises
          <span className="block text-[11px] text-zinc-500">
            Usually not needed: exercises copy the character (and its logo) from the reference.
            Enable it if the chest logo comes out distorted. Saved with Save.
          </span>
        </span>
      </label>
      <Field
        label="Reference fidelity"
        hint="High keeps face and features closer to the reference; lower it if poses copy the reference too much."
      >
        {INPUT_FIDELITIES.map((fidelity) => (
          <Chip
            key={fidelity.id}
            selected={params.input_fidelity === fidelity.id}
            disabled={!caps.inputFidelity}
            title={caps.inputFidelity ? undefined : `${params.model} ignores fidelity`}
            onClick={() => onInputFidelityChange(fidelity.id)}
          >
            {fidelity.label}
          </Chip>
        ))}
      </Field>
    </Section>
  );
}
