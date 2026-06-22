from optimizer.models import ProjectInput, PersonInput, AssignmentWeights


def compute_person_scores(
    project: ProjectInput,
    people: list[PersonInput],
    weights: AssignmentWeights,
) -> dict[str, float]:
    """

    Args:
        project (ProjectInput): 
        people (list[PersonInput]): _description_
        weights (AssignmentWeights): _description_

    Returns:
        dict[str, float]: _description_
    """
    scores = {}
    for person in people:
        scores[person.id] = (
            weights.performance * _skill_score(project, person)
            + weights.growth * _growth_score(project, person)
            + weights.cost * (1.0 - _experience_score(person))
        )
    return scores


def _skill_score(project: ProjectInput, person: PersonInput) -> float:
    if not project.skill_requirements:
        return 1.0
    person_skills = {s.id: s.level for s in person.skills}
    scores = []
    for req in project.skill_requirements:
        level = person_skills.get(req.id, 0.0)
        scores.append(min(level / req.min_level, 1.0) if req.min_level > 0 else 1.0)
    return sum(scores) / len(scores)


def _experience_score(person: PersonInput) -> float:
    return min(person.years_of_experience / 20.0, 1.0)


def _growth_score(project: ProjectInput, person: PersonInput) -> float:
    project_skills = {r.id for r in project.skill_requirements}
    if not project_skills:
        return 0.0
    return len(project_skills & set(person.growth_targets)) / len(project_skills)
