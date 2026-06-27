from pydantic import BaseModel, Field
from optimizer.models import AssignedMember


class Team(BaseModel):
    id: str
    project_id: str
    members: list[AssignedMember] = []
    is_optimized: bool = False
    optimization_score: float | None = None


class OptimizationWeights(BaseModel):
    performance_weight: float = Field(default=0.25, ge=0, le=1)
    chemistry_weight: float = Field(default=0.25, ge=0, le=1)
    growth_weight: float = Field(default=0.25, ge=0, le=1)
    cost_weight: float = Field(default=0.25, ge=0, le=1)
    handover_weight: float = Field(default=0.0, ge=0, le=1)


class OptimizationRequest(BaseModel):
    project_id: str
    weights: OptimizationWeights = OptimizationWeights()
    respect_exclusions: bool = True
