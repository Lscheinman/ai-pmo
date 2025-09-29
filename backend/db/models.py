# models.py
from __future__ import annotations
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Date, Text, ForeignKey, Table, UniqueConstraint, DateTime, Boolean
)
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy.types import JSON as JSONType  # cross-db JSON
from sqlalchemy.sql import func

Base = declarative_base()

# -----------------------
# Tag & per-object link tables
# -----------------------

class Tag(Base):
    __tablename__ = "tags"
    id   = Column(Integer, primary_key=True)
    name = Column(String(200), unique=True, nullable=False)

# Project <-> Tag (prevents dups via composite PK)
project_tag = Table(
    "project_tag", Base.metadata,
    Column("project_id", ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id",     ForeignKey("tags.id",     ondelete="CASCADE"), primary_key=True),
)

# Task <-> Tag
task_tag = Table(
    "task_tag", Base.metadata,
    Column("task_id", ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id",  ForeignKey("tags.id",  ondelete="CASCADE"), primary_key=True),
)

# Person <-> Tag
person_tag = Table(
    "person_tag", Base.metadata,
    Column("person_id", ForeignKey("people.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id",    ForeignKey("tags.id",   ondelete="CASCADE"), primary_key=True),
)

# Group <-> Tag
group_tag = Table(
    "group_tag", Base.metadata,
    Column("group_id", ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id",   ForeignKey("tags.id",   ondelete="CASCADE"), primary_key=True),
)

# NOTE: You also reference TagAssignment in crud.py. Keep a minimal model so those
# functions import fine. Prefer set_tags_for_object (which uses obj.tags relationships).
class TagAssignment(Base):
    __tablename__ = "tag_assignments"
    id = Column(Integer, primary_key=True)
    object_type = Column(String(50), nullable=False)  # 'Project' | 'Task' | 'Person' | 'Group'
    object_id   = Column(Integer, nullable=False)
    tag_id      = Column(Integer, ForeignKey("tags.id", ondelete="CASCADE"), nullable=False)
    __table_args__ = (
        UniqueConstraint("object_type", "object_id", "tag_id", name="uq_tag_assign"),
    )


# -----------------------
# People / Groups
# -----------------------

# Group <-> Person (members)
person_group_table = Table(
    "person_group", Base.metadata,
    Column("group_id",  ForeignKey("groups.id", ondelete="CASCADE"), primary_key=True),
    Column("person_id", ForeignKey("people.id", ondelete="CASCADE"), primary_key=True),
)

class Person(Base):
    __tablename__ = "people"

    id    = Column(Integer, primary_key=True)
    name  = Column(String(200), nullable=False)
    email = Column(String(200), unique=True, nullable=True)
    notes = Column(Text, nullable=True)

    # existing
    tags = relationship("Tag", secondary=person_tag, lazy="selectin")
    project_leads = relationship("ProjectLead", back_populates="person", cascade="all, delete-orphan")
    groups = relationship("Group", secondary="person_group", back_populates="members")

    # NEW: self-referential relations (use lambdas to avoid forward-ref issues)
    relations_out = relationship(
        "PersonRelation",
        primaryjoin=lambda: Person.id == PersonRelation.from_person_id,
        foreign_keys=lambda: [PersonRelation.from_person_id],
        back_populates="from_person",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
    )
    relations_in = relationship(
        "PersonRelation",
        primaryjoin=lambda: Person.id == PersonRelation.to_person_id,
        foreign_keys=lambda: [PersonRelation.to_person_id],
        back_populates="to_person",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
    )


class PersonRelation(Base):
    __tablename__ = "person_relations"

    id = Column(Integer, primary_key=True)
    from_person_id = Column(Integer, ForeignKey("people.id", ondelete="CASCADE"), nullable=False, index=True)
    to_person_id   = Column(Integer, ForeignKey("people.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String(40), nullable=False, default="manages")
    note = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("from_person_id", "to_person_id", "type", name="uq_person_relation_edge"),
    )

    from_person = relationship(
        "Person",
        primaryjoin=lambda: PersonRelation.from_person_id == Person.id,
        foreign_keys=lambda: [PersonRelation.from_person_id],
        back_populates="relations_out",
        lazy="joined",
    )
    to_person = relationship(
        "Person",
        primaryjoin=lambda: PersonRelation.to_person_id == Person.id,
        foreign_keys=lambda: [PersonRelation.to_person_id],
        back_populates="relations_in",
        lazy="joined",
    )


class Group(Base):
    __tablename__ = "groups"
    id        = Column(Integer, primary_key=True)
    name      = Column(String(200), nullable=False)
    parent_id = Column(Integer, ForeignKey("groups.id"), nullable=True)

    parent   = relationship("Group", remote_side=[id], backref="children")
    members  = relationship("Person", secondary=person_group_table, lazy="selectin")
    tags     = relationship("Tag", secondary=group_tag,   lazy="selectin")

# -----------------------
# Projects / Tasks
# -----------------------

# ProjectLead association object (RACI w/ role)
class ProjectLead(Base):
    __tablename__ = "project_leads"
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    person_id  = Column(Integer, ForeignKey("people.id",  ondelete="CASCADE"), primary_key=True)
    role       = Column(String(50), nullable=False, default="Responsible")

    project = relationship("Project", back_populates="project_leads")
    person  = relationship("Person",  back_populates="project_leads")

# Project <-> Group link
project_group = Table(
    "project_group", Base.metadata,
    Column("project_id", ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
    Column("group_id",   ForeignKey("groups.id",   ondelete="CASCADE"), primary_key=True),
)

class Project(Base):
    __tablename__ = "projects"
    id          = Column(Integer, primary_key=True)
    name        = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    start_date  = Column(Date, nullable=True)
    end_date    = Column(Date, nullable=True)
    status      = Column(String(50), nullable=False, default="Planned")
    is_archived = Column(Boolean, nullable=False, default=False)
    archived_at = Column(DateTime, nullable=True)

    # relationships used throughout your code
    tasks           = relationship("Task", back_populates="project", cascade="all, delete-orphan", passive_deletes=True)
    groups          = relationship("Group", secondary=project_group, lazy="selectin")
    project_leads   = relationship("ProjectLead", back_populates="project", cascade="all, delete-orphan", lazy="selectin")
    tags            = relationship("Tag", secondary=project_tag, lazy="selectin")

class TaskAssignee(Base):
    __tablename__ = "task_assignees"
    task_id   = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True)
    person_id = Column(Integer, ForeignKey("people.id", ondelete="CASCADE"), primary_key=True)
    role      = Column(String(50), nullable=False, default="Responsible")

    task   = relationship("Task", back_populates="task_assignees")
    person = relationship("Person")

class TaskChecklistItem(Base):
    __tablename__ = "task_checklist_items"
    id       = Column(Integer, primary_key=True)
    task_id  = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    title    = Column(String(500), nullable=False)
    status   = Column(String(20), nullable=False, default="not started")  # 'not started'|'started'|'blocked'|'complete'
    order    = Column(Integer, nullable=False, default=0)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    task = relationship("Task", back_populates="checklist_items")

    __table_args__ = (
        UniqueConstraint("task_id", "order", name="uq_task_checklist_order"),
    )

class Task(Base):
    __tablename__ = "tasks"
    id          = Column(Integer, primary_key=True)
    name        = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    type        = Column(String(50), nullable=True)
    start       = Column(Date, nullable=True)
    end         = Column(Date, nullable=True)
    priority    = Column(String(20), default="medium")
    status      = Column(String(30), default="not started")
    is_continuous       = Column(Boolean, nullable=False, default=False)     # discrete vs continuous
    recurrence_unit     = Column(String(16), nullable=True)  # 'day'|'week'|'month'|'year'
    recurrence_interval = Column(Integer, nullable=False, default=1)
    project_id  = Column(Integer, ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    
    project     = relationship("Project", back_populates="tasks", lazy="joined")
    task_assignees = relationship("TaskAssignee", back_populates="task", cascade="all, delete-orphan", lazy="selectin")
    tags           = relationship("Tag", secondary=task_tag, lazy="selectin")
    checklist_items = relationship(
        "TaskChecklistItem",
        back_populates="task",
        order_by="TaskChecklistItem.order",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="selectin",
    )
    @property
    def checklist(self):
        return self.checklist_items


# -----------------------
# AI / Vector store tables you referenced
# -----------------------

class AiRecommendation(Base):
    __tablename__ = "ai_recommendations"
    id          = Column(String(24), primary_key=True)  # you use _new_id() 24 hex chars
    object_type = Column(String(50), nullable=False)
    object_id   = Column(String(50), nullable=False)
    kind        = Column(String(50), nullable=True)
    summary     = Column(Text, nullable=False)
    meta        = Column(JSONType, default=dict)
    created_at  = Column(DateTime, default=datetime.utcnow, nullable=False)

class KnowledgeDoc(Base):
    __tablename__ = "knowledge_docs"
    id         = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    task_id    = Column(Integer, ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    title      = Column(String(500), nullable=True)
    filename   = Column(String(500), nullable=True)
    mime_type  = Column(String(100), nullable=True)
    meta_json  = Column(Text, nullable=True)

    chunks = relationship("KnowledgeChunk", back_populates="doc", cascade="all, delete-orphan")

class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"
    id        = Column(Integer, primary_key=True)
    doc_id    = Column(Integer, ForeignKey("knowledge_docs.id", ondelete="CASCADE"), nullable=False)
    idx       = Column(Integer, nullable=False)
    text      = Column(Text, nullable=False)
    embedding = Column(Text, nullable=False)  # JSON-encoded vector
    tokens    = Column(Integer, default=0)
    doc = relationship("KnowledgeDoc", back_populates="chunks")


class ProjectLink(Base):
    __tablename__ = "project_links"
    id          = Column(Integer, primary_key=True)
    project_id  = Column(Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    title       = Column(String(300), nullable=True)        # if not set, fallback to URL host
    url         = Column(String(2000), nullable=False)      # normalize to https scheme by default
    description = Column(Text, nullable=True)
    kind        = Column(String(40), nullable=True)         # optional: 'doc' | 'drive' | 'repo' | 'sheet' | ...
    added_by_id = Column(Integer, ForeignKey("people.id", ondelete="SET NULL"), nullable=True)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    updated_at  = Column(DateTime(timezone=True), onupdate=func.now())
    is_pinned   = Column(Boolean, nullable=False, default=False)
    sort_order  = Column(Integer, nullable=False, default=0)

    project = relationship("Project", backref="links", lazy="joined")
    added_by = relationship("Person", lazy="joined")

    __table_args__ = (
        UniqueConstraint("project_id", "url", name="uq_project_link_url"),
    )

