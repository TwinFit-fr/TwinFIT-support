# 3D Studio UI gauntlet prompt

Draft v0.4 (2026-11-10). Paste the block below into a fresh Claude Code session opened in `TwinFIT-support`, with the session model set to **Fable 5.2** at **high** effort.

The details live in the project skills under `.claude/skills/`:
- `studio-gauntlet`: goal, bar, loop, workspace, backend scope, local stack, API keys.
- `model-routing`: which model and effort each subagent gets.
- `gauntlet-loop`: the original prompt writer (robonuggets, CC BY 4.0), for writing new gauntlet prompts.

---

```
First check that the TwinFIT-support project skills studio-gauntlet, model-routing and gauntlet-loop are in your list of available skills. If any of them is missing, do nothing else: tell me which ones are missing and stop.

Bring the 3D Studio UI in TwinFIT-support to the level of the best 3D animation tools: clear, easy to use from the first minute, responsive, well modularised, with AI and manual editing as one flow.

Follow the studio-gauntlet skill for the goal, the bar, the loop and the constraints, and the model-routing skill for every subagent you start. You are the lead: plan, route and judge.

The bar is Cascadeur's AutoPosing. Get the real thing first and compare against it directly, not against a description of it.

Stop after the audit and show me the plan before building.

/loop on each piece until the critic picks ours blind. Do not stop before that.

Keep a live progress page updating as the work evolves so I can watch it.

Fan out subagents and ultracode.
```

---

## Where the model rules come from

From the Fable 5.2 video summary:

- Max effort roughly doubles the bill against Opus (about 2.5x per complex task) and averages about 45 minutes per task → rule 1.
- At high effort it uses about 40% fewer tokens than Opus; the recommended hybrid is Fable to plan and Opus to execute → routing table and rule 2.
- Not worth it for simple everyday tasks → Sonnet and Haiku rows.
- Gives in too easily when pushed with flawed plans → rule 5.
- Left alone, agents wrote an 87,000-word internal rulebook; human supervision is still needed → rule 6 and the checkpoint after the plan.

## Changelog

- v0.4 (2026-11-10): the prompt first checks that the three project skills are loaded, and stops and reports if not.
- v0.3 (2026-11-10): details moved into the `studio-gauntlet`, `model-routing` and `gauntlet-loop` project skills; the prompt is now short.
- v0.2 (2026-11-10): Cascadeur as the bar, model routing rules, API keys and reference images, backend limited to `animation_studio`, English only.
- v0.1 (2026-11-10): first draft.
