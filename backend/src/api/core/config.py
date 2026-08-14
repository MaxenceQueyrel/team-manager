from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    data_dir: Path = Path("data")
    cors_origins: str = "http://localhost:3000"
    debug: bool = False
    database_url: str = (
        "postgresql+psycopg://team_manager:team_manager@localhost:5432/team_manager"
    )
    jwt_secret: str = "change-me"
    jwt_access_ttl_minutes: int = 15
    refresh_ttl_days: int = 30

    model_config = {"env_file": ".env", "extra": "ignore"}


def get_configs() -> Settings:
    return Settings()
