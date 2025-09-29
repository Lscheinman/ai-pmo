// components/graph/GraphExplorer.jsx
import React, { useCallback, useMemo, useEffect } from "react";
import GraphCanvas from "./GraphCanvas";
import NodeDetailsPanel from "./NodeDetailsPanel";
import PeopleList from "../people/PeopleList";
import GroupsPanel from "../groups/GroupsPanel";
import TasksPanel from "../tasks/TasksPanel";
import DailyTasksPanel from "../tasks/DailyTasksPlanner";
import { getGraphNetwork } from "../../api/graph";
import GraphToolbar from "./GraphToolbar";
import GraphHistoryBar from "./GraphHistoryBar";
import GraphExpandControl from "./GraphExpandControl";
import { buildNHopSubgraph } from "../../utils/graphExpand";
import { buildUnionEgoSubgraph, getDbIdFromGraphNode } from "../../utils/graph";

// ---------- local helper (build ego graph from raw backend-shaped graph) ----------
function buildEgoGraphFromRaw(rawGraph, centerId) {
  if (!rawGraph) return { nodes: [], edges: [] };
  const nodes = rawGraph.nodes || [];
  const edges = rawGraph.edges || rawGraph.links || [];

  const idOf = (x) => x?.data?.id;
  const nodeById = new Map(nodes.map(n => [idOf(n), n]));
  if (!nodeById.has(centerId)) return { nodes: [], edges: [] };

  const keepIds = new Set([centerId]);
  edges.forEach(e => {
    const s = e?.data?.source, t = e?.data?.target;
    if (s === centerId && t) keepIds.add(t);
    if (t === centerId && s) keepIds.add(s);
  });

  const egoNodes = nodes.filter(n => keepIds.has(idOf(n)));
  const egoEdges = edges.filter(e => keepIds.has(e?.data?.source) && keepIds.has(e?.data?.target));
  return { nodes: egoNodes, edges: egoEdges };
}

// ---------- NEW: Toolbar search ----------
function GraphSearch({ nodes, tasks, onFocus }) {
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [results, setResults] = React.useState([]);
  const [active, setActive] = React.useState(-1);
  const wrapRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const debounceRef = React.useRef(null);

  const norm = (s) => String(s || "").toLowerCase().trim();

  // outside click
  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // esc to close
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        setActive(-1);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // find matches in nodes + task dates
  const runSearch = useCallback((query) => {
    const needle = norm(query);
    if (!needle) {
      setResults([]);
      return;
    }

    const isEmail = needle.includes("@");
    const hasDigit = /\d/.test(needle);

    const nodeHits = [];
    for (const n of nodes) {
      const type = String(n.type || "").toLowerCase();
      const label = n.label || "";
      const email = n.email || "";
      const id = n.id;

      // Basic name/label match for all entities
      let score = 0;
      if (norm(label).includes(needle)) score += 2;

      // Email boost for people
      if (isEmail && email && norm(email).includes(needle)) score += 3;

      // If we didn't match anything, skip
      if (score <= 0) continue;

      nodeHits.push({
        kind: "node",
        id,
        type,
        label,
        subLabel: email && type === "person" ? email : type,
        score
      });
    }

    // Task date/name hits using tasks prop
    const taskHits = [];
    if (hasDigit) {
      for (const t of tasks || []) {
        const start = String(t.start || t.start_date || "");
        const end = String(t.end || t.end_date || "");
        const name = t.name || "";

        let score = 0;
        if (norm(name).includes(needle)) score += 2;
        if (start && start.toLowerCase().includes(needle)) score += 3;
        if (end && end.toLowerCase().includes(needle)) score += 3;
        if (score <= 0) continue;

        taskHits.push({
          kind: "task",
          id: `task_${t.id}`,
          type: "task",
          label: name || `Task #${t.id}`,
          subLabel: [start, end].filter(Boolean).join(" → "),
          rawId: t.id,
          score
        });
      }
    }

    const all = [...nodeHits, ...taskHits]
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    setResults(all);
  }, [nodes, tasks]);

  // debounce search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(q), 180);
    return () => clearTimeout(debounceRef.current);
  }, [q, runSearch]);

  const select = useCallback((item) => {
    setOpen(false);
    setActive(-1);
    if (!item) return;

    // Prefer parsed id: type_dbid
    const m = /^(\w+?)_(\d+)$/.exec(item.id || "");
    if (m) {
      const type = m[1].toLowerCase();
      const dbid = Number(m[2]);
      onFocus?.(type, dbid, item.label);
      setQ(""); // clear after select
      return;
    }

    // If it's a task hit with rawId
    if (item.kind === "task" && item.rawId != null) {
      onFocus?.("task", Number(item.rawId), item.label);
      setQ("");
      return;
    }

    // Fallback: parse from `type` or skip
    if (item.type && item.id) {
      const type = String(item.type).toLowerCase();
      // try to derive number at the end e.g. "..._123"
      const endNum = /(\d+)$/.exec(String(item.id));
      if (endNum) {
        onFocus?.(type, Number(endNum[1]), item.label);
        setQ("");
        return;
      }
    }
    // If all else fails, do nothing
  }, [onFocus]);

  return (
    <div ref={wrapRef} style={{ position: "relative", minWidth: 260 }}>
      <div className="input-with-x" style={{ display: "inline-block", width: "100%" }}>
        <input
          ref={inputRef}
          className="filter-input"
          style={{ width: "100%" }}
          placeholder="Search graph… (name, email, date)"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => { if (q) setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (results[active]) select(results[active]);
              else if (results[0]) select(results[0]);
            }
          }}
        />
        {q && (
          <button
            type="button"
            className="input-clear-x"
            onClick={() => { setQ(""); setResults([]); setActive(-1); inputRef.current?.focus(); }}
            title="Clear"
            aria-label="Clear"
          >
            ×
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            background: "#202632",
            borderRadius: 8,
            border: "1.5px solid #283043",
            boxShadow: "0 4px 18px rgba(0,0,0,0.3)",
            zIndex: 400,
            minWidth: 320,
            maxHeight: 280,
            overflowY: "auto"
          }}
        >
          {results.map((r, idx) => (
            <div
              key={`${r.kind}:${r.id}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(r)}
              onMouseEnter={() => setActive(idx)}
              style={{
                padding: "8px 10px",
                cursor: "pointer",
                background: idx === active ? "#2f3b52" : "transparent",
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 8,
                alignItems: "center"
              }}
              title={r.subLabel || r.type}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{r.label}</div>
                {r.subLabel && (
                  <div style={{ fontSize: 12, opacity: 0.8 }}>{r.subLabel}</div>
                )}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7, textTransform: "capitalize" }}>
                {r.type}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GraphExplorer({
  people, setPeople,
  groups, setGroups,
  tasks, setTasks,
  selectedTask, setSelectedTask,
  setTaskModalOpen, onTaskSave, onTaskDelete,
  taskModalOpen, tags, onCreateTag, onRemoveTag,
  selectedNode, setSelectedNode,
  activePanel, setActivePanel,
  graphData, setGraphData,
  openProjectEditor, openTaskEditor,
  openPersonEditor, openGroupEditor,
  onSummarizeNode, graphHistory,
  currentGraphId,
  onShowHome,
  onSelectSnapshot,
  onRemoveSnapshot,
  onPrevSnapshot,
  onNextSnapshot,
  onPushSnapshot,
  fullGraph,
  focusTarget
}) {

  // --- N-hop expansion state (seed centers + hop count)
  const [expandSeeds, setExpandSeeds] = React.useState(() => new Set());
  const [expandAccumulate, setExpandAccumulate] = React.useState(false);
  const [expandHops, setExpandHops] = React.useState(1);

  const useSelectionAsCenter = useCallback((nodeId) => {
    if (!nodeId) return;
    setExpandSeeds(prev => {
      const next = new Set(expandAccumulate ? prev : []);
      next.add(String(nodeId));
      return next;
    });
  }, [expandAccumulate]);

  const resetExpansion = useCallback(() => {
    setExpandSeeds(new Set());
    setExpandHops(1);
  }, []);

  const onToggleAccumulate = useCallback(() => {
    setExpandAccumulate(v => !v);
  }, []);

  // Normalize the incoming graph (supports {nodes, edges} or {nodes, links})
  const normalizedGraph = useMemo(() => {
    const g = graphData?.graph || {};
    const rawNodes = Array.isArray(g.nodes) ? g.nodes : [];
    const rawEdges = Array.isArray(g.edges) ? g.edges : (Array.isArray(g.links) ? g.links : []);

    const nodes = rawNodes.map(n => {
      const d = n?.data || n || {};
      const id = String(d.id ?? d._id ?? d.key ?? "");
      if (!id) return null;
      return {
        id,
        label: d.label ?? d.name ?? d.title ?? id,
        type: d.type ?? d.category ?? "Unknown",
        email: d.email ?? null,               // <-- keep email for search
        detail: d.detail ?? null,
      };
    }).filter(Boolean);

    const links = rawEdges.map(e => {
      const d = e?.data || e || {};
      const source = d.source ?? d.src ?? d.from;
      const target = d.target ?? d.tgt ?? d.to;
      return (source && target) ? { source, target } : null;
    }).filter(Boolean);

    return { nodes, links };
  }, [graphData]);

  const nodeMap = useMemo(() => {
    const m = Object.create(null);
    for (const n of normalizedGraph.nodes) m[n.id] = n;
    return m;
  }, [normalizedGraph]);

  const selectNodeById = useCallback((id) => nodeMap[id], [nodeMap]);

  // Toolbar toggle
  const handleToolbarChange = (panel) => {
    if (panel === activePanel) setActivePanel(null);
    else { setActivePanel(panel); setSelectedNode(null); }
  };

  const refreshGraph = useCallback(() => {
    getGraphNetwork().then((res) => setGraphData({ graph: res.graph })).catch(console.error);
  }, [setGraphData]);

  // —— Handle "focus request" from App (e.g., clicking a Project row) ——
  useEffect(() => {
    if (!focusTarget?.reqId) return;

    const doFocus = async () => {
      try {
        const centerId = `${String(focusTarget.type).toLowerCase()}_${String(focusTarget.id)}`;

        // Prefer latest full graph if available; else fallback to current
        let raw = graphData?.graph;
        try {
          const res = await getGraphNetwork();
          raw = res?.graph || raw;
        } catch {
          /* ignore; use current raw */
        }

        const ego = buildEgoGraphFromRaw(raw, centerId);
        if (!ego.nodes?.length) return;

        const title = focusTarget.label
          ? `Ego: ${focusTarget.label}`
          : `Ego: ${focusTarget.type} ${focusTarget.id}`;

        onPushSnapshot?.(title, ego, { type: "ego", centerId });
        setSelectedNode(centerId);
      } catch (e) {
        console.error("focusTarget failed", e);
      }
    };

    void doFocus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTarget?.reqId]); // re-run only for new requests

  const isGraphReady = Boolean(graphData?.graph);

  const normType = (t) => String(t || "").trim().toLowerCase();

  const handleNodeEdit = (node) => {
    const t = normType(node?.type);
    const dbId = getDbIdFromGraphNode(node);
    if (!dbId) {
      console.warn("No DB id for node", node);
      return;
    }

    switch (t) {
      case "project":
      case "projects":
        openProjectEditor?.(dbId); break;
      case "task":
      case "tasks":
        openTaskEditor?.(dbId); break;
      case "person":
      case "people":
        openPersonEditor?.(dbId); break;
      case "group":
      case "groups":
        openGroupEditor?.(dbId); break;
      default:
        break;
    }
  };

  // Base raw graph
  const rawGraph = useMemo(() => fullGraph || graphData?.graph || { nodes: [], edges: [] }, [fullGraph, graphData]);

  const viewGraph = useMemo(() => {
    if (!expandSeeds.size) return graphData?.graph; // show current snapshot until user picks centers
    const res = buildNHopSubgraph(rawGraph, Array.from(expandSeeds), expandHops);
    console.debug("[N-hop]", { centers: Array.from(expandSeeds), hops: expandHops, baseNodes: rawGraph?.nodes?.length, baseEdges: (rawGraph?.edges||rawGraph?.links||[]).length, viewNodes: res?.nodes?.length, viewEdges: (res?.edges||res?.links||[]).length });
    return res;
  }, [rawGraph, expandSeeds, expandHops, graphData]);

  // focus helpers
  const focusEntity = useCallback((entityType, entityId, label) => {
    const centerId = `${String(entityType).toLowerCase()}_${String(entityId)}`;
    const raw = fullGraph || graphData?.graph;
    const ego = buildEgoGraphFromRaw(raw, centerId);
    if (!ego?.nodes?.length) return;

    const title = label ? `Ego: ${label}` : `Ego: ${entityType} ${entityId}`;
    onPushSnapshot?.(title, ego, { type: "ego", centerId });

    setSelectedNode({ id: centerId });
    setActivePanel(null);
  }, [fullGraph, graphData, onPushSnapshot, setSelectedNode, setActivePanel]);

  const focusMany = useCallback((entityType, ids, label) => {
    if (!ids?.length) return;
    const centers = ids.map(id => `${String(entityType).toLowerCase()}_${String(id)}`);
    const raw = fullGraph || graphData?.graph;
    const union = buildUnionEgoSubgraph(raw, centers);
    if (!union?.nodes?.length) return;

    const title = label || `Ego union: ${ids.length} ${entityType}${ids.length === 1 ? "" : "s"}`;
    onPushSnapshot?.(title, union, { type: "ego_union", centers });
    setActivePanel(null);
  }, [fullGraph, graphData, onPushSnapshot, setActivePanel]);

  return (
    <div className="graph-explorer-container" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* TOP BAR across both columns */}
      <GraphToolbar
        activePanel={activePanel}
        onChange={handleToolbarChange}
        historyBar={
          <GraphHistoryBar
            graphHistory={graphHistory}
            currentGraphId={currentGraphId}
            onShowHome={onShowHome}
            onSelectSnapshot={onSelectSnapshot}
            onRemoveSnapshot={onRemoveSnapshot}
            onPrevSnapshot={onPrevSnapshot}
            onNextSnapshot={onNextSnapshot}
            compact
          />
        }
        leftExtras={
          <GraphSearch
            nodes={normalizedGraph.nodes}
            tasks={tasks}
            onFocus={(type, id, label) => focusEntity(type, id, label)}
          />
        }
        rightExtras={
          <GraphExpandControl
            selectedNode={selectedNode}
            seedIds={expandSeeds}
            onUseSelection={useSelectionAsCenter}
            onResetSeeds={resetExpansion}
            hops={expandHops}
            onHopsChange={setExpandHops}
            accumulate={expandAccumulate}
            onToggleAccumulate={onToggleAccumulate}
          />
        }
        detailsActive={Boolean(selectedNode)}  
        onShowDetails={() => {
          if (selectedNode) {
            setActivePanel(null);
            setSelectedNode({ id: selectedNode.id || selectedNode });
          } else {
            setActivePanel(null);
          }
        }}
      />

      {/* 2-column content below the toolbar */}
      {isGraphReady ? (
        <div className="graph-content" style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 12 }}>
          {/* LEFT PANEL */}
          <div className={`graph-left-panel ${selectedNode ? "with-details" : ""}`}>
            {activePanel && !selectedNode && (
              <div className="graph-card">
                {activePanel === "people" && (
                  <PeopleList
                    people={people}
                    setPeople={(updated) => { setPeople(updated); refreshGraph(); }}
                    onFocusPerson={(p) => focusEntity("person", p.id, p.name)}        
                    onFocusMany={(ids) => focusMany("person", ids, "Selected people")}
                  />
                )}
                {activePanel === "groups" && (
                  <GroupsPanel
                    groups={groups}
                    setGroups={(updated) => { setGroups(updated); refreshGraph(); }}
                    people={people}
                    setPeople={setPeople}
                    onFocusGroup={(g) => focusEntity("group", g.id, g.name)}        
                    onFocusMany={(ids) => focusMany("groups", ids, "Selected groups")}
                  />
                )}
                {activePanel === "tasks" && (
                  <DailyTasksPanel
                    tasks={tasks}
                    setTasks={(updated) => { setTasks(updated); refreshGraph(); }}
                    people={people}
                    selectedTask={selectedTask}
                    setSelectedTask={setSelectedTask}
                    setTaskModalOpen={setTaskModalOpen}
                    onTaskSave={(task) => { onTaskSave(task); refreshGraph(); }}
                    onTaskDelete={(id) => { onTaskDelete(id); refreshGraph(); }}
                    taskModalOpen={taskModalOpen}
                    tags={tags}
                    onCreateTag={onCreateTag}
                    onRemoveTag={onRemoveTag}
                    onFocusTask={(t) => focusEntity("task", t.id, t.name)}
                    onFocusMany={(ids) => focusMany("task", ids, "Selected tasks")}
                  />
                )}
              </div>
            )}

            {!activePanel && selectedNode && (
              <div className="graph-node-details">
                <NodeDetailsPanel
                  node={selectedNode}
                  graphData={normalizedGraph}
                  nodeMap={nodeMap}
                  selectNodeById={selectNodeById}
                  onEdit={handleNodeEdit}
                  onSummarize={(n) => onSummarizeNode?.(n)}
                  globalGraphRaw={fullGraph} 
                  onNavigateNode={(id) => {
                    setSelectedNode({ id: String(id) });
                    setActivePanel(null);
                  }}
                />
              </div>
            )}
          </div>

          {/* RIGHT PANEL */}
          <div className="graph-right-panel">
            <GraphCanvas
              data={viewGraph || graphData.graph} 
              selectedNode={typeof selectedNode === "string" ? { id: selectedNode } : selectedNode}
              onNodeSelect={(n) => {
                const id = typeof n === "string" ? n : (n?.id ?? n?.data?.id);
                if (!id) return;
                setSelectedNode({ id: String(id) });
                setActivePanel(null);
              }}
            />
          </div>
        </div>
      ) : (
        <div>Loading graph...</div>
      )}
    </div>
  );
}
