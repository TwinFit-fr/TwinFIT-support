# Changelog

All notable changes to TwinFIT-support are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions: [SemVer](https://semver.org/).

## [Unreleased]

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
