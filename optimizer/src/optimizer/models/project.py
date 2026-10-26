from pydantic import BaseModel, Field

from optimizer.models.date_range import DateRange
from optimizer.models.skill import SkillRequirement
from optimizer.models.squad import Squad


class ProjectPhase(BaseModel):
    id: str = Field(description="Identifier of the phase (e.g. a project stage).")
    skill_requirements: list[SkillRequirement] = Field(
        default=[], description="Skill needs of this phase; the FTE to staff is the sum of their fte."
    )
    date_range: DateRange | None = Field(
        default=None, description="Calendar span of this phase. None means no date constraint."
    )


class ProjectInput(BaseModel):
    id: str = Field(description="Identifier of the project.")
    skill_requirements: list[SkillRequirement] = Field(
        default=[], description="Skill needs of the project; the FTE to staff is the sum of their fte."
    )
    excluded_person_ids: list[str] = Field(
        default=[], description="Person IDs that must not be assigned to the project."
    )
    included_person_ids: list[str] = Field(default=[], description="Person IDs that must be assigned to the project.")
    squads: list[Squad] = Field(
        default=[], description="Groups of people co-selected together; members unavailable in a phase are skipped."
    )
    date_ranges: list[DateRange] = Field(
        default=[],
        description="Calendar spans during which the project runs. Empty means no date constraint.",
    )
    phases: list[ProjectPhase] = Field(
        default=[],
        description="Per-stage staffing needs. When non-empty, overrides the top-level skill_requirements and date_ranges.",
    )
