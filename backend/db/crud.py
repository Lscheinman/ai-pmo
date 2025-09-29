from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import select, delete
from typing import Dict, Any, Optional, List, Union, Iterable, Tuple, Set
from rapidfuzz import fuzz
from db import models, schemas
from setup.utils import MODEL_MAP
import uuid
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException, status
import re


VALID_STATUS = {"not started", "started", "blocked", "complete"}

ALLOWED_REL_TYPES = {"manages", "mentor", "peer", "co_located"}
_RACI_NAME = {
    "R": "Responsible",
    "A": "Accountable",
    "C": "Consulted",
    "I": "Informed",
}
_RACI_INITIAL = {"Responsible":"R","Accountable":"A","Consulted":"C","Informed":"I"}

# Graph schema descriptor (shared by full network + subgraph)
GRAPH_SCHEMA = {
    "nodes": ["person", "project", "task", "group"],
    "edges": [
        {"type": "MANAGES",        "from": "person",  "to": "person"},
        {"type": "MENTOR",         "from": "person",  "to": "person"},
        {"type": "PEER",           "from": "person",  "to": "person"},
        {"type": "CO_LOCATED",     "from": "person",  "to": "person"},
        {"type": "RACI:R",         "from": "person",  "to": "project"},
        {"type": "RACI:A",         "from": "person",  "to": "project"},
        {"type": "RACI:C",         "from": "person",  "to": "project"},
        {"type": "RACI:I",         "from": "person",  "to": "project"},
        {"type": "PART_OF",        "from": "task",    "to": "project"},
        {"type": "ASSIGNEE:R",     "from": "person",  "to": "task"},
        {"type": "ASSIGNEE:A",     "from": "person",  "to": "task"},
        {"type": "ASSIGNEE:C",     "from": "person",  "to": "task"},
        {"type": "ASSIGNEE:I",     "from": "person",  "to": "task"},
        {"type": "MEMBER_OF",      "from": "person",  "to": "group"},
        {"type": "IN_GROUP",       "from": "project", "to": "group"},
        {"type": "COLLAB:TASK",    "from": "person",  "to": "person"},
        {"type": "COLLAB:PROJECT", "from": "person",  "to": "person"},
    ],
}


def _normalize_raci(role: str) -> str:
    if not role:
        return "Informed"
    r = str(role).strip()
    up = r.upper()
    if up in _RACI_NAME:
        return _RACI_NAME[up]
    # allow full words in any case
    title = r.capitalize()
    return _RACI_NAME.get(title[:1].upper(), title)

# --- Bulk assign people to a PROJECT as ProjectLead --------------------
def add_people_to_project_with_role(db: Session, project_id: int, person_ids: list[int], role: str) -> list[models.ProjectLead]:
    role_name = _normalize_raci(role)
    if not person_ids:
        return []

    # fetch existing rows for this project/person set
    existing = (
        db.query(models.ProjectLead)
        .filter(models.ProjectLead.project_id == project_id,
                models.ProjectLead.person_id.in_(person_ids))
        .all()
    )
    by_person = {pl.person_id: pl for pl in existing}

    # ensure persons exist (skip missing)
    people = db.query(models.Person).filter(models.Person.id.in_(person_ids)).all()
    kept_ids = {p.id for p in people}

    out = []
    for pid in kept_ids:
        row = by_person.get(pid)
        if row:
            # update role if changed
            if (row.role or "").strip() != role_name:
                row.role = role_name
                db.add(row)
            out.append(row)
        else:
            pl = models.ProjectLead(project_id=project_id, person_id=pid, role=role_name)
            db.add(pl)
            out.append(pl)

    db.commit()
    # refresh for IDs
    for r in out:
        db.refresh(r)
    return out


def _task_with_relations_q(db):
    return (
        db.query(models.Task)
        .options(
            selectinload(models.Task.tags),
            selectinload(models.Task.task_assignees),
            selectinload(models.Task.checklist_items),
        )
    )



# --- Bulk assign people to a TASK as TaskAssignee -----------------------
def add_people_to_task_with_role(db: Session, task_id: int, person_ids: list[int], role: str) -> list[models.TaskAssignee]:
    role_name = _normalize_raci(role)
    if not person_ids:
        return []

    existing = (
        db.query(models.TaskAssignee)
        .filter(models.TaskAssignee.task_id == task_id,
                models.TaskAssignee.person_id.in_(person_ids))
        .all()
    )
    by_person = {ta.person_id: ta for ta in existing}

    people = db.query(models.Person).filter(models.Person.id.in_(person_ids)).all()
    kept_ids = {p.id for p in people}

    out = []
    for pid in kept_ids:
        row = by_person.get(pid)
        if row:
            if (row.role or "").strip() != role_name:
                row.role = role_name
                db.add(row)
            out.append(row)
        else:
            ta = models.TaskAssignee(task_id=task_id, person_id=pid, role=role_name)
            db.add(ta)
            out.append(ta)

    db.commit()
    for r in out:
        db.refresh(r)
    return out

def _new_id() -> str:
    return uuid.uuid4().hex[:24]

# GRAPH NETWORK

def nid(kind, _id):  # helper
    return f"{kind}_{_id}"

def get_graph_network(db: Session) -> Dict[str, Any]:
    """
    Build the full graph. Guarantees:
      - All nodes are emitted before edges.
      - Every edge's endpoints exist in the node set (dangling edges dropped).
      - Shape matches GRAPH_SCHEMA + { graph: { nodes:[{data}], edges:[{data}] } }.
    """
    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []

    seen_nodes: Set[Tuple[str, int]] = set()       # (kind, id)
    node_ids: Set[str] = set()                     # "person_1", ...
    seen_edges: Set[Tuple[str, str, str]] = set()  # (src, dst, type)

    def add_node(kind: str, row) -> None:
        key = (kind, int(row.id))
        if key in seen_nodes:
            return
        seen_nodes.add(key)

        nid_str = _nid(kind, int(row.id))
        node_ids.add(nid_str)

        if kind == "person":
            nodes.append({"data": {
                "id": nid_str, "type": "person",
                "label": row.name, "email": row.email
            }})
        elif kind == "project":
            nodes.append({"data": {
                "id": nid_str, "type": "project",
                "label": row.name, "status": row.status,
                "detail": {"description": row.description}
            }})
        elif kind == "task":
            nodes.append({"data": {
                "id": nid_str, "type": "task",
                "label": row.name, "status": row.status,
                "detail": {"description": row.description}
            }})
        elif kind == "group":
            nodes.append({"data": {
                "id": nid_str, "type": "group",
                "label": row.name
            }})
        else:
            # ignore unknown kinds for now
            pass

    def add_edge(src: str, dst: str, etype: str, **meta) -> None:
        # Only emit edges whose endpoints exist
        if src not in node_ids or dst not in node_ids:
            return
        k = (src, dst, etype)
        if k in seen_edges:
            return
        seen_edges.add(k)
        payload = {"source": src, "target": dst, "type": etype}
        if meta:
            payload.update(meta)
        edges.append({"data": payload})

    # -------- Load core entities (minimal queries) -------------------------
    people   = db.query(models.Person).all()
    projects = db.query(models.Project).all()
    tasks    = db.query(models.Task).options(selectinload(models.Task.task_assignees)).all()
    groups   = db.query(models.Group).all()

    # Existence sets for defensive checks
    have_person  = {p.id for p in people}
    have_project = {pr.id for pr in projects}
    have_task    = {t.id for t in tasks}
    have_group   = {g.id for g in groups}

    # Emit nodes first (so edges can safely attach)
    for p in people:   add_node("person", p)
    for pr in projects: add_node("project", pr)
    for t in tasks:     add_node("task", t)
    for g in groups:    add_node("group", g)

    # -------- Relations: Person ↔ Person (explicit) -----------------------
    rels = db.query(models.PersonRelation).all()
    for r in rels:
        if r.from_person_id in have_person and r.to_person_id in have_person:
            add_edge(
                _nid("person", r.from_person_id),
                _nid("person", r.to_person_id),
                (r.type or "REL").upper()
            )

    # -------- Project leads: Person → Project (RACI) ----------------------
    leads = db.query(models.ProjectLead).all()
    for pl in leads:
        if pl.person_id in have_person and pl.project_id in have_project:
            etype = f"RACI:{_RACI_INITIAL.get(pl.role, (pl.role or 'R')[:1]).upper()}"
            add_edge(_nid("person", pl.person_id), _nid("project", pl.project_id), etype)

    # -------- Tasks: Task → Project (PART_OF) + Person → Task (ASSIGNEE) ---
    for t in tasks:
        if t.project_id and t.project_id in have_project:
            add_edge(_nid("task", t.id), _nid("project", t.project_id), "PART_OF")

        for ta in (t.task_assignees or []):
            if ta.person_id in have_person:
                etype = f"ASSIGNEE:{_RACI_INITIAL.get(ta.role, (ta.role or 'R')[:1]).upper()}"
                add_edge(_nid("person", ta.person_id), _nid("task", t.id), etype)

    # -------- Memberships: Person → Group (MEMBER_OF) ---------------------
    pg_rows = db.execute(
        select(models.person_group_table.c.person_id, models.person_group_table.c.group_id)
    ).all()
    for pid, gid in pg_rows:
        if pid in have_person and gid in have_group:
            add_edge(_nid("person", pid), _nid("group", gid), "MEMBER_OF")

    # -------- Project grouping: Project → Group (IN_GROUP) -----------------
    proj_group_rows = db.execute(
        select(models.project_group.c.project_id, models.project_group.c.group_id)
    ).all()
    for prid, gid in proj_group_rows:
        if prid in have_project and gid in have_group:
            add_edge(_nid("project", prid), _nid("group", gid), "IN_GROUP")

    # -------- Derived collaboration edges (optional; endpoints checked) ----
    # Task-based: co-assignees on same task ⇒ person ↔ person (COLLAB:TASK)
    from collections import defaultdict
    task_to_people: Dict[int, List[int]] = defaultdict(list)
    for t in tasks:
        for ta in (t.task_assignees or []):
            if ta.person_id in have_person:
                task_to_people[t.id].append(ta.person_id)

    for _, pid_list in task_to_people.items():
        uniq = sorted(set(pid_list))
        for i in range(len(uniq)):
            for j in range(i + 1, len(uniq)):
                a, b = uniq[i], uniq[j]
                add_edge(_nid("person", a), _nid("person", b), "COLLAB:TASK")
                add_edge(_nid("person", b), _nid("person", a), "COLLAB:TASK")

    # Project-based: co-leads on same project ⇒ person ↔ person (COLLAB:PROJECT)
    proj_to_leads: Dict[int, List[int]] = defaultdict(list)
    for pl in leads:
        if pl.person_id in have_person and pl.project_id in have_project:
            proj_to_leads[pl.project_id].append(pl.person_id)

    for _, pid_list in proj_to_leads.items():
        uniq = sorted(set(pid_list))
        for i in range(len(uniq)):
            for j in range(i + 1, len(uniq)):
                a, b = uniq[i], uniq[j]
                add_edge(_nid("person", a), _nid("person", b), "COLLAB:PROJECT")
                add_edge(_nid("person", b), _nid("person", a), "COLLAB:PROJECT")

    # -------- Return in the canonical shape --------------------------------
    return {"schema": GRAPH_SCHEMA, "graph": {"nodes": nodes, "edges": edges}}

# --- Project CRUD ---
def get_project(db, project_id: int):
    return (
        db.query(models.Project)
        .options(
            # project-level
            selectinload(models.Project.tags),
            selectinload(models.Project.project_leads),
            selectinload(models.Project.groups),

            # task-level (nest the options under Project.tasks)
            selectinload(models.Project.tasks).options(
                selectinload(models.Task.tags),
                selectinload(models.Task.task_assignees),
                selectinload(models.Task.checklist_items),
            ),
        )
        .filter(models.Project.id == project_id)
        .first()
    )

def get_projects(db):
    return (
        db.query(models.Project)
        .options(
            selectinload(models.Project.tags),
            selectinload(models.Project.project_leads),
            selectinload(models.Project.groups),
            selectinload(models.Project.tasks).options(
                selectinload(models.Task.tags),
                selectinload(models.Task.task_assignees),
                selectinload(models.Task.checklist_items),
            ),
        )
        .all()
    )

# --- helper: only scalar columns for Project ---
def _project_scalars_from_schema(p) -> dict:
    # Works with Pydantic model or plain dict
    get = (lambda k, d=None: getattr(p, k, d)) if hasattr(p, "__dict__") else (lambda k, d=None: p.get(k, d))
    return {
        "name":        get("name"),
        "description": get("description"),
        "start_date":  get("start_date"),
        "end_date":    get("end_date"),
        "status":      get("status") or "Planned",
    }

def create_project(db: Session, project: schemas.ProjectCreate):
    # 1) insert only scalar columns
    data = _project_scalars_from_schema(project)
    db_project = models.Project(**data)
    db.add(db_project)
    db.flush()  # get id before attaching relationships

    # 2) attach tags if provided (prefer tag_ids)
    tag_ids = getattr(project, "tag_ids", None)
    if tag_ids:
        tags = db.query(models.Tag).filter(models.Tag.id.in_(tag_ids)).all()
        db_project.tags = tags

    # 3) attach leads (association object with role)
    leads = getattr(project, "project_leads", []) or []
    for lead in leads:
        # allow dict or pydantic submodel
        if isinstance(lead, dict):
            pid = lead.get("person_id")
            role = lead.get("role") or "Responsible"
        else:
            pid = getattr(lead, "person_id", None)
            role = getattr(lead, "role", None) or "Responsible"
        if pid:
            db_project.project_leads.append(
                models.ProjectLead(project_id=db_project.id, person_id=pid, role=role)
            )

    db.commit()
    db.refresh(db_project)
    return db_project

def update_project(db: Session, project_id: int, project: schemas.ProjectCreate):
    db_project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not db_project:
        return None

    # 1) update scalar columns only
    data = _project_scalars_from_schema(project)
    for k, v in data.items():
        setattr(db_project, k, v)

    # 2) reset and re-attach leads (association objects)
    db.query(models.ProjectLead).filter(models.ProjectLead.project_id == project_id).delete()
    db.flush()
    leads = getattr(project, "project_leads", []) or []
    for lead in leads:
        if isinstance(lead, dict):
            pid = lead.get("person_id")
            role = lead.get("role") or "Responsible"
        else:
            pid = getattr(lead, "person_id", None)
            role = getattr(lead, "role", None) or "Responsible"
        if pid:
            db.add(models.ProjectLead(project_id=project_id, person_id=pid, role=role))

    # 3) replace tags if tag_ids provided
    if getattr(project, "tag_ids", None) is not None:
        tag_ids = project.tag_ids or []
        tags = db.query(models.Tag).filter(models.Tag.id.in_(tag_ids) if tag_ids else False).all() if tag_ids else []
        db_project.tags = tags

    db.commit()
    db.refresh(db_project)
    return db_project

def delete_project(db: Session, project_id: int):
    db_project = get_project(db, project_id)
    db.delete(db_project)
    db.commit()

# --- Task CRUD ---
def get_tasks(db: Session, project_id: int = None):
    q = (
        db.query(models.Task)
        .options(
            selectinload(models.Task.tags),
            selectinload(models.Task.task_assignees),
            selectinload(models.Task.checklist_items),  
        )
    )
    if project_id is not None:
        q = q.filter(models.Task.project_id == project_id)
    return q.all()

def get_task(db: Session, task_id: int):
    return (
        db.query(models.Task)
        .options(
            selectinload(models.Task.tags),
            selectinload(models.Task.task_assignees),
            selectinload(models.Task.checklist_items), 
        )
        .get(task_id)
    )

def create_task(db: Session, task: schemas.TaskCreate):
    is_cont = bool(getattr(task, "is_continuous", False))
    unit    = _norm_unit(getattr(task, "recurrence_unit", None)) or ("week" if is_cont else None)
    interval = max(1, int(getattr(task, "recurrence_interval", 1) or 1)) if is_cont else 1

    db_task = models.Task(
        name=task.name,
        description=task.description,
        type=task.type,
        start=task.start,
        end=task.end,
        project_id=task.project_id,
        priority=getattr(task, "priority", "medium"),
        status=getattr(task, "status", "not started"),
        is_continuous=is_cont,
        recurrence_unit=unit if is_cont else None,
        recurrence_interval=interval,
    )
    db.add(db_task)
    db.flush()  # get id

    # Assignees
    if getattr(task, "task_assignees", None):
        db_task.task_assignees = []
        seen = set()
        for ap in task.task_assignees:
            pid = ap["person_id"] if isinstance(ap, dict) else ap.person_id
            if pid in seen:  # defend against duplicate pids in payload
                continue
            seen.add(pid)
            role = (ap["role"] if isinstance(ap, dict) else ap.role) or "Responsible"
            db_task.task_assignees.append(models.TaskAssignee(task_id=db_task.id, person_id=pid, role=role))

    # Tags
    if getattr(task, "tag_ids", None):
        tags = db.query(models.Tag).filter(models.Tag.id.in_(task.tag_ids)).all()
        db_task.tags = tags

    # Checklist: normalize unique, increasing order
    if getattr(task, "checklist", None):
        items = []
        for i, item in enumerate(task.checklist):
            title = item["title"] if isinstance(item, dict) else item.title
            if not str(title or "").strip():
                continue
            status = (item.get("status") if isinstance(item, dict) else getattr(item, "status", "not started")) or "not started"
            # if client supplied a valid integer order, keep it, else use i
            raw = item.get("order") if isinstance(item, dict) else getattr(item, "order", None)
            order = int(raw) if (raw is not None and str(raw).isdigit()) else i
            items.append(models.TaskChecklistItem(title=title, status=status, order=order))
        # reindex to 0..n-1 to guarantee uniqueness and compactness
        items = [models.TaskChecklistItem(title=c.title, status=c.status, order=i) for i, c in enumerate(sorted(items, key=lambda x: x.order))]
        db_task.checklist_items = items

    db.commit()
    # Return fully loaded task so API response includes relations reliably
    return _task_with_relations_q(db).get(db_task.id)

def update_task(db: Session, task_id: int, task: schemas.TaskCreate):
    db_task = db.query(models.Task).filter(models.Task.id == task_id).first()
    if not db_task:
        return None

    # scalars ... (unchanged)

    # Assignees (unchanged logic; already deduped and safe)
    assignees = getattr(task, "task_assignees", None)
    if assignees is not None:
        db.execute(delete(models.TaskAssignee).where(models.TaskAssignee.task_id == db_task.id))
        db.flush()
        desired: dict[int, str] = {}
        for ap in assignees:
            pid = ap["person_id"] if isinstance(ap, dict) else ap.person_id
            if pid is None:
                continue
            role = (ap["role"] if isinstance(ap, dict) else ap.role) or "Responsible"
            desired[int(pid)] = role
        for pid, role in desired.items():
            db.add(models.TaskAssignee(task_id=db_task.id, person_id=pid, role=role))

    # Tags (unchanged)
    if task.tag_ids is not None:
        tags = db.query(models.Tag).filter(models.Tag.id.in_(task.tag_ids or [0])).all()
        db_task.tags = tags

    # Checklist: replace with normalized, unique order
    if task.checklist is not None:
        db.query(models.TaskChecklistItem).filter(
            models.TaskChecklistItem.task_id == db_task.id
        ).delete(synchronize_session=False)
        db.flush()

        temp = []
        for i, item in enumerate(task.checklist):
            title = item["title"] if isinstance(item, dict) else item.title
            if not str(title or "").strip():
                continue
            status = (item.get("status") if isinstance(item, dict) else getattr(item, "status", "not started")) or "not started"
            raw = item.get("order") if isinstance(item, dict) else getattr(item, "order", None)
            order = int(raw) if (raw is not None and str(raw).isdigit()) else i
            temp.append((order, title, status))

        temp.sort(key=lambda x: x[0])
        next_items = [models.TaskChecklistItem(task_id=db_task.id, title=ti[1], status=ti[2], order=i)
                      for i, ti in enumerate(temp)]
        db_task.checklist_items = next_items

    db.commit()
    return _task_with_relations_q(db).get(db_task.id)

def delete_task(db: Session, task_id: int) -> bool:
    """
    Delete a task and its dependents. Returns True if a row was deleted, False otherwise.
    """
    # If you don't have ON DELETE CASCADE, clear dependents explicitly:
    db.query(models.TaskAssignee).filter(models.TaskAssignee.task_id == task_id)\
      .delete(synchronize_session=False)
    db.query(models.TaskChecklistItem).filter(models.TaskChecklistItem.task_id == task_id)\
      .delete(synchronize_session=False)

    deleted = db.query(models.Task)\
        .filter(models.Task.id == task_id)\
        .delete(synchronize_session=False)

    db.commit()
    return deleted > 0


# --- Person CRUD ---

def create_person(db: Session, person: schemas.PersonCreate):
    email_norm = (person.email or "").strip().lower()
    if not email_norm:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Email is required")

    # Fast pre-check (still keep DB guard below)
    exists = db.scalar(select(models.Person.id).where(models.Person.email == email_norm))
    if exists:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="A person with this email already exists")

    db_person = models.Person(
        name=person.name,
        email=email_norm,
        notes=person.notes
    )

    if person.tag_ids:
        tags = db.query(models.Tag).filter(models.Tag.id.in_(person.tag_ids)).all()
        db_person.tags = tags

    db.add(db_person)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        # Handles race conditions / unique constraint violations
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="A person with this email already exists")
    db.refresh(db_person)
    return db_person

def get_people(db: Session):
    return db.query(models.Person).all()

def get_person(db: Session, person_id: int):
    return db.query(models.Person).filter(models.Person.id == person_id).first()

def update_person(db: Session, person_id: int, person_update: schemas.PersonUpdate):
    db_person = db.query(models.Person).filter(models.Person.id == person_id).first()
    if not db_person:
        return None

    # Update simple fields only if provided
    if person_update.name is not None:
        db_person.name = person_update.name
    if person_update.email is not None:
        db_person.email = person_update.email
    if person_update.notes is not None:
        db_person.notes = person_update.notes

    # Handle tags if provided
    if person_update.tag_ids is not None:
        tags = db.query(models.Tag).filter(models.Tag.id.in_(person_update.tag_ids)).all()
        db_person.tags = tags

    db.commit()
    db.refresh(db_person)
    return db_person

def delete_person(db: Session, person_id: int):
    # Proactively delete associations that might dangle
    db.query(models.PersonRelation).filter(
        (models.PersonRelation.from_person_id == person_id) |
        (models.PersonRelation.to_person_id   == person_id)
    ).delete(synchronize_session=False)

    db.query(models.TaskAssignee).filter(models.TaskAssignee.person_id == person_id)\
      .delete(synchronize_session=False)

    db.query(models.ProjectLead).filter(models.ProjectLead.person_id == person_id)\
      .delete(synchronize_session=False)

    # person_group is a raw table
    db.execute(
        delete(models.person_group_table).where(models.person_group_table.c.person_id == person_id)
    )

    # TagAssignment, if you store tags generically by object_type/object_id
    db.query(models.TagAssignment).filter(
        (models.TagAssignment.object_type == "Person") &
        (models.TagAssignment.object_id == person_id)
    ).delete(synchronize_session=False)

    # Finally remove the person
    db_person = db.query(models.Person).filter(models.Person.id == person_id).first()
    if db_person:
        db.delete(db_person)
    db.commit()


# --- Group CRUD ---

def create_group(db: Session, group: schemas.GroupCreate):
    # Scalars
    name = getattr(group, "name", None)
    if name is None and isinstance(group, dict):
        name = group.get("name", "")
    parent_id = getattr(group, "parent_id", None)
    if parent_id is None and isinstance(group, dict):
        parent_id = group.get("parent_id")

    db_group = models.Group(name=name or "", parent_id=parent_id)

    # Members: accept member_ids OR person_ids
    member_ids = getattr(group, "member_ids", None)
    if member_ids is None and isinstance(group, dict):
        member_ids = group.get("member_ids", None)
    if member_ids is None:
        member_ids = getattr(group, "person_ids", None)
        if member_ids is None and isinstance(group, dict):
            member_ids = group.get("person_ids", None)

    if member_ids is not None:
        ids = [int(x) for x in (member_ids or [])]
        people = db.query(models.Person).filter(models.Person.id.in_(ids)).all() if ids else []
        db_group.members = people

    db.add(db_group)
    db.commit()
    db.refresh(db_group)
    return db_group



def get_groups(db: Session):
    return db.query(models.Group).options(joinedload(models.Group.members)).all()

def update_group(db: Session, group_id: int, group: schemas.GroupCreate):
    db_group = db.query(models.Group).get(group_id)
    if not db_group:
        return None

    # --- Scalars ---
    # Works for Pydantic model or dict payloads
    name = getattr(group, "name", None)
    if name is None and isinstance(group, dict):
        name = group.get("name")
    if name is not None:
        db_group.name = name

    parent_id = getattr(group, "parent_id", None)
    if parent_id is None and isinstance(group, dict):
        parent_id = group.get("parent_id")
    # Allow explicit clearing to None
    if (hasattr(group, "parent_id") or (isinstance(group, dict) and "parent_id" in group)):
        db_group.parent_id = parent_id

    # --- Members: accept member_ids OR person_ids ---
    member_ids = getattr(group, "member_ids", None)
    if member_ids is None and isinstance(group, dict):
        member_ids = group.get("member_ids", None)

    if member_ids is None:
        member_ids = getattr(group, "person_ids", None)
        if member_ids is None and isinstance(group, dict):
            member_ids = group.get("person_ids", None)

    # Only touch membership if caller provided one of the fields
    if member_ids is not None:
        ids = [int(x) for x in (member_ids or [])]
        people = db.query(models.Person).filter(models.Person.id.in_(ids)).all() if ids else []
        db_group.members = people  # empty list clears membership

    db.commit()
    db.refresh(db_group)
    return db_group


def delete_group(db: Session, group_id: int):
    db_group = db.query(models.Group).get(group_id)
    if db_group:
        db.delete(db_group)
        db.commit()

def add_person_to_group(db: Session, group_id: int, person_id: int):
    group = db.query(models.Group).get(group_id)
    person = db.query(models.Person).get(person_id)
    if group and person and person not in group.members:
        group.members.append(person)
        db.commit()
        db.refresh(group)
    return group

def remove_person_from_group(db: Session, group_id: int, person_id: int):
    group = db.query(models.Group).get(group_id)
    person = db.query(models.Person).get(person_id)
    if group and person and person in group.members:
        group.members.remove(person)
        db.commit()
        db.refresh(group)
    return group

# --- Tag CRUD ---
def create_tag(db: Session, tag: schemas.TagCreate):
    normalized_name = normalize_tag_name(tag.name)

    # Check for exact match first
    existing = db.query(models.Tag).filter(models.Tag.name == normalized_name).first()
    if existing:
        return existing

    # Fuzzy match check (97%+ match)
    tags = db.query(models.Tag).all()
    for t in tags:
        if fuzz.ratio(t.name.lower(), normalized_name.lower()) >= 97:
            return t  # Return the existing near-match instead of creating a new one

    # Create new tag
    db_tag = models.Tag(name=normalized_name)
    db.add(db_tag)
    db.commit()
    db.refresh(db_tag)
    return db_tag

def get_tags(db: Session):
    return db.query(models.Tag).order_by(models.Tag.name.asc()).all()

def normalize_tag_name(name: str) -> str:
    """Normalize and capitalize a tag name consistently."""
    name = name.strip().lower()
    # Capitalize first letter of each word
    return " ".join(word.capitalize() for word in name.split())

def attach_tags(db: Session, object_type: str, object_id: int, tag_ids: list[int]):
    for tid in tag_ids:
        exists = db.query(models.TagAssignment).filter_by(
            tag_id=tid,
            object_id=object_id,
            object_type=object_type
        ).first()
        if not exists:
            db.add(models.TagAssignment(tag_id=tid, object_id=object_id, object_type=object_type))
    db.commit()

def get_tags_for_object(db: Session, object_type: str, object_id: int):
    return (
        db.query(models.Tag)
        .join(models.TagAssignment)
        .filter(
            models.TagAssignment.object_type == object_type,
            models.TagAssignment.object_id == object_id
        )
        .all()
    )

def set_tags_for_object(db: Session, object_type: str, object_id: int, tag_ids: list[int]):
    object_type = object_type.lower()

    # Map the object_type string to the ORM model
    model = MODEL_MAP.get(object_type)
    if not model:
        raise ValueError(f"Unsupported object_type: {object_type}")

    # Get the object
    obj = db.query(model).get(object_id)
    if not obj:
        raise ValueError(f"{object_type.capitalize()} {object_id} not found")

    # Clear existing tags
    obj.tags = []

    # Attach new tags
    for tid in tag_ids:
        tag = db.query(models.Tag).get(tid) 
        if tag:
            obj.tags.append(tag)

    db.commit()
    db.refresh(obj)
    return obj.tags

def search_tags(db: Session, q: str):
    if not q:
        return []
    return (
        db.query(models.Tag)
        .filter(models.Tag.name.ilike(f"%{q}%"))
        .order_by(models.Tag.name.asc())
        .limit(20)
        .all()
    )

# --- AI CRUD ---
def create_ai_recommendation(db: Session, payload: schemas.GraphAiRecCreate) -> models.AiRecommendation:
    rec = models.AiRecommendation(
        id=_new_id(),
        object_type=payload.object_type,
        object_id=str(payload.object_id),
        kind=payload.kind,
        summary=payload.summary,
        meta=payload.meta or {}
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec

def list_ai_recommendations(
    db: Session, object_type: str, object_id: str, kind: Optional[str] = None, limit: int = 20
) -> List[models.AiRecommendation]:
    q = db.query(models.AiRecommendation).filter(
        models.AiRecommendation.object_type == object_type,
        models.AiRecommendation.object_id == str(object_id),
    )
    if kind:
        q = q.filter(models.AiRecommendation.kind == kind)
    return q.order_by(models.AiRecommendation.created_at.desc()).limit(limit).all()

def delete_ai_recommendations_for(db: Session, object_type: str, object_id: Union[int, str]) -> int:
    q = db.query(models.AiRecommendation).filter(
        models.AiRecommendation.object_type == object_type,
        models.AiRecommendation.object_id == str(object_id),
    )
    deleted = q.delete(synchronize_session=False)
    db.commit()
    return deleted

# --- Person Relation CRUD ---
def get_person_relations(db: Session, person_id: int):
    return (
        db.query(models.PersonRelation)
        .options(
            joinedload(models.PersonRelation.from_person),
            joinedload(models.PersonRelation.to_person),
        )
        .filter(
            (models.PersonRelation.from_person_id == person_id) |
            (models.PersonRelation.to_person_id == person_id)
        )
        .order_by(models.PersonRelation.id.desc())
    ).all()

def create_person_relation(db: Session, from_person_id: int, payload: schemas.PersonRelationCreate):
    rtype = (payload.type or "").strip().lower()
    if rtype not in ALLOWED_REL_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid relation type '{payload.type}'")

    if from_person_id == payload.to_person_id:
        raise HTTPException(status_code=400, detail="from_person and to_person cannot be the same")

    if not db.get(models.Person, from_person_id):
        raise HTTPException(status_code=404, detail=f"Person {from_person_id} not found")
    if not db.get(models.Person, payload.to_person_id):
        raise HTTPException(status_code=404, detail=f"Person {payload.to_person_id} not found")

    rel = models.PersonRelation(
        from_person_id=from_person_id,
        to_person_id=payload.to_person_id,
        type=rtype,
        note=payload.note or None,
    )
    db.add(rel)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = (
            db.query(models.PersonRelation)
            .options(
                joinedload(models.PersonRelation.from_person),
                joinedload(models.PersonRelation.to_person),
            )
            .filter_by(
                from_person_id=from_person_id,
                to_person_id=payload.to_person_id,
                type=rtype,
            )
            .first()
        )
        if existing:
            return existing
        raise
    db.refresh(rel)
    return rel

def update_person_relation(db: Session, rel_id: int, patch: schemas.PersonRelationUpdate):
    rel = db.get(models.PersonRelation, rel_id)
    if not rel:
        raise HTTPException(status_code=404, detail="Relation not found")

    if patch.type is not None:
        rtype = patch.type.strip().lower()
        if rtype not in ALLOWED_REL_TYPES:
            raise HTTPException(status_code=400, detail=f"Invalid relation type '{patch.type}'")
        rel.type = rtype

    if patch.note is not None:
        rel.note = patch.note or None

    db.add(rel)
    db.commit()
    db.refresh(rel)
    return rel

def delete_person_relation(db: Session, rel_id: int) -> bool:
    rel = db.get(models.PersonRelation, rel_id)
    if not rel:
        return False
    db.delete(rel)
    db.commit()
    return True


# --- Subgraph (n-hop) ---------------------------------------------------------

_NODE_RE = re.compile(r"^(person|people|project|projects|task|tasks|group|groups)_(\d+)$", re.I)

def _parse_node_id(nid: str) -> Tuple[str, int]:
    m = _NODE_RE.match(str(nid).strip())
    if not m:
        raise ValueError(f"Invalid node id '{nid}'. Expected '<kind>_<id>' like 'project_12'.")
    kind = m.group(1).lower()
    kind = {"people": "person", "projects": "project", "tasks": "task", "groups": "group"}.get(kind, kind.rstrip("s"))
    return kind, int(m.group(2))

def _nid(kind: str, _id: int) -> str:
    return f"{kind}_{int(_id)}"

def get_entity_subgraph(
    db: Session,
    centers: Optional[Iterable[str]] = None,
    degrees: int = 1,
    max_nodes: int = 2000,
    max_edges: int = 4000,
    include_collab: bool = True,
) -> Dict[str, Any]:
    """
    Build an n-hop subgraph around the provided center node ids
    (e.g., ["project_12","person_7"]). Always returns a dict matching
    GraphNetworkResponse and never None. All edges reference present nodes.
    """
    # --- constant schema descriptor (matches your /api/graph/network) ----
    SCHEMA = {
        "nodes": ["person", "project", "task", "group"],
        "edges": [
            {"type": "MANAGES",        "from": "person",  "to": "person"},
            {"type": "MENTOR",         "from": "person",  "to": "person"},
            {"type": "PEER",           "from": "person",  "to": "person"},
            {"type": "CO_LOCATED",     "from": "person",  "to": "person"},
            {"type": "RACI:R",         "from": "person",  "to": "project"},
            {"type": "RACI:A",         "from": "person",  "to": "project"},
            {"type": "RACI:C",         "from": "person",  "to": "project"},
            {"type": "RACI:I",         "from": "person",  "to": "project"},
            {"type": "PART_OF",        "from": "task",    "to": "project"},
            {"type": "ASSIGNEE:R",     "from": "person",  "to": "task"},
            {"type": "ASSIGNEE:A",     "from": "person",  "to": "task"},
            {"type": "ASSIGNEE:C",     "from": "person",  "to": "task"},
            {"type": "ASSIGNEE:I",     "from": "person",  "to": "task"},
            {"type": "MEMBER_OF",      "from": "person",  "to": "group"},
            {"type": "IN_GROUP",       "from": "project", "to": "group"},
            {"type": "COLLAB:TASK",    "from": "person",  "to": "person"},
            {"type": "COLLAB:PROJECT", "from": "person",  "to": "person"},
        ],
    }

    # --- results + guards ---------------------------------------------------
    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, Any]] = []
    seen_nodes: Set[Tuple[str, int]] = set()
    seen_edges: Set[Tuple[str, str, str]] = set()
    node_ids: Set[str] = set()  # ids present in `nodes`

    def safe_result() -> Dict[str, Any]:
        # Always return a valid response object
        return {"schema": SCHEMA, "graph": {"nodes": nodes, "edges": edges}}

    # --- add helpers ensure edge endpoints exist ---------------------------
    def add_node(kind: str, obj_id: int, *, label: Optional[str] = None,
                 status: Optional[str] = None, email: Optional[str] = None):
        if len(seen_nodes) >= max_nodes:
            return
        key = (kind, int(obj_id))
        if key in seen_nodes:
            return
        seen_nodes.add(key)

        nid_ = _nid(kind, int(obj_id))
        node_ids.add(nid_)

        data = {"id": nid_, "type": kind}
        if label is not None:  data["label"] = label
        if status is not None: data["status"] = status
        if email is not None:  data["email"] = email
        nodes.append({"data": data})

    def add_edge(src: str, dst: str, etype: str, **meta):
        if len(seen_edges) >= max_edges:
            return
        if src not in node_ids or dst not in node_ids:
            return
        key = (src, dst, etype)
        if key in seen_edges:
            return
        payload = {"source": src, "target": dst, "type": etype}
        if meta:
            payload.update(meta)
        edges.append({"data": payload})
        seen_edges.add(key)

    # --- seed frontier from centers (ignore bad ids) ------------------------
    frontier = {"project": set(), "task": set(), "person": set(), "group": set()}
    centers = list(centers or [])
    for token in centers:
        try:
            kind, _id = _parse_node_id(token)
            frontier[kind].add(int(_id))
        except Exception:
            # Ignore invalid tokens; still return a valid (possibly empty) graph
            continue

    # If no valid centers, return an empty-but-valid shape
    if not any(frontier.values()):
        return safe_result()

    # Materialize all center nodes first (so edges can attach)
    if frontier["project"]:
        for pr in db.query(models.Project).filter(models.Project.id.in_(frontier["project"])).all():
            add_node("project", pr.id, label=pr.name, status=pr.status)
    if frontier["task"]:
        for t in db.query(models.Task).filter(models.Task.id.in_(frontier["task"])).all():
            add_node("task", t.id, label=t.name, status=t.status)
    if frontier["person"]:
        for p in db.query(models.Person).filter(models.Person.id.in_(frontier["person"])).all():
            add_node("person", p.id, label=p.name, email=p.email)
    if frontier["group"]:
        for g in db.query(models.Group).filter(models.Group.id.in_(frontier["group"])).all():
            add_node("group", g.id, label=g.name)

    # --- BFS hops -----------------------------------------------------------
    for _hop in range(1, max(0, degrees) + 1):
        if not any(frontier.values()):
            break
        if len(seen_nodes) >= max_nodes or len(seen_edges) >= max_edges:
            break

        next_frontier = {"project": set(), "task": set(), "person": set(), "group": set()}

        # PROJECT frontier
        proj_ids = list(frontier["project"])
        if proj_ids:
            # tasks -> project
            for t in db.query(models.Task).filter(models.Task.project_id.in_(proj_ids)).all():
                add_node("task", t.id, label=t.name, status=t.status)
                add_edge(_nid("task", t.id), _nid("project", t.project_id), "PART_OF")
                next_frontier["task"].add(t.id)

            # project leads person -> project
            pls = db.query(models.ProjectLead).filter(models.ProjectLead.project_id.in_(proj_ids)).all()
            pids = {pl.person_id for pl in pls}
            people_map = {p.id: p for p in db.query(models.Person).filter(models.Person.id.in_(pids)).all()} if pids else {}
            initial = {"Responsible": "R", "Accountable": "A", "Consulted": "C", "Informed": "I"}
            for pl in pls:
                p = people_map.get(pl.person_id)
                if not p:
                    continue
                add_node("person", p.id, label=p.name, email=p.email)
                add_edge(_nid("person", p.id), _nid("project", pl.project_id), f"RACI:{initial.get(pl.role, (pl.role or 'R')[:1]).upper()}")
                next_frontier["person"].add(p.id)

            # project -> group
            rows = db.execute(
                select(models.project_group.c.project_id, models.project_group.c.group_id)
                .where(models.project_group.c.project_id.in_(proj_ids))
            ).all()
            g_ids = [gid for _, gid in rows]
            groups_map = {g.id: g for g in db.query(models.Group).filter(models.Group.id.in_(g_ids)).all()} if g_ids else {}
            for pr_id, gid in rows:
                g = groups_map.get(gid)
                if not g:
                    continue
                add_node("group", g.id, label=g.name)
                add_edge(_nid("project", pr_id), _nid("group", g.id), "IN_GROUP")
                next_frontier["group"].add(g.id)

        # TASK frontier
        task_ids = list(frontier["task"])
        if task_ids:
            t_rows = db.query(models.Task).filter(models.Task.id.in_(task_ids)).all()
            proj_for_task = {t.id: t.project_id for t in t_rows if t.project_id}
            proj_ids2 = list({pid for pid in proj_for_task.values() if pid})
            if proj_ids2:
                projs_map = {p.id: p for p in db.query(models.Project).filter(models.Project.id.in_(proj_ids2)).all()}
                for tid, pid in proj_for_task.items():
                    pr = projs_map.get(pid)
                    if not pr:
                        continue
                    add_node("project", pr.id, label=pr.name, status=pr.status)
                    add_edge(_nid("task", tid), _nid("project", pr.id), "PART_OF")
                    next_frontier["project"].add(pr.id)

                # leads of those projects
                pls2 = db.query(models.ProjectLead).filter(models.ProjectLead.project_id.in_(proj_ids2)).all()
                pids2 = {pl.person_id for pl in pls2}
                people_map2 = {p.id: p for p in db.query(models.Person).filter(models.Person.id.in_(pids2)).all()} if pids2 else {}
                initial = {"Responsible": "R", "Accountable": "A", "Consulted": "C", "Informed": "I"}
                for pl in pls2:
                    p = people_map2.get(pl.person_id)
                    if not p:
                        continue
                    add_node("person", p.id, label=p.name, email=p.email)
                    add_edge(_nid("person", p.id), _nid("project", pl.project_id), f"RACI:{initial.get(pl.role, (pl.role or 'R')[:1]).upper()}")
                    next_frontier["person"].add(p.id)

            # assignees person -> task
            tas = db.query(models.TaskAssignee).filter(models.TaskAssignee.task_id.in_(task_ids)).all()
            pids3 = {a.person_id for a in tas}
            people_map3 = {p.id: p for p in db.query(models.Person).filter(models.Person.id.in_(pids3)).all()} if pids3 else {}
            initial_t = {"Responsible": "R", "Accountable": "A", "Consulted": "C", "Informed": "I"}
            for a in tas:
                p = people_map3.get(a.person_id)
                if not p:
                    continue
                add_node("person", p.id, label=p.name, email=p.email)
                add_edge(_nid("person", a.person_id), _nid("task", a.task_id), f"ASSIGNEE:{initial_t.get(a.role, (a.role or 'R')[:1]).upper()}")
                next_frontier["person"].add(p.id)

        # PERSON frontier
        person_ids = list(frontier["person"])
        if person_ids:
            # relations (directed)
            rels_out = db.query(models.PersonRelation).filter(models.PersonRelation.from_person_id.in_(person_ids)).all()
            rels_in  = db.query(models.PersonRelation).filter(models.PersonRelation.to_person_id.in_(person_ids)).all()
            rel_ids  = {r.from_person_id for r in rels_out} | {r.to_person_id for r in rels_out} | {r.from_person_id for r in rels_in} | {r.to_person_id for r in rels_in}
            rel_people = {p.id: p for p in db.query(models.Person).filter(models.Person.id.in_(rel_ids)).all()} if rel_ids else {}

            for r in rels_out:
                tgt = rel_people.get(r.to_person_id)
                if not tgt:
                    continue
                add_node("person", tgt.id, label=tgt.name, email=tgt.email)
                add_edge(_nid("person", r.from_person_id), _nid("person", r.to_person_id), (r.type or "REL").upper())
                next_frontier["person"].add(tgt.id)
            for r in rels_in:
                src = rel_people.get(r.from_person_id)
                if not src:
                    continue
                add_node("person", src.id, label=src.name, email=src.email)
                add_edge(_nid("person", r.from_person_id), _nid("person", r.to_person_id), (r.type or "REL").upper())
                next_frontier["person"].add(src.id)

            # memberships (person -> group)
            rows = db.execute(
                select(models.person_group_table.c.person_id, models.person_group_table.c.group_id)
                .where(models.person_group_table.c.person_id.in_(person_ids))
            ).all()
            g_ids2 = [gid for _, gid in rows]
            groups_map2 = {g.id: g for g in db.query(models.Group).filter(models.Group.id.in_(g_ids2)).all()} if g_ids2 else {}
            for pid, gid in rows:
                g = groups_map2.get(gid)
                if not g:
                    continue
                add_node("group", g.id, label=g.name)
                add_edge(_nid("person", pid), _nid("group", g.id), "MEMBER_OF")
                next_frontier["group"].add(g.id)

            # projects of these people (person -> project)
            pls3 = db.query(models.ProjectLead).filter(models.ProjectLead.person_id.in_(person_ids)).all()
            proj_ids3 = {pl.project_id for pl in pls3}
            projs_map3 = {p.id: p for p in db.query(models.Project).filter(models.Project.id.in_(proj_ids3)).all()} if proj_ids3 else {}
            initial = {"Responsible": "R", "Accountable": "A", "Consulted": "C", "Informed": "I"}
            for pl in pls3:
                pr = projs_map3.get(pl.project_id)
                if not pr:
                    continue
                add_node("project", pr.id, label=pr.name, status=pr.status)
                add_edge(_nid("person", pl.person_id), _nid("project", pr.id), f"RACI:{initial.get(pl.role, (pl.role or 'R')[:1]).upper()}")
                next_frontier["project"].add(pr.id)

            # tasks of these people (person -> task)
            tas2 = db.query(models.TaskAssignee).filter(models.TaskAssignee.person_id.in_(person_ids)).all()
            task_ids2 = {a.task_id for a in tas2}
            tasks_map2 = {t.id: t for t in db.query(models.Task).filter(models.Task.id.in_(task_ids2)).all()} if task_ids2 else {}
            initial_t = {"Responsible": "R", "Accountable": "A", "Consulted": "C", "Informed": "I"}
            for a in tas2:
                t = tasks_map2.get(a.task_id)
                if not t:
                    continue
                add_node("task", t.id, label=t.name, status=t.status)
                add_edge(_nid("person", a.person_id), _nid("task", t.id), f"ASSIGNEE:{initial_t.get(a.role, (a.role or 'R')[:1]).upper()}")
                next_frontier["task"].add(t.id)

        # GROUP frontier
        group_ids = list(frontier["group"])
        if group_ids:
            # members (person -> group)
            rows = db.execute(
                select(models.person_group_table.c.person_id, models.person_group_table.c.group_id)
                .where(models.person_group_table.c.group_id.in_(group_ids))
            ).all()
            pids4 = [pid for pid, _ in rows]
            people_map4 = {p.id: p for p in db.query(models.Person).filter(models.Person.id.in_(pids4)).all()} if pids4 else {}
            for pid, gid in rows:
                p = people_map4.get(pid)
                if not p:
                    continue
                add_node("person", p.id, label=p.name, email=p.email)
                add_edge(_nid("person", p.id), _nid("group", gid), "MEMBER_OF")
                next_frontier["person"].add(p.id)

            # projects in group (project -> group)
            rows2 = db.execute(
                select(models.project_group.c.project_id, models.project_group.c.group_id)
                .where(models.project_group.c.group_id.in_(group_ids))
            ).all()
            proj_ids4 = [pr for pr, _ in rows2]
            projs_map4 = {p.id: p for p in db.query(models.Project).filter(models.Project.id.in_(proj_ids4)).all()} if proj_ids4 else {}
            for pr_id, gid in rows2:
                pr = projs_map4.get(pr_id)
                if not pr:
                    continue
                add_node("project", pr.id, label=pr.name, status=pr.status)
                add_edge(_nid("project", pr.id), _nid("group", gid), "IN_GROUP")
                next_frontier["project"].add(pr.id)

        frontier = next_frontier

    # --- Optional collaboration edges (endpoints present only) --------------
    if include_collab and node_ids:
        present = set(node_ids)

        # task-based collaboration
        t_ids = [int(i.split("_", 1)[1]) for i in present if i.startswith("task_")]
        if t_ids:
            from collections import defaultdict
            task_people: Dict[str, Set[str]] = defaultdict(set)
            tas = db.query(models.TaskAssignee).filter(models.TaskAssignee.task_id.in_(t_ids)).all()
            for a in tas:
                pid = _nid("person", a.person_id)
                tid = _nid("task", a.task_id)
                if pid in present and tid in present:
                    task_people[tid].add(pid)
            for _, people in task_people.items():
                ppl = sorted(people)
                for i in range(len(ppl)):
                    for j in range(i + 1, len(ppl)):
                        add_edge(ppl[i], ppl[j], "COLLAB:TASK")
                        add_edge(ppl[j], ppl[i], "COLLAB:TASK")

        # project-lead collaboration
        pr_ids = [int(i.split("_", 1)[1]) for i in present if i.startswith("project_")]
        if pr_ids:
            from collections import defaultdict
            proj_leads: Dict[str, Set[str]] = defaultdict(set)
            pls = db.query(models.ProjectLead).filter(models.ProjectLead.project_id.in_(pr_ids)).all()
            for pl in pls:
                pid = _nid("person", pl.person_id)
                prid = _nid("project", pl.project_id)
                if pid in present and prid in present:
                    proj_leads[prid].add(pid)
            for _, people in proj_leads.items():
                ppl = sorted(people)
                for i in range(len(ppl)):
                    for j in range(i + 1, len(ppl)):
                        add_edge(ppl[i], ppl[j], "COLLAB:PROJECT")
                        add_edge(ppl[j], ppl[i], "COLLAB:PROJECT")

    # --- Always return a dict (never None) ----------------------------------
    return safe_result()

# --- Project Links (sync) -----------------------------------------------------

def _payload_to_dict(payload) -> dict:
    """
    Accept Pydantic model or dict and coerce to JSON-serializable scalars.
    - Ensure url is a plain string (not HttpUrl)
    - Normalize scheme
    - Map added_by_id=0 -> None
    """
    if hasattr(payload, "model_dump"):
        d = payload.model_dump(exclude_unset=True, mode="json")  # <-- key fix
    else:
        d = dict(payload or {})

    # url -> str and normalize
    if "url" in d and d["url"] is not None:
        u = str(d["url"]).strip()
        if u and "://" not in u:
            u = "https://" + u
        d["url"] = u

    # treat 0 as "unknown" for nullable FK
    if d.get("added_by_id") in (0, "0", ""):
        d["added_by_id"] = None

    # coerce simple types defensively
    if "is_pinned" in d:
        d["is_pinned"] = bool(d["is_pinned"])
    if "sort_order" in d and d["sort_order"] is not None:
        try:
            d["sort_order"] = int(d["sort_order"])
        except (TypeError, ValueError):
            d["sort_order"] = 0

    return d


def list_project_links(db: Session, project_id: int):
    return (
        db.query(models.ProjectLink)
        .filter(models.ProjectLink.project_id == project_id)
        .order_by(
            models.ProjectLink.is_pinned.desc(),
            models.ProjectLink.sort_order.asc(),
            models.ProjectLink.created_at.desc(),
        )
        .all()
    )


def create_project_link(db: Session, project_id: int, data) -> models.ProjectLink:
    payload = _payload_to_dict(data)
    link = models.ProjectLink(project_id=project_id, **payload)
    db.add(link)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="A link with this URL already exists for the project.")
    db.refresh(link)
    return link


def update_project_link(db: Session, link_id: int, data):
    link = db.query(models.ProjectLink).filter(models.ProjectLink.id == link_id).first()
    if not link:
        return None

    payload = _payload_to_dict(data)
    for k, v in payload.items():
        setattr(link, k, v)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail="A link with this URL already exists for the project.")
    db.refresh(link)
    return link


def delete_project_link(db: Session, link_id: int) -> bool:
    link = db.query(models.ProjectLink).filter(models.ProjectLink.id == link_id).first()
    if not link:
        return False
    db.delete(link)
    db.commit()
    return True


def _sanitize_status(s: Optional[str]) -> str:
    s = (s or "").strip().lower()
    return s if s in VALID_STATUS else "not started"

def upsert_task_checklist(db: Session, task: models.Task, items: Optional[List[schemas.TaskChecklistItemCreate]]):
    """Replace the task's checklist with the provided items (id-aware upsert)."""
    if items is None:
        return

    incoming = []
    for i, it in enumerate(items):
        if not (it and str(it.title or "").strip()):
            continue
        incoming.append({
            "id": it.id,
            "title": str(it.title).strip(),
            "status": _sanitize_status(getattr(it, "status", "not started")),
            "order": i,  # normalize order to client sequence
        })

    # Index existing by id
    existing_by_id = {c.id: c for c in (task.checklist_items or []) if c.id is not None}
    seen_ids = set()

    next_list = []
    for row in incoming:
        cid = row["id"]
        if cid and cid in existing_by_id:
            c = existing_by_id[cid]
            c.title = row["title"]
            c.status = row["status"]
            c.order = row["order"]
            seen_ids.add(cid)
            next_list.append(c)
        else:
            next_list.append(models.TaskChecklistItem(
                title=row["title"],
                status=row["status"],
                order=row["order"],
            ))

    # Assigning a new list with delete-orphan will drop removed items
    task.checklist_items = next_list
    db.flush()  # keep ids in sync


# ------------- helpers ------------- #

def _norm_priority(p: Optional[str]) -> str:
    v = (p or "medium").strip().lower()
    return v if v in {"low", "medium", "high"} else "medium"

def _norm_status(s: Optional[str]) -> str:
    v = (s or "not started").strip().lower()
    mapping = {
        "not started": "not started",
        "in progress": "in progress",
        "blocked": "blocked",
        "complete": "complete",
        "completed": "complete",
        "canceled": "canceled",
        "cancelled": "canceled",
    }
    return mapping.get(v, v)

def _norm_unit(u: Optional[str]) -> Optional[str]:
    if not u:
        return None
    v = str(u).strip().lower()
    if v.startswith("day"): return "day"
    if v.startswith("week"): return "week"
    if v.startswith("month"): return "month"
    if v.startswith("year"): return "year"
    return None

def _norm_role(role: Optional[str]) -> str:
    r = (role or "").strip()
    if not r:
        return "Responsible"
    short = {"r": "Responsible", "a": "Accountable", "c": "Consulted", "i": "Informed"}
    rl = r.lower()
    return short.get(rl, r)

def _sync_task_tags(db: Session, task: models.Task, tag_ids: Optional[Iterable[int]]) -> None:
    ids = list({int(tid) for tid in (tag_ids or [])})
    if not ids:
        task.tags = []
        return
    tags = db.query(models.Tag).filter(models.Tag.id.in_(ids)).all()
    task.tags = tags

def _sync_task_assignees(db: Session, task: models.Task, incoming: Optional[Iterable[schemas.TaskAssignee]]) -> None:
    """
    Upsert by person_id; delete removed. Keeps roles updated.
    """
    desired: Dict[int, str] = {}
    for ap in (incoming or []):
        try:
            pid = int(ap.person_id)
        except Exception:
            continue
        desired[pid] = _norm_role(ap.role)

    existing = {ta.person_id: ta for ta in (task.task_assignees or [])}

    # delete removed
    for pid, ta in list(existing.items()):
        if pid not in desired:
            db.delete(ta)

    # insert/update present
    for pid, role in desired.items():
        if pid in existing:
            existing[pid].role = role
        else:
            db.add(models.TaskAssignee(task=task, person_id=pid, role=role))

# ------------- main functions ------------- #
