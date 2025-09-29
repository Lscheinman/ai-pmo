from __future__ import annotations
import os
from typing import Sequence
from sqlalchemy.orm import Session
from sqlalchemy import select
import json
import math
from db import models
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from db.models import Base

# Get the directory of this file
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "projects.db")

# SQLite absolute path form
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)


def _cosine(a: Sequence[float], b: Sequence[float]) -> float:
    num = 0.0; da = 0.0; db = 0.0
    for x, y in zip(a, b):
        num += x * y
        da += x * x
        db += y * y
    if da == 0 or db == 0:
        return 0.0
    return num / math.sqrt(da * db)

class PythonVectorStore:
    """Portable vector store on top of your existing DB."""
    def __init__(self, dim: int = 1536):
        self.dim = dim

    # --- writes ---
    def insert_doc(self, db: Session, *, project_id: int, task_id: int | None,
                   title: str, filename: str, mime_type: str, meta: dict) -> int:
        doc = models.KnowledgeDoc(
            project_id=project_id,
            task_id=task_id,
            title=title,
            filename=filename,
            mime_type=mime_type,
            meta_json=json.dumps(meta or {}, ensure_ascii=False),
        )
        db.add(doc)
        db.flush()
        return int(doc.id)

    def insert_chunks(self, db: Session, *, doc_id: int,
                      texts: Sequence[str], embeddings: Sequence[Sequence[float]]):
        for i, (t, vec) in enumerate(zip(texts, embeddings)):
            db.add(models.KnowledgeChunk(
                doc_id=doc_id, idx=i, text=t,
                embedding=json.dumps(list(vec)), tokens=max(1, len(t)//4)
            ))
        db.commit()

    # --- reads ---
    def top_k_by_task(self, db: Session, *, task_id: int, qvec: Sequence[float], k: int = 8) -> list[dict]:
        q = (
            select(models.KnowledgeChunk.text, models.KnowledgeChunk.embedding)
            .join(models.KnowledgeDoc, models.KnowledgeDoc.id == models.KnowledgeChunk.doc_id)
            .where(models.KnowledgeDoc.task_id == task_id)
        )
        rows = db.execute(q).all()
        scored = []
        for text_val, emb_json in rows:
            try:
                vec = json.loads(emb_json)
            except Exception:
                continue
            scored.append((_cosine(qvec, vec), text_val))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [{"text": t, "score": s} for s, t in scored[:k]]


    def top_k_by_project(self, db: Session, *, project_id: int,
                         qvec: Sequence[float], k: int = 8) -> list[dict]:
        q = (
            select(models.KnowledgeChunk.text, models.KnowledgeChunk.embedding)
            .join(models.KnowledgeDoc, models.KnowledgeDoc.id == models.KnowledgeChunk.doc_id)
            .where(models.KnowledgeDoc.project_id == project_id)
        )
        rows = db.execute(q).all()
        scored = []
        for text_val, emb_json in rows:
            try:
                vec = json.loads(emb_json)
            except Exception:
                continue
            scored.append(( _cosine(qvec, vec), text_val ))
        scored.sort(key=lambda x: x[0], reverse=True)

        return [{"text": t, "score": s} for s, t in scored[:k]] 