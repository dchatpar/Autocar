# Report Writing Guidance

Reference for any Team task that produces a report — research synthesis, technical evaluation,
architecture review, audit, operational retrospective, or decision memo. This file provides:

1. **Plan patterns for reports** — team-shape templates with full plan YAML, selected by
   the report's complexity and authorship pattern.
2. **Writing principles and quality signals** — what every report must contain and how
   verifiers should judge it.
3. **Format references** — illustrative section structures for common report types.

> ⚠️ The YAML examples below ship in English. They are templates for STRUCTURE, not output
> language. `plan.name`, every task `title`, and any user-facing prose in `prompt` /
> `verify_prompt` / `message_to_user` MUST be translated into the user's language before
> you submit. See `team` SKILL.md → "User-facing strings follow the user's language".

## Plan pattern selector

| Report shape | Plan pattern |
|---|---|
| Concise, single voice, one author owns the whole thing (technical evaluation, decision memo, brief audit) | `single-author report` |
| Multiple sections with distinct subject-matter owners, edited into one voice (market analysis, multi-finding audit, broad operational retrospective) | `multi-section report with section owners` |
| Codebase / system deep dive meant to guide future engineers (architecture review, system handbook, security audit) | `engineering handbook` |

## Plan patterns

### Pattern: single-author report

One producer writes the whole report. Two verifiers run independently against the same
deliverable: a factual verifier (against cited sources) and an audience-fit verifier
(against the depth contract and reader). Reserve this pattern for reports a single owner
can hold in their head: short to medium length, one subject area, no need to delegate
sections.

```
[research-bundle (optional)] --> [draft-report] --> [factual-verifier]
                                                \-> [audience-fit-verifier]
```

```yaml
version: 1
plan:
  name: 'single-author report on <topic>'
  max_concurrency: 10
  max_consecutive_failures: 2
  max_cycles: 10
tasks:
  # Optional — skip if research already happened upstream (e.g. in a research+action plan).
  - id: research-bundle
    title: 'gather and validate source material'
    prompt: |
      Collect every source needed to write the report: <list source types — web pages,
      internal docs, datasets, interviews, system queries>. Output research-bundle/
      sources.md as a numbered list: source name, URL or path, access date, one-line note
      on what claim each source supports.
    assigned_to: general
    verified_by: verifier
    verify_prompt: |
      Spot-check that the bundle covers the obvious sources for <topic>. Flag missing
      categories. Confirm dates are current enough for the topic.
    timeout_ms: 1800000

  - id: draft-report
    title: 'draft the full report'
    prompt: |
      Write final-report.md following the report-writing principles and quality signals in
      references/report.md. Use the matching format reference for <technical-evaluation |
      decision-memo | audit | market-analysis>.

      Audience: <executive | technical-peer | mixed>. Depth: <brief | standard-report |
      deep-report>. Include executive summary, body, references. Cite every factual claim
      inline with a source from research-bundle/sources.md (or upstream research).
    assigned_to: general
    depends_on: [research-bundle] # remove if research is already done
    verified_by:
      - factual-verifier
      - audience-fit-verifier
    verify_prompt:
      factual-verifier: |
        Independently verify the report's factual claims. Sample 5 claims and trace each to
        its cited source. FAIL on: unsupported claims, stale data, miscited sources,
        contradictions silently resolved, calculations that don't reproduce.
      audience-fit-verifier: |
        Read the report against the audience and depth contract. FAIL on: terminology
        mismatch, missing required sections for the chosen format reference, executive
        summary that doesn't deliver the core message, conclusions over-extrapolated
        beyond evidence. Do NOT re-verify factual accuracy — that's the other verifier.
    timeout_ms: 1800000
```

Replace `factual-verifier` and `audience-fit-verifier` with exact available agent names.
If only the built-in `verifier` is available, collapse into a single `verified_by: verifier`
with one prompt that has both sections (factual / audience-fit).

### Pattern: multi-section report with section owners

Each major section has its own producer who is the subject-matter owner. An editor task
merges the sections into one consistent voice and structure, then verifiers judge the
merged result. Use this when the report spans subject areas no single producer can hold
deeply, or when section production benefits from parallelism.

```
[section-1-author] --\
[section-2-author] ---+-> [editor-merge] --> [factual-verifier]
[section-3-author] --/                    \-> [coherence-verifier]
```

```yaml
version: 1
plan:
  name: 'multi-section report on <topic>'
  max_concurrency: 10
  max_consecutive_failures: 2
  max_cycles: 10
tasks:
  # Section authors run in parallel. Each writes ONE section, not the whole report.
  - id: section-1-author
    title: 'author section 1: <section title>'
    prompt: |
      Write sections/section-1.md owning <section subject>. Follow references/report.md
      principles. Cite sources inline. Do not write executive summary, intro, or
      conclusions — the editor handles cross-section narrative. Target depth:
      <standard-report | deep-report>.

      Output structure: section heading, body with subheadings as needed, references for
      this section only.
    assigned_to: general
    verified_by: verifier
    verify_prompt: |
      Verify section-1 against cited sources. Spot-check 3 claims. Confirm scope stayed
      within <section subject> and did not bleed into other sections.
    timeout_ms: 1800000
  - id: section-2-author
    title: 'author section 2: <section title>'
    prompt: '<same shape as section-1, owning a different section>'
    assigned_to: general
    verified_by: verifier
    verify_prompt: '<same shape as section-1>'
    timeout_ms: 1800000
  - id: section-3-author
    title: 'author section 3: <section title>'
    prompt: '<same shape as section-1, owning a different section>'
    assigned_to: general
    verified_by: verifier
    verify_prompt: '<same shape as section-1>'
    timeout_ms: 1800000

  - id: editor-merge
    title: 'merge sections into a unified report'
    prompt: |
      Read all verified sections/section-*.md. Produce final-report.md with: executive
      summary, scope and methodology, the merged section bodies (preserving evidence and
      citations), cross-section synthesis (contradictions, themes), conclusions or
      recommendations, consolidated references.

      Do NOT rewrite section facts. Smooth transitions, normalize terminology, deduplicate
      sources in references, flag any contradictions across sections explicitly.
    assigned_to: general
    depends_on: [section-1-author, section-2-author, section-3-author]
    verified_by:
      - factual-verifier
      - coherence-verifier
    verify_prompt:
      factual-verifier: |
        Spot-verify 5 claims in the merged report against original sources. Confirm that
        merge did not introduce facts not in the underlying sections.
      coherence-verifier: |
        Check the merged report reads as one document: consistent terminology, no
        duplicated content across sections, executive summary delivers the core message,
        cross-section contradictions are surfaced (not hidden). Confirm format matches the
        chosen reference in references/report.md.
    timeout_ms: 1800000
```

### Pattern: engineering handbook

Codebase or system deep dive. Each module / subsystem gets a parallel investigation track.
The handbook editor merges tracks into the engineering handbook format, with strong
emphasis on coverage matrix, evidence chains, and over-compression guard. Use this for
architecture reviews, security audits, system handbooks, or any report meant to guide
future engineers.

```
[scope-and-coverage-plan] --> [module-track-1] --\
                              [module-track-2] ---+-> [handbook-editor] --> [depth-verifier]
                              [module-track-3] --/                       \-> [factual-verifier]
```

The `scope-and-coverage-plan` task pins the coverage matrix up front so module tracks
investigate to the same depth and the editor has an explicit acceptance contract.

```yaml
version: 1
plan:
  name: 'engineering handbook for <subsystem>'
  max_concurrency: 10
  max_consecutive_failures: 2
  max_cycles: 15
tasks:
  - id: scope-and-coverage-plan
    title: 'scope the handbook and define coverage matrix'
    prompt: |
      Survey <subsystem> at a high level. Output scope-and-coverage-plan/coverage-matrix.md
      with: list of modules / layers in scope, the required investigation depth per module
      (entrypoints, data structures, call chains, boundary behavior, failure modes,
      tests / observability), per-module owner assignment, and explicitly out-of-scope
      areas with reasons.

      This file is the contract every downstream task must honor.
    assigned_to: general
    verified_by: verifier
    verify_prompt: |
      Confirm the coverage matrix covers the obvious modules of <subsystem>. Flag missing
      entrypoints or layers. Confirm out-of-scope decisions are reasoned, not arbitrary.
    timeout_ms: 1800000

  # Module tracks run in parallel. Each track owns one module from the coverage matrix.
  - id: module-track-1
    title: 'deep dive: <module 1 from coverage matrix>'
    prompt: |
      Read scope-and-coverage-plan/coverage-matrix.md and own <module 1>. Produce
      module-track-1/findings.md covering every dimension the matrix requires for this
      module: entrypoints and ownership, data structures / persistence, runtime call
      chains, boundary behavior and failure modes, tests / observability / operational
      hooks. Cite every claim with file_path:line_number, commit hash, or system source.

      Include open questions and risks at the end. Do NOT silently resolve contradictions
      — flag them.
    assigned_to: general
    depends_on: [scope-and-coverage-plan]
    verified_by: verifier
    verify_prompt: |
      Independently verify 5 claims in module-track-1/findings.md against the actual code
      / system. Confirm every dimension required by the coverage matrix is covered. FAIL
      on missing dimensions, weak attribution, or silent resolution of contradictions.
    timeout_ms: 1800000
  - id: module-track-2
    title: 'deep dive: <module 2 from coverage matrix>'
    prompt: '<same shape as module-track-1, owning a different module>'
    assigned_to: general
    depends_on: [scope-and-coverage-plan]
    verified_by: verifier
    verify_prompt: '<same shape as module-track-1>'
    timeout_ms: 1800000
  - id: module-track-3
    title: 'deep dive: <module 3 from coverage matrix>'
    prompt: '<same shape as module-track-1, owning a different module>'
    assigned_to: general
    depends_on: [scope-and-coverage-plan]
    verified_by: verifier
    verify_prompt: '<same shape as module-track-1>'
    timeout_ms: 1800000

  - id: handbook-editor
    title: 'merge module tracks into engineering handbook'
    prompt: |
      Read scope-and-coverage-plan/coverage-matrix.md and all verified module-track-*/
      findings.md. Produce engineering-handbook.md using the Engineering handbook format
      from references/report.md, including:

      - Executive summary
      - Scope, methodology, depth contract (depth_level=deep-engineering-handbook)
      - Coverage matrix mapping each module track to handbook sections (cite which track
        contributed what)
      - Architecture overview
      - Per-module deep dives preserving evidence and citations from module tracks
      - Risk register with per-risk evidence chain (evidence, trigger, impact, confidence,
        verification, remediation)
      - Open questions and unknowns
      - Appendices: evidence inventory / source index, raw notes worth preserving

      Honor the over-compression guard: do NOT collapse module track findings into an
      overview. Preserve raw evidence in the body or appendices.
    assigned_to: general
    depends_on: [module-track-1, module-track-2, module-track-3]
    verified_by:
      - factual-verifier
      - depth-verifier
    verify_prompt:
      factual-verifier: |
        Spot-verify 5 claims in engineering-handbook.md against the actual code / system
        (not the module track summaries). Confirm citations are file_path:line_number or
        equivalent. FAIL on stale or invented references.
      depth-verifier: |
        Check the handbook against the coverage matrix and the deep-engineering-handbook
        depth contract. FAIL on: missing coverage matrix entries, missing required handbook
        sections, per-risk evidence chains absent, over-compression (module track findings
        collapsed into overview without preserving evidence), open questions silently
        dropped. Do NOT re-verify facts — that's the other verifier.
    timeout_ms: 1800000
```

## Hard principles

Every report must follow these. They are not negotiable.

1. **Traceability** — every factual claim must trace to a specific source (URL, document name,
   date, section, data point). Use inline citations: `[Source Name, date]` or `[1]` with a
   references section. The reader should be able to verify any claim without re-doing the research.

2. **Synthesis, not concatenation** — the report must cross-reference, compare, and reconcile
   findings across tracks. If track A says X and track B says Y, the report should explain what
   X + Y means together — not just list them sequentially.

3. **Contradictions are explicit** — when sources disagree or data conflicts, the report must
   surface the contradiction, explain each side, and state the rationale for the chosen position.
   Never silently pick one side.

4. **Fact vs. analysis markers** — distinguish factual statements from analytical inference or
   speculation. Use markers where ambiguity exists:
   - `[F]` — established fact, directly from source
   - `[A]` — analysis, inference, or reasoned judgment by the author

   Not every sentence needs a marker — use them when the distinction matters for the reader's
   decision-making.

5. **Executive summary first** — the report opens with a concise summary of findings, conclusions,
   and recommendations. A reader who stops after the summary should still get the core message.
   Details follow in the body.

## Quality signals

These are the dimensions a verifier should check. They also serve as a self-review checklist
for the report author.

- **Core question answered** — does the report actually address what the user asked? A
  comprehensive-but-tangential report is a failure.
- **Evidence chain complete** — every conclusion or recommendation traces back to cited evidence.
  No orphan claims.
- **Key angles covered** — are there important perspectives, stakeholders, or data sources that
  were missed? The report should acknowledge gaps explicitly rather than pretend completeness.
- **Conclusions match evidence** — no over-extrapolation. If the data supports "likely" but not
  "certain", the language should reflect that.
- **Audience fit** — depth, terminology, and level of detail match the target reader. A board
  summary reads differently from an engineering deep-dive.
- **Depth fit** — the report is not merely accurate; it is sufficiently detailed for the user's
  request, elapsed team effort, and the depth contract set by the plan owner. A clean overview can
  still be a failed deep-research deliverable.
- **Upstream coverage** — when the report depends on multiple verified research tracks, it shows
  where each track's important findings were absorbed and what was intentionally excluded.

## Audience and depth

The plan creator should specify the target audience and expected depth level when writing the
synthesis task prompt. This drives formatting, terminology, and detail level:

- **Executive / decision-maker** — lead with recommendations, minimize jargon, focus on impact
  and trade-offs.
- **Technical peer** — include methodology, data, implementation details. Jargon is fine.
- **Mixed audience** — layered structure: summary for everyone, appendices for specialists.

If the audience is unspecified, default to the user's apparent context and call it out in the
report intro.

For deep research, the plan prompt should set a depth level (`brief`, `standard-report`,
`deep-report`, or `deep-engineering-handbook`) and this report must honor it. Do not compress a
deep-report request into a short summary just because the executive summary looks polished.

## Deep report required sections

When the task is deep research, a security/architecture audit, or a codebase/system handbook, the
report body or appendices MUST include the following unless the prompt explicitly marks one as N/A:

1. **Coverage matrix** — every upstream research track/source pack mapped to final report sections;
   note important excluded findings with the reason.
2. **Evidence inventory** — source list with file paths + line numbers, URLs + access dates,
   dataset/query names, or system records. Keep enough raw evidence that the reader can audit the
   report without re-running the whole team.
3. **Per-risk evidence chain** — for each risk/conclusion/recommendation: evidence, trigger or
   condition, impact, confidence, verification method, and mitigation/remediation path.
4. **Granular deep dives** — use the audience's granularity. Engineering reports should include
   entrypoints, data structures, call chains, boundary behavior, failure modes, and test coverage.
   Market/legal reports should include comparable granularity for sources, actors, rules, timelines,
   assumptions, and confidence.
5. **Open questions and uncertainty** — explicitly list unresolved gaps, contradictory evidence,
   and follow-up work.

### Over-compression guard

Executive summaries, visual pages, slides, or top-level dashboards may be added on top of the
report, but they must not replace the full evidence-backed body unless the user explicitly asks for
a summary-only artifact. If a conversion step turns a deep report into a webpage or deck, preserve
the full report content in sections/appendices and add visual navigation or summaries around it.

## Citation format

Inline citations are recommended for traceability. The exact format is flexible — pick one and
be consistent within the report:

- Bracketed reference: `[1]`, `[2]` with a numbered references section at the end
- Named inline: `[Gartner 2025 Q3 Report]`, `[AWS Pricing Page, 2025-04]`
- Parenthetical: `(source: internal metrics dashboard, pulled 2025-04-20)`

The goal is that a reader can find the original source. Don't over-cite obvious facts; do cite
anything that could be challenged.

## Format reference

The structures below are illustrative starting points. Adapt, merge, or restructure based on the
actual content and audience. Do not force content into a template that doesn't fit.

### Technical evaluation / comparison

```
Executive Summary
Evaluation Criteria and Methodology
Findings by Criterion
  ├── Criterion A: <comparative analysis>
  ├── Criterion B: <comparative analysis>
  └── ...
Trade-off Analysis
Recommendation
Appendices (raw data, test results, methodology notes)
References
```

Adapt when: comparing tools, platforms, architectures, or approaches. Add or remove criteria
sections as needed.

### Market / competitive analysis

```
Executive Summary
Market Overview and Scope
Competitive Landscape
  ├── Player A: positioning, strengths, weaknesses
  ├── Player B: ...
  └── ...
Trend Analysis (technology, regulatory, user behavior)
Strategic Implications
Recommendations
References
```

Adapt when: evaluating competitive positioning, market entry, or strategic direction. Combine
or split sections based on how many players and dimensions matter.

### Decision memo

```
Decision Required
Context and Background
Options Considered
  ├── Option A: description, pros, cons, risks
  ├── Option B: ...
  └── ...
Analysis and Comparison
Recommendation with Rationale
Implementation Considerations
References
```

Adapt when: a stakeholder needs to make a specific choice. Keep it concise — the purpose is
to enable a decision, not to demonstrate exhaustive research.

### Audit / compliance report

```
Executive Summary
Scope and Methodology
Findings
  ├── Finding 1: observation, evidence, risk level, recommendation
  ├── Finding 2: ...
  └── ...
Risk Summary (by severity)
Remediation Roadmap
Appendices (evidence, test logs, policy references)
References
```

Adapt when: reviewing code security, process compliance, data integrity, or operational
readiness. Severity classification and remediation priority are key — adapt the risk framework
to the domain.

### Engineering handbook / system deep dive

```
Executive Summary
Scope, Methodology, and Depth Contract
Coverage Matrix (research tracks → report sections)
Architecture Overview
Module / Layer Deep Dives
  ├── Entrypoints and ownership
  ├── Data structures / persistence
  ├── Runtime call chains and sequence notes
  ├── Boundary behavior and failure modes
  └── Tests / observability / operational hooks
Risk Register and Evidence Chains
Remediation Roadmap
Open Questions and Unknowns
Appendices
  ├── Evidence inventory / source index
  ├── Raw notes worth preserving
  └── Test and command evidence
```

Adapt when: researching a codebase subsystem so future engineers can maintain, extend, or audit it.
This is the default shape for deep engineering research unless a narrower deliverable is requested.
