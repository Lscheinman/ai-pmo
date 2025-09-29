import React, { useMemo } from "react";

/**
 * Layout + physics control with one-click presets.
 *
 * Props:
 *  - layoutMode: 'force-d3' | 'ngraph' | 'dag-td' | 'dag-lr' | 'radial-out' | 'radial-in'
 *  - onLayoutMode(mode)
 *  - physics: object (see GraphCanvas defaults)
 *  - onPhysics(next)
 */
export default function GraphLayoutControl({
  layoutMode,
  onLayoutMode,
  physics,
  onPhysics,
  style = {},
}) {
  const palette = useMemo(() => {
    const gv = (k, f) =>
      typeof window === "undefined"
        ? f
        : (getComputedStyle(document.documentElement).getPropertyValue(k).trim() || f);
    return {
      border: gv("--border", "#2a303b"),
      text: gv("--text", "#e6e7eb"),
      muted: gv("--muted", "#9fb3ac"),
      mutedHover: gv("--muted-hover", "#cfe1db"),
      panel: gv("--panel", "#232833"),
    };
  }, []);

  const isD3 = layoutMode === "force-d3";
  const isNGraph = layoutMode === "ngraph";
  const isDag = layoutMode.startsWith("dag-") || layoutMode.startsWith("radial");

  const set = (k, v) => onPhysics?.({ ...physics, [k]: v });
  const setN = (k, v) => onPhysics?.({
    ...physics,
    ngraph: { ...(physics.ngraph || {}), [k]: v }
  });

  // --- One-click presets
  const applyPreset = (preset) => {
    const nextMode = preset.layoutMode ?? layoutMode;
    const nextPhys = deepMerge(physics, preset.physics || {});
    onLayoutMode?.(nextMode);
    onPhysics?.(nextPhys);
  };

  const PRESETS = [
    { label: "Spread (D3)", layoutMode: "force-d3", physics: { linkDistance: 140, chargeStrength: -220, collisionPadding: 8, velocityDecay: 0.35 } },
    { label: "Compact (D3)", layoutMode: "force-d3", physics: { linkDistance: 60, chargeStrength: -80, collisionPadding: 3, velocityDecay: 0.45 } },
    { label: "Hier. LR", layoutMode: "dag-lr", physics: { dagLevelDistance: 160 } },
    { label: "Hier. TD", layoutMode: "dag-td", physics: { dagLevelDistance: 180 } },
    { label: "Radial Out", layoutMode: "radial-out", physics: { dagLevelDistance: 200 } },
    { label: "Radial In", layoutMode: "radial-in", physics: { dagLevelDistance: 200 } },
    { label: "NGraph Spread", layoutMode: "ngraph", physics: { ngraph: { gravity: -2, springLength: 80, dragCoefficient: 0.02 } } },
    { label: "NGraph Cluster", layoutMode: "ngraph", physics: { ngraph: { gravity: -8, springLength: 40, dragCoefficient: 0.03 } } },
  ];

  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "4px 8px",
      border: `1px solid ${palette.border}`,
      borderRadius: 10,
      background: "rgba(0,0,0,0.12)",
      color: palette.text,
      ...style
    }}>
      {/* Mode selector */}
      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: palette.muted }}>
        Layout
        <select
          value={layoutMode}
          onChange={e => onLayoutMode?.(e.target.value)}
          style={{ fontSize: 12, background: "transparent", color: palette.text, border: `1px solid ${palette.border}`, borderRadius: 6, padding: "2px 6px" }}
        >
          <option value="force-d3">Force (D3)</option>
          <option value="ngraph">Force (ngraph)</option>
          <option value="dag-td">Hierarchical (top→down)</option>
          <option value="dag-lr">Hierarchical (left→right)</option>
          <option value="radial-out">Radial (out)</option>
          <option value="radial-in">Radial (in)</option>
        </select>
      </label>

      {/* Presets */}
      <div style={{ display: "inline-flex", gap: 6 }}>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => applyPreset(p)}
            title="Apply preset"
            style={btn(palette)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Fine-tune knobs (contextual) */}
      {isD3 && (
        <>
          <Knob label="Link" value={physics.linkDistance ?? 80} min={20} max={200} step={5} onChange={v => set("linkDistance", v)} />
          <Knob label="Charge" value={physics.chargeStrength ?? -120} min={-400} max={0} step={10} onChange={v => set("chargeStrength", v)} />
          <Knob label="Collide" value={physics.collisionPadding ?? 4} min={0} max={20} step={1} onChange={v => set("collisionPadding", v)} width={80} />
        </>
      )}
      {isNGraph && (
        <>
          <Knob label="Gravity" value={physics.ngraph?.gravity ?? -1} min={-50} max={50} step={1} onChange={v => setN("gravity", v)} width={90} />
          <Knob label="Spring L" value={physics.ngraph?.springLength ?? 30} min={5} max={200} step={5} onChange={v => setN("springLength", v)} width={90} />
        </>
      )}
      {isDag && (
        <Knob label="Level gap" value={physics.dagLevelDistance ?? 140} min={60} max={300} step={10} onChange={v => set("dagLevelDistance", v)} />
      )}
    </div>
  );
}

function Knob({ label, value, min, max, step, onChange, width = 100 }) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted, #9fb3ac)" }}>
      {label}
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width }}
      />
      <span style={{ minWidth: 28, textAlign: "right", color: "var(--text, #e6e7eb)" }}>{value}</span>
    </label>
  );
}

function btn(palette) {
  return {
    border: `1px solid ${palette.border}`,
    color: palette.muted,
    background: "transparent",
    borderRadius: 8,
    padding: "2px 6px",
    fontSize: 12,
    cursor: "pointer",
  };
}

function deepMerge(base, patch) {
  if (!patch) return base;
  const out = Array.isArray(base) ? base.slice() : { ...(base || {}) };
  for (const k of Object.keys(patch)) {
    const pv = patch[k];
    if (pv && typeof pv === "object" && !Array.isArray(pv)) {
      out[k] = deepMerge(out[k], pv);
    } else {
      out[k] = pv;
    }
  }
  return out;
}
