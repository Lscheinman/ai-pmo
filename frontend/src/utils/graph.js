// utils/graph.js
import { toStringId } from "./strings";


const stripPrefix = (id = "") =>
  id.replace(/^(person|people|task|tasks|project|projects|group|groups)[_-]/i, "");


// Returns a subgraph that is the union of all centerIds + their 1-hop neighbors.
export const buildUnionEgoSubgraph = (full, centerIds) => {
  if (!full) return { nodes: [], edges: [] };

  const nodes = full.nodes || [];
  const edges = full.edges || [];

  const toId = (n) => String(n?.data?.id ?? n?.id ?? n);
  const nodeById = new Map(nodes.map(n => [toId(n), n]));

  // Collect union of centers + their neighbors
  const keep = new Set();
  for (const center of centerIds) {
    const c = String(center);
    if (!nodeById.has(c)) continue;
    keep.add(c);
    for (const e of edges) {
      const sRaw = e?.data?.source ?? e?.source;
      const tRaw = e?.data?.target ?? e?.target;
      const s = String(typeof sRaw === "object" ? (sRaw?.data?.id ?? sRaw?.id) : sRaw);
      const t = String(typeof tRaw === "object" ? (tRaw?.data?.id ?? tRaw?.id) : tRaw);
      if (s === c) keep.add(t);
      if (t === c) keep.add(s);
    }
  }

  // Materialize nodes & edges that match the keep set
  const outNodes = Array.from(keep).map(id => nodeById.get(id)).filter(Boolean);
  const outEdges = edges.filter(e => {
    const sRaw = e?.data?.source ?? e?.source;
    const tRaw = e?.data?.target ?? e?.target;
    const s = String(typeof sRaw === "object" ? (sRaw?.data?.id ?? sRaw?.id) : sRaw);
    const t = String(typeof tRaw === "object" ? (tRaw?.data?.id ?? tRaw?.id) : tRaw);
    return keep.has(s) && keep.has(t);
  });

  return { nodes: outNodes, edges: outEdges };
};

export const getNeighborIds = (graph, nodeId) => {
  const me = toStringId(nodeId);
  const out = new Set();
  for (const l of graph?.edges || []) {
    if (!l) continue;
    const sRaw = l?.data?.source ?? l?.source;
    const tRaw = l?.data?.target ?? l?.target;
    const s = typeof sRaw === "object" ? (sRaw?.data?.id ?? sRaw?.id) : sRaw;
    const t = typeof tRaw === "object" ? (tRaw?.data?.id ?? tRaw?.id) : tRaw;
    const S = toStringId(s);
    const T = toStringId(t);
    if (!S || !T) continue;
    if (S === me && T !== me) out.add(T);
    if (T === me && S !== me) out.add(S);
  }
  return Array.from(out);
};

export const graphSignature = (g) => {
  if (!g) return "nil";
  const nodes = (g.nodes || g.graph?.nodes || [])
    .map(n => String(n?.data?.id ?? n?.id ?? n))
    .sort();

  const edgeList = (g.edges || g.links || g.graph?.edges || g.graph?.links || []);
  const edges = edgeList.map(e => {
    const sRaw = e?.data?.source ?? e?.source;
    const tRaw = e?.data?.target ?? e?.target;
    const s = String(typeof sRaw === "object" ? (sRaw?.data?.id ?? sRaw?.id) : sRaw);
    const t = String(typeof tRaw === "object" ? (tRaw?.data?.id ?? tRaw?.id) : tRaw);
    return s < t ? `${s}->${t}` : `${t}->${s}`; // undirected pair
  }).sort();

  return `${nodes.join(",")}#${edges.join("|")}`;
};

export const getDbIdFromGraphNode = (n) => {
  const norm = (v) => (v === 0 || v ? String(v) : undefined);
  const from =
    norm(n?.dbId) ||
    norm(n?.refId) ||
    norm(n?.detail?.dbId) ||
    norm(n?.detail?.refId) ||
    norm(n?.detail?.id) ||
    norm(n?.data?.dbId) ||
    norm(n?.data?.refId) ||
    norm(n?.data?.id) ||
    norm(n?.id);

  return from ? stripPrefix(from) : undefined;
};

export const RELATION_TYPES = [
  { value: "manages",     label: "manages →" },
  { value: "reports_to",  label: "reports to →" },
  { value: "mentor",      label: "mentors →" },
  { value: "peer",        label: "peer ↔" },
  { value: "co_located",  label: "co-located ↔" },
];

export const SYMMETRIC_TYPES = new Set(["peer", "co_located"]);

