---
name: code-review
description: Performs structured code reviews for any language or framework. Use when a user asks to review, critique, audit, or give feedback on code — including PRs, diffs, functions, modules, or full files. Covers correctness, security, performance, testing, maintainability, and organization-specific style rules.
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
2. **Identify the language(s)** and load the relevant org style guide from `references/` if one exists (see [Style Violations](#style-violations) below).
3. **Work through the checklist** below, covering all changed code.
4. **Write structured feedback** grouped by severity using the output format below.

## Review Mindset

**Goals:** catch bugs and edge cases, ensure maintainability, share knowledge, enforce standards, improve design and architecture.

**Not goals:** show off knowledge, nitpick auto-fixable formatting, block progress unnecessarily, rewrite to personal preference.

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

### 7. Maintainability

- Clear variable and function names? Single-responsibility functions?
- Magic numbers/strings extracted to named constants? Non-obvious logic commented with *why*?

### 8. Documentation

- Public APIs, classes, and modules have docstrings? Args/Returns/Raises documented?

## Style Violations

Do **not** comment on auto-fixable formatting (indentation, line length, whitespace) — that's the linter/formatter's job.

For org-specific style rules, load the relevant reference file based on the language being reviewed:

| Language | Reference | Key topics |
|---|---|---|
| Go | [references/go.md](references/go.md) | Package design/state management, interfaces and API design, context/error handling, concurrency, testing idioms |
| Java | [references/java.md](references/java.md) (+ [references/java-springboot.md](references/java-springboot.md) for Spring Boot code) | Class organization, naming semantics, exception handling, Javadoc; Spring Boot layering/validation/error handling/testing |
| Python | [references/python.md](references/python.md) | Imports, exceptions, type annotations, naming, truth testing, strings, resource management |

If no reference exists for the language, apply general best practices for that language without inventing org-specific rules.

## Output Format

Structure all reviews as:

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
[briefly acknowledge well-done aspects — always include this]
```
