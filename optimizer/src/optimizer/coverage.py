from optimizer.availability import effective_availability
from optimizer.grid import floor_to_grid
from optimizer.models import AssignedMember, PersonInput, PhaseCoverage, ProjectInput, SkillCoverage

FTE_TOLERANCE = 1e-6  # absorbs float round-off when comparing staffed to required FTE


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
        A PhaseCoverage comparing the phase's required FTE (the sum of its skill needs) to
        the staffed FTE, and each skill's required FTE to the FTE members give to it.
    """
    levels = {p.id: {s.id: s.level for s in p.skills} for p in candidates}
    required = sum(req.fte for req in project.skill_requirements)
    staffed = sum(m.fte_allocation for m in members)
    available = sum(floor_to_grid(min(effective_availability(p, project, p.assignments), 1.0)) for p in candidates)

    skills = []
    for req in project.skill_requirements:
        covered = sum(a.fte for m in members for a in m.skill_allocations if a.skill_id == req.id)
        skills.append(
            SkillCoverage(
                skill_id=req.id,
                required_level=req.min_level,
                required_fte=req.fte,
                best_level=max((levels[m.person_id].get(req.id, 0.0) for m in members), default=0.0),
                covered_fte=round(covered, 6),
                met=covered >= req.fte - FTE_TOLERANCE,
            )
        )

    return PhaseCoverage(
        phase_id=phase_id,
        required_fte=round(required, 6),
        staffed_fte=round(staffed, 6),
        available_fte=round(available, 6),
        fte_met=staffed >= required - FTE_TOLERANCE,
        skills=skills,
    )
