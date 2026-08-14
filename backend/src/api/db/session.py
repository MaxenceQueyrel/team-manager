from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from api.core.config import get_configs

settings = get_configs()

# Sync engine to match the existing sync `def` handlers in v1/*.py (FastAPI
# already runs those in a threadpool) — no async session needed.
engine = create_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session]:
    """Yields a SQLAlchemy session scoped to a single request.

    Use as a FastAPI `Depends()` in route handlers that need auth-schema access.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
