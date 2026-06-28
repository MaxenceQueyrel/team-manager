from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    data_dir: Path = Path("data")
    cors_origins: str = "http://localhost:3000"
    debug: bool = False

    model_config = {"env_file": ".env", "extra": "ignore"}


def get_configs() -> Settings:
    return Settings()
