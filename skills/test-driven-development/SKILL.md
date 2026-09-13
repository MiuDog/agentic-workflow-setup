---
name: test-driven-development
description: Author the minimal deterministic code checks for an accepted risky BUILD slice as an independent Test Author. Use for requested tests, regressions, persistence or transaction risk, cross-language contracts, or behavior humans cannot reliably verify; skip sensory evaluation and routine implementation.
license: MIT
metadata:
  version: "0.3.0"
---

# Test-driven development

Own necessary code checks as a fresh-context Test Author, separate from the product implementation worker. Turn accepted behavior and public contracts into the smallest executable protection set without redesigning the product or inspecting implementation details merely to mirror them.

## Confirm that a new test is necessary

Create or revise tests only when the user requests them or the slice involves an actual regression, data loss, persistence, transaction, undo, save behavior, cross-language contract, or behavior that humans cannot reliably judge from direct evidence. Reuse an existing check when it already protects the risk.

Do not add tests for coverage targets, trivial type guarantees, private implementation structure, or documentation-only changes. Do not use this skill merely because BUILD is occurring.

## Isolate the test-owner context

Read only the accepted behavior, public module contract, necessary test interface, existing test conventions, and assigned test paths. Do not read the implementation worker's reasoning or conclusions. Avoid reading current product internals unless a public test cannot be expressed otherwise, and record the specific reason when that exception is necessary.

Write only the test-owned paths assigned by the Task Packet. Do not modify product code, architecture, acceptance criteria, build policy, fixtures owned by another task, or another module. Record the resulting test diff or content hash before handing it to the implementation worker; that worker may read and run the tests but must not modify their requirements.

## Test observable code behavior

Choose the lowest test level that directly protects the accepted risk:

- unit checks for a deterministic invariant or conversion;
- contract checks for a public boundary shared across modules or languages;
- integration checks for persistence, transaction, lifecycle, or multiple real collaborators;
- end-to-end code checks only when a lower level cannot observe the required behavior.

Include the core success path, relevant accepted failure behavior, and the smallest state transition needed to catch the risk. Keep fixtures minimal and explicit. A failing assertion must explain an observable contract violation, not a preferred internal call sequence.

Do not design screenshot, golden-image, pixel-diff, animation-feel, visual-quality, UX-semantic, or LLM-judge tests. For sensory outcomes, provide only artifacts and reproduction instructions for human review. Accessibility states that have deterministic programmatic contracts may still receive code checks.

## Establish Red evidence

Run the narrowest command that exercises the new protection. Record whether it fails for the expected behavioral reason. A compilation error, missing fixture, broken harness, or unrelated failure is not valid Red evidence; fix the test-owned setup or report the blocker without weakening the assertion.

Hand off the protected paths, command, expected Red evidence, and test hash. If the test appears inconsistent with the accepted requirement, stop for the requirement owner or Test Author to resolve it. Do not let the implementation worker change the test to obtain Green.

After implementation, accept Green only from the same protected check against the current revision. Broader suites follow the task's Red → Yellow → Green fallback and are not an automatic completion ritual.

## Return the protection record

Report protected behavior, test paths and hash, exact command, Red or Green evidence, fixture ownership, and any unresolved contract question. Do not claim sensory acceptance or implementation correctness beyond the executed code checks.
