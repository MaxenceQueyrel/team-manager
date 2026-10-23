import { Plus, UserMinus } from "lucide-react";
import { type CSSProperties, type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Avatar,
  Button,
  Card,
  colors,
  Field,
  IconButton,
  inputStyle,
  Modal,
  PageHeader,
  Pill,
  selectStyle,
} from "@/components/common/ui";
import { errorMessage, organizationsApi } from "@/services/api";
import { useAppStore } from "@/store";
import { useAuthStore } from "@/store/authStore";
import type { OrganizationDetail, OrganizationMembership, OrganizationRole } from "@/types";

const roleLabels: Record<OrganizationRole, string> = { owner: "Owner", contributor: "Member" };

const errorStyle: CSSProperties = {
  margin: "0.5rem 0 0",
  color: colors.danger,
  fontSize: "0.8rem",
};

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function SettingsSection({
  title,
  description,
  danger,
  children,
}: {
  title: string;
  description: ReactNode;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <Card
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: danger ? "center" : "flex-start",
        gap: "1.25rem 2.5rem",
        padding: "1.5rem 1.75rem",
        marginBottom: "1.5rem",
        ...(danger && { borderColor: colors.danger }),
      }}
    >
      <div style={{ flex: "1 1 240px" }}>
        <h2 style={{ margin: "0 0 0.4rem", ...(danger && { color: colors.danger }) }}>{title}</h2>
        <p style={{ margin: 0, color: colors.muted, fontSize: "0.9rem", lineHeight: 1.55 }}>
          {description}
        </p>
      </div>
      <div
        style={{
          flex: danger ? "0 0 auto" : "1.6 1 340px",
          minWidth: 0,
          ...(danger && { marginLeft: "auto" }),
        }}
      >
        {children}
      </div>
    </Card>
  );
}

function CreateOrganizationModal({ onClose }: { onClose: () => void }) {
  const createOrganization = useAuthStore((s) => s.createOrganization);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      await createOrganization(trimmed);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <Modal
      title="New organization"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={saving || !trimmed} onClick={submit}>
            {saving ? "Creating…" : "Create organization"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit}>
        <Field label="Name" style={{ marginBottom: 0 }}>
          <input
            type="text"
            // biome-ignore lint/a11y/noAutofocus: the modal opens for the sole purpose of typing this name
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            style={inputStyle}
          />
        </Field>
      </form>
      {error && <p style={errorStyle}>{error}</p>}
    </Modal>
  );
}

function GeneralSection({
  organization,
  isOwner,
}: {
  organization: OrganizationMembership;
  isOwner: boolean;
}) {
  const renameOrganization = useAuthStore((s) => s.renameOrganization);
  const [name, setName] = useState(organization.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      await renameOrganization(organization.id, trimmed);
      setName(trimmed);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsSection
      title="General"
      description="Shown in the organization switcher and to everyone you invite."
    >
      <form onSubmit={submit}>
        <Field label="Organization name" style={{ marginBottom: 0 }}>
          <input
            type="text"
            value={name}
            disabled={!isOwner}
            aria-invalid={!trimmed}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            style={inputStyle}
          />
        </Field>
        {!trimmed && <p style={errorStyle}>The organization name can't be empty.</p>}
        {error && <p style={errorStyle}>{error}</p>}
        {isOwner && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
            <Button type="submit" disabled={saving || !trimmed || trimmed === organization.name}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        )}
      </form>
    </SettingsSection>
  );
}

function MembersSection({
  organization,
  isOwner,
}: {
  organization: OrganizationMembership;
  isOwner: boolean;
}) {
  const user = useAuthStore((s) => s.user);
  const addOrganizationMember = useAuthStore((s) => s.addOrganizationMember);
  const removeOrganizationMember = useAuthStore((s) => s.removeOrganizationMember);
  const [detail, setDetail] = useState<OrganizationDetail | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrganizationRole>("contributor");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  useEffect(() => {
    organizationsApi
      .get(organization.id)
      .then(setDetail)
      .catch((e) => setListError(errorMessage(e)));
  }, [organization.id]);

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setInviteError(null);
    try {
      const member = await addOrganizationMember(organization.id, email.trim(), role);
      setDetail((d) => (d ? { ...d, members: [...d.members, member] } : d));
      setEmail("");
    } catch (e) {
      setInviteError(errorMessage(e));
    } finally {
      setInviting(false);
    }
  };

  const remove = async (userId: string, memberEmail: string) => {
    if (!confirm(`Remove ${memberEmail} from ${organization.name}?`)) return;
    setListError(null);
    try {
      await removeOrganizationMember(organization.id, userId);
      setDetail((d) => (d ? { ...d, members: d.members.filter((m) => m.user_id !== userId) } : d));
    } catch (e) {
      setListError(errorMessage(e));
    }
  };

  return (
    <SettingsSection
      title="Members"
      description="People who can sign in and manage this organization's team and projects."
    >
      {isOwner && (
        <form onSubmit={invite} style={{ marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "0.6rem" }}>
            <Field label="Invite by email" style={{ flex: "1 1 220px", marginBottom: 0 }}>
              <input
                type="email"
                required
                placeholder="name@company.com"
                value={email}
                aria-invalid={inviteError !== null}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setInviteError(null);
                }}
                style={inputStyle}
              />
            </Field>
            <Field label="Role" style={{ flex: "0 0 130px", marginBottom: 0 }}>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as OrganizationRole)}
                style={selectStyle}
              >
                <option value="contributor">{roleLabels.contributor}</option>
                <option value="owner">{roleLabels.owner}</option>
              </select>
            </Field>
            <Button type="submit" variant="primary" disabled={inviting || !email.trim()}>
              {inviting ? "Sending…" : "Send invite"}
            </Button>
          </div>
          {inviteError && <p style={errorStyle}>{inviteError}</p>}
        </form>
      )}

      {listError && <p style={{ ...errorStyle, margin: "0 0 0.75rem" }}>{listError}</p>}
      {detail && (
        <ul
          aria-label="Members"
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            border: `1px solid ${colors.border}`,
            borderRadius: "var(--radius-lg)",
          }}
        >
          {detail.members.map((m, i) => {
            const isYou = m.user_id === user?.id;
            return (
              <li
                key={m.user_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "0.7rem 1rem",
                  borderTop: i === 0 ? undefined : `1px solid ${colors.border}`,
                }}
              >
                <Avatar name={m.email} tone={isYou ? "dark" : "tint"} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {m.email}
                  </div>
                  {isYou && <div style={{ fontSize: "0.8rem", color: colors.muted }}>You</div>}
                </div>
                <Pill tone={m.role === "owner" ? "primary" : "neutral"}>{roleLabels[m.role]}</Pill>
                {isOwner && !isYou && (
                  <IconButton
                    icon={UserMinus}
                    size="sm"
                    ariaLabel={`Remove ${m.email}`}
                    onClick={() => remove(m.user_id, m.email)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SettingsSection>
  );
}

function DeleteOrganizationModal({
  organization,
  impact,
  onClose,
  onDeleted,
}: {
  organization: OrganizationMembership;
  impact: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const deleteOrganization = useAuthStore((s) => s.deleteOrganization);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = confirmation === organization.name;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteOrganization(organization.id);
      onDeleted();
    } catch (e) {
      setError(errorMessage(e));
      setDeleting(false);
    }
  };

  return (
    <Modal
      title={`Delete ${organization.name}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" disabled={deleting || !confirmed} onClick={submit}>
            {deleting ? "Deleting…" : "Delete organization"}
          </Button>
        </>
      }
    >
      <p style={{ margin: "0 0 1rem", lineHeight: 1.55 }}>
        This permanently deletes <strong>{organization.name}</strong> with its {impact}. Members
        lose access immediately. This can't be undone.
      </p>
      <form onSubmit={submit}>
        <Field label={`Type ${organization.name} to confirm`} style={{ marginBottom: 0 }}>
          <input
            type="text"
            // biome-ignore lint/a11y/noAutofocus: typing the name is the only action in this dialog
            autoFocus
            autoComplete="off"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            style={inputStyle}
          />
        </Field>
      </form>
      {error && <p style={errorStyle}>{error}</p>}
    </Modal>
  );
}

function DangerZone({
  organization,
  onDeleted,
}: {
  organization: OrganizationMembership;
  onDeleted: () => void;
}) {
  const peopleCount = useAppStore((s) => s.people.length);
  const projectCount = useAppStore((s) => s.projects.length);
  const teamCount = useAppStore((s) => s.teams.length);
  const fetchTeams = useAppStore((s) => s.fetchTeams);
  const [confirming, setConfirming] = useState(false);

  // People and projects are already loaded by the layout for the nav counts; proposals are not.
  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const impact = `${plural(peopleCount, "person", "people")}, ${plural(projectCount, "project", "projects")} and ${plural(teamCount, "proposal", "proposals")}`;

  return (
    <SettingsSection
      danger
      title="Delete organization"
      description={
        <>
          Removes all {impact}.
          <br />
          This can't be undone.
        </>
      }
    >
      <Button variant="danger" onClick={() => setConfirming(true)}>
        Delete {organization.name}…
      </Button>
      {confirming && (
        <DeleteOrganizationModal
          organization={organization}
          impact={impact}
          onClose={() => setConfirming(false)}
          onDeleted={onDeleted}
        />
      )}
    </SettingsSection>
  );
}

export default function OrganizationPage() {
  const organizations = useAuthStore((s) => s.organizations);
  const activeOrganizationId = useAuthStore((s) => s.activeOrganizationId);
  const location = useLocation();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  // The switcher's "New organization" item routes here with this flag to open the modal.
  useEffect(() => {
    if ((location.state as { newOrganization?: boolean } | null)?.newOrganization) {
      setCreating(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location, navigate]);

  const organization = organizations.find((o) => o.id === activeOrganizationId);
  const createModal = creating && <CreateOrganizationModal onClose={() => setCreating(false)} />;

  if (!organization) {
    return (
      <div style={{ maxWidth: 560, margin: "4rem auto 0", textAlign: "center" }}>
        <Card style={{ padding: "2.5rem 2rem" }}>
          <h1 style={{ margin: "0 0 0.6rem", fontSize: "1.6rem" }}>Organization</h1>
          <p style={{ margin: "0 0 1.5rem", color: colors.muted, lineHeight: 1.55 }}>
            You don't belong to an organization yet. Create one to start adding people and projects,
            or ask an owner to invite you.
          </p>
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            New organization
          </Button>
        </Card>
        {createModal}
      </div>
    );
  }

  const isOwner = organization.role === "owner";

  return (
    <div style={{ maxWidth: 1060 }}>
      <PageHeader
        leading={<Avatar name={organization.name} tone="solid" shape="square" size="lg" />}
        title={organization.name}
        subtitle={`Organization settings · you're ${isOwner ? "the owner" : "a contributor"}`}
        actions={
          <Button icon={Plus} onClick={() => setCreating(true)}>
            New organization
          </Button>
        }
      />
      <GeneralSection
        key={`general-${organization.id}`}
        organization={organization}
        isOwner={isOwner}
      />
      <MembersSection
        key={`members-${organization.id}`}
        organization={organization}
        isOwner={isOwner}
      />
      {isOwner && (
        <DangerZone
          key={`danger-${organization.id}`}
          organization={organization}
          onDeleted={() => {
            // The store has already moved to another membership; with none left this page
            // renders the empty state, otherwise land on that organization's dashboard.
            if (useAuthStore.getState().activeOrganizationId) navigate("/");
          }}
        />
      )}
      {createModal}
    </div>
  );
}
