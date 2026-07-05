# CLAUDE.md

## Testing

- Use **pytest** for all Python tests.
- Test files live in the `tests/` directory of each package (`optimizer/tests/`, `backend/tests/`).
- Run tests with `make test-optimizer` or `make test-api`, or directly via `uv run pytest tests/ -v`.

## Typing

Use latest convention. Don't use Optional use | None instead.

## Docstrings

- Use **Google-style docstrings**.
- Add docstrings only to **public, top-level functions and classes** — not to subclasses, private helpers, or methods whose purpose is obvious from their name and signature.

Google docstring format:

```python
def solve(self, project: ProjectInput, people: list[PersonInput]) -> AssignmentResult:
    """Finds the optimal team assignment for a project using the Hungarian algorithm.

    Args:
        project: The project requirements and constraints.
        people: Pool of candidate people to assign.

    Returns:
        An AssignmentResult with the selected members and a composite score.

    Raises:
        ValueError: If n_slots exceeds the number of available people.
    """
```

## Code practices

- **No speculative abstractions** — do not generalise beyond the current requirement. Three similar lines is preferable to a premature helper.
- **No defensive noise** — omit error handling, fallbacks, and validation for scenarios that cannot occur. Validate only at system boundaries (HTTP request, file I/O).
- **No orphan comments** — only add a comment when the *why* is non-obvious (a hidden constraint, a workaround, a subtle invariant). Never describe *what* the code does.
- **Explicit over implicit** — prefer clear, direct code over clever one-liners.
- **One responsibility per module** — keep the optimizer package free of HTTP/IO concerns; keep the API layer free of OR logic.

## Files and directories Claude should ignore

Claude Code should not read or include in context the following (cache, build artifacts, secrets):

- `.venv/` — Python virtual environment
- `.ruff_cache/` — Ruff linter cache
- `__pycache__/` — Python bytecode cache
- `.pytest_cache/` — Pytest cache
- `*.egg-info/` — Setuptools metadata
- `.env` / `.env.local` — Environment secrets
- `node_modules/` — Frontend dependencies
- `.next/`, `dist/`, `build/` — Build outputs
- `uv.lock` — Lock file (only commit the source `pyproject.toml`, lock is derived)

Use `make clean` to remove these artifacts.
