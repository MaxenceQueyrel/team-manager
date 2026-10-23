import {
  ChevronDown,
  Ellipsis,
  type LucideIcon,
  Search,
  Signal,
  SignalHigh,
  SignalLow,
  SignalMedium,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, NavLink } from "react-router-dom";
import type { Priority, Seniority } from "@/types";

/** Design tokens as CSS `var()` references; the values live in `index.css`. */
export const colors = {
  canvas: "var(--color-canvas)",
  sidebar: "var(--color-sidebar)",
  surface: "var(--color-surface)",
  light: "var(--color-surface-muted)",
  border: "var(--color-border)",
  borderStrong: "var(--color-border-strong)",
  text: "var(--color-text)",
  muted: "var(--color-muted)",
  subtle: "var(--color-subtle)",
  track: "var(--color-track)",
  neutralBg: "var(--color-neutral-tint)",
  primary: "var(--color-primary)",
  primarySoft: "var(--color-primary-soft)",
  primaryBg: "var(--color-primary-tint)",
  success: "var(--color-success)",
  successBg: "var(--color-success-tint)",
  warning: "var(--color-warning)",
  warningText: "var(--color-warning-text)",
  warningBg: "var(--color-warning-tint)",
  danger: "var(--color-danger)",
  dangerBg: "var(--color-danger-tint)",
} as const;

export const fonts = {
  display: "var(--font-display)",
  sans: "var(--font-sans)",
  mono: "var(--font-mono)",
} as const;

export const inputStyle: CSSProperties = {
  padding: "0.55rem 0.75rem",
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: "var(--radius)",
  fontSize: "0.9rem",
  width: "100%",
  fontFamily: "inherit",
  background: colors.surface,
  color: colors.text,
};

/** Styling for native `<select>`: the browser chevron is replaced by an inline SVG
 * so the control matches `inputStyle` across browsers. */
export const selectStyle: CSSProperties = {
  ...inputStyle,
  appearance: "none",
  paddingRight: "2rem",
  cursor: "pointer",
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8' fill='none' stroke='%236b6b6b' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M1 1.5 6 6.5 11 1.5'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 0.75rem center",
  backgroundSize: "0.7rem",
};

/** A floating panel anchored below its (relatively positioned) trigger. */
export const popoverStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 6px)",
  zIndex: 20,
  minWidth: 220,
  padding: "0.3rem",
  background: colors.surface,
  border: `1px solid ${colors.border}`,
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-pop)",
};

/** Closes a popover on a pointer press outside `ref` or on Escape while it is open. */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onDismiss();
    };
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && onDismiss();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [ref, open, onDismiss]);
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md";

export function Button({
  children,
  variant = "secondary",
  size = "md",
  icon: Icon,
  onClick,
  disabled,
  type = "button",
  style,
  ariaLabel,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  style?: CSSProperties;
  ariaLabel?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`btn btn-${variant} btn-${size}`}
      style={style}
    >
      {Icon && <Icon size={size === "sm" ? 14 : 16} aria-hidden />}
      {children}
    </button>
  );
}

/** A square, icon-only button (`⋯`, `×`, log-out); `ariaLabel` is its accessible name. */
export function IconButton({
  icon: Icon,
  ariaLabel,
  onClick,
  variant = "ghost",
  size = "md",
  disabled,
  style,
}: {
  icon: LucideIcon;
  ariaLabel: string;
  onClick?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={`btn btn-${variant} btn-${size} btn-icon`}
      style={style}
    >
      <Icon size={size === "sm" ? 16 : 18} aria-hidden />
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
    // biome-ignore lint/a11y/noLabelWithoutControl: generic layout wrapper — callers always pass a form control as children
    <label style={{ display: "block", marginBottom: "0.85rem", ...style }}>
      <div style={{ fontSize: "0.82rem", fontWeight: 600, marginBottom: 5 }}>{label}</div>
      {hint && (
        <div style={{ fontSize: "0.78rem", color: colors.muted, marginBottom: 5 }}>{hint}</div>
      )}
      {children}
    </label>
  );
}

export type PillTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "primary"
  | "dark"
  | "outline";

const pillTones: Record<PillTone, { background: string; color: string; dot: string }> = {
  neutral: { background: colors.neutralBg, color: colors.text, dot: colors.muted },
  success: { background: colors.successBg, color: colors.success, dot: colors.success },
  warning: { background: colors.warningBg, color: colors.warningText, dot: colors.warning },
  danger: { background: colors.dangerBg, color: colors.danger, dot: colors.danger },
  primary: { background: colors.primaryBg, color: colors.primary, dot: colors.primary },
  dark: { background: colors.text, color: colors.surface, dot: colors.surface },
  outline: { background: colors.surface, color: colors.text, dot: colors.muted },
};

/** A small status/label chip: status ("Ended"), priority, seniority, commitment, skills. */
export function Pill({
  children,
  tone = "neutral",
  dot,
  icon: Icon,
  style,
}: {
  children: ReactNode;
  tone?: PillTone;
  dot?: boolean;
  icon?: LucideIcon;
  style?: CSSProperties;
}) {
  const { background, color, dot: dotColor } = pillTones[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        fontSize: "0.78rem",
        fontWeight: 500,
        lineHeight: 1.3,
        padding: "0.18rem 0.6rem",
        borderRadius: 999,
        background,
        color,
        border: `1px solid ${tone === "outline" ? colors.borderStrong : "transparent"}`,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {dot && (
        <span
          aria-hidden
          style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor }}
        />
      )}
      {Icon && <Icon size={13} aria-hidden />}
      {children}
    </span>
  );
}

export const priorityTones: Record<Priority, PillTone> = {
  low: "neutral",
  medium: "primary",
  high: "warning",
  critical: "danger",
};

export const priorityIcons: Record<Priority, LucideIcon> = {
  low: SignalLow,
  medium: SignalMedium,
  high: SignalHigh,
  critical: Signal,
};

export const seniorityTones: Record<Seniority, PillTone> = {
  junior: "outline",
  mid: "neutral",
  senior: "dark",
  lead: "primary",
};

// Pastel background with a matching ink, picked per name so a person keeps one tint everywhere.
const avatarPalette = [
  { background: "#e6e8fb", color: "#3b4bdb" },
  { background: "#fbe6d9", color: "#b05f14" },
  { background: "#dff0e6", color: "#2e8b5e" },
  { background: "#efe3f7", color: "#7a3fa0" },
  { background: "#dcecf6", color: "#2a6f97" },
  { background: "#f6ecd0", color: "#8a6a1f" },
  { background: "#fbe1dc", color: "#d4472f" },
];

function avatarColors(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return avatarPalette[hash % avatarPalette.length];
}

/** Up to two uppercase initials; an email uses its local part ("ada.lovelace@x.io" → "AL"). */
export function initials(name: string): string {
  const words = name
    .split("@")[0]
    .split(/[\s._-]+/)
    .filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

export type AvatarSize = "sm" | "md" | "lg";

const avatarSizes: Record<AvatarSize, { box: number; font: string }> = {
  sm: { box: 24, font: "0.62rem" },
  md: { box: 36, font: "0.8rem" },
  lg: { box: 72, font: "1.6rem" },
};

/** Initials on a tint derived from `name`. `solid` fills with the strong color (org tiles),
 * `dark` is the near-black used for the signed-in user. Decorative: pair it with the name. */
export function Avatar({
  name,
  size = "md",
  tone = "tint",
  shape = "circle",
  style,
}: {
  name: string;
  size?: AvatarSize;
  tone?: "tint" | "solid" | "dark";
  shape?: "circle" | "square";
  style?: CSSProperties;
}) {
  const palette = avatarColors(name);
  const { box, font } = avatarSizes[size];
  const fill = {
    tint: palette,
    solid: { background: palette.color, color: "#fff" },
    dark: { background: colors.text, color: colors.surface },
  }[tone];
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        width: box,
        height: box,
        borderRadius: shape === "circle" ? "50%" : Math.round(box * 0.24),
        fontSize: font,
        fontWeight: 600,
        letterSpacing: "0.02em",
        ...fill,
        ...style,
      }}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({
  names,
  max = 4,
  size = "sm",
}: {
  names: string[];
  max?: number;
  size?: AvatarSize;
}) {
  const ring = { boxShadow: `0 0 0 2px ${colors.surface}` };
  const hidden = names.length - max;
  return (
    <span aria-hidden style={{ display: "inline-flex", alignItems: "center" }}>
      {names.slice(0, max).map((name, i) => (
        <Avatar
          key={`${name}-${i}`}
          name={name}
          size={size}
          style={{ ...ring, marginLeft: i === 0 ? 0 : -6 }}
        />
      ))}
      {hidden > 0 && (
        <span
          style={{
            ...ring,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: avatarSizes[size].box,
            height: avatarSizes[size].box,
            marginLeft: -6,
            borderRadius: "50%",
            background: colors.neutralBg,
            color: colors.muted,
            fontSize: avatarSizes[size].font,
            fontWeight: 600,
          }}
        >
          +{hidden}
        </span>
      )}
    </span>
  );
}

export type FillTone = "success" | "warning" | "primary" | "danger";

const fillToneColors: Record<FillTone, string> = {
  success: colors.success,
  warning: colors.warning,
  primary: colors.primary,
  danger: colors.danger,
};

/** A single horizontal fill bar for `value` out of `max` (clamped). Decorative: show the
 * numbers next to it. */
export function FillBar({
  value,
  max = 1,
  tone = "success",
  height = 6,
  style,
}: {
  value: number;
  max?: number;
  tone?: FillTone;
  height?: number;
  style?: CSSProperties;
}) {
  const percent = max > 0 ? Math.min(Math.max(value / max, 0), 1) * 100 : 0;
  return (
    <div
      aria-hidden
      style={{
        height,
        borderRadius: height,
        background: colors.track,
        overflow: "hidden",
        ...style,
      }}
    >
      <div style={{ width: `${percent}%`, height: "100%", background: fillToneColors[tone] }} />
    </div>
  );
}

export interface FillSegment {
  key: string;
  label: string;
  value: number;
}

const segmentColors = [
  colors.primary,
  colors.primarySoft,
  "var(--color-primary-deep)",
  "var(--color-primary-pale)",
];

const openSegmentStyle: CSSProperties = {
  background: `repeating-linear-gradient(-45deg, ${colors.warningBg} 0 4px, var(--color-warning-soft) 4px 6px)`,
  boxShadow: "inset 0 0 0 1px var(--color-warning-soft)",
};

function formatAmount(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** A bar split into one segment per contributor (e.g. FTE per person), with a hatched
 * "open" segment for whatever is left of `total`. `legend` lists each segment's value. */
export function StackedFillBar({
  segments,
  total,
  height = 10,
  legend = false,
  openLabel = "Open",
}: {
  segments: FillSegment[];
  total: number;
  height?: number;
  legend?: boolean;
  openLabel?: string;
}) {
  const filled = segments.reduce((sum, s) => sum + s.value, 0);
  const open = Math.max(total - filled, 0);
  const scale = Math.max(total, filled);
  const swatch = (background: CSSProperties) => (
    <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, ...background }} />
  );
  return (
    <div>
      <div aria-hidden style={{ display: "flex", gap: 3, height }}>
        {scale === 0 && <div style={{ flex: 1, borderRadius: height, background: colors.track }} />}
        {segments.map((s, i) => (
          <div
            key={s.key}
            style={{
              width: `${(s.value / scale) * 100}%`,
              borderRadius: 3,
              background: segmentColors[i % segmentColors.length],
            }}
          />
        ))}
        {open > 0 && (
          <div
            style={{ width: `${(open / scale) * 100}%`, borderRadius: 3, ...openSegmentStyle }}
          />
        )}
      </div>
      {legend && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.4rem 1.1rem",
            marginTop: "0.65rem",
            fontSize: "0.85rem",
          }}
        >
          {segments.map((s, i) => (
            <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {swatch({ background: segmentColors[i % segmentColors.length] })}
              {s.label} {formatAmount(s.value)}
            </span>
          ))}
          {open > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {swatch(openSegmentStyle)}
              {openLabel} {formatAmount(open)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** A headline number tile: label, big value with a unit, an optional fill bar and a sub-line.
 * `accent` colors the value (e.g. warning for a staffing gap). */
export function StatTile({
  label,
  value,
  unit,
  sub,
  accent,
  fill,
  mono,
  style,
}: {
  label: string;
  value: ReactNode;
  unit?: ReactNode;
  sub?: ReactNode;
  accent?: FillTone;
  fill?: { value: number; max?: number; tone?: FillTone };
  mono?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: "var(--radius-lg)",
        padding: "1.1rem 1.35rem",
        ...style,
      }}
    >
      <div style={{ fontSize: "0.88rem", color: colors.muted }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.45rem", marginTop: "0.5rem" }}>
        <span
          style={{
            fontFamily: mono ? fonts.mono : fonts.display,
            fontSize: mono ? "1.55rem" : "2.4rem",
            fontWeight: mono ? 500 : 600,
            letterSpacing: mono ? 0 : "-0.02em",
            lineHeight: 1,
            color: accent
              ? accent === "warning"
                ? colors.warningText
                : fillToneColors[accent]
              : colors.text,
          }}
        >
          {value}
        </span>
        {unit && <span style={{ color: colors.muted, fontSize: "0.95rem" }}>{unit}</span>}
      </div>
      {fill && (
        <FillBar
          value={fill.value}
          max={fill.max}
          tone={fill.tone}
          style={{ marginTop: "0.9rem" }}
        />
      )}
      {sub && (
        <div style={{ marginTop: "0.6rem", fontSize: "0.875rem", color: colors.muted }}>{sub}</div>
      )}
    </div>
  );
}

export interface TabItem {
  value: string;
  label: ReactNode;
  count?: ReactNode;
  // Renders the tab as a route link (active state from the URL) instead of a button.
  to?: string;
  end?: boolean;
}

/** Underline tabs (page sections) or a segmented control (status/range filters). Items with
 * `to` render as `NavLink`s inside a `<nav>`; otherwise they are `role="tab"` buttons driven
 * by `value` / `onChange`. */
export function Tabs({
  items,
  value,
  onChange,
  variant = "underline",
  ariaLabel,
  style,
}: {
  items: TabItem[];
  value?: string;
  onChange?: (value: string) => void;
  variant?: "underline" | "segmented";
  ariaLabel: string;
  style?: CSSProperties;
}) {
  const containerStyle: CSSProperties =
    variant === "underline"
      ? { display: "flex", gap: "0.25rem", borderBottom: `1px solid ${colors.border}`, ...style }
      : {
          display: "inline-flex",
          alignSelf: "flex-start",
          gap: 2,
          padding: 3,
          background: colors.neutralBg,
          borderRadius: "var(--radius)",
          ...style,
        };
  const className = `tab tab-${variant}`;
  const content = (item: TabItem) => (
    <>
      {item.label}
      {item.count !== undefined && (
        <span className="mono" style={{ fontSize: "0.8rem", color: colors.muted }}>
          {item.count}
        </span>
      )}
    </>
  );

  if (items.some((item) => item.to !== undefined)) {
    return (
      <nav aria-label={ariaLabel} style={containerStyle}>
        {items.map((item) => (
          <NavLink key={item.value} to={item.to ?? ""} end={item.end} className={className}>
            {content(item)}
          </NavLink>
        ))}
      </nav>
    );
  }
  return (
    <div role="tablist" aria-label={ariaLabel} style={containerStyle}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={item.value === value}
          className={item.value === value ? `${className} active` : className}
          onClick={() => onChange?.(item.value)}
        >
          {content(item)}
        </button>
      ))}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search",
  ariaLabel,
  style,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  style?: CSSProperties;
}) {
  return (
    <div style={{ position: "relative", ...style }}>
      <Search
        size={16}
        aria-hidden
        style={{
          position: "absolute",
          left: 12,
          top: "50%",
          transform: "translateY(-50%)",
          color: colors.muted,
          pointerEvents: "none",
        }}
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        style={{ ...inputStyle, paddingLeft: "2.25rem" }}
      />
    </div>
  );
}

/** A dropdown button that opens a checklist; `selected` holds the checked option values. */
export function FilterMenu({
  label,
  options,
  selected,
  onChange,
  align = "left",
}: {
  label: string;
  options: { value: string; label: ReactNode }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));

  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className="btn btn-secondary btn-md"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        {selected.length > 0 && (
          <span className="mono" style={{ color: colors.primary, fontSize: "0.8rem" }}>
            {selected.length}
          </span>
        )}
        <ChevronDown size={15} aria-hidden />
      </button>
      {open && (
        <fieldset
          style={{
            ...popoverStyle,
            [align]: 0,
            margin: 0,
            maxHeight: 280,
            overflowY: "auto",
          }}
        >
          <legend style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>
            {label}
          </legend>
          {options.length === 0 && (
            <div style={{ padding: "0.45rem 0.6rem", color: colors.muted, fontSize: "0.85rem" }}>
              No options
            </div>
          )}
          {options.map((option) => (
            <label key={option.value} className="menu-item">
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={() => toggle(option.value)}
                style={{ accentColor: "var(--color-primary)", margin: 0 }}
              />
              {option.label}
            </label>
          ))}
          {selected.length > 0 && (
            <button
              type="button"
              className="menu-item"
              onClick={() => onChange([])}
              style={{
                color: colors.muted,
                borderTop: `1px solid ${colors.border}`,
                borderRadius: 0,
                marginTop: 4,
              }}
            >
              Clear
            </button>
          )}
        </fieldset>
      )}
    </div>
  );
}

export interface MenuItem {
  label: string;
  onSelect: () => void;
  icon?: LucideIcon;
  danger?: boolean;
}

/** A `⋯` overflow menu for row actions. `ariaLabel` names the trigger, e.g. "Actions for Ada".
 * Rows use the default ghost trigger; page headers use the outlined `secondary` one. */
export function Menu({
  items,
  ariaLabel,
  align = "right",
  variant = "ghost",
}: {
  items: MenuItem[];
  ariaLabel: string;
  align?: "left" | "right";
  variant?: "ghost" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className={`btn btn-${variant} btn-${variant === "ghost" ? "sm" : "md"} btn-icon`}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Ellipsis size={18} aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={ariaLabel}
          style={{ ...popoverStyle, [align]: 0, minWidth: 180 }}
        >
          {items.map(({ label, onSelect, icon: Icon, danger }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              className={danger ? "menu-item menu-item-danger" : "menu-item"}
              onClick={() => {
                setOpen(false);
                onSelect();
              }}
            >
              {Icon && <Icon size={15} aria-hidden />}
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export interface Crumb {
  label: string;
  to?: string;
}

/** The top of every page: optional breadcrumb and eyebrow line, an optional leading avatar,
 * the `h1` title with `badges` beside it, a subtitle, and right-aligned `actions`. */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  breadcrumb,
  leading,
  badges,
  actions,
  style,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  breadcrumb?: Crumb[];
  leading?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <header style={{ marginBottom: "1.75rem", ...style }}>
      {breadcrumb && (
        <nav aria-label="Breadcrumb" style={{ marginBottom: "1rem", fontSize: "0.88rem" }}>
          {breadcrumb.map((crumb, i) => (
            <span key={`${crumb.label}-${i}`}>
              {i > 0 && <span style={{ color: colors.subtle, margin: "0 0.5rem" }}>/</span>}
              {crumb.to ? (
                <Link to={crumb.to} style={{ color: colors.muted }}>
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current="page" style={{ fontWeight: 500 }}>
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
        {leading}
        <div style={{ flex: 1, minWidth: 0 }}>
          {eyebrow && (
            <div style={{ color: colors.muted, fontSize: "0.9rem", marginBottom: "0.3rem" }}>
              {eyebrow}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
            <h1 style={{ margin: 0 }}>{title}</h1>
            {badges}
          </div>
          {subtitle && (
            <div style={{ color: colors.muted, marginTop: "0.4rem", fontSize: "0.95rem" }}>
              {subtitle}
            </div>
          )}
        </div>
        {actions && (
          <div
            style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem", alignSelf: "flex-start" }}
          >
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        border: `1px solid ${colors.border}`,
        borderRadius: "var(--radius-lg)",
        padding: "1.25rem",
        background: colors.surface,
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
  maxWidth = 680,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
}) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: full-screen backdrop closes on click; Escape (handled above) is the keyboard equivalent
    // biome-ignore lint/a11y/useKeyWithClickEvents: same as above
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(26, 26, 26, 0.35)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "3rem 1rem",
        overflow: "auto",
        zIndex: 100,
      }}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: stops backdrop click-to-close from bubbling; not itself an interactive control */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: same as above */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: colors.surface,
          borderRadius: 14,
          width: "100%",
          maxWidth,
          boxShadow: "var(--shadow-pop)",
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
          <h2 style={{ margin: 0, fontSize: "1.2rem" }}>{title}</h2>
          <IconButton icon={X} ariaLabel="Close" onClick={onClose} size="sm" />
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
