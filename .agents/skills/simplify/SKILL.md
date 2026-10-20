---
name: simplify
description: Simplify code design. Use when user says simplify, be lazy, YAGNI, or shortest path, or complains about over-engineering, bloat, or boilerplate in a coding task. Do not use for non-coding requests.
---

# Simplify

The best code is the code you never write. The next best is code that is easy to understand, test, and maintain, and that sits in the package that owns it.

Stay in this mode for the rest of the session until the user says "stop simplify" or "normal mode".

## Boundaries come first

Simplicity is measured across the whole codebase, not in the size of one diff. A dependency edge between packages is a cost that outlives the change that added it, so placement beats shortness and beats reuse.

- **Don't reuse for the sake of reusing.** Before importing an existing helper, ask whether your package should depend on the package that owns it. A repository package importing a two-line JSON helper from an API package couples persistence to transport and invites a circular import. Write the two lines locally instead.
- **Some duplication is fine.** A small, stable snippet copied into two packages is cheaper than an edge that points the wrong way. Extract shared code only when it has a natural owner that both callers may already depend on, such as a low-level utility package.
- **Repeated logic signals a missing owner.** When copies multiply, grow complex, or encode a rule that must stay consistent (name validation, formatting conventions), stop copying and redesign: extract a dedicated package low in the dependency graph that every caller can import, and replace all copies in the same change. Trivial, stable snippets can stay duplicated.
- **Dependencies point one way.** Follow the existing direction, e.g. `handler -> service -> store`. Never make a lower layer import a higher one to save a few lines.
- **Logic lives with its responsibility.** Don't push service logic into a handler to avoid a new file, and don't pile validation or a second concern onto a shared function just to keep the diff small.
- **One line is good only if it still does one thing.** Don't collapse distinct steps into a clever expression.

## The ladder

Read the task and the code it touches, and trace the real flow end to end. Then take the first option that works:

1. **Should this exist at all?** If the need is speculative, skip it and say so in one line.
2. **Does the owning package already do it?** Reuse it if the dependency is allowed under the boundaries above. A similar helper elsewhere does not count.
3. **Does the standard library do it?** Use it.
4. **Does the platform do it?** A unique index or foreign key over application checks, a DB transaction over hand-rolled rollback, broker retries and dead-letter queues over custom retry loops, framework middleware over per-handler code, Kubernetes probes or cron over in-process schedulers.
5. **Does an installed dependency do it?** Use it.
6. **Can the existing code get shorter without merging separate jobs?** Shorten it.
7. **Otherwise,** write the minimum code that works, in the package that owns it.

## Bug fixes

A bug report describes a symptom. Find the root cause and fix it where the responsibility lives. Check every caller of the function you touch; a guard added to the wrong shared function is a second bug.

## Adding a dependency

A new package can be a valid simplification, but only when it deletes more than it adds:

- Name exactly what the package covers. Behavior it doesn't cover counts against it.
- Check maintenance, adoption, and transitive footprint. Prefer builtins when they exist.
- Count the net change: implementation, tests, and docs removed, minus the glue you still need. A wrapper that moves the same complexity elsewhere is not a win.
- Never add a dependency for what a few clear lines already do.

## Finding things to remove

A real simplification removes, folds, or demotes something concrete:

- A public method, event, config key, helper, or package with no production consumer.
- An API that only tests or docs use, where the behavior they pin doesn't matter.
- Two representations of the same fact.
- Interface methods every implementation must provide but nobody calls.
- A separate package that exists only for test, demo, or support code.
- Speculative generality with no product owner.
- Invariants, rollback paths, or tests that exist only to protect an unused API.
- Hand-rolled code that a builtin or healthy package already provides.

Prove each candidate before changing code. Search for the exact symbol, the method name with and without its receiver, event names, config keys, package names, and wire strings. Sort every consumer into production (shipped code, runtime scripts, loaders, config), non-production (tests, docs, snapshots, comments), or ambiguous (examples and scripts that may be smoke paths; inspect them).

Drop or downgrade the candidate when:

- A production caller exists, so removal would be a product decision rather than a cleanup.
- A recorded decision justifies the API and the new evidence doesn't outweigh it.
- Removal causes unrelated churn without shrinking the API or required behavior.
- The idea is correct but tiny, such as one unused import or "this looks complex" with no call-site proof. Leave an inline TODO or drop it.

## Defaults

- No unrequested abstractions: no interface with one implementation, no factory for one product, no config for a value that never changes.
- No scaffolding "for later".
- No defensive guards for cases that can't realistically happen: nil or null checks on receivers, injected dependencies, or arguments the caller always sets; re-validating input a trust boundary already validated; catch-all handlers around code that can't fail. Guard only where a failure is plausible.
- Prefer deleting to adding, and boring to clever.
- Given two equally short standard-library options, choose the one that handles edge cases correctly.
- Mark a deliberate shortcut with its limit and upgrade path: `# simplify: global lock; switch to per-account locks if throughput matters`.
- Delete comments that restate the code or describe behavior owned elsewhere. Keep docs at the level that owns them.

## Never simplify away

Input validation at trust boundaries, error handling that prevents data loss, security measures, accessibility basics, package boundaries and ownership, or anything the user explicitly asked for. If the user insists on the full version, build it without re-arguing.

Never shorten the reading. The ladder shortens the solution, not your understanding of the problem; skipping comprehension to ship a small diff ships a confident wrong fix.

Non-trivial logic (a branch, a loop, a parser, a money or security path) leaves one runnable check behind: the smallest test or `assert`-based self-check that fails if the logic breaks. Trivial one-liners need no test.

## Small cleanup versus design change

- **Small local cleanup:** leave an inline note with a stable tag, e.g. `TODO(double-default)`, saying what to change and why it's safe.
- **Durable design change** (removing, folding, or demoting an API, event, config key, or package): write a short proposal concrete enough to become a PR. Cover the problem and consumer evidence, the exact change including tests and docs, what we give up, acceptance criteria, and risks. Merge it into an existing proposal if one overlaps.

## Output

Code first, then at most three short lines on what you skipped and when to add it back: `[code] → skipped: X, add when Y.` If the user asks for a report or walkthrough, give it in full.

Run the relevant checks for the touched area; for docs-only changes, run lint and `git diff --check`. In the closing summary, state what you changed, what you deliberately left out, and which checks passed.
