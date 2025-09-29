// frontend/src/components/projects/GanttChart.jsx
import React, {
  useRef,
  useState,
  useMemo,
  useLayoutEffect,
  useEffect,
  useCallback,
  forwardRef,
  useImperativeHandle
} from "react";

import { STATUS_COLORS } from "../../styles/constants";

// --- Constants ---
const BAR_HEIGHT = 26;
const ROW_GAP = 18;
const CHART_TOP = 45;

const TASK_BAR_HEIGHT = 18;
const TASK_ROW_GAP = 10;

const CHEVRON_X = 8;   // chevron position (scrolls with chart)
const CHEVRON_R = 10;

const TICK_BASE_WIDTH = { day: 46, week: 62, month: 84, year: 100 };
const FONT = "600 10px 'Apotos','72Brand',sans-serif";

// NEW: dot rendering for continuous tasks
const DOT_R = 3.5;

// --- Date utilities (module-level so identities are stable) ---
function getYears(start, end) {
  const arr = [];
  let dt = new Date(start.getFullYear(), 0, 1);
  while (dt <= end) {
    arr.push(new Date(dt));
    dt = new Date(dt.getFullYear() + 1, 0, 1);
  }
  return arr;
}
function addYears(d, n) { return new Date(d.getFullYear() + n, 0, 1); }

function getDays(start, end) {
  const arr = [];
  let dt = new Date(start);
  while (dt <= end) {
    arr.push(new Date(dt));
    dt.setDate(dt.getDate() + 1);
  }
  return arr;
}
function getWeeks(start, end) {
  const arr = [];
  let dt = new Date(start);
  dt.setDate(dt.getDate() - dt.getDay() + 1); // Monday-start
  while (dt <= end) {
    arr.push(new Date(dt));
    dt.setDate(dt.getDate() + 7);
  }
  return arr;
}
function getMonths(start, end) {
  const arr = [];
  let dt = new Date(start.getFullYear(), start.getMonth(), 1);
  while (dt <= end) {
    arr.push(new Date(dt));
    dt = new Date(dt.getFullYear(), dt.getMonth() + 1, 1);
  }
  return arr;
}
function safeDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(+d) ? null : d;
}

function sameDay(a, b) {
  if (!(a instanceof Date) || Number.isNaN(+a)) return false;
  if (!(b instanceof Date) || Number.isNaN(+b)) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function addDays(d, n) { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd; }
function addWeeks(d, n) { const nd = new Date(d); nd.setDate(nd.getDate() + n * 7); return nd; }
function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }

function addBoundary(d, mode) {
  if (mode === "day")   return addDays(d, 1);
  if (mode === "week")  return addWeeks(d, 1);
  if (mode === "month") return addMonths(d, 1);
  if (mode === "year")  return addYears(d, 1);
  return d;
}
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// --- Status normalization for tasks ---
const STATUS_ALIAS = {
  "not started": "Planned",
  "todo": "Planned",
  "to do": "Planned",
  "planned": "Planned",
  "confirmed": "Confirmed",
  "in progress": "Running",
  "doing": "Running",
  "running": "Running",
  "blocked": "Blocked",
  "done": "Complete",
  "completed": "Complete",
  "complete": "Complete",
  "canceled": "Canceled",
  "cancelled": "Canceled"
};
function normalizeStatus(raw) {
  if (!raw) return "Planned";
  const key = String(raw).trim().toLowerCase();
  return STATUS_ALIAS[key] || raw;
}

// --- Label color: black for Planned/Confirmed (dark bars), else white ---
function getTextColorForStatus(status) {
  const s = normalizeStatus(status);
  if (s === "Planned" || s === "Confirmed") return "#000";
  return "#fff";
}

// --- Ellipsis helper for bar labels ---
function getEllipsisText(text, maxWidth, font) {
  if (typeof document === "undefined") return text;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidth) return text;
  let left = 0, right = text.length;
  let trimmed = text;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    const attempt = text.slice(0, mid) + "…";
    if (ctx.measureText(attempt).width > maxWidth) {
      right = mid - 1;
    } else {
      trimmed = attempt;
      left = mid + 1;
    }
  }
  return trimmed;
}

// NEW: helpers for continuous tasks
function isContinuousTask(t) {
  return Boolean(
    t?.is_continuous ||
    t?.continuous ||
    String(t?.type || "").toLowerCase() === "continuous" ||
    t?.recurrence_unit ||
    t?.recurrence // allow "daily/weekly/monthly/yearly"
  );
}
function normRecurrenceUnit(unit, fallback) {
  const u = String(unit || "").toLowerCase();
  if (u.startsWith("day")) return "day";
  if (u.startsWith("week")) return "week";
  if (u.startsWith("month")) return "month";
  if (u.startsWith("year")) return "year";
  return fallback; // e.g., axisMode
}
function stepByUnit(date, unit, interval = 1) {
  if (unit === "day")   return addDays(date, interval);
  if (unit === "week")  return addWeeks(date, interval);
  if (unit === "month") return addMonths(date, interval);
  if (unit === "year")  return addYears(date, interval);
  return addDays(date, interval);
}

// --- Main GanttChart Component ---
export default forwardRef(function GanttChart(
  { projects, tasks = [], axisMode, onBarClick, onTaskClick },
  ref
) {
  // --- Date range from projects ---
  const { minDate, maxDate } = useMemo(() => {
    let min = null, max = null;
    projects.forEach(p => {
      const s = p.start_date ? new Date(p.start_date) : null;
      const e = p.end_date ? new Date(p.end_date) : null;
      if (s && (!min || s < min)) min = s;
      if (e && (!max || e > max)) max = e;
    });
    if (min && max) {
      min = addDays(min, -7);
      max = addDays(max, 14);
      min.setHours(0,0,0,0);
      max.setHours(23,59,59,999);
    }
    return { minDate: min, maxDate: max };
  }, [projects]);

  // --- Dynamic tick width measurement ---
  const measureCanvas = useRef();
  const [autoTickWidth, setAutoTickWidth] = useState(TICK_BASE_WIDTH[axisMode]);

  const getLabel = useCallback((d) => {
    if (axisMode === "day")
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (axisMode === "week")
      return "Wk " + d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (axisMode === "month")
      return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    if (axisMode === "year")
      return d.getFullYear().toString();
    return "";
  }, [axisMode]);

  const todayDateLabel = useMemo(() => {
    const s = new Date().toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "2-digit"
    });
    return s.replace(",", "");
  }, []);

  useLayoutEffect(() => {
    if (!measureCanvas.current) measureCanvas.current = document.createElement("canvas");
    const ctx = measureCanvas.current.getContext("2d");
    ctx.font = FONT;
    let maxLen = 0;
    if (!minDate || !maxDate) return;

    let samples = [];
    if (axisMode === "day") samples = getDays(minDate, maxDate).map(getLabel);
    else if (axisMode === "week") samples = getWeeks(minDate, maxDate).map(getLabel);
    else if (axisMode === "month") samples = getMonths(minDate, maxDate).map(getLabel);
    else samples = getYears(minDate, maxDate).map(getLabel);

    for (const lbl of samples) {
      const len = ctx.measureText(lbl).width;
      if (len > maxLen) maxLen = len;
    }
    setAutoTickWidth(Math.max(Math.ceil(maxLen + 18), TICK_BASE_WIDTH[axisMode]));
  }, [minDate, maxDate, axisMode, getLabel]);

  // --- Ticks and chart width ---
  const ticks = useMemo(() => {
    if (!minDate || !maxDate) return [];
    if (axisMode === "day") return getDays(minDate, maxDate);
    if (axisMode === "week") return getWeeks(minDate, maxDate);
    if (axisMode === "month") return getMonths(minDate, maxDate);
    if (axisMode === "year") return getYears(minDate, maxDate);
    return [];
  }, [minDate, maxDate, axisMode]);

  const tickWidth = autoTickWidth;
  const width = ticks.length * tickWidth + 40;

  // --- Expand/collapse state + tasks per project ---
  const [expanded, setExpanded] = useState(() => new Set());
  const toggleExpand = useCallback((pid) => {
    setExpanded(prev => {
      const next = new Set(prev);
      const key = String(pid);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const tasksByProject = useMemo(() => {
    const map = new Map();
    for (const t of tasks || []) {
      const pid = String(t.project_id);
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid).push(t);
    }
    return map;
  }, [tasks]);

  // --- Build rows: projects + (expanded) task rows ---
  const rows = useMemo(() => {
    const out = [];
    for (const p of projects) {
      out.push({ kind: "project", item: p });
      if (expanded.has(String(p.id))) {
        const children = tasksByProject.get(String(p.id)) || [];
        for (const t of children) {
          const s = getStartDate(t); // <- validate
          if (s) out.push({ kind: "task", item: t, parent: p });
        }
      }
    }
    return out;
  }, [projects, expanded, tasksByProject]);


  // --- Chart height from rows ---
  const height = useMemo(() => {
    let y = CHART_TOP;
    for (const r of rows) {
      y += (r.kind === "project" ? (BAR_HEIGHT + ROW_GAP) : (TASK_BAR_HEIGHT + TASK_ROW_GAP));
    }
    return y;
  }, [rows]);

  function getStartDate(obj) {
    return safeDate(obj.start_date) || safeDate(obj.start) || null;
  }
  function getEndDate(obj) {
    // If end missing/invalid, assume same-day task if start exists
    return safeDate(obj.end_date) || safeDate(obj.end) || getStartDate(obj) || null;
  }

  // --- Bar placement for any row object (project or task) ---
  function getBarIndices(p) {
    if (!ticks.length) return [0, 0];

    const start = getStartDate(p);
    const end = getEndDate(p);

    // defaults if we can’t resolve anything
    let sIdx = 0;
    let eIdx = ticks.length - 1;

    if (axisMode === "day") {
      if (start) {
        const i = ticks.findIndex(d => sameDay(d, start));
        sIdx = i >= 0 ? i : 0;
      }
      if (end) {
        const j = ticks.findIndex(d => sameDay(d, end));
        eIdx = j >= 0 ? j : sIdx;         // if end not found, collapse to start
      } else if (start) {
        eIdx = sIdx;                       // same-day if only start exists
      }
    } else if (axisMode === "week") {
      if (start) {
        const i = ticks.findIndex(w => start >= w && start < addWeeks(w, 1));
        sIdx = i >= 0 ? i : 0;
      }
      if (end) {
        const j = ticks.findIndex(w => end >= w && end < addWeeks(w, 1));
        eIdx = j >= 0 ? j : sIdx;
      } else if (start) {
        eIdx = sIdx;
      }
    } else if (axisMode === "month") {
      if (start) {
        const i = ticks.findIndex(m => start >= m && start < addMonths(m, 1));
        sIdx = i >= 0 ? i : 0;
      }
      if (end) {
        const j = ticks.findIndex(m => end >= m && end < addMonths(m, 1));
        eIdx = j >= 0 ? j : sIdx;
      } else if (start) {
        eIdx = sIdx;
      }
    } else if (axisMode === "year") {
      if (start) {
        const i = ticks.findIndex(y => start >= y && start < addYears(y, 1));
        sIdx = i >= 0 ? i : 0;
      }
      if (end) {
        const j = ticks.findIndex(y => end >= y && end < addYears(y, 1));
        eIdx = j >= 0 ? j : sIdx;
      } else if (start) {
        eIdx = sIdx;
      }
    }

    if (eIdx < sIdx) eIdx = sIdx; // never negative width
    return [sIdx, eIdx];
  }


  // --- Compute "today" x position ---
  const todayX = useMemo(() => {
    if (!ticks.length) return null;
    const now = new Date();
    if (now < ticks[0] || now >= addBoundary(ticks[ticks.length - 1], axisMode)) return null;

    for (let i = 0; i < ticks.length; i++) {
      const s = ticks[i];
      const e = addBoundary(s, axisMode);
      if (now >= s && now < e) {
        const frac = clamp((now - s) / (e - s), 0, 1);
        return i * tickWidth + frac * tickWidth + 1;
      }
    }
    return null;
  }, [ticks, axisMode, tickWidth]);

  // --- Jump marker state (for goToDate/Today) ---
  const [jumpX, setJumpX] = useState(null);
  useEffect(() => {
    if (jumpX == null) return;
    const t = setTimeout(() => setJumpX(null), 1400);
    return () => clearTimeout(t);
  }, [jumpX]);

  // --- Scrolling helpers ---
  const scrollRef = useRef(null);

  const centerOnX = useCallback((x) => {
    if (!scrollRef.current || x == null) return;
    const el = scrollRef.current;
    const target = Math.max(0, x - el.clientWidth / 2);
    el.scrollLeft = target;
  }, []);

  const getXForDate = useCallback((target) => {
    if (!ticks.length || !target) return null;

    const maxRight = addBoundary(ticks[ticks.length - 1], axisMode);
    if (target <= ticks[0]) return 1;
    if (target >= maxRight) return (ticks.length - 1) * tickWidth + (tickWidth - 1);

    for (let i = 0; i < ticks.length; i++) {
      const s = ticks[i];
      const e = addBoundary(s, axisMode);
      if (target >= s && target < e) {
        const frac = (target - s) / (e - s);
        return i * tickWidth + frac * tickWidth + 1;
      }
    }
    return null;
  }, [ticks, axisMode, tickWidth]);

  // --- Auto-center to Today on mount/axis change ---
  useLayoutEffect(() => {
    if (todayX == null) return;
    centerOnX(todayX);
  }, [todayX, centerOnX]);

  // --- Recenter on container resize ---
  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const ro = new ResizeObserver(() => {
      if (todayX == null) return;
      el.scrollLeft = Math.max(0, todayX - el.clientWidth / 2);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [todayX]);

  // --- Imperative API for parent (App.jsx) ---
  const goToDate = useCallback((date) => {
    if (!date) return;
    const d = new Date(date);
    d.setHours(0,0,0,0);
    const x = getXForDate(d);
    if (x == null) return;
    setJumpX(x);
    centerOnX(x);
  }, [getXForDate, centerOnX]);

  const goToToday = useCallback(() => {
    if (todayX == null) return;
    setJumpX(todayX);
    centerOnX(todayX);
  }, [todayX, centerOnX]);

  useImperativeHandle(ref, () => ({ goToDate, goToToday }), [goToDate, goToToday]);

  const handleRowClick = useCallback((e, isProject, projHasTasks, obj) => {
    if (!isProject) {
      onTaskClick && onTaskClick(obj);
      return;
    }
    if (projHasTasks && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) {
      e.preventDefault();
      e.stopPropagation();
      toggleExpand(obj.id);
      return;
    }
    onBarClick && onBarClick(obj);
  }, [onBarClick, onTaskClick, toggleExpand]);

  const handleRowDoubleClick = useCallback((e, isProject, projHasTasks, obj) => {
    if (!isProject || !projHasTasks) return;
    e.preventDefault();
    e.stopPropagation();
    toggleExpand(obj.id);
  }, [toggleExpand]);

  const handleRowContextMenu = useCallback((e, isProject, projHasTasks, obj) => {
    if (!isProject || !projHasTasks) return;
    e.preventDefault();
    e.stopPropagation();
    toggleExpand(obj.id);
  }, [toggleExpand]);

  // helper: compute dot Xs for continuous task
  const computeContinuousXs = useCallback((task) => {
    const start = getStartDate(task);
    if (!start || Number.isNaN(+start)) return [];

    // if no end given, use chart right bound
    const endRaw = task.end || task.end_date;
    const end = endRaw ? new Date(endRaw) : addBoundary(ticks[ticks.length - 1], axisMode);

    if (!ticks.length) return [];

    // choose recurrence from task or fall back to current axis granularity
    const unit = normRecurrenceUnit(task.recurrence_unit || task.recurrence, axisMode);
    const interval = Math.max(1, Number(task.recurrence_interval || 1));

    // clamp the range to the chart window
    const lo = ticks[0];
    const hi = addBoundary(ticks[ticks.length - 1], axisMode);
    let cur = start < lo ? lo : start;
    const last = end > hi ? hi : end;

    // align the first occurrence to >= cur by stepping from the actual start
    // (simple approach; good enough for UI)
    while (cur < start) cur = stepByUnit(cur, unit, interval);

    const out = [];
    let guard = 0;
    while (cur <= last && guard < 1000) { // guard against pathological inputs
      const x = getXForDate(cur);
      if (x != null) out.push(x);
      cur = stepByUnit(cur, unit, interval);
      guard++;
    }

    // dedupe same-tick Xs
    const uniq = [];
    let prevBucket = null;
    for (const x of out) {
      const bucket = Math.round(x / tickWidth); // per-tick bucket
      if (bucket !== prevBucket) uniq.push(x);
      prevBucket = bucket;
    }
    return uniq;
  }, [ticks, axisMode, tickWidth, getXForDate]);
  
  
  // --- Render ---
  if (!projects?.length) {
    return <div style={{textAlign:'center',color:'#888',padding:'2.5rem'}}>No projects to display.</div>;
  }

  return (
    <div className="gantt-outer" style={{
      background: "var(--panel, #181c22)",
      boxShadow: "0 3px 24px rgba(0,0,0,0.26)",
      padding: 0,
      width: "100%"
    }}>
      {/* SVG Timeline/Chart */}
      <div className="gantt-scrollable-chart-col">
        <div ref={scrollRef} style={{ overflowX: "auto", overflowY: "hidden" }}>
          <svg width={width} height={height} style={{ display: "block" }}>
            <defs>
              <filter id="chipGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#ffffff" floodOpacity="0.22"/>
              </filter>
              <radialGradient id="todayPulse" cx="50%" cy="50%" r="65%">
                <stop offset="0%" stopColor="var(--today-line, #7dfb00ff)" stopOpacity="0.15" />
                <stop offset="100%" stopColor="var(--today-line, #7dfb00ff)" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Timeline axis */}
            <g>
              {ticks.map((d, i) => (
                <g key={i}>
                  <text
                    x={i * tickWidth + tickWidth / 2}
                    y={28}
                    textAnchor="middle"
                    fontSize="10px"
                    fill="#fff"
                    fontFamily="Apotos, 72Brand, sans-serif"
                    fontWeight="600"
                  >{getLabel(d)}</text>
                  <line
                    x1={i * tickWidth}
                    y1={CHART_TOP - 8}
                    x2={i * tickWidth}
                    y2={height}
                    stroke="#23272e"
                    strokeWidth={1}
                  />
                </g>
              ))}

              {/* Today marker line + label */}
              {todayX != null && (
                <g>
                  <line
                    x1={todayX}
                    y1={CHART_TOP - 8}
                    x2={todayX}
                    y2={height}
                    stroke="#fff"
                    strokeWidth={3}
                    opacity={0.2}
                    strokeLinecap="round"
                  />
                  <line
                    x1={todayX}
                    y1={CHART_TOP - 8}
                    x2={todayX}
                    y2={height}
                    stroke="var(--today-line, #7dfb00ff)"
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                  <circle
                    cx={todayX}
                    cy={19}
                    r={11}
                    fill="url(#todayPulse)"
                    style={{ animation: "todayPulseAnim 4s ease-out infinite" }}
                    pointerEvents="none"
                  />
                  <g transform={`translate(${todayX}, 10)`} pointerEvents="none" filter="url(#chipGlow)">
                    <rect x={-26} y={-4} width={52} height={28} rx={12} fill="#000" opacity={0.30}/>
                    <rect x={-30} y={0} width={55} height={28} rx={8} fill="#333331ff" opacity={0.7}
                          stroke="var(--today-chip-bg, #7dfb00ff)" strokeWidth={.9}/>
                    <text
                      x={0}
                      y={12}
                      textAnchor="middle"
                      fontFamily="Apotos, 72Brand, sans-serif"
                      fill="#7dfb00ff"
                      stroke="#000"
                      strokeWidth={0.6}
                      strokeOpacity={0.25}
                      style={{ paintOrder: "stroke fill" }}
                    >
                      <tspan fontSize="10px" fontWeight="600" x="-2" dy="0">Today</tspan>
                      <tspan fontSize="7px"  fontWeight="100" x="-2" dy="11">{todayDateLabel}</tspan>
                    </text>
                  </g>
                </g>
              )}

              {/* Target marker (goToDate/Today) */}
              {jumpX != null && (
                <g>
                  <line
                    x1={jumpX}
                    y1={CHART_TOP - 8}
                    x2={jumpX}
                    y2={height}
                    stroke="var(--accent, #4dd0e1)"
                    strokeDasharray="2 4"
                    strokeWidth={2}
                    opacity={0.9}
                  />
                  <rect x={jumpX - 20} y={10} width={40} height={14} rx={7} fill="var(--accent, #4dd0e1)" opacity={0.18} />
                  <text
                    x={jumpX}
                    y={21}
                    textAnchor="middle"
                    fontSize="10px"
                    fontWeight={700}
                    fill="var(--accent, #4dd0e1)"
                    fontFamily="Apotos, 72Brand, sans-serif"
                  >Target</text>
                </g>
              )}
            </g>

            {/* Rows: projects + (optional) task sub-rows */}
            {(() => {
              let yCursor = CHART_TOP;

              return rows.map((r) => {
                const isProject = r.kind === "project";
                const obj = r.item; // project or task
                const rowH = isProject ? BAR_HEIGHT : TASK_BAR_HEIGHT;
                const rowGap = isProject ? ROW_GAP : TASK_ROW_GAP;

                const [sIdx, eIdx] = getBarIndices(obj);
                const barX = sIdx * tickWidth + 1;
                const barY = yCursor;
                const barW = Math.max(1, (eIdx - sIdx + 1) * tickWidth - 2);

                const status = normalizeStatus(obj.status);
                const color = STATUS_COLORS[status] || "#999";
                const maxTextWidth = Math.max(barW - 10, 22);
                const label = getEllipsisText(obj.name, maxTextWidth, FONT);

                // advance cursor
                yCursor += rowH + rowGap;

                // project state
                const tasksForProject = isProject ? (tasksByProject.get(String(obj.id)) || []) : [];
                const hasTasks = isProject && tasksForProject.length > 0;
                const isExpanded = isProject && expanded.has(String(obj.id));

                // chevron visibility
                const chevronVisible = isProject && hasTasks && barW > 28;
                const chevronX = Math.max(barX + 10, 8);
                const chevronY = barY + rowH / 2;

                // --- RENDER ---
                if (!isProject && isContinuousTask(obj)) {
                  // Continuous task: dots instead of a solid bar
                  const xs = computeContinuousXs(obj);
                  const cy = barY + rowH / 2;

                  return (
                    <g key={`${r.kind}-${obj.id}`}>
                      {/* faint baseline behind dots for alignment */}
                      <line
                        x1={barX}
                        y1={cy}
                        x2={barX + barW}
                        y2={cy}
                        stroke={color}
                        opacity={0.18}
                        strokeDasharray="3 6"
                        strokeWidth={2}
                        pointerEvents="none"
                      />
                      {/* dot series */}
                      <g
                        onClick={(e) => handleRowClick(e, false, false, obj)}
                        style={{ cursor: onTaskClick ? "pointer" : "default" }}
                      >
                        {xs.slice(0, 600).map((x, i) => (
                          <circle
                            key={`${obj.id}-dot-${i}`}
                            cx={x}
                            cy={cy}
                            r={DOT_R}
                            fill={color}
                            stroke="#fff"
                            strokeWidth="0.8"
                            opacity={0.95}
                          />
                        ))}
                      </g>

                      {/* Label (same positioning logic as bars) */}
                      {barW > 24 ? (
                        <text
                          x={barX + barW / 2}
                          y={barY + rowH / 2 + 2}
                          textAnchor="middle"
                          fontSize="9px"
                          fontWeight={500}
                          fill={getTextColorForStatus(status)}
                          fontFamily="Apotos, 72Brand, sans-serif"
                          pointerEvents="none"
                          style={{ userSelect: "none" }}
                        >
                          {label}
                          <title>{obj.name}</title>
                        </text>
                      ) : (
                        <text
                          x={barX + barW/2}
                          y={barY + rowH/2 + 2}
                          textAnchor="middle"
                          fontSize="9px"
                          fontWeight={500}
                          fill={getTextColorForStatus(status)}
                          fontFamily="Apotos, 72Brand, sans-serif"
                          pointerEvents="none"
                        >
                          {status?.[0] ?? "•"}
                          <title>{obj.name}</title>
                        </text>
                      )}
                    </g>
                  );
                }

                // default: project rows + discrete tasks → solid bars
                return (
                  <g key={`${r.kind}-${obj.id}`}>
                    {/* Optional indent guideline for tasks */}
                    {!isProject && (
                      <line
                        x1={0}
                        y1={barY + rowH/2}
                        x2={Math.min(barX - 4, 120)}
                        y2={barY + rowH/2}
                        stroke="rgba(255,255,255,0.08)"
                        strokeWidth="1"
                      />
                    )}

                    {/* Bar */}
                    <rect
                      x={barX}
                      y={barY}
                      width={barW}
                      height={rowH}
                      rx={isProject ? 8 : 6}
                      fill={color}
                      opacity={isProject ? 0.93 : 0.85}
                      style={{ cursor: isProject ? "pointer" : (onTaskClick ? "pointer" : "default") }}
                      onClick={(e) => handleRowClick(e, isProject, hasTasks, obj)}
                      onDoubleClick={(e) => handleRowDoubleClick(e, isProject, hasTasks, obj)}
                      onContextMenu={(e) => handleRowContextMenu(e, isProject, hasTasks, obj)}
                    />
                    <rect
                      x={barX}
                      y={barY}
                      width={barW}
                      height={rowH}
                      rx={isProject ? 8 : 6}
                      fill="none"
                      stroke="#fff"
                      strokeWidth={barW > 40 ? 2 : 1}
                      pointerEvents="none"
                      opacity={0.11}
                    />

                    {/* Label */}
                    {barW > 24 ? (
                      <text
                        x={barX + barW / 2}
                        y={barY + rowH / 2 + 2}
                        textAnchor="middle"
                        fontSize={isProject ? "10px" : "9px"}
                        fontWeight={isProject ? 600 : 500}
                        fill={getTextColorForStatus(status)}
                        fontFamily="Apotos, 72Brand, sans-serif"
                        pointerEvents="none"
                        style={{ userSelect: "none" }}
                      >
                        {label}
                        <title>{obj.name}</title>
                      </text>
                    ) : (
                      <text
                        x={barX + barW/2}
                        y={barY + rowH/2 + 2}
                        textAnchor="middle"
                        fontSize="9px"
                        fontWeight={500}
                        fill={getTextColorForStatus(status)}
                        fontFamily="Apotos, 72Brand, sans-serif"
                        pointerEvents="none"
                      >
                        {status?.[0] ?? "•"}
                        <title>{obj.name}</title>
                      </text>
                    )}

                    {/* Project row chevron */}
                    {chevronVisible && (
                      <g
                        transform={`translate(${chevronX}, ${chevronY})`}
                        onClick={(e) => { e.stopPropagation(); toggleExpand(obj.id); }}
                        style={{ cursor: "pointer" }}
                      >
                        <circle cx="0" cy="0" r={CHEVRON_R} fill="rgba(0,0,0,0)" />
                        {isExpanded ? (
                          <path d="M -5 -2 L 0 3 L 5 -2" fill="none" stroke="#fff" strokeWidth="2" />
                        ) : (
                          <path d="M -2 -5 L 3 0 L -2 5" fill="none" stroke="#fff" strokeWidth="2" />
                        )}
                        <title>{isExpanded ? "Collapse tasks" : "Expand tasks"}</title>
                      </g>
                    )}
                  </g>
                );
              });
            })()}

          </svg>
        </div>
      </div>
    </div>
  );
});
