from fastapi import APIRouter, Depends, HTTPException

from api.core.deps import require_org_member
from api.models.team import Team, TeamCreate
from api.repositories.file_repository import FileRepository

router = APIRouter()
repo: FileRepository[Team] = FileRepository("teams", Team)


@router.get("/", response_model=list[Team])
def list_teams(organization_id: str = Depends(require_org_member)):
    return repo.list(organization_id)


@router.get("/{team_id}", response_model=Team)
def get_team(team_id: str, organization_id: str = Depends(require_org_member)):
    team = repo.get(team_id, organization_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


@router.post("/", response_model=Team, status_code=201)
def create_team(data: TeamCreate, organization_id: str = Depends(require_org_member)):
    return repo.create({**data.model_dump(), "is_optimized": True}, organization_id)


@router.delete("/{team_id}", status_code=204)
def delete_team(team_id: str, organization_id: str = Depends(require_org_member)):
    if not repo.delete(team_id, organization_id):
        raise HTTPException(status_code=404, detail="Team not found")
