import sqlite3
from pathlib import Path
from typing import Any

DB_PATH = Path("flight_prices.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS flight_price_observations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            scan_id TEXT NOT NULL,
            scanned_at TEXT NOT NULL,

            origin TEXT NOT NULL,
            destination TEXT NOT NULL,

            depart_date TEXT NOT NULL,
            return_date TEXT NOT NULL,

            trip_length_days INTEGER NOT NULL,
            adults INTEGER NOT NULL,

            cheapest_price_usd INTEGER,
            total_duration_minutes INTEGER,
            deal_url TEXT,
            status TEXT NOT NULL,
            raw_context TEXT,

            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    cur.execute("PRAGMA table_info(flight_price_observations)")
    existing_columns = {row["name"] for row in cur.fetchall()}

    if "total_duration_minutes" not in existing_columns:
        cur.execute(
            """
            ALTER TABLE flight_price_observations
            ADD COLUMN total_duration_minutes INTEGER
            """
        )

    if "deal_url" not in existing_columns:
        cur.execute(
            """
            ALTER TABLE flight_price_observations
            ADD COLUMN deal_url TEXT
            """
        )

    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_observations_route
        ON flight_price_observations (origin, destination)
        """
    )

    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_observations_route_filters
        ON flight_price_observations (
            origin,
            destination,
            trip_length_days,
            adults
        )
        """
    )

    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_observations_dates
        ON flight_price_observations (
            depart_date,
            return_date
        )
        """
    )

    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_observations_scanned_at
        ON flight_price_observations (scanned_at)
        """
    )

    cur.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_observations_price
        ON flight_price_observations (cheapest_price_usd)
        """
    )

    conn.commit()
    conn.close()


def save_flight_price(row: dict[str, Any]):
    init_db()

    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO flight_price_observations (
            scan_id,
            scanned_at,
            origin,
            destination,
            depart_date,
            return_date,
            trip_length_days,
            adults,
            cheapest_price_usd,
            total_duration_minutes,
            deal_url,
            status,
            raw_context
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            row["scan_id"],
            row["scanned_at"],
            row["origin"],
            row["destination"],
            row["depart_date"],
            row["return_date"],
            row["trip_length_days"],
            row["adults"],
            row["cheapest_price_usd"],
            row.get("total_duration_minutes"),
            row.get("deal_url"),
            row["status"],
            row["raw_context"],
        ),
    )

    conn.commit()
    conn.close()


def fetch_routes():
    init_db()

    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT
            origin,
            destination,
            trip_length_days,
            adults,
            COUNT(*) AS observation_count,
            MAX(scanned_at) AS last_scanned_at,
            MIN(cheapest_price_usd) AS min_price,
            AVG(cheapest_price_usd) AS avg_price,
            MAX(cheapest_price_usd) AS max_price
        FROM flight_price_observations
        WHERE status = 'success'
          AND cheapest_price_usd IS NOT NULL
        GROUP BY origin, destination, trip_length_days, adults
        ORDER BY origin, destination, trip_length_days, adults
        """
    )

    rows = [dict(row) for row in cur.fetchall()]
    conn.close()

    return rows


def fetch_latest_prices(
    origin: str,
    destination: str,
    trip_length_days: int | None = None,
    adults: int | None = None,
    max_extra_hours: float | None = None,
    limit: int = 1000,
):
    init_db()

    origin = origin.upper().strip()
    destination = destination.upper().strip()

    filters = [
        "o.origin = ?",
        "o.destination = ?",
        "o.status = 'success'",
        "o.cheapest_price_usd IS NOT NULL",
    ]
    params: list[Any] = [origin, destination]

    if trip_length_days is not None:
        filters.append("o.trip_length_days = ?")
        params.append(trip_length_days)

    if adults is not None:
        filters.append("o.adults = ?")
        params.append(adults)

    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        f"""
        SELECT
            o.id,
            o.scan_id,
            o.scanned_at,
            o.origin,
            o.destination,
            o.depart_date,
            o.return_date,
            o.trip_length_days,
            o.adults,
            o.cheapest_price_usd,
            o.total_duration_minutes,
            o.deal_url,
            o.status,
            o.created_at
        FROM flight_price_observations o
        INNER JOIN (
            SELECT
                origin,
                destination,
                depart_date,
                return_date,
                trip_length_days,
                adults,
                MAX(scanned_at) AS latest_scanned_at
            FROM flight_price_observations
            WHERE status = 'success'
              AND cheapest_price_usd IS NOT NULL
            GROUP BY
                origin,
                destination,
                depart_date,
                return_date,
                trip_length_days,
                adults
        ) latest
            ON o.origin = latest.origin
           AND o.destination = latest.destination
           AND o.depart_date = latest.depart_date
           AND o.return_date = latest.return_date
           AND o.trip_length_days = latest.trip_length_days
           AND o.adults = latest.adults
           AND o.scanned_at = latest.latest_scanned_at
        WHERE {' AND '.join(filters)}
        ORDER BY o.depart_date ASC
        """,
        params,
    )

    rows = [dict(row) for row in cur.fetchall()]
    conn.close()

    return apply_duration_metrics(rows, max_extra_hours=max_extra_hours, limit=limit)


def fetch_cheapest_windows(
    origin: str,
    destination: str,
    trip_length_days: int | None = None,
    adults: int | None = None,
    max_extra_hours: float | None = None,
    limit: int = 25,
):
    init_db()

    origin = origin.upper().strip()
    destination = destination.upper().strip()

    filters = [
        "origin = ?",
        "destination = ?",
        "status = 'success'",
        "cheapest_price_usd IS NOT NULL",
    ]
    params: list[Any] = [origin, destination]

    if trip_length_days is not None:
        filters.append("trip_length_days = ?")
        params.append(trip_length_days)

    if adults is not None:
        filters.append("adults = ?")
        params.append(adults)

    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        f"""
        SELECT
            depart_date,
            return_date,
            origin,
            destination,
            trip_length_days,
            adults,
            MIN(cheapest_price_usd) AS cheapest_price_usd,
            MIN(total_duration_minutes) AS total_duration_minutes,
            MAX(deal_url) AS deal_url,
            MAX(scanned_at) AS last_scanned_at,
            COUNT(*) AS observation_count
        FROM flight_price_observations
        WHERE {' AND '.join(filters)}
        GROUP BY
            origin,
            destination,
            depart_date,
            return_date,
            trip_length_days,
            adults
        ORDER BY cheapest_price_usd ASC, depart_date ASC
        """,
        params,
    )

    rows = [dict(row) for row in cur.fetchall()]
    conn.close()

    return apply_duration_metrics(rows, max_extra_hours=max_extra_hours, limit=limit)


def apply_duration_metrics(
    rows: list[dict[str, Any]],
    max_extra_hours: float | None,
    limit: int,
):
    durations = [
        row["total_duration_minutes"]
        for row in rows
        if row.get("total_duration_minutes") is not None
    ]
    base_duration = min(durations) if durations else None
    filtered_rows = []

    for row in rows:
        duration = row.get("total_duration_minutes")

        if duration is None or base_duration is None:
            row["extra_duration_minutes"] = None
            row["extra_duration_hours"] = None
        else:
            extra_minutes = max(0, duration - base_duration)
            row["extra_duration_minutes"] = extra_minutes
            row["extra_duration_hours"] = round(extra_minutes / 60, 2)

        if max_extra_hours is not None:
            if row["extra_duration_minutes"] is None:
                continue

            if row["extra_duration_minutes"] > max_extra_hours * 60:
                continue

        filtered_rows.append(row)

    return filtered_rows[:limit]


def fetch_summary(
    origin: str,
    destination: str,
    trip_length_days: int | None = None,
    adults: int | None = None,
):
    init_db()

    origin = origin.upper().strip()
    destination = destination.upper().strip()

    filters = [
        "origin = ?",
        "destination = ?",
    ]
    params: list[Any] = [origin, destination]

    if trip_length_days is not None:
        filters.append("trip_length_days = ?")
        params.append(trip_length_days)

    if adults is not None:
        filters.append("adults = ?")
        params.append(adults)

    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        f"""
        SELECT
            COUNT(*) AS total_observations,
            SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successful_observations,
            SUM(CASE WHEN status <> 'success' THEN 1 ELSE 0 END) AS failed_observations,
            MIN(cheapest_price_usd) AS min_price,
            AVG(cheapest_price_usd) AS avg_price,
            MAX(cheapest_price_usd) AS max_price,
            MAX(scanned_at) AS last_scanned_at
        FROM flight_price_observations
        WHERE {' AND '.join(filters)}
        """,
        params,
    )

    row = dict(cur.fetchone())
    conn.close()

    return row


def fetch_observation_history(
    origin: str,
    destination: str,
    depart_date: str,
    return_date: str,
    trip_length_days: int | None = None,
    adults: int | None = None,
    limit: int = 500,
):
    init_db()

    origin = origin.upper().strip()
    destination = destination.upper().strip()

    filters = [
        "origin = ?",
        "destination = ?",
        "depart_date = ?",
        "return_date = ?",
    ]
    params: list[Any] = [origin, destination, depart_date, return_date]

    if trip_length_days is not None:
        filters.append("trip_length_days = ?")
        params.append(trip_length_days)

    if adults is not None:
        filters.append("adults = ?")
        params.append(adults)

    params.append(limit)

    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        f"""
        SELECT
            id,
            scan_id,
            scanned_at,
            origin,
            destination,
            depart_date,
            return_date,
            trip_length_days,
            adults,
            cheapest_price_usd,
            deal_url,
            status,
            created_at
        FROM flight_price_observations
        WHERE {' AND '.join(filters)}
        ORDER BY scanned_at ASC
        LIMIT ?
        """,
        params,
    )

    rows = [dict(row) for row in cur.fetchall()]
    conn.close()

    return rows
