/* eslint-disable no-unexpected-multiline */
// frontend/src/components/projects/ProjectModal.jsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import TaskTable from "../tasks/TaskTable";
import TaskModal from "../tasks/TaskModal";
import IconButton from "../buttons/IconButton";
import Modal from "../Modal";
import PersonModal from "../people/PersonModal";
import FilterSearch from "../FilterInput";
import DateRange from "../dates/DateRange";
import RolesAssigner from "../people/RolesAssigner";
import TagSelector from "../tags/TagsSelector";
import { getProjectById } from "../../api/projects";
import { getPeople } from "../../api/people";
import { addPeopleToTask, deleteTask } from "../../api/tasks";
import { getProjectLinks } from "../../api/projectLinks";
import { PeopleIcon, TasksIcon, TagIcon, CopyEmailIcon, SaveIcon, AddIcon, CommAgentIcon, ExternalLinkIcon } from "../icons";
import ProjectLinksTab from "./ProjectLinksTab";
import { askForRole } from "../../utils/askForRole";
import { showToast } from "../toast/toastBus";

const EMPTY = {
  name: "",
  description: "",
  start_date: "",
  end_date: "",
  status: "Planned",
  project_leads: [],
  tasks: [],
  tags: [],
  tag_ids: []
};

const upsertById = (list, item) => {
  if (!item) return list;
  const idx = list.findIndex((t) => String(t.id) === String(item.id));
  if (idx === -1) return [...list, item];
  const next = list.slice();
  next[idx] = item;
  return next;
};

export default function ProjectModal({
  open, onClose, onSave,
  project, people = [], projects = [],
  onTaskSave, handleRemoveTag, notify,
  setPeople, ensureProjectId,
  onDelete, deleteLabel, deleting,
  onComposeEmail, setToast, setSelectedPerson
}) {
  const [form, setForm] = useState(EMPTY);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [personModalOpen, setPersonModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [activeTab, setActiveTab] = useState("people");
  const [taskSearch, setTaskSearch] = useState("");
  const [peopleSearch, setPeopleSearch] = useState("");
  const [copyToast, setCopyToast] = useState("");
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const [emailPreview, setEmailPreview] = useState(null); // {to, cc, subject, body, meta}
  const [previewOpen, setPreviewOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [linksCount, setLinksCount] = useState(0);
  // Tracks why we opened PersonModal: add as project lead OR assign to currently edited task
  const [personModalContext, setPersonModalContext] = useState(null);


  async function openLinksTab() {
    try {
      if (!form.id) {
        // Ensure the project exists so Links can attach immediately
        const pid = await ensureProjectId(form);
          setForm(f => ({ ...f, id: pid }));
        }
      setActiveTab("links");
      } catch (e) {
        showToast({ type: "warning", message: `Save the project before adding links: ${e.message}`, duration: 4000 });
      }
  }

  // Single, debounced-style loader on open or id change
  useEffect(() => {
    if (!open) return;
    setActiveTab("people");
    setTaskSearch("");
    setPeopleSearch("");

    (async () => {
      if (!project?.id) {
        setForm(EMPTY);
        setLinksCount(0)
        return;
      }
      try {
        const latest = await getProjectById(project.id);
        setForm({
          ...EMPTY,
          ...latest,
          project_leads: latest.project_leads || [],
          tasks: latest.tasks || [],
          tags: latest.tags || [],
          tag_ids: (latest.tags || []).map(t => t.id)
        });
        setLinksCount(Array.isArray(latest.links) ? latest.links.length : 0);
        refreshLinksCountFor(latest.id);
      } catch (err) {
        console.error("Failed to load project", err);
      }
    })();
  }, [open, project?.id]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault?.();
    onSave({
      ...form,
      start_date: form.start_date || null,
      end_date: form.end_date || null
    });
  }

  function handleAddTaskClick() {
    (async () => {
      try {
        if (!form.id) {
          const pid = await ensureProjectId(form);
          setForm(f => ({ ...f, id: pid }));
        }
        setSelectedTask(null);
        setTaskModalOpen(true);
      } catch (e) {
        showToast({ type: "error", message: `Failed to initialize project before adding a task: ${e.message}`, duration: 4000 });
      }
    })();
  }

  function handleEditTaskClick(task) {
    setSelectedTask(task);
    setTaskModalOpen(true);
  }

  async function handleSavePerson(newPerson) {
    try {
      // Refresh global people so dropdowns immediately include the new person
      const refreshed = await getPeople();
      setPeople?.(refreshed);

      const role = await askForRole("Responsible");
      const label = newPerson?.name || newPerson?.email || `Person ${newPerson?.id}`;

      if (personModalContext?.scope === "project") {
        // Add to project leads (UI state). Project save will persist.
        setForm((f) => ({
          ...f,
          project_leads: [
            ...(f.project_leads || []),
            { person_id: newPerson.id, role },
          ],
        }));
        showToast({ type: "success", message: `${label} added as ${role} to project. Don’t forget to Save Project.`, duration: 2800 });
      } else if (personModalContext?.scope === "task") {
        const tid = personModalContext?.taskId;
        if (tid) {
          // Existing task -> assign immediately via API
          await addPeopleToTask(tid, { person_ids: [newPerson.id], role });
          // Refresh project so the TaskTable reflects the new assignee
          const latest = await getProjectById(form.id || project?.id);
          setForm({
            ...EMPTY,
            ...latest,
            project_leads: latest.project_leads || [],
            tasks: latest.tasks || [],
            tags: latest.tags || [],
            tag_ids: (latest.tags || []).map(t => t.id)
          });
          showToast({ type: "success", message: `${label} added to task as ${role}.`, duration: 2800 });
        } else {
          // New/unsaved task: we can’t call the API yet. Show a gentle tip.
          showToast({ type: "info", message: `${label} created. After you save the task, add them from the assignees picker.`, duration: 4000 });
        }
      }
    } catch (err) {
      console.error("Failed post-create assignment", err);
      showToast({ type: "error", message: err?.message || "Failed to assign newly created person", duration: 4000 });
    } finally {
      setPersonModalOpen(false);
      setPersonModalContext(null);
    }
  }

  // Tag removal
  const handleRemoveTagFromForm = async (tagIdToRemove) => {
    try {
      await handleRemoveTag("Project", form.id, form.tags, tagIdToRemove);
      const refreshed = await getProjectById(form.id);
      setForm(f => ({
        ...f,
        tag_ids: (refreshed.tags || []).map(t => t.id),
        tags: refreshed.tags || []
      }));
    } catch (err) {
      console.error("Failed to remove project tag", err);
    }
  };

  const handleDeleteTask = useCallback(async (taskId) => {
    if (!taskId) return;
    if (!confirm("Delete this task? This cannot be undone.")) return;
    try {
      await deleteTask(taskId);
      setForm(f => ({ ...f, tasks: (f.tasks || []).filter(t => String(t.id) !== String(taskId)) }));
      showToast({ type: "success", message: "Task deleted.", duration: 2800 });
    } catch (e) {
      showToast({ type: "error", message: e?.message || "Failed to delete task", duration: 4000 });
    }
  }, []);


  // Keep the badge in sync without opening the Links tab
  async function refreshLinksCountFor(projectId) {
    if (!projectId) { setLinksCount(0); return; }
    try {
      const links = await getProjectLinks(projectId);
      setLinksCount(Array.isArray(links) ? links.length : 0);
    } catch (e) {
      console.warn("Failed to refresh links count", e);
      setLinksCount(0);
    }
  };

  // Lookups
  const peopleById = useMemo(
    () => Object.fromEntries((people || []).map(p => [p.id, p])),
    [people]
  );
  
  const handleAssignPersonToTask = useCallback(async ({ personId, taskId, role }) => {
    try {
      await addPeopleToTask(taskId, { person_ids: [personId], role });
      // Refresh tasks so the UI reflects new assignee right away
      const latest = await getProjectById(form.id || project?.id);
      setForm({
        ...EMPTY,
        ...latest,
        project_leads: latest.project_leads || [],
        tasks: latest.tasks || [],
        tags: latest.tags || [],
        tag_ids: (latest.tags || []).map(t => t.id)
      });

      // 1) optimistic from payload if links were included
      if (Array.isArray(latest.links)) {
        setLinksCount(latest.links.length);
      } else {
        setLinksCount(0);
      }

      // 2) definitive count from the endpoint (works even if payload doesn’t include links)
      refreshLinksCountFor(latest.id);
      const who = peopleById[personId]?.name || "Person";
      const taskName = (latest.tasks || []).find(t => String(t.id) === String(taskId))?.name || "task";
      showToast({ type: "success", message: `${who} added to "${taskName}" as ${role}.`, duration: 2800 });
    } catch (e) {
      showToast({ type: "error", message: e?.message || "Failed to assign person to task", duration: 4000 });
    }
  }, [form.id, project?.id, peopleById]);


  const projectsById = useMemo(
    () => Object.fromEntries((projects || []).map(p => [p.id, p])),
    [projects]
  );

    // ---- tab counts
  const { peopleCount, tasksCount, tagsCount } = useMemo(() => {
    const ppl = Array.isArray(form.project_leads) ? form.project_leads.length : 0;
    const tks = Array.isArray(form.tasks) ? form.tasks.length : 0;
    // prefer tags array if present; else fall back to tag_ids
    const tgs = Array.isArray(form.tags) ? form.tags.length
              : Array.isArray(form.tag_ids) ? form.tag_ids.length
              : 0;
    return { peopleCount: ppl, tasksCount: tks, tagsCount: tgs };
  }, [form.project_leads, form.tasks, form.tags, form.tag_ids]);


  // Filter people feeding RolesAssigner
  const filteredPeople = useMemo(() => {
    const q = peopleSearch.trim().toLowerCase();
    if (!q) return people;
    return people.filter(p =>
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.email && p.email.toLowerCase().includes(q)) ||
      (p.notes && p.notes.toLowerCase().includes(q))
    );
  }, [people, peopleSearch]);

  // Copy Emails (project leads  task assignees)
  const handleCopyEmails = useCallback(async () => {
    const out = new Set();

    for (const pl of form.project_leads || []) {
      const pid = pl?.person_id ?? pl?.id;
      const email = peopleById[pid]?.email;
      if (email) out.add(email);
    }

    for (const t of form.tasks || []) {
      const assignees = t?.task_assignees || t?.assignees || [];
      for (const a of assignees) {
        const pid = a?.person_id ?? a?.id;
        const email = peopleById[pid]?.email;
        if (email) out.add(email);
      }
    }

    const emails = Array.from(out);
    if (!emails.length) {
      showToast({ type: "error", message: "No emails found to copy.", duration: 4000 });
      return;
    }

    const text = emails.join("; ");
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try { ok = document.execCommand("copy"); } catch { /* empty */ }
      document.body.removeChild(ta);
    }

    const msg = `Copied ${emails.length} email${emails.length === 1 ? "" : "s"}.`;
    if (ok) {
      showToast({ type: "success", message: msg, duration: 2800 });
      setCopyToast("Emails copied!");
      setTimeout(() => setCopyToast(""), 1500);
    } else {
      setCopyToast("Emails copied!");
      setTimeout(() => setCopyToast(""), 1500);
    }
  }, [form.project_leads, form.tasks, peopleById]);

  const toggleAgentMenu = () => {
    setAgentMenuOpen((v) => !v);
  };

  const closeAgentMenu = () => setAgentMenuOpen(false);

  async function handleCompose(mode) {
    closeAgentMenu();
    if (!form?.id) {
      showToast({ type: "warning", message: "Save the project before generating a message.", duration: 4000 });
      return;
    }
    try {
      setBusy(true);

      const ensuredId = form.id || (await ensureProjectId(form)); // number like 2

      const result = await onComposeEmail?.({
        entityType: "project",
        entityId: ensuredId,
        entityLabel: form.name,
        mode
        // If you want to pass policy/options, add them here and forward in App.jsx
        // policy, options
      });

      if (!result || result.error) {
        showToast({ type: "error", message: result?.error || "Failed to compose email", duration: 4000 });
        return;
      }

      setEmailPreview({
        to: result.to || [],
        cc: result.cc || [],
        subject: result.subject || "",
        mailtoHref: result.mailtoHref || "",
        downloadHref: result.downloadHref || "",
        downloadFilename: result.downloadFilename || "",
        body: (result.bodyResolved || result.bodyInteractive || ""),
        meta: { mentions: result.mentions || [] }
      });
      setPreviewOpen(true);
    } catch (e) {
      console.error(e);
      showToast({ type: "error", message: e?.message || "Failed to compose email", duration: 4000 });
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
      showToast({ type: "success", message: "Email copied.", duration: 2800 });
    } catch {
      showToast({ type: "error", message: "Copy failed.", duration: 4000 });
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


  if (!open) return null;

  return (
    <>
      <Modal
        open={open}
        size="xl"
        title={project ? "Edit Project" : "Add Project"}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
            <IconButton
              icon={<CommAgentIcon />}
              title="Communication Agent"
              variant="neutral"
              size={18}
              onClick={toggleAgentMenu}
              disabled={busy}
            />
            {/* lightweight dropdown */}
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
                <button
                  className="menu-item" 
                  onClick={() => { closeAgentMenu(); handleCopyEmails(); }}>
                  Copy emails (To/CC)
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
              title="Save Project"
              variant="neutral"
              size={18}
              onClick={handleSubmit}
            />
            {copyToast && (
              <span style={{ color: "#2ae98d", fontSize: "0.99em", minWidth: 90 }}>
                {copyToast}
              </span>
            )}
          </div>

        }
        onClose={onClose}
        onDelete={onDelete ? () => onDelete(form.id) : undefined}
        deleteLabel={deleteLabel}
        deleting={deleting}
      >
        {/* Main Project Info */}
        <form id="project-form" onSubmit={handleSubmit} style={{ marginBottom: 16 }}>
          <label>
            Name
            <input name="name" value={form.name} onChange={handleChange} required />
          </label>
          <label>
            Description
            <textarea name="description" value={form.description} onChange={handleChange} />
          </label>
          <div style={{ display: "flex", gap: 16, margin: "12px 0" }}>
            <label style={{ flex: 1 }}>
              <DateRange
                startName="start_date"
                endName="end_date"
                startValue={form.start_date || ""}
                endValue={form.end_date || ""}
                onChange={handleChange}             // your existing handler
                // min="2020-01-01" max="2030-12-31" // optional global clamps
                weekStartsOn={1}
                locale="en-US"
              />
            </label>
            <label style={{ flex: 1 }}>
              Status
              <select name="status" value={form.status} onChange={handleChange}>
                <option value="Planned">Planned</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Running">Running</option>
                <option value="Complete">Complete</option>
                <option value="Canceled">Canceled</option>
                <option value="Blocked">Blocked</option>
              </select>
            </label>
          </div>
        </form>

        {/* Tabs */}
        <div className="tabbar" role="tablist" aria-label="Project sections">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "people"}
            className={`tab-btn ${activeTab === "people" ? "active" : ""}`}
            onClick={() => setActiveTab("people")}
            title="Project Leads"
          >
            <PeopleIcon />
            <span className="tab-label">People</span>
            <span className="tab-count" aria-label={`${peopleCount} people`}>{peopleCount}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "tasks"}
            className={`tab-btn ${activeTab === "tasks" ? "active" : ""}`}
            onClick={() => setActiveTab("tasks")}
            title="Tasks"
          >
            <TasksIcon />
            <span className="tab-label">Tasks</span>
            <span className="tab-count" aria-label={`${tasksCount} tasks`}>{tasksCount}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "tags"}
            className={`tab-btn ${activeTab === "tags" ? "active" : ""}`}
            onClick={() => setActiveTab("tags")}
            title="Tags"
          >
            <TagIcon />
            <span className="tab-label">Tags</span>
            <span className="tab-count" aria-label={`${tagsCount} tags`}>{tagsCount}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "links"}
            className={`tab-btn ${activeTab === "links" ? "active" : ""}`}
            onClick={openLinksTab}
            title="Links"
            >
              <ExternalLinkIcon />
              <span className="tab-label">Links</span>
              <span className="tab-count" aria-label={`${linksCount} links`}>{linksCount}</span>
          </button>
        </div>


        {/* Tab Content */}
        {activeTab === "people" && (
          <>
            {/* Toolbar: filter  add person (inline) */}
            <div style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8
            }}>

            <RolesAssigner
              people={filteredPeople}
              value={form.project_leads}
              onChange={(project_leads) => setForm(f => ({ ...f, project_leads }))}
              onAddPerson={() => {
                setPersonModalContext({ scope: "project"});
                setPersonModalOpen(true)}
              }
              tasksInProject={form.tasks || []}
              onAssignToTask={handleAssignPersonToTask}
            />
           </div>
          </>
        )}

        {activeTab === "tasks" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <FilterSearch value={taskSearch} onChange={setTaskSearch} placeholder="Search tasks..." />
              <IconButton
                icon={<AddIcon />}
                title="Add Task"
                variant="success"
                size={18}
                onClick={handleAddTaskClick}
              />
            </div>
            <TaskTable
              tasks={(form.tasks || []).filter(task =>
                task.name.toLowerCase().includes(taskSearch.toLowerCase()) ||
                (task.description || "").toLowerCase().includes(taskSearch.toLowerCase())
              )}
              onRowClick={handleEditTaskClick}
              showProject={false}
              peopleById={peopleById}
              projectsById={projectsById}
              onDeleteTask={handleDeleteTask}
            />
          </>
        )}

        {activeTab === "tags" && (
          <TagSelector
            value={form.tag_ids}
            onChange={(tag_ids) => {
              const selectedTags = (form.tags.length > 0 ? form.tags : project?.tags || [])
                .filter(t => tag_ids.includes(t.id));
              setForm(f => ({ ...f, tag_ids, tags: selectedTags }));
            }}
            objectType="Project"
            objectId={form.id}
            tags={form.tags}
            onRemoveTag={handleRemoveTagFromForm}
          />
        )}
        {activeTab === "links" && (
          <ProjectLinksTab
            projectId={form.id || project?.id || null}
            notify={notify}
            onCountChange={setLinksCount}   // optional badge updater
            />
          )}
      </Modal>

      {/* Inline Task creator */}
      <TaskModal
        open={taskModalOpen}
        task={selectedTask}
        people={people}
        onRemoveTag={handleRemoveTag}                 
        onSave={async (taskData) => {
          try {
            const pid = form.id || await ensureProjectId(form);

            // ensure the task is linked to THIS project
            const saved = await onTaskSave({ ...taskData, project_id: pid });

            if (saved) {
              // realtime update: upsert into the table
              setForm((f) => ({ ...f, tasks: upsertById(f.tasks, saved) }));
            } else {
              // if API didn’t return the task, refetch as a fallback
              const latest = await getProjectById(pid);
              setForm((f) => ({ ...f, tasks: latest.tasks || [] }));
            }

            setTaskModalOpen(false);
            setSelectedTask(null);
          } catch (e) {
            showToast({ type: "error", message: `Failed to save task: ${e.message}`, duration: 4000 });
          }
        }}
        onClose={() => setTaskModalOpen(false)}
        setToast={setToast}
        notify={notify}
        projectId={form.id || project?.id || null}
        onComposeEmail={onComposeEmail}
        onDelete={onDelete ? () => onDelete(selectedTask?.id) : undefined}
        deleteLabel={deleteLabel}
        deleting={deleting}
        onDeleteTask={handleDeleteTask} 
        onOpenAddPerson={() => {
          setSelectedPerson(null);     // ensure it's the "create" state
          setPersonModalContext({
            scope: "task",
            taskId: selectedTask?.id || null, // null when creating a brand-new task
          });
          setPersonModalOpen(true);    // open PersonModal
        }}
      />

      {/* Inline Person creator */}
      <PersonModal
        open={personModalOpen}
        person={null}
        onSave={handleSavePerson}
        onClose={() => setPersonModalOpen(false)}
      />
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
          <div><strong>CC:</strong> {(emailPreview?.cc || []).join(", ")}</div>
          <div><strong>Subject:</strong> {emailPreview?.subject || ""}</div>
          <hr style={{ borderColor: "#333" }} />
          <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{emailPreview?.body || ""}</pre>
        </div>
      </Modal>

    </>
  );
}
