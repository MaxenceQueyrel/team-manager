from pydantic import BaseModel, Field

from optimizer.models.date_range import AvailabilityWindow, DateRange
from optimizer.models.seniority import Seniority
from optimizer.models.skill import SkillLevel


class PersonInput(BaseModel):
    id: str = Field(description="Identifier of the person.")
    seniority: Seniority = Field(description="Seniority level in the company.")
    years_of_experience: float = Field(ge=0, description="Number of years of professional experience.")
    working_days_per_week: int = Field(
        default=5,
        ge=1,
        le=7,
        description="Days worked in a typical week; the base availability ratio is this over 5, capped at 1.",
    )
    skills: list[SkillLevel] = Field(default=[], description="Skills the person has, with their proficiency levels.")
    vacations: list[DateRange] = Field(
        default=[],
        description="Days off, during which the person is fully unavailable whatever else applies.",
    )
    availability_windows: list[AvailabilityWindow] = Field(
        default=[],
        description="Exceptions to the working-pattern ratio during specific date ranges (e.g. part-time stints).",
    )
    assignments: list[AvailabilityWindow] = Field(
        default=[],
        description="Committed workload on other projects, subtracted from availability.",
    )
    preferences: list[str] = Field(default=[], description="Skill IDs the person prefers to work on.")
    growth_targets: list[str] = Field(default=[], description="Skill IDs the person wants to grow in.")
    affinities: dict[str, float] = Field(default={}, description="Mapping of person_id to affinity score, in [-5, +5].")
