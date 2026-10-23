import { Check, Trash2, X } from "lucide-react";
import { useId, useState } from "react";
import { TeamMembers } from "@/components/common/TeamMembers";
import { Button, Card, colors, IconButton, Modal } from "@/components/common/ui";
import { CoverageBreakdown } from "@/components/projects/CoverageBreakdown";
import { errorMessage } from "@/services/api";
import type { AssignedMember, Person, PhaseCoverage } from "@/types";

function replacedScope(members: AssignedMember[]): string {
  const phaseIds = [...new Set(members.map((m) => m.phase_id))];
  if (phaseIds.length === 1 && phaseIds[0] === null) return "the whole project";
  const names = phaseIds.map((id) => id ?? "unphased");
  return `${names.length === 1 ? "phase" : "phases"} ${names.join(", ")}`;
}

/** A team proposal diffed against current staffing, with its requirement coverage and an
 * "Apply to project" action. `onClose` adds a close button (a proposal opened for review). */
export function ProposalCard({
  title,
  members,
  score,
  maxScore,
  scoreNote,
  coverage,
  fullyCovered,
  people,
  baseline,
  onApply,
  onDelete,
  onClose,
}: {
  title: string;
  members: AssignedMember[];
  score: number | null | undefined;
  maxScore: number | null | undefined;
  scoreNote?: string;
  coverage: PhaseCoverage[];
  fullyCovered: boolean | null;
  people: Person[];
  baseline: AssignedMember[];
  onApply: () => Promise<void>;
  onDelete?: () => void;
  onClose?: () => void;
}) {
  const headingId = useId();
  const [confirming, setConfirming] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeDialog = () => {
    setConfirming(false);
    setError(null);
  };

  const apply = async () => {
    setApplying(true);
    setError(null);
    try {
      await onApply();
      setConfirming(false);
    } catch (e) {
      // The FTE conflict lists people by id, which are opaque UUIDs to the user.
      let text = errorMessage(e);
      for (const person of people) text = text.split(person.id).join(person.name);
      setError(text);
    } finally {
      setApplying(false);
    }
  };

  return (
    <section aria-labelledby={headingId}>
      <Card>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "0.75rem",
          }}
        >
          <h3 id={headingId} style={{ margin: 0 }}>
            {title}
          </h3>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            <Button
              variant="primary"
              size="sm"
              icon={Check}
              onClick={() => setConfirming(true)}
              disabled={members.length === 0}
            >
              Apply to project
            </Button>
            {onDelete && (
              <Button variant="danger" size="sm" icon={Trash2} onClick={onDelete}>
                Delete
              </Button>
            )}
            {onClose && (
              <IconButton icon={X} size="sm" ariaLabel={`Close ${title}`} onClick={onClose} />
            )}
          </div>
        </div>
        <p style={{ margin: "0.4rem 0 0.75rem", fontSize: "0.875rem", color: colors.muted }}>
          Optimization score:{" "}
          <strong className="mono" style={{ color: colors.text }}>
            {score != null && maxScore != null ? `${score.toFixed(2)}/${maxScore.toFixed(2)}` : "—"}
          </strong>
          {scoreNote && <span style={{ color: colors.muted }}> · {scoreNote}</span>}
        </p>
        <CoverageBreakdown coverage={coverage} fullyCovered={fullyCovered} />
        {members.length === 0 ? (
          <p style={{ color: colors.muted, margin: 0 }}>
            No feasible assignment found for these constraints.
          </p>
        ) : (
          <TeamMembers members={members} people={people} baseline={baseline} />
        )}
      </Card>

      {confirming && (
        <Modal
          title={`Apply ${title.toLowerCase()}?`}
          onClose={closeDialog}
          footer={
            <>
              <Button onClick={closeDialog}>Cancel</Button>
              <Button variant="primary" onClick={apply} disabled={applying}>
                {applying ? "Applying…" : "Apply"}
              </Button>
            </>
          }
        >
          <p style={{ marginTop: 0 }}>
            This replaces current staffing for {replacedScope(members)}.
          </p>
          {error && (
            <p role="alert" style={{ color: colors.danger, marginBottom: 0 }}>
              {error}
            </p>
          )}
        </Modal>
      )}
    </section>
  );
}
