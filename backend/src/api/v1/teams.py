from fastapi import APIRouter, HTTPException
from api.models.team import Team
from api.repositories.file_repository import FileRepository

router = APIRouter()
repo: FileRepository[Team] = FileRepository("teams", Team)


@router.get("/", response_model=list[Team])
def list_teams():
    return repo.list()


@router.get("/{team_id}", response_model=Team)
def get_team(team_id: str):
    team = repo.get(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


@router.delete("/{team_id}", status_code=204)
def delete_team(team_id: str):
    if not repo.delete(team_id):
        raise HTTPException(status_code=404, detail="Team not found")
