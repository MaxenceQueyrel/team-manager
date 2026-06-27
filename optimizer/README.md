# Optimizer

Framework-agnostic Operations Research engine for team assignment. Contains zero HTTP, database, or I/O code — it is a pure computation library consumed by the backend.

Managed with **uv** as a workspace member.

> For the mathematical model (objective, constraints, squads, phased/handover formulation), see [the root README's "Optimization model" section](../README.md#optimization-model). This document covers the code structure only.

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
│   ├── models/             Input/output Pydantic models
│   │   ├── project.py        ProjectInput, ProjectPhase
│   │   ├── person.py         PersonInput
│   │   ├── squad.py          Squad (all-or-nothing co-selection group)
│   │   ├── skill.py          Skill, SkillLevel, SkillRequirement
│   │   ├── date_range.py     DateRange, AvailabilityWindow
│   │   ├── seniority.py      Seniority
│   │   └── assignment.py     AssignmentWeights, AssignedMember, AssignmentResult
│   ├── objectives.py       Per-person scoring (skill, growth, cost)
│   ├── constraints.py     Feasibility filter (exclusions, availability)
│   ├── availability.py    Day-weighted FTE availability over a date range
│   ├── domain/
│   │   └── solver.py        AssignmentSolverPort — abstract interface callers depend on
│   └── adapters/
│       └── pulp_solver.py    PuLPTeamAssignmentSolver — MILP implementation (PuLP / CBC)
├── example/                Jupyter notebooks demonstrating usage
└── tests/
```

`domain/` defines the port; `adapters/` provides a concrete implementation. The backend depends only on `AssignmentSolverPort`, so the solving library (PuLP today) could be swapped for another MILP backend without touching callers.

---

## How the solver works

`PuLPTeamAssignmentSolver.solve()` takes a project, a list of candidates, and weights, and returns the optimal assignment as an `AssignmentResult`.

1. **Feasibility filter** (`constraints.feasible_people`) — drops excluded persons and anyone with zero effective availability over the project's date range.
2. **Per-person scores** (`objectives.compute_person_scores`) — weighted sum of skill fit, growth opportunity, and cost.
3. **MILP build** — binary selection variables per candidate, a cardinality constraint, forced-inclusion constraints, squad co-selection constraints, and a chemistry term linearized via pairwise binaries.
4. **Solve** — `pulp.PULP_CBC_CMD` maximises the objective.
5. **Phased projects** — if the project defines `phases`, either solved independently per phase (`handover` weight = 0) or jointly in a single MILP with a retention bonus across consecutive phases (`handover` weight > 0).

See the root README for the full formulation of each term.

---

## Usage (as a library)

```python
from optimizer.adapters.pulp_solver import PuLPTeamAssignmentSolver
from optimizer.models import ProjectInput, PersonInput, AssignmentWeights

solver = PuLPTeamAssignmentSolver()
result = solver.solve(
    project=ProjectInput(...),
    people=[PersonInput(...), ...],
    weights=AssignmentWeights(performance=0.5, chemistry=0.2, growth=0.2, cost=0.1),
)
print(result.members)   # list[AssignedMember]
print(result.score)     # float
```

See [example/](example/) for runnable notebooks, including phased allocation with and without the handover weight.

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
