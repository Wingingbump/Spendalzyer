import os
import sys

# Ensure project root is on sys.path so core/ and services/ are importable
_project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

import asyncio
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

load_dotenv()

from backend.limiter import limiter
from core.db import seed_category_map_all_users, purge_deleted_users

from backend.routers import (
    auth,
    insights,
    transactions,
    ledger,
    merchants,
    categories,
    accounts,
    plaid,
    sync,
    settings,
    workspace,
    canvas,
)


async def _purge_loop():
    while True:
        try:
            purge_deleted_users()
        except Exception as e:
            print(f"[purge] error: {e}")
        await asyncio.sleep(60 * 60)  # run every hour


@asynccontextmanager
async def lifespan(app: FastAPI):
    seed_category_map_all_users()
    purge_deleted_users()
    task = asyncio.create_task(_purge_loop())
    yield
    task.cancel()


app = FastAPI(title="PersonalSpend API", version="1.0.0", lifespan=lifespan, redirect_slashes=False)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Routers
app.include_router(auth.router, prefix="/api")
app.include_router(insights.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(ledger.router, prefix="/api")
app.include_router(merchants.router, prefix="/api")
app.include_router(categories.router, prefix="/api")
app.include_router(accounts.router, prefix="/api")
app.include_router(plaid.router, prefix="/api")
app.include_router(sync.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
app.include_router(workspace.router, prefix="/api")
app.include_router(canvas.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
