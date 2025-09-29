from __future__ import annotations
import base64
import re
import io
from typing import Any, Dict, Tuple
import pandas as pd
from db.models import Person, Group, Project, Task, Tag
from sqlalchemy.orm import Session
from fastapi import UploadFile
from sqlalchemy.orm import Session
from db.database import PythonVectorStore

MAX_CHARS = 1800
OVERLAP = 300

SINGULAR = {
    "people": "person",
    "persons": "person",  # just in case
    "projects": "project",
    "tasks": "task",
    "groups": "group",
    "tag": "tag",
}

MODEL_MAP = {
    "task": Task,
    "project": Project,
    "person": Person,
    "group": Group,
    "tag": Tag
}

MODEL_FIELD_MAP = {
    "Project": ["name", "description", "start_date", "end_date"],
    "Task": ["name", "description", "start", "end"],
    "Person": ["name", "notes"],
    "Group": ["name"],
    "Tag": ["name"]
}

ENTITY = r'(?:person|task|project|group|tag)_\d+'

FIND_ENTITY = re.compile(
    r"(?:`|\[|_)?\b(people|person|projects|project|tasks|task|groups|group|tag)_(\d+)\b(?:`|\]|_)?",
    re.IGNORECASE
)

# [task_2](entity://task_2) with arbitrary spaces/newlines -> task_2
LINK_RE   = re.compile(r'\[\s*(' + ENTITY + r')\s*\]\s*\(\s*entity://\s*(' + ENTITY + r')\s*\)', re.I)

# Nested/broken like [[task_2](entity://task_2)](entity://task_2) -> task_2
NESTED_RE = re.compile(r'\[\s*\[.+?\]\s*\(\s*entity://\s*' + ENTITY + r'\s*\)\s*\]\s*\(\s*entity://\s*' + ENTITY + r'\s*\)', re.I)

# Right half broken: (entity://\nproject_1) -> (entity://project_1)
RIGHT_HALF_RE = re.compile(r'\(\s*entity://\s*(' + ENTITY + r')\s*\)', re.I)

# Backticks: `task_2` -> task_2
TICK_RE  = re.compile(r'`(' + ENTITY + r')`', re.I)

# Parens: ( task_2 ) -> task_2
PAREN_RE = re.compile(r'\(\s*(' + ENTITY + r')\s*\)', re.I)

# Prefer quoted label right after id link: [task_2](entity://task_2) ("Briefing 2") -> [Briefing 2](entity://task_2)
LINK_THEN_QUOTED = re.compile(
    r'\[\s*(' + ENTITY + r')\s*\]\s*\(\s*entity://\s*\1\s*\)\s*\(\s*["“”\']([^"“”\']+)["“”\']\s*\)',
    re.I
)

# Bare ids: task_2 (used to extract labels next)
BARE_ID = re.compile(r'(' + ENTITY + r')', re.I)

# Optional: an id immediately followed by ("Label") -> record label and keep the id only
ID_WITH_LABEL = re.compile(r'(' + ENTITY + r')\s*\(\s*["“”\']([^"“”\']+)["“”\']\s*\)', re.I)

def resolve_labels_from_db(db: Session, ids: list[str]) -> dict[str, str]:
    """Return {'person_2': 'Alice Müller', 'task_1': 'Fix login bug', ...}"""
    out: dict[str, str] = {}
    by_typ = _group_ids_by_model(ids)
    for typ, id_list in by_typ.items():
        model = MODEL_MAP.get(typ)
        if not model or not id_list:
            continue
        rows = db.query(model).filter(model.id.in_(id_list)).all()
        m = {row.id: (_best_label_for(row) or f"{typ}_{row.id}") for row in rows}
        for n in id_list:
            out[f"{typ}_{n}"] = m.get(n, f"{typ}_{n}")
    return out


def normalize_typ(typ: str) -> str:
    t = typ.lower()
    return SINGULAR.get(t, t) 

def extract_ids(text: str) -> list[str]:
    seen = set()
    out = []
    for typ, num in FIND_ENTITY.findall(text or ""):
        t = normalize_typ(typ)
        eid = f"{t}_{int(num)}"  # int() also strips leading zeros
        if eid not in seen:
            seen.add(eid)
            out.append(eid)
    return out

def _group_ids_by_model(ids: list[str]) -> dict[str, list[int]]:
    grouped: dict[str, list[int]] = {}
    for eid in ids:
        typ, num = eid.split("_", 1)
        try:
            n = int(num)
        except ValueError:
            continue
        grouped.setdefault(typ, []).append(n)
    for k, vs in grouped.items():
        grouped[k] = sorted(set(vs))
    return grouped

def _best_label_for(model_obj) -> str | None:
    if model_obj is None:
        return None
    cls = model_obj.__class__.__name__
    prefs = MODEL_FIELD_MAP.get(cls, [])
    for f in prefs:
        if hasattr(model_obj, f):
            v = getattr(model_obj, f)
            if isinstance(v, str) and v.strip():
                return v.strip()
    # generic fallback
    if hasattr(model_obj, "name"):
        v = getattr(model_obj, "name")
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


def parse_excel(contents: str, db: Session):
    _, content_string = contents.split(',')
    decoded = base64.b64decode(content_string)
    xl = pd.ExcelFile(io.BytesIO(decoded))

    # Projects
    df_p = pd.read_excel(xl, sheet_name='Projects', parse_dates=['Start Date', 'End Date'])
    for _, r in df_p.iterrows():
        proj = db.query(Project).filter_by(name=r['Name']).first()
        if not proj:
            proj = Project(name=r['Name'])
            db.add(proj)
        proj.description = r.get('Description', '')
        proj.start_date = r['Start Date'].date()
        proj.end_date = r['End Date'].date()
        proj.status = r.get('Status', 'Planned')

    # Tasks
    if 'Tasks' in xl.sheet_names:
        df_t = pd.read_excel(xl, sheet_name='Tasks', parse_dates=['Start', 'End'])
        db.query(Task).delete()
        db.commit()
        for _, r in df_t.iterrows():
            parent = None
            if pd.notna(r.get('Parent')):
                parent = db.query(Task).filter_by(name=r['Parent']).first()
            task = Task(
                project_id=Project.query.filter_by(name=r['Project']).first().id,
                parent_task_id=parent.id if parent else None,
                name=r['Task'],
                start=r['Start'].date() if pd.notna(r['Start']) else None,
                end=r['End'].date() if pd.notna(r['End']) else None,
                assignee=r.get('Assignee', '')
            )
            db.add(task)
    db.commit()


def parse_groups_excel(contents: str, db: Session):
    """
    Import both Projects and DL (Distribution List) sheets.
    DL: Each row is a person, columns are group names, values are either 'x' or a subgroup name.
    Projects: Usual project columns.
    """
    # --- Decode base64 ---
    _, content_string = contents.split(',')
    decoded = base64.b64decode(content_string)
    xl = pd.ExcelFile(io.BytesIO(decoded))

    # --- Sheet Names ---
    sheet_names = {name.lower(): name for name in xl.sheet_names}
    dl_sheet = sheet_names.get('dl') or sheet_names.get('distribution list') or next((n for n in xl.sheet_names if "dl" in n.lower()), None)
    proj_sheet = sheet_names.get('projects') or next((n for n in xl.sheet_names if "project" in n.lower()), None)

    # --- Import Projects sheet if present ---
    if proj_sheet:
        proj_df = pd.read_excel(xl, sheet_name=proj_sheet)
        proj_df = proj_df.fillna("")
        for _, row in proj_df.iterrows():
            name = str(row.get("Name", "")).strip()
            if not name:
                continue
            # Try to get or create project
            project = db.query(Project).filter_by(name=name).first()
            if not project:
                project = Project(
                    name=name,
                    description=str(row.get("Description", "")),
                    start_date=row.get("Start Date") or row.get("Start"),
                    end_date=row.get("End Date") or row.get("End"),
                    status=row.get("Status", "Planned")
                )
                db.add(project)
            else:
                # Optionally update details
                project.description = str(row.get("Description", ""))
                project.start_date = row.get("Start Date") or row.get("Start")
                project.end_date = row.get("End Date") or row.get("End")
                project.status = row.get("Status", "Planned")
        db.flush()

    # --- Import DL/People/Groups ---
    if dl_sheet:
        df = pd.read_excel(xl, sheet_name=dl_sheet)
        df = df.fillna("")
        ignore_cols = {"Email", "Notes"}
        group_cols = [col for col in df.columns if col not in ignore_cols and col.strip()]
        for _, row in df.iterrows():
            email = str(row.get("Email", "")).strip()
            if not email:
                continue
            person = db.query(Person).filter_by(email=email).first()
            if not person:
                person = Person(email=email, name=str(row.get("Name", "")).strip(), notes=str(row.get("Notes", "")))
                db.add(person)
                db.flush()
            # Optionally update name/notes
            person.name = str(row.get("Name", "")).strip()
            person.notes = str(row.get("Notes", "")).strip()
            for col in group_cols:
                val = str(row.get(col, "")).strip()
                if not val:
                    continue
                if val.lower() == "x":
                    # Add to group (no subgroup)
                    group = db.query(Group).filter_by(name=col, parent_id=None).first()
                    if not group:
                        group = Group(name=col)
                        db.add(group)
                        db.flush()
                    if group not in person.groups:
                        person.groups.append(group)
                else:
                    # Subgroup logic
                    parent = db.query(Group).filter_by(name=col, parent_id=None).first()
                    if not parent:
                        parent = Group(name=col)
                        db.add(parent)
                        db.flush()
                    subgroup = db.query(Group).filter_by(name=val, parent_id=parent.id).first()
                    if not subgroup:
                        subgroup = Group(name=val, parent_id=parent.id)
                        db.add(subgroup)
                        db.flush()
                    if subgroup not in person.groups:
                        person.groups.append(subgroup)
            db.flush()
    db.commit()


def has_attr(model, attr: str) -> bool:
    return hasattr(model, attr)

def extract_llm_text(llm_response: Any) -> str:
    """
    Be defensive: some SDKs return a list of content parts.
    Supports:
      - choices[0].message.content -> str
      - choices[0].message.content -> [{"type":"text","text":"..."}]
    """
    msg = llm_response.to_dict()["choices"][0]["message"]["content"]
    if isinstance(msg, str):
        return msg
    if isinstance(msg, list):
        # concatenate any text parts
        return "".join(part.get("text", "") for part in msg if isinstance(part, dict))
    return str(msg or "")

def normalize_ai_text_and_labels(raw: str, db: Session | None) -> Tuple[str, Dict[str, str]]:
    """
    Your earlier normalize_ai_text, using the agreed cleanup + extract_ids.
    Returns clean text (bare ids only) and labels map {id: label}.
    """
    if not raw:
        return raw, {}

    s = raw

    # --- cleanup  ---
    s = RIGHT_HALF_RE.sub(r'(entity://\1)', s)
    s = LINK_RE.sub(lambda m: m.group(2).lower(), s)
    s = NESTED_RE.sub(lambda _m: '', s)
    s = TICK_RE.sub(lambda m: m.group(1).lower(), s)
    s = PAREN_RE.sub(lambda m: m.group(1).lower(), s)
    s = re.sub(r'\[\s*(' + ENTITY + r')\s*\]', lambda m: m.group(1).lower(), s, flags=re.I)
    s = re.sub(r'_(\s*(' + ENTITY + r')\s*)_', lambda m: m.group(2).lower(), s, flags=re.I)
    s = re.sub(rf'\b({ENTITY})\1\b', r'\1', s, flags=re.I)
    s = re.sub(r'\n{3,}', '\n\n', s)

    # --- ids -> labels map ---
    ids = extract_ids(s)
    labels = resolve_labels_from_db(db, ids) if (db and ids) else {eid: eid for eid in ids}
    return s, labels


def _read_text(file: UploadFile) -> str:
    raw = file.file.read()
    try:
        return raw.decode("utf-8", errors="ignore")
    except Exception:
        return raw.decode("latin-1", errors="ignore")

def _chunk(text: str, max_chars=MAX_CHARS, overlap=OVERLAP):
    text = re.sub(r'[ \t]+\n', '\n', text).strip()
    i, n = 0, len(text)
    out = []
    while i < n:
        end = min(n, i + max_chars)
        out.append(text[i:end])
        if end == n: break
        i = max(0, end - overlap)
    return out

def ingest_file(db: Session, vs: PythonVectorStore, ai_client, file: UploadFile,
                project_id: int, task_id: int | None):
    full_text = _read_text(file)
    chunks = _chunk(full_text)

    # Your ai_client should expose an embeddings API: embed(list[str]) -> list[list[float]]
    vectors = ai_client.embed(chunks)  # <-- plug your client call here

    doc_id = vs.insert_doc(
        db,
        project_id=project_id,
        task_id=task_id,
        title=file.filename,
        filename=file.filename,
        mime_type=file.content_type or "text/plain",
        meta={"size": len(full_text)}
    )
    vs.insert_chunks(db, doc_id=doc_id, texts=chunks, embeddings=vectors)
    return {"doc_id": doc_id, "chunks": len(chunks)}


def _model_label(obj) -> str | None:
    """Prefer nice fields; fallback to any truthy string field; else None."""
    if obj is None:
        return None
    # Choose by model class name
    cls_name = obj.__class__.__name__
    prefs = MODEL_FIELD_MAP.get(cls_name, [])
    for f in prefs:
        if hasattr(obj, f):
            val = getattr(obj, f, None)
            # prefer non-empty strings
            if isinstance(val, str) and val.strip():
                return val.strip()
            # some date-only models: show name if others absent
            if val and not isinstance(val, str):
                # skip non-strings except as a last resort
                continue
    # secondary: try a generic 'name' if not in prefs
    if hasattr(obj, "name"):
        val = getattr(obj, "name", None)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return None

def _extract_ids(s: str) -> list[str]:
    """Return all entity IDs in the text, normalized to lowercase (e.g., 'task_12')."""
    return [m.lower() for m in re.findall(BARE_ID, s, flags=re.I)]

def _group_ids_by_model(ids: list[str]) -> dict[str, list[int]]:
    """{'task': [12, 31], 'person': [7]} from ['task_12','TASK_31','person_7']"""
    grouped: dict[str, list[int]] = {}
    for eid in ids:
        typ, num = eid.split("_", 1)
        try:
            n = int(num)
        except ValueError:
            continue
        grouped.setdefault(typ, []).append(n)
    # dedupe while keeping simple lists
    for k, vs in grouped.items():
        grouped[k] = sorted(set(vs))
    return grouped

def resolve_labels_from_db(db: Session, ids: list[str]) -> dict[str, str]:
    """Bulk-resolve labels for ids using SQLAlchemy; fallback to ID if not found."""
    out: dict[str, str] = {}
    by_typ = _group_ids_by_model(ids)
    for typ, id_list in by_typ.items():
        model = MODEL_MAP.get(typ)
        if not model or not id_list:
            continue
        # bulk fetch
        rows = db.query(model).filter(model.id.in_(id_list)).all()
        # map id -> label
        label_by_id: dict[int, str] = {}
        for row in rows:
            label = _model_label(row) or f"{typ}_{row.id}"
            label_by_id[row.id] = label
        # fill output
        for n in id_list:
            key = f"{typ}_{n}"
            out[key] = label_by_id.get(n, key)
    return out
