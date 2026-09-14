---
name: simplify
description: Apply simple, maintainable design when writing, fixing, reviewing, or simplifying code.
argument-hint: "[lite|full|ultra]"
---

# Simplify

Choose the design that is easiest to understand, test, and maintain. Finish the user's requested outcome. Do not trade required behavior for a shorter diff.

## Decide what to change

Read the task and trace the code paths it affects. For a bug, inspect the callers and fix the cause where the responsibility belongs. For a cleanup, check production callers, public contracts, tests, and docs before removing code. An unused-looking API may still be an intended external contract.

Prefer, in order:

1. Remove speculative behavior that has no real consumer.
2. Reuse code within the same layer and ownership.
3. Use the standard library or a native platform feature.
4. Use an existing dependency when it covers the behavior cleanly.
5. Add a dependency only when it clearly reduces the code and maintenance left behind.
6. Write the smallest clear implementation in the right place.

Keep distinct responsibilities distinct. For example, `handler -> service -> store` should keep service decisions out of the handler. When the structure is wrong, reshape it and delete replaced code. Avoid a shim, duplicate representation, or new configuration for a single fixed choice.

## Check the result

Preserve explicit requirements, input validation, security, accessibility, and error handling that prevents data loss. Treat public API, stored-data, and wire-format changes as behavior changes. Make them only when the request authorizes them and verify affected callers.

Run checks that can catch failures relevant to the change. Add or update tests when they protect behavior that could regress. Do not add a test or demo to meet a fixed count.

Explain the change and any material trade-off in the amount of detail the user needs. If the task is an audit rather than an implementation, support each proposed removal with caller evidence and say what behavior would be lost.

## Intensity

- **lite:** Apply the user's requested design. Mention a simpler option when it matters.
- **full (default):** Remove needless complexity within the requested scope.
- **ultra:** Challenge speculative requirements, but still complete the user's explicit request and preserve required behavior.

An intensity applies to the current task. The user can change it with `/simplify lite|full|ultra`.
