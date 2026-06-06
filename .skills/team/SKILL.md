---
name: team
description: >
  Template library for parallel team plans. Pick a template that matches the task shape
  (code change, multi-source research, report production, mixed pipelines), adapt the YAML,
  and launch via the `team` tool. Per-domain template packs live in
  references/software-engineering.md, references/deep-research.md, and references/report.md.
  Also handles "build me a team for X" / "add an agent for Y" by routing roster gaps to
  `create-agent` before the plan runs.
---

# mavis Team — Template Library

This skill is a **menu of plan templates**. Match the task shape to a template, copy the
YAML, fill in the angle brackets, and launch. The deep-dive packs in `references/` carry the
full template variants plus reasoning checkpoints for each scenario.

## Template selector

| Task shape | Open this pack | Pick this template |
|---|---|---|
| Code change, single track, want adversarial review | `references/software-engineering.md` | `impl + test-coverage + read-only review` |
| Code change, risky / migration / behavior contract | `references/software-engineering.md` | `impl with review + test verifiers` |
| Feature spans independent packages (data / API / UI) | `references/software-engineering.md` | `parallel component tracks + integration gate` |
| Migration with backward-compat risk | `references/software-engineering.md` | `migration + compatibility verifier` |
| Auth / payments / data-access change | `references/software-engineering.md` | `security-sensitive change + adversarial review` |
| Cross-codebase rename / sweep | `references/software-engineering.md` | `broad mechanical sweep` |
| Multi-source research, parallel angles | `references/deep-research.md` | `parallel investigation tracks + synthesis gate` |
| Research space too large to fan out flat | `references/deep-research.md` | `breadth scan + deep dive` |
| High-stakes facts (financial / legal / medical) | `references/deep-research.md` | `multi-source fact verification` |
| Research that ends in a concrete artifact | `references/deep-research.md` | `research + action` (its producer step points at report.md) |
| Single-author report / decision memo / brief audit | `references/report.md` | `single-author report` |
| Report with section owners (market analysis, multi-finding audit) | `references/report.md` | `multi-section report with section owners` |
| Codebase / system handbook / architecture review | `references/report.md` | `engineering handbook` |

When two templates partially apply, prefer the one closer to the **final deliverable shape**
and borrow verification hooks from the other.

## User-facing strings follow the user's language

`plan.name`, every task `title`, the `message_to_user` field in decisions, and any free-form
prose inside `prompt` / `verify_prompt` that the user later sees verbatim **must be written
in the same language the user is using in this session**. The YAML examples in this skill
and the reference packs ship in English; translate the user-facing strings before submitting.
Technical tokens (file paths, schema field names, flags) stay in their original form.

## Step 1 · Pick agents — or create the ones you need

Check `<agent-context>` for `availableAgents` and active peer sessions.

If the existing roster fits:
- Prefer a project-specific agent over a generic one with the same role.
- Use `general` for one-off work when no specialist exists.
- Use the **exact agent name** from output, not a display name.
- Multiple tasks can share the same agent (engine spawns separate sessions).

### If no existing agent fits

Two paths — pick by **how the user phrased the request**:

**Implicit need** (user gave a task, you discovered mid-planning the roster is missing a role).

1. Pause planning.
2. Report: which task is blocked, which existing agent comes closest, the 1–2 new agents
   you'd recommend (each: `name`, one-line `description`, scope, stop condition).
3. Wait for explicit user OK.
4. After consent → load `create-agent` and follow it for each new agent.
5. Resume planning with the new names in `assigned_to`.

**Explicit ask** (user said "build me a team for X" / "add an agent for Y" / "组个团队搞 X").

1. Draft the agent list (each: `name`, one-line `description`, scope, stop condition).
2. Show the list to the user — names + descriptions only — and ask for any edits.
3. Once names are settled → load `create-agent` for each one.
4. Continue with the plan that uses them.

### Team-design defaults (when proposing new agents)

| Choice | Default |
|---|---|
| Total team size | 3–7. Beyond → overlap and routing confusion. |
| Coding project always has | `developer` + `tester`. Add `code-reviewer` for high quality bar. |
| Domain specialists | 1–4, named by **responsibility** (`payments-expert`, `db-expert`), NEVER by seniority (`senior-dev`). |
| Stop condition | Concrete + measurable ("tests pass, MR opened"), NEVER vibe ("user is happy"). |

## Step 2 · Adapt the template

Each template ships with placeholder `<…>` blocks that mark where you must add specifics.
Treat the YAML as scaffolding:

- Replace agent names with exact names from the roster.
- Rewrite every `prompt` and `verify_prompt` as a self-contained spec — a fresh session must
  be able to act on it. Retry context and file paths are auto-injected.
- Translate user-facing strings (`plan.name`, `title`, `message_to_user`, free-form prose
  inside prompts) into the user's language.
- Set `timeout_ms` to 25–30 min for heavy tasks; hard cap 30 min.
- When a task maps to a known skill, name it: `use the <skill-name> skill to ...`. Verify the
  name exists in `<available_skills>`.

### Field cheatsheet

| Field | When |
|---|---|
| `depends_on` | Task truly needs another's output. |
| `timeout_ms` | Heavy tasks: 25–30 min. Hard cap 30 min. |
| `max_retries` | Risky/flaky task. |
| `auto_reject_retries` (plan) | How many verifier FAILs the engine auto-retries before escalating. Default 1. |
| `verified_by` | Single agent, or array of distinct verifier agents (all must PASS). |
| `verify_prompt` | String for one verifier; map keyed by verifier agent name when responsibilities differ. |
| `output` / `gates` | Explicit file expectations or objective command checks. |

### Verifier prompt — force re-derive

The team's value is independent verification. Write `verify_prompt` so the verifier
re-runs commands, returns to original sources, or applies adversarial reasoning. Each
reference pack carries domain-specific verification rules.

Generic shape:

`Re-run <specific check> on <specific artifact>. Independently confirm <specific property>.
Do not re-read producer's diff/summary.`

## Step 3 · Launch

Call the `team` tool with `action: run` and the plan YAML as input. The tool returns the
new `plan_id` and initial status once the plan leaves `pending`.

## Step 4 · Watch and intervene

Heartbeat status arrives every 5 minutes. For faster inspection, call `team` with
`action: status` and the `plan_id`.

| Signal | Action |
|---|---|
| Worker polling CI/CR | Send: `Stop polling. Write deliverable.md and exit.` |
| Worker progressing but near timeout | `team` with `action: extend-timeout`, `plan_id`, `task_id`, `minutes: 15` (≤60 min/request, only `producing` status) |
| Worker stuck >5 min | Hint, extend, or pause |
| Direction is wrong NOW | `team` with `action: steer`, `plan_id`, `message: "<correction>"` |
| Dependency graph wrong | `team` with `action: unblock`, `plan_id`, `task_id` (only `blocked` status) |
| Plan beyond salvage | `team` with `action: cancel`, `plan_id`, then take over |

## Step 5 · Submit a decision

Call the `team` tool with `action: decision`, `plan_id`, and the decision payload below:

```json
{
  "last_cycle": [
    { "task_id": "task-1", "verdict": "manual_retry", "reason": "Fix the schema edge case the verifier found." }
  ],
  "next_cycle": [
    {
      "task_id": "task-1",
      "title": "fix schema edge case",
      "prompt": "Update the validator so ...",
      "assigned_to": "<agent-name>",
      "verified_by": "verifier",
      "verify_prompt": "Re-run the validator unit test ...",
      "timeout_ms": 1800000
    }
  ],
  "plan_complete": false,
  "message_to_user": "Round 2: retrying with tighter scope."
}
```

Verdicts: `accept`, `reject`, `override_accept`, `manual_retry`.

### Same-session vs new-session retry

| Scenario | Verdict | Same session? |
|---|---|---|
| Minor fix (changelog, formatting, naming) | `reject` original task_id | ✓ Yes |
| Right direction, wrong implementation | `manual_retry` original task_id (correction in `reason`) | ✓ Yes |
| Fundamentally wrong approach | `reject` + new task_id in `next_cycle` | ✗ Cold start |
| Independent follow-up | New task_id in `next_cycle` only | ✗ Cold start |

**Never mix retry + new task in one decision.** Engine runs the retry first; the new task
waits; the retried worker may redo finished work.

## Worker vs owner scope

| Responsibility | Owner |
|---|---|
| Code, test, push, create MR, write `deliverable.md` | **Worker** |
| Research, analyze, draft, write `deliverable.md` | **Worker** |
| Wait for CI / CR, merge MR, clean up worktree | **You** |
| Any sleep / polling waiting for external systems | **Forbidden in worker prompts** |

Workers have a 30-minute hard cap. Design prompts to produce and exit.

## Quick reference

All operations go through the `team` tool. Pass the action as a parameter.

| Action | Purpose |
|---|---|
| `run` | Launch a new plan (input: plan YAML) |
| `status` | Inspect current state (input: `plan_id`) |
| `steer` | Redirect running work (input: `plan_id`, `message`) |
| `unblock` | Force `blocked` task → `ready` (input: `plan_id`, `task_id`) |
| `extend-timeout` | Add runtime to active producer (input: `plan_id`, `task_id`, `minutes`) |
| `decision` | Submit next-cycle decision (input: `plan_id`, decision payload) |
| `cancel` | Stop the plan (input: `plan_id`) |
