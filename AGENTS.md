# TwinFIT-support

Internal operations webapp of TwinFIT (Next.js App Router, React, TypeScript, Nhost Auth): user support (lookup, plan, activity, grants) and exercise catalog / taxonomy administration for staff and admins. It reads and writes through the Nhost backend in [TwinFIT-backend](https://github.com/TwinFit-fr/TwinFIT-backend), the schema and contract source of truth.

## Shared rules

The rules shared by every TwinFIT repo (git workflow, local CI, deployment, versioning, ClickUp tickets) live in **TwinFIT-workspace-rules**:

- GitHub: [TwinFit-fr/TwinFIT-workspace-rules](https://github.com/TwinFit-fr/TwinFIT-workspace-rules) — start with [`AGENTS.md`](https://github.com/TwinFit-fr/TwinFIT-workspace-rules/blob/main/AGENTS.md), details in [`rules/`](https://github.com/TwinFit-fr/TwinFIT-workspace-rules/tree/main/rules).
- Local checkout: the sibling folder `../TwinFIT-workspace-rules` (`AGENTS.md`, `rules/`).

Read them before committing, opening a PR or touching a release.

## This repo

There is no `docs/AGENTS.md`; see [`README.md`](README.md) for setup, modules and checks. TwinFIT-support has no release branches, SemVer or changelog fragments: feature branches and PRs into `main`. Local checks: `npm ci`, `npm run lint`, `npm test`, `npm run build`.
