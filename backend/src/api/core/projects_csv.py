import csv
import io
import json
from typing import Any

from pydantic import ValidationError

from api.models.project import Project, ProjectCreate

_JSON_FIELDS = (
    "skill_requirements",
    "excluded_person_ids",
    "included_person_ids",
    "squads",
    "date_ranges",
    "phases",
)
FIELDNAMES = (
    "id",
    "name",
    "description",
    "n_slots",
    "priority",
    *_JSON_FIELDS,
)


class ProjectCsvRowError(ValueError):
    """Raised when a CSV row cannot be decoded into a project."""

    def __init__(self, row_number: int, message: str):
        super().__init__(f"Row {row_number}: {message}")


def encode_projects_csv(projects: list[Project]) -> str:
    """Encodes projects as CSV text.

    Scalar `ProjectBase` fields become plain columns; `skill_requirements`,
    `excluded_person_ids`, `included_person_ids`, `squads`, `date_ranges`, and
    `phases` are each JSON-encoded into a single cell.

    Args:
        projects: Projects to encode.

    Returns:
        CSV text (including header row) that `decode_projects_csv` can parse back.
    """
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=FIELDNAMES)
    writer.writeheader()
    for project in projects:
        dumped = project.model_dump(mode="json")
        writer.writerow(
            {
                field: json.dumps(dumped[field])
                if field in _JSON_FIELDS
                else dumped[field]
                for field in FIELDNAMES
            }
        )
    return buffer.getvalue()


def decode_projects_csv(content: str) -> list[tuple[str, ProjectCreate]]:
    """Decodes CSV text produced by `encode_projects_csv` into projects.

    Args:
        content: CSV text with the schema written by `encode_projects_csv`.

    Returns:
        A list of (project id, ProjectCreate) pairs, in row order.

    Raises:
        ProjectCsvRowError: If a row is missing a column, has a malformed JSON
            cell, or fails `ProjectCreate` validation (e.g. `n_slots < 1`, bad
            `DateRange`).
    """
    reader = csv.DictReader(io.StringIO(content))
    projects: list[tuple[str, ProjectCreate]] = []
    for row_number, row in enumerate(reader, start=2):
        try:
            project_id = row["id"]
            data: dict[str, Any] = {
                field: json.loads(row[field]) if field in _JSON_FIELDS else row[field]
                for field in FIELDNAMES
                if field != "id"
            }
        except KeyError as exc:
            raise ProjectCsvRowError(row_number, f"missing column {exc}") from exc
        except json.JSONDecodeError as exc:
            raise ProjectCsvRowError(row_number, f"malformed JSON cell: {exc}") from exc

        try:
            project = ProjectCreate.model_validate(data)
        except ValidationError as exc:
            raise ProjectCsvRowError(row_number, str(exc)) from exc
        projects.append((project_id, project))
    return projects
