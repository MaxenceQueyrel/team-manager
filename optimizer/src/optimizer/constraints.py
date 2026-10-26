from optimizer.availability import effective_availability
from optimizer.grid import floor_to_grid
from optimizer.models import ProjectInput, PersonInput


def feasible_people(
    project: ProjectInput,
    people: list[PersonInput],
    respect_exclusions: bool,
) -> list[PersonInput]:
    """Returns the people eligible for the project: not excluded, and available for at least one allocation step."""
    excluded = set(project.excluded_person_ids) if respect_exclusions else set()
    return [
        p
        for p in people
        if p.id not in excluded and floor_to_grid(effective_availability(p, project, p.assignments)) > 0
    ]
