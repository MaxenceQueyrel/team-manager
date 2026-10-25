from datetime import date

from pydantic import BaseModel, Field

from optimizer.models.assignment import AssignmentResult


class StartCandidate(BaseModel):
    start: date = Field(description="Candidate start date the project's schedule was shifted to.")
    feasible: bool = Field(description="Whether the hard constraints admit a team at this start.")
    score: float | None = Field(
        default=None, description="Score of the optimal team at this start; None if infeasible."
    )
    max_score: float | None = Field(
        default=None, description="Theoretical maximum score at this start; None if infeasible."
    )
    fully_covered: bool | None = Field(
        default=None, description="Whether the optimal team fully covers the project at this start; None if infeasible."
    )


class StartDateScan(BaseModel):
    best_start: date = Field(description="Start date whose optimal team ranks best.")
    pool: list[AssignmentResult] = Field(
        description="Optimal team and its alternatives at best_start, each with start_date set to it."
    )
    candidates: list[StartCandidate] = Field(description="Summary of every scanned start, in date order.")
