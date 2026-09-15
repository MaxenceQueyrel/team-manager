from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.core.deps import require_org_member
from api.models.person import Person, PersonCreate
from api.repositories.file_repository import FileRepository
from api.v1 import assignments as assignments_module
from optimizer.availability import daily_availability
from optimizer.models import AvailabilityWindow, DateRange, PersonInput

router = APIRouter()
repo: FileRepository[Person] = FileRepository("people", Person)


class AvailabilitySegment(BaseModel):
    start: date = Field(description="Start of the segment, inclusive.")
    end: date = Field(description="End of the segment, inclusive.")
    ratio: float = Field(description="Fraction of FTE available during this segment.")


class PersonAvailability(BaseModel):
    person_id: str
    segments: list[AvailabilitySegment]


@router.get("/availability", response_model=list[PersonAvailability])
def list_people_availability(
    start: date, end: date, organization_id: str = Depends(require_org_member)
):
    if end < start:
        raise HTTPException(status_code=400, detail="end must not be before start")

    date_range = DateRange(start=start, end=end)
    return [
        PersonAvailability(
            person_id=person.id,
            segments=[
                AvailabilitySegment(start=seg_start, end=seg_end, ratio=ratio)
                for seg_start, seg_end, ratio in daily_availability(
                    _to_person_input(person),
                    date_range,
                    _assignment_windows(person.id, organization_id),
                )
            ],
        )
        for person in repo.list(organization_id)
    ]


def _assignment_windows(
    person_id: str, organization_id: str
) -> list[AvailabilityWindow]:
    return [
        AvailabilityWindow(start=a.start, end=a.end, ratio=a.ratio)
        for a in assignments_module.repo.list(organization_id)
        if a.person_id == person_id
    ]


def _to_person_input(person: Person) -> PersonInput:
    return PersonInput(
        id=person.id,
        seniority=person.seniority,
        years_of_experience=person.years_of_experience,
        fte_capacity=person.fte_capacity,
        skills=person.skills,
        availability_windows=person.availability_windows,
        preferences=person.preferences,
        growth_targets=person.growth_targets,
        affinities=person.affinities,
    )


@router.get("/", response_model=list[Person])
def list_people(organization_id: str = Depends(require_org_member)):
    return repo.list(organization_id)


@router.get("/{person_id}", response_model=Person)
def get_person(person_id: str, organization_id: str = Depends(require_org_member)):
    person = repo.get(person_id, organization_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    return person


@router.post("/", response_model=Person, status_code=201)
def create_person(
    data: PersonCreate, organization_id: str = Depends(require_org_member)
):
    return repo.create(data.model_dump(), organization_id)


@router.put("/{person_id}", response_model=Person)
def update_person(
    person_id: str,
    data: PersonCreate,
    organization_id: str = Depends(require_org_member),
):
    person = repo.update(person_id, data.model_dump(), organization_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    return person


@router.delete("/{person_id}", status_code=204)
def delete_person(person_id: str, organization_id: str = Depends(require_org_member)):
    if not repo.delete(person_id, organization_id):
        raise HTTPException(status_code=404, detail="Person not found")
