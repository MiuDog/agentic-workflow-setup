---
name: debugging-and-error-recovery
description: Diagnose a reproducible failed code check or unexpected program behavior, then make an authorized bounded fix using Red → Yellow → minimal Green fallback. Use only after a failure exists; skip routine verification, initial implementation, and sensory-quality review.
license: MIT
metadata:
  version: "0.3.1"
---

# Debugging and error recovery

Own failure diagnosis after a concrete code failure exists. Reproduce the symptom, identify the smallest supported cause, and either report the diagnosis or make the authorized in-scope fix without weakening requirements or expanding verification indiscriminately.

## Establish Red

Record the failing command or reproduction, current revision, expected behavior, actual behavior, and affected module. Run the smallest existing reproducer first.

- A report, screenshot, or human complaint becomes Red only after it maps to reproducible program behavior or a failed deterministic code check.
- A compilation, environment, permission, dependency, test-harness, and product-behavior failure are different hypotheses; classify the evidence before editing.
- If the failure no longer reproduces, report the environment and evidence checked. Do not invent a fix or manufacture Red.

Do not change an assertion, fixture, golden, skip, allowlist, baseline, requirement, or expected result to convert Red to Green. Suspected test errors return to the independent Test Author or requirement owner.

## Trace the smallest causal path

Inspect the failed boundary, changed Yellow scope, direct callers, and direct dependencies. Form a falsifiable cause statement and choose the cheapest observation that can disprove it. Do not scan unrelated modules, rewrite nearby architecture, or stack speculative fixes.

Respect the current Task Packet and module contract. If the cause requires another module, a forbidden path, or a public-contract change, stop and return an Architecture Change Request with the conflict and reproducer. Do not use debugging as permission to cross the module boundary.

When the user requested diagnosis only, stop after explaining the supported cause and next verification. When a fix is authorized, make the smallest coherent change inside the allowed paths and preserve current public contracts.

## Expand checks by evidence

1. Rerun the original Red reproducer after the change.
2. Verify the directly affected Yellow paths and necessary module entry, lint, typecheck, build, or contract check.
3. Stop when Red and Yellow pass and no failure remains.
4. Enter Green fallback only when the failure persists after non-Green causes are excluded and evidence points to a specific unchanged dependency.

Before Green fallback, record the excluded Red and Yellow scope, remaining error, and why the named Green dependency is plausible. Test only that smallest dependency. A failing Green dependency becomes Red; a passing one stops that branch of investigation. Do not replace causal reasoning with a full repository suite.

Run the complete suite only when it is an existing release or CI gate, the user explicitly requests it, or evidence proves the affected boundary cannot be isolated. Do not disable checks, relax thresholds, or repeat an unchanged blocked command.

Sensory quality remains outside code-test state. Preserve screenshots, recordings, or reproduction steps for human review; only a reproducible program defect enters this workflow.

## Report recovery evidence

Return the root-cause statement and supporting evidence, changed paths if authorized, original Red result, post-fix result, Yellow verification, any Green fallback and its reason, scope-gate result, and remaining uncertainty. Separate diagnosis from facts not yet verified.
