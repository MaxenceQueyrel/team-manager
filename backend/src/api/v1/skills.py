from fastapi import APIRouter
from optimizer.models import Skill
from api.repositories.file_repository import FileRepository

router = APIRouter()
repo: FileRepository[Skill] = FileRepository("skills", Skill)


@router.get("/", response_model=list[Skill])
def list_skills():
    return repo.list()
