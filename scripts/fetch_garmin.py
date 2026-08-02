#!/usr/bin/env python3
"""Daily Garmin Connect sync.

Pulls sleep, heart rate, HRV, stress, Body Battery and daily-activity data
from Garmin Connect and upserts it into data/health.json (a flat JSON array,
one object per day) that the dashboard reads.

Env vars:
    GARMIN_EMAIL, GARMIN_PASSWORD  - Garmin Connect credentials.
    GARMIN_TOKENSTORE              - token dir (default ~/.garminconnect).
    BACKFILL_DAYS                  - window on first run (default 30).
    SYNC_DAYS                      - window on later runs (default 7).
"""

import json
import os
import shutil
import sys
import time
from datetime import date, timedelta
from pathlib import Path

from garminconnect import Garmin, GarminConnectTooManyRequestsError

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "health.json"
TOKENSTORE = os.path.expanduser(os.environ.get("GARMIN_TOKENSTORE", "~/.garminconnect"))


def connect() -> Garmin:
    """Log in to Garmin Connect.

    `login(TOKENSTORE)` transparently reuses cached tokens when they exist and
    otherwise logs in with the credentials and writes fresh tokens to the store
    for the next run — so we avoid a full mobile login (which Garmin often rate
    limits from datacenter IPs) on every run.
    """
    email = os.environ.get("GARMIN_EMAIL")
    password = os.environ.get("GARMIN_PASSWORD")
    if not email or not password:
        sys.exit("GARMIN_EMAIL / GARMIN_PASSWORD are not set.")

    last_err = None
    for attempt in range(1, 4):
        try:
            garmin = Garmin(email=email, password=password)
            garmin.login(TOKENSTORE)
            print(f"Logged in to Garmin Connect (attempt {attempt}).")
            return garmin
        except GarminConnectTooManyRequestsError as exc:
            # 429: Garmin is rate limiting this IP. Keep the cached token (if any)
            # and back off before trying again.
            last_err = exc
            wait = 45 * attempt
            print(f"Rate limited by Garmin (429), attempt {attempt}/3 — waiting {wait}s.")
            time.sleep(wait)
        except Exception as exc:  # noqa: BLE001
            # A cached token may be corrupt/expired — drop it and retry fresh.
            last_err = exc
            print(f"Login attempt {attempt}/3 failed ({type(exc).__name__}: {exc}).")
            shutil.rmtree(TOKENSTORE, ignore_errors=True)
            time.sleep(5)

    sys.exit(f"Could not log in to Garmin Connect after 3 attempts: {last_err}")


def safe(fn, *args):
    """Run one API call; a failing metric must never kill the whole sync."""
    try:
        return fn(*args)
    except Exception as exc:  # noqa: BLE001
        print(f"  warn: {fn.__name__}{args} -> {type(exc).__name__}: {exc}")
        return None


def dig(obj, *keys):
    for key in keys:
        if obj is None:
            return None
        if isinstance(obj, list):
            obj = obj[key] if isinstance(key, int) and len(obj) > key else None
        else:
            obj = obj.get(key) if isinstance(obj, dict) else None
    return obj


def fetch_day(garmin: Garmin, day: str) -> dict:
    record = {"date": day}

    stats = safe(garmin.get_stats, day)
    if stats:
        record.update(
            {
                "rhr": stats.get("restingHeartRate"),
                "stress_avg": stats.get("averageStressLevel"),
                "body_battery_high": stats.get("bodyBatteryHighestValue"),
                "body_battery_low": stats.get("bodyBatteryLowestValue"),
                "steps": stats.get("totalSteps"),
                "calories": stats.get("totalKilocalories"),
                "intensity_min": (stats.get("moderateIntensityMinutes") or 0)
                + 2 * (stats.get("vigorousIntensityMinutes") or 0),
            }
        )
        # Garmin reports "no stress data" as -1 / -2 sentinels.
        if record.get("stress_avg") is not None and record["stress_avg"] < 0:
            record["stress_avg"] = None

    sleep = safe(garmin.get_sleep_data, day)
    dto = dig(sleep, "dailySleepDTO") or {}
    sleep_seconds = dto.get("sleepTimeSeconds")
    if sleep_seconds:
        record["sleep_hours"] = round(sleep_seconds / 3600, 2)
    for field, key in (
        ("deep_min", "deepSleepSeconds"),
        ("light_min", "lightSleepSeconds"),
        ("rem_min", "remSleepSeconds"),
        ("awake_min", "awakeSleepSeconds"),
    ):
        seconds = dto.get(key)
        if seconds is not None:
            record[field] = round(seconds / 60)
    score = dig(dto, "sleepScores", "overall", "value")
    if score is not None:
        record["sleep_score"] = score

    hrv = safe(garmin.get_hrv_data, day)
    last_night = dig(hrv, "hrvSummary", "lastNightAvg")
    if last_night is not None:
        record["hrv"] = last_night

    if record.get("rhr") is None:
        rhr_day = safe(garmin.get_rhr_day, day)
        values = dig(rhr_day, "allMetrics", "metricsMap", "WELLNESS_RESTING_HEART_RATE")
        value = dig(values, 0, "value") if values else None
        if value is not None:
            record["rhr"] = round(value)

    return record


def has_data(record: dict) -> bool:
    return any(value is not None for key, value in record.items() if key != "date")


def load_existing() -> list[dict]:
    if DATA_FILE.exists():
        try:
            existing = json.loads(DATA_FILE.read_text(encoding="utf-8"))
            if isinstance(existing, list):
                return existing
        except json.JSONDecodeError:
            print("warn: existing health.json is invalid, starting fresh.")
    return []


def main() -> None:
    existing = load_existing()
    window = int(
        os.environ.get("SYNC_DAYS", 7) if existing else os.environ.get("BACKFILL_DAYS", 30)
    )
    print(f"Existing records: {len(existing)}; fetching last {window} days.")

    garmin = connect()

    by_date = {record["date"]: record for record in existing if record.get("date")}
    today = date.today()
    for offset in range(window, -1, -1):
        day = (today - timedelta(days=offset)).isoformat()
        print(f"Fetching {day}...")
        record = fetch_day(garmin, day)
        if has_data(record):
            by_date[day] = {**by_date.get(day, {}), **record}
        else:
            print(f"  no data for {day} (watch not synced yet?)")

    merged = sorted(by_date.values(), key=lambda record: record["date"])
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(
        json.dumps(merged, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    print(f"Wrote {len(merged)} records to {DATA_FILE}.")


if __name__ == "__main__":
    main()
