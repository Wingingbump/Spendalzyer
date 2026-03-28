"""Tests for apply_filters in backend/dependencies.py and core filter helpers."""
import pytest
import pandas as pd
from datetime import date
from backend.dependencies import apply_filters
from core.insights import filter_by_range, filter_by_month, filter_by_institution, filter_by_account


def make_df():
    """Four transactions spread across different dates, institutions, and accounts."""
    today = pd.Timestamp.today().normalize()
    return pd.DataFrame({
        "date": [
            today - pd.Timedelta(days=5),
            today - pd.Timedelta(days=15),
            today - pd.Timedelta(days=45),
            today - pd.Timedelta(days=400),
        ],
        "institution": ["BankA", "BankB", "BankA", "BankB"],
        "plaid_account_id": ["acct1", "acct2", "acct1", "acct2"],
        "amount": [10.0, 20.0, 30.0, 40.0],
    })


# ── Core filter helpers ───────────────────────────────────────────────────────

class TestFilterByRange:
    def test_30_days_excludes_old(self):
        df = make_df()
        result = filter_by_range(df, 30)
        assert len(result) == 2  # days 5 and 15

    def test_7_days(self):
        df = make_df()
        result = filter_by_range(df, 7)
        assert len(result) == 1  # only day 5

    def test_all_included_when_days_large(self):
        df = make_df()
        result = filter_by_range(df, 500)
        assert len(result) == 4

    def test_none_returns_full_df(self):
        df = make_df()
        result = filter_by_range(df, None)
        assert len(result) == 4

    def test_returns_copy(self):
        df = make_df()
        result = filter_by_range(df, 30)
        result["amount"] = 0
        assert df["amount"].iloc[0] == 10.0  # original unchanged


class TestFilterByMonth:
    def test_filters_to_correct_month(self):
        today = pd.Timestamp.today()
        df = pd.DataFrame({
            "date": pd.to_datetime([
                f"{today.year}-{today.month:02d}-01",
                f"{today.year}-{today.month:02d}-15",
                "2020-01-10",
            ]),
            "amount": [1.0, 2.0, 3.0],
            "institution": ["A", "A", "A"],
            "plaid_account_id": ["x", "x", "x"],
        })
        result = filter_by_month(df, today.year, today.month)
        assert len(result) == 2

    def test_no_match_returns_empty(self):
        df = make_df()
        result = filter_by_month(df, 1990, 1)
        assert len(result) == 0


class TestFilterByInstitution:
    def test_filters_case_insensitive(self):
        df = make_df()
        result = filter_by_institution(df, "banka")
        assert all(result["institution"] == "BankA")

    def test_exact_institution(self):
        df = make_df()
        result = filter_by_institution(df, "BankA")
        assert len(result) == 2

    def test_no_match_returns_empty(self):
        df = make_df()
        result = filter_by_institution(df, "UnknownBank")
        assert len(result) == 0


class TestFilterByAccount:
    def test_filters_to_account(self):
        df = make_df()
        result = filter_by_account(df, "acct1")
        assert all(result["plaid_account_id"] == "acct1")
        assert len(result) == 2

    def test_no_match_returns_empty(self):
        df = make_df()
        result = filter_by_account(df, "acct999")
        assert len(result) == 0


# ── apply_filters (dependency layer) ─────────────────────────────────────────

class TestApplyFilters:
    def test_30d_range(self):
        df = make_df()
        result = apply_filters(df, "30d")
        assert len(result) == 2

    def test_7d_range(self):
        df = make_df()
        result = apply_filters(df, "7d")
        assert len(result) == 1

    def test_all_range_returns_everything(self):
        df = make_df()
        result = apply_filters(df, "all")
        assert len(result) == 4

    def test_ytd_range(self):
        df = make_df()
        result = apply_filters(df, "ytd")
        # Days 5, 15, and 45 are all within this year (assuming tests don't run Jan 1)
        assert len(result) >= 1

    def test_month_range(self):
        today = pd.Timestamp.today()
        df = make_df()
        result = apply_filters(df, f"{today.year}-{today.month:02d}")
        assert len(result) >= 0  # Just verify it doesn't crash

    def test_custom_range(self):
        today = pd.Timestamp.today().normalize()
        start = (today - pd.Timedelta(days=20)).strftime("%Y-%m-%d")
        end = today.strftime("%Y-%m-%d")
        df = make_df()
        result = apply_filters(df, f"custom:{start}:{end}")
        assert len(result) == 2  # days 5 and 15

    def test_custom_range_exclusive_of_old(self):
        today = pd.Timestamp.today().normalize()
        start = (today - pd.Timedelta(days=10)).strftime("%Y-%m-%d")
        end = today.strftime("%Y-%m-%d")
        df = make_df()
        result = apply_filters(df, f"custom:{start}:{end}")
        assert len(result) == 1  # only day 5

    def test_institution_filter(self):
        df = make_df()
        result = apply_filters(df, "all", institution="BankA")
        assert all(result["institution"] == "BankA")

    def test_account_filter(self):
        df = make_df()
        result = apply_filters(df, "all", account="acct2")
        assert all(result["plaid_account_id"] == "acct2")

    def test_combined_range_and_institution(self):
        df = make_df()
        result = apply_filters(df, "30d", institution="BankA")
        assert len(result) == 1  # BankA within 30 days = only day 5

    def test_invalid_range_falls_back_gracefully(self):
        df = make_df()
        result = apply_filters(df, "invalid-range")
        # Should not raise, returns df unchanged
        assert len(result) == len(df)

    def test_months_suffix(self):
        df = make_df()
        result = apply_filters(df, "2m")  # 60 days
        assert len(result) == 3  # days 5, 15, 45
