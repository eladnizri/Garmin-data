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
    FETCH_DAYS                     - override the window for a one-off deep backfill.
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


def debug_shape(name, payload, depth=2):
    """מדפיס רק את שמות המפתחות (ללא ערכים) כדי לאבחן מבנה API — הלוג ציבורי."""
    if not os.environ.get("DEBUG_GARMIN"):
        return
    def keys(obj, d):
        if isinstance(obj, list):
            return {f"list[{len(obj)}]": keys(obj[0], d) if obj and d else None}
        if isinstance(obj, dict):
            if d <= 0:
                return sorted(obj.keys())
            return {k: keys(v, d - 1) if isinstance(v, (dict, list)) else type(v).__name__
                    for k, v in sorted(obj.items())}
        return type(obj).__name__
    print(f"  [shape] {name}: {json.dumps(keys(payload, depth), ensure_ascii=False)[:1200]}")


def first(*values):
    """Return the first value that is not None."""
    for value in values:
        if value is not None:
            return value
    return None


def unwrap(payload):
    """Several Garmin endpoints wrap the day's object in a single-item list."""
    if isinstance(payload, list):
        return payload[0] if payload else None
    return payload


def fetch_day(garmin: Garmin, day: str, deep: bool = False) -> dict:
    """Build one day's record. `deep` also pulls the slow-moving fitness metrics."""
    record = {"date": day}

    stats = safe(garmin.get_stats, day)
    if stats:
        record.update(
            {
                "rhr": stats.get("restingHeartRate"),
                "stress_avg": stats.get("averageStressLevel"),
                "body_battery_high": stats.get("bodyBatteryHighestValue"),
                "body_battery_low": stats.get("bodyBatteryLowestValue"),
                "body_battery_charged": stats.get("bodyBatteryChargedValue"),
                "body_battery_drained": stats.get("bodyBatteryDrainedValue"),
                "steps": stats.get("totalSteps"),
                "calories": stats.get("totalKilocalories"),
                "floors": stats.get("floorsAscended"),
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
    # נשימה וחמצן מתוך דוח השינה, כשהם קיימים
    for field, key in (
        ("respiration_avg", "avgSleepRespirationValue"),
        ("spo2_avg", "averageSpO2Value"),
        ("spo2_low", "lowestSpO2Value"),
    ):
        value = first(sleep.get(key) if isinstance(sleep, dict) else None, dto.get(key))
        if value is not None:
            record[field] = round(value, 1) if isinstance(value, float) else value

    hrv = safe(garmin.get_hrv_data, day)
    summary = dig(hrv, "hrvSummary") or {}
    if summary.get("lastNightAvg") is not None:
        record["hrv"] = summary["lastNightAvg"]
    if summary.get("status"):
        record["hrv_status"] = summary["status"]
    if summary.get("weeklyAvg") is not None:
        record["hrv_weekly_avg"] = summary["weeklyAvg"]
    # הטווח המאוזן האישי שגרמין מחשב עבורך
    baseline = summary.get("baseline") or {}
    if baseline.get("balancedLow") is not None:
        record["hrv_base_low"] = baseline["balancedLow"]
    if baseline.get("balancedUpper") is not None:
        record["hrv_base_high"] = baseline["balancedUpper"]

    # ציון המוכנות הרשמי של גרמין (Training Readiness)
    readiness_raw = safe(garmin.get_training_readiness, day)
    debug_shape("training_readiness", readiness_raw)
    readiness = unwrap(readiness_raw)
    if isinstance(readiness, dict):
        if readiness.get("score") is not None:
            record["readiness_score"] = readiness["score"]
        if readiness.get("level"):
            record["readiness_level"] = readiness["level"]
        for field, key in (
            ("readiness_sleep", "sleepScoreFactorPercent"),
            ("readiness_sleep_history", "sleepHistoryFactorPercent"),
            ("readiness_recovery", "recoveryTimeFactorPercent"),
            ("readiness_hrv", "hrvFactorPercent"),
            # עומס האימונים מדווח כ-ACWR (יחס עומס חד/כרוני)
            ("readiness_load", "acwrFactorPercent"),
            ("readiness_stress", "stressHistoryFactorPercent"),
        ):
            if readiness.get(key) is not None:
                record[field] = readiness[key]
        if readiness.get("feedbackShort"):
            record["readiness_feedback"] = readiness["feedbackShort"]
        # גרמין מדווח את זמן ההתאוששות בשעות
        if readiness.get("recoveryTime") is not None:
            record["recovery_hours"] = readiness["recoveryTime"]

    if record.get("spo2_avg") is None:
        spo2 = safe(garmin.get_spo2_data, day)
        debug_shape("spo2", spo2)
        if isinstance(spo2, dict):
            avg = first(spo2.get("averageSpO2"), spo2.get("avgSleepSpO2"))
            if avg is not None:
                record["spo2_avg"] = round(avg)
            if spo2.get("lowestSpO2") is not None:
                record["spo2_low"] = spo2["lowestSpO2"]

    if record.get("respiration_avg") is None:
        resp = safe(garmin.get_respiration_data, day)
        if isinstance(resp, dict):
            avg = first(
                resp.get("avgSleepRespirationValue"), resp.get("avgWakingRespirationValue")
            )
            if avg is not None:
                record["respiration_avg"] = round(avg, 1)

    if record.get("rhr") is None:
        rhr_day = safe(garmin.get_rhr_day, day)
        values = dig(rhr_day, "allMetrics", "metricsMap", "WELLNESS_RESTING_HEART_RATE")
        value = dig(values, 0, "value") if values else None
        if value is not None:
            record["rhr"] = round(value)

    if deep:
        record.update(fetch_fitness(garmin, day))

    return record


def fetch_fitness(garmin: Garmin, day: str) -> dict:
    """VO2 Max, גיל כושר וסטטוס אימון — משתנים לאט, נמשכים רק לימים האחרונים."""
    out = {}

    metrics_raw = safe(garmin.get_max_metrics, day)
    debug_shape("max_metrics", metrics_raw, depth=3)
    metrics = unwrap(metrics_raw)
    generic = dig(metrics, "generic") or {}
    vo2 = first(generic.get("vo2MaxPreciseValue"), generic.get("vo2MaxValue"))
    if vo2 is not None:
        out["vo2max"] = round(vo2, 1)
    if generic.get("fitnessAge") is not None:
        out["fitness_age"] = generic["fitnessAge"]

    status = safe(garmin.get_training_status, day)
    if isinstance(status, dict):
        latest = dig(status, "mostRecentTrainingStatus", "latestTrainingStatusData") or {}
        # המפתח הוא מזהה המכשיר — לוקחים את הרשומה הראשונה שיש בה סטטוס
        for entry in latest.values() if isinstance(latest, dict) else []:
            if isinstance(entry, dict) and entry.get("trainingStatus") is not None:
                out["training_status"] = entry.get("trainingStatusFeedbackPhrase") or entry["trainingStatus"]
                break
        balance = dig(status, "mostRecentTrainingLoadBalance", "metricsTrainingLoadBalanceDTOMap") or {}
        for entry in balance.values() if isinstance(balance, dict) else []:
            if isinstance(entry, dict) and entry.get("monthlyLoadAerobicLow") is not None:
                out["training_load"] = round(
                    (entry.get("monthlyLoadAerobicLow") or 0)
                    + (entry.get("monthlyLoadAerobicHigh") or 0)
                    + (entry.get("monthlyLoadAnaerobic") or 0)
                )
                break

    return out


ACTIVITY_NAMES = {
    "running": "ריצה", "treadmill_running": "ריצת הליכון", "trail_running": "ריצת שטח",
    "walking": "הליכה", "hiking": "טיול רגלי", "cycling": "אופניים",
    "road_biking": "אופני כביש", "mountain_biking": "אופני הרים",
    "indoor_cycling": "אופני כושר", "lap_swimming": "שחייה", "open_water_swimming": "שחייה במים פתוחים",
    "strength_training": "אימון כוח", "indoor_cardio": "קרדיו", "elliptical": "אליפטי",
    "yoga": "יוגה", "pilates": "פילאטיס", "fitness_equipment": "מכשירי כושר",
}


def fetch_activities(garmin: Garmin, start: str, end: str) -> dict:
    """קריאה אחת לכל טווח הריצה — האימונים בפועל, מקובצים לפי יום."""
    activities = safe(garmin.get_activities_by_date, start, end) or []
    by_day: dict[str, list] = {}
    for act in activities:
        if not isinstance(act, dict):
            continue
        started = act.get("startTimeLocal") or act.get("startTimeGMT") or ""
        day = started.split(" ")[0].split("T")[0]
        if not day:
            continue
        type_key = dig(act, "activityType", "typeKey") or "other"
        entry = {
            "type": ACTIVITY_NAMES.get(type_key, act.get("activityName") or type_key),
            "type_key": type_key,
        }
        if act.get("duration"):
            entry["minutes"] = round(act["duration"] / 60)
        if act.get("distance"):
            entry["km"] = round(act["distance"] / 1000, 2)
        if act.get("averageHR"):
            entry["avg_hr"] = round(act["averageHR"])
        if act.get("calories"):
            entry["calories"] = round(act["calories"])
        # שדות לניתוח ריצה — קצב, מאמץ ותנאי השטח
        if act.get("maxHR"):
            entry["max_hr"] = round(act["maxHR"])
        speed = act.get("averageSpeed")  # מ׳/שנייה
        if speed:
            entry["pace_s"] = round(1000 / speed)  # שניות לק״מ
        if act.get("elevationGain"):
            entry["elev_gain"] = round(act["elevationGain"])
        cadence = act.get("averageRunningCadenceInStepsPerMinute")
        if cadence:
            entry["cadence"] = round(cadence)
        if act.get("aerobicTrainingEffect"):
            entry["aerobic_te"] = round(act["aerobicTrainingEffect"], 1)
        if act.get("anaerobicTrainingEffect"):
            entry["anaerobic_te"] = round(act["anaerobicTrainingEffect"], 1)
        if act.get("vO2MaxValue"):
            entry["vo2max"] = round(act["vO2MaxValue"], 1)
        by_day.setdefault(day, []).append(entry)
    if activities:
        print(f"Fetched {len(activities)} activities across the window.")
    return by_day


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
        os.environ.get("FETCH_DAYS")
        or (os.environ.get("SYNC_DAYS", 7) if existing else os.environ.get("BACKFILL_DAYS", 30))
    )
    print(f"Existing records: {len(existing)}; fetching last {window} days.")

    garmin = connect()

    by_date = {record["date"]: record for record in existing if record.get("date")}
    today = date.today()
    start = (today - timedelta(days=window)).isoformat()

    # האימונים נמשכים בקריאה אחת לכל הטווח, לא פעם ביום — חוסך עשרות בקשות
    workouts = fetch_activities(garmin, start, today.isoformat())

    for offset in range(window, -1, -1):
        day = (today - timedelta(days=offset)).isoformat()
        print(f"Fetching {day}...")
        # מדדי הכושר משתנים לאט — נמשכים רק לימים האחרונים
        record = fetch_day(garmin, day, deep=offset <= 1)
        if day in workouts:
            record["workouts"] = workouts[day]
        if has_data(record):
            by_date[day] = {**by_date.get(day, {}), **record}
        else:
            print(f"  no data for {day} (watch not synced yet?)")
        # קצב מתון כדי לא לספוג הגבלת קצב (429) מגרמין
        if offset:
            time.sleep(0.6)

    merged = sorted(by_date.values(), key=lambda record: record["date"])
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(
        json.dumps(merged, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )
    print(f"Wrote {len(merged)} records to {DATA_FILE}.")


if __name__ == "__main__":
    main()
