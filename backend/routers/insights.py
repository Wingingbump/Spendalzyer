import json
from typing import Optional

import pandas as pd
from fastapi import APIRouter, Depends, Query

from backend.dependencies import apply_filters, get_current_user
from core import insights as ins

router = APIRouter(prefix="/insights", tags=["insights"])


def _safe(val):
    """Convert numpy scalars / NaN to plain Python types safe for JSON."""
    import math
    import numpy as np
    if val is None:
        return None
    if isinstance(val, float) and math.isnan(val):
        return None
    if isinstance(val, np.floating):
        return float(val)
    if isinstance(val, np.integer):
        return int(val)
    if isinstance(val, np.bool_):
        return bool(val)
    return val


def _df_to_records(df: pd.DataFrame) -> list:
    """Convert DataFrame to list of dicts, replacing NaN with None."""
    records = json.loads(df.to_json(orient="records"))
    # Normalize date objects to strings (already handled by to_json for most types)
    for row in records:
        for k, v in row.items():
            if hasattr(v, "isoformat"):
                row[k] = v.isoformat()
    return records


@router.get("/summary")
def summary(
    range: str = Query("30d"),
    institution: str = Query("all"),
    account: str = Query("all"),
    current_user: dict = Depends(get_current_user),
):
    df = ins.load_data(current_user["id"])
    df = apply_filters(df, range, institution, account)

    mom = ins.this_month_vs_last(df)
    bp = ins.biggest_purchase(df)
    mvm = ins.most_visited_merchant(df)
    bsd = ins.biggest_spending_day(df)

    return {
        "total_spent": _safe(ins.total_spent(df)),
        "transaction_count": _safe(ins.transaction_count(df)),
        "net_spend": _safe(ins.net_spend(df)),
        "this_month": _safe(mom.get("this_month")),
        "last_month": _safe(mom.get("last_month")),
        "delta": _safe(mom.get("delta")),
        "delta_pct": _safe(mom.get("delta_pct")),
        "biggest_purchase": bp,
        "most_visited_merchant": mvm,
        "biggest_spending_day": bsd,
    }


@router.get("/monthly")
def monthly(
    range: str = Query("30d"),
    institution: str = Query("all"),
    account: str = Query("all"),
    current_user: dict = Depends(get_current_user),
):
    df = ins.load_data(current_user["id"])
    df = apply_filters(df, range, institution, account)
    result = ins.spending_by_month(df)
    return _df_to_records(result)


@router.get("/categories")
def categories(
    range: str = Query("30d"),
    institution: str = Query("all"),
    account: str = Query("all"),
    current_user: dict = Depends(get_current_user),
):
    df = ins.load_data(current_user["id"])
    df = apply_filters(df, range, institution, account)
    result = ins.spending_by_category(df)
    return _df_to_records(result)


@router.get("/dow")
def dow(
    range: str = Query("30d"),
    institution: str = Query("all"),
    account: str = Query("all"),
    current_user: dict = Depends(get_current_user),
):
    df = ins.load_data(current_user["id"])
    df = apply_filters(df, range, institution, account)
    result = ins.spending_by_dow(df)
    # Rename 'dow' column to 'day' if present
    if "dow" in result.columns:
        result = result.rename(columns={"dow": "day"})
    return _df_to_records(result)


@router.get("/institutions")
def institutions(
    current_user: dict = Depends(get_current_user),
):
    df = ins.load_data(current_user["id"])
    if df.empty or "institution" not in df.columns:
        return []
    names = df["institution"].dropna().unique().tolist()
    return sorted(names)


@router.get("/accounts")
def accounts(
    current_user: dict = Depends(get_current_user),
):
    df = ins.load_data(current_user["id"])
    if df.empty:
        return []
    cols = [c for c in ["plaid_account_id", "account_name", "account_mask", "institution"] if c in df.columns]
    if not cols:
        return []
    sub = df[cols].drop_duplicates(
        subset=["plaid_account_id"] if "plaid_account_id" in cols else cols
    )
    sub = sub.rename(columns={"account_name": "name", "account_mask": "mask"})
    return json.loads(sub.to_json(orient="records"))
