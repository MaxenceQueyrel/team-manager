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
MIN_FTE_SHARE = 0.1  # smallest share a selected person carries, so nobody is staffed at ~0 FTE
# Every other objective term is headcount-neutral, so equal-quality teams tie; this
# per-person cost breaks the tie towards fewer, fuller allocations. Kept well below
# any meaningful score difference so it never overrides quality.
HEADCOUNT_PENALTY = 1e-3


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
        phases = []  # (phase_id, candidates, x, a) per scope, in order
        need_per_phase = []
        for k, (phase_id, scoped) in enumerate(scopes):
            candidates = feasible_people(scoped, people, respect_exclusions)
            if not candidates:
                phases.append((phase_id, [], {}, {}))
                need_per_phase.append(0.0)
                continue
            x, a, terms, need = self._build_phase(model, str(k), scoped, candidates, weights)
            objective_terms += terms
            phases.append((phase_id, candidates, x, a))
            need_per_phase.append(need)

        if not objective_terms:
            return [AssignmentResult(project_id=project.id, members=[], score=0.0, max_score=0.0)]

        # Reward the FTE retained between consecutive phases, min(a_curr, a_next) per
        # person. Counting retained people instead would reward splitting the need
        # across more of them; retained FTE is bounded by the smaller phase's need.
        if weights.handover > 0:
            for k in range(len(phases) - 1):
                a_curr = phases[k][3]
                a_next = phases[k + 1][3]
                for person_id in a_curr.keys() & a_next.keys():
                    retained = pulp.LpVariable(f"h_{k}_{person_id}", lowBound=0)
                    model += retained <= a_curr[person_id]
                    model += retained <= a_next[person_id]
                    objective_terms.append(weights.handover * retained)

        quality = pulp.lpSum(objective_terms)
        headcount = pulp.lpSum(var for _, _, x, _ in phases for var in x.values())
        model += quality - HEADCOUNT_PENALTY * headcount

        max_score = round(
            sum(self._max_phase_score(need, weights) for need in need_per_phase)
            + weights.handover * sum(min(a, b) for a, b in zip(need_per_phase, need_per_phase[1:])),
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
                (phase_id, p.id, x[p.id], a[p.id])
                for phase_id, candidates, x, a in phases
                for p in candidates
                if x[p.id].value() == 1
            ]
            members = [
                AssignedMember(person_id=person_id, fte_allocation=round(a_var.value(), 6), phase_id=phase_id)
                for phase_id, person_id, _, a_var in selected
            ]
            pool.append(
                AssignmentResult(
                    project_id=project.id,
                    members=members,
                    score=round(pulp.value(quality), 6),
                    max_score=max_score,
                )
            )
            if len(pool) > n_alternatives:
                break

            # No-good cut: at least min_difference of this team's (phase, person)
            # picks must be dropped. Clamped so tiny teams don't make it trivially infeasible.
            # It acts on x, so alternatives differ in people, not merely in allocations.
            selected_vars = [x_var for _, _, x_var, _ in selected]
            model += pulp.lpSum(selected_vars) <= len(selected_vars) - min(min_difference, len(selected_vars))

        return pool

    def _check_optimal(self, model: pulp.LpProblem, project: ProjectInput) -> None:
        status = pulp.LpStatus[model.status]
        if status != "Optimal":
            raise ValueError(
                f"Could not solve assignment for project '{project.id}': solver status is '{status}'. "
                "Check for conflicting constraints (e.g. a squad too large for the phase's required FTE)."
            )

    def _expand_included_via_squads(
        self, included_ids: set[str], squads: list[Squad], candidate_ids: set[str]
    ) -> set[str]:
        """Grows a forced-inclusion set to cover squad-mates of already-included people.

        Without this, the coverage need could be sized for the seed
        ``included_ids`` while squad equality constraints silently force extra
        people to ``1``, whose minimum shares might then not fit, making the MILP infeasible.
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

    def _max_phase_score(self, need: float, weights: AssignmentWeights) -> float:
        """Upper bound on a phase's objective: every per-person factor maxed at 1.0 over
        the whole need, plus all shared FTE (at most need / 2) at the maximum affinity.
        """
        per_person_max = weights.performance + weights.growth + weights.cost + weights.preference
        chemistry_max = weights.chemistry * MAX_AFFINITY * need / 2 if need > 1 else 0.0
        return need * per_person_max + chemistry_max

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
    ) -> tuple[dict[str, pulp.LpVariable], dict[str, pulp.LpVariable], list, float]:
        """Adds one phase's selection variables, constraints, and per-phase objective terms to ``model``.

        Args:
            model: The MILP being assembled.
            prefix: Unique tag disambiguating this phase's variable names.
            project: The (possibly phase-scoped) requirements driving scores and the FTE need.
            candidates: Feasible people for this phase.
            weights: Per-objective weights.

        Returns:
            The per-person selection variables, the per-person FTE allocation variables, the
            objective terms contributed by this phase, and the FTE the allocations must sum to.
        """
        scores = compute_person_scores(project, candidates, weights)
        candidate_ids = {p.id for p in candidates}
        included_ids = self._expand_included_via_squads(
            set(project.included_person_ids) & candidate_ids, project.squads, candidate_ids
        )
        availability = {p.id: min(effective_availability(p, project, p.assignments), 1.0) for p in candidates}
        min_share = {person_id: min(MIN_FTE_SHARE, avail) for person_id, avail in availability.items()}
        # Capped at what the pool can supply, and raised when forced members' minimum
        # shares alone exceed it, so neither case makes the phase infeasible.
        need = max(
            min(project.n_slots, sum(availability.values())),
            sum(min_share[person_id] for person_id in included_ids),
        )

        x = {p.id: pulp.LpVariable(f"x_{prefix}_{p.id}", cat="Binary") for p in candidates}
        a = {p.id: pulp.LpVariable(f"a_{prefix}_{p.id}", lowBound=0) for p in candidates}
        for person_id in x:
            model += a[person_id] <= availability[person_id] * x[person_id]
            model += a[person_id] >= min_share[person_id] * x[person_id]
        model += pulp.lpSum(a.values()) == need
        # Forced members whose availability exceeds the need still sum to it: the
        # objective decides the split, so higher-scoring members get fuller shares.
        for person_id in included_ids:
            model += x[person_id] == 1

        # Squads are co-selected by chaining equalities across members feasible in
        # this phase; absent members are simply skipped.
        for squad in project.squads:
            present = [pid for pid in squad.member_ids if pid in x]
            for first, second in zip(present, present[1:]):
                model += x[first] == x[second]

        # Weighted by FTE so the score reflects the capacity delivered, not headcount.
        objective_terms = [scores[p.id] * a[p.id] for p in candidates]

        # Chemistry is pairwise, so it can't be folded into the per-person score.
        # Positive affinity rewards shared FTE w_ij, where each person's shared FTE
        # across all their pairs is capped by their own allocation: total chemistry is
        # then bounded by need / 2 and saturates at the smallest team, so adding people
        # never creates extra pairs to reward. A need of at most one FTE is ideally one
        # person with no pairs at all, so it earns no bonus; otherwise friends would be
        # rewarded for splitting it. Negative affinity is friction that doesn't shrink
        # with a part-time share, so it is penalised whenever both are selected.
        if weights.chemistry > 0:
            shared_fte = {p.id: [] for p in candidates}
            for i, p_i in enumerate(candidates):
                for p_j in candidates[i + 1 :]:
                    affinity = p_i.affinities.get(p_j.id, 0.0)
                    if affinity > 0 and need > 1:
                        w = pulp.LpVariable(f"w_{prefix}_{p_i.id}_{p_j.id}", lowBound=0)
                        shared_fte[p_i.id].append(w)
                        shared_fte[p_j.id].append(w)
                        objective_terms.append(weights.chemistry * affinity * w)
                    elif affinity < 0:
                        z = pulp.LpVariable(f"z_{prefix}_{p_i.id}_{p_j.id}", lowBound=0)
                        model += z >= x[p_i.id] + x[p_j.id] - 1
                        objective_terms.append(weights.chemistry * affinity * z)
            for person_id, pair_vars in shared_fte.items():
                if pair_vars:
                    model += pulp.lpSum(pair_vars) <= a[person_id]

        return x, a, objective_terms, need
