from pydantic import BaseModel, Field


class SkillCoverage(BaseModel):
    skill_id: str = Field(description="Identifier of the required skill.")
    required_level: float = Field(description="Minimum proficiency level the requirement asks for.")
    required_fte: float = Field(description="FTE the requirement asks to staff on this skill.")
    best_level: float = Field(description="Highest level of this skill among staffed members; 0 when none has it.")
    covered_fte: float = Field(description="FTE the staffed members give to this skill.")
    met: bool = Field(description="Whether covered_fte reaches required_fte.")


class PhaseCoverage(BaseModel):
    phase_id: str | None = Field(description="Identifier of the phase, or None for a project without phases.")
    required_fte: float = Field(
        description="FTE the phase (or project) asks to staff, i.e. the sum of its skill requirements' fte."
    )
    staffed_fte: float = Field(description="FTE actually allocated to the selected members.")
    available_fte: float = Field(description="Total FTE the eligible pool could supply during this phase.")
    fte_met: bool = Field(description="Whether staffed_fte reaches required_fte.")
    skills: list[SkillCoverage] = Field(description="Coverage of each skill requirement of the phase, in order.")
