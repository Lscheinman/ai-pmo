// frontend/src/components/groups/GroupsModal.jsx
import React, { useEffect, useMemo, useState } from "react";
import Modal from "../Modal";
import PersonMultiSelect from "../people/PersonMultiSelect";
import FilterInput from "../FilterInput";
import IconButton from "../buttons/IconButton";
import { CopyEmailIcon, SaveIcon, EyeIcon, AddIcon } from "../icons";

const RACI_OPTIONS = ["R", "A", "C", "I"]; // default I
const RACI_LABELS = {
  R: "Responsible",
  A: "Accountable",
  C: "Consulted",
  I: "Informed",
};

export default function GroupsModal({
  open,
  group,
  people,
  projects = [],
  tasks = [],
  onSave,
  onClose,
  onAssignGroup,
  setToast,
}) {
  const [form, setForm] = useState({ name: "", member_ids: [] });

  // Assign UI state
  const [assignType, setAssignType] = useState("project"); // "project" | "task"
  const [assignQuery, setAssignQuery] = useState("");
  const [assignRole, setAssignRole] = useState("I");
  const [assignBusy, setAssignBusy] = useState(false);
  const [selectedTargetIds, setSelectedTargetIds] = useState(() => new Set());

  // Task filters
  const [taskProjectFilterId, setTaskProjectFilterId] = useState("all");

  // Members viewer (compact)
  const [membersViewerOpen, setMembersViewerOpen] = useState(false);
  const [membersFilter, setMembersFilter] = useState("");

  useEffect(() => {
    if (!open) return;
    if (group) {
      setForm({
        name: group.name || "",
        member_ids: (group.members || []).map((p) => p.id),
      });
    } else {
      setForm({ name: "", member_ids: [] });
    }
    setAssignType("project");
    setAssignQuery("");
    setAssignRole("I");
    setAssignBusy(false);
    setSelectedTargetIds(new Set());
    setMembersViewerOpen(false);
    setMembersFilter("");
    setTaskProjectFilterId("all");
  }, [open, group]);

  const projectsById = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p])),
    [projects]
  );

  const selectedPeople = useMemo(() => {
    const idSet = new Set(form.member_ids || []);
    return (people || [])
      .filter((p) => idSet.has(p.id))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [people, form.member_ids]);

  const filteredMembers = useMemo(() => {
    const q = membersFilter.trim().toLowerCase();
    if (!q) return selectedPeople;
    return selectedPeople.filter(
      (m) =>
        (m.name && m.name.toLowerCase().includes(q)) ||
        (m.email && m.email.toLowerCase().includes(q))
    );
  }, [selectedPeople, membersFilter]);

  // Targets list (projects or tasks)
  const targets = useMemo(() => {
    if (assignType === "project") {
      return (projects || []).map((p) => ({
        id: p.id,
        label: (p.name || `Project #${p.id}`).trim(),
      }));
    }
    // tasks
    return (tasks || []).map((t) => {
      const p = t.project_id ? projectsById[t.project_id] : null;
      const name = (t.name || `Task #${t.id}`).trim();
      const suffix = p ? ` · ${p.name}` : "";
      const dateChip = t.start ? ` · ${t.start}` : "";
      return {
        id: t.id,
        label: `${name}${suffix}${dateChip}`,
        project_id: t.project_id || null,
      };
    });
  }, [assignType, projects, tasks, projectsById]);

  // Apply search + (when tasks) project filter
  const resultRows = useMemo(() => {
    const q = assignQuery.trim().toLowerCase();
    let list = targets;

    if (assignType === "task" && taskProjectFilterId !== "all") {
      const pidNum = Number(taskProjectFilterId);
      list = list.filter((t) => Number(t.project_id) === pidNum);
    }

    if (!q) return list.slice(0, 300);
    return list
      .filter(
        (t) =>
          t.label.toLowerCase().includes(q) ||
          String(t.id).toLowerCase().includes(q)
      )
      .slice(0, 300);
  }, [targets, assignQuery, assignType, taskProjectFilterId]);

  const allVisibleChecked =
    resultRows.length > 0 && resultRows.every((r) => selectedTargetIds.has(r.id));

  function toggleOneTarget(id) {
    setSelectedTargetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelectedTargetIds((prev) => {
      const next = new Set(prev);
      const everyChecked = resultRows.every((r) => next.has(r.id));
      if (everyChecked) {
        resultRows.forEach((r) => next.delete(r.id));
      } else {
        resultRows.forEach((r) => next.add(r.id));
      }
      return next;
    });
  }

  function handleChange(e) {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e) {
    e?.preventDefault?.();
    onSave?.(form);
  }

  async function handleAssignMulti() {
    if (!onAssignGroup) return;

    if (!form.member_ids?.length) {
      setToast?.({ message: "This group has no members to add.", type: "error" });
      return;
    }
    const ids = Array.from(selectedTargetIds);
    if (!ids.length) {
      setToast?.({
        message: `Select ${assignType}s to add this group to.`,
        type: "error",
      });
      return;
    }

    setAssignBusy(true);

    let ok = 0;
    let fail = 0;
    let triedBatch = false;

    try {
      // Try a batch assign if the parent supports it
      triedBatch = true;
      await onAssignGroup({
        targetType: assignType,
        targetIds: ids,
        role: assignRole,
        memberIds: form.member_ids,
      });
      ok = ids.length;
    } catch {
      // Fallback to N single calls (compatible with current App.jsx impl)
      for (const id of ids) {
        try {
          await onAssignGroup({
            targetType: assignType,
            targetId: id,
            role: assignRole,
            memberIds: form.member_ids,
          });
          ok++;
        } catch {
          fail++;
        }
      }
    } finally {
      setAssignBusy(false);
    }

    const msg = `Added ${form.member_ids.length} member${
      form.member_ids.length === 1 ? "" : "s"
    } as ${assignRole} to ${ids.length} ${assignType}${
      ids.length === 1 ? "" : "s"
    }${
      triedBatch && fail === 0 ? "" : ` (${ok} ok${fail ? `, ${fail} failed` : ""})`
    }.`;
    setToast?.({ message: msg, type: fail ? "warning" : "success" });

    if (fail === 0) setSelectedTargetIds(new Set());
  }

  async function copyEmails(list) {
    const emails = (list || []).map((m) => m.email).filter(Boolean);
    const text = emails.join("; ");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* noop */
      }
      document.body.removeChild(ta);
    }
    const count = emails.length;
    setToast?.({
      message: count
        ? `Copied ${count} email${count === 1 ? "" : "s"}.`
        : "No emails to copy.",
      type: count ? "success" : "error",
    });
  }

  if (!open) return null;

  return (
    <Modal
      open={open}
      title={group ? "Edit Group" : "Add Group"}
      size="lg"
      onClose={onClose}
      actions={
        <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
          <IconButton
            icon={<CopyEmailIcon />}
            title="Copy member emails"
            variant="neutral"
            size={18}
            onClick={() => copyEmails(selectedPeople)}
          />
          <IconButton
            icon={<SaveIcon />}
            title={group ? "Save Changes" : "Add Group"}
            variant="neutral"
            size={18}
            onClick={handleSubmit}
          />
        </div>
      }
    >
      <form id="group-form" onSubmit={handleSubmit}>
        <label>
          Name
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            required
            autoFocus
          />
        </label>

        {/* Members editor */}
        <PersonMultiSelect
          people={people}
          value={form.member_ids}
          onChange={(member_ids) => setForm((f) => ({ ...f, member_ids }))}
          label="Members"
          searchPlaceholder="Type a name or email…"
          minHeight={80}
          maxHeight={150}
        />

        {/* Compact members summary */}
        <div className="form-row" style={{ alignItems: "center", gap: 8 }}>
          <span className="pill">
            <span className="pill__title">Members</span>
            <span className="pill__tag">{selectedPeople.length}</span>
          </span>
          <IconButton
            icon={<EyeIcon />}
            title={membersViewerOpen ? "Hide members" : "View members"}
            variant="neutral"
            size={18}
            onClick={() => setMembersViewerOpen((v) => !v)}
          />
          <div style={{ marginLeft: "auto" }} />
        </div>

        {membersViewerOpen && (
          <div className="modal-hscroll">
            <div className="form-row" style={{ gap: 8 }}>
              <FilterInput
                value={membersFilter}
                onChange={setMembersFilter}
                placeholder="Filter selected members…"
              />
              <span className="muted">{filteredMembers.length} shown</span>
            </div>
            <table className="project-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.length === 0 && (
                  <tr>
                    <td colSpan={2} style={{ textAlign: "center" }}>
                      No members
                    </td>
                  </tr>
                )}
                {filteredMembers.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name || "Unnamed"}</td>
                    <td className="muted">{m.email || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Assign to Projects/Tasks (multi-select) */}
        {onAssignGroup && (
          <fieldset className="assign-fieldset">
            <legend>Assign group</legend>

            {/* One-line compact header */}
            <div className="assign-controls" style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {/* Type */}
              <select
                value={assignType}
                onChange={(e) => {
                  setAssignType(e.target.value);
                  setAssignQuery("");
                  setSelectedTargetIds(new Set());
                  setTaskProjectFilterId("all");
                }}
                aria-label="Target type"
              >
                <option value="project">Project</option>
                <option value="task">Task</option>
              </select>

              {/* Task-only project filter */}
              {assignType === "task" && (
                <select
                  value={taskProjectFilterId}
                  onChange={(e) => setTaskProjectFilterId(e.target.value)}
                  aria-label="Filter tasks by project"
                >
                  <option value="all">All projects</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}

              {/* Search (flex) */}
              <FilterInput
                className="flex-1"
                value={assignQuery}
                onChange={setAssignQuery}
                placeholder={`Search ${assignType}s`}
              />

              {/* RACI */}
              <div className="raci-inline" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="muted" style={{ whiteSpace: "nowrap" }}>RACI:</span>
                <select
                  value={assignRole}
                  onChange={(e) => setAssignRole(e.target.value)}
                  aria-label="RACI role"
                >
                  {RACI_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {RACI_LABELS[r]} ({r})
                    </option>
                  ))}
                </select>
              </div>

              {/* Assign action */}
              <IconButton
                icon={<AddIcon />}
                title={
                  selectedTargetIds.size
                    ? `Add group (${form.member_ids.length} members) as ${assignRole} to ${selectedTargetIds.size} ${assignType}${selectedTargetIds.size === 1 ? "" : "s"}`
                    : `Select ${assignType}s first`
                }
                variant="success"
                size={18}
                onClick={handleAssignMulti}
                disabled={assignBusy || selectedTargetIds.size === 0 || !form.member_ids.length}
                aria-label="Assign group to selected targets"
              />
            </div>

            {/* Results with select-all in header */}
            <div className="modal-hscroll" style={{ marginTop: 8 }}>
              <table className="project-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>
                      <input
                        type="checkbox"
                        checked={allVisibleChecked}
                        onChange={toggleAllVisible}
                        aria-label="Select all results"
                      />
                    </th>
                    <th>{assignType === "project" ? "Project" : "Task"}</th>
                  </tr>
                </thead>
                <tbody>
                  {resultRows.length === 0 && (
                    <tr>
                      <td colSpan={2} style={{ textAlign: "center" }}>
                        No matches
                      </td>
                    </tr>
                  )}
                  {resultRows.map((r) => {
                    const checked = selectedTargetIds.has(r.id);
                    return (
                      <tr
                        key={r.id}
                        onClick={() => toggleOneTarget(r.id)}
                        style={{ cursor: "pointer" }}
                      >
                        <td>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOneTarget(r.id)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select ${r.label}`}
                          />
                        </td>
                        <td>{r.label}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </fieldset>
        )}
      </form>
    </Modal>
  );
}
