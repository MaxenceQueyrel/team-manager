from pydantic import BaseModel, Field


class Squad(BaseModel):
    member_ids: list[str] = Field(
        description="People who must be selected all-or-nothing. Members unavailable in a phase are skipped for that phase."
    )
