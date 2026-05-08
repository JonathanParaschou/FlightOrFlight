from datetime import date, datetime
from threading import Lock
from typing import Literal
from uuid import uuid4

from fastapi import BackgroundTasks, FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from db import (
    init_db,
    fetch_routes,
    fetch_latest_prices,
    fetch_cheapest_windows,
    fetch_summary,
    fetch_observation_history,
)
from flight_scanner import Config, scan_year


init_db()

app = FastAPI(title="Flight Scanner API", version="2.1.0")

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


scan_jobs: dict[str, dict] = {}
scan_lock = Lock()


class ScanRequest(BaseModel):
    origin_code: str = Field(default="MSP", min_length=3, max_length=3)
    origin_text: str = "Minneapolis"

    destination_code: str = Field(default="HNL", min_length=3, max_length=3)
    destination_select_text: str = "Honolulu HNL"

    year: int = 2026
    trip_length_days: int = Field(default=4, ge=1, le=30)
    adults: int = Field(default=1, ge=1, le=9)

    max_windows: int | None = Field(default=None, ge=1, le=366)
    max_workers: int = Field(default=10, ge=1, le=10)

    headless: bool = True
    slow_mo: int = Field(default=0, ge=0, le=1000)

    min_valid_price: int = Field(default=100, ge=1)
    max_valid_price: int = Field(default=6000, ge=1)

    debug_dir: str = "flight_scanner_debug"


class ScanStatus(BaseModel):
    scan_id: str
    status: Literal["queued", "running", "completed", "failed", "rejected", "not_found"]
    created_at: str | None = None
    started_at: str | None = None
    completed_at: str | None = None
    error: str | None = None
    config: dict | None = None


def has_active_scan() -> bool:
    return any(
        job.get("status") in {"queued", "running"}
        for job in scan_jobs.values()
    )


def run_scan_job(scan_id: str, payload: ScanRequest):
    with scan_lock:
        scan_jobs[scan_id]["status"] = "running"
        scan_jobs[scan_id]["started_at"] = datetime.utcnow().isoformat()

        try:
            config = Config(
                origin_code=payload.origin_code.upper().strip(),
                origin_text=payload.origin_text.strip(),
                destination_code=payload.destination_code.upper().strip(),
                destination_select_text=payload.destination_select_text.strip(),
                year=payload.year,
                trip_length_days=payload.trip_length_days,
                adults=payload.adults,
                debug_dir=payload.debug_dir,
                headless=payload.headless,
                slow_mo=payload.slow_mo,
                min_valid_price=payload.min_valid_price,
                max_valid_price=payload.max_valid_price,
                max_windows=payload.max_windows,
                max_workers=payload.max_workers,
            )

            scan_year(config)

            scan_jobs[scan_id]["status"] = "completed"
            scan_jobs[scan_id]["completed_at"] = datetime.utcnow().isoformat()

        except Exception as error:
            scan_jobs[scan_id]["status"] = "failed"
            scan_jobs[scan_id]["error"] = str(error)
            scan_jobs[scan_id]["completed_at"] = datetime.utcnow().isoformat()


@app.get("/")
def root():
    return {
        "name": "Flight Scanner API",
        "database": "SQLite",
        "version": "2.1.0",
        "routes": [
            "/routes",
            "/prices",
            "/prices/cheapest",
            "/summary",
            "/history",
            "/scan/start",
            "/scan/status/{scan_id}",
            "/scan/jobs",
        ],
    }


@app.post("/scan/start")
def start_scan(payload: ScanRequest, background_tasks: BackgroundTasks):
    if has_active_scan():
        return {
            "scan_id": "",
            "status": "rejected",
            "error": "A scan is already queued or running.",
            "config": payload.model_dump(),
        }

    scan_id = str(uuid4())

    scan_jobs[scan_id] = {
        "scan_id": scan_id,
        "status": "queued",
        "created_at": datetime.utcnow().isoformat(),
        "started_at": None,
        "completed_at": None,
        "error": None,
        "config": payload.model_dump(),
    }

    background_tasks.add_task(run_scan_job, scan_id, payload)

    return scan_jobs[scan_id]


@app.get("/scan/status/{scan_id}")
def get_scan_status(scan_id: str):
    return scan_jobs.get(
        scan_id,
        {
            "scan_id": scan_id,
            "status": "not_found",
            "error": "No scan job exists with this ID.",
        },
    )


@app.get("/scan/jobs")
def get_scan_jobs():
    return list(scan_jobs.values())


@app.get("/routes")
def routes():
    return fetch_routes()


@app.get("/prices")
def prices(
    origin: str = "MSP",
    destination: str = "HNL",
    trip_length_days: int | None = None,
    adults: int | None = None,
    max_extra_hours: float | None = Query(default=None, ge=0, le=48),
    limit: int = Query(1000, ge=1, le=5000),
):
    return fetch_latest_prices(
        origin=origin,
        destination=destination,
        trip_length_days=trip_length_days,
        adults=adults,
        max_extra_hours=max_extra_hours,
        limit=limit,
    )


@app.get("/prices/cheapest")
def cheapest_prices(
    origin: str = "MSP",
    destination: str = "HNL",
    trip_length_days: int | None = None,
    adults: int | None = None,
    max_extra_hours: float | None = Query(default=None, ge=0, le=48),
    limit: int = Query(25, ge=1, le=500),
):
    return fetch_cheapest_windows(
        origin=origin,
        destination=destination,
        trip_length_days=trip_length_days,
        adults=adults,
        max_extra_hours=max_extra_hours,
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
