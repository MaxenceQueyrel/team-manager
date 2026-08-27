import { type FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button, Card, colors, Field, inputStyle } from "@/components/common/ui";
import { useAuthStore } from "@/store/authStore";

export default function LoginPage() {
  const { login, isLoading, error, clearError } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const from = (location.state as { from?: string } | null)?.from ?? "/";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch {
      // error is surfaced from the store below
    }
  };

  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "4rem 1rem" }}>
      <Card style={{ width: "100%", maxWidth: 360 }}>
        <h1 style={{ margin: "0 0 1.25rem", fontSize: "1.25rem" }}>Sign in</h1>
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
          <Field label="Password">
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
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
          <Button type="submit" variant="primary" disabled={isLoading} style={{ width: "100%" }}>
            {isLoading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
        <p style={{ margin: "1rem 0 0", fontSize: "0.8rem", color: colors.muted }}>
          No account? <Link to="/register">Register</Link>
        </p>
      </Card>
    </div>
  );
}
