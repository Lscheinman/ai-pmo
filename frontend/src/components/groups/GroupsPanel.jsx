// frontend/src/components/groups/GroupsPanel.jsx
import React, { useMemo, useState } from "react";
import { getGroups, createGroup, updateGroup, deleteGroup } from "../../api/groups";
import { getPeople } from "../../api/people";
import { getProjects } from "../../api/projects";
import { getTasks } from "../../api/tasks";
import { assignPeopleToProjects, assignPeopleToTasks } from "../../api/assignments";
import Card from "../Card";
import GroupModal from "./GroupsModal";
import IconButton from "../buttons/IconButton";
import ImportButton from "../buttons/ImportButton";
import { DeleteIcon, CopyEmailIcon, AddIcon, InfoIcon } from "../icons";
import { importPeopleExcel } from "../../api/people";

// Toast hook for feedback
function useToast() {
  const [msg, setMsg] = useState("");
  function show(message, timeout = 2000) {
    setMsg(message);
    window.clearTimeout(show._t);
    show._t = window.setTimeout(() => setMsg(""), timeout);
  }
  return [msg, show];
}

/**
 * Props:
 * - groups, setGroups
 * - people, setPeople
 * - onFocusGroup?: (group) => void
 * - onFocusMany?: (ids:number[]) => void
 */
export default function GroupsPanel({
  groups,
  setGroups,
  people,
  setPeople,
  onFocusGroup,
  onFocusMany
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [filter, setFilter] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [toast, showToast] = useToast();
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);

  function handleAdd() {
    setSelectedGroup(null);
    setModalOpen(true);
    if (!projects.length) getProjects().then(setProjects).catch(() => {});
    if (!tasks.length) getTasks().then(setTasks).catch(() => {});
  }
  function handleEdit(group) {
    setSelectedGroup(group);
    setModalOpen(true);
    if (!projects.length) getProjects().then(setProjects).catch(() => {});
    if (!tasks.length) getTasks().then(setTasks).catch(() => {});
  }
  async function handleSave(group) {
    if (selectedGroup) {
      await updateGroup(selectedGroup.id, group);
    } else {
      await createGroup(group);
    }
    getGroups().then(setGroups);
    setModalOpen(false);
  }
  async function handleDelete(id) {
    if (window.confirm("Delete this group?")) {
      await deleteGroup(id);
      getGroups().then(setGroups);
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }
  function handleCopyEmails(members) {
    const emails = (members || []).map(m => m.email).filter(Boolean).join("; ");
    if (emails) {
      navigator.clipboard.writeText(emails);
      showToast("Emails copied!");
    } else {
      showToast("No emails to copy");
    }
  }

  // --- Filter logic ---
  const filteredGroups = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return groups;
    return groups.filter(group => {
      if (group.name?.toLowerCase().includes(f)) return true;
      return (group.members || []).some(m =>
        (m.name && m.name.toLowerCase().includes(f)) ||
        (m.email && m.email.toLowerCase().includes(f))
      );
    });
  }, [groups, filter]);

  // --- Multi-select helpers (for focusing in graph) ---
  const toggleOne = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds(prev => {
      const visible = new Set(filteredGroups.map(g => g.id));
      const allVisibleSelected = filteredGroups.every(g => prev.has(g.id));
      return allVisibleSelected
        ? new Set([...prev].filter(id => !visible.has(id)))
        : new Set([...prev, ...visible]);
    });
  };

  const focusSelected = () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    onFocusMany?.(ids);
    showToast(`Focused ${ids.length} group${ids.length === 1 ? "" : "s"}`);
  };

  const allVisibleChecked =
    filteredGroups.length > 0 && filteredGroups.every(g => selectedIds.has(g.id));
  const anySelected = selectedIds.size > 0;

  return (
    <Card
      title="Groups"
      filter={filter}
      onFilter={setFilter}
      actions={
        <>
          <IconButton
            icon={<AddIcon />}
            title="Add"
            variant="success"
            size={18}
            onClick={handleAdd}
          />
          <ImportButton
            onFile={async (file) => {
              try {
                await importPeopleExcel(file);
                getGroups().then(setGroups);
                getPeople().then(setPeople);
                // Clearer message since we're importing people
                showToast("People import successful!");
              } catch (err) {
                showToast("Import failed: " + err.message);
              }
            }}
          />
          <IconButton
            icon={<InfoIcon />}
            title="Focus selected in graph"
            variant="neutral"
            size={18}
            onClick={focusSelected}
            disabled={!anySelected}
          />
        </>
      }
    >
      {/* bulk-select control */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={allVisibleChecked}
            onChange={(e) => { e.stopPropagation(); toggleAllVisible(); }}
          />
        </label>
        <span style={{ opacity: 0.8 }}>Select all shown</span>
        {anySelected && (
          <span style={{ opacity: 0.7, fontWeight: 600, marginLeft: 6 }}>
            {selectedIds.size} selected
          </span>
        )}
      </div>

      <table className="project-table">
        <tbody>
          {filteredGroups.map(group => (
            <tr
              key={group.id}
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                // Don’t open modal if clicking a control/checkbox/icon
                if (!(e.target instanceof HTMLElement)) return;
                const tag = e.target.tagName.toLowerCase();
                if (tag !== "button" && tag !== "svg" && tag !== "path" && tag !== "input") {
                  handleEdit(group);
                }
              }}
            >
              <td style={{ whiteSpace: "nowrap" }}>
                <input
                  type="checkbox"
                  checked={selectedIds.has(group.id)}
                  onChange={(e) => { e.stopPropagation(); toggleOne(group.id); }}
                  style={{ marginRight: 8 }}
                />
                <IconButton
                  icon={<InfoIcon />}
                  title="Focus in graph"
                  variant="neutral"
                  size={18}
                  onClick={(e) => {
                    e.stopPropagation();
                    onFocusGroup?.(group);
                    showToast(`Focused ${group.name}`);
                  }}
                />
                <IconButton
                  icon={<CopyEmailIcon />}
                  title="Copy emails"
                  variant="neutral"
                  size={18}
                  onClick={(e) => { e.stopPropagation(); handleCopyEmails(group.members || []); }}
                />
                <IconButton
                  icon={<DeleteIcon />}
                  title="Delete"
                  variant="danger"
                  size={18}
                  onClick={(e) => { e.stopPropagation(); handleDelete(group.id); }}
                />
              </td>
              <td>{group.name}</td>
              <td>
                <span className="status-badge" style={{ fontWeight: 700, fontSize: "0.98em" }}>
                  {group.members?.length ?? 0}
                </span>
              </td>
            </tr>
          ))}
          {filteredGroups.length === 0 && (
            <tr>
              <td colSpan={3} style={{ textAlign: "center", color: "#777" }}>
                No groups
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <GroupModal
        open={modalOpen}
        group={selectedGroup}
        people={people}
        projects={projects}
        tasks={tasks}
        onSave={handleSave}
        onClose={() => setModalOpen(false)}
        setToast={(t) => showToast(typeof t === "string" ? t : (t?.message || ""))}
        onAssignGroup={async ({ targetType, targetIds, role, memberIds }) => {
          try {
            if (!memberIds?.length) {
              showToast("No members to add");
              return;
            }
            if (!targetIds?.length) {
              showToast("No targets selected");
              return;
            }
            let total = 0;
            if (targetType === "project") {
              total = await assignPeopleToProjects(targetIds, memberIds, role);
            } else {
              total = await assignPeopleToTasks(targetIds, memberIds, role);
            }
            showToast(`Assigned ${memberIds.length} member${memberIds.length === 1 ? "" : "s"} as ${role} to ${targetIds.length} ${targetType}${targetIds.length > 1 ? "s" : ""} (${total} links)`);
          } catch (err) {
            showToast("Assign failed: " + (err?.message || String(err)));
            throw err;
          }
        }}
      />

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#242b39",
            color: "#fff",
            borderRadius: 7,
            padding: "0.85em 2em",
            zIndex: 10000,
            boxShadow: "0 2px 24px #0004",
            fontWeight: 700,
            fontSize: "1.02em"
          }}
        >
          {toast}
        </div>
      )}
    </Card>
  );
}
