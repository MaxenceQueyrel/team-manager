# Copilot Instructions for Team Manager

This repository is a prescriptive analytics engine for team formation. It models team allocation as a multi-objective Mixed-Integer Linear Program (MILP) solved using PuLP/CBC.

---

## 1. Development & Quality Commands

Use the following commands from the **repository root** for routine development, testing, and linting:

### Docker Stack Management
* **Start Dev Environment (Hot-Reload):** `make dev`
* **Stop Dev Environment:** `make down`
* **Show Dev Logs:** `make logs`
* **Start Prod Environment:** `make prod`

### Backend & Optimizer (Python 3.12, managed with `uv`)
* **Install Dependencies (Full Workspace):** `make install-backend` (runs `uv sync --all-groups`)
* **Run API Server (Hot-Reload, localhost:8000):** `make run-backend` (runs `uvicorn api.main:app`)
* **Run All Python Tests (Optimizer + Backend):** `make test`
* **Run Optimizer Tests Only:** `make test-optimizer` (or `cd optimizer && uv run pytest tests/ -v`)
* **Run Backend API Tests Only:** `make test-api` (or `cd backend && uv run pytest tests/ -v`)
* **Run a Single Target Test:**
  * **Optimizer:** `cd optimizer && uv run pytest tests/test_solver.py -k test_joint_solving -v`
  * **Backend:** `cd backend && uv run pytest tests/test_people.py -k test_create_person -v`
* **Lint Code (Ruff):** `make lint-backend` (runs `uv run ruff check optimizer/src backend/src`)
* **Clean Artifacts/Caches:** `make clean`

### Frontend (React 19 + TypeScript, managed with `bun`)
* **Install Dependencies:** `make install-frontend` (runs `cd frontend && bun install`)
* **Run Frontend Dev Server (localhost:3000):** `make run-frontend` (runs `cd frontend && bun run dev`)
* **Build Production Bundle:** `cd frontend && bun run build` (runs `tsc -b && vite build`)
* **Lint TypeScript/React:** `make lint-frontend` (runs `cd frontend && bun run lint`)

---

## 2. High-Level Architecture

The project is structured as a monorepo workspace divided into three main modules:

```
team-manager/
├── frontend/          React 19 + TS Single Page Application (vanilla CSS, React Router 7, Zustand)
├── backend/           FastAPI web layer; acts as the API boundary and data storage manager
├── optimizer/         Pure-Python OR engine (framework-agnostic, zero I/O, zero HTTP)
└── infra/             Docker configurations for both development and production
```

### Pure-Python OR Engine (`optimizer/`)
* **Design Pattern:** Implements the Ports & Adapters (Hexagonal) pattern.
  * `domain/solver.py` defines `AssignmentSolverPort`, the interface that all external consumers depend on.
  * `adapters/pulp_solver.py` provides `PuLPTeamAssignmentSolver`, which translates domain inputs into standard MILP formulations.
* **Optimization Formulation:**
  * Multi-objective weights reward performance (skill coverage), candidate growth (personal learning targets matching project needs), and cost control (favoring adequately-qualified over highly-experienced, expensive staff).
  * Pairwise Chemistry/Affinity rewards selection of compatible pairs. This quadratic formulation is linearized via auxiliary binary variables $z_{ij}$ with three linear inequality bounds.
  * Phased projects can be solved independently, or jointly with a handover retention bonus across consecutive phases via retention variables $y_{it}$.
* **Availability Management:** Effective availability represents day-weighted average FTE capacity across project calendars.

### Backend Application Layer (`backend/`)
* **API Framework:** FastAPI router endpoints (under `backend/src/api/v1/`) process HTTP requests, convert API models to solver-friendly schemas, and run optimization jobs.
* **Data Storage:** Persisted locally as JSON flat-files under `backend/data/` (configured with `DATA_DIR`).
* **Repository Pattern:** Driven by a generic `FileRepository[T]` (`backend/src/api/repositories/file_repository.py`) which isolates JSON reading, serialization, UUID generation, and basic CRUD tasks away from the controllers.

### Frontend Client Layer (`frontend/`)
* **UI/Style:** Implemented using React 19 and Vite. **Note: This project does NOT use Tailwind CSS.** It uses clean, standard vanilla CSS in `src/index.css`.
* **State & Routing:** State management is handled with Zustand, and client-side routing is handled with React Router 7.

---

## 3. Key Conventions & Best Practices

To maintain code consistency, align with the following architectural rules:

### Python Typing & Docstrings
* **Union Types:** Use modern PEP 604 union syntax. **Never** import or use `Optional[T]`; write `T | None` instead.
* **Docstrings:** Use **Google-style docstrings**. Provide them *only* for public, top-level classes and functions. Avoid writing repetitive docstrings for internal methods or private helpers.

### Code Organization
* **Separation of Concerns:** Keep `optimizer` completely free of web frameworks, I/O libraries, or DB access. Keep the backend controllers free of mathematical solver details.
* **No Speculative Abstractions:** "Three similar lines is preferable to a premature helper." Keep logic straightforward, readable, and concrete. Do not generalize code in anticipation of hypothetical future requirements.
* **No Defensive Noise:** Omit redundant error-handling wrappers, intermediate fallbacks, and parameter assertions for cases that physically cannot happen under normal program flow. Enforce validation exclusively at system boundaries (e.g., Pydantic schema validation at API endpoints and file loaders).
* **No Orphan Comments:** Avoid comments that describe *what* the code does. Write comments only when the *why* is completely non-obvious (such as pointing out a subtle optimization layout or explaining a mathematical linearization constraint).

### Project Custom Tool Commands (For Claude/Other Agents)
* **Scaffold a New Endpoint:** Call the `/new-endpoint <resource-name>` custom CLI command to generate boilerplates under `backend/src/api/v1/`.
* **Describe Solver Internals:** Call the `/optimizer-explain` CLI command to retrieve detailed technical/mathematical summaries of the OR models.
