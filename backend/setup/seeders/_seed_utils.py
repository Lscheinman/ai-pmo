# pmo/backend/setup/seeders/_seed_utils.py
from __future__ import annotations
from pathlib import Path
from datetime import date
import re

def resolve_demo_data_dir() -> Path:
    """
    Always points to pmo/backend/setup/demo-data
    regardless of where this file is called from.
    """
    here = Path(__file__).resolve()                # .../pmo/backend/setup/seeders/_seed_utils.py
    return here.parents[1] / "demo-data"           # .../pmo/backend/setup/demo-data

def parse_date_or_none(s: str | None) -> date | None:
    s = (s or "").strip()
    if not s:
        return None
    # Expect ISO (YYYY-MM-DD)
    try:
        return date.fromisoformat(s[:10])
    except Exception:
        return None

_email_ok = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

def safe_email(raw: str | None, fallback_name: str, used: set[str]) -> str:
    """
    - If raw looks valid, use it
    - If it's blank or has a forbidden TLD (e.g. .local), synthesize example.com
    - Guarantees global uniqueness within a run
    """
    candidate = (raw or "").strip().lower()
    # reject .local and clearly bad domains early
    if not candidate or candidate.endswith(".local") or not _email_ok.match(candidate):
        base = re.sub(r"[^a-z0-9]+", ".", fallback_name.strip().lower()).strip(".") or "user"
        n = 0
        while True:
            e = f"{base}{n or ''}@example.com"
            if e not in used:
                candidate = e
                break
            n += 1
    # global uniqueness in any case
    n = 0
    base, at, dom = candidate.partition("@")
    while candidate in used:
        n += 1
        candidate = f"{base}+{n}@{dom}"
    used.add(candidate)
    return candidate

def reindex_checklist_items(rows: list[dict]) -> list[dict]:
    """
    Accepts rows for ONE task. Sort by provided 'order' (if any) and
    returns the same rows with order re-assigned to 0..n-1 (unique).
    Expected keys: title, status, order (optional).
    """
    def keyfn(r):
        try:
            return int(r.get("order"))
        except Exception:
            return 10_000_000
    sorted_rows = sorted(rows, key=lambda r: (keyfn(r), (r.get("title") or "")))
    for i, r in enumerate(sorted_rows):
        r["order"] = i
    return sorted_rows
