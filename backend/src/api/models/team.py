from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator
from optimizer.grid import ALLOCATION_STEP, GRID_TOLERANCE, is_on_grid
from optimizer.models import (
    AssignedMember,
    AssignmentWeights,
    PhaseConflict,
    PhaseCoverage,
)


# coverage/fully_covered default to empty/None for teams saved before the
# optimizer reported coverage, and for teams created without a solver run.
# created_at is None for teams saved before it was recorded.
# start_date None means the team was found at the project's current dates.
class Team(BaseModel):
    id: str
    organization_id: str
    project_id: str
    members: list[AssignedMember] = []
    is_optimized: bool = False
    optimization_score: float | None = None
    optimization_max_score: float | None = None
    coverage: list[PhaseCoverage] = []
    fully_covered: bool | None = None
    created_at: datetime | None = None
    start_date: date | None = None


class TeamProposal(BaseModel):
    members: list[AssignedMember] = []
    optimization_score: float
    optimization_max_score: float
    coverage: list[PhaseCoverage] = []
    fully_covered: bool | None = None
    start_date: date | None = None


class TeamCreate(TeamProposal):
    project_id: str

    # Applying the team turns each member's fte_allocation into an assignment ratio,
    # which must be on the allocation grid.
    @field_validator("members")
    @classmethod
    def _check_allocations_on_grid(
        cls, members: list[AssignedMember]
    ) -> list[AssignedMember]:
        for member in members:
            ratio = member.fte_allocation
            if ratio < ALLOCATION_STEP - GRID_TOLERANCE or not is_on_grid(ratio):
                raise ValueError(
                    f"Member '{member.person_id}' has an allocation of {ratio}; "
                    "it must be a multiple of 20% (one day per week), from 20% to 100%"
                )
        return members


class OptimizationRequest(BaseModel):
    project_id: str
    weights: AssignmentWeights = AssignmentWeights()
    respect_exclusions: bool = True
    n_alternatives: int = Field(default=2, ge=0, le=5)


# The API counterpart of optimizer.models.StartCandidate: its team is a TeamProposal,
# promoted like an alternative, and never persisted by the solve itself.
class StartCandidateProposal(BaseModel):
    start: date
    feasible: bool
    score: float | None = None
    max_score: float | None = None
    fully_covered: bool | None = None
    team: TeamProposal | None = None


class OptimizationResponse(BaseModel):
    best: Team
    alternatives: list[TeamProposal]
    start_candidates: list[StartCandidateProposal] = []


class InfeasibilityDetail(BaseModel):
    """The `detail` body of a 409 returned when a project admits no team at all.

    Attributes:
        message: Human-readable summary of the failure.
        project_id: The project that could not be staffed.
        conflicts: One entry per infeasible phase and cause, in phase order.
    """

    message: str
    project_id: str
    conflicts: list[PhaseConflict]


class BatchOptimizationRequest(BaseModel):
    project_ids: list[str] = Field(min_length=2, max_length=10)
    weights: AssignmentWeights = AssignmentWeights()
    respect_exclusions: bool = True

    @field_validator("project_ids")
    @classmethod
    def _check_distinct(cls, project_ids: list[str]) -> list[str]:
        if len(set(project_ids)) != len(project_ids):
            raise ValueError("Each project can be selected only once")
        return project_ids


class BatchOptimizationResponse(BaseModel):
    teams: list[Team]
    ignored_start_window_project_ids: list[str] = []


class BatchInfeasibilityDetail(BaseModel):
    """The `detail` body of a 409 returned when a batch solve admits no set of teams.

    Attributes:
        message: Human-readable summary of the failure.
        projects: One entry per infeasible project, in request order. A
            `cross_project_forced_conflict` is listed under every project it involves.
    """

    message: str
    projects: list[InfeasibilityDetail]


class ApplyBatchRequest(BaseModel):
    team_ids: list[str] = Field(min_length=1)

    @field_validator("team_ids")
    @classmethod
    def _check_distinct(cls, team_ids: list[str]) -> list[str]:
        if len(set(team_ids)) != len(team_ids):
            raise ValueError("Each team can be applied only once")
        return team_ids
