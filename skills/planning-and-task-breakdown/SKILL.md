---
name: planning-and-task-breakdown
description: Design or maintain one module's architecture and current-stage slices from an accepted READY specification. Use for architecture or task breakdown; skip unresolved product intent and implementation-ready work.
license: MIT
metadata:
  version: "0.3.1"
---

# Planning and task breakdown

Own PLAN as the technical PM for one module and one target stage. Preserve the accepted product priorities and public contracts while choosing the smallest architecture that supports the current stage without blocking accepted later capabilities.

## Require a READY module specification

Start only when DEFINE provides one owning module, current target stage, P1–P3 requirements, public interfaces to other modules, capability horizon, and READY evidence.

- Return missing product behavior or P1 decisions to DEFINE. Do not silently complete or reprioritize them.
- Treat other modules as public contracts. Do not inspect or redesign their internals to make this module easier.
- Read the module's existing `architecture.md`, current public surface, relevant user conventions, and one closest implementation example. Expand retrieval only when a concrete conflict remains.

## Use the horizon without planning it

The capability horizon reveals likely variation points and migrations. Use it to avoid a current decision that would make an accepted later capability unreasonably expensive, but plan exactly one target stage.

- Do not create future modules, empty layers, speculative interfaces, or later-version slices.
- Record later pressure beside the affected current decision; do not turn the horizon into a backlog.
- Prefer a simple current design with a replaceable seam over a generalized framework.

## Design from responsibilities

Identify distinct reasons to change, owned invariants, boundary conversions, and dependency direction before naming patterns. Evaluate the smallest viable design against encapsulation, readability, accepted extension pressure, test seams, migration cost, and consistency with the user's established conventions.

Patterns are consequences, not required layers. For a data-management module, for example:

- introduce a parser when external syntax must be converted and rejected at a boundary;
- introduce a DTO when a transport or storage shape must not become the domain model;
- introduce an entity or value object when identity, lifecycle, or invariants need an owner;
- introduce a repository when domain behavior must be independent of persistence or multiple sources are accepted requirements.

Collapse roles when their change reasons and invariants are the same. Add a boundary only when it prevents a concrete coupling, supports an accepted horizon item, or materially improves comprehension. Do not apply a pattern solely because the domain resembles a textbook example.

When two designs remain credible, compare only their material tradeoffs and choose one. Record why the rejected design is worse for this module and stage; do not keep parallel architectures alive.

## Maintain the module contract

Create the accepted module root if it does not exist and write or replace its protected `architecture.md` as current truth. Include only decision-changing information:

- purpose, non-goals, current target stage, and capability horizon;
- owned paths and public interfaces to other modules;
- internal responsibility map and dependency direction;
- invariants, lifecycle, error ownership, and allowed or forbidden dependencies;
- chosen patterns with concrete reasons and rejected material alternative;
- current-stage slices, acceptance evidence, test state, and protected paths.

Do not append a decision diary. Cross-module contract changes require the Architecture Steward to update the common specification and all affected module contracts before this plan continues.

## Plan one stage

Turn only the current target stage into ordered vertical slices. Each slice must produce observable value, remain inside the module root, name its allowed paths and public contract, and have deterministic acceptance evidence or an explicit human-pending artifact. Do not schedule P3 or later-version capability work.

Before dispatch, attach a per-task estimate based on comparable completed tasks: expected token range, expected elapsed-time range, reference task IDs, model and tool assumptions, and whether the estimate is historical or cold-start. Do not report false precision when history is sparse.

Predeclare small coherent milestones inside the slice. Each milestone names its outcome, evidence, cumulative token/time expectation and anomaly threshold. An implementation worker reports one structured checkpoint only after each milestone completes; milestones must represent usable progress rather than individual files or routine commands.

Mark PLAN `READY` only when every current P1 maps to an owning responsibility, public contract if applicable, slice, and acceptance evidence; dependency direction is coherent; each introduced abstraction has a concrete reason; and the next slice has no unresolved P1 architecture decision. Otherwise return `NOT READY` with exact blocking P1 IDs or architecture decisions and do not begin BUILD.
