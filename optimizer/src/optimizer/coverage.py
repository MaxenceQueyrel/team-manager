from optimizer.availability import effective_availability
from optimizer.models import AssignedMember, PersonInput, PhaseCoverage, ProjectInput, SkillCoverage

FTE_TOLERANCE = 1e-6  # absorbs solver round-off when comparing staffed FTE to the requested n_slots


def compute_coverage(
    phase_id: str | None,
    project: ProjectInput,
    candidates: list[PersonInput],
    members: list[AssignedMember],
) -> PhaseCoverage:
    """Measures how far a phase's selected team covers its FTE and skill requirements.

    Args:
        phase_id: Identifier of the phase, or None for a project without phases.
        project: The (possibly phase-scoped) requirements the team was selected for.
        candidates: Eligible people for the phase; every member must be among them.
        members: The members selected for this phase.

    Returns:
        A PhaseCoverage comparing required to staffed FTE, and each skill requirement's
        minimum level to the levels the staffed members bring.
    """
    levels = {p.id: {s.id: s.level for s in p.skills} for p in candidates}
    staffed = sum(m.fte_allocation for m in members)
    available = sum(min(effective_availability(p, project, p.assignments), 1.0) for p in candidates)

    skills = []
    for req in project.skill_requirements:
        member_levels = [(levels[m.person_id].get(req.id, 0.0), m.fte_allocation) for m in members]
        covered = sum(fte for level, fte in member_levels if level >= req.min_level)
        skills.append(
            SkillCoverage(
                skill_id=req.id,
                required_level=req.min_level,
                best_level=max((level for level, _ in member_levels), default=0.0),
                covered_fte=round(covered, 6),
                met=covered > 0,
            )
        )

    return PhaseCoverage(
        phase_id=phase_id,
        required_fte=project.n_slots,
        staffed_fte=round(staffed, 6),
        available_fte=round(available, 6),
        fte_met=staffed >= project.n_slots - FTE_TOLERANCE,
        skills=skills,
    )
