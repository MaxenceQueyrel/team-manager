from fastapi import APIRouter, HTTPException
from api.models.person import Person, PersonCreate
from api.repositories.file_repository import FileRepository

router = APIRouter()
repo: FileRepository[Person] = FileRepository("people", Person)


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
