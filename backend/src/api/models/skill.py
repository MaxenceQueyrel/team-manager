from pydantic import BaseModel


class Skill(BaseModel):
    id: str
    name: str
    category: str
