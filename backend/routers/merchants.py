from typing import Optional
from urllib.parse import unquote

import pandas as pd
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from backend.dependencies import apply_filters, get_current_user
from core import insights as ins
from core.db import save_merchant_override, delete_merchant_override, get_merchant_overrides

router = APIRouter(prefix="/merchants", tags=["merchants"])


class MerchantRenameBody(BaseModel):
    display_name: str


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


@router.get("/overrides")
def list_overrides(current_user: dict = Depends(get_current_user)):
    return get_merchant_overrides(current_user["id"])


@router.put("/overrides/{raw_name}")
def upsert_override(
    raw_name: str,
    body: MerchantRenameBody,
    current_user: dict = Depends(get_current_user),
):
    save_merchant_override(current_user["id"], unquote(raw_name), body.display_name.strip())
    return {"ok": True}


@router.delete("/overrides/{raw_name}")
def remove_override(
    raw_name: str,
    current_user: dict = Depends(get_current_user),
):
    delete_merchant_override(current_user["id"], unquote(raw_name))
    return {"ok": True}


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
