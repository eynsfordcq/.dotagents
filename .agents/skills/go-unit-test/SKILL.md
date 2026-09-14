---
name: go-unit-test
description: Write or review Go unit tests with deterministic, idiomatic test structure.
metadata:
  categories:
    - testing
    - go
    - software-development
---

# Go Unit Testing

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

Tests must clearly communicate intent using the **Given-When-Then** pattern.

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

## Go-Specific Guidance

Go’s testing philosophy is simple: use the standard library first, add tooling only when it earns its keep. Keep tests fast, deterministic, and isolated. Don’t test the framework; test your business logic.

### Core Testing Stack (Standard Library)

- `testing` — core test framework
- `net/http/httptest` — HTTP server/client testing
- `testing/fstest` — virtual filesystem
- `embed` — embed test fixtures if needed
- `context` — test cancellation & timeouts properly

### Common Modern Additions

- **Assertions**: `github.com/stretchr/testify` (assert + require), `github.com/google/go-cmp/cmp` (deep comparison)
- **Mocking**: `github.com/golang/mock`, `github.com/stretchr/testify/mock`, `github.com/vektra/mockery`

### File & Package Layout

Mirror the source file whenever possible: `codec.go` → `codec_test.go`, `user.go` → `user_test.go`.

```text
myapp/
    go.mod
    internal/
        service/
            user.go
            user_test.go      # same package as user.go
        codec/
            codec.go
            codec_test.go
    pkg/
    cmd/
    test/              # Optional: integration / e2e tests only
```

Rules:

- Unit tests live **next to the code they verify**, in the **same package** (`package codec`, not `package codec_test`).
- Do **not** create a separate test-only package.
- Do **not** introduce a shared test helper package (e.g. `internal/testutil`, `testdata/helpers`) unless there is a clear, repeated need that cannot live in the relevant `*_test.go` file. Prefer avoiding it.
- Avoid a central `tests/` folder for unit tests. Use `/test` or `/e2e` only for integration/system tests.

## Always Use Table-Driven Tests

Always group tests of the same category together in one table-driven test. One behavior gets one `Test…` function with multiple `t.Run` cases. Do not write many near-duplicate `Test…` functions for the same function, method, or behavior.

Name the outer test and each case with **Given-When-Then** intent (case `name` can be the Given/When/Then phrase or a short equivalent that still reads as scenario → outcome).

```go
func Divide(a, b float64) (float64, error) {
    if b == 0 {
        return 0, errors.New("cannot divide by zero")
    }
    return a / b, nil
}

func TestGivenNumbersWhenDivideThenReturnsQuotientOrError(t *testing.T) {
    t.Parallel()

    tests := []struct {
        name    string
        a       float64
        b       float64
        want    float64
        wantErr bool
    }{
        {"GivenValidInputsWhenDivideThenReturnsQuotient", 10, 2, 5, false},
        {"GivenZeroDivisorWhenDivideThenReturnsError", 10, 0, 0, true},
    }

    for _, tt := range tests {
        tt := tt // Capture range variable for parallel execution
        t.Run(tt.name, func(t *testing.T) {
            t.Parallel()

            // Given — inputs from tt
            // When
            got, err := Divide(tt.a, tt.b)

            // Then
            if tt.wantErr {
                if err == nil {
                    t.Fatal("expected error, got nil")
                }
                return
            }
            if err != nil {
                t.Fatalf("unexpected error: %v", err)
            }

            if got != tt.want {
                t.Errorf("expected %v, got %v", tt.want, got)
            }
        })
    }
}
```

A standalone (non-table) test is allowed only when a behavior has exactly one scenario. When a second scenario appears, convert the test to a table-driven test. Still use Given-When-Then naming and structure:

```go
func TestGivenMissingUserWhenGetNameThenReturnsGuest(t *testing.T) {
    t.Parallel()

    // Given
    repo := &fakeRepo{user: nil}
    svc := NewUserService(repo)

    // When
    name := svc.GetName(1)

    // Then
    if name != "Guest" {
        t.Errorf("expected Guest, got %s", name)
    }
}
```

## Dependency Injection and Fakes

Never hardcode dependencies. Prefer fakes over mocks—they’re simpler and more maintainable.

```go
type Repository interface {
    FindByID(id int) (*User, error)
}

type Service struct {
    repo Repository
}

func NewService(r Repository) *Service {
    return &Service{repo: r}
}

// Fake for Testing
type fakeRepo struct {
    user *User
}

func (f *fakeRepo) FindByID(id int) (*User, error) {
    return f.user, nil
}
```

## HTTP Testing (`net/http`)

```go
func TestHealth(t *testing.T) {
    t.Parallel()

    req := httptest.NewRequest(http.MethodGet, "/health", nil)
    rr := httptest.NewRecorder()

    Health(rr, req)

    if rr.Code != http.StatusOK {
        t.Errorf("expected 200, got %d", rr.Code)
    }

    if rr.Body.String() != `{"status":"ok"}` {
        t.Errorf("unexpected body")
    }
}
```

## Context, Timeouts, & Fuzzing

### Context Cancellation

Always use `t.Context()` for contexts under test. Never use `context.Background()` or `context.TODO()` unless verifying detached behavior.

Always test cancellation paths:

```go
func TestGivenCancelledContextWhenOperationThenReturnsError(t *testing.T) {
    t.Parallel()

    ctx, cancel := context.WithCancel(context.Background())
    cancel()

    err := Operation(ctx)
    if err == nil {
        t.Fatal("expected cancellation error")
    }
}
```

### Fuzzing

```go
func FuzzParse(f *testing.F) {
    f.Add("valid-input")
    f.Fuzz(func(t *testing.T, input string) {
        Parse(input)
    })
} // Run with: go test -fuzz=Fuzz
```

## Common Anti-Patterns

- Real DB connections or network calls in unit tests (use fakes or `httptest`).
- Sleeping instead of synchronizing with channels.
- Testing private fields.
- External test packages (`package foo_test`) for unit tests — keep the same package as the code under test.
- Shared test-helper packages when helpers could live in the relevant `*_test.go` file.
- Multiple `Test…` functions for the same function, method, or behavior instead of one table-driven test.
- Vague names (`TestDivide`, `Test1`) instead of Given-When-Then.

## Quick Command Cheat Sheet

```bash
go test ./...
go test -v ./...
go test -run TestDivide
go test -cover ./...
go test -race ./...
go test -bench .
go test -fuzz=Fuzz
go test -tags=integration
go test -count=1   # disable cache

# CI-Grade Test Command
go test -race -coverprofile=coverage.out ./...
go vet ./...
staticcheck ./...
```
