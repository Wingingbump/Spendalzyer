from fastapi import APIRouter, Depends

from backend.dependencies import get_current_user
from core.db import list_connected_accounts, remove_connected_account, list_plaid_accounts

router = APIRouter(prefix="/accounts", tags=["accounts"])


@router.get("")
def get_accounts(current_user: dict = Depends(get_current_user)):
    accounts = list_connected_accounts(current_user["id"])
    result = []
    for a in accounts:
        row = dict(a)
        if hasattr(row.get("created_at"), "isoformat"):
            row["created_at"] = row["created_at"].isoformat()
        result.append(row)
    return result


@router.delete("/{account_id}")
def delete_account(account_id: int, current_user: dict = Depends(get_current_user)):
    remove_connected_account(account_id)
    return {"ok": True}


@router.get("/plaid")
def get_plaid_accounts(current_user: dict = Depends(get_current_user)):
    connected = list_connected_accounts(current_user["id"])
    all_plaid = []
    for acct in connected:
        plaid_accts = list_plaid_accounts(connected_account_id=acct["id"])
        for pa in plaid_accts:
            row = dict(pa)
            if hasattr(row.get("created_at"), "isoformat"):
                row["created_at"] = row["created_at"].isoformat()
            row["institution"] = acct.get("name")
            all_plaid.append(row)
    return all_plaid
