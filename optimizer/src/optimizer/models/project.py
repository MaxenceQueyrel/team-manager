from pydantic import BaseModel, Field

from optimizer.models.date_range import DateRange
from optimizer.models.skill import SkillRequirement


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
