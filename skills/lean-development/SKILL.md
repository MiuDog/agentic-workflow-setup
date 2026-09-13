---
name: lean-development
description: Reduce controllable development context through current-truth capsules, bounded retrieval, low-coordination delegation, and evidence-scaled verification. Use for long sessions, handoffs, context pressure, or workflow-cost reduction; skip ordinary small edits that already have sufficient context.
license: MIT
metadata:
  version: "0.3.0"
---

# Lean development

Preserve the complete requested outcome while reducing context reconstruction, coordination, and unnecessary verification. Do not substitute a smaller feature merely because it is cheaper.

## Bound controllable context

Keep agent-added context near or below 6,000 tokens when the host permits it. Count injected rules, summaries, recent turns, examples, source excerpts, and tool output. Measure with the target tokenizer when available; otherwise state that the value is estimated and leave margin.

Maintain one rolling current-truth capsule containing the goal, target release, active module and slice, accepted decisions, scope, protected paths, expected token/time range, completed evidence, blockers, and next phase. Replace stale detail instead of appending a chronological log. Preserve earlier requirements that remain valid.

Refresh the capsule at a phase boundary, context pressure, or ownership handoff—not after every message. A new session reads project instructions, the capsule, the active module contract, and only the sources required for the current slice.

## Retrieve by demonstrated need

Start with file or symbol search, then inspect the current owner, direct dependency, and one closest example. Default retrieval to a few relevant excerpts and expand only when a concrete contradiction or missing interface remains.

- Do not load every skill, repository file, historical plan, or superseded decision.
- Do not create a vector database or paid embedding dependency when text and symbol search are sufficient.
- Keep stable policy, task variables, and retrieved evidence in separate sections.
- Keep one active specification and one current handoff per feature; Git preserves history.

Reuse established entry points, public contracts, and lifecycle decisions. A small cross-layer change does not automatically justify new architecture research. When the same boundary is repeatedly reconsidered, repair its authoritative contract instead of writing another explanation.

## Make coordination earn its cost

Delegate only a bounded unit whose independent execution saves more than rebuilding context and coordinating it. Give the worker one complete Task Packet with the goal, necessary sources, allowed and protected paths, acceptance evidence, estimate, and coherent milestones.

Do not delegate file discovery, one command, routine summaries, or ceremonial review. The worker proceeds autonomously and emits only milestone checkpoints, a structured blocker when necessary, and the final evidence. Avoid repeated questions, acknowledgements, and follow-up prompts when no anomaly exists.

Use independent roles only where separation changes reliability. Necessary new tests belong to a fresh Test Author using `test-driven-development` when available; the implementation worker may run but not weaken protected tests. Process evaluation inspects scope, evidence, communication, and cost rather than redoing product or code decisions.

## Scale verification from evidence

Do not add or run tests automatically after every edit. Use direct readback or static checks for mechanical documentation and metadata changes. Add code tests only for a user request, actual regression, data loss or persistence risk, transaction or undo behavior, cross-language contracts, or behavior humans cannot reliably inspect.

When a coherent executable path is ready, run the highest-level local check that directly covers the changed behavior once. If it passes, stop. If it fails, narrow along the causal path, fix, and rerun the failed scope plus the necessary owning check.

Follow the task's Red → Yellow → Green fallback. Do not run unchanged Green scope or the full repository suite without an existing release gate, explicit request, or evidence that the affected boundary cannot be isolated. Keep build, runtime, code-test, and sensory evidence separate; visual quality and interaction feel remain human decisions.

## Hand off current truth

Report only changed behavior, authoritative files, verification evidence, remaining limitations, actual versus expected token/time use, and the next executable step. Do not include discarded alternatives, full conversation history, or a work diary.

When the platform cannot actually trim injected history or enforce read permissions, say so. A short capsule, worktree, sparse checkout, or current working directory can reduce exposure or mutation, but none alone proves a hard context or filesystem boundary.
