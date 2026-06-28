import type { CSSProperties, ReactNode } from "react";

export const colors = {
  border: "#e9ecef",
  borderStrong: "#ced4da",
  muted: "#6c757d",
  text: "#1a1a1a",
  primary: "#4f6ef7",
  primaryBg: "#eef0fd",
  danger: "#dc3545",
  dangerBg: "#fdeaea",
  success: "#198754",
  light: "#f8f9fa",
} as const;

export const inputStyle: CSSProperties = {
  padding: "0.45rem 0.6rem",
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: 6,
  fontSize: "0.875rem",
  width: "100%",
  fontFamily: "inherit",
  background: "#fff",
  color: colors.text,
};

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const buttonVariants: Record<ButtonVariant, CSSProperties> = {
  primary: { background: colors.primary, color: "#fff", border: `1px solid ${colors.primary}` },
  secondary: { background: "#fff", color: colors.text, border: `1px solid ${colors.borderStrong}` },
  danger: { background: "#fff", color: colors.danger, border: `1px solid ${colors.danger}` },
  ghost: { background: "transparent", color: colors.muted, border: "1px solid transparent" },
};

export function Button({
  children,
  variant = "secondary",
  onClick,
  disabled,
  type = "button",
  style,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  style?: CSSProperties;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "0.45rem 0.9rem",
        borderRadius: 6,
        fontSize: "0.875rem",
        fontWeight: 500,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        ...buttonVariants[variant],
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
  style,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <label style={{ display: "block", marginBottom: "0.85rem", ...style }}>
      <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {hint && <div style={{ fontSize: "0.75rem", color: colors.muted, marginBottom: 4 }}>{hint}</div>}
      {children}
    </label>
  );
}

export function Badge({ children, color = colors.muted }: { children: ReactNode; color?: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: "0.72rem",
        padding: "0.15rem 0.5rem",
        borderRadius: 12,
        background: color,
        color: "#fff",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        padding: "1rem",
        background: "#fff",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "3rem 1rem",
        overflow: "auto",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 10,
          width: "100%",
          maxWidth: 680,
          boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1rem 1.25rem",
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{title}</h2>
          <button
            onClick={onClose}
            style={{ border: "none", background: "none", fontSize: "1.4rem", cursor: "pointer", lineHeight: 1, color: colors.muted }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div style={{ padding: "1.25rem", maxHeight: "65vh", overflow: "auto" }}>{children}</div>
        {footer && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "0.6rem",
              padding: "1rem 1.25rem",
              borderTop: `1px solid ${colors.border}`,
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export const priorityColors: Record<string, string> = {
  low: "#6c757d",
  medium: "#0d6efd",
  high: "#fd7e14",
  critical: "#dc3545",
};

export const seniorityColors: Record<string, string> = {
  junior: "#20c997",
  mid: "#0d6efd",
  senior: "#6f42c1",
  lead: "#d63384",
};
