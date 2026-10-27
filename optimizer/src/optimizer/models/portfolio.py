from enum import StrEnum

from pydantic import BaseModel, Field

from optimizer.models.assignment import AssignmentResult
from optimizer.models.project import ProjectInput


class ProjectPriority(StrEnum):
    """Priority tier of a project in a portfolio solve, from lowest to highest."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class PortfolioProject(ProjectInput):
    priority: ProjectPriority = Field(
        default=ProjectPriority.MEDIUM,
        description="Tier deciding which projects are staffed first when they compete for the same people.",
    )


class PortfolioResult(BaseModel):
    results: list[AssignmentResult] = Field(
        description="One team per project, in the order the projects were given, each scored on its own."
    )
