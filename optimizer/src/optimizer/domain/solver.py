from abc import ABC, abstractmethod

from optimizer.models import (
    ProjectInput,
    PersonInput,
    AssignmentWeights,
    AssignmentResult,
)


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
            An AssignmentResult with the selected members and a composite score.
        """
