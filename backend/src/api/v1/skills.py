from fastapi import APIRouter, Depends, HTTPException
from optimizer.models import Skill
from api.core.deps import require_permission
from api.repositories.file_repository import FileRepository

router = APIRouter()
repo: FileRepository[Skill] = FileRepository("skills", Skill)


@router.get("/", response_model=list[Skill])
def list_skills():
    return repo.list()


@router.get("/{skill_id}", response_model=Skill)
def get_skill(skill_id: str):
    skill = repo.get(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    return skill


@router.post(
    "/",
    response_model=Skill,
    status_code=201,
    dependencies=[Depends(require_permission("skills:write"))],
)
def create_skill(data: Skill):
    if not data.id.strip():
        raise HTTPException(status_code=400, detail="Skill id is required")
    if repo.get(data.id):
        raise HTTPException(status_code=409, detail="Skill already exists")
    return repo.create(data.model_dump())


@router.put(
    "/{skill_id}",
    response_model=Skill,
    dependencies=[Depends(require_permission("skills:write"))],
)
def update_skill(skill_id: str, data: Skill):
    skill = repo.update(skill_id, data.model_dump())
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    return skill


@router.delete(
    "/{skill_id}",
    status_code=204,
    dependencies=[Depends(require_permission("skills:delete"))],
)
def delete_skill(skill_id: str):
    if not repo.delete(skill_id):
        raise HTTPException(status_code=404, detail="Skill not found")
