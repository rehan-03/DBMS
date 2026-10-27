from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from ..db import transact
from ..validation import now, public


def day_bounds(stamp, timezone_name):
    zone = ZoneInfo(timezone_name)
    local = stamp.astimezone(zone)
    start = datetime.combine(local.date(), time.min, zone)
    return start, start + timedelta(days=1)


def summary(db, timezone_name):
    start, end = day_bounds(now(), timezone_name)

    def calculate(session):
        requests = {r["_id"]: r["count"] for r in db.transfer_requests.aggregate([
            {"$match": {"canonical_payload.operation": "TRANSFER", "created_at": {"$gte": start, "$lt": end}}},
            {"$group": {"_id": "$state", "count": {"$sum": 1}}},
        ], session=session)}
        attempts = {r["_id"]: r["count"] for r in db.transfer_attempts.aggregate([
            {"$match": {"operation": "TRANSFER", "received_at": {"$gte": start, "$lt": end}}},
            {"$group": {"_id": "$outcome", "count": {"$sum": 1}}},
        ], session=session)}
        success, failed = requests.get("SUCCEEDED", 0), requests.get("FAILED", 0)
        unresolved = attempts.get("PENDING", 0) + attempts.get("UNKNOWN", 0)
        return {"timezone": timezone_name, "period_start": start, "period_end": end,
                "transfers_today": db.transactions.count_documents({"type": "TRANSFER", "created_at": {"$gte": start, "$lt": end}}, session=session),
                "successful_logical_requests_today": success, "failed_logical_requests_today": failed,
                "success_rate_percent": round(100 * success / (success + failed), 2) if success + failed else None,
                "duplicates_blocked": attempts.get("RETRY_BLOCKED", 0), "rolled_back_count": attempts.get("ROLLED_BACK", 0),
                "unresolved_attempts": unresolved, "telemetry_complete": unresolved == 0, "as_of": now()}
    return public(transact(db, calculate))
