// /pmo/frontend/src/components/tasks/TaskTable.jsx
import React, { useMemo, useState } from "react";
import { TrashIcon } from "../icons";

const fmtDate = (d) => (d ? String(d).slice(0, 10) : "");
const toDate  = (d) => (d ? new Date(d) : null);
const startOfTodayLocal = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

// Priority ranking for consistent sort (High > Medium > Low)
const priorityRank = (p) => {
  const v = String(p || "").toLowerCase();
  if (v === "high") return 3;
  if (v === "medium") return 2;
  if (v === "low") return 1;
  return 0;
};

export default function TaskTable({
  tasks,
  onRowClick,
  showProject,
  peopleById = {},
  projectsById = {},
  onDeleteTask
}) {

  const includeActions = typeof onDeleteTask === "function";

  // Keep "today" stable for memoization
  const today = useMemo(() => startOfTodayLocal(), []);

  // ---- Normalize rows (assignees, derived fields) ----
  const rows = useMemo(() => {
    const list = Array.isArray(tasks) ? tasks : [];

    return list.map((task) => {
      const rawAssignees = task?.task_assignees || task?.assignees || [];
      const assigneesInfo = rawAssignees.map((a) => {
        const pid = a?.person_id ?? a?.id;
        const person = peopleById[pid] || {};
        const role = String(a?.role || "").trim();
        return {
          id: pid,
          name: person.name || person.email || `Person ${pid}`,
          role, // e.g. "Responsible", "Accountable", ...
        };
      });

      const responsible = assigneesInfo.filter(
        (a) => a.role.toLowerCase() === "responsible"
      );

      const names = assigneesInfo.map((a) => a.name);
      const display = names.slice(0, 2).join(", ");
      const extra = Math.max(0, names.length - 2);
      const assignedCell =
        names.length === 0 ? "" : `${display}${extra ? ` ${extra} more` : ""}`;

      const start = toDate(task.start);
      const end = toDate(task.end);

      // "Stale": planned end is in the past and not complete/canceled
      // If you truly want "end AFTER today" to be stale, flip to: end > today
      const status = String(task.status || "").toLowerCase();
      const isStale =
        !!end &&
        end < today &&
        !["complete", "completed", "canceled"].includes(status);

      return {
        ...task,
        _assigneesInfo: assigneesInfo,
        _assigneeCount: assigneesInfo.length,
        _hasResponsible: responsible.length > 0,
        _responsibleNames: responsible.map((r) => r.name),
        _assignedCell: assignedCell,
        _startDate: start,
        _endDate: end,
        _projectName: projectsById[task.project_id]?.name || "",
        _priorityRank: priorityRank(task.priority),
        _typeText:
          task.type ||
          (Array.isArray(task.tags) ? task.tags.map((t) => t.name).join(", ") : ""),
        _isStale: isStale,
      };
    });
  }, [tasks, peopleById, projectsById, today]);

  const [sort, setSort] = useState({ key: "start", dir: "asc" });

  const toggleSort = (key) => {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
                    : { key, dir: "asc" }
    );
  };

  const getVal = (r, key) => {
    switch (key) {
      case "name":      return String(r.name || "");
      case "project":   return String(r._projectName || "");
      case "type":      return String(r._typeText || "");
      case "priority":  return r._priorityRank; // numeric
      case "status":    return String(r.status || "");
      case "start":     return r._startDate ? r._startDate.getTime() : Number.POSITIVE_INFINITY;
      case "end":       return r._endDate   ? r._endDate.getTime()   : Number.POSITIVE_INFINITY;
      case "assignees": return r._assigneeCount;
      default:          return String(r[key] ?? "");
    }
  };

  const sorted = useMemo(() => {
    const list = rows.slice();
    const sortKey = sort.key;
    const sortDir = sort.dir;

    list.sort((a, b) => {
      const va = getVal(a, sortKey);
      const vb = getVal(b, sortKey);

      let cmp;
      if (typeof va === "string" && typeof vb === "string") {
        cmp = va.localeCompare(vb, undefined, { numeric: true, sensitivity: "base" });
      } else {
        cmp = va < vb ? -1 : va > vb ? 1 : 0;
      }
      if (cmp === 0) {
        // tie-break on name
        cmp = String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [rows, sort]);


  // ---- Render (no early return; show empty state inside table) ----
  const colCountBase = showProject ? 8 : 7;
  const colCount = colCountBase + (includeActions ? 1 : 0);
  const Th = ({ k, children, align = "left", width }) => {
    const active = sort.key === k;
    const arrow  = active ? (sort.dir === "asc" ? "▲" : "▼") : "";
    const aria   = active ? (sort.dir === "asc" ? "ascending" : "descending") : "none";

    return (
      <th style={{ textAlign: align, width }} aria-sort={aria}>
        <button
          type="button"
          onClick={() => toggleSort(k)}
          title={`Sort by ${k}`}
          style={{
            all: "unset",
            cursor: "pointer",
            color: active ? "var(--text)" : "var(--muted)",
            fontWeight: active ? 700 : 600,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 2px",
          }}
        >
          <span>{children}</span>
          <span style={{ fontSize: 10, opacity: active ? 1 : 0.4 }}>{arrow}</span>
        </button>
      </th>
    );
  };


  return (
    <table className="project-table">
      <thead>
        <tr>
          <Th k="name">Name</Th>
          {showProject && <Th k="project">Project</Th>}
          <Th k="type">Type</Th>
          <Th k="priority" align="center" width={90}>Priority</Th>
          <Th k="status" align="center" width={100}>Status</Th>
          <Th k="start" align="center" width={110}>Start</Th>
          <Th k="end" align="center" width={120}>End</Th>
          <Th k="assignees" align="left" width={160}>Assignees</Th>
          {includeActions && <th style={{ textAlign: "center", width: 64 }}>Actions</th>}
        </tr>
      </thead>
      <tbody>
        {sorted.length === 0 ? (
          <tr>
            <td colSpan={colCount} style={{ color: "#888", padding: "1.2em", textAlign: "center" }}>
              No tasks
            </td>
          </tr>
        ) : (
          sorted.map((task) => (
            <tr
              key={task.id}
              style={{ cursor: "pointer" }}
              onClick={() => onRowClick && onRowClick(task)}
            >
              <td>{task.name}</td>

              {showProject && <td>{task._projectName}</td>}

              <td>{task._typeText}</td>

              <td style={{ textAlign: "center" }}>
                {task.priority || "-"}
              </td>

              <td style={{ textAlign: "center" }}>
                {task.status || "-"}
              </td>

              <td style={{ textAlign: "center" }}>
                {fmtDate(task.start)}
              </td>

              <td style={{ textAlign: "center", whiteSpace: "nowrap" }}>
                {fmtDate(task.end)}
                {task._isStale && (
                  <span
                    style={{
                      marginLeft: 6,
                      fontSize: 10,
                      padding: "2px 6px",
                      borderRadius: 999,
                      border: "1px solid var(--border)",
                      background: "rgba(255,255,255,0.06)",
                      color: "var(--color-warning)",
                      fontWeight: 700,
                    }}
                    title="End date is in the past"
                  >
                    STALE
                  </span>
                )}
              </td>

              <td>
                {task._assigneesInfo?.length ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span style={{ opacity: 0.85 }}>
                      ({task._assigneesInfo.length})
                    </span>

                    {task._hasResponsible && (
                      <span
                        title={
                          task._responsibleNames?.length
                            ? `Responsible: ${task._responsibleNames.join(", ")}`
                            : "Responsible"
                        }
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: 18,
                          height: 18,
                          borderRadius: "50%",
                          background: "#00a656ff", // Responsible color
                          color: "#222b2e",
                          fontWeight: 700,
                          fontSize: 12,
                          lineHeight: "18px",
                        }}
                      >
                        R
                      </span>
                    )}

                    <span>{task._assignedCell}</span>
                  </span>
                ) : (
                  ""
                )}
              </td>
              {includeActions && (
                <td style={{ textAlign: "center" }}>
                  <button
                    type="button"
                    title={`Delete "${task.name}"`}
                    aria-label={`Delete ${task.name}`}
                    onClick={(e) => {
                      e.stopPropagation(); // don't trigger row click
                      if (confirm('Delete this task? This cannot be undone.')) {
                        onDeleteTask?.(task.id);
                      }
                    }}
                    style={{
                      background: "transparent", border: "1px solid var(--border)", borderRadius: 8,
                      padding: 4, lineHeight: 0, cursor: "pointer", color: "var(--danger)"
                    }}
                  ><TrashIcon size={16} /></button>
                </td>
              )}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
