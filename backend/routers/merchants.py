from typing import Optional
from urllib.parse import unquote

import pandas as pd
from fastapi import APIRouter, Depends, Query

from backend.dependencies import apply_filters, get_current_user
from core import insights as ins

router = APIRouter(prefix="/merchants", tags=["merchants"])


def _df_to_records(df: pd.DataFrame) -> list:
    cleaned = df.where(pd.notna(df), None)
    records = cleaned.to_dict(orient="records")
    for row in records:
        for k, v in row.items():
            if hasattr(v, "isoformat"):
                row[k] = v.isoformat()
    return records


@router.get("")
def list_merchants(
    range: str = Query("30d"),
    institution: str = Query("all"),
    account: str = Query("all"),
    current_user: dict = Depends(get_current_user),
):
    df = ins.load_data(current_user["id"])
    df = apply_filters(df, range, institution, account)
    result = ins.spending_by_merchant(df, top_n=15)
    return _df_to_records(result)


@router.get("/{merchant_name}")
def merchant_detail(
    merchant_name: str,
    range: str = Query("30d"),
    institution: str = Query("all"),
    account: str = Query("all"),
    current_user: dict = Depends(get_current_user),
):
    merchant = unquote(merchant_name)
    df = ins.load_data(current_user["id"])
    df = apply_filters(df, range, institution, account)
    result = ins.drill_down_merchant(df, merchant)
    return _df_to_records(result)
