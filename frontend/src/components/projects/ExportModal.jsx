import React, { useMemo, useState } from "react";
import Modal from "../Modal";
import IconButton from "../buttons/IconButton";
import { SaveIcon } from "../icons";
import { exportEntities, triggerDownload } from "../../api/export";

const ENTITY_OPTIONS = [
  { value: "all", label: "Everything (all tables)" },
  { value: "projects", label: "Projects" },
  { value: "tasks", label: "Tasks" },
  { value: "people", label: "People" },
  { value: "groups", label: "Groups" },
];

const FORMAT_OPTIONS = [
  { value: "csv", label: "CSV" },
  { value: "xlsx", label: "Excel (.xlsx)" },
  { value: "planner", label: "Planner-style (Tasks only, CSV)" },
];

// helpers
const normalizeIds = (arr = []) =>
  Array.from(new Set(arr.map(Number))).sort((a, b) => a - b);

const arraysEqual = (a, b) => {
  const an = normalizeIds(a);
  const bn = normalizeIds(b);
  if (an.length !== bn.length) return false;
  for (let i = 0; i < an.length; i++) if (an[i] !== bn[i]) return false;
  return true;
};

export default function ExportModal({
  open,
  onClose,
  projects = [],
  tasks = [],
  people = [],
  groups = [],
  selectedProjectIds = [],
  selectedTaskIds = [],
  selectedPeopleIds = [],
  selectedGroupIds = [],
  notify
}) {
  const [entity, setEntity] = useState("all");
  const [format, setFormat] = useState("csv");
  const [scope, setScope] = useState("all");
  const [ids, setIds] = useState([]);

  const canPickIds = entity !== "all";
  const isPlanner = format === "planner";
  const isTasks = entity === "tasks";

  const candidates = useMemo(() => {
    switch (entity) {
      case "projects": return projects.map(p => ({ id: p.id, label: p.name || `Project ${p.id}` }));
      case "tasks": return tasks.map(t => ({ id: t.id, label: t.name || `Task ${t.id}` }));
      case "people": return people.map(p => ({ id: p.id, label: p.name || p.email || `Person ${p.id}` }));
      case "groups": return groups.map(g => ({ id: g.id, label: g.name || `Group ${g.id}` }));
      default: return [];
    }
  }, [entity, projects, tasks, people, groups]);

  // derive which "selectedIds" prop matches the current entity
  const selectedForEntity = React.useMemo(() => {
    switch (entity) {
      case "projects": return selectedProjectIds;
      case "tasks": return selectedTaskIds;
      case "people": return selectedPeopleIds;
      case "groups": return selectedGroupIds;
      default: return [];
    }
  }, [entity, selectedProjectIds, selectedTaskIds, selectedPeopleIds, selectedGroupIds]);

  // sync ids when entity/scope changes, avoid infinite loops
  React.useEffect(() => {
    if (scope !== "selected" || entity === "all") {
      setIds(prev => (prev.length ? [] : prev));
      return;
    }
    const next = selectedForEntity || [];
    setIds(prev => (arraysEqual(prev, next) ? prev : next));
  }, [scope, entity, selectedForEntity]);

  async function handleExport() {
    try {
      if (isPlanner && !isTasks && entity !== "all") {
        notify?.("Planner format is for Tasks; choose Tasks or Everything.", "warning");
        return;
      }
      const payload = {
        entity,
        ids: scope === "selected" ? ids : [],
        format
      };
      const file = await exportEntities(payload);
      triggerDownload(file);
      onClose?.();
    } catch (e) {
      notify?.(e.message || "Export failed", "error");
    }
  }

  if (!open) return null;

  return (
    <Modal
      open={open}
      title="Export Data"
      onClose={onClose}
      actions={
        <IconButton
          icon={<SaveIcon />}
          title="Export"
          variant="neutral"
          size={18}
          onClick={handleExport}
        />
      }
    >
      <div className="form-grid" style={{ gap: 12 }}>
        <label>
          What to export
          <select value={entity} onChange={(e) => setEntity(e.target.value)}>
            {ENTITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>

        <label>
          Format
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            {FORMAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {format === "planner" && (
            <div style={{ fontSize: 12, color: "#aaa", marginTop: 6 }}>
              Exports a Tasks CSV with common Planner-like columns (Title, Progress, Priority, Dates, Assigned To).
            </div>
          )}
        </label>

        {canPickIds && (
          <>
            <label>
              Scope
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="all">All {entity}</option>
                <option value="selected">Only selected…</option>
              </select>
            </label>

            {scope === "selected" && (
              <div>
                <div style={{ fontSize: 12, color: "#aaa", marginBottom: 4 }}>
                  Choose specific {entity} to include:
                </div>
                <div className="listbox" style={{
                  maxHeight: 180, overflow: "auto", border: "1px solid #333",
                  borderRadius: 8, padding: 8, background: "#111"
                }}>
                  {candidates.map(c => {
                    const checked = ids.includes(c.id);
                    return (
                      <label key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setIds(prev => e.target.checked ? [...prev, c.id] : prev.filter(x => x !== c.id));
                          }}
                        />
                        <span>{c.label}</span>
                      </label>
                    );
                  })}
                  {!candidates.length && <div style={{ color: "#888" }}>No items.</div>}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
