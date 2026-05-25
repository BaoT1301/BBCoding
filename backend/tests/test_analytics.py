"""
Analytics endpoint tests using FastAPI dependency overrides.
No real Azure Postgres connection is made.
"""
from unittest.mock import MagicMock
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.analytics_db import get_analytics_db


def _mock_weekly_row(week_start="2025-05-05", revenue=1_000_000, cost=800_000, units=300_000):
    row = MagicMock()
    row.week_start = MagicMock()
    row.week_start.isoformat.return_value = week_start
    row.revenue = revenue
    row.total_cost = cost
    row.units_sold = units
    return row


def _override_with(rows):
    """Return a dependency override that yields a mock db returning `rows`."""
    mock_db = MagicMock()
    result = MagicMock()
    result.fetchall.return_value = rows
    mock_db.execute.return_value = result

    def _dep():
        yield mock_db

    return _dep


@pytest.fixture(autouse=True)
def clear_analytics_override():
    yield
    app.dependency_overrides.pop(get_analytics_db, None)


@pytest.fixture()
def client():
    return TestClient(app)


def test_aggregate_200_with_valid_dates(client):
    app.dependency_overrides[get_analytics_db] = _override_with([_mock_weekly_row()])
    resp = client.get(
        "/api/analytics/aggregate",
        params={"date_from": "2025-05-01", "date_to": "2025-06-01"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "kpis" in body
    assert "weekly_series" in body
    for key in ("revenue", "margin", "margin_pct", "units_sold"):
        assert key in body["kpis"]
    assert body["kpis"]["revenue"] == pytest.approx(1_000_000.0)
    assert body["kpis"]["margin"] == pytest.approx(200_000.0)


def test_aggregate_400_when_dates_inverted(client):
    app.dependency_overrides[get_analytics_db] = _override_with([])
    resp = client.get(
        "/api/analytics/aggregate",
        params={"date_from": "2025-06-01", "date_to": "2025-05-01"},
    )
    assert resp.status_code == 400


def test_aggregate_422_when_dates_missing(client):
    app.dependency_overrides[get_analytics_db] = _override_with([])
    resp = client.get("/api/analytics/aggregate")
    assert resp.status_code == 422


def test_aggregate_empty_result_returns_zero_kpis(client):
    app.dependency_overrides[get_analytics_db] = _override_with([])
    resp = client.get(
        "/api/analytics/aggregate",
        params={"date_from": "2025-01-01", "date_to": "2025-02-01"},
    )
    assert resp.status_code == 200
    kpis = resp.json()["kpis"]
    assert kpis["revenue"] == 0.0
    assert kpis["margin_pct"] == 0.0
    assert kpis["units_sold"] == 0


def test_filters_200(client):
    mock_store = MagicMock()
    mock_store.store_id = 999999
    mock_store.store_name = "BetterBasket Demo Store"

    mock_db = MagicMock()
    stores_result = MagicMock(); stores_result.fetchall.return_value = [mock_store]
    list_result = MagicMock(); list_result.fetchall.return_value = [("Direct",)]
    mock_db.execute.side_effect = [
        stores_result, list_result, list_result, list_result, list_result,
    ]

    def _dep():
        yield mock_db

    app.dependency_overrides[get_analytics_db] = _dep
    resp = client.get("/api/analytics/filters")
    assert resp.status_code == 200
    body = resp.json()
    for key in ("stores", "categories", "brands", "vendors", "delivery_types"):
        assert key in body
    assert body["stores"][0]["id"] == 999999
