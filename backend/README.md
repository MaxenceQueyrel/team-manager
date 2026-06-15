# Backend

Python 3.12 + FastAPI application layer, managed with **uv** as part of a uv workspace.

The backend depends on the `optimizer` workspace package — install from the **repo root**, not from this directory.

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| [uv](https://docs.astral.sh/uv/getting-started/installation/) | 0.5 |
| Python | 3.12 (installed automatically by uv) |

---

## Install dependencies

Run from the **repo root** (installs the full workspace: backend + optimizer):

```bash
make install-backend   # runs: uv sync --all-groups
```

This installs both runtime and dev dependencies (pytest, ruff, httpx) for all workspace members.

---

## Run the API server

```bash
# From repo root (recommended)
make run-backend

# Or manually from the backend directory
cd backend
uv run uvicorn api.main:app --reload --port 8000
```

API is available at <http://localhost:8000>.  
Interactive docs: <http://localhost:8000/docs> (Swagger UI) / <http://localhost:8000/redoc>.

---

## Environment variables

Set in the repo-root `.env` (copy from `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_DIR` | `./backend/data` | Directory for JSON data files |
| `DEBUG` | `false` | Enable debug logging |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated allowed origins |

---

## Project structure

```
backend/
├── src/api/
│   ├── main.py             FastAPI app + middleware setup
│   ├── core/
│   │   └── config.py       Pydantic Settings (reads env vars)
│   ├── models/             Pydantic domain models (Person, Project, Skill, Team)
│   ├── repositories/
│   │   └── file_repository.py  Generic JSON file-backed repository
│   ├── v1/                 API v1 routers
│   │   ├── router.py       Aggregates all v1 routes under /api/v1
│   │   ├── people.py
│   │   ├── projects.py
│   │   ├── skills.py
│   │   ├── teams.py
│   │   └── optimization.py
│   └── utils/
├── data/                   JSON flat-file database
│   ├── people.json
│   ├── projects.json
│   ├── skills.json
│   └── teams.json
└── tests/
```

---

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET/POST | `/api/v1/people` | List / create people |
| GET/PUT/DELETE | `/api/v1/people/{id}` | Read / update / delete a person |
| GET/POST | `/api/v1/projects` | List / create projects |
| GET/PUT/DELETE | `/api/v1/projects/{id}` | Read / update / delete a project |
| GET/POST | `/api/v1/skills` | List / create skills |
| GET/POST | `/api/v1/teams` | List / create teams |
| POST | `/api/v1/optimization/solve` | Run the assignment solver |

Full schema available at <http://localhost:8000/docs> when the server is running.

---

## Tests

```bash
# From repo root
make test-api

# Or manually
cd backend
uv run pytest tests/ -v
```

---

## Linting

```bash
# From repo root
make lint-backend

# Or manually
uv run ruff check backend/src
```

---

## Data layer

All data is stored as JSON files in `backend/data/`. The `FileRepository[T]` generic class handles CRUD over these files. Replacing it with a real database (PostgreSQL, SQLite) only requires implementing the same interface — the service layer is unaffected.
