from optimizer.availability import effective_availability
from optimizer.models import ProjectInput, PersonInput


def feasible_people(
    project: ProjectInput,
    people: list[PersonInput],
    respect_exclusions: bool,
) -> list[PersonInput]:
    """Returns the subset of people eligible for assignment to the project."""
    excluded = set(project.excluded_person_ids) if respect_exclusions else set()
    return [p for p in people if p.id not in excluded and effective_availability(p, project) > 0]
