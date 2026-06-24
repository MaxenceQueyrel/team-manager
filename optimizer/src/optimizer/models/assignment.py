from pydantic import BaseModel, Field


class AssignmentWeights(BaseModel):
    performance: float = Field(default=0.25, ge=0, le=1, description="Weight for skill fit and seniority.")
    chemistry: float = Field(
        default=0.25,
        ge=0,
        le=1,
        description="Weight for pairwise affinity between members.",
    )
    growth: float = Field(default=0.25, ge=0, le=1, description="Weight for learning opportunities.")
    cost: float = Field(default=0.25, ge=0, le=1, description="Weight for avoiding over-qualification.")


class AssignedMember(BaseModel):
    person_id: str = Field(description="Identifier of the assigned person.")
    fte_allocation: float = Field(
        ge=0,
        le=1,
        description="Fraction of full-time equivalent allocated to the project.",
    )
    phase_id: str | None = Field(
        default=None, description="Identifier of the phase this assignment belongs to, if the project uses phases."
    )


class AssignmentResult(BaseModel):
    project_id: str = Field(description="Identifier of the project the assignment was computed for.")
    members: list[AssignedMember] = Field(description="People assigned to the project, with their FTE allocation.")
    score: float = Field(description="Composite score of the assignment.")
