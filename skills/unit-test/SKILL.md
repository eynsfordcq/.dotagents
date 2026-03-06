---
name: unit-test
description: Use this skill for writing, reviewing, or running unit tests, integration tests, TDD workflow, testing async code, and mocking dependencies.
metadata:
  categories:
    - testing
    - software-development
  references:
    - https://skills.sh/wshobson/agents/code-review-excellence
---

# Unit Testing & Test-Driven Development (TDD)

## Overview

This guide focuses on high-performance, deterministic testing suitable for modern backend systems. It emphasizes strict dependency isolation, clear intent via the **Given-When-Then** pattern, and a well-structured project layout.

**Core Testing Principles**:

1. **Strict Mocking**: **Always** mock or fake external dependencies at system boundaries.
    - **No** real database connections (use fakes or in-memory replacements if absolutely necessary).
    - **No** real network calls (mock HTTP clients, S3, external APIs).
    - **No** real message queues (mock Kafka/RabbitMQ consumers/producers).
    - **No** real filesystem access (use temporary file fixtures/systems).
2. **Determinism**: Tests must yield the same result every time, regardless of environment, network status, or execution order.
3. **Isolation**: Tests should not share state. Use setup/teardown mechanics or fixtures cleanly.
4. **Coverage Focus**:
    - **Include**: Complex business logic, edge cases, error handling pipelines.
    - **Exclude**: Configuration files, framework glue code, and simple data containers.

---

## Given-When-Then & Naming Conventions

Tests must clearly communicate intent using the **Given-When-Then** pattern or similar structured style (e.g., Arrange-Act-Assert).

### Naming Convention
Use descriptive names that describe the scenario and expected outcome:
e.g., `TestGiven[Context]When[Action]Then[ExpectedOutcome]`

### Structure Guidelines
- **Given** (Arrange): Set up the test state and mock dependencies.
- **When** (Act): Execute the behavior being tested.
- **Then** (Assert): Verify the expected outcomes and state changes.

---

## Best Practices

- **Test Behavior, Not Implementation**: Avoid testing private fields or the internal state of objects. Tests should verify outcomes and side effects from the perspective of an external caller.
- **Keep Tests Fast**: Unit tests should execute in milliseconds. Slow operations usually indicate an external dependency needs mocking.
- **Test Cancellation and Timeouts**: In languages with native concurrency APIs (like Go's `context` or Python's `asyncio`), always test how functions handle cancellation.
- **Use Test Fakes over Mocks**: Wherever possible, provide lightweight implementations of an interface rather than complex mocking frameworks that record and assert calls tightly coupled to the implementation.

---

## Language-Specific Guidelines

Load the relevant reference file for language-specific frameworks, project layouts, structure rules, and idioms:

- **Go**: [go.md](./references/go.md)
- **Python**: [python.md](./references/python.md)
