# Go Unit Testing

## Overview

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

## Project Structure (Clean + Scalable)

```text
myapp/
    go.mod
    internal/
        service/
            user.go
            user_test.go
        repo/
            repo.go
            repo_test.go
    pkg/
    cmd/
    test/              # Optional: integration / e2e tests
```

- Unit tests live **next to the code** (e.g. `user_test.go`).
- Avoid a central `tests/` folder for unit tests. Use `/test` or `/e2e` only for integration/system tests.

## Table-Driven Tests (Go Standard Pattern)

This is the idiomatic Go way.

```go
func Divide(a, b float64) (float64, error) {
    if b == 0 {
        return 0, errors.New("cannot divide by zero")
    }
    return a / b, nil
}

func TestDivide(t *testing.T) {
    t.Parallel()

    tests := []struct {
        name    string
        a       float64
        b       float64
        want    float64
        wantErr bool
    }{
        {"valid", 10, 2, 5, false},
        {"zero divisor", 10, 0, 0, true},
    }

    for _, tt := range tests {
        tt := tt // Capture range variable for parallel execution
        t.Run(tt.name, func(t *testing.T) {
            t.Parallel()

            got, err := Divide(tt.a, tt.b)

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

## Given-When-Then in Go (Structured Style)

Go doesn’t enforce style, but clarity matters.

```go
func TestUserService_GetName_UserNotFound_ReturnsGuest(t *testing.T) {
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

Always test cancellation paths:

```go
func TestOperation_ContextCancelled(t *testing.T) {
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
