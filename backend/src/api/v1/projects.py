from fastapi import APIRouter, Depends, HTTPException

from api.core.deps import require_org_member
from api.models.project import Project, ProjectCreate
from api.repositories.file_repository import FileRepository

router = APIRouter()
repo: FileRepository[Project] = FileRepository("projects", Project)


@router.get("/", response_model=list[Project])
def list_projects(organization_id: str = Depends(require_org_member)):
    return repo.list(organization_id)


@router.get("/{project_id}", response_model=Project)
def get_project(project_id: str, organization_id: str = Depends(require_org_member)):
    project = repo.get(project_id, organization_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("/", response_model=Project, status_code=201)
def create_project(
    data: ProjectCreate, organization_id: str = Depends(require_org_member)
):
    return repo.create(data.model_dump(), organization_id)


@router.put("/{project_id}", response_model=Project)
def update_project(
    project_id: str,
    data: ProjectCreate,
    organization_id: str = Depends(require_org_member),
):
    project = repo.update(project_id, data.model_dump(), organization_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str, organization_id: str = Depends(require_org_member)):
    if not repo.delete(project_id, organization_id):
        raise HTTPException(status_code=404, detail="Project not found")
