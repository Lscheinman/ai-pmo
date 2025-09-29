# PMO Agent

A lightweight **Project/Task/Person/Group/Tag** app with a graph view and optional AI helpers.
Use it like an **intelligence analyst meets project manager**: track RACI, explore relationships, and act fast.

**Live demo:** [https://pmo-demo.cfapps.ap10.hana.ondemand.com/](https://pmo-demo.cfapps.ap10.hana.ondemand.com/)

---

## Quickstart

### Run locally (no Docker)

**Prereqs:** Python 3.11+, Node 18+

**Backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Optional: set a DB (SQLite by default)
export DATABASE_URL=sqlite:///./dev.db

uvicorn main:app --reload --port 8000
# Swagger (local): http://localhost:8000/docs
```

**Frontend (in a new terminal)**

```bash
cd frontend
npm install
# Point the UI to your local API:
echo "VITE_API_BASE=http://localhost:8000" > .env.local
npm run dev
# App: http://localhost:5173
```

**(Optional) Seed demo data**

* If backend runs at root: `curl http://localhost:8000/seed_database`
* If you started it with a root path `/api`: `curl http://localhost:8000/api/seed_database`

---

## Run with Docker

### Dev-ish (simple)

```bash
docker compose up -d --build
# App:  http://localhost:8080
# API:  http://localhost:8080/api
# Docs: http://localhost:8080/api/docs
```

> If you see environment variable warnings, create a `.env` in repo root (only needed for AI features):
>
> ```
> AICORE_CLIENT_ID=...
> AICORE_CLIENT_SECRET=...
> AICORE_AUTH_URL=...
> AICORE_BASE_URL=...
> AICORE_RESOURCE_GROUP=...
> ```

**Seed demo data**

```bash
curl http://localhost:8080/api/seed_database
```

**Logs / Stop**

```bash
docker compose logs -f
docker compose down
```

---

## What’s inside (1-liner)

* **Backend:** FastAPI + SQLAlchemy + SQLite (or Postgres) — Swagger at `/api/docs`
* **Frontend:** React + Vite — calls API via `VITE_API_BASE` (defaults to `/api`)
* **Nice to have:** Graph view, compact Gantt, RACI on projects & tasks, optional AI summaries/emails

## Cloud Foundry commands
* cf push -f manifest-api.yml --vars-file cf-vars.yml
* cf push -f manifest-web.yml
---