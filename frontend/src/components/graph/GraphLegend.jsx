import React, { useMemo, useRef, useState, useEffect } from "react";

/**
 * Compact on-canvas legend:
 * - Smaller typography & spacing
 * - Softer contrast (muted text by default)
 * - Still draggable and theme-aware (CSS vars)
 *
 * Props:
 *   activeKeys   : Set<string>
 *   onToggleKey  : (key: string) => void
 *   onAll        : () => void
 *   onNone       : () => void
 *   draggable    : boolean (default true)
 *   variant      : "compact" | "regular" (default "compact")
 *   style        : inline style overrides
 */
export default function GraphLegend({
  activeKeys,
  onToggleKey,
  onAll,
  onNone,
  draggable = true,
  variant = "compact",
  style = {},
}) {
  const boxRef = useRef(null);
  const [pos, setPos] = useState({ x: 12, y: 12 });
  const [drag, setDrag] = useState(null);

  const palette = useMemo(() => {
    const getVar = (name, fallback) => {
      if (typeof window === "undefined") return fallback;
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    };
    return {
      planned:    getVar("--status-planned",   "#ffffff"),
      confirmed:  getVar("--status-confirmed", "#d5d200"),
      running:    getVar("--status-running",   "#01c35c"),
      blocked:    getVar("--status-blocked",   "#c70000"),
      complete:   getVar("--status-complete",  "#02589e"),
      canceled:   getVar("--status-canceled",  "#6b6564"),
      neutral:    getVar("--ring-neutral", getVar("--line", "#343434")),
      panel:      getVar("--panel", "#232833"),
      border:     getVar("--border", "#2a303b"),
      text:       getVar("--text", "#e6e7eb"),
      muted:      getVar("--muted", "#9fb3ac"),
      mutedHover: getVar("--muted-hover", "#cfe1db"),
    };
  }, []);

  // size tokens
  const SZ = variant === "regular" ? {
    radius: 12,
    pad: 10,
    minW: 220,
    titleSize: 12,
    chipFont: 12,
    chipPad: "6px 8px",
    gridGap: 8,
    dot: 16,
    dotBorder: 4,
    shadow: "0 8px 24px rgba(0,0,0,0.35)",
    headerMb: 8,
  } : {
    radius: 10,
    pad: 8,
    minW: 180,
    titleSize: 11,
    chipFont: 11,
    chipPad: "4px 6px",
    gridGap: 6,
    dot: 12,
    dotBorder: 3,
    shadow: "0 6px 18px rgba(0,0,0,0.28)",
    headerMb: 6,
  };

  const items = useMemo(() => ([
    { key: "planned",   label: "Planned",   color: palette.planned },
    { key: "confirmed", label: "Confirmed", color: palette.confirmed },
    { key: "running",   label: "Running",   color: palette.running },
    { key: "blocked",   label: "Blocked",   color: palette.blocked },
    { key: "complete",  label: "Complete",  color: palette.complete },
    { key: "canceled",  label: "Canceled",  color: palette.canceled },
  ]), [palette]);

  // drag
  useEffect(() => {
    if (!draggable) return;
    const el = boxRef.current;
    if (!el) return;

    const onMouseDown = (e) => {
      if (!(e.target.closest?.(".legend-grip"))) return;
      setDrag({ sx: e.clientX, sy: e.clientY, x0: pos.x, y0: pos.y });
      e.preventDefault();
    };
    const onMouseMove = (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      setPos({ x: Math.max(6, drag.x0 + dx), y: Math.max(6, drag.y0 + dy) });
    };
    const onMouseUp = () => setDrag(null);

    el.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      el.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [draggable, pos, drag]);

  return (
    <div
      ref={boxRef}
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        zIndex: 5,
        background: "rgba(0,0,0,0.18)",          // subtle translucency
        backdropFilter: "blur(2px)",
        border: `1px solid ${palette.border}`,
        borderRadius: SZ.radius,
        padding: SZ.pad,
        color: palette.text,
        boxShadow: SZ.shadow,
        minWidth: SZ.minW,
        userSelect: "none",
        // inner panel tone
        // layer panel color underneath (helps in high-contrast themes)
        boxSizing: "border-box",
        ...style,
      }}
    >
      <div
        className="legend-grip"
        style={{
          fontSize: SZ.titleSize,
          letterSpacing: 0.2,
          marginBottom: SZ.headerMb,
          display: "flex",
          alignItems: "center",
          gap: 6,
          cursor: draggable ? "grab" : "default",
          color: palette.muted,
        }}
        title={draggable ? "Drag to reposition" : ""}
      >
        <div style={{
          width: 28, height: 5, borderRadius: 999,
          background: palette.border, opacity: 0.9,
        }} />
        <span style={{ fontWeight: 500 }}>Statuses</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={onAll}
          style={tinyBtnStyle(palette, SZ)}
          title="Show all"
        >All</button>
        <button
          onClick={onNone}
          style={tinyBtnStyle(palette, SZ)}
          title="Hide all"
        >None</button>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: SZ.gridGap
      }}>
        {items.map(it => {
          const active = activeKeys.has(it.key);
          return (
            <button
              key={it.key}
              onClick={() => onToggleKey(it.key)}
              style={{
                ...chipBtnStyle(palette, SZ, active),
                padding: SZ.chipPad,
                justifyContent: "flex-start",
                gap: 6
              }}
              title={active ? "Click to hide/dim this status" : "Click to show/highlight this status"}
            >
              <span
                aria-hidden
                style={{
                  width: SZ.dot,
                  height: SZ.dot,
                  borderRadius: "50%",
                  border: `${SZ.dotBorder}px solid ${it.color}`,
                  background: "rgba(15,17,19,0.85)",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.35) inset",
                  flex: "0 0 auto",
                }}
              />
              <span style={{ fontSize: SZ.chipFont, color: active ? palette.text : palette.muted }}>
                {it.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function tinyBtnStyle(palette, SZ) {
  return {
    display: "inline-flex",
    alignItems: "center",
    border: `1px solid ${palette.border}`,
    color: palette.muted,
    background: "transparent",
    borderRadius: 8,
    padding: "2px 6px",
    fontSize: SZ.titleSize,
    lineHeight: 1.25,
    transition: "all .15s ease",
    cursor: "pointer",
  };
}

function chipBtnStyle(palette, SZ, active) {
  return {
    display: "inline-flex",
    alignItems: "center",
    width: "100%",
    border: `1px solid ${active ? palette.mutedHover : palette.border}`,
    color: active ? palette.text : palette.muted,
    background: active ? "rgba(255,255,255,0.02)" : "transparent",
    borderRadius: 9,
    fontSize: SZ.chipFont,
    lineHeight: 1.25,
    transition: "all .15s ease",
    cursor: "pointer",
  };
}
