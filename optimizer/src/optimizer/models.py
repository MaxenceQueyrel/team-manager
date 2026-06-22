from datetime import date

from pydantic import BaseModel, Field


class DateRange(BaseModel):
    start: date = Field(description="Start date of the range, inclusive.")
    end: date = Field(description="End date of the range, inclusive.")


class AvailabilityWindow(DateRange):
    ratio: float = Field(
        ge=0, le=1, description="Fraction of FTE available during this window, overriding fte_capacity."
    )


class Skill(BaseModel):
    id: str = Field(description="Identifier of the skill.")
    description: str = Field(default="", description="Description of the skill.")


class SkillLevel(Skill):
    level: float = Field(ge=0, le=5, description="Proficiency level in the skill, from 0 to 5.")


class SkillRequirement(Skill):
    min_level: float = Field(ge=0, le=5, description="Minimum proficiency level required, from 0 to 5.")


class PersonInput(BaseModel):
    id: str = Field(description="Identifier of the person.")
    seniority: str = Field(description="Seniority level in the company (e.g. junior, mid, senior, lead).")
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


class ProjectPhase(BaseModel):
    id: str = Field(description="Identifier of the phase (e.g. a project stage).")
    n_slots: int = Field(default=1, ge=1, description="Number of people to assign during this phase.")
    skill_requirements: list[SkillRequirement] = Field(
        default=[], description="Skills required during this phase, with minimum levels."
    )
    date_range: DateRange | None = Field(
        default=None, description="Calendar span of this phase. None means no date constraint."
    )


class ProjectInput(BaseModel):
    id: str = Field(description="Identifier of the project.")
    n_slots: int = Field(default=1, ge=1, description="Number of people to assign to the project.")
    skill_requirements: list[SkillRequirement] = Field(
        default=[], description="Skills required by the project, with minimum levels."
    )
    excluded_person_ids: list[str] = Field(
        default=[], description="Person IDs that must not be assigned to the project."
    )
    included_person_ids: list[str] = Field(
        default=[], description="Person IDs that must be assigned to the project."
    )
    date_ranges: list[DateRange] = Field(
        default=[],
        description="Calendar spans during which the project runs. Empty means no date constraint.",
    )
    phases: list[ProjectPhase] = Field(
        default=[],
        description=(
            "Per-stage staffing needs. When non-empty, overrides the top-level n_slots, "
            "skill_requirements, and date_ranges."
        ),
    )


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
