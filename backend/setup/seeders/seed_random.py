# pmo/backend/setup/seeders/seed_random.py
from __future__ import annotations

from datetime import date, timedelta
from typing import Dict, List, Optional, Tuple
import random as rnd
from faker import Faker

from db import models

DOMAINS = [
    "example.com", "example.org", "contoso.com", "fabrikam.com",
    "adatum.com", "northwind.com"
]

TASK_STATUSES = ["not started", "in progress", "blocked", "complete"]
CHECK_STATUSES = ["not started", "started", "blocked", "complete"]
PRIORITIES = ["low", "medium", "high"]
TYPES = ["task", "use_case", "deliverable", "milestone"]
RECURRENCE_UNITS = [None, "day", "week", "month", "year"]

TAG_POOL_DEFAULT = [
    "stakeholder", "finance", "risk", "infra",
    "migration", "q3", "q4", "security",
    "ml", "ai", "ops", "frontend", "backend", "compliance"
]

def _unique_email(fake: Faker, used: set[str]) -> str:
    name = fake.user_name()
    domain = rnd.choice(DOMAINS)
    email = f"{name}@{domain}".lower()
    n = 1
    while email in used:
        email = f"{name}+{n}@{domain}".lower()
        n += 1
    used.add(email)
    return email

def _pick_weighted(items: List[str], weights: Optional[List[int]] = None) -> str:
    if not items:
        return ""
    if not weights:
        return rnd.choice(items)
    return rnd.choices(items, weights=weights, k=1)[0]

def _rand_date_window(anchor: date, lo: int, hi: int) -> Tuple[date, date]:
    start = anchor + timedelta(days=rnd.randint(lo, hi))
    end = start + timedelta(days=rnd.randint(5, 30))
    return start, end

def _ensure_tags(db, names: List[str]) -> Dict[str, models.Tag]:
    m: Dict[str, models.Tag] = {}
    for n in names:
        tag = db.query(models.Tag).filter(models.Tag.name == n).first()
        if not tag:
            tag = models.Tag(name=n)
            db.add(tag)
            db.flush()
        m[n] = tag
    return m

def _attach_unique_tags(entity, tags_by_name: Dict[str, models.Tag], tag_names: List[str], k_max: int) -> None:
    """
    Choose up to k_max unique tags from tag_names and attach,
    skipping any already present on the entity.
    """
    if not tag_names or k_max <= 0:
        return
    k = rnd.randint(0, min(k_max, len(tag_names)))
    chosen = set(rnd.sample(tag_names, k)) if k else set()
    existing_ids = {t.id for t in getattr(entity, "tags", [])}
    for name in chosen:
        tag = tags_by_name[name]
        if tag.id not in existing_ids:
            entity.tags.append(tag)
            existing_ids.add(tag.id)

def seed_random(
    db,
    *,
    people_count: int = 60,
    project_count: int = 6,
    group_count: int = 4,
    tasks_per_project: Tuple[int, int] = (4, 8),
    checklist_per_task: Tuple[int, int] = (1, 5),
    relations_count: int = 30,
    seed: Optional[int] = None,
    tag_pool: Optional[List[str]] = None,
) -> dict:
    if seed is not None:
        rnd.seed(seed)
    fake = Faker()
    Faker.seed(seed or rnd.randint(1, 10_000))

    tag_names = list(set(tag_pool or TAG_POOL_DEFAULT))
    tags_by_name = _ensure_tags(db, tag_names)

    summary: Dict[str, int] = {
        "tags": len(tags_by_name),
        "people": 0,
        "groups": 0,
        "projects": 0,
        "tasks": 0,
        "checklist_items": 0,
        "task_assignees": 0,
        "project_leads": 0,
        "links": 0,
        "relations": 0,
    }

    # --- People ---
    used_emails = {p.email for p in db.query(models.Person).all() if p.email}
    people: List[models.Person] = []
    for _ in range(max(1, people_count)):
        person = models.Person(
            name=fake.name(),
            email=_unique_email(fake, used_emails),
            notes=fake.sentence(nb_words=10),
        )
        _attach_unique_tags(person, tags_by_name, tag_names, k_max=2)
        db.add(person)
        people.append(person)
    db.flush()
    summary["people"] = len(people)

    # --- Groups ---
    groups: List[models.Group] = []
    for _ in range(max(1, group_count)):
        g = models.Group(name=f"{fake.company()} Team")
        db.add(g)
        groups.append(g)
    db.flush()

    if len(groups) >= 3:
        for g in groups[1:3]:
            g.parent = groups[0]

    for g in groups:
        # members
        for p in rnd.sample(people, k=min(len(people), rnd.randint(5, 15))):
            if p not in g.members:
                g.members.append(p)
        _attach_unique_tags(g, tags_by_name, tag_names, k_max=2)
    db.flush()
    summary["groups"] = len(groups)

    # --- Projects ---
    anchor = date.today()
    projects: List[models.Project] = []
    for _ in range(max(1, project_count)):
        start, end = _rand_date_window(anchor, -30, 30)
        proj = models.Project(
            name=f"{fake.bs().title()}",
            description=fake.sentence(nb_words=12),
            start_date=start,
            end_date=end,
            status=_pick_weighted(["Planned", "Running", "Complete", "Blocked"], [4, 6, 2, 1]),
            is_archived=False,
            archived_at=None,
        )
        _attach_unique_tags(proj, tags_by_name, tag_names, k_max=3)
        # attach 0–2 groups
        for _g in range(rnd.randint(0, min(2, len(groups)))):
            grp = rnd.choice(groups)
            if grp not in proj.groups:
                proj.groups.append(grp)
        db.add(proj)
        projects.append(proj)
    db.flush()
    summary["projects"] = len(projects)

    # Project leads
    for proj in projects:
        for p in rnd.sample(people, k=min(len(people), rnd.randint(1, 4))):
            exists = db.query(models.ProjectLead).filter(
                models.ProjectLead.project_id == proj.id,
                models.ProjectLead.person_id == p.id
            ).first()
            if not exists:
                role = _pick_weighted(["Responsible", "Accountable", "Consulted", "Informed"], [6, 2, 3, 4])
                db.add(models.ProjectLead(project_id=proj.id, person_id=p.id, role=role))
                summary["project_leads"] += 1
    db.flush()

    # --- Tasks ---
    tasks_all: List[models.Task] = []
    for proj in projects:
        tcount = rnd.randint(tasks_per_project[0], tasks_per_project[1])
        for _ in range(tcount):
            start, end = _rand_date_window(proj.start_date or anchor, 0, 40)
            is_cont = rnd.random() < 0.25
            rec_unit = _pick_weighted(RECURRENCE_UNITS, [0, 3, 5, 2, 1]) if is_cont else None
            rec_int = rnd.randint(1, 4) if is_cont else 1

            task = models.Task(
                project_id=proj.id,
                name=fake.catch_phrase(),
                description=fake.paragraph(nb_sentences=2),
                type=rnd.choice(TYPES),
                start=start,
                end=None if is_cont else end,
                priority=_pick_weighted(PRIORITIES, [2, 6, 2]),
                status=_pick_weighted(TASK_STATUSES, [6, 5, 2, 2]),
                is_continuous=is_cont,
                recurrence_unit=rec_unit,
                recurrence_interval=rec_int,
            )
            _attach_unique_tags(task, tags_by_name, tag_names, k_max=3)

            db.add(task)
            tasks_all.append(task)
    db.flush()
    summary["tasks"] = len(tasks_all)

    # Task assignees
    for task in tasks_all:
        assignees_k = rnd.randint(0, 4)
        if assignees_k == 0:
            continue
        chosen = set()
        for _ in range(assignees_k):
            p = rnd.choice(people)
            key = (task.id, p.id)
            if key in chosen:
                continue
            chosen.add(key)
            exists = db.query(models.TaskAssignee).filter(
                models.TaskAssignee.task_id == task.id,
                models.TaskAssignee.person_id == p.id
            ).first()
            if not exists:
                db.add(models.TaskAssignee(
                    task_id=task.id,
                    person_id=p.id,
                    role=_pick_weighted(["Responsible", "Accountable", "Consulted", "Informed"], [8, 2, 3, 3])
                ))
                summary["task_assignees"] += 1
    db.flush()

    # Checklist items: unique order per task
    for task in tasks_all:
        n_items = rnd.randint(checklist_per_task[0], checklist_per_task[1])
        titles = [fake.bs().capitalize() for _ in range(n_items)]
        for order, title in enumerate(titles):
            db.add(models.TaskChecklistItem(
                task_id=task.id,
                title=title,
                status=_pick_weighted(CHECK_STATUSES, [6, 3, 2, 2]),
                order=order,
            ))
            summary["checklist_items"] += 1
    db.flush()

    # Project links (unique per project_id + url)
    seen_links = set()
    for proj in projects:
        for _ in range(rnd.randint(0, 3)):
            host = rnd.choice(["docs", "wiki", "repo", "sheet", "drive", "tracker"])
            path = fake.slug()
            url = f"https://{host}.{rnd.choice(DOMAINS)}/{path}"
            key = (proj.id, url.lower())
            if key in seen_links:
                continue
            seen_links.add(key)
            added_by = rnd.choice(people).id if people else None
            db.add(models.ProjectLink(
                project_id=proj.id,
                title=f"{host.title()} – {fake.word().title()}",
                url=url,
                description=fake.sentence(nb_words=8),
                kind=rnd.choice(["doc", "repo", "sheet", "drive", "tracker"]),
                added_by_id=added_by,
                sort_order=rnd.randint(0, 9),
                is_pinned=(rnd.random() < 0.15),
            ))
            summary["links"] += 1
    db.flush()

    # Person relations
    if len(people) > 1:
        tries = 0
        made = 0
        target = relations_count
        while made < target and tries < target * 5:
            a, b = rnd.sample(people, 2)
            if a.id == b.id:
                tries += 1
                continue
            rel_type = _pick_weighted(["manages", "mentor", "peer", "co_located"], [6, 2, 3, 2])
            exists = db.query(models.PersonRelation).filter(
                models.PersonRelation.from_person_id == a.id,
                models.PersonRelation.to_person_id == b.id,
                models.PersonRelation.type == rel_type
            ).first()
            if not exists:
                db.add(models.PersonRelation(
                    from_person_id=a.id,
                    to_person_id=b.id,
                    type=rel_type,
                    note=fake.sentence(nb_words=6)
                ))
                made += 1
            tries += 1
        summary["relations"] = made

    db.commit()
    summary["ok"] = True
    return summary
