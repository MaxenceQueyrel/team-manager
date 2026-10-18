from enum import StrEnum

from pydantic import BaseModel, Field


class InfeasibilityReason(StrEnum):
    """Why a phase admits no feasible team, judged by which relaxation would make it solvable.

    Attributes:
        SQUAD_CONFLICT: Dropping the listed squads makes the phase solvable; their
            all-or-nothing selection can't be fitted to the phase's FTE need.
        FORCED_MEMBER_CONFLICT: Un-forcing the listed included members makes the phase solvable.
        SQUAD_AND_FORCED_MEMBER_CONFLICT: Only dropping the listed squads and un-forcing the
            listed members together makes the phase solvable.
        FTE_NOT_REACHABLE: Even without squads or forced members, no combination of the pool's
            allocations adds up to the FTE need (e.g. everyone is available below the minimum share).
    """

    SQUAD_CONFLICT = "squad_conflict"
    FORCED_MEMBER_CONFLICT = "forced_member_conflict"
    SQUAD_AND_FORCED_MEMBER_CONFLICT = "squad_and_forced_member_conflict"
    FTE_NOT_REACHABLE = "fte_not_reachable"


class PhaseConflict(BaseModel):
    phase_id: str | None = Field(description="Identifier of the phase, or None for a project without phases.")
    reason: InfeasibilityReason = Field(description="Which constraints make the phase unsolvable.")
    required_fte: float = Field(description="FTE the phase (or project) asks to staff, i.e. its n_slots.")
    need_fte: float = Field(
        description="FTE the solver had to staff exactly, after capping by pool capacity and fitting forced members."
    )
    squad_indices: list[int] = Field(
        default=[], description="Positions in ProjectInput.squads of the squads involved in the conflict."
    )
    forced_person_ids: list[str] = Field(
        default=[], description="Members of ProjectInput.included_person_ids involved in the conflict."
    )
