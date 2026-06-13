from fastapi import APIRouter
from api.v1 import people, projects, teams, skills, optimization

router = APIRouter()
router.include_router(people.router, prefix="/people", tags=["people"])
router.include_router(projects.router, prefix="/projects", tags=["projects"])
router.include_router(teams.router, prefix="/teams", tags=["teams"])
router.include_router(skills.router, prefix="/skills", tags=["skills"])
router.include_router(optimization.router, prefix="/optimization", tags=["optimization"])
