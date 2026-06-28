import pulp

from optimizer.models import (
    ProjectInput,
    PersonInput,
    AssignmentWeights,
    AssignedMember,
    AssignmentResult,
    ProjectPhase,
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
        if not project.phases:
            members, score = self._solve_phase(project, people, weights, respect_exclusions)
            return AssignmentResult(project_id=project.id, members=members, score=score)

        if weights.handover > 0:
            return self._solve_phases_jointly(project, people, weights, respect_exclusions)

        all_members = []
        total_score = 0.0
        for phase in project.phases:
            shadow = self._phase_shadow(project, phase)
            members, score = self._solve_phase(shadow, people, weights, respect_exclusions)
            all_members += [
                AssignedMember(person_id=m.person_id, fte_allocation=m.fte_allocation, phase_id=phase.id)
                for m in members
            ]
            total_score += score

        return AssignmentResult(project_id=project.id, members=all_members, score=round(total_score, 6))

    def _solve_phase(
        self,
        project: ProjectInput,
        people: list[PersonInput],
        weights: AssignmentWeights,
        respect_exclusions: bool,
    ) -> tuple[list[AssignedMember], float]:
        candidates = feasible_people(project, people, respect_exclusions)
        if not candidates:
            return [], 0.0

        model = pulp.LpProblem("team_assignment", pulp.LpMaximize)
        x, objective_terms = self._build_phase(model, "0", project, candidates, weights)
        model += pulp.lpSum(objective_terms)
        model.solve(pulp.PULP_CBC_CMD(msg=False))

        members = [
            AssignedMember(person_id=p.id, fte_allocation=min(effective_availability(p, project), 1.0))
            for p in candidates
            if x[p.id].value() == 1
        ]

        return members, round(pulp.value(model.objective), 6)

    def _solve_phases_jointly(
        self,
        project: ProjectInput,
        people: list[PersonInput],
        weights: AssignmentWeights,
        respect_exclusions: bool,
    ) -> AssignmentResult:
        model = pulp.LpProblem("team_assignment", pulp.LpMaximize)
        objective_terms = []
        phases = []  # (phase, shadow, candidates, x) per phase, in order
        for k, phase in enumerate(project.phases):
            shadow = self._phase_shadow(project, phase)
            candidates = feasible_people(shadow, people, respect_exclusions)
            if not candidates:
                phases.append((phase, shadow, [], {}))
                continue
            x, terms = self._build_phase(model, str(k), shadow, candidates, weights)
            objective_terms += terms
            phases.append((phase, shadow, candidates, x))

        # Reward people retained between consecutive phases: y is 1 only when the
        # person is selected in both, linearized like the chemistry pairs.
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
        model.solve(pulp.PULP_CBC_CMD(msg=False))

        all_members = [
            AssignedMember(
                person_id=p.id,
                fte_allocation=min(effective_availability(p, shadow), 1.0),
                phase_id=phase.id,
            )
            for phase, shadow, candidates, x in phases
            for p in candidates
            if x[p.id].value() == 1
        ]

        return AssignmentResult(
            project_id=project.id, members=all_members, score=round(pulp.value(model.objective), 6)
        )

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
    ) -> tuple[dict[str, pulp.LpVariable], list]:
        """Adds one phase's selection variables, constraints, and per-phase objective terms to ``model``.

        Args:
            model: The MILP being assembled.
            prefix: Unique tag disambiguating this phase's variable names.
            project: The (possibly phase-scoped) requirements driving scores and slot count.
            candidates: Feasible people for this phase.
            weights: Per-objective weights.

        Returns:
            The per-person selection variables and the objective terms contributed by this phase.
        """
        scores = compute_person_scores(project, candidates, weights)
        included_ids = set(project.included_person_ids) & {p.id for p in candidates}
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

        return x, objective_terms
