"use client";

import { useRef } from "react";
import { AuthedImage } from "@/components/images/authed-image";
import { Button } from "@/components/ui/primitives";
import { INPUT_FIDELITIES, capabilitiesFor } from "@/lib/images/capabilities";
import { referenceSheetDirective } from "@/lib/images/reference";
import type { GenerationParams, ImageStyle, Subject } from "@/lib/images/types";
import { SUBJECTS } from "@/lib/images/types";
import { Chip, Field } from "./form-ui";

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
    <div className="flex overflow-hidden rounded-lg border border-zinc-200">
      <div className="flex w-1/2 aspect-square items-center justify-center bg-zinc-100 p-3">
        {fileId ? (
          <AuthedImage fileId={fileId} alt="Brand logo" className="h-full w-full object-contain" />
        ) : (
          <span className="px-2 text-center text-xs text-zinc-400">No logo</span>
        )}
      </div>
      <div className="flex w-1/2 flex-col justify-between gap-2 p-3">
        <div>
          <div className="text-sm font-medium text-zinc-800">Brand logo</div>
          <p className="mt-1 text-[11px] leading-snug text-zinc-600">
            Sent with every character-reference generation (chest mark).
          </p>
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
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            className="h-8 px-2.5 text-xs"
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "…" : fileId ? "Replace" : "Upload"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy || !fileId}
            className="h-8 px-2.5 text-xs"
            onClick={onRemove}
          >
            Remove
          </Button>
        </div>
      </div>
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
  const sheet = referenceSheetDirective(subject);
  return (
    <div className="flex overflow-hidden rounded-lg border border-zinc-200">
      <div className="flex w-1/2 aspect-square items-center justify-center bg-zinc-100">
        {fileId ? (
          <AuthedImage
            fileId={fileId}
            alt={`${subject} reference`}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="px-2 text-center text-xs text-zinc-400">No reference</span>
        )}
      </div>
      <div className="flex w-1/2 flex-col justify-between gap-2 p-3">
        <div>
          <div className="text-sm font-medium capitalize text-zinc-800">{subject}</div>
          <p className="mt-1 line-clamp-4 text-[11px] leading-snug text-zinc-600" title={sheet}>
            {sheet}
          </p>
          <p className="mt-1 text-[10px] text-zinc-400">Plus this style’s system prompt.</p>
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
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            className="h-8 px-2.5 text-xs"
            onClick={() => inputRef.current?.click()}
          >
            Upload
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            className="h-8 px-2.5 text-xs"
            onClick={() => onAction(subject, "generate")}
          >
            {busy ? "…" : "Generate"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={busy || !fileId}
            className="h-8 px-2.5 text-xs"
            onClick={() => onAction(subject, "remove")}
          >
            Remove
          </Button>
        </div>
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
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Characters</p>
      <div className="grid gap-3 lg:grid-cols-2">
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
            Saved with Save style.
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
    </div>
  );
}
