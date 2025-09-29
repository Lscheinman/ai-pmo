from pydantic import BaseModel, EmailStr, Field, AliasChoices, ConfigDict, HttpUrl, field_validator
from typing import Optional, List, Any, Dict, Union, Literal
from datetime import date


class AssignPayload(BaseModel):
    person_ids: list[int]
    role: str  # accepts R/A/C/I or full name

# --- TAG ---
class TagBase(BaseModel):
    name: str

class TagCreate(TagBase):
    pass

class Tag(TagBase):
    id: int
    class Config:
        from_attributes = True

class TagIDs(BaseModel):
    tag_ids: List[int]

# ---- Base: Shared fields across schemas ----
class PersonBase(BaseModel):
    name: str
    email: EmailStr
    notes: Optional[str] = None

    class Config:
        from_attributes = True

class PersonInputBase(BaseModel):
    """Strict input validation (used for create/update)."""
    name: str
    email: EmailStr
    notes: Optional[str] = None
    class Config:
        from_attributes = True

class PersonOutputBase(BaseModel):
    """Relaxed output (used for responses) so demo/intranet emails don't 500."""
    name: str
    email: Optional[str] = None
    notes: Optional[str] = None
    class Config:
        from_attributes = True

class PersonCreate(PersonInputBase):
    # Optional list of tag IDs to associate on create
    tag_ids: Optional[List[int]] = []

class PersonUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None  # still strict on inputs
    notes: Optional[str] = None
    tag_ids: Optional[List[int]] = None
    class Config:
        from_attributes = True

class Tag(BaseModel):
    id: int
    name: str
    class Config:
        from_attributes = True

class Person(PersonOutputBase):
    """ORM shape you may use internally; relaxed email for safety."""
    id: int
    tags: List[Tag] = []
    class Config:
        from_attributes = True

class PersonRead(PersonOutputBase):
    """API response model (use this for endpoints)."""
    id: int
    tags: List[Tag] = []
    class Config:
        from_attributes = True


 # --- GROUP ---
class GroupBase(BaseModel):
    name: str
    parent_id: Optional[int] = None

class Group(GroupBase):
    id: int
    members: List[Person] = []
    class Config:
        from_attributes = True

class GroupCreate(GroupBase):
    member_ids: List[int] = []

class GroupRead(GroupBase):
    id: int
    members: List[PersonRead] = []
    class Config:
        from_attributes = True

# --- TASK ATTACHMENT ---
class TaskAttachmentBase(BaseModel):
    filename: str
    content_type: Optional[str] = None

class TaskAttachmentCreate(TaskAttachmentBase):
    data: str  # base64 string or file path/URL

class TaskAttachment(TaskAttachmentBase):
    id: int
    task_id: int
    data: str  # TODO: only URL in prod!
    class Config:
        from_attributes = True

# --- TASK ---

RecurrenceUnit = Literal["day", "week", "month", "year"]
ChecklistStatus = Literal["not started", "started", "blocked", "complete"]  


class TaskBase(BaseModel):
    name: str
    description: Optional[str] = ""
    type: Optional[str] = "task"  # "task", "use_case", etc.
    start: Optional[date] = None
    end: Optional[date] = None
    priority: Optional[str] = "medium"  
    status: Optional[str] = "not started" 
    is_continuous: bool = False
    recurrence_unit: Optional[RecurrenceUnit] = None   # one of: day/week/month/year
    recurrence_interval: int = 1   

class TaskChecklistItemBase(BaseModel):
    title: str
    status: Optional[str] = "not started"
    order: Optional[int] = 0

class TaskChecklistItemCreate(TaskChecklistItemBase):
    id: Optional[int] = None  # allow client to send null/new items

class TaskChecklistItemRead(TaskChecklistItemBase):
    id: int

class TaskChecklistItemIn(BaseModel):
    """
    For create/update (upsert). `id` optional:
      - If provided and found -> update
      - If omitted -> create
    """
    id: Optional[int] = None
    title: str
    status: Optional[ChecklistStatus] = "not started"
    order: Optional[int] = 0

    # Normalize status defensively (accepts loose casing/spacing)
    @field_validator("status", mode="before")
    @classmethod
    def _norm_status(cls, v):
        if v is None:
            return "not started"
        s = str(v).strip().lower()
        return s if s in {"not started", "started", "blocked", "complete"} else "not started"

class TaskChecklistItem(BaseModel):
    """
    Read shape returned to clients.
    """
    id: int
    title: str
    status: ChecklistStatus = "not started"
    order: int = 0

    class Config:
        from_attributes = True

class TaskAssignee(BaseModel):
    person_id: int
    role: str
    class Config:
        from_attributes = True

class TaskCreate(TaskBase):
    project_id: int
    task_assignees: List[TaskAssignee] = Field(
        default_factory=list,
        validation_alias=AliasChoices("task_assignees", "assignees")
    )
    tag_ids: List[int] = Field(default_factory=list)

    checklist: List[TaskChecklistItemIn] = Field(
        default_factory=list,
        validation_alias=AliasChoices("checklist", "checklist_items")
    )

class Task(BaseModel):
    id: int
    name: str
    description: Optional[str] = ""
    type: Optional[str] = "task"
    start: Optional[date] = None
    end: Optional[date] = None
    priority: Optional[str] = "medium"
    status: Optional[str] = "not started"
    project_id: Optional[int]

    is_continuous: bool = False
    recurrence_unit: Optional[RecurrenceUnit] = None
    recurrence_interval: int = 1

    task_assignees: List[TaskAssignee] = Field(
        default_factory=list,
        serialization_alias="assignees",
        validation_alias=AliasChoices("task_assignees", "assignees")
    )
    tags: List["Tag"] = Field(default_factory=list)
    attachments: List["TaskAttachment"] = Field(default_factory=list)
    checklist: List[TaskChecklistItem] = Field(
        default_factory=list,
        serialization_alias="checklist",
        validation_alias=AliasChoices("checklist", "checklist_items"),
    )

    class Config:
        from_attributes = True
        validate_by_name = True


# --- PROJECT ---
class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = ""
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[str] = "Planned"

class ProjectLead(BaseModel):
    person_id: int
    role: str
    class Config:
        from_attributes = True

class ProjectCreate(ProjectBase):
    name: str
    description: Optional[str]
    start_date: Optional[date]
    end_date: Optional[date]
    status: Optional[str]
    tasks: Optional[List[Task]] = []
    project_leads: Optional[List[ProjectLead]] = []
    tags: Optional[List[Tag]] = []

class ProjectResponse(ProjectBase):
    id: int
    name: str
    description: Optional[str]
    start_date: Optional[date]
    end_date: Optional[date]
    status: Optional[str]
    tasks: Optional[List[Task]] = []
    project_leads: Optional[List[ProjectLead]] = []
    tags: Optional[List[Tag]] = []

class Project(ProjectBase):
    id: int
    groups: List[Group] = []
    tasks: List[Task] = []
    class Config:
        from_attributes = True

# ---- Graph Schema Metadata ----
class SchemaEdgeDef(BaseModel):
    type: str
    from_: str = Field(..., alias="from")  # internal name from_ → JSON key "from"
    to: str

    class Config:
        population_by_name = True


class SchemaDef(BaseModel):
    nodes: List[str]
    edges: List[SchemaEdgeDef]


# ---- Graph Data ----
class AIQuery(BaseModel):
    question: str

class NodeData(BaseModel):
    id: str
    label: Optional[str] = None
    type: Optional[str] = None
    status: Optional[str] = None
    email: Optional[str] = None  # still handled safely in frontend

    # Store any extra attributes the AI might generate
    detail: Dict[str, Any] = Field(default_factory=dict)

    class Config:
        detail = "allow" 


class EdgeData(BaseModel):
    source: str
    target: str
    type: Optional[str] = None
    role: Optional[str] = None


class GraphNode(BaseModel):
    data: NodeData


class GraphEdge(BaseModel):
    data: EdgeData


class GraphData(BaseModel):
    nodes: List[GraphNode]
    edges: List[GraphEdge]


# ---- Full Graph Response ----
class GraphNetworkResponse(BaseModel):
    schema_: SchemaDef = Field(..., alias="schema")  # avoid shadowing BaseModel.schema()
    graph: GraphData

    class Config:
        populate_by_name = True

# ---- Node-centric summary ----
class NodeSummaryIn(BaseModel):
    node_id: str = Field(..., description="Graph node id, e.g. 'task_12', 'person_3'")
    kind: str = Field(default="summary", pattern="^(summary|nba)$")

class NodeSummaryOut(BaseModel):
    node_id: str
    object_type: str
    object_id: str
    kind: str
    summary: str
    rec_id: Optional[str] = None
    graph: Dict[str, Any]
    entity_labels: Dict[str, str] = Field(default_factory=dict)

# ---- AI recommendation storage ----
class GraphAiRecCreate(BaseModel):
    object_type: str = Field(..., pattern="^(person|project|task|group)$")
    object_id: str
    kind: str = Field(default="summary", pattern="^(summary|nba)$")
    summary: str
    meta: Optional[Dict[str, Any]] = None

class GraphAiRecOut(GraphAiRecCreate):
    id: str
    created_at: date
    created_by: Optional[str] = None

class NodeSummaryIn(BaseModel):
    node_id: str
    kind: str = Field(default="summary", pattern="^(summary|nba)$")

# --- PEOPLE RELATIONS ---

class PersonRelationCreate(BaseModel):
    to_person_id: int
    type: str                     # "manages" | "mentor" | "peer" | "co_located"
    note: Optional[str] = None

    class Config:
        from_attributes = True


class PersonRelationUpdate(BaseModel):
    type: Optional[str] = None    # same allowed set as above
    note: Optional[str] = None

    class Config:
        from_attributes = True


class PersonRelationRead(BaseModel):
    id: int
    from_person_id: int
    to_person_id: int
    type: str
    note: Optional[str] = None

    # Reuse your existing read schema so the modal can show names/emails.
    # (If you want a lighter payload, swap PersonRead -> a tiny stub.)
    from_person: Optional[PersonRead] = None
    to_person: Optional[PersonRead] = None

    class Config:
        from_attributes = True

# --- Communication Agent (Compose Email) ---

class ComposeEmailPolicy(BaseModel):
    toRoles: List[str] = ["Lead", "Owner", "Project Manager", "Responsible"]
    ccRoles: List[str] = ["Contributor", "Stakeholder"]
    exclude: Dict[str, List[str]] = {"domains": ["noreply", "do-not-reply"]}
    dedupe: bool = True
    language: str = "en"
    tone: str = "concise-pmo-neutral"

class ComposeEmailOptions(BaseModel):
    includeProvenance: bool = True
    includeRecentActivity: bool = True
    maxBullets: int = 6
    dateFormat: str = "YYYY-MM-DD"
    degrees: int = 2
    maxNodes: int = 600
    maxEdges: int = 1200

class ComposeEmailIn(BaseModel):
    # accept either "project_1"/"task_42" or {"type":"project","id":1}
    entity: Union[str, Dict[str, Any]]
    mode: str = Field(pattern="^(status|unblocker|risk|standup)$")
    policy: ComposeEmailPolicy = ComposeEmailPolicy()
    options: ComposeEmailOptions = ComposeEmailOptions()

class ComposeEmailOut(BaseModel):
    to: List[str]
    cc: List[str] = []
    subject: str
    body: str
    meta: Dict[str, Any] = {}


# ---------- Device code flow ----------

class DeviceCodeStartRequest(BaseModel):
    client_id: str = Field(..., description="Azure AD App (Application) ID")
    tenant_id: str = Field(..., description="Directory (tenant) ID")


class DeviceCodeStartResponse(BaseModel):
    device_flow: Dict[str, Any]  # includes verification_uri, user_code, message, device_code, expires_in, interval


class DeviceCodePollRequest(BaseModel):
    client_id: str
    tenant_id: str
    device_flow: Dict[str, Any]  # full flow dict returned by /device-code/start


class TokenResponse(BaseModel):
    token_type: Optional[str] = None
    scope: Optional[str] = None
    expires_in: Optional[int] = None
    access_token: Optional[str] = None
    id_token_claims: Optional[Dict[str, Any]] = None


# ---------- Messages ----------

class MessagesQuery(BaseModel):
    access_token: str = Field(..., description="Bearer token from /email/device-code/poll")
    top: int = Field(10, ge=1, le=50)
    query: Optional[str] = Field(
        None,
        description="Optional $search string, e.g. from:alice@contoso.com or subject:\"status\"",
    )


class MessageItem(BaseModel):
    # pydantic v2: allow alias population when FastAPI returns JSON with 'from'
    model_config = ConfigDict(populate_by_name=True)

    id: Optional[str] = None
    subject: Optional[str] = None
    from_: Optional[Dict[str, Any]] = Field(None, alias="from")
    receivedDateTime: Optional[str] = None


class MessagesResponse(BaseModel):
    value: List[MessageItem]


class ProjectLinkBase(BaseModel):
    title: Optional[str] = None
    url: HttpUrl
    description: Optional[str] = None
    kind: Optional[str] = None
    is_pinned: bool = False
    sort_order: int = 0
    added_by_id: Optional[int] = None

    @field_validator("url", mode="before")
    @classmethod
    def normalize_url(cls, v):
        # Accept bare host or missing scheme -> default to https
        s = str(v).strip()
        if s and "://" not in s:
            s = "https://" + s
        return s

class ProjectLinkCreate(ProjectLinkBase):
    pass

class ProjectLinkUpdate(ProjectLinkBase):
    pass

class ProjectLinkOut(ProjectLinkBase):
    id: int
    project_id: int

    class Config:
        from_attributes = True


# ---------- Daily Plan (AI generated tasks) ----------

class DailyPlanRequest(BaseModel):
  date: Optional[str] = None
  windowDays: int = 3
  maxItems: int = 40
  includeSuggestions: bool = True

class PersonLite(BaseModel):
  id: int
  name: Optional[str] = None

class DailyPlanItem(BaseModel):
  id: str
  kind: str
  title: str
  desc: Optional[str] = None
  priority: str = "medium"
  urgency: str = "today"
  reason: Optional[str] = None
  effort: Optional[str] = None
  dueDate: Optional[str] = None
  taskId: Optional[int] = None
  projectId: Optional[int] = None
  projectName: Optional[str] = None
  assignees: list[PersonLite] = []
  blockedBy: list[str] = []
  isContinuous: Optional[bool] = None
  tags: list[str] = []

class DailyPlanResponse(BaseModel):
  date: str
  generatedAt: str
  sections: dict[str, list[DailyPlanItem]]
  counts: dict[str, int]