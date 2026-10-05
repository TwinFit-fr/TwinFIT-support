"use client";

import { INPUT_FIDELITIES, capabilitiesFor } from "@/lib/images/capabilities";
import { referenceSheetDirective } from "@/lib/images/reference";
import type { GenerationParams, ImageStyle, Subject } from "@/lib/images/types";
import { SUBJECTS } from "@/lib/images/types";
import { AssetCard, AssetNote } from "./asset-card";
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
  return (
    <AssetCard
      fileId={fileId}
      title="Brand logo"
      emptyLabel="No logo"
      busy={busy}
      onUpload={onUpload}
      onRemove={onRemove}
    >
      <AssetNote>Sent with every character-reference generation (chest mark).</AssetNote>
    </AssetCard>
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
  const sheet = referenceSheetDirective(subject);
  return (
    <AssetCard
      fileId={fileId}
      title={subject === "man" ? "Man" : "Woman"}
      emptyLabel="No reference"
      busy={busy}
      onUpload={(file) => onAction(subject, file)}
      onGenerate={() => onAction(subject, "generate")}
      onRemove={() => onAction(subject, "remove")}
    >
      <AssetNote title={sheet}>{sheet}</AssetNote>
      <p className="mt-1 text-[10px] text-zinc-400">Plus this style’s system prompt.</p>
    </AssetCard>
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
