from pydantic import BaseModel, Field
from optimizer.models import AssignedMember, AssignmentWeights


class Team(BaseModel):
    id: str
    organization_id: str
    project_id: str
    members: list[AssignedMember] = []
    is_optimized: bool = False
    optimization_score: float | None = None
    optimization_max_score: float | None = None


class TeamProposal(BaseModel):
    members: list[AssignedMember] = []
    optimization_score: float
    optimization_max_score: float


class TeamCreate(TeamProposal):
    project_id: str


class OptimizationRequest(BaseModel):
    project_id: str
    weights: AssignmentWeights = AssignmentWeights()
    respect_exclusions: bool = True
    n_alternatives: int = Field(default=2, ge=0, le=5)


class OptimizationResponse(BaseModel):
    best: Team
    alternatives: list[TeamProposal]
