---
name: ts-coding-practice
description: TypeScript coding standards for modules, type modeling, runtime safety, error boundaries, and JSDoc. Use when writing or reviewing TypeScript code.
metadata:
  categories:
    - coding-standards
    - typescript
    - software-development
  references:
    - https://google.github.io/styleguide/tsguide.html
---

# TypeScript Coding Standards

> Repo config wins. Defaults: pnpm (npm ok), Biome for format/lint, Vitest for tests, `tsc` for types. This covers what tools cannot catch.

## 1. Modules and Imports

* **Small module API:** Export only what external callers need. Never export mutable state; expose it through functions.
* **No static-only classes:** Use file/module scope for namespacing. Never create a class whose only purpose is to hold statics or constants.

```ts
// Yes
export function formatUser(u: User): string { ... }

// No
export class UserUtils {
  static format(u: User): string { ... }
}
```

* **Named vs. namespace imports:** Prefer named imports when symbols are clear and used often. Prefer `import * as ns` when the API is large or names are generic.

```ts
// Yes — clear, used often
import { User, formatUser } from './user';

// Yes — large API, generic names
import * as path from 'node:path';
```

* **Rename only for a reason:** Rename an import only to resolve a collision, fix an unclear generated name, or make intent materially clearer. Never rename for style.
* **Relative imports are fine until they climb:** Prefer relative imports inside one project. When you see `../../../`, the module layout is wrong — move the file or split the package.

## 2. Types and Data Modeling

* **Interface for shapes, type alias for expressions:** Prefer `interface` for object shapes. Use `type` for unions, primitives, tuples, mapped types, and anything an interface cannot model.

```ts
// Yes
interface User { id: string; name: string }
type Status = 'active' | 'suspended';

// No
type User = { id: string; name: string };
```

* **Annotate implementations at the declaration:** Put an explicit type on an object that implements a contract, so errors point at the declaration, not a distant call site.

```ts
// Yes — typo caught here
const handler: RequestHandler = { handle: (req) => ... };

// No — typo surfaces wherever handler is used
const handler = { handel: (req) => ... };
```

* **Simplest type that works:** Prefer a little repetition over mapped or conditional types the reader must mentally execute.
* **`Map`/`Set` vs. `Record`:** Prefer `Map`/`Set` for dictionary/set behavior. Use `Record` only when the complete key set is statically known. Give index-signature keys meaningful names.

```ts
// Yes
const byId = new Map<string, User>();
type Scores = Record<'math' | 'english', number>;

// No — looks static, is actually dynamic
const byId: Record<string, User> = {};
```

```ts
// Yes
interface Cache { [url: string]: Response }

// No
interface Cache { [key: string]: Response }
```

* **Named fields over tuples:** Prefer named object fields over positional tuples when values are not obvious at the call site.

```ts
// Yes
function move(to: { x: number; y: number }): void { ... }

// No
function move(to: [number, number]): void { ... }
```

* **Keep absence local:** Never bake `null`/`undefined` into a reusable alias. Add it at the usage boundary. Follow the surrounding API's absence convention (`null` vs `undefined`), never mix both in one API.

```ts
// Yes
type UserId = string;
function find(id: UserId): User | undefined { ... }

// No
type MaybeUserId = string | null | undefined;
```

* **`unknown` by default, `any` with a reason:** Prefer `unknown` for untrusted or opaque values and narrow before use. Use `any` only when the unsafe boundary is intentional, and explain why in a comment.
* **No return-only generics:** A caller must not choose an unchecked return type. When consuming such an API, pass the generic argument explicitly.

```ts
// Risky to provide — caller picks T with no check
declare function load<T>(key: string): T;

// When consuming: be explicit
const user = load<User>('user');
```

* **Annotate to clarify or lock a contract, not to restate inference:** Add annotations for complex values, public contracts, or to catch drift. Omit them when they merely repeat what `tsc` already infers.

## 3. Runtime Correctness

* **Assertions are unsafe:** Treat `as` and `!` as unsafe. Prefer runtime checks and narrowing. If an assertion is unavoidable and its safety is not obvious, document the invariant.

```ts
// Yes
const el = document.getElementById('app');
if (!(el instanceof HTMLElement)) throw new Error('missing #app');

// No
const el = document.getElementById('app') as HTMLElement;
```

* **Check object literals with `satisfies` or an annotation, not `as`:** `satisfies` and annotations catch excess or renamed fields; `as` hides them.

```ts
// Yes — typo in 'handel' is an error
const h = { handel: fn } satisfies RequestHandler;

// No — typo silently passes
const h = { handel: fn } as RequestHandler;
```

* **Spread is shallow, order wins:** Spread iterables into arrays and plain objects into objects. Never spread class instances or prototype-bearing values.

```ts
// Yes
const merged = { ...defaults, ...overrides };

// No — loses prototype, methods break
const copy = { ...classInstance };
```

* **Shallow destructured params:** Keep destructured parameters shallow. Use an options object when several optional arguments lack a natural order. Keep defaults simple and side-effect free.
* **Wrap callbacks in an arrow when the caller may pass extras:** Forward only the parameters the callback is meant to receive.

```ts
// Yes
ids.map((id) => fetchById(id));

// No — map passes (value, index, array); parseInt takes (string, radix)
ids.map(parseInt);
```

* **Getters stay pure:** Keep getters free of observable side effects. Never add a pass-through getter/setter pair with no behavior; expose the property directly, often as `readonly`.
* **`toString()` is total and pure:** Never throw from `toString()`, never change state in it.
* **Stable listener references:** Use a stable function reference for listeners that must later be removed. Never install with inline `bind()` — the new reference cannot be reproduced for removal.

```ts
// Yes
const onResize = (): void => { ... };
window.addEventListener('resize', onResize);
window.removeEventListener('resize', onResize);

// No — removeEventListener can never match
window.addEventListener('resize', handler.bind(this));
```

* **Numbers:** Parse decimal input with `Number()` and validate `NaN`, infinities, empty/whitespace input, and domain limits. For non-decimal `parseInt`, validate every digit before parsing.
* **Enums:** Compare enum values explicitly. Never rely on truthiness — numeric enum `0` is falsy.

```ts
// Yes
if (status === Status.Active) { ... }

// No — breaks when Active = 0
if (status) { ... }
```

## 4. Error Handling

* **Throw only `Error`:** Throw and reject only `Error` instances (including custom `Error` subclasses for structured context). Never throw strings, objects, or `null`.
* **Catch as `unknown`:** Narrow to `Error` before handling. Support non-`Error` throws only at a known broken-dependency boundary, and document that boundary.

```ts
// Yes
try {
  await save(user);
} catch (e: unknown) {
  if (e instanceof Error) log(e.message);
  throw e;
}
```

## 5. JSDoc

Required on exported APIs and any non-obvious behavior. Cover what the type system cannot say: invariants, side effects, failure modes, units, ordering, ownership, lifecycle.

```ts
/**
 * Replays buffered events in subscription order.
 *
 * Ownership: caller retains `events`; this function never mutates it.
 * @throws {QuotaError} When the buffer exceeds `maxBytes`.
 */
export function replay(events: Event[], maxBytes: number): void;
```

* **Include:** how/when to use it, preconditions, what can throw, units, order constraints, who owns or mutates inputs, lifecycle or cleanup duties.
* **Omit:** anything the signature already says. No `@param`/`@returns` prose when names and types are sufficient. Never restate types or modifiers (`string`, `readonly`, `async`) in words.
* **Ambiguous call args:** Prefer an options object over parameter-name comments for boolean or positional args.

```ts
// Yes
createUser({ name, admin: true });

// No — reader must guess what `true` means
createUser(name, /* admin */ true);
```

* **Deprecation:** Mark with `@deprecated` and give a concrete migration path (target symbol, version, or snippet). Never deprecate without a replacement.

## 6. Taste

Personal preferences, not hard standards. Prefer them when they do not fight a clearer local convention.

* **Readability over sugar:** Avoid dense one-liners, nested `await` spreads, and chained transforms. Break logic into named intermediate variables.

```ts
// Yes
const rows = await loadRows();
const active = rows.filter((r) => r.active);

// No
const active = [...(await loadRows())].filter((r) => r.active);
```

* **Clean module boundaries:** Keep responsibilities strictly separated by file. One file, one job.
* **Document runtime-forced structure:** Add a short comment when runtime behavior forces the code shape (e.g. dynamic import for OTel patching).

```ts
// Yes
// Dynamic import: OTel must patch http before it is loaded.
const { server } = await import('./server');
```
