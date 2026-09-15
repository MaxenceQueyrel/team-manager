from fastapi import APIRouter, Depends, HTTPException

from api.core.deps import require_org_member
from api.models.skill import Skill, SkillCreate
from api.repositories.file_repository import FileRepository

router = APIRouter()
repo: FileRepository[Skill] = FileRepository("skills", Skill)


@router.get("/", response_model=list[Skill])
def list_skills(organization_id: str = Depends(require_org_member)):
    return repo.list(organization_id)


@router.get("/{skill_id}", response_model=Skill)
def get_skill(skill_id: str, organization_id: str = Depends(require_org_member)):
    skill = repo.get(skill_id, organization_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    return skill


@router.post("/", response_model=Skill, status_code=201)
def create_skill(data: SkillCreate, organization_id: str = Depends(require_org_member)):
    if not data.id.strip():
        raise HTTPException(status_code=400, detail="Skill id is required")
    if repo.get(data.id, organization_id):
        raise HTTPException(status_code=409, detail="Skill already exists")
    return repo.create(data.model_dump(), organization_id)


@router.put("/{skill_id}", response_model=Skill)
def update_skill(
    skill_id: str,
    data: SkillCreate,
    organization_id: str = Depends(require_org_member),
):
    skill = repo.update(skill_id, data.model_dump(), organization_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    return skill


@router.delete("/{skill_id}", status_code=204)
def delete_skill(skill_id: str, organization_id: str = Depends(require_org_member)):
    if not repo.delete(skill_id, organization_id):
        raise HTTPException(status_code=404, detail="Skill not found")
