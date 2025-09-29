"""
Email → Name suggester

Reads an Excel file with a column of email addresses and outputs an Excel/CSV
with a suggested human-readable full name, confidence, and notes.

Heuristics (language-agnostic, no external deps beyond pandas/openpyxl):
- Handles separators: ".", "_", "-", "+".
- Strips trailing digits from tokens (e.g., "john.smith23" → "john smith").
- Recognizes patterns: first.last, last.first, first.m.last, f.last, first.l, mononym, etc.
- Generates a fallback "Needs Validation" suggestion when confidence is low.
- Outputs columns: email, suggested_full_name, confidence (0-1), band, method, notes, needs_validation.

Usage:
    python email_name_suggester.py --input emails.xlsx --sheet Sheet1 --email-col email --output emails_named.xlsx

You can also pass CSV files; output format chosen by extension (.xlsx or .csv).
"""

import argparse
import os
import re
from typing import List, Tuple, Dict, Optional

import pandas as pd


SEPARATORS = r"[._\-]"
TOKEN_SPLIT_RE = re.compile(SEPARATORS)
PLUS_TAG_RE = re.compile(r"\+.*$")  # drop +tagging in local part
TRAILING_DIGITS_RE = re.compile(r"\d+$")
NON_ALPHA_RE = re.compile(r"[^A-Za-z]")

def titlecase(token: str) -> str:
    if not token:
        return token
    return token[:1].upper() + token[1:].lower()

def clean_token(token: str) -> str:
    """Remove non-letters and trailing digits; keep internal letters only."""
    if not token:
        return ""
    token = TRAILING_DIGITS_RE.sub("", token)
    token = NON_ALPHA_RE.sub("", token)
    return token

def collapse_spaces(s: str) -> str:
    return " ".join(s.split())

def split_local_part(local: str) -> List[str]:
    local = PLUS_TAG_RE.sub("", local)  # strip +tags
    parts = TOKEN_SPLIT_RE.split(local)
    parts = [p for p in parts if p != ""]
    return parts

def score_band(score: float) -> str:
    if score >= 0.85:
        return "high"
    if score >= 0.65:
        return "medium"
    if score >= 0.45:
        return "low"
    return "very_low"

def build_name_from_tokens(tokens: List[str]) -> str:
    return " ".join(titlecase(t) for t in tokens if t)

def is_alpha_token(t: str) -> bool:
    return t.isalpha() and len(t) > 0

def guess_from_tokens(tokens_raw: List[str]) -> Tuple[str, float, str, str]:
    """
    Core heuristic engine.
    Returns: (suggested_full_name, score, method, notes)
    """
    # Clean tokens
    tokens = [clean_token(t) for t in tokens_raw]
    tokens = [t for t in tokens if t]  # drop empties

    if not tokens:
        return ("Needs Validation", 0.2, "empty", "No alphabetic tokens in local part.")

    # Heuristic helpers
    alpha_tokens = [t for t in tokens if is_alpha_token(t)]
    if not alpha_tokens:
        return ("Needs Validation", 0.25, "garbled", "Local part is non-alphabetic or digits.")

    # Common patterns
    if len(alpha_tokens) >= 2:
        a, b = alpha_tokens[0], alpha_tokens[1]
        a_is_initial = len(a) == 1
        b_is_initial = len(b) == 1

        # first.last  (john.smith)
        if len(a) >= 2 and len(b) >= 2:
            name = f"{titlecase(a)} {titlecase(b)}"
            return (name, 0.9, "first_last", "Two alpha tokens; assumed first last.")

        # f.last  (j.smith)
        if a_is_initial and len(b) >= 2:
            name = f"{a.upper()}. {titlecase(b)}"
            return (name, 0.75, "initial_last", "First initial + last name.")

        # first.l  (john.s)
        if len(a) >= 2 and b_is_initial:
            name = f"{titlecase(a)} {b.upper()}."
            return (name, 0.7, "first_initial", "First name + last initial.")

        # first.m.last (john.m.smith or john-m-smith)
        if len(alpha_tokens) >= 3:
            first, mid, last = alpha_tokens[0], alpha_tokens[1], alpha_tokens[2]
            if len(first) >= 2 and len(last) >= 2 and (len(mid) == 1 or len(mid) >= 2):
                middle = f"{mid.upper()}." if len(mid) == 1 else titlecase(mid)
                name = f"{titlecase(first)} {middle} {titlecase(last)}"
                return (name, 0.9, "first_middle_last", "Three tokens; assumed first–middle–last.")

        # last.first (smith.john) — ambiguous; flip with slightly lower score
        if len(a) >= 2 and len(b) >= 2:
            name = f"{titlecase(b)} {titlecase(a)}"
            return (name, 0.7, "last_first?", "Ambiguous order; flipped to first last with lower confidence.")

    # Single token cases
    t = alpha_tokens[0]
    # jdoe → J Doe
    m = re.match(r"^([A-Za-z])([A-Za-z]{2,})$", t)
    if m:
        first_initial, last = m.group(1), m.group(2)
        name = f"{first_initial.upper()}. {titlecase(last)}"
        return (name, 0.6, "initial_last_conjoined", "Single token; parsed as initial + last.")

    # johns → John S (last initial) — weak
    if len(t) >= 4:
        name = f"{titlecase(t[:-1])} {t[-1].upper()}."
        return (name, 0.5, "monotoken_split_guess", "Heuristic split of single token; low confidence.")

    # Otherwise, present cleaned token and mark for validation
    name = titlecase(t)
    return (name, 0.45, "mononym", "Single alpha token only; requires validation.")

def suggest_for_email(email: str) -> Dict[str, object]:
    email = (email or "").strip()
    if not email or "@" not in email:
        return {
            "email": email,
            "suggested_full_name": "Needs Validation",
            "confidence": 0.2,
            "band": score_band(0.2),
            "method": "invalid",
            "notes": "Missing or invalid email address.",
            "needs_validation": True,
        }

    local, domain = email.split("@", 1)
    tokens_raw = split_local_part(local)

    name, score, method, notes = guess_from_tokens(tokens_raw)

    # Strengthen readability: collapse multiple spaces
    name = collapse_spaces(name)

    return {
        "email": email,
        "suggested_full_name": name,
        "confidence": round(score, 2),
        "band": score_band(score),
        "method": method,
        "notes": notes,
        "needs_validation": score < 0.7,
    }

def run(input_path: str, sheet: Optional[str], email_col: Optional[str], output_path: str):
    # Read input
    ext = os.path.splitext(input_path)[1].lower()
    if ext in (".xlsx", ".xlsm", ".xls"):
        df = pd.read_excel(input_path, sheet_name=sheet) if sheet else pd.read_excel(input_path)
    elif ext == ".csv":
        df = pd.read_csv(input_path)
    else:
        raise SystemExit(f"Unsupported input format: {ext} (use .xlsx or .csv)")

    # Find email column (case-insensitive) if not provided
    if email_col:
        col = email_col
        if col not in df.columns:
            raise SystemExit(f"Email column '{col}' not found. Available: {list(df.columns)}")
    else:
        candidates = [c for c in df.columns if str(c).strip().lower() in ("email", "e-mail", "mail")]
        if not candidates:
            # try contains 'email'
            candidates = [c for c in df.columns if "email" in str(c).strip().lower()]
        if not candidates:
            raise SystemExit("Could not auto-detect email column. Pass --email-col.")
        col = candidates[0]

    # Process
    out_rows = []
    for email in df[col].astype(str).tolist():
        out_rows.append(suggest_for_email(email))

    out_df = pd.DataFrame(out_rows)

    # Merge with original (optional: keep original columns)
    merged = df.copy()
    merged = merged.join(out_df.set_index("email"), on=col, rsuffix="_suggested")

    # Write output
    out_ext = os.path.splitext(output_path)[1].lower()
    if out_ext in (".xlsx", ".xlsm", ".xls"):
        with pd.ExcelWriter(output_path, engine="openpyxl") as writer:
            merged.to_excel(writer, index=False, sheet_name="names")
    elif out_ext == ".csv":
        merged.to_csv(output_path, index=False)
    else:
        raise SystemExit(f"Unsupported output format: {out_ext} (use .xlsx or .csv)")

    return output_path

def main():
    ap = argparse.ArgumentParser(description="Suggest human-readable names from email addresses.")
    ap.add_argument("--input", required=True, help="Path to input .xlsx or .csv")
    ap.add_argument("--sheet", help="Excel sheet name (if applicable)")
    ap.add_argument("--email-col", help="Column name containing emails (auto-detected if omitted)")
    ap.add_argument("--output", required=True, help="Path to output .xlsx or .csv")
    args = ap.parse_args()
    run(args.input, args.sheet, args.email_col, args.output)

if __name__ == "__main__":
    main()