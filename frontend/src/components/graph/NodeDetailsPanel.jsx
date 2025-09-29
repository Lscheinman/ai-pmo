// NodeDetailsPanel.jsx
import React, { useEffect, useMemo, useState } from "react";
import { EditIcon } from "../icons";
import IconButton from "../buttons/IconButton";

const EDITABLE_TYPES = new Set(["project","task","person","group"]);

export default function NodeDetailsPanel({
  node,
  graphData,
  onEdit,
  selectNodeById,
  nodeMap,
  fetchNodeDetail,
  onSummarize,
  onNavigateNode 
}) {
  const safeGraphData = {
    nodes: Array.isArray(graphData?.nodes) ? graphData.nodes : [],
    links: Array.isArray(graphData?.links) ? graphData.links : []
  };

  // helpers
  const idOf = (v) => (v && typeof v === "object" ? (v.id ?? v._id ?? v.key) : v);
  const asId = (maybeNode) =>
    maybeNode == null ? undefined :
    (typeof maybeNode === "string" || typeof maybeNode === "number") ? String(maybeNode) : idOf(maybeNode);

  const findNodeById = (id) => {
    if (!id) return undefined;
    if (nodeMap && nodeMap[id]) return nodeMap[id];
    if (typeof selectNodeById === "function") {
      const n = selectNodeById(id);
      if (n) return n;
    }
    return safeGraphData.nodes.find((n) => idOf(n) === id);
  };

  // resolve node
  const selectedId = asId(node);
  const resolvedNode = useMemo(() => {
    if (!selectedId) return undefined;
    const fromState = findNodeById(selectedId);
    return fromState ?? (typeof node === "object" ? node : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, nodeMap, selectNodeById, safeGraphData.nodes]);

  const nodeType = String(resolvedNode?.type || (typeof node === "object" ? node?.type : "") || "").toLowerCase();
  const isEditable = EDITABLE_TYPES.has(nodeType);

  // hydrate details
  const [detail, setDetail] = useState(resolvedNode?.detail ?? null);
  const hasDetail = detail && Object.keys(detail).length > 0;


  useEffect(() => {
    setDetail(resolvedNode?.detail ?? null);
  }, [resolvedNode]);

  useEffect(() => {
    let abort = false;
    const needFetch = resolvedNode && !hasDetail && typeof fetchNodeDetail === "function";
    if (!needFetch) return;
    fetchNodeDetail(resolvedNode.id)
      .then((d) => { if (!abort && d && typeof d === "object") setDetail(d); })
      .catch(() => {});
    return () => { abort = true; };
  }, [resolvedNode, hasDetail, fetchNodeDetail]);

  // neighbors
  const stats = useMemo(() => {
    if (!resolvedNode) return { linkedCount: 0, linkedNodes: [] };
    const me = idOf(resolvedNode);
    const neighborIds = new Set();
    for (const link of safeGraphData.links) {
      if (!link) continue;
      const rawSrc = link.source ?? link.src ?? link.from;
      const rawTgt = link.target ?? link.tgt ?? link.to;
      const src = idOf(rawSrc);
      const tgt = idOf(rawTgt);
      if (!src || !tgt) continue;
      if (src === me && tgt !== me) neighborIds.add(tgt);
      if (tgt === me && src !== me) neighborIds.add(src);
    }
    return { linkedCount: neighborIds.size, linkedNodes: Array.from(neighborIds) };
  }, [resolvedNode, safeGraphData.links]);

  if (!selectedId || !resolvedNode) {
    return <div className="node-details-panel"><p>Select a node to view details.</p></div>;
  }

  const typeColors = {
    project: "#4CAF50",
    task: "#FFC107",
    person: "#2196F3",
    group: "#9C27B0",
    tag: "#FF5722",
    unknown: "#9aa0a6"
  };

  return (
    <div className="node-details-panel" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* HEADER: title + actions */}
      <div
        className="node-details-header"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
      >
        <h3 style={{ margin: 0, lineHeight: 1.2 }}>
          {resolvedNode.label ?? resolvedNode.name ?? resolvedNode.id}
        </h3>
        <div style={{ display: "flex", gap: 8 }}>
          {isEditable && (
            <IconButton
              icon={<EditIcon />}
              title="Edit"
              variant="neutral"
              onClick={(e) => { e.stopPropagation(); onEdit?.(resolvedNode); }}
            />
          )}
          <IconButton
            icon={<span style={{ fontWeight: 700 }}>AI</span>}
            title="Tell me what I need to know"
            variant="success"
            onClick={(e) => { e.stopPropagation(); onSummarize?.(resolvedNode); }}
          />
        </div>
      </div>

      {/* META row: type + connected count */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="pill">
          <span
            className="pill__dot"
            style={{ background: typeColors[nodeType] || typeColors.unknown }}
          />
          {resolvedNode.type || "Unknown"}
        </span>

        <span style={{ opacity: 0.75, fontWeight: 600 }}>
          {stats.linkedCount} connection{stats.linkedCount === 1 ? "" : "s"}
        </span>
      </div>

      {/* Details */}
      {detail && Object.keys(detail).length > 0 && (
        <div className="node-attributes" style={{ marginTop: 4 }}>
          <h4 style={{ margin: "8px 0" }}>Details</h4>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", rowGap: 6, columnGap: 10 }}>
            {Object.entries(detail).map(([key, value]) => (
              <React.Fragment key={key}>
                <div style={{ fontWeight: 700, opacity: 0.8 }}>{key}</div>
                <div style={{ opacity: 0.9, wordBreak: "break-word" }}>{String(value)}</div>
              </React.Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Connected nodes as clickable chips */}
      <div className="node-links" style={{ marginTop: 4 }}>
        <h4 style={{ margin: "8px 0" }}>Connected</h4>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {stats.linkedNodes.map((id) => {
            const linkedNode = findNodeById(id);
            const label =
              (linkedNode?.label && linkedNode.label.trim()) ||
              (linkedNode?.name && linkedNode.name.trim()) || id;

            const t = String(linkedNode?.type || "").toLowerCase();
            return (
              <button
                key={id}
                className="chip"
                title={`Go to ${label}`}
                onClick={(e) => { e.stopPropagation(); onNavigateNode?.(id); }}
              >
                <span
                  className="pill__dot"
                  style={{ background: typeColors[t] || typeColors.unknown }}
                />
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
