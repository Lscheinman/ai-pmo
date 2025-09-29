// frontend/src/components/people/RolesAssigner.jsx
import React, { useState, useRef, useEffect, useMemo } from "react";
import IconButton from "../buttons/IconButton";
import { AddIcon, TasksIcon } from "../icons";
import FilterInput from "../FilterInput";

const ROLES = ["Responsible", "Accountable", "Consulted", "Informed"];
const ROLE_COLORS = {
  Responsible: "#00a656ff",
  Accountable: "#0077ffff",
  Consulted: "#d49904ff",
  Informed: "#7e19f3ff"
};

// For task assignment
const RACI_KEYS = ["R", "A", "C", "I"];
const RACI_LABELS = { R: "Responsible", A: "Accountable", C: "Consulted", I: "Informed" };

export default function RolesAssigner({
  people = [],
  value = [],
  onChange,
  onAddPerson,

  // NEW: provide project tasks + a handler to assign one person to one task
  tasksInProject = [],
  onAssignToTask, // async ({ personId, taskId, role }) => void
}) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const filterRef = useRef();

  // NEW: per-person task popover
  const [assignForId, setAssignForId] = useState(null);
  const [assignRoleKey, setAssignRoleKey] = useState("R");
  const [taskQuery, setTaskQuery] = useState("");
  const popRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setShowRoleDropdown(false);
      }
    }
    if (showRoleDropdown) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [showRoleDropdown]);

  // Close task popover on outside click
  useEffect(() => {
    function onDoc(e) {
      if (assignForId && popRef.current && !popRef.current.contains(e.target)) {
        setAssignForId(null);
        setTaskQuery("");
      }
    }
    if (assignForId) {
      document.addEventListener("mousedown", onDoc);
      return () => document.removeEventListener("mousedown", onDoc);
    }
  }, [assignForId]);

  const assigned = value.map(ap => ({
    ...ap,
    person: people.find(p => p.id === ap.person_id)
  }));

  const filtered = people.filter(
    p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase())
  );

  function isAssigned(id) {
    return value.some(ap => ap.person_id === id);
  }

  function handleAdd(person) {
    if (!isAssigned(person.id)) {
      onChange([...value, { person_id: person.id, role: ROLES[0] }]);
    }
  }

  function handleRoleChange(person_id, newRole) {
    onChange(
      value.map(ap =>
        ap.person_id === person_id ? { ...ap, role: newRole } : ap
      )
    );
  }

  function handleRemove(person_id) {
    onChange(value.filter(ap => ap.person_id !== person_id));
  }

  const filteredAssigned = roleFilter
    ? assigned.filter(ap => ap.role === roleFilter)
    : assigned;

  // NEW: tasks filter for the popover
  const filteredTasks = useMemo(() => {
    const list = Array.isArray(tasksInProject) ? tasksInProject : [];
    const q = taskQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(t =>
      (t.name && t.name.toLowerCase().includes(q)) ||
      (t.description && t.description.toLowerCase().includes(q))
    );
  }, [tasksInProject, taskQuery]);

  return (
    <div style={{ width: "100%" }}>
      {/* Toolbar row: Search | Role filter | Add Person */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 9
        }}
      >
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Add/search people…"
          style={{
            flex: 1,
            borderRadius: 7,
            border: "1.4px solid #242b39",
            background: "#232c3b",
            color: "#fafbfc",
            padding: "0.45em 1em",
            fontSize: "1em"
          }}
        />

        <div style={{ position: "relative" }} ref={filterRef}>
          <button
            type="button"
            onClick={() => setShowRoleDropdown(v => !v)}
            style={{
              background: "none",
              border: "1.4px solid #242b39",
              borderRadius: 7,
              padding: "0.4em 0.6em",
              cursor: "pointer",
              color: roleFilter ? ROLE_COLORS[roleFilter] : "#8cf3ca",
              fontSize: 18
            }}
            title={roleFilter ? `Role: ${roleFilter}` : "Filter by role"}
            aria-haspopup="menu"
            aria-expanded={showRoleDropdown}
          >
            <i className="fas fa-filter" />
          </button>

          {showRoleDropdown && (
            <div
              role="menu"
              style={{
                position: "absolute",
                right: 0,
                top: 36,
                background: "#242b39",
                border: "1.3px solid #283043",
                borderRadius: 7,
                zIndex: 99,
                minWidth: 130,
                boxShadow: "0 4px 16px #0005"
              }}
            >
              <div
                onClick={() => {
                  setRoleFilter("");
                  setShowRoleDropdown(false);
                }}
                style={{
                  padding: "8px 14px",
                  cursor: "pointer",
                  color: roleFilter ? "#fff" : "#2ae98d",
                  fontWeight: roleFilter ? 400 : 600
                }}
                role="menuitem"
              >
                All Roles
              </div>
              {ROLES.map(r => (
                <div
                  key={r}
                  onClick={() => {
                    setRoleFilter(r);
                    setShowRoleDropdown(false);
                  }}
                  style={{
                    padding: "8px 14px",
                    cursor: "pointer",
                    color: r === roleFilter ? "#2ae98d" : "#fafbfc",
                    fontWeight: r === roleFilter ? 600 : 400,
                    background: r === roleFilter ? "#202632" : "none"
                  }}
                  role="menuitem"
                >
                  <span style={{ color: ROLE_COLORS[r], marginRight: 7 }}>●</span>
                  {r}
                </div>
              ))}
            </div>
          )}
        </div>
        <IconButton
          icon={<AddIcon />}
          title="Add Person"
          variant="success"
          size={18}
          onClick={onAddPerson}
        />
      </div>

      {/* Search results */}
      {search && filtered.length > 0 && (
        <div
          style={{
            maxHeight: 120,
            overflowY: "auto",
            border: "1.1px solid #232c3b",
            borderRadius: 8,
            background: "#181c22",
            padding: 6,
            marginBottom: 7
          }}
        >
          {filtered.map(person => {
            const assignedObj = assigned.find(a => a.person_id === person.id);
            const highlight = !!assignedObj;
            return (
              <div
                key={person.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "4px 0",
                  background: highlight ? "#2ae98d22" : "none",
                  borderRadius: 6,
                  opacity: highlight ? 0.7 : 1,
                  cursor: highlight ? "not-allowed" : "pointer",
                  pointerEvents: highlight ? "none" : "auto"
                }}
                onClick={() => handleAdd(person)}
                title={highlight ? "Already assigned" : "Add to project"}
              >
                {highlight && (
                  <span
                    style={{
                      display: "inline-block",
                      width: 21,
                      height: 21,
                      borderRadius: "50%",
                      background: ROLE_COLORS[assignedObj.role],
                      color: "#222b2e",
                      fontWeight: 700,
                      textAlign: "center",
                      lineHeight: "21px",
                      fontSize: "0.99em"
                    }}
                  >
                    {assignedObj.role[0]}
                  </span>
                )}
                <span style={{ fontWeight: 500 }}>{person.name}</span>
                <span style={{ color: "#aaa", fontSize: "0.96em" }}>
                  ({person.email})
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Assigned table */}
      {filteredAssigned.length > 0 ? (
        <div
          style={{
            width: "100%",
            display: "table",
            marginTop: 8,
            borderCollapse: "separate",
            borderSpacing: "0 2px"
          }}
        >
          {filteredAssigned.map(({ person_id, person, role }) => (
            <div
              key={person_id}
              style={{
                display: "table-row",
                background: "#22262b",
                borderRadius: 7
              }}
            >
              <div
                style={{
                  display: "table-cell",
                  padding: "6px 8px",
                  verticalAlign: "middle",
                  minWidth: 120
                }}
              >
                <div style={{ fontWeight: 600, fontSize: "1em", color: "#fff" }}>
                  {person?.name || (<span style={{ color: "#999" }}>Unknown</span>)}
                </div>
                <div style={{ fontSize: "0.92em", color: "#bbb" }}>
                  {person?.email || (<span style={{ color: "#888" }}>No email</span>)}
                </div>
              </div>

              <div
                style={{
                  display: "table-cell",
                  textAlign: "center",
                  verticalAlign: "middle"
                }}
              >
                <div style={{ display: "flex", justifyContent: "center", gap: 3 }}>
                  {ROLES.map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => handleRoleChange(person_id, r)}
                      style={{
                        fontWeight: 600,
                        borderRadius: 13,
                        border: "none",
                        padding: "2px 11px",
                        fontSize: "0.97em",
                        background: r === role ? ROLE_COLORS[r] : "#181c22",
                        color: r === role ? "#222b2e" : "#aaa",
                        cursor: "pointer"
                      }}
                      title={r}
                    >
                      {r.charAt(0)}
                    </button>
                  ))}
                </div>
              </div>

              <div
                style={{
                  display: "table-cell",
                  textAlign: "right",
                  verticalAlign: "middle",
                  position: "relative"
                }}
              >
                {/* NEW: Add-to-task icon */}
                <IconButton
                  icon={<TasksIcon />}
                  title="Add to a task"
                  variant="neutral"
                  size={18}
                  onClick={() => setAssignForId(v => (v === person_id ? null : person_id))}
                  disabled={!tasksInProject?.length}
                />

                <button
                  type="button"
                  onClick={() => handleRemove(person_id)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#d66",
                    fontSize: 17,
                    cursor: "pointer",
                    marginLeft: 6
                  }}
                  title="Remove"
                >
                  ×
                </button>

                {/* NEW: Popover */}
                {assignForId === person_id && (
                  <div
                    ref={popRef}
                    className="assign-popover"
                    role="dialog"
                    aria-label="Assign to task"
                    style={{
                      position: "absolute",
                      right: 36,
                      top: "50%",
                      transform: "translateY(-50%)",
                      minWidth: 260,
                      maxWidth: 320,
                      background: "#1e232a",
                      border: "1px solid #2a3343",
                      borderRadius: 10,
                      boxShadow: "0 12px 28px rgba(0,0,0,0.45)",
                      padding: 10,
                      zIndex: 2000
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 8
                      }}
                    >
                      <span className="muted">RACI</span>
                      <select
                        value={assignRoleKey}
                        onChange={(e) => setAssignRoleKey(e.target.value)}
                        style={{
                          background: "#202632",
                          color: "#f3f6fc",
                          border: "1.4px solid #242b39",
                          borderRadius: 7,
                          padding: "0.35em 0.55em"
                        }}
                        aria-label="RACI role"
                      >
                        {RACI_KEYS.map(k => (
                          <option key={k} value={k}>
                            {RACI_LABELS[k]} ({k})
                          </option>
                        ))}
                      </select>
                    </div>

                    <FilterInput
                      value={taskQuery}
                      onChange={setTaskQuery}
                      placeholder="Search tasks…"
                    />

                    <div
                      style={{
                        marginTop: 8,
                        maxHeight: 220,
                        overflow: "auto",
                        borderRadius: 8,
                        background: "#181c22",
                        border: "1px solid #232c3b"
                      }}
                    >
                      {filteredTasks.length === 0 && (
                        <div
                          style={{ padding: 10, color: "#9aa6aa", textAlign: "center" }}
                        >
                          No matching tasks
                        </div>
                      )}
                      {filteredTasks.slice(0, 60).map(t => (
                        <button
                          key={t.id}
                          type="button"
                          title={`Add ${person?.name || "person"} to "${t.name}" as ${assignRoleKey}`}
                          onClick={async () => {
                            try {
                              await onAssignToTask?.({
                                personId: person_id,
                                taskId: t.id,
                                role: assignRoleKey
                              });
                            } finally {
                              setAssignForId(null);
                              setTaskQuery("");
                            }
                          }}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "8px 10px",
                            background: "transparent",
                            border: "none",
                            color: "#eaeaea",
                            cursor: "pointer"
                          }}
                          className="assign-popover__item"
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ color: "#999", marginTop: 6 }}>None assigned</div>
      )}
    </div>
  );
}
