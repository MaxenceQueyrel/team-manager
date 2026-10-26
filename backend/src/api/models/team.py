from datetime import date, datetime

from pydantic import BaseModel, Field
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
