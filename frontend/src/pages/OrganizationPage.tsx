import { type FormEvent, useEffect, useState } from "react";
import { Badge, Button, Card, colors, Field, inputStyle } from "@/components/common/ui";
import { organizationsApi } from "@/services/api";
import { useAuthStore } from "@/store/authStore";
import type { OrganizationDetail } from "@/types";

function message(e: unknown): string {
  if (typeof e === "object" && e && "message" in e)
    return String((e as { message: unknown }).message);
  return String(e);
}

export default function OrganizationPage() {
  const {
    user,
    organizations,
    activeOrganizationId,
    createOrganization,
    isLoading,
    error,
    clearError,
  } = useAuthStore();

  const [detail, setDetail] = useState<OrganizationDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [newOrgName, setNewOrgName] = useState("");
  const [creating, setCreating] = useState(false);

  const [memberEmail, setMemberEmail] = useState("");
  const [addingMember, setAddingMember] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);

  const activeMembership = organizations.find((o) => o.id === activeOrganizationId);
  const isOwner = activeMembership?.role === "owner";

  useEffect(() => {
    if (!activeOrganizationId) {
      setDetail(null);
      return;
    }
    setDetailError(null);
    organizationsApi
      .get(activeOrganizationId)
      .then(setDetail)
      .catch((e) => setDetailError(message(e)));
  }, [activeOrganizationId]);

  const submitCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await createOrganization(newOrgName);
      setNewOrgName("");
    } catch {
      // error is surfaced from the store below
    } finally {
      setCreating(false);
    }
  };

  const submitAddMember = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeOrganizationId) return;
    setAddingMember(true);
    setMemberError(null);
    try {
      const member = await organizationsApi.addMember(activeOrganizationId, memberEmail);
      setDetail((d) => (d ? { ...d, members: [...d.members, member] } : d));
      setMemberEmail("");
    } catch (e) {
      setMemberError(message(e));
    } finally {
      setAddingMember(false);
    }
  };

  const removeMember = async (userId: string, email: string) => {
    if (!activeOrganizationId) return;
    if (!confirm(`Remove ${email} from this organization?`)) return;
    try {
      await organizationsApi.removeMember(activeOrganizationId, userId);
      setDetail((d) => (d ? { ...d, members: d.members.filter((m) => m.user_id !== userId) } : d));
    } catch (e) {
      setMemberError(message(e));
    }
  };

  return (
    <div>
      <h1 style={{ margin: "0 0 1.5rem" }}>Organization</h1>

      {organizations.length === 0 && (
        <Card style={{ maxWidth: 480, marginBottom: "1.5rem" }}>
          <p style={{ margin: 0, color: colors.muted, fontSize: "0.85rem" }}>
            You don't belong to an organization yet. Create one below to start adding people and
            projects.
          </p>
        </Card>
      )}

      <Card style={{ maxWidth: 480, marginBottom: "1.5rem" }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "1rem" }}>Create an organization</h2>
        <form onSubmit={submitCreate}>
          <Field label="Name">
            <input
              type="text"
              required
              value={newOrgName}
              onChange={(e) => {
                setNewOrgName(e.target.value);
                clearError();
              }}
              style={inputStyle}
            />
          </Field>
          {error && (
            <p style={{ margin: "0 0 0.85rem", color: colors.danger, fontSize: "0.8rem" }}>
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={creating || isLoading}>
            {creating ? "Creating…" : "Create organization"}
          </Button>
        </form>
      </Card>

      {activeOrganizationId && (
        <Card style={{ maxWidth: 480 }}>
          <h2 style={{ margin: "0 0 1rem", fontSize: "1rem" }}>
            Members — {activeMembership?.name}
          </h2>
          {detailError && (
            <p style={{ margin: "0 0 0.85rem", color: colors.danger, fontSize: "0.8rem" }}>
              {detailError}
            </p>
          )}
          <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1rem" }}>
            {detail?.members.map((m) => (
              <li
                key={m.user_id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.4rem 0",
                  borderBottom: `1px solid ${colors.border}`,
                }}
              >
                <span>{m.email}</span>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <Badge color={m.role === "owner" ? colors.primary : colors.muted}>{m.role}</Badge>
                  {isOwner && m.user_id !== user?.id && (
                    <Button
                      variant="ghost"
                      onClick={() => removeMember(m.user_id, m.email)}
                      ariaLabel={`Remove ${m.email}`}
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {isOwner && (
            <form onSubmit={submitAddMember}>
              <Field label="Add member by email">
                <input
                  type="email"
                  required
                  value={memberEmail}
                  onChange={(e) => {
                    setMemberEmail(e.target.value);
                    setMemberError(null);
                  }}
                  style={inputStyle}
                />
              </Field>
              {memberError && (
                <p style={{ margin: "0 0 0.85rem", color: colors.danger, fontSize: "0.8rem" }}>
                  {memberError}
                </p>
              )}
              <Button type="submit" variant="primary" disabled={addingMember}>
                {addingMember ? "Adding…" : "Add member"}
              </Button>
            </form>
          )}
        </Card>
      )}
    </div>
  );
}
