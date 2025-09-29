// frontend/src/styles/constants.js

// Status -> CSS variable
export const STATUS_COLORS = {
  Planned: "var(--status-planned)",
  Confirmed: "var(--status-confirmed)",
  Complete: "var(--status-complete)",
  Canceled: "var(--status-canceled)",
  Blocked: "var(--status-blocked)",
  Running: "var(--status-running)"
};

// Which object types support status
export const TYPES_WITH_STATUS = new Set(["project", "task"]);

// Neutral fallback color for non-status types
export const NEUTRAL_RING = "#3b424a";

// Graph node types
export const NODE_TYPES = {
  PROJECT: "project",
  PERSON: "person",
  TASK: "task",
  GROUP: "group",
  TAG: "tag",
  UNKNOWN: "unknown"
};
