# Optimizer

Framework-agnostic Operations Research engine for team assignment. Contains zero HTTP, database, or I/O code — it is a pure computation library consumed by the backend.

Managed with **uv** as a workspace member.

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| [uv](https://docs.astral.sh/uv/getting-started/installation/) | 0.5 |
| Python | 3.12 |

---

## Install

Install from the **repo root** (the workspace wires everything together):

```bash
uv sync
```

---

## Project structure

```
optimizer/
├── src/optimizer/
│   ├── __init__.py
│   ├── models.py        Input/output Pydantic models (ProjectInput, PersonInput, …)
│   ├── objectives.py    Scoring functions (performance, chemistry, growth, cost)
│   ├── constraints.py   Feasibility mask builder (exclusions, FTE capacity)
│   └── solver.py        TeamAssignmentSolver — entry point
└── tests/
    └── test_solver.py
```

---

## How the solver works

`TeamAssignmentSolver.solve()` takes a project, a list of candidates, and weight sliders and returns the optimal assignment.

1. **Score matrix** — `compute_score_matrix()` builds an `(n_slots × n_people)` matrix where each cell is a weighted sum of objectives.
2. **Feasibility mask** — `build_feasibility_mask()` sets infeasible cells (zero FTE, exclusion lists) to `-∞`.
3. **Hungarian algorithm** — `scipy.optimize.linear_sum_assignment` finds the maximum-weight matching in O(n³).
4. **Chemistry bonus** — pairwise affinity between assigned members is added after the main solve.

### Objectives

| Objective | Weight key | Description |
|-----------|-----------|-------------|
| Performance | `performance` | Skill-gap minimisation + seniority fit |
| Chemistry | `chemistry` | Pairwise affinity scores |
| Growth | `growth` | Overlap with personal learning targets |
| Cost | `cost` | Prefers adequately-qualified over over-qualified staff |

### Hard constraints

- **FTE capacity** — a person with `fte_capacity = 0` is never assigned.
- **Exclusion lists** — per-project exclusions (legal, timezone, interpersonal) are always enforced regardless of weights.

---

## Usage (as a library)

```python
from optimizer.solver import TeamAssignmentSolver
from optimizer.models import ProjectInput, PersonInput, AssignmentWeights

solver = TeamAssignmentSolver()
result = solver.solve(
    project=ProjectInput(...),
    people=[PersonInput(...), ...],
    weights=AssignmentWeights(performance=0.5, chemistry=0.2, growth=0.2, cost=0.1),
)
print(result.members)   # list[AssignedMember]
print(result.score)     # float
```

---

## Tests

```bash
# From repo root
make test-optimizer

# Or manually
cd optimizer
uv run pytest tests/ -v
```

---

## Linting

```bash
# From repo root
make lint-backend        # covers both optimizer/src and backend/src

# Or manually
uv run ruff check optimizer/src
```
