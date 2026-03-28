import json

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from backend.dependencies import apply_filters, get_current_user
from core import insights as ins
from core.db import get_conn

router = APIRouter(prefix="/canvas", tags=["canvas"])


# ── Pydantic models ───────────────────────────────────────────────────────────

class CanvasCreate(BaseModel):
    name: str


class CanvasSave(BaseModel):
    name: str
    layout: list
    widgets: dict


# ── Canvas CRUD ───────────────────────────────────────────────────────────────

@router.get("")
def list_canvases(current_user: dict = Depends(get_current_user)):
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, name, created_at FROM canvases WHERE user_id = %s ORDER BY created_at",
            (current_user["id"],)
        ).fetchall()
    return [{"id": r["id"], "name": r["name"], "created_at": str(r["created_at"])} for r in rows]


@router.post("")
def create_canvas(body: CanvasCreate, current_user: dict = Depends(get_current_user)):
    with get_conn() as conn:
        count = conn.execute(
            "SELECT COUNT(*) AS n FROM canvases WHERE user_id = %s",
            (current_user["id"],)
        ).fetchone()["n"]
        if count >= 3:
            raise HTTPException(status_code=400, detail="Maximum of 3 canvases allowed")
        row = conn.execute(
            "INSERT INTO canvases (user_id, name) VALUES (%s, %s) RETURNING id, name, created_at",
            (current_user["id"], body.name.strip() or "My Canvas")
        ).fetchone()
    return {"id": row["id"], "name": row["name"], "created_at": str(row["created_at"])}


@router.get("/sankey")
def get_sankey(
    range: str = Query("30d"),
    institution: str = Query("all"),
    account: str = Query("all"),
    current_user: dict = Depends(get_current_user),
):
    df = ins.load_data(current_user["id"])
    df = apply_filters(df, range, institution, account)

    if df.empty:
        return {"nodes": [], "links": []}

    clean = df[
        (~df["is_transfer"].fillna(False)) &
        (~df["is_duplicate"].fillna(False)) &
        (df["type"] == "debit")
    ] if "is_transfer" in df.columns else df

    if clean.empty or "institution" not in clean.columns or "category" not in clean.columns:
        return {"nodes": [], "links": []}

    flows = (
        clean.groupby(["institution", "category"])["amount"]
        .sum()
        .reset_index()
    )
    flows = flows[flows["amount"] > 0]

    if flows.empty:
        return {"nodes": [], "links": []}

    institutions = sorted(flows["institution"].unique().tolist())
    categories = sorted(flows["category"].unique().tolist())

    nodes = [{"name": n} for n in institutions] + [{"name": n} for n in categories]
    inst_idx = {n: i for i, n in enumerate(institutions)}
    cat_idx = {n: i + len(institutions) for i, n in enumerate(categories)}

    links = [
        {
            "source": inst_idx[row["institution"]],
            "target": cat_idx[row["category"]],
            "value": round(float(row["amount"]), 2),
        }
        for _, row in flows.iterrows()
    ]

    return {"nodes": nodes, "links": links}


@router.get("/{canvas_id}")
def load_canvas(canvas_id: int, current_user: dict = Depends(get_current_user)):
    with get_conn() as conn:
        row = conn.execute(
            "SELECT id, name, layout, widgets FROM canvases WHERE id = %s AND user_id = %s",
            (canvas_id, current_user["id"])
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Canvas not found")
    return {
        "id": row["id"],
        "name": row["name"],
        "layout": row["layout"] or [],
        "widgets": row["widgets"] or {},
    }


@router.put("/{canvas_id}")
def save_canvas(canvas_id: int, body: CanvasSave, current_user: dict = Depends(get_current_user)):
    with get_conn() as conn:
        updated = conn.execute("""
            UPDATE canvases
            SET name = %s, layout = %s, widgets = %s
            WHERE id = %s AND user_id = %s
            RETURNING id
        """, (
            body.name.strip() or "My Canvas",
            json.dumps(body.layout),
            json.dumps(body.widgets),
            canvas_id,
            current_user["id"],
        )).fetchone()
    if not updated:
        raise HTTPException(status_code=404, detail="Canvas not found")
    return {"ok": True}


@router.delete("/{canvas_id}")
def delete_canvas(canvas_id: int, current_user: dict = Depends(get_current_user)):
    with get_conn() as conn:
        conn.execute(
            "DELETE FROM canvases WHERE id = %s AND user_id = %s",
            (canvas_id, current_user["id"])
        )
    return {"ok": True}
