---
name: python-coding-practice
description: Python coding standards for imports, exceptions, type annotations, naming, truth testing, strings, and resource management. Use when writing or reviewing Python code, or when org-specific Python style rules are needed.
metadata:
  categories:
    - coding-standards
    - python
    - software-development
  references:
    - https://skills.sh/wshobson/agents/code-review-excellence
    - https://google.github.io/styleguide/pyguide.html
---

# Python Coding Standards

> Non-formatter rules only. Formatting (indentation, line length, whitespace, blank lines) is handled by **Ruff/Black** — run it, don't discuss it.

## Imports

**Use `import x` or `from x import y` — never import individual classes or functions directly from deep paths unless aliasing.**

```python
# Yes
from absl import flags
from sound.effects import echo

# No — ambiguous origin, hard to grep
from sound.effects.echo import EchoFilter
```

**No relative imports.** Always use the full package path, even within the same package. Relative imports cause double-import bugs that are silent and hard to track down.

```python
# Yes
from myproject.utils import helpers

# No
from . import helpers
```

**Standard aliases only.** Use `import numpy as np`, `import pandas as pd` — aliases the whole team recognizes. Don't invent your own.

**Import order (enforced by Ruff, but understand the intent):**

1. `__future__`
2. Standard library
3. Third-party
4. Internal packages

---

## Exceptions

**Use specific exception types.** Never catch `Exception` or bare `except:` unless you are explicitly re-raising or implementing an isolation boundary (e.g., a thread's outermost loop).

```python
# Yes — specific, re-raised
try:
    result = call_external_service()
except requests.Timeout:
    logging.warning('Service timed out, retrying.')
    raise

# No — swallows everything, including KeyboardInterrupt and SystemExit
try:
    result = call_external_service()
except:
    pass
```

**Don't use `assert` for runtime validation.** Asserts are stripped with `-O`. Use `raise ValueError` for precondition checks in production code. Reserve `assert` for pytest tests.

```python
# Yes
if minimum < 1024:
    raise ValueError(f'Min. port must be at least 1024, not {minimum}.')

# No — silently skipped in optimized builds
assert minimum >= 1024
```

**Keep `try` blocks minimal.** Only wrap the call that can actually raise. A fat `try` block hides bugs in the code you didn't expect to fail.

**Custom exceptions must inherit from an existing exception class and end in `Error`.**

```python
class InsufficientQuotaError(RuntimeError):
    """Raised when a tenant exceeds their allocated quota."""
```

---

## Global State

**Avoid mutable global state.** It breaks encapsulation, complicates testing, and causes subtle import-time side effects.

**Module-level constants are fine and encouraged.** Name them `ALL_CAPS_WITH_UNDERSCORES`. Prefix internal ones with `_`.

```python
_MAX_RETRY_ATTEMPTS = 3        # internal
DEFAULT_TIMEOUT_SECONDS = 30   # public API
```

If mutable global state is genuinely necessary (rare), prefix it with `_`, document *why* in a comment, and expose it only through functions or class methods.

---

## Functions and Classes

**No mutable default arguments.** This is a classic Python footgun — the default is evaluated once at import time and shared across all calls.

```python
# Yes
def process(items: list[str] | None = None) -> None:
    if items is None:
        items = []

# No — all callers share the same list object
def process(items: list[str] = []) -> None:
    ...
```

**Prefer small, focused functions.** ~40 lines is a soft ceiling. If you need a comment to explain what a block *does*, that block is probably a function.

**No `staticmethod` unless integrating with an existing external API.** Write a module-level function instead — it's easier to test and import. Use `classmethod` only for named constructors or class-scoped cache management.

**Properties are for trivial, cheap logic only.** If computation is non-trivial, use an explicit method. Properties that hide side effects or expensive work violate caller expectations.

**Use `*args` and `**kwargs` sparingly.** They erase type information and make function contracts ambiguous. If your function logically takes a collection, say so explicitly.

```python
# Yes — typed, documentable, statically checkable
def send(message: str, recipients: list[str]) -> None:
    ...

# No — callers can't tell what to pass, type checkers can't help
def send(message: str, *recipients) -> None:
    ...
```

Reserve `*args`/`**kwargs` for genuine passthrough cases (decorators, wrappers, base class delegation).

**Return values: guard early, converge late.** Use guard clauses to handle invalid inputs and edge cases at the top of a function. For the main success path, aim for a single exit point — it keeps state transitions easy to follow and simplifies debugging.

```python
# Yes
def process_order(order: Order) -> Receipt:
    if order is None:
        raise ValueError('order must not be None.')
    if not order.items:
        raise ValueError('order must contain at least one item.')

    # Single happy-path exit below
    total = sum(item.price for item in order.items)
    receipt = Receipt(order_id=order.id, total=total)
    return receipt

# No — success and error paths interleaved, multiple scattered returns
def process_order(order: Order) -> Receipt:
    if order is not None:
        if order.items:
            total = sum(item.price for item in order.items)
            return Receipt(order_id=order.id, total=total)
        else:
            return None
    return None
```

---

## Comprehensions and Generators

**One `for` clause, one optional `if` clause.** Multiple `for` clauses in a comprehension are a readability trap. Use a regular loop.

```python
# Yes
result = [transform(x) for x in items if x is not None]

# No
result = [(x, y) for x in range(10) for y in range(5) if x * y > 10]
```

**Use generators when you don't need a materialized list.** Especially for large data pipelines — they avoid holding everything in memory.

**Never use a list comprehension purely for its side effects (e.g., `[print(x) for x in seq]`).** If you aren't using the returned list, use a standard for loop.

**If a generator manages an expensive resource (DB cursor, file handle), wrap it in a context manager.** Don't rely on garbage collection to close it.

---

## Iteration and Data Structures

**Never use `range(len(sequence))` to iterate with an index.** Use `enumerate`.

```python
# Yes
for i, item in enumerate(records):
    print(f'{i}: {item}')

# No
for i in range(len(records)):
    print(f'{i}: {records[i]}')
```

**Don't use `in` for repeated membership tests on a list.** List `in` is O(n). If you're doing repeated lookups or the collection is large, convert to a `set` or `dict` first.

```python
# Yes — O(1) per lookup
allowed = set(load_allowed_ids())
filtered = [r for r in records if r.id in allowed]

# No — O(n) per lookup, O(n²) overall
allowed = load_allowed_ids()
filtered = [r for r in records if r.id in allowed]
```

**Don't trap `KeyError` for standard dict lookups.** Use `key in dict` or `dict.get(key, default)` instead.

```python
# Yes
value = config.get('timeout', 30)

if 'timeout' in config:
    value = config['timeout']

# No — verbose and the exception path is not exceptional
try:
    value = config['timeout']
except KeyError:
    value = 30
```

**Use structural unpacking to extract values.** Use `_` for values you're intentionally discarding.

```python
# Yes
first, *middle, last = sequence
_, _, error_code = get_status()
x, y = point

# No
first = sequence[0]
last = sequence[-1]
error_code = get_status()[2]
```

---

## Truth Testing

**Use implicit boolean evaluation for emptiness.** Don't call `len()` as a boolean guard.

```python
# Yes
if not users:
    ...
if results:
    ...

# No
if len(users) == 0:
    ...
if len(results) > 0:
    ...
```

**Always use `is None` / `is not None` for None checks.** An object might be falsy but not `None` — these are different conditions.

```python
# Yes
if value is None:
    value = default

# No — fails silently if value is 0, False, or ""
if not value:
    value = default
```

**Never compare booleans with `==`.** Use `if x:` / `if not x:`.

**Exception: integers that aren't from `len()`.** `if count == 0:` is clearer than `if not count:` when `count` is a numeric value.

---

## Strings

**Use f-strings for interpolation.** `%` and `.format()` are acceptable but f-strings are the standard for new code.

```python
# Yes
raise ValueError(f'Expected positive int, got {value!r}.')

# No
raise ValueError('Expected positive int, got %r.' % value)
```

**Don't accumulate strings in a loop with `+`.** Use a list and `''.join()` or write to `io.StringIO`.

```python
# Yes
parts = []
for row in rows:
    parts.append(format_row(row))
output = '\n'.join(parts)

# No — O(n²) in the worst case
output = ''
for row in rows:
    output += format_row(row) + '\n'
```

**Logging: always pass the format string separately.** Don't use f-strings as the first argument to a logger. The logger needs the unexpanded template for structured log systems (e.g., Cloud Logging, Datadog).

```python
# Yes
logging.info('Processing batch %d of %d', current, total)

# No
logging.info(f'Processing batch {current} of {total}')
```

---

## Resource Management

**Always use `with` statements for files, sockets, DB connections, and any closeable resource.** Relying on `__del__` for cleanup is unreliable across Python implementations.

```python
# Yes
with open(path) as f:
    data = f.read()

# No
f = open(path)
data = f.read()
f.close()
```

For objects that don't support `with` natively, use `contextlib.closing()`.

---

## Type Annotations

**Annotate params and return on every function definition.** At minimum the `def` line must be fully typed.

**Use `X | None` over `Optional[X]`.** The union syntax is cleaner and is the standard in Python 3.10+.

```python
def find_user(user_id: int) -> User | None:
    ...
```

**Use abstract types for parameters, concrete types for return values.**

```python
from collections.abc import Sequence, Mapping

# Yes — callers can pass list, tuple, etc.
def process(items: Sequence[str]) -> list[str]:
    ...

# No — unnecessarily restrictive
def process(items: list[str]) -> list[str]:
    ...
```

**Use built-in generics directly (`list[str]`, `dict[str, int]`, `tuple[int, ...]`).** Do not use `typing.List`, `typing.Dict`, `typing.Tuple` — these are deprecated aliases.

**Annotate variables when type can't be inferred.**

```python
results: list[str] = some_opaque_function()
```

**Use `TypeAlias` for complex reusable types.** Name them `CapWords`.

```python
from typing import TypeAlias
_BatchResult: TypeAlias = tuple[list[str], list[Exception]]
```

**`TypeVar` must have a descriptive name unless it's private and unconstrained.**

```python
_T = TypeVar('_T')                           # fine — private, unconstrained
AddableType = TypeVar('AddableType', int, float, str)  # descriptive — constrained
```

---

## Naming

| Entity | Convention | Example |
|---|---|---|
| Package / Module | `lower_with_under` | `data_pipeline` |
| Class / Exception | `CapWords` | `BatchProcessor`, `QuotaExceededError` |
| Function / Method | `lower_with_under` | `fetch_records()` |
| Constant (global/class) | `CAPS_WITH_UNDER` | `MAX_BATCH_SIZE` |
| Instance / local variable | `lower_with_under` | `retry_count` |
| Internal (module/class) | prefix `_` | `_build_query()` |

**Never use double-underscore (`__dunder`) for your own attributes.** It triggers name mangling, hurts testability, and isn't actually private. Use single `_`.

**Respect encapsulation by convention.** Python has no `private` keyword — we rely on the `_` prefix as a contract. Do not access `_prefixed` members across domain boundaries. If you find yourself reaching into another module's internals, that's a signal the public API is missing something; fix the API, don't bypass the boundary.

**Avoid type information in names.** `user_dict`, `id_list`, `name_str` — don't do this. The type annotation is the right place for that information.

**Don't abbreviate unless the abbreviation is universally understood in the domain** (`http`, `url`, `db`, `cfg` — fine; `prcs`, `mgr`, `hndlr` — not fine).

---

## Module Structure

**Every module that can be executed must guard its entry point.**

```python
def main() -> None:
    ...

if __name__ == '__main__':
    main()
```

**Top-level code runs on import.** Don't put function calls, network I/O, or object instantiation at module level — it breaks `pydoc`, tests, and any tool that imports your module.

---

## Docstrings

**Docstrings are mandatory for:**

- All public functions, methods, classes, and modules
- Any function with non-obvious logic or non-trivial size

**Format: one-line summary (ends with `.`), blank line, then body.**

```python
def fetch_records(table: str, limit: int = 100) -> list[dict]:
    """Fetches records from the given table up to the specified limit.

    Args:
        table: The fully qualified table name.
        limit: Maximum number of records to return.

    Returns:
        A list of dicts, one per row, keyed by column name.

    Raises:
        ConnectionError: If the database is unreachable.
    """
```

**`@override` methods don't need a docstring** unless the behavior materially changes. In that case, document the difference only.

**Generator functions use `Yields:` not `Returns:`.**

---

## Comments

**Comments explain *why*, not *what*.** If you need to explain what the code is doing, the code is unclear — rewrite it.

```python
# Yes — explains non-obvious reasoning
# Bitwise check: x & (x-1) == 0 is true only for powers of 2 and zero.
if x & (x - 1) == 0:

# No — describes the code, adds no value
# Check if x is a power of 2
if x & (x - 1) == 0:
```

**TODO format:**

```python
# TODO: https://issue-tracker/123 - Replace with streaming implementation once API is stable.
```

Always link to a ticket (gitlab issue). Never use a username alone as the context.

---

## Threading

**Don't rely on the atomicity of built-in types.** Dict operations look atomic but aren't in all cases (custom `__hash__`, `__eq__`).

**Use `queue.Queue` to pass data between threads.** Use `threading.Condition` over raw locks for coordination. Don't roll your own synchronization primitives.

---

## Things to Avoid

- **`eval`, `exec`, custom metaclasses, `__del__`, bytecode manipulation.** These are power features that are nearly impossible to debug or reason about. Standard library uses of them (`dataclasses`, `abc`, `enum`) are fine.
- **`lambda` for anything longer than a simple expression.** Define a named function.
- **`operator.mul` over `lambda x, y: x * y`** for common operations.
- **Nested functions that exist only to hide module-level helpers.** Prefix with `_` at module level instead — it's still testable.

---

## Taste

Personal preferences, not hard standards. Prefer them when they do not fight a clearer local convention.

- **Logical blank lines:** Put a blank line between logical steps. Never cram everything together.
- **Simple comprehensions only:** A comprehension is fine with a short expression and one simple condition. If the expression is long, the condition is compound, or you need nesting, use a plain loop. Readable beats short.
- **Explicit over magic:** Prefer constructors with visible arguments over helpers that read env vars or global config implicitly. A reader must see the inputs at the call site.

```python
# Yes — all inputs visible at the call site
ChatOpenAI(
    model=...,
    base_url=...,
    api_key=...,
    temperature=...,
    timeout=...,
)

# No — model, key, and endpoint hide in env vars
init_chat_model()
```
