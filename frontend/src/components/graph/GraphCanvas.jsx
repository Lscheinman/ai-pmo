// src/components/graph/GraphCanvas.jsx
import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { renderToStaticMarkup } from "react-dom/server";
import { InfoIcon, ProjectIcon, PeopleIcon, TasksIcon, CopyEmailIcon, TagIcon } from "../icons";
import { extractStatus, canonicalStatus } from "../../utils/status";
import { getNodeVisual, buildDegreeMap, NEUTRAL_RING } from "../../utils/graphVisualRules";
import LegendsDock from "./LegendsDock";

// -------------------- visual constants / knobs
const ICON_STROKE = "#e9f3ef";
const RING_WIDTH_FRAC = 0.38;
const INNER_FILL = "rgba(15,17,19,0.9)";
const GLOSS_ALPHA = 0.28;

// Reasonable clamps for selection zoom
const SELECT_ZOOM = { min: 0.9, max: 4.0, padding: 80, duration: 600 };

// Smaller label fonts
const FONT = {
  nodeMin: 6,
  nodeBase: 10,
  edgeMin: 6,
  edgeBase: 9,
  exp: 0.7
};

const DEFAULT_HIDDEN_EDGE_RE = /collab/i;

const TYPE_ICON = {
  project: ProjectIcon,
  person: PeopleIcon,
  task: TasksIcon,
  group: CopyEmailIcon,
  tag: TagIcon,
  unknown: InfoIcon
};
const getTypeIcon = (t) => TYPE_ICON[String(t || "unknown").toLowerCase()] || TYPE_ICON.unknown;

const LOD = { labelMinScale: 1.8, detailsScale: 3.5 };
const BASE_R = 10;
const MAX_R = 26; // fixed
const DPR = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

// default: all statuses active
const ALL_STATUS_KEYS = ["planned", "confirmed", "running", "blocked", "complete", "canceled"];

// Edge colors by type (fallback provided in getEdgeColor)
const EDGE_COLORS = {
  TASK_ASSIGNEE:    "#00bcd4",
  PROJECT_LEAD:     "#ff9800",
  PERSON_INFLUENCE: "#c2185b",
  PERSON_TAG:       "#9c27b0",
  TASK_TAG:         "#9c27b0",
  PROJECT_TAG:      "#9c27b0",
  HAS_MEMBER:       "#8bc34a",
  REL:              "#7aa0a1"
};

// -------------------- helpers
const sizeBucket = (gScale) => (gScale < 1 ? 1 : gScale < 2 ? 2 : gScale < 3 ? 3 : gScale < 4 ? 4 : 5);

const nodeRadius = (node, maxDegree, gScale = 1) => {
  const d = Math.max(1, node._degree ?? 1);
  const k = Math.sqrt(d) / Math.sqrt(maxDegree || 1);
  const r = BASE_R + 10 * k;
  const scaled = r / Math.sqrt(gScale || 1);
  return Math.min(MAX_R, Math.max(8, scaled));
};

// rounded rect
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// node label (small)
function drawLabel(ctx, x, y, text, scale) {
  if (!text) return;
  const s = Math.max(1e-6, scale);
  const fontPx = Math.max(FONT.nodeMin, FONT.nodeBase / Math.pow(s, FONT.exp));
  ctx.font = `${fontPx}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;

  const padX = 4 / Math.pow(s, FONT.exp);
  const padY = 2 / Math.pow(s, FONT.exp);

  const m = ctx.measureText(text);
  const w = m.width + padX * 2;
  const h = (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) + padY * 2;
  const rx = 5 / Math.pow(s, FONT.exp);

  const lx = x - w / 2;
  const ly = y + 1.2 * rx;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  roundRect(ctx, lx, ly, w, h, rx);
  ctx.fill();

  ctx.fillStyle = "#eaf2ee";
  ctx.fillText(text, lx + padX, ly + h - padY - m.actualBoundingBoxDescent);
}

// tiny hex -> rgba (used to tint edge label backgrounds)
function hexToRgba(hex, alpha = 1) {
  const h = String(hex).replace("#", "");
  const parse = (s) => parseInt(s, 16);
  let r, g, b;
  if (h.length === 3) {
    r = parse(h[0] + h[0]); g = parse(h[1] + h[1]); b = parse(h[2] + h[2]);
  } else {
    r = parse(h.slice(0,2)); g = parse(h.slice(2,4)); b = parse(h.slice(4,6));
  }
  return `rgba(${r},${g},${b},${alpha})`;
}

// edge pill (small) with stroke color
function drawEdgePill(ctx, x, y, text, scale, { bg = "rgba(0,0,0,0.5)", fg = "#eaeaea", stroke = null } = {}) {
  if (!text) return;
  const s = Math.max(1e-6, scale);
  const fontPx = Math.max(FONT.edgeMin, FONT.edgeBase / Math.pow(s, FONT.exp));
  ctx.font = `${fontPx}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;

  const padX = 4 / Math.pow(s, FONT.exp);
  const padY = 2 / Math.pow(s, FONT.exp);

  const m = ctx.measureText(text);
  const w = m.width + padX * 2;
  const h = (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) + padY * 2;
  const rx = 4 / Math.pow(s, FONT.exp);

  const lx = x - w / 2;
  const ly = y - h / 2;

  ctx.save();
  ctx.globalAlpha = 1;
  // fill
  ctx.fillStyle = bg;
  roundRect(ctx, lx, ly, w, h, rx);
  ctx.fill();
  // stroke (uses edge type color)
  if (stroke) {
    ctx.lineWidth = Math.max(0.75, 1.2 / Math.pow(s, FONT.exp));
    ctx.strokeStyle = stroke;
    roundRect(ctx, lx, ly, w, h, rx);
    ctx.stroke();
  }
  // text
  ctx.fillStyle = fg;
  ctx.fillText(text, x - m.width / 2, y + m.actualBoundingBoxAscent / 2 - 1);
  ctx.restore();
}

// icon cache (SVG → Image)
const isImageOk = (img) => !!img && img.complete && img.naturalWidth > 0;
const ensureXmlns = (svg) =>
  svg.includes("xmlns=") ? svg : svg.replace("<svg", `<svg xmlns="http://www.w3.org/2000/svg"`);

// sprite cache
const spriteCache = new Map();

function getNodeSprite({ ringColor, IconCmp, iconImg, r, sb }) {
  const key = `${IconCmp?.name || "Icon"}:${ringColor}:${sb}:${Math.round(r * DPR)}:${RING_WIDTH_FRAC}:${INNER_FILL}:${GLOSS_ALPHA}`;
  if (spriteCache.has(key)) return spriteCache.get(key);

  const pad = 4;
  const R = Math.round((r + pad) * DPR);
  const S = R * 2;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");

  // depth shadow
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 10 * DPR;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2 * DPR;

  // inner disk fill
  ctx.beginPath();
  ctx.arc(R, R, r * DPR, 0, Math.PI * 2);
  ctx.fillStyle = INNER_FILL;
  ctx.fill();

  // thick border (status color)
  const lw = Math.max(2 * DPR, r * RING_WIDTH_FRAC * DPR);
  ctx.lineWidth = lw;
  ctx.strokeStyle = ringColor;
  ctx.beginPath();
  ctx.arc(R, R, r * DPR - lw / 2, 0, Math.PI * 2);
  ctx.stroke();

  // glossy inner stroke
  ctx.lineWidth = Math.max(1, 1.25 * DPR);
  ctx.strokeStyle = `rgba(255,255,255,${GLOSS_ALPHA})`;
  ctx.beginPath();
  ctx.arc(R, R, (r - lw / (2 * DPR) - 0.6) * DPR, 0, Math.PI * 2);
  ctx.stroke();

  // icon
  const iconMax = (r - lw / (2 * DPR)) * 1.25 * DPR;
  if (iconImg && iconImg.width) {
    ctx.drawImage(iconImg, R - iconMax / 2, R - iconMax / 2, iconMax, iconMax);
  }

  spriteCache.set(key, c);
  return c;
}

// ---- default physics
const DEFAULT_PHYS = {
  linkDistance: 120,
  linkStrength: 0.7,
  chargeStrength: -220,
  collisionPadding: 8,
  velocityDecay: 0.35,
  cooldownTicks: 80,
  dagLevelDistance: 160,
  ngraph: { gravity: -4, springLength: 70, dragCoefficient: 0.02 }
};

export default function GraphCanvas({
  data,
  selectedNode,
  onNodeSelect,
  layoutMode = "force-d3", // 'force-d3' | 'ngraph' | 'dag-td' | 'dag-lr' | 'radial-out' | 'radial-in'
  physics = {}
}) {
  const fgRef = useRef();
  const iconCacheRef = useRef(new Map()); // key -> { img, url }

  const [highlightNodes, setHighlightNodes] = useState(new Set());
  const [highlightLinks, setHighlightLinks] = useState(new Set());

  // merge physics with defaults (including nested ngraph)
  const phys = useMemo(
    () => ({ ...DEFAULT_PHYS, ...physics, ngraph: { ...DEFAULT_PHYS.ngraph, ...(physics?.ngraph || {}) } }),
    [physics]
  );

  const isNGraph = layoutMode === "ngraph";
  const isD3 =
    layoutMode === "force-d3" ||
    layoutMode.startsWith("dag-") ||
    layoutMode.startsWith("radial");

  const dagMode =
    layoutMode === "dag-td"
      ? "td"
      : layoutMode === "dag-lr"
      ? "lr"
      : layoutMode === "radial-out"
      ? "radialout"
      : layoutMode === "radial-in"
      ? "radialin"
      : undefined;

  // Legend filter states
  const [activeStatusKeys, setActiveStatusKeys] = useState(() => new Set(ALL_STATUS_KEYS));
  const [activeEdgeTypes, setActiveEdgeTypes] = useState(() => new Set());

  // ---- data normalization (with visuals)
  const graphData = useMemo(() => {
    if (!data?.nodes || !(data.edges || data.links)) return { nodes: [], links: [], _maxDegree: 1, _edgeTypes: [] };

    const rawEdges = data.edges || data.links || [];
    const links = rawEdges.map((e) => {
      const d = e.data || e;
      return {
        source: typeof d.source === "object" ? d.source.id : String(d.source),
        target: typeof d.target === "object" ? d.target.id : String(d.target),
        type: (d.type ?? "REL").toString().toUpperCase(),
        // keep extra metadata for tooltips
        role: d.role ?? undefined,
        weight: d.weight ?? undefined,
        label: d.label ?? undefined,
        note: d.note ?? undefined
      };
    });

    const degreeMap = buildDegreeMap(links);
    const maxDegree = Math.max(1, ...Object.values(degreeMap));

    const nodes = (data.nodes || []).map((n) => {
      const d = n.data || n;
      const id = String(d.id);
      const label = d.label ?? d.name ?? id;
      const type = d.type ?? "Unknown";

      const extracted = extractStatus(d) || null;
      const vis = getNodeVisual({ ...d, id, type }, { degreeMap, maxDegree });

      const statusKey = canonicalStatus(vis.statusLabel || extracted || "") || null;
      const keyToken = (statusKey || "").toLowerCase().replace(/\s+/g, "");

      const badgeCount =
        (typeof d.badgeCount === "number" && d.badgeCount) ||
        (typeof d.alertCount === "number" && d.alertCount) ||
        (d.metrics && typeof d.metrics.incidents === "number" && d.metrics.incidents) ||
        0;

      let progress = d.progress ?? d.percentComplete ?? d.completion ?? null;
      if (progress != null) {
        if (progress > 1) progress = progress / 100;
        progress = Math.max(0, Math.min(1, Number(progress)));
      }

      return {
        id,
        label,
        type,
        _statusLabel: vis.statusLabel || extracted || null,
        _statusKey: keyToken,
        _ringColor: vis.ringColor || NEUTRAL_RING,
        _degree: vis.degree ?? null,
        _badgeCount: badgeCount,
        _badgeColor: d.badgeColor || (badgeCount > 0 ? "#ff6961" : null),
        _progress: progress
      };
    });

    const edgeTypes = Array.from(new Set(links.map(l => String(l.type || "REL").toUpperCase())));

    return { nodes, links, _maxDegree: maxDegree, _edgeTypes: edgeTypes };
  }, [data]);

  // quick lookups
  const nodeById = useMemo(() => {
    const m = new Map();
    for (const n of graphData.nodes) m.set(n.id, n);
    return m;
  }, [graphData.nodes]);

  // Initialize/merge activeEdgeTypes when underlying edge set changes
  useEffect(() => {
    const all = graphData._edgeTypes || [];
    setActiveEdgeTypes(prev => {
      if (prev.size === 0) {
        const next = new Set();
        for (const t of all) if (!DEFAULT_HIDDEN_EDGE_RE.test(t)) next.add(t);
        return next;
      }
      const next = new Set(prev);
      for (const t of all) if (!prev.has(t) && !DEFAULT_HIDDEN_EDGE_RE.test(t)) next.add(t);
      return next;
    });
  }, [graphData._edgeTypes]);

  // --- icon SVG → Image cache
  const getIconImage = useCallback((IconCmp, color = ICON_STROKE, baseSize = 32) => {
    const key = `${IconCmp.name || "Icon"}:${color}:${baseSize}`;
    const cache = iconCacheRef.current;
    const cached = cache.get(key);
    if (cached && isImageOk(cached.img)) return cached.img;

    const svg = ensureXmlns(renderToStaticMarkup(<IconCmp size={baseSize} color={color} />));
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.onload = () => fgRef.current?.refresh();
    img.onerror = () => { URL.revokeObjectURL(url); cache.delete(key); };
    img.src = url;

    cache.set(key, { img, url });
    return img;
  }, []);

  const zoomToSelection = useCallback(
    (
      idSet,
      { duration = SELECT_ZOOM.duration, paddingPx = SELECT_ZOOM.padding, minZoom = SELECT_ZOOM.min, maxZoom = SELECT_ZOOM.max } = {}
    ) => {
      const fg = fgRef.current;
      if (!fg || !idSet?.size) return;

      const fitSupportsFilter = fg.zoomToFit && fg.zoomToFit.length >= 3;
      if (fitSupportsFilter) {
        fg.zoomToFit(duration, paddingPx, (n) => idSet.has(n.id));
        requestAnimationFrame(() => {
          const k = fg.zoom() ?? 1;
          if (k > maxZoom) fg.zoom(maxZoom, 200);
          else if (k < minZoom) fg.zoom(minZoom, 200);
        });
        return;
      }

      const sel = graphData.nodes.filter((n) => idSet.has(n.id) && Number.isFinite(n.x) && Number.isFinite(n.y));
      if (!sel.length) return;
      let minX = +Infinity, minY = +Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of sel) {
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
      }
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      fg.centerAt(cx, cy, duration);

      const w = fg.width?.() ?? window.innerWidth;
      const h = fg.height?.() ?? window.innerHeight;
      const boxW = maxX - minX + paddingPx * 2;
      const boxH = maxY - minY + paddingPx * 2;
      let k = Math.min(w / Math.max(1, boxW), h / Math.max(1, boxH));
      k = Math.max(minZoom, Math.min(maxZoom, k));
      fg.zoom(k, duration);
    },
    [graphData]
  );

  // cleanup blob URLs + sprite cache
  useEffect(() => {
    const cacheAtMount = iconCacheRef.current;
    return () => {
      for (const entry of cacheAtMount.values()) {
        const url = entry?.url;
        if (!url) continue;
        try { URL.revokeObjectURL(url); } catch { /* empty */ }
      }
      cacheAtMount.clear();
      spriteCache.clear();
    };
  }, []);

  // ---- D3 forces TUNING (no external d3 import)
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || !isD3) return;

    fg.d3VelocityDecay?.(phys.velocityDecay ?? 0.35);

    const link = fg.d3Force?.("link");
    if (link && typeof link.distance === "function") {
      link.distance(phys.linkDistance ?? 120);
    }
    if (link && typeof link.strength === "function") {
      link.strength(phys.linkStrength ?? 0.7);
    }

    const charge = fg.d3Force?.("charge");
    if (charge && typeof charge.strength === "function") {
      charge.strength(phys.chargeStrength ?? -220);
    }

    fg.d3ReheatSimulation?.();
  }, [isD3, phys.velocityDecay, phys.linkDistance, phys.linkStrength, phys.chargeStrength]);

  // ---- soft collision shim
  const softCollideTick = useCallback(() => {
    const padding = Math.max(0, phys.collisionPadding || 0);
    if (!isD3 || padding <= 0) return;

    const fg = fgRef.current;
    if (!fg) return;
    const gd = fg.graphData?.();
    if (!gd) return;

    const nodes = gd.nodes || [];
    const links = gd.links || [];
    if (!nodes.length || !links.length) return;

    const byId = new Map(nodes.map((n) => [String(n.id), n]));

    for (const l of links) {
      const sId = typeof l.source === "object" ? l.source.id : l.source;
      const tId = typeof l.target === "object" ? l.target.id : l.target;
      const a = byId.get(String(sId));
      const b = byId.get(String(tId));
      if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(b.x)) continue;

      const dx = (b.x ?? 0) - (a.x ?? 0);
      const dy = (b.y ?? 0) - (a.y ?? 0);
      let dist = Math.hypot(dx, dy) || 0.0001;

      const minSep =
        nodeRadius(a, graphData._maxDegree, 1) + nodeRadius(b, graphData._maxDegree, 1) + padding;

      if (dist < minSep) {
        const overlap = (minSep - dist) / 2;
        const ux = dx / dist;
        const uy = dy / dist;
        a.x -= ux * overlap;
        a.y -= uy * overlap;
        b.x += ux * overlap;
        b.y += uy * overlap;
      }
    }
  }, [isD3, phys.collisionPadding, graphData._maxDegree]);

  // ---- highlight helpers
  const ends = useCallback((l) => {
    const s = typeof l.source === "object" ? l.source.id : l.source;
    const t = typeof l.target === "object" ? l.target.id : l.target;
    return [String(s), String(t)];
  }, []);

  const highlightFromNode = useCallback(
    (nodeId) => {
      if (!nodeId) return;
      const center = graphData.nodes.find((n) => n.id === nodeId);
      if (!center) return;

      const nSet = new Set([center]);
      const idSet = new Set([nodeId]);
      const lSet = new Set();

      for (const l of graphData.links) {
        const [s, t] = ends(l);
        if (s === nodeId || t === nodeId) {
          const src = graphData.nodes.find((n) => n.id === s);
          const tgt = graphData.nodes.find((n) => n.id === t);
          if (src) { nSet.add(src); idSet.add(src.id); }
          if (tgt) { nSet.add(tgt); idSet.add(tgt.id); }
          lSet.add(l);
        }
      }

      setHighlightNodes(nSet);
      setHighlightLinks(lSet);

      zoomToSelection(idSet, { paddingPx: 100, maxZoom: 3.2 });
    },
    [graphData, ends, zoomToSelection]
  );

  const handleNodeClick = useCallback(
    (node) => {
      onNodeSelect?.(node);
      highlightFromNode(node.id);
    },
    [onNodeSelect, highlightFromNode]
  );

  useEffect(() => {
    if (selectedNode?.id) highlightFromNode(selectedNode.id);
  }, [selectedNode, highlightFromNode]);

  // Preload icons (bright stroke) for visible types
  useEffect(() => {
    const seen = new Set();
    for (const n of graphData.nodes) {
      const IconCmp = getTypeIcon(n.type);
      const key = `${IconCmp.name}:${ICON_STROKE}:32`;
      if (seen.has(key)) continue;
      seen.add(key);
      getIconImage(IconCmp, ICON_STROKE, 32);
    }
  }, [graphData.nodes, getIconImage]);

  // --------- legend interactions (status)
  const toggleStatusKey = useCallback((key) => {
    setActiveStatusKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  const setAllStatus = useCallback(() => setActiveStatusKeys(new Set(ALL_STATUS_KEYS)), []);
  const setNoneStatus = useCallback(() => setActiveStatusKeys(new Set()), []);

  // --------- edge legend interactions
  const setAllEdges = useCallback(() => setActiveEdgeTypes(new Set(graphData._edgeTypes)), [graphData._edgeTypes]);
  const setNoneEdges = useCallback(() => setActiveEdgeTypes(new Set()), []);
  const toggleEdgeType = useCallback((type) => {
    setActiveEdgeTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  // helper: is node active per legend
  const nodeIsActive = useCallback(
    (n) => {
      if (!n._statusKey) return true;
      return activeStatusKeys.has(n._statusKey);
    },
    [activeStatusKeys]
  );

  const getEdgeColor = useCallback((type) => {
    const key = String(type || "REL").toUpperCase();
    return EDGE_COLORS[key] || "#56615d";
  }, []);

  const edgeIsActive = useCallback((l) => {
    const key = String(l.type || "REL").toUpperCase();
    return activeEdgeTypes.has(key);
  }, [activeEdgeTypes]);

  const prettyEdgeType = useCallback((t) =>
    String(t || "REL").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
  , []);

  // endpoints active (fast, via nodeById)
  const endpointsActive = useCallback((l) => {
    const [sId, tId] = ends(l);
    const s = nodeById.get(sId);
    const t = nodeById.get(tId);
    return (!s || nodeIsActive(s)) && (!t || nodeIsActive(t));
  }, [nodeById, nodeIsActive, ends]);

  // ---------- TOOLTIP TEXT FOR LINKS (hover)
  const edgeTooltip = useCallback((l) => {
    const [sId, tId] = ends(l);
    const s = nodeById.get(sId);
    const t = nodeById.get(tId);
    const sLabel = s?.label || sId;
    const tLabel = t?.label || tId;

    const parts = [
      `${prettyEdgeType(l.type)}`,
      `${sLabel} → ${tLabel}`
    ];
    if (l.role)   parts.push(`Role: ${l.role}`);
    if (l.weight != null) parts.push(`Weight: ${l.weight}`);
    if (l.label)  parts.push(`Label: ${l.label}`);
    if (l.note)   parts.push(`Note: ${l.note}`);

    return parts.join("\n");
  }, [nodeById, prettyEdgeType, ends]);

  return (
    <div style={{ position: "relative" }}>
      <LegendsDock
        initialPos={{ x: 12, y: 12 }}
        statusLegendProps={{
          activeKeys: activeStatusKeys,
          onToggleKey: toggleStatusKey,
          onAll: setAllStatus,
          onNone: setNoneStatus
        }}
        edgeLegendProps={{
          types: graphData._edgeTypes,
          active: activeEdgeTypes,
          onToggle: toggleEdgeType,
          onAll: setAllEdges,
          onNone: setNoneEdges,
          colorMap: EDGE_COLORS
        }}
      />

      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        backgroundColor={"#000000ff"}
        /* engine + layout modes */
        forceEngine={isNGraph ? "ngraph" : "d3"}
        dagMode={dagMode}
        dagLevelDistance={phys.dagLevelDistance}
        ngraphPhysics={
          isNGraph
            ? {
                gravity: phys.ngraph.gravity,
                springLength: phys.ngraph.springLength,
                dragCoefficient: phys.ngraph.dragCoefficient
              }
            : undefined
        }
        cooldownTicks={phys.cooldownTicks ?? 80}

        /* ---------- link visibility + tooltip ---------- */
        linkVisibility={(l) => edgeIsActive(l) && endpointsActive(l)}

        linkLabel={(l) => (edgeIsActive(l) && endpointsActive(l)) ? edgeTooltip(l) : ""}

        linkHoverPrecision={6}

        nodeLabel={(n) => {
          const t = String(n.type || "");
          const s = n._statusLabel ? ` • ${n._statusLabel}` : "";
          return `${t}: ${n.label}${s}`;
        }}

        nodeCanvasObject={(node, ctx, globalScale) => {
          const isActive = nodeIsActive(node);
          const ring = node._ringColor || NEUTRAL_RING;
          const IconCmp = getTypeIcon(node.type);
          const r = nodeRadius(node, graphData._maxDegree, globalScale);
          const sb = sizeBucket(globalScale);

          const prevAlpha = ctx.globalAlpha;
          if (!isActive) ctx.globalAlpha = 0.18;

          if (isActive && highlightNodes.has(node)) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(node.x, node.y, r + 6, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(255,215,0,0.22)";
            ctx.fill();
            ctx.restore();
          }

          const iconImg = getIconImage(IconCmp, ICON_STROKE, 32);
          const sprite = getNodeSprite({ ringColor: ring, IconCmp, iconImg, r, sb });

          const S = sprite.width / DPR;
          ctx.drawImage(sprite, node.x - S / 2, node.y - S / 2, S, S);

          if (isActive) {
            const p = node._progress;
            if (p != null && !Number.isNaN(p) && p > 0) {
              const start = -Math.PI / 2;
              const end = start + Math.min(1, p) * Math.PI * 2;
              const lwOuter = Math.max(2, r * 0.12);
              ctx.save();
              ctx.beginPath();
              ctx.arc(node.x, node.y, r + lwOuter * 0.1, start, end, false);
              ctx.lineWidth = lwOuter;
              ctx.strokeStyle = "rgba(255,255,255,0.85)";
              ctx.stroke();
              ctx.restore();
            }
          }

          const count = node._badgeCount || 0;
          const badgeColor = node._badgeColor || (count > 0 ? "#ff6961" : null);
          if (badgeColor) {
            const angle = -Math.PI / 6; // 2 o'clock
            const dist = r + Math.max(3, 4 / Math.sqrt(globalScale));
            const bx = node.x + dist * Math.cos(angle);
            const by = node.y + dist * Math.sin(angle);

            const br = Math.max(3.5, 5.5 / Math.sqrt(globalScale));

            ctx.save();
            ctx.beginPath();
            ctx.arc(bx, by, br, 0, Math.PI * 2);
            ctx.fillStyle = badgeColor;
            ctx.fill();

            if (count > 0 && globalScale >= LOD.detailsScale) {
              ctx.fillStyle = "#ffffff";
              ctx.font = `${Math.max(8, 9 / Math.sqrt(globalScale))}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;
              const t = String(Math.min(99, count));
              const tm = ctx.measureText(t);
              ctx.fillText(
                t,
                bx - tm.width / 2,
                by + (tm.actualBoundingBoxAscent - tm.actualBoundingBoxDescent) / 2
              );
            }
            ctx.restore();
          }

          if (globalScale >= LOD.labelMinScale) {
            const label = node.label || node.id;
            drawLabel(ctx, node.x, node.y + r + 8 / Math.sqrt(globalScale), label, globalScale);
          }

          ctx.globalAlpha = prevAlpha;
        }}

        nodePointerAreaPaint={(node, color, ctx, globalScale) => {
          if (!nodeIsActive(node)) return;
          const r = nodeRadius(node, graphData._maxDegree, globalScale);
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 6, 0, Math.PI * 2);
          ctx.fill();
        }}

        linkColor={(l) => {
          const active = edgeIsActive(l) && endpointsActive(l);
          const base = getEdgeColor(l.type);
          return active ? (highlightLinks.has(l) ? "#FFD700" : base) : "rgba(86,97,93,0.15)";
        }}

        linkWidth={(l) => (highlightLinks.has(l) ? 2.2 : edgeIsActive(l) ? 1.2 : 0.6)}
        linkDirectionalArrowLength={3}
        linkDirectionalArrowRelPos={0.98}

        /* draw per-edge type labels at midpoints (tiny, non-blocking) */
        linkCanvasObjectMode={() => "after"}
        linkCanvasObject={(link, ctx, globalScale) => {
          if (!(edgeIsActive(link) && endpointsActive(link)) || globalScale < 1.4) return;

          const d = link?.data || link || {};
          const label = d.type || "rel";

          const sx = typeof link.source === "object" ? link.source.x : 0;
          const sy = typeof link.source === "object" ? link.source.y : 0;
          const tx = typeof link.target === "object" ? link.target.x : 0;
          const ty = typeof link.target === "object" ? link.target.y : 0;

          // midpoint offset slightly normal to the edge to avoid sitting on the line
          const mx0 = (sx + tx) / 2;
          const my0 = (sy + ty) / 2;
          const nx = -(ty - sy), ny = (tx - sx);
          const nlen = Math.hypot(nx, ny) || 1;
          const offset = Math.min(14, 18 / Math.sqrt(globalScale));
          const mx = mx0 + (nx / nlen) * offset;
          const my = my0 + (ny / nlen) * offset;

          const stroke = getEdgeColor(d.type);
          const bg = hexToRgba(stroke, 0.18);

          drawEdgePill(ctx, mx, my, label, globalScale, { bg, fg: "#eaeaea", stroke });
        }}

        onNodeClick={handleNodeClick}
        onEngineTick={softCollideTick}
        onEngineStop={() => {
          if (!highlightNodes.size) fgRef.current.zoomToFit(300, 60);
        }}
      />
    </div>
  );
}
