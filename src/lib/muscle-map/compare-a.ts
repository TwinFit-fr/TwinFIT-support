/**
 * Option A (generated maps, schema `images`) as the app picks it today, only to compare it with
 * B on the prototype page: the default style's active map of the exercise's target muscle, else
 * of its group, else of its region, each at that entity's card view and crop.
 */

export type MapChoices = {
  id: string;
  code: string;
  map_views: string[];
  map_crops: string[];
  map_view: string | null;
  map_crop: string | null;
};

export type ChoiceRegion = MapChoices;
export type ChoiceGroup = MapChoices & {
  body_region_id: string;
  group_muscles: Array<{ role: string; muscle: { id: string } }>;
};
export type ChoiceMuscle = MapChoices;

/** An active map of the default style; exactly one target id is set. */
export type MapA = {
  muscle_id: string | null;
  muscle_group_id: string | null;
  body_region_id: string | null;
  view: string;
  crop: string;
  image_url: string;
};

export type ComparisonA = {
  regions: ChoiceRegion[];
  groups: ChoiceGroup[];
  muscles: ChoiceMuscle[];
  maps: MapA[];
};

export type PickedA = {
  level: "muscle" | "group" | "region";
  code: string;
  view: string;
  crop: string;
  image_url: string;
};

type Card = { view: string | null; crop: string | null };

/** The card choice, moved to the first allowed value when it isn't one of the entity's. */
function allowed(entity: MapChoices, card: Card): { view: string; crop: string } {
  const view = card.view && entity.map_views.includes(card.view) ? card.view : entity.map_views[0];
  const crop = card.crop && entity.map_crops.includes(card.crop) ? card.crop : entity.map_crops[0];
  return { view, crop };
}

/**
 * The A map of an exercise: target muscle (override, else its target group's card), then the
 * group (override, else its region's card), then the region. Null when none of them has a map.
 */
export function pickMapA(
  data: ComparisonA,
  exercise: { primary_muscle_group_id: string; target_muscle_id: string | null },
): PickedA | null {
  const group = data.groups.find((g) => g.id === exercise.primary_muscle_group_id);
  const regionOf = (g: ChoiceGroup | undefined) => data.regions.find((r) => r.id === g?.body_region_id);
  const groupCard = (g: ChoiceGroup | undefined): Card => {
    const region = regionOf(g);
    return {
      view: g?.map_view ?? region?.map_view ?? null,
      crop: g?.map_crop ?? region?.map_crop ?? null,
    };
  };
  const find = (key: keyof Pick<MapA, "muscle_id" | "muscle_group_id" | "body_region_id">, id: string, slot: { view: string; crop: string }) =>
    data.maps.find((m) => m[key] === id && m.view === slot.view && m.crop === slot.crop);

  const muscle = data.muscles.find((m) => m.id === exercise.target_muscle_id);
  if (muscle) {
    const targetGroup =
      data.groups.find((g) =>
        g.group_muscles.some((gm) => gm.role === "target" && gm.muscle.id === muscle.id),
      ) ?? group;
    const inherited = groupCard(targetGroup);
    const slot = allowed(muscle, {
      view: muscle.map_view ?? inherited.view,
      crop: muscle.map_crop ?? inherited.crop,
    });
    const map = find("muscle_id", muscle.id, slot);
    if (map) return { level: "muscle", code: muscle.code, ...slot, image_url: map.image_url };
  }
  if (group) {
    const slot = allowed(group, groupCard(group));
    const map = find("muscle_group_id", group.id, slot);
    if (map) return { level: "group", code: group.code, ...slot, image_url: map.image_url };
  }
  const region = regionOf(group);
  if (region) {
    const slot = allowed(region, { view: region.map_view, crop: region.map_crop });
    const map = find("body_region_id", region.id, slot);
    if (map) return { level: "region", code: region.code, ...slot, image_url: map.image_url };
  }
  return null;
}
