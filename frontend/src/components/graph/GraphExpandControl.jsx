import React, { useMemo } from "react";

/**
 * Compact N-hop expansion control:
 * - "Use selection" adds current selected node as a center
 * - "accumulate" decides whether new centers add or replace
 * - Slider controls N hops (0..6)
 * - "Reset" clears centers and hops
 *
 * No internal state; parent owns everything.
 */
export default function GraphExpandControl({
  selectedNode,             // {id,...} or string or null
  seedIds,                  // Set<string>
  onUseSelection,           // (nodeId) => void
  onResetSeeds,             // () => void
  hops,                     // number
  onHopsChange,             // (n) => void
  accumulate,               // boolean
  onToggleAccumulate,       // () => void
  minHops = 0,
  maxHops = 6,
  style = {},
}) {
  const palette = useMemo(() => {
    const gv = (k, f) => {
      if (typeof window === "undefined") return f;
      const v = getComputedStyle(document.documentElement).getPropertyValue(k).trim();
      return v || f;
    };
    return {
      border:     gv("--border", "#2a303b"),
      text:       gv("--text", "#e6e7eb"),
      muted:      gv("--muted", "#9fb3ac"),
      mutedHover: gv("--muted-hover", "#cfe1db"),
    };
  }, []);

  const canUse = !!(selectedNode && (typeof selectedNode === "string" ? selectedNode : selectedNode.id));

  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "4px 8px",
      border: `1px solid ${palette.border}`,
      borderRadius: 10,
      background: "rgba(0,0,0,0.12)",
      ...style
    }}>
      <button
        onClick={() => {
          if (!canUse) return;
          const id = typeof selectedNode === "string" ? selectedNode : selectedNode.id;
          onUseSelection?.(String(id));
        }}
        disabled={!canUse}
        title={canUse ? "Use selected node as center" : "Select a node in the graph"}
        style={btn(palette, !!canUse)}
      >
        Use selection
      </button>

      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, color: palette.muted, fontSize: 12 }}>
        Hops
        <input
          type="range"
          min={minHops}
          max={maxHops}
          step={1}
          value={hops}
          onChange={e => onHopsChange?.(Number(e.target.value))}
          style={{ width: 110 }}
        />
        <span style={{ minWidth: 18, textAlign: "right", color: palette.text }}>{hops}</span>
      </label>

      <label title="Add centers instead of replacing"
        style={{ display: "inline-flex", alignItems: "center", gap: 6, color: palette.muted, fontSize: 12 }}>
        <input type="checkbox" checked={accumulate} onChange={onToggleAccumulate} />
        accumulate
      </label>

      <button
        onClick={onResetSeeds}
        title="Clear centers"
        style={btn(palette, true)}
      >
        Reset
      </button>

      <span style={{ color: palette.muted, fontSize: 12 }}>
        centers: <strong style={{ color: palette.text }}>{seedIds?.size ?? 0}</strong>
      </span>
    </div>
  );
}

function btn(palette, enabled) {
  return {
    border: `1px solid ${enabled ? palette.mutedHover : palette.border}`,
    color: enabled ? palette.text : palette.muted,
    background: "transparent",
    borderRadius: 8,
    padding: "4px 8px",
    fontSize: 12,
    cursor: enabled ? "pointer" : "not-allowed",
  };
}
