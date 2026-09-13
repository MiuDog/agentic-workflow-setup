---
name: incremental-implementation
description: Implement one accepted, implementation-ready module slice inside its Task Packet write boundary. Use for BUILD after product and architecture decisions are fixed; skip unresolved design, test-author-only work, and failure diagnosis.
license: MIT
metadata:
  version: "0.3.1"
---

# Incremental implementation

Own one BUILD slice as the implementation worker. Produce its observable result without reopening accepted product or architecture decisions, modifying protected tests, or expanding into another module.

## Require an executable Task Packet

Start only when the packet identifies the task and slice, module root, architecture revision, allowed reads and writes, forbidden paths, contract excerpts, acceptance evidence, test state, estimate, and coherent milestones.

When creating or validating the packet, use [the Task Packet schema](references/task-packet.schema.json). The packet must name a clean isolated worktree's `base_revision`; do not place mutable packet evidence inside that worktree unless it is already ignored.

- Treat unlisted paths as unavailable. Read only the supplied module sources, public contract excerpts, and build artifacts.
- Treat `architecture.md`, common specifications, test-owned paths, other modules, repository policy, and build configuration as read-only unless the packet explicitly assigns a narrower writable file.
- Reject stale packets when the recorded architecture or contract revision no longer matches current truth.
- If missing information changes acceptance or requires a forbidden write, return one structured blocker. Do not fill the gap by searching the repository or inventing a contract.

## Implement the current slice

Follow the accepted dependency direction and public interfaces. Make the smallest coherent implementation that completes every acceptance item assigned to this slice; do not build later slices, P3 work, speculative abstractions, or compatibility not named by the contract.

Use established module conventions and direct dependencies. Extract a new responsibility only when the current slice has a distinct invariant, boundary conversion, lifecycle, or accepted variation pressure. A familiar domain name is not evidence that a parser, DTO, entity, repository, service, or framework layer is required.

Do not alter requirements, test assertions, fixtures, baselines, allowlists, skips, or architecture documents to make the implementation pass. If an accepted interface is insufficient, stop and return an Architecture Change Request containing the conflict, required capability, affected contract, and minimal reproducer. Do not prepare an out-of-scope patch.

## Preserve worker autonomy

Complete the predefined milestones without routine questions or per-file approval. Emit one checkpoint only after a milestone has produced its promised observable outcome. Include milestone ID, evidence, changed paths, cumulative token and elapsed-time usage, estimate deviation, and the next milestone.

Send a mid-task blocker only for a missing acceptance-changing decision, forbidden-path requirement, insufficient public contract, or unauthorized external effect. New direction invalidates the packet: stop, let the owner update current source files, and resume only from a newly issued revision.

## Route code checks by state

Use only deterministic code evidence. Existing tests may be executed, but necessary new tests remain owned by the independent Test Author.

1. If the packet contains a reproducible Red failure, run its smallest reproducer first and rerun that same scope after the fix.
2. Otherwise verify the changed Yellow scope through the affected test file, public module entry, and necessary lint, typecheck, build, or contract check.
3. Stop after Red and Yellow are resolved. Do not test unchanged Green scope unless an unresolved error remains and points to a specific Green dependency.
4. Run the full suite only when it is an existing release gate, the user explicitly requests it, or evidence shows the affected boundary cannot be isolated.

Visual quality, interaction feel, perceived usability, and other sensory results stay `human-pending`. Produce the requested artifact or reproduction path without creating a visual score, golden, snapshot, or LLM judgment.

## Close with scope evidence

Before completion, compare actual changed paths with `allowed_write`. Any outside modification or protected-path change is a hard failure and cannot be excused in prose.

Run the bundled scope checker from this skill directory against the actual worktree:

```bash
node scripts/check-task-scope.mjs --packet <task-packet.json> --repo <isolated-worktree>
```

The checker reads Git changes since `base_revision`, includes untracked files, accepts only exact paths or trailing `/**` tree rules, and rejects architecture, forbidden, cross-module, and other unlisted writes. It verifies writes, not read access; strict reads still require a sandbox or a workspace containing only `allowed_read` inputs.

Return only changed paths, acceptance evidence, code-check results, scope-gate result, actual token and elapsed-time usage, and unresolved blockers. Do not append a work diary or restate the full packet.
