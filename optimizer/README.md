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
│   │   ├── squad.py          Squad (available members co-selected all-or-nothing; unavailable members skipped)
│   │   ├── skill.py          Skill, SkillLevel, SkillRequirement (min_level, fte, max_people)
│   │   ├── date_range.py     DateRange, AvailabilityWindow
│   │   ├── seniority.py      Seniority
│   │   ├── assignment.py     AssignmentWeights, AssignedMember, SkillAllocation, AssignmentResult
│   │   ├── coverage.py       PhaseCoverage, SkillCoverage
│   │   ├── infeasibility.py  InfeasibilityReason, PhaseConflict
│   │   └── start_scan.py     StartCandidate, StartDateScan (flexible start window)
│   ├── grid.py            0.2-FTE allocation grid: STEPS_PER_FTE, ALLOCATION_STEP, floor_to_grid, is_on_grid
│   ├── objectives.py       Per-(person, skill) scoring (level, growth, cost, preference)
│   ├── constraints.py     Feasibility filter (exclusions, availability of at least one step)
│   ├── coverage.py        FTE and per-skill coverage of a selected team
│   ├── availability.py    Day-weighted FTE availability over a date range
│   ├── schedule.py        Schedule anchor and rigid shift of a project's dates
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

1. **Feasibility filter** (`constraints.feasible_people`) — drops excluded persons and anyone whose effective availability over the project's date range, floored to the grid, is below one step (0.2 FTE).
2. **Per-share scores** (`objectives.compute_skill_scores`) — for each (person, required skill): the person's level in that skill over 5, whether the skill is a growth target or a preference, and the experience cost.
3. **Need** — each skill's `fte`, capped by what its qualified people can supply (availability, `max_people`), computed jointly by a small MILP because one person's availability may be claimed by several skills. A short supply becomes partial coverage, not an error.
4. **MILP build** — per (person, skill) integer day counts `d ∈ {0..5}` (share = 0.2·d), created only for people at or above the skill's `min_level`, with a binary "fills this skill" flag counted against `max_people`. Each person's days stay within their floored availability, a binary selection variable links to the skills they fill, and the days sum to the need. Forced inclusions, squad co-selection, and chemistry (shared FTE capped by each person's total) are added on top.
5. **Solve** — `pulp.PULP_CBC_CMD` maximises the objective, minus a tiny per-person and per-share headcount penalty that prefers fewer, fuller allocations.
6. **Phased projects** — if the project defines `phases`, they are solved jointly in a single MILP; with a `handover` weight > 0 the FTE a person keeps across consecutive phases is rewarded.

### Allocation grid and skill needs

- Every allocation is a multiple of `grid.ALLOCATION_STEP` (0.2 FTE, one day per week). Availability is floored to it (0.87 → 0.8).
- A scope's FTE is the sum of its `SkillRequirement.fte` (0.2 to 5.0, on the grid). `max_people` caps how many people the skill may be split across: it defaults to `ceil(fte)` and ranges from `ceil(fte)` to `fte / 0.2`. The grid wins over an even split: 1 FTE over two people is 0.8 + 0.2 or 0.6 + 0.4, never 0.5 + 0.5.
- `min_level` is a hard rule: only people at or above it fill that skill. One person may fill several skills; their shares add up within their availability.
- `AssignedMember.fte_allocation` is the person's total; `skill_allocations` breaks it down per skill. `SkillCoverage.met` compares `covered_fte` with the skill's `required_fte`.
- A forced member who qualifies for no skill need is reported as `FORCED_MEMBER_CONFLICT`.

See the root README for the full formulation of each term.

### Flexible start window

`solve_pool_over_starts()` picks the start date as well as the team, inside an explicit `start_window: DateRange` (passed as an argument, not stored on `ProjectInput`).

- **Rigid shift** (`schedule.shift_project`): every top-level `date_range` and every phase `date_range` moves by the same offset, so durations and gaps are kept. The **anchor** (`schedule.schedule_anchor`) is the earliest date across all of these ranges; the backend uses the same function to shift a project's dates when a team is applied.
- **Candidates**: weekly starts `start_window.start + 7k` while `≤ start_window.end`. The window bounds the start only; the project may end after it. No cap is enforced here (the API caps it at 52).
- **Per candidate**: the project is shifted so its anchor lands on the candidate and solved for the optimum only. Since dates act only through availability, this reuses the MILP unchanged.
- **Ranking**: fully covered first, then highest score, then earliest start.
- **Result**: a `StartDateScan` with `best_start`, the full `solve_pool` at that start (each `AssignmentResult.start_date` set to it; it stays `None` from plain `solve_pool`), and one `StartCandidate` per start carrying the optimum found there as `team` (its `start_date` set to that start), so any start can be inspected without another solve. Infeasible starts are kept with `feasible=False` and `team=None`; if every start is infeasible, the earliest one's `InfeasibleAssignmentError` is raised.

---

## Usage (as a library)

```python
from optimizer.adapters.pulp_solver import PuLPTeamAssignmentSolver
from optimizer.models import ProjectInput, PersonInput, AssignmentWeights, SkillRequirement

solver = PuLPTeamAssignmentSolver()
result = solver.solve(
    project=ProjectInput(id="proj", skill_requirements=[SkillRequirement(id="python", min_level=3, fte=1.4)]),
    people=[PersonInput(...), ...],
    weights=AssignmentWeights(performance=0.5, chemistry=0.2, growth=0.2, cost=0.1),
)
print(result.members)   # list[AssignedMember], each with skill_allocations
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
