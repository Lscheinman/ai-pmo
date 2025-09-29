import os
import sys
import json
import re
import networkx as nx
from time import monotonic
from uuid import uuid4
from datetime import date, datetime, timedelta
from pathlib import Path
from dotenv import load_dotenv
from collections import defaultdict, Counter
from typing import Dict, Any, List, Tuple, Optional
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, cast, String
from db import models, schemas, crud
from setup.utils import MODEL_MAP, MODEL_FIELD_MAP, has_attr, normalize_ai_text_and_labels, extract_llm_text
from services.privacy_sanitizer import sanitize_graph_for_prompt
from loguru import logger

# --- Load .env first ---
ENV_PATH = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=ENV_PATH)

# --- Validate SAP AI Core Credentials ---
AICORE_CLIENT_ID = os.getenv("AICORE_CLIENT_ID")
AICORE_CLIENT_SECRET = os.getenv("AICORE_CLIENT_SECRET")
AICORE_AUTH_URL = os.getenv("AICORE_AUTH_URL")
AICORE_BASE_URL = os.getenv("AICORE_BASE_URL")
AICORE_RESOURCE_GROUP = os.getenv("AICORE_RESOURCE_GROUP")

logger.info(f"AI Core settings: client_id={'set' if AICORE_CLIENT_ID else 'NOT SET'}, auth_url={AICORE_AUTH_URL}, base_url={AICORE_BASE_URL}, resource_group={AICORE_RESOURCE_GROUP}")

# Then import the OpenAI client (IMPORTANT: must be after loading .env)
from gen_ai_hub.proxy.native.openai import chat

if not all([AICORE_CLIENT_ID, AICORE_CLIENT_SECRET, AICORE_AUTH_URL, AICORE_BASE_URL, AICORE_RESOURCE_GROUP]):
    raise EnvironmentError("Missing AI Core environment variables")

# patterns to match entities in text
ID_RE = re.compile(r"^(person|people|project|projects|task|tasks|group|groups)_(\d+)$", re.I)
ID_PREFIX_RE = re.compile(r"^(person|people|project|projects|task|tasks|group|groups|tag)_(\d+)$", re.I)
MENTION_TOKEN_FORMAT = "[<node_id>]"  # e.g., [person_12]
MENTION_RE = re.compile(r"\[(person|project|task|group)_(\d+)\]")  # single brackets
DOUBLE_BRACKET_RE = re.compile(r"\[\[(person|project|task|group)_(\d+)\]\]")  # to normalize if model slips
COM_TASK_TO_GRAPH_DEFAULTS = {
    "status":    {"degrees": 2, "maxNodes": 600, "maxEdges": 1200},
    "standup":   {"degrees": 2, "maxNodes": 400, "maxEdges": 800},
    "risk":      {"degrees": 2, "maxNodes": 600, "maxEdges": 1200},
    "unblocker": {"degrees": 2, "maxNodes": 400, "maxEdges": 800},
}

# -------------------- PROMPT LOGGING SETUP (loguru) --------------------
PROMPT_LOG_ENABLED  = (os.getenv("PROMPT_LOG_ENABLED", "true").lower() == "true")
PROMPT_LOG_PATH     = os.getenv("PROMPT_LOG_PATH") or str((Path(__file__).resolve().parent.parent / "logs" / "prompts.jsonl"))
PROMPT_LOG_REDACT   = (os.getenv("PROMPT_LOG_REDACT", "true").lower() == "true")
PROMPT_VALIDATE_STRICT = (os.getenv("PROMPT_VALIDATE_STRICT", "false").lower() == "true")

# create logs dir & add sinks
def _init_prompt_logger():
    if not PROMPT_LOG_ENABLED:
        return
    p = Path(PROMPT_LOG_PATH)
    p.parent.mkdir(parents=True, exist_ok=True)
    # keep stderr human-readable, file sink structured JSON
    logger.remove()
    logger.add(sys.stderr, level="INFO")
    logger.add(
        PROMPT_LOG_PATH,
        rotation="25 MB",
        retention="14 days",
        enqueue=True,
        backtrace=False,
        diagnose=False,
        serialize=True,   # JSONL
        level="INFO",
    )

_init_prompt_logger()

# Basic redactions for logs (NOT for prompts). Your runtime prompts stay unchanged.
EMAIL_RE  = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_RE  = re.compile(r"(\+?\d[\d\-\s()]{7,}\d)")
TOKEN_DBL = DOUBLE_BRACKET_RE  # already defined above

def sanitize_text_for_logs(text: str) -> str:
    if not text:
        return text
    text = EMAIL_RE.sub("[email]", text)
    text = PHONE_RE.sub("[phone]", text)
    return text

def validate_prompt_text(text: str) -> List[str]:
    """Return a list of validation issue codes (empty list = OK)."""
    issues = []
    if not text:
        return issues
    if TOKEN_DBL.search(text):
        issues.append("double_brackets_token")
    if EMAIL_RE.search(text):
        issues.append("contains_email")
    # add more checks if needed (URLs, secrets, etc.)
    return issues

def _safe_messages_for_log(messages: List[Dict[str, Any]], redact: bool) -> List[Dict[str, Any]]:
    """Copy messages and optionally redact text parts for log storage."""
    out = []
    for m in messages or []:
        role = m.get("role")
        content = []
        for c in (m.get("content") or []):
            if c.get("type") == "text":
                t = c.get("text", "")
                content.append({"type": "text", "text": sanitize_text_for_logs(t) if redact else t})
            else:
                content.append(c)
        out.append({"role": role, "content": content})
    return out

def _first_text_from_messages(messages: List[Dict[str, Any]]) -> str:
    for m in messages or []:
        for c in (m.get("content") or []):
            if c.get("type") == "text":
                return c.get("text") or ""
    return ""

# ---------- Context enrichment (descriptions + tags) ----------
DESC_MAX_CHARS = 320
TAGS_MAX = 12

def _safe_snippet(text: Optional[str], max_len: int = DESC_MAX_CHARS) -> Optional[str]:
    if not text:
        return None
    t = str(text).strip()
    # rudimentary PII scrubbing for free text; privacy_sanitizer will run again later.
    t = EMAIL_RE.sub("[email]", t)
    t = PHONE_RE.sub("[phone]", t)
    # collapse whitespace
    t = re.sub(r"\s+", " ", t)
    if len(t) > max_len:
        t = t[:max_len-1].rstrip() + "…"
    return t

def _parse_id(s: str) -> tuple[str, Optional[int]]:
    if not s: return "", None
    m = ID_PREFIX_RE.match(s)
    if not m: return s, None
    t, num = m.group(1).lower(), int(m.group(2))
    t = {"people":"person"}.get(t, t.rstrip("s"))
    return t, num

def enrich_graph_for_llm(nodes: List[Dict[str, Any]],
                         edges: List[Dict[str, Any]],
                         db: Session) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Adds to node.data:
      - detail.description_snippet (sanitized, short)
      - tags_inline: list[str] of tag labels connected via *_TAG edges.
    Also fills missing description snippets from DB for Project/Task nodes.
    """
    # Work on shallow copies to avoid mutating callers
    nodes_out = [ {"data": dict((n.get("data") or n))} for n in (nodes or []) ]
    edges_out = [ {"data": dict((e.get("data") or e))} for e in (edges or []) ]

    # Quick maps
    id_to_node = {}
    for n in nodes_out:
        d = n["data"]
        nid = d.get("id")
        if not nid: continue
        id_to_node[nid] = d
        d.setdefault("detail", {})
        d.setdefault("tags_inline", [])

    # Tag label map
    tag_label = {}
    for n in nodes_out:
        d = n["data"]
        if (d.get("type") or "").lower() == "tag":
            if d.get("id") and d.get("label"):
                tag_label[d["id"]] = d["label"]

    # Collect tags via edges
    for e in edges_out:
        dd = e["data"]
        et = str(dd.get("type") or "").upper()
        if et in ("TASK_TAG", "PROJECT_TAG", "PERSON_TAG"):
            s = dd.get("source"); t = dd.get("target")
            for a, b in ((s, t), (t, s)):  # both directions just in case
                if not a or not b: continue
                ta, _ = _parse_id(a)
                tb, _ = _parse_id(b)
                # we want tag name attached to the non-tag endpoint
                if ta == "tag" and b in id_to_node and a in tag_label:
                    arr = id_to_node[b].setdefault("tags_inline", [])
                    arr.append(tag_label[a])

    # Dedupe + clamp tags
    for d in id_to_node.values():
        if d.get("tags_inline"):
            uniq = list(dict.fromkeys(x for x in d["tags_inline"] if x))
            d["tags_inline"] = uniq[:TAGS_MAX]

    # Fill description_snippet from existing detail.description if present
    for d in id_to_node.values():
        det = d.setdefault("detail", {})
        if det.get("description") and not det.get("description_snippet"):
            det["description_snippet"] = _safe_snippet(det["description"])

    # Collect missing descriptions from DB in batches (Project/Task)
    task_ids, proj_ids = [], []
    for nid, d in id_to_node.items():
        t, num = _parse_id(nid)
        if num is None: continue
        det = d.setdefault("detail", {})
        if t == "task" and not det.get("description_snippet"):
            task_ids.append(num)
        if t == "project" and not det.get("description_snippet"):
            proj_ids.append(num)

    if task_ids:
        rows = db.query(models.Task.id, models.Task.description, models.Task.priority, models.Task.status)\
                 .filter(models.Task.id.in_(task_ids)).all()
        for tid, desc, prio, status in rows:
            nid = f"task_{tid}"
            d = id_to_node.get(nid)
            if not d: continue
            det = d.setdefault("detail", {})
            det["description_snippet"] = det.get("description_snippet") or _safe_snippet(desc)
            # handy context (safe fields)
            if prio is not None and "priority" not in det: det["priority"] = prio
            if status and "status" not in d: d["status"] = status

    if proj_ids:
        rows = db.query(models.Project.id, models.Project.description, models.Project.status, models.Project.start_date, models.Project.end_date)\
                 .filter(models.Project.id.in_(proj_ids)).all()
        for pid, desc, status, start, end in rows:
            nid = f"project_{pid}"
            d = id_to_node.get(nid)
            if not d: continue
            det = d.setdefault("detail", {})
            det["description_snippet"] = det.get("description_snippet") or _safe_snippet(desc)
            if status and "status" not in d: d["status"] = status
            if start and "start_date" not in det: det["start_date"] = str(start)
            if end and "end_date" not in det: det["end_date"] = str(end)

    return nodes_out, edges_out

# -------------------- LLM CALL WRAPPER (logs + validation) --------------------
def call_llm(*, model_name: str, messages: List[Dict[str, Any]], prompt_type: str, meta: Optional[Dict[str, Any]] = None, redact_for_log: Optional[bool] = None):
    """
    Central wrapper for LLM calls:
      - logs request (sanitized for logs if desired)
      - validates prompt content; warn or block (env PROMPT_VALIDATE_STRICT)
      - calls the model
      - logs response text + latency
      - returns the raw client response
    """
    redact = PROMPT_LOG_REDACT if redact_for_log is None else redact_for_log
    trace_id = str(uuid4())
    t0 = monotonic()

    # Build a single string for validation (first text segment is enough)
    raw_prompt_text = _first_text_from_messages(messages)
    issues = validate_prompt_text(raw_prompt_text)

    if PROMPT_LOG_ENABLED:
        logger.bind(
            event="llm.request",
            prompt_type=prompt_type,
            model=model_name,
            trace_id=trace_id,
            **(meta or {}),
            validation=issues,
        ).info({"messages": _safe_messages_for_log(messages, redact)})

    if issues and PROMPT_VALIDATE_STRICT:
        logger.bind(event="llm.blocked", trace_id=trace_id).warning({"issues": issues})
        raise ValueError(f"Prompt validation failed: {issues}")

    # Make the actual call
    resp = chat.completions.create(model_name=model_name, messages=messages)

    # Try to extract text to log (keep raw prompt/response unchanged at runtime)
    try:
        txt = resp.to_dict()["choices"][0]["message"]["content"]
    except Exception:
        try:
            txt = extract_llm_text(resp)
        except Exception:
            txt = ""

    if PROMPT_LOG_ENABLED:
        dt_ms = int((monotonic() - t0) * 1000)
        logger.bind(
            event="llm.response",
            prompt_type=prompt_type,
            trace_id=trace_id,
            latency_ms=dt_ms,
        ).info({"text": sanitize_text_for_logs(txt) if redact else txt})

    return resp


def _augment_body_with_mentions(body: str, mentions: List[Dict[str, Any]], annotate_once: bool = True) -> str:
    """Append human-readable display after the token like: [task_1] (Task Name).
    If annotate_once=True, only the first occurrence of each token is annotated."""
    display_map = {f"[{m['id']}]": m["display"] for m in mentions}
    seen: set = set()

    def repl(m):
        token = m.group(0)  # e.g. "[task_1]"
        if annotate_once and token in seen:
            return token
        seen.add(token)
        disp = display_map.get(token)
        return f"{token} ({disp})" if disp else token

    return MENTION_RE.sub(repl, body)

def _parse_entity(e) -> tuple[str, int]:
    """Accept 'project_1' or {'type':'project','id':1}."""
    if isinstance(e, str):
        m = ID_RE.match(e.strip())
        if not m:
            raise ValueError("entity must be like 'project_1' or 'task_42'")
        k = m.group(1).lower().rstrip("s")
        k = {"people":"person"}.get(k, k)
        return k, int(m.group(2))
    if isinstance(e, dict):
        k = (e.get("type") or "").strip().lower()
        if k in ("projects","tasks","groups","people"): k = k.rstrip("s")
        if k not in ("project","task","group","person"):
            raise ValueError("entity.type must be 'project'|'task'|'group'|'person'")
        return k, int(e.get("id"))
    raise ValueError("Invalid entity")

def _resolve_mentions(db, text: str) -> Tuple[List[Dict[str, Any]], str]:
    found = set(m.group(0) for m in MENTION_RE.finditer(text))
    if not found:
        return [], text

    by_type: Dict[str, set] = {"person": set(), "project": set(), "task": set(), "group": set()}
    for tok in found:
        m = MENTION_RE.match(tok)
        if not m: continue
        t, num = m.group(1), int(m.group(2))
        by_type[t].add(num)

    people = {r.id: r for r in db.query(models.Person).filter(models.Person.id.in_(list(by_type["person"]))).all()} if by_type["person"] else {}
    projects = {r.id: r for r in db.query(models.Project).filter(models.Project.id.in_(list(by_type["project"]))).all()} if by_type["project"] else {}
    tasks = {r.id: r for r in db.query(models.Task).filter(models.Task.id.in_(list(by_type["task"]))).all()} if by_type["task"] else {}
    groups = {r.id: r for r in db.query(models.Group).filter(models.Group.id.in_(list(by_type["group"]))).all()} if by_type["group"] else {}

    mentions: List[Dict[str, Any]] = []
    display_map: Dict[str, str] = {}

    def push(t: str, num: int, disp: str, email: Optional[str] = None):
        node_id = f"{t}_{num}"
        item: Dict[str, Any] = {"id": node_id, "type": t, "numeric_id": num, "display": disp}
        if email: item["email"] = email
        mentions.append(item)
        display_map[f"[{node_id}]"] = disp

    for tok in found:
        m = MENTION_RE.match(tok)
        if not m: continue
        t, num = m.group(1), int(m.group(2))
        if t == "person":
            p = people.get(num)
            disp = (p.name.strip() if (p and p.name) else (p.email or f"person_{num}"))
            push("person", num, disp, email=(p.email if p else None))
        elif t == "project":
            pr = projects.get(num)
            push("project", num, pr.name if pr else f"project_{num}")
        elif t == "task":
            ta = tasks.get(num)
            push("task", num, ta.name if ta else f"task_{num}")
        elif t == "group":
            g = groups.get(num)
            push("group", num, g.name if g else f"group_{num}")

    # Preview version with tokens fully replaced
    body_resolved = MENTION_RE.sub(lambda m: display_map.get(m.group(0), m.group(0)), text)
    return mentions, body_resolved

# --- Step 1: Convert Prompt into Structured Intent ---
def parse_query_intent(prompt: str, model_name="gpt-4o") -> Dict[str, Any]:
    classification_prompt = f"""
    You are a backend assistant helping analysts query a knowledge graph of people, tasks, projects, and relationships.

    Given a natural language query, return a JSON object with:
    - "type": One of ["Task", "Project", "Person", "Group", "Tag"] — the main target entity.
    - "focus": Optional string — if the query is about relationships (e.g. "related", "connected", "influencing").
    - "filters": Optional dictionary of structured filters (e.g. {{ "status": "not started" }})
    - "search_terms": Only extract **specific names, acronyms, or identifiers** (e.g. "DEIG", "Mission Alpha"). 
    ❌ Do NOT include generic words like "project", "related", or "task".

    Only return valid JSON. Do not explain anything.

    Example:
    Query: "Find all projects with DEIG in the title or related tasks"
    → {{
        "type": "Project",
        "focus": "related_tasks",
        "search_terms": ["DEIG"]
    }}

    Query: "{prompt}"
    """.strip()

    messages = [{"role": "user", "content": [{"type": "text", "text": classification_prompt}]}]
    response = call_llm(
        model_name=model_name,
        messages=messages,
        prompt_type="intent.classify",
        meta={"input_len": len(prompt)},
        # This prompt may include user free text → redact it in logs
        redact_for_log=True,
    )
    reply = response.to_dict()["choices"][0]["message"]["content"]

    try:
        return json.loads(reply)
    except Exception as e:
        print("❌ Failed to parse structured intent:", e)
        return {"type": "Project", "search_terms": []}
   
# --- Step 2: Query Seed Nodes from Keywords ---
def query_seed_nodes_from_keywords(db: Session, intent: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    search_terms = intent.get("search_terms", [])
    if "project" not in search_terms:
        search_terms.append("project")

    results = {
        "nodes": [],
        "edges": []
    }

    for entity_type, fields in MODEL_FIELD_MAP.items():
        model = MODEL_MAP.get(entity_type.lower())
        if not model:
            continue

        # Build OR clauses across fields for each search term
        term_clauses = []
        for term in search_terms:
            field_clauses = []
            for field_name in fields:
                if has_attr(model, field_name):
                    field = getattr(model, field_name)
                    try:
                        if field.type.python_type in [str, type(None)]:
                            field_clauses.append(field.ilike(f"%{term}%"))
                        elif field.type.python_type.__name__ in ["date", "datetime"]:
                            field_clauses.append(cast(field, String).ilike(f"%{term}%"))
                    except Exception:
                        # Fallback for non-introspectable types
                        field_clauses.append(cast(field, String).ilike(f"%{term}%"))

            if field_clauses:
                term_clauses.append(or_(*field_clauses))

        if not term_clauses:
            continue

        query = db.query(model).filter(or_(*term_clauses))
        items = query.all()

        # Convert to graph nodes + edges
        for item in items:
            if entity_type == "Project":
                results["nodes"].append({
                    "data": {
                        "id": f"project_{item.id}",
                        "label": item.name,
                        "type": "Project",
                        "status": item.status,
                        "detail": {
                            "description": item.description,
                            "start_date": str(item.start_date) if item.start_date else None,
                            "end_date": str(item.end_date) if item.end_date else None
                        }
                    }
                })

            elif entity_type == "Task":
                results["nodes"].append({
                    "data": {
                        "id": f"task_{item.id}",
                        "label": item.name,
                        "type": "Task",
                        "status": item.status,
                        "detail": {
                            "description": item.description,
                            "priority": item.priority
                        }
                    }
                })
                for a in item.task_assignees:
                    results["edges"].append({
                        "data": {
                            "source": f"task_{item.id}",
                            "target": f"person_{a.person_id}",
                            "type": "TASK_ASSIGNEE"
                        }
                    })

            elif entity_type == "Person":
                results["nodes"].append({
                    "data": {
                        "id": f"person_{item.id}",
                        "label": item.name,
                        "type": "Person"
                    }
                })

            elif entity_type == "Group":
                results["nodes"].append({
                    "data": {
                        "id": f"group_{item.id}",
                        "label": item.name,
                        "type": "Group"
                    }
                })
                for m in item.members:
                    results["edges"].append({
                        "data": {
                            "source": f"group_{item.id}",
                            "target": f"person_{m.id}",
                            "type": "HAS_MEMBER"
                        }
                    })

            elif entity_type == "Tag":
                results["nodes"].append({
                    "data": {
                        "id": f"tag_{item.id}",
                        "label": item.name,
                        "type": "Tag"
                    }
                })

    return results

# --- Step 3: Expand the graph baed on the seed ---
def expand_seed_graph(seed_graph: Dict[str, Any], db: Session) -> Dict[str, Any]:
    nodes_by_id = {node["data"]["id"]: node for node in seed_graph["nodes"]}
    edges = seed_graph["edges"][:]

    def add_node(obj_id: str, data: Dict[str, Any]):
        if obj_id not in nodes_by_id:
            nodes_by_id[obj_id] = {"data": {"id": obj_id, **data}}

    def add_edge(source_id: str, target_id: str, edge_type: str, **kwargs):
        edges.append({"data": {"source": source_id, "target": target_id, "type": edge_type, **kwargs}})

    # Gather IDs present in the seed graph
    task_ids = [int(nid.split("_")[1]) for nid in nodes_by_id if nid.startswith("task_")]
    project_ids = [int(nid.split("_")[1]) for nid in nodes_by_id if nid.startswith("project_")]
    person_ids: set[int] = set()

    # --- Expand TASK relationships ---
    if task_ids:
        tasks = db.query(models.Task).filter(models.Task.id.in_(task_ids)).all()
        for task in tasks:
            # assignees
            for assignee in task.task_assignees:
                person = assignee.person
                if not person:
                    continue
                pid = f"person_{person.id}"
                add_node(pid, {"label": person.name, "type": "Person"})
                add_edge(f"task_{task.id}", pid, "TASK_ASSIGNEE")
                person_ids.add(person.id)

            # task tags
            for tag in task.tags or []:
                tag_id = f"tag_{tag.id}"
                add_node(tag_id, {"label": tag.name, "type": "Tag"})
                add_edge(f"task_{task.id}", tag_id, "TASK_TAG")

    # --- Expand PROJECT relationships ---
    if project_ids:
        projects = db.query(models.Project).filter(models.Project.id.in_(project_ids)).all()
        for project in projects:
            # project leads
            for lead in project.project_leads or []:
                person = lead.person
                if not person:
                    continue
                pid = f"person_{person.id}"
                add_node(pid, {"label": person.name, "type": "Person"})
                add_edge(f"project_{project.id}", pid, "PROJECT_LEAD", role=lead.role)
                person_ids.add(person.id)

            # project tags
            for tag in project.tags or []:
                tag_id = f"tag_{tag.id}"
                add_node(tag_id, {"label": tag.name, "type": "Tag"})
                add_edge(f"project_{project.id}", tag_id, "PROJECT_TAG")

    # --- Expand PERSON → PERSON influence (uses PersonRelation model) ---
    if person_ids:
        rels = (
            db.query(models.PersonRelation)
              .filter(models.PersonRelation.from_person_id.in_(list(person_ids)))
              .all()
        )

        for rel in rels:
            src_id = f"person_{rel.from_person_id}"
            tgt_id = f"person_{rel.to_person_id}"

            # ensure target person node exists
            if tgt_id not in nodes_by_id:
                tgt = db.query(models.Person).filter_by(id=rel.to_person_id).first()
                if tgt:
                    add_node(tgt_id, {"label": tgt.name, "type": "Person"})

            # edge metadata: map model's 'type' → 'relationship_type'; no 'weight' in your model → default 1
            add_edge(
                src_id,
                tgt_id,
                "PERSON_INFLUENCE",
                relationship_type=(rel.type or "related"),
                weight=1,
                note=rel.note if getattr(rel, "note", None) else None,
            )

    # --- Expand PERSON tags for all persons we’ve touched ---
    if person_ids:
        persons = db.query(models.Person).filter(models.Person.id.in_(list(person_ids))).all()
        for person in persons:
            for tag in person.tags or []:
                tag_id = f"tag_{tag.id}"
                add_node(tag_id, {"label": tag.name, "type": "Tag"})
                add_edge(f"person_{person.id}", tag_id, "PERSON_TAG")

    return {
        "nodes": list(nodes_by_id.values()),
        "edges": edges
    }

def build_subgraph_with_networkx(graph: Dict[str, Any]) -> nx.DiGraph:
    """
    Builds a directed NetworkX graph from the given dictionary-based graph structure.
    Each node and edge retains its metadata for downstream analysis.

    Args:
        graph (Dict[str, Any]): Contains `nodes` and `edges` lists with `data` dicts inside.

    Returns:
        nx.DiGraph: A directed graph containing the nodes and edges with attributes.
    """
    G = nx.DiGraph()

    # Add nodes
    for node in graph.get("nodes", []):
        node_data = node.get("data", {})
        node_id = node_data.get("id")
        if node_id:
            G.add_node(node_id, **node_data)

    # Add edges
    for edge in graph.get("edges", []):
        edge_data = edge.get("data", {})
        source = edge_data.get("source")
        target = edge_data.get("target")
        if source and target:
            G.add_edge(source, target, **edge_data)

    return G

# --- Step 4: Generate Recommendation and Narrative ---
def generate_grounded_response(prompt: str, db: Session) -> Dict[str, Any]:
    intent = parse_query_intent(prompt)
    seed_graph = query_seed_nodes_from_keywords(db, intent)
    response_graph = expand_seed_graph(seed_graph, db)
    response_graph = hydrate_graph_node_details(db, response_graph)
    enr_nodes, enr_edges = enrich_graph_for_llm(response_graph["nodes"], response_graph["edges"], db)
    safe = sanitize_graph_for_prompt(enr_nodes, enr_edges)
    nx_graph = build_subgraph_with_networkx(safe)

    recommendations = []

    # -- Task status recommendations
    for node_id, data in nx_graph.nodes(data=True):
        if data.get("type") == "Task" and data.get("status") == "not started":
            recommendations.append(
                f"Task '{data.get('label')}' (ID: {node_id}) is not started and should be prioritized."
            )

    # -- Influence scores
    person_influence = defaultdict(int)
    for u, v, edge_data in nx_graph.edges(data=True):
        if edge_data.get("type") == "PERSON_INFLUENCE":
            person_influence[v] += edge_data.get("weight", 1)

    # -- Influence-based person-task matching
    for node_id, data in nx_graph.nodes(data=True):
        if data.get("type") == "Task":
            assignees = [
                (v, person_influence.get(v, 0))
                for u, v, e in nx_graph.out_edges(node_id, data=True)
                if e.get("type") == "TASK_ASSIGNEE"
            ]
            if assignees:
                best_person_id, _ = max(assignees, key=lambda x: x[1])
                recommendations.append(
                    f"Assign Task '{data.get('label')}' (ID: {node_id}) to {best_person_id} based on influence."
                )

    # -- LLM prompt (ID-based only)
    graph_summary_prompt = f"""
    You are a backend analyst reviewing a task and personnel graph. You may only use:
    - Node IDs (e.g., 'person_12', 'task_5', 'project_3')
    - Relationship types (TASK_ASSIGNEE, PROJECT_LEAD, PERSON_INFLUENCE, *_TAG)
    - Safe node fields: status, priority, detail.description_snippet, tags_inline

    The user asked: "{prompt}"

    Here is the graph you must analyze (sanitized):
    - Nodes (subset): {json.dumps(safe['nodes'][:40], ensure_ascii=False)}
    - Edges (subset): {json.dumps(safe['edges'][:80],  ensure_ascii=False)}

    Use tags_inline (facets/themes) and description_snippet for context,
    but always reference entities by their IDs. Do not use names/emails/PII.
    Summarize key insights and give recommendations grounded in the graph structure.
    """.strip()

    messages = [{"role": "user", "content": [{"type": "text", "text": graph_summary_prompt}]}]
    llm_response = call_llm(
        model_name="gpt-4o",
        messages=messages,
        prompt_type="graph.summary",
        meta={"nodes": len(safe["nodes"]), "edges": len(safe["edges"])},
        # prompt uses sanitize_graph_for_prompt → safe to keep unredacted in logs
        redact_for_log=False,
    )

    raw_summary = extract_llm_text(llm_response)
    summary, entity_labels = normalize_ai_text_and_labels(raw_summary, db)

    return {
        "question": prompt,
        "answer": summary,
        "entity_labels": entity_labels,   # optional but useful for the FE
        "recommendations": recommendations,
        "graph": response_graph
    }

def parse_node_identity(node_id: str) -> tuple[str, str]:
    """Normalize 'task_12' -> ('task','12'), 'people_7' -> ('person','7')"""
    s = str(node_id)
    m = ID_PREFIX_RE.match(s)
    if m:
        t, num = m.group(1).lower(), m.group(2)
        t = {"people": "person"}.get(t, t.rstrip("s"))
        return t, num
    # fallback: split on underscore
    parts = s.split("_", 1)
    t = (parts[0] if parts else s).lower().rstrip("s")
    oid = parts[1] if len(parts) > 1 else s
    if t == "people": t = "person"
    return t, oid

def build_ego_graph(graph: Dict[str, Any], center_id: str, max_neighbors: int = 50) -> Dict[str, Any]:
    nodes = graph.get("nodes") or []
    edges = graph.get("edges") or graph.get("links") or []

    def id_of(n): return (n.get("data") or n).get("id")
    def lab_of(n): return (n.get("data") or n).get("label")
    def typ_of(n): return (n.get("data") or n).get("type")
    def det_of(n): return (n.get("data") or n).get("detail")

    nid_to_node = {}
    for n in nodes:
        nid = id_of(n)
        if nid:
            nid_to_node[nid] = {
                "id": nid,
                "label": lab_of(n),
                "type": typ_of(n),
                "detail": det_of(n),
            }

    neighbors = set()
    for e in edges:
        d = e.get("data") or e
        s, t = d.get("source"), d.get("target")
        if not s or not t:
            continue
        if s == center_id and t != center_id: neighbors.add(t)
        if t == center_id and s != center_id: neighbors.add(s)

    neighbors = list(neighbors)[:max_neighbors]
    result_nodes = []
    if center_id in nid_to_node:
        result_nodes.append({"data": nid_to_node[center_id]})
    for nid in neighbors:
        if nid in nid_to_node:
            result_nodes.append({"data": nid_to_node[nid]})

    allowed = {center_id, *neighbors}
    result_edges = []
    for e in edges:
        d = e.get("data") or e
        s, t = d.get("source"), d.get("target")
        if s in allowed and t in allowed:
            result_edges.append({"data": d})

    return {"nodes": result_nodes, "edges": result_edges}

def node_summary_prompt(center_id: str, ego: Dict[str, Any]) -> str:

    nodes_snip = json.dumps(ego["nodes"][:40], ensure_ascii=False)
    edges_snip = json.dumps(ego["edges"][:80], ensure_ascii=False)
    return f"""
        You are a PMO analyst. Using ONLY the graph, write a concise brief about the CENTER node.

        Rules:
        - Ground statements strictly in the provided nodes/edges (IDs like 'task_12', labels, status).
        - Focus on status, key relationships/dependencies, risks, and 1–2 concrete recommendations.
        - 5–8 short bullets.

        CENTER: {center_id}

        GRAPH NODES (subset):
        {nodes_snip}

        GRAPH EDGES (subset):
        {edges_snip}
        """.strip()

def generate_node_summary(center_id: str, db: Session) -> Tuple[str, Dict[str, Any], str, str, Dict[str, str]]:
    """
    Returns:
      summary_text (clean, with bare ids),
      ego (unsanitized, for FE/graph),
      object_type,
      object_id,
      entity_labels (id -> label) for chips
    """
    graph_data = crud.get_graph_network(db)["graph"]
    ego_graph = build_ego_graph(graph_data, center_id, max_neighbors=50)
    ego_graph = expand_seed_graph(ego_graph, db)
    ego_graph = hydrate_graph_node_details(db, ego_graph)
    object_type, object_id = parse_node_identity(center_id)

    # redact PII in the prompt graph; keep ego untouched for the FE
    enr_nodes, enr_edges = enrich_graph_for_llm(ego_graph["nodes"], ego_graph["edges"], db)
    safe = sanitize_graph_for_prompt(enr_nodes, enr_edges)
    prompt = node_summary_prompt(center_id, {"nodes": safe["nodes"], "edges": safe["edges"]})

    messages = [{"role": "user", "content": [{"type": "text", "text": prompt}]}]
    llm_response = call_llm(
        model_name="gpt-4o",
        messages=messages,
        prompt_type="node.summary",
        meta={"center_id": center_id},
        redact_for_log=False,  # prompt graph is sanitized
    )


    raw_summary = extract_llm_text(llm_response)
    summary, entity_labels = normalize_ai_text_and_labels(raw_summary, db)

    return summary, ego_graph, object_type, object_id, entity_labels

def _fmt_date(d: Any, fmt: str) -> str:
    if not d:
        return ""
    if isinstance(d, (date, datetime)):
        return d.strftime("%Y-%m-%d" if fmt == "YYYY-MM-DD" else "%b %d, %Y")
    try:
        return str(d)[:10]
    except Exception:
        return str(d)

def _email_ok(email: str, exclude_domains: List[str]) -> bool:
    if not email:
        return False
    low = email.lower()
    return not any(dom in low for dom in (exclude_domains or []))

def _role_in(needle: str, roles: List[str]) -> bool:
    if not needle: return False
    n = needle.strip().lower()
    return any(n == r.strip().lower() for r in (roles or []))

def _collect_addresses_for_project(db: Session, pid: int, policy: schemas.ComposeEmailPolicy) -> Tuple[List[str], List[str]]:
    """Collect TO/CC from project leads and all task assignees in project."""
    to_set, cc_set = set(), set()

    p = (
        db.query(models.Project)
        .options(
            joinedload(models.Project.project_leads).joinedload(models.ProjectLead.person),
            joinedload(models.Project.tasks).joinedload(models.Task.task_assignees).joinedload(models.TaskAssignee.person),
        )
        .filter(models.Project.id == pid)
        .first()
    )
    if not p:
        return [], []

    # Project leads
    for pl in (p.project_leads or []):
        per = pl.person
        if not per: continue
        em = per.email
        if not _email_ok(em, policy.exclude.get("domains", [])): continue
        role = (pl.role or "").strip()
        if _role_in(role, policy.toRoles):
            to_set.add(em)
        elif _role_in(role, policy.ccRoles):
            cc_set.add(em)
        else:
            # Unknown role → CC by default
            cc_set.add(em)

    # Task assignees
    for t in (p.tasks or []):
        for a in (t.task_assignees or []):
            per = a.person
            if not per: continue
            em = per.email
            if not _email_ok(em, policy.exclude.get("domains", [])): continue
            role = (a.role or "").strip()
            if _role_in(role, policy.toRoles):
                to_set.add(em)
            elif _role_in(role, policy.ccRoles):
                cc_set.add(em)
            else:
                cc_set.add(em)

    return list(to_set), list(cc_set)

def _collect_addresses_for_task(db: Session, tid: int, policy: schemas.ComposeEmailPolicy) -> Tuple[List[str], List[str]]:
    to_set, cc_set = set(), set()

    t = (
        db.query(models.Task)
        .options(
            joinedload(models.Task.task_assignees).joinedload(models.TaskAssignee.person),
            joinedload(models.Task.project).joinedload(models.Project.project_leads).joinedload(models.ProjectLead.person),
        )
        .filter(models.Task.id == tid)
        .first()
    )
    if not t:
        return [], []

    # Assignees
    for a in (t.task_assignees or []):
        per = a.person
        if not per: continue
        em = per.email
        if not _email_ok(em, policy.exclude.get("domains", [])): continue
        role = (a.role or "").strip()
        if _role_in(role, policy.toRoles):
            to_set.add(em)
        elif _role_in(role, policy.ccRoles):
            cc_set.add(em)
        else:
            cc_set.add(em)

    # Project leads (default CC unless policy says TO)
    if t.project:
        leads_to, leads_cc = _collect_addresses_for_project(db, t.project.id, policy)
        for e in leads_cc: cc_set.add(e)
        for e in leads_to: to_set.add(e)

    return list(to_set), list(cc_set)

def _strip_code_fences(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        # remove first fenced block
        s = s.lstrip("`")
        # naive: keep content after first newline
        s = s.split("\n", 1)[-1]
        # also drop trailing fence if present
        if "```" in s:
            s = s.rsplit("```", 1)[0]
    return s.strip()

def _extract_subject_and_body(raw: str) -> Tuple[str, str]:
    """
    Accepts the LLM raw output.
    Expected: first line = subject, blank line, then body (plain text).
    Falls back to JSON detection if the model ignored instructions.
    """
    txt = _strip_code_fences(raw)

    # 1) Try plain text format: first non-empty line = subject
    lines = [ln.rstrip() for ln in txt.splitlines()]
    # remove leading empties
    while lines and not lines[0].strip():
        lines.pop(0)
    if lines:
        subj = lines[0].strip()
        # If looks like "Subject: ..." normalize
        if subj.lower().startswith("subject:"):
            subj = subj.split(":", 1)[1].strip()
        # body starts after first blank line following the subject line
        try:
            blank_idx = lines.index("", 1)
            body_lines = lines[blank_idx + 1 :]
        except ValueError:
            body_lines = lines[1:]
        body_text = "\n".join(body_lines).strip()
        if subj:
            return subj, body_text

    # 2) Fallback: try to parse inline JSON { "subject": ..., "body": ... }
    import json, re
    try:
        # quick brace capture
        start = txt.find("{")
        end = txt.rfind("}")
        if start != -1 and end != -1 and end > start:
            obj = json.loads(txt[start:end+1])
            subj = (obj.get("subject") or "").strip()
            body = (obj.get("body") or "").strip()
            if subj or body:
                return subj, body
    except Exception:
        pass

    # 3) Final fallback: return everything as body, empty subject (caller will fill)
    return "", txt.strip()

def _normalize_tokens_to_single(text: str) -> str:
    # normalize [[person_12]] -> [person_12] if the model slips
    return DOUBLE_BRACKET_RE.sub(lambda m: f"[{m.group(1)}_{m.group(2)}]", text)

def _build_email_prompt(
    mode: str,
    entity_label: str,
    policy: schemas.ComposeEmailPolicy,
    options: schemas.ComposeEmailOptions,
    subgraph: Dict[str, Any],
) -> str:
    # sanitize FIRST (no PII)
    safe_graph = sanitize_graph_for_prompt(subgraph["nodes"], subgraph["edges"])
    nodes_snip = json.dumps(safe_graph["nodes"][:250], ensure_ascii=False)
    edges_snip = json.dumps(safe_graph["edges"][:500], ensure_ascii=False)

    guidance = {
        "status":   f"Write a concise weekly status with up to {options.maxBullets} bullets grounded ONLY in the graph.",
        "standup":  "Write a stand-up style update with headings: Yesterday, Today, Blockers.",
        "risk":     "Write a risk escalation email: risk, likelihood/impact, triggers, mitigations, decision needed.",
        "unblocker":"Write a short unblock request: context, blockers, requested action, needed by.",
    }[mode]

    recent_clause = (
        "Include a short 'Recent activity' section if the graph shows in-progress or completed items."
        if options.includeRecentActivity else
        "Do not include a 'Recent activity' section."
    )

    return f"""
You are a PMO communication agent.
- Language: {policy.language}
- Tone: {policy.tone}
- Date today: {_fmt_date(date.today(), options.dateFormat)}

Email type: {mode.upper()}
Entity: {entity_label}

{guidance}
{recent_clause}

CONTEXT YOU MAY USE (sanitized):
- status, priority
- detail.description_snippet   (short, PII-scrubbed)
- tags_inline                  (topics/themes)
- relationships: TASK_ASSIGNEE, PROJECT_LEAD, PERSON_INFLUENCE, *_TAG

STRICT RULES:
- Reference people/tasks/projects/groups ONLY by their node IDs in SINGLE brackets: [person_12], [task_3], [project_7], [group_5].
- Do not invent facts. If information is missing, say so briefly.
- SUBJECT must not contain PII (IDs are allowed).
- OUTPUT MUST BE PLAIN TEXT: first line is the subject, then a blank line, then the email body. Do NOT return JSON. Do NOT use markdown or code fences.

GRAPH NODES (subset, sanitized):
{nodes_snip}

GRAPH EDGES (subset):
{edges_snip}
""".strip()

def compose_email_from_graph(db: Session, inp: schemas.ComposeEmailIn) -> schemas.ComposeEmailOut:
    etype, eid = _parse_entity(inp.entity)

    # --- graph size defaults by mode (+ optional overrides) ---
    cfg = COM_TASK_TO_GRAPH_DEFAULTS.get(inp.mode, COM_TASK_TO_GRAPH_DEFAULTS["status"])
    opts = getattr(inp, "options", None) or schemas.ComposeEmailOptions()
    degrees   = int(getattr(opts, "degrees",   cfg["degrees"]))
    max_nodes = int(getattr(opts, "maxNodes",  cfg["maxNodes"]))
    max_edges = int(getattr(opts, "maxEdges",  cfg["maxEdges"]))

    # --- fetch entity + recipients + label ---
    if etype == "project":
        proj = db.query(models.Project).filter(models.Project.id == eid).first()
        if not proj:
            raise ValueError("Project not found")
        entity_label = proj.name or f"project_{eid}"
        try:
            # if your helper takes the object (as in main.py you shared)
            to_emails, cc_emails = _collect_addresses_for_project(proj, inp.policy)
        except TypeError:
            # if you switched to the db+id variant
            to_emails, cc_emails = _collect_addresses_for_project(db, proj.id, inp.policy)

    elif etype == "task":
        task = db.query(models.Task).filter(models.Task.id == eid).first()
        if not task:
            raise ValueError("Task not found")
        entity_label = f"{task.project.name} / {task.name}" if task.project else (task.name or f"task_{eid}")
        try:
            to_emails, cc_emails = _collect_addresses_for_task(task, inp.policy)
        except TypeError:
            to_emails, cc_emails = _collect_addresses_for_task(db, task.id, inp.policy)
    else:
        raise ValueError("Only 'project' and 'task' are supported for email composition")

    # --- subgraph (N-hop) ---
    subgraph = crud.get_entity_subgraph(
        db,
        centers=[f"{etype}_{eid}"],
        degrees=degrees,
        max_nodes=max_nodes,
        max_edges=max_edges,
        include_collab=True,
    )
    subgraph["graph"] = hydrate_graph_node_details(db, subgraph["graph"])
    # --- prompt + LLM ---
    enr_nodes, enr_edges = enrich_graph_for_llm(subgraph["graph"]["nodes"], subgraph["graph"]["edges"], db)
    safe = sanitize_graph_for_prompt(enr_nodes, enr_edges)
    prompt = _build_email_prompt(inp.mode, entity_label, inp.policy, opts, safe)
    messages = [{"role": "user", "content": [{"type": "text", "text": prompt}]}]
    llm = call_llm(
        model_name="gpt-4o",
        messages=messages,
        prompt_type="email.compose",
        meta={
            "entity": f"{etype}_{eid}",
            "mode": inp.mode,
            "degrees": degrees,
            "max_nodes": max_nodes,
            "max_edges": max_edges,
        },
        redact_for_log=False,  # prompt graph is sanitized
    )
    raw = llm.to_dict()["choices"][0]["message"]["content"]

    # --- parse + normalize output ---
    raw = _normalize_tokens_to_single(raw)                 # [[x_y]] -> [x_y]
    subject, body = _extract_subject_and_body(raw)         # first line subj, blank, then body (fallbacks if JSON)
    if not subject:
        subject = f"{entity_label} — {inp.mode.title()} ({_fmt_date(date.today(), opts.dateFormat)})"
    body = _normalize_tokens_to_single(body)

    # --- resolve mentions + annotate first occurrence inline (keeps tokens) ---
    mentions, body_preview_resolved = _resolve_mentions(db, body)
    subject = _augment_body_with_mentions(subject, mentions, annotate_once=False)  # optional, annotate in subject too
    body    = _augment_body_with_mentions(body,    mentions, annotate_once=True)

    # --- dedupe/sanitize recipients per policy ---
    def _norms(seq): return [e.strip() for e in (seq or []) if e and isinstance(e, str)]
    if inp.policy.dedupe:
        to_emails = list(dict.fromkeys(_norms(to_emails)))
        cc_emails = [e for e in _norms(cc_emails) if e not in to_emails]
    else:
        to_emails = _norms(to_emails)
        cc_emails = _norms(cc_emails)

    # --- meta (for UI) ---
    meta = {
        "entity": {"type": etype, "id": str(eid), "label": entity_label},
        "mode": inp.mode,
        "graph": {"nodes": len(subgraph["graph"]["nodes"]), "edges": len(subgraph["graph"]["edges"])},
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "degrees": degrees,
        "policy": {
            "toRoles": inp.policy.toRoles,
            "ccRoles": inp.policy.ccRoles,
            "exclude": inp.policy.exclude,
            "language": inp.policy.language,
            "tone": inp.policy.tone,
        },
        "options": opts.model_dump() if hasattr(opts, "model_dump") else getattr(opts, "dict", lambda: {})(),
        "mentions": mentions,                         # [{ id, type, numeric_id, display, email? }, ...]
        "tokenFormat": "[<node_id>]",                 # UI can scan for \[(person|task|project|group)_\d+\]
        "bodyPreviewResolved": body_preview_resolved, # fully replaced (no tokens)
        "bodyPreviewAnnotated": body,                 # tokens + first-mention "(Display)"
    }

    if opts.includeProvenance:
        body = body.rstrip() + "\n\n—\n" + f"(Generated from {etype}:{eid} with {degrees}-hop graph on {date.today().isoformat()})"

    return schemas.ComposeEmailOut(
        to=to_emails,
        cc=cc_emails,
        subject=subject,
        body=body,
        meta=meta,
    )

# --- detail hydration (bulk) -----------------------------------------------

def hydrate_graph_node_details(db: Session, graph: Dict[str, Any]) -> Dict[str, Any]:
    """
    Ensure every node with an ID (project_*, task_*, group_*, person_*, tag_*)
    gets a populated `detail` field (and missing root fields like `status` when available).

    Mutates and returns `graph`:
      graph = {"nodes":[{"data": {...}}...], "edges":[...]}
    """
    nodes = graph.get("nodes") or []

    def _nid(d) -> str:
        return (d.get("data") or d).get("id") or ""

    # Collect numeric IDs by type
    proj_ids, task_ids, group_ids, person_ids, tag_ids = set(), set(), set(), set(), set()
    for n in nodes:
        nid = _nid(n)
        m = ID_PREFIX_RE.match(nid)
        if not m:
            continue
        t = m.group(1).lower()
        t = {"people": "person"}.get(t, t.rstrip("s"))
        try:
            num = int(m.group(2))
        except Exception:
            continue
        if t == "project": proj_ids.add(num)
        elif t == "task": task_ids.add(num)
        elif t == "group": group_ids.add(num)
        elif t == "person": person_ids.add(num)
        elif t == "tag": tag_ids.add(num)

    # Bulk fetch (avoid N+1)
    proj_map: Dict[int, dict] = {}
    if proj_ids:
        q = (
            db.query(models.Project)
            .options(joinedload(models.Project.tags))
            .filter(models.Project.id.in_(proj_ids))
            .all()
        )
        for p in q:
            proj_map[p.id] = {
                "description": p.description,
                "start_date": p.start_date.isoformat() if getattr(p, "start_date", None) else None,
                "end_date": p.end_date.isoformat() if getattr(p, "end_date", None) else None,
                "tags": [{"id": t.id, "name": t.name} for t in (p.tags or [])],
            }

    task_map: Dict[int, dict] = {}
    if task_ids:
        q = (
            db.query(models.Task)
            .options(joinedload(models.Task.tags), joinedload(models.Task.project))
            .filter(models.Task.id.in_(task_ids))
            .all()
        )
        for t in q:
            task_map[t.id] = {
                "description": t.description,
                "priority": getattr(t, "priority", None),
                "status": getattr(t, "status", None),
                "project_id": getattr(t, "project_id", None),
                "project_label": t.project.name if getattr(t, "project", None) else None,
                "tags": [{"id": tg.id, "name": tg.name} for tg in (t.tags or [])],
            }

    group_map: Dict[int, dict] = {}
    if group_ids:
        q = db.query(models.Group).filter(models.Group.id.in_(group_ids)).all()
        for g in q:
            # add safe metadata you have (name already at label). Example: member count
            member_count = len(getattr(g, "members", []) or [])
            group_map[g.id] = {"member_count": member_count}

    person_map: Dict[int, dict] = {}
    if person_ids:
        # keep PII minimal; FE can use, sanitizer will strip for LLM
        q = (
            db.query(models.Person)
            .options(joinedload(models.Person.tags))
            .filter(models.Person.id.in_(person_ids))
            .all()
        )
        for p in q:
            person_map[p.id] = {
                # intentionally omit email/phone/etc (PII). Notes optional if you want in FE only.
                "tags": [{"id": t.id, "name": t.name} for t in (getattr(p, "tags", []) or [])]
            }

    tag_map: Dict[int, dict] = {}
    if tag_ids:
        q = db.query(models.Tag).filter(models.Tag.id.in_(tag_ids)).all()
        for t in q:
            tag_map[t.id] = {
                # add safe extra fields if you have them (category, description…)
            }

    # Apply to nodes (preserve existing detail, only fill/merge)
    for n in nodes:
        d = n.get("data") or n
        nid = d.get("id") or ""
        m = ID_PREFIX_RE.match(nid)
        if not m:
            continue
        t = {"people": "person"}.get(m.group(1).lower(), m.group(1).lower().rstrip("s"))
        try:
            num = int(m.group(2))
        except Exception:
            continue

        detail = dict(d.get("detail") or {})

        if t == "project" and num in proj_map:
            # backfill top-level status if missing, but don't overwrite if present
            if not d.get("status") and hasattr(models.Project, "status"):
                # you can fetch status from DB again if needed
                pass
            detail.update(proj_map[num])

        elif t == "task" and num in task_map:
            tm = task_map[num]
            # also backfill root status if missing
            if not d.get("status") and tm.get("status") is not None:
                d["status"] = tm["status"]
            detail.update(tm)

        elif t == "group" and num in group_map:
            detail.update(group_map[num])

        elif t == "person" and num in person_map:
            detail.update(person_map[num])

        elif t == "tag" and num in tag_map:
            detail.update(tag_map[num])

        if detail:
            d["detail"] = detail

        # write back if node was shallow (no "data" wrapper)
        if "data" not in n:
            n.update(d)

    return graph

# ---------------------------------------------------------------
# Daily Plan (AI + heuristics + LLM advice)
# ---------------------------------------------------------------

# ---- scoring helpers ---------------------------------------------------------

def _priority_weight(p: Optional[str]) -> int:
    if not p: return 1
    p = p.lower().strip()
    return {"high": 3, "medium": 2, "low": 1}.get(p, 1)

def _urgency_bucket(due: Optional[date], today: date, horizon: date) -> str:
    if not due:
        return "later"
    if due < today:
        return "today"     # treat overdue as "do now"
    if due == today:
        return "today"
    if today < due <= horizon:
        return "soon"
    return "later"

def _urgency_weight(u: str) -> int:
    # higher weight = more important
    return {"today": 5, "soon": 3, "later": 1}.get((u or "").lower(), 1)

def _status_penalty(status: Optional[str]) -> int:
    # Slightly downrank blocked for "do now"; they'll be listed under follow-ups too.
    if not status: return 0
    s = status.lower().strip()
    if s == "blocked": return -2
    if s == "complete" or s == "canceled": return -999
    return 0

def _score_task(t, today: date, horizon: date) -> int:
    u = _urgency_bucket(getattr(t, "end", None), today, horizon)
    score = _priority_weight(getattr(t, "priority", None)) * 3 \
          + _urgency_weight(u) * 5 \
          + _status_penalty(getattr(t, "status", None))
    if getattr(t, "is_continuous", False):
        score += 1  # nudge continuous work up a bit
    if (getattr(t, "status", "") or "").lower() == "in progress":
        score += 2
    return score

# ---- shaping helpers ---------------------------------------------------------

def _to_person_lite(p) -> schemas.PersonLite:
    # name is optional in the schema; safe to include if present
    return schemas.PersonLite(id=p.id, name=(p.name or None))

def _to_daily_plan_item(t, today: date, horizon: date) -> schemas.DailyPlanItem:
    project = getattr(t, "project", None)
    due = getattr(t, "end", None)
    urgency = _urgency_bucket(due, today, horizon)
    reason = None
    if due:
        if due < today:
            reason = "Overdue"
        elif due == today:
            reason = "Due today"
        elif today < due <= horizon:
            delta = (due - today).days
            reason = f"Due in {delta} day{'s' if delta != 1 else ''}"
    elif getattr(t, "is_continuous", False):
        reason = "Continuous task"

    blocked = []
    if (getattr(t, "status", "") or "").lower() == "blocked":
        blocked.append("Status: blocked")

    assignees = []
    for a in (getattr(t, "task_assignees", []) or []):
        if getattr(a, "person", None):
            assignees.append(_to_person_lite(a.person))

    tags = [tg.name for tg in (getattr(t, "tags", []) or []) if getattr(tg, "name", None)]

    # NOTE: we will overwrite desc with AI advice later; keep this short.
    return schemas.DailyPlanItem(
        id=f"task-{t.id}",
        kind="task",
        title=(t.name or f"Task {t.id}"),
        desc=None,
        priority=(getattr(t, "priority", None) or "medium"),
        urgency=urgency,
        reason=reason,
        effort=None,
        dueDate=(due.isoformat() if due else None),
        taskId=t.id,
        projectId=getattr(t, "project_id", None),
        projectName=(project.name if project else None),
        assignees=assignees,
        blockedBy=blocked,
        isContinuous=getattr(t, "is_continuous", False),
        tags=tags,
    )

def _cap_sections(sections: Dict[str, List[schemas.DailyPlanItem]], max_items: int) -> Dict[str, List[schemas.DailyPlanItem]]:
    """Respect a global maxItems cap while keeping section ordering."""
    order = ["Do Now", "Due Soon", "Follow-Ups", "Continuous", "Backlog", "Suggestions"]
    remaining = max_items
    out: Dict[str, List[schemas.DailyPlanItem]] = {}
    for key in order:
        items = sections.get(key, [])
        if remaining <= 0:
            out[key] = []
            continue
        if len(items) <= remaining:
            out[key] = items
            remaining -= len(items)
        else:
            out[key] = items[:remaining]
            remaining = 0
    # include any custom sections that aren’t in the default order
    for k, v in sections.items():
        if k not in out:
            out[k] = v if remaining <= 0 else v[:remaining]
            remaining = max(0, remaining - len(out[k]))
    return out

def _counts(sections: Dict[str, List[schemas.DailyPlanItem]]) -> Dict[str, int]:
    return {k: len(v or []) for k, v in sections.items()}

# ---- light graph context for LLM (tags/themes only; sanitized) --------------

def _graph_theme_context(db) -> Dict[str, Any]:
    """
    Build a privacy-safe, compact theme context for the LLM:
    - top tags across tasks & projects
    - counts of blocked tasks / high-priority / due-today/soon
    """
    tasks = (
        db.query(models.Task)
        .options(joinedload(models.Task.tags))
        .all()
    )

    tag_counter = Counter()
    blocked = 0
    high = 0
    due_today = 0
    due_soon = 0
    today = date.today()
    horizon = today + timedelta(days=3)

    for t in tasks:
        for tg in (getattr(t, "tags", []) or []):
            if tg and getattr(tg, "name", None):
                tag_counter[tg.name] += 1
        s = (getattr(t, "status", "") or "").lower()
        if s == "blocked":
            blocked += 1
        if (getattr(t, "priority", "") or "").lower() == "high":
            high += 1
        due = getattr(t, "end", None)
        if due:
            if due <= today:
                due_today += 1
            elif today < due <= horizon:
                due_soon += 1

    top_tags = [{"tag": k, "count": c} for k, c in tag_counter.most_common(12)]
    return {
        "topTags": top_tags,
        "signals": {
            "blockedTasks": blocked,
            "highPriority": high,
            "dueToday": due_today,
            "dueSoon": due_soon,
        },
    }

# ---- LLM suggestions (uses themes) ------------------------------------------

def _suggestions_with_llm(raw_items_for_llm: List[Dict[str, Any]],
                          theme_ctx: Dict[str, Any],
                          model_name: str = "gpt-4o") -> List[schemas.DailyPlanItem]:
    """
    Ask the LLM to propose up to 6 suggested actions (non-duplicate) based on the landscape + themes.
    Returns DailyPlanItem(kind='suggestion'), advice will be put in 'reason' field.
    """
    prompt = f"""
You are a PMO assistant. Based on the task landscape and themes (JSON below), suggest up to 6 high-leverage actions for today.
Return ONLY a compact JSON array with items of the shape:
{{
  "title": "string",
  "reason": "string",
  "tags": ["string", ...]
}}

Guidance:
- Prefer follow-ups that unblock others, quick wins under 30–60 min, or prep for tomorrow's deadlines.
- DO NOT repeat existing tasks/titles verbatim.
- Keep concise. No personal data.

THEMES:
{json.dumps(theme_ctx, ensure_ascii=False)}

TASK LANDSCAPE (subset):
{json.dumps(raw_items_for_llm[:150], ensure_ascii=False)}
""".strip()

    messages = [{"role": "user", "content": [{"type": "text", "text": prompt}]}]
    try:
        resp = call_llm(model_name=model_name,
                        messages=messages,
                        prompt_type="daily.plan.suggest",
                        meta={"items": len(raw_items_for_llm)},
                        redact_for_log=True)
        text = extract_llm_text(resp)
        # robust JSON array parsing
        start = text.find("["); end = text.rfind("]")
        arr = json.loads(text[start:end+1]) if (start != -1 and end != -1 and end > start) else []
    except Exception:
        arr = []

    out: List[schemas.DailyPlanItem] = []
    for s in arr[:6]:
        title = (s.get("title") or "").strip()
        if not title:
            continue
        out.append(
            schemas.DailyPlanItem(
                id=f"sugg-{uuid4().hex[:8]}",
                kind="suggestion",
                title=title,
                desc=None,                    # UI shows concise advice; store in reason
                priority="medium",
                urgency="today",
                reason=(s.get("reason") or None),
                effort=None,
                dueDate=None,
                taskId=None,
                projectId=None,
                projectName=None,
                assignees=[],
                blockedBy=[],
                isContinuous=None,
                tags=[t for t in (s.get("tags") or []) if isinstance(t, str)][:6],
            )
        )
    return out

# ---- LLM advice per item -----------------------------------------------------

def _derive_advice(it: schemas.DailyPlanItem) -> str:
    """Fallback: 2–3 short sentences from urgency/priority/reason."""
    bits = []
    urg = (it.urgency or "").lower()
    pr  = (it.priority or "").lower()
    if urg == "today":
        bits.append("Do this today to avoid slippage.")
    elif urg == "soon":
        bits.append("Schedule this within the look-ahead window.")
    else:
        bits.append("Keep this visible behind today's priorities.")
    if pr == "high":
        bits.append("Treat as top priority before medium/low items.")
    elif pr == "low":
        bits.append("Time-box as a quick win.")
    if it.reason:
        r = it.reason.strip()
        if r and not r.endswith("."):
            r += "."
        bits.append(r)
    out = " ".join(bits).strip()
    # clamp to ~2–3 sentences
    return ". ".join([s.strip() for s in out.split(".") if s.strip()][:3]).rstrip(".") + "."

def _ai_advise_on_items(items: List[schemas.DailyPlanItem],
                        theme_ctx: Dict[str, Any],
                        model_name: str = "gpt-4o") -> Dict[str, str]:
    """
    Ask the LLM to write 2–3 sentence, actionable advice per item.
    Returns { item.id: "advice ..." }.
    Advice is PLAIN TEXT, no PII, no names, concise.
    """
    # compact, privacy-safe payload
    payload = [
        {
            "id": it.id,
            "title": it.title,
            "priority": it.priority,
            "urgency": it.urgency,
            "reason": it.reason,
            "isContinuous": bool(it.isContinuous) if it.isContinuous is not None else False,
            "blocked": bool(it.blockedBy and len(it.blockedBy) > 0),
            "project": it.projectName,
            "tags": it.tags or [],
        }
        for it in items
    ]

    prompt = f"""
You are a PMO assistant. For each item below, write a brief, **2–3 sentence** advice that is specific and action-oriented.
Rules:
- No personal data or names; refer to roles/tasks generically.
- Keep concise; no bullets, no markdown.
- If blocked, first sentence should say what to unblock or who to contact (role only).
- If due today/soon, include a concrete next action.

Return ONLY a JSON object mapping id → advice string.

THEMES:
{json.dumps(theme_ctx, ensure_ascii=False)}

ITEMS:
{json.dumps(payload[:40], ensure_ascii=False)}
""".strip()

    messages = [{"role": "user", "content": [{"type": "text", "text": prompt}]}]
    try:
        resp = call_llm(model_name=model_name,
                        messages=messages,
                        prompt_type="daily.plan.advice",
                        meta={"items": len(payload)},
                        redact_for_log=True)
        text = extract_llm_text(resp)
        # robust object parsing
        start = text.find("{"); end = text.rfind("}")
        obj = json.loads(text[start:end+1]) if (start != -1 and end != -1 and end > start) else {}
        # stringify all values, clamp length
        out = {}
        for k, v in (obj or {}).items():
            s = str(v or "").strip()
            if s:
                out[k] = s[:500]
        return out
    except Exception:
        return {}

# ---- main entry --------------------------------------------------------------

def generate_daily_plan(db, req: schemas.DailyPlanRequest) -> schemas.DailyPlanResponse:
    """
    Build a daily plan across all projects & tasks using heuristics + LLM:
    - score tasks (priority/urgency/status),
    - bucket into sections,
    - add 2–3 sentence advice per surfaced item (stored in `desc`),
    - add AI suggestions using task landscape and graph themes.
    """
    # 1) window + fetch
    target_str = (req.date or date.today().isoformat())
    try:
        today = date.fromisoformat(target_str)
    except Exception:
        today = date.today()
    window_days      = int(req.windowDays or 3)
    horizon          = today + timedelta(days=window_days)
    max_items        = int(req.maxItems or 40)
    include_suggests = bool(req.includeSuggestions)

    tasks = (
        db.query(models.Task)
        .options(
            joinedload(models.Task.project),
            joinedload(models.Task.task_assignees).joinedload(models.TaskAssignee.person),
            joinedload(models.Task.tags),
        )
        .all()
    )

    # 2) normalize + score + filter out completed/canceled
    normalized: List[Tuple[int, schemas.DailyPlanItem, Any]] = []
    for t in tasks:
        st = (getattr(t, "status", "") or "").lower()
        if st in ("complete", "completed", "canceled"):
            continue
        item = _to_daily_plan_item(t, today, horizon)
        normalized.append((_score_task(t, today, horizon), item, t))

    # 3) group into sections
    sections: Dict[str, List[schemas.DailyPlanItem]] = {
        "Do Now":       [],
        "Due Soon":     [],
        "Follow-Ups":   [],
        "Continuous":   [],
        "Backlog":      [],
    }

    # Sort by score desc for deterministic cutoffs
    normalized.sort(key=lambda x: x[0], reverse=True)

    for _, item, t in normalized:
        s = (getattr(t, "status", "") or "").lower()
        if s == "blocked" or (item.blockedBy and len(item.blockedBy) > 0):
            sections["Follow-Ups"].append(item)
            continue

        if item.isContinuous:
            sections["Continuous"].append(item)
            continue

        if item.urgency == "today":
            sections["Do Now"].append(item)
        elif item.urgency == "soon":
            sections["Due Soon"].append(item)
        else:
            sections["Backlog"].append(item)

    # 4) optional AI suggestions (landscape + themes)
    theme_ctx = _graph_theme_context(db)
    if include_suggests:
        raw_items_for_llm = [
            {
                "title": x.title,
                "priority": x.priority,
                "urgency": x.urgency,
                "reason": x.reason,
                "project": x.projectName,
                "tags": x.tags,
            }
            for _, x, _ in normalized[:250]
        ]
        suggestions = _suggestions_with_llm(raw_items_for_llm, theme_ctx)
        if suggestions:
            sections["Suggestions"] = suggestions

    # 5) apply cap
    sections = _cap_sections(sections, max_items=max(1, max_items))

    # 6) AI advice for surfaced items (we write into `desc`)
    #    target a reasonable subset to control cost
    advice_targets: List[schemas.DailyPlanItem] = []
    advice_targets += sections.get("Do Now", [])[:12]
    advice_targets += sections.get("Due Soon", [])[:8]
    advice_targets += sections.get("Follow-Ups", [])[:6]
    # unique by id while preserving order
    seen = set(); advice_targets = [x for x in advice_targets if not (x.id in seen or seen.add(x.id))]

    id2advice = _ai_advise_on_items(advice_targets, theme_ctx)

    for bucket in sections.values():
        for it in bucket:
            adv = id2advice.get(it.id)
            if adv:
                it.desc = adv  # store advice in desc to avoid schema changes
            else:
                it.desc = _derive_advice(it)

    counts = _counts(sections)

    return schemas.DailyPlanResponse(
        date=today.isoformat(),
        generatedAt=datetime.utcnow().isoformat() + "Z",
        sections=sections,
        counts=counts,
    )
