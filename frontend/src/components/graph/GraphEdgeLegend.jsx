import React, { useMemo, useRef, useState, useEffect } from "react";

/**
 * Relationship Legend (draggable, compact)
 *
 * Props:
 *  - types: string[]                 // list of edge type keys present in the graph
 *  - active: Set<string>            // active type keys
 *  - onToggle(type: string)         // toggle handler
 *  - onAll() / onNone()
 *  - draggable?: boolean
 *  - initialPos?: { x:number, y:number }  // default {x:12,y:110} so it won't overlap status legend
 *  - style?: React.CSSProperties
 *  - colorMap?: Record<string,string> // optional override colors by type
 */

// defaults per common types (fallback to a pleasant gray)
const defaults = {
    TASK_ASSIGNEE:   "#00bcd4",
    PROJECT_LEAD:    "#ff9800",
    PERSON_INFLUENCE:"#c2185b",
    PERSON_TAG:      "#9c27b0",
    TASK_TAG:        "#9c27b0",
    PROJECT_TAG:     "#9c27b0",
    HAS_MEMBER:      "#8bc34a",
    REL:             "#7aa0a1"
  };

export default function GraphEdgeLegend({
  types = [],
  active = new Set(),
  onToggle,
  onAll,
  onNone,
  draggable = true,
  initialPos = { x: 12, y: 110 },
  style = {},
  colorMap = {}
}) {
  const boxRef = useRef(null);
  const [pos, setPos] = useState(initialPos);
  const [drag, setDrag] = useState(null);

  const palette = useMemo(() => {
    const gv = (k, f) =>
      typeof window === "undefined" ? f :
        (getComputedStyle(document.documentElement).getPropertyValue(k).trim() || f);
    return {
      panel:  gv("--panel",  "#232833"),
      border: gv("--border", "#2a303b"),
      text:   gv("--text",   "#e6e7eb"),
      muted:  gv("--muted",  "#9fb3ac"),
      line:   gv("--line",   "#56615d"),
    };
  }, []);

  const entries = useMemo(() => {
    // normalize + stable sorting
    const toLabel = (k) => k.replace(/_/g, " ").toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return [...types]
      .filter(Boolean)
      .map(k => ({
        key: k,
        label: toLabel(String(k)),
        color: colorMap[k] || defaults[k] || palette.line
      }))
      .sort((a,b) => a.label.localeCompare(b.label));
  }, [types, colorMap, palette.line]);

  // drag handlers
  useEffect(() => {
    if (!draggable) return;
    const el = boxRef.current;
    if (!el) return;

    const onDown = (e) => {
      if (!(e.target.closest?.(".legend-grip"))) return;
      setDrag({ sx: e.clientX, sy: e.clientY, x0: pos.x, y0: pos.y });
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      setPos({ x: Math.max(6, drag.x0 + dx), y: Math.max(6, drag.y0 + dy) });
    };
    const onUp = () => setDrag(null);

    el.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      el.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggable, pos, drag]);

  const SZ = {
    radius: 10,
    pad: 8,
    titleSize: 11,
    chipFont: 11,
    chipPad: "4px 6px",
    gridGap: 6,
    dotW: 18,
    dotH: 3,
  };

  return (
    <div
      ref={boxRef}
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        zIndex: 5,
        background: "rgba(0,0,0,0.18)",
        backdropFilter: "blur(2px)",
        border: `1px solid ${palette.border}`,
        borderRadius: SZ.radius,
        padding: SZ.pad,
        color: palette.text,
        boxShadow: "0 6px 18px rgba(0,0,0,0.28)",
        minWidth: 200,
        userSelect: "none",
        ...style
      }}
    >
      <div
        className="legend-grip"
        style={{
          fontSize: SZ.titleSize,
          letterSpacing: 0.2,
          marginBottom: 6,
          display: "flex",
          alignItems: "center",
          gap: 6,
          cursor: draggable ? "grab" : "default",
          color: palette.muted,
        }}
        title={draggable ? "Drag to reposition" : ""}
      >
        <div style={{ width: 28, height: 5, borderRadius: 999, background: palette.border, opacity: 0.9 }} />
        <span style={{ fontWeight: 500 }}>Relationships</span>
        <div style={{ flex: 1 }} />
        <button onClick={onAll}  style={tinyBtn(palette,SZ)} title="Show all">All</button>
        <button onClick={onNone} style={tinyBtn(palette,SZ)} title="Hide all">None</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SZ.gridGap }}>
        {entries.map(it => {
          const isOn = active.has(it.key);
          return (
            <button
              key={it.key}
              onClick={() => onToggle?.(it.key)}
              style={{
                ...chipBtn(palette,SZ,isOn),
                padding: SZ.chipPad,
                justifyContent: "flex-start",
                gap: 6
              }}
              title={isOn ? "Click to hide/dim this type" : "Click to show/highlight this type"}
            >
              {/* a tiny line sample to suggest "edge" */}
              <span
                aria-hidden
                style={{
                  width: SZ.dotW, height: SZ.dotH, borderRadius: 999,
                  background: it.color, boxShadow: "0 1px 1px rgba(0,0,0,0.35) inset",
                  flex: "0 0 auto"
                }}
              />
              <span style={{ fontSize: SZ.chipFont, color: isOn ? palette.text : palette.muted }}>
                {it.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function tinyBtn(p,SZ){
  return {
    display:"inline-flex",alignItems:"center",
    border:`1px solid ${p.border}`,color:p.muted,background:"transparent",
    borderRadius:8,padding:"2px 6px",fontSize:SZ.titleSize,lineHeight:1.25,cursor:"pointer"
  };
}
function chipBtn(p,SZ,active){
  return {
    display:"inline-flex",alignItems:"center",width:"100%",
    border:`1px solid ${active? p.muted : p.border}`,
    color: active? p.text : p.muted,
    background: active? "rgba(255,255,255,0.02)" : "transparent",
    borderRadius:9,fontSize:SZ.chipFont,lineHeight:1.25,cursor:"pointer"
  };
}
