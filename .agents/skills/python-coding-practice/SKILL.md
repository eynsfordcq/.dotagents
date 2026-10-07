---
name: python-coding-practice
description: Python coding standards for imports, exceptions, type annotations, naming, truth testing, strings, and resource management. Use when writing or reviewing non-test Python code.
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

Apply these rules to non-test Python code. Use Ruff and Black for general formatting. Apply the layout preferences in **Taste** separately.

## Imports

- Use full package paths, including imports within the same package. Do not use relative imports.
- Import classes or functions directly when their names or established conventions make their purpose clear.
- Import modules when generic names need context or when module prefixes prevent name conflicts.
- Use standard aliases, such as `np` for NumPy and `pd` for pandas. Do not invent aliases.
- Order imports by group: `__future__`, standard library, third-party packages, then internal packages. Let Ruff enforce this order.

## Exceptions

- Catch specific exception types.
- Catch `Exception` only when you re-raise it or isolate failures at an outer execution boundary, such as a thread entry point.
- Never use bare `except:`.
- Use explicit exceptions for runtime validation. Reserve `assert` for tests because Python removes assertions when it runs with `-O`.
- Limit each `try` block to operations that can raise the expected exception.
- Make custom exceptions inherit from an existing exception class. End their names with `Error`.

## Global State

- Avoid mutable global state.
- Use module-level constants when appropriate. Name constants with `ALL_CAPS_WITH_UNDERSCORES`. Prefix internal constants with `_`.
- If mutable global state is necessary, prefix its name with `_` and explain why it exists.
- Expose mutable global state only through functions or class methods.

## Functions and Classes

- Never use mutable default arguments. Use `None` and create the collection inside the function.
- Keep functions focused. Treat approximately 40 lines as a soft limit.
- Extract a function when a block needs a comment to explain what it does.
- Prefer module-level functions over `staticmethod`. Use `staticmethod` only when an existing external API requires it.
- Use `classmethod` only for named constructors or cache management within a class.
- Use properties only for simple, inexpensive logic. Use explicit methods for expensive work or side effects.
- Prefer explicit, typed parameters over `*args` and `**kwargs`.
- Reserve `*args` and `**kwargs` for forwarding arguments through decorators, wrappers, or base-class calls.
- Handle invalid inputs and edge cases early with guard clauses, which return or raise before the main logic.
- Prefer one return point for the main success path. Do not force error paths through that return point.

## Comprehensions and Generators

- Limit comprehensions to one `for` clause and one optional, simple `if` clause.
- Use a regular loop when expressions or conditions become complex, or when iteration requires nesting.
- Never use a comprehension only for side effects.
- Use generators when you do not need a complete collection in memory.
- Use a context manager when a generator manages a resource that needs closing. Do not depend on garbage collection.

## Iteration and Data Structures

- Use `enumerate` when iteration needs an index. Do not use `range(len(sequence))`.
- Use a `set` or `dict` for repeated membership checks, especially with large collections.
- Use `key in mapping` or `mapping.get(key, default)` for standard dictionary lookups. Do not catch `KeyError` for these lookups.
- Use unpacking to extract values from a sequence. Use `_` for values you intentionally discard.

## Truth Testing

- Use implicit boolean checks for empty collections, such as `if not users:`. Do not use `len()` as a boolean guard.
- Use `is None` and `is not None` for `None` checks. False values, such as `0`, are not necessarily `None`.
- Use `if value:` or `if not value:` for booleans. Do not compare booleans with `==`.
- Prefer `count == 0` for numeric values that do not come from `len()`.

## Strings and Logging

- Prefer f-strings for new interpolation code. Existing `%` and `.format()` calls are acceptable.
- Do not accumulate strings with `+` in a loop. Collect parts and use `''.join()`, or write to `io.StringIO`.
- Pass logging templates and arguments separately, such as `logging.info('Processing batch %d', batch)`.
- Do not use f-strings as logging templates. Separate arguments preserve the template for structured logging systems.

## Resource Management

- Use `with` for files, sockets, database connections, and other resources that need closing.
- Use `contextlib.closing()` when a resource provides `close()` but does not support `with`.
- Do not depend on `__del__` to close resources.

## Type Annotations

- Annotate every function parameter and return value.
- Prefer `X | None` over `Optional[X]` in Python 3.10 and later.
- Prefer abstract parameter types, such as `Sequence[str]`, and concrete return types, such as `list[str]`.
- Use built-in generics, such as `list[str]`, `dict[str, int]`, and `tuple[int, ...]`.
- Do not use the deprecated aliases `typing.List`, `typing.Dict`, or `typing.Tuple`.
- Annotate variables when the type cannot be inferred.
- Use `TypeAlias` for complex, reusable types. Name type aliases with `CapWords`.
- Give each `TypeVar` a descriptive name unless it is private and unconstrained, such as `_T`.

## Naming and Encapsulation

Use these naming conventions:

| Entity | Convention | Example |
|---|---|---|
| Package or module | Use `lower_with_under`. | `data_pipeline` |
| Class or exception | Use `CapWords`. | `BatchProcessor`, `QuotaExceededError` |
| Function or method | Use `lower_with_under`. | `fetch_records()` |
| Global or class constant | Use `CAPS_WITH_UNDER`. | `MAX_BATCH_SIZE` |
| Instance or local variable | Use `lower_with_under`. | `retry_count` |
| Internal member | Prefix the name with `_`. | `_build_query()` |

- Do not use double-underscore prefixes for your own attributes. Use a single `_` instead.
- Respect encapsulation: access internal members only within their domain. The `_` prefix marks this boundary by convention.
- Improve the public API instead of accessing another domain's internal members.
- Do not encode types in names, such as `user_dict` or `name_str`. Use type annotations instead.
- Use abbreviations only when the domain widely recognizes them, such as `http`, `url`, `db`, or `cfg`.

## Module Structure

- Guard executable entry points with `if __name__ == '__main__':`.
- Do not perform network I/O, call functions, or create objects at module level. These operations run during import.

## Docstrings

- Document all public functions, methods, and classes.
- Add a module docstring at the top of a file only when the user requests it.
- Document other functions when their logic is difficult to understand or their size is substantial.
- Start with a one-line summary that ends with a period. Separate an optional body from the summary with a blank line.
- Use `Args:`, `Returns:`, and `Raises:` sections when applicable.
- Use `Yields:` instead of `Returns:` for generator functions.
- Omit docstrings for `@override` methods unless their behavior changes substantially. Document only the difference when it changes.
- Apply the layout preference in **Taste**.

## Comments

- Explain why the code exists, not what it does. Rewrite unclear code instead of explaining its operations.
- Link each TODO comment to a GitLab issue. Do not use a username as the only context.

```python
# TODO: https://gitlab.example.com/group/project/-/issues/123 - Replace this implementation with streaming.
```

## Threading

- Do not assume built-in operations are atomic, meaning they execute as one indivisible operation.
- Custom `__hash__` and `__eq__` methods can affect dictionary operations.
- Use `queue.Queue` to pass data between threads.
- Prefer `threading.Condition` over raw locks for coordination. Do not create custom synchronization primitives.

## Features to Avoid

- Avoid `eval`, `exec`, custom metaclasses, `__del__`, and bytecode manipulation.
- Standard library abstractions that use these features, such as `dataclasses`, `abc`, and `enum`, are acceptable.
- Use lambdas only for simple expressions. Use named functions for more complex logic.
- Prefer standard operator functions, such as `operator.mul`, over equivalent lambdas.
- Do not nest functions only to hide helpers. Define module-level helpers with an `_` prefix instead.

## Taste

These preferences apply unless a local convention makes the code clearer.

- Put opening and closing docstring quotes on separate lines. Start the summary after the opening quotes, even for one-sentence docstrings.

```python
"""
Summary text.

More details.
"""
```

- If a parameter or argument list spans multiple lines, put each parameter or argument on a separate line.
- Apply this layout to function definitions, method definitions, and all calls, including logging calls.
- Add a trailing comma after the last parameter or argument. Put the closing parenthesis on a separate line.
- Keep single-line definitions and calls when they fit.

```python
def fetch_existing(
    connection: opensearchpy.OpenSearch,
    index: str,
    ids: list[str],
) -> dict[str, Any]:
    ...

logger.info(
    "Wrote %d rows to %s in %.3f seconds.",
    args.rows,
    path,
    perf_counter() - start,
)
```

- Put a blank line between logical steps.
- Prefer constructors with explicit arguments over helpers that read environment variables or global configuration implicitly.
- Make configuration inputs visible at the call site.

```python
# Prefer explicit configuration.
ChatOpenAI(model=model, api_key=api_key, base_url=base_url)

# Avoid implicit configuration.
init_chat_model()
```
