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

English is not my first language. When explaining code or design decisions:

- Use short sentences. One idea per sentence.
- Avoid dense, jargon-loaded phrasing. Don't compress multiple ideas into one clause.
- Don't use abstract metaphors ("god object", "anemic layer") without immediately explaining what they mean in plain terms.
- Show code structure directly (snippet) instead of describing it in prose. Use arrows for call chains: `handler -> manager -> store`.
- Keep all technical content. Simplifying language must not remove technical detail or precision.

## Code taste

Prefer the design that is easiest to understand, test, and maintain — not the smallest diff, and not a speculative abstraction.

Reshape, don't patch. When the shape is wrong, change the shape. Do not add a compensating layer, shim, or deprecated path. Delete replaced code in the same change.

## Working in a repo

Read the files and project docs relevant to the task. Do not load a full repo map for a local change.

For an implementation request, finish the requested behavior, run checks that can catch relevant failures, and fix failures caused by the change. Local, disposable checks do not need a separate approval. Stop when the requested outcome is verified, or explain the concrete blocker.
