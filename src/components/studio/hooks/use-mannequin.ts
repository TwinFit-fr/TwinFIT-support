"use client";

import { useCallback, useState } from "react";
import { useStaffFetch } from "@/hooks/use-staff-fetch";
import { useToast } from "@/components/ui/toast";
import { createAvatar } from "@/lib/studio/studio-api";
import type { AvatarSubject, BaseAvatar } from "@/lib/studio/types";

export type MannequinFields = { code: string; name: string; subject: AvatarSubject; height_m: number | null; is_default: boolean };

/** What the one-click mannequin is registered as (the same defaults as the dialog's Mannequin tab). */
export const MANNEQUIN_DEFAULTS = { code: "MANNEQUIN_MIXAMO", name: "Mannequin (Mixamo rig)", subject: "neutral" as AvatarSubject, height_m: 1.75 };

/**
 * Builds the free mannequin in the browser (Mixamo skeleton, capsule limbs, three.js loaded only
 * now) and registers it as a base avatar. No provider is called: it is instant and costs nothing.
 */
export async function postMannequin(staffFetch: ReturnType<typeof useStaffFetch>, fields: MannequinFields): Promise<BaseAvatar> {
  const { exportMannequinGlb, mannequinSockets } = await import("@/lib/studio/mannequin");
  const heightM = fields.height_m ?? MANNEQUIN_DEFAULTS.height_m;
  const glb = await exportMannequinGlb(heightM);
  const form = new FormData();
  form.set("file", glb);
  form.set(
    "fields",
    JSON.stringify({
      ...fields,
      rig: "mixamo",
      height_m: heightM,
      sockets: mannequinSockets(heightM),
      provider: "mannequin",
      params: { generated: "mannequin", forward_axis: "+z", rest_pose: "T" },
    }),
  );
  const json = (await createAvatar(staffFetch, form)) as { avatar: BaseAvatar };
  return json.avatar;
}

/** The first-run button: one click makes the mannequin with the defaults and hands it over. */
export function useOneClickMannequin(input: { hasDefault: boolean; onCreated: (avatar: BaseAvatar) => void }) {
  const { hasDefault, onCreated } = input;
  const staffFetch = useStaffFetch();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const create = useCallback(async () => {
    setBusy(true);
    try {
      const avatar = await postMannequin(staffFetch, { ...MANNEQUIN_DEFAULTS, is_default: !hasDefault });
      toast.success(`${avatar.name} is ready`, "Avatar added");
      onCreated(avatar);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the mannequin", "Mannequin");
    } finally {
      setBusy(false);
    }
  }, [staffFetch, toast, hasDefault, onCreated]);
  return { create, busy };
}
