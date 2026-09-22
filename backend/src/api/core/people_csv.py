import csv
import io
import json
from typing import Any

from pydantic import ValidationError

from api.models.person import Person, PersonCreate

_JSON_FIELDS = (
    "skills",
    "availability_windows",
    "preferences",
    "growth_targets",
    "affinities",
)
FIELDNAMES = (
    "id",
    "name",
    "role",
    "seniority",
    "years_of_experience",
    "fte_capacity",
    "manager_id",
    *_JSON_FIELDS,
)


class PersonCsvRowError(ValueError):
    """Raised when a CSV row cannot be decoded into a person."""

    def __init__(self, row_number: int, message: str):
        super().__init__(f"Row {row_number}: {message}")


def encode_people_csv(people: list[Person]) -> str:
    """Encodes people as CSV text.

    Scalar `PersonBase` fields become plain columns; `skills`,
    `availability_windows`, `preferences`, `growth_targets`, and `affinities`
    are each JSON-encoded into a single cell.

    Args:
        people: People to encode.

    Returns:
        CSV text (including header row) that `decode_people_csv` can parse back.
    """
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=FIELDNAMES)
    writer.writeheader()
    for person in people:
        dumped = person.model_dump(mode="json")
        writer.writerow(
            {
                field: json.dumps(dumped[field])
                if field in _JSON_FIELDS
                else dumped[field]
                for field in FIELDNAMES
            }
        )
    return buffer.getvalue()


def decode_people_csv(content: str) -> list[tuple[str, PersonCreate]]:
    """Decodes CSV text produced by `encode_people_csv` into people.

    Args:
        content: CSV text with the schema written by `encode_people_csv`.

    Returns:
        A list of (person id, PersonCreate) pairs, in row order.

    Raises:
        PersonCsvRowError: If a row is missing a column, has a malformed JSON
            cell, or fails `PersonCreate` validation (e.g. bad enum value,
            out-of-range skill level).
    """
    reader = csv.DictReader(io.StringIO(content))
    people: list[tuple[str, PersonCreate]] = []
    for row_number, row in enumerate(reader, start=2):
        try:
            person_id = row["id"]
            data: dict[str, Any] = {
                field: json.loads(row[field]) if field in _JSON_FIELDS else row[field]
                for field in FIELDNAMES
                if field != "id"
            }
        except KeyError as exc:
            raise PersonCsvRowError(row_number, f"missing column {exc}") from exc
        except json.JSONDecodeError as exc:
            raise PersonCsvRowError(row_number, f"malformed JSON cell: {exc}") from exc

        data["manager_id"] = data["manager_id"] or None
        try:
            person = PersonCreate.model_validate(data)
        except ValidationError as exc:
            raise PersonCsvRowError(row_number, str(exc)) from exc
        people.append((person_id, person))
    return people
