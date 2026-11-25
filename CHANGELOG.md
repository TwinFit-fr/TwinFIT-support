# Changelog

All notable changes to TwinFIT-support are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions: [SemVer](https://semver.org/).

## [Unreleased]

### Added
- **Needs the backend Function `admin-set-role`** (deploy Support after it; until then the buttons answer that role changes are not available on this backend): the user page lists the roles Support manages (`lab`, `staff`) with the account's Support access. Admins grant or revoke them through `admin-set-role`; staff see them read-only. After a change the roles reload and the page says the account gets it at its next sign-in or token refresh; refusals (bad request, not admin, unknown account) are shown in staff words.
- Backend contract gate: Support probes `api-info` (through `GET /api/backend-compat`) with `X-TwinFIT-Client: support` and `X-TwinFIT-Contract: 3`, and shows a banner when the backend's contract range excludes Support (or the backend is older than Support). It never blocks the pages, and a failed probe shows nothing.
- Coach lesson editor: the phone preview is the editor. An answer is a list of chunks (paragraph, heading, bullet, numbered item, code, rule, image) edited in place with the app's typography; `+` between chunks, a chunk toolbar and menu (kind, level, indent, emphasis, link, move, duplicate, delete), Enter / Backspace / Alt+↑↓ / Escape keys, and undo/redo for the whole draft. `answer_md` is still the stored format: chunks serialize back to the app's markdown subset, and markup the app does not support is kept as text with a warning.
- Per-chunk languages: one chunk list for every locale, with a status per locale (translated, same as en, missing, stale since en changed), "copy from en", and `en` filling the chunks a locale lacks in the saved `answer_md`.
- Image library for the `coach-media` bucket, grouped by folder (`lessons/{slug}`, `prompts/{slug}`, `shared`): pick an image for a chunk, upload into a folder, move between folders (the URL stays), delete unused files; lightbox with zoom; alt text per image and locale; preview-only alignment (the app has no alignment syntax, nothing is written).
- `GET /api/coach/media` lists the bucket, `PATCH` moves or renames a file, `DELETE … &under=` limits a removal to one folder.
- Styles → Assets: a Flip button mirrors a support or load equipment image left to right, with no generation. Flip again to undo.
- **Needs backend 2.6.0:** Coach → Knowledge → Candidates lists the papers the weekly PubMed discovery found (pending, dismissed, accepted; filter by topic, search by title, journal or PMID) with journal, year, publication types, topic and PubMed / DOI links. Dismiss and Restore update the candidate over GraphQL; Accept calls the backend Function `admin-accept-knowledge-candidate` (a minute at most), which creates the source and draft cards; View cards opens the Cards tab on that source, filtered.

### Changed
- admin > staff: an account holding both is admin everywhere in Support (Hasura / Storage role, admin-only pages and actions); its role badges list admin first and mark staff as covered by admin. Function calls now name the role (`x-hasura-role`) too, like every GraphQL and Storage request.
- **Needs backend 2.10.0** (deploy right after it and after the `wrist_imu_mode` change; the new documents are not in the 2.9.0 allow-list): the catalog editor follows the backend's catalog guard rails. Exercise create works again (an inherited exercise is inserted inheriting, or, on a pair without muscles, inserted and switched in one mutation); custom muscles need a reason (`muscles_custom_reason`, required in the form, sent on create and update); an inherited exercise never sends secondary muscles, and one that inherits through a pair target profile keeps its target; C_ex (empty or in (0, 1]) and the pulley ratio (other than 1 only on CABLE) are editable and checked with the load-model rules; target pickers of exercises and pairs offer only the group's own muscles; duplicate en / es / fr names among active exercises are refused before saving; the editor shows the exercise's history (`catalog.change_log`).
- Taxonomy: new codes are SCREAMING_SNAKE without spaces; grips, variations and positions have no Add (new values by backend migration); closed lists no longer send `active`; moving a muscle that exercises or pairs of its group target, unlinking a muscle's home, or deactivating a value in use is refused with a message that says why. Database refusals are shown in staff words, never as `postgres tx error`.
- **Needs backend 2.10.0** (deploy right after it, not before: the new library query is not in the allow-list of 2.9.0): exercise create and update no longer write `wrist_imu_mode`, which backend 2.10.0 drops (migration `1790000000116`), and the exercise library no longer selects it.
- **Needs backend 2.0.0:** the user page shows the plan from `effective_subscription_tier` and the entitlement (source, Google Play state, renewal or end date) with the user's Support grants; the tier override is replaced by Grant Premium (until a date, with a reason) and Revoke Support grants through `admin-grant-premium`. Coach token budget: tiers `trial` and `premium_plus` removed.
- **Needs backend 2.1.0** (this release as a whole; backend 2.1.0 refuses the `dailyBurstLimit` that 1.1.x sends, so deploy 1.2.0 once backend 2.1.x is live): Coach token limits are per 30-day cycle, per rolling 7 days and per rolling 60 minutes instead of per UTC day. Admins edit the three on Token budget (the cycle budget is required, empty week / hour = no cap); Tiers shows them; the user's Coach tab shows the cycle, week and hour used and left, the limit that binds now and when it frees up (`assistant_user_quota`).
- Coach suggestions: lessons and prompts are edited as a local draft with a single Save, a phone preview of the Android rendering (several device sizes, locale switcher, Tutorials list and opened lesson), a toolbar limited to the app's markdown subset, warnings for unsupported markup, and images inserted at the cursor that are uploaded only on Save.
- The phone preview draws images on a line of their own as the app now does (full width, alt text on a failed load, a link when not on Storage); the image warning now flags only images inside a line of text.
- Images dropped into a lesson are uploaded on Save to `lessons/{slug}/` (no locale folder: a chunk's picture is shared by its locales), and Save's orphan cleanup only removes files from that folder, so library images are never deleted by saving a lesson.
- Frame generation: support and load equipment references no longer set the camera angle or left/right orientation. The object is rotated or mirrored so the athlete faces its working side.

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
