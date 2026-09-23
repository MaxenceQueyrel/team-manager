import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { colors, inputStyle } from "@/components/common/ui";

const listStyle: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  right: 0,
  zIndex: 10,
  margin: 0,
  padding: "0.25rem",
  listStyle: "none",
  background: "#fff",
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: 8,
  boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
  maxHeight: 200,
  overflowY: "auto",
};

const optionStyle: CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  border: "none",
  borderRadius: 6,
  padding: "0.4rem 0.55rem",
  fontSize: "0.875rem",
  fontFamily: "inherit",
  cursor: "pointer",
  color: colors.text,
};

/** A text input with a styled, filterable dropdown of suggestions.
 *
 * Unlike a native `datalist`, the suggestion list is rendered by the app, so it is
 * keyboard navigable, themable, and consistent across browsers. Free text is still
 * allowed: the value is not restricted to `options`.
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder,
  onSelect,
  onEnter,
  onBlur,
  emptyLabel = "No match — press Enter to use as typed",
  style,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  onSelect?: (option: string) => void;
  onEnter?: () => void;
  onBlur?: () => void;
  emptyLabel?: string;
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const query = value.trim().toLowerCase();
    return query ? options.filter((o) => o.toLowerCase().includes(query)) : options;
  }, [options, value]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // `matches` shrinks as the user types, so the stored index can outrun the list.
  const activeIndex = Math.min(active, Math.max(matches.length - 1, 0));

  const choose = (option: string) => {
    setOpen(false);
    if (onSelect) onSelect(option);
    else onChange(option);
  };

  return (
    <div ref={containerRef} style={{ position: "relative", ...style }}>
      <input
        value={value}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onChange={(e) => {
          onChange(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={onBlur}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (open && matches[activeIndex]) choose(matches[activeIndex]);
            else {
              setOpen(false);
              onEnter?.();
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        style={{ ...inputStyle, paddingRight: "1.75rem" }}
      />
      <span
        aria-hidden
        style={{
          position: "absolute",
          right: "0.6rem",
          top: "50%",
          transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
          color: colors.muted,
          fontSize: "0.7rem",
          pointerEvents: "none",
        }}
      >
        ▾
      </span>

      {open && (
        <ul style={listStyle}>
          {matches.length === 0 ? (
            <li style={{ ...optionStyle, color: colors.muted, cursor: "default" }}>{emptyLabel}</li>
          ) : (
            matches.map((option, i) => (
              <li key={option}>
                <button
                  type="button"
                  // The input blurs before click fires, which would close the list first.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(option)}
                  onMouseEnter={() => setActive(i)}
                  style={{
                    ...optionStyle,
                    background: i === activeIndex ? colors.primaryBg : "transparent",
                    fontWeight: i === activeIndex ? 600 : 400,
                  }}
                >
                  {option}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
