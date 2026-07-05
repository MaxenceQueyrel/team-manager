from pydantic import BaseModel
from optimizer.models import AssignedMember, AssignmentWeights


class Team(BaseModel):
    id: str
    project_id: str
    members: list[AssignedMember] = []
    is_optimized: bool = False
    optimization_score: float | None = None
    optimization_max_score: float | None = None


class OptimizationRequest(BaseModel):
    project_id: str
    weights: AssignmentWeights = AssignmentWeights()
    respect_exclusions: bool = True
