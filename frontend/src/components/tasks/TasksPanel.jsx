// components/tasks/TasksPanel.jsx
import React, { useMemo, useState } from "react";
import IconButton from "../buttons/IconButton";
import { EditIcon, TrashIcon, GoToIcon } from "../icons";

export default function TasksPanel({
  tasks = [],
  people = [],
  setSelectedTask,
  setTaskModalOpen,
  onTaskDelete,          // (id) => Promise
  onFocusTask,           // (task) => void   <-- used on row click
  onFocusMany            // (ids[]) => void
}) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);

  const peopleById = useMemo(
    () => Object.fromEntries((people || []).map(p => [p.id, p])),
    [people]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter(t =>
      (t.name || "").toLowerCase().includes(q) ||
      (t.description || "").toLowerCase().includes(q) ||
      (t.status || "").toLowerCase().includes(q)
    );
  }, [tasks, query]);

  const toggleSelected = (id, checked) => {
    setSelectedIds(prev => checked ? [...prev, id] : prev.filter(x => x !== id));
  };

  const handleRowClick = (task) => {
    // PRIMARY action: focus the task in the graph
    onFocusTask?.(task);
  };

  const handleEdit = (task, e) => {
    e.stopPropagation();
    setSelectedTask?.(task);
    setTaskModalOpen?.(true);
  };

  const handleDelete = async (task, e) => {
    e.stopPropagation();
    const ok = window.confirm(`Delete task "${task.name || `Task ${task.id}`}"?`);
    if (!ok) return;
    try {
      await onTaskDelete?.(task.id);
      // optionally prune locally:
      // setTasks?.(list => list.filter(x => x.id !== task.id));
    } catch (err) {
      console.error(err);
      alert("Failed to delete task.");
    }
  };

  const handleFocusSelected = () => {
    if (!selectedIds.length) return;
    onFocusMany?.(selectedIds);
  };

  return (
    <div className="tasks-panel" style={{ display: "grid", gap: 10 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          placeholder="Search tasks…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: 1,
            background: "#111",
            border: "1px solid #333",
            color: "#eee",
            padding: "8px 10px",
            borderRadius: 8
          }}
        />
        <IconButton
          icon={<GoToIcon />}
          title={selectedIds.length ? `Focus ${selectedIds.length} selected` : "Focus selected"}
          variant="neutral"
          size={18}
          onClick={handleFocusSelected}
          disabled={!selectedIds.length}
        />
      </div>

      {/* List */}
      <div
        style={{
          border: "1px solid #333",
          borderRadius: 10,
          overflow: "hidden",
          background: "#0d0d0d",
          maxHeight: 420,
          overflowY: "auto"
        }}
      >
        {filtered.length === 0 && (
          <div style={{ padding: 14, color: "#888" }}>No tasks found.</div>
        )}

        {filtered.map((t) => {
          const assignees = (t.task_assignees || t.assignees || []).map(a => {
            const pid = a?.person_id ?? a?.id;
            return peopleById[pid]?.name || peopleById[pid]?.email || `Person ${pid}`;
          });
          const checked = selectedIds.includes(t.id);

          return (
            <div
              key={t.id}
              onClick={() => handleRowClick(t)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") handleRowClick(t); }}
              style={{
                display: "grid",
                gridTemplateColumns: "32px 1fr auto",
                gap: 10,
                alignItems: "center",
                padding: "10px 12px",
                borderBottom: "1px solid #222",
                cursor: "pointer"
              }}
            >
              <div>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => toggleSelected(t.id, e.target.checked)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: "#eaeaea" }}>
                  {t.name || `Task ${t.id}`}
                </div>
                <div style={{ color: "#aaa", fontSize: 12, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {t.description || "—"}
                </div>
                <div style={{ color: "#8aa", fontSize: 12, marginTop: 2 }}>
                  {t.status ? `Status: ${t.status}` : ""} {t.priority ? `• Priority: ${t.priority}` : ""}
                </div>
                {(t.start || t.end) && (
                  <div style={{ color: "#7a9", fontSize: 12, marginTop: 2 }}>
                    {t.start ? `Start: ${t.start}` : ""} {t.end ? `• End: ${t.end}` : ""}
                  </div>
                )}
                {!!assignees.length && (
                  <div style={{ color: "#9a9", fontSize: 12, marginTop: 2 }}>
                    Assignees: {assignees.join(", ")}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 6 }}>
                <IconButton
                  icon={<EditIcon />}
                  title="Edit task"
                  variant="neutral"
                  size={16}
                  onClick={(e) => handleEdit(t, e)}
                />
                <IconButton
                  icon={<TrashIcon />}
                  title="Delete task"
                  variant="danger"
                  size={16}
                  onClick={(e) => handleDelete(t, e)}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
