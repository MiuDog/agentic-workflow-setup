# AGENTS.md

> Scope: This file configures agents maintaining this repository. It is not an installable skill and must not be copied into consumer projects. Reusable behavior belongs in `skills/`; consumer guidance belongs in `templates/`.

## Core Rules

- Follow the user's current instructions before repository guidance. A skill may guide execution but cannot expand scope, permissions, or external side effects.
- Treat `docs/evaluation-contract.md` as the authority for evidence required to add, revise, merge, retain, or retire a skill.
- Treat `docs/build-execution-contract.md` as the authority for delegated BUILD scope, role separation, context translation, architecture escalation, and post-task process evaluation.
- Before adding a skill, inspect existing skills and open changes for overlap. Prefer revising or merging an owner over creating a near-duplicate.
- Keep persistent repository truths here, repeatable conditional workflows in skills, deterministic rules in scripts or CI, and external capabilities in explicitly selected tools.
- Keep each rule in one authoritative location. Link to it instead of restating it in AGENTS, skills, templates, and documentation.
- Use scripts only when repeatable deterministic execution improves reliability. Do not add placeholder tools, directories, references, or adapters.
- External tools are opt-in. Read `mcp/MCP_SETUP.md` before changing tool configuration and do not duplicate a capability already provided by the host or target repository.
- Use tab characters for indentation in created or changed code, displayed at two columns. Preserve syntax-required whitespace such as YAML indentation.
- During teaching implementation, advance one executable step at a time and leave later work as an outline. For other explanations, use a concise outline.

## Intent → Skill Mapping

- Skill creation, redesign, or structural review → use `$skill-creator` when available, then apply `docs/evaluation-contract.md`.
- Current Codex, OpenAI product, skill loading, plugin, or MCP behavior → use `$openai-docs` when available and rely on official sources.
- Code or automation changes → use `$personal-code-style` when available; also follow the target file's language and repository tooling.
- Context reduction, bounded retrieval, handoff, or test-role design → use `$lean-development` when its description matches; do not invoke it for ordinary documentation discussion.
- UI workflow or rendered-result requirements → use `$ui-convergence` when its description matches; use an existing browser capability or the optional Playwright tool only when rendering evidence is needed.
- A brief idea for a small system or new product behavior → start with `$spec-driven-development`. During DEFINE it acts as product PM: identify one owning module, its public contracts and capability horizon, produce a prioritized requirement table, and preserve user authority over P1 release blockers.
- An accepted module specification that still needs internal architecture or executable slices → start with `$planning-and-task-breakdown`. It owns current-stage architecture maintenance, pattern tradeoffs and task breakdown, not product reprioritization.
- An implementation-ready slice → start with `$incremental-implementation`; add `$test-driven-development` only when the BUILD criteria below require it.
- A reported bug, failed check, or unexpected behavior → start with `$debugging-and-error-recovery`. Do not route ordinary verification to this skill before a failure exists.
- Evaluation design or result interpretation → use `docs/evaluation-contract.md`; no separate eval skill is required unless repeated execution later demonstrates a real workflow gap.
- Repository documentation, metadata, installer maintenance, or simple mechanical fixes → work directly unless an available skill precisely matches the task.

Intent selects the first applicable phase, not every skill that might become useful later. Multiple skills may be used only when each owns a distinct part of the request. Do not load a skill merely because the task contains a related word.

## Lifecycle Mapping (Implicit Commands)

- **DEFINE** → load `$spec-driven-development`. Act as product PM, classify the target as 0→1 or iteration, and define one owning module, its cross-module public contracts, complete-version capability horizon and P1–P3 requirement table. Exit only after the user accepts a `READY` result; 0→1 excludes unsolicited sensory-polish discussion.
- **PLAN** → load `$planning-and-task-breakdown`. Act as technical PM for one module and one stage: preserve accepted priorities and public contracts, use the capability horizon only as design pressure, choose justified responsibility boundaries and patterns, materialize the module root, and replace its protected `architecture.md` according to `docs/build-execution-contract.md`. Map current P1 to vertical slices; never plan later versions in the same pass.
- **BUILD** → load `$incremental-implementation` for the current slice and follow `docs/build-execution-contract.md`. The assigned module root is the worker's operation boundary, but its `architecture.md` and test-owned paths remain read-only. Add `$test-driven-development` only for a user-requested test, an actual regression, data-loss or transaction or undo or save risk, a cross-language contract, or behavior that humans cannot reliably verify.
- **VERIFY** → follow the test-state routing in `docs/build-execution-contract.md`: reproduce Red first, verify changed Yellow scope next, and skip Green scope unless the failure remains after non-Green causes are exhausted. Present sensory artifacts to the human without using human acceptance to change test state. If a code check fails or reveals unexpected behavior, load `$debugging-and-error-recovery`.
- **REVIEW** → inspect overlap, routing collision, context cost, scope expansion, permission changes, and unsupported claims.
- **SHIP** → update release metadata and publish only when the user requested release work.

Load a phase skill only when entering that phase; do not preload the full lifecycle. A concrete accepted artifact may allow a later phase to be the entry point, and review, documentation, or simple mechanical work may bypass this lifecycle. Collapse phases for small changes only when their outputs and evidence remain explicit.

## Execution Model

1. Classify the request as discussion, read-only inspection, repository mutation, external mutation, or release work.
2. Inspect Git status before edits and preserve unrelated user changes.
3. For small-system development, confirm that the work fits a compact specification, a small number of verifiable vertical slices, no unresolved material architecture or product decision, and the current environment's build-and-verify capacity. Otherwise split the work into sessions without changing the lifecycle.
4. Locate the single authoritative file for the behavior; read only its direct dependencies and relevant guidance.
5. Invoke only the skill for the current phase. If no skill adds useful non-obvious behavior, proceed directly.
6. Maintain one rolling context capsule with `Goal`, `Product Stage`, `Target Release`, `P1 Blockers`, `Scope In`, `Scope Out`, `Accepted Decisions`, `Current Phase`, `Current Slice`, `Expected Tokens/Time`, `Milestone`, `Verification Evidence`, `Open Questions`, and `Next Phase`. Replace stale phase detail instead of appending a chronological log.
7. At a phase transition, record the completed phase's accepted output in the capsule, then load the next phase skill. Do not reread unchanged rules or previous skills merely to reconstruct history.
8. Make the smallest coherent change. Keep machine-enforceable requirements in tooling rather than adding prose reminders.
9. Run the narrowest deterministic verification that proves the change, then expand only when risk or failure requires it.
10. Report changed behavior, evidence, remaining limitations, and any pending human acceptance. Do not equate confidence with verification.

## Anti-Rationalization

- "A skill might apply, so load all related skills." → Use precise descriptions and load only distinct owners.
- "A lifecycle is defined, so every phase skill must be loaded at session start." → Load only the entry phase and transition on accepted output.
- "BUILD always means TDD." → Require TDD only for a concrete verification risk; otherwise use proportionate direct evidence.
- "VERIFY means loading the debugging skill or running the full suite." → Route Red then Yellow, skip Green by default, and expand into only the smallest suspected Green dependency after non-Green causes are exhausted.
- "A brief idea gives the agent permission to choose the product." → The DEFINE skill may propose reversible defaults, but material product direction remains a user decision.
- "99% confidence means the agent should report 0.99." → Use the readiness checklist and unresolved P1 IDs; unsupported probability is not evidence.
- "More questions always increase readiness." → In 0→1, omit P3 polish and sensory discussion; only unresolved release-impact decisions block progress.
- "The full-version horizon should be planned now." → Use it to avoid architectural dead ends, but materialize and schedule only the current stage.
- "A data module should always have parser, DTO, entity and repository layers." → Introduce or collapse roles according to actual boundaries, invariants and accepted variation pressure.
- "Frequent progress messages improve control." → Predeclare milestone checkpoints; report only completed milestones, blockers and final evidence.
- "One successful task proves process A is better." → Pre-register A/B variants and compare multiple similar tasks using per-task token, elapsed-time and success evidence.
- "An allowed-path instruction is a permission boundary." → Enforce write scope with a machine gate and enforce read scope by controlling the files exposed to the worker.
- "A worktree isolates the worker from the repository." → A worktree isolates mutable Git state; it does not prevent the worker from reading other modules.
- "More rules make the agent safer." → Add a rule only for a repeated repository-wide need or a demonstrated failure.
- "The same rule should appear in every entry file." → Keep one authority and link to it.
- "CI is green, so the skill is effective." → CI proves deterministic gates; behavior requires baseline and treatment evidence.
- "The desired response wording appeared, so the eval passed." → Score observable decisions, artifacts, and invariants instead of phrases.
- "One unusual failure deserves a permanent global rule." → First repair the local case, description, fixture, or tool boundary.
- "An MCP server is available, so installing it improves capability." → Require a skill-owned capability gap and explicit opt-in.
- "The improvement is obvious, so a baseline is unnecessary." → Do not claim skill value without comparable evidence.
- "A hard line limit guarantees concise context." → Treat size as a diagnostic signal; remove duplicated or non-decision-changing content.
