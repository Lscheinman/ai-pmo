/* eslint-disable no-unexpected-multiline */
// /pmo/frontend/src/components/tasks/TaskModal.jsx
import React, { useState, useEffect, useMemo } from "react";
import Modal from "../Modal";
import { getTaskById } from "../../api/tasks";
import TagSelector from "../tags/TagsSelector";
import IconButton from "../buttons/IconButton";
import { CopyEmailIcon, SaveIcon, CommAgentIcon, TrashIcon } from "../icons";
import RolesAssigner from "../people/RolesAssigner";
import DateRange from "../dates/DateRange";

const defaultForm = {
  name: "",
  description: "",
  type: "task",                 // "task" | "continuous" (kept for backwards-compat)
  priority: "medium",
  status: "not started",
  start: "",
  end: "",
  project_id: "",
  task_assignees: [],           // [{ person_id, role }]
  tag_ids: [],
  tags: [],
  id: null,
  is_continuous: false,
  recurrence_unit: "",          // "day" | "week" | "month" | "year"
  recurrence_interval: 1,
  checklist: [],                // [{ id?, title, status, order }]
};

// ---- checklist helpers ----
const STATUS_ORDER = ["not started", "started", "blocked", "complete"];

const nextStatus = (s) => {
  const v = String(s || "").toLowerCase();
  const idx = STATUS_ORDER.indexOf(v);
  // if not found, treat it as the item before index 0 so we return STATUS_ORDER[0]
  const safeIdx = idx === -1 ? STATUS_ORDER.length - 1 : idx;
  return STATUS_ORDER[(safeIdx + 1) % STATUS_ORDER.length];
};
const statusColor = (s) => {
  const v = String(s || "").toLowerCase();
  if (v === "complete") return "var(--status-complete)";
  if (v === "blocked")  return "var(--status-blocked)";
  if (v === "started")  return "var(--status-running)";
  return "var(--status-planned)";
};
const sanitizeChecklist = (items=[]) =>
  (items || [])
    .filter(it => it && String(it.title || "").trim().length > 0)
    .map((it, i) => ({
      id: it.id ?? null,
      title: String(it.title).trim(),
      status: (it.status && STATUS_ORDER.includes(String(it.status).toLowerCase()))
        ? String(it.status).toLowerCase()
        : "not started",
      order: Number.isFinite(it.order) ? it.order : i,
    }))
    .sort((a,b)=> (a.order ?? 0) - (b.order ?? 0));

export default function TaskModal({
  open,
  task,
  people = [],
  onRemoveTag,
  onSave,
  onClose,
  notify,
  onComposeEmail,
  onOpenAddPerson = () => {},
  onDeleteTask,
}) {
  const [form, setForm] = useState(defaultForm);
  const [copyToast, setCopyToast] = useState("");
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // email preview modal
  const [emailPreview, setEmailPreview] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  // tabs
  const [activeTab, setActiveTab] = useState("assignees"); // "assignees" | "checklist"

  // checklist input  drag state
  const [newItemTitle, setNewItemTitle] = useState("");
  const [dragIndex, setDragIndex] = useState(null);

  const peopleById = useMemo(
    () => Object.fromEntries(people.map((p) => [p.id, p])),
    [people]
  );

  const updateTags = (newTagIds, newTagsList) => {
    setForm((f) => ({ ...f, tag_ids: newTagIds, tags: newTagsList }));
  };

  // ---- helpers for recurrence normalization (mirrors Gantt logic) ----
  const normUnit = (u) => {
    const v = String(u || "").toLowerCase();
    if (v.startsWith("day")) return "day";
    if (v.startsWith("week")) return "week";
    if (v.startsWith("month")) return "month";
    if (v.startsWith("year")) return "year";
    return "";
  };
  const inferIsContinuous = (t) =>
    Boolean(
      t?.is_continuous ||
      String(t?.type || "").toLowerCase() === "continuous" ||
      t?.recurrence_unit ||
      t?.recurrence
    );

  // init / refresh form
  useEffect(() => {
    async function loadTaskData() {
      if (!open) return;

      if (task?.id) {
        try {
          const latest = await getTaskById(task.id);
          const taskTags = Array.isArray(latest.tags) ? latest.tags : [];
          const taskTagIds = taskTags.map((t) => t.id);

          const is_cont = inferIsContinuous(latest);
          const unit =
            normUnit(latest.recurrence_unit || latest.recurrence) ||
            (is_cont ? "week" : "");
          const interval = Number(latest.recurrence_interval || 1) || 1;

          // Accept either "checklist" or "checklist_items" from backend
          const rawChecklist = Array.isArray(latest.checklist)
            ? latest.checklist
            : Array.isArray(latest.checklist_items)
              ? latest.checklist_items
              : [];

          setForm({
            ...defaultForm,
            ...latest,
            type: is_cont ? "continuous" : (latest.type || "task"),
            is_continuous: is_cont,
            recurrence_unit: unit,
            recurrence_interval: interval,
            tag_ids: taskTagIds,
            tags: taskTags,
            task_assignees: Array.isArray(latest.assignees)
              ? latest.assignees.map((ap) => ({
                  person_id: ap.person_id || ap.id,
                  role: ap.role || "Responsible",
                }))
              : [],
            checklist: sanitizeChecklist(rawChecklist),
            id: latest.id || null,
          });
        } catch (err) {
          console.error("Failed to load task", err);
        }
      } else {
        // new task
        setForm(defaultForm);
      }

      // reset
      setAgentMenuOpen(false);
      setEmailPreview(null);
      setPreviewOpen(false);
      setActiveTab("assignees");
      setNewItemTitle("");
      setDragIndex(null);
    }
    loadTaskData();
  }, [open, task?.id]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  // when switching discrete/continuous from the selector
  function handleOccurrenceChange(e) {
    const v = e.target.value; // "discrete" | "continuous"
    setForm((f) => {
      const makeCont = v === "continuous";
      return {
        ...f,
        is_continuous: makeCont,
        type: makeCont ? "continuous" : "task",
        recurrence_unit: makeCont ? (f.recurrence_unit || "week") : "",
        recurrence_interval: makeCont ? (Number(f.recurrence_interval || 1) || 1) : 1
      };
    });
  }

  function validate() {
    if (!form.name.trim()) {
      notify?.("Missing task name.", "error");
      return false;
    }
    if (!form.start) {
      notify?.("Missing start date.", "error");
      return false;
    }
    if (!form.is_continuous && !form.end) {
      notify?.("Missing end date.", "error");
      return false;
    }
    if (form.end) {
      const startDate = new Date(form.start);
      const endDate = new Date(form.end);
      if (endDate < startDate) {
        notify?.("End date cannot be before Start date.", "error");
        return false;
      }
    }
    if (form.is_continuous) {
      const interval = Number(form.recurrence_interval || 1);
      const unit = normUnit(form.recurrence_unit || "week");
      if (interval < 1 || !unit) {
        notify?.("Set a valid recurrence (e.g., Every 1 week).", "error");
        return false;
      }
    }
    return true;
  }

  async function handleSave(e) {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!validate()) return;

    const cleanedChecklist = sanitizeChecklist(form.checklist).map((it, i) => ({
      ...it,
      order: i,
    }));

    // Build payload; only include recurrence fields when continuous
    const base = {
      name: form.name,
      description: form.description,
      type: form.is_continuous ? "continuous" : (form.type || "task"),
      priority: form.priority,
      status: form.status,
      start: form.start || null,
      end: form.end || null,
      project_id: form.project_id || null,
      task_assignees: form.task_assignees.filter((ap) => !!ap.person_id && !!ap.role),
      tag_ids: form.tag_ids || [],
      checklist: cleanedChecklist,   // <<---- NEW
      id: form.id || null
    };

    const withRecurrence = form.is_continuous
      ? {
          ...base,
          is_continuous: true,
          recurrence_unit: normUnit(form.recurrence_unit || "week"),
          recurrence_interval: Number(form.recurrence_interval || 1) || 1
        }
      : {
          ...base,
          is_continuous: false
        };

    await onSave(withRecurrence);
    // parent decides when to close after successful save
  }

  function handleCopyEmails() {
    const emails = form.task_assignees
      .map((ap) => peopleById[ap.person_id]?.email)
      .filter(Boolean);
    if (!emails.length) {
      notify ? notify("No emails to copy.", "error") : alert("No emails to copy.");
      return;
    }
    const text = emails.join("; ");
    (async () => {
      try {
        await navigator.clipboard.writeText(text);
        notify ? notify("Emails copied!", "success") : null;
      } catch {
        // fallback
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try { document.execCommand("copy"); } catch { /* ignore */ }
        document.body.removeChild(ta);
      }
      setCopyToast("Emails copied!");
      setTimeout(() => setCopyToast(""), 1500);
    })();
  }

  const handleRemoveTagFromForm = async (tagIdToRemove) => {
    try {
      await onRemoveTag("Task", form.id, form.tags, tagIdToRemove);
      const refreshedTask = await getTaskById(form.id);
      const refreshedTagIds = refreshedTask.tags?.map((t) => t.id) || [];
      updateTags(refreshedTagIds, refreshedTask.tags || []);
    } catch (err) {
      console.error("Failed to remove tag", err);
    }
  };

  const toggleAgentMenu = () => setAgentMenuOpen((v) => !v);
  const closeAgentMenu = () => setAgentMenuOpen(false);

  async function handleCompose(mode) {
    closeAgentMenu();
    if (!form?.id) {
      notify?.("Save the task before generating a message.", "warning");
      return;
    }
    try {
      setBusy(true);

      const result = await onComposeEmail?.({
        entityType: "task",
        entityId: form.id,
        entityLabel: form.name,
        mode,
      });

      if (!result || result.error) {
        notify?.(result?.error || "Failed to compose email", "error");
        return;
      }

      setEmailPreview({
        to: result.to || [],
        cc: result.cc || [],
        subject: result.subject || "",
        mailtoHref: result.mailtoHref || "",
        downloadHref: result.downloadHref || "",
        downloadFilename: result.downloadFilename || "",
        body: result.bodyResolved || result.bodyInteractive || "",
        meta: { mentions: result.mentions || [] },
      });
      setPreviewOpen(true);
    } catch (e) {
      console.error(e);
      notify?.(e.message || "Failed to compose email", "error");
    } finally {
      setBusy(false);
    }
  }

  async function copyFullEmailFromPreview() {
    if (!emailPreview) return;
    const { to = [], cc = [], subject = "", body = "" } = emailPreview;
    const txt = `To: ${to.join(", ")}\nCC: ${cc.join(", ")}\nSubject: ${subject}\n\n${body}`;
    try {
      await navigator.clipboard.writeText(txt);
      notify ? notify("Email copied.", "success") : null;
    } catch {
      notify ? notify("Copy failed.", "error") : null;
    }
  }

  function openMailClientFromPreview() {
    if (!emailPreview) return;
    const { to = [], cc = [], subject = "", body = "" } = emailPreview;
    const href =
      `mailto:${encodeURIComponent(to.join(","))}` 
      `?cc=${encodeURIComponent(cc.join(","))}` 
      `&subject=${encodeURIComponent(subject)}` 
      `&body=${encodeURIComponent(body)}`;
    window.location.href = href;
  }

  // ---------- Checklist UI logic ----------
  const checklist = form.checklist || [];

  const setChecklist = (mutator) => {
    setForm((f) => {
      const next = typeof mutator === "function" ? mutator(sanitizeChecklist(f.checklist)) : mutator;
      return { ...f, checklist: sanitizeChecklist(next) };
    });
  };

  const addItem = () => {
    const t = String(newItemTitle || "").trim();
    if (!t) return;
    setChecklist((list) => [...list, { id: null, title: t, status: "not started", order: list.length }]);
    setNewItemTitle("");
  };

  const renameItem = (idx, title) => {
    setChecklist((list) => list.map((it, i) => (i === idx ? { ...it, title } : it)));
  };

  const deleteItem = (idx) => {
    setChecklist((list) => list.filter((_, i) => i !== idx).map((it, i) => ({ ...it, order: i })));
  };

  const cycleStatus = (idx) => {
    setChecklist((list) => list.map((it, i) => (i === idx ? { ...it, status: nextStatus(it.status) } : it)));
  };

  // drag & drop (native)
  const onDragStart = (idx) => setDragIndex(idx);
  const onDragOver = (e) => e.preventDefault();
  const onDrop = (idx) => {
    setChecklist((list) => {
      if (dragIndex == null || dragIndex === idx) return list;
      const next = list.slice();
      const [moved] = next.splice(dragIndex, 1);
      next.splice(idx, 0, moved);
      return next.map((it, i) => ({ ...it, order: i }));
    });
    setDragIndex(null);
  };

  // completion stats
  const completedCount = checklist.filter((it) => String(it.status).toLowerCase() === "complete").length;

  // ---------- Render ----------
  return (
    <>
      <Modal
        open={open}
        title={task ? "Edit Task" : "Add Task"}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
            {form?.id && typeof onDeleteTask === "function" && (
              <IconButton
                icon={<TrashIcon />}
                title="Delete Task"
                variant="danger"
                size={18}
                onClick={async () => {
                  if (confirm("Delete this task? This cannot be undone.")) {
                    await onDeleteTask?.(form.id);
                    onClose?.();
                  }
                }}
              />
            )}
            <IconButton
              icon={<CommAgentIcon />}
              title="Communication Agent"
              variant="neutral"
              size={18}
              onClick={toggleAgentMenu}
              disabled={busy}
            />
            {agentMenuOpen && (
              <div
                role="menu"
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: 4,
                  background: "#111",
                  border: "1px solid #333",
                  borderRadius: 8,
                  minWidth: 220,
                  zIndex: 1000,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                  overflow: "hidden",
                }}
                onMouseLeave={() => setAgentMenuOpen(false)}
              >
                <button className="menu-item" onClick={() => { setAgentMenuOpen(false); handleCopyEmails(); }}>
                  Copy assignee emails
                </button>
                <div style={{ height: 1, background: "#333" }} />
                <button className="menu-item" onClick={() => handleCompose("status")}>Draft status update</button>
                <button className="menu-item" onClick={() => handleCompose("unblocker")}>Request unblocker</button>
                <button className="menu-item" onClick={() => handleCompose("risk")}>Risk escalation</button>
                <button className="menu-item" onClick={() => handleCompose("standup")}>Stand-up summary</button>
                <style>{`
                  .menu-item {
                    width: 100%; text-align: left; padding: 10px 12px; background: transparent; color: #eaeaea;
                    border: 0; cursor: pointer; font-size: 0.95rem;
                  }
                  .menu-item:hover { background: #1e1e1e; }
                `}</style>
              </div>
            )}

            <IconButton
              icon={<SaveIcon />}
              title="Save Task"
              variant="neutral"
              size={18}
              onClick={handleSave}
              type="button"
            />
            {copyToast && (
              <span style={{ color: "#2ae98d", fontSize: "0.99em", minWidth: 90 }}>
                {copyToast}
              </span>
            )}
          </div>
        }
        onClose={onClose}
      >
        {/* keep Enter-to-save via onSubmit, validation blocks closing */}
        <form onSubmit={handleSave} className="form-grid">
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

          {/* Occurrence (Discrete vs Continuous) */}
          <div className="form-row small-inputs">
            <label>
              Occurrence
              <select
                value={form.is_continuous ? "continuous" : "discrete"}
                onChange={handleOccurrenceChange}
              >
                <option value="discrete">Discrete (single timeframe)</option>
                <option value="continuous">Continuous (recurring)</option>
              </select>
            </label>

            {form.is_continuous && (
              <>
                <label>
                  Every
                  <input
                    type="number"
                    min={1}
                    name="recurrence_interval"
                    value={form.recurrence_interval}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        recurrence_interval: Math.max(1, Number(e.target.value || 1)),
                      }))
                    }
                  />
                </label>
                <label>
                  Unit
                  <select
                    name="recurrence_unit"
                    value={form.recurrence_unit || "week"}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, recurrence_unit: normUnit(e.target.value) }))
                    }
                  >
                    <option value="day">Day(s)</option>
                    <option value="week">Week(s)</option>
                    <option value="month">Month(s)</option>
                    <option value="year">Year(s)</option>
                  </select>
                </label>
                <span className="muted" style={{ alignSelf: "end" }}>
                  Shown as dotted cadence on the Gantt.
                </span>
              </>
            )}
          </div>

          <div className="form-row small-inputs">
            <DateRange
              startName="start"
              endName="end"
              startValue={form.start || ""}
              endValue={form.end || ""}
              onChange={handleChange}
              weekStartsOn={1}
              labels={{
                start: "Start Date",
                end: form.is_continuous ? "Until (optional)" : "End Date",
              }}
            />
            <label>
              Priority
              <select
                name="priority"
                value={form.priority}
                onChange={handleChange}
              >
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </label>
            <label>
              Status
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
              >
                <option value="not started">Not Started</option>
                <option value="in progress">In Progress</option>
                <option value="blocked">Blocked</option>
                <option value="complete">Complete</option>
              </select>
            </label>
          </div>

          <label>
            Description
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
            />
          </label>

          <label>
            Tags
            <TagSelector
              value={form.tag_ids}
              onChange={(tag_ids) => {
                const selectedTags = (form.tags.length > 0 ? form.tags : task?.tags || [])
                  .filter((t) => tag_ids.includes(t.id));
                updateTags(tag_ids, selectedTags);
              }}
              objectType="Task"
              objectId={form.id}
              tags={form.tags}
              onRemoveTag={handleRemoveTagFromForm}
            />
          </label>

          {/* ---------- Tabs: Assignees / Checklist ---------- */}
          <div style={{ marginTop: 8 }}>
            <div
              role="tablist"
              aria-label="Task sections"
              style={{
                display: "inline-flex",
                gap: 6,
                padding: 4,
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                marginBottom: 10,
              }}
            >
              {[
                { key: "assignees", label: "Assignees" },
                { key: "checklist", label: `Checklist${checklist.length ? ` (${completedCount}/${checklist.length})` : ""}` },
              ].map((t) => {
                const active = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    role="tab"
                    aria-selected={active}
                    type="button"
                    onClick={() => setActiveTab(t.key)}
                    className="app-input"
                    style={{
                      padding: "6px 10px",
                      fontSize: 12,
                      borderRadius: 8,
                      border: active ? "1.5px solid var(--accent)" : "1.5px solid var(--border)",
                      background: active ? "rgba(76,175,80,0.1)" : "transparent",
                      color: "var(--text)",
                    }}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>

            {activeTab === "assignees" ? (
              <div className="modal-hscroll">
                <RolesAssigner
                  people={people}
                  value={form.task_assignees}
                  onChange={(task_assignees) => setForm((f) => ({ ...f, task_assignees }))}
                  maxRows={2}
                  onAddPerson={onOpenAddPerson}
                />
              </div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {/* Add item */}
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="app-input"
                    placeholder="Add checklist item…"
                    value={newItemTitle}
                    onChange={(e) => setNewItemTitle(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="app-input"
                    onClick={addItem}
                    style={{ padding: "6px 10px", fontWeight: 700 }}
                  >
                    Add
                  </button>
                </div>

                {/* List */}
                <div
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    background: "var(--panel)",
                    overflow: "hidden",
                  }}
                >
                  {checklist.length === 0 ? (
                    <div style={{ color: "#9aa", padding: "10px 12px", fontSize: 13 }}>
                      No items yet. Add the first step above.
                    </div>
                  ) : (
                    checklist.map((it, idx) => (
                      <div
                        key={it.id ?? `tmp-${idx}`}
                        draggable
                        onDragStart={() => onDragStart(idx)}
                        onDragOver={onDragOver}
                        onDrop={() => onDrop(idx)}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "24px 1fr auto auto",
                          gap: 8,
                          alignItems: "center",
                          padding: "8px 10px",
                          borderBottom: "1px solid var(--border)",
                          background: dragIndex === idx ? "rgba(255,255,255,0.03)" : "transparent",
                        }}
                        title="Drag to reorder"
                      >
                        {/* drag handle */}
                        <span style={{ cursor: "grab", opacity: 0.8 }}>
                          <svg width="16" height="16" viewBox="0 0 16 16">
                            <circle cx="5" cy="5" r="1.2" fill="#888" />
                            <circle cx="11" cy="5" r="1.2" fill="#888" />
                            <circle cx="5" cy="11" r="1.2" fill="#888" />
                            <circle cx="11" cy="11" r="1.2" fill="#888" />
                          </svg>
                        </span>

                        {/* title (inline edit) */}
                        <input
                          className="app-input"
                          value={it.title}
                          onChange={(e) => renameItem(idx, e.target.value)}
                          style={{ width: "100%" }}
                        />

                        {/* status pill (click to cycle) */}
                        <button
                          type="button"
                          onClick={() => cycleStatus(idx)}
                          className="app-input"
                          title="Click to cycle status"
                          style={{
                            padding: "4px 10px",
                            fontSize: 12,
                            borderColor: "var(--border)",
                            color: statusColor(it.status),
                            whiteSpace: "nowrap",
                          }}
                        >
                          {String(it.status || "").toLowerCase()}
                        </button>

                        {/* delete */}
                        <button
                          type="button"
                          className="app-input"
                          onClick={() => deleteItem(idx)}
                          title="Delete item"
                          style={{
                            padding: "4px 10px",
                            fontSize: 12,
                            color: "var(--danger)",
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </form>
      </Modal>

      {/* Email Preview Modal */}
      <Modal
        open={previewOpen}
        title={emailPreview?.subject || "Email Preview"}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <IconButton
              icon={<CopyEmailIcon />}
              title="Copy Full Email"
              variant="neutral"
              size={18}
              onClick={copyFullEmailFromPreview}
            />
            <IconButton
              icon={<CommAgentIcon />}
              title="Open in Mail Client"
              variant="success"
              size={18}
              onClick={openMailClientFromPreview}
            />
          </div>
        }
        onClose={() => setPreviewOpen(false)}
      >
        <div style={{ display: "grid", gap: 6, fontSize: 14 }}>
          <div><strong>To:</strong> {(emailPreview?.to || []).join(", ")}</div>
          <div><strong>Cc:</strong> {(emailPreview?.cc || []).join(", ")}</div>
          <div><strong>Subject:</strong> {emailPreview?.subject || ""}</div>
          <hr style={{ borderColor: "#333" }} />
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{emailPreview?.body || ""}</pre>
        </div>
      </Modal>
    </>
  );
}
