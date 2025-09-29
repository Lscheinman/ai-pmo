// src/utils/graphVisualRules.js
// Central place to compute node visuals (ring color, status label, etc.)
//
// Uses your existing status helpers:
// - extractStatus, getStatusColor, isTerminalStatus (from utils/status.js)

import { extractStatus, getStatusColor, isTerminalStatus, canonicalStatus} from "./status";

// Neutral fallback ring for non-status types
export const NEUTRAL_RING = "var(--ring-neutral, var(--line, #343434))";

// Which node types should use semantic status ring
export const TYPES_WITH_STATUS = new Set(["project", "task"]);

// --- helpers ----------------------------------------------------------

const parseISODate = (v) => {
  if (!v) return null;
  try { return new Date(v); } catch { return null; }
};

const isOverdue = (end, status) => {
  if (!end) return false;
  if (isTerminalStatus(status)) return false; // done/canceled not overdue
  const endDate = parseISODate(end);
  if (!endDate) return false;
  const today = new Date();
  return endDate.setHours(0,0,0,0) < today.setHours(0,0,0,0);
};

// Degree map for graph: id -> degree count
export function buildDegreeMap(links) {
  const deg = Object.create(null);
  for (const l of links || []) {
    const s = typeof l.source === "object" ? l.source.id : l.source;
    const t = typeof l.target === "object" ? l.target.id : l.target;
    if (!s || !t) continue;
    deg[s] = (deg[s] || 0) + 1;
    deg[t] = (deg[t] || 0) + 1;
  }
  return deg;
}

// Simple degree→color scale for Person (neutral → accent)
function degreeRingColor(deg, maxDeg = 1) {
  const d = Math.max(0, Math.min(deg, maxDeg));
  const p = maxDeg > 0 ? d / maxDeg : 0; // 0..1
  // Lerp lightness 55% → 35% (more connections = darker)
  const L = 55 - 20 * p;
  // slight teal hue; keep saturation modest for dark bg
  return `hsl(190 40% ${L}%)`;
}

// --- main rule set ----------------------------------------------------
// Returns a visual spec for a node: { ringColor, statusLabel?, degree? }
export function getNodeVisual(rawNode, ctx = {}) {
  const type = String(rawNode?.type || "").toLowerCase();

  if (TYPES_WITH_STATUS.has(type)) {
    const statusRaw = extractStatus(rawNode);
    const end = rawNode?.end ?? rawNode?.end_date ?? rawNode?.due ?? null;
    const effective = isOverdue(end, statusRaw) ? "blocked" : statusRaw;

    const ringColor = getStatusColor(effective);
    const statusLabel = canonicalStatus(effective) || statusRaw || null;

    return { ringColor, statusLabel };
  }

  if (type === "person") {
    const deg = (ctx.degreeMap?.[String(rawNode.id)] ?? 0);
    const maxDeg = ctx.maxDegree ?? 1;
    return { ringColor: degreeRingColor(deg, maxDeg), degree: deg };
  }

  return { ringColor: NEUTRAL_RING };
}
