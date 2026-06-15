# Team Manager

> Prescriptive analytics engine for team formation — blending HR management with Operations Research.

Instead of guessing who works best where, the app treats team formation as a **constrained optimization problem** (Assignment Problem variant) and lets managers adjust multi-objective weights to reflect their priorities.

---

## Repository layout

```
team-manager/
├── frontend/          React 19 + TypeScript + Vite  (managed with bun)
├── backend/           Python 3.12 + FastAPI          (managed with uv)
├── optimizer/         Pure-Python OR engine          (managed with uv)
├── infra/
│   ├── docker-compose.dev.yml   local development
│   ├── docker-compose.yml       production
│   └── docker/nginx/            nginx reverse-proxy config
├── pyproject.toml     uv workspace root (backend + optimizer)
└── Makefile           developer shortcuts
```

Each module has its own README:

- [frontend/README.md](frontend/README.md)
- [backend/README.md](backend/README.md)
- [optimizer/README.md](optimizer/README.md)
- [infra/README.md](infra/README.md)

---

## Prerequisites

| Tool | Minimum version | Purpose |
|------|----------------|---------|
| [Docker](https://docs.docker.com/get-docker/) + [Compose](https://docs.docker.com/compose/) | Docker 24 | Run the full stack |
| [uv](https://docs.astral.sh/uv/getting-started/installation/) | 0.5 | Python workspace (backend + optimizer) |
| [bun](https://bun.sh/) | 1.1 | Frontend package manager & dev server |
| Python | 3.12 | Required by uv — installed automatically |

---

## Quickstart with Docker (recommended)

```bash
# 1. Clone
git clone <repo-url> team-manager
cd team-manager

# 2. Copy environment file (edit if needed)
cp .env.example .env

# 3. Start the full stack with hot-reload
make dev
```

| Service  | URL |
|----------|-----|
| Frontend | <http://localhost:3000> |
| Backend  | <http://localhost:8000> |
| API docs | <http://localhost:8000/docs> |

```bash
# Stop
make down
```

See [infra/README.md](infra/README.md) for production and advanced Docker usage.

---

## Quickstart without Docker

```bash
# 1. Clone & enter
git clone <repo-url> team-manager
cd team-manager

# 2. Copy env file
cp .env.example .env

# 3. Install Python dependencies (optimizer + backend in one shot)
make install-backend

# 4. Install frontend dependencies
make install-frontend

# 5. In a first terminal — API server
make run-backend      # runs on http://localhost:8000

# 6. In a second terminal — Frontend dev server
make run-frontend     # runs on http://localhost:3000
```

---

## All Make targets

```
make dev              Start full stack in dev mode (Docker, hot-reload)
make prod             Build and start production stack (Docker)
make down             Stop dev containers
make down-prod        Stop production containers
make logs             Tail dev container logs

make install-backend  Install Python workspace dependencies (uv sync)
make install-frontend Install frontend dependencies (bun install)
make run-backend      Run API server locally with hot-reload
make run-frontend     Run frontend dev server locally

make test             Run all tests (optimizer + API)
make test-optimizer   Run optimizer unit tests only
make test-api         Run backend API tests only

make lint-backend     Lint Python code with ruff
make lint-frontend    Lint TypeScript with eslint
```

---

## Environment variables

Copy `.env.example` to `.env` and adjust as needed:

```dotenv
# Backend
DATA_DIR=./backend/data      # path to JSON data files
DEBUG=false
CORS_ORIGINS=http://localhost:3000

# Frontend (VITE_ prefix exposes the value to the browser build)
VITE_API_URL=http://localhost:8000
```

---

## Optimization model

The solver (`optimizer/`) implements a **multi-objective assignment** using `scipy.optimize.linear_sum_assignment` (Hungarian algorithm).

| Objective | What it optimises |
|-----------|-------------------|
| **Performance** | Skill-gap minimisation + seniority fit |
| **Chemistry** | Pairwise affinity scores among assigned members |
| **Growth** | Overlap between project skills and personal learning targets |
| **Cost** | Prefers adequately-qualified over over-qualified staff |

Users control objective weights via sliders on the Optimization page.

**Hard constraints** (always enforced):
- Exclusion lists (legal, timezone, interpersonal conflicts)
- FTE capacity (a person at 0 % availability is never assigned)

---

## Roadmap

- [ ] Authentication (JWT)
- [ ] Persistent database (PostgreSQL)
- [ ] Affinity survey UI
- [ ] Multi-project simultaneous optimisation
- [ ] Kubernetes deployment (Helm chart)
- [ ] Terraform cloud provisioning
