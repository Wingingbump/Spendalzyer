from fastapi import APIRouter, Depends, HTTPException, Query

from backend.dependencies import get_current_user
from core.db import get_last_synced_at

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("")
def sync(
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
        return {
            "synced_count": synced_count,
            "last_synced_at": str(last_synced_at) if last_synced_at else None,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
