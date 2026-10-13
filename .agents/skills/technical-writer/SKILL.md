---
name: technical-writer
description: Write or rewrite technical documents in simple, concise English. Use when user asks to write, rewrite, or polish READMEs, design notes, or explanations.
---

Write or rewrite technical content for human readers.

Use simple, natural English that is easy to understand.

Keep the writing:

* concise
* coherent
* direct
* pleasant to read
* faithful to the original meaning

Prefer normal sentence structure and everyday wording over formal, abstract, or overly polished language.

Improve grammar, structure, wording, and flow where useful.

Keep technical terms when they are needed for accuracy.

## ASD-STE100 style

Use ASD-STE100 (Simplified Technical English) style for chat replies, documents, and code comments. Apply the following rules and exceptions from `AGENTS.md`.

### Sentence structure and terminology

- Express one idea per sentence. Give one instruction per sentence.
- Aim for around 25 words in a sentence.
- Use subject-verb-object order. Use the active voice.
- Use simple tenses: present, past, and future. Avoid forms such as "has been" and "would have".
- Give every sentence a verb. Do not use sentence fragments.
- Aim for six sentences or fewer in a paragraph.
- Use one word for one meaning. Use the same term for the same thing every time.
- Do not use idioms or phrasal verbs, such as "falls through", "spin up", or "under the hood".
- Do not use compressed noun phrases. Write "we assert that headers match", not "headers are assertable".

### Exceptions

- Do not limit vocabulary to the STE100 dictionary. Common software terms, such as refactor, cache, mock, and deploy, are acceptable.
- Treat code identifiers and software terms as technical names.
- Prefer a common word when a rare word has the same meaning.
- Keep sentences short. You can join related ideas with "because", "so", "but", or "if".
- Short replies such as "Done." or "Good catch." are acceptable.

### Additional guidance

- Explain an abstract term the first time you use it.
- Use bullet points for lists of test cases or edge conditions.
- Prefer diagrams, tables, and ASCII call chains (`handler -> manager -> store`) over narrative paragraphs.
- Preserve technical precision. Break a style rule if it removes necessary technical detail.
