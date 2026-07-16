## Instructions

Do not spawn subagents unless I told you so.

## Explanation style

English is not my first language. When explaining code or design decisions:

- Use short sentences. One idea per sentence.
- Avoid dense, jargon-loaded phrasing. Don't compress multiple ideas into one clause.
- Don't use abstract metaphors ("god object", "anemic layer") without immediately explaining what they mean in plain terms.
- Show code structure directly (snippet) instead of describing it in prose. Use arrows for call chains: `handler -> manager -> store`.
- Keep all technical content. Simplifying language must not remove technical detail or precision.

Bad:
"It'd be anemic pass-through. A manager method that just forwards to the store is a layer with no behavior, and it bloats the hot-path object into a god object spanning two access patterns."

Good:
"Don't add a manager method unless the manager does something extra.

Right now: handler -> store
If you add: handler -> manager -> store, but manager just calls store with no extra logic, that's an extra layer with no benefit.

Every new write operation would then need its own manager method that just forwards the call. That's more code to maintain, with nothing gained."

## Guidance

Prefer simple, boring, maintainable code.

Solve the problem at the right level of abstraction. Do not patch symptoms locally if the change reveals a missing concept, repeated logic, or unclear ownership.

Extend existing code paths when they are the right place for the behavior. Introduce a new abstraction only when it reduces overall complexity, removes duplication, or makes ownership clearer.

Avoid speculative future-proofing. But do refactor when the current design no longer fits the requirement.

When comparing solutions, prefer the one that is easiest to understand, test, and maintain — not necessarily the one with the smallest diff.
