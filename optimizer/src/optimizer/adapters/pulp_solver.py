import pulp

from optimizer.models import (
    ProjectInput,
    PersonInput,
    AssignmentWeights,
    AssignedMember,
    AssignmentResult,
    ProjectPhase,
    Squad,
)
from optimizer.objectives import compute_person_scores
from optimizer.constraints import feasible_people
from optimizer.availability import effective_availability
from optimizer.domain.solver import AssignmentSolverPort

MAX_AFFINITY = 5.0  # matches the documented bound on PersonInput.affinities


class PuLPTeamAssignmentSolver(AssignmentSolverPort):
    """Solves the team assignment problem as a MILP (PuLP / CBC)."""

    def solve(
        self,
        project: ProjectInput,
        people: list[PersonInput],
        weights: AssignmentWeights,
        respect_exclusions: bool = True,
    ) -> AssignmentResult:
        return self.solve_pool(project, people, weights, respect_exclusions, n_alternatives=0)[0]

    def solve_pool(
        self,
        project: ProjectInput,
        people: list[PersonInput],
        weights: AssignmentWeights,
        respect_exclusions: bool = True,
        n_alternatives: int = 2,
        min_difference: int = 2,
    ) -> list[AssignmentResult]:
        # A project without phases is solved as a single untagged scope. Phases are
        # always modelled jointly: with handover == 0 the objective is separable, so
        # the optimum matches solving each phase alone, and the no-good cut can then
        # span every phase so alternatives are ranked by total project score.
        if project.phases:
            scopes = [(phase.id, self._phase_shadow(project, phase)) for phase in project.phases]
        else:
            scopes = [(None, project)]

        model = pulp.LpProblem("team_assignment", pulp.LpMaximize)
        objective_terms = []
        phases = []  # (phase_id, scoped project, candidates, x) per scope, in order
        n_selected_per_phase = []
        for k, (phase_id, scoped) in enumerate(scopes):
            candidates = feasible_people(scoped, people, respect_exclusions)
            if not candidates:
                phases.append((phase_id, scoped, [], {}))
                n_selected_per_phase.append(0)
                continue
            x, terms, n_selected = self._build_phase(model, str(k), scoped, candidates, weights)
            objective_terms += terms
            phases.append((phase_id, scoped, candidates, x))
            n_selected_per_phase.append(n_selected)

        if not objective_terms:
            return [AssignmentResult(project_id=project.id, members=[], score=0.0, max_score=0.0)]

        # Reward people retained between consecutive phases: y is 1 only when the
        # person is selected in both, linearized like the chemistry pairs.
        if weights.handover > 0:
            for k in range(len(phases) - 1):
                x_curr = phases[k][3]
                x_next = phases[k + 1][3]
                for person_id in x_curr.keys() & x_next.keys():
                    y = pulp.LpVariable(f"h_{k}_{person_id}", cat="Binary")
                    model += y <= x_curr[person_id]
                    model += y <= x_next[person_id]
                    model += y >= x_curr[person_id] + x_next[person_id] - 1
                    objective_terms.append(weights.handover * y)

        model += pulp.lpSum(objective_terms)

        max_score = round(
            sum(self._max_phase_score(n, weights) for n in n_selected_per_phase)
            + weights.handover * sum(min(a, b) for a, b in zip(n_selected_per_phase, n_selected_per_phase[1:])),
            6,
        )

        pool = []
        while True:
            model.solve(pulp.PULP_CBC_CMD(msg=False))
            if not pool:
                self._check_optimal(model, project)
            elif pulp.LpStatus[model.status] != "Optimal":
                break  # the cuts exclude every remaining team

            selected = [
                (phase_id, scoped, p, x[p.id])
                for phase_id, scoped, candidates, x in phases
                for p in candidates
                if x[p.id].value() == 1
            ]
            members = [
                AssignedMember(
                    person_id=p.id,
                    fte_allocation=min(effective_availability(p, scoped), 1.0),
                    phase_id=phase_id,
                )
                for phase_id, scoped, p, _ in selected
            ]
            pool.append(
                AssignmentResult(
                    project_id=project.id,
                    members=members,
                    score=round(pulp.value(model.objective), 6),
                    max_score=max_score,
                )
            )
            if len(pool) > n_alternatives:
                break

            # No-good cut: at least min_difference of this team's (phase, person)
            # picks must be dropped. Clamped so tiny teams don't make it trivially infeasible.
            selected_vars = [var for _, _, _, var in selected]
            model += pulp.lpSum(selected_vars) <= len(selected_vars) - min(min_difference, len(selected_vars))

        return pool

    def _check_optimal(self, model: pulp.LpProblem, project: ProjectInput) -> None:
        status = pulp.LpStatus[model.status]
        if status != "Optimal":
            raise ValueError(
                f"Could not solve assignment for project '{project.id}': solver status is '{status}'. "
                "Check for conflicting constraints (e.g. squads and n_slots that can't be satisfied together)."
            )

    def _expand_included_via_squads(
        self, included_ids: set[str], squads: list[Squad], candidate_ids: set[str]
    ) -> set[str]:
        """Grows a forced-inclusion set to cover squad-mates of already-included people.

        Without this, the slot-count constraint could be sized for the seed
        ``included_ids`` while squad equality constraints silently force extra
        people to ``1``, making the MILP infeasible.
        """
        expanded = set(included_ids)
        changed = True
        while changed:
            changed = False
            for squad in squads:
                present = [pid for pid in squad.member_ids if pid in candidate_ids]
                if expanded & set(present):
                    newly_added = set(present) - expanded
                    if newly_added:
                        expanded |= newly_added
                        changed = True
        return expanded

    def _max_phase_score(self, n_selected: int, weights: AssignmentWeights) -> float:
        """Upper bound on a phase's objective: every per-person factor maxed at 1.0,
        plus every selected pair scoring the maximum affinity for chemistry.
        """
        per_person_max = weights.performance + weights.growth + weights.cost + weights.preference
        chemistry_max = weights.chemistry * MAX_AFFINITY * (n_selected * (n_selected - 1) / 2)
        return n_selected * per_person_max + chemistry_max

    def _phase_shadow(self, project: ProjectInput, phase: ProjectPhase) -> ProjectInput:
        return ProjectInput(
            id=project.id,
            n_slots=phase.n_slots,
            skill_requirements=phase.skill_requirements,
            excluded_person_ids=project.excluded_person_ids,
            included_person_ids=project.included_person_ids,
            squads=project.squads,
            date_ranges=[phase.date_range] if phase.date_range else [],
        )

    def _build_phase(
        self,
        model: pulp.LpProblem,
        prefix: str,
        project: ProjectInput,
        candidates: list[PersonInput],
        weights: AssignmentWeights,
    ) -> tuple[dict[str, pulp.LpVariable], list, int]:
        """Adds one phase's selection variables, constraints, and per-phase objective terms to ``model``.

        Args:
            model: The MILP being assembled.
            prefix: Unique tag disambiguating this phase's variable names.
            project: The (possibly phase-scoped) requirements driving scores and slot count.
            candidates: Feasible people for this phase.
            weights: Per-objective weights.

        Returns:
            The per-person selection variables, the objective terms contributed by this phase,
            and the number of people selected in this phase.
        """
        scores = compute_person_scores(project, candidates, weights)
        candidate_ids = {p.id for p in candidates}
        included_ids = self._expand_included_via_squads(
            set(project.included_person_ids) & candidate_ids, project.squads, candidate_ids
        )
        n_selected = max(min(project.n_slots, len(candidates)), len(included_ids))

        x = {p.id: pulp.LpVariable(f"x_{prefix}_{p.id}", cat="Binary") for p in candidates}
        model += pulp.lpSum(x.values()) == n_selected
        for person_id in included_ids:
            model += x[person_id] == 1

        # Squads are co-selected by chaining equalities across members feasible in
        # this phase; absent members are simply skipped.
        for squad in project.squads:
            present = [pid for pid in squad.member_ids if pid in x]
            for a, b in zip(present, present[1:]):
                model += x[a] == x[b]

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
                    z = pulp.LpVariable(f"z_{prefix}_{p_i.id}_{p_j.id}", cat="Binary")
                    model += z <= x[p_i.id]
                    model += z <= x[p_j.id]
                    model += z >= x[p_i.id] + x[p_j.id] - 1
                    objective_terms.append(weights.chemistry * affinity * z)

        return x, objective_terms, n_selected
