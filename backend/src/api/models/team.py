from typing import Optional
from pydantic import BaseModel, Field


class TeamMember(BaseModel):
    person_id: str
    fte_allocation: float = Field(ge=0, le=1)


class Team(BaseModel):
    id: str
    project_id: str
    members: list[TeamMember] = []
    is_optimized: bool = False
    optimization_score: Optional[float] = None


class OptimizationWeights(BaseModel):
    performance_weight: float = Field(default=0.25, ge=0, le=1)
    chemistry_weight: float = Field(default=0.25, ge=0, le=1)
    growth_weight: float = Field(default=0.25, ge=0, le=1)
    cost_weight: float = Field(default=0.25, ge=0, le=1)


class OptimizationRequest(BaseModel):
    project_id: str
    weights: OptimizationWeights = OptimizationWeights()
    respect_exclusions: bool = True
