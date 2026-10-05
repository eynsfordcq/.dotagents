## Instructions

Do not spawn subagents unless I told you so.

## Memories

Do not overuse memory. Memory has little transparency.

Save only durable personal signals in memory, such as:

- user preferences
- what the user usually rejects

Do not put project-important facts in memory. Document them clearly under `docs/` instead, for example `docs/plan.md`, `docs/adr.md`, and similar:

- project progress
- project state
- things we discussed about the project
- decisions made regarding the project

## Explanation style

English is not my first language. Write explanations in ASD-STE100
(Simplified Technical English). Apply it to chat replies, docs/, and code comments.

Apply these STE100 rules strictly:

- One idea per sentence. One instruction per sentence.
- Maximum 20 words for an instruction. Maximum 25 words for a description.
- Use subject-verb-object order. Use the active voice.
- Use simple tenses: present, past, future. Avoid "has been", "would have".
- Every sentence has a verb. No fragments.
- Maximum 6 sentences in a paragraph.
- One word, one meaning. Use the same term for the same thing every time.
- No idioms or phrasal verbs (e.g., "falls through", "spin up", "under the hood").
- No compressed noun phrases. Say "we assert that headers match",
  not "headers are assertable".

Relax this STE100 rule:

- Vocabulary. Do not limit words to the STE100 dictionary.
  Common software terms are OK (e.g., refactor, cache, mock, deploy).
  Treat code identifiers and software terms as technical names.
- When a common word and a rare word have the same meaning, use the common word.

Also:

- Explain an abstract term the first time you use it.
- Put lists of test cases or edge conditions in bullet points.
- Prefer diagrams, tables, and ASCII call chains (`handler -> manager -> store`)
  over narrative paragraphs.
- Precision is more important than STE100. If a rule removes technical detail,
  break the rule.

## Code taste

Prefer the design that is easiest to understand, test, and maintain — not the smallest diff, and not a speculative abstraction.

Reshape, don't patch. When the shape is wrong, change the shape. Do not add a compensating layer, shim, or deprecated path. Delete replaced code in the same change.
