---
name: spec-driven-development
description: Define an unresolved product or small-system idea as one accepted current specification before architecture or implementation. Use for new behavior with open product decisions; skip accepted or implementation-ready work.
license: MIT
metadata:
  version: "0.3.0"
---

# Spec-driven development

Own the DEFINE phase as the product PM. Convert the user's compressed idea into a compact requirement table, expose only choices that materially change the product, preserve the user's authority over them, and give PLAN current truth without the original conversation.

## Establish current truth

1. Locate the project's current specification convention and relevant existing behavior. Read only the closest current spec, module contract, and direct evidence needed to understand the requested change.
2. Separate the desired outcome from a proposed implementation. Treat the user's proposed mechanism as a constraint only when they explicitly require it.
3. Maintain one authoritative current specification. Replace superseded decisions in place; do not append corrections that require later agents to reconstruct history.

## Resolve only material decisions

A decision is material when alternatives change observable behavior, scope, data ownership, public interfaces, irreversible effects, privacy or security posture, meaningful cost, or human acceptance criteria.

- Present material choices together, with consequences and a recommendation when evidence supports one. Do not invent product direction to avoid asking.
- Choose reversible implementation details locally when they do not affect acceptance. Record only assumptions that a later phase must know.
- Search project terminology and current artifacts before asking what an existing term means.
- Do not treat silence as approval for a material product choice, destructive action, publication, purchase, or permission expansion.

## Set stage and priority

Record the product stage before prioritizing:

- **0→1**: establish one complete, correct core flow. Do not ask about subjective polish such as visual taste, animation feel, delight, perceived smoothness, or optional UX refinement. Functional UI states, operability, accessibility, and feedback needed to complete the flow are still in scope.
- **Iteration**: refine an already usable flow. Discuss sensory or experiential quality only when the user makes it an objective for this iteration.

Assign each requirement or unresolved decision exactly one priority:

| Priority | Meaning | Phase effect |
| --- | --- | --- |
| P1 | Release blocker: core flow, correctness, data safety, security/privacy, irreversible effect, public contract, or another condition without which the target release must not ship | Every P1 product decision must be accepted before DEFINE exits; every P1 must have an owner and acceptance evidence before PLAN exits |
| P2 | Important follow-up that improves completeness or reduces known risk but does not block the target release | May proceed with an accepted default, owner, and target iteration; escalate to P1 if it changes a P1 contract or release condition |
| P3 | Deferred option, optimization, preference, exploration, or polish | Keep out of the current plan by default; record briefly without expanding discussion |

Priority expresses release impact, not implementation order, effort, or emotional importance. Do not promote speculative edge cases to P1 merely to increase confidence.

## Write the accepted specification

One DEFINE artifact owns one semantic module. Name its owning module, its responsibility boundary, and the public behavior it provides. If the requested flow touches other modules, define only the inputs, outputs, ownership, failure behavior, and compatibility expected at those public interfaces; do not design either module's internal structure.

Capture a capability horizon for the module: the accepted complete-version capabilities and their intended versions or stages. This horizon informs later architecture tradeoffs but is not approval to plan or implement future versions. Keep unaccepted possibilities separate as deferred ideas.

Use the project's format when it exists. Otherwise keep a short header with owning module, stage, target release, capability horizon, and readiness, followed by one requirement table:

| ID | Target version | Priority | Requirement or decision | Observable acceptance | Status |
| --- | --- | --- | --- | --- | --- |

Use stable IDs. Status is `accepted`, `open`, or `deferred`; an `open` P1 blocks transition. Add prose only for information that does not fit the table:

- **Goal and motivation**: the observable outcome and why it matters.
- **Scope in / scope out**: explicit boundaries without speculative future work.
- **Behavior**: user-visible flows, state transitions, inputs, outputs, and negative paths.
- **Accepted decisions**: only current decisions that change downstream work.
- **Constraints and contracts**: existing interfaces, ownership, compatibility, permissions, and external effects that must remain true.
- **Module interfaces**: semantic requests, responses, events, ownership, and failure behavior shared with other modules; internal types and design patterns remain undecided.
- **Acceptance evidence**: deterministic code checks separated from any explicitly requested sensory or experiential review. In 0→1, do not create sensory acceptance criteria.
- **Open questions**: unresolved material decisions only.

Keep architecture layout, task slicing, model assignment, and implementation procedure out of DEFINE unless they are themselves explicit product constraints. Those belong to later phases.

## Translate for handoff

Expose the accepted specification, necessary source locations, and unresolved decisions to the next phase. Do not forward raw discussion, discarded alternatives, private notes, or chronological decision history. A later worker should receive current truth rather than the human conversation that produced it.

## Apply the 99% readiness gate

Do not invent a numeric confidence score. Treat “99% confidence” as an operational near-certainty gate. Mark DEFINE `READY` only when all conditions are evidenced:

- the user accepted the current goal, stage, scope, target release, and every P1 decision;
- each P1 maps to observable acceptance, including the core success flow and relevant failure behavior;
- current sources do not contradict the specification;
- external facts that could invalidate a P1 are verified, or the item remains an explicit P1 blocker;
- no P2 can silently change a P1 interface, ownership boundary, or release condition;
- remaining uncertainty is only implementation detail, P2 with an accepted disposition, or P3.

If any condition is missing, report `NOT READY`, list the exact blocking P1 IDs, and remain in DEFINE. The gate is not a demand to specify every future edge case or discuss P3 polish.

Exit DEFINE only after the user accepts a `READY` specification. Do not begin PLAN or BUILD merely because a plausible default exists.
