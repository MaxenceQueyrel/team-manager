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
    SkillAllocation,
    StartCandidate,
    StartDateScan,
)
from optimizer.objectives import compute_skill_scores
from optimizer.constraints import feasible_people
from optimizer.availability import effective_availability
from optimizer.coverage import compute_coverage
from optimizer.domain.solver import AssignmentSolverPort, InfeasibleAssignmentError
from optimizer.grid import ALLOCATION_STEP, STEPS_PER_FTE, floor_to_steps
from optimizer.schedule import schedule_anchor, shift_project

MAX_AFFINITY = 5.0  # matches the documented bound on PersonInput.affinities
# Every other objective term is headcount-neutral, so equal-quality teams tie; this
# cost per selected person and per (person, skill) share breaks the tie towards fewer,
# fuller allocations. Kept well below any meaningful score difference so it never
# overrides quality.
HEADCOUNT_PENALTY = 1e-3
START_STEP = timedelta(weeks=1)

# days[person_id][skill_id]: allocation steps (days per week) a candidate gives to a
# required skill. Only skills the person qualifies for have an entry.
type DayVars = dict[str, dict[str, pulp.LpVariable]]


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
        headcount = []
        phases = []  # (phase_id, scoped, candidates, x, days) per scope, in order
        need_per_phase = []  # in allocation steps
        for k, (phase_id, scoped) in enumerate(scopes):
            candidates = feasible_people(scoped, people, respect_exclusions)
            if not candidates:
                phases.append((phase_id, scoped, [], {}, {}))
                need_per_phase.append(0)
                continue
            need = self._staffable_steps(scoped, candidates)
            x, days, terms, picks = self._build_phase(model, str(k), scoped, candidates, weights, need)
            objective_terms += terms
            headcount += picks
            phases.append((phase_id, scoped, candidates, x, days))
            need_per_phase.append(need)

        if not headcount:
            return [self._result(project.id, phases, [], score=0.0, max_score=0.0)]

        # Reward the FTE retained between consecutive phases, min(a_curr, a_next) per
        # person. Counting retained people instead would reward splitting the need
        # across more of them; retained FTE is bounded by the smaller phase's need.
        if weights.handover > 0:
            for k in range(len(phases) - 1):
                days_curr = phases[k][4]
                days_next = phases[k + 1][4]
                for person_id in days_curr.keys() & days_next.keys():
                    retained = pulp.LpVariable(f"h_{k}_{person_id}", lowBound=0)
                    model += retained <= ALLOCATION_STEP * pulp.lpSum(days_curr[person_id].values())
                    model += retained <= ALLOCATION_STEP * pulp.lpSum(days_next[person_id].values())
                    objective_terms.append(weights.handover * retained)

        quality = pulp.lpSum(objective_terms)
        model += quality - HEADCOUNT_PENALTY * pulp.lpSum(headcount)

        need_fte = [need / STEPS_PER_FTE for need in need_per_phase]
        max_score = round(
            sum(self._max_phase_score(need, weights) for need in need_fte)
            + weights.handover * sum(min(a, b) for a, b in zip(need_fte, need_fte[1:])),
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
                (phase_id, p.id, x[p.id], days[p.id])
                for phase_id, _, candidates, x, days in phases
                for p in candidates
                if x[p.id].value() == 1
            ]
            members = [
                self._member(phase_id, person_id, person_days) for phase_id, person_id, _, person_days in selected
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
                        team=optimum.model_copy(update={"start_date": start}),
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

    def _member(self, phase_id: str | None, person_id: str, days: dict[str, pulp.LpVariable]) -> AssignedMember:
        steps = {skill_id: round(d.value()) for skill_id, d in days.items()}
        return AssignedMember(
            person_id=person_id,
            fte_allocation=sum(steps.values()) / STEPS_PER_FTE,
            skill_allocations=[
                SkillAllocation(skill_id=skill_id, fte=n / STEPS_PER_FTE) for skill_id, n in steps.items() if n > 0
            ],
            phase_id=phase_id,
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

    def _diagnose(self, phases: list, need_per_phase: list[int], weights: AssignmentWeights) -> list[PhaseConflict]:
        # Phases share no hard constraint (handover is only rewarded), so the joint model
        # is infeasible exactly when some phase is infeasible on its own. Each cause is
        # identified by the relaxation that makes that phase solvable again.
        conflicts = []
        for (phase_id, scoped, candidates, _, _), need in zip(phases, need_per_phase):
            if not candidates or self._is_feasible(scoped, candidates, weights, need):
                continue
            candidate_ids = {p.id for p in candidates}
            squad_indices = [
                i for i, squad in enumerate(scoped.squads) if len(set(squad.member_ids) & candidate_ids) > 1
            ]
            forced_ids = [pid for pid in scoped.included_person_ids if pid in candidate_ids]

            causes = []
            if squad_indices and self._is_feasible(scoped.model_copy(update={"squads": []}), candidates, weights, need):
                # Name the squads whose removal alone suffices; if none does, they conflict jointly.
                blocking = [
                    i
                    for i in squad_indices
                    if self._is_feasible(
                        scoped.model_copy(update={"squads": scoped.squads[:i] + scoped.squads[i + 1 :]}),
                        candidates,
                        weights,
                        need,
                    )
                ]
                causes.append((InfeasibilityReason.SQUAD_CONFLICT, blocking or squad_indices, []))
            if forced_ids and self._is_feasible(
                scoped.model_copy(update={"included_person_ids": []}), candidates, weights, need
            ):
                causes.append((InfeasibilityReason.FORCED_MEMBER_CONFLICT, [], forced_ids))
            if not causes and squad_indices and forced_ids:
                relaxed = scoped.model_copy(update={"squads": [], "included_person_ids": []})
                if self._is_feasible(relaxed, candidates, weights, need):
                    causes.append((InfeasibilityReason.SQUAD_AND_FORCED_MEMBER_CONFLICT, squad_indices, forced_ids))
            if not causes:
                causes.append((InfeasibilityReason.FTE_NOT_REACHABLE, [], []))

            conflicts += [
                PhaseConflict(
                    phase_id=phase_id,
                    reason=reason,
                    required_fte=round(sum(req.fte for req in scoped.skill_requirements), 6),
                    need_fte=need / STEPS_PER_FTE,
                    squad_indices=squads,
                    forced_person_ids=forced,
                )
                for reason, squads, forced in causes
            ]
        return conflicts

    def _is_feasible(
        self, project: ProjectInput, candidates: list[PersonInput], weights: AssignmentWeights, need: int
    ) -> bool:
        model = pulp.LpProblem("feasibility", pulp.LpMaximize)
        _, _, terms, _ = self._build_phase(model, "0", project, candidates, weights, need)
        model += pulp.lpSum(terms)
        model.solve(pulp.PULP_CBC_CMD(msg=False))
        return pulp.LpStatus[model.status] == "Optimal"

    def _max_phase_score(self, need: float, weights: AssignmentWeights) -> float:
        """Upper bound on a phase's objective: every per-share factor maxed at 1.0 over
        the whole need, plus all shared FTE (at most need / 2) at the maximum affinity.
        """
        per_share_max = weights.performance + weights.growth + weights.cost + weights.preference
        chemistry_max = weights.chemistry * MAX_AFFINITY * need / 2 if need > 1 else 0.0
        return need * per_share_max + chemistry_max

    def _phase_shadow(self, project: ProjectInput, phase: ProjectPhase) -> ProjectInput:
        return ProjectInput(
            id=project.id,
            skill_requirements=phase.skill_requirements,
            excluded_person_ids=project.excluded_person_ids,
            included_person_ids=project.included_person_ids,
            squads=project.squads,
            date_ranges=[phase.date_range] if phase.date_range else [],
        )

    def _add_allocations(
        self, model: pulp.LpProblem, prefix: str, project: ProjectInput, candidates: list[PersonInput]
    ) -> tuple[DayVars, DayVars]:
        # Returns the integer day counts and, under the same keys, the binaries telling
        # whether the person fills that skill at all, which max_people counts.
        levels = {p.id: {s.id: s.level for s in p.skills} for p in candidates}
        availability = {
            p.id: floor_to_steps(min(effective_availability(p, project, p.assignments), 1.0)) for p in candidates
        }
        days: DayVars = {p.id: {} for p in candidates}
        fills: DayVars = {p.id: {} for p in candidates}
        for j, req in enumerate(project.skill_requirements):
            fte_steps = round(req.fte * STEPS_PER_FTE)
            skill_days = []
            skill_fills = []
            for i, person in enumerate(candidates):
                if levels[person.id].get(req.id, 0.0) < req.min_level:
                    continue
                cap = min(availability[person.id], fte_steps)
                d = pulp.LpVariable(f"d_{prefix}_{i}_{j}", lowBound=0, upBound=cap, cat="Integer")
                y = pulp.LpVariable(f"y_{prefix}_{i}_{j}", cat="Binary")
                model += d >= y
                model += d <= cap * y
                days[person.id][req.id] = d
                fills[person.id][req.id] = y
                skill_days.append(d)
                skill_fills.append(y)
            model += pulp.lpSum(skill_days) <= fte_steps
            model += pulp.lpSum(skill_fills) <= req.max_people
        for person_id, person_days in days.items():
            model += pulp.lpSum(person_days.values()) <= availability[person_id]
        return days, fills

    def _staffable_steps(self, project: ProjectInput, candidates: list[PersonInput]) -> int:
        # The need: each skill's FTE capped by what its qualified people can supply, solved
        # jointly since one person's availability may be claimed by several skills. Squads
        # and forced members are left out so that a need they can't fit surfaces as an
        # infeasibility _diagnose can attribute to them.
        model = pulp.LpProblem("capacity", pulp.LpMaximize)
        days, _ = self._add_allocations(model, "0", project, candidates)
        all_days = [d for person_days in days.values() for d in person_days.values()]
        if not all_days:
            return 0
        model += pulp.lpSum(all_days)
        model.solve(pulp.PULP_CBC_CMD(msg=False))
        return round(sum(d.value() for d in all_days))

    def _build_phase(
        self,
        model: pulp.LpProblem,
        prefix: str,
        project: ProjectInput,
        candidates: list[PersonInput],
        weights: AssignmentWeights,
        need: int,
    ) -> tuple[dict[str, pulp.LpVariable], DayVars, list, list]:
        """Adds one phase's selection variables, constraints, and per-phase objective terms to ``model``.

        Args:
            model: The MILP being assembled.
            prefix: Unique tag disambiguating this phase's variable names.
            project: The (possibly phase-scoped) requirements driving scores and skill needs.
            candidates: Feasible people for this phase.
            weights: Per-objective weights.
            need: Allocation steps the phase must staff in total.

        Returns:
            The per-person selection variables, the per-(person, skill) day counts, the
            objective terms contributed by this phase, and the selection and skill-share
            binaries the headcount tie-break counts.
        """
        scores = compute_skill_scores(project, candidates, weights)
        days, fills = self._add_allocations(model, prefix, project, candidates)
        x = {p.id: pulp.LpVariable(f"x_{prefix}_{p.id}", cat="Binary") for p in candidates}
        # A person is selected exactly when they fill at least one skill, so a forced
        # member who qualifies for none makes the phase infeasible.
        for person_id, person_fills in fills.items():
            model += x[person_id] <= pulp.lpSum(person_fills.values())
            for y in person_fills.values():
                model += y <= x[person_id]
        model += pulp.lpSum(d for person_days in days.values() for d in person_days.values()) == need
        for person_id in project.included_person_ids:
            if person_id in x:
                model += x[person_id] == 1

        # Squads are co-selected by chaining equalities across members feasible in
        # this phase; absent members are simply skipped.
        for squad in project.squads:
            present = [pid for pid in squad.member_ids if pid in x]
            for first, second in zip(present, present[1:]):
                model += x[first] == x[second]

        # Weighted by FTE so the score reflects the capacity delivered, not headcount.
        objective_terms = [
            scores[person_id, skill_id] * ALLOCATION_STEP * d
            for person_id, person_days in days.items()
            for skill_id, d in person_days.items()
        ]

        # Chemistry is pairwise, so it can't be folded into the per-share score.
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
                    if affinity > 0 and need > STEPS_PER_FTE:
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
                    model += pulp.lpSum(pair_vars) <= ALLOCATION_STEP * pulp.lpSum(days[person_id].values())

        headcount = list(x.values()) + [y for person_fills in fills.values() for y in person_fills.values()]
        return x, days, objective_terms, headcount
