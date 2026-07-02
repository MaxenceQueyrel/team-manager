from fastapi import APIRouter, HTTPException

from api.models.role import Role, RoleCreate
from api.repositories.file_repository import FileRepository

router = APIRouter()
repo: FileRepository[Role] = FileRepository("roles", Role)


@router.get("/", response_model=list[Role])
def list_roles():
    return repo.list()


@router.get("/{role_id}", response_model=Role)
def get_role(role_id: str):
    role = repo.get(role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


@router.post("/", response_model=Role, status_code=201)
def create_role(data: RoleCreate):
    if not data.id.strip():
        raise HTTPException(status_code=400, detail="Role id is required")
    if repo.get(data.id):
        raise HTTPException(status_code=409, detail="Role already exists")
    return repo.create(data.model_dump())


@router.put("/{role_id}", response_model=Role)
def update_role(role_id: str, data: RoleCreate):
    role = repo.update(role_id, data.model_dump())
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


@router.delete("/{role_id}", status_code=204)
def delete_role(role_id: str):
    if not repo.delete(role_id):
        raise HTTPException(status_code=404, detail="Role not found")
