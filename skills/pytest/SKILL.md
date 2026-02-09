---
name: pytest
description: Use this skill when python unit tests, integration tests, API testing, TDD workflow, testing async code, mocking dependencies.
metadata:
  categories:
    - python
    - testing
  references:
    - https://skills.sh/bobmatnyc/claude-mpm-skills/pytest
---

# pytest - Python Testing

## Overview

pytest is the industry-standard Python testing framework. This guide focuses on high-performance, deterministic testing suitable for modern backend systems. It emphasizes strict dependency isolation, clear intent via the **Given-When-Then** pattern, and a `src`-based project layout.

**Key Features**:

- Fixture system for dependency injection
- Parametrization for data-driven tests
- Rich assertion introspection
- Async/await support (pytest-asyncio)
- Strict mocking of all external dependencies
- Parallel test execution (pytest-xdist)

**Installation (using uv)**:

```bash
# Basic pytest
uv add --dev pytest

# With common plugins
uv add --dev pytest-asyncio pytest-mock

# For FastAPI testing
uv add --dev httpx
```

---

## Core Testing Principles

To ensure reliability and speed in backend systems:

1. **Strict Mocking**: **Always** mock external dependencies.
    - **No** real database connections (use mocks or in-memory replacements if absolutely necessary).
    - **No** real network calls (mock HTTP clients, S3, external APIs).
    - **No** real message queues (mock Kafka/RabbitMQ consumers/producers).
    - **No** real filesystem access (use `tmp_path` fixture).
2. **Determinism**: Tests must yield the same result every time, regardless of environment, network status, or execution order.
3. **Isolation**: Tests should not share state. Fixtures should handle setup/teardown cleanly.
4. **Coverage Focus**:
    - **Include**: Complex business logic, edge cases, error handling pipelines.
    - **Exclude**: Configuration files, framework glue code (e.g., standard FastAPI startup boilerplate), and simple data containers (DTOs/Pydantic models without logic).

---

## Project Layout & Configuration

Tests must strictly mirror the application structure found in `src/`.

### Recommended Structure

```text
pyproject.toml
src/
    mypkg/
        __init__.py
        app.py
        services/
            user_service.py
        views/
            user_view.py
tests/
    conftest.py             # Global fixtures
    mypkg/
        __init__.py
        test_app.py
        services/
            test_user_service.py
        views/
            test_user_view.py
```

### Configuration (`pyproject.toml`)

Ensure `pythonpath` is set so pytest resolves `src` correctly without installation hacks.

```toml
[tool.pytest.ini_options]
minversion = "7.0"
addopts = "-v --strict-markers --strict-config"
pythonpath = ["src"]
testpaths = ["tests"]
python_files = ["test_*.py"]
asyncio_mode = "auto"
markers = [
    "unit: Unit tests",
    "integration: Integration tests (internal modules only)",
    "slow: Slow-running tests"
]
```

---

## Given-When-Then & Naming Conventions

Tests must clearly communicate intent using the **Given-When-Then** pattern.

### Naming Convention

Use descriptive names that describe the scenario and expected outcome:
`test_given_[context]_when_[action]_then_[expected_outcome]`

### Example

```python
# src/mypkg/services/calculator.py
def divide(a, b):
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a / b

# tests/mypkg/services/test_calculator.py
import pytest

def test_given_valid_numbers_when_dividing_then_returns_quotient():
    # Given
    dividend = 10
    divisor = 2
    
    # When
    result = divide(dividend, divisor)
    
    # Then
    assert result == 5.0

def test_given_zero_divisor_when_dividing_then_raises_value_error():
    # Given
    dividend = 10
    divisor = 0
    
    # When / Then
    with pytest.raises(ValueError, match="Cannot divide by zero"):
        divide(dividend, divisor)
```

---

## Fixtures - Dependency Injection

### Basic Fixtures

```python
# tests/conftest.py
import pytest

@pytest.fixture
def sample_user_payload():
    """Given a standard user data payload."""
    return {"username": "alice", "email": "alice@example.com"}

# tests/mypkg/test_app.py
def test_given_user_payload_when_validating_then_succeeds(sample_user_payload):
    # When
    is_valid = validate_user(sample_user_payload)
    
    # Then
    assert is_valid is True
```

### Fixture Scopes

- `function` (default): Setup/teardown for every test. Safe, isolated.

- `session`: Setup once per test run. Use sparingly for expensive, stateless setup (e.g., loading a large static schema).

### Built-in Fixtures

- `tmp_path`: Returns a `pathlib.Path` object to a temporary directory unique to the test invocation.

- `monkeypatch`: For modifying environments or replacing attributes temporarily.

```python
def test_given_env_var_when_configuring_then_reads_value(monkeypatch):
    # Given
    monkeypatch.setenv("API_KEY", "secret-123")
    
    # When
    config = load_config()
    
    # Then
    assert config.api_key == "secret-123"
```

---

## Mocking (pytest-mock)

**Strict Rule**: Mock all external boundaries.

### Mocking External APIs

```python
# src/mypkg/services/external_api.py
import httpx

async def fetch_profile(user_id: str):
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"https://api.srv/users/{user_id}")
        return resp.json()

# tests/mypkg/services/test_external_api.py
import pytest

@pytest.mark.asyncio
async def test_given_valid_id_when_fetching_profile_then_returns_data(mocker):
    # Given
    user_id = "u-123"
    expected_data = {"id": "u-123", "name": "Alice"}
    
    # Mock the response object
    mock_resp = mocker.Mock()
    mock_resp.json.return_value = expected_data
    
    # Mock the AsyncClient context manager chain
    # client.get -> returns awaitable -> returns response
    mock_client = mocker.AsyncMock()
    mock_client.get.return_value = mock_resp
    
    # Patch the class to return our mock client
    mocker.patch("httpx.AsyncClient", return_value=mock_client)
    mock_client.__aenter__.return_value = mock_client

    # When
    result = await fetch_profile(user_id)

    # Then
    assert result == expected_data
```

### Mocking Database Repositories

Do not test the database driver; test your service logic.

```python
# src/mypkg/services/user_service.py
class UserService:
    def __init__(self, repo):
        self.repo = repo

    def get_user_name(self, uid):
        user = self.repo.find_by_id(uid)
        return user.name if user else "Guest"

# tests/mypkg/services/test_user_service.py
def test_given_missing_user_when_getting_name_then_returns_guest(mocker):
    # Given
    mock_repo = mocker.Mock()
    mock_repo.find_by_id.return_value = None # Simulate DB miss
    service = UserService(repo=mock_repo)

    # When
    name = service.get_user_name(1)

    # Then
    assert name == "Guest"
    mock_repo.find_by_id.assert_called_once_with(1)
```

### Monkeypatching Strategy

Use `monkeypatch` selectively. While powerful, overuse leads to brittle tests that rely on internal implementation details rather than public interfaces.

#### When to Use `monkeypatch`

Use it for **global state** and **environment** concerns that cannot be injected via arguments.

1. **Environment Variables**: Testing configuration loading or feature flags.

    ```python
    def test_given_debug_env_when_loading_config_then_debug_is_true(monkeypatch):
        monkeypatch.setenv("DEBUG", "true")
        assert load_config().debug is True
    ```

2. **System/Standard Library Calls**: Controlling `time.time()`, `builtins.input()`, or `os.getcwd()` when you cannot inject a wrapper.

    ```python
    def test_given_user_input_when_prompted_then_confirms_action(monkeypatch):
        monkeypatch.setattr('builtins.input', lambda _: 'yes')
        assert cli.confirm_action() is True
    ```

3. **Path Manipulation**: Temporarily modifying `sys.path` to test import mechanics (rare in app code, common in tooling).

#### When to AVOID `monkeypatch`

Do not use `monkeypatch` to replace dependencies that should be injected. If you are patching a class method *inside* the function you are testing, your code is likely tightly coupled.

**Bad Practice (Patching Hardcoded Dependencies):**

```python
# Code Under Test:
# def process_payment():
#     api = StripeAPI()  <-- Hardcoded dependency
#     return api.charge()

# Brittle Test:
def test_payment(monkeypatch):
    # Relies on knowing the exact internal import path of StripeAPI
    monkeypatch.setattr("src.services.payment.StripeAPI.charge", lambda: True)
    process_payment()
```

**Better Practice (Refactor to Dependency Injection):**

```python
# Refactored Code:
# def process_payment(api: PaymentGateway):
#     return api.charge()

# Robust Test:
def test_payment(mocker):
    mock_api = mocker.Mock()
    mock_api.charge.return_value = True
    process_payment(api=mock_api)
```

**Rule of Thumb:** If you are `monkeypatching` a class or function that belongs to your own codebase, try to refactor to Dependency Injection first. Only patch 3rd party libraries or system calls that you cannot control.

---

## Parametrization

Use parametrization to test multiple inputs against the same logic without code duplication.

```python
import pytest

@pytest.mark.parametrize("input_a, input_b, expected", [
    (2, 3, 5),
    (-1, 1, 0),
    (0, 0, 0),
], ids=["positive_integers", "negative_and_positive", "zeros"])
def test_given_operands_when_adding_then_returns_sum(input_a, input_b, expected):
    # Given inputs via parametrize
    
    # When
    result = add(input_a, input_b)
    
    # Then
    assert result == expected
```

---

## FastAPI Testing

Testing FastAPI applications requires `httpx` and `TestClient`.

### Basic API Test

```python
# src/mypkg/main.py
from fastapi import FastAPI
app = FastAPI()

@app.get("/health")
def health_check():
    return {"status": "ok"}

# tests/mypkg/test_main.py
from fastapi.testclient import TestClient
from src.mypkg.main import app

client = TestClient(app)

def test_given_running_app_when_checking_health_then_returns_ok():
    # When
    response = client.get("/health")
    
    # Then
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

### Dependency Overrides

To mock database sessions or authentication in FastAPI integration tests, use `dependency_overrides`.

```python
# tests/conftest.py
import pytest
from fastapi.testclient import TestClient
from src.mypkg.main import app
from src.mypkg.dependencies import get_db

@pytest.fixture
def mock_db_session(mocker):
    return mocker.Mock()

@pytest.fixture
def client(mock_db_session):
    # Override the dependency
    app.dependency_overrides[get_db] = lambda: mock_db_session
    
    with TestClient(app) as c:
        yield c
    
    # Clean up
    app.dependency_overrides = {}

# tests/mypkg/api/test_users.py
def test_given_db_error_when_creating_user_then_returns_500(client, mock_db_session):
    # Given
    mock_db_session.add.side_effect = Exception("DB Connection Failed")
    
    # When
    response = client.post("/users", json={"name": "Alice"})
    
    # Then
    assert response.status_code == 500
```

---

## Common Pitfalls

### Anti-Pattern 1: Network Calls in Tests

```python
# BAD
def test_get_google():
    import requests
    assert requests.get("https://google.com").status_code == 200
```

**Fix**: Use `responses` or `pytest-mock` to intercept the call.

### Anti-Pattern 2: Vague Test Names

```python
# BAD
def test_user_logic(): ...
def test_case_1(): ...
```

**Fix**: `test_given_active_user_when_deactivating_then_sets_flag_false`

### Anti-Pattern 3: Testing Implementation Details

```python
# BAD
def test_internal_cache():
    service = UserService()
    service.get_user(1)
    # Testing private attribute `_cache` makes refactoring hard
    assert service._cache["1"] is not None 
```

**Fix**: Test the public interface (behavior), not the internal state.

---

## Quick Reference Commands

```bash
pytest

# Verbose output
pytest -v

# Show print statements
pytest -s

# Run specific file
pytest tests/test_api.py

# Run specific test
pytest tests/test_api.py::test_create_user

# Run by marker
pytest -m unit
pytest -m "not slow"

# Run with coverage
pytest --cov=app --cov-report=html

# Parallel execution
pytest -n auto  # Requires pytest-xdist

# Stop on first failure
pytest -x

# Show local variables on failure
pytest -l

# Run last failed tests
pytest --lf

# Run failed tests first
pytest --ff
```
