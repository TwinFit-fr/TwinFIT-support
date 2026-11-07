# Changelog

All notable changes to TwinFIT-support are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions: [SemVer](https://semver.org/).

## [Unreleased]

### Added
- 3D Studio (`/studio`, needs backend migration `1790000000082`): a full-screen dark workspace to generate and review the movement clip of each catalog exercise. Left, the catalog as a searchable virtualized list with group filters and the state of each exercise's clips; centre, a three.js viewer (react-three-fiber) that loads the base avatar `.glb`, plays the selected clip (glb / gltf animations or keyframe json), draws the equipment at the avatar's sockets, with orbit / pan / zoom, camera presets, grid and playback speed; right, the generator: movement prompt expanded from the studio template, equipment and socket editor, fps / duration / format, and the queue and history of the exercise. Base avatars come from the top bar in three ways: generated in the browser (a neutral mannequin with the Mixamo skeleton in T-pose, exported to `.glb`, no file or licence needed), uploaded as a rigged `.glb` / `.gltf`, or imported from an https URL; all land in bucket `3d-workspace`. A new default avatar replaces the previous default. BFF routes `GET /api/studio/{exercises,avatars,settings,vectors}`, `POST /api/studio/vectors` (enqueue) and `POST /api/studio/avatars` (upload). Queue rows can be activated as the exercise's clip, deactivated, requeued after a failure, deleted, or completed by hand by attaching a finished clip (`PATCH` / `DELETE /api/studio/vectors/[id]`, `POST /api/studio/vectors/[id]/result`; a keyframe `.json` fills fps, frames and duration). Keyboard: space play / pause, 1 2 3 camera presets, G grid, E equipment, R reset view. The canvas reads a scene slice of the workspace store that only changes with the avatar or the clip, so typing, scrolling and queue polling never re-render it (a dev-only counter in the viewport shows its commits).
- 3D Studio → pose editor: build or correct a movement by hand. "New poses" in the queue starts from one pose and you add the next ones one by one (copies of the current, reorderable, up to eight); the pencil on a generated clip opens it. Each pose is set with sliders by body part (Body, Arms, Legs, Bar), sides mirrored by default, pelvis height automatic (feet on the floor) or by hand; feet, hands and knees can be pinned where they are so the rest of the pose moves around them (the leg or arm is solved to the pin, a pinned knee steers its leg). Loop as boomerang (there and back), cycle or once, with its length; the viewer holds the selected pose while paused and plays the loop on play. Saves as a new ready version of the clip. The worker also honours `params.loop_mode` (`pingpong`). Shoulder rotation and forearm pronation now mean the same on both sides.
- 3D Studio → pose editor: every joint has a range of motion (one table drives the slider ranges and the solver), and limbs can be posed by dragging: click the dot on a hand, foot, knee or the hips in the viewport and drag it; the limb's joint angles are searched inside their ranges so the point follows as far as the body allows, and the sliders update with the result. Pins now use the same solver, so a pinned foot or hand never bends a joint past its range.
- 3D Studio → pose editor: undo and redo of every pose change (buttons and Ctrl+Z / Ctrl+Shift+Z; a drag counts as one step), and a button on each arm and leg to copy it onto the other side.
- 3D Studio → rig editor: the gizmo snaps rotations to 45° and moves to 5 mm (toggle), so a grip lands on 45 / 90 / 135 / 180; a model's grip is defined on the right hand, mirrored to the left and kept for every exercise that uses the equipment.
- 3D Studio → motion-capture clean-up: a mocap clip is tidied on load, against the avatar's own rig (toggle in the viewer toolbar, on by default): baked at 30 fps, horizontal drift of the hips removed and the clip centred, feet grounded while in contact (the hips move vertically, no floating or sinking), each foot locked to its spot during contact phases with two-bone leg IK (no skating), and the last six frames blended into the first so the loop closes.
- 3D Studio → motion-capture clips: a `.fbx`, `.bvh`, `.glb` or `.gltf` export (DeepMotion, Mixamo, any rig) attached to a queue row is retargeted to the avatar when it loads: bone names are matched to the Mixamo vocabulary (sides, common aliases, vendor prefixes) and the motion is baked onto the avatar's rest pose and units; a file that already uses the avatar's bones plays as it is. The avatar's `.glb` can be downloaded from the top bar to use it as the custom character of the capture tool. "Upload clip" in the queue adds such a file as a new ready movement in one step (`POST /api/studio/vectors/upload`), and every queue row can have its clip attached or replaced.
- 3D Studio → two-handed implements are exact: for a barbell, EZ bar, plate or landmine the worker also asks for the implement's position per frame (height, forward offset, grip width) and the viewer solves each arm with two-bone IK so the hand socket lands on the bar, the elbow stays where the pose put it and the palm faces the bar as the catalog grip says (standard / wide / narrow pronated, underhand supinated, hammer neutral, mixed one of each).
- 3D Studio → rig editor: a gizmo in the viewport moves the avatar's sockets (hands, back, feet: offset in metres and rotation in the bone's frame) and the placement of a generated equipment model relative to its socket, with the avatar held in its bind pose; sockets save on the avatar (`PATCH /api/studio/avatars/[id]`), placements on the model, and apply to every exercise. Socket offsets are now metres whatever the rig's units.
- 3D Studio → movement pipeline: "Generate movement" now produces a clip. The worker (`POST /api/studio/worker`, driven by the Studio while an exercise has pending rows) claims the row, reads the three catalog poses of the exercise (`images.exercise_poses`), has OpenAI write them as anatomical joint angles (structured output, `params.model`, default `gpt-5-mini`) and stores them as a `json` clip of kind `pose-angles` (start → mid → end → start, eased); the viewer solves the angles on the avatar's own rig when it loads, so one clip fits any Mixamo-named model. Failures requeue the row with a delay until its attempts run out.
- 3D Studio → Equipment: the 3D model of every catalog implement and support (`animation_studio.equipment_models`). Generate it with Meshy image-to-3D from the reference image of the default style (or from an image you pick), one task per code, about 30 credits each, with the account balance shown; "Generate missing" starts the whole catalog; upload a `.glb` instead; pick the model the viewer draws (one in use per code, the proxy otherwise) and its size in metres. Two-handed implements (barbell, EZ bar, plate, landmine, band) get a second socket (`socket_b`, "both hands" in the equipment editor, the default for those codes) and are drawn between the two hands, long axis from one to the other, instead of inside one hand. Needs `MESHY_API_KEY` on the server. Routes `GET` / `POST /api/studio/equipment` (listing brings running tasks up to date and stores finished GLBs in `3d-workspace`), `PATCH` / `DELETE /api/studio/equipment/[id]`.
- Coach lesson editor: the phone preview is the editor. An answer is a list of chunks (paragraph, heading, bullet, numbered item, code, rule, image) edited in place with the app's typography; `+` between chunks, a chunk toolbar and menu (kind, level, indent, emphasis, link, move, duplicate, delete), Enter / Backspace / Alt+↑↓ / Escape keys, and undo/redo for the whole draft. `answer_md` is still the stored format: chunks serialize back to the app's markdown subset, and markup the app does not support is kept as text with a warning.
- Per-chunk languages: one chunk list for every locale, with a status per locale (translated, same as en, missing, stale since en changed), "copy from en", and `en` filling the chunks a locale lacks in the saved `answer_md`.
- Image library for the `coach-media` bucket, grouped by folder (`lessons/{slug}`, `prompts/{slug}`, `shared`): pick an image for a chunk, upload into a folder, move between folders (the URL stays), delete unused files; lightbox with zoom; alt text per image and locale; preview-only alignment (the app has no alignment syntax, nothing is written).
- `GET /api/coach/media` lists the bucket, `PATCH` moves or renames a file, `DELETE … &under=` limits a removal to one folder.
- Styles → Assets: a Flip button mirrors a support or load equipment image left to right, with no generation. Flip again to undo.

### Changed
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
