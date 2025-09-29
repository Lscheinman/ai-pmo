# pmo/backend/setup/seeders/seed_from_csv.py
from __future__ import annotations
import csv
from pathlib import Path
from typing import Dict, List
from db import models
from ._seed_utils import (
    resolve_demo_data_dir,
    parse_date_or_none,
    safe_email,
    reindex_checklist_items,
)

def read_csv(path: Path) -> List[Dict]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))

def seed_from_csv(db) -> dict:
    csv_dir = resolve_demo_data_dir()
    summary: Dict[str, int] = {}

    people_rows  = read_csv(csv_dir / "people.csv")            # key,name,email,notes,tags
    groups_rows  = read_csv(csv_dir / "groups.csv")            # key,name,parent_key,tags
    gm_rows      = read_csv(csv_dir / "group_members.csv")     # group_key,person_key
    tags_rows    = read_csv(csv_dir / "tags.csv")              # name
    projs_rows   = read_csv(csv_dir / "projects.csv")          # key,name,description,start_date,end_date,status,tags
    pleads_rows  = read_csv(csv_dir / "project_leads.csv")     # project_key,person_key,role
    tasks_rows   = read_csv(csv_dir / "tasks.csv")             # key,project_key,name,description,type,start,end,priority,status,is_continuous,recurrence_unit,recurrence_interval,tags
    tass_rows    = read_csv(csv_dir / "task_assignees.csv")    # task_key,person_key,role
    tcheck_rows  = read_csv(csv_dir / "task_checklist.csv")    # task_key,title,status,order
    links_rows   = read_csv(csv_dir / "project_links.csv")     # project_key,title,url,description,kind,added_by_person_key,sort_order,is_pinned
    prels_rows   = read_csv(csv_dir / "person_relations.csv")  # from_person_key,to_person_key,type,note
    pg_rows      = read_csv(csv_dir / "project_groups.csv")    # project_key,group_key

    # ---- Tags ----
    name_to_tag: Dict[str, models.Tag] = {}
    for r in tags_rows:
        n = (r.get("name") or "").strip()
        if not n:
            continue
        tag = db.query(models.Tag).filter(models.Tag.name == n).first()
        if not tag:
            tag = models.Tag(name=n)
            db.add(tag)
            db.flush()
        name_to_tag[n] = tag
    summary["tags"] = len(name_to_tag)

    # ---- People ----
    used_emails = set()
    key_to_person: Dict[str, models.Person] = {}
    for r in people_rows:
        key = (r.get("key") or "").strip()
        name = (r.get("name") or "").strip() or "Person"
        email_raw = (r.get("email") or "").strip()
        notes = (r.get("notes") or "").strip() or None
        email = safe_email(email_raw, name, used_emails)

        p = db.query(models.Person).filter(models.Person.email == email).first()
        if not p:
            p = models.Person(name=name, email=email, notes=notes)
            db.add(p)
            db.flush()

        # optional tags (semicolon-separated)
        for tname in (r.get("tags") or "").split(";"):
            tname = tname.strip()
            if not tname:
                continue
            tag = name_to_tag.get(tname) or db.query(models.Tag).filter(models.Tag.name == tname).first()
            if not tag:
                tag = models.Tag(name=tname)
                db.add(tag)
                db.flush()
                name_to_tag[tname] = tag
            if tag not in p.tags:
                p.tags.append(tag)

        if key:
            key_to_person[key] = p

    summary["people"] = len(key_to_person) or db.query(models.Person).count()

    # ---- Groups ----
    key_to_group: Dict[str, models.Group] = {}
    # create groups
    for r in groups_rows:
        gkey = (r.get("key") or "").strip()
        gname = (r.get("name") or "").strip()
        if not gkey or not gname:
            continue
        g = db.query(models.Group).filter(models.Group.name == gname).first()
        if not g:
            g = models.Group(name=gname)
            db.add(g)
            db.flush()
        key_to_group[gkey] = g
    # set parent + tags
    for r in groups_rows:
        gkey = (r.get("key") or "").strip()
        parent_key = (r.get("parent_key") or "").strip()
        if gkey and parent_key and gkey in key_to_group and parent_key in key_to_group:
            key_to_group[gkey].parent = key_to_group[parent_key]
        for tname in (r.get("tags") or "").split(";"):
            tname = tname.strip()
            if not tname:
                continue
            tag = name_to_tag.get(tname) or db.query(models.Tag).filter(models.Tag.name == tname).first()
            if not tag:
                tag = models.Tag(name=tname)
                db.add(tag)
                db.flush()
                name_to_tag[tname] = tag
            if tag not in key_to_group[gkey].tags:
                key_to_group[gkey].tags.append(tag)
    # members
    for r in gm_rows:
        gk = (r.get("group_key") or "").strip()
        pk = (r.get("person_key") or "").strip()
        if gk in key_to_group and pk in key_to_person:
            g = key_to_group[gk]
            p = key_to_person[pk]
            if p not in g.members:
                g.members.append(p)

    summary["groups"] = len(key_to_group)

    # ---- Projects ----
    key_to_project: Dict[str, models.Project] = {}
    for r in projs_rows:
        pkey = (r.get("key") or "").strip()
        pname = (r.get("name") or "").strip()
        if not pkey or not pname:
            continue
        proj = models.Project(
            name=pname,
            description=(r.get("description") or "").strip() or None,
            start_date=parse_date_or_none(r.get("start_date")),
            end_date=parse_date_or_none(r.get("end_date")),
            status=(r.get("status") or "Planned").strip() or "Planned",
        )
        db.add(proj)
        db.flush()
        key_to_project[pkey] = proj

        # tags
        for tname in (r.get("tags") or "").split(";"):
            tname = tname.strip()
            if not tname:
                continue
            tag = name_to_tag.get(tname) or db.query(models.Tag).filter(models.Tag.name == tname).first()
            if not tag:
                tag = models.Tag(name=tname)
                db.add(tag)
                db.flush()
                name_to_tag[tname] = tag
            if tag not in proj.tags:
                proj.tags.append(tag)

    summary["projects"] = len(key_to_project)

    # project <-> group links
    for r in pg_rows:
        pk = (r.get("project_key") or "").strip()
        gk = (r.get("group_key") or "").strip()
        if pk in key_to_project and gk in key_to_group:
            proj = key_to_project[pk]
            grp = key_to_group[gk]
            if grp not in proj.groups:
                proj.groups.append(grp)

    # project leads
    for r in pleads_rows:
        pk = (r.get("project_key") or "").strip()
        sk = (r.get("person_key") or "").strip()
        role = (r.get("role") or "Responsible").strip() or "Responsible"
        if pk in key_to_project and sk in key_to_person:
            exists = db.query(models.ProjectLead).filter(
                models.ProjectLead.project_id == key_to_project[pk].id,
                models.ProjectLead.person_id == key_to_person[sk].id
            ).first()
            if not exists:
                db.add(models.ProjectLead(
                    project_id=key_to_project[pk].id,
                    person_id=key_to_person[sk].id,
                    role=role
                ))

    # ---- Tasks ----
    key_to_task: Dict[str, models.Task] = {}
    for r in tasks_rows:
        tk = (r.get("key") or "").strip()
        pk = (r.get("project_key") or "").strip()
        if not tk or pk not in key_to_project:
            continue
        t = models.Task(
            project_id=key_to_project[pk].id,
            name=(r.get("name") or "").strip() or "Task",
            description=(r.get("description") or "").strip() or None,
            type=(r.get("type") or "").strip() or None,
            start=parse_date_or_none(r.get("start")),
            end=parse_date_or_none(r.get("end")),
            priority=(r.get("priority") or "medium").strip() or "medium",
            status=(r.get("status") or "not started").strip() or "not started",
            is_continuous=((r.get("is_continuous") or "").strip().lower() in {"1", "true", "yes"}),
            recurrence_unit=(r.get("recurrence_unit") or None),
            recurrence_interval=int((r.get("recurrence_interval") or "1") or "1"),
        )
        db.add(t)
        db.flush()
        key_to_task[tk] = t

        # tags
        for tname in (r.get("tags") or "").split(";"):
            tname = tname.strip()
            if not tname:
                continue
            tag = name_to_tag.get(tname) or db.query(models.Tag).filter(models.Tag.name == tname).first()
            if not tag:
                tag = models.Tag(name=tname)
                db.add(tag)
                db.flush()
                name_to_tag[tname] = tag
            if tag not in t.tags:
                t.tags.append(tag)

    # task assignees
    for r in tass_rows:
        tk = (r.get("task_key") or "").strip()
        pk = (r.get("person_key") or "").strip()
        role = (r.get("role") or "Responsible").strip() or "Responsible"
        if tk in key_to_task and pk in key_to_person:
            exists = db.query(models.TaskAssignee).filter(
                models.TaskAssignee.task_id == key_to_task[tk].id,
                models.TaskAssignee.person_id == key_to_person[pk].id
            ).first()
            if not exists:
                db.add(models.TaskAssignee(
                    task_id=key_to_task[tk].id,
                    person_id=key_to_person[pk].id,
                    role=role
                ))

    # checklist items → unique order per task
    checklist_by_task: Dict[str, List[Dict]] = {}
    for r in tcheck_rows:
        tk = (r.get("task_key") or "").strip()
        if tk not in key_to_task:
            continue
        checklist_by_task.setdefault(tk, []).append({
            "title": (r.get("title") or "").strip(),
            "status": (r.get("status") or "not started").strip().lower(),
            "order": r.get("order"),
        })
    for tk, rows in checklist_by_task.items():
        t = key_to_task[tk]
        rows = [r for r in rows if r["title"]]
        rows = reindex_checklist_items(rows)
        for it in rows:
            db.add(models.TaskChecklistItem(
                task_id=t.id,
                title=it["title"],
                status=it["status"],
                order=it["order"],
            ))

    # project links (dedupe on project_id + url)
    seen_link = set()
    for r in links_rows:
        pk = (r.get("project_key") or "").strip()
        if pk not in key_to_project:
            continue
        url = (r.get("url") or "").strip()
        if not url:
            continue
        dedupe_key = (key_to_project[pk].id, url.lower())
        if dedupe_key in seen_link:
            continue
        seen_link.add(dedupe_key)

        added_by_key = (r.get("added_by_person_key") or "").strip()
        added_by_id = key_to_person[added_by_key].id if added_by_key in key_to_person else None

        db.add(models.ProjectLink(
            project_id=key_to_project[pk].id,
            title=(r.get("title") or None),
            url=url,
            description=(r.get("description") or None),
            kind=(r.get("kind") or None),
            added_by_id=added_by_id,
            sort_order=int((r.get("sort_order") or "0") or "0"),
            is_pinned=((r.get("is_pinned") or "").strip().lower() in {"1", "true", "yes"}),
        ))

    # person relations (optional)
    for r in prels_rows:
        fk = (r.get("from_person_key") or "").strip()
        tk = (r.get("to_person_key") or "").strip()
        rel_type = (r.get("type") or "manages").strip() or "manages"
        note = (r.get("note") or None)
        if fk in key_to_person and tk in key_to_person:
            exists = db.query(models.PersonRelation).filter(
                models.PersonRelation.from_person_id == key_to_person[fk].id,
                models.PersonRelation.to_person_id == key_to_person[tk].id,
                models.PersonRelation.type == rel_type
            ).first()
            if not exists:
                db.add(models.PersonRelation(
                    from_person_id=key_to_person[fk].id,
                    to_person_id=key_to_person[tk].id,
                    type=rel_type,
                    note=note
                ))

    db.commit()
    return {"ok": True, "counts": summary}
