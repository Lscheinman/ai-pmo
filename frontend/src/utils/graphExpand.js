// Works with raw backend-shaped graphs:
// nodes: [{ data: { id, ... }, ... }] or [{ id, ... }]
// edges: [{ data: { source, target, ... }, ... }] or [{ source, target, ... }]
// where source/target may be strings OR { id } objects.

const idOf = (n) => n?.data?.id ?? n?.id ?? null;

const normEnd = (v) => {
  if (!v) return null;
  if (typeof v === "string" || typeof v === "number") return String(v);
  // object with id? { id: "..." }
  if (typeof v === "object" && (v.id != null || v.data?.id != null)) {
    return String(v.id ?? v.data?.id);
  }
  return null;
};

const srcOf = (e) => {
  const d = e?.data ?? e;
  return normEnd(d?.source ?? d?.src ?? d?.from);
};
const tgtOf = (e) => {
  const d = e?.data ?? e;
  return normEnd(d?.target ?? d?.tgt ?? d?.to);
};

function buildAdj(raw) {
  const adj = new Map();
  const push = (a, b) => {
    if (!a || !b) return;
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a).add(b);
  };
  const edges = raw?.edges || raw?.links || [];
  for (const e of edges) {
    const s = srcOf(e);
    const t = tgtOf(e);
    if (!s || !t) continue;
    // undirected BFS
    push(s, t);
    push(t, s);
  }
  return adj;
}

/**
 * Return a raw-shaped subgraph (original node/edge objects) containing all vertices
 * within `hops` steps of any center in `centerIds`. If no centers, returns the raw graph.
 */
export function buildNHopSubgraph(raw, centerIds = [], hops = 1) {
  const nodes = Array.isArray(raw?.nodes) ? raw.nodes : [];
  const edges = Array.isArray(raw?.edges) ? raw.edges : (Array.isArray(raw?.links) ? raw.links : []);

  const seeds = (centerIds || []).map(String).filter(Boolean);
  if (!seeds.length || !nodes.length) return raw || { nodes: [], edges: [] };

  const allIds = new Set(nodes.map(n => String(idOf(n))));
  const validSeeds = seeds.filter(s => allIds.has(s));
  if (!validSeeds.length) {
    console.warn("[buildNHopSubgraph] none of the seeds exist in base graph", { seeds, exampleId: nodes[0] && idOf(nodes[0]) });
    return { nodes: [], edges: [] };
  }

  const adj = buildAdj({ edges });
  const keep = new Set(validSeeds);
  const q = validSeeds.map(id => ({ id, d: 0 }));
  const maxD = Math.max(0, Number.isFinite(hops) ? hops : 0);

  while (q.length) {
    const { id, d } = q.shift();
    if (d >= maxD) continue;
    const nbrs = adj.get(id);
    if (!nbrs) continue;
    for (const nb of nbrs) {
      if (!allIds.has(nb)) continue;
      if (!keep.has(nb)) {
        keep.add(nb);
        q.push({ id: nb, d: d + 1 });
      }
    }
  }

  const subNodes = nodes.filter(n => keep.has(String(idOf(n))));
  const subEdges = edges.filter(e => {
    const s = srcOf(e);
    const t = tgtOf(e);
    return keep.has(s) && keep.has(t);
  });

  return { nodes: subNodes, edges: subEdges };
}
