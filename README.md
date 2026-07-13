# Team Manager

> Prescriptive analytics engine for team formation — blending HR management with Operations Research.

Instead of guessing who works best where, the app treats team formation as a **multi-objective MILP** and lets managers adjust objective weights to reflect their priorities.

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
make test-e2e         Run frontend Playwright end-to-end tests

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

The solver (`optimizer/`) formulates team formation as a **Mixed-Integer Linear Program (MILP)** solved with [PuLP](https://coin-or.github.io/pulp/) / CBC.

### Sets and indices

| Symbol | Definition |
|--------|-----------|
| $P$ | Set of feasible candidates (after pre-filtering) |
| $K$ | Set of skill IDs required by the project / phase |
| $\mathcal{F} \subseteq P$ | Forced inclusions — persons who must be assigned |
| $\mathcal{Q}$ | Set of squads; each $Q \in \mathcal{Q}$ is a group of persons selected all-or-nothing |
| $T$ | Ordered set of phases (phased projects only); index $t$ |
| $i, j$ | Indices over persons in $P$ |
| $k$ | Index over skills in $K$ |

### Parameters

| Symbol | Definition |
|--------|-----------|
| $S$ | Number of slots to fill (project `n_slots`) |
| $r_k$ | Minimum proficiency level required for skill $k$ |
| $l_{ik}$ | Person $i$'s proficiency level for skill $k$ (0 if absent) |
| $e_i$ | Person $i$'s years of professional experience |
| $G_i$ | Set of skill IDs that person $i$ wants to grow in |
| $a_{ij}$ | Affinity between persons $i$ and $j$, $a_{ij} \in [-5, +5]$ |
| $w_\text{perf},\, w_\text{chem},\, w_\text{grow},\, w_\text{cost}$ | User-controlled objective weights |
| $w_\text{hand}$ | Weight rewarding retention of people across consecutive phases (phased projects) |

### Decision variables

$$x_i \in \{0, 1\} \quad \forall i \in P \qquad \text{(1 if person } i \text{ is selected)}$$

$$z_{ij} \in \{0, 1\} \quad \forall i < j \in P,\; a_{ij} \neq 0 \qquad \text{(1 if both } i \text{ and } j \text{ are selected)}$$

### Per-person sub-scores

**Skill (performance) score** — average capped coverage of each required skill:

$$\text{skill}_i = \begin{cases} 1 & \text{if } K = \emptyset \\ \displaystyle\frac{1}{|K|} \sum_{k \in K} c_{ik} & \text{otherwise} \end{cases}$$

where each per-skill contribution is:

$$c_{ik} = \begin{cases} 1 & \text{if } r_k = 0 \\ \min\!\left(\dfrac{l_{ik}}{r_k},\; 1\right) & \text{otherwise} \end{cases}$$

A requirement with $r_k = 0$ means "skill must be present but any level suffices", so it is always fully satisfied.

**Growth score** — fraction of required skills that overlap with person $i$'s learning targets:

$$\text{growth}_i = \begin{cases} 0 & \text{if } K = \emptyset \\ \displaystyle\frac{|K \cap G_i|}{|K|} & \text{otherwise} \end{cases}$$

**Cost score** — inverse of experience, rewarding adequately-qualified over over-qualified staff:

$$\text{cost}_i = 1 - \min\!\left(\frac{e_i}{20},\; 1\right)$$

**Composite per-person score:**

$$s_i = w_\text{perf} \cdot \text{skill}_i \;+\; w_\text{grow} \cdot \text{growth}_i \;+\; w_\text{cost} \cdot \text{cost}_i$$

### Objective function (maximisation)

$$\max \quad \sum_{i \in P} s_i \cdot x_i \;+\; w_\text{chem} \sum_{\substack{i,j \in P \\ i < j}} a_{ij} \cdot z_{ij}$$

The chemistry term is pairwise — it captures team dynamics that cannot be expressed as a sum of individual scores. Because $z_{ij} = x_i \cdot x_j$ is a product of binary variables, it is **linearized** with the three constraints below.

### Constraints

**Cardinality** — fill exactly $S_\text{eff}$ slots, where the effective count guards against infeasibility:

$$S_\text{eff} = \max\!\bigl(\min(n\_\text{slots},\; |P|),\; |\mathcal{F}|\bigr)$$

$$\sum_{i \in P} x_i = S_\text{eff}$$

$S_\text{eff}$ clamps down when there are fewer candidates than requested slots, and clamps up when forced inclusions exceed `n_slots`.

**Forced inclusions:**

$$x_i = 1 \qquad \forall i \in \mathcal{F}$$

**Squad co-selection** — every squad is selected all-or-nothing; its feasible members move together:

$$x_i = x_j \qquad \forall\, i, j \in Q \cap P,\;\; \forall\, Q \in \mathcal{Q}$$

A squad member that is infeasible (filtered out of $P$) is simply omitted, so the remaining members still bind to one another. Combined with forced inclusions, forcing in one squad member pulls in the whole squad; if the squad cannot fit the available slots, all its members are dropped.

**Chemistry linearization** — $z_{ij}$ equals 1 if and only if both $i$ and $j$ are selected:

$$z_{ij} \leq x_i \qquad \forall i < j \in P$$
$$z_{ij} \leq x_j \qquad \forall i < j \in P$$
$$z_{ij} \geq x_i + x_j - 1 \qquad \forall i < j \in P$$

**Feasibility pre-filter** (enforced before the MILP is built — infeasible persons are never included in $P$):
- Person must **not** appear in the project's exclusion list.
- Person's effective FTE availability over the project's date ranges must be $> 0$.

Effective availability is the day-weighted average of the person's FTE windows across the project's calendar:

$$\text{avail}_i = \frac{\displaystyle\sum_{d \in \mathcal{D}} \text{ratio}_i(d)}{|\mathcal{D}|}$$

where $\mathcal{D}$ is the union of all project date-range days and $\text{ratio}_i(d)$ comes from the person's `availability_windows`, falling back to `fte_capacity` for uncovered days.

### Phased projects

A phased project staffs each phase $t \in T$ with its own slots $S_t$, required skills $K_t$, and date range. There are two solving modes, selected by the handover weight.

**Independent (default, $w_\text{hand} = 0$).** Each phase is solved as a separate MILP — its own cardinality, forced-inclusion, squad, and chemistry constraints. The project score is the sum of phase scores:

$$\text{score} = \sum_{t \in T} \text{score}_t$$

**Joint with handover ($w_\text{hand} > 0$).** All phases are solved in a single MILP so that keeping a person across consecutive phases can be rewarded. Selection variables become phase-indexed, $x_{it}$, and a retention variable links each consecutive pair of phases for persons feasible in both:

$$y_{it} \in \{0, 1\} \qquad \forall\, t \in T \setminus \{\,\text{last}\,\},\;\; i \in P_t \cap P_{t+1}$$

where $P_t$ is the feasible candidate set for phase $t$. The objective sums each phase's per-phase score and chemistry, then adds the handover bonus:

$$\max \quad \sum_{t \in T}\Bigl( \sum_{i \in P_t} s_{it}\, x_{it} \;+\; w_\text{chem}\!\!\sum_{\substack{i,j \in P_t \\ i < j}} a_{ij}\, z_{ijt} \Bigr) \;+\; w_\text{hand} \sum_{t} \sum_{i \in P_t \cap P_{t+1}} y_{it}$$

with $y_{it}$ linearized exactly like chemistry ($y_{it} = x_{it} \cdot x_{i,t+1}$):

$$y_{it} \leq x_{it} \qquad y_{it} \leq x_{i,t+1} \qquad y_{it} \geq x_{it} + x_{i,t+1} - 1$$

Every phase keeps its own cardinality, forced-inclusion, squad, and chemistry constraints. Because retention is rewarded rather than required, the solver keeps a person across phases when they remain a good-enough fit, trading marginal per-phase skill for team stability — and a person unavailable in a phase simply earns no handover bonus there.

---
