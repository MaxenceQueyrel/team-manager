import numpy as np

from optimizer.models import ProjectInput, PersonInput, AssignmentWeights


def compute_score_matrix(
    project: ProjectInput,
    people: list[PersonInput],
    weights: AssignmentWeights,
) -> np.ndarray:
    """
    Returns an (n_slots × n_people) score matrix.
    Chemistry is omitted here — it depends on the full assigned team and is
    added as a post-assignment bonus in the solver.
    """
    matrix = np.zeros((project.n_slots, len(people)))

    for p_idx, person in enumerate(people):
        combined = (
            weights.performance * _skill_score(project, person)
            + weights.growth * _growth_score(project, person)
            + weights.cost * (1.0 - _experience_score(person))
        )
        matrix[:, p_idx] = combined

    return matrix


def affinity_bonus(
    member_ids: list[str],
    people_by_id: dict[str, PersonInput],
) -> float:
    """Sum of pairwise affinity scores for the selected team members."""
    total = 0.0
    for i in range(len(member_ids)):
        person = people_by_id.get(member_ids[i])
        if person is None:
            continue
        for j in range(i + 1, len(member_ids)):
            total += person.affinities.get(member_ids[j], 0.0)
    return total


def _skill_score(project: ProjectInput, person: PersonInput) -> float:
    if not project.skill_requirements:
        return 1.0
    person_skills = {s.skill_id: s.level for s in person.skills}
    scores = []
    for req in project.skill_requirements:
        level = person_skills.get(req.skill_id, 0.0)
        scores.append(min(level / req.min_level, 1.0) if req.min_level > 0 else 1.0)
    return float(np.mean(scores))


def _experience_score(person: PersonInput) -> float:
    return min(person.years_of_experience / 20.0, 1.0)


def _growth_score(project: ProjectInput, person: PersonInput) -> float:
    project_skills = {r.skill_id for r in project.skill_requirements}
    if not project_skills:
        return 0.0
    return len(project_skills & set(person.growth_targets)) / len(project_skills)
