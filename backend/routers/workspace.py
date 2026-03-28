import datetime
import json
from typing import Optional

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.dependencies import get_current_user
from core import insights as ins
from core.db import get_conn

router = APIRouter(prefix="/workspace", tags=["workspace"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _df_to_records(df: pd.DataFrame) -> list:
    cleaned = df.where(pd.notna(df), None)
    records = cleaned.to_dict(orient="records")
    for row in records:
        for k, v in row.items():
            if hasattr(v, "isoformat"):
                row[k] = v.isoformat()
    return records


# ── Budget models ─────────────────────────────────────────────────────────────

class BudgetBody(BaseModel):
    amount: float
    period: str = "monthly"


# ── Budget endpoints ──────────────────────────────────────────────────────────

@router.get("/budgets")
def list_budgets(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]

    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, category, amount, period FROM budgets WHERE user_id = %s ORDER BY category",
            (user_id,)
        ).fetchall()

    budgets = [dict(r) for r in rows]

    df = ins.load_data(user_id)
    cat_spend: dict = {}
    if not df.empty and "is_transfer" in df.columns:
        now = datetime.date.today()
        month_start = now.replace(day=1)
        month_df = df[
            (df["date"].dt.date >= month_start) &
            (~df["is_transfer"].fillna(False)) &
            (~df["is_duplicate"].fillna(False)) &
            (df["type"] == "debit")
        ]
        if "category" in month_df.columns:
            cat_spend = month_df.groupby("category")["amount"].sum().to_dict()

    for b in budgets:
        b["spent"] = round(float(cat_spend.get(b["category"], 0)), 2)
        b["amount"] = float(b["amount"])

    return budgets


@router.put("/budgets/{category}")
def upsert_budget(category: str, body: BudgetBody, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO budgets (user_id, category, amount, period)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (user_id, category)
            DO UPDATE SET amount = EXCLUDED.amount, period = EXCLUDED.period
        """, (user_id, category, body.amount, body.period))
    return {"ok": True}


@router.delete("/budgets/{category}")
def delete_budget(category: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    with get_conn() as conn:
        conn.execute(
            "DELETE FROM budgets WHERE user_id = %s AND category = %s",
            (user_id, category)
        )
    return {"ok": True}


# ── Recurring detection ───────────────────────────────────────────────────────

FREQ_RANGES = [
    ("weekly",     5,   9),
    ("biweekly",  12,  16),
    ("monthly",   25,  35),
    ("quarterly", 85, 100),
    ("annual",   330, 390),
]


def _detect_recurring(df: pd.DataFrame) -> list:
    clean = df[
        (~df["is_transfer"].fillna(False)) &
        (~df["is_duplicate"].fillna(False)) &
        (df["type"] == "debit")
    ].copy()

    if clean.empty:
        return []

    # Key by normalized merchant, fall back to raw name
    clean["_key"] = clean.apply(
        lambda r: (r.get("merchant_normalized") or "").strip() or str(r["name"]),
        axis=1,
    )

    results = []
    for key, group in clean.groupby("_key"):
        if len(group) < 2:
            continue

        group = group.sort_values("date")
        amounts = group["amount"].tolist()

        # Amount must be consistent (all within 15% of median)
        sorted_amt = sorted(amounts)
        median_amt = sorted_amt[len(sorted_amt) // 2]
        if median_amt <= 0:
            continue
        if any(abs(a - median_amt) / median_amt > 0.15 for a in amounts):
            continue

        # Date interval analysis
        dates = group["date"].tolist()
        diffs = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
        avg_diff = sum(diffs) / len(diffs)

        freq = None
        for label, lo, hi in FREQ_RANGES:
            if lo <= avg_diff <= hi:
                freq = label
                break
        if freq is None:
            continue

        # Intervals must be consistent (within 40% of avg)
        if len(diffs) > 1 and any(abs(d - avg_diff) / avg_diff > 0.4 for d in diffs):
            continue

        results.append({
            "name": str(key),
            "amount": round(float(median_amt), 2),
            "frequency": freq,
            "occurrences": len(group),
            "last_date": group["date"].max().date().isoformat(),
        })

    results.sort(key=lambda x: x["amount"], reverse=True)
    return results[:40]


@router.get("/recurring")
def list_recurring(current_user: dict = Depends(get_current_user)):
    df = ins.load_data(current_user["id"])
    if df.empty:
        return []
    return _detect_recurring(df)


# ── Group models ──────────────────────────────────────────────────────────────

class GroupBody(BaseModel):
    name: str
    color: str = "#c8ff00"
    goal: Optional[float] = None


class AddTransactionBody(BaseModel):
    transaction_id: str


# ── Group endpoints ───────────────────────────────────────────────────────────

@router.get("/groups")
def list_groups(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]

    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, name, color, goal FROM custom_groups WHERE user_id = %s ORDER BY created_at",
            (user_id,)
        ).fetchall()

    groups = [dict(r) for r in rows]
    if not groups:
        return groups

    df = ins.load_data(user_id)

    with get_conn() as conn:
        for g in groups:
            tx_rows = conn.execute(
                "SELECT transaction_id FROM group_transactions WHERE group_id = %s",
                (g["id"],)
            ).fetchall()
            tx_ids = [r["transaction_id"] for r in tx_rows]
            g["count"] = len(tx_ids)
            g["goal"] = float(g["goal"]) if g["goal"] is not None else None
            if tx_ids and not df.empty and "id" in df.columns:
                matched = df[df["id"].astype(str).isin([str(t) for t in tx_ids])]
                g["total"] = round(float(matched["amount"].sum()), 2) if not matched.empty else 0.0
            else:
                g["total"] = 0.0

    return groups


@router.post("/groups")
def create_group(body: GroupBody, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    with get_conn() as conn:
        row = conn.execute("""
            INSERT INTO custom_groups (user_id, name, color, goal)
            VALUES (%s, %s, %s, %s)
            RETURNING id
        """, (user_id, body.name, body.color, body.goal)).fetchone()
    return {"id": row["id"]}


@router.put("/groups/{group_id}")
def update_group(group_id: int, body: GroupBody, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    with get_conn() as conn:
        conn.execute("""
            UPDATE custom_groups SET name = %s, color = %s, goal = %s
            WHERE id = %s AND user_id = %s
        """, (body.name, body.color, body.goal, group_id, user_id))
    return {"ok": True}


@router.delete("/groups/{group_id}")
def delete_group(group_id: int, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    with get_conn() as conn:
        conn.execute(
            "DELETE FROM custom_groups WHERE id = %s AND user_id = %s",
            (group_id, user_id)
        )
    return {"ok": True}


@router.get("/groups/{group_id}/transactions")
def group_transactions(group_id: int, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]

    with get_conn() as conn:
        exists = conn.execute(
            "SELECT id FROM custom_groups WHERE id = %s AND user_id = %s",
            (group_id, user_id)
        ).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Group not found")

        tx_rows = conn.execute(
            "SELECT transaction_id FROM group_transactions WHERE group_id = %s",
            (group_id,)
        ).fetchall()

    tx_ids = [r["transaction_id"] for r in tx_rows]

    if not tx_ids:
        return {"rows": [], "total": 0.0, "count": 0, "transaction_ids": []}

    df = ins.load_data(user_id)
    if df.empty or "id" not in df.columns:
        return {"rows": [], "total": 0.0, "count": 0, "transaction_ids": tx_ids}

    matched = df[df["id"].astype(str).isin([str(t) for t in tx_ids])]
    if matched.empty:
        return {"rows": [], "total": 0.0, "count": 0, "transaction_ids": tx_ids}

    cols = [c for c in ["id", "date", "name", "merchant_normalized", "category",
                         "amount", "institution", "pending", "notes"]
            if c in matched.columns]
    result = matched[cols].sort_values("date", ascending=False)

    return {
        "rows": _df_to_records(result),
        "total": round(float(matched["amount"].sum()), 2),
        "count": len(result),
        "transaction_ids": tx_ids,
    }


@router.post("/groups/{group_id}/transactions")
def add_transaction(group_id: int, body: AddTransactionBody, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    with get_conn() as conn:
        exists = conn.execute(
            "SELECT id FROM custom_groups WHERE id = %s AND user_id = %s",
            (group_id, user_id)
        ).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Group not found")
        conn.execute("""
            INSERT INTO group_transactions (group_id, transaction_id)
            VALUES (%s, %s) ON CONFLICT DO NOTHING
        """, (group_id, body.transaction_id))
    return {"ok": True}


@router.delete("/groups/{group_id}/transactions/{transaction_id}")
def remove_transaction(group_id: int, transaction_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    with get_conn() as conn:
        exists = conn.execute(
            "SELECT id FROM custom_groups WHERE id = %s AND user_id = %s",
            (group_id, user_id)
        ).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Group not found")
        conn.execute(
            "DELETE FROM group_transactions WHERE group_id = %s AND transaction_id = %s",
            (group_id, transaction_id)
        )
    return {"ok": True}
