---
name: studio-gauntlet
description: Use when improving, redesigning or polishing the 3D Studio UI in TwinFIT-support (/studio, src/components/studio, src/lib/studio), or when running the Studio UI gauntlet loop against Cascadeur.
---

# Studio UI gauntlet

**REQUIRED SUB-SKILL:** Use model-routing for every subagent you start.

## Goal

A Studio that is clear, easy to use from the first minute, responsive and well modularised, where AI and manual editing are one flow. Whatever the AI produces (Meshy avatars, pose drafts, exercise templates, DeepMotion mocap) arrives in the same controls as manual work, shows where it came from, and can be accepted, tweaked or undone without blocking the user.

The user is TwinFIT staff animating catalog exercises. The core path is: pick an exercise, get an AI draft, fix it on the model, save. It must be obvious and short.

## The bar

Cascadeur, above all AutoPosing, where AI posing and manual adjustment happen in the same gesture. Get the real thing first: screenshots and video frames from cascadeur.com, its docs and its official interface and AutoPosing videos. Compare against those directly, never against a description.

The measurable half, with a baseline taken before any change:
- clicks and time for "exercise → AI draft → fix one joint → save" beat the baseline;
- zero console errors and zero serious axe violations on /studio;
- `npm test`, `npm run lint` and `npm run build` green.

## Loop

1. Audit the current UI and measure the baseline.
2. Break the work into the smallest pieces that can be improved and judged on their own.
3. **Checkpoint:** show the user the audit, the baseline and the piece list, and wait for a go before building.
4. For each piece, a builder and a separate critic with fresh context. The critic opens the real page, puts our screenshot next to the Cascadeur equivalent blind with labels stripped, says which one is better (A or B, never a score), and names the single biggest remaining gap. Back to the builder.
5. The critic is harsh; praise is not useful. A piece is done only when the critic picks ours blind.

Keep a live progress page (one line per event, including each routing decision) so the user can watch.

## Workspace

- Run the lead session from the TwinFIT-support checkout (where these skills live).
- Build in git worktrees on new branches cut from the local branch `feat/animation-studio`, which is not on GitHub: `feat/studio-ui-gauntlet` in TwinFIT-support (`/home/jsr90/Twinfit/.worktrees/sup-studio-ui`) and, only if the backend changes, in TwinFIT-backend (`/home/jsr90/Twinfit/.worktrees/be-studio-ui`). The current checkouts stay as they are.
- No push, no PR and no commits until the user says so.
- All code, UI text, docs and prompts in English.

## Backend scope

Only the `animation_studio` schema:
- edit migration `1790000000086_animation_studio` in place and mirror each change to the local database with psql;
- keep `DATABASE_CONTRACT.md` and `CHANGELOG.md` aligned;
- keep the schema test green: `cd tests && node --import tsx --test integration/animation-studio-schema/*.test.ts`.

Catalog and images rows are read-only (their texts belong to the Images tool).

## Local stack

The Studio data (avatars, clips) lives on the Docker volume `twinfit-backend_pgdata_main`. Other volumes (for example `pgdata_releasev240`) have the catalog seed but no `animation_studio` schema. Check which volume the postgres container uses; ask the user before restarting the stack.

Storage reads need both headers set in `src/lib/studio/asset-auth.ts` (staff JWT and `x-hasura-role: staff`); keep them.

Claude's preview pane has no WebGL: take viewport screenshots in Chrome.

## API keys

`TwinFIT-support/.env.local` has `OPENAI_API_KEY`, `MESHY_API_KEY`, `DEEPMOTION_CLIENT_ID`, `DEEPMOTION_CLIENT_SECRET` and `CLAUDE_API_KEY`. Read them from the environment, keep them server-side, and keep them out of output, logs and commits.

- OpenAI images: allowed for reference images of exercise start and end positions built from the seeded catalog data, for critics judging poses and for testing the AI flow.
- Meshy and DeepMotion are paid: reuse existing avatars and clips first, call them only when a piece needs it, and log every paid call on the progress page.
