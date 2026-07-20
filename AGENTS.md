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

Prefer the design that is easiest to understand, test, and maintain —
not the smallest diff, and not a speculative abstraction.

- Owner of a fact exposes it.
  If a value is known at construction, return it there.
  Do not erase it and recover it later through casts, request-scoped bags,
  or callbacks.
  Test: "did this design forget something it knew, then work to get it back?"
- Abstraction must pay rent.
  Do not add a type, interface, or parameter for a single consumer.
  Two fields alone do not justify a carrier type.
  Test: "would this still exist without its first consumer?"
- Reshape, don't patch.
  When the shape is wrong, change the shape.
  Do not add a compensating layer, shim, or deprecated path.
  Delete replaced code in the same change.
