"""
Tests for backend/routers/ledger.py

Mocks ins.load_data so no DB connection is required. Validates the ledger
endpoint's filtering, summary computation, and CSV export.
"""
import pytest
from unittest.mock import patch
import pandas as pd
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.dependencies import get_current_user
from backend.routers import ledger as ledger_router

FAKE_USER = {"id": 1, "username": "testuser"}


def _make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(ledger_router.router)
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    return app


@pytest.fixture()
def client():
    return TestClient(_make_app(), raise_server_exceptions=True)


def _make_df(rows: list[dict] | None = None) -> pd.DataFrame:
    today = pd.Timestamp.today().normalize()
    defaults = {
        "id": "tx1",
        "date": today - pd.Timedelta(days=3),
        "name": "Coffee",
        "amount": 5.50,
        "category": "Food & Drink",
        "pending": False,
        "institution": "Chase",
        "plaid_account_id": "acct1",
        "account_name": "Checking",
        "account_mask": "1234",
        "account_subtype": "checking",
        "notes": "",
        "type": "debit",
        "is_transfer": False,
        "is_duplicate": False,
        "merchant_normalized": "Starbucks",
        "dedup_reason": None,
        "has_user_override": False,
        "is_manual": False,
    }
    records = [({**defaults, **r}) for r in (rows or [defaults])]
    df = pd.DataFrame(records)
    df["date"] = pd.to_datetime(df["date"])
    df["amount"] = df["amount"].astype(float)
    return df


def _empty_df() -> pd.DataFrame:
    return _make_df().iloc[0:0].copy()


# ── GET /ledger ───────────────────────────────────────────────────────────────

class TestLedgerList:
    def test_returns_200(self, client):
        with patch("backend.routers.ledger.ins.load_data", return_value=_make_df()):
            r = client.get("/ledger")
        assert r.status_code == 200

    def test_response_has_rows_and_summary(self, client):
        with patch("backend.routers.ledger.ins.load_data", return_value=_make_df()):
            r = client.get("/ledger")
        body = r.json()
        assert "rows" in body
        assert "summary" in body

    def test_rows_is_list(self, client):
        with patch("backend.routers.ledger.ins.load_data", return_value=_make_df()):
            r = client.get("/ledger")
        assert isinstance(r.json()["rows"], list)

    def test_summary_has_required_fields(self, client):
        with patch("backend.routers.ledger.ins.load_data", return_value=_make_df()):
            r = client.get("/ledger")
        summary = r.json()["summary"]
        for field in ("spent", "income", "net", "transactions", "transfer_count"):
            assert field in summary, f"Missing summary field: {field}"

    def test_row_contains_expected_fields(self, client):
        with patch("backend.routers.ledger.ins.load_data", return_value=_make_df()):
            r = client.get("/ledger")
        row = r.json()["rows"][0]
        for field in ("id", "date", "name", "amount", "category", "institution"):
            assert field in row, f"Missing row field: {field}"

    def test_summary_spent_sums_debits(self, client):
        rows = [
            {"id": "tx1", "amount": 30.0, "type": "debit", "is_transfer": False, "is_duplicate": False},
            {"id": "tx2", "amount": 70.0, "type": "debit", "is_transfer": False, "is_duplicate": False},
        ]
        with patch("backend.routers.ledger.ins.load_data", return_value=_make_df(rows)):
            r = client.get("/ledger")
        assert r.json()["summary"]["spent"] == 100.0

    def test_summary_income_sums_credits(self, client):
        rows = [
            {"id": "tx1", "amount": 50.0, "type": "debit", "is_transfer": False, "is_duplicate": False},
            {"id": "tx2", "amount": -1000.0, "type": "credit", "is_transfer": False, "is_duplicate": False},
        ]
        with patch("backend.routers.ledger.ins.load_data", return_value=_make_df(rows)):
            r = client.get("/ledger")
        assert r.json()["summary"]["income"] == 1000.0

    def test_empty_data_returns_empty_rows(self, client):
        with patch("backend.routers.ledger.ins.load_data", return_value=_empty_df()):
            r = client.get("/ledger")
        assert r.json()["rows"] == []

    def test_empty_data_summary_is_zero(self, client):
        with patch("backend.routers.ledger.ins.load_data", return_value=_empty_df()):
            r = client.get("/ledger")
        summary = r.json()["summary"]
        assert summary["spent"] == 0.0
        assert summary["income"] == 0.0
        assert summary["transactions"] == 0

    def test_no_nan_in_response(self, client):
        with patch("backend.routers.ledger.ins.load_data", return_value=_make_df()):
            r = client.get("/ledger")
        assert "NaN" not in r.text

    def test_unauthenticated_returns_401(self):
        app = FastAPI()
        app.include_router(ledger_router.router)
        c = TestClient(app, raise_server_exceptions=False)
        r = c.get("/ledger")
        assert r.status_code == 401


# ── Transfer / duplicate filtering ───────────────────────────────────────────

class TestTransferAndDuplicateFiltering:
    def test_transfers_hidden_by_default(self, client):
        rows = [
            {"id": "tx1", "name": "Regular", "is_transfer": False, "is_duplicate": False},
            {"id": "tx2", "name": "Transfer Out", "is_transfer": True, "is_duplicate": False},
        ]
        with patch("backend.routers.ledger.ins.load_data", return_value=_make_df(rows)):
            r = client.get("/ledger")
        names = [row["name"] for row in r.json()["rows"]]
        assert "Regular" in names
        assert "Transfer Out" not in names

    def test_transfers_shown_when_requested(self, client):
        rows = [
            {"id": "tx1", "name": "Regular", "is_transfer": False, "is_duplicate": False},
            {"id": "tx2", "name": "Transfer Out", "is_transfer": True, "is_duplicate": False},
        ]
        with patch("backend.routers.ledger.ins.load_data", return_value=_make_df(rows)):
            r = client.get("/ledger", params={"show_transfers": "true"})
        names = [row["name"] for row in r.json()["rows"]]
        assert "Transfer Out" in names

    def test_duplicates_hidden_by_default(self, client):
        rows = [
            {"id": "tx1", "name": "Real", "is_duplicate": False, "is_transfer": False},
            {"id": "tx2", "name": "Dup", "is_duplicate": True, "is_transfer": False},
        ]
        with patch("backend.routers.ledger.ins.load_data", return_value=_make_df(rows)):
            r = client.get("/ledger")
        names = [row["name"] for row in r.json()["rows"]]
        assert "Dup" not in names

    def test_duplicates_shown_when_requested(self, client):
        rows = [
            {"id": "tx1", "name": "Real", "is_duplicate": False, "is_transfer": False},
            {"id": "tx2", "name": "Dup", "is_duplicate": True, "is_transfer": False},
        ]
        with patch("backend.routers.ledger.ins.load_data", return_value=_make_df(rows)):
            r = client.get("/ledger", params={"show_duplicates": "true"})
        names = [row["name"] for row in r.json()["rows"]]
        assert "Dup" in names

    def test_transfer_count_in_summary(self, client):
        rows = [
            {"id": "tx1", "is_transfer": False, "is_duplicate": False},
            {"id": "tx2", "is_transfer": True, "is_duplicate": False},
            {"id": "tx3", "is_transfer": True, "is_duplicate": False},
        ]
        with patch("backend.routers.ledger.ins.load_data", return_value=_make_df(rows)):
            r = client.get("/ledger")
        assert r.json()["summary"]["transfer_count"] == 2


# ── Type filter ───────────────────────────────────────────────────────────────

class TestTypeFilter:
    def test_filter_debit_only(self, client):
        rows = [
            {"id": "tx1", "name": "Expense", "type": "debit", "amount": 50.0, "is_transfer": False, "is_duplicate": False},
            {"id": "tx2", "name": "Paycheck", "type": "credit", "amount": -2000.0, "is_transfer": False, "is_duplicate": False},
        ]
        with patch("backend.routers.ledger.ins.load_data", return_value=_make_df(rows)):
            r = client.get("/ledger", params={"types": "debit"})
        names = [row["name"] for row in r.json()["rows"]]
        assert "Expense" in names
        assert "Paycheck" not in names

    def test_filter_credit_only(self, client):
        rows = [
            {"id": "tx1", "name": "Expense", "type": "debit", "amount": 50.0, "is_transfer": False, "is_duplicate": False},
            {"id": "tx2", "name": "Paycheck", "type": "credit", "amount": -2000.0, "is_transfer": False, "is_duplicate": False},
        ]
        with patch("backend.routers.ledger.ins.load_data", return_value=_make_df(rows)):
            r = client.get("/ledger", params={"types": "credit"})
        names = [row["name"] for row in r.json()["rows"]]
        assert "Paycheck" in names
        assert "Expense" not in names

    def test_no_type_filter_returns_all(self, client):
        rows = [
            {"id": "tx1", "type": "debit", "is_transfer": False, "is_duplicate": False},
            {"id": "tx2", "type": "credit", "amount": -100.0, "is_transfer": False, "is_duplicate": False},
        ]
        with patch("backend.routers.ledger.ins.load_data", return_value=_make_df(rows)):
            r = client.get("/ledger")
        assert len(r.json()["rows"]) == 2


# ── Search filter ─────────────────────────────────────────────────────────────

class TestSearchFilter:
    def test_search_by_name(self, client):
        rows = [
            {"id": "tx1", "name": "Starbucks Coffee", "merchant_normalized": "Starbucks", "category": "Food & Drink", "is_transfer": False, "is_duplicate": False},
            {"id": "tx2", "name": "Amazon Order", "merchant_normalized": "Amazon", "category": "Shopping", "is_transfer": False, "is_duplicate": False},
        ]
        with patch("backend.routers.ledger.ins.load_data", return_value=_make_df(rows)):
            r = client.get("/ledger", params={"search": "amazon"})
        rows_out = r.json()["rows"]
        assert len(rows_out) == 1
        assert rows_out[0]["name"] == "Amazon Order"

    def test_search_by_merchant(self, client):
        rows = [
            {"id": "tx1", "name": "Purchase", "merchant_normalized": "Whole Foods", "category": "Groceries", "is_transfer": False, "is_duplicate": False},
            {"id": "tx2", "name": "Purchase", "merchant_normalized": "Target", "category": "Shopping", "is_transfer": False, "is_duplicate": False},
        ]
        with patch("backend.routers.ledger.ins.load_data", return_value=_make_df(rows)):
            r = client.get("/ledger", params={"search": "whole foods"})
        assert len(r.json()["rows"]) == 1

    def test_search_by_category(self, client):
        rows = [
            {"id": "tx1", "name": "Gym", "merchant_normalized": "Planet Fitness", "category": "Health & Fitness", "is_transfer": False, "is_duplicate": False},
            {"id": "tx2", "name": "Coffee", "merchant_normalized": "Starbucks", "category": "Food & Drink", "is_transfer": False, "is_duplicate": False},
        ]
        with patch("backend.routers.ledger.ins.load_data", return_value=_make_df(rows)):
            r = client.get("/ledger", params={"search": "health"})
        assert len(r.json()["rows"]) == 1

    def test_search_case_insensitive(self, client):
        rows = [
            {"id": "tx1", "name": "STARBUCKS", "merchant_normalized": "Starbucks", "category": "Food & Drink", "is_transfer": False, "is_duplicate": False},
        ]
        with patch("backend.routers.ledger.ins.load_data", return_value=_make_df(rows)):
            r = client.get("/ledger", params={"search": "starbucks"})
        assert len(r.json()["rows"]) == 1

    def test_search_no_match_returns_empty_rows(self, client):
        with patch("backend.routers.ledger.ins.load_data", return_value=_make_df()):
            r = client.get("/ledger", params={"search": "zzznomatch"})
        assert r.json()["rows"] == []


# ── GET /ledger/export ────────────────────────────────────────────────────────

class TestLedgerExport:
    def test_returns_200(self, client):
        with patch("backend.routers.ledger.ins.load_data", return_value=_make_df()):
            r = client.get("/ledger/export")
        assert r.status_code == 200

    def test_content_type_is_csv(self, client):
        with patch("backend.routers.ledger.ins.load_data", return_value=_make_df()):
            r = client.get("/ledger/export")
        assert "text/csv" in r.headers["content-type"]

    def test_csv_contains_header_row(self, client):
        with patch("backend.routers.ledger.ins.load_data", return_value=_make_df()):
            r = client.get("/ledger/export")
        first_line = r.text.splitlines()[0]
        assert "name" in first_line or "amount" in first_line or "date" in first_line

    def test_csv_has_content_disposition(self, client):
        with patch("backend.routers.ledger.ins.load_data", return_value=_make_df()):
            r = client.get("/ledger/export")
        assert "attachment" in r.headers.get("content-disposition", "")

    def test_empty_data_exports_header_only(self, client):
        with patch("backend.routers.ledger.ins.load_data", return_value=_empty_df()):
            r = client.get("/ledger/export")
        assert r.status_code == 200
        lines = [l for l in r.text.splitlines() if l.strip()]
        assert len(lines) == 1  # header row only
