---
name: go-coding-practice
description: Go coding standards for package design, naming, interfaces, context/error handling, and concurrency. Use when writing or reviewing non-test Go code.
metadata:
  categories:
    - coding-standards
    - go
    - software-development
  references:
    - https://google.github.io/styleguide/go/
---

# Go Coding Practice

Formatting is gofmt's job. This skill covers design, naming, and idiom choices that tools don't catch.

## Packages and state

- Package names are short, lowercase, single words without underscores: `tabwriter`, `k8s`.
- Name a package after what it provides, such as `csv` or `spannertest`. Never `util`, `common`, `helper`, or `model`.
- If a consumer needs both of two packages to use either one, they usually belong in one package.
- No package-level state: registries, DB clients, and config live in structs passed in as dependencies.

## Naming

Name length scales with scope: short for a loop variable, descriptive for an exported symbol.

- Don't repeat the package name: `widget.New()`, not `widget.NewWidget()`.
- Don't repeat the receiver type: `func (c *Config) WriteTo()`, not `WriteConfigTo()`.
- Don't append the type: `users`, not `userSlice`.
- Keep initialisms in one case: `userID`, `XMLAPI`, never `userId` or `XmlApi`.
- No `Get` prefix on getters: `JobName()`, not `GetJobName()`.
- Receiver names are one or two letters and the same across all methods of a type: `func (s *Server)`.
- Prefix enum-like constants with their category, like `http.MethodGet`: `ModeDirect`, not `Direct`.
- Avoid import aliases unless names truly collide; rename the colliding local instead.

## Functions and APIs

- Use an options struct once a function takes more than three or four parameters or several boolean flags.
- Write synchronous functions and let the caller add a goroutine.
- Pass plain data, small structs, and built-in types by value. Pass a pointer when the struct is large, must be mutated, or holds a `sync.Mutex` or other non-copyable field.
- Use `new(expr)` for a pointer to a literal or expression (Go 1.26+). No `boolPtr` or `toPtr[T]` helpers that only return `&v`.
- Accept interfaces, return concrete types. Define an interface in the package that consumes it, and only once you have a second implementation or a test double that needs it.
- Use generics for algorithms that work uniformly across types, not as a way around static typing or to build mini-DSLs.

## Context

- `context.Context` is the first parameter of any function that does I/O or RPCs.
- Never store a context in a struct field or define a custom context type.
- Use `context.WithValue` only for request-scoped data such as trace IDs, never for optional arguments.

## Errors

- Error strings are lowercase with no trailing punctuation.
- Wrap with `%w` at the end of the message when callers need `errors.Is` or `errors.As`: `fmt.Errorf("reading file: %w", err)`. Use `%v` to add context while hiding the underlying error from callers.
- Error messages must be true on every path that produces them.
- Never signal errors in-band with `-1`, `""`, or `nil`. Return a separate `error` or `ok bool`: `v, ok := Lookup(key)`.
- Handle an error immediately and return. Keep the happy path unindented, never inside an `else`.
- Match error types with `errors.AsType[T](err)` (Go 1.26+), not a pre-declared variable plus `errors.As(err, &v)`.
- Return errors instead of panicking. Reserve `panic` and `log.Fatal` for truly impossible states and startup failures such as invalid static config.

## Guards

- Don't start methods with `if s == nil`. A nil receiver is a caller bug and should panic. The same goes for constructor-set dependencies, `ctx`, and arguments the caller can't pass as nil.
- Handle nil only when it is a documented valid value, such as a nil `*Tree` meaning an empty tree.

## Concurrency

- Know how and when every goroutine stops before you start it, and pass it a context so it exits on cancellation.
- Declare channel direction in signatures: `func sum(values <-chan int)`.
- Use `wg.Go(fn)` when the `WaitGroup` tracks the goroutine's full lifetime (Go 1.25+), not `wg.Add(1)` plus `defer wg.Done()`. `fn` must not panic. Call `Done` manually only to signal before the goroutine exits.
- Use `time.Tick(d)` for loop intervals (Go 1.23+). Use `time.NewTicker(d)` only when you need `Stop` or `Reset`.

## Idioms

- Treat a nil slice and an empty slice as the same. Declare `var s []string`, not `s := []string{}`, and never make callers distinguish them.
- Use `var x T` for a zero value you'll fill later and `x := value` for explicit initialization.
- Use `cmp.Or(a, b, fallback)` for the first non-zero value (Go 1.22+) instead of chained `if x == ""` checks. All arguments evaluate eagerly.
- Use `+` for simple concatenation, `fmt.Sprintf` for formatting, `fmt.Appendf(nil, ...)` instead of `[]byte(fmt.Sprintf(...))`, and `strings.Builder` when building in a loop.
- Split on the last separator with `strings.CutLast` or `bytes.CutLast`, not `LastIndex` plus slicing.
- Iterate split results with `strings.SplitSeq` / `FieldsSeq` (and the `bytes` equivalents) (Go 1.24+). Use `strings.Split` only when you store or index the slice.
- Shallow-copy with `slices.Clone`, `maps.Clone`, or `maps.Copy` into an allocated map. No `append([]T(nil), s...)`, `make` plus `copy`, or copy loops. Write a custom clone only for deep copies.
- Clone URLs with `u.Clone()` and `values.Clone()`, never `*u` or a manual map copy.
- Sort with the `slices` package, never `sort`: `slices.Sort`, or `slices.SortFunc` / `SortStableFunc` with an `int`-returning comparator such as `cmp.Compare`.
- Iterate maps with `maps.Keys` / `maps.Values` (Go 1.23+), then `slices.Collect` or `slices.Sorted`. No `make` plus range loop plus `sort.Strings`.
- Use `reflect.TypeFor[T]()` (Go 1.22+), not `reflect.TypeOf((*T)(nil)).Elem()`.

## JSON and UUID

- Use `encoding/json/v2` for new code (Go 1.25+). Don't migrate existing `encoding/json` code unless asked. v2 changes the wire format by default: nil slice becomes `[]`, nil map becomes `{}`, duplicate keys and invalid UTF-8 fail. When migrating, start from `jsonv1.DefaultOptionsV1()`, verify with tests, then opt into v2 behavior one flag at a time.
- Use `omitzero` for bools, numbers, structs, and `time.Time` where zero means absent (Go 1.24+). Keep `omitempty` for empty strings, slices, and maps.
- Use `jsontext.Value` for raw JSON (Go 1.27+) and its built-in methods (`Kind`, `IsValid`, `Clone`, `Compact`, `Indent`, `Format`, `Canonicalize`, `String`) instead of hand-rolled versions.
- Use the stdlib `uuid` package for new standalone components. Keep `github.com/google/uuid` where `pgx` or `sqlc` type integration requires it.

## Layout and comments

- Separate logical steps inside a function with a blank line.
- Put one field per line for structs with three or more fields. Split long parameter lists and long `&&` / `||` conditions one item per line.
- Comment a long function with its steps in order and a short function with one sentence:

```go
// Authenticate prepares a session:
// 1. Resolves the endpoint and checks that it is enabled.
// 2. Acquires capacity (protects the DB from unauthenticated floods).
// 3. Verifies the API key.
// Caller must call release when done.

// Authenticate validates the endpoint, reserves capacity, and verifies the key.
// Caller must call release when done.
```
