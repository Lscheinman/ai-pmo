import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { getProjects, createProject, updateProject, deleteProject, addPeopleToProject } from "./api/projects";
import { getTasks, createTask, updateTask, deleteTask, addPeopleToTask } from "./api/tasks";
import { getGraphNetwork, askGraphAI, generateNodeSummary } from "./api/graph";
import { getPeople } from "./api/people";
import { getGroups } from "./api/groups";
import { composeEmail as composeEmailAPI } from "./api/communication";
import { importExcel } from "./api/importExcel";
import ExportModal from "./components/projects/ExportModal";
import ProjectTable from "./components/projects/ProjectTable";
import ProjectModal from "./components/projects/ProjectModal";
import GanttChart from "./components/projects/GanttChart";
import SwitchToggle from "./components/buttons/SwitchToggle";
import ImportButton from "./components/buttons/ImportButton";
import IconButton from "./components/buttons/IconButton";
import { AddIcon, CalendarIcon, GoToIcon, ExportIcon } from "./components/icons";
import Toast from "./components/Toast";
import TaskModal from "./components/tasks/TaskModal";
import PersonModal from "./components/people/PersonModal";
import GroupModal from "./components/groups/GroupsModal";
import FilterInput from "./components/FilterInput";
import { useTags } from "./context/TagsContext";
import GraphExplorer from "./components/graph/GraphExplorer";
import AppToolbar from "./components/AppToolbar";
import TagSelector from "./components/tags/TagsSelector";
import { extractNumber } from "./utils/strings";
import { getNeighborIds, buildUnionEgoSubgraph, graphSignature } from "./utils/graph";
import { MODES } from "./utils/gantt";
import DatePicker from "./components/dates/DatePicker";
import ToastHost from "./components/toast/ToastHost";

const HOME_ID = "home";

// tiny utils
const makeId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

export default function App() {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [people, setPeople] = useState([]);
  const [groups, setGroups] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [personModalOpen, setPersonModalOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  const [toast, setToast] = useState({ message: "", type: "success" });
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);

  const [axisMode, setAxisMode] = useState("month");
  const [projectFilter, setProjectFilter] = useState("");
  const [tagFilter, setTagFilter] = useState([]); // <number[]> selected tag IDs

  // AI + chat
  const [chatHistory, setChatHistory] = useState([]);
  const [chatOpen, setChatOpen] = useState(false);

  // Graph selection & data
  const [selectedNode, setSelectedNode] = useState(null);
  const [activePanel, setActivePanel] = useState("tasks");
  const [graphData, setGraphData] = useState(null);   // canvas view
  const [fullGraph, setFullGraph] = useState(null);   // full graph for AI queries
  const [focusTarget, setFocusTarget] = useState(null);

  // Graph history (local)
  const [graphHistory, setGraphHistory] = useState([]); // [{id,title,graph,meta,createdAt}]
  const [currentGraphId, setCurrentGraphId] = useState(HOME_ID);

  // Deleting states
  const [deletingProject, setDeletingProject] = useState(false);
  const [deletingTask, setDeletingTask] = useState(false);

  const { tags, handleCreateTag, handleRemoveTag } = useTags();

  // Date picker state
  const calWrapRef = useRef(null);
  const [calOpen, setCalOpen] = useState(false);
  const [pickedDate, setPickedDate] = useState(null); 

  // Tag filter UI state (collapsed button -> popover)
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const tagPickerRef = useRef(null);

  // Close popover on outside click
  useEffect(() => {
    function onDocClick(e) {
      if (!tagPickerRef.current) return;
      if (!tagPickerRef.current.contains(e.target)) setTagPickerOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setTagPickerOpen(false);
    }
    if (tagPickerOpen) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tagPickerOpen]);


  // -------- snapshot helpers --------
  const pushGraphSnapshot = useCallback((title, graph, meta = {}) => {
    if (!graph) return;

    const sig = graphSignature(graph);

    setGraphHistory((h) => {
      const latest = h[0];
      if (latest?.meta?.signature === sig) {
        setCurrentGraphId(latest.id);
        return h;
      }

      const snap = {
        id: makeId(),
        title: title || "Snapshot",
        graph,
        meta: { ...meta, signature: sig },
        createdAt: new Date().toISOString(),
      };

      const next = [snap, ...h];
      const MAX = 30;
      setCurrentGraphId(snap.id);
      return next.slice(0, MAX);
    });
  }, []);

  const removeSnapshot = useCallback((id) => {
    setGraphHistory((h) => {
      const next = h.filter((s) => s.id !== id);
      if (id === currentGraphId) setCurrentGraphId(HOME_ID);
      return next;
    });
  }, [currentGraphId]);

  const showHomeGraph = useCallback(() => setCurrentGraphId(HOME_ID), []);
  const selectSnapshot = useCallback((id) => setCurrentGraphId(id), []);
  const goPrev = useCallback(() => {
    const idx = graphHistory.findIndex((s) => s.id === currentGraphId);
    if (idx >= 0 && idx + 1 < graphHistory.length) setCurrentGraphId(graphHistory[idx + 1].id);
  }, [graphHistory, currentGraphId]);
  const goNext = useCallback(() => {
    const idx = graphHistory.findIndex((s) => s.id === currentGraphId);
    if (idx > 0) setCurrentGraphId(graphHistory[idx - 1].id);
  }, [graphHistory, currentGraphId]);

  // -------- chat / AI actions --------
  const handleSendChat = async (message) => {
    try {
      setChatHistory((prev) => [...prev, { type: "user", text: message }]);
      const res = await askGraphAI(message);

      const aiMsg = res?.answer || "No structured AI response received.";
      const graph = res?.graph || null;

      setChatHistory((prev) => [...prev, { type: "ai", text: aiMsg }]);
      if (graph) {
        // snapshot the graph from Ask AI
        pushGraphSnapshot("AI Query Result", graph, { type: "ask_ai", prompt: message });
      }
      setChatOpen(true);
      return aiMsg;
    } catch (err) {
      console.error(err);
      setToast({ message: "AI query failed", type: "error" });
      throw err;
    }
  };

  const handleGenerateNodeSummary = useCallback(
    async (node) => {
      try {
        const rawId = node?.id ?? node?.data?.id;
        if (!rawId) {
          setToast({ message: "Missing node id", type: "error" });
          return;
        }

        setToast({ message: "Generating AI summary…", type: "success" });

        // Server builds ego-graph, calls LLM, and persists the record
        const out = await generateNodeSummary(String(rawId), "summary");
        const summary = out?.summary?.trim() || "No summary generated.";
        const objectType = String(out?.object_type ?? node?.type ?? node?.data?.type ?? "").toLowerCase();
        const dbId = String(out?.object_id ?? extractNumber(rawId));
        const entityLabels = out?.entity_labels || {};

        // Snapshot the ego-graph and focus current canvas on it
        if (out?.graph) {
          const label = node?.label ?? node?.name ?? String(rawId);
          pushGraphSnapshot(`Ego: ${label}`, out.graph, { type: "node_summary", nodeId: rawId });
          setSelectedNode({ id: String(rawId) });
        }

        // Add a user+AI turn to chat
        const label = node?.label ?? node?.name ?? String(rawId);
        setChatHistory((prev) => [
          ...prev,
          { type: "user", text: `Tell me what I need to know about ${label} (${rawId}).` },
          { type: "ai", text: summary, entityLabels } 
        ]);
        setChatOpen(true);

        // Optimistically attach to the local entity list ai_history
        const record = {
          id: out?.rec_id || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          kind: out?.kind || "summary",
          summary,
          created_at: new Date().toISOString(),
          meta: {
            center_id: out?.node_id ?? String(rawId),
            ego_size: {
              nodes: out?.graph?.nodes?.length ?? 0,
              edges: out?.graph?.edges?.length ?? 0
            }
          }
        };

        const attach = (setter, arr) =>
          setter(
            arr.map((it) => {
              if (String(it.id) !== dbId) return it;
              const ai_history = Array.isArray(it.ai_history) ? it.ai_history : [];
              return { ...it, ai_history: [record, ...ai_history] };
            })
          );

        switch (objectType) {
          case "person":
            attach(setPeople, people);
            break;
          case "group":
            attach(setGroups, groups);
            break;
          case "project":
            attach(setProjects, projects);
            break;
          case "task":
            attach(setTasks, tasks);
            break;
          default:
            break; // skip tags/unknown types
        }

        setToast({ message: "AI summary saved", type: "success" });
        return summary;
      } catch (err) {
        console.error(err);
        setToast({ message: "Failed to generate/save AI summary", type: "error" });
      }
    },
    [
      people,
      groups,
      projects,
      tasks,
      setPeople,
      setGroups,
      setProjects,
      setTasks,
      setSelectedNode,
      setChatHistory,
      setChatOpen,
      setToast,
      pushGraphSnapshot
    ]
  );

  function buildMailtoLink({ to = [], cc = [], subject = "", body = "" }) {
    const q = new URLSearchParams();
    if (cc.length) q.set("cc", cc.join(","));
    q.set("subject", subject);
    q.set("body", body);
    return `mailto:${encodeURIComponent(to.join(","))}?${q.toString()}`;
  }

  function makeEmlContent({ to = [], cc = [], subject = "", body = "" }) {
    const headers = [
      `To: ${to.join(", ")}`,
      `Cc: ${cc.join(", ")}`,
      `Subject: ${subject}`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: 8bit`,
    ].join("\r\n");
    return `${headers}\r\n\r\n${body}`;
  }

  function makeDownloadAction(emlText, filename = "message.eml") {
    const blob = new Blob([emlText], { type: "message/rfc822;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    return { href: url, filename };
  }

  const handleComposeEmail = React.useCallback(
    async (payload) => {
      // Accept either shape:
      // 1) { entity: "task_2", mode: "status" }
      // 2) { entityType: "task", entityId: 2, entityLabel?: string, mode: "status" }
      const mode = payload?.mode || "status";

      const entity =
        payload?.entity ||
        (payload?.entityType && payload?.entityId
          ? `${String(payload.entityType)}_${String(payload.entityId)}`
          : null);

      if (!entity) throw new Error("Missing entity (expected 'entity' or entityType+entityId).");
          
      const entityLabel = payload?.entityLabel;
      const userAsk = `Compose a ${mode} email for ${entity}${entityLabel ? ` (${entityLabel})` : ""}.`;

      // user turn
      setChatHistory((prev) => [...prev, { type: "user", text: userAsk }]);
      setChatOpen(true);

      // call backend — use your simplified payload shape
      const out = await composeEmailAPI({ entity, mode });

      const subject = out?.subject || "(no subject)";
      const bodyInteractive = out?.body || "";                               // contains [entity_x]
      const bodyResolved = out?.meta?.bodyPreviewResolved || bodyInteractive; // clean for email
      const to = out?.to || [];
      const cc = out?.cc || [];
      const labels = Object.fromEntries(
        Object.entries(out?.meta?.mentions || {}).map(([id, m]) => [id, m.display || id])
      );

      const mailtoHref = buildMailtoLink({ to, cc, subject, body: bodyResolved });
      const eml = makeEmlContent({ to, cc, subject, body: bodyResolved });
      const dl = makeDownloadAction(eml, `${(subject || "message").slice(0, 80)}.eml`);

      // AI turn with actions
      setChatHistory((prev) => [
        ...prev,
        {
          type: "ai-email",
          text: `**${subject}**\n\n${bodyInteractive}`,
          entityLabels: labels,
          actions: [
            { type: "mailto", href: mailtoHref, label: "Open in Mail" },
            { type: "download", href: dl.href, filename: dl.filename, label: "Download .eml" }
          ],
        },
      ]);

      // return to modal so it can open preview
      return {
        subject,
        to,
        cc,
        bodyInteractive,
        bodyResolved,
        mailtoHref,
        downloadHref: dl.href,
        downloadFilename: dl.filename,
        mentions: out?.meta?.mentions || {},
      };
    },
    [setChatHistory, setChatOpen]
  );

  const handleChatAction = React.useCallback((action) => {
    // Optional: handle custom actions here (focus entity, etc.)
    if (action?.type === "focus" && action.id) {
      handleEntityClick(action.id);
    }
  }, []);


  // -------- tags actions --------
  const onCreateTag = async (name) => await handleCreateTag(name);
  const onRemoveTag = async (...args) => await handleRemoveTag(...args);

  // -------- graph entity click from toolbar search --------
  const handleEntityClick = (id) => {
    if (!id) return;
    setSelectedNode({ id: String(id) });
    setActivePanel(null);
  };

  const pushGraphSnapshotSilent = useCallback((title, graph, meta = {}) => {
    if (!graph) return;
    const sig = graphSignature(graph);
    setGraphHistory((h) => {
      const latest = h[0];
      if (latest?.meta?.signature === sig) return h; // dedupe consecutive identical
      const snap = {
        id: makeId(),
        title: title || "Snapshot",
        graph,
        meta: { ...meta, signature: sig },
        createdAt: new Date().toISOString(),
      };
      const MAX = 30;
      return [snap, ...h].slice(0, MAX);
    });
  }, [])

  // Build a raw backend-style ego graph from an existing raw graph
  function buildEgoGraphFromRaw(rawGraph, centerId, neighborIds = null) {
    if (!rawGraph) return { nodes: [], edges: [] };

    const nodes = rawGraph.nodes || [];
    const edges = rawGraph.edges || rawGraph.links || [];

    const toId = (n) => String(n?.data?.id ?? n?.id ?? n);
    const getST = (e) => {
      const sRaw = e?.data?.source ?? e?.source;
      const tRaw = e?.data?.target ?? e?.target;
      const s = typeof sRaw === "object" ? toId(sRaw) : String(sRaw);
      const t = typeof tRaw === "object" ? toId(tRaw) : String(tRaw);
      return [s, t];
    };

    // map id -> node (accepts {id} or {data:{id}})
    const nodeById = new Map(nodes.map((n) => [toId(n), n]));
    const me = String(centerId);
    const center = nodeById.get(me);
    if (!center) return { nodes: [], edges: [] };

    // If neighborIds not provided, derive from edges/links
    let neighIds = neighborIds;
    if (!Array.isArray(neighIds)) {
      const set = new Set();
      for (const e of edges) {
        const [s, t] = getST(e);
        if (s === me && t !== me) set.add(t);
        if (t === me && s !== me) set.add(s);
      }
      neighIds = Array.from(set);
    }

    const keepIds = new Set([me, ...neighIds.map(String)]);
    const egoNodes = Array.from(keepIds).map((id) => nodeById.get(id)).filter(Boolean);
    const egoEdges = edges.filter((e) => {
      const [s, t] = getST(e);
      return keepIds.has(s) && keepIds.has(t);
    });

    return { nodes: egoNodes, edges: egoEdges };
  }

  // ---- helpers: filtering ----
  const projectHasAnyTag = useCallback((project, selectedIds) => {
    if (!selectedIds?.length) return true; // no tag filter => match
    const pTagIds = Array.isArray(project?.tag_ids)
      ? project.tag_ids
      : Array.isArray(project?.tags)
        ? project.tags.map(t => t.id)
        : [];
    const selected = new Set(selectedIds.map(Number));
    return pTagIds.some(id => selected.has(Number(id))); // ANY-tag logic
  }, []);

  const textMatches = useCallback((p, text) => {
    const f = (text || "").trim().toLowerCase();
    if (!f) return true;
    return (
      (p.name && p.name.toLowerCase().includes(f)) ||
      (p.description && p.description.toLowerCase().includes(f)) ||
      (p.status && p.status.toLowerCase().includes(f)) ||
      (p.start_date && String(p.start_date).toLowerCase().includes(f)) ||
      (p.end_date && String(p.end_date).toLowerCase().includes(f))
    );
  }, []);

  const filterProjects = useCallback((list, text, selectedTags) => {
    return list.filter(p => textMatches(p, text) && projectHasAnyTag(p, selectedTags));
  }, [projectHasAnyTag, textMatches]);

  // -------- filter table --------
  const filteredProjects = useMemo(() => {
    if (!projects?.length) return [];
    return filterProjects(projects, projectFilter, tagFilter);
  }, [projects, projectFilter, tagFilter, filterProjects]);
  
  const handleProjectFilterChange = useCallback((value) => {
    setProjectFilter(value);
    if (!fullGraph) return;

    const f = value.trim().toLowerCase();

    // When text filter is cleared
    if (!f) {
      if (currentGraphId === HOME_ID && tagFilter.length === 0) {
        setGraphData({ graph: fullGraph });
      } else {
        // keep tag filter effect active
        const visible = filterProjects(projects, "", tagFilter);
        if (!visible.length || currentGraphId !== HOME_ID) return;
        const centers = visible.map((p) => `project_${p.id}`);
        const union = buildUnionEgoSubgraph(fullGraph, centers);
        if (!union.nodes?.length) return;

        setGraphData({ graph: union });

        const title = visible.length <= 3
          ? `Filter (tags): ${visible.map((p) => p.name).join(", ")}`
          : `Filter (tags): ${visible.length} projects`;
        pushGraphSnapshotSilent(title, union, { type: "filter_ego", centers });
      }
      return;
    }

    // Combined text + tag predicate
    const visible = filterProjects(projects, value, tagFilter);

    if (!visible.length) return;
    if (currentGraphId !== HOME_ID) return; // don’t clobber a selected snapshot

    // Build union of 1-hop egos for the visible projects
    const centers = visible.map((p) => `project_${p.id}`); // adjust if your ids differ
    const union = buildUnionEgoSubgraph(fullGraph, centers);
    if (!union.nodes?.length) return;

    setGraphData({ graph: union });

    // Add a silent breadcrumb without switching away from Home (uses your signature dedupe)
    const title = visible.length <= 3
      ? `Filter: ${visible.map((p) => p.name).join(", ")}`
      : `Filter: ${visible.length} projects`;
    pushGraphSnapshotSilent(title, union, { type: "filter_ego", centers });
  }, [projects, fullGraph, currentGraphId, setGraphData, pushGraphSnapshotSilent, tagFilter, filterProjects]);

  // Tag filter change → update selection + graph (mirrors text filter behavior)
  const handleTagFilterChange = useCallback((idsOrEvent) => {
    const ids = Array.isArray(idsOrEvent)
      ? idsOrEvent
      : Array.from(idsOrEvent?.target?.selectedOptions || [], opt => Number(opt.value));
    setTagFilter(ids);
    if (!fullGraph) return;

    // Compute visible using both current text and new tags
    const visible = filterProjects(projects, projectFilter, ids);
    if (!visible.length) {
      if (projectFilter.trim().length === 0 && currentGraphId === HOME_ID) {
        setGraphData({ graph: fullGraph });
      }
      return;
    }
    if (currentGraphId !== HOME_ID) return; // don’t clobber a selected snapshot

    const centers = visible.map((p) => `project_${p.id}`);
    const union = buildUnionEgoSubgraph(fullGraph, centers);
    if (!union.nodes?.length) return;
    setGraphData({ graph: union });

    const selectedNames = ids
      .map(id => tags.find(t => Number(t.id) === Number(id))?.name || String(id))
      .filter(Boolean);
    const title =
      visible.length <= 3
        ? `Tags: ${selectedNames.join(", ")} → ${visible.map(p => p.name).join(", ")}`
        : `Tags: ${selectedNames.join(", ")} → ${visible.length} projects`;
    pushGraphSnapshotSilent(title, union, { type: "filter_ego:tags", centers, tagIds: ids });
  }, [projects, projectFilter, fullGraph, currentGraphId, filterProjects, pushGraphSnapshotSilent, setGraphData, tags]);

  const centerIds = useMemo(() => {
    if (!fullGraph) return [];
    const idsInGraph = new Set(
      (fullGraph.nodes || []).map(n => String(n?.data?.id ?? n?.id ?? n))
    );

    return filteredProjects.map((p) => {
      const pid = String(p.id);
      const candidates = [`project_${pid}`, pid]; // add more if you have other shapes
      return candidates.find(c => idsInGraph.has(c)) || `project_${pid}`;
    });
  }, [filteredProjects, fullGraph]);

  const unionGraph = useMemo(() => {
    if (!fullGraph) return null;
    const hasFilter = projectFilter.trim().length > 0 || tagFilter.length > 0;
    if (!hasFilter) return null;
    if (!centerIds.length) return { nodes: [], edges: [] };

    return buildUnionEgoSubgraph(fullGraph, centerIds);
  }, [fullGraph, projectFilter, tagFilter, centerIds]);

  const notify = React.useCallback(
    (message, type = "success") => setToast({ message, type }),
    []
  );

  // Use References to avoid unnecessary re-renders
  const lastFilterSigRef = useRef("");
  const ganttRef = useRef(null);
  const dateInputRef = useRef(null);

  useEffect(() => {
    if (!fullGraph) return;

    // Only auto-apply on Home (so you don’t clobber a selected snapshot)
    if (currentGraphId !== HOME_ID) return;

    // No filter → restore full graph and clear guard
    if (!projectFilter.trim() && tagFilter.length === 0) {
      setGraphData({ graph: { nodes: fullGraph.nodes, edges: fullGraph.edges, links: fullGraph.edges } });
      lastFilterSigRef.current = "";
      return;
    }

    if (!unionGraph || !unionGraph.nodes?.length) return;

    const sig = graphSignature(unionGraph);
    if (sig === lastFilterSigRef.current) return; // no-op if unchanged
    lastFilterSigRef.current = sig;

    setGraphData({ graph: { nodes: unionGraph.nodes, edges: unionGraph.edges, links: unionGraph.edges } });

    const title =
      filteredProjects.length <= 3
        ? `Filter: ${filteredProjects.map(p => p.name).join(", ")}`
        : `Filter: ${filteredProjects.length} projects`;

    // silent breadcrumb (doesn't switch away from Home)
    pushGraphSnapshotSilent(title, unionGraph, { type: "filter_ego", centers: centerIds });
  }, [unionGraph, projectFilter, tagFilter, currentGraphId, fullGraph, filteredProjects, centerIds, pushGraphSnapshotSilent, setGraphData]);


  // One-time initial load: entities + full graph (no aiGraph involved)
  useEffect(() => {
    (async () => {
      try {
        const [proj, tks, ppl, grps, net] = await Promise.all([
          getProjects(), getTasks(), getPeople(), getGroups(), getGraphNetwork()
        ]);
        setProjects(proj);
        setTasks(tks);
        setPeople(ppl);
        setGroups(grps);

        setFullGraph(net.graph);            // keep pristine copy
        setGraphData({ graph: net.graph }); // show full graph by default
      } catch (e) { console.error(e); }
    })();
  }, []);

  // -------- currentGraphId switching (Home vs Snapshot) --------
  useEffect(() => {
    if (currentGraphId === HOME_ID) {
      if (fullGraph) setGraphData({ graph: fullGraph });
    } else {
      const snap = graphHistory.find(s => s.id === currentGraphId);
      if (snap?.graph) setGraphData({ graph: snap.graph });
    }
  }, [currentGraphId, graphHistory, fullGraph]);

  // Auto-focus canvas on selected node's ego graph, regardless of where selection came from
  useEffect(() => {
    if (!selectedNode || !fullGraph) return;

    // Accept string or {id} or {data:{id}}
    const selectedId = typeof selectedNode === "string"
      ? selectedNode
      : String(selectedNode?.id ?? selectedNode?.data?.id ?? "");

    if (!selectedId) return;

    // 1) Compute neighbors locally from the pristine graph
    const neighborIds = getNeighborIds(fullGraph, selectedId);

    // 2) Build ego graph (includes the center even if no neighbors)
    const ego = buildEgoGraphFromRaw(
      { nodes: fullGraph.nodes, edges: fullGraph.edges || fullGraph.links },
      selectedId,
      neighborIds
    );

    // 3) Swap the canvas view to the ego graph
    setGraphData({ graph: ego });

    // (Optional) If you *also* want a breadcrumb/history snapshot:
    // pushGraphSnapshot(`Ego: ${selectedId}`, ego, { type: "ego:auto", centerId: selectedId });
  }, [selectedNode, fullGraph]);


  // -------- import post-refresh --------
  const refreshFullGraph = useCallback(async () => {
    try {
      const res = await getGraphNetwork();
      setFullGraph(res.graph);
      if (currentGraphId === HOME_ID) setGraphData({ graph: res.graph });
    } catch (e) { console.error(e); }
  }, [currentGraphId]);

  function handlePostImport() {
    Promise.all([getProjects(), getTasks(), getPeople(), getGroups()])
      .then(([proj, tks, ppl, grps]) => {
        setProjects(proj);
        setTasks(tks);
        setPeople(ppl);
        setGroups(grps);
      })
      .finally(() => refreshFullGraph());
    setToast({ message: "Import successful!", type: "success" });
  }

  // -------- openers for modals (ADDED BACK) --------
  const openProjectEditor = useCallback(
    (projectId) => {
      const proj = projects.find((p) => String(p.id) === String(extractNumber(projectId)));
      if (!proj) return setToast({ message: `Project ${projectId} not found`, type: "error" });
      setSelectedProject(proj);
      setModalOpen(true);
    },
    [projects]
  );

  const openTaskEditor = useCallback(
    (taskId) => {
      const task = tasks.find((t) => String(t.id) === String(extractNumber(taskId)));
      if (!task) return setToast({ message: `Task ${taskId} not found`, type: "error" });
      setSelectedTask(task);
      setTaskModalOpen(true);
    },
    [tasks]
  );

  const openPersonEditor = useCallback(
    (personId) => {
      const person = people.find((p) => String(p.id) === String(extractNumber(personId)));
      if (!person) return setToast({ message: `Person ${personId} not found`, type: "error" });
      setSelectedPerson(person);
      setPersonModalOpen(true);
    },
    [people]
  );

  const openGroupEditor = useCallback(
    (groupId) => {
      const group = groups.find((g) => String(g.id) === String(extractNumber(groupId)));
      if (!group) return setToast({ message: `Group ${groupId} not found`, type: "error" });
      setSelectedGroup(group);
      setGroupModalOpen(true);
    },
    [groups]
  );

  // -------- table handlers --------
  const getGraphIdForProject = useCallback((projId) => {
    const pid = String(projId);
    const idsInGraph = new Set(
      (fullGraph?.nodes || []).map(n => String(n?.data?.id ?? n?.id ?? n))
    );
    
    if (idsInGraph.has(`project_${pid}`)) return `project_${pid}`;
    if (idsInGraph.has(pid)) return pid;
    return `project_${pid}`; // sensible fallback
  }, [fullGraph]);

  function handleRowClick(proj) {
    setSelectedProject(proj);
    setModalOpen(true);
    // ensure NodeDetailsPanel binds to the clicked project immediately
    const graphId = getGraphIdForProject(proj.id);
    setSelectedNode({ id: graphId });
    // Show the node details panel (not the list tabs)
    setActivePanel(null); // (same convention you use in handleEntityClick)
    setFocusTarget({
      type: "project",
      id: proj.id,
      label: proj.name,
      reqId: Math.random().toString(36).slice(2)
    });
  }

  function handleAdd() {
    setSelectedProject(null);
    setModalOpen(true);
  }

  async function handleSave(project) {
    if (selectedProject?.id) {
      await updateProject(selectedProject.id, project);
    } else {
      await createProject(project);
    }
    getProjects().then(setProjects);
    setModalOpen(false);
    setSelectedProject(null);
  }

  const ensureProjectId = useCallback(async (formLike) => {
    if (formLike?.id) return formLike.id;

    const payload = {
      name: formLike.name,
      description: formLike.description,
      start_date: formLike.start_date || null,
      end_date: formLike.end_date || null,
      status: formLike.status || "Planned",
      project_leads: formLike.project_leads || [],
      tag_ids: formLike.tag_ids || []
    };

    const saved = await createProject(payload);
    const fresh = await getProjects();
    setProjects(fresh);
    return saved.id;
  }, []);

  async function handleTaskSave(taskData) {
    if (!taskData.project_id) {
      setToast({ message: "Task must be linked to a project", type: "error" });
      return;
    }

    let saved = null;
    if (taskData.id) {
      saved = await updateTask(taskData.id, taskData);
      notify("Task updated", "success");
    } else {
      saved = await createTask(taskData);
      notify("Task created", "success");
    }

    // keep global task list fresh
    getTasks().then(setTasks);

    // let the caller (ProjectModal) upsert locally
    return saved;
  }

  async function handleDeleteProject() {
    if (!selectedProject?.id) return;
    const ok = window.confirm(`Delete project "${selectedProject.name}" and its associations?`);
    if (!ok) return;

    try {
      setDeletingProject(true);
      await deleteProject(selectedProject.id);
      setToast({ message: "Project deleted", type: "success" });

      // Refresh entities & graph
      const [proj, tks, ppl, grps] = await Promise.all([
        getProjects(), getTasks(), getPeople(), getGroups()
      ]);
      setProjects(proj);
      setTasks(tks);
      setPeople(ppl);
      setGroups(grps);
      await refreshFullGraph();

      // Close modal & clear selection
      setModalOpen(false);
      setSelectedProject(null);
    } catch (e) {
      console.error(e);
      setToast({ message: "Failed to delete project", type: "error" });
    } finally {
      setDeletingProject(false);
    }
  }

  async function handleTaskDelete(taskId) {
    if (!taskId) return;
    const ok = window.confirm("Delete this task?");
    if (!ok) return;
    try {
      setDeletingTask(true);
      await deleteTask(taskId);
      setToast({ message: "Task deleted", type: "success" });
      getTasks().then(setTasks);
      await refreshFullGraph();

      // Close the Task modal if open
      setTaskModalOpen(false);
      setSelectedTask(null);
    } catch (e) {
      console.error(e);
      setToast({ message: "Failed to delete task", type: "error" });
    } finally {
      setDeletingTask(false);
    }
  }

  return (
    <div className="container">
      <AppToolbar
        onSendChat={handleSendChat}
        chatHistory={chatHistory}
        chatOpen={chatOpen}
        setChatOpen={setChatOpen}
        handleEntityClick={handleEntityClick}
        graphHistory={graphHistory}
        currentGraphId={currentGraphId}
        onShowHome={showHomeGraph}
        onSelectSnapshot={selectSnapshot}
        onRemoveSnapshot={removeSnapshot}
        onPrevSnapshot={goPrev}
        onNextSnapshot={goNext}
        onAction={handleChatAction}
      />

      {/* --- MAIN FLEX ROW --- */}
      <div className="main-row">
        <div className="main-col table-col panel">
          <div className="table-toolbar panel__toolbar">
            <IconButton icon={<AddIcon />} title="Add" variant="success" size={18} onClick={handleAdd} />
            <ImportButton
              onFile={async (file) => {
                try {
                  await importExcel(file);
                  handlePostImport();
                } catch (err) {
                  setToast({ message: "Import failed: " + err.message, type: "error" });
                }
              }}
            />
            <IconButton
              icon={<ExportIcon size={18} />}
              title="Export"
              variant="neutral"
              onClick={() => setExportModalOpen(true)}
            />
            <FilterInput value={projectFilter} onChange={handleProjectFilterChange} placeholder="Filter projects…" />
            
            {/* Inline Tag filter — matches the FilterInput look & behavior */}
            <div style={{ width: 260, marginLeft: 8 }}>
              <TagSelector
                value={tagFilter}
                onChange={(ids) => handleTagFilterChange(ids)}  // already supports arrays
                persist={false}                                  // filtering only; no backend writes
                objectType="Filter"
                objectId={null}
                tags={tags}
                inputClassName=""                                 // uses .filter-input already applied above
                placeholder="Filter by tags…"
                showSelected={false}                              // keep the header compact
                style={{ margin: 0 }}
              />
            </div>

          </div>
          <ProjectTable projects={filteredProjects} onRowClick={handleRowClick} />
        </div>

        <div className="main-col gantt-col panel">
          <div className="panel__body panel__body--gantt">
            <div className="gantt-toolbar" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {/* LEFT controls: calendar + go-to-today */}
              <div style={{ display: 'flex', gap: '0.5rem', marginRight: 'auto' }}>
                {/* Hidden native date input */}
                <input
                  ref={dateInputRef}
                  type="date"
                  style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }}
                  onChange={(e) => {
                    const v = e.currentTarget.value;
                    if (!v || !ganttRef.current) return;
                    ganttRef.current.goToDate(new Date(v + "T00:00:00"));
                  }}
                />

                {/* Open calendar */}
                <span ref={calWrapRef} style={{ position: "relative", display: "inline-block" }}>
                  <IconButton
                    icon={<CalendarIcon />}
                    title="Pick Date"
                    variant="neutral"
                    size={18}
                    onMouseDown={(e) => e.preventDefault()} 
                    onClick={() => setCalOpen((v) => !v)}
                  />

                  <DatePicker
                    open={calOpen}
                    anchorRef={calWrapRef}
                    value={pickedDate}
                    onChange={(d) => {
                      setPickedDate(d);
                      setCalOpen(false);
                      ganttRef.current?.goToDate(d);
                    }}
                    onClose={() => setCalOpen(false)}
                  />
                </span>
                {/* Go to Today */}
                <IconButton
                  icon={<GoToIcon />}
                  title="Go to Today"
                  variant="neutral"
                  size={18}
                  onClick={() => ganttRef.current?.goToToday()}
                />
              </div>

              {/* RIGHT: your tabs/switch */}
              <SwitchToggle options={MODES} value={axisMode} onChange={setAxisMode} />
            </div>
          </div>
          {/* Gantt Chart */}
          <GanttChart
            ref={ganttRef}
            projects={filteredProjects}
            tasks={tasks}
            axisMode={axisMode}
            setAxisMode={setAxisMode}
            onBarClick={handleRowClick}
            onTaskClick={(task) => { setSelectedTask(task); setTaskModalOpen(true); }}
          />

        </div>
      </div>

      {/* --- GRAPH ROW --- */}
      <div className="graph-row" style={{ marginTop: "2rem" }}>
        <GraphExplorer
          people={people}
          setPeople={setPeople}
          groups={groups}
          setGroups={setGroups}
          tasks={tasks}
          setTasks={setTasks}
          selectedTask={selectedTask}
          setSelectedTask={setSelectedTask}
          setTaskModalOpen={setTaskModalOpen}
          onTaskSave={handleTaskSave}
          onTaskDelete={handleTaskDelete}
          taskModalOpen={taskModalOpen}
          tags={tags}
          onCreateTag={onCreateTag}
          onRemoveTag={onRemoveTag}
          selectedNode={selectedNode}
          setSelectedNode={setSelectedNode}
          activePanel={activePanel}
          setActivePanel={setActivePanel}
          graphData={graphData}
          setGraphData={setGraphData}
          openProjectEditor={openProjectEditor}
          openTaskEditor={openTaskEditor}
          openPersonEditor={openPersonEditor}
          openGroupEditor={openGroupEditor}
          onSummarizeNode={handleGenerateNodeSummary}
          graphHistory={graphHistory}
          currentGraphId={currentGraphId}
          onShowHome={() => setCurrentGraphId(HOME_ID)}
          onSelectSnapshot={selectSnapshot}
          onRemoveSnapshot={removeSnapshot}
          onPrevSnapshot={goPrev}
          onNextSnapshot={goNext}
          fullGraph={fullGraph}
          focusTarget={focusTarget}
          onPushSnapshot={(title, graph, meta) => pushGraphSnapshot(title, graph, meta)}
        />
      </div>

      {/* --- MODALS --- */}
      <ProjectModal
        key={selectedProject?.id || 'new'}
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedProject(null);
        }}
        onSave={handleSave}
        project={selectedProject}
        project_id={selectedProject?.id}
        people={people}
        projects={projects}
        onTaskSave={handleTaskSave}
        tags={tags}
        onRemoveTag={onRemoveTag}
        notify={(message, type = "success") => setToast({ message, type })}
        setPeople={setPeople}
        ensureProjectId={ensureProjectId}
        onDelete={selectedProject?.id ? handleDeleteProject : undefined}
        deleteLabel="Delete Project"
        deleting={deletingProject}
        onComposeEmail={handleComposeEmail}
        setToast={setToast}
        setSelectedPerson={setSelectedPerson}
      />

      <TaskModal
        open={taskModalOpen}
        task={selectedTask}
        people={people}
        onRemoveTag={onRemoveTag}
        onSave={handleTaskSave}
        onClose={() => {
          setTaskModalOpen(false);
          setSelectedTask(null);
        }}
        setToast={setToast}
        notify={notify}
        onDelete={selectedTask?.id ? () => handleTaskDelete(selectedTask.id) : undefined}
        deleteLabel="Delete Task"
        deleting={deletingTask}
        onComposeEmail={handleComposeEmail}
        onOpenAddPerson={() => {
          setSelectedPerson(null);     // ensure it's the "create" state
          setPersonModalOpen(true);    // open PersonModal
        }}
      />

      <PersonModal
        open={personModalOpen}
        person={selectedPerson}
        onSave={() => {
          setPersonModalOpen(false);
          setSelectedPerson(null);
          getPeople().then(setPeople);
        }}
        onClose={() => {
          setPersonModalOpen(false);
          setSelectedPerson(null);
        }}
        setToast={setToast}
      />
      <GroupModal
        open={groupModalOpen}
        group={selectedGroup}
        people={people}
        projects={projects}
        tasks={tasks}
        onSave={() => {
          setGroupModalOpen(false);
          setSelectedGroup(null);
          getGroups().then(setGroups);
        }}
        onClose={() => {
          setGroupModalOpen(false);
          setSelectedGroup(null);
        }}
        onAssignGroup={async ({ targetType, targetId, role, memberIds }) => {
          // role is "R/A/C/I" from the modal
          const payload = { person_ids: memberIds, role };

          if (targetType === "project") {
            await addPeopleToProject(targetId, payload);
            await getProjects().then(setProjects);   // keep UI fresh
          } else {
            await addPeopleToTask(targetId, payload);
            await getTasks().then(setTasks);
          }

          setToast({ message: `Assigned ${memberIds.length} member(s) as ${role} to ${targetType} ${targetId}`, type: "success" });
        }}
        setToast={setToast}
      />


      <ExportModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        // Helpful defaults:
        suggestedProjectIds={filteredProjects.map(p => p.id)} // current filter set
      />

      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ ...toast, message: "" })} />
      <ToastHost />
    </div>
  );
}
