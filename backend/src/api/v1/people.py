from datetime import date

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from api.models.person import Person, PersonCreate
from api.repositories.file_repository import FileRepository
from optimizer.availability import daily_availability
from optimizer.models import DateRange, PersonInput

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
def list_people_availability(start: date, end: date):
    if end < start:
        raise HTTPException(status_code=400, detail="end must not be before start")

    date_range = DateRange(start=start, end=end)
    return [
        PersonAvailability(
            person_id=person.id,
            segments=[
                AvailabilitySegment(start=seg_start, end=seg_end, ratio=ratio)
                for seg_start, seg_end, ratio in daily_availability(
                    _to_person_input(person), date_range
                )
            ],
        )
        for person in repo.list()
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
def list_people():
    return repo.list()


@router.get("/{person_id}", response_model=Person)
def get_person(person_id: str):
    person = repo.get(person_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    return person


@router.post("/", response_model=Person, status_code=201)
def create_person(data: PersonCreate):
    return repo.create(data.model_dump())


@router.put("/{person_id}", response_model=Person)
def update_person(person_id: str, data: PersonCreate):
    person = repo.update(person_id, data.model_dump())
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    return person


@router.delete("/{person_id}", status_code=204)
def delete_person(person_id: str):
    if not repo.delete(person_id):
        raise HTTPException(status_code=404, detail="Person not found")
