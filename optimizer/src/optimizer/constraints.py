import numpy as np

from optimizer.models import ProjectInput, PersonInput


def build_feasibility_mask(
    project: ProjectInput,
    people: list[PersonInput],
    respect_exclusions: bool,
) -> np.ndarray:
    """
    Boolean (n_slots × n_people) mask — False means the assignment is infeasible.
    """
    mask = np.ones((project.n_slots, len(people)), dtype=bool)

    excluded = set(project.excluded_person_ids) if respect_exclusions else set()

    for p_idx, person in enumerate(people):
        if person.id in excluded or person.fte_capacity <= 0:
            mask[:, p_idx] = False

    return mask
