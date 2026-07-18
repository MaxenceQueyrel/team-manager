from fastapi import APIRouter, HTTPException
from api.models.assignment import Assignment, AssignmentCreate
from api.repositories.file_repository import FileRepository

router = APIRouter()
repo: FileRepository[Assignment] = FileRepository("assignments", Assignment)


def _overlaps(start_a, end_a, start_b, end_b) -> bool:
    return start_a <= end_b and start_b <= end_a


def _validate_fte(data: AssignmentCreate, exclude_id: str | None = None):
    overlapping_ratio = sum(
        existing.ratio
        for existing in repo.list()
        if existing.person_id == data.person_id
        and existing.id != exclude_id
        and _overlaps(existing.start, existing.end, data.start, data.end)
    )
    if overlapping_ratio + data.ratio > 1.0:
        raise HTTPException(
            status_code=400,
            detail="Overlapping assignments for this person would exceed 1.0 FTE",
        )


@router.get("/", response_model=list[Assignment])
def list_assignments(person_id: str | None = None, project_id: str | None = None):
    assignments = repo.list()
    if person_id is not None:
        assignments = [a for a in assignments if a.person_id == person_id]
    if project_id is not None:
        assignments = [a for a in assignments if a.project_id == project_id]
    return assignments


@router.get("/{assignment_id}", response_model=Assignment)
def get_assignment(assignment_id: str):
    assignment = repo.get(assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return assignment


@router.post("/", response_model=Assignment, status_code=201)
def create_assignment(data: AssignmentCreate):
    _validate_fte(data)
    return repo.create(data.model_dump())


@router.put("/{assignment_id}", response_model=Assignment)
def update_assignment(assignment_id: str, data: AssignmentCreate):
    _validate_fte(data, exclude_id=assignment_id)
    assignment = repo.update(assignment_id, data.model_dump())
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return assignment


@router.delete("/{assignment_id}", status_code=204)
def delete_assignment(assignment_id: str):
    if not repo.delete(assignment_id):
        raise HTTPException(status_code=404, detail="Assignment not found")
