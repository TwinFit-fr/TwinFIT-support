# Changelog

All notable changes to TwinFIT-support are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions: [SemVer](https://semver.org/).

## [Unreleased]

### Added
- Coach lesson editor: the phone preview is the editor. An answer is a list of chunks (paragraph, heading, bullet, numbered item, code, rule, image) edited in place with the app's typography; `+` between chunks, a chunk toolbar and menu (kind, level, indent, emphasis, link, move, duplicate, delete), Enter / Backspace / Alt+↑↓ / Escape keys, and undo/redo for the whole draft. `answer_md` is still the stored format: chunks serialize back to the app's markdown subset, and markup the app does not support is kept as text with a warning.
- Per-chunk languages: one chunk list for every locale, with a status per locale (translated, same as en, missing, stale since en changed), "copy from en", and `en` filling the chunks a locale lacks in the saved `answer_md`.
- Image library for the `coach-media` bucket, grouped by folder (`lessons/{slug}`, `prompts/{slug}`, `shared`): pick an image for a chunk, upload into a folder, move between folders (the URL stays), delete unused files; lightbox with zoom; alt text per image and locale; preview-only alignment (the app has no alignment syntax, nothing is written).
- `GET /api/coach/media` lists the bucket, `PATCH` moves or renames a file, `DELETE … &under=` limits a removal to one folder.

### Changed
- Coach suggestions: lessons and prompts are edited as a local draft with a single Save, a phone preview of the Android rendering (several device sizes, locale switcher, Tutorials list and opened lesson), a toolbar limited to the app's markdown subset, warnings for unsupported markup, and images inserted at the cursor that are uploaded only on Save.
- The phone preview draws images on a line of their own as the app now does (full width, alt text on a failed load, a link when not on Storage); the image warning now flags only images inside a line of text.
- Images dropped into a lesson are uploaded on Save to `lessons/{slug}/` (no locale folder: a chunk's picture is shared by its locales), and Save's orphan cleanup only removes files from that folder, so library images are never deleted by saving a lesson.

### Removed
- The textarea markdown editor for Coach answers, replaced by the chunk editor.

## [1.1.1] - 2026-10-26

### Removed
- Taxonomy map-view / crop editor, after the catalog columns were dropped.

## [1.1.0] - 2026-10-25

### Added
- Coach admin: prompts, tiers, suggestions, knowledge, tool calls, and the token budget per 30-day cycle and per day (#36).
- Muscle map B: bases, masks, multiply painting with a volume shade, exercise preview (#30, #31, #32).
- Exact per-frame poses in exercise prompts and a poses editor (#33); exercise values prefilled in the Prompts panel (#34).
- Pair muscles in Taxonomy → Group movements; exercises inherit or customise their muscles.
- Catalog localizations, body regions, load and support equipment images per style (#23, #25, #28).
- Images rebuilt around styles: server-side generation jobs, several candidates, edit by instruction, prompt history and a reference library (#15, #21).
- Support user search typeahead and tabbed user profile (#18).

### Changed
- `sessions_per_week` shown as training days per week.
- Catalog library rewritten in TypeScript with one-mutation updates.

### Removed
- Legacy `images` muscle maps; Support follows schema `muscle_map` (#37).

## [1.0.0] - 2026-09-04

### Added
- Catalog tree explorer with exercise compose modal and taxonomy tools.
- Lab sets browser with sensor data viewer and JSON download.
- Cmd+K command palette, SWR caching and toasts.

[Unreleased]: https://github.com/TwinFit-fr/TwinFIT-support/compare/v1.1.1...HEAD
[1.1.1]: https://github.com/TwinFit-fr/TwinFIT-support/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/TwinFit-fr/TwinFIT-support/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/TwinFit-fr/TwinFIT-support/releases/tag/v1.0.0
