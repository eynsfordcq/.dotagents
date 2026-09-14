---
name: code-review
description: Review code, diffs, or pull requests for concrete defects and maintainability risks.
metadata:
  categories: 
    - code-review 
    - software-development
  references:
    - https://skills.sh/wshobson/agents/code-review-excellence

---

# Code Review

## Review Workflow

1. **Read the full code/diff** before commenting — avoid piecemeal reactions.
2. **Identify the language(s)** and load a language-specific skill only when its conventions matter to this review.
3. **Check the relevant risks** below, based on the changed behavior.
4. **Write structured feedback** grouped by severity using the output format below.

## Review Mindset

**Goals:** catch bugs and edge cases, ensure maintainability, share knowledge, enforce standards, improve design and architecture.

**Not goals:** show off knowledge, nitpick auto-formatable formatting, block progress unnecessarily, rewrite to personal preference.

Good feedback is specific, actionable, educational, and focused on the code — not the person. Acknowledge good work alongside issues.

## Feedback Format

Use severity prefixes to help the author prioritize:

- `[blocking]` — must fix before merge (bugs, security issues, data loss risk)
- `[important]` — should fix (design problems, missing error handling, inadequate tests)
- `[nit]` — optional and low-stakes (naming, minor clarity); not blocking

**Examples:**

```
❌ "This is wrong."
✅ "[blocking] This can cause a race condition when multiple users access
   simultaneously. Consider using queue.Queue or threading.Lock here."

❌ "Why didn't you use X pattern?"
✅ "[important] The Repository pattern would make this easier to test and
   mock. Here's how it could look: ..."

❌ "Rename this variable."
✅ "[nit] Consider `user_count` instead of `uc` for clarity. Not blocking."
```

## Review Checklist

Work through each area systematically. Not every area will be relevant to every change.

### 1. Architecture & Design

- Does the solution fit the problem? Are there simpler approaches?
- Consistent with existing patterns in the codebase? Will it scale?
- New files in the right places? Is code grouped logically? Any duplication?

### 2. Logic & Correctness

- Edge cases handled? Off-by-one errors?
- `None` checks where needed? Empty collection handling?
- Race conditions or concurrency hazards?

### 3. Security

- Input validated? SQL injection risk? XSS? Sensitive data exposed?

### 4. Performance

- N+1 queries? Unnecessary loops or copies? Memory leaks? Blocking I/O in async paths?

### 5. Error Handling

- Specific exception types (not bare `except:` or `except Exception`)? Errors propagated correctly?
- `try` blocks minimal — wrapping only the call that can raise?

### 6. Testing

- Are there tests? Do they cover edge cases and failure paths? Are they readable and maintained?
- If a `<language>-unit-test` skill is available, evaluate tests against that skill's conventions.

### 7. Maintainability

- Clear variable and function names? Single-responsibility functions?
- Magic numbers/strings extracted to named constants? Non-obvious logic commented with *why*?

### 8. Documentation

- Public APIs, classes, and modules have docstrings? Args/Returns/Raises documented?

## Language-Specific Skills

Use a matching skill only when the review needs that project-specific guidance:

| Kind | Skill name pattern | Use for |
|---|---|---|
| Coding standards | `<language>-coding-practice` | Org style, idioms, design conventions (e.g. `go-coding-practice`, `java-coding-practice`, `python-coding-practice`) |
| Unit testing | `<language>-unit-test` | Test layout, naming, structure, and testing idioms (e.g. `go-unit-test`, `python-unit-test`) |

If a matching skill is not available for the language, apply general best practices for that language without inventing org-specific rules.

## Style Violations

Do **not** comment on auto-formatable formatting (indentation, line length, whitespace) — that's the linter/formatter's job.

For org-specific style rules, apply the relevant `<language>-coding-practice` skill when available (see [Language-Specific Skills](#language-specific-skills)).

## Output Format

Use this structure when it helps the author act on the findings:

```
## Summary
[2-3 sentence overall assessment of the change]

## Blocking Issues
[numbered list, or "None"]

## Important Issues
[numbered list, or "None"]

## Nits
[numbered list, or "None"]

## What's Good
[briefly acknowledge a concrete strength when useful]
```
