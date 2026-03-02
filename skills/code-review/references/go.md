---
references:
  - https://google.github.io/styleguide/go/
---

# Go Code Standards

> This guide skips syntax formatting entirely, it focuses on the architectural decisions, design patterns, and idiomatic practices that automated tools cannot catch.

## 1. Package Design and State Management

### Package Naming and Size

* **Keep names short and meaningful:** Package names must be lowercase, single words without underscores (e.g., `tabwriter`, `k8s`).
* **Avoid "junk" drawer packages:** Never name a package `util`, `common`, `helper`, or `model`. These become dumping grounds. Name packages based on what they provide (e.g., `spannertest`, `csv`).
* **Group highly coupled types:** If a consumer must import two packages to use either meaningfully, they usually belong in the same package.

### Avoid Global State

* **Dependency Injection over Globals:** Do not use package-level variables to hold state (e.g., registries, database clients, or configuration). Instead, instantiate a struct and pass it as a dependency.
* **Why?** Global state makes testing hermetically almost impossible, introduces race conditions, and prevents a single process from running multiple instances of a service.

## 2. Naming Conventions

Linters can't enforce context-aware naming. In Go, the length of a variable name should be proportional to its scope.

### Avoid Repetition

* **Package context:** Don't repeat the package name in exported symbols. Use `widget.New()` instead of `widget.NewWidget()`.
* **Type context:** Don't append types to variable names. Use `users` instead of `userSlice` or `count` instead of `numUsersInt`.
* **Receiver context:** Don't repeat the receiver name in method names. Use `func (c *Config) WriteTo()` instead of `WriteConfigTo()`.

### Idiomatic Nuances

* **Initialisms:** Keep initialisms in the same case. Use `userID` or `XMLAPI`, never `userId` or `XmlApi`.
* **Getters:** Do not use the `Get` prefix for getters. Use `func (c *Config) JobName()` instead of `GetJobName()`.
* **Receiver Names:** Keep them short (1-2 letters) and consistent across all methods of the type. Use `func (s *Server)` instead of `func (server *Server)`.

## 3. Function and API Design

### Signatures and Arguments

* **Option Structs:** If a function has more than 3-4 parameters, or requires multiple boolean flags, use an Option struct. This makes call sites readable and future-proofs the API.
* **Synchronous by Default:** Prefer synchronous functions over asynchronous ones. Let the caller decide if they want to execute the function in a goroutine. It is very hard to remove concurrency from an API, but very easy for a caller to add it.

### Pointers vs. Values

* **Pass Values:** For plain data, small structs, and built-in types.
* **Pass Pointers:** If the struct is very large, needs to be mutated, or contains synchronization fields (like `sync.Mutex`) that absolutely **cannot be copied**.

### Interfaces

* **Accept Interfaces, Return Concrete Types:** Define interfaces in the package that *consumes* them, not the package that *implements* them.
* **Don't Prematurely Abstract:** Do not create interfaces until you actually have multiple implementations or strictly need them for test doubles.

### Contexts

* `context.Context` is **always the first parameter** of a function that does I/O or RPCs.
* Never store a context in a struct field.
* Never create custom context types. Use `context.WithValue` only for request-scoped data (like trace IDs), never for passing optional function arguments.

## 4. Error Handling

Go treats errors as standard values. Handle them deliberately.

### Constructing Errors

* **Formatting:** Error strings should be lowercase and have no trailing punctuation. (e.g., `fmt.Errorf("failed to load user")`).
* **Wrapping vs. Annotating:**
  * Use `%w` if the caller needs to programmatically inspect the error using `errors.Is` or `errors.As`. Put `%w` at the end of the string to mirror the error chain: `fmt.Errorf("reading file: %w", err)`.
  * Use `%v` if you just want to add context for logs and humans, hiding the underlying implementation detail from the caller.
* **In-Band Errors:** Never use `-1`, `""`, or `null` to signal an error. Always return a separate `error` or `bool` value (e.g., `value, ok := Lookup(key)`).

### Handling Flow

* **Line of Sight:** Handle errors immediately and return/break. Do not nest the "happy path" inside an `else` block.
* **Panics:** Never use `panic` for normal error handling. Return an `error`. Only use `panic` or `log.Fatal` for literal impossible conditions or during initial app startup (e.g., invalid static config).

## 5. Concurrency

* **Goroutine Lifetimes:** Never start a goroutine without knowing exactly how and when it will stop. A blocked goroutine will never be garbage collected, leading to memory leaks.
* **Context Cancellation:** Always pass contexts into goroutines so they can exit cleanly if the parent process times out or is canceled.
* **Channel Direction:** Specify channel direction in function signatures to prevent accidental misuse and convey ownership: `func sum(values <-chan int)`.

## 6. Testing Practices

We rely on the standard `testing` package.

### Avoid Assertion Libraries

* **No `testify/assert`:** Do not use third-party assertion libraries. They create a fragmented developer experience and often hide crucial context when tests fail.
* **Use `cmp`:** For deep equality and diffing complex structs, use `github.com/google/go-cmp/cmp`.

### Test Structure

* **Table-Driven Tests:** Use slice-of-structs patterns for testing multiple scenarios through the same logic. Use `t.Run` to wrap each case in a subtest.
* **Test Helpers:** If you write a helper function to set up test state, call `t.Helper()` at the top of it. This ensures test failures report the line of the actual test, not the line inside the helper.

### Useful Failure Messages

* When a test fails, a developer should know exactly what happened without reading the test source code.
* **Format:** Standardize on `got` and `want`: `t.Errorf("YourFunc(%v) = %v, want %v", input, got, want)`.
* **Diffs:** If comparing large structs, print a diff using `cmp.Diff(want, got)` and clearly label the direction (e.g., `diff (-want +got)`).
* **`t.Error` vs `t.Fatal`:** Use `t.Error` for checking values so the test can "keep going" and report all errors at once. Use `t.Fatal` *only* if the test absolutely cannot proceed (e.g., a database failed to spin up in a setup helper).

## 7. Language Idioms

* **Nil Slices:** `nil` and an empty slice `[]int{}` are functionally identical in Go (`len` and `cap` are 0, and `append` works). Prefer declaring `var s []string` over `s := []string{}`. Do not write APIs that force callers to distinguish between the two.
* **Variable Declarations:** Use `var x Type` when you want to utilize the zero-value (ready to use, conveying it's empty). Use `x := value` when explicitly initializing.
* **String Concatenation:** Use `+` for simple strings. Use `fmt.Sprintf` when formatting is involved. Use `strings.Builder` if you are building a string dynamically in a loop (it prevents quadratic memory allocations).
* **Generics (`any` & Type Parameters):** Use generics when you actually have algorithms that operate uniformly across multiple types. Do not use them prematurely to create domain-specific languages (DSLs) or bypass static typing where interfaces would suffice.
