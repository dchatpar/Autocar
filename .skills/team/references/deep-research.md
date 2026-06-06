# Deep Research Team Guidance

This reference is loaded when a Team task involves deep research — multi-source investigation,
evidence synthesis, and verified deliverables. It covers source strategy, fact verification,
and plan patterns.

> ⚠️ The YAML examples below ship in English. They are templates for
> STRUCTURE, not output language. `plan.name`, every task `title`, and any
> user-facing prose in `prompt` / `verify_prompt` / `message_to_user` MUST be
> translated into the user's language (e.g. Chinese for Chinese-speaking
> users) before you submit. See `team` SKILL.md → "Hard rule —
> user-facing strings follow the user's language".

## Research preflight

Expands SKILL.md's readiness questions for research. Skip if context is already sufficient.

- **Pin the unknowns** — turn vague topics into concrete researchable questions
- **Scope 2–4 parallel angles** — independent enough to assign to separate workers
- **Check source availability** — which sources (web, docs, CLI/MCP, databases) apply?
- **Define deliverable shape** — format, depth, audience
- **Set a depth contract** — `brief` / `standard-report` / `deep-report` /
  `deep-engineering-handbook`, expected scale, required appendices, and what "too shallow" means
  for this task

Stop here. Comparing sources or writing conclusions is Team work, not preflight.

## Deep Research Deliverable Contract

For any high-cost research plan (3+ tracks, >20 minutes expected runtime, security/architecture
audit, regulatory/financial analysis, or user explicitly asks for deep research), the plan owner
MUST put a contract like this into the synthesis/final-report task prompt. Treat it as an
acceptance spec, not decoration.

```yaml
depth_level: deep-engineering-handbook # brief | standard-report | deep-report | deep-engineering-handbook
expected_scale:
  main_report: '<e.g. dense multi-section report; do not collapse into overview>'
  appendices: '<raw evidence inventory / source matrix required or explicitly N/A>'
must_include:
  - coverage matrix mapping each upstream research track to final sections
  - per-topic or per-module deep dives at the granularity needed by the audience
  - evidence chain for every risk/conclusion: evidence, trigger/condition, impact, confidence, verification path
  - contradictions / uncertainty / open questions, not silently resolved away
  - source index with file_path:line_number, URL/date, dataset name, or system query as appropriate
compression_policy:
  - executive summary is allowed, but it must not replace the full body
  - preserve important upstream findings in the body or appendices; do not discard them because the summary is clean
verification:
  - factual correctness against original sources
  - completeness against all verified upstream deliverables
  - depth adequacy against user request, risk level, and elapsed team effort
```

Do NOT use fake line-count targets as a substitute for content quality. A long padded report is not
deep. But a deep research run that consumed multiple verified deliverables and returns only a tidy
overview is a failure unless the user explicitly asked for a summary.

### Depth levels

Use these labels to make expectations concrete:

| Level | Use when | Minimum expectation |
|---|---|---|
| `brief` | User needs a quick answer or decision memo | Concise answer, key evidence, known gaps. |
| `standard-report` | Normal multi-source research | Structured synthesis, source list, major trade-offs and risks. |
| `deep-report` | High-stakes or broad research | Full evidence chains, coverage matrix, contradictions, appendices. |
| `deep-engineering-handbook` | Codebase/system research meant to guide implementation or maintenance | Module-by-module analysis, entrypoints, data structures, call chains, boundary behavior, failure modes, tests, risk remediation paths. |

When unsure, choose the deeper level if the team plan is expensive or the user is waiting for a
formal research result. You can always include a short executive summary on top of a deep body.

## Task splitting for research

For high-stakes or multi-source research, keep verified research/synthesis gates before
production deliverables. Don't combine research and production in one task when the research
needs independent verification. For lightweight research that feeds directly into a small
deliverable (e.g. quick lookup then draft an email), combining is fine.

## Source strategy

When writing task prompts, **specify which sources to check** — don't assume the worker will
figure it out. Sources include web, local files, Lark docs/Bitable, chat/email/meeting notes,
CLI/MCP tools, and business systems. Be explicit.

## Research-specific verification

Beyond the general verification policy in the main skill, research verifiers should focus on:

- **Source independence** — go back to original sources, not re-read the producer's summary
- **Currency** — data, prices, features, and regulatory info must be current
- **Attribution** — every factual claim traces to a specific source (URL, doc name, date, section)
- **Cherry-picking** — synthesis must fairly represent full evidence, not just favorable parts
- **Calculations** — re-derive any numbers, percentages, or rankings from source data
- **Completeness against upstream work** — check that the synthesis consumed every verified research
  track and did not drop important findings during compression
- **Depth adequacy** — judge whether the deliverable meets the explicit depth contract and is
  proportional to the user's request, risk level, and elapsed team effort
- **Evidence retention** — verify that raw evidence/source matrices remain available in the body or
  appendices when the contract requires them

For deep reports, write the final-report `verified_by` as either multiple distinct verifiers when
available (for example factual verifier + domain/code reviewer) or a single verifier prompt with two
separate sections:

1. factual correctness: source accuracy, unsupported claims, stale data, calculations
2. depth/completeness: coverage matrix, upstream-findings consumption, evidence-chain completeness,
   no overview-only compression

The final report should FAIL verification if it is merely correct but too thin for the contract.

## Plan patterns for research

### Pattern: parallel investigation tracks + synthesis gate

The most common research pattern. Each track investigates an independent angle, then a synthesis
task cross-references all findings.

```
[track-A: market analysis]    --\
[track-B: tech evaluation]    ---+-> [synthesis: cross-reference and recommend]
[track-C: regulatory review]  --/
```

Key rules:
- Each track should have its own verifier pass before synthesis
- The synthesis task should explicitly cross-reference, not just concatenate
- The synthesis prompt should include a Deep Research Deliverable Contract when the task is high-cost
- The synthesis verifier should check that every conclusion traces to evidence and that the final
  report is deep enough for the contract
- When the synthesis task produces a report, follow `references/report.md` for structure,
  citation format, and quality signals

Full example:

```yaml
version: 1
plan:
  name: 'competitive landscape analysis for product X'
  max_concurrency: 10
  max_consecutive_failures: 2
  max_cycles: 10
tasks:
  # -- These run in parallel --
  - id: market-position
    title: 'market positioning and user segments'
    prompt: '<research product X vs top 5 competitors on positioning, pricing, target segments; cite sources>'
    assigned_to: general
    verified_by: verifier
    verify_prompt: '<verify competitor list is current, pricing is from official sources, segments match public data>'
    timeout_ms: 1800000
  - id: tech-capabilities
    title: 'technical capability comparison'
    prompt: '<compare API features, integrations, performance benchmarks, architecture approaches across competitors; cite docs>'
    assigned_to: general
    verified_by: verifier
    verify_prompt: '<verify feature claims against official docs, check benchmark methodology, flag stale data>'
    timeout_ms: 1800000
  - id: ecosystem-trends
    title: 'ecosystem and industry trends'
    prompt: '<research market trends, regulatory changes, technology shifts affecting this space; cite analyst reports>'
    assigned_to: general
    verified_by: verifier
    verify_prompt: '<verify trend claims cite specific reports with dates, not generic assertions>'
    timeout_ms: 1800000
  # -- Synthesis gate --
  - id: report
    title: 'synthesize final competitive analysis report'
    prompt: '<cross-reference all research tracks, identify strategic opportunities and risks, write structured report with recommendations. Include a depth contract: deep-report, coverage matrix, per-risk evidence chains, appendices/source index, no overview-only compression>'
    assigned_to: general
    depends_on: [market-position, tech-capabilities, ecosystem-trends]
    verified_by: verifier
    verify_prompt: '<verify every recommendation traces to evidence from research tracks, no unsupported claims; separately verify completeness/depth against the contract, including coverage of all upstream deliverables and no over-compression>'
    timeout_ms: 1800000
```

### Pattern: breadth scan + deep dive

First, a broad scan identifies the most promising areas, then targeted deep dives follow.

```
[broad-scan] --> [deep-dive-1] --\
                 [deep-dive-2] ---+-> [synthesis]
                 [deep-dive-3] --/
```

Use this when the research space is too large to investigate everything in parallel. The broad
scan task should explicitly output which areas deserve deep dives.

Full example:

```yaml
version: 1
plan:
  name: 'broad-then-deep research on <topic>'
  max_concurrency: 10
  max_consecutive_failures: 2
  max_cycles: 10
tasks:
  - id: broad-scan
    title: 'broad scan: identify highest-value deep-dive topics'
    prompt: |
      Survey <topic> across all reasonable angles (technology, market, ecosystem, regulatory,
      operational). For each angle: short summary, 2-3 supporting sources, and a priority
      score (high/medium/low) for whether it deserves a deep dive.

      Output deliverable.md as a prioritized topic list, ranked high → low, with reasoning
      for each rank. The top 3 high-priority topics become the deep-dive targets below.
    assigned_to: general
    verified_by: verifier
    verify_prompt: |
      Independently check that the broad scan covered the obvious angles for <topic>. If a
      reasonable category was skipped (e.g. regulatory missed for a financial topic), FAIL
      with the missing categories. Spot-check 2 cited sources for currency and accuracy.
    timeout_ms: 1800000

  # The next three deep dives consume broad-scan/deliverable.md. If broad-scan finds far
  # more than 3 topics worth diving into, add more deep-dive tasks via the owner's cycle
  # decision after broad-scan completes — do not over-provision empty slots here.
  - id: deep-dive-1
    title: 'deep dive: top-priority topic from broad scan'
    prompt: |
      Read broad-scan/deliverable.md and own the topic ranked #1. Produce a deep
      investigation: methodology, primary sources, secondary sources, evidence chains,
      contradictions, open questions. Cite every claim with source name + date.
    assigned_to: general
    depends_on: [broad-scan]
    verified_by: verifier
    verify_prompt: |
      Independently verify the deep dive's primary claims against original sources (not the
      producer's summary). Check evidence chain completeness, attribution, and that
      contradictions are not silently resolved.
    timeout_ms: 1800000
  - id: deep-dive-2
    title: 'deep dive: topic #2 from broad scan'
    prompt: '<same shape as deep-dive-1, owning the topic ranked #2>'
    assigned_to: general
    depends_on: [broad-scan]
    verified_by: verifier
    verify_prompt: '<same shape as deep-dive-1>'
    timeout_ms: 1800000
  - id: deep-dive-3
    title: 'deep dive: topic #3 from broad scan'
    prompt: '<same shape as deep-dive-1, owning the topic ranked #3>'
    assigned_to: general
    depends_on: [broad-scan]
    verified_by: verifier
    verify_prompt: '<same shape as deep-dive-1>'
    timeout_ms: 1800000

  - id: synthesis
    title: 'synthesize broad scan + deep dives into final report'
    prompt: |
      Combine broad-scan's landscape view with the three deep dives. Produce a final report
      with: executive summary, coverage matrix (each deep-dive → final report section),
      per-topic dive with evidence chains, cross-topic synthesis, contradictions, open
      questions. Honor the Deep Research Deliverable Contract: depth_level=deep-report,
      preserve raw evidence in appendices, do not collapse into an overview.
    assigned_to: general
    depends_on: [deep-dive-1, deep-dive-2, deep-dive-3]
    verified_by: verifier
    verify_prompt: |
      Two checks. (1) Factual: spot-verify 5 claims against original sources, flag any
      unsupported or stale. (2) Depth/completeness: confirm the coverage matrix references
      every upstream deliverable, evidence chains are present for each conclusion, no
      over-compression of upstream findings.
    timeout_ms: 1800000
```

### Pattern: multi-source fact verification

When accuracy is critical (financial, legal, regulatory, medical, safety), have multiple
workers independently verify the same claims from different sources.

```
[primary-research] --> [independent-verification-a] --\
                       [independent-verification-b] ---+-> [reconciliation]
```

Independence is enforced by **disjoint source pools**: each verifier is told which source
class to use, and reconciliation cross-references all perspectives without silently picking
a winner.

Full example:

```yaml
version: 1
plan:
  name: 'fact verification on <claim set>'
  max_concurrency: 10
  max_consecutive_failures: 2
  max_cycles: 10
tasks:
  - id: primary-research
    title: 'enumerate claims with primary sources'
    prompt: |
      Compile every factual claim about <subject> as a numbered list in
      primary-research/claims-table.md. For each claim: the claim itself, primary source
      (URL / document / dataset + access date), and the producer's own confidence read.

      Do NOT pre-resolve contradictions. Record the strongest version of each claim and let
      verifiers find disagreements.
    assigned_to: general
    verified_by: verifier
    verify_prompt: |
      Spot-check that the claims table is exhaustive for the scope and that each claim has a
      real primary source (not a tertiary summary). FAIL if missing claims or weak sources.
    timeout_ms: 1800000

  # Two independent verifications run in parallel, using disjoint source pools.
  - id: independent-verification-a
    title: 'independent verification using source pool A'
    prompt: |
      Read primary-research/claims-table.md. For each claim, independently re-verify using
      sources DISTINCT from those primary-research cited. Pool A = official / regulatory
      sources (e.g. SEC filings, government publications, official product documentation).

      Output deliverable.md: for each claim, verification status (CONFIRMED / DISPUTED /
      UNVERIFIABLE), the source you used, and your confidence read.
    assigned_to: general
    depends_on: [primary-research]
    verified_by: verifier
    verify_prompt: |
      Confirm pool A sources are actually independent of primary-research's citations (no
      overlap, no derivative summaries of the same upstream). Spot-check 3 verifications.
    timeout_ms: 1800000

  - id: independent-verification-b
    title: 'independent verification using source pool B'
    prompt: |
      Same shape as verification-a, but Pool B = independent analyst reports, peer-reviewed
      research, and reputable third-party data providers. Sources must be distinct from
      both primary-research's pool and verification-a's pool.
    assigned_to: general
    depends_on: [primary-research]
    verified_by: verifier
    verify_prompt: '<same shape as verification-a but for pool B>'
    timeout_ms: 1800000

  - id: reconciliation
    title: 'reconcile claims across all three perspectives'
    prompt: |
      Read primary-research/claims-table.md, independent-verification-a/deliverable.md, and
      independent-verification-b/deliverable.md. Produce reconciliation/deliverable.md with
      one row per claim: CONFIRMED (all three agree), DISPUTED (any disagreement — list
      each side and sources), SINGLE-SOURCE (only primary, no independent verification
      possible), STALE (data dated past <threshold>).

      Surface contradictions explicitly. Do not silently pick one side. Mark each row with
      final confidence: high / medium / low.
    assigned_to: general
    depends_on: [primary-research, independent-verification-a, independent-verification-b]
    verified_by: verifier
    verify_prompt: |
      Confirm no claim was silently resolved. Every DISPUTED row must show the disagreement
      and cite both sides. Every SINGLE-SOURCE row must be honestly labeled, not promoted
      to CONFIRMED. Spot-check 3 contested claims against source materials.
    timeout_ms: 1800000
```

### Pattern: research + action

When research leads directly to a concrete artifact — report, document, spreadsheet, email,
deck — the production step is a separate task that depends on verified research.

```
[research-tracks] --> [synthesis] --> [produce-deliverable]
```

The deliverable task should depend on completed and verified research. Don't combine
research and production in one task. When the deliverable is a report, point the producer at
`references/report.md` and the matching plan pattern there (single-author, multi-section, or
engineering handbook).

Full example:

```yaml
version: 1
plan:
  name: 'research <topic> and produce <deliverable type>'
  max_concurrency: 10
  max_consecutive_failures: 2
  max_cycles: 10
tasks:
  # Parallel research tracks — adapt count and topics to the question.
  - id: research-track-a
    title: 'research track A: <angle>'
    prompt: '<research instructions; cite every source with name + date>'
    assigned_to: general
    verified_by: verifier
    verify_prompt: '<verify track A facts against original sources>'
    timeout_ms: 1800000
  - id: research-track-b
    title: 'research track B: <angle>'
    prompt: '<research instructions; cite every source with name + date>'
    assigned_to: general
    verified_by: verifier
    verify_prompt: '<verify track B facts against original sources>'
    timeout_ms: 1800000

  - id: synthesis
    title: 'synthesize research into structured findings'
    prompt: |
      Cross-reference research-track-a and research-track-b deliverables. Produce
      synthesis/findings.md with: key findings, contradictions, supporting evidence, and a
      proposed structure for the final deliverable.
    assigned_to: general
    depends_on: [research-track-a, research-track-b]
    verified_by: verifier
    verify_prompt: |
      Verify each finding traces to an upstream track. Flag any synthesis claim with no
      supporting research evidence.
    timeout_ms: 1800000

  - id: produce-deliverable
    title: 'produce the final <report | doc | email | spreadsheet | deck>'
    prompt: |
      Use the patterns in references/report.md for format, citation style, and quality
      signals. Pick the matching report pattern from that file: single-author for a concise
      evaluation / decision memo, multi-section for a market analysis or audit,
      engineering-handbook for a codebase / system deep dive.

      Input: synthesis/findings.md plus the verified research-track deliverables. Output:
      <exact filename + format>, e.g. final-report.md.

      Honor the original audience and depth contract: <executive | technical-peer | mixed>
      and <brief | standard-report | deep-report | deep-engineering-handbook>.
    assigned_to: general
    depends_on: [synthesis]
    verified_by: verifier
    verify_prompt: |
      Two checks. (1) Audience fit: depth, terminology, level of detail match the contract.
      (2) Evidence chain: every claim in the deliverable traces to a cited source from the
      synthesis or research tracks.
    timeout_ms: 1800000
```
