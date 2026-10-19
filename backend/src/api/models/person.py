from pydantic import BaseModel, Field, computed_field
from optimizer.availability import base_availability_ratio
from optimizer.models import (
    AvailabilityWindow,
    DateRange,
    PersonInput,
    Seniority,
    SkillLevel,
)


class PersonBase(BaseModel):
    name: str
    role: str
    seniority: Seniority
    years_of_experience: float = Field(ge=0)
    working_days_per_week: int = Field(default=5, ge=1, le=7)
    manager_id: str | None = (
        None  # Person.id of this person's manager (org reporting line)
    )
    skills: list[SkillLevel] = []
    vacations: list[DateRange] = []
    availability_windows: list[AvailabilityWindow] = []
    preferences: list[str] = []
    growth_targets: list[str] = []
    affinities: dict[str, float] = {}  # person_id → score (-5 to +5)


class Person(PersonBase):
    id: str
    organization_id: str

    @computed_field
    @property
    def base_capacity(self) -> float:
        return base_availability_ratio(self.to_person_input())

    def to_person_input(
        self, assignments: list[AvailabilityWindow] | None = None
    ) -> PersonInput:
        return PersonInput(
            id=self.id,
            seniority=self.seniority,
            years_of_experience=self.years_of_experience,
            working_days_per_week=self.working_days_per_week,
            skills=self.skills,
            vacations=self.vacations,
            availability_windows=self.availability_windows,
            assignments=assignments or [],
            preferences=self.preferences,
            growth_targets=self.growth_targets,
            affinities=self.affinities,
        )


class PersonCreate(PersonBase):
    pass
