from optimizer.models import ProjectInput, PersonInput, AssignmentWeights

MAX_SKILL_LEVEL = 5.0  # matches the documented bound on SkillLevel.level


def compute_skill_scores(
    project: ProjectInput,
    people: list[PersonInput],
    weights: AssignmentWeights,
) -> dict[tuple[str, str], float]:
    """Computes a weighted composite score, per FTE, for each person filling each required skill.

    Args:
        project: The project whose skill requirements define the scoring context.
        people: Pool of candidate persons to score.
        weights: Per-objective weights controlling how performance, growth, cost and preference contribute.

    Returns:
        Mapping of (person ID, skill ID) to the score earned per FTE the person gives to
        that skill. Performance is the person's level in the skill over the maximum level;
        growth and preference reward a skill the person lists as a growth target or a
        preference; cost depends on the person only. Chemistry is excluded here because
        it is pairwise and must be linearized separately in the MILP.
    """
    scores = {}
    for person in people:
        levels = {s.id: s.level for s in person.skills}
        for req in project.skill_requirements:
            scores[person.id, req.id] = (
                weights.performance * levels.get(req.id, 0.0) / MAX_SKILL_LEVEL
                + weights.growth * float(req.id in person.growth_targets)
                + weights.cost * (1.0 - _experience_score(person))
                + weights.preference * float(req.id in person.preferences)
            )
    return scores


def _experience_score(person: PersonInput) -> float:
    return min(person.years_of_experience / 20.0, 1.0)
