from abc import ABC, abstractmethod

from optimizer.models import (
    ProjectInput,
    PersonInput,
    AssignmentWeights,
    AssignmentResult,
    PhaseConflict,
)


class InfeasibleAssignmentError(ValueError):
    """Raised when the project's hard constraints admit no team at all.

    Attributes:
        project_id: Identifier of the project that could not be staffed.
        conflicts: One entry per infeasible phase and cause, in phase order.
    """

    def __init__(self, project_id: str, conflicts: list[PhaseConflict]) -> None:
        self.project_id = project_id
        self.conflicts = conflicts
        causes = ", ".join(f"{c.reason} in phase {c.phase_id}" if c.phase_id else str(c.reason) for c in conflicts)
        super().__init__(f"Could not staff project '{project_id}': {causes or 'no feasible assignment'}.")


class AssignmentSolverPort(ABC):
    """
    Port for team-assignment solver backends.

    Callers depend on this interface, never on a concrete solver library, so
    the backend (PuLP, OR-Tools, ...) can be swapped without touching callers.
    """

    @abstractmethod
    def solve(
        self,
        project: ProjectInput,
        people: list[PersonInput],
        weights: AssignmentWeights,
        respect_exclusions: bool = True,
    ) -> AssignmentResult:
        """Finds the optimal team assignment for a project.

        Args:
            project: The project requirements and constraints.
            people: Pool of candidate people to assign.
            weights: Relative weights for performance, chemistry, growth and cost.
            respect_exclusions: Whether to honour project.excluded_person_ids.

        Returns:
            An AssignmentResult with the selected members, a composite score, and the
            per-phase FTE and skill coverage of the selected team.

        Raises:
            InfeasibleAssignmentError: If no feasible assignment exists at all.
        """

    @abstractmethod
    def solve_pool(
        self,
        project: ProjectInput,
        people: list[PersonInput],
        weights: AssignmentWeights,
        respect_exclusions: bool = True,
        n_alternatives: int = 2,
        min_difference: int = 2,
    ) -> list[AssignmentResult]:
        """Finds the optimal team assignment plus ranked, distinct alternatives.

        For phased projects, "a different team" is judged across the whole
        project: an alternative differs from every earlier team by at least
        ``min_difference`` (phase, person) picks, and teams are ranked by total
        project score.

        Args:
            project: The project requirements and constraints.
            people: Pool of candidate people to assign.
            weights: Relative weights for performance, chemistry, growth and cost.
            respect_exclusions: Whether to honour project.excluded_person_ids.
            n_alternatives: Maximum number of alternatives to return after the optimum.
            min_difference: Minimum number of members each alternative must swap out
                relative to every earlier team; clamped to the team size.

        Returns:
            The optimum first, then alternatives in non-increasing score order. Holds at
            most ``1 + n_alternatives`` results, fewer when the constraints admit fewer
            distinct teams. ``max_score`` is identical across the pool.

        Raises:
            InfeasibleAssignmentError: If no feasible assignment exists at all.
        """
