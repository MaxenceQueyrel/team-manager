from datetime import timedelta

import pulp

from optimizer.models import (
    ProjectInput,
    PersonInput,
    AssignmentWeights,
    AssignedMember,
    AssignmentResult,
    InfeasibilityReason,
    PhaseConflict,
    DateRange,
    ProjectPhase,
    Squad,
    StartCandidate,
    StartDateScan,
)
from optimizer.objectives import compute_person_scores
from optimizer.constraints import feasible_people
from optimizer.availability import effective_availability
from optimizer.coverage import compute_coverage
from optimizer.domain.solver import AssignmentSolverPort, InfeasibleAssignmentError
from optimizer.schedule import schedule_anchor, shift_project

MAX_AFFINITY = 5.0  # matches the documented bound on PersonInput.affinities
MIN_FTE_SHARE = 0.1  # smallest share a selected person carries, so nobody is staffed at ~0 FTE
# Every other objective term is headcount-neutral, so equal-quality teams tie; this
# per-person cost breaks the tie towards fewer, fuller allocations. Kept well below
# any meaningful score difference so it never overrides quality.
HEADCOUNT_PENALTY = 1e-3
START_STEP = timedelta(weeks=1)


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
        phases = []  # (phase_id, scoped, candidates, x, a) per scope, in order
        need_per_phase = []
        for k, (phase_id, scoped) in enumerate(scopes):
            candidates = feasible_people(scoped, people, respect_exclusions)
            if not candidates:
                phases.append((phase_id, scoped, [], {}, {}))
                need_per_phase.append(0.0)
                continue
            x, a, terms, need = self._build_phase(model, str(k), scoped, candidates, weights)
            objective_terms += terms
            phases.append((phase_id, scoped, candidates, x, a))
            need_per_phase.append(need)

        if not objective_terms:
            return [self._result(project.id, phases, [], score=0.0, max_score=0.0)]

        # Reward the FTE retained between consecutive phases, min(a_curr, a_next) per
        # person. Counting retained people instead would reward splitting the need
        # across more of them; retained FTE is bounded by the smaller phase's need.
        if weights.handover > 0:
            for k in range(len(phases) - 1):
                a_curr = phases[k][4]
                a_next = phases[k + 1][4]
                for person_id in a_curr.keys() & a_next.keys():
                    retained = pulp.LpVariable(f"h_{k}_{person_id}", lowBound=0)
                    model += retained <= a_curr[person_id]
                    model += retained <= a_next[person_id]
                    objective_terms.append(weights.handover * retained)

        quality = pulp.lpSum(objective_terms)
        headcount = pulp.lpSum(var for _, _, _, x, _ in phases for var in x.values())
        model += quality - HEADCOUNT_PENALTY * headcount

        max_score = round(
            sum(self._max_phase_score(need, weights) for need in need_per_phase)
            + weights.handover * sum(min(a, b) for a, b in zip(need_per_phase, need_per_phase[1:])),
            6,
        )

        pool = []
        while True:
            model.solve(pulp.PULP_CBC_CMD(msg=False))
            if pulp.LpStatus[model.status] != "Optimal":
                if not pool:
                    raise InfeasibleAssignmentError(project.id, self._diagnose(phases, need_per_phase, weights))
                break  # the cuts exclude every remaining team

            selected = [
                (phase_id, p.id, x[p.id], a[p.id])
                for phase_id, _, candidates, x, a in phases
                for p in candidates
                if x[p.id].value() == 1
            ]
            members = [
                AssignedMember(person_id=person_id, fte_allocation=round(a_var.value(), 6), phase_id=phase_id)
                for phase_id, person_id, _, a_var in selected
            ]
            pool.append(
                self._result(project.id, phases, members, score=round(pulp.value(quality), 6), max_score=max_score)
            )
            if len(pool) > n_alternatives:
                break

            # No-good cut: at least min_difference of this team's (phase, person)
            # picks must be dropped. Clamped so tiny teams don't make it trivially infeasible.
            # It acts on x, so alternatives differ in people, not merely in allocations.
            selected_vars = [x_var for _, _, x_var, _ in selected]
            model += pulp.lpSum(selected_vars) <= len(selected_vars) - min(min_difference, len(selected_vars))

        return pool

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
        anchor = schedule_anchor(project)
        if anchor is None:
            raise ValueError(f"Project '{project.id}' has no date range to shift within a start window.")

        candidates = []
        optima = []
        errors = []
        start = start_window.start
        while start <= start_window.end:
            # Only the optimum is needed to rank a start; the pool is built once, at the winner.
            try:
                optimum = self.solve(shift_project(project, start - anchor), people, weights, respect_exclusions)
            except InfeasibleAssignmentError as exc:
                errors.append(exc)
                candidates.append(StartCandidate(start=start, feasible=False))
            else:
                optima.append((start, optimum))
                candidates.append(
                    StartCandidate(
                        start=start,
                        feasible=True,
                        score=optimum.score,
                        max_score=optimum.max_score,
                        fully_covered=optimum.fully_covered,
                    )
                )
            start += START_STEP

        if not optima:
            raise errors[0]
        best_start, _ = min(optima, key=lambda pair: (not pair[1].fully_covered, -pair[1].score, pair[0]))

        pool = self.solve_pool(
            shift_project(project, best_start - anchor),
            people,
            weights,
            respect_exclusions,
            n_alternatives=n_alternatives,
            min_difference=min_difference,
        )
        return StartDateScan(
            best_start=best_start,
            pool=[result.model_copy(update={"start_date": best_start}) for result in pool],
            candidates=candidates,
        )

    def _result(
        self, project_id: str, phases: list, members: list[AssignedMember], score: float, max_score: float
    ) -> AssignmentResult:
        coverage = [
            compute_coverage(phase_id, scoped, candidates, [m for m in members if m.phase_id == phase_id])
            for phase_id, scoped, candidates, _, _ in phases
        ]
        return AssignmentResult(
            project_id=project_id,
            members=members,
            score=score,
            max_score=max_score,
            coverage=coverage,
            fully_covered=all(c.fte_met and all(s.met for s in c.skills) for c in coverage),
        )

    def _diagnose(self, phases: list, need_per_phase: list[float], weights: AssignmentWeights) -> list[PhaseConflict]:
        # Phases share no hard constraint (handover is only rewarded), so the joint model
        # is infeasible exactly when some phase is infeasible on its own. Each cause is
        # identified by the relaxation that makes that phase solvable again.
        conflicts = []
        for (phase_id, scoped, candidates, _, _), need in zip(phases, need_per_phase):
            if not candidates or self._is_feasible(scoped, candidates, weights):
                continue
            candidate_ids = {p.id for p in candidates}
            squad_indices = [
                i for i, squad in enumerate(scoped.squads) if len(set(squad.member_ids) & candidate_ids) > 1
            ]
            forced_ids = [pid for pid in scoped.included_person_ids if pid in candidate_ids]

            causes = []
            if squad_indices and self._is_feasible(scoped.model_copy(update={"squads": []}), candidates, weights):
                # Name the squads whose removal alone suffices; if none does, they conflict jointly.
                blocking = [
                    i
                    for i in squad_indices
                    if self._is_feasible(
                        scoped.model_copy(update={"squads": scoped.squads[:i] + scoped.squads[i + 1 :]}),
                        candidates,
                        weights,
                    )
                ]
                causes.append((InfeasibilityReason.SQUAD_CONFLICT, blocking or squad_indices, []))
            if forced_ids and self._is_feasible(
                scoped.model_copy(update={"included_person_ids": []}), candidates, weights
            ):
                causes.append((InfeasibilityReason.FORCED_MEMBER_CONFLICT, [], forced_ids))
            if not causes and squad_indices and forced_ids:
                relaxed = scoped.model_copy(update={"squads": [], "included_person_ids": []})
                if self._is_feasible(relaxed, candidates, weights):
                    causes.append((InfeasibilityReason.SQUAD_AND_FORCED_MEMBER_CONFLICT, squad_indices, forced_ids))
            if not causes:
                causes.append((InfeasibilityReason.FTE_NOT_REACHABLE, [], []))

            conflicts += [
                PhaseConflict(
                    phase_id=phase_id,
                    reason=reason,
                    required_fte=scoped.n_slots,
                    need_fte=round(need, 6),
                    squad_indices=squads,
                    forced_person_ids=forced,
                )
                for reason, squads, forced in causes
            ]
        return conflicts

    def _is_feasible(self, project: ProjectInput, candidates: list[PersonInput], weights: AssignmentWeights) -> bool:
        model = pulp.LpProblem("feasibility", pulp.LpMaximize)
        _, _, terms, _ = self._build_phase(model, "0", project, candidates, weights)
        model += pulp.lpSum(terms)
        model.solve(pulp.PULP_CBC_CMD(msg=False))
        return pulp.LpStatus[model.status] == "Optimal"

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
