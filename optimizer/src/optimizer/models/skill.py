import math
from typing import Self

from pydantic import BaseModel, Field, model_validator

from optimizer.grid import ALLOCATION_STEP, STEPS_PER_FTE, is_on_grid


class Skill(BaseModel):
    id: str = Field(description="Identifier of the skill.")
    description: str = Field(default="", description="Description of the skill.")


class SkillLevel(Skill):
    level: float = Field(ge=0, le=5, description="Proficiency level in the skill, from 0 to 5.")


class SkillRequirement(Skill):
    min_level: float = Field(
        ge=0, le=5, description="Minimum proficiency level a person needs to fill this skill, from 0 to 5."
    )
    fte: float = Field(
        ge=ALLOCATION_STEP,
        le=5,
        description="FTE to staff on this skill, a multiple of 0.2 (one day per week); 1 is one full-time person.",
    )
    max_people: int | None = Field(
        default=None,
        description=(
            "Most people the FTE may be split across, from ceil(fte) to fte / 0.2. "
            "Defaults to ceil(fte), i.e. as few people as the FTE allows."
        ),
    )

    @model_validator(mode="after")
    def _check_fte_split(self) -> Self:
        if not is_on_grid(self.fte):
            raise ValueError(f"fte must be a multiple of {ALLOCATION_STEP}, got {self.fte}.")
        steps = round(self.fte * STEPS_PER_FTE)
        min_people = math.ceil(steps / STEPS_PER_FTE)
        if self.max_people is None:
            self.max_people = min_people
        elif not min_people <= self.max_people <= steps:
            raise ValueError(
                f"max_people must be between {min_people} and {steps} for {self.fte} FTE, got {self.max_people}."
            )
        return self
