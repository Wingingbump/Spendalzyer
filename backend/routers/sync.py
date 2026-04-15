from fastapi import APIRouter, Depends, HTTPException, Query, Request

from backend.dependencies import get_current_user
from backend.limiter import limiter
from core.db import get_last_synced_at

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("")
@limiter.limit("5/minute")
def sync(
    request: Request,
    current_user: dict = Depends(get_current_user),
    full_sync: bool = Query(False),
):
    try:
        import services.pull as pull_service
        result = pull_service.main(current_user["id"], full_sync=full_sync)
        last_synced_at = get_last_synced_at(current_user["id"])
        synced_count = 0
        if isinstance(result, dict):
            synced_count = result.get("count", result.get("synced_count", 0)) or 0
        elif isinstance(result, int):
            synced_count = result

        # Run proactive analysis pipeline after every successful sync
        try:
            from core.analysis import run_analysis
            run_analysis(current_user["id"])
        except Exception:
            pass  # analysis failure must never break sync

        return {
            "synced_count": synced_count,
            "last_synced_at": str(last_synced_at) if last_synced_at else None,
        }
    except Exception:
        raise HTTPException(status_code=500, detail="Sync failed. Please try again.")
