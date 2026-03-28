from typing import Optional

import pandas as pd
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from backend.dependencies import apply_filters, get_current_user
from core import insights as ins
from core.db import save_override

router = APIRouter(prefix="/transactions", tags=["transactions"])


def _df_to_records(df: pd.DataFrame) -> list:
    cleaned = df.where(pd.notna(df), None)
    records = cleaned.to_dict(orient="records")
    for row in records:
        for k, v in row.items():
            if hasattr(v, "isoformat"):
                row[k] = v.isoformat()
    return records


class OverrideBody(BaseModel):
    category: Optional[str] = None
    amount: Optional[float] = None
    notes: Optional[str] = None


@router.get("")
def list_transactions(
    range: str = Query("30d"),
    institution: str = Query("all"),
    account: str = Query("all"),
    search: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    df = ins.load_data(current_user["id"])
    df = apply_filters(df, range, institution, account)

    spending = ins.get_spending(df)
    cols = [c for c in ["id", "date", "name", "merchant_normalized", "category",
                         "amount", "institution", "pending", "notes"]
            if c in spending.columns]
    result = spending[cols].sort_values("date", ascending=False).reset_index(drop=True)

    if search:
        s = search.lower()
        mask = (
            result.get("name", pd.Series(dtype=str)).fillna("").str.lower().str.contains(s, regex=False)
            | result.get("merchant_normalized", pd.Series(dtype=str)).fillna("").str.lower().str.contains(s, regex=False)
            | result.get("category", pd.Series(dtype=str)).fillna("").str.lower().str.contains(s, regex=False)
        )
        result = result[mask]

    return _df_to_records(result)


@router.patch("/{transaction_id}")
def patch_transaction(
    transaction_id: str,
    body: OverrideBody,
    current_user: dict = Depends(get_current_user),
):
    save_override(
        transaction_id,
        category=body.category,
        amount=body.amount,
        notes=body.notes,
    )
    return {"ok": True}
