import pulp

from optimizer.models import (
    ProjectInput,
    PersonInput,
    AssignmentWeights,
    AssignedMember,
    AssignmentResult,
)
from optimizer.objectives import compute_person_scores
from optimizer.constraints import feasible_people
from optimizer.availability import effective_availability
from optimizer.domain.solver import AssignmentSolverPort


class PuLPTeamAssignmentSolver(AssignmentSolverPort):
    """Solves the team assignment problem as a MILP (PuLP / CBC)."""

    def solve(
        self,
        project: ProjectInput,
        people: list[PersonInput],
        weights: AssignmentWeights,
        respect_exclusions: bool = True,
    ) -> AssignmentResult:
        candidates = feasible_people(project, people, respect_exclusions)
        if not candidates:
            return AssignmentResult(project_id=project.id, members=[], score=0.0)

        included_ids = set(project.included_person_ids) & {p.id for p in candidates}
        n_selected = max(min(project.n_slots, len(candidates)), len(included_ids))
        scores = compute_person_scores(project, candidates, weights)

        model = pulp.LpProblem("team_assignment", pulp.LpMaximize)
        x = {p.id: pulp.LpVariable(f"x_{p.id}", cat="Binary") for p in candidates}
        model += pulp.lpSum(x.values()) == n_selected
        for person_id in included_ids:
            model += x[person_id] == 1

        objective_terms = [scores[p.id] * x[p.id] for p in candidates]

        # Chemistry is pairwise (depends on which two people are both selected),
        # so it's linearized with z_ij = x_i AND x_j rather than folded into
        # the per-person score.
        if weights.chemistry > 0:
            for i, p_i in enumerate(candidates):
                for p_j in candidates[i + 1 :]:
                    affinity = p_i.affinities.get(p_j.id, 0.0)
                    if affinity == 0.0:
                        continue
                    z = pulp.LpVariable(f"z_{p_i.id}_{p_j.id}", cat="Binary")
                    model += z <= x[p_i.id]
                    model += z <= x[p_j.id]
                    model += z >= x[p_i.id] + x[p_j.id] - 1
                    objective_terms.append(weights.chemistry * affinity * z)

        model += pulp.lpSum(objective_terms)
        model.solve(pulp.PULP_CBC_CMD(msg=False))

        members = [
            AssignedMember(person_id=p.id, fte_allocation=min(effective_availability(p, project), 1.0))
            for p in candidates
            if x[p.id].value() == 1
        ]

        return AssignmentResult(
            project_id=project.id,
            members=members,
            score=round(pulp.value(model.objective), 6),
        )
