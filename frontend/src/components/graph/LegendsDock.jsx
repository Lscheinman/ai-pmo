// src/components/graph/LegendsDock.jsx
import React, { useMemo, useRef, useState, useEffect } from "react";
import GraphLegend from "./GraphLegend";
import GraphEdgeLegend from "./GraphEdgeLegend";

export default function LegendsDock({
  statusLegendProps,
  edgeLegendProps,
  initialPos = { x: 12, y: 12 },
  draggable = true,
  style = {}
}) {
  const boxRef = useRef(null);
  const [pos, setPos] = useState(initialPos);
  const [drag, setDrag] = useState(null);

  const palette = useMemo(() => {
    const getVar = (name, fallback) => {
      if (typeof window === "undefined") return fallback;
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    };
    return {
      panel:  getVar("--panel", "#232833"),
      border: getVar("--border", "#2a303b"),
      text:   getVar("--text", "#e6e7eb"),
      muted:  getVar("--muted", "#9fb3ac"),
    };
  }, []);

  useEffect(() => {
    if (!draggable) return;
    const el = boxRef.current;
    if (!el) return;

    const onMouseDown = (e) => {
      if (!e.target.closest?.(".legends-dock-grip")) return;
      setDrag({ sx: e.clientX, sy: e.clientY, x0: pos.x, y0: pos.y });
      e.preventDefault();
    };
    const onMouseMove = (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.sx;
      const dy = e.clientY - drag.sy;
      setPos({
        x: Math.max(6, drag.x0 + dx),
        y: Math.max(6, drag.y0 + dy)
      });
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
        background: "rgba(0,0,0,0.18)",
        backdropFilter: "blur(2px)",
        border: `1px solid ${palette.border}`,
        borderRadius: 10,
        padding: 8,
        color: palette.text,
        boxShadow: "0 6px 18px rgba(0,0,0,0.28)",
        minWidth: 220,
        userSelect: "none",
        ...style
      }}
    >
      {/* Dock header / grip */}
      <div
        className="legends-dock-grip"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 6,
          color: palette.muted,
          cursor: draggable ? "grab" : "default",
          fontSize: 11
        }}
        title={draggable ? "Drag to reposition" : ""}
      >
        <div style={{ width: 30, height: 6, borderRadius: 999, background: palette.border, opacity: 0.9 }} />
        <span style={{ fontWeight: 500 }}>Legends</span>
      </div>

      {/* Stack the two legends vertically */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <GraphLegend
          draggable={false}              // let the dock do the dragging
          variant="compact"
          style={{ position: "static" }} // ensure no absolute positioning
          {...statusLegendProps}
        />
        <GraphEdgeLegend
          draggable={false}              // let the dock do the dragging
          variant="compact"
          style={{ position: "static" }} // ensure no absolute positioning
          {...edgeLegendProps}
        />
      </div>
    </div>
  );
}
