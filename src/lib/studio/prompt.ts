import type {
  AvatarRig,
  AvatarSocket,
  BaseAvatar,
  EquipmentItem,
  StudioExercise,
} from "./types";

/** Placeholders of animation_studio.settings.prompt_template. */
export type PromptSlots = {
  subject: string;
  exercise_name: string;
  exercise_description: string;
  equipment: string;
  user_prompt: string;
};

export function fillPromptTemplate(template: string, slots: PromptSlots): string {
  return template
    .replace(/\{subject\}/g, slots.subject)
    .replace(/\{exercise_name\}/g, slots.exercise_name)
    .replace(/\{exercise_description\}/g, slots.exercise_description)
    .replace(/\{equipment\}/g, slots.equipment)
    .replace(/\{user_prompt\}/g, slots.user_prompt)
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Human text of the equipment items for the prompt: "2 dumbbells (12 kg), bench". Same codes are merged. */
export function equipmentSentence(items: EquipmentItem[]): string {
  if (!items.length) return "none (bodyweight)";
  const merged = new Map<string, { count: number; weight_kg?: number }>();
  for (const item of items) {
    const entry = merged.get(item.code) ?? { count: 0 };
    entry.count += item.count ?? 1;
    entry.weight_kg = entry.weight_kg ?? item.weight_kg;
    merged.set(item.code, entry);
  }
  return [...merged.entries()]
    .map(([code, { count, weight_kg }]) => {
      const label = code.toLowerCase().replace(/_/g, " ");
      const text = count > 1 ? `${count} ${label}s` : label;
      return weight_kg ? `${text} (${weight_kg} kg)` : text;
    })
    .join(", ");
}

/** Implements held one in each hand. */
export const ONE_PER_HAND = new Set(["DUMBBELL", "KETTLEBELL"]);
/** Implements held with both hands at once: drawn between the two hand sockets. */
export const BILATERAL = new Set(["BARBELL", "EZ_BAR", "PLATE", "LANDMINE", "BAND"]);

/** Equipment items an exercise starts with: its load implement in the hands, its support on the floor. */
export function defaultEquipmentItems(
  exercise: StudioExercise,
  sockets: AvatarSocket[],
): EquipmentItem[] {
  const items: EquipmentItem[] = [];
  const ids = new Set(sockets.map((s) => s.id));
  const load = exercise.equipment?.code;
  if (load && load !== "NONE") {
    const bothHands = ids.has("hand_l") && ids.has("hand_r");
    if (ONE_PER_HAND.has(load) && bothHands) {
      items.push({ kind: "load", code: load, socket: "hand_r", count: 1 });
      items.push({ kind: "load", code: load, socket: "hand_l", count: 1 });
    } else if (BILATERAL.has(load) && bothHands) {
      items.push({ kind: "load", code: load, socket: "hand_r", socket_b: "hand_l", count: 1 });
    } else {
      items.push({
        kind: "load",
        code: load,
        socket: ids.has("hand_r") ? "hand_r" : sockets[0]?.id,
        count: 1,
      });
    }
  }
  if (exercise.support_equipment?.code) {
    items.push({ kind: "support", code: exercise.support_equipment.code });
  }
  return items;
}

/** Sockets a freshly uploaded avatar gets, by rig convention (editable before saving). */
export function defaultSockets(rig: AvatarRig): AvatarSocket[] {
  switch (rig) {
    case "mixamo":
      return [
        { id: "hand_l", bone: "mixamorigLeftHand", offset: [0, 0, 0] },
        { id: "hand_r", bone: "mixamorigRightHand", offset: [0, 0, 0] },
        { id: "back", bone: "mixamorigSpine2", offset: [0, 0, -0.12] },
        { id: "feet", bone: "mixamorigHips", offset: [0, -0.95, 0] },
      ];
    case "vrm":
      return [
        { id: "hand_l", bone: "leftHand", offset: [0, 0, 0] },
        { id: "hand_r", bone: "rightHand", offset: [0, 0, 0] },
        { id: "back", bone: "chest", offset: [0, 0, -0.12] },
        { id: "feet", bone: "hips", offset: [0, -0.95, 0] },
      ];
    default:
      return [];
  }
}

export function avatarLabel(avatar: Pick<BaseAvatar, "name" | "subject" | "rig">): string {
  return `${avatar.name} · ${avatar.subject} · ${avatar.rig}`;
}

/** A SCREAMING_SNAKE code from a file name ("Y Bot.glb" → "Y_BOT"). */
export function codeFromFileName(name: string): string {
  return name
    .replace(/\.(glb|gltf)$/i, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase()
    .replace(/^(\d)/, "M$1");
}
