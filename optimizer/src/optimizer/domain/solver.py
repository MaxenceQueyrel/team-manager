from abc import ABC, abstractmethod

from optimizer.models import (
    ProjectInput,
    PersonInput,
    AssignmentWeights,
    AssignmentResult,
    DateRange,
    PhaseConflict,
    PortfolioProject,
    PortfolioResult,
    StartDateScan,
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


class InfeasiblePortfolioError(InfeasibleAssignmentError):
    """Raised when the hard constraints of a portfolio solve admit no set of teams.

    It is an InfeasibleAssignmentError whose ``project_id`` and ``conflicts`` are those
    of the first infeasible project, so a handler written for a single project still
    gets a coherent error; ``project_errors`` holds every infeasible project.

    Attributes:
        project_errors: One error per infeasible project, in input order, each with that
            project's conflicts. A CROSS_PROJECT_FORCED_CONFLICT is listed under every
            project it involves, once per phase of that project.
    """

    def __init__(self, project_errors: list[InfeasibleAssignmentError]) -> None:
        self.project_errors = project_errors
        self.project_id = project_errors[0].project_id
        self.conflicts = project_errors[0].conflicts
        ValueError.__init__(self, " ".join(str(error) for error in project_errors))


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

    @abstractmethod
    def solve_pool_over_starts(
        self,
        project: ProjectInput,
        people: list[PersonInput],
        weights: AssignmentWeights,
        start_window: DateRange,
        respect_exclusions: bool = True,
        n_alternatives: int = 2,
        min_difference: int = 2,
    ) -> StartDateScan:
        """Finds the start date inside a window that admits the best team, and its pool.

        Candidate starts are weekly from ``start_window.start`` up to ``start_window.end``;
        the window bounds the start only, so the project may end after it. At each
        candidate the whole schedule is shifted rigidly (see ``optimizer.schedule``) so
        its anchor lands on the candidate, and the optimal team is scored there.
        Candidates rank fully covered first, then by highest score, then earliest start.

        Args:
            project: The project requirements and constraints, with at least one date range.
            people: Pool of candidate people to assign.
            weights: Relative weights for performance, chemistry, growth and cost.
            start_window: Earliest and latest allowed start dates, both inclusive.
            respect_exclusions: Whether to honour project.excluded_person_ids.
            n_alternatives: Maximum number of alternatives to return at the best start.
            min_difference: Minimum number of members each alternative must swap out
                relative to every earlier team; clamped to the team size.

        Returns:
            A StartDateScan with the best start, the ``solve_pool`` result of the project
            shifted to it (every result's ``start_date`` set to that start), and a summary
            of every candidate in date order. Each feasible candidate carries its optimal
            team (``start_date`` set to the candidate); infeasible ones are flagged
            ``feasible=False`` with no team.

        Raises:
            ValueError: If the project has no date range to shift.
            InfeasibleAssignmentError: If every candidate start is infeasible; carries the
                conflicts of the earliest candidate.
        """

    @abstractmethod
    def solve_portfolio(
        self,
        projects: list[PortfolioProject],
        people: list[PersonInput],
        weights: AssignmentWeights,
        respect_exclusions: bool = True,
    ) -> PortfolioResult:
        """Finds the best teams for several projects that compete for the same people, jointly.

        Every phase of every project is staffed in one model. A phase may be staffed below
        its need, and a person's allocations to scopes that overlap in time must together
        fit their availability over each overlapping period; a scope without dates overlaps
        everything. Teams are chosen lexicographically: staffed FTE of each priority tier,
        critical first, so a higher tier is never short-staffed to benefit a lower one; then
        the summed quality score of every project. Chemistry and handover only count within
        a project.

        Args:
            projects: The projects to staff, at the dates they should be solved at.
            people: Pool of candidate people shared by every project.
            weights: Relative weights for performance, chemistry, growth and cost.
            respect_exclusions: Whether to honour each project's excluded_person_ids.

        Returns:
            A PortfolioResult with one AssignmentResult per project, in input order, each
            with its own score, max_score, coverage and fully_covered.

        Raises:
            InfeasiblePortfolioError: If no feasible set of teams exists, with the conflicts
                of every infeasible project.
        """
