from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

from db import (
    init_db,
    fetch_routes,
    fetch_latest_prices,
    fetch_cheapest_windows,
    fetch_summary,
    fetch_observation_history,
)

init_db()

app = FastAPI(title="Flight Scanner API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "name": "Flight Scanner API",
        "database": "SQLite",
        "version": "2.0.0",
        "routes": [
            "/routes",
            "/prices",
            "/prices/cheapest",
            "/summary",
            "/history",
        ],
    }


@app.get("/routes")
def routes():
    return fetch_routes()


@app.get("/prices")
def prices(
    origin: str = "MSP",
    destination: str = "HNL",
    trip_length_days: int | None = None,
    adults: int | None = None,
    limit: int = Query(1000, ge=1, le=5000),
):
    return fetch_latest_prices(
        origin=origin,
        destination=destination,
        trip_length_days=trip_length_days,
        adults=adults,
        limit=limit,
    )


@app.get("/prices/cheapest")
def cheapest_prices(
    origin: str = "MSP",
    destination: str = "HNL",
    trip_length_days: int | None = None,
    adults: int | None = None,
    limit: int = Query(25, ge=1, le=500),
):
    return fetch_cheapest_windows(
        origin=origin,
        destination=destination,
        trip_length_days=trip_length_days,
        adults=adults,
        limit=limit,
    )


@app.get("/summary")
def summary(
    origin: str = "MSP",
    destination: str = "HNL",
    trip_length_days: int | None = None,
    adults: int | None = None,
):
    return fetch_summary(
        origin=origin,
        destination=destination,
        trip_length_days=trip_length_days,
        adults=adults,
    )


@app.get("/history")
def history(
    origin: str,
    destination: str,
    depart_date: str,
    return_date: str,
    trip_length_days: int | None = None,
    adults: int | None = None,
    limit: int = Query(500, ge=1, le=5000),
):
    return fetch_observation_history(
        origin=origin,
        destination=destination,
        depart_date=depart_date,
        return_date=return_date,
        trip_length_days=trip_length_days,
        adults=adults,
        limit=limit,
    )