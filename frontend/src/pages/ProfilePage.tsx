import { type FormEvent, type ReactNode, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge, Button, Card, colors, Field, inputStyle } from "@/components/common/ui";
import { useAuthStore } from "@/store/authStore";

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: "0.85rem" }}>
      <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

export default function ProfilePage() {
  const { user, isLoading, error, clearError, updatePassword, deleteAccount } = useAuthStore();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);

  if (!user) return null;

  const isManager = user.roles.includes("manager");
  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const submitPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (mismatch) return;
    try {
      await updatePassword(password);
      setPassword("");
      setConfirmPassword("");
      setPasswordSaved(true);
    } catch {
      // error is surfaced from the store below
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete your account? This can't be undone.")) return;
    try {
      await deleteAccount();
      navigate("/login", { replace: true });
    } catch {
      // error is surfaced from the store below
    }
  };

  return (
    <div>
      <h1 style={{ margin: "0 0 1.5rem" }}>Profile</h1>

      <Card style={{ maxWidth: 480, marginBottom: "1.5rem" }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "1rem" }}>Account information</h2>
        <InfoRow label="Email">{user.email}</InfoRow>
        <InfoRow label="Roles">
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {user.roles.length > 0 ? (
              user.roles.map((role) => <Badge key={role}>{role}</Badge>)
            ) : (
              <span style={{ color: colors.muted }}>—</span>
            )}
          </div>
        </InfoRow>
        <InfoRow label="Manager status">{isManager ? "Manager" : "Not a manager"}</InfoRow>
      </Card>

      <Card style={{ maxWidth: 480, marginBottom: "1.5rem" }}>
        <h2 style={{ margin: "0 0 1rem", fontSize: "1rem" }}>Change password</h2>
        <form onSubmit={submitPassword}>
          <Field label="New password" hint="At least 8 characters.">
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setPasswordSaved(false);
                clearError();
              }}
              style={inputStyle}
            />
          </Field>
          <Field label="Confirm new password">
            <input
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setPasswordSaved(false);
              }}
              style={inputStyle}
            />
          </Field>
          {mismatch && (
            <p style={{ margin: "0 0 0.85rem", color: colors.danger, fontSize: "0.8rem" }}>
              Passwords don't match.
            </p>
          )}
          {error && (
            <p style={{ margin: "0 0 0.85rem", color: colors.danger, fontSize: "0.8rem" }}>
              {error}
            </p>
          )}
          {passwordSaved && (
            <p style={{ margin: "0 0 0.85rem", color: colors.success, fontSize: "0.8rem" }}>
              Password updated.
            </p>
          )}
          <Button type="submit" variant="primary" disabled={isLoading || mismatch}>
            {isLoading ? "Saving…" : "Update password"}
          </Button>
        </form>
      </Card>

      <Card style={{ maxWidth: 480, borderColor: colors.danger }}>
        <h2 style={{ margin: "0 0 0.5rem", fontSize: "1rem" }}>Danger zone</h2>
        <p style={{ margin: "0 0 1rem", color: colors.muted, fontSize: "0.85rem" }}>
          Deleting your account permanently removes your login. This can't be undone.
        </p>
        <Button variant="danger" onClick={handleDelete} disabled={isLoading}>
          Delete account
        </Button>
      </Card>
    </div>
  );
}
