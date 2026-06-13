from fastapi import APIRouter, HTTPException
from api.models.project import Project, ProjectCreate
from api.repositories.file_repository import FileRepository

router = APIRouter()
repo: FileRepository[Project] = FileRepository("projects", Project)


@router.get("/", response_model=list[Project])
def list_projects():
    return repo.list()


@router.get("/{project_id}", response_model=Project)
def get_project(project_id: str):
    project = repo.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("/", response_model=Project, status_code=201)
def create_project(data: ProjectCreate):
    return repo.create(data.model_dump())


@router.put("/{project_id}", response_model=Project)
def update_project(project_id: str, data: ProjectCreate):
    project = repo.update(project_id, data.model_dump())
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str):
    if not repo.delete(project_id):
        raise HTTPException(status_code=404, detail="Project not found")
