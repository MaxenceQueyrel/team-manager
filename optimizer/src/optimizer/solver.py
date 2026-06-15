import numpy as np
from scipy.optimize import linear_sum_assignment

from optimizer.models import (
    ProjectInput,
    PersonInput,
    AssignmentWeights,
    AssignedMember,
    AssignmentResult,
)
from optimizer.objectives import compute_score_matrix, affinity_bonus
from optimizer.constraints import build_feasibility_mask


class TeamAssignmentSolver:
    """
    Solves the team assignment problem with the Hungarian algorithm (scipy).

    Accepts pure domain objects — no HTTP, no I/O, no side effects.
    The API layer is responsible for converting its models to/from these types.
    """

    def solve(
        self,
        project: ProjectInput,
        people: list[PersonInput],
        weights: AssignmentWeights,
        respect_exclusions: bool = True,
    ) -> AssignmentResult:
        if not people:
            return AssignmentResult(project_id=project.id, members=[], score=0.0)

        score_matrix = compute_score_matrix(project, people, weights)
        mask = build_feasibility_mask(project, people, respect_exclusions)
        score_matrix[~mask] = -np.inf

        # linear_sum_assignment minimises; negate to maximise our score
        cost_matrix = np.where(np.isfinite(score_matrix), -score_matrix, 1e9)
        row_indices, col_indices = linear_sum_assignment(cost_matrix)

        members: list[AssignedMember] = []
        total_score = 0.0

        for row, col in zip(row_indices, col_indices):
            if np.isfinite(score_matrix[row, col]):
                members.append(
                    AssignedMember(
                        person_id=people[col].id,
                        fte_allocation=min(people[col].fte_capacity, 1.0),
                    )
                )
                total_score += score_matrix[row, col]

        if weights.chemistry > 0 and len(members) > 1:
            people_by_id = {p.id: p for p in people}
            total_score += weights.chemistry * affinity_bonus(
                [m.person_id for m in members], people_by_id
            )

        return AssignmentResult(
            project_id=project.id,
            members=members,
            score=round(total_score, 6),
        )
