# privacy_sanitizer.py
from __future__ import annotations
from typing import Any, Dict, List
import re

# Keep ONLY these fields per node type when sending to the LLM
ALLOWLIST: Dict[str, List[str]] = {
    "Project": ["id", "type", "status", "start_date", "end_date", "description", "detail"],
    "Task":    ["id", "type", "status", "start", "end", "priority", "project_id", "depends_on", "description", "tags"],
    "Person":  ["id", "type", "role", "org", "status", "tags"], 
    "Group":   ["id", "type", "status", "parent_id", "tags"],
    "Tag":     ["id", "type", "name"],
}

# Optional: scrub stray emails/phones inside allowed string fields (e.g., descriptions you keep)
EMAIL_RE = re.compile(r'\b[\w.+-]+@[\w-]+\.[\w.-]+\b')
PHONE_RE = re.compile(r'\+?\d[\d\s().-]{7,}\d')
ID_KIND_RE = re.compile(r'^(person|project|task|group|tag)s?_(\d+)$', re.I)


def _scrub_text(v: Any) -> Any:
    if not isinstance(v, str):
        return v
    v = EMAIL_RE.sub("[redacted-email]", v)
    v = PHONE_RE.sub("[redacted-phone]", v)
    return v

def _unwrap(obj: Any) -> Dict[str, Any]:
    """Return inner dict if obj = {'data': {...}}, else the dict itself."""
    if isinstance(obj, dict) and isinstance(obj.get("data"), dict):
        return obj["data"]
    return obj if isinstance(obj, dict) else {}

def _canon_allow_key(ntype: str) -> str:
    if not isinstance(ntype, str):
        ntype = "" if ntype is None else str(ntype)
    return ntype[:1].upper() + ntype[1:].lower() if ntype else ""

def _infer_type_from_id(n: Dict[str, Any], fallback: str = "") -> str:
    nid = str(n.get("id") or "")
    m = ID_KIND_RE.match(nid)
    return (m.group(1).capitalize() if m else fallback)

def sanitize_graph_for_prompt(nodes: List[Dict[str, Any]],
                              edges: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Return redacted copies with only allowlisted fields; no pseudonyms."""
    out_nodes: List[Dict[str, Any]] = []

    for nd in nodes or []:
        n = _unwrap(nd)

        # type normalization + inference from id when missing
        raw_type = n.get("type") or n.get("node_type") or ""
        key = _canon_allow_key(raw_type)
        if not key:
            key = _infer_type_from_id(n, fallback="") or ""

        allowed = set(ALLOWLIST.get(key, ["id", "type"]))

        # lift from `detail` if top-level missing (so LLM still gets context)
        detail = n.get("detail") if isinstance(n.get("detail"), dict) else {}

        m: Dict[str, Any] = {}
        for k in allowed:
            val = n.get(k, None)
            if val is None and detail:
                # try detail fallback for common fields
                val = detail.get(k, None)
                # a few convenient aliases from detail
                if val is None and k in ("start_date", "end_date"):
                    # sometimes detail may use these exact names already
                    val = detail.get(k)
                if val is None and k == "project_id":
                    val = detail.get("project_id")
                if val is None and k == "description":
                    val = detail.get("description")
                if val is None and k == "tags":
                    val = detail.get("tags")
            if val is not None:
                m[k] = _scrub_text(val)

        # ensure id/type always present
        m.setdefault("id", n.get("id"))
        m.setdefault("type", key or raw_type or _infer_type_from_id(n, fallback=""))

        out_nodes.append(m)

    # Edges: unwrap and keep a safe subset
    out_edges: List[Dict[str, Any]] = []
    KEEP_EDGE_FIELDS = ("source", "target", "type", "role", "weight", "relationship_type", "label", "note")

    for ed in edges or []:
        e = _unwrap(ed)
        me: Dict[str, Any] = {}
        for k in KEEP_EDGE_FIELDS:
            if k in e and e[k] is not None:
                me[k] = _scrub_text(e[k])
        # fall back: if nothing captured but we had a dict, keep minimal core if possible
        if not me and isinstance(e, dict):
            for k in ("source", "target", "type"):
                if k in e and e[k] is not None:
                    me[k] = _scrub_text(e[k])
        if me:
            out_edges.append(me)

    return {"nodes": out_nodes, "edges": out_edges}

