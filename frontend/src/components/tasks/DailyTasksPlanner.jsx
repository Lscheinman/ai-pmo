// /pmo/frontend/src/components/tasks/DailyTasksPanel.jsx
import React, { useEffect, useMemo, useState } from "react";
import IconButton from "../buttons/IconButton";
import { GoToIcon, EditIcon, AddIcon, RiskIcon } from "../icons";
import { getDailyPlan } from "../../api/tasks";
import DateField from "../dates/DateField";

/** ---------- cache helpers (session-scoped) ---------- */
const CACHE_PREFIX = "DailyPlan:v5";
const cacheKey = (date, windowDays) => `${CACHE_PREFIX}:${date}:${windowDays}`;
const readCache = (d, w) => { try { const r = sessionStorage.getItem(cacheKey(d, w)); return r ? JSON.parse(r) : null; } catch { return null; } };
const writeCache = (d, w, plan) => { try { sessionStorage.setItem(cacheKey(d, w), JSON.stringify(plan)); } catch { /* empty */ } };

/**-- Helper to apply numbers to icon buttons */

/** Normalize arbitrary AI section names → the 5 buckets this panel renders */
function normalizePlan(raw) {
  if (!raw || !raw.sections) {
    return { date: raw?.date || "", generatedAt: raw?.generatedAt || "", sections: {}, counts: {} };
  }
  const s = raw.sections;
  const keyMap = {};
  Object.keys(s).forEach((k) => {
    if (!k) return;
    const norm = String(k).trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
    keyMap[norm] = s[k] || [];
  });
  const get = (...aliases) => {
    for (const a of aliases) {
      const norm = String(a).trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
      if (keyMap[norm]) return keyMap[norm];
    }
    return [];
  };
  const byId = (arr) => Object.fromEntries((arr || []).map((x) => [x.id, x]));
  const merge = (...lists) => Object.values(Object.assign({}, ...lists.map(byId)));
  const isRisk = (it) => (Array.isArray(it?.blockedBy) && it.blockedBy.length > 0) || /blocked|blocker|risk|escalat/i.test(it?.reason || "");
  const isQuick = (it) => {
    const pr = String(it?.priority || "").toLowerCase();
    const ef = String(it?.effort || "").toLowerCase();
    const tagHit = (it?.tags || []).some((t) => /quick|small|low\s*effort|short/i.test(String(t)));
    return pr === "low" || ef === "xs" || ef === "s" || tagHit;
  };

  const mustDo    = merge(get("mustdo", "must_do", "do_now", "today", "urgent", "top_priority", "now"));
  const shouldDo  = merge(get("due_soon", "upcoming", "soon", "next", "near_term"), get("backlog"));
  const followUps = merge(get("follow_ups", "follow-ups", "followups", "reviews", "review", "continuous", "ongoing", "maintenance"));
  const suggestions = get("suggestions", "ideas", "proposals");
  const quickWins = merge(suggestions.filter(isQuick), get("quick_wins", "quickwins", "low_effort"));
  const risks = merge(
    get("risks", "blocked", "blockers", "at_risk").filter(isRisk),
    mustDo.filter(isRisk),
    shouldDo.filter(isRisk),
    followUps.filter(isRisk),
    quickWins.filter(isRisk),
    suggestions.filter(isRisk)
  );

  const sections = { mustDo, quickWins, shouldDo, followUps, risks };
  const counts = Object.fromEntries(Object.entries(sections).map(([k, v]) => [k, (v || []).length]));
  return { date: raw.date, generatedAt: raw.generatedAt, sections, counts };
}

/** tiny inline chevron */
function Chevron({ open }) {
  const style = { transition: "transform 120ms ease", transform: open ? "rotate(90deg)" : "rotate(0deg)" };
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" style={style} aria-hidden="true">
      <path d="M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z" fill="currentColor" />
    </svg>
  );
}

/* --- local icons (inline to avoid touching your icons file) --- */
const ChevronDownIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M3.5 6.5l4.5 4 4.5-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const RefreshCycleIcon = ({ size = 16, spinning = false }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <g transform="translate(8 8)">
      {spinning && (
        <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="0.9s" repeatCount="indefinite"/>
      )}
    </g>
    <path d="M13 8a5 5 0 1 1-1.2-3.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    <path d="M10 2.5h3.5V6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const BoltIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M7 1L3 9h3v6l7-10H10V1H7z" fill="currentColor"/>
  </svg>
);

const WarningIcon = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
    <path d="M8 2l6.5 11H1.5L8 2z" stroke="currentColor" strokeWidth="1.4" fill="none"/>
    <path d="M8 6v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
    <circle cx="8" cy="12.2" r="0.9" fill="currentColor"/>
  </svg>
);

/* --- icon button with small count badge (hides at 0) --- */
// --- icon button with small count badge (hides at 0) ---
function IconBadgeButton({ title, colorVar = "--accent", count, onClick, children, size = 36, dot = false }) {
  const show = typeof count === "number" && count > 0;
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="icon-badge-btn"
      style={{
        position: "relative",
        width: size,
        height: size,
        borderRadius: 10,
        border: "1px solid var(--border)",
        background: "var(--panel)",
        color: "var(--text)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow: dot ? "0 0 0 2px rgba(199,159,0,0.25)" : "none" // soft glow when stale
      }}
    >
      {/* dot indicator */}
      {dot && (
        <span
          style={{
            position: "absolute",
            left: -2,
            top: -2,
            width: 8,
            height: 8,
            borderRadius: 999,
            background: "var(--color-warning)",
            border: "1px solid rgba(0,0,0,0.45)",
          }}
        />
      )}

      {children}

      {/* numeric badge */}
      {show && (
        <span
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            transform: "translate(50%, -50%)",
            minWidth: 16,
            height: 16,
            padding: "0 5px",
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 800,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: `var(${colorVar})`,
            color: "#fff",
            border: "1px solid rgba(0,0,0,0.35)",
            lineHeight: 1,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}


/* --- compact look-ahead dropdown button (+Nd) --- */
function LookaheadDropdown({ value, onChange }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const opts = [1, 3, 7, 14];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="filter-input"
        onClick={() => setOpen(o => !o)}
        style={{
          width: 84,
          minWidth: 84,
          flex: "0 0 84px",
          textAlign: "left",
          paddingRight: 26,
          fontStyle: "italic",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {`+${value}d`}
        <span style={{ marginLeft: "auto", display: "inline-flex" }}><ChevronDownIcon /></span>
      </button>

      {open && (
        <div className="tag-filter-popover" style={{ left: 0, right: "auto", width: 120 }}>
          {opts.map(d => (
            <button
              key={d}
              type="button"
              onClick={() => { onChange?.(d); setOpen(false); }}
              className="link-btn"
              style={{
                width: "100%",
                textAlign: "left",
                padding: "6px 8px",
                borderRadius: 6,
                background: d === value ? "rgba(255,255,255,0.06)" : "transparent",
              }}
            >
              +{d} days
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** date helpers */
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0,10) : new Date(d).toISOString().slice(0,10));

export default function DailyTasksPanel({
  tasks = [],
  projects = [],
  onFocusTask,
  setSelectedTask,
  setTaskModalOpen,
  onQuickCreate, // optional: (suggestion) => Promise<Task>
}) {
  // Base date (today) + look-ahead window (defaults to +3)

  const isoLocal = (d = new Date()) => {
    const z = new Date(d);
    z.setMinutes(z.getMinutes() - z.getTimezoneOffset());
    return z.toISOString().slice(0, 10);
  };
  const [date, setDate] = useState(() => isoLocal());
  const [windowDays, setWindowDays] = useState(3);

  // backend options (kept simple)
  const includeSuggestions = true;
  const maxItems = 40;

  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState("");
  const [lastRun, setLastRun] = useState({ date: null, windowDays: null }); // for “stale” indicator

  // Accordion: only one open, default "mustDo"
  const [openKey, setOpenKey] = useState("mustDo");

  const projectsById = useMemo(() => Object.fromEntries((projects || []).map(p => [p.id, p])), [projects]);
  const tasksById = useMemo(() => Object.fromEntries((tasks || []).map(t => [t.id, t])), [tasks]);

  // Local fallback (desc as brief advice; no assignee names)
  function buildLocalPlan(targetDateStr, winDays) {
    const end = new Date(new Date(targetDateStr).getTime() + (winDays || 0) * 86400000);
    const toISO = (d) => (d ? iso(d) : null);
    const isToday = (d) => d && toISO(d) === targetDateStr;
    const isOverdue = (d) => d && new Date(d) < new Date(targetDateStr);
    const isSoon = (d) => d && new Date(d) > new Date(targetDateStr) && new Date(d) <= end;

    const normalize = (t) => {
      const urgency = isToday(t.end) || isOverdue(t.end) ? "today" : isSoon(t.end) ? "soon" : "later";
      const reason = isOverdue(t.end) ? "Overdue" : isToday(t.end) ? "Due today" : isSoon(t.end) ? "Upcoming" : "";
      const advice = [
        (reason === "Overdue" || reason === "Due today") ? "Finish today to avoid slippage." : "",
        (t.priority || "medium") === "high" ? "High priority; tackle early." : "",
        String(t.status || "").toLowerCase() === "blocked" ? "If blocked, request an unblocker." : "",
      ].filter(Boolean).join(" ");
      return {
        id: `task-${t.id}`,
        kind: "task",
        title: t.name,
        desc: advice,
        priority: (t.priority || "medium"),
        urgency,
        reason,
        dueDate: toISO(t.end),
        taskId: t.id,
        projectId: t.project_id ?? null,
        projectName: projectsById[t.project_id]?.name || "",
        isContinuous: Boolean(t.is_continuous),
        tags: (t.tags || []).map(tag => tag.name),
      };
    };

    const mustDo = [], quickWins = [], shouldDo = [], followUps = [], risks = [];
    for (const t of tasks) {
      if (!t?.name) continue;
      const item = normalize(t);
      if (item.reason === "Overdue" || item.reason === "Due today")            mustDo.push(item);
      else if ((t.priority || "medium") === "high" && item.urgency !== "later") mustDo.push(item);
      else if ((t.priority || "medium") === "low"  && item.urgency !== "later") quickWins.push(item);
      else if (item.urgency === "soon")                                         shouldDo.push(item);
      if (String(t.status || "").toLowerCase() === "blocked")
        risks.push({ ...item, reason: item.reason ? `${item.reason}; Blocked` : "Blocked" });
    }

    return {
      date: targetDateStr,
      generatedAt: new Date().toISOString(),
      sections: { "Do Now": mustDo, "Quick Wins": quickWins, "Due Soon": shouldDo, "Follow-Ups": followUps, "Risks": risks },
      counts: {}
    };
  }

  async function fetchPlan(force = false) {
    setLoading(true);
    setError("");

    if (!force) {
      const cached = readCache(date, windowDays);
      if (cached) {
        setPlan(cached);
        setLastRun({ date, windowDays });
        setLoading(false);
        return;
      }
    }

    try {
      const res = await getDailyPlan({ date, windowDays, maxItems, includeSuggestions });
      setPlan(res);
      setLastRun({ date, windowDays });
      writeCache(date, windowDays, res);
    } catch (e) {
      console.warn("AI plan failed, using local fallback:", e);
      const fallback = buildLocalPlan(date, windowDays);
      setPlan(fallback);
      setLastRun({ date, windowDays });
      writeCache(date, windowDays, fallback);
      setError("AI plan unavailable; showing local plan.");
    } finally {
      setLoading(false);
    }
  }

  // On first mount: cache-first, else fetch once
  useEffect(() => {
    const cached = readCache(date, windowDays);
    if (cached) { setPlan(cached); setLastRun({ date, windowDays }); return; }
    fetchPlan(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If user tweaks date/windowDays, show cached for that combo (no auto fetch)
  useEffect(() => {
    const cached = readCache(date, windowDays);
    if (cached) { setPlan(cached); setLastRun({ date, windowDays }); }
  }, [date, windowDays]);

  const norm = useMemo(() => normalizePlan(plan), [plan]);
  const counts = norm?.counts || {};
  const stale = lastRun.date !== date || lastRun.windowDays !== windowDays;

  const priorityColor = (p) => {
    const v = String(p || "").toLowerCase();
    if (v === "high") return "var(--danger)";
    if (v === "low")  return "var(--success)";
    return "var(--color-warning)";
  };
  const urgencyColor = (u) => {
    const v = String(u || "").toLowerCase();
    if (v === "today") return "var(--status-running)";
    if (v === "soon")  return "var(--muted)";
    return "#9e9e9e";
  };

  function SectionHeader({ id, title, count, open, onToggle }) {
    return (
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={open}
        aria-controls={`panel-${id}`}
        className="section-toggle"
        style={{
          width: "100%",
          textAlign: "left",
          background: "var(--panel)",
          border: "1.5px solid var(--border)",
          borderRadius: 10,
          padding: "10px 12px",
          color: "var(--text)",
          display: "flex",
          alignItems: "center",
          gap: 12
        }}
      >
        <Chevron open={open} />
        <span style={{ fontWeight: 700 }}>{title}</span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            padding: "2px 8px",
            borderRadius: 999,
            border: "1px solid var(--border)",
            background: "rgba(255,255,255,0.06)",
            color: "var(--muted)"
          }}
        >
          {count ?? 0}
        </span>
      </button>
    );
  }

  function SectionBody({ items }) {
    if (!items?.length) {
      return (
        <div style={{ borderLeft: "1px solid var(--border)", marginLeft: 12, paddingLeft: 12, color: "#888", fontSize: 12 }}>
          No items.
        </div>
      );
    }
    return (
      <div style={{ border: "1.5px solid var(--border)", borderRadius: 10, overflow: "hidden", background: "var(--panel)" }}>
        {items.map(item => {
          const isTask = item.kind === "task" && item.taskId && tasksById[item.taskId];
          const taskObj = isTask ? tasksById[item.taskId] : null;
          const projectName = item.projectName || (taskObj ? (projectsById[taskObj.project_id]?.name || "") : "");
          return (
            <div
              key={item.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 12,
                alignItems: "center",
                padding: "12px 14px",
                borderBottom: "1px solid var(--border)"
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.title}
                  </span>
                  <span style={{
                    fontSize: 11, padding: "2px 8px", borderRadius: 999, border: "1px solid var(--border)",
                    background: "rgba(255,255,255,0.06)", color: priorityColor(item.priority)
                  }}>
                    {(item.priority || "").toUpperCase()}
                  </span>
                  <span style={{
                    fontSize: 11, padding: "2px 8px", borderRadius: 999, border: "1px solid var(--border)",
                    background: "rgba(255,255,255,0.06)", color: urgencyColor(item.urgency)
                  }}>
                    {(item.urgency || "").toUpperCase()}
                  </span>
                  {item.isContinuous && (
                    <span style={{ fontSize: 11, color: "var(--muted)", border: "1px dashed var(--border)", borderRadius: 999, padding: "2px 6px" }}>
                      continuous
                    </span>
                  )}
                  {projectName && (
                    <span style={{ fontSize: 11, color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 999, padding: "2px 6px" }}>
                      {projectName}
                    </span>
                  )}
                  {item.dueDate && <span style={{ fontSize: 11, color: "var(--muted)" }}>• due {item.dueDate}</span>}
                </div>
                {(item.desc || item.reason) && (
                  <div style={{ color: "#aab", fontSize: 12, marginTop: 6, lineHeight: 1.4 }}>
                    {item.desc}
                    {item.reason ? <em style={{ color: "var(--muted)" }}> {item.desc ? " — " : ""}{item.reason}</em> : null}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {isTask ? (
                  <>
                    <IconButton
                      icon={<GoToIcon />}
                      title="Focus in graph"
                      variant="neutral"
                      size={16}
                      onClick={() => onFocusTask?.(taskObj)}
                    />
                    <IconButton
                      icon={<EditIcon />}
                      title="Edit task"
                      variant="neutral"
                      size={16}
                      onClick={() => { setSelectedTask?.(taskObj); setTaskModalOpen?.(true); }}
                    />
                  </>
                ) : (
                  <IconButton
                    icon={<AddIcon />}
                    title="Create task"
                    variant="success"
                    size={16}
                    onClick={async () => {
                      if (!onQuickCreate) return;
                      try {
                        const newTask = await onQuickCreate(item);
                        onFocusTask?.(newTask);
                      } catch (e) {
                        alert(e?.message || "Failed to create task from suggestion.");
                      }
                    }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const toggleSection = (key) => setOpenKey(prev => prev === key ? "" : key);

  return (
    <div className="daily-panel" style={{ display: "grid", gap: 14, padding: "8px 10px 0" }}>
      {/* ===== Header ===== */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",  // left group auto, counters sit in a full-width center lane
          gap: 12,
          alignItems: "center",
          padding: "6px 10px 10px",        // a touch of side padding
          borderBottom: "1px solid var(--border)",
        }}
      >
        {/* Left: date + look-ahead dropdown + refresh */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <DateField
            label=""              // no label – keeps it tight
            name="date"
            value={date}
            onChange={(e) => setDate(e?.target?.value || new Date().toISOString().slice(0,10))}
            weekStartsOn={1}
            locale="en-US"
          />

          <LookaheadDropdown
            value={windowDays}
            onChange={(d) => { setWindowDays(d); /* optionally mark stale */ }}
          />

          <IconBadgeButton
            title={loading ? "Loading…" : "Refresh"}
            colorVar="--accent"
            onClick={() => fetchPlan(true)}
            dot={stale} 
          >
            <RefreshCycleIcon size={16} spinning={loading} />
          </IconBadgeButton>
        </div>

        {/* Right: counters (click to open sections) */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center" }}>
          <IconBadgeButton
            title="Open Do now"
            colorVar="--status-running"
            count={counts?.mustDo ?? 0}
            onClick={() => setOpenKey?.("mustDo")}
          >
            <BoltIcon size={16} />
          </IconBadgeButton>

          <IconBadgeButton
            title="Open Risks"
            colorVar="--color-warning"
            count={counts?.risks ?? 0}
            onClick={() => setOpenKey?.("risks")}
          >
            <WarningIcon size={16} />
          </IconBadgeButton>
        </div>
      </div>
      {error && (
        <div
          role="alert"
          style={{
            marginTop: 8,
            padding: "6px 10px",
            borderRadius: 8,
            background: "rgba(199,159,0,0.12)",
            border: "1px solid var(--color-warning)",
            color: "var(--color-warning)",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}
      {/* ===== Accordion Sections (only Must do open by default) ===== */}
      <div className="sections" style={{ display: "grid", gap: 12 }}>
        <div>
          <SectionHeader id="mustDo" title="Must do today" count={counts.mustDo} open={openKey === "mustDo"} onToggle={toggleSection} />
          {openKey === "mustDo" && <div id="panel-mustDo" style={{ marginTop: 8 }}><SectionBody items={norm?.sections?.mustDo} /></div>}
        </div>
        <div>
          <SectionHeader id="risks" title="Risks / Blocked" count={counts.risks} open={openKey === "risks"} onToggle={toggleSection} />
          {openKey === "risks" && <div id="panel-risks" style={{ marginTop: 8 }}><SectionBody items={norm?.sections?.risks} /></div>}
        </div>
        <div>
          <SectionHeader id="quickWins" title="Quick wins" count={counts.quickWins} open={openKey === "quickWins"} onToggle={toggleSection} />
          {openKey === "quickWins" && <div id="panel-quickWins" style={{ marginTop: 8 }}><SectionBody items={norm?.sections?.quickWins} /></div>}
        </div>
        <div>
          <SectionHeader id="shouldDo" title="Should do soon" count={counts.shouldDo} open={openKey === "shouldDo"} onToggle={toggleSection} />
          {openKey === "shouldDo" && <div id="panel-shouldDo" style={{ marginTop: 8 }}><SectionBody items={norm?.sections?.shouldDo} /></div>}
        </div>
        <div>
          <SectionHeader id="followUps" title="Follow-ups & reviews" count={counts.followUps} open={openKey === "followUps"} onToggle={toggleSection} />
          {openKey === "followUps" && <div id="panel-followUps" style={{ marginTop: 8 }}><SectionBody items={norm?.sections?.followUps} /></div>}
        </div>
      </div>
    </div>
  );
}
