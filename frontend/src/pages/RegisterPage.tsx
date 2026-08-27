import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Card, colors, Field, inputStyle } from "@/components/common/ui";
import { useAuthStore } from "@/store/authStore";

export default function RegisterPage() {
  const { register, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const mismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (mismatch) return;
    try {
      await register(email, password);
      navigate("/", { replace: true });
    } catch {
      // error is surfaced from the store below
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "4rem 1rem" }}>
      <Card style={{ width: "100%", maxWidth: 360 }}>
        <h1 style={{ margin: "0 0 1.25rem", fontSize: "1.25rem" }}>Create an account</h1>
        <form onSubmit={submit}>
          <Field label="Email">
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearError();
              }}
              style={inputStyle}
            />
          </Field>
          <Field label="Password" hint="At least 8 characters.">
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearError();
              }}
              style={inputStyle}
            />
          </Field>
          <Field label="Confirm password">
            <input
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
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
          <Button type="submit" variant="primary" disabled={isLoading} style={{ width: "100%" }}>
            {isLoading ? "Creating account…" : "Create account"}
          </Button>
        </form>
        <p style={{ margin: "1rem 0 0", fontSize: "0.8rem", color: colors.muted }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </Card>
    </div>
  );
}
