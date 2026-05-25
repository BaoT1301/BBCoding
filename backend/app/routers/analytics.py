from datetime import date
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

from ..analytics_db import get_analytics_db

AnalyticsDB = Annotated[Session, Depends(get_analytics_db)]
OptIntList = Annotated[Optional[list[int]], Query()]
OptStrList = Annotated[Optional[list[str]], Query()]

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


# ── Pydantic response models ──────────────────────────────────────────────────

class KPIs(BaseModel):
    revenue: float
    margin: float
    margin_pct: float
    units_sold: int


class WeeklyPoint(BaseModel):
    week_start: str
    revenue: float
    margin: float
    margin_pct: float
    units_sold: int


class AggregateResponse(BaseModel):
    kpis: KPIs
    weekly_series: list[WeeklyPoint]


class StoreOption(BaseModel):
    id: int
    name: str


class FiltersResponse(BaseModel):
    stores: list[StoreOption]
    categories: list[str]
    brands: list[str]
    vendors: list[str]
    delivery_types: list[str]


# ── SQL helpers ───────────────────────────────────────────────────────────────

_AGGREGATE_BASE = """
WITH item_cost AS (
    SELECT DISTINCT ON (item_id, store_id)
        item_id,
        store_id,
        unit_cost,
        vendor_code
    FROM customer.costs
    WHERE cost_type = 'regular'
    ORDER BY item_id, store_id, effective_from_local DESC
)
SELECT
    DATE_TRUNC('week', s.timestamp_local)::date                       AS week_start,
    ROUND(SUM(s.units_sold * s.selling_price)::numeric, 2)            AS revenue,
    ROUND(SUM(s.units_sold * COALESCE(c.unit_cost, 0))::numeric, 2)   AS total_cost,
    SUM(s.units_sold)::bigint                                          AS units_sold
FROM customer.sales s
JOIN customer.items i ON i.item_id = s.item_id
LEFT JOIN item_cost c  ON c.item_id = s.item_id AND c.store_id = s.store_id
WHERE s.timestamp_local >= :date_from
  AND s.timestamp_local <  :date_to
{extra}
GROUP BY DATE_TRUNC('week', s.timestamp_local)
ORDER BY week_start
"""

_FILTERS_SQL = {
    "stores": text(
        "SELECT store_id, store_name FROM customer.stores ORDER BY store_name"
    ),
    "categories": text(
        "SELECT DISTINCT category FROM customer.items "
        "WHERE category IS NOT NULL ORDER BY category LIMIT 500"
    ),
    "brands": text(
        "SELECT DISTINCT brand_raw FROM customer.items "
        "WHERE brand_raw IS NOT NULL ORDER BY brand_raw LIMIT 500"
    ),
    "vendors": text(
        "SELECT DISTINCT vendor_code FROM customer.costs "
        "WHERE vendor_code IS NOT NULL AND cost_type = 'regular' "
        "ORDER BY vendor_code LIMIT 500"
    ),
    "delivery_types": text(
        "SELECT DISTINCT delivery_type FROM customer.sales_y2025m05 "
        "WHERE delivery_type IS NOT NULL ORDER BY delivery_type"
    ),
}


def _build_query(
    date_from: date,
    date_to: date,
    store_ids: Optional[list[int]],
    categories: Optional[list[str]],
    brands: Optional[list[str]],
    vendors: Optional[list[str]],
    delivery_types: Optional[list[str]],
) -> tuple:
    """Return (text_query, params_dict). Extra conditions added only when filters provided."""
    extra_clauses: list[str] = []
    params: dict = {"date_from": date_from, "date_to": date_to}

    if store_ids:
        extra_clauses.append("AND s.store_id = ANY(:store_ids)")
        params["store_ids"] = store_ids
    if categories:
        extra_clauses.append("AND i.category = ANY(:categories)")
        params["categories"] = categories
    if brands:
        extra_clauses.append("AND i.brand_raw = ANY(:brands)")
        params["brands"] = brands
    if vendors:
        extra_clauses.append("AND c.vendor_code = ANY(:vendors)")
        params["vendors"] = vendors
    if delivery_types:
        extra_clauses.append("AND s.delivery_type = ANY(:dtypes)")
        params["dtypes"] = delivery_types

    sql = _AGGREGATE_BASE.format(extra="\n  ".join(extra_clauses))
    return text(sql), params


def _safe_pct(margin: float, revenue: float) -> float:
    return round(margin / revenue * 100, 2) if revenue else 0.0


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get(
    "/aggregate",
    responses={400: {"description": "date_from is not before date_to"},
               503: {"description": "Analytics DB unreachable"}},
)
def get_aggregate(
    date_from: Annotated[date, Query(description="Inclusive start date (YYYY-MM-DD)")],
    date_to: Annotated[date, Query(description="Exclusive end date (YYYY-MM-DD)")],
    store_ids: OptIntList = None,
    categories: OptStrList = None,
    brands: OptStrList = None,
    vendors: OptStrList = None,
    delivery_types: OptStrList = None,
    db: AnalyticsDB = None,
) -> AggregateResponse:
    if date_from >= date_to:
        raise HTTPException(status_code=400, detail="date_from must be before date_to")

    query, params = _build_query(
        date_from, date_to, store_ids, categories, brands, vendors, delivery_types
    )

    try:
        rows = db.execute(query, params).fetchall()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Analytics DB error: {exc}") from exc

    weekly: list[WeeklyPoint] = []
    total_revenue = 0.0
    total_cost = 0.0
    total_units = 0

    for row in rows:
        rev = float(row.revenue or 0)
        cost = float(row.total_cost or 0)
        mgn = rev - cost
        units = int(row.units_sold or 0)
        total_revenue += rev
        total_cost += cost
        total_units += units
        weekly.append(
            WeeklyPoint(
                week_start=row.week_start.isoformat(),
                revenue=round(rev, 2),
                margin=round(mgn, 2),
                margin_pct=_safe_pct(mgn, rev),
                units_sold=units,
            )
        )

    total_margin = total_revenue - total_cost
    return AggregateResponse(
        kpis=KPIs(
            revenue=round(total_revenue, 2),
            margin=round(total_margin, 2),
            margin_pct=_safe_pct(total_margin, total_revenue),
            units_sold=total_units,
        ),
        weekly_series=weekly,
    )


@router.get("/filters", responses={503: {"description": "Analytics DB unreachable"}})
def get_filters(db: AnalyticsDB = None) -> FiltersResponse:
    try:
        stores = [
            StoreOption(id=r.store_id, name=r.store_name)
            for r in db.execute(_FILTERS_SQL["stores"]).fetchall()
        ]
        categories = [r[0] for r in db.execute(_FILTERS_SQL["categories"]).fetchall()]
        brands = [r[0] for r in db.execute(_FILTERS_SQL["brands"]).fetchall()]
        vendors = [r[0] for r in db.execute(_FILTERS_SQL["vendors"]).fetchall()]
        delivery_types = [r[0] for r in db.execute(_FILTERS_SQL["delivery_types"]).fetchall()]
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Analytics DB error: {exc}") from exc

    return FiltersResponse(
        stores=stores,
        categories=categories,
        brands=brands,
        vendors=vendors,
        delivery_types=delivery_types,
    )
