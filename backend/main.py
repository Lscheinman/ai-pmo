import base64, uvicorn
from fastapi import FastAPI, Depends, UploadFile, File, HTTPException, Query, Response, status, Path
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import StreamingResponse
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
# Internal imports
from db import schemas, database, crud
from db.models import Task, Project, KnowledgeDoc
from services.ai_client import generate_grounded_response, generate_node_summary, compose_email_from_graph, generate_daily_plan
from services.exporter import build_export, Entity, Format
from services.report_generator import build_report
from setup.seeders.seeder import seed_all
from setup import utils
from setup.seeders.seed_from_csv import seed_from_csv
from setup.seeders.seed_random import seed_random


database.init_db()
app = FastAPI(
    title="PMO API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url=None,
    openapi_url="/openapi.json",
)

# CORS for frontend (adjust as needed)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Type"]
)

def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --- PROJECTS ---
@app.get("/api/projects/", response_model=List[schemas.ProjectResponse], tags=["Projects"])
def list_projects(db: Session = Depends(get_db)):
    return crud.get_projects(db)

@app.post("/api/projects/", response_model=schemas.ProjectResponse, tags=["Projects"])
def create_project(project: schemas.ProjectCreate, db: Session = Depends(get_db)):
    return crud.create_project(db, project)

@app.get("/api/project/{project_id}", response_model=schemas.ProjectResponse, tags=["Projects"])
def get_project(project_id: int, db: Session = Depends(get_db)):
    return crud.get_project(db, project_id)

@app.put("/api/projects/{project_id}", response_model=schemas.ProjectResponse, tags=["Projects"])
def update_project(project_id: int, project: schemas.ProjectCreate, db: Session = Depends(get_db)):
    return crud.update_project(db, project_id, project)

@app.delete("/api/projects/{project_id}", tags=["Projects"])
def delete_project(project_id: int, db: Session = Depends(get_db)):
    crud.delete_project(db, project_id)
    return {"ok": True}

# --- TASKS ---
@app.get("/api/tasks/", response_model=List[schemas.Task], tags=["Tasks"])
def list_tasks(project_id: int = None, db: Session = Depends(get_db)):
    return crud.get_tasks(db, project_id)

@app.get("/api/tasks/{task_id}", response_model=schemas.Task, tags=["Tasks"])
def read_task(task_id: int, db: Session = Depends(get_db)):
    task = crud.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@app.put("/api/tasks/{task_id}", response_model=schemas.Task, tags=["Tasks"])
def update_task(task_id: int, task: schemas.TaskCreate, db: Session = Depends(get_db)):
    updated = crud.update_task(db, task_id, task)
    return updated

@app.post("/api/tasks/", response_model=schemas.Task, tags=["Tasks"])
def create_task(task: schemas.TaskCreate, db: Session = Depends(get_db)):
    created = crud.create_task(db, task)
    return created

@app.delete("/api/tasks/{task_id}", status_code=204, tags=["Tasks"])
def delete_task(task_id: int, db: Session = Depends(get_db)):
    ok = crud.delete_task(db, task_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Task not found")
    return


@app.post("/api/tasks/{task_id}/attachments/", response_model=schemas.TaskAttachment, tags=["Tasks"])
def upload_task_attachment(task_id: int, attachment: schemas.TaskAttachmentCreate, db: Session = Depends(get_db)):
    return crud.add_task_attachment(db, task_id, attachment)

# --- PEOPLE ---
@app.post("/api/people/", response_model=schemas.PersonRead,
          status_code=status.HTTP_201_CREATED, tags=["People"],
          responses={409: {"description": "Email already exists"}})
def create_person(person: schemas.PersonCreate, db: Session = Depends(get_db)):
    return crud.create_person(db, person)

@app.get("/api/people/", response_model=List[schemas.Person], tags=["People"])
def list_people(db: Session = Depends(get_db)):
    return crud.get_people(db)

@app.get("/api/people/{person_id}", response_model=schemas.PersonRead, tags=["People"])
def get_person(person_id: int, db: Session = Depends(get_db)):
    return crud.get_person(db, person_id)

@app.put("/api/people/{person_id}", response_model=schemas.PersonRead, tags=["People"])
def update_person(person_id: int, person: schemas.PersonCreate, db: Session = Depends(get_db)):
    return crud.update_person(db, person_id, person)

@app.delete("/api/people/{person_id}", tags=["People"])
def delete_person(person_id: int, db: Session = Depends(get_db)):
    crud.delete_person(db, person_id)
    return {"ok": True}

# --- GROUPS ---
@app.post("/api/groups/", response_model=schemas.GroupRead, tags=["Groups"])
def create_group(group: schemas.GroupCreate, db: Session = Depends(get_db)):
    return crud.create_group(db, group)

@app.get("/api/groups/", response_model=List[schemas.GroupRead], tags=["Groups"])
def list_groups(db: Session = Depends(get_db)):
    return crud.get_groups(db)

@app.put("/api/groups/{group_id}", response_model=schemas.GroupRead, tags=["Groups"])
def update_group(group_id: int, group: schemas.GroupCreate, db: Session = Depends(get_db)):
    return crud.update_group(db, group_id, group)

@app.delete("/api/groups/{group_id}", tags=["Groups"])
def delete_group(group_id: int, db: Session = Depends(get_db)):
    crud.delete_group(db, group_id)
    return {"ok": True}

@app.post("/api/groups/{group_id}/add_person/{person_id}", response_model=schemas.GroupRead, tags=["Groups"])
def add_person_to_group(group_id: int, person_id: int, db: Session = Depends(get_db)):
    return crud.add_person_to_group(db, group_id, person_id)

@app.post("/api/groups/{group_id}/remove_person/{person_id}", response_model=schemas.GroupRead, tags=["Groups"])
def remove_person_from_group(group_id: int, person_id: int, db: Session = Depends(get_db)):
    return crud.remove_person_from_group(db, group_id, person_id)

# --- TAGS ---
@app.get("/api/tags/", response_model=List[schemas.Tag], tags=["Tags"])
def list_tags(db: Session = Depends(get_db)):
    return crud.get_tags(db)

@app.post("/api/tags/", response_model=schemas.Tag, tags=["Tags"])
def create_tag(tag: schemas.TagCreate, db: Session = Depends(get_db)):
    return crud.create_tag(db, tag)

@app.get("/api/tags/search", response_model=List[schemas.Tag], tags=["Tags"])
def search_tags(q: str = "", db: Session = Depends(get_db)):
    return crud.search_tags(db, q)

@app.get("/api/{object_type}/{object_id}/tags", response_model=List[schemas.Tag], tags=["Tags"])
def get_tags_for_object(object_type: str, object_id: int, db: Session = Depends(get_db)):
    return crud.get_tags_for_object(db, object_type, object_id)

@app.post("/api/{object_type}/{object_id}/tags", tags=["Tags"])
def set_tags_for_object(object_type: str, object_id: int, payload: schemas.TagIDs, db: Session = Depends(get_db)):
    crud.set_tags_for_object(db, object_type, object_id, payload.tag_ids)
    return {"status": "ok"}

# --- IMPORTS (Projects, etc) ---
@app.post("/api/import/", tags=["Admin"])
def import_excel(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = base64.b64encode(file.file.read()).decode()
    utils.parse_excel(
        f"data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,{content}", db
    )
    utils.parse_groups_excel(
        f"data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,{content}", db
    )
    return {"ok": True}

@app.get("/api/graph/network", response_model=schemas.GraphNetworkResponse, tags=["Graph"])
def get_graph_network(db: Session = Depends(get_db)):
    """
    Get the operational/project graph data.
    """
    graph = crud.get_graph_network(db)
    return graph

@app.post("/api/graph/ai/query", tags=["Graph"])
def ai_query_handler(payload: schemas.AIQuery, db: Session = Depends(get_db)):
    return generate_grounded_response(payload.question, db)

@app.post("/api/graph/ai/node_summary", response_model=schemas.NodeSummaryOut, tags=["Graph"])
def graph_ai_node_summary(payload: schemas.NodeSummaryIn, db: Session = Depends(get_db)):
    """
    Build a small ego graph around the node, generate a grounded summary,
    persist it as AI history via CRUD, and return it.
    """
    summary, ego_graph, object_type, object_id, entity_labels = generate_node_summary(payload.node_id, db)

    rec = crud.create_ai_recommendation(
        db,
        schemas.GraphAiRecCreate(
            object_type=object_type,          # 'person'|'project'|'task'|'group'
            object_id=str(object_id),
            kind=payload.kind or "summary",
            summary=summary,
            meta={
                "center_id": payload.node_id,
                "ego_size": {"nodes": len(ego_graph["nodes"]), "edges": len(ego_graph["edges"])},
            },
        ),
    )
    return schemas.NodeSummaryOut(
        node_id=payload.node_id,
        object_type=object_type,
        object_id=str(object_id),
        kind=payload.kind or "summary",
        summary=summary,
        rec_id=rec.id,
        graph=ego_graph,
        entity_labels=entity_labels
    )

@app.post("/api/graph/ai/recommendations", response_model=schemas.GraphAiRecOut, status_code=201, tags=["Graph"])
def create_graph_ai_recommendation(payload: schemas.GraphAiRecCreate, db: Session = Depends(get_db)):
    rec = crud.create_ai_recommendation(db, payload)
    return schemas.GraphAiRecOut(
        id=rec.id,
        object_type=rec.object_type,
        object_id=rec.object_id,
        kind=rec.kind,
        summary=rec.summary,
        meta=rec.meta,
        created_at=rec.created_at,
    )

@app.get("/api/graph/ai/recommendations", response_model=list[schemas.GraphAiRecOut], tags=["Graph"])
def list_graph_ai_recommendations(
    object_type: str = Query(..., pattern="^(person|project|task|group)$"),
    object_id: str = Query(...),
    kind: Optional[str] = Query(None, pattern="^(summary|nba)$"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    rows = crud.list_ai_recommendations(db, object_type, object_id, kind, limit)
    return [
        schemas.GraphAiRecOut(
            id=r.id,
            object_type=r.object_type,
            object_id=r.object_id,
            kind=r.kind,
            summary=r.summary,
            meta=r.meta,
            created_at=r.created_at,
        )
        for r in rows
    ]


@app.post("/api/admin/seed/random", tags=["Admin"])
def seed_random_endpoint(
    people: int = Query(60, ge=1, le=500),
    projects: int = Query(6, ge=1, le=100),
    groups: int = Query(4, ge=0, le=50),
    seed: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    return seed_random(
        db,
        people_count=people,
        project_count=projects,
        group_count=groups,
        seed=seed,
    )


@app.get("/api/seed_database", tags=["Admin"])
def seed_database(db: Session = Depends(get_db)):
    """
    One-time seeding of tags, tasks, people relationships, and assignments.
    Returns a report of what was seeded.
    """
    report = seed_all(db)
    return {"status": "Database seeded", "report": report}

@app.get("/api/seed_from_csv", tags=["Admin"])
def seed_database_from_csv(db: Session = Depends(get_db)):
    """
    One-time seeding of tags, tasks, people relationships, and assignments from CSV files in /backend/data.
    Returns a report of what was seeded.
    """
    report = seed_from_csv(db)
    return {"status": "Database seeded from CSV", "report": report}


@app.get("/api/people/{person_id}/relations", response_model=List[schemas.PersonRelationRead], tags=["People"])
def list_person_relations(person_id: int, db: Session = Depends(get_db)):
    return crud.get_person_relations(db, person_id)

@app.post("/api/people/{from_person_id}/relations", response_model=schemas.PersonRelationRead, tags=["People"], status_code=201)
def create_relation(from_person_id: int, body: schemas.PersonRelationCreate, db: Session = Depends(get_db)):
    return crud.create_person_relation(db, from_person_id, body)

@app.patch(
    "/relations/{rel_id}",
    response_model=schemas.PersonRelationRead,
    tags=["People"]
)
def patch_relation(rel_id: int, patch: schemas.PersonRelationUpdate, db: Session = Depends(get_db)):
    return crud.update_person_relation(db, rel_id, patch)

@app.delete("/api/relations/{rel_id}", tags=["People"])
def delete_relation(rel_id: int, db: Session = Depends(get_db)):
    ok = crud.delete_person_relation(db, rel_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Relation not found")
    return {"ok": True}


@app.post("/api/graph/ai/compose_email", response_model=schemas.ComposeEmailOut, tags=["Graph"])
def graph_ai_compose_email(payload: schemas.ComposeEmailIn, db: Session = Depends(get_db)):
    return compose_email_from_graph(db, payload)

@app.get("/api/export", tags=["Admin"])
def export_endpoint(
    entity: Entity = Query("all"),
    ids: Optional[str] = Query(None, description="Comma-separated ids; used when entity != all"),
    format: Format = Query("csv"),
    db: Session = Depends(get_db)
):
    try:
        id_list = [int(x) for x in ids.split(",")] if ids else None
    except ValueError:
        raise HTTPException(status_code=400, detail="ids must be comma-separated integers")

    try:
        content, mime, filename = build_export(entity, id_list, format, db)
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return Response(
        content=content,
        media_type=mime,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@app.post("/api/projects/{project_id}/assign", tags=["Projects"])
def assign_people_to_project(project_id: int, payload: schemas.AssignPayload, db: Session = Depends(get_db)):
    proj = db.get(Project, project_id)
    if not proj:
        raise HTTPException(status_code=404, detail=f"Project {project_id} not found")
    rows = crud.add_people_to_project_with_role(db, project_id, payload.person_ids, payload.role)
    return {"ok": True, "count": len(rows)}

@app.post("/api/tasks/{task_id}/assign", tags=["Tasks"])
def assign_people_to_task(task_id: int, payload: schemas.AssignPayload, db: Session = Depends(get_db)):
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    rows = crud.add_people_to_task_with_role(db, task_id, payload.person_ids, payload.role)
    return {"ok": True, "count": len(rows)}

@app.get("/api/projects/{project_id}/links", response_model=List[schemas.ProjectLinkOut], tags=["Links"])
def get_project_links(project_id: int, db: AsyncSession = Depends(get_db)):
    return crud.list_project_links(db, project_id)

@app.post("/api/projects/{project_id}/links", response_model=schemas.ProjectLinkOut, tags=["Links"])
def post_project_link(project_id: int, payload: schemas.ProjectLinkCreate, db: AsyncSession = Depends(get_db)):
    try:
        link = crud.create_project_link(db, project_id, payload)
        db.commit()
        db.refresh(link)
        return link
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(e))

@app.put("/api/links/{link_id}", response_model=schemas.ProjectLinkOut, tags=["Links"])
def put_project_link(link_id: int, payload: schemas.ProjectLinkUpdate, db: AsyncSession = Depends(get_db)):
    link = crud.update_project_link(db, link_id, payload)
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    db.commit()
    db.refresh(link)
    return link

@app.delete("/api/links/{link_id}", tags=["Links"])
def delete_link(link_id: int, db: AsyncSession = Depends(get_db),):
    ok = crud.delete_project_link(db, link_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Link not found")
    db.commit()
    return {"ok": True}

@app.post("/api/ai/daily-plan", response_model=schemas.DailyPlanResponse, tags=["AI"])
def daily_plan_endpoint(req: schemas.DailyPlanRequest, db: Session = Depends(get_db)):
    return generate_daily_plan(db, req)

@app.get("/api/reports/{project_id}", tags=["AI"])
def generate_report(
    project_id: int = Path(..., ge=1),
    report_type: str = Query("summary", description="One of: 'summary' (extendable)"),
    template: Optional[str]  = Query(None, description="Override template filename in /backend/templates"),
    attach: bool = Query(True, description="If true, sets Content-Disposition: attachment"),
    persist: bool = Query(False, description="If true, saves a KnowledgeDoc record"),
    db: Session = Depends(get_db),
):
    """
    Build a PPTX report for the given project and stream it back.
    """
    # Build bytes via your service (PII-safe; sanitized AI for summary)
    ppt_bytes = build_report(db, project_id, report_type=report_type, template_override=template)

    filename = f"project_{project_id}_{report_type}.pptx"
    headers = {}
    if attach:
        headers["Content-Disposition"] = f'attachment; filename="{filename}"'

    # Optional: persist a knowledge record for provenance
    if persist:
        try:
            kd = KnowledgeDoc(
                project_id=project_id,
                task_id=None,
                title=f"{report_type.title()} Report for project_{project_id}",
                filename=filename,
                mime_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
                meta_json=None,
            )
            db.add(kd)
            db.commit()
        except Exception:
            db.rollback()
            # We don't fail the download if persistence fails, but you can raise here if desired.

    return StreamingResponse(
        content=iter([ppt_bytes]),
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers=headers,
    )

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
