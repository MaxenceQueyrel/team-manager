from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.core.deps import require_org_member
from api.core.projects_csv import (
    ProjectCsvRowError,
    decode_projects_csv,
    encode_projects_csv,
)
from api.models.project import Project, ProjectCreate
from api.repositories.file_repository import FileRepository

router = APIRouter()
repo: FileRepository[Project] = FileRepository("projects", Project)


@router.get("/", response_model=list[Project])
def list_projects(organization_id: str = Depends(require_org_member)):
    return repo.list(organization_id)


class ImportSummary(BaseModel):
    created: list[str]
    skipped: list[str]


@router.post("/import", response_model=ImportSummary)
def import_projects(
    file: UploadFile, organization_id: str = Depends(require_org_member)
):
    content = file.file.read().decode("utf-8")
    try:
        rows = decode_projects_csv(content)
    except ProjectCsvRowError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    created: list[str] = []
    skipped: list[str] = []
    for project_id, data in rows:
        if repo.get(project_id, organization_id):
            skipped.append(project_id)
            continue
        repo.create({**data.model_dump(), "id": project_id}, organization_id)
        created.append(project_id)

    return ImportSummary(created=created, skipped=skipped)


@router.get("/export")
def export_projects(organization_id: str = Depends(require_org_member)):
    csv_text = encode_projects_csv(repo.list(organization_id))
    return StreamingResponse(
        iter([csv_text]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=projects.csv"},
    )


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
