# Python Unit Testing (pytest)

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
- `session`: Setup once per test run. Use sparingly for expensive, stateless setup.

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

Use `monkeypatch` selectively. Do not use `monkeypatch` to replace dependencies that should be injected.

#### When to Use `monkeypatch`

1. **Environment Variables**: Testing configuration loading or feature flags.
2. **System/Standard Library Calls**: Controlling `time.time()`, `builtins.input()`.

**Rule of Thumb:** If you are `monkeypatching` a class or function that belongs to your own codebase, try to refactor to Dependency Injection first.

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
    result = add(input_a, input_b)
    assert result == expected
```

## FastAPI Testing

### Basic API Test

```python
# tests/mypkg/test_main.py
from fastapi.testclient import TestClient
from src.mypkg.main import app

client = TestClient(app)

def test_given_running_app_when_checking_health_then_returns_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

### Dependency Overrides

```python
# tests/mypkg/api/test_users.py
def test_given_db_error_when_creating_user_then_returns_500(client, mock_db_session):
    # Given
    mock_db_session.add.side_effect = Exception("DB Connection Failed")
    
    # When
    response = client.post("/users", json={"name": "Alice"})
    
    # Then
    assert response.status_code == 500
```

## Quick Reference Commands

```bash
pytest
pytest -v               # Verbose output
pytest -s               # Show print statements
pytest tests/test_api.py # Run specific file
pytest tests/test_api.py::test_create_user
pytest -m unit          # Run by marker
pytest --cov=app --cov-report=html
pytest -n auto          # Parallel execution (requires pytest-xdist)
pytest --lf             # Run last failed tests
```
