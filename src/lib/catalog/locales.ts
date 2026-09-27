export const CATALOG_LOCALES = ["en", "es", "fr"] as const;

export type CatalogLocale = (typeof CATALOG_LOCALES)[number];

export type LocalizationRow = {
  locale: string;
  display_name?: string | null;
  description?: string | null;
};

export type LocalizedLookup = {
  code: string;
  name?: string;
  localizations?: LocalizationRow[];
};

export function resolveLocalizedName(
  row: LocalizedLookup | undefined | null,
  locale: CatalogLocale,
): string {
  if (!row) return "";
  const locs = row.localizations ?? [];
  const picked =
    locs.find((l) => l.locale === locale)?.display_name?.trim() ||
    locs.find((l) => l.locale === "en")?.display_name?.trim() ||
    row.name?.trim() ||
    row.code;
  return picked;
}

export function resolveExerciseDisplayName(
  ex: {
    display_name?: string;
    localizations?: LocalizationRow[];
  },
  locale: CatalogLocale,
): string {
  const locs = ex.localizations ?? [];
  const picked =
    locs.find((l) => l.locale === locale)?.display_name?.trim() ||
    locs.find((l) => l.locale === "en")?.display_name?.trim() ||
    ex.display_name?.trim() ||
    "";
  return picked;
}

export function resolveExerciseDescription(
  ex: { localizations?: LocalizationRow[] },
  locale: CatalogLocale,
): string {
  const locs = ex.localizations ?? [];
  return (
    locs.find((l) => l.locale === locale)?.description?.trim() ||
    locs.find((l) => l.locale === "en")?.description?.trim() ||
    ""
  );
}

export function emptyLocaleFields(): Record<
  CatalogLocale,
  { display_name: string; description: string }
> {
  return {
    en: { display_name: "", description: "" },
    es: { display_name: "", description: "" },
    fr: { display_name: "", description: "" },
  };
}

export function emptyLocaleLabels(): Record<CatalogLocale, string> {
  return { en: "", es: "", fr: "" };
}
