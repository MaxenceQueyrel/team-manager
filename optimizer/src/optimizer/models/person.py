from pydantic import BaseModel, Field

from optimizer.models.date_range import AvailabilityWindow
from optimizer.models.seniority import Seniority
from optimizer.models.skill import SkillLevel


class PersonInput(BaseModel):
    id: str = Field(description="Identifier of the person.")
    seniority: Seniority = Field(description="Seniority level in the company.")
    years_of_experience: float = Field(ge=0, description="Number of years of professional experience.")
    fte_capacity: float = Field(
        default=1.0,
        ge=0,
        le=1,
        description="Available capacity as a fraction of full-time equivalent.",
    )
    skills: list[SkillLevel] = Field(default=[], description="Skills the person has, with their proficiency levels.")
    availability_windows: list[AvailabilityWindow] = Field(
        default=[],
        description="Exceptions to fte_capacity during specific date ranges (e.g. leave, part-time stints).",
    )
    preferences: list[str] = Field(default=[], description="Skill IDs the person prefers to work on.")
    growth_targets: list[str] = Field(default=[], description="Skill IDs the person wants to grow in.")
    affinities: dict[str, float] = Field(default={}, description="Mapping of person_id to affinity score, in [-5, +5].")
