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
| `DATABASE_URL` | `postgresql+psycopg://team_manager:team_manager@localhost:5432/team_manager` | Postgres connection string — auth data only, see [Database (auth schema)](#database-auth-schema) |
| `JWT_SECRET` | `change-me` | Signing secret for access/refresh tokens |
| `JWT_ACCESS_TTL_MINUTES` | `15` | Access token lifetime |
| `REFRESH_TTL_DAYS` | `30` | Refresh token lifetime |

---

## Project structure

```
backend/
├── src/api/
│   ├── main.py             FastAPI app + middleware setup
│   ├── core/
│   │   └── config.py       Pydantic Settings (reads env vars)
│   ├── db/                 SQLAlchemy layer — auth data only (Postgres)
│   │   ├── base.py         Declarative Base
│   │   ├── session.py      Engine, SessionLocal, get_db() dependency
│   │   └── models.py       User, Role, Permission, RefreshToken, ...
│   ├── models/             Pydantic domain models (Person, Project, Skill, Team)
│   ├── repositories/
│   │   └── file_repository.py  Generic JSON file-backed repository
│   ├── v1/                 API v1 routers
│   │   ├── router.py       Aggregates all v1 routes under /api/v1
│   │   ├── people.py
│   │   ├── projects.py
│   │   ├── roles.py
│   │   ├── skills.py
│   │   ├── teams.py
│   │   └── optimization.py
│   └── utils/
├── data/                   JSON flat-file database
│   ├── people.json
│   ├── projects.json
│   ├── roles.json
│   ├── skills.json
│   └── teams.json
├── alembic/                Migrations for the auth schema (Postgres)
│   └── versions/
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
| GET/POST/PUT/DELETE | `/api/v1/skills` | Manage skills |
| GET/POST/PUT/DELETE | `/api/v1/roles` | Manage roles |
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

People/Projects/Teams/Roles/Skills/Assignments are stored as JSON files in `backend/data/`. The `FileRepository[T]` generic class handles CRUD over these files. Replacing it with a real database (PostgreSQL, SQLite) only requires implementing the same interface — the service layer is unaffected.

Auth data (users, roles, permissions, refresh tokens) lives in Postgres instead — see below.

---

## Database (auth schema)

Postgres is scoped to **auth data only** (`users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `refresh_tokens`) via SQLAlchemy 2.0 + Alembic. Everything else stays on the JSON data layer described above.

Start local Postgres first:

```bash
# Full dev stack (from repo root)
make dev

# Or just the database, if running the API locally
docker compose -f infra/docker-compose.dev.yml up -d postgres
```

`DATABASE_URL` (see [Environment variables](#environment-variables)) already points at this service by default. All commands below run from `backend/`:

```bash
# Apply all migrations (creates the schema + seeds manager/employee roles)
uv run alembic upgrade head

# Roll back one migration / everything
uv run alembic downgrade -1
uv run alembic downgrade base

# Generate a new migration from ORM model changes in db/models.py
uv run alembic revision --autogenerate -m "describe the change"

# Inspect current revision / history
uv run alembic current
uv run alembic history
```

Inside the Docker dev stack, run them in the running `backend` container instead:

```bash
docker compose -f infra/docker-compose.dev.yml exec backend uv run alembic upgrade head
```

`alembic/env.py` reads the connection string from `Settings.database_url` (`.env`-driven), not from `alembic.ini`, so no separate DB URL configuration is needed.

`get_db()` (in `src/api/db/session.py`) is a synchronous SQLAlchemy session `Depends()` — the first `Depends()` pattern in this codebase — for any route handler that needs auth-schema access.
