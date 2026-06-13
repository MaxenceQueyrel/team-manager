import json
import uuid
from pathlib import Path
from typing import Generic, TypeVar
from pydantic import BaseModel

from api.core.config import get_configs

T = TypeVar("T", bound=BaseModel)


class FileRepository(Generic[T]):
    def __init__(self, entity: str, model: type[T]):
        settings = get_configs()
        self._path: Path = settings.data_dir / f"{entity}.json"
        self._model = model
        self._ensure_file()

    def _ensure_file(self):
        self._path.parent.mkdir(parents=True, exist_ok=True)
        if not self._path.exists():
            self._path.write_text("[]")

    def _load(self) -> list[dict]:
        return json.loads(self._path.read_text())

    def _save(self, data: list[dict]):
        self._path.write_text(json.dumps(data, indent=2, ensure_ascii=False))

    def list(self) -> list[T]:
        return [self._model.model_validate(item) for item in self._load()]

    def get(self, id: str) -> T | None:
        raw = next((item for item in self._load() if item.get("id") == id), None)
        return self._model.model_validate(raw) if raw else None

    def create(self, data: dict) -> T:
        items = self._load()
        data = {**data, "id": str(uuid.uuid4())}
        items.append(data)
        self._save(items)
        return self._model.model_validate(data)

    def update(self, id: str, data: dict) -> T | None:
        items = self._load()
        for i, item in enumerate(items):
            if item.get("id") == id:
                updated = {**data, "id": id}
                items[i] = updated
                self._save(items)
                return self._model.model_validate(updated)
        return None

    def delete(self, id: str) -> bool:
        items = self._load()
        filtered = [item for item in items if item.get("id") != id]
        if len(filtered) == len(items):
            return False
        self._save(filtered)
        return True
