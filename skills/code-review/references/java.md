---
references:
  - https://google.github.io/styleguide/javaguide.html
---

# Java Code Standards

> This list excludes everything handled by automated tools (like `google-java-format` or Checkstyle), such as indentation, line wrapping, and import ordering.

## 1. Code Logic & Organization

* **One Class Per File:** Each top-level class must reside in its own source file.
* **Member Ordering:** There is no fixed rule, but you must use a **logical order** (not just chronological) that you could explain to a reviewer.
* **Overloads Never Split:** Keep all methods/constructors with the same name in one contiguous block, even if they have different modifiers (e.g., a `private` overload must stay next to the `public` one).
* **Grouping Parentheses:** Do not rely on the Java operator precedence table. Use grouping parentheses even when optional if they improve readability or prevent misinterpretation.

## 2. Naming Conventions (Semantics)

* **CamelCase Rules:** Acronyms are treated as words. Use `XmlHttpRequest`, not `XMLHTTPRequest`; `newCustomerId`, not `newCustomerID`.
* **Constants (`UPPER_SNAKE_CASE`):** Only use this for **deeply immutable** static final fields. If the object’s state can change (e.g., a `HashSet` or a non-final reference), use `lowerCamelCase`.
* **Test Methods:** You may use underscores in JUnit test names to separate components (e.g., `transferMoney_deductsFromSource`).
* **Clean Names:** Avoid all Hungarian notation or prefixes/suffixes (no `mName`, `s_name`, or `name_`).

## 3. Programming Practices

* **`@Override` is Mandatory:** Always use it when legal (including when implementing interface methods).
* **Don't Ignore Exceptions:** Catch blocks should almost never be empty. If it is truly appropriate to do nothing, you **must** document the reason with a comment.
* **Static Qualifying:** Always call static members using the Class name, never via an instance variable (`Foo.method()`, not `myFoo.method()`).
* **Smallest Scope:** Declare local variables close to where they are first used. Don't "habitually" declare them at the top of a block.
* **Finalizers:** Do not use `Object.finalize()`.

## 4. Implementation Comments & TODOs

* **`TODO` Format:** Use `// TODO: url/to/bug - description`. Avoid just tagging a username; provide a link to a tracked issue or a specific expiration event.
* **No "Box" Comments:** Do not draw boxes with asterisks around comments.

## 5. Javadoc Content (The "Human" Side)

* **Where it's Required:** Mandatory for every `public` or `protected` class/member (with rare exceptions for "obvious" methods like `getFoo()`).
* **The Summary Fragment:** The first line must be a **summary fragment** (noun or verb phrase), not a complete sentence.
  * *Bad:* `/** This method returns the ID. */`
  * *Good:* `/** Returns the customer ID. */`
* **No Empty Tags:** Never include a `@param` or `@return` tag without a description.
* **Ordering:** Keep tags in this specific order: `@param`, `@return`, `@throws`, `@deprecated`.

## 6. Framework-Specific Addenda

Load framework-specific guidance only when relevant to the reviewed code:

* **Spring Boot:** See [java-springboot.md](java-springboot.md)
