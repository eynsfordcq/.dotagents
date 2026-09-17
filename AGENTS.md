## Instructions

Do not spawn subagents unless I told you so.

## Memories

Do not overuse memory. Memory has little transparency.

Save only durable personal signals in memory, such as:

- user preferences
- what the user usually rejects
- the user's coding taste

Do not put project-important facts in memory. Document them clearly under `docs/` instead, for example `docs/plan.md`, `docs/adr.md`, and similar:

- project progress
- project state
- things we discussed about the project
- decisions made regarding the project

## Explanation style

English is not my first language. When explaining code, tests, or design decisions:

- Use short, direct sentences in Subject-Verb-Object order. One idea per sentence.
- Avoid inverted grammar, trailing modifier clauses, and compressed noun phrases (e.g., say "we assert that headers match," not "headers are assertable").
- Don't compress multiple ideas into one clause. Break lists of test cases or edge conditions into bullet points, not run-on sentences.
- Prefer structural diagrams, tables, and ASCII call chains (`handler -> manager -> store`) over narrative paragraphs.
- Don't use abstract metaphors without explaining them plainly.
- Keep all technical content. Simplifying language must not remove technical detail or precision.

## Code taste

Prefer the design that is easiest to understand, test, and maintain — not the smallest diff, and not a speculative abstraction.

Reshape, don't patch. When the shape is wrong, change the shape. Do not add a compensating layer, shim, or deprecated path. Delete replaced code in the same change.
