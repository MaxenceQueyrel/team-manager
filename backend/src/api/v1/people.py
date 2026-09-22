from datetime import date

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from api.core.deps import require_org_member
from api.core.people_csv import PersonCsvRowError, decode_people_csv, encode_people_csv
from api.models.person import Person, PersonCreate
from api.repositories.file_repository import FileRepository
from api.v1 import assignments as assignments_module
from api.v1 import roles as roles_module
from api.v1 import skills as skills_module
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


def _require_known_role(role: str, organization_id: str) -> None:
    if not roles_module.repo.get(role, organization_id):
        raise HTTPException(status_code=400, detail=f"Unknown role: {role}")


class ImportSummary(BaseModel):
    created: list[str]
    skipped: list[str]
    created_roles: list[str] = []
    created_skills: list[str] = []


@router.post("/import", response_model=ImportSummary)
def import_people(file: UploadFile, organization_id: str = Depends(require_org_member)):
    content = file.file.read().decode("utf-8")
    try:
        rows = decode_people_csv(content)
    except PersonCsvRowError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # Roles and skills referenced by the CSV that aren't in the catalog yet are
    # created on the fly, rather than failing the import — a CSV is often the
    # first time a roster (and its roles/skills) is entered into the system.
    existing_role_ids = {role.id for role in roles_module.repo.list(organization_id)}
    existing_skill_ids = {
        skill.id for skill in skills_module.repo.list(organization_id)
    }
    created_roles: list[str] = []
    created_skills: list[str] = []

    def _ensure_skill(skill_id: str, description: str = "") -> None:
        # A blank id would make FileRepository.create() mint a random uuid instead,
        # spawning a junk catalog entry that doesn't match the (still-blank) cell.
        if not skill_id or skill_id in existing_skill_ids:
            return
        skills_module.repo.create(
            {"id": skill_id, "description": description}, organization_id
        )
        existing_skill_ids.add(skill_id)
        created_skills.append(skill_id)

    created: list[str] = []
    skipped: list[str] = []
    for person_id, data in rows:
        if data.role and data.role not in existing_role_ids:
            roles_module.repo.create(
                {"id": data.role, "description": ""}, organization_id
            )
            existing_role_ids.add(data.role)
            created_roles.append(data.role)

        for skill in data.skills:
            _ensure_skill(skill.id, skill.description)
        for skill_id in (*data.preferences, *data.growth_targets):
            _ensure_skill(skill_id)

        if repo.get(person_id, organization_id):
            skipped.append(person_id)
            continue
        repo.create({**data.model_dump(), "id": person_id}, organization_id)
        created.append(person_id)

    return ImportSummary(
        created=created,
        skipped=skipped,
        created_roles=created_roles,
        created_skills=created_skills,
    )


@router.get("/export")
def export_people(organization_id: str = Depends(require_org_member)):
    csv_text = encode_people_csv(repo.list(organization_id))
    return StreamingResponse(
        iter([csv_text]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=people.csv"},
    )


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
    _require_known_role(data.role, organization_id)
    return repo.create(data.model_dump(), organization_id)


@router.put("/{person_id}", response_model=Person)
def update_person(
    person_id: str,
    data: PersonCreate,
    organization_id: str = Depends(require_org_member),
):
    _require_known_role(data.role, organization_id)
    person = repo.update(person_id, data.model_dump(), organization_id)
    if not person:
        raise HTTPException(status_code=404, detail="Person not found")
    return person


@router.delete("/{person_id}", status_code=204)
def delete_person(person_id: str, organization_id: str = Depends(require_org_member)):
    if not repo.delete(person_id, organization_id):
        raise HTTPException(status_code=404, detail="Person not found")
