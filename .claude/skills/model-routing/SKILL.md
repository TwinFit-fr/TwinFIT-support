---
name: model-routing
description: Use when orchestrating subagents or a workflow and choosing the model or effort level for each task, when a task is about to run at max effort, or when a cheap model keeps failing the same piece of work.
---

# Model routing

## Overview

The lead agent picks a model per task by the shape of the task, not by habit. Fable thinks, Opus builds, Sonnet edits, Haiku runs errands. Pass the choice as the `model` (`fable`, `opus`, `sonnet`, `haiku`) and `effort` of each Agent tool call or workflow `agent()`; this skill is the explicit instruction that allows setting `effort` on subagents.

## Routing table

| Task | Model | Effort |
|------|-------|--------|
| Audit, decomposition, plan, routing, arbitration between critics, final blind check of a piece | fable | high |
| Build a piece with state, 3D or viewport interaction, AI-flow wiring, more than 2 files or more than ~150 changed lines, or any backend or schema change | opus | high |
| Critic (every critique, visual or code) | opus | high |
| Build a change in 1 or 2 files with a clear spec, under ~150 lines: styling, layout, copy, small components, tests | sonnet | medium |
| No judgement needed: screenshots, measurements, searches, running tests, lint and build, image-generation calls, progress-page updates | haiku | low |

Pick the first row that matches, top to bottom. The lead itself runs on Fable at high effort.

## Rules

1. **Effort is never max**, for any model. Max roughly doubles the bill against Opus and takes about 45 minutes per task.
2. **Fable plans, Opus executes.** Fable writes little code itself.
3. **Escalate on failure:** after two failed rounds on the same piece, move it one tier up (haiku → sonnet → opus → fable at high).
4. **De-escalate on success:** after three first-round wins in a row on similar pieces, try one tier down for the next similar piece.
5. **Judge on evidence.** Arbitration and acceptance read screenshots, metrics and diffs, never a builder's arguments for its own work. A builder that disputes a critic gets a new critic with fresh context, not a debate. (Fable gives in too easily when pushed with a flawed plan.)
6. **Output is work, not paperwork.** The only process artefacts are the progress page, one line per event, and a short final summary. Long-running agents left alone drift into writing rulebooks; a human checkpoint after the plan keeps them on the work.
7. **Log every routing decision** on the progress page: piece, role, model, effort, round, outcome.

## Common mistakes

| Mistake | Fix |
|---------|-----|
| Opus or Fable for a one-file style tweak | Sonnet row |
| Fable building the viewport because "it is the hardest piece" | Opus builds; Fable only arbitrates |
| Raising effort instead of changing model after failures | Rule 3: change tier, effort stays |
| Builder and critic in the same context | Separate subagents, fresh context each |
