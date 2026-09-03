---
references:
  - https://github.com/arsy786/springboot-best-practices
---

# Springboot Best Practices

Use this addendum only when reviewing Spring Boot services/APIs.

## 1. Architecture & Layering

* **Packaging Strategy:**
  * **By Type:** (`controller`, `service`, `repository`) for small microservices.
  * **By Feature:** (`customer`, `order`, `inventory`) for large, complex codebases.
* **Controller Constraint:** Controllers must be stateless symbols of routing. **Zero business logic** allowed; hand off all processing to the Service layer immediately.
* **Service Responsibility:** Place all business logic, validation, and caching here. Services should be the bridge between Controllers and the Persistence layer.
* **Custom Response Objects:** Wrap API outputs in a common `ApiResponse` DTO to maintain consistent structures (status codes, messages, timestamps) across the project.

## 2. Dependency Management & DI

* **Constructor Injection:** **Always** prefer constructor injection over `@Autowired` on fields.
  * *Tip:* Use Lombok’s `@RequiredArgsConstructor` on the class and mark dependencies as `private final` to automate this.
* **Starters & Versions:** Use `spring-boot-starter-*` dependencies to ensure compatible library versions. Manage non-starter versions using Maven/Gradle `<properties>` to avoid version drift.

## 3. Error Handling & Validation

* **Global Exception Handling:** Use `@ControllerAdvice` to create a central exception handler. Convert internal exceptions into meaningful, user-friendly API responses.
* **Bean Validation:** Use `javax.validation` (or `jakarta.validation`) annotations (e.g., `@NotBlank`, `@Min`) on DTOs. Trigger them in Controllers using the `@Valid` annotation.
* **Optional for Null-Safety:** Use `Optional<T>` for repository lookups (e.g., `.orElseThrow()`) to avoid `NullPointerException`.

## 4. Performance & Persistence

* **Caching:** Enable caching via `@EnableCaching`. Start with the default `ConcurrentHashMap` for simple cases, or move to Redis/Hazelcast for distributed systems.
* **Pagination:** Never return raw `List<Entity>` for large datasets. Use `PagingAndSortingRepository` to return `Page<T>` or `Slice<T>`.
* **Logging:** **Refer to Java Best Practice.** Use `@Slf4j` and prefer `{}` placeholders over String concatenation.

## 5. Configuration

* **YAML over Properties:** Use `application.yml` for hierarchical, more readable configuration.
* **Security:** Never store plain-text secrets. Encrypt sensitive data or externalize it using Spring Cloud Config or Vault.

## 6. Testing & Quality

* **Integration Testing:** Use `MockMvc` for end-to-end endpoint testing.
* **Mocking:** Mock the Repository and Service layers during unit tests to isolate logic and avoid side effects in the database.
* **Tooling:** Use the **SonarLint** plugin in your IDE to catch "code smells" and security vulnerabilities during development.

## 7. Overlap with General Java Rules

* Naming conventions, formatting, and comment quality remain governed by [SKILL.md](../SKILL.md).
* Lombok and Streams usage should be evaluated by readability, correctness, and team conventions rather than blanket usage mandates.
